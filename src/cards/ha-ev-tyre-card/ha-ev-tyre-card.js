// HA EV Tyre Card – bilens hjulsæt fra EV Ledger (sensor.<bil>_tyres): hvilket sæt der er på, dæk- og fælgdata,
// forbrug pr. sæt og sæson, sammenligning ved samme udetemperatur, mønsterdybde og påmindelse om hjulskift.
// Skift hjul, mål mønster og opret/ret hjulsæt direkte i kortet (EV Ledger-services).
// 0.1.0 – første version (Claude AI, 2026-10-14).

import { LUX_ACCENT } from "../../shared/lux.js";

const VERSION = "0.1.1";

const KINDS = {
  // The theme's own colours (user, 2026-10-14: "sørg for de kort følger tema").
  summer: { label: "Sommer", icon: "mdi:weather-sunny", color: "var(--warning-color,#f2b545)" },
  winter: { label: "Vinter", icon: "mdi:snowflake", color: "var(--info-color,#5fb8ff)" },
  studded: { label: "Pigdæk", icon: "mdi:snowflake-alert", color: "var(--primary-color,#8fa8ff)" },
  all_season: { label: "Helår", icon: "mdi:weather-partly-snowy-rainy", color: "var(--success-color,#6fd19a)" },
};
const kindOf = (kind) => KINDS[kind] || KINDS.summer;
const BAND_ORDER = ["under 0", "0–5", "5–10", "10–15", "15–20", "20+"];
const BAND_LABEL = { "under 0": "Under 0°", "0–5": "0–5°", "5–10": "5–10°", "10–15": "10–15°", "15–20": "15–20°", "20+": "Over 20°" };
const TYRES = [["fl", "VF"], ["fr", "HF"], ["rl", "VB"], ["rr", "HB"]];

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v, digits = 0) => (v == null || Number.isNaN(Number(v)) ? "–"
  : Number(v).toLocaleString("da-DK", { minimumFractionDigits: digits, maximumFractionDigits: digits }));
const day = (iso) => (iso ? new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" }) : "");
const dayShort = (iso) => (iso ? new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "short" }) : "");
const pad = (n) => String(n).padStart(2, "0");
const localInput = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
const icon = (name, cls = "") => `<ha-icon icon="${name}"${cls ? ` class="${cls}"` : ""}></ha-icon>`;

/** The tyres' age from DOT (week + year, e.g. "2324"). */
function dotAge(dot) {
  const m = /^(\d{2})(\d{2})$/.exec(String(dot || "").trim());
  if (!m) return null;
  const made = new Date(2000 + Number(m[2]), 0, 1 + (Number(m[1]) - 1) * 7);
  const years = (Date.now() - made) / (365.25 * 864e5);
  return years < 0 ? null : years;
}

