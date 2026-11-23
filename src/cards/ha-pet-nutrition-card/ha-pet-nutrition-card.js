// HA Pet Nutrition Card (Claude AI, 2026-11-23): food choice, portions per meal, weight and goal for a dog on an
// automatic feeder, with the calories per day worked out and compared with a recommendation. Same premium look as the
// pet care card (aurora hero, ring, panels). Everything is driven by helpers, so the feeder plan follows the portions.
//
// Recommendation: RER = 70 × kg^0.75 (resting energy). "Lose" = 1.2 × RER of the goal weight, "Keep" = 1.4 × RER of
// the current weight, "Active" = 1.6 × RER. A rule of thumb – the scales decide.
import { keepScroll } from "../shared/keep-scroll.js";

const VERSION = "1.0.0";
const GOALS = [
  { key: "lose", match: /tab|lose/i, label: "Tabe sig", icon: "mdi:trending-down", factor: 1.2 },
  { key: "keep", match: /hold|keep/i, label: "Holde vægten", icon: "mdi:scale-balance", factor: 1.4 },
  { key: "active", match: /aktiv|active/i, label: "Aktiv", icon: "mdi:run-fast", factor: 1.6 },
];

export const rer = (kg) => 70 * Math.pow(kg, 0.75);
export function goalOf(text) { return GOALS.find((g) => g.match.test(String(text || ""))) || GOALS[1]; }
// kcal per day for a goal; "lose" uses the goal weight when it is set and below the current weight.
export function recommendedKcal(weight, goalWeight, goalText) {
  if (!(weight > 5)) return NaN;
  const g = goalOf(goalText);
  const base = g.key === "lose" && goalWeight > 5 && goalWeight < weight ? goalWeight : weight;
  return Math.round((rer(base) * g.factor) / 10) * 10;
}
export function feedingRow(kg, factor, kcalPer100, portionGrams, meals) {
  const kcal = rer(kg) * factor;
  const grams = (kcal / kcalPer100) * 100;
  return { kg, kcal: Math.round(kcal / 10) * 10, grams: Math.round(grams / 5) * 5, portions: Math.round(grams / portionGrams / Math.max(1, meals)) };
}
export function ageMonths(birthday, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(birthday || ""));
  if (!m) return NaN;
  const b = new Date(+m[1], +m[2] - 1, +m[3]);
  return (now.getFullYear() - b.getFullYear()) * 12 + now.getMonth() - b.getMonth() - (now.getDate() < b.getDate() ? 1 : 0);
}
// "HIKE Original Hvalp (386)" style options may carry their kcal; otherwise the food_kcal map or the kcal entity.
export function kcalFor(option, map, fallback) {
  if (map && Number.isFinite(+map[option])) return +map[option];
  const m = /\((\d{3})\s*(?:kcal)?\)/i.exec(String(option || ""));
  return m ? +m[1] : fallback;
}

