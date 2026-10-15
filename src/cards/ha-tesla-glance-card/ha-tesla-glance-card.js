// HA Tesla Glance Card – lille forsidekort med batteri, rækkevidde, opladning og forbrug.
// Kun visning: ingen styring af bilen. Et tryk åbner bilens egen side (navigation_path)
// eller more-info på batteriet.
// 0.1.0 – første version.
// 0.1.1 – compact: true lægger tallene 2×2 ved siden af batteriet (lavere kort).
// 0.1.2 – smal kompakt (mobil): tallene 2×2 under batteriet, så intet klippes.
// 0.1.3 – v2-udseende (style_entity / style: v2), som forsidens nye fliser (Claude AI).

import { isNewLook, lookFormSchema, LOOK_LABELS } from "../../shared/look.js";
import { CTL_CSS, ctlParts, ctlTips, ctlTrack } from "../../shared/charge-timeline.js";

const VERSION = "0.8.0";

const DEAD = new Set(["unavailable", "unknown", "none", ""]);
const CHARGING = new Set(["charging", "on", "true", "starting"]);

const DEFAULTS = {
  name: "Tesla",
  compact: false,
  image: "",
  image_charging: "",
  image_driving: "",
  image_driving_wheels: null,
  navigation_path: "",
  battery: "sensor.tesla_battery_level",
  range: "sensor.tesla_battery_range",
  charging: "sensor.tesla_charging",
  charger_power: "sensor.tesla_charger_power",
  energy_added: "sensor.tesla_charge_energy_added",
  charge_finish: "",
  away_charger_power: "",
  away_energy_added: "",
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
        { name: "image_driving", selector: { text: {} } },
        { name: "compact", selector: { boolean: {} } },
        ...lookFormSchema(),
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
      computeLabel: (s) => ({ ...LOOK_LABELS,
        name: "Navn", compact: "Kompakt (tal ved siden af batteriet)", navigation_path: "Side ved tryk", image: "Billede (parkeret)", image_charging: "Billede (lader)", image_driving: "Billede (kører)",
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
    if (this._popupCard) this._popupCard.hass = hass;
    const ids = Object.keys(DEFAULTS).filter((k) => !["name", "compact", "image", "image_charging", "image_driving", "image_driving_wheels", "navigation_path"].includes(k)).map((k) => this._config[k]).filter(Boolean);
    const sv = this._config.style_entity ? hass.states[this._config.style_entity]?.state : "";
    const cp = this._config.charge_plan || {}; const planSig = [...Object.values(cp), this._waitId()].filter((v) => typeof v === "string" && v.includes(".")).map((id) => `${hass.states[id]?.state}|${hass.states[id]?.last_updated}`).join(";");
    const sig = ids.map((id) => { const s = hass.states[id]; return s ? `${s.state}|${s.attributes?.unit_of_measurement || ""}` : "-"; }).join(";") + `|${sv}|${planSig}`;
    if (sig === this._sig) return;
    this._sig = sig;
    // v2 look (Claude AI, 2026-10-13): follows `style_entity` (on = new) or `style: v2`, like the front page's tiles.
    this.toggleAttribute("v2", isNewLook(hass, this._config));
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
    const p = this._num(this._pw());
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
      .name{flex:none;max-width:60%;font-size:15px;font-weight:800;letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .pill{display:inline-flex;align-items:center;gap:5px;min-width:0;overflow:hidden;padding:3px 9px 3px 7px;border-radius:99px;font-size:10.5px;font-weight:700;white-space:nowrap;color:var(--tone,var(--accent));background:color-mix(in srgb,var(--tone,var(--accent)) 14%,transparent);border:1px solid color-mix(in srgb,var(--tone,var(--accent)) 30%,transparent)}
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
      .chips{display:flex;flex-wrap:nowrap;gap:5px;justify-content:flex-end;align-content:flex-start;flex:none}
      .chip{flex:none;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;padding:3px 7px;border-radius:9px;font-size:10px;font-weight:700;color:var(--primary-text-color);background:color-mix(in srgb,var(--primary-text-color) 6%,transparent);border:1px solid var(--edge)}
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
      /* The car's name keeps its room; a long place in the status pill is cut instead (Claude AI, 2026-10-14). */
      .pill>span{min-width:0;overflow:hidden;text-overflow:ellipsis}
      :host([v2]) .pill{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--tone,var(--accent)) 40%,transparent),0 0 12px -4px var(--tone,var(--accent))}
      :host([v2]) .stat{border:0;background:linear-gradient(160deg,color-mix(in srgb,var(--tone,var(--accent)) 12%,transparent),color-mix(in srgb,var(--primary-text-color) 4%,transparent));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--tone,var(--accent)) 18%,transparent)}
      :host([v2]) .stat b{font-size:13.5px}
      :host([v2]) .chip{border:0;background:color-mix(in srgb,var(--primary-text-color) 7%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--primary-text-color) 12%,transparent)}
      :host([v2]) .chip.ok{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--good) 45%,transparent),0 0 10px -4px var(--good)}
      :host([v2]) .bar{height:10px;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--primary-text-color) 8%,transparent)}
      :host([v2]) .glow{opacity:.8;height:30px}
      /* V2 (Claude AI, 2026-10-13; user: "design om til en V2 … der matcher min forside … bil billeder der skifter"). */
      .vchip,.fx{display:none}
      :host([v2]) .vchip{display:grid;place-items:center;flex:none;width:30px;height:30px;border-radius:10px;color:var(--tone,var(--accent));background:linear-gradient(160deg,color-mix(in srgb,var(--tone,var(--accent)) 30%,transparent),color-mix(in srgb,var(--tone,var(--accent)) 10%,transparent));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--tone,var(--accent)) 38%,transparent),0 6px 16px -8px var(--tone,var(--accent))}
      :host([v2]) .vchip ha-icon{--mdc-icon-size:18px;filter:drop-shadow(0 0 6px color-mix(in srgb,var(--tone,var(--accent)) 55%,transparent))}
      :host([v2]) .soc b{font-size:32px}
      :host([v2]) .car img{transition:opacity .26s ease,transform .26s ease}:host([v2]) .car img.swap{opacity:0;transform:translateX(10px) scale(.97)}
      :host([v2]) .compact .car img{max-height:98px}
      :host([v2]) .parked .car img{animation:carFloat 6s ease-in-out infinite}@keyframes carFloat{50%{transform:translateY(-3px)}}
      :host([v2]) .fx{display:block;position:absolute;inset:0;pointer-events:none;overflow:hidden;border-radius:12px}
      :host([v2]) .fx i{position:absolute;opacity:0}
      :host([v2]) .driving .fx .ln{opacity:1;left:0;height:2px;border-radius:2px;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--tone,var(--accent)) 70%,#fff),transparent);animation:speed 0.9s linear infinite}
      :host([v2]) .fx .l1{top:38%;width:46%}:host([v2]) .fx .l2{top:58%;width:30%;animation-delay:-.35s!important}:host([v2]) .fx .l3{top:76%;width:54%;animation-delay:-.6s!important}
      @keyframes speed{from{transform:translateX(160%)}to{transform:translateX(-120%)}}
      :host([v2]) .charging .fx .sp{opacity:1;bottom:18%;width:7px;height:7px;border-radius:50%;background:var(--good);box-shadow:0 0 10px 2px var(--good);animation:spark 2.4s ease-out infinite}
      :host([v2]) .fx .s1{left:28%}:host([v2]) .fx .s2{left:52%;animation-delay:-.8s!important}:host([v2]) .fx .s3{left:74%;animation-delay:-1.6s!important}
      @keyframes spark{0%{transform:translateY(0) scale(.6);opacity:0}25%{opacity:1}100%{transform:translateY(-60px) scale(.2);opacity:0}}
      :host([v2]) .charging .glow{background:radial-gradient(closest-side,color-mix(in srgb,var(--good) 70%,transparent),transparent);opacity:.95}
      :host([v2]) .driving .glow{animation:roadGlow 1.2s ease-in-out infinite}@keyframes roadGlow{50%{opacity:.4;transform:scaleX(.9)}}
      @media(max-width:600px){:host([v2]) .vchip{display:none}:host([v2]) .pill{font-size:10px;padding:2px 8px 2px 6px}:host([v2]) .name{flex:none}}
      :host([v2]) .has-plan .car{margin-right:6px}
      @media (prefers-reduced-motion:reduce){:host([v2]) .fx i,:host([v2]) .parked .car img{animation:none!important}}
      .wheels{position:absolute;inset:0;pointer-events:none;z-index:1}.wheels[hidden]{display:none}
      .wh{position:absolute;border-radius:50%;overflow:hidden;-webkit-mask-image:radial-gradient(closest-side,#000 80%,transparent 97%);mask-image:radial-gradient(closest-side,#000 80%,transparent 97%)}.wh i{position:absolute;inset:0;display:block}
      .w2{animation:wheelSpin .55s linear infinite}.w2.rev{animation-direction:reverse;animation-duration:1.1s}
      @keyframes wheelSpin{to{transform:rotate(-360deg)}}
      .has-wheels .car img,.driving.has-wheels .car img,.car.has-wheels img{animation:none!important}
      @media (prefers-reduced-motion:reduce){.w2{animation:none}}
      .driving .pill{animation:drivePulse 1.6s ease-in-out infinite}.driving .car img{animation:driveSway 2.2s ease-in-out infinite}
      @keyframes drivePulse{50%{box-shadow:0 0 0 1px var(--tone,var(--accent)),0 0 16px -2px var(--tone,var(--accent))}}@keyframes driveSway{50%{transform:translateX(-3px)}}
      @media(prefers-reduced-motion:reduce){.driving .pill,.driving .car img{animation:none}}
      @media(max-width:600px){:host([v2]) .stats{display:none!important}}
      /* Charge plan overlay: the car fades back, the plan lies on top; dots on the right show which view is up. */
      .grid{transition:opacity .45s ease,filter .45s ease,transform .45s cubic-bezier(.16,1,.3,1)}
      ha-card.has-plan{touch-action:pan-y;user-select:none;-webkit-user-select:none}ha-card.dragging .grid,ha-card.dragging .plan{transition:none;animation:none}
      .show-plan .grid{opacity:.12;filter:blur(2px) saturate(.6);transform:scale(.97) translateY(-6px);pointer-events:none}
      .plan{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;justify-content:center;gap:8px;padding:10px 34px 10px 14px;opacity:0;transform:translateY(10px);pointer-events:none;transition:opacity .45s ease,transform .45s cubic-bezier(.16,1,.3,1);--ev:var(--dashboard-ev,#b7a4ff)}
      .show-plan .plan{opacity:1;transform:none;pointer-events:auto}
      .plan.is-charge{--ev:var(--good)}
      .pic.chg{background:color-mix(in srgb,var(--good) 20%,transparent);color:var(--good);box-shadow:0 0 18px -4px var(--good)}.pic.chg ha-icon{animation:boltPulse 1.4s ease-in-out infinite}
      @keyframes boltPulse{50%{transform:scale(1.18);filter:drop-shadow(0 0 6px var(--good))}}
      .pt .kw{color:var(--good)}.psoc{margin-left:10px;font-size:26px;font-weight:850;line-height:1}.psoc small{font-size:13px;color:var(--muted)}
      .pbar.live i{background:linear-gradient(90deg,color-mix(in srgb,var(--ev) 40%,transparent),var(--ev),color-mix(in srgb,var(--ev) 40%,white),var(--ev));background-size:220% 100%;animation:flow 2.4s linear infinite}
      .grid{transform-origin:50% 0}
      ha-card:not(.show-plan) .plan{transform:translateY(-14px)}
      ha-card.has-plan:not(.show-plan) .grid{animation:slideIn .5s cubic-bezier(.16,1,.3,1)}
      ha-card.show-plan .plan{animation:slideUp .5s cubic-bezier(.16,1,.3,1)}
      @keyframes slideIn{from{transform:translateY(16px);opacity:.2}}@keyframes slideUp{from{transform:translateY(16px);opacity:0}}
      .ph{display:flex;align-items:center;gap:10px;min-width:0}
      .pic{position:relative;flex:none;width:36px;height:36px;border-radius:12px;display:grid;place-items:center;color:var(--ev);background:color-mix(in srgb,var(--ev) 18%,transparent)}.pic ha-icon{--mdc-icon-size:20px}
      .pic em{position:absolute;right:-4px;top:-4px;width:16px;height:16px;border-radius:50%;display:grid;place-items:center;background:var(--ev);color:#141018;animation:pz 2s ease-in-out infinite}.pic em ha-icon{--mdc-icon-size:11px}
      @keyframes pz{50%{transform:scale(1.15);box-shadow:0 0 12px var(--ev)}}
      .pt{min-width:0}.pt b{display:block;font-size:14px;font-weight:800}.pt span{display:block;font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .pbar{position:relative;height:7px;border-radius:7px;background:color-mix(in srgb,var(--primary-text-color) 9%,transparent);overflow:hidden}
      .pbar i{position:absolute;left:0;top:0;bottom:0;border-radius:7px;background:var(--ev)}
      .pbar u{position:absolute;top:0;bottom:0;background:repeating-linear-gradient(90deg,color-mix(in srgb,var(--ev) 55%,transparent) 0 6px,transparent 6px 10px);animation:fl 1.2s linear infinite}@keyframes fl{to{background-position:10px 0}}
      .plan>*{flex-shrink:0}.pmeta{margin-left:auto;text-align:right;font-size:11px;line-height:1.35;color:var(--muted);white-space:nowrap}
      .pstats{display:grid;grid-template-columns:repeat(auto-fit,minmax(70px,1fr));gap:6px}
      .ps{padding:4px 8px;border-radius:10px;background:color-mix(in srgb,var(--ev) 10%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ev) 22%,transparent)}
      .ps span{display:block;font-size:9px;font-weight:750;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ps b{display:block;font-size:13px;font-weight:800;white-space:nowrap}.ps b small{font-size:10px;color:var(--muted)}.ps.g b{color:var(--good)}
      .ph{gap:11px}
      .ring{position:relative;flex:none;width:44px;height:44px;border-radius:50%;padding:3px;
        background:conic-gradient(var(--ev) calc(var(--s) * 1%),color-mix(in srgb,var(--ev) 32%,transparent) 0 calc(var(--t) * 1%),color-mix(in srgb,var(--primary-text-color) 10%,transparent) 0);
        box-shadow:0 0 18px -6px var(--ev)}
      .ring .core{display:grid;place-items:center;width:100%;height:100%;border-radius:50%;color:color-mix(in srgb,var(--ev) 85%,#fff);
        background:radial-gradient(circle at 30% 25%,rgba(255,255,255,.14),transparent 55%),linear-gradient(160deg,#1d1f2b,#121319);box-shadow:inset 0 1px 0 rgba(255,255,255,.12),inset 0 -6px 12px rgba(0,0,0,.35)}
      .ring .core ha-icon{--mdc-icon-size:19px;filter:drop-shadow(0 0 6px color-mix(in srgb,var(--ev) 60%,transparent))}.pstart{margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;line-height:1.1}.pstart small{font-size:9.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}.pstart b{font-size:24px;font-weight:850;color:var(--ev);text-shadow:0 0 16px color-mix(in srgb,var(--ev) 55%,transparent)}.pstart em{font-style:normal;font-size:10.5px;color:var(--muted)}
      .tl{position:relative;padding:2px 0 12px}.track{position:relative;height:10px;border-radius:6px;background:color-mix(in srgb,var(--primary-text-color) 8%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--primary-text-color) 6%,transparent)}
      .tb{position:absolute;top:0;bottom:0;border-radius:6px;background:linear-gradient(180deg,color-mix(in srgb,var(--ev) 95%,#fff),var(--ev));box-shadow:0 0 12px -1px var(--ev)}
      .nowdot{position:absolute;left:0;top:50%;width:12px;height:12px;margin:-6px 0 0 -2px;border-radius:50%;background:#fff;box-shadow:0 0 0 3px color-mix(in srgb,var(--ev) 45%,transparent);animation:nowPing 2s ease-out infinite}
      @keyframes nowPing{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--ev) 70%,transparent)}80%,100%{box-shadow:0 0 0 9px transparent}}
      .flag{position:absolute;top:-5px;bottom:-5px;width:2px;margin-left:-1px;border-radius:2px;background:var(--good);box-shadow:0 0 8px var(--good)}
      .tticks{position:absolute;left:0;right:0;bottom:-2px;height:12px}.tt{position:absolute;transform:translateX(-50%);font-size:9.5px;color:var(--muted);white-space:nowrap}.tt[style*="left:0"]{transform:none}.tt.end{transform:translateX(-100%);color:var(--good);font-weight:700}
      ${CTL_CSS}
      .plan .ctl-tl{--ctl-ev:var(--ev);--ctl-muted:var(--muted);--ctl-good:var(--good);--ctl-warn:var(--warn);--ctl-text:var(--primary-text-color)}
      .tx{position:absolute;top:2px;bottom:2px;border-radius:4px;background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--warn) 32%,transparent) 0 3px,transparent 3px 6px)}
      .pnums.has-btn{flex-wrap:nowrap}.pnums.has-btn>span{white-space:nowrap}.pnums .held{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;color:color-mix(in srgb,var(--warn) 80%,var(--primary-text-color))}.pnums .held b{color:var(--warn)}
      @container (max-width:640px){.pnums.has-btn .save{display:none}}
      .pnums.has-btn .save{margin-left:0}.pnow{margin-left:auto;flex:none;white-space:nowrap;font:inherit;font-size:12px;font-weight:800;padding:5px 12px;border-radius:999px;border:0;cursor:pointer;color:#141018;background:var(--ev);box-shadow:0 0 14px -4px var(--ev)}
      .tb.dear{background:linear-gradient(180deg,color-mix(in srgb,#ff6a3d 92%,#fff),#ff6a3d);box-shadow:0 0 12px -1px #ff6a3d}
      .pnow.wait{background:color-mix(in srgb,var(--warn) 85%,#fff);box-shadow:0 0 14px -4px var(--warn)}
      .pnow.armed{background:var(--warn);box-shadow:0 0 0 2px color-mix(in srgb,var(--warn) 45%,transparent)}
      .pnums{display:flex;flex-wrap:wrap;align-items:center;gap:6px 16px;font-size:11px;color:var(--muted)}.pnums b{font-size:14px;font-weight:800;color:var(--primary-text-color)}
      .pnums .save{margin-left:auto;display:inline-flex;align-items:center;gap:5px;padding:3px 10px 3px 7px;border-radius:999px;color:var(--good);background:color-mix(in srgb,var(--good) 14%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--good) 40%,transparent),0 0 14px -5px var(--good)}.pnums .save b{color:var(--good)}.pnums .save ha-icon{--mdc-icon-size:15px}
      .cg{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:14px;align-items:center;height:100%}
      .batt{position:relative;height:62px;border-radius:14px;padding:4px;background:color-mix(in srgb,var(--primary-text-color) 7%,transparent);box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--primary-text-color) 16%,transparent)}
      .batt::after{content:"";position:absolute;right:-7px;top:50%;width:5px;height:22px;margin-top:-11px;border-radius:0 4px 4px 0;background:color-mix(in srgb,var(--primary-text-color) 22%,transparent)}
      .bfill{position:relative;height:100%;border-radius:10px;overflow:hidden;background:linear-gradient(90deg,color-mix(in srgb,var(--good) 55%,transparent),var(--good));box-shadow:0 0 22px -4px var(--good);transition:width 1s ease}
      .bfill .flow{position:absolute;inset:0;background:repeating-linear-gradient(110deg,transparent 0 14px,rgba(255,255,255,.28) 14px 22px);animation:flowIn 1.1s linear infinite}@keyframes flowIn{from{background-position:-44px 0}to{background-position:0 0}}
      .btarget{position:absolute;top:-4px;bottom:-4px;width:2px;margin-left:-1px;background:#fff;opacity:.7;border-radius:2px}
      .bsoc{position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:28px;font-weight:850;color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.5)}.bsoc small{font-size:14px;opacity:.85}
      .bbolt{position:absolute;right:14px;top:50%;transform:translateY(-50%);--mdc-icon-size:26px;color:#fff;filter:drop-shadow(0 0 8px var(--good));animation:boltPulse 1.4s ease-in-out infinite}
      .ckw{display:flex;align-items:baseline;gap:5px;flex-wrap:wrap}.ckw b{font-size:28px;font-weight:850;color:var(--good);text-shadow:0 0 18px color-mix(in srgb,var(--good) 55%,transparent);animation:kwPulse 2.2s ease-in-out infinite}.ckw small{font-size:13px;color:var(--muted)}.ckw span{margin-left:6px;font-size:11px;color:var(--muted)}
      @keyframes kwPulse{50%{opacity:.75}}
      .cnums{display:flex;flex-wrap:wrap;gap:3px 14px;margin-top:4px;font-size:11.5px;color:var(--muted)}.cnums b{color:var(--primary-text-color)}.cnums .save b{color:var(--good)}
      
      @media(max-width:600px){.pstart b{font-size:19px}.pnums{flex-wrap:nowrap;gap:9px;font-size:10px}.pnums b{font-size:12.5px}.pnums span{white-space:nowrap}.pnums .save{margin-left:auto;padding:3px 8px 3px 6px}.pnums .save ha-icon{display:none}.ring{width:38px;height:38px}.pt b{font-size:13px}.pt span{font-size:10px}}
      @media (prefers-reduced-motion:reduce){.nowdot,.bfill .flow,.bbolt,.ckw b{animation:none}}
      .pt b .kw{display:inline;font-size:inherit;color:var(--good)}
      .plan.is-charge .pstart b{color:var(--good);text-shadow:0 0 16px color-mix(in srgb,var(--good) 55%,transparent)}
      .ring.chg{--ev:var(--good)}.ring.chg .core ha-icon{animation:boltPulse 1.4s ease-in-out infinite}
      .cbar{position:relative;height:12px;border-radius:7px;background:color-mix(in srgb,var(--primary-text-color) 8%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--primary-text-color) 6%,transparent)}
      .cfill{position:relative;height:100%;border-radius:7px;overflow:hidden;background:linear-gradient(90deg,color-mix(in srgb,var(--good) 55%,transparent),var(--good));box-shadow:0 0 14px -2px var(--good);transition:width 1s ease}
      .cfill i{position:absolute;inset:0;background:repeating-linear-gradient(110deg,transparent 0 10px,rgba(255,255,255,.3) 10px 16px);animation:flowIn 1.1s linear infinite}
      .ctg{position:absolute;top:-4px;bottom:-4px;width:2px;margin-left:-1px;border-radius:2px;background:#fff;opacity:.75}
      .dots{position:absolute;right:11px;top:50%;z-index:4;display:flex;flex-direction:column;gap:6px;transform:translateY(-50%)}.dots[hidden]{display:none}
      .dots i{width:7px;height:7px;border-radius:50%;background:color-mix(in srgb,var(--primary-text-color) 28%,transparent);cursor:pointer;transition:height .3s,background .3s}.dots i.on{height:18px;border-radius:4px;background:var(--dashboard-ev,#b7a4ff)}
      .has-plan .grid{padding-right:18px}
      .compact .grid{grid-template-columns:minmax(0,1fr) minmax(0,1.05fr) minmax(90px,24%);gap:4px 12px}
      .compact .stats{grid-column:2;grid-row:1;grid-template-columns:repeat(2,minmax(0,1fr));align-content:center;gap:5px;margin:0}
      .compact .car{grid-column:3;grid-row:1}
      .compact .car img{max-height:84px;margin-bottom:-4px}
      .compact .soc b{font-size:28px}
      .compact .chips{gap:4px}
      /* One row always (user, 2026-10-14: the card must not grow when Sentry comes on); a bit smaller on phones. */
      @media(max-width:600px){.chips{gap:4px}.chip{padding:3px 6px;gap:3px}}
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
          <div class="top"><span class="vchip"><ha-icon icon="mdi:car-electric"></ha-icon></span><span class="name"></span><span class="pill"><ha-icon></ha-icon><span></span></span></div>
          <div class="soc"><b></b><span class="range"></span></div>
          <div class="bar"><div class="fill"></div><i class="marker" hidden></i></div>
          <div class="line"></div>
        </div>
        <div class="car"><div class="chips"></div><div class="fx" aria-hidden="true"><i class="ln l1"></i><i class="ln l2"></i><i class="ln l3"></i><i class="sp s1"></i><i class="sp s2"></i><i class="sp s3"></i></div><img alt="" hidden><ha-icon class="fallback" icon="mdi:car-electric" hidden></ha-icon><i class="glow"></i></div>
        <div class="stats"></div>
      </div>
      <div class="plan" aria-hidden="true"></div>
      <div class="dots" hidden><i data-v="plan" title="Ladeplan"></i><i data-v="car" title="Bilen"></i></div>
    </ha-card>`;
    const hc = this.shadowRoot.querySelector("ha-card");
    ctlTips(this.shadowRoot, () => hc);
    hc.addEventListener("click", (e) => { if (this._swiped) { this._swiped = false; return; } const d = e.target.closest("[data-v]"); if (d) { e.stopPropagation(); this._setView(d.dataset.v); return; } const w = e.target.closest("[data-pwait]"); if (w) { e.stopPropagation(); this._chooseWait(w.dataset.pwait === "on"); return; } this._tap(); });
    // Switching between the overlay and the car (user, 2026-10-13: "swipe virker ikke så godt på PC og mobilen får hele siden
    // til at følge med"): a sideways drag on touch – the page keeps its vertical scrolling – and any drag with a mouse; the
    // card follows the finger/pointer and snaps over past 40 px. The wheel/touchpad adds up its deltas.
    hc.addEventListener("pointerdown", (e) => {
      if (!this._planOn || (e.pointerType === "mouse" && e.button !== 0)) return;
      this._drag = { x: e.clientX, y: e.clientY, id: e.pointerId, type: e.pointerType, axis: null, d: 0 };
    });
    hc.addEventListener("pointermove", (e) => {
      const g = this._drag; if (!g || g.id !== e.pointerId) return;
      const dx = e.clientX - g.x; const dy = e.clientY - g.y;
      if (!g.axis) { if (Math.hypot(dx, dy) < 8) return; g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y"; if (g.type !== "mouse" && g.axis === "y") { this._drag = null; return; } try { hc.setPointerCapture(e.pointerId); } catch { /* gone */ } }
      g.d = g.axis === "x" ? dx : dy; this._dragPaint(g.d, g.axis);
    });
    const end = (e) => { const g = this._drag; if (!g || g.id !== e.pointerId) return; this._drag = null; this._dragPaint(0); if (g.axis && Math.abs(g.d) > 40) { this._swiped = true; this._setView(this._view === "plan" ? "car" : "plan"); } else if (g.axis) this._swiped = true; };
    hc.addEventListener("pointerup", end); hc.addEventListener("pointercancel", end);
    hc.addEventListener("wheel", (e) => {
      if (!this._planOn) return; e.preventDefault();
      clearTimeout(this._wheelT); this._wheelT = setTimeout(() => { this._wacc = 0; }, 250);
      if (Date.now() - (this._wheelAt || 0) < 650) return;
      this._wacc = (this._wacc || 0) + (Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX);
      if (Math.abs(this._wacc) > 60) { this._wheelAt = Date.now(); this._wacc = 0; this._setView(this._view === "plan" ? "car" : "plan"); }
    }, { passive: false });
    if (this._hass) this._update();
  }

  // Away from home the car's own charge sensors (away_*) tell the story; at home the home charger's (user, 2026-10-13).
  _away() { const w = this._val(this._config.location); return !!w && w !== "home"; }
  _pw() { return this._away() && this._config.away_charger_power ? this._config.away_charger_power : this._config.charger_power; }
  _added() { return this._away() && this._config.away_energy_added ? this._config.away_energy_added : this._config.energy_added; }
  _setView(v) { this._view = v; this._paintView(); }
  // The visible layer follows a drag (dampened), the other one fades in behind it.
  _dragPaint(d, axis = "x") {
    const r = this.shadowRoot; const top = r.querySelector(this._view === "plan" ? ".plan" : ".grid"); if (!top) return;
    const hc = r.querySelector("ha-card"); hc.classList.toggle("dragging", !!d);
    if (!d) { top.style.transform = ""; top.style.opacity = ""; return; }
    const m = Math.max(-140, Math.min(140, d * 0.6)); top.style.transform = axis === "x" ? `translateX(${m}px)` : `translateY(${m}px)`; top.style.opacity = String(Math.max(0.25, 1 - Math.abs(m) / 180));
  }
  _paintView() {
    const hc = this.shadowRoot.querySelector("ha-card"); if (!hc) return;
    const show = this._planOn && this._view === "plan";
    hc.classList.toggle("show-plan", show); hc.classList.toggle("has-plan", !!this._planOn);
    this.shadowRoot.querySelector(".plan").setAttribute("aria-hidden", String(!show));
    const dots = this.shadowRoot.querySelector(".dots"); dots.hidden = !this._planOn;
    dots.querySelectorAll("i").forEach((i) => i.classList.toggle("on", i.dataset.v === (show ? "plan" : "car")));
  }
  // The charge plan (charge_plan: the same keys as the price card's charge), active when the cable is in at home and
  // EV Ledger has a plan with blocks ahead – the price card's own rule.
  _plan() {
    const c = this._config.charge_plan; if (!c || !this._hass) return null; const st = (id) => (id ? this._hass.states[id]?.state : undefined);
    const plan = this._hass.states[c.plan]; const now = Date.now();
    const blocks = (plan?.attributes?.blocks || []).map((b) => ({ t: Date.parse(b.start), e: Date.parse(b.end), kwh: b.kwh, cost: b.cost })).filter((b) => b.e > now);
    const mode = st(c.mode) || plan?.attributes?.mode; const cm = st(c.charger_mode);
    // An unknown cable sensor (Tesla Fleet after a restart) leaves it to the card's own plug sensor (Claude AI, 2026-10-15).
    const cs = st(c.cable); const plugAlt = ["on", "true", "connected"].includes(String(this._val(this._config.plugged) || "").toLowerCase());
    const cable = cs === "on" || (cs !== "off" && plugAlt);
    const plugged = cable && (!c.tracker || st(c.tracker) === "home") && (!c.charger_mode || (cm && !["disconnected", "unavailable", "unknown"].includes(cm)));
    // EV Ledger's price limit on Cheapest: what it holds back above the limit, and the prices to show where (2026-10-15).
    const pa = plan?.attributes || {}; const lp = pa.price_limit == null ? NaN : Number(pa.price_limit); const above = Number(pa.above_limit_kwh) || 0;
    const ws = this._hass.states[this._waitId()];
    const limit = mode === "smart" && Number.isFinite(lp) ? { price: lp, above, reach: pa.limit_soc == null ? NaN : Number(pa.limit_soc), floor: Number(pa.price_limit_floor),
      wait: ws?.state === "on", canWait: !!ws && ws.state !== "unavailable", overCost: Number(pa.above_limit_cost),
      ask: pa.limit_ask == null ? true : pa.limit_ask === true, saving: Number(pa.limit_saving),
      cheaper: (Array.isArray(pa.limit_cheaper) ? pa.limit_cheaper : []).map((w) => ({ ...w, t: Date.parse(w.start) })).filter((w) => Number.isFinite(w.t)),
      slots: (Array.isArray(pa.prices) ? pa.prices : []).map((x) => ({ t: Date.parse(x?.t), p: Number(x?.p) })).filter((x) => Number.isFinite(x.t) && Number.isFinite(x.p)), minutes: Number(pa.slot_minutes) || 15 } : null;
    if (!(plugged && mode && !["off", "manual"].includes(mode) && (blocks.length || (limit && above >= 0.5)))) return null;
    const n = (id) => { const v = Number.parseFloat(st(id)); return Number.isFinite(v) ? v : NaN; };
    const kwh = Number.isFinite(n(c.energy)) ? n(c.energy) : blocks.reduce((a, b) => a + (b.kwh || 0), 0);
    const cost = Number.isFinite(n(c.cost)) ? n(c.cost) : blocks.reduce((a, b) => a + (b.cost || 0), 0);
    const alt = this._hass.states[c.cost]?.attributes?.alternatives || {}; const nowCost = Number(alt.now?.cost);
    const soc = Number.isFinite(n(c.soc)) ? n(c.soc) : this._num(this._config.battery) ?? NaN;
    const prices = (Array.isArray(pa.prices) ? pa.prices : []).map((x) => ({ t: Date.parse(x?.t), p: Number(x?.p) })).filter((x) => Number.isFinite(x.t) && Number.isFinite(x.p));
    return { blocks, mode, kwh, cost, save: Number.isFinite(nowCost) && blocks.length ? nowCost - cost : NaN, nowCost, nowKwh: Number(alt.now?.energy_kwh), limit, prices, minutes: Number(pa.slot_minutes) || 15,
      soc, target: n(c.target), deadline: pa.deadline, charging: st(c.charging) === "on" || cm === "charging", name: c.name || this._config.name };
  }
  // Plan and charging overlays, v2 (Claude AI, 2026-10-13; user: "arbejd videre på ladeplan og ladning så det bliver endnu federe").
  _planHtml(p) {
    const MODE = { smart: "Smart", fixed: "Fast tid", now: "Lad nu", price_cap: "Prisloft" };
    const hm = (t) => new Date(t).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
    const now = Date.now(); const soc = Number.isFinite(p.soc) ? p.soc : 0; const tg = Number.isFinite(p.target) ? p.target : 100;
    const first = p.blocks[0]; const avg = p.kwh ? p.cost / p.kwh : NaN; const running = !!first && first.t <= now;
    const dlT = p.deadline ? Date.parse(p.deadline) : Math.max(now + 3600000, ...p.blocks.map((b) => b.e));
    const end = Math.max(dlT, ...p.blocks.map((b) => b.e)); const span = Math.max(end - now, 3600000);
    const X = (t) => Math.max(0, Math.min(100, ((t - now) / span) * 100));
    const left = first ? Math.max(0, first.t - now) : 0; const lh = Math.floor(left / 3600000); const lm = Math.round((left % 3600000) / 60000);
    const until = !first ? "over grænsen" : running ? "lader nu" : lh ? `om ${lh} t ${lm} min` : `om ${lm} min`;
    // The hours the price limit skips: faint stripes behind the charging blocks (Claude AI, 2026-10-15).
    // Above the price limit (EV Ledger 0.8): waiting = the plan stops at the limit and the skipped hours are striped;
    // otherwise the plan charges to the target and its blocks above the limit are warm.
    const L = p.limit; const over = !!L && L.above >= 0.5 && (L.ask || L.wait); const held = over && L.wait; const runs = [];
    if (held) for (const x of L.slots) { const xe = x.t + L.minutes * 60000; if (xe <= now || x.t >= end || x.p <= L.price) continue; const last = runs[runs.length - 1]; if (last && x.t - last.e < 60000) last.e = xe; else runs.push({ t: Math.max(x.t, now), e: xe }); }
    const stripes = runs.map((b) => `<i class="tx" style="left:${X(b.t).toFixed(2)}%;width:${Math.max(0.6, X(b.e) - X(b.t)).toFixed(2)}%"></i>`).join("");
    // The whole course on the shared timeline: charging periods, the pauses between them, the wait before and the time
    // after, each with a tooltip (Claude AI, 2026-10-16; user: "vise hele forløbet, så den viser pauserne og … hover").
    const parts = ctlParts({ now, blocks: p.blocks, deadline: p.deadline ? dlT : NaN, prices: p.prices, minutes: p.minutes });
    const best = held ? L.cheaper.reduce((m, w) => (!m || Number(w.saving) > Number(m.saving) ? w : m), null) : null;
    const later = best ? `${new Date(best.t).toLocaleDateString("da-DK", { weekday: "short" }).replace(".", "")} ${hm(best.t)}` : "";
    const track = ctlTrack(parts, { now, end, X, deadline: p.deadline ? dlT : NaN, unit: "kr", extra: stripes,
      held: held && Number.isFinite(L.reach) ? { reach: L.reach, later } : null,
      dear: (part) => over && !held && part.kwh > 0 && part.cost / part.kwh > L.price + 1e-6 });
    // The icon is a ring: battery now (solid) to the target (faint), the plan's clock inside (Claude AI, 2026-10-13).
    return `<div class="ph"><span class="ring" style="--s:${Math.max(0, Math.min(100, soc))};--t:${Math.max(0, Math.min(100, tg))}"><span class="core"><ha-icon icon="mdi:clock-outline"></ha-icon></span></span>
        <div class="pt"><b>Ladeplan · ${esc(MODE[p.mode] || p.mode)}</b><span>${esc(p.name)} · ${Math.round(soc)} % → ${held && Number.isFinite(L.reach) && p.blocks.length ? `${Math.round(L.reach)} % · mål ${Math.round(tg)} %` : `${Math.round(tg)} %`}</span></div>
        <div class="pstart"><small>${!first ? "Venter" : running ? "I gang" : "Starter"}</small><b>${!first ? `${this._fmt(L.price, 2)} kr` : running ? "nu" : hm(first.t)}</b><em>${esc(until)}</em></div></div>
      <div class="ctl-tl">${track}</div>
      <div class="pnums${over && L.canWait ? " has-btn" : ""}">${first && !over ? `<span><b>${this._fmt(avg, 2)}</b> kr/kWh</span>` : ""}${first ? `<span><b>${this._fmt(p.kwh, 1)}</b> kWh</span><span><b>${this._fmt(p.cost, 2)}</b> kr</span>` : ""}${over ? `<span class="held">${this._limitText(L, held)}</span>` : ""}${!over && Number.isFinite(p.save) && p.save > 0.5 ? `<span class="save"><ha-icon icon="mdi:piggy-bank-outline"></ha-icon>Sparer <b>${this._fmt(p.save, 2)} kr</b></span>` : ""}${over && L.canWait ? this._waitBtn(held, L, soc, tg) : ""}</div>`;
  }
  _limitText(L, held) {
    const best = L.cheaper.reduce((m, w) => (!m || Number(w.saving) > Number(m.saving) ? w : m), null);
    const when = (t) => `${new Date(t).toLocaleDateString("da-DK", { weekday: "short" }).replace(".", "")} ${new Date(t).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}`;
    if (held) return `<b>${this._fmt(L.above, 1)}</b> kWh venter${best ? ` · resten ${when(best.t)}` : ""}`;
    const save = Number.isFinite(L.saving) ? L.saving : best ? Number(best.saving) : NaN;
    return `<b>${this._fmt(L.above, 1)}</b> kWh billigere senere${Number.isFinite(save) ? ` · spar ca. ${this._fmt(save, 0)} kr` : ""}`;
  }
  // The answer to EV Ledger's price question (user, 2026-10-15): wait with the rest, or charge to the target. First tap
  // arms, the second sends.
  // The switch is found next to the plan select in the entity registry (any language), else from the English id.
  _waitId() {
    const c = this._config.charge_plan || {}; if (c.limit_wait) return c.limit_wait;
    const reg = this._hass?.entities; const own = reg?.[c.mode];
    if (own?.device_id) { const hit = Object.values(reg).find((e) => e.device_id === own.device_id && e.platform === own.platform && e.translation_key === "price_limit_wait"); if (hit) return hit.entity_id; }
    return typeof c.mode === "string" && c.mode.endsWith("_charge_mode") ? c.mode.replace(/^select\./, "switch.").replace(/_charge_mode$/, "_wait_above_the_price_limit") : "";
  }
  // The button says what it charges to tonight (user, 2026-10-15: "Vent med resten" should show it).
  _waitBtn(held, L, soc, tg) {
    const armed = this._armAt && Date.now() - this._armAt < 4000;
    const label = held ? `Lad til ${Math.round(tg)} %` : !Number.isFinite(L.reach) ? "Vent med resten" : L.reach <= soc + 0.5 ? "Lad ikke i nat" : `Lad kun til ${Math.round(L.reach)} %`;
    return `<button type="button" class="pnow${armed ? " armed" : ""}${held ? "" : " wait"}" data-pwait="${held ? "off" : "on"}">${armed ? "Tryk igen" : label}</button>`;
  }
  _chooseWait(on) {
    const id = this._waitId(); if (!id || !this._hass) return;
    clearTimeout(this._armT);
    if (!(this._armAt && Date.now() - this._armAt < 4000)) { this._armAt = Date.now(); this._armT = setTimeout(() => { this._armAt = 0; this._update(); }, 4000); this._update(); return; }
    this._armAt = 0; this._update();
    this._hass.callService("switch", on ? "turn_on" : "turn_off", { entity_id: id });
  }

  // Charging, built like the plan (user: "ikke vild med lader siden … heller ikke på mobilen"): ring + title + finish time,
  // a live bar towards the target, the numbers with the savings badge to the right.
  _chargeHtml(p) {
    const c = this._config; const hm = (t) => new Date(t).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
    const soc = this._num(c.battery) ?? 0; const tg = Number.isFinite(p?.target) ? p.target : this._target() ?? 100;
    const pw = this._pw(); const raw = this._num(pw); const kw = raw == null ? null : (this._unit(pw) === "W" || raw > 100 ? raw / 1000 : raw);
    // While a plan in several periods runs, the bar is its timeline: where in the plan it is, the pauses still to come
    // and a tooltip on each part (Claude AI, 2026-10-16). The ring keeps the battery.
    const now = Date.now(); const dlT = p?.deadline ? Date.parse(p.deadline) : NaN;
    const parts = p ? ctlParts({ now, blocks: p.blocks, deadline: dlT, prices: p.prices, minutes: p.minutes }) : [];
    const tl = parts.filter((x) => x.kind === "charge").length > 1 || parts.some((x) => x.kind === "pause") ? `<div class="ctl-tl">${ctlTrack(parts, { now, deadline: dlT, unit: "kr" })}</div>` : "";
    // With pauses ahead the car's own "full at" is wrong (it assumes charging on): the plan's last period ends it.
    const planEnd = tl ? Math.max(...parts.filter((x) => x.kind === "charge").map((x) => x.e)) : NaN;
    const added = this._num(this._added()); const fin = this._val(c.charge_finish); const finT = Number.isFinite(planEnd) ? planEnd : fin ? Date.parse(fin) : NaN;
    const left = Number.isFinite(finT) && finT > Date.now() ? Math.round((finT - Date.now()) / 60000) : null;
    const leftTxt = left == null ? "" : left >= 60 ? `om ${Math.floor(left / 60)} t ${left % 60} min` : `om ${left} min`;
    const prev = c.preview === "charge";
    return `<div class="ph"><span class="ring chg" style="--s:${Math.max(0, Math.min(100, soc))};--t:${Math.max(0, Math.min(100, tg))}"><span class="core"><ha-icon icon="mdi:lightning-bolt"></ha-icon></span></span>
        <div class="pt"><b>Lader nu${kw != null ? ` · <span class="kw">${this._fmt(kw, 1)} kW</span>` : ""}</b><span>${esc(p?.name || c.name)}${this._away() ? " · ude" : ""} · ${Math.round(soc)} % → ${Math.round(tg)} %${prev ? " · forhåndsvisning" : ""}</span></div>
        <div class="pstart"><small>${Number.isFinite(finT) ? "Fuld kl." : "Batteri"}</small><b>${Number.isFinite(finT) ? hm(finT) : `${Math.round(soc)} %`}</b><em>${esc(leftTxt)}</em></div></div>
      ${tl || `<div class="cbar"><div class="cfill" style="width:${Math.max(2, Math.min(100, soc))}%"><i></i></div><i class="ctg" style="left:${Math.min(100, tg)}%"></i></div>`}
      <div class="pnums">${added != null ? `<span><b>+${this._fmt(added, 1)}</b> kWh ladet</span>` : ""}${p ? `<span><b>${this._fmt(p.cost, 2)}</b> kr i planen</span>` : ""}${p && Number.isFinite(p.save) && p.save > 0.5 ? `<span class="save"><ha-icon icon="mdi:piggy-bank-outline"></ha-icon>Sparer <b>${this._fmt(p.save, 2)} kr</b></span>` : ""}</div>`;
  }
  // Spinning wheels while driving, like the Tesla app (Claude AI, 2026-10-14). `image_driving_wheels` lists each wheel in the
  // driving picture's own pixels: [cx, cy, rx, ry, hubX, hubY] – the rim ellipse and its hub. Each wheel is a crop of the
  // picture that turns in "unsquashed" space (scaleX(k) · rotate · scaleX(1/k)), so the rim keeps its perspective.
  _wheels(dir, src) {
    const car = this.shadowRoot.querySelector(".car"); const img = car?.querySelector("img"); if (!car || !img) return;
    let box = car.querySelector(".wheels");
    const list = Array.isArray(this._config.image_driving_wheels) ? this._config.image_driving_wheels : [];
    if (!dir || !list.length || !img.naturalWidth || img.getAttribute("src") !== src) { if (box) box.hidden = true; car.classList.remove("has-wheels"); if (dir && list.length && !img._wheelHook) { img._wheelHook = true; img.addEventListener("load", () => { this._sig = ""; this._update(); }); } return; }
    if (!box) { box = document.createElement("div"); box.className = "wheels"; box.setAttribute("aria-hidden", "true"); car.appendChild(box); new ResizeObserver(() => { this._wheelKey = ""; this._wheels(this._wheelDir, img.getAttribute("src")); }).observe(img); }
    this._wheelDir = dir; box.hidden = false; car.classList.add("has-wheels");
    // where the picture's content sits inside the <img> (object-fit: contain, object-position: right bottom)
    const ir = img.getBoundingClientRect(); const cr = car.getBoundingClientRect(); const nw = img.naturalWidth; const nh = img.naturalHeight;
    const sc = Math.min(ir.width / nw, ir.height / nh); const w = nw * sc; const h = nh * sc;
    const ox = ir.left - cr.left + (ir.width - w); const oy = ir.top - cr.top + (ir.height - h);
    const key = [dir, ox, oy, w, h, src].join("|"); if (key === this._wheelKey) return; this._wheelKey = key;
    box.innerHTML = list.map(([cx, cy, rx, ry, hx = cx, hy = cy]) => {
      const k = rx / ry; const L = ox + (cx - rx) * sc; const T = oy + (cy - ry) * sc; const W = 2 * rx * sc; const H = 2 * ry * sc;
      const hox = (hx - (cx - rx)) * sc; const hoy = (hy - (cy - ry)) * sc;
      const bg = `background:url('${String(src).replaceAll("'", "%27")}') ${(-(cx - rx) * sc).toFixed(2)}px ${(-(cy - ry) * sc).toFixed(2)}px/${w.toFixed(2)}px ${h.toFixed(2)}px no-repeat`;
      const o = `transform-origin:${hox.toFixed(2)}px ${hoy.toFixed(2)}px`;
      return `<i class="wh" style="left:${L.toFixed(2)}px;top:${T.toFixed(2)}px;width:${W.toFixed(2)}px;height:${H.toFixed(2)}px"><i class="w1" style="${o};transform:scaleX(${k.toFixed(4)})"><i class="w2 ${dir < 0 ? "rev" : ""}" style="${o}"><i class="w3" style="${o};transform:scaleX(${(1 / k).toFixed(4)});${bg}"></i></i></i></i>`;
    }).join("");
  }
  // When the car is plugged in, a tap opens the quick charge menu (the Tesla card's compact charge layout, `popup:`
  // like the home status tile's) instead of the Tesla page (user, 2026-10-15).
  _plugged() {
    const c = this._config; const on = (id) => ["on", "true", "connected"].includes(String(this._val(id) || "").toLowerCase());
    return on(c.plugged) || on(c.charge_plan?.cable);
  }
  _openPopup() {
    const Card = customElements.get("th-tesla-dashboard-card"); if (!Card || this._popupEl) return !!Card;
    const backdrop = document.createElement("div");
    backdrop.style.cssText = "position:fixed;inset:0;z-index:999999;background:rgba(8,12,18,.68);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:calc(10px + env(safe-area-inset-top,0px)) 10px calc(10px + env(safe-area-inset-bottom,0px))";
    const panel = document.createElement("div");
    panel.style.cssText = "position:relative;width:100%;max-width:680px;display:flex;flex-direction:column;max-height:calc(100dvh - 20px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px))";
    const close = document.createElement("button");
    close.textContent = "Luk ✕"; close.setAttribute("aria-label", "Luk ladeoverblik");
    close.style.cssText = "align-self:flex-end;flex:none;margin:0 4px 8px 0;min-height:44px;padding:10px 18px;border:1px solid var(--divider-color,rgba(255,255,255,.14));border-radius:999px;background:var(--card-background-color,rgba(8,12,18,.92));color:var(--primary-text-color,#fff);font:inherit;font-weight:700;cursor:pointer";
    const card = new Card();
    card.setConfig({ layout: "charge", ...this._config.popup });
    card.hass = this._hass;
    const scroller = document.createElement("div");
    scroller.style.cssText = "flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain;border-radius:20px;padding:12px;background:var(--primary-background-color,#0b0f16);box-shadow:0 28px 70px rgba(0,0,0,.5)";
    scroller.appendChild(card); panel.append(close, scroller); backdrop.appendChild(panel);
    backdrop.addEventListener("click", (event) => { if (event.target === backdrop) this._closePopup(); });
    // The popup lies outside Home Assistant's app element: send the cards' more-info on to the app.
    backdrop.addEventListener("hass-more-info", (event) => {
      const app = document.querySelector("home-assistant"); if (!app) return;
      event.stopPropagation(); app.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: event.detail }));
    });
    card.addEventListener("tesla-popup-close", () => this._closePopup());
    close.addEventListener("click", () => this._closePopup());
    this._escHandler = (event) => { if (event.key === "Escape" && !document.querySelector("home-assistant")?.contains(event.target)) this._closePopup(); };
    document.addEventListener("keydown", this._escHandler);
    document.body.appendChild(backdrop);
    this._popupEl = backdrop; this._popupCard = card;
    return true;
  }
  _closePopup() {
    this._popupEl?.remove(); this._popupEl = null; this._popupCard = null;
    if (this._escHandler) document.removeEventListener("keydown", this._escHandler);
    this._escHandler = null;
  }
  disconnectedCallback() { this._closePopup(); }
  _tap() {
    if (this._config.popup && this._plugged() && this._openPopup()) return;
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
    // While it charges the overlay is a charging card; otherwise the plan when one is active (user, 2026-10-13: "når den
    // går i gang med ladning skal ladeplan kortet skiftes ud med et ladningskort … først, men man kan swipe").
    const plan = this._plan(); const was = this._planOn; const wasKind = this._overlayKind;
    // preview: charge shows the charging view on demand
    const kind = c.preview === "charge" || (charging && (c.charge_plan || this._away())) ? "charge" : plan ? "plan" : null; this._planOn = !!kind; this._overlayKind = kind;
    if (kind) { const h = kind === "charge" ? this._chargeHtml(plan) : this._planHtml(plan); const box = root.querySelector(".plan"); box.classList.toggle("is-charge", kind === "charge"); if (box._h !== h) { box._h = h; box.innerHTML = h; } }
    if (kind && (!was || kind !== wasKind)) this._view = "plan"; // a new overlay is shown first
    this._paintView();
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
      const p = this._num(this._pw()), added = this._num(this._added()), fin = this._time(c.charge_finish);
      line.innerHTML = `<ha-icon icon="mdi:ev-station"></ha-icon><b>${esc(this._fmt(p, 1))} kW</b>${added != null ? ` · +${esc(this._fmt(added, 1))} kWh` : ""}${fin ? ` · færdig ${esc(fin)}` : ""}`;
    } else {
      const next = this._time(c.next_charge_start), cost = this._num(c.next_charge_cost);
      if (next) line.innerHTML = `<ha-icon icon="mdi:calendar-clock"></ha-icon>${c.compact ? "Lader" : "Næste ladning"} <b>${esc(next)}</b>${cost != null ? ` · ${esc(this._fmt(cost, 2))} kr` : ""}${target != null && !c.compact ? ` · mål ${esc(this._fmt(target))} %` : ""}`;
      else if (plugged) line.innerHTML = `<ha-icon icon="mdi:power-plug-outline"></ha-icon>Kablet sidder i`;
      else line.innerHTML = "";
    }

    const chips = [];
    const lock = this._val(c.lock);
    if (lock) chips.push(lock === "locked" ? `<span class="chip ok" title="Låst"><ha-icon icon="mdi:lock"></ha-icon><span class="cl">Låst</span></span>` : `<span class="chip warn" title="Ulåst"><ha-icon icon="mdi:lock-open-variant"></ha-icon><span class="cl">Ulåst</span></span>`);
    if (this._val(c.sentry) === "on") chips.push(`<span class="chip ok" title="Sentry"><ha-icon icon="mdi:shield-car"></ha-icon><span class="cl">Sentry</span></span>`);
    const inside = this._num(c.inside_temperature);
    if (inside != null) chips.push(`<span class="chip"><ha-icon icon="mdi:car-seat-heater"></ha-icon>${esc(this._fmt(inside, 0))}°</span>`);
    root.querySelector(".chips").innerHTML = chips.join("");

    // The picture follows what the car does (Claude AI, 2026-10-13): driving, charging/plugged in, or parked; a new one
    // fades in over the old.
    const img = root.querySelector(".car img");
    const gearNow = String(this._val(c.shift_state) || "").toUpperCase(); const drivingNow = !charging && ["D", "R", "N"].includes(gearNow);
    const src = drivingNow && c.image_driving ? c.image_driving : (charging || plugged) && c.image_charging ? c.image_charging : c.image;
    img.hidden = !src;
    card.classList.toggle("plugged", !!plugged && !charging); card.classList.toggle("parked", !charging && !plugged && !drivingNow);
    this._wheels(drivingNow && src === c.image_driving ? (gearNow === "R" ? -1 : gearNow === "D" ? 1 : 0) : 0, src);
    if (src && img.dataset.want !== src) {
      img.dataset.want = src;
      if (!img.getAttribute("src")) img.setAttribute("src", src);
      else { img.classList.add("swap"); clearTimeout(this._swapT); this._swapT = setTimeout(() => { img.onload = () => img.classList.remove("swap"); img.setAttribute("src", img.dataset.want); }, 260); }
    }
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