class HAEvTyreCard extends HTMLElement {
  static getStubConfig(hass) {
    const found = Object.keys(hass?.states || {}).find((id) => /^sensor\..+_tyres$/.test(id) && hass.states[id].attributes.sets);
    return { entity: found || "sensor.bil_tyres" };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "entity", required: true, selector: { entity: { domain: "sensor", integration: "evledger" } } },
        { name: "title", selector: { text: {} } },
      ],
      computeLabel: (s) => ({ entity: "Hjul-sensor (EV Ledger)", title: "Titel" })[s.name] || s.name,
    };
  }

  setConfig(config) {
    if (!config?.entity) throw new Error("entity mangler (sensor.<bil>_tyres fra EV Ledger)");
    this._config = { title: "Hjul", embedded: false, ...config };
    this._view = this._view || "main";
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const st = hass?.states?.[this._config?.entity];
    if (st === this._st) return;
    this._st = st;
    if (this._view === "main") this._render();  // never redraw over an open form
  }

  getCardSize() {
    return 6;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }

  // ------------------------------------------------------------------ data

  get _a() {
    return this._st?.attributes || {};
  }

  _sets() {
    return Array.isArray(this._a.sets) ? this._a.sets : [];
  }

  _set(id) {
    return this._sets().find((s) => s.id === id);
  }

  async _call(service, data) {
    this._busy = true;
    this._err = "";
    this._paint();
    try {
      await this._hass.callService("evledger", service, { entity_id: this._config.entity, ...data });
      this._busy = false;
      return true;
    } catch (err) {
      this._busy = false;
      this._err = err?.message || String(err);
      this._paint();
      return false;
    }
  }

  _open(view, extra = {}) {
    this._view = view;
    this._err = "";
    this._confirm = "";
    Object.assign(this, extra);
    this._render();
  }

  // ---------------------------------------------------------------- render

  _render() {
    if (!this.shadowRoot || !this._config) return;
    const body = !this._st ? `<p class="empty">${icon("mdi:alert-circle-outline")}<span>${esc(this._config.entity)} findes ikke. Den kommer med EV Ledger 0.7.0 (genstart Home Assistant efter opdateringen).</span></p>`
      : this._view === "change" ? this._changeHtml()
        : this._view === "tread" ? this._treadHtml()
          : this._view === "edit" ? this._editHtml()
            : this._view === "season" ? this._seasonHtml()
              : this._mainHtml();
    const html = `<style>${STYLES}</style>${this._config.embedded ? `<div class="tc embedded">${body}</div>` : `<ha-card><div class="tc">${body}</div></ha-card>`}`;
    const scroller = this.shadowRoot.querySelector(".tc");
    const keep = scroller ? scroller.scrollTop : 0;
    this.shadowRoot.innerHTML = html;
    const next = this.shadowRoot.querySelector(".tc");
    if (next && keep) next.scrollTop = keep;
    this._wire();
    this._paint();
  }

  /** Busy/error state without a redraw (forms keep what was typed). */
  _paint() {
    const root = this.shadowRoot;
    if (!root) return;
    root.querySelectorAll("[data-save]").forEach((b) => { b.disabled = !!this._busy; b.classList.toggle("busy", !!this._busy); });
    const err = root.querySelector("[data-err]");
    if (err) { err.textContent = this._err || ""; err.hidden = !this._err; }
  }

  _header(sub, actions = "") {
    const active = this._set(this._a.set_id);
    const k = active ? kindOf(active.kind) : null;
    return `<header class="th"><span class="th-i" style="--k:${k ? k.color : "var(--tc-muted)"}">${icon("mdi:tire")}</span>
      <div class="th-t"><h3>${esc(this._config.title)}</h3><p>${sub}</p></div>${actions}</header>`;
  }

  _mainHtml() {
    const a = this._a;
    const sets = this._sets();
    if (!sets.length) {
      return `${this._header("Ingen hjulsæt endnu")}
        <div class="intro">${icon("mdi:tire", "intro-i")}<div><b>Tilføj dine hjulsæt</b><p>Fx sommer- og vinterhjul med dæk- og fælgstørrelse. Så viser kortet hvilket sæt der sidder på, forbruget på hvert sæt — også sammenlignet ved samme udetemperatur — slid og hvornår det er tid til at skifte.</p>
        <button type="button" class="btn go" data-new>${icon("mdi:plus")}Tilføj hjulsæt</button></div></div>`;
    }
    const active = this._set(a.set_id);
    const k = active ? kindOf(active.kind) : null;
    const sub = active ? `${esc(active.name)} på siden ${esc(day(a.mounted_at))}` : "Intet sæt registreret på bilen";
    const actions = `<div class="th-a"><button type="button" class="btn go" data-change>${icon("mdi:swap-horizontal")}<span>Skift hjul</span></button><button type="button" class="ib" data-new title="Nyt hjulsæt" aria-label="Nyt hjulsæt">${icon("mdi:plus")}</button></div>`;
    return `${this._header(sub, actions)}${this._tipHtml()}${active ? this._currentHtml(active, k) : `<p class="note">Tryk <b>Skift hjul</b> og vælg det sæt, der sidder på nu (du kan vælge en dato tilbage i tiden).</p>`}
      ${this._setsHtml()}${this._compareHtml()}${this._historyHtml()}`;
  }

  _tipHtml() {
    const tip = this._a.suggestion;
    if (!tip) return "";
    const to = kindOf(tip.to === "summer" ? "summer" : "winter");
    const goal = tip.to === "summer" ? "sommerhjul" : "vinterhjul";
    return `<div class="tip${tip.urgent ? " urgent" : ""}" style="--k:${to.color}">${icon(to.icon, "tip-i")}<div><b>Tid til ${goal}${tip.set ? ` (${esc(tip.set)})` : ""}</b><p>${esc(tip.reason)}</p></div>
      ${tip.set_id ? `<button type="button" class="btn" data-change="${esc(tip.set_id)}">Skift nu</button>` : ""}</div>`;
  }

  _treadBar(set) {
    if (set.tread_mm == null) return "";
    const max = Math.max(8, set.tread_mm);
    const pct = Math.min(100, (set.tread_mm / max) * 100);
    const minPct = (set.tread_min_mm / max) * 100;
    const tone = set.tread_mm <= 1.6 ? "crit" : set.tread_mm < set.tread_min_mm ? "warn" : set.tread_mm < set.tread_min_mm + 1 ? "low" : "ok";
    const left = set.km_left != null ? ` · ca. ${num(set.km_left)} km tilbage` : "";
    return `<div class="tread ${tone}"><div class="tread-h"><span>Mønster</span><b>${num(set.tread_mm, 1)} mm</b></div>
      <div class="tread-bar"><i style="width:${pct.toFixed(1)}%"></i><em style="left:${minPct.toFixed(1)}%" title="Anbefalet minimum ${num(set.tread_min_mm, 1)} mm"></em></div>
      <small>Anbefalet min. ${num(set.tread_min_mm, 0)} mm${set.wear_mm_per_1000_km != null ? ` · slid ${num(set.wear_mm_per_1000_km, 2)} mm/1000 km` : ""}${left} · målt ${esc(dayShort(set.tread_at))}</small></div>`;
  }

  _currentHtml(set, k) {
    const a = this._a;
    const season = (a.seasons || [])[0];
    const age = dotAge(set.dot);
    const tyre = [set.brand, set.model].filter(Boolean).join(" ");
    const facts = [
      set.rim ? `${icon("mdi:circle-double")}<span>${esc(set.rim)}</span>` : "",
      tyre ? `${icon("mdi:tire")}<span>${esc(tyre)}</span>` : "",
      set.dot ? `${icon("mdi:calendar")}<span>DOT ${esc(set.dot)}${age != null ? ` · ${num(age, age < 10 ? 1 : 0)} år` : ""}</span>` : "",
    ].filter(Boolean).map((f) => `<span class="fact">${f}</span>`).join("");
    const kpi = (value, unit, label, title = "") => `<div class="kpi"${title ? ` title="${esc(title)}"` : ""}><b>${value}<small>${unit}</small></b><span>${label}</span></div>`;
    return `<section class="cur" style="--k:${k.color}">
      <div class="cur-top"><span class="kind">${icon(k.icon)}${k.label}</span><h4>${esc(set.name)}</h4><p class="size">${esc(set.size || "Størrelse ikke angivet")}</p>
        <div class="facts">${facts}</div></div>
      <div class="kpis">${kpi(num(season?.km ?? a.season_km), "km", "denne sæson")}${kpi(num(season?.wh_per_km), "Wh/km", "kørsel", "Ud fra batteriets fald på turene")}${kpi(num(season?.charged_kwh_per_100_km, 1), "kWh/100 km", "opladet", "Ladet energi pr. 100 km (med tab og standby)")}${kpi(num(season?.cost_per_km, 2), "kr/km", "ladeudgift")}</div>
      ${this._treadBar(set)}
      ${season?.mean_temp_c != null ? `<p class="mini">${icon("mdi:thermometer")}Gennemsnitlig udetemperatur på turene: ${num(season.mean_temp_c, 1)} °C · ${num(season.days)} dage · ${num(season.trips)} ture</p>` : ""}
    </section>`;
  }

  _setsHtml() {
    const sets = this._sets();
    const tiles = sets.filter((s) => !s.retired || s.mounted).map((s) => {
      const k = kindOf(s.kind);
      const where = s.mounted ? `<span class="on">På bilen</span>` : s.storage ? `<span class="off">${icon("mdi:warehouse")}${esc(s.storage)}</span>` : "";
      return `<article class="set${s.mounted ? " mounted" : ""}" style="--k:${k.color}">
        <header>${icon(k.icon, "set-i")}<div><b>${esc(s.name)}</b><small>${esc(s.size || k.label)}</small></div>${where}</header>
        <dl><div><dt>I alt</dt><dd>${num(s.total_km)} km</dd></div><div><dt>Kørsel</dt><dd>${num(s.wh_per_km)} Wh/km</dd></div>
          <div><dt>Opladet</dt><dd>${num(s.charged_kwh_per_100_km, 1)} kWh/100</dd></div><div><dt>Mønster</dt><dd>${s.tread_mm != null ? `${num(s.tread_mm, 1)} mm` : "–"}</dd></div></dl>
        <footer><button type="button" class="lnk" data-tread="${esc(s.id)}">${icon("mdi:ruler")}Mål mønster</button><button type="button" class="lnk" data-edit="${esc(s.id)}">${icon("mdi:pencil")}Ret</button></footer>
      </article>`;
    }).join("");
    const retired = sets.filter((s) => s.retired && !s.mounted);
    const old = retired.length ? `<p class="mini">${icon("mdi:archive-outline")}Udfasede: ${retired.map((s) => `<button type="button" class="lnk inline" data-edit="${esc(s.id)}">${esc(s.name)}</button>`).join(", ")}</p>` : "";
    return `<section class="sets">${tiles}</section>${old}`;
  }

  _compareHtml() {
    const sets = this._sets().filter((s) => s.bands && Object.keys(s.bands).length);
    if (sets.length < 1) return "";
    const cmp = this._a.comparison;
    const max = Math.max(1, ...sets.flatMap((s) => Object.values(s.bands).map((b) => b.wh_per_km || 0)));
    const bands = BAND_ORDER.filter((b) => sets.some((s) => s.bands[b]));
    const rows = bands.map((band) => `<div class="band"><span class="band-l">${BAND_LABEL[band]}</span><div class="band-b">${sets.map((s) => {
      const v = s.bands[band];
      const k = kindOf(s.kind);
      return v ? `<div class="bar" style="--k:${k.color};--w:${((v.wh_per_km / max) * 100).toFixed(1)}%" title="${esc(s.name)}: ${num(v.wh_per_km)} Wh/km over ${num(v.km)} km"><i></i><em>${num(v.wh_per_km)}</em></div>` : `<div class="bar none" title="${esc(s.name)}: ingen ture"><i></i><em>–</em></div>`;
    }).join("")}</div></div>`).join("");
    const lines = (cmp?.sets || []).map((c) => {
      const s = this._set(c.set_id);
      if (c.difference_pct == null) return `<p class="verdict muted">${icon("mdi:scale-balance")}<span><b>${esc(c.set)}</b> mod <b>${esc(cmp.reference)}</b>: kør mindst 100 km på begge sæt i samme temperaturinterval, så kan de sammenlignes ærligt.</span></p>`;
      const more = c.difference_pct > 0;
      const sure = { low: "foreløbigt tal — bliver mere sikkert med flere km", medium: "rimeligt sikkert", high: "sikkert" }[c.confidence];
      return `<p class="verdict${c.confidence === "low" ? " soft" : ""}" style="--k:${kindOf(s?.kind).color}">${icon(more ? "mdi:trending-up" : "mdi:trending-down")}<span><b>${esc(c.set)}</b> bruger <b>${num(Math.abs(c.difference_pct), 1)} % ${more ? "mere" : "mindre"}</b> end ${esc(cmp.reference)} ved samme udetemperatur (${c.bands.map((b) => BAND_LABEL[b]).join(", ")} · ${num(c.km_compared)} km${sure ? ` · ${sure}` : ""}).</span></p>`;
    }).join("");
    const legend = sets.map((s) => `<span style="--k:${kindOf(s.kind).color}"><i></i>${esc(s.name)}</span>`).join("");
    return `<section class="cmp"><header class="sh"><h4>Forbrug ved udetemperatur</h4><span class="legend">${legend}</span></header>
      <div class="bands">${rows}</div>${lines}<p class="mini">Wh/km ud fra batteriets fald på turene. Kulde koster mest — derfor sammenlignes sættene kun i samme temperatur.</p></section>`;
  }

  _historyHtml() {
    const seasons = this._a.seasons || [];
    if (!seasons.length) return "";
    const rows = seasons.map((s) => {
      const set = this._set(s.set_id);
      const k = kindOf(set?.kind || s.kind);
      return `<button type="button" class="hrow" data-season="${esc(s.change_id)}" style="--k:${k.color}">${icon(k.icon, "h-i")}
        <span class="h-n"><b>${esc(s.set || "Slettet sæt")}</b><small>${esc(day(s.from))} – ${s.to ? esc(day(s.to)) : "nu"}</small></span>
        <span class="h-v"><b>${s.km != null ? `${num(s.km)} km` : "–"}</b><small>${s.wh_per_km != null ? `${num(s.wh_per_km)} Wh/km` : ""}${s.cost_per_km != null ? ` · ${num(s.cost_per_km, 2)} kr/km` : ""}</small></span>${icon("mdi:chevron-right", "h-c")}</button>`;
    }).join("");
    return `<section class="hist"><header class="sh"><h4>Sæsoner</h4></header>${rows}</section>`;
  }

  // ----------------------------------------------------------------- forms

  _form(title, sub, body, save, extra = "") {
    return `${this._header(sub)}<section class="form"><header class="fh"><button type="button" class="ib" data-back aria-label="Tilbage">${icon("mdi:arrow-left")}</button><h4>${title}</h4></header>
      ${body}<p class="err" data-err hidden></p><div class="fa">${extra}<span class="sp"></span><button type="button" class="btn" data-back>Annuller</button><button type="button" class="btn go" data-save>${save}</button></div></section>`;
  }

  _changeHtml() {
    const sets = this._sets().filter((s) => !s.retired || s.mounted);
    const pick = this._pick || sets.find((s) => !s.mounted)?.id || sets[0]?.id;
    this._pick = pick;
    const choices = sets.map((s) => {
      const k = kindOf(s.kind);
      return `<button type="button" class="choice" role="radio" aria-checked="${s.id === pick}" data-pick="${esc(s.id)}" style="--k:${k.color}"${s.mounted ? " disabled" : ""}>${icon(k.icon)}<span><b>${esc(s.name)}</b><small>${s.mounted ? "Sidder på nu" : esc(s.size || k.label)}</small></span></button>`;
    }).join("");
    return this._form("Skift hjul", "Hvilket sæt kommer på?", `<div class="choices" role="radiogroup">${choices}</div>
      <div class="grid2"><label class="f"><span>Hvornår</span><input type="datetime-local" data-f="at" value="${localInput()}" max="${localInput()}"></label>
      <label class="f"><span>Kilometerstand</span><input type="number" inputmode="numeric" min="0" step="1" data-f="odometer_km" placeholder="Hentes automatisk"></label></div>
      <label class="f"><span>Note (valgfri)</span><input type="text" data-f="note" placeholder="Fx skiftet hos dækhotellet" autocomplete="off"></label>
      <p class="mini">Kilometerstanden findes ud fra turene, hvis du ikke skriver den. Du kan vælge en dato tilbage i tiden, fx sidste efterår.</p>`, "Gem skift");
  }

  _treadHtml() {
    const set = this._set(this._treadId) || this._set(this._a.set_id) || this._sets()[0];
    this._treadId = set?.id;
    const options = this._sets().map((s) => `<option value="${esc(s.id)}"${s.id === set?.id ? " selected" : ""}>${esc(s.name)}</option>`).join("");
    const last = (set?.treads || []).slice(-1)[0];
    const history = (set?.treads || []).slice().reverse().map((r) => `<li><span>${esc(day(r.at))}</span><b>${num(r.mm, 1)} mm</b><small>${r.each ? r.each.map((v) => num(v, 1)).join(" / ") : ""}${r.odometer_km != null ? ` · ${num(r.odometer_km)} km` : ""}</small><button type="button" class="ib sm" data-deltread="${esc(r.id)}" aria-label="Slet måling" title="Slet måling">${icon(this._confirm === `t:${r.id}` ? "mdi:check" : "mdi:delete-outline")}</button></li>`).join("");
    return this._form("Mål mønsterdybde", "Mål i midten af slidbanen med en dybdemåler", `
      <label class="f"><span>Hjulsæt</span><select data-treadset>${options}</select></label>
      <div class="tyres">${TYRES.map(([key, label]) => `<label class="f"><span>${label}</span><input type="number" inputmode="decimal" step="0.1" min="0" max="20" data-tyre="${key}" placeholder="${last?.each ? "" : "mm"}"></label>`).join("")}</div>
      <label class="f"><span>Hvornår</span><input type="datetime-local" data-f="at" value="${localInput()}" max="${localInput()}"></label>
      <p class="mini">Udfyld ét eller alle fire dæk — det laveste tæller. To målinger med nogle tusinde km imellem giver slid pr. 1000 km og hvor langt sættet rækker.</p>
      ${history ? `<ul class="treads">${history}</ul>` : ""}`, "Gem måling");
  }

  _editHtml() {
    const s = this._set(this._editId) || { kind: this._newKind || "winter" };
    const isNew = !s.id;
    const v = (key) => (s[key] == null ? "" : esc(s[key]));
    const text = (key, label, ph = "", cls = "") => `<label class="f ${cls}"><span>${label}</span><input type="text" data-f="${key}" value="${v(key)}" placeholder="${esc(ph)}" autocomplete="off"></label>`;
    const n = (key, label, ph = "", step = "1", cls = "") => `<label class="f ${cls}"><span>${label}</span><input type="number" inputmode="decimal" step="${step}" data-f="${key}" data-num value="${v(key)}" placeholder="${esc(ph)}"></label>`;
    const kinds = Object.entries(KINDS).map(([key, k]) => `<button type="button" class="choice sm" role="radio" aria-checked="${(s.kind || "summer") === key}" data-kind="${key}" style="--k:${k.color}">${icon(k.icon)}<span><b>${k.label}</b></span></button>`).join("");
    const del = isNew ? "" : `<button type="button" class="btn stop" data-delset>${this._confirm === "set" ? "Tryk igen for at slette" : "Slet"}</button>`;
    return this._form(isNew ? "Nyt hjulsæt" : `Ret ${esc(s.name)}`, isNew ? "Dæk og fælge" : esc(s.size || ""), `
      ${text("name", "Navn", "Fx Vinter 18\"")}
      <div class="choices kinds" role="radiogroup" aria-label="Type">${kinds}</div>
      <h5>Dæk</h5>
      <div class="grid2">${text("brand", "Mærke", "Fx Nokian")}${text("model", "Model", "Fx Hakkapeliitta R5 EV")}</div>
      <div class="grid4">${n("width_mm", "Bredde", "235", "5")}${n("aspect_pct", "Profil %", "45", "5")}${n("rim_inch", "Fælg \"", "18", "1")}${text("load_speed", "Index", "98T")}</div>
      <div class="grid2">${text("dot", "DOT (uge+år)", "Fx 2324")}${n("km_before", "Km før EV Ledger", "0", "100")}</div>
      <h5>Fælge</h5>
      <div class="grid3">${text("rim_name", "Navn", "Fx Aero 18")}${n("rim_width_in", "Bredde (J)", "8.5", "0.5")}${n("rim_offset_mm", "ET", "40", "1")}</div>
      <h5>Øvrigt</h5>
      <div class="grid2"><label class="f"><span>Købt</span><input type="date" data-f="purchased" value="${v("purchased")}"></label>${n("price", "Pris (kr.)", "", "1")}</div>
      ${text("storage", "Opbevares", "Fx Dækhotel, garagen")}${text("note", "Note")}
      ${isNew ? "" : `<label class="chk"><input type="checkbox" data-f="retired"${s.retired ? " checked" : ""}><span>Udfaset (slidt op / solgt) — beholdes i historikken</span></label>`}`, isNew ? "Opret" : "Gem", del);
  }

  _seasonHtml() {
    const season = (this._a.seasons || []).find((s) => s.change_id === this._seasonId);
    if (!season) return this._mainHtml();
    const at = new Date(season.from);
    return this._form(`${esc(season.set || "Skift")} på bilen`, `${esc(day(season.from))} – ${season.to ? esc(day(season.to)) : "nu"}`, `
      <div class="kpis">${[[num(season.km), "km"], [num(season.wh_per_km), "Wh/km"], [num(season.charged_kwh_per_100_km, 1), "kWh/100 km"], [num(season.mean_temp_c, 1), "°C snit"]].map(([vv, u]) => `<div class="kpi"><b>${vv}<small>${u}</small></b></div>`).join("")}</div>
      <div class="grid2"><label class="f"><span>Skiftet</span><input type="datetime-local" data-f="at" value="${localInput(at)}" max="${localInput()}"></label>
      <label class="f"><span>Kilometerstand ved skift</span><input type="number" inputmode="numeric" step="1" min="0" data-f="odometer_km" value="${season.odometer_from ?? ""}" placeholder="Ukendt"></label></div>
      <p class="mini">Ret dato eller kilometerstand, hvis skiftet blev registreret forkert. Uden kilometerstand kan km og forbrug ikke regnes for sæsonen.</p>`, "Gem",
    `<button type="button" class="btn stop" data-delseason>${this._confirm === "season" ? "Tryk igen for at slette" : "Slet skift"}</button>`);
  }

  // ------------------------------------------------------------------ wire

  _val(key) {
    const el = this.shadowRoot.querySelector(`[data-f="${key}"]`);
    if (!el) return undefined;
    if (el.type === "checkbox") return el.checked;
    const raw = el.value.trim();
    if (el.hasAttribute("data-num")) return raw === "" ? null : Number(raw.replace(",", "."));
    return raw === "" ? null : raw;
  }

  _wire() {
    const root = this.shadowRoot;
    const on = (sel, fn) => root.querySelectorAll(sel).forEach((el) => el.addEventListener("click", (ev) => { ev.stopPropagation(); fn(el, ev); }));
    on("[data-back]", () => this._open("main"));
    on("[data-change]", (el) => this._open("change", { _pick: el.dataset.change || null }));
    on("[data-new]", () => this._open("edit", { _editId: null, _newKind: this._sets().some((s) => s.kind === "summer") ? "winter" : "summer" }));
    on("[data-edit]", (el) => this._open("edit", { _editId: el.dataset.edit }));
    on("[data-tread]", (el) => this._open("tread", { _treadId: el.dataset.tread }));
    on("[data-season]", (el) => this._open("season", { _seasonId: el.dataset.season }));
    on("[data-pick]", (el) => {
      this._pick = el.dataset.pick;
      root.querySelectorAll("[data-pick]").forEach((b) => b.setAttribute("aria-checked", String(b === el)));
    });
    on("[data-kind]", (el) => {
      root.querySelectorAll("[data-kind]").forEach((b) => b.setAttribute("aria-checked", String(b === el)));
    });
    root.querySelector("[data-treadset]")?.addEventListener("change", (ev) => { this._treadId = ev.target.value; this._render(); });
    on("[data-deltread]", async (el) => {
      const key = `t:${el.dataset.deltread}`;
      if (this._confirm !== key) { this._confirm = key; this._render(); return; }
      this._confirm = "";
      if (await this._call("delete_tread_depth", { set_id: this._treadId, reading_id: el.dataset.deltread })) this._render();
    });
    on("[data-delset]", async () => {
      if (this._confirm !== "set") { this._confirm = "set"; root.querySelector("[data-delset]").textContent = "Tryk igen for at slette"; return; }
      if (await this._call("delete_tyre_set", { set_id: this._editId })) this._open("main");
    });
    on("[data-delseason]", async () => {
      if (this._confirm !== "season") { this._confirm = "season"; root.querySelector("[data-delseason]").textContent = "Tryk igen for at slette"; return; }
      if (await this._call("delete_tyre_change", { change_id: this._seasonId })) this._open("main");
    });
    on("[data-save]", () => this._save());
  }

  async _save() {
    if (this._busy) return;
    const when = this._val("at");
    const at = when ? new Date(when).toISOString() : undefined;
    let ok = false;
    if (this._view === "change") {
      if (!this._pick) { this._err = "Vælg et hjulsæt."; this._paint(); return; }
      const data = { set_id: this._pick };
      if (at && Math.abs(new Date(at) - Date.now()) > 120000) data.at = at;
      const odo = this._val("odometer_km");
      if (odo) data.odometer_km = Number(odo);
      const note = this._val("note");
      if (note) data.note = note;
      ok = await this._call("change_tyres", data);
    } else if (this._view === "tread") {
      const each = TYRES.map(([key]) => this.shadowRoot.querySelector(`[data-tyre="${key}"]`).value.trim().replace(",", ".")).filter((v) => v !== "").map(Number);
      if (!each.length || each.some((v) => Number.isNaN(v))) { this._err = "Skriv mindst én dybde i mm."; this._paint(); return; }
      ok = await this._call("log_tread_depth", { set_id: this._treadId, each, ...(at ? { at } : {}) });
    } else if (this._view === "edit") {
      const name = this._val("name");
      if (!name) { this._err = "Giv sættet et navn."; this._paint(); return; }
      const kind = this.shadowRoot.querySelector('[data-kind][aria-checked="true"]')?.dataset.kind || "summer";
      const data = { name, kind };
      for (const key of ["brand", "model", "load_speed", "dot", "rim_name", "storage", "note", "purchased"]) data[key] = this._val(key);
      for (const key of ["width_mm", "aspect_pct", "rim_inch", "rim_width_in", "rim_offset_mm", "price", "km_before"]) data[key] = this._val(key);
      if (data.km_before == null) data.km_before = 0;
      if (this._editId) { data.set_id = this._editId; data.retired = this._val("retired"); }
      ok = await this._call("save_tyre_set", data);
    } else if (this._view === "season") {
      const data = { change_id: this._seasonId };
      if (at) data.at = at;
      const odo = this._val("odometer_km");
      if (odo) data.odometer_km = Number(odo);
      ok = await this._call("update_tyre_change", data);
    }
    if (ok) this._open("main");
  }
}

