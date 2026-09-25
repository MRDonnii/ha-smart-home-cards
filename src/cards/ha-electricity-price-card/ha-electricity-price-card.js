const VERSION = "0.7.11";

class HAElectricityPriceCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    if (!this.childElementCount) this._render();
  }
  _change(key, value) {
    this._config = { ...this._config, [key]: value };
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: this._config },
        bubbles: true,
        composed: true,
      }),
    );
  }
  _render() {
    if (!this._config) return;
    this.innerHTML = `<style>.row{display:grid;grid-template-columns:150px 1fr;align-items:center;gap:12px;margin:12px 0}select,input{width:100%;padding:8px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:var(--primary-text-color)}</style>
      <div class="row"><label>Datakilde</label><select data-key="source"><option value="auto">Automatisk</option><option value="stromligning">Strømligning</option><option value="energidataservice">Energi Data Service</option></select></div>
      <div class="row"><label>Strømligning pris</label><input data-key="stromligning_current"></div>
      <div class="row"><label>Strømligning i morgen</label><input data-key="stromligning_tomorrow"></div>
      <div class="row"><label>Strømligning forecast</label><input data-key="stromligning_forecast"></div>
      <div class="row"><label>Energi Data Service</label><input data-key="energidataservice"></div>
      <div class="row"><label>Desktophøjde (px)</label><input data-key="desktop_height" type="number" min="350" max="560" step="10"></div>
      <div class="row"><label>Vis titel og aktuel pris</label><input data-key="show_header" type="checkbox"></div>
      <div class="row"><label>Udfyld tilgængelig højde</label><input data-key="fill_height" type="checkbox"></div>
      <div class="row"><label>Animer priser over 6 kr</label><input data-key="high_price_animation" type="checkbox"></div>
      <div class="row"><label>Ignorér reduceret bevægelse</label><input data-key="force_price_animation" type="checkbox"></div>`;
    this.querySelectorAll("select,input").forEach((el) => {
      if (el.type === "checkbox")
        el.checked =
          el.dataset.key === "high_price_animation"
            ? this._config.high_price_animation !== false
            : Boolean(this._config[el.dataset.key]);
      else el.value = this._config[el.dataset.key] || (el.dataset.key === "source" ? "auto" : "");
      el.onchange = () => this._change(el.dataset.key, el.type === "checkbox" ? el.checked : el.value);
    });
  }
}

class HAElectricityPriceCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._tab = "today";
    this._forecastDay = 0;
    this._sig = "";
  }
  connectedCallback() {
    if (!this._liveTimer) this._liveTimer = setInterval(() => this._updateLiveStatus(), 60000);
  }
  disconnectedCallback() {
    clearInterval(this._liveTimer);
    this._liveTimer = null;
  }
  static getStubConfig() {
    return {
      source: "auto",
      energidataservice: "sensor.energi_data_service",
      stromligning_current: "sensor.stromligning_current_price_vat",
      stromligning_tomorrow:
        "binary_sensor.stromligning_tomorrow_available_vat",
      stromligning_forecast: "sensor.stromligning_forecasts_vat",
      desktop_height: 350,
      show_header: true,
      fill_height: false,
      high_price_animation: true,
      force_price_animation: false,
    };
  }
  static getConfigElement() {
    return document.createElement("ha-electricity-price-card-editor");
  }
  setConfig(config) {
    this._config = { ...HAElectricityPriceCard.getStubConfig(), ...config };
    this.toggleAttribute("force-price-animation", this._config.force_price_animation === true);
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    const ids = [
      this._config.energidataservice,
      this._config.stromligning_current,
      this._config.stromligning_tomorrow,
      this._config.stromligning_forecast,
    ];
    const sig = JSON.stringify(
      ids.map((id) => [
        id,
        hass?.states?.[id]?.state,
        hass?.states?.[id]?.last_updated,
      ]),
    );
    if (sig !== this._sig) {
      this._sig = sig;
      const data = this._data();
      if (this.shadowRoot?.querySelector("ha-card") && this._renderShape === this._shape(data)) this._updateDynamic(data);
      else this._render();
    }
    this._updateLiveStatus();
  }
  getCardSize() {
    return 4;
  }
  getGridOptions() {
    return { columns: 12, rows: 4, min_columns: 6 };
  }
  _entity(id) {
    return this._hass?.states?.[id];
  }
  _source() {
    const requested = this._config.source || "auto";
    if (requested !== "auto") return requested;
    if (
      this._entity(this._config.stromligning_current)?.attributes?.prices
        ?.length
    )
      return "stromligning";
    return "energidataservice";
  }
  _point(item, fallbackHour = 0, dayOffset = 0) {
    const price = Number(item?.price ?? item);
    const raw = item?.start ?? item?.hour;
    const start = raw
      ? Date.parse(raw)
      : new Date(
          new Date().setHours(fallbackHour, 0, 0, 0) + dayOffset * 86400000,
        ).getTime();
    return Number.isFinite(price) && Number.isFinite(start)
      ? { price, start }
      : null;
  }
  _stromligning() {
    const todayEntity = this._entity(this._config.stromligning_current),
      tomorrowEntity = this._entity(this._config.stromligning_tomorrow),
      forecastEntity = this._entity(this._config.stromligning_forecast);
    const today = (todayEntity?.attributes?.prices || [])
      .map((p, i) => this._point(p, i))
      .filter(Boolean);
    const tomorrow = (tomorrowEntity?.attributes?.prices || [])
      .map((p, i) => this._point(p, i, 1))
      .filter(Boolean);
    const forecast = (forecastEntity?.attributes?.prices || [])
      .map((p, i) => this._point(p, i, 2))
      .filter(Boolean);
    return {
      source: "Strømligning",
      current: Number(todayEntity?.state),
      today,
      tomorrow,
      forecast,
      tomorrowOfficial: tomorrowEntity?.attributes?.forecast_data !== true,
    };
  }
  _eds() {
    const entity = this._entity(this._config.energidataservice),
      a = entity?.attributes || {};
    const make = (raw, simple, offset) =>
      (Array.isArray(raw) && raw.length ? raw : simple || [])
        .map((p, i) => this._point(p, i, offset))
        .filter(Boolean);
    return {
      source: "Energi Data Service",
      current: Number(a.current_price ?? entity?.state),
      today: make(a.raw_today, a.today, 0),
      tomorrow: make(a.raw_tomorrow, a.tomorrow, 1),
      forecast: (a.forecast || [])
        .map((p, i) => this._point(p, i, 2))
        .filter(Boolean),
      tomorrowOfficial: a.tomorrow_valid === true,
    };
  }
  _stromligningLive() {
    const entity = this._entity(this._config.stromligning_current);
    const price = Number(entity?.state);
    const updated = Date.parse(entity?.last_updated || "");
    const now = Date.now();
    const currentPeriod = (entity?.attributes?.prices || []).some((entry) => {
      const start = Date.parse(entry?.start || "");
      return Number.isFinite(start) && start <= now && now < start + 3600000;
    });
    return entity?.state !== "unknown" && entity?.state !== "unavailable" &&
      Number.isFinite(price) && Number.isFinite(updated) &&
      now - updated >= 0 && now - updated < 7200000 && currentPeriod;
  }
  _updateLiveStatus() {
    const live = this.shadowRoot?.querySelector(".live-status");
    if (!live) return;
    const isLive = this._stromligningLive();
    live.classList.toggle("is-live", isLive);
    live.classList.toggle("is-offline", !isLive);
    live.textContent = isLive ? "Strømligning live" : "Strømligning ikke live";
  }
  _data() {
    return this._source() === "energidataservice"
      ? this._eds()
      : this._stromligning();
  }
  _shape(data) {
    const selected = this._selected(data);
    const forecastDays = this._days(data.forecast);
    return JSON.stringify([
      data.source,
      data.tomorrowOfficial,
      this._tab,
      this._forecastDay,
      selected.map((point) => point.start),
      forecastDays.map((day) => day[0]?.start),
    ]);
  }
  _days(points) {
    const map = new Map();
    points.forEach((p) => {
      const d = new Date(p.start),
        key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    });
    return [...map.values()].map((x) => x.sort((a, b) => a.start - b.start));
  }
  _selected(data) {
    if (this._tab === "today") return data.today;
    if (this._tab === "tomorrow") return data.tomorrow;
    const days = this._days(data.forecast);
    this._forecastDay = Math.max(
      0,
      Math.min(this._forecastDay, Math.max(0, days.length - 1)),
    );
    return days[this._forecastDay] || [];
  }
  _fmt(value) {
    return Number.isFinite(value)
      ? value.toLocaleString("da-DK", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : "—";
  }
  _color(value) {
    if (!Number.isFinite(value))
      return "var(--dashboard-border-neutral, var(--divider-color, #66778a))";
    const stops = [
      [1, "var(--dashboard-success, var(--state-on-icon, var(--success-color, #50d6a0)))"],
      [2, "var(--dashboard-yellow, var(--warning-color, #f6d365))"],
      [4, "var(--dashboard-warning, var(--warning-color, #ffad42))"],
      [5, "var(--dashboard-danger, var(--error-color, #ff6577))"],
      [6, "var(--dashboard-danger-strong, var(--error-color, #991b1b))"],
    ];
    const price = Math.max(stops[0][0], Math.min(stops.at(-1)[0], value));
    let a = stops[0],
      b = stops.at(-1);
    for (let i = 0; i < stops.length - 1; i++)
      if (price >= stops[i][0] && price <= stops[i + 1][0]) {
        a = stops[i];
        b = stops[i + 1];
        break;
      }
    const pct = Math.round(((price - a[0]) / Math.max(0.0001, b[0] - a[0])) * 1000) / 10;
    return `color-mix(in oklab,${a[1]} ${100 - pct}%,${b[1]} ${pct}%)`;
  }
  _pulse(value) {
    return Number.isFinite(value) && value > 6 ? Math.min(1, (value - 6) / 6) : 0;
  }
  _setBarVisual(bar, price) {
    const pulse = this._pulse(price);
    bar.classList.toggle("price-alert", this._config.high_price_animation !== false && pulse > 0);
    bar.style.setProperty("--price-color", this._color(price));
    bar.style.setProperty("--price-pulse-duration", `${(3.2 - pulse * 2).toFixed(2)}s`);
    bar.style.setProperty("--price-pulse-scale", (0.96 - pulse * 0.24).toFixed(2));
    bar.style.setProperty("--price-pulse-opacity", (0.88 - pulse * 0.3).toFixed(2));
    bar.style.setProperty("--price-pulse-brightness", (1.08 + pulse * 0.82).toFixed(2));
    bar.style.setProperty("--price-pulse-glow", `${(3 + pulse * 15).toFixed(1)}px`);
  }
  _date(points) {
    if (!points.length) return "Ingen data";
    return new Date(points[0].start).toLocaleDateString("da-DK", {
      weekday: "long",
      day: "numeric",
      month: "short",
    });
  }
  _dayLabel(points) {
    const date = points.length ? new Date(points[0].start) : null;
    return date
      ? {
          weekday: date
            .toLocaleDateString("da-DK", { weekday: "short" })
            .replace(".", ""),
          date: date.toLocaleDateString("da-DK", {
            day: "2-digit",
            month: "2-digit",
          }),
        }
      : { weekday: "—", date: "—" };
  }
  _bars(points) {
    if (!points.length)
      return `<div class="empty"><ha-icon icon="mdi:chart-bar-off"></ha-icon><span>Ingen prisdata for denne dag</span></div>`;
    const values = points.map((p) => p.price),
      min = Math.min(...values),
      max = Math.max(...values),
      span = Math.max(0.01, max - min),
      now = Date.now();
    return `<div class="chart">${points
      .map((p) => {
        const h = 18 + ((p.price - min) / span) * 82,
          d = new Date(p.start),
          hour = String(d.getHours()).padStart(2, "0"),
          current = now >= p.start && now < p.start + 3600000,
          extreme = p.price === min ? "min" : p.price === max ? "max" : "",
          badgeText = current ? "NU" : extreme === "min" ? "LAV" : extreme === "max" ? "HØJ" : "",
          pulse = this._pulse(p.price),
          alert = this._config.high_price_animation !== false && pulse > 0;
        return `<button class="bar-wrap ${current ? "current" : ""} ${extreme} ${alert ? "price-alert" : ""}" style="--price-color:${this._color(p.price)};--price-pulse-duration:${(3.2 - pulse * 2).toFixed(2)}s;--price-pulse-scale:${(0.96 - pulse * 0.24).toFixed(2)};--price-pulse-opacity:${(0.88 - pulse * 0.3).toFixed(2)};--price-pulse-brightness:${(1.08 + pulse * 0.82).toFixed(2)};--price-pulse-glow:${(3 + pulse * 15).toFixed(1)}px" aria-label="Klokken ${hour}, ${this._fmt(p.price)} kroner per kilowatt-time"><span class="tip">${hour}:00<br><b>${this._fmt(p.price)} kr.</b></span>${badgeText ? `<em>${badgeText}<b>${this._fmt(p.price)}</b></em>` : ""}<i style="--h:${h}%"></i></button>`;
      })
      .join("")}</div>`;
  }
  _updateDynamic(data) {
    const points = this._selected(data);
    const values = points.map((point) => point.price);
    const min = values.length ? Math.min(...values) : NaN;
    const max = values.length ? Math.max(...values) : NaN;
    const avg = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;
    const price = this.shadowRoot.querySelector(".price b");
    const source = this.shadowRoot.querySelector(".source");
    if (price) price.textContent = this._fmt(data.current);
    if (source) source.textContent = data.source;
    this._updateLiveStatus();
    const tomorrowLabel = this.shadowRoot.querySelector('[data-tab="tomorrow"] .tab-copy small');
    if (tomorrowLabel) tomorrowLabel.textContent = data.tomorrowOfficial ? "Næste døgn" : "Prisforecast";
    const day = this.shadowRoot.querySelector(".day");
    if (day) {
      if (this._tab === "today") {
        const nowValue = day.querySelector(".now-value");
        if (nowValue) nowValue.innerHTML = `${this._fmt(data.current)}<small>kr/kWh</small>`;
      } else {
        day.textContent = this._date(points);
      }
    }
    this.shadowRoot.querySelectorAll(".stat").forEach((stat, index) => {
      const value = [min, avg, max][index];
      stat.style.setProperty("--stat-color", this._color(value));
      const label = stat.querySelector("b");
      if (label) label.textContent = this._fmt(value);
    });
    const now = Date.now();
    const bars = this.shadowRoot.querySelectorAll(".bar-wrap");
    points.forEach((point, index) => {
      const bar = bars[index];
      if (!bar) return;
      const span = Math.max(0.01, max - min);
      const ratio = (point.price - min) / span;
      const height = 18 + ratio * 82;
      const date = new Date(point.start);
      const hour = String(date.getHours()).padStart(2, "0");
      const current = now >= point.start && now < point.start + 3600000;
      const extreme = point.price === min ? "min" : point.price === max ? "max" : "";
      bar.className = `bar-wrap ${current ? "current" : ""} ${extreme}`;
      this._setBarVisual(bar, point.price);
      bar.setAttribute("aria-label", `Klokken ${hour}, ${this._fmt(point.price)} kroner per kilowatt-time`);
      bar.querySelector(".tip").innerHTML = `${hour}:00<br><b>${this._fmt(point.price)} kr.</b>`;
      const column = bar.querySelector("i");
      column.style.setProperty("--h", `${height}%`);
      let marker = bar.querySelector("em");
      if (!extreme) marker?.remove();
      else {
        if (!marker) {
          marker = document.createElement("em");
          bar.insertBefore(marker, column);
        }
        marker.innerHTML = `${extreme === "min" ? "LAV" : "HØJ"}<b>${this._fmt(point.price)}</b>`;
        marker.style.top = window.matchMedia("(max-width: 600px)").matches ? "-24px" : "-28px";
      }
    });
  }
  _render() {
    if (!this.shadowRoot) return;
    const data = this._data(),
      forecast = this._days(data.forecast),
      points = this._selected(data),
      values = points.map((p) => p.price),
      min = values.length ? Math.min(...values) : NaN,
      max = values.length ? Math.max(...values) : NaN,
      avg = values.length
        ? values.reduce((a, b) => a + b, 0) / values.length
        : NaN;
    const dayPicker = `<div class="week-slot">${
      this._tab === "forecast"
        ? `<div class="week-nav"><div class="days">${forecast
            .map((day, index) => {
              const label = this._dayLabel(day);
              return `<button data-day="${index}" class="day-choice ${index === this._forecastDay ? "active" : ""}"><b>${label.weekday}</b><span>${label.date}</span></button>`;
            })
            .join(
              "",
            )}</div></div>`
        : ""
    }</div>`;
    const tab = (id, name, label, icon) =>
      `<button data-tab="${id}" class="${this._tab === id ? "active" : ""}"><ha-icon icon="${icon}"></ha-icon><span class="tab-copy"><b>${name}</b><small>${label}</small></span></button>`;
    this._renderShape = this._shape(data);
    this.shadowRoot.innerHTML = `<style>
      :host{display:block;--accent:var(--dashboard-accent, var(--primary-color, #62b5ff));--good:var(--dashboard-success, var(--success-color, #50d6a0));--danger:var(--dashboard-danger, var(--error-color, #ff6577));--edge:var(--dashboard-border-neutral, var(--divider-color, rgba(127,145,165,.22)));--surface-local:var(--surface,var(--ha-card-background,var(--card-background-color,#101a28)))}*{box-sizing:border-box}button{font:inherit}ha-card{position:relative;overflow:hidden;padding:15px 16px 13px;border:var(--ha-card-border-width,1px) solid var(--ha-card-border-color,var(--edge));border-left:calc(var(--dashboard-left-accent-width, 1) * 4px) solid var(--accent);border-radius:var(--price-card-radius,20px);background:var(--surface-local);color:var(--primary-text-color);box-shadow:var(--dashboard-card-shadow,0 8px 24px rgba(0,0,0,.14))}.head{display:flex;align-items:center;justify-content:space-between;gap:12px}.identity{display:flex;align-items:center;gap:9px}.icon{display:grid;place-items:center;width:35px;height:35px;border-radius:12px;background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent)}.icon ha-icon{--mdc-icon-size:23px}.eyebrow{display:block;color:var(--secondary-text-color);font-size:8px;font-weight:800;letter-spacing:.14em}.identity strong{display:block;margin-top:1px;font-size:15px}.price{text-align:right}.price-row{display:flex;align-items:baseline;justify-content:flex-end;gap:4px}.price b{font-size:29px;line-height:1}.price small,.meta{color:var(--secondary-text-color);font-size:9px}.source{display:inline-flex;align-items:center;gap:4px;margin-top:4px;color:var(--secondary-text-color);font-size:8px}.source:before{content:"";width:5px;height:5px;border-radius:50%;background:var(--good)}.week-nav{display:grid;grid-template-columns:1fr;gap:5px;margin:0 0 10px}.days{display:grid;grid-template-columns:repeat(auto-fit,minmax(48px,1fr));gap:4px}.day-choice{position:relative;min-width:0;padding:5px 2px;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:linear-gradient(160deg,rgba(255,255,255,.10) 0%,rgba(255,255,255,.03) 100%);backdrop-filter:blur(8px) saturate(150%);-webkit-backdrop-filter:blur(8px) saturate(150%);box-shadow:inset 0 1px 0 rgba(255,255,255,.15),0 4px 10px rgba(0,0,0,.22);color:var(--secondary-text-color);cursor:pointer;transition:transform .15s ease,background .18s ease,border-color .18s ease,box-shadow .18s ease}.day-choice:hover{transform:translateY(calc(var(--dashboard-card-highlight, 1) * -2px));box-shadow:inset 0 1px 0 rgba(255,255,255,.15),0 4px 10px rgba(0,0,0,.22),0 calc(var(--dashboard-card-highlight, 1) * 12px) calc(var(--dashboard-card-highlight, 1) * 26px) rgba(0,0,0,calc(var(--dashboard-card-highlight, 1) * .26))}.day-choice:active{transform:translateY(0)}@media(prefers-reduced-motion:reduce){.day-choice{transition:none}.day-choice:hover{transform:none}}.day-choice b,.day-choice span{display:block}.day-choice b{text-transform:capitalize;font-size:12px;font-weight:800}.day-choice span{margin-top:2px;font-size:9px;opacity:.75}.day-choice.active{border-color:color-mix(in srgb,#ffffff 30%,transparent);background:linear-gradient(160deg,color-mix(in srgb,var(--dashboard-accent,var(--accent)) 88%,transparent) 0%,color-mix(in srgb,var(--dashboard-accent,var(--accent)) 58%,transparent) 100%);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.30),0 6px 14px color-mix(in srgb,var(--dashboard-accent,var(--accent)) 32%,transparent)}.day-choice.active span{opacity:1}.summary{display:grid;grid-template-columns:minmax(110px,1fr) repeat(3,auto);align-items:center;gap:6px}.day{text-transform:capitalize;font-size:16px;font-weight:800}.day .now-label{display:block;color:var(--secondary-text-color);font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.day .now-value{display:block;margin-top:2px;color:var(--primary-text-color);font-size:19px;font-weight:800;text-transform:none;letter-spacing:-.02em}.day .now-value small{margin-left:4px;color:var(--secondary-text-color);font-size:10px;font-weight:700}.stat{min-width:55px;padding:5px 7px;border:1px solid var(--edge);border-radius:10px;text-align:center}.stat span{display:block;color:var(--secondary-text-color);font-size:7px;font-weight:700}.stat b{font-size:10px}.chart{display:grid;grid-template-columns:repeat(24,minmax(0,1fr));align-items:end;gap:4px;height:180px;margin-top:5px;padding-top:39px;border-bottom:1px solid var(--edge);background:repeating-linear-gradient(to bottom,transparent 0 31px,color-mix(in srgb,var(--edge) 65%,transparent) 32px,transparent 33px)}.bar-wrap{position:relative;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:140px;min-width:0;padding:0;border:0;background:transparent;cursor:pointer}.bar-wrap i{display:block;width:100%;height:var(--h);min-height:7px;margin-bottom:1px;border-radius:5px 5px 2px 2px;background:color-mix(in srgb,var(--danger) calc(var(--ratio)*100%),var(--good));transition:filter .15s,transform .15s}.bar-wrap:hover i,.bar-wrap:focus-visible i{filter:brightness(1.15);transform:scaleX(1.18)}.bar-wrap.current i{outline:2px solid var(--primary-text-color);outline-offset:2px}.bar-wrap em{position:absolute;z-index:2;top:-35px;display:flex;flex-direction:column;align-items:center;padding:3px 5px;border:1px solid currentColor;border-radius:7px;background:var(--surface-local);font-size:6px;font-style:normal;font-weight:800;line-height:1.1;white-space:nowrap}.bar-wrap em b{font-size:8px}.bar-wrap.min em{color:var(--good)}.bar-wrap.max em{color:var(--danger)}.tip{position:absolute;z-index:5;bottom:105px;display:none;padding:5px 7px;border:1px solid var(--accent);border-radius:8px;background:var(--card-background-color,#161d28);color:var(--primary-text-color,#fff);box-shadow:0 5px 14px rgba(0,0,0,.35);font-size:9px;white-space:nowrap}.bar-wrap:hover .tip,.bar-wrap:focus-visible .tip{display:block}.empty{display:flex;align-items:center;justify-content:center;gap:8px;height:164px;color:var(--secondary-text-color)}@media(max-width:600px){ha-card{padding:12px 8px 10px}.icon{width:31px;height:31px}.identity strong{font-size:13px}.price b{font-size:24px}.tabs{margin-top:10px}.days{gap:2px}.day-choice{padding:5px 1px}.day-choice b{font-size:9px}.day-choice span{font-size:6px}.summary{grid-template-columns:1fr repeat(3,43px);gap:3px}.stat{min-width:0;padding:4px 2px}.day{font-size:12px}.chart{gap:2px}.bar-wrap em{padding:2px 3px}.bar-wrap em b{font-size:7px}}
      ha-card{height:414px}.tabs{display:flex;height:52px;gap:8px;margin:9px 0 7px;padding:0;border:0;background:transparent}.tabs button{flex:1;position:relative;display:flex;align-items:center;gap:8px;height:52px;overflow:hidden;padding:5px 12px;border:1px solid rgba(255,255,255,.14);border-radius:12px;background:linear-gradient(160deg,rgba(255,255,255,.11) 0%,rgba(255,255,255,.035) 100%);backdrop-filter:blur(10px) saturate(155%);-webkit-backdrop-filter:blur(10px) saturate(155%);box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 6px 16px rgba(0,0,0,.26);text-align:left;cursor:pointer;color:var(--secondary-text-color);transition:transform .15s ease,background .18s ease,border-color .18s ease,box-shadow .18s ease}.tabs button:hover{transform:translateY(calc(var(--dashboard-card-highlight, 1) * -2px));box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 6px 16px rgba(0,0,0,.26),0 calc(var(--dashboard-card-highlight, 1) * 12px) calc(var(--dashboard-card-highlight, 1) * 26px) rgba(0,0,0,calc(var(--dashboard-card-highlight, 1) * .26))}.tabs button:active{transform:translateY(0)}@media(prefers-reduced-motion:reduce){.tabs button{transition:none}.tabs button:hover{transform:none}}.tabs button.active{border-color:color-mix(in srgb,#ffffff 30%,transparent);background:linear-gradient(160deg,color-mix(in srgb,var(--dashboard-accent,var(--accent)) 88%,transparent) 0%,color-mix(in srgb,var(--dashboard-accent,var(--accent)) 58%,transparent) 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.32),0 8px 20px color-mix(in srgb,var(--dashboard-accent,var(--accent)) 34%,transparent)}.tabs button ha-icon{--mdc-icon-size:18px;color:var(--secondary-text-color);flex-shrink:0}.tabs button.active ha-icon{color:#fff}.tab-copy{position:relative;z-index:3;align-self:center;min-width:0}.tab-copy b,.tab-copy small{display:block}.tab-copy b{color:var(--secondary-text-color);font-size:14px;font-weight:800;line-height:1.05}.tab-copy small{margin-top:1px;color:var(--secondary-text-color);font-size:10px;white-space:nowrap;opacity:.75}.tabs button.active .tab-copy b,.tabs button.active .tab-copy small{color:#fff;opacity:1}.week-slot{height:43px;margin-bottom:7px}.week-nav{height:43px;margin:0}.day-choice{border-radius:12px}.stat{border:0;color:var(--state-badge-text,#fff);background:linear-gradient(135deg,var(--stat-color),color-mix(in srgb,var(--stat-color) 78%,black 22%));box-shadow:var(--state-badge-shadow,0 3px 9px rgba(0,0,0,.18))}.stat span{color:inherit}.chart{height:167px;padding-top:34px}.bar-wrap{height:132px}@media(max-width:600px){ha-card{height:calc(330px + var(--front-mobile-fill,0px))}.tabs{height:50px;gap:5px}.tabs button{height:50px;padding:4px 6px}.tab-copy b{font-size:13px}.tab-copy small{font-size:8px}.tabs button>ha-icon{--mdc-icon-size:30px}.week-slot,.week-nav{height:40px}.week-slot{margin-bottom:5px}.chart{height:calc(188px + var(--front-mobile-fill,0px));gap:5px;padding-top:22px}.bar-wrap{height:calc(165px + var(--front-mobile-fill,0px))}.stat{height:27px}}
      .bar-wrap i{background:var(--price-color);transform-origin:center bottom;transition:background-color .9s ease,filter .15s,transform .15s}.bar-wrap.price-alert i{animation:priceDangerPulse var(--price-pulse-duration) ease-in-out infinite}@keyframes priceDangerPulse{0%,100%{transform:scaleY(1);opacity:.9;filter:brightness(1) drop-shadow(0 0 2px var(--price-color))}50%{transform:scaleY(var(--price-pulse-scale));opacity:var(--price-pulse-opacity);filter:brightness(var(--price-pulse-brightness)) drop-shadow(0 0 var(--price-pulse-glow) var(--price-color))}}@media(prefers-reduced-motion:reduce){:host(:not([force-price-animation])) .bar-wrap.price-alert i{animation:none}}

      .top{display:flex;align-items:center;justify-content:space-between;gap:12px 20px;flex-wrap:wrap;margin-bottom:9px}.head{display:flex;align-items:center;gap:12px;min-width:0}.identity{gap:12px}.identity strong{font-size:22px;line-height:1.1}.subtitle{display:block;margin-top:3px;color:var(--secondary-text-color);font-size:11px}.icon{width:42px;height:42px}.live-status{display:inline-flex;align-items:center;gap:6px;margin-left:8px;color:var(--secondary-text-color);font-size:10px;white-space:nowrap}.live-status:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--secondary-text-color)}.live-status.is-live{color:var(--good)}.live-status.is-live:before{background:var(--good);box-shadow:0 0 8px var(--good)}.tabs{flex:0 1 auto;width:auto;height:auto;margin:0;padding:4px;border:0;border-radius:14px;background:transparent;box-shadow:none;gap:4px}.tabs button{flex:0 0 auto;height:39px;min-width:74px;padding:7px 10px;border:0;border-radius:10px;background:transparent;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none;gap:6px}.tabs button:hover{transform:none;box-shadow:none;background:color-mix(in srgb,var(--accent) 8%,transparent)}.tabs button.active{border:0;background:var(--dashboard-tab-selected-bg,color-mix(in srgb,var(--accent) 16%,transparent));box-shadow:inset 0 0 0 1px var(--dashboard-tab-selected-border,var(--accent))}.tabs button.active .tab-copy b{color:var(--primary-text-color)}.tabs button.active .tab-copy small{color:var(--secondary-text-color)}.tabs button.active ha-icon{color:var(--accent)}.tabs button ha-icon{--mdc-icon-size:17px}.tab-copy b{font-size:12px}.tab-copy small{font-size:9px}.no-head .top{justify-content:flex-start}@media(max-width:700px){.top{align-items:stretch}.head{width:100%;justify-content:space-between}.identity strong{font-size:18px}.subtitle{font-size:10px}.live-status{font-size:9px}.head{display:none}.top{margin-bottom:0}.tabs{width:100%;border:0;padding:0;background:transparent}.tabs button{flex:1 1 0;min-width:0;justify-content:center;padding:6px 4px}.tab-copy b{font-size:12px}.tab-copy small{font-size:8px}}
    
      /* Periodeknapperne sidder i samme beholder som Varme Centers faner. */
      .tabs{padding:4px;gap:4px;border:1px solid var(--divider-color,var(--edge));border-radius:14px;background:var(--front-theme-surface,var(--ha-card-background,var(--card-background-color,var(--surface-local))));box-shadow:var(--front-theme-shadow,var(--ha-card-box-shadow,none))}.tabs button{border:0;border-radius:10px;background:transparent;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none}.tabs button:hover{color:var(--primary-text-color);background:var(--contrast1,color-mix(in srgb,var(--primary-text-color) 4%,transparent))}.tabs button.active{border:0;color:var(--primary-text-color);background:var(--dashboard-tab-selected-bg,color-mix(in srgb,var(--accent) 14%,transparent));box-shadow:inset 0 0 0 1px var(--dashboard-tab-selected-border,var(--accent)),0 0 18px -8px var(--accent)}
      /* Telefon: søjlerne går helt ned til kortets kant, så de yderste følger hjørnernes bue. */
      @media(max-width:600px){ha-card{padding-bottom:0}.chart{border-bottom:0}.bar-wrap i{margin-bottom:0;border-radius:5px 5px 0 0}}
    </style><ha-card class="${this._config.show_header === false ? "no-head" : ""}"><header class="top">${this._config.show_header === false ? "" : `<div class="head"><div class="identity"><span class="icon"><ha-icon icon="mdi:flash"></ha-icon></span><div><strong>Strømpris</strong><span class="subtitle">Priser i dag, i morgen og ugen</span></div></div><span class="live-status ${this._stromligningLive() ? "is-live" : "is-offline"}">${this._stromligningLive() ? "Strømligning live" : "Strømligning ikke live"}</span></div>`}<nav class="tabs" aria-label="Prisperioder">${tab("today", "I dag", "Aktiv fane", "mdi:calendar-today")}${tab("tomorrow", "I morgen", data.tomorrowOfficial ? "Næste døgn" : "Prisforecast", "mdi:calendar-arrow-right")}${tab("forecast", "Uge", "Fremtidige priser", "mdi:calendar-week")}</nav></header>${dayPicker}<div class="summary"><div class="day">${this._tab === "today" ? `<span class="now-label">Pris lige nu</span><strong class="now-value">${this._fmt(data.current)}<small>kr/kWh</small></strong>` : this._date(points)}</div><div class="stat" style="--stat-color:${this._color(min)}"><span>LAV</span><b>${this._fmt(min)}</b></div><div class="stat" style="--stat-color:${this._color(avg)}"><span>SNIT</span><b>${this._fmt(avg)}</b></div><div class="stat" style="--stat-color:${this._color(max)}"><span>HØJ</span><b>${this._fmt(max)}</b></div></div>${this._bars(points)}</ha-card>`;
    const compactMobile = window.matchMedia("(max-width: 600px)").matches;
    const card = this.shadowRoot.querySelector("ha-card");
    const weekSlot = this.shadowRoot.querySelector(".week-slot");
    const fillHeight = !compactMobile && this._config.fill_height === true;
    const compactDesktop = fillHeight && window.matchMedia("(min-width: 1101px) and (max-height: 950px)").matches;
    const desktopHeight = Math.min(560, Math.max(350, Number(this._config.desktop_height) || 350));
    const extraHeight = compactMobile ? 0 : desktopHeight - 350;
    const headerGain = this._config.show_header === false ? 35 : 0;
    this.style.height = fillHeight ? "100%" : "";
    card.style.height = compactMobile ? "calc(330px + var(--front-mobile-fill, 0px))" : fillHeight ? "100%" : `${desktopHeight}px`;
    if (fillHeight) { card.style.display = "flex"; card.style.flexDirection = "column"; card.style.minHeight = compactDesktop ? "250px" : "350px"; }
    if (compactMobile) { card.style.display = "flex"; card.style.flexDirection = "column"; }
    if (this._tab === "forecast") {
      this.shadowRoot.querySelector(".summary").style.display = "none";
      weekSlot.style.height = compactMobile ? "40px" : "43px";
      weekSlot.style.marginBottom = "0";
    } else {
      weekSlot.style.display = "none";
      const summary = this.shadowRoot.querySelector(".summary");
      summary.style.height = compactMobile ? "40px" : "43px";
      this.shadowRoot.querySelectorAll(".stat").forEach((stat) => {
        stat.style.height = "32px";
        stat.style.display = "flex";
        stat.style.flexDirection = "column";
        stat.style.alignItems = "center";
        stat.style.justifyContent = "center";
        stat.style.gap = "2px";
        stat.style.padding = "3px 6px";
        stat.style.lineHeight = "1";
      });
    }
    this.shadowRoot.querySelectorAll(".bar-wrap em").forEach((marker) => {
      marker.style.top = compactMobile ? "-24px" : "-28px";
    });
    const chart = this.shadowRoot.querySelector(".chart");
    if (chart) {
      if (fillHeight) {
        chart.style.flex = "1"; chart.style.height = "auto"; chart.style.minHeight = compactDesktop ? "98px" : "167px";
        this.shadowRoot.querySelectorAll(".bar-wrap").forEach((bar) => { bar.style.height = "100%"; });
      } else if (!compactMobile && extraHeight) {
        chart.style.height = `${167 + extraHeight + headerGain}px`;
        chart.style.paddingTop = `${34 + Math.round((extraHeight + headerGain) * 0.28)}px`;
        this.shadowRoot.querySelectorAll(".bar-wrap").forEach((bar) => {
          bar.style.height = `${132 + Math.round((extraHeight + headerGain) * 0.72)}px`;
        });
      } else if (!compactMobile && headerGain) {
        chart.style.height = `${183 + headerGain}px`;
        chart.style.paddingTop = `${34 + Math.round(headerGain * 0.28)}px`;
        this.shadowRoot.querySelectorAll(".bar-wrap").forEach((bar) => { bar.style.height = `${148 + Math.round(headerGain * 0.72)}px`; });
      } else if (compactMobile) {
        // Phone: the chart takes whatever height the card has left, so the bars
        // end at the card's bottom padding and follow the surrounding edge.
        chart.style.flex = "1 1 0"; chart.style.height = "auto"; chart.style.minHeight = "150px";
        chart.style.paddingTop = `${22 + Math.round(headerGain * 0.28)}px`;
        this.shadowRoot.querySelectorAll(".bar-wrap").forEach((bar) => { bar.style.height = "100%"; });
      }
      chart.style.transform = compactMobile ? "none" : "translateY(8px)";
    }
    this.shadowRoot.querySelectorAll("[data-tab]").forEach(
      (button) =>
        (button.onclick = () => {
          this._tab = button.dataset.tab;
          if (this._tab === "forecast") this._forecastDay = 0;
          this._render();
        }),
    );
    this.shadowRoot.querySelectorAll("[data-day]").forEach(
      (button) =>
        (button.onclick = () => {
          this._forecastDay = Number(button.dataset.day);
          this._render();
        }),
    );
  }
}

if (!customElements.get("ha-electricity-price-card-editor"))
  customElements.define(
    "ha-electricity-price-card-editor",
    HAElectricityPriceCardEditor,
  );
if (!customElements.get("ha-electricity-price-card"))
  customElements.define("ha-electricity-price-card", HAElectricityPriceCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha-electricity-price-card",
  name: "HA Electricity Price Card",
  description: "Samlet elpriskort til Strømligning og Energi Data Service",
  preview: true,
});
console.info(
  `%c HA ELECTRICITY PRICE CARD %c v${VERSION} `,
  "color:white;background:#357fc4;font-weight:700",
  "color:#69c4ff;background:#161b22",
);
