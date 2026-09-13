const VERSION = "0.5.0";

class HAPowerFlowCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._sig = "";
    this._id = "pfc" + Math.random().toString(36).slice(2, 8);
  }
  static getStubConfig() {
    return {
      title: "Strømpris",
      price_entity: "sensor.example_current_price",
      today_mean_entity: "sensor.example_today_mean",
      tomorrow_available_entity: "binary_sensor.example_tomorrow_available",
      house_power_entity: "sensor.example_house_power",
      ev_power_entity: "sensor.example_ev_power",
      daily_entity: "sensor.example_daily_usage",
      co2_entity: "sensor.example_co2_intensity",
      spot_entity: "sensor.example_spotprice",
    };
  }
  setConfig(config) {
    if (!config?.price_entity) throw new Error("Kortet kræver en price_entity");
    this._config = { title: "Strømpris", ...config };
    this._render();
  }
  _watchedIds() {
    const c = this._config;
    return [
      c.price_entity,
      c.today_mean_entity,
      c.tomorrow_available_entity,
      c.house_power_entity,
      c.ev_power_entity,
      c.daily_entity,
      c.co2_entity,
      c.fossil_pct_entity,
      c.spot_entity,
      c.distribution_entity,
      c.nettariff_entity,
      c.systemtariff_entity,
      c.tax_entity,
      c.surcharge_entity,
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
  _prices() {
    const raw = this._e(this._config.price_entity)?.attributes?.prices;
    return Array.isArray(raw) ? raw.filter((p) => Number.isFinite(Number(p?.price))) : [];
  }
  _tier(price, min, max) {
    if (!Number.isFinite(price) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min)
      return "mid";
    const pct = (price - min) / (max - min);
    if (pct < 0.34) return "low";
    if (pct < 0.67) return "mid";
    return "high";
  }
  _co2Color(v) {
    if (!Number.isFinite(v)) return "var(--secondary-text-color)";
    return v < 100 ? "var(--good)" : v < 200 ? "var(--warn)" : "var(--danger)";
  }
  _render() {
    if (!this.shadowRoot) return;
    const c = this._config;
    const current = this._num(c.price_entity);
    const prices = this._prices();
    const values = prices.map((p) => Number(p.price));
    const min = values.length ? Math.min(...values) : undefined;
    const max = values.length ? Math.max(...values) : undefined;
    const mean = this._num(c.today_mean_entity);
    const tier = this._tier(current, min, max);
    const tierLabel = { low: "Billig", mid: "Normal", high: "Dyr" }[tier];
    const tierColor = { low: "var(--good)", mid: "var(--warn)", high: "var(--danger)" }[tier];

    const housePowerW = this._num(c.house_power_entity);
    const houseKw = Number.isFinite(housePowerW) ? housePowerW / 1000 : undefined;
    const evKw = this._num(c.ev_power_entity);
    const evActive = Number.isFinite(evKw) && evKw > 0.05;
    const flowSpeed = Number.isFinite(houseKw) ? Math.max(0.5, 2.6 - houseKw * 0.8) : 1.8;
    const evFlowSpeed = evActive ? Math.max(0.4, 2 - evKw * 0.2) : 2;
    const houseGlow = Number.isFinite(houseKw) && houseKw > 0.05;

    const daily = this._num(c.daily_entity);
    const estCost = Number.isFinite(daily) && Number.isFinite(mean) ? daily * mean : undefined;
    const tomorrowOn = this._s(c.tomorrow_available_entity) === "on";

    const co2 = this._num(c.co2_entity);
    const fossilPct = this._num(c.fossil_pct_entity);
    const co2Color = this._co2Color(co2);

    const spot = this._num(c.spot_entity);
    const extras = [c.distribution_entity, c.nettariff_entity, c.systemtariff_entity, c.tax_entity, c.surcharge_entity]
      .map((id) => this._num(id))
      .filter((v) => Number.isFinite(v));
    const extrasSum = extras.length ? extras.reduce((a, b) => a + b, 0) : undefined;
    const breakdownTotal = Number.isFinite(spot) && Number.isFinite(extrasSum) ? spot + extrasSum : undefined;
    const spotPct = Number.isFinite(breakdownTotal) && breakdownTotal > 0 ? (spot / breakdownTotal) * 100 : 50;

    const now = new Date();
    const nowHour = now.getHours();

    this.shadowRoot.innerHTML = `<style>
      :host{display:block;--good:var(--dashboard-success, var(--success-color, #54d9aa));--warn:var(--dashboard-warning, var(--warning-color, #ffbd59));--danger:var(--dashboard-danger, var(--error-color, #ff667a));--accent:var(--dashboard-accent, var(--primary-color, #62b5ff));--edge:var(--dashboard-border-neutral, var(--divider-color, rgba(127,145,165,.2)));--card-surface:var(--dashboard-card-bg,var(--ha-card-background,var(--card-background-color,#111820)));--card-solid:var(--card-background-color,#111820)}
      *{box-sizing:border-box}
      ha-card{position:relative;overflow:hidden;padding:20px;border-radius:26px;background:linear-gradient(150deg,color-mix(in srgb,${tierColor} 6%,transparent),transparent 45%),var(--card-surface);border:1px solid color-mix(in srgb,var(--edge) 100%,transparent);color:var(--primary-text-color);box-shadow:var(--ha-card-box-shadow)}
      .head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
      .head-left small{display:block;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--secondary-text-color);font-weight:700}
      .price{display:flex;align-items:baseline;gap:6px;margin-top:4px}
      .price b{font-size:40px;font-weight:800;letter-spacing:-.02em}
      .price span{font-size:13px;color:var(--secondary-text-color);font-weight:700}
      .pill{padding:6px 13px;border-radius:999px;font-size:11px;font-weight:800;background:color-mix(in srgb,${tierColor} 18%,transparent);color:${tierColor};white-space:nowrap}
      .subrow{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}
      .subrow span{font-size:11px;color:var(--secondary-text-color)}
      .co2-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:800;background:color-mix(in srgb,${co2Color} 16%,transparent);color:${co2Color}}
      .co2-chip ha-icon{--mdc-icon-size:12px}

      .flow{position:relative;height:176px;margin:16px 0 6px;border:1px solid color-mix(in srgb,var(--accent) 22%,var(--edge));border-radius:22px;overflow:hidden;isolation:isolate;background:linear-gradient(160deg,color-mix(in srgb,var(--card-solid) 96%,var(--accent) 4%),color-mix(in srgb,var(--card-solid) 97%,${tierColor} 3%))}
      .flow:before{content:"";position:absolute;inset:0;z-index:-2;opacity:.45;background-image:linear-gradient(color-mix(in srgb,var(--primary-text-color) 5%,transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb,var(--primary-text-color) 5%,transparent) 1px,transparent 1px);background-size:24px 24px;mask-image:linear-gradient(to bottom,transparent,black 32%,transparent)}
      .flow:after{content:"";position:absolute;left:50%;top:48%;width:150px;height:150px;border-radius:50%;z-index:-1;transform:translate(-50%,-50%);background:color-mix(in srgb,var(--accent) 9%,transparent);filter:blur(18px);animation:core-breathe 3.2s ease-in-out infinite}
      .flow-svg{position:absolute;inset:0;width:100%;height:100%}
      .rail-rim{fill:none;stroke:color-mix(in srgb,var(--primary-text-color) 11%,transparent);stroke-width:8;stroke-linecap:round}
      .rail-core{fill:none;stroke:color-mix(in srgb,var(--card-solid) 88%,transparent);stroke-width:5;stroke-linecap:round}
      .cable{fill:none;stroke:var(--accent);stroke-width:2.8;stroke-linecap:round;stroke-dasharray:2 11;opacity:.82;filter:drop-shadow(0 0 5px color-mix(in srgb,var(--accent) 75%,transparent));animation:cable-dash linear infinite}
      .cable.branch{stroke:var(--good);filter:drop-shadow(0 0 5px color-mix(in srgb,var(--good) 75%,transparent))}
      .cable.idle{opacity:.08;animation-play-state:paused}
      @keyframes cable-dash{to{stroke-dashoffset:-28}}
      @keyframes core-breathe{0%,100%{transform:translate(-50%,-50%) scale(.82);opacity:.38}50%{transform:translate(-50%,-50%) scale(1.08);opacity:.75}}
      .spark{fill:var(--card-solid);stroke:var(--accent);stroke-width:2;filter:drop-shadow(0 0 5px var(--accent))}
      .spark.branch{stroke:var(--good);filter:drop-shadow(0 0 5px var(--good))}
      .spark.idle{display:none}
      .node{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;z-index:2;transition:transform .2s ease}
      .node:hover{transform:translate(-50%,-50%) scale(1.04)}
      .node-badge{position:relative;width:46px;height:46px}
      .ring{position:absolute;inset:0;border-radius:16px;border:1.5px solid var(--accent);opacity:0;animation:ring-ping 2.6s ease-out infinite}
      .ring.good{border-color:var(--good)}
      .node-icon{position:relative;display:grid;place-items:center;width:46px;height:46px;border-radius:16px;background:color-mix(in srgb,var(--card-solid) 84%,var(--accent) 16%);color:var(--accent);border:1px solid color-mix(in srgb,var(--accent) 42%,transparent);box-shadow:0 8px 24px color-mix(in srgb,var(--accent) 16%,transparent),inset 0 1px 0 color-mix(in srgb,var(--primary-text-color) 12%,transparent);backdrop-filter:blur(8px)}
      .node.home .node-badge,.node.home .node-icon{width:58px;height:58px}
      .node.home .node-icon{border-radius:20px;box-shadow:0 10px 34px color-mix(in srgb,var(--accent) 25%,transparent),inset 0 1px 0 color-mix(in srgb,var(--primary-text-color) 14%,transparent)}
      .node-icon.good{background:color-mix(in srgb,var(--card-solid) 84%,var(--good) 16%);color:var(--good);border-color:color-mix(in srgb,var(--good) 42%,transparent)}
      .node-icon.dim{opacity:.35;filter:grayscale(.4)}
      .node-icon ha-icon{--mdc-icon-size:23px}
      .node.home .node-icon ha-icon{--mdc-icon-size:29px}
      @keyframes ring-ping{0%{transform:scale(.9);opacity:.48}100%{transform:scale(1.55);opacity:0}}
      .node span{font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.09em;color:var(--secondary-text-color)}
      .node b{font-size:11px;font-weight:800;padding:3px 7px;border-radius:999px;background:color-mix(in srgb,var(--card-solid) 82%,transparent);border:1px solid color-mix(in srgb,var(--accent) 18%,var(--edge));backdrop-filter:blur(6px)}

      .breakdown{margin:18px 0 4px}
      .breakdown-head{display:flex;justify-content:space-between;font-size:10px;color:var(--secondary-text-color);margin-bottom:5px;text-transform:uppercase;font-weight:700;letter-spacing:.03em}
      .breakdown-bar{display:flex;height:10px;border-radius:999px;overflow:hidden;background:var(--edge)}
      .breakdown-bar i.spot{display:block;height:100%;background:var(--accent)}
      .breakdown-bar i.rest{display:block;height:100%;background:color-mix(in srgb,var(--primary-text-color) 30%,transparent)}
      .breakdown-legend{display:flex;gap:14px;margin-top:6px;font-size:10px;color:var(--secondary-text-color)}
      .breakdown-legend b{color:var(--primary-text-color)}
      .dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:4px}
      .dot.spot{background:var(--accent)}
      .dot.rest{background:color-mix(in srgb,var(--primary-text-color) 30%,transparent)}

      .legend{display:flex;gap:8px;margin:18px 0 8px}
      .legend .chip{display:flex;align-items:center;gap:5px;padding:4px 9px;border-radius:999px;font-size:10px;font-weight:800}
      .legend .chip.low{background:color-mix(in srgb,var(--good) 16%,transparent);color:var(--good)}
      .legend .chip.mid{background:color-mix(in srgb,var(--warn) 16%,transparent);color:var(--warn)}
      .legend .chip.high{background:color-mix(in srgb,var(--danger) 16%,transparent);color:var(--danger)}

      .chart{display:flex;align-items:flex-end;gap:3px;height:80px;padding:4px 2px}
      .bar{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;cursor:pointer}
      .bar i{display:block;width:100%;border-radius:4px 4px 1px 1px;min-height:3px}
      .bar.low i{background:var(--good)}
      .bar.mid i{background:var(--warn)}
      .bar.high i{background:var(--danger)}
      .bar.now i{box-shadow:0 0 0 2px var(--primary-text-color)}
      .bar.now{transform:translateY(-2px)}
      .axis{display:flex;justify-content:space-between;margin-top:4px;font-size:8px;color:var(--secondary-text-color)}

      .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:18px}
      .stat{padding:11px;border:1px solid color-mix(in srgb,var(--accent) 16%,transparent);border-left:3px solid var(--accent);border-radius:14px;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 6%,transparent),transparent 55%);box-shadow:0 4px 12px rgba(0,0,0,.08);text-align:center}
      .stat span{display:block;font-size:9px;color:var(--secondary-text-color);text-transform:uppercase;font-weight:700;letter-spacing:.03em}
      .stat b{display:block;margin-top:4px;font-size:14px;font-weight:800}
      @media(max-width:420px){.price b{font-size:32px}.stats{grid-template-columns:1fr 1fr}.flow{height:164px}.node-badge,.node-icon{width:42px;height:42px}.node.home .node-badge,.node.home .node-icon{width:54px;height:54px}}
      @media(prefers-reduced-motion:reduce){.cable,.ring,.flow:after{animation:none!important}.spark{display:none!important}}
    </style>
    <ha-card>
      <div class="head">
        <div class="head-left">
          <small>${this._esc(c.title)}</small>
          <div class="price"><b>${this._fmt(current)}</b><span>kr/kWh</span></div>
          <div class="subrow">
            <span>Gennemsnit i dag: ${this._fmt(mean)} kr</span>
            ${Number.isFinite(co2) ? `<span class="co2-chip"><ha-icon icon="mdi:molecule-co2"></ha-icon>${this._fmt(co2, 0)} g/kWh${Number.isFinite(fossilPct) ? ` · ${this._fmt(fossilPct, 0)}% fossil` : ""}</span>` : ""}
          </div>
        </div>
        <span class="pill">${this._esc(tierLabel)}</span>
      </div>

      <div class="flow">
        <svg class="flow-svg" viewBox="0 0 300 170" preserveAspectRatio="none" aria-hidden="true">
          <path id="${this._id}-main" class="rail-rim" d="M48 91 C78 91 95 66 150 66"/>
          <path class="rail-core" d="M48 91 C78 91 95 66 150 66"/>
          <path class="cable" d="M48 91 C78 91 95 66 150 66" style="animation-duration:${flowSpeed}s"/>
          <path id="${this._id}-branch" class="rail-rim" d="M150 66 C196 66 205 105 252 105"/>
          <path class="rail-core" d="M150 66 C196 66 205 105 252 105"/>
          <path class="cable branch ${evActive ? "" : "idle"}" d="M150 66 C196 66 205 105 252 105" style="animation-duration:${evFlowSpeed}s"/>
          <circle class="spark" r="3.2">
            <animateMotion dur="${flowSpeed}s" repeatCount="indefinite"><mpath href="#${this._id}-main"/></animateMotion>
          </circle>
          <circle class="spark" r="3.2" style="animation-delay:${flowSpeed / 2}s">
            <animateMotion dur="${flowSpeed}s" begin="${flowSpeed / 2}s" repeatCount="indefinite"><mpath href="#${this._id}-main"/></animateMotion>
          </circle>
          <circle class="spark branch ${evActive ? "" : "idle"}" r="3">
            <animateMotion dur="${evFlowSpeed}s" repeatCount="indefinite"><mpath href="#${this._id}-branch"/></animateMotion>
          </circle>
        </svg>
        <div class="node" style="left:16%;top:53.5%" data-more="${this._esc(c.house_power_entity)}">
          <div class="node-badge"><span class="ring"></span><span class="node-icon"><ha-icon icon="mdi:transmission-tower"></ha-icon></span></div>
          <span>Nettet</span>
        </div>
        <div class="node home" style="left:50%;top:38.8%" data-more="${this._esc(c.house_power_entity)}">
          <div class="node-badge"><span class="ring ${houseGlow ? "" : "idle"}" style="${houseGlow ? "" : "display:none"}"></span><span class="node-icon"><ha-icon icon="mdi:home-lightning-bolt-outline"></ha-icon></span></div>
          <span>Hus</span>
          <b>${Number.isFinite(houseKw) ? `${this._fmt(houseKw, 2)} kW` : "—"}</b>
        </div>
        <div class="node" style="left:84%;top:61.8%" data-more="${this._esc(c.ev_power_entity)}">
          <div class="node-badge"><span class="ring good" style="${evActive ? "" : "display:none"}"></span><span class="node-icon good ${evActive ? "" : "dim"}"><ha-icon icon="mdi:car-electric-outline"></ha-icon></span></div>
          <span>Bil</span>
          <b>${evActive ? `${this._fmt(evKw, 1)} kW` : "Fra"}</b>
        </div>
      </div>

      ${
        Number.isFinite(spot) && Number.isFinite(extrasSum)
          ? `<div class="breakdown">
        <div class="breakdown-head"><span>Prisens sammensætning</span><span>${this._fmt(breakdownTotal)} kr</span></div>
        <div class="breakdown-bar"><i class="spot" style="width:${spotPct}%"></i><i class="rest" style="width:${100 - spotPct}%"></i></div>
        <div class="breakdown-legend"><span><span class="dot spot"></span>Spotpris <b>${this._fmt(spot)}</b></span><span><span class="dot rest"></span>Net & afgifter <b>${this._fmt(extrasSum)}</b></span></div>
      </div>`
          : ""
      }

      <div class="legend">
        <span class="chip low">Lav ${this._fmt(min)}</span>
        <span class="chip mid">Snit ${this._fmt(mean)}</span>
        <span class="chip high">Høj ${this._fmt(max)}</span>
      </div>
      <div class="chart">
        ${prices
          .map((p, i) => {
            const price = Number(p.price);
            const t = this._tier(price, min, max);
            const h = Number.isFinite(min) && Number.isFinite(max) && max > min
              ? 8 + ((price - min) / (max - min)) * 92
              : 50;
            const hour = new Date(p.start).getHours();
            return `<div class="bar ${t} ${hour === nowHour ? "now" : ""}" data-tip="${this._esc(this._fmt(price))} kr"><i style="height:${h}%"></i></div>`;
          })
          .join("")}
      </div>
      <div class="axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>

      <div class="stats">
        <div class="stat"><span>Forbrug i dag</span><b>${Number.isFinite(daily) ? `${this._fmt(daily, 1)} kWh` : "—"}</b></div>
        <div class="stat"><span>Est. pris i dag</span><b>${Number.isFinite(estCost) ? `${this._fmt(estCost, 0)} kr` : "—"}</b></div>
        <div class="stat"><span>I morgen</span><b>${tomorrowOn ? "Tilgængelig" : "Afventer"}</b></div>
      </div>
    </ha-card>`;

    this.shadowRoot.querySelectorAll("[data-more]").forEach((el) => {
      el.addEventListener("click", () => {
        if (el.dataset.more) this._more(el.dataset.more);
      });
    });
    this.shadowRoot.querySelectorAll(".bar[data-tip]").forEach((el) => {
      el.setAttribute("title", el.dataset.tip);
    });
  }
  getCardSize() {
    return 10;
  }
}

if (!customElements.get("ha-power-flow-card"))
  customElements.define("ha-power-flow-card", HAPowerFlowCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha-power-flow-card",
  name: "HA Power Flow Card",
  description: "Samlet strømpris-kort med animeret effekt-flow, CO2-intensitet, prissammensætning, 24-timers prisgraf og dagsstatistik",
  preview: true,
});
console.info(
  `%c HA POWER FLOW CARD %c v${VERSION} `,
  "color:white;background:#2f9e6e;font-weight:700",
  "color:#b6f0d6;background:#161b22",
);
