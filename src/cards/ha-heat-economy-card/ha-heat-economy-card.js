import { isNewLook } from "../../shared/look.js";

const VERSION = "0.4.0";

class HAHeatEconomyCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._sig = "";
  }
  static getStubConfig() {
    return {
      title: "Varmepumpe vs. Fjernvarme",
      vp_price_entity: "sensor.example_vp_price",
      fj_price_entity: "sensor.example_fj_price",
      optimal_entity: "sensor.example_optimal",
      cop_entity: "sensor.example_cop",
      outdoor_entity: "sensor.example_outdoor",
      price_entity: "sensor.example_current_price",
      tomorrow_entity: "binary_sensor.example_tomorrow_available",
    };
  }
  setConfig(config) {
    this._config = { title: "Varmepumpe vs. Fjernvarme", spa_kw: 3.2, ...config };
    // The spa cost line is opt-in: `show_spa: true`, or a `spa_kw` in the config (older configs keep their line).
    // A home without a spa gets no spa line (Claude AI).
    this._showSpa = config?.show_spa !== undefined ? Boolean(config.show_spa) : config?.spa_kw !== undefined && config?.spa_kw !== null;
    this._render();
  }
  _watchedIds() {
    const c = this._config;
    return [
      c.vp_price_entity,
      c.fj_price_entity,
      c.optimal_entity,
      c.cop_entity,
      c.outdoor_entity,
      c.price_entity,
      c.tomorrow_entity,
      c.saving_entity,
      c.window_entity,
      c.preheat_entity,
      c.preferred_entity,
      c.auto_entity,
      c.style_entity,
      ...(Array.isArray(c.units) ? c.units.flatMap((u) => [u?.entity, u?.active_entity, u?.pause_entity]) : []),
    ].filter(Boolean);
  }
  set hass(hass) {
    this._hass = hass;
    const ids = this._watchedIds();
    const sig = JSON.stringify([ids.map((id) => [id, hass?.states?.[id]?.state]), hass?.states?.[this._config.window_entity]?.attributes?.vindue, hass?.states?.[this._config.vp_price_entity]?.attributes?.elpris]);
    if (sig !== this._sig) {
      this._sig = sig;
      this._render();
    }
  }
  _e(id) {
    return id ? this._hass?.states?.[id] : undefined;
  }
  _s(id) {
    return this._e(id)?.state;
  }
  _num(id) {
    const n = Number(this._s(id));
    return Number.isFinite(n) ? n : undefined;
  }
  _esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  _fmt(v, digits = 2) {
    if (!Number.isFinite(v)) return "—";
    return v.toLocaleString("da-DK", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  _more(entityId) {
    if (!entityId) return;
    this.dispatchEvent(
      new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }),
    );
  }
  _bestHours(prices, gas, cop) {
    if (!Array.isArray(prices) || !Number.isFinite(gas) || !Number.isFinite(cop) || cop <= 0) return [];
    return prices
      .map((p) => {
        const el = Number(p?.price);
        if (!Number.isFinite(el)) return null;
        const vp = el / cop;
        const save = gas - vp;
        return { start: p.start, vp, save };
      })
      .filter((r) => r && r.save > 0.1)
      .sort((a, b) => b.save - a.save)
      .slice(0, 6);
  }
  _hourChip(row) {
    const d = new Date(row.start);
    const hh = Number.isNaN(d.getTime()) ? "--:--" : d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
    return `<div class="hour-chip"><b>${this._esc(hh)}</b><span>+${this._fmt(row.save)} kr</span></div>`;
  }
  _render() {
    if (!this.shadowRoot) return;
    if (isNewLook(this._hass, this._config)) return this._renderNew();
    const c = this._config;
    const vp = this._num(c.vp_price_entity);
    const fj = this._num(c.fj_price_entity);
    const optimal = this._s(c.optimal_entity);
    const cop = this._num(c.cop_entity);
    const outdoor = this._num(c.outdoor_entity);
    const cheaper = Number.isFinite(vp) && Number.isFinite(fj) ? (vp < fj ? "vp" : "fj") : undefined;
    const delta = Number.isFinite(vp) && Number.isFinite(fj) ? Math.abs(fj - vp) : undefined;
    const breakEven = Number.isFinite(fj) && Number.isFinite(cop) ? fj * cop : undefined;

    const optimalColor =
      optimal === "Varmepumpe" ? "var(--good)" : optimal === "Fjernvarme" ? "var(--accent)" : optimal === "Kombineret" ? "var(--warn)" : "var(--secondary-text-color)";

    const todayPrices = this._e(c.price_entity)?.attributes?.prices || [];
    const tomorrowPrices = this._e(c.tomorrow_entity)?.attributes?.prices || [];
    const tomorrowForecast = this._e(c.tomorrow_entity)?.attributes?.forecast_data === true;
    const bestToday = this._bestHours(todayPrices, fj, cop);
    const bestTomorrow = this._bestHours(tomorrowPrices, fj, cop);

    const currentPrice = this._num(c.price_entity);
    const spaCost = this._showSpa && Number.isFinite(currentPrice) ? currentPrice * (Number(c.spa_kw) || 3.2) : undefined;

    this.shadowRoot.innerHTML = `<style>
      :host{display:block;--good:var(--dashboard-success, var(--success-color, #54d9aa));--warn:var(--dashboard-warning, var(--warning-color, #ffbd59));--danger:var(--dashboard-danger, var(--error-color, #ff667a));--accent:var(--dashboard-accent, var(--primary-color, #62b5ff));--edge:var(--dashboard-border-neutral, var(--divider-color, rgba(127,145,165,.2)));--card-surface:var(--dashboard-card-bg,var(--ha-card-background,var(--card-background-color,#111820)))}
      *{box-sizing:border-box}
      ha-card{padding:20px;border-radius:26px;background:linear-gradient(150deg,color-mix(in srgb,${optimalColor} 6%,transparent),transparent 45%),var(--card-surface);border:var(--ha-card-border-width,1px) solid var(--ha-card-border-color,var(--edge));color:var(--primary-text-color);box-shadow:var(--ha-card-box-shadow)}
      .head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:16px}
      .head strong{font-size:15px}
      .pill{padding:6px 13px;border-radius:999px;font-size:12px;font-weight:800;background:color-mix(in srgb,${optimalColor} 18%,transparent);color:${optimalColor}}
      .compare{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .price-box{--tone:var(--accent);padding:14px;border:1px solid color-mix(in srgb,var(--tone) 16%,var(--edge));border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--tone);border-radius:16px;background:linear-gradient(145deg,color-mix(in srgb,var(--tone) 6%,transparent),transparent 55%);box-shadow:0 4px 12px rgba(0,0,0,.08);text-align:center;position:relative}
      .price-box.win{--tone:var(--good)}
      .price-box ha-icon{--mdc-icon-size:20px;color:var(--secondary-text-color)}
      .price-box.win ha-icon{color:var(--good)}
      .price-box span{display:block;margin-top:6px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--secondary-text-color)}
      .price-box b{display:block;margin-top:3px;font-size:18px;font-weight:800}
      .delta{text-align:center;margin:12px 0;font-size:12px;color:var(--secondary-text-color)}
      .delta b{color:var(--good)}
      .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:6px}
      .stat{padding:10px;border:1px solid color-mix(in srgb,var(--accent) 16%,transparent);border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--accent);border-radius:14px;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 6%,transparent),transparent 55%);box-shadow:0 4px 12px rgba(0,0,0,.08);text-align:center}
      .stat span{display:block;font-size:9px;color:var(--secondary-text-color);text-transform:uppercase;font-weight:700}
      .stat b{display:block;margin-top:4px;font-size:13px;font-weight:800}
      .section-title{margin:18px 0 8px;color:var(--secondary-text-color);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
      .hours{display:flex;flex-wrap:wrap;gap:6px}
      .hour-chip{display:flex;flex-direction:column;align-items:center;gap:1px;padding:7px 10px;border:1px solid color-mix(in srgb,var(--good) 20%,var(--edge));border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--good);border-radius:12px;background:color-mix(in srgb,var(--good) 6%,transparent)}
      .hour-chip b{font-size:12px;font-weight:800}
      .hour-chip span{font-size:9px;color:var(--good);font-weight:700}
      .empty-hint{font-size:11px;color:var(--secondary-text-color);padding:8px 0}
      .footer-row{display:flex;align-items:center;justify-content:space-between;margin-top:16px;padding-top:12px;border-top:1px solid var(--edge);font-size:11px;color:var(--secondary-text-color)}
      .footer-row b{color:var(--primary-text-color);font-size:13px}
      .x-stats{grid-template-columns:1fr 2fr;margin-top:12px}
      .stat[data-more]{cursor:pointer}
      .auto-btn{display:flex;align-items:center;gap:8px;width:100%;padding:10px 12px;border:1px solid var(--edge);border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--secondary-text-color);border-radius:14px;background:transparent;color:var(--primary-text-color);font:inherit;font-size:13px;font-weight:700;cursor:pointer}
      .auto-btn span{flex:1;text-align:left}
      .auto-btn.on{border-left-color:var(--good);background:color-mix(in srgb,var(--good) 8%,transparent)}
      .auto-btn.on ha-icon,.auto-btn.on b{color:var(--good)}
      .units{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
      .unit{display:flex;align-items:center;gap:5px;padding:6px 10px;border:1px solid var(--edge);border-radius:12px;background:transparent;color:var(--secondary-text-color);font:inherit;font-size:11.5px;font-weight:700;cursor:pointer}
      .unit ha-icon{--mdc-icon-size:15px}
      .unit small{font-size:10px;font-weight:600}
      .unit.on{color:var(--primary-text-color)}
      .unit.active{border-color:var(--good)}
      .unit.active ha-icon{color:var(--good)}
      @media(max-width:420px){.stats{grid-template-columns:1fr 1fr}.x-stats{grid-template-columns:1fr}}
    </style>
    <ha-card>
      <div class="head">
        <strong>${this._esc(c.title)}</strong>
        <span class="pill">${this._esc(optimal || "—")}</span>
      </div>

      <div class="compare">
        <div class="price-box ${cheaper === "vp" ? "win" : ""}" data-more="${this._esc(c.vp_price_entity)}">
          <ha-icon icon="mdi:heat-pump"></ha-icon>
          <span>Varmepumpe</span>
          <b>${this._fmt(vp)} kr</b>
        </div>
        <div class="price-box ${cheaper === "fj" ? "win" : ""}" data-more="${this._esc(c.fj_price_entity)}">
          <ha-icon icon="mdi:fire"></ha-icon>
          <span>Fjernvarme</span>
          <b>${this._fmt(fj)} kr</b>
        </div>
      </div>
      ${
        Number.isFinite(delta)
          ? `<div class="delta">Prisforskel: <b>${this._fmt(delta)} kr/kWh</b> til fordel for ${cheaper === "vp" ? "varmepumpen" : "fjernvarme"}</div>`
          : ""
      }

      <div class="stats">
        <div class="stat"><span>Break-even</span><b>${this._fmt(breakEven)} kr</b></div>
        <div class="stat"><span>COP nu</span><b>${this._fmt(cop, 1)}</b></div>
        <div class="stat"><span>Ude</span><b>${this._fmt(outdoor, 1)}°</b></div>
      </div>

      <div class="section-title">Bedste timer i dag til varmepumpe</div>
      ${
        bestToday.length
          ? `<div class="hours">${bestToday.map((r) => this._hourChip(r)).join("")}</div>`
          : `<div class="empty-hint">Ingen timer med tydelig fordel i dag</div>`
      }

      <div class="section-title">Bedste timer i morgen${tomorrowForecast ? " (forecast)" : ""}</div>
      ${
        bestTomorrow.length
          ? `<div class="hours">${bestTomorrow.map((r) => this._hourChip(r)).join("")}</div>`
          : `<div class="empty-hint">${tomorrowPrices.length ? "Ingen timer med tydelig fordel i morgen" : "Ingen priser for i morgen endnu"}</div>`
      }

      ${
        Number.isFinite(spaCost)
          ? `<div class="footer-row"><span>Spabad, ca. pr. time (${this._fmt(Number(c.spa_kw) || 3.2, 1)} kW)</span><b>${this._fmt(spaCost, 1)} kr</b></div>`
          : ""
      }
      ${this._extrasClassic()}
    </ha-card>`;

    this._bind();
  }
  // ---- 0.4.0 (Claude AI, 2026-11-03): "Billigste varmekilde" – window, saving, automatik button, units, new look ----
  // Optional fields (all entity ids):
  //   saving_entity     kr/h saved by choosing the cheapest source now
  //   window_entity     timestamp sensor; attribute `vindue` {start, slut, elpris_snit, varmepumpe_kr_kwh,
  //                     senere_billigste_kr_kwh, fordel_kr_kwh, loennsom}
  //   preheat_entity    binary_sensor, on while pre-heating
  //   preferred_entity  binary_sensor, on while the heat pump is the chosen source (hysteresis)
  //   auto_entity       input_boolean shown as the "Automatisk varmekilde" button
  //   units: [{ name, entity (input_boolean: use this unit), active_entity (input_boolean: controlled now),
  //             pause_entity (timer), climate (climate entity, opened on long press) }]
  //   style: new | classic, style_entity: input_boolean (on = new) – see src/shared/look.js
  _time(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "--:--" : d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
  }
  _day(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const today = new Date();
    return d.toDateString() === today.toDateString() ? "i dag" : "i morgen";
  }
  _windowInfo() {
    const w = this._e(this._config.window_entity)?.attributes?.vindue;
    if (!w || typeof w !== "object" || !w.start) return undefined;
    const now = Date.now();
    const active = new Date(w.start).getTime() <= now && now < new Date(w.slut).getTime();
    return { ...w, active, preheat: this._s(this._config.preheat_entity) === "on" };
  }
  _units() {
    const list = Array.isArray(this._config.units) ? this._config.units : [];
    return list.filter((u) => u && u.entity).map((u) => ({
      name: String(u.name || u.entity),
      entity: u.entity,
      on: this._s(u.entity) === "on",
      active: this._s(u.active_entity) === "on",
      pause: this._s(u.pause_entity) === "active",
      climate: u.climate,
    }));
  }
  _toggle(entityId) {
    if (!entityId || !this._hass) return;
    const [domain] = entityId.split(".");
    this._hass.callService(domain === "input_boolean" ? "input_boolean" : "homeassistant", "toggle", { entity_id: entityId });
  }
  _bind() {
    this.shadowRoot.querySelectorAll("[data-more]").forEach((el) => {
      el.addEventListener("click", () => {
        if (el.dataset.more) this._more(el.dataset.more);
      });
    });
    this.shadowRoot.querySelectorAll("[data-toggle]").forEach((el) => {
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this._toggle(el.dataset.toggle);
      });
    });
  }
  _windowText(w) {
    if (!w) return "Ingen priser for de næste timer";
    return `${this._day(w.start)} ${this._time(w.start)}–${this._time(w.slut)}`;
  }
  _windowStatus(w) {
    if (!w) return { label: "—", tone: "muted" };
    if (w.preheat) return { label: "Forvarmer nu", tone: "good" };
    if (w.loennsom) return { label: w.active ? "Lønsomt nu" : "Lønsomt", tone: "good" };
    return { label: "Ikke lønsomt", tone: "muted" };
  }
  _autoButton(cls) {
    const id = this._config.auto_entity;
    if (!id) return "";
    const on = this._s(id) === "on";
    const name = this._e(id)?.attributes?.friendly_name || "Automatisk varmekilde";
    return `<button type="button" class="${cls}${on ? " on" : ""}" data-toggle="${this._esc(id)}" aria-pressed="${on}" title="${this._esc(name)}">
      <ha-icon icon="${on ? "mdi:heat-pump" : "mdi:heat-pump-outline"}"></ha-icon><span>${this._esc(name)}</span><b>${on ? "Til" : "Fra"}</b></button>`;
  }
  _unitChips(cls) {
    const units = this._units();
    if (!units.length) return "";
    return `<div class="${cls}">${units
      .map((u) => {
        const note = u.pause ? "Pause" : u.active ? "Styres" : u.on ? "Med" : "Ikke med";
        return `<button type="button" class="unit${u.on ? " on" : ""}${u.active ? " active" : ""}${u.pause ? " pause" : ""}" data-toggle="${this._esc(u.entity)}" aria-pressed="${u.on}">
          <ha-icon icon="${u.active ? "mdi:heat-pump" : u.pause ? "mdi:pause-circle-outline" : "mdi:heat-pump-outline"}"></ha-icon><span>${this._esc(u.name)}</span><small>${note}</small></button>`;
      })
      .join("")}</div>`;
  }
  _extrasClassic() {
    const c = this._config;
    const w = this._windowInfo();
    const saving = this._num(c.saving_entity);
    const st = this._windowStatus(w);
    if (!c.window_entity && !c.saving_entity && !c.auto_entity && !this._units().length) return "";
    return `
      ${c.saving_entity || c.window_entity ? `<div class="stats x-stats">
        ${c.saving_entity ? `<div class="stat" data-more="${this._esc(c.saving_entity)}"><span>Besparelse nu</span><b>${this._fmt(saving)} kr/t</b></div>` : ""}
        ${c.window_entity ? `<div class="stat wide" data-more="${this._esc(c.window_entity)}"><span>Billigste vindue · ${this._esc(st.label)}</span><b>${this._esc(this._windowText(w))}${w ? ` · ${this._fmt(w.varmepumpe_kr_kwh)} kr` : ""}</b></div>` : ""}
      </div>` : ""}
      ${c.auto_entity || this._units().length ? `<div class="section-title">Styring</div>${this._autoButton("auto-btn")}${this._unitChips("units")}` : ""}`;
  }
  _renderNew() {
    const c = this._config;
    const vp = this._num(c.vp_price_entity);
    const fj = this._num(c.fj_price_entity);
    const cop = this._num(c.cop_entity);
    const outdoor = this._num(c.outdoor_entity);
    const saving = this._num(c.saving_entity);
    const elAttr = Number(this._e(c.vp_price_entity)?.attributes?.elpris);
    const el = Number.isFinite(elAttr) ? elAttr : this._num(c.price_entity);
    const both = Number.isFinite(vp) && Number.isFinite(fj);
    const cheaper = both ? (vp < fj ? "vp" : "fj") : undefined;
    const delta = both ? Math.abs(fj - vp) : undefined;
    const breakEven = Number.isFinite(fj) && Number.isFinite(cop) ? fj * cop : undefined;
    const preferred = c.preferred_entity ? this._s(c.preferred_entity) === "on" : cheaper === "vp";
    const max = both ? Math.max(vp, fj) : 1;
    const w = this._windowInfo();
    const st = this._windowStatus(w);
    const verdict = cheaper === "vp" ? "Varmepumpen er billigst" : cheaper === "fj" ? "Fjernvarmen er billigst" : "Mangler data";
    const tone = cheaper === "vp" ? "var(--good)" : "var(--accent)";
    const tile = (key, icon, label, price, sub, entity) => `
      <div class="src ${cheaper === key ? "win" : ""}" data-more="${this._esc(entity)}">
        <div class="src-top"><ha-icon icon="${icon}"></ha-icon><span>${label}</span>${cheaper === key ? '<em>Billigst</em>' : ""}</div>
        <b>${this._fmt(price)}<small> kr/kWh</small></b>
        <div class="bar"><i style="width:${Number.isFinite(price) && max > 0 ? Math.max(4, Math.min(100, (price / max) * 100)).toFixed(1) : 0}%"></i></div>
        <p>${sub}</p>
      </div>`;
    this.shadowRoot.innerHTML = `<style>
      :host{display:block;--good:var(--dashboard-success, var(--success-color, #54d9aa));--accent:var(--dashboard-accent, var(--primary-color, #62b5ff));--edge:var(--dashboard-border-neutral, var(--divider-color, rgba(127,145,165,.2)));--card-surface:var(--dashboard-card-bg,var(--ha-card-background,var(--card-background-color,#111820)));--tone:${tone}}
      *{box-sizing:border-box}
      ha-card{position:relative;overflow:hidden;padding:20px;border-radius:var(--ha-card-border-radius,24px);background:radial-gradient(120% 90% at 0% 0%,color-mix(in srgb,var(--tone) 12%,transparent),transparent 60%),var(--card-surface);border:1px solid color-mix(in srgb,var(--tone) 18%,var(--edge));border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--tone);color:var(--primary-text-color);box-shadow:var(--ha-card-box-shadow)}
      .head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
      .eyebrow{font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--secondary-text-color)}
      h2{margin:4px 0 0;font-size:22px;line-height:1.15;font-weight:750;letter-spacing:-.01em}
      .sub{margin-top:4px;font-size:12.5px;color:var(--secondary-text-color)}
      .sub b{color:var(--tone)}
      .auto{display:flex;align-items:center;gap:8px;padding:8px 12px 8px 10px;border-radius:999px;border:1px solid var(--edge);background:color-mix(in srgb,var(--primary-text-color) 4%,transparent);color:var(--secondary-text-color);font:inherit;font-size:12.5px;font-weight:650;cursor:pointer}
      .auto ha-icon{--mdc-icon-size:18px}
      .auto b{padding:2px 8px;border-radius:999px;font-size:11px;background:color-mix(in srgb,var(--primary-text-color) 8%,transparent)}
      .auto.on{color:var(--primary-text-color);border-color:color-mix(in srgb,var(--good) 45%,var(--edge));background:color-mix(in srgb,var(--good) 12%,transparent)}
      .auto.on ha-icon,.auto.on b{color:var(--good)}
      .auto.on b{background:color-mix(in srgb,var(--good) 18%,transparent)}
      .srcs{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}
      .src{--t:var(--accent);padding:14px;border-radius:18px;border:1px solid color-mix(in srgb,var(--primary-text-color) 8%,transparent);background:linear-gradient(160deg,color-mix(in srgb,var(--primary-text-color) 5%,transparent),transparent 70%);cursor:pointer}
      .src.win{--t:var(--good);border-color:color-mix(in srgb,var(--good) 40%,transparent);box-shadow:0 0 0 1px color-mix(in srgb,var(--good) 20%,transparent),0 10px 30px -18px var(--good)}
      .src-top{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--secondary-text-color)}
      .src-top ha-icon{--mdc-icon-size:18px;color:var(--t)}
      .src-top em{margin-left:auto;font-style:normal;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--good)}
      .src b{display:block;margin-top:8px;font-size:26px;font-weight:750;letter-spacing:-.02em}
      .src b small{font-size:12px;font-weight:600;color:var(--secondary-text-color)}
      .bar{height:5px;margin-top:10px;border-radius:99px;background:color-mix(in srgb,var(--primary-text-color) 8%,transparent);overflow:hidden}
      .bar i{display:block;height:100%;border-radius:inherit;background:var(--t)}
      .src p{margin:8px 0 0;font-size:11.5px;color:var(--secondary-text-color)}
      .facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px}
      .fact{padding:10px 12px;border-radius:14px;background:color-mix(in srgb,var(--primary-text-color) 4%,transparent);cursor:pointer}
      .fact span{display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--secondary-text-color)}
      .fact b{display:block;margin-top:3px;font-size:15px;font-weight:750}
      .win-row{display:flex;align-items:center;gap:12px;margin-top:10px;padding:12px 14px;border-radius:16px;border:1px dashed color-mix(in srgb,var(--primary-text-color) 14%,transparent);cursor:pointer}
      .win-row.good{border-style:solid;border-color:color-mix(in srgb,var(--good) 40%,transparent);background:color-mix(in srgb,var(--good) 8%,transparent)}
      .win-row ha-icon{--mdc-icon-size:22px;color:var(--secondary-text-color)}
      .win-row.good ha-icon{color:var(--good)}
      .win-row div{flex:1;min-width:0}
      .win-row strong{display:block;font-size:13.5px}
      .win-row small{display:block;margin-top:2px;font-size:11.5px;color:var(--secondary-text-color)}
      .win-row em{font-style:normal;font-size:11px;font-weight:800;padding:4px 9px;border-radius:999px;background:color-mix(in srgb,var(--primary-text-color) 8%,transparent);color:var(--secondary-text-color);white-space:nowrap}
      .win-row.good em{background:color-mix(in srgb,var(--good) 18%,transparent);color:var(--good)}
      .units{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
      .unit{display:flex;align-items:center;gap:6px;padding:7px 12px;border-radius:12px;border:1px solid var(--edge);background:transparent;color:var(--secondary-text-color);font:inherit;font-size:12.5px;font-weight:650;cursor:pointer}
      .unit ha-icon{--mdc-icon-size:16px}
      .unit small{font-size:10.5px;font-weight:600;opacity:.8}
      .unit.on{color:var(--primary-text-color);border-color:color-mix(in srgb,var(--accent) 35%,var(--edge))}
      .unit.active{border-color:color-mix(in srgb,var(--good) 50%,var(--edge));background:color-mix(in srgb,var(--good) 10%,transparent)}
      .unit.active ha-icon{color:var(--good)}
      .unit.pause ha-icon{color:var(--dashboard-warning, var(--warning-color, #ffbd59))}
      @media(max-width:520px){.facts{grid-template-columns:1fr 1fr}.src b{font-size:22px}h2{font-size:19px}}
    </style>
    <ha-card>
      <div class="head">
        <div><div class="eyebrow">${this._esc(c.title)}</div><h2>${this._esc(verdict)}</h2>
          <div class="sub">${Number.isFinite(delta) ? `<b>${this._fmt(delta)} kr</b> pr. kWh varme i forskel${preferred && cheaper === "vp" ? " · varmepumpen er valgt" : ""}` : "Venter på priser"}</div></div>
        ${this._autoButton("auto")}
      </div>
      <div class="srcs">
        ${tile("vp", "mdi:heat-pump", "Varmepumpe", vp, `el ${this._fmt(el)} kr ÷ COP ${this._fmt(cop, 1)}`, c.vp_price_entity)}
        ${tile("fj", "mdi:radiator", "Fjernvarme", fj, "variabel pris pr. leveret kWh", c.fj_price_entity)}
      </div>
      <div class="facts">
        ${c.saving_entity ? `<div class="fact" data-more="${this._esc(c.saving_entity)}"><span>Sparer nu</span><b>${this._fmt(saving)} kr/t</b></div>` : ""}
        <div class="fact" data-more="${this._esc(c.cop_entity)}"><span>COP nu</span><b>${this._fmt(cop, 1)}</b></div>
        <div class="fact" data-more="${this._esc(c.outdoor_entity)}"><span>Ude</span><b>${this._fmt(outdoor, 1)}°</b></div>
        <div class="fact"><span>Lige ved el</span><b>${this._fmt(breakEven)} kr</b></div>
      </div>
      ${c.window_entity ? `<div class="win-row ${st.tone === "good" ? "good" : ""}" data-more="${this._esc(c.window_entity)}">
        <ha-icon icon="${w?.preheat ? "mdi:thermometer-plus" : "mdi:clock-star-four-points-outline"}"></ha-icon>
        <div><strong>Billigste vindue ${this._esc(this._windowText(w))}</strong>
        <small>${w ? `el ${this._fmt(w.elpris_snit)} kr · varmepumpe ${this._fmt(w.varmepumpe_kr_kwh)} kr/kWh mod ${this._fmt(w.senere_billigste_kr_kwh)} kr bagefter` : "—"}</small></div>
        <em>${this._esc(st.label)}</em></div>` : ""}
      ${this._unitChips("units")}
    </ha-card>`;
    this._bind();
  }

  getCardSize() {
    return 9;
  }
}

if (!customElements.get("ha-heat-economy-card"))
  customElements.define("ha-heat-economy-card", HAHeatEconomyCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha-heat-economy-card",
  name: "HA Heat Economy Card",
  description: "Samlet kort til varmepumpe vs. fjernvarme-økonomi med bedste timer og break-even",
  preview: true,
});
console.info(
  `%c HA HEAT ECONOMY CARD %c v${VERSION} `,
  "color:white;background:#c2694a;font-weight:700",
  "color:#f5cdb8;background:#161b22",
);
