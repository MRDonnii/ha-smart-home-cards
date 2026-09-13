const VERSION = "0.2.0";

class HAWaterMeterCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._sig = "";
  }
  static getStubConfig() {
    return {
      title: "Vandforbrug",
      total: "sensor.vandmaler_total",
      flow: "sensor.vandmaler_flow",
      max_flow: 1000,
      water_temp: "sensor.vandmaler_vand_temperatur",
      meter_temp: "sensor.vandmaler_maaler_temperatur",
      daily_usage: "sensor.vandmaler_dagens_forbrug",
      daily_price: "sensor.vandmaler_dagens_pris",
      monthly_usage: "sensor.vandmaler_manedens_forbrug",
      monthly_price: "sensor.vandmaler_manedens_pris",
      heat_energy: "sensor.vandmaler_varmeenergi",
      cooling_energy: "sensor.vandmaler_koeleenergi",
      wifi_signal: "sensor.kamstrup_wifi_rssi",
      firmware: "sensor.kamstrup_running_firmware",
      firmware_available: "sensor.kamstrup_available_firmware",
      update_available: "binary_sensor.kamstrup_update_tilgaengelig",
      startup_time: "sensor.kamstrup_startup_time",
    };
  }
  setConfig(config) {
    if (!config?.total) throw new Error("Kortet kræver en total-entity");
    this._config = { title: "Vandforbrug", max_flow: 1000, ...config };
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    const ids = Object.values(this._config).filter(
      (v) => typeof v === "string" && v.includes("."),
    );
    const sig = JSON.stringify(
      ids.map((id) => [id, hass?.states?.[id]?.state]),
    );
    if (sig !== this._sig) {
      this._sig = sig;
      this._render();
    }
  }
  getCardSize() {
    return 9;
  }
  getGridOptions() {
    return { columns: 12, rows: "auto", min_columns: 6 };
  }
  _e(id) {
    return id ? this._hass?.states?.[id] : undefined;
  }
  _s(id) {
    return this._e(id)?.state;
  }
  _hasData(id) {
    if (!id) return false;
    const s = this._s(id);
    return s !== undefined && !["unknown", "unavailable", ""].includes(s);
  }
  _num(id) {
    if (!this._hasData(id)) return undefined;
    const n = Number(String(this._s(id)).replace(",", "."));
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
  _fmt(v, digits = 0) {
    if (!Number.isFinite(v)) return "—";
    return v.toLocaleString("da-DK", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }
  _statItem(id, label, formatter) {
    if (!this._hasData(id)) return "";
    return `<div class="stat"><span>${label}</span><b>${formatter(id)}</b></div>`;
  }
  _open(id) {
    if (!id) return;
    this.dispatchEvent(
      new CustomEvent("hass-more-info", {
        bubbles: true,
        composed: true,
        detail: { entityId: id },
      }),
    );
  }
  _render() {
    if (!this.shadowRoot) return;
    const total = this._num(this._config.total);
    const flow = this._num(this._config.flow) || 0;
    const maxFlow = Number(this._config.max_flow) || 1000;
    const flowing = flow > 0;
    const fillPct = Math.max(4, Math.min(96, (flow / maxFlow) * 100));
    const waveTop = 100 - fillPct;

    const dailyStats = [
      this._statItem(this._config.daily_usage, "I dag", (id) => `${this._fmt(this._num(id), 3)} m³`),
      this._statItem(this._config.daily_price, "Pris i dag", (id) => `${this._fmt(this._num(id), 2)} kr`),
      this._statItem(this._config.monthly_usage, "Denne måned", (id) => `${this._fmt(this._num(id), 3)} m³`),
      this._statItem(this._config.monthly_price, "Pris måned", (id) => `${this._fmt(this._num(id), 2)} kr`),
    ].filter(Boolean);
    const tempStats = [
      this._statItem(this._config.water_temp, "Vandtemperatur", (id) => `${this._fmt(this._num(id), 1)}°`),
      this._statItem(this._config.meter_temp, "Målertemperatur", (id) => `${this._fmt(this._num(id), 1)}°`),
      this._statItem(this._config.heat_energy, "Varmeenergi", (id) => `${this._fmt(this._num(id), 2)} kWh`),
      this._statItem(this._config.cooling_energy, "Køleenergi", (id) => `${this._fmt(this._num(id), 2)} kWh`),
    ].filter(Boolean);
    const updateOn = this._config.update_available
      ? this._s(this._config.update_available) === "on"
      : false;
    const gatewayChips = [
      this._hasData(this._config.wifi_signal)
        ? `<span class="chip"><ha-icon icon="mdi:wifi"></ha-icon>${this._fmt(this._num(this._config.wifi_signal))} dBm</span>`
        : "",
      this._hasData(this._config.firmware)
        ? `<span class="chip"><ha-icon icon="mdi:chip"></ha-icon>FW ${this._esc(this._s(this._config.firmware))}</span>`
        : "",
      updateOn
        ? `<span class="chip warn"><ha-icon icon="mdi:update"></ha-icon>Opdatering klar${this._hasData(this._config.firmware_available) ? ` → ${this._esc(this._s(this._config.firmware_available))}` : ""}</span>`
        : "",
    ].filter(Boolean);

    this.shadowRoot.innerHTML = `<style>
      :host{display:block;--accent:var(--dashboard-accent, var(--primary-color, #2196f3));--good:var(--dashboard-success, var(--success-color, #54d9aa));--warn:var(--dashboard-warning, var(--warning-color, #ffbd59));--danger:var(--dashboard-danger, var(--error-color, #ff667a));--edge:var(--dashboard-border-neutral, var(--divider-color, rgba(127,145,165,.2)))}
      *{box-sizing:border-box}
      ha-card{position:relative;overflow:hidden;padding:18px;border-left:4px solid var(--accent);border-radius:20px;background:linear-gradient(160deg,color-mix(in srgb,var(--accent) 7%,transparent),transparent 45%),var(--ha-card-background,var(--card-background-color));color:var(--primary-text-color);box-shadow:var(--ha-card-box-shadow)}
      .head{display:flex;align-items:center;justify-content:space-between;gap:14px}
      .identity{display:flex;align-items:center;gap:11px;min-width:0}
      .icon{display:grid;place-items:center;width:42px;height:42px;flex:0 0 42px;border-radius:13px;background:color-mix(in srgb,var(--accent) 15%,transparent);color:var(--accent)}
      .icon ha-icon{--mdc-icon-size:24px}
      .identity strong{display:block;font-size:17px}
      .status{display:flex;align-items:center;gap:6px;color:var(--secondary-text-color);font-size:11px;font-weight:700}
      .status i{width:7px;height:7px;border-radius:50%;background:${flowing ? "var(--accent)" : "var(--secondary-text-color)"};box-shadow:0 0 8px currentColor;${flowing ? "animation:pulse-dot 1.4s ease-in-out infinite" : ""}}
      .total{text-align:right;cursor:pointer}
      .total strong{font-size:21px}
      .total span{display:block;color:var(--secondary-text-color);font-size:10px}
      .hero{display:grid;grid-template-columns:auto 1fr;gap:22px;align-items:center;margin-top:18px}
      .dial{position:relative;width:132px;height:132px;flex:0 0 132px;border-radius:50%;overflow:hidden;background:rgba(127,145,165,.1);border:2px solid color-mix(in srgb,var(--accent) 30%,var(--edge))}
      .dial .waves{position:absolute;left:-40%;width:180%;height:180%;top:${waveTop}%;transition:top 1.2s ease}
      .dial .wave{position:absolute;inset:0;border-radius:42%;background:color-mix(in srgb,var(--accent) 70%,transparent);animation:wave-rotate 6s linear infinite}
      .dial .wave.b{border-radius:45%;background:color-mix(in srgb,var(--accent) 45%,transparent);animation:wave-rotate 8.5s linear infinite reverse}
      .dial.idle .wave{animation-duration:40s}
      .dial-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:2;text-align:center}
      .dial-center strong{font-size:20px;line-height:1;color:var(--primary-text-color);text-shadow:0 1px 4px rgba(0,0,0,.35)}
      .dial-center span{margin-top:3px;font-size:9px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--primary-text-color);opacity:.85;text-shadow:0 1px 4px rgba(0,0,0,.35)}
      .droplets{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .5s}
      .dial:not(.idle) .droplets{opacity:1}
      .droplets i{position:absolute;bottom:6px;width:4px;height:4px;border-radius:50%;background:#fff;opacity:0;animation:droplet-rise 2.4s ease-in infinite}
      .droplets i:nth-child(1){left:30%;animation-delay:0s}
      .droplets i:nth-child(2){left:52%;animation-delay:.6s}
      .droplets i:nth-child(3){left:68%;animation-delay:1.2s}
      .droplets i:nth-child(4){left:42%;animation-delay:1.8s}
      .hero-info{min-width:0}
      .hero-info .flow-label{display:flex;align-items:center;gap:7px;color:var(--secondary-text-color);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}
      .hero-info .flow-value{margin-top:4px;font-size:15px;color:var(--primary-text-color);font-weight:700}
      .hero-info .flow-note{margin-top:6px;font-size:11px;color:var(--secondary-text-color);line-height:1.4}
      .section-title{margin:16px 0 8px;color:var(--secondary-text-color);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
      .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
      .stat{padding:9px;border:1px solid color-mix(in srgb,var(--accent) 16%,transparent);border-left:3px solid var(--accent);border-radius:12px;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 6%,transparent),transparent 55%);box-shadow:0 4px 12px rgba(0,0,0,.08);text-align:center}
      .stat span{display:block;color:var(--secondary-text-color);font-size:8px;text-transform:uppercase;font-weight:700}
      .stat b{display:block;margin-top:4px;font-size:13px}
      .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
      .chip{display:flex;align-items:center;gap:5px;padding:5px 10px;border-radius:10px;font-size:10px;font-weight:700;background:color-mix(in srgb,var(--secondary-text-color) 10%,transparent);color:var(--secondary-text-color)}
      .chip.warn{background:color-mix(in srgb,var(--warn) 16%,transparent);color:var(--warn)}
      .chip ha-icon{--mdc-icon-size:14px}
      @keyframes wave-rotate{from{transform:rotate(0)}to{transform:rotate(360deg)}}
      @keyframes pulse-dot{50%{opacity:.35;transform:scale(1.5)}}
      @keyframes droplet-rise{0%{opacity:0;transform:translateY(0) scale(.6)}20%{opacity:.9}100%{opacity:0;transform:translateY(-88px) scale(1.3)}}
      @media(max-width:480px){.stats{grid-template-columns:repeat(2,1fr)}.hero{grid-template-columns:1fr;justify-items:center;text-align:center}}
      @media(prefers-reduced-motion:reduce){*{animation:none!important}}
    </style>
    <ha-card>
      <div class="head">
        <div class="identity">
          <span class="icon"><ha-icon icon="mdi:water-circle"></ha-icon></span>
          <div>
            <strong>${this._esc(this._config.title)}</strong>
            <span class="status"><i></i>${flowing ? "Vand løber" : "I ro"}</span>
          </div>
        </div>
        <div class="total" data-open="${this._esc(this._config.total)}"><strong>${Number.isFinite(total) ? this._fmt(total, 3) : "—"} m³</strong><span>Målerstand</span></div>
      </div>
      <div class="hero">
        <div class="dial ${flowing ? "" : "idle"}">
          <div class="waves"><div class="wave"></div><div class="wave b"></div></div>
          <div class="droplets"><i></i><i></i><i></i><i></i></div>
          <div class="dial-center"><strong>${this._fmt(flow, flow < 10 ? 1 : 0)}</strong><span>L/time</span></div>
        </div>
        <div class="hero-info">
          <div class="flow-label"><ha-icon icon="mdi:water"></ha-icon>Aktuelt flow</div>
          <div class="flow-value">${flowing ? `${this._fmt(flow, flow < 10 ? 1 : 0)} liter/time lige nu` : "Ingen vandforbrug registreret"}</div>
          <div class="flow-note">${flowing ? "Der løber vand et sted i huset" : "Alle haner og forbrugere er lukkede"}</div>
        </div>
      </div>
      ${dailyStats.length ? `<div class="section-title">Forbrug</div><div class="stats">${dailyStats.join("")}</div>` : ""}
      ${tempStats.length ? `<div class="section-title">Temperatur & energi</div><div class="stats">${tempStats.join("")}</div>` : ""}
      ${gatewayChips.length ? `<div class="section-title">Gateway</div><div class="chips">${gatewayChips.join("")}</div>` : ""}
    </ha-card>`;
    this.shadowRoot.querySelectorAll("[data-open]").forEach((el) =>
      el.addEventListener("click", () => this._open(el.dataset.open)),
    );
  }
}

if (!customElements.get("ha-water-meter-card"))
  customElements.define("ha-water-meter-card", HAWaterMeterCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha-water-meter-card",
  name: "HA Water Meter Card",
  description: "Animeret vandmåler-kort med live flow, forbrug og gateway-status",
  preview: true,
});
console.info(
  `%c HA WATER METER CARD %c v${VERSION} `,
  "color:white;background:#357fc4;font-weight:700",
  "color:#69c4ff;background:#161b22",
);
