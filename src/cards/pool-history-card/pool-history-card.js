class PoolHistoryCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("hui-entities-card-editor");
  }

  static getStubConfig() {
    return {
      type: "custom:pool-history-card",
      title: "Pooltemperatur",
      temp_entity: "sensor.pool_vandtemperatur",
      pump_entity: "sensor.poolpumpe_koeretid_i_dag",
      days: 7,
    };
  }

  setConfig(config) {
    this.config = {
      title: "Pooltemperatur",
      subtitle: "H\u00f8j/lav vandtemperatur og sandfilter",
      temp_entity: "sensor.pool_vandtemperatur",
      pump_entity: "sensor.poolpumpe_koeretid_i_dag",
      days: 7,
      ...config,
    };
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }
    this._data = null;
    this._loading = false;
    this._lastFetch = 0;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const now = Date.now();
    if (!this._loading && (!this._data || now - this._lastFetch > 10 * 60 * 1000)) {
      this._fetchHistory();
    }
    this._render();
  }

  getCardSize() {
    return 4;
  }

  async _fetchHistory() {
    if (!this._hass || !this.config) return;
    this._loading = true;
    this._error = null;
    this._render();

    try {
      const days = Math.max(2, Number(this.config.days) || 7);
      const start = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      const entities = [this.config.temp_entity, this.config.pump_entity].filter(Boolean).join(",");
      const url = `history/period/${encodeURIComponent(start.toISOString())}?end_time=${encodeURIComponent(end.toISOString())}&filter_entity_id=${encodeURIComponent(entities)}&minimal_response`;
      const history = await this._hass.callApi("GET", url);
      this._data = this._buildDays(history || [], start, end);
      this._lastFetch = Date.now();
    } catch (err) {
      this._error = err?.message || String(err);
    } finally {
      this._loading = false;
      this._render();
    }
  }

  _buildDays(history, start, end) {
    const tempEntity = this.config.temp_entity;
    const pumpEntity = this.config.pump_entity;
    const byEntity = new Map();

    for (const series of history) {
      const entityId = series?.[0]?.entity_id;
      if (entityId) byEntity.set(entityId, series);
    }

    const tempSeries = byEntity.get(tempEntity) || [];
    const pumpSeries = byEntity.get(pumpEntity) || [];
    const days = [];
    const cursor = new Date(start);

    while (cursor <= end) {
      const dayStart = new Date(cursor);
      const dayEnd = new Date(cursor);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const tempValues = this._valuesInRange(tempSeries, dayStart, dayEnd);
      const pumpValues = this._valuesInRange(pumpSeries, dayStart, dayEnd);
      const high = tempValues.length ? Math.max(...tempValues) : null;
      const low = tempValues.length ? Math.min(...tempValues) : null;
      const avg = tempValues.length ? tempValues.reduce((a, b) => a + b, 0) / tempValues.length : null;
      const pump = pumpValues.length ? Math.max(...pumpValues) : null;

      days.push({
        date: new Date(cursor),
        label: `${cursor.getDate()}/${cursor.getMonth() + 1}`,
        high,
        low,
        avg,
        pump,
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    return days.filter((day) => day.high !== null || day.low !== null || day.pump !== null);
  }

  _valuesInRange(series, start, end) {
    const startMs = start.getTime();
    const endMs = end.getTime();
    const values = [];

    for (const state of series) {
      const ts = Date.parse(state.last_changed || state.last_updated || "");
      const value = Number(state.state);
      if (!Number.isFinite(ts) || !Number.isFinite(value)) continue;
      if (ts >= startMs && ts < endMs) values.push(value);
    }

    return values;
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

  _path(points, x, y, key) {
    const usable = points
      .map((point, index) => ({ point, index }))
      .filter(({ point }) => Number.isFinite(point[key]));
    if (!usable.length) return "";

    return usable
      .map(({ point, index }, part) => `${part ? "L" : "M"} ${x(index)} ${y(point[key])}`)
      .join(" ");
  }

  _renderChart(days) {
    if (!days?.length) {
      return `<div class="empty">Ingen historik fundet endnu</div>`;
    }

    const tempValues = days.flatMap((day) => [day.high, day.low]).filter(Number.isFinite);
    const pumpValues = days.map((day) => day.pump).filter(Number.isFinite);
    const minTemp = tempValues.length ? Math.min(...tempValues) : 0;
    const maxTemp = tempValues.length ? Math.max(...tempValues) : 1;
    const yMin = Math.floor(Math.max(0, minTemp - 1));
    const yMax = Math.ceil(maxTemp + 1);
    const pumpMax = Math.max(1, ...pumpValues);
    const left = 42;
    const right = 20;
    const top = 18;
    const bottom = 40;
    const width = 760;
    const height = 226;
    const plotW = width - left - right;
    const plotH = height - top - bottom;
    const count = Math.max(1, days.length - 1);
    const x = (index) => Math.round((left + (plotW * index) / count) * 10) / 10;
    const y = (value) => Math.round((top + (1 - (value - yMin) / Math.max(1, yMax - yMin)) * plotH) * 10) / 10;
    const highPath = this._path(days, x, y, "high");
    const lowPath = this._path(days, x, y, "low");
    const bandPoints = days
      .map((day, index) => ({ day, index }))
      .filter(({ day }) => Number.isFinite(day.high) && Number.isFinite(day.low));
    const bandPath = bandPoints.length > 1
      ? `${bandPoints.map(({ day, index }, part) => `${part ? "L" : "M"} ${x(index)} ${y(day.high)}`).join(" ")} ${bandPoints.slice().reverse().map(({ day, index }) => `L ${x(index)} ${y(day.low)}`).join(" ")} Z`
      : "";

    const bars = days.map((day, index) => {
      if (!Number.isFinite(day.pump)) return "";
      const barH = Math.max(4, (day.pump / pumpMax) * 34);
      return `<rect class="pump-bar" x="${x(index) - 8}" y="${height - bottom - barH}" width="16" height="${barH}" rx="5"><title>${day.label}: ${this._fmt(day.pump)} timers sandfilter</title></rect>`;
    }).join("");

    const labels = days.map((day, index) => {
      const show = days.length <= 8 || index % 2 === 0;
      if (!show) return "";
      return `<text class="date-label" x="${x(index)}" y="${height - 11}" text-anchor="middle">${day.label}</text>`;
    }).join("");

    const dots = days.map((day, index) => {
      const items = [];
      if (Number.isFinite(day.high)) {
        items.push(`<circle class="dot high" cx="${x(index)}" cy="${y(day.high)}" r="4"><title>${day.label}: høj ${this._fmt(day.high)} °C</title></circle>`);
        items.push(`<text class="value high-value" x="${x(index)}" y="${y(day.high) - 8}" text-anchor="middle">${Math.round(day.high)}&deg;</text>`);
      }
      if (Number.isFinite(day.low)) {
        items.push(`<circle class="dot low" cx="${x(index)}" cy="${y(day.low)}" r="3.5"><title>${day.label}: lav ${this._fmt(day.low)} °C</title></circle>`);
        items.push(`<text class="value low-value" x="${x(index)}" y="${y(day.low) + 16}" text-anchor="middle">${Math.round(day.low)}&deg;</text>`);
      }
      return items.join("");
    }).join("");

    const mid = Math.round((yMin + yMax) / 2);

    return `
      <svg class="chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img">
        <defs>
          <linearGradient id="poolTempFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stop-color="#ef4444" stop-opacity=".18"></stop>
            <stop offset=".58" stop-color="#3b82f6" stop-opacity=".10"></stop>
            <stop offset="1" stop-color="#3b82f6" stop-opacity="0"></stop>
          </linearGradient>
        </defs>
        <line class="grid" x1="${left}" x2="${width - right}" y1="${top}" y2="${top}"></line>
        <line class="grid" x1="${left}" x2="${width - right}" y1="${y(mid)}" y2="${y(mid)}"></line>
        <line class="grid" x1="${left}" x2="${width - right}" y1="${height - bottom}" y2="${height - bottom}"></line>
        <text class="axis" x="8" y="${top + 4}">${yMax}&deg;</text>
        <text class="axis" x="8" y="${y(mid) + 4}">${mid}&deg;</text>
        <text class="axis" x="8" y="${height - bottom + 4}">${yMin}&deg;</text>
        ${bandPath ? `<path class="range-band" d="${bandPath}"></path>` : ""}
        <line class="pump-base" x1="${left}" x2="${width - right}" y1="${height - bottom}" y2="${height - bottom}"></line>
        ${bars}
        ${lowPath ? `<path class="low-line" d="${lowPath}"></path>` : ""}
        ${highPath ? `<path class="high-line" d="${highPath}"></path>` : ""}
        ${dots}
        ${labels}
      </svg>
    `;
  }

  _render() {
    if (!this.shadowRoot) return;
    const days = this._data || [];
    const currentTemp = Number(this._hass?.states?.[this.config?.temp_entity]?.state);
    const currentPump = Number(this._hass?.states?.[this.config?.pump_entity]?.state);
    const highs = days.map((day) => day.high).filter(Number.isFinite);
    const lows = days.map((day) => day.low).filter(Number.isFinite);
    const pumpDays = days.map((day) => day.pump).filter(Number.isFinite);
    const weekHigh = highs.length ? Math.max(...highs) : null;
    const weekLow = lows.length ? Math.min(...lows) : null;
    const totalPump = pumpDays.length ? pumpDays.reduce((sum, value) => sum + value, 0) : null;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          --pool-high: #ef4444;
          --pool-low: #3b82f6;
          --pool-pump: #14b8a6;
          --pool-accent: #0891b2;
        }

        ha-card {
          position: relative;
          overflow: hidden;
          border-radius: 18px;
          border-left: 4px solid var(--pool-accent);
          background: var(--surface);
          box-shadow: var(--dashboard-shadow-soft);
          padding: 16px 18px 13px;
          box-sizing: border-box;
        }

        .bg-icon {
          position: absolute;
          right: -34px;
          bottom: -34px;
          width: 178px;
          height: 178px;
          opacity: .18;
          color: var(--pool-accent);
          pointer-events: none;
          z-index: 0;
        }
        .bg-icon-inner { position:absolute;inset:0;display:flex;align-items:center;justify-content:center;width:100%;height:100%;animation:poolBgIconFloat 6s ease-in-out infinite;transform-origin:center;will-change:transform; }
        .bg-icon-inner ha-icon { display:block;width:178px!important;height:178px!important;--mdc-icon-size:178px;animation:poolBgIconPulse 3.2s ease-in-out infinite;transform-origin:center;filter:drop-shadow(0 0 8px color-mix(in srgb,var(--dashboard-icon-muted) 22%,transparent));will-change:transform,opacity; }
        @keyframes poolBgIconFloat {
          0% { transform: translate(0, 0) rotate(0deg) scale(1); }
          50% { transform: translate(-8px, -6px) rotate(-4deg) scale(1.05); }
          100% { transform: translate(0, 0) rotate(0deg) scale(1); }
        }
        @keyframes poolBgIconPulse { 0%{transform:scale(1);opacity:.95}50%{transform:scale(1.09);opacity:1}100%{transform:scale(1);opacity:.95} }

        .header {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 14px;
          align-items: start;
          position: relative;
          z-index: 1;
        }

        .title {
          min-width: 0;
        }

        .title-main {
          font-size: 20px;
          line-height: 1.05;
          font-weight: 850;
          color: var(--primary-text-color);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .title-sub {
          margin-top: 4px;
          font-size: 13px;
          line-height: 1.1;
          font-weight: 650;
          color: var(--secondary-text-color);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .stats {
          display: flex;
          gap: 6px;
          justify-content: flex-end;
        }

        .badge {
          min-width: 68px;
          height: 44px;
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          line-height: 1;
          color: #07111f;
          box-shadow: 0 8px 18px rgba(0,0,0,.18);
          background: linear-gradient(135deg, var(--badge-color), color-mix(in srgb, var(--badge-color) 72%, black 28%));
        }

        .badge span {
          font-size: 9px;
          font-weight: 900;
          letter-spacing: .06em;
        }

        .badge strong {
          margin-top: 3px;
          font-size: 19px;
          font-weight: 900;
        }

        .chart-wrap {
          position: relative;
          z-index: 1;
          margin-top: 8px;
          overflow: hidden;
        }

        .chart {
          width: 100%;
          height: auto;
          aspect-ratio: 760 / 226;
          display: block;
        }

        .grid {
          stroke: color-mix(in srgb, var(--secondary-text-color) 20%, transparent);
          stroke-width: 1;
        }

        .axis,
        .date-label {
          fill: var(--secondary-text-color);
          font-size: 13px;
          font-weight: 650;
        }

        .range-band {
          fill: color-mix(in srgb, var(--pool-low) 13%, transparent);
        }

        .high-line,
        .low-line {
          fill: none;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .high-line {
          stroke: var(--pool-high);
          stroke-width: 3.4;
          filter: drop-shadow(0 0 5px color-mix(in srgb, var(--pool-high) 28%, transparent));
        }

        .low-line {
          stroke: var(--pool-low);
          stroke-width: 3.1;
          filter: drop-shadow(0 0 5px color-mix(in srgb, var(--pool-low) 24%, transparent));
        }

        .pump-bar {
          fill: color-mix(in srgb, var(--pool-pump) 56%, transparent);
          opacity: .78;
        }

        .pump-base {
          stroke: color-mix(in srgb, var(--pool-pump) 30%, transparent);
          stroke-width: 1;
        }

        .dot.high {
          fill: var(--pool-high);
        }

        .dot.low {
          fill: var(--pool-low);
        }

        .value {
          font-size: 14px;
          font-weight: 900;
          paint-order: stroke;
          stroke: rgba(0,0,0,.52);
          stroke-width: 3px;
          stroke-linejoin: round;
        }

        .high-value {
          fill: #fca5a5;
        }

        .low-value {
          fill: #93c5fd;
        }

        .legend {
          display: flex;
          flex-wrap: wrap;
          gap: 7px 13px;
          align-items: center;
          margin-top: 4px;
          color: var(--secondary-text-color);
          font-size: 13px;
          line-height: 16px;
          position: relative;
          z-index: 1;
        }

        .legend span {
          display: inline-flex;
          gap: 6px;
          align-items: center;
        }

        .legend i {
          width: 18px;
          height: 3px;
          border-radius: 99px;
          display: inline-block;
          background: var(--legend-color);
        }

        .empty,
        .loading,
        .error {
          min-height: 138px;
          display: grid;
          place-items: center;
          color: var(--secondary-text-color);
          font-size: 14px;
          font-weight: 650;
        }

        .error {
          color: var(--error-color);
        }

        @media (max-width: 720px) {
          ha-card {
            border-radius: 16px;
            padding: 13px 12px 10px;
          }

          .header {
            grid-template-columns: 1fr;
            gap: 8px;
          }

          .stats {
            justify-content: flex-start;
          }

          .title-main {
            font-size: 18px;
          }

          .title-sub {
            font-size: 12px;
          }

          .badge {
            min-width: 62px;
            height: 40px;
            border-radius: 10px;
          }

          .badge span {
            font-size: 8px;
          }

          .badge strong {
            font-size: 17px;
          }

          .chart {
            aspect-ratio: 760 / 270;
          }

          .axis,
          .date-label {
            font-size: 12px;
            font-weight: 800;
          }

          .value {
            font-size: 14px;
            stroke-width: 4px;
          }

          .legend {
            font-size: 12px;
            line-height: 15px;
            gap: 5px 9px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .bg-icon-inner, .bg-icon-inner ha-icon { animation: none; }
        }
      </style>
      <ha-card>
        <div class="bg-icon"><div class="bg-icon-inner"><ha-icon icon="mdi:pool"></ha-icon></div></div>
        <div class="header">
          <div class="title">
            <div class="title-main">${this._escape(this.config?.title || "")}</div>
            <div class="title-sub">${this._escape(this.config?.subtitle || "")}</div>
          </div>
          <div class="stats">
            <div class="badge" style="--badge-color: var(--pool-high);"><span>H\u00d8J</span><strong>${this._fmt(weekHigh)}&deg;</strong></div>
            <div class="badge" style="--badge-color: var(--pool-low);"><span>LAV</span><strong>${this._fmt(weekLow)}&deg;</strong></div>
            <div class="badge" style="--badge-color: var(--pool-pump);"><span>FILTER 7D</span><strong>${this._fmt(totalPump)}t</strong></div>
          </div>
        </div>
        <div class="chart-wrap">
          ${this._error ? `<div class="error">${this._error}</div>` : this._loading && !days.length ? `<div class="loading">Henter historik...</div>` : this._renderChart(days)}
        </div>
        <div class="legend">
          <span><i style="--legend-color: var(--pool-high);"></i>H\u00f8jeste</span>
          <span><i style="--legend-color: var(--pool-low);"></i>Laveste</span>
          <span><i style="--legend-color: var(--pool-pump);"></i>Sandfilter</span>
          <span>Nu ${this._fmt(currentTemp)}&deg;C</span>
          <span>I dag ${this._fmt(currentPump)}t filter</span>
        </div>
      </ha-card>
    `;
  }
}

if (!customElements.get("pool-history-card")) {
  customElements.define("pool-history-card", PoolHistoryCard);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "pool-history-card",
  name: "Pool History Card",
  description: "Pool history chart styled for this dashboard.",
});

class PoolWaterQualityCard extends HTMLElement {
  static getStubConfig() {
    return {
      type: "custom:pool-water-quality-card",
      title: "Vandkvalitet",
      ph_entity: "input_number.pool_ph_vaerdi",
      chlorine_entity: "input_number.pool_klor_vaerdi",
      ph_history_entity: "sensor.pool_ph_maaling",
      chlorine_history_entity: "sensor.pool_klor_maaling",
      legacy_measured_entity: "input_datetime.pool_sidste_vandmaaling",
      imported_measurements: [{ date: "2026-07-10", ph: 6.6, chlorine: 1.5 }],
      measured_entity: "sensor.pool_sidste_vandmaling_visning",
      days: 7,
    };
  }

  setConfig(config) {
    this.config = {
      title: "Vandkvalitet",
      subtitle: "En m\u00e5ling pr. dag \u00b7 seneste test bruges",
      ph_entity: "input_number.pool_ph_vaerdi",
      chlorine_entity: "input_number.pool_klor_vaerdi",
      ph_history_entity: "sensor.pool_ph_maaling",
      chlorine_history_entity: "sensor.pool_klor_maaling",
      legacy_measured_entity: "input_datetime.pool_sidste_vandmaaling",
      imported_measurements: [{ date: "2026-07-10", ph: 6.6, chlorine: 1.5 }],
      measured_entity: "sensor.pool_sidste_vandmaling_visning",
      days: 7,
      ...config,
    };
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._data = null;
    this._loading = false;
    this._lastFetch = 0;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const now = Date.now();
    const phMeasurement = hass?.states?.[this.config?.ph_history_entity];
    const chlorineMeasurement = hass?.states?.[this.config?.chlorine_history_entity];
    const historyVersion = `${phMeasurement?.attributes?.measurement_id || ""}|${chlorineMeasurement?.attributes?.measurement_id || ""}`;
    const newMeasurement = historyVersion && historyVersion !== "|" && historyVersion !== this._historyVersion;
    if (newMeasurement) this._historyVersion = historyVersion;
    if (!this._loading && (!this._data || newMeasurement || now - this._lastFetch > 5 * 60 * 1000)) this._fetchHistory();
    this._render();
  }

  getCardSize() { return 4; }

  async _fetchHistory() {
    if (!this._hass || !this.config) return;
    this._loading = true;
    this._error = null;
    this._render();
    try {
      const days = Math.max(2, Number(this.config.days) || 7);
      const start = new Date(Date.now() - (days - 1) * 86400000);
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      const entities = [
        this.config.ph_history_entity,
        this.config.chlorine_history_entity,
        this.config.ph_entity,
        this.config.chlorine_entity,
        this.config.legacy_measured_entity,
      ].filter(Boolean).join(",");
      const url = `history/period/${encodeURIComponent(start.toISOString())}?end_time=${encodeURIComponent(end.toISOString())}&filter_entity_id=${encodeURIComponent(entities)}`;
      const history = await this._hass.callApi("GET", url);
      this._data = this._buildMeasurements(history || []);
      this._lastFetch = Date.now();
    } catch (err) {
      this._error = err?.message || String(err);
    } finally {
      this._loading = false;
      this._render();
    }
  }

  _buildMeasurements(history) {
    const byEntity = new Map();
    for (const series of history) {
      const id = series?.[0]?.entity_id;
      if (id) byEntity.set(id, series);
    }
    const measurements = new Map();
    const addSeries = (series, key) => {
      for (const item of series) {
        const ts = Date.parse(item.last_updated || item.last_changed || "");
        const value = Number(item.state);
        if (!Number.isFinite(ts) || !Number.isFinite(value)) continue;
        const second = Math.round(ts / 1000);
        const point = measurements.get(second) || { ts, ph: null, chlorine: null };
        point.ts = Math.min(point.ts, ts);
        point[key] = value;
        measurements.set(second, point);
      }
    };
    addSeries(byEntity.get(this.config.ph_history_entity) || [], "ph");
    addSeries(byEntity.get(this.config.chlorine_history_entity) || [], "chlorine");

    // Before the dedicated measurement sensors existed, a saved water test was
    // represented by the input values plus the saved input_datetime. Rebuild
    // those deliberate tests instead of treating every slider movement as one.
    const numericHistory = (entityId) => (byEntity.get(entityId) || []).map((item) => ({
      ts: Date.parse(item.last_updated || item.last_changed || ""),
      value: Number(item.state),
    })).filter((item) => Number.isFinite(item.ts) && Number.isFinite(item.value)).sort((a, b) => a.ts - b.ts);
    const valueAt = (series, ts) => {
      let result = null;
      for (const item of series) {
        if (item.ts > ts + 2000) break;
        result = item.value;
      }
      return result;
    };
    const phLegacy = numericHistory(this.config.ph_entity);
    const chlorineLegacy = numericHistory(this.config.chlorine_entity);
    const savedTimes = new Set();
    for (const item of byEntity.get(this.config.legacy_measured_entity) || []) {
      const ts = Date.parse(item.state || "");
      if (!Number.isFinite(ts) || new Date(ts).getFullYear() < 2020 || savedTimes.has(ts)) continue;
      savedTimes.add(ts);
      const ph = valueAt(phLegacy, ts);
      const chlorine = valueAt(chlorineLegacy, ts);
      if (!Number.isFinite(ph) && !Number.isFinite(chlorine)) continue;
      const nearby = [...measurements.entries()].find(([second]) => Math.abs(second * 1000 - ts) <= 5000);
      const second = nearby?.[0] ?? Math.round(ts / 1000);
      const point = measurements.get(second) || { ts, ph: null, chlorine: null };
      if (!Number.isFinite(point.ph) && Number.isFinite(ph)) point.ph = ph;
      if (!Number.isFinite(point.chlorine) && Number.isFinite(chlorine)) point.chlorine = chlorine;
      point.ts = Math.min(point.ts, ts);
      measurements.set(second, point);
    }
    for (const item of this.config.imported_measurements || []) {
      const ts = Date.parse(`${item.date}T12:00:00`);
      if (!Number.isFinite(ts)) continue;
      const ph = Number(item.ph);
      const chlorine = Number(item.chlorine);
      measurements.set(Math.round(ts / 1000), {
        ts,
        ph: Number.isFinite(ph) ? ph : null,
        chlorine: Number.isFinite(chlorine) ? chlorine : null,
        dateOnly: true,
      });
    }
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (Math.max(2, Number(this.config.days) || 7) - 1));
    cutoff.setHours(0, 0, 0, 0);
    const dailyMeasurements = new Map();
    for (const point of [...measurements.values()].sort((a, b) => a.ts - b.ts)) {
      if (point.ts < cutoff.getTime()) continue;
      const date = new Date(point.ts);
      const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const previous = dailyMeasurements.get(dayKey);
      if (!previous || point.ts >= previous.ts) dailyMeasurements.set(dayKey, point);
    }
    return [...dailyMeasurements.values()].sort((a, b) => a.ts - b.ts).map((point) => {
      const date = new Date(point.ts);
      const day = `${date.getDate()}/${date.getMonth() + 1}`;
      return { ...point, label: day };
    });
  }

  _num(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  _fmt(value) { return Number.isFinite(value) ? value.toFixed(1) : "--"; }

  _quality(type, value) {
    if (!Number.isFinite(value)) return { level: "unknown", label: "UKENDT", color: "var(--dashboard-icon-muted)" };
    const ranges = type === "ph"
      ? { good: [7.2, 7.6], warning: [7.0, 7.8] }
      : { good: [1.0, 3.0], warning: [0.5, 4.0] };
    const label = value < ranges.good[0] ? "LAV" : value > ranges.good[1] ? "HØJ" : "OK";
    if (value >= ranges.good[0] && value <= ranges.good[1]) return { level: "good", label, color: "var(--color-success-500, #22c55e)" };
    if (value >= ranges.warning[0] && value <= ranges.warning[1]) return { level: "warning", label, color: "var(--color-warning-500, #f59e0b)" };
    return { level: "bad", label, color: "var(--color-error-500, #ef4444)" };
  }

  _moreInfo(entityId) {
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
  }

  _escape(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  }

  _path(points, x, y, key) {
    return points.map((point, index) => ({ point, index })).filter(({ point }) => Number.isFinite(point[key]))
      .map(({ point, index }, part) => `${part ? "L" : "M"} ${x(index)} ${y(point[key])}`).join(" ");
  }

  _renderChart(points) {
    if (!points?.length || !points.some((point) => Number.isFinite(point.ph) || Number.isFinite(point.chlorine))) {
      return `<div class="empty">Historikken starter, når den første måling gemmes</div>`;
    }
    const left = 45, right = 48, top = 24, bottom = 40, width = 760, height = 226;
    const plotW = width - left - right, plotH = height - top - bottom;
    const count = Math.max(1, points.length - 1);
    const x = (index) => Math.round((left + plotW * index / count) * 10) / 10;
    const phY = (value) => Math.round((top + (1 - (value - 5) / 4) * plotH) * 10) / 10;
    const chlorineValues = points.map((point) => point.chlorine).filter(Number.isFinite);
    const chlorineMax = Math.max(3, Math.ceil((Math.max(0, ...chlorineValues) + .5) * 2) / 2);
    const chlorineY = (value) => Math.round((top + (1 - value / chlorineMax) * plotH) * 10) / 10;
    const segments = (key, y) => points.slice(1).map((point, index) => {
      const previous = points[index];
      if (!Number.isFinite(previous[key]) || !Number.isFinite(point[key])) return "";
      const level = this._quality(key, point[key]).level;
      return `<line class="quality-segment ${key} ${level}" x1="${x(index)}" y1="${y(previous[key])}" x2="${x(index + 1)}" y2="${y(point[key])}"><title>${point.label}: ${key === "ph" ? "pH" : "klor"} ${this._fmt(point[key])}${key === "chlorine" ? " mg/L" : ""}</title></line>`;
    }).join("");
    const qualitySegments = segments("ph", phY) + segments("chlorine", chlorineY);
    const labelStep = Math.max(1, Math.ceil(points.length / 7));
    const labels = points.map((point, index) => index % labelStep === 0 || index === points.length - 1 ? `<text class="date-label" x="${x(index)}" y="${height - 11}" text-anchor="middle">${point.label}</text>` : "").join("");
    const dots = points.map((point, index) => {
      const parts = [];
      if (Number.isFinite(point.ph)) parts.push(`<circle class="dot ph ${this._quality("ph", point.ph).level}" cx="${x(index)}" cy="${phY(point.ph)}" r="4.5"><title>${point.label}: pH ${this._fmt(point.ph)} · ${this._quality("ph", point.ph).label}</title></circle>`);
      if (Number.isFinite(point.chlorine)) parts.push(`<circle class="dot chlorine ${this._quality("chlorine", point.chlorine).level}" cx="${x(index)}" cy="${chlorineY(point.chlorine)}" r="4.5"><title>${point.label}: klor ${this._fmt(point.chlorine)} mg/L · ${this._quality("chlorine", point.chlorine).label}</title></circle>`);
      return parts.join("");
    }).join("");
    return `<svg class="chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="pH og klor historik">
      <rect class="target-band ph-target" x="${left}" y="${phY(7.6)}" width="${plotW}" height="${phY(7.2)-phY(7.6)}"></rect>
      <rect class="target-band chlorine-target" x="${left}" y="${chlorineY(3)}" width="${plotW}" height="${chlorineY(1)-chlorineY(3)}"></rect>
      <line class="grid" x1="${left}" x2="${width-right}" y1="${top}" y2="${top}"></line>
      <line class="grid" x1="${left}" x2="${width-right}" y1="${top+plotH/2}" y2="${top+plotH/2}"></line>
      <line class="grid" x1="${left}" x2="${width-right}" y1="${height-bottom}" y2="${height-bottom}"></line>
      <text class="axis ph-axis" x="8" y="${top+4}">9,0</text><text class="axis ph-axis" x="8" y="${top+plotH/2+4}">7,0</text><text class="axis ph-axis" x="8" y="${height-bottom+4}">5,0</text>
      <text class="axis chlorine-axis" x="${width-5}" y="${top+4}" text-anchor="end">${this._fmt(chlorineMax)}</text><text class="axis chlorine-axis" x="${width-5}" y="${height-bottom+4}" text-anchor="end">0,0</text>
      <text class="target-label ph-label" x="${left+5}" y="${phY(7.6)-4}">pH mål 7,2–7,6</text>
      <text class="target-label chlorine-label" x="${width-right-5}" y="${chlorineY(3)-4}" text-anchor="end">Klor mål 1,0–3,0</text>
      ${qualitySegments}${dots}${labels}
    </svg>`;
  }

  _render() {
    if (!this.shadowRoot) return;
    const points = this._data || [];
    const ph = this._num(this._hass?.states?.[this.config?.ph_entity]?.state);
    const chlorine = this._num(this._hass?.states?.[this.config?.chlorine_entity]?.state);
    const phQuality = this._quality("ph", ph);
    const chlorineQuality = this._quality("chlorine", chlorine);
    const measured = this._hass?.states?.[this.config?.measured_entity]?.state || "Ikke registreret";
    this.shadowRoot.innerHTML = `<style>
      .legend::after{content:"Anbefalet målområde · pH 7,2–7,6 · Klor 1,0–3,0 mg/L";flex-basis:100%;display:block;margin-top:1px;padding:6px 9px;border-radius:8px;background:color-mix(in srgb,var(--color-success-500,#22c55e) 9%,transparent);border:1px solid color-mix(in srgb,var(--color-success-500,#22c55e) 24%,transparent);color:var(--secondary-text-color);font-size:12px;font-weight:750;box-sizing:border-box}
      .target-band{fill:var(--color-success-500,#22c55e);pointer-events:none}.ph-target{opacity:.075;stroke:color-mix(in srgb,var(--ph) 45%,transparent);stroke-width:1}.chlorine-target{opacity:.055;stroke:color-mix(in srgb,var(--chlorine) 48%,transparent);stroke-width:1}.target-label{font-size:9px;font-weight:850;fill:var(--color-success-500,#22c55e);opacity:.9}.quality-segment{fill:none;stroke-width:3.8;stroke-linecap:round}.quality-segment.chlorine{stroke-dasharray:7 5}.quality-segment.good{stroke:var(--color-success-500,#22c55e)}.quality-segment.warning{stroke:var(--color-warning-500,#f59e0b)}.quality-segment.bad{stroke:var(--color-error-500,#ef4444)}.dot{stroke:var(--surface);stroke-width:1.7}.dot.good{fill:var(--color-success-500,#22c55e)!important}.dot.warning{fill:var(--color-warning-500,#f59e0b)!important}.dot.bad{fill:var(--color-error-500,#ef4444)!important}.legend .line-key{background:var(--primary-text-color)}.legend .chlorine-key{background:repeating-linear-gradient(90deg,var(--primary-text-color) 0 6px,transparent 6px 9px)}
      :host{display:block;--ph:#8b5cf6;--chlorine:#14b8a6;--accent:#8b5cf6}ha-card{position:relative;overflow:hidden;border-radius:18px;border-left:4px solid var(--accent);background:var(--surface);box-shadow:var(--dashboard-shadow-soft);padding:16px 18px 13px;box-sizing:border-box}.bg-icon{position:absolute;right:-34px;bottom:-34px;width:178px;height:178px;opacity:.18;color:var(--accent);pointer-events:none;z-index:0}.bg-icon-inner{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;width:100%;height:100%;animation:qualityIconFloat 6s ease-in-out infinite;transform-origin:center;will-change:transform}.bg-icon-inner ha-icon{display:block;width:178px!important;height:178px!important;--mdc-icon-size:178px;animation:qualityIconPulse 3.2s ease-in-out infinite;transform-origin:center;filter:drop-shadow(0 0 8px color-mix(in srgb,var(--dashboard-icon-muted) 22%,transparent));will-change:transform,opacity}@keyframes qualityIconFloat{0%{transform:translate(0,0) rotate(0deg) scale(1)}50%{transform:translate(-8px,-6px) rotate(-4deg) scale(1.05)}100%{transform:translate(0,0) rotate(0deg) scale(1)}}@keyframes qualityIconPulse{0%{transform:scale(1);opacity:.95}50%{transform:scale(1.09);opacity:1}100%{transform:scale(1);opacity:.95}}.header{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;position:relative;z-index:1}.title-main{font-size:20px;font-weight:850;color:var(--primary-text-color)}.title-sub{margin-top:4px;font-size:13px;font-weight:650;color:var(--secondary-text-color)}.stats{display:flex;gap:7px;align-items:center;justify-content:flex-end}.badge{min-width:74px;height:44px;padding:5px 10px;border-radius:12px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;color:#07111f;background:linear-gradient(135deg,var(--badge),color-mix(in srgb,var(--badge) 74%,black 26%));box-shadow:0 7px 16px rgba(0,0,0,.16);cursor:pointer;white-space:nowrap}.badge.chlorine-current{min-width:112px}.badge span{font-size:8px;font-weight:900;letter-spacing:.07em;line-height:1}.badge strong{font-size:18px;font-weight:900;line-height:1;margin-top:4px;white-space:nowrap}.chart-wrap{position:relative;z-index:1;margin-top:8px}.chart{width:100%;height:auto;display:block;aspect-ratio:760/226}.grid{stroke:color-mix(in srgb,var(--secondary-text-color) 20%,transparent)}.axis,.date-label{fill:var(--secondary-text-color);font-size:13px;font-weight:750}.ph-axis{fill:#a78bfa}.chlorine-axis{fill:#14b8a6}.ph-line,.chlorine-line{fill:none;stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round}.ph-line{stroke:var(--ph)}.chlorine-line{stroke:var(--chlorine)}.dot.ph{fill:var(--ph)}.dot.chlorine{fill:var(--chlorine)}.legend{position:relative;z-index:1;display:flex;flex-wrap:wrap;gap:8px 15px;margin-top:3px;color:var(--secondary-text-color);font-size:13px}.legend span{display:inline-flex;align-items:center;gap:6px}.legend i{width:18px;height:3px;border-radius:99px;background:var(--legend)}.empty{min-height:150px;display:grid;place-items:center;color:var(--secondary-text-color);font-weight:650}.measured{margin-top:8px;font-size:12px;color:var(--secondary-text-color);position:relative;z-index:1}@media(max-width:720px){ha-card{padding:13px 12px 11px}.header{grid-template-columns:1fr;gap:8px}.stats{justify-content:flex-start}.title-main{font-size:18px}.title-sub{font-size:12px}.badge{min-width:68px;height:40px;padding:4px 8px}.badge.chlorine-current{min-width:102px}.badge strong{font-size:16px}.chart{aspect-ratio:760/270}.axis,.date-label{font-size:12px;font-weight:800}}@media(prefers-reduced-motion:reduce){.bg-icon-inner,.bg-icon-inner ha-icon{animation:none}}
    </style><ha-card><div class="bg-icon"><div class="bg-icon-inner"><ha-icon icon="mdi:flask-round-bottom"></ha-icon></div></div><div class="header"><div><div class="title-main">${this._escape(this.config?.title)}</div><div class="title-sub">${this._escape(this.config?.subtitle)}</div></div><div class="stats"><div class="badge ph-current" title="pH ${phQuality.label} · tryk for mere info" style="--badge:${phQuality.color}"><span>pH · ${phQuality.label}</span><strong>${this._fmt(ph)}</strong></div><div class="badge chlorine-current" title="Klor ${chlorineQuality.label} · tryk for mere info" style="--badge:${chlorineQuality.color}"><span>KLOR · ${chlorineQuality.label}</span><strong>${this._fmt(chlorine)} mg/L</strong></div></div></div><div class="chart-wrap">${this._error ? `<div class="empty">${this._escape(this._error)}</div>` : this._loading && !points.length ? `<div class="empty">Henter historik...</div>` : this._renderChart(points)}</div><div class="legend"><span><i class="line-key ph-key"></i>pH · fuld linje</span><span><i class="line-key chlorine-key"></i>Klor · stiplet</span><span><i style="--legend:var(--quality-good)"></i>OK</span><span><i style="--legend:var(--quality-warning)"></i>Tæt på</span><span><i style="--legend:var(--quality-bad)"></i>Udenfor</span></div><div class="measured">Seneste gemte måling: ${this._escape(measured)}</div></ha-card>`;
    this.shadowRoot.querySelector(".ph-current")?.addEventListener("click", () => this._moreInfo(this.config.ph_entity));
    this.shadowRoot.querySelector(".chlorine-current")?.addEventListener("click", () => this._moreInfo(this.config.chlorine_entity));
  }
}

if (!customElements.get("pool-water-quality-card")) customElements.define("pool-water-quality-card", PoolWaterQualityCard);
window.customCards.push({ type: "pool-water-quality-card", name: "Pool Water Quality Card", description: "pH and chlorine history in the pool dashboard style." });
