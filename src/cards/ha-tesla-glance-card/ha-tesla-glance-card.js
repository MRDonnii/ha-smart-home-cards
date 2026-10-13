// HA Tesla Glance Card – lille forsidekort med batteri, rækkevidde, opladning og forbrug.
// Kun visning: ingen styring af bilen. Et tryk åbner bilens egen side (navigation_path)
// eller more-info på batteriet.
// 0.1.0 – første version.
// 0.1.1 – compact: true lægger tallene 2×2 ved siden af batteriet (lavere kort).
// 0.1.2 – smal kompakt (mobil): tallene 2×2 under batteriet, så intet klippes.
// 0.1.3 – v2-udseende (style_entity / style: v2), som forsidens nye fliser (Claude AI).

const VERSION = "0.1.5";

const DEAD = new Set(["unavailable", "unknown", "none", ""]);
const CHARGING = new Set(["charging", "on", "true", "starting"]);

const DEFAULTS = {
  name: "Tesla",
  compact: false,
  image: "",
  image_charging: "",
  navigation_path: "",
  battery: "sensor.tesla_battery_level",
  range: "sensor.tesla_battery_range",
  charging: "sensor.tesla_charging",
  charger_power: "sensor.tesla_charger_power",
  energy_added: "sensor.tesla_charge_energy_added",
  charge_finish: "",
  plugged: "binary_sensor.tesla_charge_cable",
  lock: "lock.tesla_lock",
  sentry: "switch.tesla_sentry_mode",
  inside_temperature: "sensor.tesla_inside_temperature",
  location: "device_tracker.tesla_location",
  shift_state: "",
  target_soc: "",
  next_charge_start: "",
  next_charge_cost: "",
  energy_today: "",
  cost_today: "",
  energy_month: "",
  cost_per_km: "",
  efficiency: "",
};

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

class HATeslaGlanceCard extends HTMLElement {
  static getStubConfig() {
    return { ...DEFAULTS };
  }

  static getConfigForm() {
    const e = (name, domain) => ({ name, selector: { entity: domain ? { domain } : {} } });
    return {
      schema: [
        { name: "name", selector: { text: {} } },
        { name: "navigation_path", selector: { text: {} } },
        { name: "image", selector: { text: {} } },
        { name: "image_charging", selector: { text: {} } },
        { name: "compact", selector: { boolean: {} } },
        { type: "expandable", name: "", title: "Bil", schema: [
          e("battery", "sensor"), e("range", "sensor"), e("lock", "lock"), e("sentry", "switch"),
          e("inside_temperature", "sensor"), e("location", "device_tracker"), e("shift_state", "sensor")] },
        { type: "expandable", name: "", title: "Opladning", schema: [
          e("charging"), e("charger_power", "sensor"), e("energy_added", "sensor"), e("charge_finish", "sensor"),
          e("plugged", "binary_sensor"), e("target_soc"), e("next_charge_start", "sensor"), e("next_charge_cost", "sensor")] },
        { type: "expandable", name: "", title: "Forbrug", schema: [
          e("energy_today", "sensor"), e("cost_today", "sensor"), e("energy_month", "sensor"),
          e("cost_per_km", "sensor"), e("efficiency", "sensor")] },
      ],
      computeLabel: (s) => ({
        name: "Navn", compact: "Kompakt (tal ved siden af batteriet)", navigation_path: "Side ved tryk", image: "Billede (parkeret)", image_charging: "Billede (lader)",
        battery: "Batteri", range: "Rækkevidde", lock: "Lås", sentry: "Sentry", inside_temperature: "Indetemperatur",
        location: "Lokation", charging: "Ladestatus", charger_power: "Ladeeffekt", energy_added: "Tilført energi",
        charge_finish: "Færdig kl.", plugged: "Kabel", target_soc: "Mål-SoC", next_charge_start: "Næste ladestart",
        next_charge_cost: "Pris for næste ladning", energy_today: "Energi i dag", cost_today: "Pris i dag",
        energy_month: "Energi denne måned", cost_per_km: "Kr pr. km", efficiency: "Wh pr. km",
      })[s.name] || s.title || s.name,
    };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._sig = "";
  }

