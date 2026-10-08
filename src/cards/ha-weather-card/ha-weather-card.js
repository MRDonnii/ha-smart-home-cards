import "./ha-weather-card-assets.js";
const VERSION = "0.6.1";

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

// Warning levels as used by MeteoAlarm/CAP awareness levels (2 yellow, 3 orange, 4 red).
const WARNING_TONES = { 2: "#e3c63a", 3: "#f08c2e", 4: "var(--danger)" };

const COMPASS_DA = ["N", "NNØ", "NØ", "ØNØ", "Ø", "ØSØ", "SØ", "SSØ", "S", "SSV", "SV", "VSV", "V", "VNV", "NV", "NNV"];

const FORECAST_REFRESH_MS = 20 * 60 * 1000;

class HAWeatherCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._sig = "";
    this._radarSig = "";
    this._detailSig = "";
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
      // Optional: an image entity (e.g. a national radar) shown instead of the
      // web radar and lightning maps; the wind map stays.
      radar_image_entity: null,
      // Optional: a sensor whose `varsler` (or `warnings`) attribute lists
      // warnings as {type, overskrift, beskrivelse, niveau, start, slut}.
      warnings_entity: null,
      // Optional: extra groups of sensors, [{title, icon, items: [{name, entity, icon}]}].
      detail_sections: [],
      // Optional: small facts under the radar, [{name, entity, icon}].
      radar_details: [],
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
    return [c.weather_entity, c.sun_entity, c.warnings_entity, ...(c.pollen || []).map((p) => p.entity)].filter(Boolean);
  }

  _detailIds() {
    const c = this._config;
    return [
      ...(c.detail_sections || []).flatMap((s) => (s.items || []).map((i) => i.entity)),
      ...(c.radar_details || []).map((i) => i.entity),
    ].filter(Boolean);
  }

  _stateSig(hass, ids) {
    return JSON.stringify(ids.map((id) => [id, hass?.states?.[id]?.state, hass?.states?.[id]?.last_updated]));
  }

  set hass(hass) {
    this._hass = hass;
    // Three signatures so a radar image or a sensor tile can update without
    // rebuilding the card (which would also reload the wind map iframe).
    const sig = this._stateSig(hass, this._watchedIds());
    const radarState = this._s(this._config.radar_image_entity);
    const radarSig = radarState ? `${radarState.state}|${radarState.attributes?.entity_picture}` : "";
    const detailSig = this._stateSig(hass, this._detailIds());
    if (sig !== this._sig) {
      this._sig = sig;
      this._radarSig = radarSig;
      this._detailSig = detailSig;
      this._render();
    } else {
      if (radarSig !== this._radarSig) {
        this._radarSig = radarSig;
        const img = this.shadowRoot.querySelector("img.radar-img");
        if (img) img.src = this._radarImageUrl();
      }
      if (detailSig !== this._detailSig) {
        this._detailSig = detailSig;
        this.shadowRoot.querySelectorAll("[data-detail-section]").forEach((el) => {
          el.innerHTML = this._detailRowsHtml((this._config.detail_sections || [])[Number(el.dataset.detailSection)]);
          this._bindMore(el);
        });
        const facts = this.shadowRoot.querySelector("[data-radar-facts]");
        if (facts) {
          facts.innerHTML = this._factsHtml();
          this._bindMore(facts);
        }
      }
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

  _windMs(value, unit) {
    if (!Number.isFinite(value)) return undefined;
    const u = String(unit || "km/h").toLowerCase();
    if (u === "m/s") return value;
    if (u === "mph") return value * 0.44704;
    if (u === "kn" || u === "kt") return value * 0.514444;
    if (u === "ft/s") return value * 0.3048;
    return value / 3.6;
  }

  _now() {
    const w = this._s(this._config.weather_entity);
    const a = w?.attributes || {};
    const hourNow = (this._hourly || [])[0];
    return {
      condition: w?.state,
      temp: this._num(a.temperature),
      feels: this._num(a.apparent_temperature),
      humidity: this._num(a.humidity),
      wind: this._windMs(this._num(a.wind_speed), a.wind_speed_unit),
      gust: this._windMs(this._num(a.wind_gust_speed), a.wind_speed_unit),
      bearing: this._num(a.wind_bearing),
      pressure: this._num(a.pressure),
      uv: this._num(a.uv_index),
      visibility: this._num(a.visibility),
      dewPoint: this._num(a.dew_point),
      cloud: this._num(a.cloud_coverage),
      precipProb: hourNow ? this._num(hourNow.precipitation_probability) : undefined,
    };
  }

  _windArrow(bearing, size = 16) {
    if (!Number.isFinite(bearing)) return "";
    // Wind bearing is where the wind comes from; the arrow points where it blows.
    return `<svg class="wind-arrow" width="${size}" height="${size}" viewBox="0 0 24 24" style="transform:rotate(${(bearing + 180) % 360}deg)"><path d="M12 2L6 12h4v10h4V12h4L12 2z"/></svg>`;
  }

  _chip(icon, label, value, extra = "") {
    return `<div class="chip"${extra}><ha-icon icon="${icon}"></ha-icon><div><span>${this._esc(label)}</span><b>${value}</b></div></div>`;
  }

  _heroHtml() {
    const n = this._now();
    if (!Number.isFinite(n.temp) && !n.condition) return `<div class="empty">Henter vejrdata…</div>`;
    const today = (this._daily || [])[0];
    const hi = this._num(today?.temperature);
    const lo = this._num(today?.templow);
    const icon = this._iconPath(n.condition, this._isDaytimeNow());
    const uv = this._uvTone(n.uv);
    const chips = [];
    if (Number.isFinite(n.wind)) {
      chips.push(this._chip("mdi:weather-windy", "Vind", `${this._windArrow(n.bearing, 14)}${this._fmt(n.wind, 1)} m/s <small>${this._esc(this._compass(n.bearing))}</small>`));
    }
    if (Number.isFinite(n.gust)) chips.push(this._chip("mdi:weather-windy-variant", "Vindstød", `${this._fmt(n.gust, 1)} m/s`));
    if (Number.isFinite(n.humidity)) chips.push(this._chip("mdi:water-percent", "Luftfugtighed", `${this._fmt(n.humidity, 0)} %`));
    if (Number.isFinite(n.precipProb)) chips.push(this._chip("mdi:umbrella-outline", "Regnrisiko", `${this._fmt(n.precipProb, 0)} %`));
    if (Number.isFinite(n.pressure)) chips.push(this._chip("mdi:gauge", "Lufttryk", `${this._fmt(n.pressure, 0)} hPa`));
    if (Number.isFinite(n.dewPoint)) chips.push(this._chip("mdi:water-thermometer", "Dugpunkt", `${this._fmt(n.dewPoint, 1)}°`));
    if (Number.isFinite(n.visibility)) chips.push(this._chip("mdi:eye-outline", "Sigtbarhed", `${this._fmt(n.visibility, n.visibility < 10 ? 1 : 0)} km`));
    if (Number.isFinite(n.uv)) chips.push(this._chip("mdi:weather-sunny-alert", "UV-indeks", `${this._fmt(n.uv, 0)} <small>${uv.label}</small>`, ` style="--tone:${uv.color}"`));
    return `<div class="hero" data-more="${this._esc(this._config.more_info_entity || this._config.weather_entity)}">
        <div class="hero-main">
          <img class="hero-icon" src="${icon}" alt="">
          <div class="hero-text">
            <div class="hero-temp">${this._fmt(n.temp, 1)}<sup>°</sup></div>
            <div class="hero-cond">${this._esc(this._conditionLabel(n.condition))}</div>
            <div class="hero-sub">${[
              Number.isFinite(n.feels) ? `Føles som ${this._fmt(n.feels, 1)}°` : "",
              Number.isFinite(hi) ? `I dag ${this._fmt(hi, 0)}° / ${this._fmt(lo, 0)}°` : "",
            ].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
        <div class="chips">${chips.join("")}</div>
      </div>`;
  }

  _hourlyHtml() {
    const hours = (this._hourly || []).slice(0, 24);
    if (!hours.length) return `<div class="empty">Henter timeprognose…</div>`;
    return `<div class="hourly-scroll">${hours
      .map((h, i) => {
        const prob = this._num(h.precipitation_probability) ?? 0;
        const mm = this._num(h.precipitation) ?? 0;
        return `<div class="hour${i === 0 ? " now" : ""}">
          <span class="hour-label">${this._hourLabel(h.datetime, i === 0)}</span>
          <img src="${this._iconPath(h.condition, h.is_daytime)}" alt="">
          <span class="hour-temp">${this._fmt(this._num(h.temperature), 0)}°</span>
          <span class="hour-rain${prob >= 40 ? " wet" : ""}">${mm >= 0.1 ? `${this._fmt(mm, 1)} mm` : prob > 0 ? `${prob}%` : "&nbsp;"}</span>
          <span class="hour-bar"><i style="height:${Math.min(100, prob)}%"></i></span>
        </div>`;
      })
      .join("")}</div>`;
  }

  _daysHtml() {
    const days = (this._daily || []).slice(0, 7);
    if (!days.length) return `<div class="empty">Henter prognose…</div>`;
    const temps = days.flatMap((d) => [this._num(d.templow), this._num(d.temperature)]).filter(Number.isFinite);
    const min = Math.min(...temps);
    const span = Math.max(1, Math.max(...temps) - min);
    const more = this._esc(this._config.more_info_entity || this._config.weather_entity);
    return `<div class="days">${days
      .map((d, i) => {
        const lo = this._num(d.templow);
        const hi = this._num(d.temperature);
        const left = Number.isFinite(lo) ? ((lo - min) / span) * 100 : 0;
        const width = Number.isFinite(lo) && Number.isFinite(hi) ? Math.max(6, ((hi - lo) / span) * 100) : 0;
        const mm = this._num(d.precipitation) ?? 0;
        const prob = this._num(d.precipitation_probability);
        return `<div class="day" data-more="${more}">
          <span class="day-name">${i === 0 ? "I dag" : this._esc(this._weekday(d.datetime).replace(/^./, (ch) => ch.toUpperCase()))}</span>
          <img src="${this._iconPath(d.condition, true)}" alt="" title="${this._esc(this._conditionLabel(d.condition))}">
          <span class="day-rain${mm >= 1 ? " wet" : ""}">${mm >= 0.1 ? `${this._fmt(mm, 1)} mm` : ""}${Number.isFinite(prob) && prob > 0 ? `<small>${this._fmt(prob, 0)}%</small>` : ""}</span>
          <span class="day-lo">${this._fmt(lo, 0)}°</span>
          <span class="day-range"><i style="left:${left}%;width:${width}%"></i></span>
          <span class="day-hi">${this._fmt(hi, 0)}°</span>
        </div>`;
      })
      .join("")}</div>`;
  }

  _radarHtml() {
    const lat = this._config.radar_lat ?? this._hass?.config?.latitude ?? 55.6761;
    const lon = this._config.radar_lon ?? this._hass?.config?.longitude ?? 12.5683;
    const dLat = (Number(lat) - 0.011).toFixed(3);
    const dLon = (Number(lon) - 0.015).toFixed(3);
    const windyUrl = (overlay) =>
      `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=%C2%B0C&metricWind=m/s&zoom=11&overlay=${overlay}&product=ecmwf&level=surface&lat=${lat}&lon=${lon}&detailLat=${dLat}&detailLon=${dLon}&marker=true&message=true`;
    const lightningUrl = `https://map.blitzortung.org/index.php?interactive=0&NavigationControl=0&FullScreenControl=0&Cookies=0&InfoDiv=0&MenuButtonDiv=0&ScaleControl=0&LinksCheckboxChecked=1&LinksRangeValue=10&MapStyle=2&MapStyleRangeValue=10&Advertisment=0#7/${lat}/${lon}`;
    const image = this._config.radar_image_entity;
    const tabs = image
      ? [
          ["nedbor", "Nedbør og lyn", "mdi:weather-pouring", null],
          ["vind", "Vind", "mdi:weather-windy", windyUrl("wind")],
        ]
      : [
          ["nedbor", "Nedbør", "mdi:weather-pouring", windyUrl("radar")],
          ["vind", "Vind", "mdi:weather-windy", windyUrl("wind")],
          ["lyn", "Lyn", "mdi:weather-lightning", lightningUrl],
        ];
    const active = tabs.find((t) => t[0] === this._radarTab) || tabs[0];
    const body = active[3]
      ? `<div class="radar-frame"><iframe src="${active[3]}" frameborder="0" loading="lazy"></iframe></div>`
      : `<div class="radar-img-wrap" data-more="${this._esc(image)}"><img class="radar-img" src="${this._esc(this._radarImageUrl())}" alt="Radarkort"></div>`;
    const facts = (this._config.radar_details || []).length
      ? `<div class="facts" data-radar-facts>${this._factsHtml()}</div>`
      : "";
    return `<div class="subtabs">${tabs
      .map((t) => `<button class="subtab ${t[0] === active[0] ? "active" : ""}" data-radar="${t[0]}"><ha-icon icon="${t[2]}"></ha-icon>${t[1]}</button>`)
      .join("")}</div>
      ${body}${facts}`;
  }

  _factsHtml() {
    return (this._config.radar_details || [])
      .map((item) => {
        const state = this._s(item.entity);
        const icon = item.icon || state?.attributes?.icon || "mdi:information-outline";
        return `<div class="fact" data-more="${this._esc(item.entity)}"><ha-icon icon="${this._esc(icon)}"></ha-icon><span>${this._esc(item.name || state?.attributes?.friendly_name || item.entity)}</span><b>${this._esc(this._detailValue(item.entity))}</b></div>`;
      })
      .join("");
  }

  _radarImageUrl() {
    const picture = this._s(this._config.radar_image_entity)?.attributes?.entity_picture;
    if (!picture) return "";
    return this._hass?.hassUrl ? this._hass.hassUrl(picture) : picture;
  }

  _when(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.toLocaleDateString("da-DK", { weekday: "short" })} ${d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}`;
  }

  _warningsHtml() {
    const id = this._config.warnings_entity;
    if (!id) return "";
    const state = this._s(id);
    if (!state || state.state === "unavailable") return "";
    const list = state.attributes?.varsler || state.attributes?.warnings || [];
    if (!list.length) {
      return `<div class="warn-none" data-more="${this._esc(id)}"><ha-icon icon="mdi:shield-check-outline"></ha-icon>Ingen aktive vejrvarsler</div>`;
    }
    return `<div class="warn-list">${list
      .map((w) => {
        const level = Number(w.niveau ?? w.level) || 2;
        const tone = WARNING_TONES[Math.min(4, Math.max(2, level))];
        const title = w.overskrift || w.headline || w.type || w.event || "Varsel";
        const span = [w.start || w.onset, w.slut || w.expires].map((t) => this._when(t)).filter(Boolean).join(" – ");
        return `<div class="warn" style="--tone:${tone}" data-more="${this._esc(id)}">
          <ha-icon icon="mdi:alert"></ha-icon>
          <div><b>${this._esc(title)}</b><span>${this._esc(span)}</span>${
            w.beskrivelse || w.description ? `<small>${this._esc(w.beskrivelse || w.description)}</small>` : ""
          }</div>
        </div>`;
      })
      .join("")}</div>`;
  }

  _detailValue(id) {
    const state = this._s(id);
    if (!state || state.state === "unavailable" || state.state === "unknown") return "—";
    if (typeof this._hass?.formatEntityState === "function") return this._hass.formatEntityState(state);
    const unit = state.attributes?.unit_of_measurement;
    return unit ? `${state.state} ${unit}` : state.state;
  }

  _detailNote(state) {
    const a = state?.attributes || {};
    if (a.station) return `${a.station}${Number.isFinite(Number(a.afstand_km)) ? ` · ${this._fmt(Number(a.afstand_km), 0)} km` : ""}`;
    if (a.i_går !== undefined && a.i_går !== null) {
      const unit = a.unit_of_measurement ? ` ${a.unit_of_measurement}` : "";
      return `I går ${typeof a.i_går === "number" ? this._fmt(a.i_går, 1) : this._esc(a.i_går)}${unit}`;
    }
    if (a.næste_6_timer !== undefined && a.næste_6_timer !== null) return `Næste 6 t: ${this._fmt(Number(a.næste_6_timer), 0)} %`;
    if (a.niveau_cm !== undefined) return `${this._fmt(Number(a.niveau_cm), 0)} cm`;
    return "";
  }

  _detailRowsHtml(section) {
    return (section?.items || [])
      .map((item) => {
        const state = this._s(item.entity);
        const name = item.name || state?.attributes?.friendly_name || item.entity;
        const icon = item.icon || state?.attributes?.icon || "mdi:information-outline";
        const value = this._detailValue(item.entity);
        const note = this._detailNote(state);
        return `<div class="row${value === "—" ? " off" : ""}" data-more="${this._esc(item.entity)}">
          <ha-icon icon="${this._esc(icon)}"></ha-icon>
          <span class="row-label">${this._esc(name)}${note ? `<small>${this._esc(note)}</small>` : ""}</span>
          <b>${this._esc(value)}</b>
        </div>`;
      })
      .join("");
  }

  _panel(icon, title, body, extra = "") {
    return `<section class="panel"${extra}><div class="panel-head"><ha-icon icon="${icon}"></ha-icon><span>${this._esc(title)}</span></div>${body}</section>`;
  }

  _pollenRows() {
    return (this._config.pollen || [])
      .map((p) => {
        const s = this._s(p.entity);
        const idx = this._num(s?.attributes?.index_value) ?? 0;
        const category = s?.attributes?.category || (s ? s.state : "—");
        return `<div class="row" data-more="${this._esc(p.entity)}" style="--tone:${this._pollenTone(idx)}">
          <ha-icon icon="${this._esc(p.icon || "mdi:flower-pollen")}"></ha-icon>
          <span class="row-label">${this._esc(p.name)}</span>
          <b class="toned"><i class="dot"></i>${this._esc(category)}</b>
        </div>`;
      })
      .join("");
  }

  _sunPanelBody() {
    const c = this._config;
    const sun = this._s(c.sun_entity);
    const now = this._now();
    const elevation = this._num(sun?.attributes?.elevation);
    const uv = this._uvTone(now.uv);
    const pct = Number.isFinite(elevation) ? Math.max(0, Math.min(100, ((elevation + 10) / 80) * 100)) : 0;
    return `<div class="row" data-more="${this._esc(c.sun_entity)}"><ha-icon icon="mdi:weather-sunset-up"></ha-icon><span class="row-label">Solopgang</span><b>${this._time(sun?.attributes?.next_rising)}</b></div>
      <div class="row" data-more="${this._esc(c.sun_entity)}"><ha-icon icon="mdi:weather-sunset-down"></ha-icon><span class="row-label">Solnedgang</span><b>${this._time(sun?.attributes?.next_setting)}</b></div>
      <div class="row" data-more="${this._esc(c.weather_entity)}" style="--tone:${uv.color}"><ha-icon icon="mdi:weather-sunny-alert"></ha-icon><span class="row-label">UV-indeks</span><b class="toned">${this._fmt(now.uv, 1)} · ${uv.label}</b></div>
      <div class="sun-arc"><div class="sun-track"><div class="sun-fill" style="width:${pct}%"></div><div class="sun-dot" style="left:${pct}%"></div></div>
        <div class="sun-labels"><span>Solhøjde ${this._fmt(elevation, 1)}°</span><span>Retning ${this._esc(this._compass(this._num(sun?.attributes?.azimuth)))}</span></div></div>`;
  }

  _panelsHtml() {
    const sections = this._config.detail_sections || [];
    const panels = sections.map((section, i) =>
      this._panel(section.icon || "mdi:information-outline", section.title || "", `<div class="rows" data-detail-section="${i}">${this._detailRowsHtml(section)}</div>`),
    );
    if ((this._config.pollen || []).length) panels.push(this._panel("mdi:flower-pollen", "Pollen", `<div class="rows">${this._pollenRows()}</div>`));
    panels.push(this._panel("mdi:white-balance-sunny", "Sol & UV", `<div class="rows">${this._sunPanelBody()}</div>`));
    return `<div class="panels">${panels.join("")}</div>`;
  }

  _bindMore(root) {
    root?.querySelectorAll("[data-more]").forEach((el) => el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this._more(el.dataset.more);
    }));
  }

  _render() {
    if (!this.shadowRoot) return;
    const c = this._config;
    if (!c.weather_entity) return;

    this.shadowRoot.innerHTML = `<style>
      :host{display:block;--good:var(--dashboard-success, var(--success-color, #20e3a2));--warn:var(--dashboard-warning, var(--warning-color, #f59e0b));--danger:var(--dashboard-danger, var(--error-color, #ef4444));--accent:var(--dashboard-accent, var(--info-color, #38bdf8));--edge:var(--dashboard-border-neutral, var(--divider-color, rgba(127,145,165,.2)));--muted:var(--dashboard-icon-muted, var(--disabled-text-color, #64748b));--surface:color-mix(in srgb,var(--primary-text-color) 4%,transparent);--surface-2:color-mix(in srgb,var(--primary-text-color) 7%,transparent)}
      *{box-sizing:border-box}
      ha-card{container-type:inline-size;padding:20px;border-radius:26px;background:linear-gradient(160deg,color-mix(in srgb,var(--ha-card-background,var(--card-background-color)) 92%,var(--accent) 8%),var(--ha-card-background,var(--card-background-color)) 55%);border:var(--ha-card-border-width,1px) solid var(--ha-card-border-color,var(--edge));color:var(--primary-text-color);box-shadow:var(--ha-card-box-shadow)}
      .head{display:flex;align-items:center;gap:12px;margin-bottom:16px}
      .head>ha-icon{--mdc-icon-size:26px;color:var(--accent)}
      .head strong{display:block;font-size:16px}
      .head span{display:block;color:var(--secondary-text-color);font-size:12px;margin-top:2px}
      .empty{padding:18px;text-align:center;color:var(--secondary-text-color);font-size:12px}
      .warn-list{display:flex;flex-direction:column;gap:8px;margin-bottom:14px}
      .warn{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border-radius:16px;border:1px solid color-mix(in srgb,var(--tone) 45%,transparent);background:linear-gradient(120deg,color-mix(in srgb,var(--tone) 20%,transparent),color-mix(in srgb,var(--tone) 6%,transparent));cursor:pointer}
      .warn ha-icon{--mdc-icon-size:24px;color:var(--tone);flex:0 0 auto}
      .warn b{display:block;font-size:14px}
      .warn span{display:block;font-size:11px;color:var(--secondary-text-color);margin-top:2px}
      .warn small{display:block;font-size:12px;margin-top:6px;white-space:pre-line;line-height:1.4}
      .warn-none{display:inline-flex;align-items:center;gap:6px;margin-bottom:14px;padding:6px 12px;border-radius:999px;background:color-mix(in srgb,var(--good) 10%,transparent);font-size:11px;font-weight:700;color:var(--secondary-text-color);cursor:pointer}
      .warn-none ha-icon{--mdc-icon-size:15px;color:var(--good)}
      .hero{display:grid;gap:16px;align-items:center;padding:18px;border-radius:22px;background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 16%,transparent),color-mix(in srgb,var(--accent) 3%,transparent));border:1px solid color-mix(in srgb,var(--accent) 22%,transparent);cursor:pointer}
      .hero-main{display:flex;align-items:center;gap:14px;min-width:0}
      .hero-icon{width:104px;height:104px;flex:0 0 auto;filter:drop-shadow(0 8px 18px color-mix(in srgb,var(--accent) 35%,transparent))}
      .hero-temp{font-size:58px;font-weight:800;line-height:.95;letter-spacing:-.02em}
      .hero-temp sup{font-size:.45em;vertical-align:top;margin-left:2px;color:var(--secondary-text-color)}
      .hero-cond{margin-top:6px;font-size:17px;font-weight:700}
      .hero-sub{margin-top:4px;font-size:12px;color:var(--secondary-text-color)}
      .chips{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .chip{display:flex;align-items:center;gap:9px;padding:9px 11px;border-radius:14px;background:color-mix(in srgb,var(--ha-card-background,var(--card-background-color)) 70%,transparent);border:1px solid var(--edge);--tone:var(--accent);min-width:0}
      .chip>ha-icon{--mdc-icon-size:19px;color:var(--tone);flex:0 0 auto}
      .chip span{display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--secondary-text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .chip b{display:flex;align-items:center;gap:4px;font-size:14px;font-weight:800;white-space:nowrap}
      .chip small,.hour-rain small{font-size:11px;font-weight:600;color:var(--secondary-text-color)}
      .wind-arrow{fill:var(--accent);flex:0 0 auto}
      .hourly-scroll{display:flex;gap:6px;overflow-x:auto;margin-top:14px;padding-bottom:6px;scroll-snap-type:x proximity;scrollbar-width:thin}
      .hourly-scroll::-webkit-scrollbar{height:4px}
      .hourly-scroll::-webkit-scrollbar-thumb{background:var(--edge);border-radius:4px}
      .hour{flex:0 0 auto;width:58px;display:flex;flex-direction:column;align-items:center;gap:3px;padding:10px 4px 8px;border-radius:16px;background:var(--surface);scroll-snap-align:start}
      .hour.now{background:color-mix(in srgb,var(--accent) 16%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 40%,transparent)}
      .hour img{width:34px;height:34px}
      .hour-label{font-size:11px;color:var(--secondary-text-color);font-weight:700}
      .hour-temp{font-size:14px;font-weight:800}
      .hour-rain{font-size:9px;color:var(--accent);font-weight:700;min-height:11px;white-space:nowrap}
      .hour-rain.wet{color:var(--warn)}
      .hour-bar{width:24px;height:4px;border-radius:4px;background:var(--surface-2);overflow:hidden;display:flex;align-items:flex-end}
      .hour-bar i{display:block;width:100%;background:var(--accent);border-radius:4px;height:0}
      .cols{display:grid;gap:14px;margin-top:14px}
      .panel{padding:14px 16px;border-radius:20px;background:var(--surface);border:1px solid var(--edge);min-width:0}
      .panel-head{display:flex;align-items:center;gap:8px;margin-bottom:10px;color:var(--secondary-text-color);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
      .panel-head ha-icon{--mdc-icon-size:17px;color:var(--accent)}
      .days{display:flex;flex-direction:column}
      .day{display:grid;grid-template-columns:52px 34px minmax(54px,auto) 30px 1fr 30px;align-items:center;gap:8px;padding:7px 2px;border-bottom:1px solid color-mix(in srgb,var(--edge) 60%,transparent);cursor:pointer}
      .day:last-child{border-bottom:0}
      .day img{width:32px;height:32px}
      .day-name{font-size:13px;font-weight:800}
      .day-rain{font-size:11px;font-weight:700;color:var(--accent);display:flex;flex-direction:column;line-height:1.15}
      .day-rain small{font-weight:600;color:var(--secondary-text-color);font-size:10px}
      .day-rain.wet{color:var(--warn)}
      .day-lo{text-align:right;font-size:13px;color:var(--secondary-text-color);font-weight:700}
      .day-hi{font-size:14px;font-weight:800}
      .day-range{position:relative;height:6px;border-radius:6px;background:var(--surface-2)}
      .day-range i{position:absolute;top:0;bottom:0;border-radius:6px;background:linear-gradient(90deg,#60a5fa,#facc15 60%,#fb923c)}
      .subtabs{display:flex;gap:6px;margin-bottom:10px}
      .subtab{display:flex;align-items:center;gap:5px;padding:7px 12px;border-radius:999px;border:1px solid var(--edge);background:transparent;color:var(--secondary-text-color);font-size:11px;font-weight:700;cursor:pointer}
      .subtab ha-icon{--mdc-icon-size:14px}
      .subtab.active{color:#fff;background:var(--accent);border-color:var(--accent)}
      .radar-frame{position:relative;width:100%;padding-top:100%;border-radius:16px;overflow:hidden;border:1px solid var(--edge)}
      .radar-frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
      .radar-img-wrap{border-radius:16px;overflow:hidden;border:1px solid var(--edge);background:#121820;cursor:pointer}
      .radar-img{display:block;width:100%;height:auto;aspect-ratio:1/1}
      .facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:6px;margin-top:10px}
      .fact{display:flex;flex-direction:column;gap:2px;padding:8px 10px;border-radius:12px;background:var(--surface);cursor:pointer;min-width:0}
      .fact ha-icon{--mdc-icon-size:16px;color:var(--accent)}
      .fact span{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--secondary-text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .fact b{font-size:13px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .panels{margin-top:14px;columns:1;column-gap:14px}
      .panels .panel{break-inside:avoid;margin-bottom:14px;display:inline-block;width:100%}
      .rows{display:flex;flex-direction:column}
      .row{display:grid;grid-template-columns:22px 1fr auto;align-items:center;gap:10px;padding:7px 2px;border-bottom:1px solid color-mix(in srgb,var(--edge) 55%,transparent);cursor:pointer;--tone:var(--accent)}
      .row:last-child{border-bottom:0}
      .row>ha-icon{--mdc-icon-size:19px;color:var(--tone)}
      .row-label{font-size:13px;min-width:0;overflow:hidden;text-overflow:ellipsis}
      .row-label small{display:block;font-size:10px;color:var(--secondary-text-color);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .row b{font-size:13px;font-weight:800;text-align:right;white-space:nowrap}
      .row b.toned{color:var(--tone);display:flex;align-items:center;gap:6px}
      .row.off b,.row.off>ha-icon{color:var(--muted)}
      .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--tone)}
      .sun-arc{margin-top:8px;padding:10px 4px 2px}
      .sun-track{position:relative;height:6px;border-radius:99px;background:var(--surface-2)}
      .sun-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,var(--accent),var(--warn))}
      .sun-dot{position:absolute;top:50%;width:12px;height:12px;border-radius:50%;background:var(--warn);box-shadow:0 0 10px color-mix(in srgb,var(--warn) 60%,transparent);transform:translate(-50%,-50%)}
      .sun-labels{display:flex;justify-content:space-between;margin-top:8px;font-size:11px;color:var(--secondary-text-color)}
      @container (min-width: 560px){
        .hero{grid-template-columns:minmax(0,1fr) minmax(0,1.15fr)}
        .chips{grid-template-columns:repeat(2,minmax(0,1fr))}
        .panels{columns:2}
      }
      @container (min-width: 860px){
        ha-card{padding:24px}
        .hero-icon{width:128px;height:128px}
        .hero-temp{font-size:72px}
        .chips{grid-template-columns:repeat(4,minmax(0,1fr))}
        .hero{grid-template-columns:minmax(0,.8fr) minmax(0,1.6fr)}
        .cols{grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);align-items:start}
        .panels{columns:3}
      }
      @container (min-width: 1300px){
        ha-card{padding:28px}
        .hero-icon{width:150px;height:150px}
        .hero-temp{font-size:84px}
        .chip b{font-size:16px}
        .hourly-scroll{justify-content:space-between}
        .hour{width:auto;flex:1 0 62px}
        /* Everything below the hours flows as balanced columns. */
        .lower{columns:3;column-gap:16px;margin-top:16px}
        .cols,.panels{display:contents}
        .lower .panel{break-inside:avoid;display:inline-block;width:100%;margin:0 0 16px}
      }
      @container (max-width: 420px){
        ha-card{padding:16px}
        .hero{padding:14px}
        .hero-icon{width:84px;height:84px}
        .hero-temp{font-size:46px}
        .day{grid-template-columns:44px 30px minmax(46px,auto) 26px 1fr 26px;gap:6px}
      }
    </style>
    <ha-card>
      <div class="head">
        <ha-icon icon="mdi:weather-partly-cloudy"></ha-icon>
        <div><strong>${this._esc(c.title)}</strong><span>${this._esc(c.subtitle)}</span></div>
      </div>
      ${this._warningsHtml()}
      ${this._heroHtml()}
      ${this._hourlyHtml()}
      <div class="lower">
        <div class="cols">
          ${this._panel("mdi:calendar-week", "De næste dage", this._daysHtml())}
          ${this._panel("mdi:radar", "Radar", this._radarHtml())}
        </div>
        ${this._panelsHtml()}
      </div>
    </ha-card>`;

    this.shadowRoot.querySelectorAll("[data-radar]").forEach((el) =>
      el.addEventListener("click", () => {
        this._radarTab = el.dataset.radar;
        this._render();
      }),
    );
    this._bindMore(this.shadowRoot);
    this._shieldFromSwipeNav(this.shadowRoot.querySelector(".hourly-scroll"));
  }

  getCardSize() {
    return 24;
  }
}

if (!customElements.get("ha-weather-card")) customElements.define("ha-weather-card", HAWeatherCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha-weather-card",
  name: "HA Weather Card",
  description: "Samlet vejrkort: varsler, nu/i dag, timeprognose, radar (web eller image-entity), ekstra målinger, pollen, sol & UV og 5-dages udsigt",
  preview: true,
});
console.info(
  `%c HA WEATHER CARD %c v${VERSION} `,
  "color:#fff;background:#38bdf8;font-weight:700",
  "color:#38bdf8;background:#161b22",
);
