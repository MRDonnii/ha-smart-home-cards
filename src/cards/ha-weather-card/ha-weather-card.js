import "./ha-weather-card-assets.js";
const VERSION = "0.4.1";

const CONDITION_LABEL_DA = {
  "clear-night": "Klar nat",
  cloudy: "Overskyet",
  fog: "Tåge",
  hail: "Hagl",
  lightning: "Tordenvejr",
  "lightning-rainy": "Torden med regn",
  partlycloudy: "Delvist skyet",
  pouring: "Skybrud",
  rainy: "Regn",
  snowy: "Sne",
  "snowy-rainy": "Slud",
  sunny: "Solrigt",
  windy: "Blæsende",
  "windy-variant": "Blæsende og skyet",
  exceptional: "Ekstremt vejr",
};

const VALID_CONDITIONS = new Set(Object.keys(CONDITION_LABEL_DA));

const COMPASS_DA = ["N", "NNØ", "NØ", "ØNØ", "Ø", "ØSØ", "SØ", "SSØ", "S", "SSV", "SV", "VSV", "V", "VNV", "NV", "NNV"];

const FORECAST_REFRESH_MS = 20 * 60 * 1000;

class HAWeatherCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._sig = "";
    this._heroMode = "now";
    this._radarTab = "nedbor";
    this._daily = [];
    this._hourly = [];
    this._fetching = false;
    this._fetchedFor = "";
    this._fetchedAt = 0;
  }

  static getStubConfig() {
    return {
      title: "Vejr og varsler",
      subtitle: "Vejr, pollen og solforhold",
      weather_entity: "weather.home",
      more_info_entity: "weather.home",
      sun_entity: "sun.sun",
      pollen: [
        { name: "Birk", entity: "sensor.google_pollen_birch" },
        { name: "Græs", entity: "sensor.google_pollen_grass" },
        { name: "Eg", entity: "sensor.google_pollen_oak" },
        { name: "Hassel", entity: "sensor.google_pollen_hazel" },
        { name: "Bynke", entity: "sensor.google_pollen_mugwort" },
      ],
      radar_lat: null,
      radar_lon: null,
    };
  }

  setConfig(config) {
    if (!config || !config.weather_entity) throw new Error("Vejrkortet kræver weather_entity");
    this._config = { ...HAWeatherCard.getStubConfig(), ...config };
    this._render();
  }

  connectedCallback() {
    this._fetchForecasts();
    if (!this._timer) this._timer = setInterval(() => this._fetchForecasts(), FORECAST_REFRESH_MS);
  }
  disconnectedCallback() {
    clearInterval(this._timer);
    this._timer = undefined;
  }

  _watchedIds() {
    const c = this._config;
    return [c.weather_entity, c.sun_entity, ...(c.pollen || []).map((p) => p.entity)].filter(Boolean);
  }

  set hass(hass) {
    this._hass = hass;
    const ids = this._watchedIds();
    const sig = JSON.stringify(ids.map((id) => [id, hass?.states?.[id]?.state, hass?.states?.[id]?.last_updated]));
    if (sig !== this._sig) {
      this._sig = sig;
      this._render();
    }
    if (this._config.weather_entity && this._fetchedFor !== this._config.weather_entity) {
      this._fetchForecasts();
    }
  }

  async _fetchForecasts() {
    const entity = this._config?.weather_entity;
    if (!entity || !this._hass?.connection || this._fetching) return;
    this._fetching = true;
    try {
      const [daily, hourly] = await Promise.all([
        this._hass.connection.sendMessagePromise({
          type: "call_service",
          domain: "weather",
          service: "get_forecasts",
          service_data: { type: "daily" },
          target: { entity_id: entity },
          return_response: true,
        }),
        this._hass.connection.sendMessagePromise({
          type: "call_service",
          domain: "weather",
          service: "get_forecasts",
          service_data: { type: "hourly" },
          target: { entity_id: entity },
          return_response: true,
        }),
      ]);
      this._daily = daily?.response?.[entity]?.forecast || [];
      this._hourly = hourly?.response?.[entity]?.forecast || [];
      this._fetchedFor = entity;
      this._fetchedAt = Date.now();
      this._render();
    } catch (error) {
      console.warn("HA Weather Card: kunne ikke hente prognose", error);
    } finally {
      this._fetching = false;
    }
  }

  _shieldFromSwipeNav(el) {
    if (!el) return;
    // Keep native scrolling in both axes (horizontal scrolls this row,
    // vertical bubbles up to scroll the page, exactly as the browser
    // already does by default). We only stop the touch/pointer events
    // from bubbling further up, so the dashboard's global swipe-navigation
    // listener never sees them and can't turn a horizontal drag here into
    // a page change. No preventDefault anywhere, so nothing is taken over.
    const stop = (event) => event.stopPropagation();
    ["touchstart", "touchmove", "touchend", "pointerdown", "pointermove", "pointerup"].forEach((type) =>
      el.addEventListener(type, stop, { passive: true }),
    );
  }

  _s(id) {
    return id ? this._hass?.states?.[id] : undefined;
  }
  _num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  _esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  _fmt(v, digits = 1) {
    return Number.isFinite(v) ? v.toLocaleString("da-DK", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "—";
  }
  _weekday(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("da-DK", { weekday: "short" });
  }
  _time(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "--:--" : d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
  }
  _hourLabel(iso, isFirst) {
    if (isFirst) return "Nu";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "—" : `${d.getHours()}`;
  }
  _compass(deg) {
    if (!Number.isFinite(deg)) return "—";
    return COMPASS_DA[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
  }
  _conditionLabel(condition) {
    return CONDITION_LABEL_DA[condition] || condition || "—";
  }
  _iconPath(condition, isDay) {
    const base = VALID_CONDITIONS.has(condition) && condition !== "exceptional" ? condition : "not-available";
    const night = isDay === false && base !== "clear-night" && base !== "not-available";
    const key = `${base}${night ? "_night" : ""}`;
    return window.HAWeatherCardAssets?.weather?.[key] || window.HAWeatherCardAssets?.weather?.["not-available"] || "";
  }
  _isDaytimeNow() {
    return this._s(this._config.sun_entity)?.state === "above_horizon";
  }
  _more(id) {
    if (!id) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: id }, bubbles: true, composed: true }));
  }
  _pollenTone(idx) {
    if (idx >= 5) return "#b794f6";
    if (idx >= 4) return "var(--danger)";
    if (idx >= 3) return "var(--warn)";
    if (idx >= 2) return "#e3d24a";
    if (idx >= 1) return "var(--good)";
    return "var(--muted)";
  }
  _uvTone(uv) {
    if (!Number.isFinite(uv)) return { color: "var(--muted)", label: "—" };
    if (uv >= 11) return { color: "#b794f6", label: "Ekstrem" };
    if (uv >= 8) return { color: "var(--danger)", label: "Meget høj" };
    if (uv >= 6) return { color: "var(--warn)", label: "Høj" };
    if (uv >= 3) return { color: "#e3d24a", label: "Moderat" };
    if (uv >= 1) return { color: "var(--good)", label: "Lav" };
    return { color: "var(--muted)", label: "Meget lav" };
  }

  _now() {
    const c = this._config;
    const w = this._s(c.weather_entity);
    const a = w?.attributes || {};
    const hourNow = (this._hourly || [])[0];
    return {
      condition: w?.state,
      temp: this._num(a.temperature),
      feels: this._num(a.apparent_temperature),
      humidity: this._num(a.humidity),
      windSpeed: this._num(a.wind_speed),
      windGust: this._num(a.wind_gust_speed),
      windBearing: this._num(a.wind_bearing),
      pressure: this._num(a.pressure),
      uv: this._num(a.uv_index),
      cloud: this._num(a.cloud_coverage),
      precipProb: hourNow ? this._num(hourNow.precipitation_probability) : undefined,
    };
  }

  _today() {
    const d = (this._daily || [])[0];
    if (!d) return undefined;
    return {
      condition: d.condition,
      temp: this._num(d.temperature),
      templow: this._num(d.templow),
      feels: this._num(d.apparent_temperature),
      precip: this._num(d.precipitation) ?? 0,
      precipProb: this._num(d.precipitation_probability),
      windSpeed: this._num(d.wind_speed),
      windBearing: this._num(d.wind_bearing),
      humidity: this._num(d.humidity),
      uv: this._num(d.uv_index),
    };
  }

  _heroTile() {
    const now = this._heroMode === "now";
    const data = now ? this._now() : this._today();
    if (!data) return { empty: true };
    return { ...data, now };
  }

  _windArrow(bearing) {
    if (!Number.isFinite(bearing)) return "";
    return `<svg class="wind-arrow" viewBox="0 0 24 24" style="transform:rotate(${bearing}deg)"><path d="M12 2L6 12h4v10h4V12h4L12 2z"/></svg>`;
  }

  _heroHtml() {
    const t = this._heroTile();
    if (t.empty) return `<div class="hero-empty">Henter vejrdata…</div>`;
    const isDay = t.now ? this._isDaytimeNow() : true;
    const icon = this._iconPath(t.condition, isDay);
    const meta = [];
    if (Number.isFinite(t.windSpeed)) {
      meta.push(
        `<span class="meta-item">${this._windArrow(t.windBearing)}<b>${this._fmt(t.windSpeed, 0)}</b> km/t ${this._esc(this._compass(t.windBearing))}</span>`,
      );
    }
    if (Number.isFinite(t.humidity)) meta.push(`<span class="meta-item"><ha-icon icon="mdi:water-percent"></ha-icon><b>${this._fmt(t.humidity, 0)}</b>%</span>`);
    if (Number.isFinite(t.precipProb)) meta.push(`<span class="meta-item"><ha-icon icon="mdi:umbrella-outline"></ha-icon><b>${this._fmt(t.precipProb, 0)}</b>%</span>`);
    if (!t.now && Number.isFinite(t.precip)) meta.push(`<span class="meta-item"><ha-icon icon="mdi:weather-rainy"></ha-icon><b>${this._fmt(t.precip, 1)}</b> mm</span>`);
    if (t.now && Number.isFinite(t.uv)) {
      const uvTone = this._uvTone(t.uv);
      meta.push(`<span class="meta-item" style="color:${uvTone.color}"><ha-icon icon="mdi:weather-sunny-alert"></ha-icon>UV <b>${this._fmt(t.uv, 0)}</b></span>`);
    }
    return `
      <div class="hero-toggle">
        <button class="pill ${t.now ? "active" : ""}" data-hero="now">Nu</button>
        <button class="pill ${!t.now ? "active" : ""}" data-hero="today">I dag</button>
      </div>
      <div class="hero-body">
        <img class="hero-icon" src="${icon}" width="108" height="108" alt="">
        <div class="hero-figures">
          <div class="hero-temp">${this._fmt(t.temp, 1)}°${
            !t.now && Number.isFinite(t.templow) ? `<span class="hero-low">${this._fmt(t.templow, 1)}°</span>` : ""
          }${Number.isFinite(t.feels) ? `<span class="hero-feels">Føles som ${this._fmt(t.feels, 1)}°</span>` : ""}</div>
          <div class="hero-condition">${this._esc(this._conditionLabel(t.condition))}</div>
          <div class="hero-meta">${meta.join("")}</div>
        </div>
      </div>`;
  }

  _hourlyHtml() {
    const hours = (this._hourly || []).slice(0, 24);
    if (!hours.length) return `<div class="hourly-empty">Henter timeprognose…</div>`;
    return `<div class="hourly-scroll">${hours
      .map((h, i) => {
        const prob = this._num(h.precipitation_probability) ?? 0;
        return `<div class="hour">
          <span class="hour-label">${this._hourLabel(h.datetime, i === 0)}</span>
          <img src="${this._iconPath(h.condition, h.is_daytime)}" width="34" height="34" alt="">
          <span class="hour-temp">${this._fmt(this._num(h.temperature), 0)}°</span>
          <span class="hour-prob ${prob >= 40 ? "wet" : ""}">${prob > 0 ? `${prob}%` : ""}</span>
        </div>`;
      })
      .join("")}</div>`;
  }

  _pollenHtml() {
    const items = this._config.pollen || [];
    return `<div class="grid2">${items
      .map((p) => {
        const s = this._s(p.entity);
        const idx = this._num(s?.attributes?.index_value) ?? 0;
        const category = s?.attributes?.category || "—";
        const color = this._pollenTone(idx);
        return `<div class="tile" data-more="${this._esc(p.entity)}" style="--tone:${color}">
          <ha-icon icon="${this._esc(p.icon || "mdi:flower-pollen")}"></ha-icon>
          <div><span>${this._esc(p.name)}</span><b>${this._esc(category)} (${idx})</b></div>
        </div>`;
      })
      .join("")}</div>`;
  }

  _sunHtml() {
    const c = this._config;
    const sun = this._s(c.sun_entity);
    const now = this._now();
    const elevation = this._num(sun?.attributes?.elevation);
    const azimuth = this._num(sun?.attributes?.azimuth);
    const uvTone = this._uvTone(now.uv);
    const elevationPct = Number.isFinite(elevation) ? Math.max(0, Math.min(100, ((elevation + 10) / 80) * 100)) : 0;
    return `<div class="grid2">
        <div class="tile" data-more="${this._esc(c.sun_entity)}">
          <img src="${window.HAWeatherCardAssets?.weather?.sunset || ""}" width="30" height="30" alt="">
          <div><span>Solnedgang</span><b>${this._time(sun?.attributes?.next_setting)}</b></div>
        </div>
        <div class="tile" data-more="${this._esc(c.sun_entity)}">
          <img src="${window.HAWeatherCardAssets?.weather?.sunrise || ""}" width="30" height="30" alt="">
          <div><span>Solopgang</span><b>${this._time(sun?.attributes?.next_rising)}</b></div>
        </div>
        <div class="tile" data-more="${this._esc(c.weather_entity)}" style="--tone:${uvTone.color}">
          <ha-icon icon="mdi:weather-sunny-alert"></ha-icon>
          <div><span>UV-indeks</span><b>${uvTone.label} (${this._fmt(now.uv, 1)})</b></div>
        </div>
      </div>
      <div class="sun-arc">
        <div class="sun-arc-track"><div class="sun-arc-fill" style="width:${elevationPct}%"></div><div class="sun-arc-dot" style="left:${elevationPct}%"></div></div>
        <div class="sun-arc-labels"><span>Solhøjde ${this._fmt(elevation, 1)}°</span><span>Retning ${this._esc(this._compass(azimuth))}</span></div>
      </div>`;
  }

  _radarHtml() {
    const lat = this._config.radar_lat ?? this._hass?.config?.latitude ?? 55.6761;
    const lon = this._config.radar_lon ?? this._hass?.config?.longitude ?? 12.5683;
    const dLat = (Number(lat) - 0.011).toFixed(3);
    const dLon = (Number(lon) - 0.015).toFixed(3);
    const windyUrl = (overlay) =>
      `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=%C2%B0C&metricWind=m/s&zoom=11&overlay=${overlay}&product=ecmwf&level=surface&lat=${lat}&lon=${lon}&detailLat=${dLat}&detailLon=${dLon}&marker=true&message=true`;
    const lightningUrl = `https://map.blitzortung.org/index.php?interactive=0&NavigationControl=0&FullScreenControl=0&Cookies=0&InfoDiv=0&MenuButtonDiv=0&ScaleControl=0&LinksCheckboxChecked=1&LinksRangeValue=10&MapStyle=2&MapStyleRangeValue=10&Advertisment=0#7/${lat}/${lon}`;
    const tabs = [
      ["nedbor", "Nedbør", "mdi:weather-pouring", windyUrl("radar")],
      ["vind", "Vind", "mdi:weather-windy", windyUrl("wind")],
      ["lyn", "Lyn", "mdi:weather-lightning", lightningUrl],
    ];
    const active = tabs.find((t) => t[0] === this._radarTab) || tabs[0];
    return `<div class="subtabs">${tabs
      .map((t) => `<button class="subtab ${t[0] === this._radarTab ? "active" : ""}" data-radar="${t[0]}"><ha-icon icon="${t[2]}"></ha-icon>${t[1]}</button>`)
      .join("")}</div>
      <div class="radar-frame"><iframe src="${active[3]}" frameborder="0" loading="lazy"></iframe></div>`;
  }

  _forecastHtml() {
    const days = (this._daily || []).slice(1);
    if (!days.length) return `<div class="forecast-empty">Henter prognose…</div>`;
    return `<div class="forecast-row">${days
      .map(
        (d) => `<div class="fday" data-more="${this._esc(this._config.more_info_entity || this._config.weather_entity)}">
          <span class="fday-name">${this._esc(this._weekday(d.datetime))}</span>
          <img src="${this._iconPath(d.condition, true)}" width="54" height="54" alt="">
          <span class="fday-temp">${this._fmt(this._num(d.temperature), 0)}°<small>${this._fmt(this._num(d.templow), 0)}°</small></span>
          <span class="fday-cond">${this._esc(this._conditionLabel(d.condition))}</span>
          <span class="fday-precip">${this._fmt(this._num(d.precipitation) ?? 0, 1)} mm</span>
        </div>`,
      )
      .join("")}</div>`;
  }

  _sectionHeading(icon, title) {
    return `<div class="section-heading"><ha-icon icon="${icon}"></ha-icon><span>${this._esc(title)}</span></div>`;
  }

  _render() {
    if (!this.shadowRoot) return;
    const c = this._config;
    if (!c.weather_entity) return;

    this.shadowRoot.innerHTML = `<style>
      :host{display:block;--good:var(--dashboard-success, var(--success-color, #20e3a2));--warn:var(--dashboard-warning, var(--warning-color, #f59e0b));--danger:var(--dashboard-danger, var(--error-color, #ef4444));--accent:var(--dashboard-accent, var(--info-color, #38bdf8));--edge:var(--dashboard-border-neutral, var(--divider-color, rgba(127,145,165,.2)));--muted:var(--dashboard-icon-muted, var(--disabled-text-color, #64748b))}
      *{box-sizing:border-box}
      ha-card{padding:22px;border-radius:26px;background:linear-gradient(150deg,color-mix(in srgb,var(--ha-card-background,var(--card-background-color)) 94%,var(--accent) 6%),var(--ha-card-background,var(--card-background-color)));border:var(--ha-card-border-width,1px) solid var(--ha-card-border-color,var(--edge));color:var(--primary-text-color);box-shadow:var(--ha-card-box-shadow)}
      .head{display:flex;align-items:center;gap:12px;margin-bottom:16px}
      .head ha-icon{--mdc-icon-size:26px;color:var(--accent)}
      .head strong{display:block;font-size:16px}
      .head span{display:block;color:var(--secondary-text-color);font-size:12px;margin-top:2px}
      .section-heading{display:flex;align-items:center;gap:8px;margin:26px 0 12px;color:var(--secondary-text-color);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}
      .section-heading:first-child{margin-top:0}
      .section-heading ha-icon{--mdc-icon-size:16px;color:var(--accent)}
      .hero-toggle{display:flex;gap:6px;margin-bottom:14px}
      .pill{padding:6px 14px;border-radius:999px;border:1px solid var(--edge);background:transparent;color:var(--secondary-text-color);font-size:11px;font-weight:800;cursor:pointer;text-transform:uppercase;letter-spacing:.04em}
      .pill.active{color:#fff;background:var(--accent);border-color:var(--accent)}
      .hero-empty,.hourly-empty,.forecast-empty{padding:20px;text-align:center;color:var(--secondary-text-color);font-size:12px}
      .hero-body{display:flex;align-items:center;gap:18px}
      .hero-icon{filter:drop-shadow(0 6px 14px color-mix(in srgb,var(--accent) 30%,transparent))}
      .hero-temp{font-size:42px;font-weight:800;line-height:1;display:flex;align-items:baseline;gap:8px}
      .hero-low{font-size:0.5em;color:var(--secondary-text-color);font-weight:700}
      .hero-feels{font-size:12px;color:var(--secondary-text-color);font-weight:600;margin-left:6px}
      .hero-condition{margin-top:6px;font-size:15px;font-weight:700}
      .hero-meta{display:flex;gap:14px;flex-wrap:wrap;margin-top:10px}
      .meta-item{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--secondary-text-color)}
      .meta-item ha-icon{--mdc-icon-size:15px}
      .meta-item b{color:var(--primary-text-color);font-weight:800}
      .wind-arrow{width:14px;height:14px;fill:var(--accent);transition:transform .4s ease}
      .hourly-scroll{display:flex;gap:6px;overflow-x:auto;margin-top:18px;padding-bottom:6px;scroll-snap-type:x proximity}
      .hourly-scroll::-webkit-scrollbar{height:4px}
      .hourly-scroll::-webkit-scrollbar-thumb{background:var(--edge);border-radius:4px}
      .hour{flex:0 0 auto;width:52px;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 4px;border-radius:14px;background:color-mix(in srgb,var(--primary-text-color) 4%,transparent);scroll-snap-align:start}
      .hour-label{font-size:10px;color:var(--secondary-text-color);font-weight:700}
      .hour-temp{font-size:13px;font-weight:800}
      .hour-prob{font-size:9px;color:var(--accent);font-weight:700;min-height:11px}
      .hour-prob.wet{color:var(--warn)}
      .grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
      .tile{position:relative;display:flex;align-items:center;gap:10px;padding:12px 14px;border:1px solid color-mix(in srgb,var(--tone) 18%,transparent);border-left:3px solid var(--tone);border-radius:14px;background:linear-gradient(145deg,color-mix(in srgb,var(--tone) 7%,transparent),transparent 60%),var(--ha-card-background,var(--card-background-color));box-shadow:0 4px 12px rgba(0,0,0,.1);cursor:pointer;--tone:var(--accent)}
      .tile ha-icon{--mdc-icon-size:22px;color:var(--tone)}
      .tile img{width:26px;height:26px}
      .tile span{display:block;font-size:10px;color:var(--secondary-text-color);text-transform:uppercase;font-weight:700;letter-spacing:.03em}
      .tile b{display:block;margin-top:2px;font-size:13px;color:var(--tone)}
      .sun-arc{margin-top:14px;padding:14px;border:1px solid var(--edge);border-radius:16px}
      .sun-arc-track{position:relative;height:6px;border-radius:99px;background:color-mix(in srgb,var(--primary-text-color) 10%,transparent)}
      .sun-arc-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,var(--accent),var(--warn));transition:width .6s ease}
      .sun-arc-dot{position:absolute;top:50%;width:12px;height:12px;border-radius:50%;background:var(--warn);box-shadow:0 0 10px color-mix(in srgb,var(--warn) 60%,transparent);transform:translate(-50%,-50%);transition:left .6s ease}
      .sun-arc-labels{display:flex;justify-content:space-between;margin-top:8px;font-size:11px;color:var(--secondary-text-color)}
      .subtabs{display:flex;gap:6px;margin-bottom:10px}
      .subtab{display:flex;align-items:center;gap:5px;padding:7px 12px;border-radius:999px;border:1px solid var(--edge);background:transparent;color:var(--secondary-text-color);font-size:11px;font-weight:700;cursor:pointer}
      .subtab ha-icon{--mdc-icon-size:14px}
      .subtab.active{color:#fff;background:var(--accent);border-color:var(--accent)}
      .radar-frame{position:relative;width:100%;padding-top:56.25%;border-radius:16px;overflow:hidden;border:1px solid var(--edge)}
      .radar-frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
      .forecast-section{margin-top:20px;padding-top:16px;border-top:1px solid var(--edge)}
      .forecast-title{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--secondary-text-color);margin-bottom:10px}
      .forecast-row{display:flex;gap:8px;overflow-x:auto;padding-bottom:6px;scroll-snap-type:x proximity}
      .forecast-row::-webkit-scrollbar{height:4px}
      .forecast-row::-webkit-scrollbar-thumb{background:var(--edge);border-radius:4px}
      .fday{flex:0 0 auto;width:96px;display:flex;flex-direction:column;align-items:center;gap:3px;padding:12px 6px;border:1px solid color-mix(in srgb,var(--accent) 16%,transparent);border-top:3px solid var(--accent);border-radius:14px;background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 7%,transparent),transparent 60%),var(--ha-card-background,var(--card-background-color));box-shadow:0 4px 12px rgba(0,0,0,.1);cursor:pointer;text-align:center;scroll-snap-align:start}
      .fday-name{font-size:11px;font-weight:800;text-transform:capitalize}
      .fday-temp{font-size:13px;font-weight:800}
      .fday-temp small{color:var(--secondary-text-color);font-weight:700;margin-left:4px}
      .fday-cond{font-size:10px;color:var(--secondary-text-color);min-height:24px}
      .fday-precip{font-size:10px;color:var(--accent);font-weight:700}
      @media(max-width:560px){.hero-body{flex-direction:column;align-items:flex-start}.hero-icon{width:84px;height:84px}.hero-temp{font-size:34px}.grid2{grid-template-columns:1fr}}
    </style>
    <ha-card>
      <div class="head">
        <ha-icon icon="mdi:weather-partly-cloudy"></ha-icon>
        <div><strong>${this._esc(c.title)}</strong><span>${this._esc(c.subtitle)}</span></div>
      </div>
      <div class="main">
        ${this._heroHtml()}
        ${this._hourlyHtml()}
        <div class="forecast-section">
          <div class="forecast-title">Prognose &middot; de næste dage</div>
          ${this._forecastHtml()}
        </div>
        ${this._sectionHeading("mdi:radar", "Radar")}
        ${this._radarHtml()}
        ${this._sectionHeading("mdi:flower-pollen", "Pollen")}
        ${this._pollenHtml()}
        ${this._sectionHeading("mdi:white-balance-sunny", "Sol & UV")}
        ${this._sunHtml()}
      </div>
    </ha-card>`;

    this.shadowRoot.querySelectorAll("[data-hero]").forEach((el) =>
      el.addEventListener("click", () => {
        this._heroMode = el.dataset.hero;
        this._render();
      }),
    );
    this.shadowRoot.querySelectorAll("[data-radar]").forEach((el) =>
      el.addEventListener("click", () => {
        this._radarTab = el.dataset.radar;
        this._render();
      }),
    );
    this.shadowRoot.querySelectorAll("[data-more]").forEach((el) =>
      el.addEventListener("click", () => this._more(el.dataset.more)),
    );
    this._shieldFromSwipeNav(this.shadowRoot.querySelector(".hourly-scroll"));
    this._shieldFromSwipeNav(this.shadowRoot.querySelector(".forecast-row"));
  }

  getCardSize() {
    return 34;
  }
}

if (!customElements.get("ha-weather-card")) customElements.define("ha-weather-card", HAWeatherCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha-weather-card",
  name: "HA Weather Card",
  description: "Samlet vejrkort: nu/i dag, timeprognose, pollen, sol & UV, radar og 5-dages udsigt — henter alt direkte fra en native weather-entity",
  preview: true,
});
console.info(
  `%c HA WEATHER CARD %c v${VERSION} `,
  "color:#fff;background:#38bdf8;font-weight:700",
  "color:#38bdf8;background:#161b22",
);