  setConfig(config) {
    if (!config) throw new Error("Mangler konfiguration");
    this._config = { ...DEFAULTS, ...config };
    this._sig = "";
    this._build();
  }

  set hass(hass) {
    this._hass = hass;
    const ids = Object.keys(DEFAULTS).filter((k) => !["name", "compact", "image", "image_charging", "navigation_path"].includes(k)).map((k) => this._config[k]).filter(Boolean);
    const sv = this._config.style_entity ? hass.states[this._config.style_entity]?.state : "";
    const sig = ids.map((id) => { const s = hass.states[id]; return s ? `${s.state}|${s.attributes?.unit_of_measurement || ""}` : "-"; }).join(";") + `|${sv}`;
    if (sig === this._sig) return;
    this._sig = sig;
    // v2 look (Claude AI, 2026-10-13): follows `style_entity` (on = new) or `style: v2`, like the front page's tiles.
    this.toggleAttribute("v2", this._config.style_entity ? sv === "on" : this._config.style === "v2");
    this._update();
  }

  getCardSize() {
    return 3;
  }

  getGridOptions() {
    return { columns: 12, rows: 3, min_columns: 6, min_rows: 3 };
  }

  _st(id) {
    return id ? this._hass?.states?.[id] : undefined;
  }

  _val(id) {
    const s = this._st(id);
    return s && !DEAD.has(String(s.state).toLowerCase()) ? s.state : null;
  }

  _num(id) {
    const v = Number.parseFloat(this._val(id));
    return Number.isFinite(v) ? v : null;
  }

  _unit(id) {
    return this._st(id)?.attributes?.unit_of_measurement || "";
  }