const fmt = (n, d = 0) => (Number.isFinite(n) ? n.toLocaleString("da-DK", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

class HAPetNutritionCard extends HTMLElement {
  static getStubConfig() {
    return { name: "Hund", food: "input_select.dog_food", portions: "input_number.feeder_portions", portion_weight: 6, weight: "input_number.dog_weight" };
  }
  setConfig(config) {
    if (!config?.food || !config?.portions) throw new Error("Kortet kræver food (input_select) og portions (input_number)");
    this._config = { name: "", portion_weight: 6, meals_count: 3, adult_from_months: 12, history_days: 90, table_from: 20, table_to: 36, table_step: 2, ...config };
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.addEventListener("click", (e) => this._click(e));
    }
    this._sig = "";
    this._render();
  }
  set hass(h) {
    this._hass = h;
    const c = this._config || {};
    const ids = [c.food, c.food_kcal_entity, c.portions, typeof c.portion_weight === "string" ? c.portion_weight : "", c.weight, c.goal_weight, c.goal, c.birthday, c.container, ...(c.meals || [])].filter(Boolean);
    const sig = JSON.stringify(ids.map((id) => h?.states?.[id]?.state));
    if (sig !== this._sig) { this._sig = sig; this._render(); }
    if (c.weight && (!this._histAt || Date.now() - this._histAt > 3600000)) this._loadHistory();
  }
  getCardSize() { return 12; }
  getGridOptions() { return { rows: "auto", columns: 12, min_columns: 6 }; }

  _s(id) { return id ? this._hass?.states?.[id] : undefined; }
  _num(v) { const n = typeof v === "string" && !/^[a-z_]+\./.test(v) ? parseFloat(v) : typeof v === "number" ? v : parseFloat(this._s(v)?.state); return Number.isFinite(n) ? n : NaN; }

  async _loadHistory() {
    this._histAt = Date.now();
    const c = this._config;
    try {
      const start = new Date(Date.now() - c.history_days * 86400000).toISOString();
      const res = await this._hass.callWS({ type: "history/history_during_period", start_time: start, entity_ids: [c.weight], minimal_response: true, no_attributes: true });
      const rows = res?.[c.weight] || [];
      this._hist = rows.map((r) => [r.lu != null ? r.lu * 1000 : Date.parse(r.last_updated || r.last_changed), parseFloat(r.s ?? r.state)])
        .filter(([t, v]) => Number.isFinite(t) && v > 5);
      this._render();
    } catch { /* history is optional */ }
  }

  _model() {
    const c = this._config;
    const food = this._s(c.food)?.state || "";
    const kcal100 = kcalFor(food, c.food_kcal, this._num(c.food_kcal_entity) || 385);
    const portions = this._num(c.portions);
    const pw = this._num(c.portion_weight) || 6;
    const meals = (c.meals || []).length ? c.meals.filter((id) => this._s(id)?.state === "on").length : +c.meals_count;
    const gramsDay = portions * pw * meals;
    const kcalDay = (gramsDay * kcal100) / 100;
    const weight = this._num(c.weight); const goalWeight = this._num(c.goal_weight);
    const goal = goalOf(this._s(c.goal)?.state);
    const rec = recommendedKcal(weight, goalWeight, goal.label);
    const recGrams = (rec / kcal100) * 100;
    const recPortions = Number.isFinite(rec) && meals ? Math.round(recGrams / pw / meals) : NaN;
    const diff = Number.isFinite(rec) ? Math.round((kcalDay / rec - 1) * 100) : NaN;
    const tone = !Number.isFinite(diff) ? "idle" : Math.abs(diff) <= 5 ? "good" : Math.abs(diff) <= 15 ? "warn" : "danger";
    const age = ageMonths(this._s(c.birthday)?.state);
    const container = this._num(c.container);
    const daysLeft = gramsDay > 0 && container >= 0 ? container / gramsDay : NaN;
    const options = this._s(c.food)?.attributes?.options || [];
    return { food, kcal100, portions, pw, meals, gramsDay, kcalDay, weight, goalWeight, goal, rec, recGrams, recPortions, diff, tone, age, daysLeft, options };
  }

  _render() {
    if (!this.shadowRoot || !this._config || !this._hass) return;
    keepScroll(this, () => { this.shadowRoot.innerHTML = `<style>${STYLE}</style>${this._html(this._model())}`; });
  }

  _html(m) {
    const c = this._config;
    const isPuppy = /hvalp|puppy|junior/i.test(m.food);
    const switchNow = isPuppy && m.age >= c.adult_from_months;
    // ring: 0–150 % of the recommendation, the target tick at 100 %
    const R = 62, C = 2 * Math.PI * R;
    const frac = Number.isFinite(m.rec) ? Math.min(m.kcalDay / m.rec, 1.5) / 1.5 : 0;
    const mood = !Number.isFinite(m.diff) ? "Skriv vægten ind, så regnes anbefalingen ud"
      : m.tone === "good" ? `Det passer · ${m.goal.label.toLowerCase()}`
      : m.diff > 0 ? `${m.diff} % for meget · ${m.goal.label.toLowerCase()}` : `${-m.diff} % for lidt · ${m.goal.label.toLowerCase()}`;
    const toGoal = m.weight > 5 && m.goalWeight > 5 ? m.weight - m.goalWeight : NaN;
    const hist = this._hist || [];
    const groups = [["Hvalp", m.options.filter((o) => /hvalp|puppy|junior/i.test(o))], ["Voksen", m.options.filter((o) => !/hvalp|puppy|junior/i.test(o))]].filter(([, l]) => l.length);
    const rows = [];
    for (let kg = c.table_from; kg <= c.table_to; kg += c.table_step) rows.push(feedingRow(kg, m.goal.factor, m.kcal100, m.pw, m.meals || 1));
    const maxG = Math.max(...rows.map((r) => r.grams));
    const near = (kg) => Number.isFinite(m.weight) && m.weight > 5 && Math.abs(m.weight - kg) < c.table_step / 2;
    const goalNear = (kg) => m.goal.key === "lose" && m.goalWeight > 5 && Math.abs(m.goalWeight - kg) < c.table_step / 2;
    return `<div class="pn ${m.tone}">
  <section class="hero">
    <div class="aurora"></div>
    <div class="ring">
      <svg viewBox="0 0 150 150"><circle class="bg" cx="75" cy="75" r="${R}"/>
        <circle class="arc" cx="75" cy="75" r="${R}" stroke-dasharray="${(C * frac).toFixed(1)} ${C.toFixed(1)}"/>
        ${Number.isFinite(m.rec) ? `<line class="tick" x1="129" y1="75" x2="145" y2="75" transform="rotate(${(360 / 1.5).toFixed(1)} 75 75)"/>` : ""}</svg>
      <div class="ring-in"><b>${fmt(m.kcalDay)}</b><span>kcal/dag</span>${Number.isFinite(m.rec) ? `<small>mål ${fmt(m.rec)}</small>` : ""}</div>
    </div>
    <div class="id">
      <div class="eyebrow">Ernæring</div>
      <h2>${esc(c.title || (c.name ? `${c.name}s foder` : "Foder"))}</h2>
      <div class="mood"><i></i>${esc(mood)}</div>
      <div class="chips">
        <span class="chip food"><ha-icon icon="mdi:food-drumstick"></ha-icon>${esc(m.food || "—")}</span>
        <span class="chip"><ha-icon icon="mdi:fire"></ha-icon>${fmt(m.kcal100)} kcal/100 g</span>
        <span class="chip"><ha-icon icon="mdi:bowl-mix"></ha-icon>${fmt(m.gramsDay)} g/dag</span>
        ${Number.isFinite(m.age) ? `<button class="chip" data-more="${esc(c.birthday)}"><ha-icon icon="mdi:cake-variant"></ha-icon>${m.age} mdr.</button>` : ""}
        ${Number.isFinite(m.daysLeft) ? `<span class="chip ${m.daysLeft < 3 ? "danger" : ""}"><ha-icon icon="mdi:silo"></ha-icon>${m.daysLeft < 0.5 ? "Beholder tom" : `${fmt(m.daysLeft)} dage i beholder`}</span>` : ""}
      </div>
    </div>
  </section>
  ${switchNow ? `<section class="banner"><ha-icon icon="mdi:swap-horizontal-bold"></ha-icon><div><b>Tid til voksenfoder</b><span>${m.age} måneder – udvokset ved ca. 12–15 mdr. Skift over en uge med 1:1 hvalpe- og voksenfoder, og vælg så det nye foder herunder.</span></div></section>` : ""}
  <div class="grid">
    <section class="panel portions">
      <div class="head"><span class="hicon"><ha-icon icon="mdi:bowl-mix"></ha-icon></span><div><h3>Portioner pr. måltid</h3><p>${fmt(m.pw)} g pr. portion · ${m.meals} måltider</p></div></div>
      <div class="stepper big"><button data-step="${esc(c.portions)}" data-d="-1" aria-label="Færre">−</button><strong>${fmt(m.portions)}</strong><button data-step="${esc(c.portions)}" data-d="1" aria-label="Flere">+</button></div>
      <div class="bowls">${Array.from({ length: Math.max(1, m.meals) }, (_, i) => `<div class="bowl" style="--i:${i}"><span class="kib" style="--f:${Math.min(1, (m.portions || 0) / 25)}"></span><em>${fmt(m.portions * m.pw)} g</em></div>`).join("")}</div>
      ${Number.isFinite(m.recPortions) ? `<div class="rec ${m.recPortions === m.portions ? "ok" : ""}"><span>Anbefalet <b>${m.recPortions}</b> portioner</span>${m.recPortions !== m.portions ? `<button data-set="${esc(c.portions)}" data-v="${m.recPortions}">Brug</button>` : `<ha-icon icon="mdi:check-circle"></ha-icon>`}</div>` : ""}
    </section>
    <section class="panel weight">
      <div class="head"><span class="hicon"><ha-icon icon="mdi:scale-bathroom"></ha-icon></span><div><h3>Vægt</h3><p>${hist.length > 1 ? `Sidste ${c.history_days} dage` : "Vej jævnligt – kurven bygges op"}</p></div></div>
      <div class="stepper big"><button data-step="${esc(c.weight)}" data-d="-0.1" aria-label="Mindre">−</button><strong>${m.weight > 5 ? `${fmt(m.weight, 1)}<small> kg</small>` : "—"}</strong><button data-step="${esc(c.weight)}" data-d="0.1" aria-label="Mere">+</button></div>
      ${this._spark(hist, m.goalWeight)}
      ${c.goal_weight ? `<div class="goalrow"><span><ha-icon icon="mdi:flag-checkered"></ha-icon>Mål</span><div class="stepper"><button data-step="${esc(c.goal_weight)}" data-d="-0.5">−</button><strong>${m.goalWeight > 5 ? `${fmt(m.goalWeight, 1)} kg` : "—"}</strong><button data-step="${esc(c.goal_weight)}" data-d="0.5">+</button></div></div>
      ${Number.isFinite(toGoal) ? `<p class="togo">${Math.abs(toGoal) < 0.25 ? "På målvægten 🎉" : toGoal > 0 ? `${fmt(toGoal, 1)} kg til målet` : `${fmt(-toGoal, 1)} kg under målet`}</p>` : ""}` : ""}
    </section>
  </div>
  <section class="panel choose">
    <div class="head"><span class="hicon"><ha-icon icon="mdi:food-drumstick"></ha-icon></span><div><h3>Foder og mål</h3><p>Vælg foderet – kalorierne følger med</p></div></div>
    ${groups.map(([label, list]) => `<div class="group"><span class="glabel">${label}</span><div class="pills">${list.map((o) => `<button class="pill ${o === m.food ? "on" : ""}" data-select="${esc(c.food)}" data-option="${esc(o)}"><b>${esc(o.replace(/\s*\((?:voksen|adult)\)/i, ""))}</b><small>${fmt(kcalFor(o, c.food_kcal, NaN))} kcal</small></button>`).join("")}</div></div>`).join("")}
    ${c.goal ? `<div class="seg">${(this._s(c.goal)?.attributes?.options || []).map((o) => { const g = goalOf(o); return `<button class="${o === this._s(c.goal)?.state ? "on" : ""}" data-select="${esc(c.goal)}" data-option="${esc(o)}"><ha-icon icon="${g.icon}"></ha-icon>${esc(o)}</button>`; }).join("")}</div>` : ""}
  </section>
  <section class="panel table">
    <div class="head"><span class="hicon"><ha-icon icon="mdi:table-heart"></ha-icon></span><div><h3>Mængde efter vægt</h3><p>${esc(m.food)} · ${esc(m.goal.label.toLowerCase())}${m.goal.key === "lose" ? " (vægten = målvægten)" : ""}</p></div></div>
    <div class="rows">${rows.map((r) => `<div class="row ${near(r.kg) ? "now" : ""} ${goalNear(r.kg) ? "target" : ""}">
      <span class="kg">${r.kg} kg${near(r.kg) ? "<em>nu</em>" : goalNear(r.kg) ? "<em>mål</em>" : ""}</span>
      <span class="bar"><i style="width:${((r.grams / maxG) * 100).toFixed(1)}%"></i><b>${r.grams} g</b></span>
      <span class="kcal">${fmt(r.kcal)} kcal</span>
      <span class="por">${r.portions}</span></div>`).join("")}</div>
    <p class="foot">70 × kg<sup>0,75</sup> × ${String(m.goal.factor).replace(".", ",")} · portioner à ${fmt(m.pw)} g × ${m.meals} måltider. Tommelfingerregel – vægten afgør. Ribbenene skal kunne mærkes, og godbidder tæller med.</p>
  </section>
</div>`;
  }

  _spark(hist, goal) {
    if (hist.length < 2) return `<div class="spark empty"><ha-icon icon="mdi:chart-line"></ha-icon></div>`;
    const W = 300, H = 70, t0 = hist[0][0], t1 = hist[hist.length - 1][0] || t0 + 1;
    const vals = hist.map(([, v]) => v).concat(goal > 5 ? [goal] : []);
    const lo = Math.min(...vals) - 0.3, hi = Math.max(...vals) + 0.3;
    const X = (t) => ((t - t0) / Math.max(1, t1 - t0)) * W, Y = (v) => H - ((v - lo) / (hi - lo)) * (H - 8) - 4;
    const pts = hist.map(([t, v]) => `${X(t).toFixed(1)},${Y(v).toFixed(1)}`);
    const line = `M${pts.join(" L")}`;
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="pnspark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--pn-accent)" stop-opacity=".35"/><stop offset="1" stop-color="var(--pn-accent)" stop-opacity="0"/></linearGradient></defs>
      ${goal > 5 ? `<line class="goal" x1="0" x2="${W}" y1="${Y(goal).toFixed(1)}" y2="${Y(goal).toFixed(1)}"/>` : ""}
      <path d="${line} L${W},${H} L0,${H} Z" fill="url(#pnspark)"/><path class="ln" d="${line}"/>
      <circle cx="${X(hist[hist.length - 1][0]).toFixed(1)}" cy="${Y(hist[hist.length - 1][1]).toFixed(1)}" r="3.5"/></svg>`;
  }

  _click(e) {
    const b = e.target.closest("button");
    if (!b || !this._hass) return;
    if (b.dataset.more) { this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: b.dataset.more }, bubbles: true, composed: true })); return; }
    if (b.dataset.select) { this._hass.callService(b.dataset.select.split(".")[0], "select_option", { entity_id: b.dataset.select, option: b.dataset.option }); return; }
    const id = b.dataset.step || b.dataset.set;
    if (!id) return;
    const st = this._s(id); const a = st?.attributes || {};
    let v = b.dataset.set ? +b.dataset.v : (parseFloat(st?.state) || 0) + +b.dataset.d;
    if (b.dataset.step && id === this._config.weight && !(parseFloat(st?.state) > 5)) v = 20; // first weighing: start near a real value
    if (Number.isFinite(+a.min)) v = Math.max(+a.min, v);
    if (Number.isFinite(+a.max)) v = Math.min(+a.max, v);
    v = Math.round(v * 10) / 10;
    this._hass.callService(id.split(".")[0], "set_value", { entity_id: id, value: v });
  }
}

const STYLE = `
:host{display:block}
.pn{--pn-accent:#ffb547;--pn-good:var(--dashboard-success,#4fe0a6);--pn-warn:#ffb547;--pn-danger:var(--dashboard-danger,#ff667a);--pn-blue:#4cc9ff;
  --pn-surface:var(--surface,var(--ha-card-background,var(--card-background-color,#141c27)));--pn-line:color-mix(in srgb,var(--primary-text-color) 9%,transparent);
  --tone:var(--pn-accent);display:grid;gap:14px;color:var(--primary-text-color)}
.pn.good{--tone:var(--pn-good)}.pn.warn{--tone:var(--pn-warn)}.pn.danger{--tone:var(--pn-danger)}
button{font:inherit;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}
.hero,.panel,.banner{position:relative;border-radius:24px;background:var(--pn-surface);border:1px solid var(--pn-line);border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--pn-accent);box-shadow:var(--dashboard-shadow-strong,0 12px 32px rgba(0,0,0,.22));animation:pnRise .6s cubic-bezier(.2,.8,.2,1) both}
.hero{isolation:isolate;overflow:hidden;display:grid;grid-template-columns:auto minmax(0,1fr);gap:22px;align-items:center;padding:22px 24px;border-left-color:var(--tone);background:linear-gradient(135deg,color-mix(in srgb,var(--pn-surface) 90%,#000),var(--pn-surface))}
.aurora{position:absolute;inset:-40%;z-index:-1;background:radial-gradient(38% 34% at 18% 35%,color-mix(in srgb,var(--pn-accent) 26%,transparent),transparent 70%),radial-gradient(34% 30% at 78% 28%,color-mix(in srgb,var(--tone) 22%,transparent),transparent 70%),radial-gradient(36% 36% at 60% 88%,color-mix(in srgb,var(--pn-blue) 14%,transparent),transparent 70%);filter:blur(10px);animation:pnAurora 24s ease-in-out infinite alternate}
@keyframes pnAurora{50%{transform:translate(4%,-3%) rotate(8deg)}100%{transform:translate(-3%,4%) rotate(-6deg)}}
@keyframes pnRise{from{opacity:0;transform:translateY(8px)}}
.ring{position:relative;width:150px;height:150px}
.ring svg{width:100%;height:100%;transform:rotate(-90deg)}
.ring .bg{fill:none;stroke:color-mix(in srgb,var(--primary-text-color) 8%,transparent);stroke-width:11}
.ring .arc{fill:none;stroke:var(--tone);stroke-width:11;stroke-linecap:round;filter:drop-shadow(0 0 8px color-mix(in srgb,var(--tone) 70%,transparent));transition:stroke-dasharray 1s cubic-bezier(.2,.8,.2,1)}
.ring .tick{stroke:var(--primary-text-color);stroke-width:3;stroke-linecap:round;opacity:.75}
.ring-in{position:absolute;inset:0;display:grid;place-content:center;text-align:center;line-height:1.05}
.ring-in b{font-size:34px;font-weight:850;letter-spacing:-.03em}.ring-in span{font-size:11px;font-weight:700;color:var(--secondary-text-color);text-transform:uppercase;letter-spacing:.08em}
.ring-in small{margin-top:5px;font-size:12px;font-weight:800;color:var(--tone)}
.id{min-width:0}.eyebrow{font-size:10.5px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:var(--pn-accent)}
.id h2{margin:2px 0 6px;font-size:34px;line-height:1.05;font-weight:850;letter-spacing:-.02em;background:linear-gradient(100deg,var(--primary-text-color) 30%,color-mix(in srgb,var(--pn-accent) 80%,var(--primary-text-color)));-webkit-background-clip:text;background-clip:text;color:transparent}
.mood{display:flex;align-items:center;gap:8px;margin:0 0 12px;font-size:14px;font-weight:750;color:color-mix(in srgb,var(--tone) 70%,var(--primary-text-color))}
.mood i{width:9px;height:9px;border-radius:50%;background:var(--tone);animation:pnPulse 2.6s ease-out infinite}
@keyframes pnPulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--tone) 55%,transparent)}70%,100%{box-shadow:0 0 0 9px transparent}}
.chips{display:flex;flex-wrap:wrap;gap:7px}
.chip{display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:999px;font-size:12.5px;font-weight:700;background:color-mix(in srgb,var(--primary-text-color) 6%,transparent);border:1px solid var(--pn-line)}
.chip ha-icon{--mdc-icon-size:16px;color:var(--pn-accent)}.chip.danger{border-color:color-mix(in srgb,var(--pn-danger) 50%,transparent);background:color-mix(in srgb,var(--pn-danger) 14%,transparent)}.chip.danger ha-icon{color:var(--pn-danger)}
.banner{display:flex;gap:14px;align-items:center;padding:14px 18px;border-left-color:var(--pn-blue);background:linear-gradient(110deg,color-mix(in srgb,var(--pn-blue) 16%,var(--pn-surface)),var(--pn-surface) 70%)}
.banner ha-icon{--mdc-icon-size:26px;color:var(--pn-blue);flex:none}.banner b{display:block;font-size:15px}.banner span{display:block;font-size:13px;color:var(--secondary-text-color);margin-top:2px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.panel{min-width:0;padding:18px}
.head{display:flex;align-items:center;gap:12px;margin-bottom:14px}.head>div{flex:1;min-width:0}
.head h3{margin:0;font-size:16px;font-weight:800}.head p{margin:2px 0 0;font-size:12.5px;color:var(--secondary-text-color)}
.hicon{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:color-mix(in srgb,var(--pn-accent) 15%,transparent);color:var(--pn-accent)}
.weight .hicon{background:color-mix(in srgb,var(--pn-blue) 15%,transparent);color:var(--pn-blue)}.weight{border-left-color:var(--pn-blue)}
.table .hicon{background:color-mix(in srgb,var(--pn-good) 15%,transparent);color:var(--pn-good)}.table{border-left-color:var(--pn-good)}
.hicon ha-icon{--mdc-icon-size:21px}
.stepper{display:flex;align-items:center;justify-content:space-between;gap:10px}
.stepper button{width:40px;height:40px;border-radius:13px;border:1px solid var(--pn-line);background:color-mix(in srgb,var(--primary-text-color) 6%,transparent);font-size:22px;font-weight:700;line-height:1;transition:transform .12s,background .2s}
.stepper button:active{transform:scale(.92);background:color-mix(in srgb,var(--pn-accent) 22%,transparent)}
.stepper strong{font-size:16px;font-weight:800;font-variant-numeric:tabular-nums}
.stepper.big button{width:52px;height:52px;border-radius:16px;font-size:26px}
.stepper.big strong{font-size:44px;font-weight:850;letter-spacing:-.03em}.stepper.big strong small{font-size:18px;font-weight:700;color:var(--secondary-text-color)}
.bowls{display:flex;gap:10px;margin:16px 0 12px}
.bowl{flex:1;display:grid;justify-items:center;gap:6px}
.bowl .kib{position:relative;width:100%;max-width:92px;height:30px;border-radius:6px 6px 40px 40px;background:linear-gradient(180deg,color-mix(in srgb,var(--primary-text-color) 14%,transparent),color-mix(in srgb,var(--primary-text-color) 6%,transparent));overflow:hidden;box-shadow:inset 0 -3px 0 rgba(0,0,0,.18)}
.bowl .kib:before{content:"";position:absolute;left:8%;right:8%;bottom:0;height:calc(var(--f) * 100%);border-radius:50% 50% 30px 30px;background:radial-gradient(circle at 25% 35%,rgba(255,255,255,.3) 0 2px,transparent 3px) 0 0/11px 9px,linear-gradient(180deg,#e9a24a,#a8642a);transition:height .8s cubic-bezier(.2,.8,.2,1)}
.bowl em{font-style:normal;font-size:12px;font-weight:800;color:var(--secondary-text-color)}
.rec{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px 9px 14px;border-radius:14px;background:color-mix(in srgb,var(--tone) 12%,transparent);border:1px solid color-mix(in srgb,var(--tone) 35%,transparent);font-size:13.5px}
.rec.ok{background:color-mix(in srgb,var(--pn-good) 12%,transparent);border-color:color-mix(in srgb,var(--pn-good) 35%,transparent)}.rec ha-icon{color:var(--pn-good)}
.rec button{padding:7px 16px;border-radius:999px;border:0;background:var(--tone);color:#111;font-weight:850;font-size:13px}
.spark{display:block;width:100%;height:70px;margin:14px 0 10px}
.spark.empty{display:grid;place-items:center;border-radius:14px;border:1px dashed var(--pn-line);color:var(--secondary-text-color);opacity:.6}
.spark .ln{fill:none;stroke:var(--pn-blue);stroke-width:2.5;vector-effect:non-scaling-stroke;stroke-linejoin:round}
.spark circle{fill:var(--pn-blue);filter:drop-shadow(0 0 5px var(--pn-blue))}
.spark .goal{stroke:var(--pn-good);stroke-width:1.5;stroke-dasharray:5 5;vector-effect:non-scaling-stroke;opacity:.8}
.weight{--pn-accent:var(--pn-blue)}
.goalrow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:10px;border-top:1px solid var(--pn-line)}
.goalrow>span{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:800;color:var(--secondary-text-color)}.goalrow ha-icon{--mdc-icon-size:18px;color:var(--pn-good)}
.togo{margin:8px 0 0;text-align:right;font-size:13px;font-weight:800;color:var(--pn-good)}
.group{margin-bottom:12px}.glabel{display:block;margin:0 0 7px 2px;font-size:10.5px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--secondary-text-color)}
.pills{display:flex;flex-wrap:wrap;gap:8px}
.pill{display:flex;flex-direction:column;align-items:flex-start;gap:1px;padding:9px 14px;border-radius:14px;border:1px solid var(--pn-line);background:color-mix(in srgb,var(--primary-text-color) 5%,transparent);text-align:left;transition:all .2s}
.pill b{font-size:13.5px;font-weight:750}.pill small{font-size:11.5px;color:var(--secondary-text-color);font-weight:700}
.pill.on{border-color:var(--pn-accent);background:linear-gradient(140deg,color-mix(in srgb,var(--pn-accent) 26%,transparent),color-mix(in srgb,var(--pn-accent) 8%,transparent));box-shadow:0 6px 18px color-mix(in srgb,var(--pn-accent) 22%,transparent)}
.pill.on small{color:color-mix(in srgb,var(--pn-accent) 80%,var(--primary-text-color))}
.seg{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:6px;padding:4px;border-radius:16px;background:color-mix(in srgb,var(--primary-text-color) 6%,transparent);border:1px solid var(--pn-line)}
.seg button{display:flex;align-items:center;justify-content:center;gap:7px;padding:10px 6px;border:0;border-radius:12px;background:none;font-size:13.5px;font-weight:750;color:var(--secondary-text-color);transition:all .25s}
.seg button ha-icon{--mdc-icon-size:18px}.seg button.on{background:var(--pn-surface);color:var(--primary-text-color);box-shadow:0 4px 14px rgba(0,0,0,.25)}.seg button.on ha-icon{color:var(--pn-accent)}
.rows{display:grid;gap:6px}
.row{display:grid;grid-template-columns:78px minmax(0,1fr) 86px 40px;align-items:center;gap:10px;padding:6px 8px;border-radius:12px;font-variant-numeric:tabular-nums}
.row .kg{font-size:13.5px;font-weight:800;display:flex;align-items:center;gap:6px}.row .kg em{font-style:normal;font-size:9.5px;font-weight:850;letter-spacing:.08em;text-transform:uppercase;padding:2px 6px;border-radius:6px;background:var(--pn-blue);color:#0b1520}
.row.target .kg em{background:var(--pn-good)}
.row .bar{position:relative;height:24px;border-radius:8px;background:color-mix(in srgb,var(--primary-text-color) 5%,transparent);overflow:hidden}
.row .bar i{position:absolute;inset:0 auto 0 0;border-radius:8px;background:linear-gradient(90deg,color-mix(in srgb,var(--pn-good) 30%,transparent),color-mix(in srgb,var(--pn-good) 70%,transparent));animation:pnGrow .9s cubic-bezier(.2,.8,.2,1) both}
@keyframes pnGrow{from{width:0}}
.row .bar b{position:relative;display:block;padding-left:9px;line-height:24px;font-size:12.5px;font-weight:800}
.row .kcal{font-size:12.5px;color:var(--secondary-text-color);text-align:right;font-weight:700}
.row .por{justify-self:end;min-width:34px;padding:4px 0;border-radius:10px;text-align:center;font-weight:850;font-size:14px;background:color-mix(in srgb,var(--pn-accent) 16%,transparent);color:color-mix(in srgb,var(--pn-accent) 85%,var(--primary-text-color))}
.row.now{background:color-mix(in srgb,var(--pn-blue) 12%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--pn-blue) 40%,transparent)}
.row.target{background:color-mix(in srgb,var(--pn-good) 12%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--pn-good) 40%,transparent)}
.foot{margin:12px 2px 0;font-size:12px;line-height:1.5;color:var(--secondary-text-color)}
@media(max-width:720px){.grid{grid-template-columns:1fr}.hero{grid-template-columns:1fr;justify-items:center;text-align:center}.mood,.chips{justify-content:center}.id h2{font-size:30px}}
@media(max-width:420px){.row{grid-template-columns:62px minmax(0,1fr) 34px}.row .kcal{display:none}.seg button{font-size:12px;gap:4px}.seg button ha-icon{display:none}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

if (!customElements.get("ha-pet-nutrition-card")) customElements.define("ha-pet-nutrition-card", HAPetNutritionCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "ha-pet-nutrition-card", name: "HA Pet Nutrition Card", description: "Foder, portioner, vægt og kalorier for en hund på foderautomat", preview: false });
console.info(`%c HA-PET-NUTRITION-CARD %c ${VERSION} `, "color:#111;background:#ffb547;font-weight:700", "color:#ffb547;background:#111");
