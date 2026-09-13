class PoolForecastCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("hui-entities-card-editor");
  }

  static getStubConfig() {
    return {
      type: "custom:pool-forecast-card",
      title: "Pooltemperatur forecast",
      forecast_entity: "sensor.pool_forventet_vandtemperatur",
      temp_entity: "sensor.pool_vandtemperatur",
      weather_entity: "sensor.weather_forecast",
    };
  }

  setConfig(config) {
    this.config = {
      title: "Pooltemperatur forecast",
      subtitle: "Vejrbaseret estimat med usikkerhedsinterval",
      forecast_entity: "sensor.pool_forventet_vandtemperatur",
      temp_entity: "sensor.pool_vandtemperatur",
      weather_entity: "sensor.weather_forecast",
      ...config,
    };
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 5;
  }

  _num(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  _fmt(value, digits = 1) {
    return Number.isFinite(value) ? value.toFixed(digits) : "--";
  }

  _escape(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  _parsePoints() {
    const forecast = this._hass?.states?.[this.config.forecast_entity];
    const raw = forecast?.attributes?.forecast_points;
    let points = [];

    if (Array.isArray(raw)) {
      points = raw;
    } else if (typeof raw === "string" && raw.trim()) {
      try {
        points = JSON.parse(raw);
      } catch (err) {
        points = [];
      }
    }

    return points
      .map((point, index) => ({
        datetime: point.datetime,
        ts: Date.parse(point.datetime || ""),
        temp: this._num(point.temp),
        uncertainty: Math.min(1.8, 0.35 + index * 0.28),
      }))
      .filter((point) => Number.isFinite(point.ts) && Number.isFinite(point.temp))
      .sort((a, b) => a.ts - b.ts);
  }

  _weatherPoints() {
    const weather = this._hass?.states?.[this.config.weather_entity]?.attributes || {};
    const points = [{
      ts: Date.now(),
      high: this._num(weather.today_temp),
      low: this._num(weather.today_templow),
      rain: this._num(weather.today_precipitation) || 0,
      wind: this._num(weather.today_wind_speed),
      condition: weather.today_condition || "",
      icon: weather.today_icon || "",
    }];

    for (let i = 1; i <= 5; i += 1) {
      const dt = weather[`forc${i}_datetime`];
      const ts = Date.parse(dt || "");
      if (!Number.isFinite(ts)) continue;
      points.push({
        ts,
        high: this._num(weather[`forc${i}_temp`]),
        low: this._num(weather[`forc${i}_templow`]),
        rain: this._num(weather[`forc${i}_precipitation`]) || 0,
        wind: this._num(weather[`forc${i}_wind_speed`]),
        condition: weather[`forc${i}_condition`] || "",
        icon: weather[`forc${i}_icon`] || "",
      });
    }

    return points;
  }

  _dayKey(ts) {
    const date = new Date(ts);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }

  _label(ts, short = false) {
    const date = new Date(ts);
    const names = ["Søn", "Man", "Tir", "Ons", "Tor", "Fre", "Lør"];
    return short ? names[date.getDay()] : `${names[date.getDay()]} ${date.getDate()}/${date.getMonth() + 1}`;
  }

  _mergePoints() {
    const weatherByDay = new Map(this._weatherPoints().map((item) => [this._dayKey(item.ts), item]));
    return this._parsePoints().map((point, index) => ({
      ...point,
      label: index === 0 ? "I dag" : this._label(point.ts),
      ...(weatherByDay.get(this._dayKey(point.ts)) || {}),
    }));
  }

  _path(points, x, y, key) {
    return points
      .map((point, index) => ({ point, index }))
      .filter(({ point }) => Number.isFinite(point[key]))
      .map(({ point, index }, part) => `${part ? "L" : "M"} ${x(index)} ${y(point[key])}`)
      .join(" ");
  }

  _renderChart(points) {
    if (!points.length) return `<div class="empty">Forecast-data er ikke klar endnu</div>`;

    const chartPoints = points.map((point) => ({
      ...point,
      upper: point.temp + point.uncertainty,
      lower: point.temp - point.uncertainty,
    }));
    const values = chartPoints.flatMap((point) => [point.upper, point.lower]);
    const min = Math.floor(Math.min(...values) - 0.35);
    const max = Math.ceil(Math.max(...values) + 0.35);
    const left = 42;
    const right = 20;
    const top = 25;
    const bottom = 40;
    const width = 760;
    const height = 224;
    const plotW = width - left - right;
    const plotH = height - top - bottom;
    const count = Math.max(1, chartPoints.length - 1);
    const x = (index) => Math.round((left + (plotW * index) / count) * 10) / 10;
    const y = (value) => Math.round((top + (1 - (value - min) / Math.max(1, max - min)) * plotH) * 10) / 10;
    const estimatePath = this._path(chartPoints, x, y, "temp");
    const upperPath = this._path(chartPoints, x, y, "upper");
    const lowerReverse = [...chartPoints].reverse().map((point, reverseIndex) => {
      const index = chartPoints.length - 1 - reverseIndex;
      return `L ${x(index)} ${y(point.lower)}`;
    }).join(" ");
    const bandPath = `${upperPath} ${lowerReverse} Z`;
    const mid = Math.round((min + max) / 2);

    const labels = chartPoints.map((point, index) => {
      const anchor = index === 0 ? "start" : index === chartPoints.length - 1 ? "end" : "middle";
      const dx = index === 0 ? 2 : index === chartPoints.length - 1 ? -2 : 0;
      return `<text class="date-label" x="${x(index) + dx}" y="${height - 12}" text-anchor="${anchor}">${this._escape(point.label)}</text>`;
    }).join("");

    const dots = chartPoints.map((point, index) => `
      <g>
        <title>${this._escape(point.label)}: ${this._fmt(point.temp)} ± ${this._fmt(point.uncertainty)} °C</title>
        <circle class="dot estimate" cx="${x(index)}" cy="${y(point.temp)}" r="4.5"></circle>
        <text class="value estimate-value" x="${x(index)}" y="${Math.max(14, y(point.temp) - 11)}" text-anchor="middle">${this._fmt(point.temp)}&deg;</text>
      </g>
    `).join("");

    return `
      <svg class="chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Forventet pooltemperatur med usikkerhedsinterval">
        <defs>
          <linearGradient id="forecastBand" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stop-color="#f59e0b" stop-opacity=".24"></stop>
            <stop offset="1" stop-color="#f59e0b" stop-opacity=".04"></stop>
          </linearGradient>
        </defs>
        <line class="grid" x1="${left}" x2="${width - right}" y1="${top}" y2="${top}"></line>
        <line class="grid" x1="${left}" x2="${width - right}" y1="${y(mid)}" y2="${y(mid)}"></line>
        <line class="grid" x1="${left}" x2="${width - right}" y1="${height - bottom}" y2="${height - bottom}"></line>
        <text class="axis" x="8" y="${top + 4}">${max}&deg;</text>
        <text class="axis" x="8" y="${y(mid) + 4}">${mid}&deg;</text>
        <text class="axis" x="8" y="${height - bottom + 4}">${min}&deg;</text>
        <path class="uncertainty-band" d="${bandPath}"></path>
        <path class="estimate-line" d="${estimatePath}"></path>
        ${dots}
        ${labels}
      </svg>
    `;
  }

  _renderWeather(points) {
    const days = points.filter((point) => Number.isFinite(point.high)).slice(0, 5);
    if (!days.length) return "";

    return `<div class="weather-days">${days.map((point) => {
      const icon = typeof point.icon === "string" && point.icon.startsWith("/local/")
        ? `<img src="${this._escape(point.icon)}" alt="">`
        : `<ha-icon icon="mdi:weather-partly-cloudy"></ha-icon>`;
      const wind = Number.isFinite(point.wind) ? `<span>${this._fmt(point.wind)} m/s</span>` : "";
      return `
        <div class="weather-day">
          <div class="weather-day-name">${this._escape(this._label(point.ts, true))}</div>
          ${icon}
          <div class="weather-range-text"><b>${this._fmt(point.high, 0)}&deg;</b><span>${this._fmt(point.low, 0)}&deg;</span></div>
          <div class="weather-meta"><span>${this._fmt(point.rain, 1)} mm</span>${wind}</div>
          <div class="weather-condition">${this._escape(point.condition)}</div>
        </div>`;
    }).join("")}</div>`;
  }

  _render() {
    if (!this.shadowRoot) return;
    const forecastState = this._hass?.states?.[this.config?.forecast_entity];
    const points = this._mergePoints();
    const today = points.length ? points[0].temp : this._num(forecastState?.state);
    const tomorrow = points.length > 1 ? points[1].temp : this._num(forecastState?.state);
    const last = points.length ? points[points.length - 1].temp : null;
    const currentTemp = this._num(this._hass?.states?.[this.config?.temp_entity]?.state);
    const delta = Number.isFinite(last) && Number.isFinite(currentTemp) ? last - currentTemp : null;
    const deltaText = Number.isFinite(delta) ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}&deg;` : "--";
    const accent = Number.isFinite(delta) ? (delta > 1 ? "#f59e0b" : delta < -1 ? "#3b82f6" : "#14b8a6") : "#0891b2";
    const model = forecastState?.attributes?.model || "Vejrbaseret estimat; faktisk temperatur kan afvige.";

    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;--pool-estimate:#f59e0b;--pool-high:#ef4444;--pool-low:#3b82f6;--pool-accent:${accent}}
        ha-card{position:relative;overflow:hidden;border-radius:18px;border-left:4px solid var(--pool-accent);background:var(--surface);box-shadow:var(--dashboard-shadow-soft);padding:16px 18px 14px;box-sizing:border-box}
        .bg-icon{position:absolute;right:-34px;bottom:-34px;width:178px;height:178px;opacity:.18;color:var(--pool-accent);pointer-events:none;z-index:0}
        .bg-icon-inner{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;width:100%;height:100%;animation:poolForecastIconFloat 6s ease-in-out infinite;transform-origin:center;will-change:transform}
        .bg-icon-inner ha-icon{display:block;width:178px!important;height:178px!important;--mdc-icon-size:178px;animation:poolForecastIconPulse 3.2s ease-in-out infinite;transform-origin:center;filter:drop-shadow(0 0 8px color-mix(in srgb,var(--dashboard-icon-muted) 22%,transparent));will-change:transform,opacity}
        @keyframes poolForecastIconFloat{0%{transform:translate(0,0) rotate(0deg) scale(1)}50%{transform:translate(-8px,-6px) rotate(-4deg) scale(1.05)}100%{transform:translate(0,0) rotate(0deg) scale(1)}}
        @keyframes poolForecastIconPulse{0%{transform:scale(1);opacity:.95}50%{transform:scale(1.09);opacity:1}100%{transform:scale(1);opacity:.95}}
        .header{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:start;position:relative;z-index:1}.title-main{font-size:20px;line-height:1.05;font-weight:850;color:var(--primary-text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.title-sub{margin-top:4px;font-size:13px;line-height:1.2;font-weight:650;color:var(--secondary-text-color)}
        .stats{display:flex;gap:7px;justify-content:flex-end}.badge{min-width:70px;height:44px;border-radius:12px;display:flex;flex-direction:column;justify-content:center;align-items:center;line-height:1;color:#07111f;box-shadow:0 7px 16px rgba(0,0,0,.16);background:linear-gradient(135deg,var(--badge-color),color-mix(in srgb,var(--badge-color) 74%,black 26%))}.badge span{font-size:9px;font-weight:900;letter-spacing:.06em}.badge strong{margin-top:3px;font-size:19px;font-weight:900}
        .chart-wrap{position:relative;z-index:1;margin-top:8px;overflow:hidden}.chart{width:100%;height:auto;display:block;aspect-ratio:760/224}.grid{stroke:color-mix(in srgb,var(--secondary-text-color) 20%,transparent);stroke-width:1}.axis,.date-label{fill:var(--secondary-text-color);font-size:13px;font-weight:750}.uncertainty-band{fill:url(#forecastBand)}.estimate-line{fill:none;stroke:var(--pool-estimate);stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 0 5px color-mix(in srgb,var(--pool-estimate) 28%,transparent))}.dot.estimate{fill:var(--pool-estimate)}.value{font-size:14px;font-weight:900;paint-order:stroke;stroke:rgba(0,0,0,.52);stroke-width:3px;stroke-linejoin:round}.estimate-value{fill:#fbbf24}
        .legend{display:flex;flex-wrap:wrap;gap:7px 13px;align-items:center;margin-top:2px;color:var(--secondary-text-color);font-size:13px;line-height:18px;position:relative;z-index:1}.legend span{display:inline-flex;gap:6px;align-items:center}.legend i{width:18px;height:3px;border-radius:99px;display:inline-block;background:var(--legend-color)}.legend i.band{height:8px;opacity:.38}
        .weather-days{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;margin-top:11px;position:relative;z-index:1}.weather-day{min-width:0;border-radius:13px;padding:9px 6px 8px;text-align:center;background:color-mix(in srgb,var(--surface) 76%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--pool-accent) 15%,transparent)}.weather-day-name{font-size:12px;font-weight:900;color:var(--primary-text-color)}.weather-day img,.weather-day ha-icon{display:block;width:32px;height:32px;margin:3px auto;color:var(--pool-accent)}.weather-range-text{display:flex;justify-content:center;gap:5px;font-size:13px}.weather-range-text b{color:#fca5a5}.weather-range-text span{color:#93c5fd}.weather-meta{display:flex;justify-content:center;gap:5px;margin-top:3px;font-size:10px;color:var(--secondary-text-color);white-space:nowrap}.weather-condition{margin-top:3px;font-size:10px;line-height:1.15;color:var(--secondary-text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .model{margin-top:8px;font-size:12px;line-height:1.35;color:var(--secondary-text-color);opacity:.85;position:relative;z-index:1}.empty{min-height:132px;display:grid;place-items:center;color:var(--secondary-text-color);font-size:14px;font-weight:650}
        @media(max-width:720px){ha-card{border-radius:16px;padding:13px 12px 11px}.header{grid-template-columns:1fr;gap:8px}.stats{justify-content:flex-start}.title-main{font-size:18px}.title-sub{font-size:12px}.badge{min-width:62px;height:40px;border-radius:10px}.badge span{font-size:8px}.badge strong{font-size:17px}.chart{aspect-ratio:760/260}.axis,.date-label{font-size:13px;font-weight:800}.value{font-size:14px;stroke-width:4px}.weather-days{gap:4px}.weather-day{padding:7px 3px}.weather-day-name{font-size:11px}.weather-range-text{font-size:12px}.weather-day img,.weather-day ha-icon{width:28px;height:28px}.weather-meta{font-size:9px}.weather-meta span:nth-child(2){display:none}.weather-condition{display:none}.model{font-size:11px}}
        @media(prefers-reduced-motion:reduce){.bg-icon-inner,.bg-icon-inner ha-icon{animation:none}}
      </style>
      <ha-card>
        <div class="bg-icon"><div class="bg-icon-inner"><ha-icon icon="mdi:thermometer-lines"></ha-icon></div></div>
        <div class="header">
          <div><div class="title-main">${this._escape(this.config?.title)}</div><div class="title-sub">${this._escape(this.config?.subtitle)}</div></div>
          <div class="stats">
            <div class="badge" style="--badge-color:var(--pool-low)"><span>I DAG</span><strong>${this._fmt(today)}&deg;</strong></div>
            <div class="badge" style="--badge-color:var(--pool-estimate)"><span>I MORGEN</span><strong>${this._fmt(tomorrow)}&deg;</strong></div>
            <div class="badge" style="--badge-color:var(--pool-accent)"><span>4 DAGE</span><strong>${deltaText}</strong></div>
          </div>
        </div>
        <div class="chart-wrap">${this._renderChart(points)}</div>
        <div class="legend"><span><i style="--legend-color:var(--pool-estimate)"></i>Pool-estimat</span><span><i class="band" style="--legend-color:var(--pool-estimate)"></i>Forventet usikkerhed</span></div>
        ${this._renderWeather(points)}
        <div class="model">${this._escape(model)}</div>
      </ha-card>`;
  }
}

if (!customElements.get("pool-forecast-card")) customElements.define("pool-forecast-card", PoolForecastCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "pool-forecast-card",
  name: "Pool Forecast Card",
  description: "Pool temperature forecast with uncertainty and weather context.",
});