  _fmt(v, d = 0) {
    return v == null ? "—" : Number(v).toLocaleString("da-DK", { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  _time(id) {
    const v = this._val(id);
    if (!v) return null;
    const t = new Date(v);
    if (Number.isNaN(t.getTime())) return v;
    const now = new Date();
    const hm = t.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
    if (t.toDateString() === now.toDateString()) return hm;
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    if (t.toDateString() === tomorrow.toDateString()) return `i morgen ${hm}`;
    return `${t.toLocaleDateString("da-DK", { weekday: "short" })} ${hm}`;
  }

  _target() {
    const t = this._config.target_soc;
    if (t == null || t === "") return null;
    if (typeof t === "number") return t;
    return this._num(t);
  }

  _isCharging() {
    const c = String(this._val(this._config.charging) || "").toLowerCase();
    if (CHARGING.has(c)) return true;
    const p = this._num(this._config.charger_power);
    return p != null && p > 0.1;
  }

  _build() {
    this.shadowRoot.innerHTML = `<style>
      :host{display:block;--accent:var(--dashboard-accent,var(--primary-color,#38bdf8));--good:var(--dashboard-success,var(--success-color,#20e3a2));--warn:var(--dashboard-warning,var(--warning-color,#fb923c));--muted:var(--secondary-text-color,#94a3b8);--edge:var(--dashboard-border-neutral,var(--divider-color,rgba(255,255,255,.1)))}
      *{box-sizing:border-box}
      ha-card{display:block;position:relative;overflow:hidden;height:100%;min-height:0;padding:12px 14px 10px;border-radius:var(--ha-card-border-radius,18px);cursor:pointer;container-type:inline-size;
        background:radial-gradient(120% 140% at 85% 0%,color-mix(in srgb,var(--tone,var(--accent)) 16%,transparent),transparent 55%),var(--ha-card-background,var(--card-background-color));transition:transform .2s ease}
      ha-card:active{transform:scale(.99)}
      .grid{position:relative;z-index:1;display:grid;grid-template-columns:minmax(0,1fr) minmax(120px,38%);gap:4px 14px;height:100%}
      .info{display:flex;flex-direction:column;justify-content:center;min-width:0;gap:7px}
      .top{display:flex;align-items:center;gap:8px;min-width:0}
      .name{font-size:15px;font-weight:800;letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .pill{display:inline-flex;align-items:center;gap:5px;padding:3px 9px 3px 7px;border-radius:99px;font-size:10.5px;font-weight:700;white-space:nowrap;color:var(--tone,var(--accent));background:color-mix(in srgb,var(--tone,var(--accent)) 14%,transparent);border:1px solid color-mix(in srgb,var(--tone,var(--accent)) 30%,transparent)}
      .pill ha-icon{--mdc-icon-size:14px}
      .soc{display:flex;align-items:baseline;gap:10px}
      .soc b{font-size:34px;line-height:1;font-weight:850;letter-spacing:-.02em}
      .soc b small{font-size:16px;font-weight:700;margin-left:1px;color:var(--muted)}
      .soc span{font-size:13px;color:var(--muted);font-weight:650}
      .bar{position:relative;height:9px;border-radius:99px;background:color-mix(in srgb,var(--primary-text-color) 9%,transparent);overflow:visible}
      .fill{position:absolute;inset:0 auto 0 0;width:var(--soc,0%);border-radius:inherit;background:linear-gradient(90deg,color-mix(in srgb,var(--tone) 55%,transparent),var(--tone));box-shadow:0 0 12px color-mix(in srgb,var(--tone) 45%,transparent);transition:width .8s ease}
      .charging .fill{background:linear-gradient(90deg,color-mix(in srgb,var(--good) 40%,transparent),var(--good),color-mix(in srgb,var(--good) 40%,white),var(--good));background-size:220% 100%;animation:flow 2.4s linear infinite}
      .marker{position:absolute;top:-4px;bottom:-4px;left:var(--target);width:2px;border-radius:2px;background:var(--primary-text-color);opacity:.7}
      .marker[hidden]{display:none}
      .line{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--muted);min-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .line ha-icon{--mdc-icon-size:15px;color:var(--tone)}
      .line b{color:var(--primary-text-color);font-weight:750}
      .chips{display:flex;flex-wrap:wrap;gap:5px;justify-content:flex-end;align-content:flex-start}
      .chip{display:inline-flex;align-items:center;gap:4px;padding:3px 7px;border-radius:9px;font-size:10px;font-weight:700;color:var(--primary-text-color);background:color-mix(in srgb,var(--primary-text-color) 6%,transparent);border:1px solid var(--edge)}
      .chip ha-icon{--mdc-icon-size:13px;color:var(--muted)}
      .chip.warn{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 40%,transparent)}.chip.warn ha-icon{color:var(--warn)}
      .chip.ok ha-icon{color:var(--good)}
      .car{position:relative;display:flex;flex-direction:column;justify-content:space-between;min-width:0}
      .car img{display:block;width:100%;max-height:118px;object-fit:contain;object-position:right bottom;margin:auto 0 -6px auto;filter:drop-shadow(0 14px 14px rgba(0,0,0,.45));transition:opacity .4s ease}
      .car img[hidden]{display:none}
      .car ha-icon.fallback{--mdc-icon-size:72px;color:color-mix(in srgb,var(--primary-text-color) 30%,transparent);margin:auto}
      .glow{position:absolute;left:8%;right:0;bottom:-6px;height:26px;border-radius:50%;background:radial-gradient(closest-side,color-mix(in srgb,var(--tone) 55%,transparent),transparent);opacity:.55}
      .charging .glow{animation:breathe 2.8s ease-in-out infinite}
      .stats{grid-column:1/-1;display:grid;grid-template-columns:repeat(var(--n,4),minmax(0,1fr));gap:6px;margin-top:2px}
      .stats[hidden]{display:none}
      .stat{min-width:0;padding:5px 8px;border-radius:11px;background:color-mix(in srgb,var(--primary-text-color) 4.5%,transparent);border:1px solid var(--edge)}
      .stat span{display:block;font-size:9px;font-weight:750;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .stat b{display:block;margin-top:2px;font-size:13px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .stat b small{font-size:10px;font-weight:650;color:var(--muted);margin-left:2px}
      :host([v2]) ha-card{border-radius:18px;border:0;background:radial-gradient(90% 160% at 100% 100%,color-mix(in srgb,var(--tone,var(--accent)) 22%,transparent),transparent 55%),radial-gradient(120% 140% at 0% 0%,color-mix(in srgb,var(--tone,var(--accent)) 12%,transparent),transparent 50%),var(--surface,var(--ha-card-background,var(--card-background-color)));
        box-shadow:var(--dashboard-shadow-strong,var(--ha-card-box-shadow,0 8px 22px rgba(0,0,0,.18))),inset 0 0 0 1px color-mix(in srgb,var(--tone,var(--accent)) 18%,transparent)}
      :host([v2]) ha-card:hover{box-shadow:var(--dashboard-shadow-strong,none),inset 0 0 0 1px color-mix(in srgb,var(--tone,var(--accent)) 40%,transparent),0 0 26px -10px var(--tone,var(--accent))}
      :host([v2]) .name{font-size:16px}
      :host([v2]) .pill{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--tone,var(--accent)) 40%,transparent),0 0 12px -4px var(--tone,var(--accent))}
      :host([v2]) .stat{border:0;background:linear-gradient(160deg,color-mix(in srgb,var(--tone,var(--accent)) 12%,transparent),color-mix(in srgb,var(--primary-text-color) 4%,transparent));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--tone,var(--accent)) 18%,transparent)}
      :host([v2]) .stat b{font-size:13.5px}
      :host([v2]) .chip{border:0;background:color-mix(in srgb,var(--primary-text-color) 7%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--primary-text-color) 12%,transparent)}
      :host([v2]) .chip.ok{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--good) 45%,transparent),0 0 10px -4px var(--good)}
      :host([v2]) .bar{height:10px;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--primary-text-color) 8%,transparent)}
      :host([v2]) .glow{opacity:.8;height:30px}
      .driving .pill{animation:drivePulse 1.6s ease-in-out infinite}.driving .car img{animation:driveSway 2.2s ease-in-out infinite}
      @keyframes drivePulse{50%{box-shadow:0 0 0 1px var(--tone,var(--accent)),0 0 16px -2px var(--tone,var(--accent))}}@keyframes driveSway{50%{transform:translateX(-3px)}}
      @media(prefers-reduced-motion:reduce){.driving .pill,.driving .car img{animation:none}}
      @media(max-width:600px){:host([v2]) .stats{display:none!important}}
      .compact .grid{grid-template-columns:minmax(0,1fr) minmax(0,1.05fr) minmax(90px,24%);gap:4px 12px}
      .compact .stats{grid-column:2;grid-row:1;grid-template-columns:repeat(2,minmax(0,1fr));align-content:center;gap:5px;margin:0}
      .compact .car{grid-column:3;grid-row:1}
      .compact .car img{max-height:84px;margin-bottom:-4px}
      .compact .soc b{font-size:28px}
      .compact .chips{gap:4px}
      .compact .stat{padding:4px 7px}.compact .stat b{font-size:12px}
      @container (max-width:520px){.compact .grid{grid-template-columns:minmax(0,1fr) 34%}.compact .stats{grid-column:1/-1;grid-row:auto;grid-template-columns:repeat(2,minmax(0,1fr))}.compact .car{grid-column:2}.compact .car img{max-height:72px}}
      @keyframes flow{to{background-position:-220% 0}}
      @keyframes breathe{50%{opacity:.95;transform:scaleX(1.05)}}
      @container (max-width:420px){.grid{grid-template-columns:minmax(0,1fr) 36%}.soc b{font-size:28px}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.chips{display:none}}
      @media (prefers-reduced-motion:reduce){*{animation:none!important}}
    </style>
    <ha-card>
      <div class="grid">
        <div class="info">
          <div class="top"><span class="name"></span><span class="pill"><ha-icon></ha-icon><span></span></span></div>
          <div class="soc"><b></b><span class="range"></span></div>
          <div class="bar"><div class="fill"></div><i class="marker" hidden></i></div>
          <div class="line"></div>
        </div>
        <div class="car"><div class="chips"></div><img alt="" hidden><ha-icon class="fallback" icon="mdi:car-electric" hidden></ha-icon><i class="glow"></i></div>
        <div class="stats"></div>
      </div>
    </ha-card>`;
    this.shadowRoot.querySelector("ha-card").addEventListener("click", () => this._tap());
    if (this._hass) this._update();
  }

  _tap() {
    const path = this._config.navigation_path;
    if (path) {
      history.pushState(null, "", path);
      window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
      return;
    }
    const ev = new Event("hass-more-info", { bubbles: true, composed: true });
    ev.detail = { entityId: this._config.battery };
    this.dispatchEvent(ev);
  }

  _update() {
    const root = this.shadowRoot;
    if (!this._hass || !root.querySelector("ha-card")) return;
    const c = this._config;
    const soc = this._num(c.battery);
    const charging = this._isCharging();
    const plugged = ["on", "true", "connected"].includes(String(this._val(c.plugged) || "").toLowerCase());
    const where = this._val(c.location);
    const tone = charging ? "var(--good)" : soc != null && soc < 20 ? "var(--warn)" : "var(--accent)";
    const card = root.querySelector("ha-card");
    card.style.setProperty("--tone", tone);
    card.classList.toggle("charging", charging);
    card.classList.toggle("compact", !!c.compact);

    root.querySelector(".name").textContent = c.name;
    let pillIcon = "mdi:parking", pillText = "Parkeret";
    // The gear (shift_state: P/D/R/N) – the card showed "Parkeret" all through a drive (Claude AI, 2026-10-13).
    const gear = String(this._val(c.shift_state) || "").toUpperCase();
    if (charging) { pillIcon = "mdi:lightning-bolt"; pillText = "Lader"; }
    else if (gear === "D") { pillIcon = "mdi:car-arrow-right"; pillText = "Kører"; }
    else if (gear === "R") { pillIcon = "mdi:car-arrow-left"; pillText = "Bakker"; }
    else if (gear === "N") { pillIcon = "mdi:alpha-n-circle-outline"; pillText = "Neutral"; }
    else if (plugged) { pillIcon = "mdi:power-plug"; pillText = "Tilsluttet"; }
    card.classList.toggle("driving", !charging && ["D", "R", "N"].includes(gear));
    if (!charging && where) pillText += ` · ${where === "home" ? "Hjemme" : where === "not_home" ? "Ude" : where}`;
    root.querySelector(".pill ha-icon").setAttribute("icon", pillIcon);
    root.querySelector(".pill span").textContent = pillText;

    root.querySelector(".soc b").innerHTML = soc == null ? "—" : `${this._fmt(soc)}<small>%</small>`;
    const range = this._num(c.range);
    root.querySelector(".range").textContent = range == null ? "" : `${this._fmt(range)} ${this._unit(c.range) || "km"}`;
    root.querySelector(".fill").style.setProperty("--soc", `${Math.max(0, Math.min(100, soc ?? 0))}%`);
    const target = this._target();
    const marker = root.querySelector(".marker");
    marker.hidden = target == null;
    if (target != null) { marker.style.setProperty("--target", `${Math.max(0, Math.min(100, target))}%`); marker.title = `Mål ${this._fmt(target)} %`; }

    const line = root.querySelector(".line");
    if (charging) {
      const p = this._num(c.charger_power), added = this._num(c.energy_added), fin = this._time(c.charge_finish);
      line.innerHTML = `<ha-icon icon="mdi:ev-station"></ha-icon><b>${esc(this._fmt(p, 1))} kW</b>${added != null ? ` · +${esc(this._fmt(added, 1))} kWh` : ""}${fin ? ` · færdig ${esc(fin)}` : ""}`;
    } else {
      const next = this._time(c.next_charge_start), cost = this._num(c.next_charge_cost);
      if (next) line.innerHTML = `<ha-icon icon="mdi:calendar-clock"></ha-icon>${c.compact ? "Lader" : "Næste ladning"} <b>${esc(next)}</b>${cost != null ? ` · ${esc(this._fmt(cost, 2))} kr` : ""}${target != null && !c.compact ? ` · mål ${esc(this._fmt(target))} %` : ""}`;
      else if (plugged) line.innerHTML = `<ha-icon icon="mdi:power-plug-outline"></ha-icon>Kablet sidder i`;
      else line.innerHTML = "";
    }

    const chips = [];
    const lock = this._val(c.lock);
    if (lock) chips.push(lock === "locked" ? `<span class="chip ok"><ha-icon icon="mdi:lock"></ha-icon>Låst</span>` : `<span class="chip warn"><ha-icon icon="mdi:lock-open-variant"></ha-icon>Ulåst</span>`);
    if (this._val(c.sentry) === "on") chips.push(`<span class="chip ok"><ha-icon icon="mdi:shield-car"></ha-icon>Sentry</span>`);
    const inside = this._num(c.inside_temperature);
    if (inside != null) chips.push(`<span class="chip"><ha-icon icon="mdi:car-seat-heater"></ha-icon>${esc(this._fmt(inside, 0))}°</span>`);
    root.querySelector(".chips").innerHTML = chips.join("");

    const img = root.querySelector(".car img");
    const src = (charging || plugged) && c.image_charging ? c.image_charging : c.image;
    img.hidden = !src;
    if (src && img.getAttribute("src") !== src) img.setAttribute("src", src);
    root.querySelector(".fallback").hidden = !!src;

    const stats = [];
    const stat = (label, id, digits, unitFallback) => {
      const v = this._num(id);
      if (v == null) return;
      stats.push(`<div class="stat"><span>${esc(label)}</span><b>${esc(this._fmt(v, digits))}<small>${esc((this._unit(id) || unitFallback).replace(/^DKK/, "kr"))}</small></b></div>`);
    };
    const today = this._num(c.energy_today), todayCost = this._num(c.cost_today);
    if (today != null) stats.push(`<div class="stat"><span>I dag</span><b>${esc(this._fmt(today, 1))}<small>kWh</small>${todayCost != null ? `<small> · ${esc(this._fmt(todayCost, 0))} kr</small>` : ""}</b></div>`);
    stat("Denne måned", c.energy_month, 0, "kWh");
    stat("Pris pr. km", c.cost_per_km, 2, "kr/km");
    stat("Forbrug", c.efficiency, 0, "Wh/km");
    const box = root.querySelector(".stats");
    box.hidden = !stats.length;
    box.style.setProperty("--n", String(Math.max(stats.length, 1)));
    box.innerHTML = stats.join("");
  }
}

if (!customElements.get("ha-tesla-glance-card")) customElements.define("ha-tesla-glance-card", HATeslaGlanceCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "ha-tesla-glance-card", name: "HA Tesla Glance Card", description: "Lille forsidekort med batteri, rækkevidde, opladning og forbrug", preview: true });
console.info(`%c HA TESLA GLANCE %c v${VERSION} `, "color:white;background:#cc0000;font-weight:700", "color:#ffb4b4;background:#111827");
