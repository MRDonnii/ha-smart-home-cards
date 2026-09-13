import "./hourly-weather-scroll-card-assets.js";

class HourlyWeatherScrollCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._drag = null;
  }

  setConfig(config) {
    this._config = config || {};
    this._entityId = this._config.entity || "sensor.weather_forecast";
  }

  set hass(hass) {
    this._hass = hass;
    const entity = hass.states[this._entityId];
    const signature = entity?.last_updated || "missing";
    if (signature !== this._signature) {
      this._signature = signature;
      this._render();
    }
  }

  getCardSize() {
    return 3;
  }

  _render() {
    const entity = this._hass?.states?.[this._entityId];
    const rows = entity?.attributes?.hourly_forecast;
    const forecast = Array.isArray(rows)
      ? rows.filter((row) => new Date(row.datetime).getTime() >= Date.now() - 3600000).slice(0, 24)
      : [];

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card {
          box-sizing: border-box;
          margin-top: 10px;
          padding: 16px 14px 8px;
          overflow: hidden;
          border-radius: 24px;
          background: var(--popupBG, var(--card-background-color));
          box-shadow: var(--ha-card-box-shadow);
          user-select: none;
          -webkit-user-select: none;
        }
        .heading {
          padding: 0 5px 11px;
          color: var(--primary-text-color);
          font-size: 14px;
          font-weight: 600;
          opacity: .82;
        }
        .scroll {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          overflow-y: hidden;
          padding: 2px 2px 10px;
          overscroll-behavior: contain;
          touch-action: none;
          cursor: grab;
          will-change: scroll-position;
          scrollbar-width: thin;
          scrollbar-color: color-mix(in srgb, var(--state-info-badge-bg) 35%, transparent) transparent;
        }
        .scroll.dragging { cursor: grabbing; }
        .hour {
          box-sizing: border-box;
          flex: 0 0 88px;
          padding: 12px 8px 11px;
          text-align: center;
          border: 1px solid color-mix(in srgb, var(--state-info-badge-bg) 14%, transparent);
          border-radius: 18px;
          background: color-mix(in srgb, var(--state-info-badge-bg) 8%, transparent);
        }
        .time { color: var(--primary-text-color); font-size: 13px; font-weight: 600; }
        img { display: block; width: 45px; height: 45px; margin: 6px auto 2px; object-fit: contain; pointer-events: none; }
        .temp { color: var(--primary-text-color); font-size: 22px; font-weight: 500; line-height: 1.15; }
        .rain { margin-top: 7px; color: var(--secondary-text-color); font-size: 11px; white-space: nowrap; }
        .wind { margin-top: 3px; color: var(--secondary-text-color); font-size: 10px; white-space: nowrap; }
        .empty { padding: 18px; color: var(--secondary-text-color); }
      </style>
      <ha-card>
        <div class="heading">Time for time</div>
        ${forecast.length ? `<div class="scroll">${forecast.map((row) => this._hour(row)).join("")}</div>` : `<div class="empty">Timeprognosen er ikke klar endnu</div>`}
      </ha-card>`;

    const scroller = this.shadowRoot.querySelector(".scroll");
    if (!scroller) return;
    const stop = (event) => event.stopPropagation();
    ["click", "dblclick", "touchstart", "touchmove", "touchend"].forEach((type) =>
      scroller.addEventListener(type, stop, { passive: true })
    );
    scroller.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      this._stopMomentum();
      this._drag = {
        x: event.clientX,
        lastX: event.clientX,
        lastTime: performance.now(),
        left: scroller.scrollLeft,
        velocity: 0,
        id: event.pointerId
      };
      scroller.classList.add("dragging");
      scroller.setPointerCapture?.(event.pointerId);
    });
    scroller.addEventListener("pointermove", (event) => {
      if (!this._drag) return;
      event.stopPropagation();
      event.preventDefault();
      scroller.scrollLeft = this._drag.left - (event.clientX - this._drag.x);
      const now = performance.now();
      const elapsed = Math.max(1, now - this._drag.lastTime);
      this._drag.velocity = (this._drag.lastX - event.clientX) / elapsed;
      this._drag.lastX = event.clientX;
      this._drag.lastTime = now;
    });
    const endDrag = (event) => {
      event.stopPropagation();
      const velocity = this._drag?.velocity || 0;
      this._drag = null;
      scroller.classList.remove("dragging");
      this._startMomentum(scroller, velocity);
    };
    scroller.addEventListener("pointerup", endDrag);
    scroller.addEventListener("pointercancel", endDrag);
    scroller.addEventListener("wheel", (event) => {
      event.stopPropagation();
      if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) scroller.scrollLeft += event.deltaY;
    }, { passive: true });
  }

  _stopMomentum() {
    if (this._momentumFrame) cancelAnimationFrame(this._momentumFrame);
    this._momentumFrame = null;
  }

  _startMomentum(scroller, velocity) {
    this._stopMomentum();
    let speed = velocity * 16;
    const glide = () => {
      if (Math.abs(speed) < 0.08) {
        this._momentumFrame = null;
        return;
      }
      scroller.scrollLeft += speed;
      speed *= 0.93;
      this._momentumFrame = requestAnimationFrame(glide);
    };
    this._momentumFrame = requestAnimationFrame(glide);
  }

  _hour(row) {
    const date = new Date(row.datetime);
    const time = date.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
    const condition = row.condition || "cloudy";
    const temperature = Number.isFinite(Number(row.temperature)) ? `${Math.round(Number(row.temperature))}\u00b0` : "-";
    const rain = Number.isFinite(Number(row.precipitation_probability)) ? `${Math.round(Number(row.precipitation_probability))}%` : "-";
    const wind = Number.isFinite(Number(row.wind_speed)) ? `${(Number(row.wind_speed) / 3.6).toFixed(1)} m/s` : "-";
    const icon = window.HAHourlyWeatherAssets?.weather?.[condition] || window.HAHourlyWeatherAssets?.weather?.["not-available"] || "";
    return `<div class="hour"><div class="time">${time}</div><img src="${icon}" alt=""><div class="temp">${temperature}</div><div class="rain">&#128167; ${rain}</div><div class="wind">${wind}</div></div>`;
  }
}

if (!customElements.get("hourly-weather-scroll-card")) {
  customElements.define("hourly-weather-scroll-card", HourlyWeatherScrollCard);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "hourly-weather-scroll-card",
  name: "Hourly Weather Scroll Card",
  description: "Non-clickable horizontally draggable hourly forecast"
});