const STYLES = `
:host{display:block;--tc-text:var(--primary-text-color,#eef2f7);--tc-muted:var(--secondary-text-color,#94a3b8);
  --tc-line:color-mix(in srgb,var(--tc-text) 10%,transparent);--tc-tile:color-mix(in srgb,var(--tc-text) 4%,transparent);
  --tc-accent:${LUX_ACCENT}}
/* Text and icons in a kind's colour are mixed with the theme's text colour, so they read on light and dark themes. */
[style*="--k:"]{--kt:color-mix(in srgb,var(--k) 72%,var(--tc-text))}
*{box-sizing:border-box}
ha-card{overflow:hidden}
.tc{padding:16px;color:var(--tc-text);display:grid;gap:14px;container:tc / inline-size}
.tc.embedded{padding:0}
h3,h4,h5,p{margin:0}
ha-icon{--mdc-icon-size:20px;flex:none}
.th{display:flex;align-items:center;gap:12px;min-width:0}
.th-i{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;color:var(--kt);background:color-mix(in srgb,var(--k) 16%,transparent);flex:none}
.th-t{min-width:0;flex:1}
.th-t h3{font-size:16px;font-weight:700}
.th-t p{font-size:12.5px;color:var(--tc-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.th-a{display:flex;gap:8px;align-items:center}
.btn{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 14px;border-radius:11px;border:1px solid var(--tc-line);background:var(--tc-tile);
  color:var(--tc-text);font:inherit;font-size:13.5px;font-weight:650;cursor:pointer;white-space:nowrap;transition:transform .15s ease,background .2s ease}
.btn:active{transform:scale(.95)}
.btn ha-icon{--mdc-icon-size:18px}
.btn.go{background:color-mix(in srgb,var(--tc-accent) 22%,transparent);border-color:color-mix(in srgb,var(--tc-accent) 45%,transparent);color:color-mix(in srgb,var(--tc-accent) 75%,var(--tc-text))}
.btn.stop{color:var(--error-color,#ef4444);border-color:color-mix(in srgb,var(--error-color,#ef4444) 40%,transparent)}
.btn:disabled{opacity:.55;cursor:progress}
.ib{display:grid;place-items:center;width:36px;height:36px;border-radius:11px;border:1px solid var(--tc-line);background:var(--tc-tile);color:var(--tc-text);cursor:pointer;flex:none}
.ib.sm{width:30px;height:30px;border-radius:9px}
.lnk{display:inline-flex;align-items:center;gap:5px;border:0;background:none;color:var(--tc-muted);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;padding:4px 2px}
.lnk ha-icon{--mdc-icon-size:16px}
.lnk:hover{color:var(--tc-text)}
.lnk.inline{padding:0;text-decoration:underline}
.mini{display:flex;gap:6px;align-items:center;font-size:12px;color:var(--tc-muted);line-height:1.4}
.mini ha-icon{--mdc-icon-size:15px}
.note{font-size:13.5px;color:var(--tc-muted)}
.empty{display:flex;gap:10px;align-items:center;color:var(--tc-muted);font-size:13.5px}
.intro{display:flex;gap:14px;padding:16px;border-radius:14px;background:var(--tc-tile);border:1px dashed var(--tc-line)}
.intro-i{--mdc-icon-size:34px;color:var(--tc-accent)}
.intro p{font-size:13px;color:var(--tc-muted);margin:6px 0 12px;line-height:1.45}
.tip{display:flex;gap:12px;align-items:center;padding:12px 14px;border-radius:14px;background:color-mix(in srgb,var(--k) 13%,transparent);border:1px solid color-mix(in srgb,var(--k) 35%,transparent)}
.tip.urgent{animation:tipPulse 2.4s ease-in-out infinite}
.tip-i{--mdc-icon-size:26px;color:var(--kt)}
.tip>div{flex:1;min-width:0}
.tip b{font-size:14px}
.tip p{font-size:12.5px;color:var(--tc-muted);margin-top:2px}
@keyframes tipPulse{50%{box-shadow:0 0 0 4px color-mix(in srgb,var(--k) 18%,transparent)}}
.cur{position:relative;overflow:hidden;display:grid;gap:12px;padding:16px;border-radius:16px;
  background:radial-gradient(120% 140% at 100% 0%,color-mix(in srgb,var(--k) 16%,transparent),transparent 60%),var(--tc-tile);border:1px solid color-mix(in srgb,var(--k) 28%,var(--tc-line))}
.cur::after{content:"";position:absolute;right:-40px;top:-40px;width:170px;height:170px;border-radius:50%;
  background:repeating-conic-gradient(from 0deg,color-mix(in srgb,var(--k) 22%,transparent) 0 6deg,transparent 6deg 15deg);
  -webkit-mask:radial-gradient(closest-side,transparent 52%,#000 54%,#000 98%,transparent);mask:radial-gradient(closest-side,transparent 52%,#000 54%,#000 98%,transparent);
  opacity:.55;pointer-events:none}
.cur-top{position:relative;z-index:1;display:grid;gap:3px;padding-right:90px}
.kind{display:inline-flex;align-items:center;gap:5px;width:max-content;padding:3px 9px 3px 7px;border-radius:999px;font-size:11.5px;font-weight:750;letter-spacing:.02em;text-transform:uppercase;
  color:var(--kt);background:color-mix(in srgb,var(--k) 15%,transparent)}
.kind ha-icon{--mdc-icon-size:14px}
.cur h4{font-size:22px;font-weight:750;letter-spacing:-.01em;margin-top:4px}
.size{font-size:15px;font-weight:650;color:color-mix(in srgb,var(--tc-text) 85%,transparent);font-variant-numeric:tabular-nums}
.facts{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:6px}
.fact{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;color:var(--tc-muted)}
.fact ha-icon{--mdc-icon-size:15px}
.kpis{position:relative;z-index:1;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.kpi{display:grid;gap:2px;padding:10px;border-radius:12px;background:color-mix(in srgb,var(--tc-text) 4%,transparent);min-width:0}
.kpi b{font-size:19px;font-weight:750;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.kpi b small{font-size:11px;font-weight:600;color:var(--tc-muted);margin-left:3px}
.kpi span{font-size:11.5px;color:var(--tc-muted)}
.tread{position:relative;z-index:1;display:grid;gap:6px;--t:var(--success-color,#34d399)}
.tread.low{--t:var(--warning-color,#facc15)}.tread.warn{--t:color-mix(in srgb,var(--warning-color,#f59e0b) 50%,var(--error-color,#ef4444))}.tread.crit{--t:var(--error-color,#ef4444)}
.tread-h{display:flex;justify-content:space-between;font-size:12.5px;color:var(--tc-muted)}
.tread-h b{color:color-mix(in srgb,var(--t) 72%,var(--tc-text));font-size:13.5px}
.tread-bar{position:relative;height:8px;border-radius:99px;background:color-mix(in srgb,var(--tc-text) 8%,transparent)}
.tread-bar i{position:absolute;inset:0 auto 0 0;border-radius:inherit;background:linear-gradient(90deg,color-mix(in srgb,var(--t) 60%,transparent),var(--t));box-shadow:0 0 10px color-mix(in srgb,var(--t) 50%,transparent)}
.tread-bar em{position:absolute;top:-3px;bottom:-3px;width:2px;border-radius:2px;background:var(--tc-text);opacity:.5}
.tread small{font-size:11.5px;color:var(--tc-muted)}
.sets{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
.set{display:grid;gap:10px;padding:12px;border-radius:14px;background:var(--tc-tile);border:1px solid var(--tc-line);border-left:3px solid color-mix(in srgb,var(--k) 75%,transparent)}
.set.mounted{background:color-mix(in srgb,var(--k) 7%,var(--tc-tile))}
.set header{display:flex;align-items:center;gap:10px;min-width:0}
.set header>div{flex:1;min-width:0;display:grid}
.set header b{font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.set header small{font-size:12px;color:var(--tc-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.set-i{color:var(--kt)}
.on,.off{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px;white-space:nowrap;max-width:45%;overflow:hidden;text-overflow:ellipsis}
.on{color:var(--kt);background:color-mix(in srgb,var(--k) 16%,transparent)}
.off{color:var(--tc-muted);background:color-mix(in srgb,var(--tc-text) 6%,transparent)}
.off ha-icon{--mdc-icon-size:13px}
.set dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 10px;margin:0}
.set dl div{min-width:0}
.set dt{font-size:11px;color:var(--tc-muted)}
.set dd{margin:0;font-size:13.5px;font-weight:650;font-variant-numeric:tabular-nums;white-space:nowrap}
.set footer{display:flex;gap:10px;justify-content:flex-end;border-top:1px solid var(--tc-line);padding-top:6px}
.sh{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.sh h4{font-size:14px;font-weight:700}
.legend{display:flex;gap:12px;font-size:12px;color:var(--tc-muted)}
.legend span{display:inline-flex;align-items:center;gap:5px}
.legend i{width:9px;height:9px;border-radius:3px;background:var(--k)}
.cmp{display:grid;gap:10px}
.bands{display:grid;gap:7px}
.band{display:grid;grid-template-columns:70px 1fr;gap:10px;align-items:center}
.band-l{font-size:12px;color:var(--tc-muted);font-variant-numeric:tabular-nums}
.band-b{display:grid;gap:3px}
.bar{position:relative;height:14px;display:flex;align-items:center}
.bar i{display:block;height:100%;width:var(--w);min-width:3px;border-radius:5px;background:linear-gradient(90deg,color-mix(in srgb,var(--k) 45%,transparent),var(--k));transition:width .6s cubic-bezier(.2,.9,.3,1)}
.bar em{font-style:normal;font-size:11px;font-weight:700;margin-left:6px;font-variant-numeric:tabular-nums}
.bar.none i{width:3px;background:var(--tc-line)}
.bar.none em{color:var(--tc-muted)}
.verdict{display:flex;gap:8px;align-items:flex-start;font-size:13px;line-height:1.45;padding:10px 12px;border-radius:12px;background:color-mix(in srgb,var(--k,var(--tc-text)) 9%,transparent)}
.verdict ha-icon{color:var(--kt,var(--tc-muted));--mdc-icon-size:18px;margin-top:1px}
.verdict.soft{opacity:.8}
.verdict.muted{color:var(--tc-muted);background:var(--tc-tile)}
.hist{display:grid;gap:6px}
.hrow{display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;border-radius:12px;border:1px solid var(--tc-line);background:var(--tc-tile);color:inherit;font:inherit;text-align:left;cursor:pointer}
.hrow:hover{background:color-mix(in srgb,var(--tc-text) 7%,transparent)}
.h-i{color:var(--kt)}
.h-n,.h-v{display:grid;min-width:0}
.h-n{flex:1}
.h-v{text-align:right}
.hrow b{font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hrow small{font-size:11.5px;color:var(--tc-muted);white-space:nowrap}
.h-c{color:var(--tc-muted);--mdc-icon-size:18px}
.form{display:grid;gap:12px}
.fh{display:flex;align-items:center;gap:10px}
.fh h4{font-size:16px;font-weight:700}
.form h5{font-size:12px;font-weight:750;text-transform:uppercase;letter-spacing:.06em;color:var(--tc-muted);margin-top:4px}
.f{display:grid;gap:5px;min-width:0}
.f span{font-size:12px;color:var(--tc-muted);font-weight:600}
.f input,.f select{width:100%;min-width:0;height:40px;padding:0 11px;border-radius:10px;border:1px solid var(--tc-line);background:color-mix(in srgb,var(--tc-text) 5%,transparent);
  color:var(--tc-text);font:inherit;font-size:14px;color-scheme:light dark}
.f input:focus,.f select:focus{outline:2px solid color-mix(in srgb,var(--tc-accent) 60%,transparent);outline-offset:1px}
.grid2,.grid3,.grid4,.tyres{display:grid;gap:10px}
.grid2{grid-template-columns:repeat(2,minmax(0,1fr))}
.grid3{grid-template-columns:2fr 1fr 1fr}
.grid4,.tyres{grid-template-columns:repeat(4,minmax(0,1fr))}
.choices{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px}
.choices.kinds{grid-template-columns:repeat(4,minmax(0,1fr))}
.choice{display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:12px;border:1px solid var(--tc-line);background:var(--tc-tile);color:inherit;font:inherit;text-align:left;cursor:pointer;min-width:0}
.choice ha-icon{color:var(--kt)}
.choice span{display:grid;min-width:0}
.choice b{font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.choice small{font-size:11.5px;color:var(--tc-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.choice.sm{padding:9px 10px;gap:7px;justify-content:center}
.choice[aria-checked="true"]{border-color:color-mix(in srgb,var(--k) 70%,transparent);background:color-mix(in srgb,var(--k) 15%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--k) 45%,transparent)}
.choice:disabled{opacity:.5;cursor:default}
.chk{display:flex;gap:9px;align-items:center;font-size:13px;color:var(--tc-muted)}
.chk input{width:18px;height:18px;accent-color:var(--tc-accent)}
.treads{list-style:none;margin:0;padding:0;display:grid;gap:5px}
.treads li{display:grid;grid-template-columns:auto auto 1fr auto;gap:10px;align-items:center;font-size:12.5px;padding:6px 8px;border-radius:10px;background:var(--tc-tile)}
.treads li span,.treads li small{color:var(--tc-muted)}
.err{font-size:13px;color:var(--error-color,#ef4444)}
.fa{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.sp{flex:1}
@container tc (max-width:460px){.grid2{grid-template-columns:minmax(0,1fr)}}
@container tc (max-width:560px){
  .kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
  .grid4,.tyres{grid-template-columns:repeat(2,minmax(0,1fr))}
  .grid3{grid-template-columns:1fr 1fr}.grid3>.f:first-child{grid-column:1/-1}
  .choices.kinds{grid-template-columns:repeat(2,minmax(0,1fr))}
  .th-a .btn span{display:none}.th-a .btn{padding:0 10px}
  .cur-top{padding-right:40px}.cur h4{font-size:19px}
}
@media (prefers-reduced-motion:reduce){.tip.urgent{animation:none}.bar i{transition:none}}
`;

if (!customElements.get("ha-ev-tyre-card")) customElements.define("ha-ev-tyre-card", HAEvTyreCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "ha-ev-tyre-card")) {
  window.customCards.push({ type: "ha-ev-tyre-card", name: "EV Tyre Card", description: "Hjulsæt fra EV Ledger: skift, forbrug pr. sæt, slid og påmindelse.", preview: false });
}
console.info(`%c HA-EV-TYRE-CARD %c ${VERSION} `, "background:#5fb8ff;color:#06121f;font-weight:700", "background:#1f2937;color:#fff");
