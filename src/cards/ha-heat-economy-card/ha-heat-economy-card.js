const VERSION = "0.2.0";

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
      spa_kw: 3.2,
    };
  }
  setConfig(config) {
    this._config = { title: "Varmepumpe vs. Fjernvarme", spa_kw: 3.2, ...config };
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
    ].filter(Boolean);
  }
  set hass(hass) {
    this._hass = hass;
    const ids = this._watchedIds();
    const sig = JSON.stringify(ids.map((id) => [id, hass?.states?.[id]?.state]));
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
    const spaCost = Number.isFinite(currentPrice) ? currentPrice * (Number(c.spa_kw) || 3.2) : undefined;

    this.shadowRoot.innerHTML = `<style>
      :host{display:block;--good:var(--dashboard-success, var(--success-color, #54d9aa));--warn:var(--dashboard-warning, var(--warning-color, #ffbd59));--danger:var(--dashboard-danger, var(--error-color, #ff667a));--accent:var(--dashboard-accent, var(--primary-color, #62b5ff));--edge:var(--dashboard-border-neutral, var(--divider-color, rgba(127,145,165,.2)));--card-surface:var(--dashboard-card-bg,var(--ha-card-background,var(--card-background-color,#111820)))}
      *{box-sizing:border-box}
      ha-card{padding:20px;border-radius:26px;background:linear-gradient(150deg,color-mix(in srgb,${optimalColor} 6%,transparent),transparent 45%),var(--card-surface);border:var(--ha-card-border-width,1px) solid var(--ha-card-border-color,var(--edge));color:var(--primary-text-color);box-shadow:var(--ha-card-box-shadow)}
      .head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:16px}
      .head strong{font-size:15px}
      .pill{padding:6px 13px;border-radius:999px;font-size:12px;font-weight:800;background:color-mix(in srgb,${optimalColor} 18%,transparent);color:${optimalColor}}
      .compare{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .price-box{--tone:var(--accent);padding:14px;border:1px solid color-mix(in srgb,var(--tone) 16%,var(--edge));border-left:3px solid var(--tone);border-radius:16px;background:linear-gradient(145deg,color-mix(in srgb,var(--tone) 6%,transparent),transparent 55%);box-shadow:0 4px 12px rgba(0,0,0,.08);text-align:center;position:relative}
      .price-box.win{--tone:var(--good)}
      .price-box ha-icon{--mdc-icon-size:20px;color:var(--secondary-text-color)}
      .price-box.win ha-icon{color:var(--good)}
      .price-box span{display:block;margin-top:6px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--secondary-text-color)}
      .price-box b{display:block;margin-top:3px;font-size:18px;font-weight:800}
      .delta{text-align:center;margin:12px 0;font-size:12px;color:var(--secondary-text-color)}
      .delta b{color:var(--good)}
      .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:6px}
      .stat{padding:10px;border:1px solid color-mix(in srgb,var(--accent) 16%,transparent);border-left:3px solid var(--accent);border-radius:14px;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 6%,transparent),transparent 55%);box-shadow:0 4px 12px rgba(0,0,0,.08);text-align:center}
      .stat span{display:block;font-size:9px;color:var(--secondary-text-color);text-transform:uppercase;font-weight:700}
      .stat b{display:block;margin-top:4px;font-size:13px;font-weight:800}
      .section-title{margin:18px 0 8px;color:var(--secondary-text-color);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
      .hours{display:flex;flex-wrap:wrap;gap:6px}
      .hour-chip{display:flex;flex-direction:column;align-items:center;gap:1px;padding:7px 10px;border:1px solid color-mix(in srgb,var(--good) 20%,var(--edge));border-left:3px solid var(--good);border-radius:12px;background:color-mix(in srgb,var(--good) 6%,transparent)}
      .hour-chip b{font-size:12px;font-weight:800}
      .hour-chip span{font-size:9px;color:var(--good);font-weight:700}
      .empty-hint{font-size:11px;color:var(--secondary-text-color);padding:8px 0}
      .footer-row{display:flex;align-items:center;justify-content:space-between;margin-top:16px;padding-top:12px;border-top:1px solid var(--edge);font-size:11px;color:var(--secondary-text-color)}
      .footer-row b{color:var(--primary-text-color);font-size:13px}
      @media(max-width:420px){.stats{grid-template-columns:1fr 1fr}}
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
          : `<div class="empty-hint">Ingen priser for i morgen endnu</div>`
      }

      ${
        Number.isFinite(spaCost)
          ? `<div class="footer-row"><span>Spabad, ca. pr. time (${this._fmt(Number(c.spa_kw) || 3.2, 1)} kW)</span><b>${this._fmt(spaCost, 1)} kr</b></div>`
          : ""
      }
    </ha-card>`;

    this.shadowRoot.querySelectorAll("[data-more]").forEach((el) => {
      el.addEventListener("click", () => {
        if (el.dataset.more) this._more(el.dataset.more);
      });
    });
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
