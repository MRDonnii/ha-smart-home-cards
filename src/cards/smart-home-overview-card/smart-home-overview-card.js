const VERSION = "1.0.1";

const DEFAULT_ENTITIES = {
  houseMode: "input_select.house_mode",
  guestOverride: "input_boolean.house_mode_guest_override",
  holidayOverride: "input_boolean.house_mode_holiday_override",
  alarm: "alarm_control_panel.home_alarm",
  secondaryAlarm: "alarm_control_panel.secondary_alarm",
  weather: "weather.home",
  powerTotal: "sensor.house_power",
  evPowerKw: "sensor.ev_charger_power_kw",
  homeEnergyToday: "sensor.home_energy_today",
  evBattery: "sensor.ev_battery",
  evEnergyToday: "sensor.ev_energy_today",
  evChargeState: "sensor.ev_charger_state",
  priceNow: "sensor.electricity_price_now",
  priceTomorrowAvailable: "binary_sensor.electricity_price_tomorrow_available",
  priceForecast: "sensor.electricity_price_forecast",
  priceForecastDaySelector: "input_number.electricity_forecast_day",
  poolTemp: "sensor.pool_temperature",
  poolOccupied: "binary_sensor.pool_occupied",
  poolPumpRunning: "binary_sensor.pool_pump_running",
  petMode: "select.pet_feeder_mode",
  petMorning: "input_select.pet_feeder_morning_status",
  petMidday: "input_select.pet_feeder_midday_status",
  petEvening: "input_select.pet_feeder_evening_status",
  lockFront: "lock.front_door",
  lockUtility: "lock.utility_door",
  lockGarage: "lock.garage_door",
  terraceDoorContact: "binary_sensor.terrace_door_contact",
  gateContact: "binary_sensor.gate_contact",
  openWindows: "sensor.open_windows",
  hotWaterStatus: "sensor.hot_water_status",
  heatingState: "sensor.heating_state",
  heatingPressure: "sensor.heating_pressure",
  heatingValveHeating: "sensor.heating_valve_position_heating",
  heatingValveIdle: "sensor.heating_valve_position",
  heatingEnergyToday: "sensor.heating_energy_today",
  cheapestHeatingStatus: "sensor.cheapest_heating_status",
  automationsOffCount: "sensor.automations_off_count",
  kioskEditMode: "input_boolean.kiosk_edit_mode",
  applianceWasher: "binary_sensor.washer_running",
  applianceDryer: "binary_sensor.dryer_running",
  applianceDishwasher: "binary_sensor.dishwasher_running",
  nightLockWindow: "binary_sensor.night_lock_warning_window",
};

const DEFAULT_PATHS = {
  weather: "/weather",
  energy: "/energy",
  ev: "/ev",
  electricityPrice: "/electricity-price",
  pool: "/pool",
  pet: "/pet",
  security: "/security",
  heating: "/heating",
  settings: "/settings",
  cameras: "/cameras",
};

const DEFAULT_PRICE_THRESHOLDS = { medium: 2.05, high: 3.99, critical: 5.49 };

const DEFAULT_ALERTS = [
  { entity: "sensor.hoveddor_battery", kind: "battery", title: "Hoveddørens lås", detail: "Batteri under 20%", icon: "mdi:battery-alert", action: 20 },
  { entity: "input_boolean.der_er_post", kind: "on", title: "Der er post i postkassen", detail: "Tryk for at åbne postkasse-siden", icon: "mdi:mailbox-up", action: "/mailbox" },
];

const DEFAULT_PEOPLE = [
  { name: "Person 1", entity: "person.person_1", city: "sensor.person_1_city", battery: "sensor.person_1_phone_battery", trip: "sensor.person_1_travel_time", path: "/person-1" },
  { name: "Person 2", entity: "person.person_2", city: "sensor.person_2_city", battery: "sensor.person_2_phone_battery", trip: "sensor.person_2_travel_time", path: "/person-2" },
];

const DEFAULT_CAMERA_GROUPS = [
  { label: "Forside", selector_entity: "sensor.aktivt_kamera_forside", path: "/cameras", cameras: [
    { key: "hoveddor", name: "Hoveddør", camera_entity: "camera.hoveddor" },
    { key: "indkorsel", name: "Indkørsel", camera_entity: "camera.indkorsel" },
  ] },
];

const DEFAULT_NIGHT_LOCKS = ["lock.front_door", "lock.utility_door", "lock.garage_door"];

class SmartHomeOverviewCard extends HTMLElement {
  static getStubConfig() {
    return {
      title: "Hjemmet",
      pet_name: "Kæledyr",
      car_name: "Bilen",
      currency: "kr",
      entities: { ...DEFAULT_ENTITIES },
      paths: { ...DEFAULT_PATHS },
      price_thresholds: { ...DEFAULT_PRICE_THRESHOLDS },
      alerts: DEFAULT_ALERTS,
      people: DEFAULT_PEOPLE,
      camera_groups: DEFAULT_CAMERA_GROUPS,
      night_locks: DEFAULT_NIGHT_LOCKS,
      night_extra_contacts: [],
      heating_fault_entities: [],
    };
  }

  static async getConfigElement() {
    await customElements.whenDefined("smart-home-overview-card-editor");
    return document.createElement("smart-home-overview-card-editor");
  }

  setConfig(config) {
    const cfg = config || {};
    this.config = {
      title: "Hjemmet",
      pet_name: "Kæledyr",
      car_name: "Bilen",
      currency: "kr",
      alerts: DEFAULT_ALERTS,
      people: DEFAULT_PEOPLE,
      camera_groups: DEFAULT_CAMERA_GROUPS,
      night_locks: DEFAULT_NIGHT_LOCKS,
      night_extra_contacts: [],
      heating_fault_entities: [],
      ...cfg,
      entities: { ...DEFAULT_ENTITIES, ...(cfg.entities || {}) },
      paths: { ...DEFAULT_PATHS, ...(cfg.paths || {}) },
      price_thresholds: { ...DEFAULT_PRICE_THRESHOLDS, ...(cfg.price_thresholds || {}) },
    };
    this._priceTab = "today";
    this._alertIndex = 0;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    if (!this._clockTimer) this._clockTimer = window.setInterval(() => this._updateClock(), 1000);
    if (!this._alertTimer) this._alertTimer = window.setInterval(() => { this._alertIndex += 1; this._renderAlert(); }, 6000);
  }

  disconnectedCallback() {
    window.clearInterval(this._clockTimer);
    window.clearInterval(this._alertTimer);
    this._clockTimer = null;
    this._alertTimer = null;
  }

  set hass(hass) {
    this._hass = hass;
    for (const card of this._cameraCards || []) card.hass = hass;
    const signature = this._signature();
    if (!this._built || signature !== this._lastSignature) {
      this._lastSignature = signature;
      this._render();
    }
  }

  getCardSize() { return 16; }
  getGridOptions() { return { columns: "full", rows: "auto", min_rows: 8 }; }
  _s(id) { return id ? this._hass?.states?.[id] : undefined; }
  _state(id, fallback = "–") { const value = this._s(id)?.state; return value == null || ["unknown", "unavailable"].includes(value) ? fallback : value; }
  _num(id) { const state = this._s(id)?.state; if (state == null) return null; const value = Number(String(state).replace(",", ".")); return Number.isFinite(value) ? value : null; }
  _on(id) { return !!id && ["on", "open", "opening", "home", "playing", "cleaning", "running"].includes(this._s(id)?.state); }
  _esc(value) { return String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c])); }
  _fmt(value, digits = 1) { return value == null ? "–" : value.toLocaleString("da-DK", { minimumFractionDigits: digits, maximumFractionDigits: digits }); }
  _name(id) { return this._s(id)?.attributes?.friendly_name || id; }

  _cameraDetectionIds(cam) {
    const prefix = cam.detection_prefix || cam.key;
    return [cam.camera_entity, cam.motion_entity, ...(cam.extra_event_entities || []), ...(prefix ? ["person_detected", "animal_detected", "vehicle_detected", "object_detected", "audio_object_detected", "doorbell", "license_plate_detected", "motion"].map((s) => `binary_sensor.${prefix}_${s}`) : [])].filter(Boolean);
  }

  _signature() {
    if (!this._hass) return "";
    const ids = new Set([
      ...Object.values(this.config.entities),
      ...(this.config.alerts || []).map((a) => a.entity),
      ...(this.config.people || []).flatMap((p) => Object.values(p).filter((x) => typeof x === "string" && x.includes("."))),
      ...(this.config.camera_groups || []).flatMap((g) => [g.selector_entity, ...(g.cameras || []).flatMap((c) => this._cameraDetectionIds(c))]),
      ...(this.config.night_locks || []),
      ...(this.config.night_extra_contacts || []).map((c) => c.entity),
      ...(this.config.heating_fault_entities || []),
    ].filter(Boolean));
    return [...ids].map((id) => `${id}:${this._s(id)?.state}:${this._s(id)?.last_updated || ""}`).join("|");
  }

  _activeAlerts() {
    const e = this.config.entities;
    const result = [];
    for (const alert of this.config.alerts || []) {
      const { entity, kind, title, detail, icon, action } = alert;
      const state = this._s(entity)?.state;
      let active = false;
      if (kind === "on") active = state === "on";
      if (kind === "battery") active = Number(state) < action && Number.isFinite(Number(state));
      if (kind === "not-clear") active = state != null && !["none", "no_error", "unknown", "unavailable", "ok", "idle"].includes(String(state).toLowerCase());
      if (active) result.push({ entity, title, detail, icon, action: typeof action === "string" ? action : null, toggle: alert.toggle ? entity : null });
    }
    for (const state of Object.values(this._hass?.states || {})) {
      const id = state?.entity_id || "";
      if (state?.state !== "on") continue;
      if (/^binary_sensor\..*_smoke_alarm_detected$/.test(id)) result.push({ entity: id, title: `Røgalarm: ${this._name(id)}`, detail: "Sikkerhedstjek anbefales straks", icon: "mdi:smoke-detector-alert" });
      if (/^binary_sensor\..*_co_alarm_detected$/.test(id)) result.push({ entity: id, title: `CO-alarm: ${this._name(id)}`, detail: "Udluft og forlad området ved behov", icon: "mdi:molecule-co" });
      if (/^binary_sensor\..*_(glass_break|siren)_detected$/.test(id)) result.push({ entity: id, title: `Sikkerhedshændelse: ${this._name(id)}`, detail: "Muligt glasbrud eller aktiv sirene", icon: "mdi:shield-alert" });
    }
    const late = this._on(e.nightLockWindow);
    if (late) {
      for (const id of this.config.night_locks || []) {
        if (this._s(id)?.state === "unlocked") result.push({ entity: id, title: this._name(id), detail: "Ulåst i nattens sikkerhedsvindue", icon: "mdi:door-open" });
      }
      for (const extra of this.config.night_extra_contacts || []) {
        const openState = extra.open_state || "on";
        if (this._s(extra.entity)?.state === openState) result.push({ entity: extra.entity, title: extra.label || this._name(extra.entity), detail: "Åben efter nattens sikkerhedsvindue", icon: extra.icon || "mdi:door-open" });
      }
    }
    return result;
  }

  _houseMode() {
    const e = this.config.entities;
    const manual = this._state(e.houseMode, "Hjemme");
    if (this._on(e.guestOverride) || manual === "Gæster") return ["Gæster", "mdi:account-group", "var(--info-color)"];
    if (this._on(e.holidayOverride) || manual === "Ferie") return ["Ferie", "mdi:palm-tree", "var(--primary-color)"];
    if (this._state(e.alarm, "") === "armed_away") return ["Huset er sikret", "mdi:shield-home", "var(--warning-color)"];
    if (manual === "Ingen hjemme") return ["Ingen hjemme", "mdi:home-export-outline", "var(--secondary-text-color)"];
    if (manual === "Nat") return ["Nat", "mdi:weather-night", "var(--info-color)"];
    if (manual === "Stille") return ["Stille", "mdi:volume-off", "var(--dashboard-accent, var(--primary-color))"];
    return [manual || "Hjemme", "mdi:home-heart", "var(--success-color)"];
  }

  _weather() {
    const entity = this._s(this.config.entities.weather);
    const labels = { sunny: "Sol", clear: "Klart", "clear-night": "Klar nat", cloudy: "Overskyet", partlycloudy: "Let overskyet", rainy: "Regn", pouring: "Skybrud", snowy: "Sne", "snowy-rainy": "Slud", fog: "Tåget", windy: "Blæsende", "windy-variant": "Blæsende", hail: "Hagl", lightning: "Torden", thunderstorm: "Torden", "lightning-rainy": "Regn og torden", exceptional: "Ekstremt vejr" };
    const icons = { sunny: "mdi:weather-sunny", clear: "mdi:weather-sunny", "clear-night": "mdi:weather-night", cloudy: "mdi:weather-cloudy", partlycloudy: "mdi:weather-partly-cloudy", rainy: "mdi:weather-rainy", pouring: "mdi:weather-pouring", snowy: "mdi:weather-snowy", "snowy-rainy": "mdi:weather-snowy-rainy", fog: "mdi:weather-fog", windy: "mdi:weather-windy", "windy-variant": "mdi:weather-windy-variant", hail: "mdi:weather-hail", lightning: "mdi:weather-lightning", thunderstorm: "mdi:weather-lightning", "lightning-rainy": "mdi:weather-lightning-rainy", exceptional: "mdi:weather-hurricane" };
    const state = entity?.state || "unknown";
    return { label: labels[state] || this._esc(state), icon: icons[state] || "mdi:weather-cloudy-alert", temp: Number(entity?.attributes?.temperature), condition: state };
  }

  _weatherFx(condition) {
    const rain = ["rainy", "pouring", "lightning", "lightning-rainy", "hail", "snowy-rainy"].includes(condition);
    const snow = ["snowy", "snowy-rainy"].includes(condition);
    const clouds = ["partlycloudy", "cloudy", "fog", "windy", "windy-variant"].includes(condition);
    const clear = ["sunny", "clear"].includes(condition);
    const night = condition === "clear-night";
    const storm = ["lightning", "lightning-rainy"].includes(condition);
    const particles = `${rain ? Array.from({ length: 12 }, (_, i) => `<i class="drop" style="--x:${(i * 17 + 7) % 100}%;--d:-${(i % 7) * .19}s"></i>`).join("") : ""}${snow ? Array.from({ length: 11 }, (_, i) => `<i class="flake" style="--x:${(i * 23 + 5) % 100}%;--d:-${(i % 6) * .31}s"></i>`).join("") : ""}`;
    return `<div class="weather-fx ${rain ? "rain" : ""} ${snow ? "snow" : ""} ${clouds ? "cloudy" : ""} ${clear ? "sunny" : ""} ${night ? "night" : ""} ${storm ? "storm" : ""}" aria-hidden="true">${particles}${clouds ? "<i class=\"cloud one\"></i><i class=\"cloud two\"></i>" : ""}${clear ? "<i class=\"sun-orb\"></i>" : ""}${night ? "<i class=\"star one\"></i><i class=\"star two\"></i><i class=\"star three\"></i>" : ""}</div>`;
  }

  _metricCards() {
    const e = this.config.entities;
    const t = this.config.price_thresholds;
    const total = this._num(e.powerTotal) || 0;
    const carKw = this._num(e.evPowerKw) || 0;
    const homeW = Math.max(0, total - carKw * 1000);
    const homeValue = homeW < 1000 ? `${Math.round(homeW)} W` : `${this._fmt(homeW / 1000, 2)} kW`;
    const homeDay = this._num(e.homeEnergyToday);
    const battery = this._num(e.evBattery);
    const carDay = this._num(e.evEnergyToday);
    const charging = carKw > .05;
    const price = this._num(e.priceNow);
    const priceLabel = price == null ? "Ingen prisdata" : price >= t.critical ? "Meget høj pris" : price >= t.high ? "Høj pris" : price >= t.medium ? "Mellem pris" : "Lav pris";
    const pool = this._num(e.poolTemp);
    const occupied = this._on(e.poolOccupied);
    const pump = this._on(e.poolPumpRunning);
    return [
      { cls: "energy", icon: "mdi:home-lightning-bolt-outline", title: "Husforbrug", value: homeValue, detail: `${this._fmt(homeDay, 1)} kWh i dag`, path: this.config.paths.energy, level: Math.min(100, homeW / 70) },
      { cls: charging ? "charging" : "car", icon: "mdi:car-electric-outline", title: this.config.car_name, value: battery == null ? "–" : `${Math.round(battery)}%`, detail: charging ? `${this._fmt(carKw, 1)} kW · ${this._fmt(carDay, 2)} kWh` : this._state(e.evChargeState, "Ikke tilsluttet") === "scheduled" ? "Planlagt" : `${this._fmt(carDay, 2)} kWh i dag`, path: this.config.paths.ev, level: battery || 0 },
      { cls: price != null && price >= t.high ? "warning" : "price", icon: "mdi:cash-multiple", title: "Elpris nu", value: price == null ? "–" : `${this._fmt(price, 2)} ${this.config.currency}`, detail: priceLabel, path: this.config.paths.electricityPrice, level: Math.min(100, (price || 0) / 7 * 100) },
      { cls: occupied ? "warning" : "pool", icon: occupied ? "mdi:account-swim" : "mdi:pool-thermometer", title: "Pool", value: pool == null ? "–" : `${this._fmt(pool, 1)}°C`, detail: occupied ? "Person i vandet" : pump ? "Pumpen kører" : "Poolen er klar", path: this.config.paths.pool, level: Math.min(100, Math.max(0, ((pool || 0) - 10) / 20 * 100)) }
    ];
  }

  _camera(group) {
    const selectedKey = this._state(group.selector_entity, "");
    const cameras = group.cameras || [];
    const cam = cameras.find((c) => c.key === selectedKey) || cameras[0];
    return { label: group.label, path: cam?.path || group.path, selected: cam?.name || selectedKey, entityId: cam?.camera_entity, detection: this._cameraDetection(cam) };
  }

  _cameraDetection(cam) {
    if (!cam) return "idle";
    const prefix = cam.detection_prefix || cam.key;
    if (this._on(`binary_sensor.${prefix}_person_detected`)) return "person";
    if (this._on(`binary_sensor.${prefix}_animal_detected`)) return "animal";
    if (this._on(`binary_sensor.${prefix}_vehicle_detected`)) return "vehicle";
    const eventIds = [`binary_sensor.${prefix}_object_detected`, `binary_sensor.${prefix}_audio_object_detected`, `binary_sensor.${prefix}_doorbell`, `binary_sensor.${prefix}_license_plate_detected`, ...(cam.extra_event_entities || [])];
    if (eventIds.some((id) => this._on(id))) return "event";
    return this._on(cam.motion_entity || `binary_sensor.${prefix}_motion`) ? "motion" : "idle";
  }

  async _mountLiveCameras() {
    const slots = [...(this.shadowRoot?.querySelectorAll("[data-live-camera]") || [])];
    if (!slots.length || !window.loadCardHelpers) return;
    try {
      const helpers = await window.loadCardHelpers();
      this._cameraCards = [];
      for (const slot of slots) {
        const card = helpers.createCardElement({
          type: "picture-glance",
          camera_image: slot.dataset.liveCamera,
          camera_view: "live",
          entities: [],
          show_name: false,
          show_state: false,
          reload: false,
          aspect_ratio: "16:9",
          fit_mode: "fill",
          tap_action: { action: "navigate", navigation_path: slot.dataset.cameraPath }
        });
        card.hass = this._hass;
        slot.replaceChildren(card);
        this._cameraCards.push(card);
      }
    } catch (error) {
      console.warn("Smart Home Overview Card: live camera mount failed", error);
    }
  }

  _person(person) {
    const entity = this._s(person.entity);
    const state = entity?.state || "unknown";
    const home = state === "home";
    const picture = entity?.attributes?.entity_picture;
    const city = this._state(person.city, state === "not_home" ? "Ude" : state);
    const battery = this._num(person.battery);
    const trip = this._num(person.trip);
    return { ...person, state, home, picture, city, battery, trip, reminderActive: person.reminder && this._on(person.reminder) };
  }

  _security() {
    const e = this.config.entities;
    const items = [
      [e.lockFront, (v) => v === "locked"],
      [e.lockUtility, (v) => v === "locked"],
      [e.lockGarage, (v) => v === "locked"],
      [e.terraceDoorContact, (v) => ["off", "closed", "false", "0"].includes(v)],
      [e.gateContact, (v) => ["on", "open", "true", "1"].includes(v)]
    ].filter(([id]) => !!id);
    let secure = 0, insecure = 0;
    for (const [id, test] of items) {
      const value = this._s(id)?.state;
      if ([undefined, "unknown", "unavailable"].includes(value)) continue;
      test(String(value).toLowerCase()) ? secure += 1 : insecure += 1;
    }
    return { secure, insecure, total: items.length, label: insecure ? "Åben" : items.length && secure === items.length ? "Låst" : "Ukendt", windows: this._num(e.openWindows) || 0, alarm: this._state(e.alarm), secondaryAlarm: this._state(e.secondaryAlarm) };
  }

  _heating() {
    const e = this.config.entities;
    const heatState = String(this._state(e.heatingState, "")).toLowerCase();
    const heatRaw = Number(this._s(e.heatingState)?.attributes?.raw_value);
    const water = String(this._state(e.hotWaterStatus, "")).toLowerCase();
    const pressure = this._num(e.heatingPressure);
    const faults = (this.config.heating_fault_entities || []).some((id) => this._on(id));
    const critical = pressure != null && pressure > 0 && pressure < 1;
    const heating = heatRaw === 1 || heatState.includes("opvarm") || heatState === "til";
    const bypass = !heating && water.includes("bypass");
    const activeWater = !heating && !bypass && (water.includes("opvarm") || water.includes("vand") || water.includes("varm"));
    const value = critical ? "Tryk kritisk" : faults ? "Fejl" : heating ? "Varme" : bypass ? "Bypass" : activeWater ? "Vand" : "Idle";
    const valve = this._num(heating ? e.heatingValveHeating : e.heatingValveIdle) || 0;
    const day = this._num(e.heatingEnergyToday);
    return { value, valve, pressure, day, cheapest: this._state(e.cheapestHeatingStatus, "Afventer"), warning: critical || faults };
  }

  _priceData(tab = this._priceTab) {
    const e = this.config.entities;
    const source = tab === "today" ? this._s(e.priceNow) : tab === "tomorrow" ? this._s(e.priceTomorrowAvailable) : this._s(e.priceForecast);
    const raw = Array.isArray(source?.attributes?.prices) ? source.attributes.prices : [];
    const parsed = raw.map((p) => ({ ts: Date.parse(p?.start || ""), price: Number(p?.price) })).filter((p) => Number.isFinite(p.ts) && Number.isFinite(p.price)).sort((a, b) => a.ts - b.ts);
    if (tab !== "week") return parsed;
    const groups = new Map();
    for (const point of parsed) {
      const d = new Date(point.ts); const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(point);
    }
    const days = [...groups.values()].slice(0, 6);
    const selected = Math.max(0, Math.min(days.length - 1, Math.round(this._num(e.priceForecastDaySelector) || 0)));
    return days[selected] || [];
  }

  _priceChart() {
    const t = this.config.price_thresholds;
    const data = this._priceData();
    if (!data.length) return `<div class="chart-empty"><ha-icon icon="mdi:chart-timeline-variant-shimmer"></ha-icon><span>Prisdata er ikke tilgængelige endnu</span></div>`;
    const values = data.map((p) => p.price); const min = Math.min(...values); const max = Math.max(...values); const spread = Math.max(.1, max - min); const now = Date.now();
    const bars = data.map((p, i) => {
      const height = 15 + ((p.price - min) / spread) * 75;
      const active = now >= p.ts && now < p.ts + 3600000;
      const tone = p.price >= t.critical ? "critical" : p.price >= t.high ? "high" : p.price >= t.medium ? "medium" : "low";
      const hour = new Date(p.ts).getHours();
      return `<button class="bar ${tone} ${active ? "current" : ""}" style="--h:${height}%" data-more="${this.config.entities.priceNow}" title="${String(hour).padStart(2, "0")}:00 · ${this._fmt(p.price, 2)} ${this.config.currency}/kWh"><i></i>${i % Math.max(1, Math.ceil(data.length / 8)) === 0 ? `<small>${String(hour).padStart(2, "0")}</small>` : ""}</button>`;
    }).join("");
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const first = new Date(data[0].ts);
    const dayControls = this._priceTab === "week" ? `<div class="day-controls"><button data-forecast-step="-1" aria-label="Forrige dag"><ha-icon icon="mdi:chevron-left"></ha-icon></button><button data-forecast-step="1" aria-label="Næste dag"><ha-icon icon="mdi:chevron-right"></ha-icon></button></div>` : "";
    return `<div class="chart-head"><div class="chart-day"><div><span>${this._priceTab === "today" ? "I dag" : this._priceTab === "tomorrow" ? "I morgen" : first.toLocaleDateString("da-DK", { weekday: "long", day: "2-digit", month: "2-digit" })}</span><strong>${data.length} timer</strong></div>${dayControls}</div><div class="chart-stats"><span>Lav <b>${this._fmt(min, 2)}</b></span><span>Snit <b>${this._fmt(avg, 2)}</b></span><span>Høj <b>${this._fmt(max, 2)}</b></span></div></div><div class="bars">${bars}</div>`;
  }

  _stepForecast(delta) {
    const e = this.config.entities;
    const current = Math.round(this._num(e.priceForecastDaySelector) || 0);
    const prices = this._s(e.priceForecast)?.attributes?.prices || [];
    const days = new Set(prices.map((p) => { const d = new Date(p?.start); return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }).filter(Boolean)).size;
    const value = Math.max(0, Math.min(Math.max(0, days - 1), current + delta));
    this._hass?.callService("input_number", "set_value", { entity_id: e.priceForecastDaySelector, value });
  }

  _meter(level, segments = 5) {
    const active = Math.max(0, Math.min(segments, Math.ceil(level / (100 / segments))));
    return `<div class="meter">${Array.from({ length: segments }, (_, i) => `<i class="${i < active ? "on" : ""}" style="--delay:${i * .11}s"></i>`).join("")}</div>`;
  }

  _render() {
    if (!this.shadowRoot || !this._hass) return;
    const e = this.config.entities;
    const mode = this._houseMode(); const weather = this._weather(); const alerts = this._activeAlerts();
    const metrics = this._metricCards(); const people = (this.config.people || []).map((p) => this._person(p)); const security = this._security(); const heating = this._heating();
    const cameras = (this.config.camera_groups || []).map((g) => this._camera(g));
    const foodMode = this._state(e.petMode); const offAutomations = this._num(e.automationsOffCount) || 0; const edit = this._on(e.kioskEditMode);
    const applianceCount = [e.applianceWasher, e.applianceDryer, e.applianceDishwasher].filter((id) => this._on(id)).length;
    const markup = `<style>${this._styles()}</style>
      <main class="dashboard" style="--mode:${mode[2]}">
        <header class="hero card accent-mode">
          ${this._weatherFx(weather.condition)}
          <button class="menu icon-button" data-menu data-hold-toggle="${e.kioskEditMode}" aria-label="Åbn menu"><ha-icon icon="mdi:menu"></ha-icon></button>
          <div class="hero-copy"><div class="eyebrow"><i></i>${this._esc(this.config.title)}</div><div class="mode"><ha-icon icon="${mode[1]}"></ha-icon><span>${this._esc(mode[0])}</span></div></div>
          <div class="clock"><strong data-clock-time>--:--</strong><span data-clock-date>--</span></div>
          <button class="weather" data-nav="${this.config.paths.weather}"><ha-icon icon="${weather.icon}"></ha-icon><div><strong>${Number.isFinite(weather.temp) ? `${this._fmt(weather.temp, 1)}°` : "–"}</strong><span>${weather.label}</span></div></button>
          <ha-icon class="ambient-icon" icon="${mode[1]}"></ha-icon>
        </header>
        <section class="alert-slot ${alerts.length ? "visible" : "clear"}" data-alert-slot></section>
        <section class="overview card"><div class="panel-line"><span>Hjemmet</span><b>${alerts.length ? `${alerts.length} beskeder` : "Alt normalt"}</b></div><div class="metric-grid">
          ${metrics.map((m) => `<button class="metric accent-${m.cls}" data-nav="${m.path}"><div class="metric-icon"><ha-icon icon="${m.icon}"></ha-icon></div><div class="metric-copy"><span>${this._esc(m.title)}</span><strong>${m.value}</strong><small>${m.detail}</small>${this._meter(m.level)}</div><ha-icon class="card-bg" icon="${m.icon}"></ha-icon></button>`).join("")}
        </div><div class="panel-divider"></div><div class="system-grid">
          <button class="system accent-pet" data-nav="${this.config.paths.pet}"><div class="system-top"><div class="system-icon"><ha-icon icon="mdi:dog-side"></ha-icon></div><span>${this._esc(this.config.pet_name)}</span><strong>${this._esc(foodMode)}</strong></div><div class="system-bottom"><span>M ${this._esc(this._state(e.petMorning))}</span><span>Mi ${this._esc(this._state(e.petMidday))}</span><span>A ${this._esc(this._state(e.petEvening))}</span></div><ha-icon class="card-bg" icon="mdi:dog-side"></ha-icon></button>
          <button class="system ${security.insecure ? "accent-warning" : "accent-safe"}" data-nav="${this.config.paths.security}"><div class="system-top"><div class="system-icon"><ha-icon icon="${security.insecure ? "mdi:home-lock-open" : "mdi:home-lock"}"></ha-icon></div><span>Sikkerhed</span><strong>${security.label}</strong></div><div class="system-bottom"><span>${security.secure}/${security.total} sikret</span><span>${security.windows} vinduer</span><span>Alarm ${this._alarmLabel(security.alarm)}</span></div><ha-icon class="card-bg" icon="mdi:shield-home-outline"></ha-icon></button>
          <button class="system ${heating.warning ? "accent-warning" : "accent-heat"}" data-nav="${this.config.paths.heating}"><div class="system-top"><div class="system-icon"><ha-icon icon="${heating.warning ? "mdi:alert-circle" : heating.value === "Varme" ? "mdi:radiator" : "mdi:water-boiler"}"></ha-icon></div><span>Varme</span><strong>${heating.value}</strong></div><div class="system-bottom"><span>${this._fmt(heating.pressure, 1)} bar</span><span>Ventil ${Math.round(heating.valve)}%</span><span>${this._fmt(heating.day, 0)} kWh</span><span>${this._esc(heating.cheapest)}</span></div><ha-icon class="card-bg" icon="mdi:home-thermometer-outline"></ha-icon></button>
          <button class="system ${edit ? "accent-warning" : "accent-settings"}" data-nav="${this.config.paths.settings}"><div class="system-top"><div class="system-icon"><ha-icon icon="mdi:tune-variant"></ha-icon></div><span>Indstillinger</span><strong>${edit ? "Edit" : "Klar"}</strong></div><div class="system-bottom"><span>${offAutomations} autom. slukket</span><span>${applianceCount} hvidevarer aktive</span></div><ha-icon class="card-bg" icon="mdi:cog-outline"></ha-icon></button>
        </div></section>
        <section class="camera-panel card"><div class="panel-line"><span><i></i>Live kameraer</span><button data-nav="${this.config.paths.cameras}">Alle <ha-icon icon="mdi:arrow-right"></ha-icon></button></div><div class="camera-grid">
          ${cameras.map((c) => `<article class="camera detect-${c.detection}" title="${this._esc(c.label)} · ${this._esc(c.selected)}"><div class="camera-live" data-live-camera="${c.entityId}" data-camera-path="${c.path}"></div></article>`).join("")}
        </div></section>
        <section class="family card"><div class="panel-line"><span>Familien</span><b>${people.filter((p) => p.home).length} hjemme</b></div><div class="people-grid">
          ${people.map((p) => `<button class="person ${p.home ? "home" : "away"}" data-nav="${p.path}" data-more="${p.entity}" ${p.hold ? `data-hold-button="${p.hold}"` : ""}><div class="avatar">${p.picture ? `<img src="${this._esc(p.picture)}" alt="">` : `<ha-icon icon="mdi:account"></ha-icon>`}<i></i></div><div class="person-copy"><span>${this._esc(p.name)}${p.reminderActive ? `<em title="Påmindelse">!</em>` : ""}</span><strong>${this._esc(p.city)}</strong><small>${p.home ? "Hjemme" : this._esc(p.state)} · ${p.trip == null ? "–" : `${Math.round(p.trip)} min`}</small></div><div class="battery ${p.battery != null && p.battery < 20 ? "low" : ""}"><ha-icon icon="mdi:battery-medium"></ha-icon>${p.battery == null ? "–" : `${Math.round(p.battery)}%`}</div><ha-icon class="card-bg" icon="mdi:account-heart-outline"></ha-icon></button>`).join("")}
        </div></section>
        <section class="prices card accent-price"><div class="price-title"><span>Elpriser</span><div class="price-tabs"><button class="${this._priceTab === "today" ? "active" : ""}" data-price-tab="today">I dag</button><button class="${this._priceTab === "tomorrow" ? "active" : ""}" data-price-tab="tomorrow">I morgen</button><button class="${this._priceTab === "week" ? "active" : ""}" data-price-tab="week">Uge</button></div></div><div data-chart>${this._priceChart()}</div><button class="price-more" data-nav="${this.config.paths.electricityPrice}">Detaljer <ha-icon icon="mdi:arrow-right"></ha-icon></button><ha-icon class="card-bg" icon="mdi:chart-timeline-variant-shimmer"></ha-icon></section>
      </main>`;
    const cameraKey = cameras.map((c) => c.entityId).join("|");
    if (!this._built) {
      this.shadowRoot.innerHTML = markup;
      this._built = true;
      this._cameraKey = cameraKey;
      this._bind(); this._updateClock(); this._renderAlert(); this._mountLiveCameras();
      return;
    }
    const template = document.createElement("template");
    template.innerHTML = markup;
    const currentMain = this.shadowRoot.querySelector("main");
    const nextMain = template.content.querySelector("main");
    currentMain.style.cssText = nextMain.style.cssText;
    const nextSections = [...nextMain.children];
    const mounted = [];
    for (let index = 0; index < nextSections.length; index += 1) {
      const next = nextSections[index];
      const current = currentMain.children[index];
      if (next.classList.contains("camera-panel") && cameraKey === this._cameraKey) continue;
      current.replaceWith(next);
      mounted.push(next);
    }
    if (cameraKey === this._cameraKey) [...currentMain.querySelectorAll(".camera")].forEach((node, index) => { node.className = `camera detect-${cameras[index]?.detection || "idle"}`; node.title = `${cameras[index]?.label || "Kamera"} · ${cameras[index]?.selected || ""}`; });
    this._cameraKey = cameraKey;
    mounted.forEach((node) => this._bind(node));
    this._updateClock(); this._renderAlert();
    if (mounted.some((node) => node.classList.contains("camera-panel"))) this._mountLiveCameras();
  }

  _alarmLabel(value) { return ({ disarmed: "fra", armed_home: "hjemme", armed_away: "ude", armed_night: "nat", triggered: "ALARM" })[value] || value || "ukendt"; }
  _updateClock() {
    if (!this.shadowRoot) return;
    const now = new Date();
    const time = this.shadowRoot.querySelector("[data-clock-time]"); const date = this.shadowRoot.querySelector("[data-clock-date]");
    if (time) time.textContent = now.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
    if (date) date.textContent = now.toLocaleDateString("da-DK", { weekday: "long", day: "2-digit", month: "long" });
  }

  _renderAlert() {
    const slot = this.shadowRoot?.querySelector("[data-alert-slot]"); if (!slot) return;
    const alerts = this._activeAlerts();
    if (!alerts.length) { slot.innerHTML = `<div class="alert-clear"><ha-icon icon="mdi:check-circle"></ha-icon><span>Ingen aktive alarmer eller vigtige beskeder</span></div>`; return; }
    const alert = alerts[this._alertIndex % alerts.length];
    slot.innerHTML = `<button class="alert-card" ${alert.action ? `data-nav="${alert.action}"` : `data-more="${alert.entity}"`} ${alert.toggle ? `data-hold-toggle="${alert.toggle}"` : ""}><span class="alert-count">${alerts.length}</span><ha-icon icon="${alert.icon}"></ha-icon><div><strong>${this._esc(alert.title)}</strong><span>${this._esc(alert.detail)}</span></div><small>${(this._alertIndex % alerts.length) + 1}/${alerts.length}</small><ha-icon icon="mdi:chevron-right"></ha-icon></button>`;
    this._bind(slot);
  }

  _bind(root = this.shadowRoot) {
    root.querySelector("[data-menu]")?.addEventListener("click", (event) => { if (!event.currentTarget._held) this.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true })); });
    root.querySelectorAll("[data-price-tab]").forEach((el) => el.addEventListener("click", () => { this._priceTab = el.dataset.priceTab; const panel = el.closest(".prices") || this.shadowRoot; panel.querySelectorAll("[data-price-tab]").forEach((x) => x.classList.toggle("active", x === el)); const chart = panel.querySelector("[data-chart]"); if (chart) chart.innerHTML = this._priceChart(); this._bind(chart); }));
    root.querySelectorAll("[data-hold-button]").forEach((el) => this._bindHold(el));
    root.querySelectorAll("[data-hold-toggle]").forEach((el) => this._bindHoldToggle(el));
    root.querySelectorAll("[data-more]:not([data-hold-button])").forEach((el) => this._bindHoldMore(el));
    root.querySelectorAll("[data-forecast-step]").forEach((el) => el.addEventListener("click", (event) => { this._stepForecast(Number(el.dataset.forecastStep)); event.stopPropagation(); }));
    root.querySelectorAll("[data-nav]").forEach((el) => el.addEventListener("click", (event) => { if (!el._held) this._navigate(el.dataset.nav); event.stopPropagation(); }));
    root.querySelectorAll("[data-more]").forEach((el) => el.addEventListener("contextmenu", (event) => { event.preventDefault(); this._moreInfo(el.dataset.more); }));
  }

  _bindHold(el) {
    const stop = () => { if (el._holdTimer) window.clearTimeout(el._holdTimer); el._holdTimer = null; };
    el.addEventListener("pointerdown", () => { el._held = false; el._holdTimer = window.setTimeout(() => { el._held = true; this._hass.callService("button", "press", { entity_id: el.dataset.holdButton }); window.setTimeout(() => { el._held = false; }, 500); }, 700); });
    ["pointerup", "pointerleave", "pointercancel"].forEach((name) => el.addEventListener(name, stop));
  }

  _bindHoldMore(el) {
    const stop = () => { if (el._moreTimer) window.clearTimeout(el._moreTimer); el._moreTimer = null; };
    el.addEventListener("pointerdown", () => { el._held = false; el._moreTimer = window.setTimeout(() => { el._held = true; this._moreInfo(el.dataset.more); window.setTimeout(() => { el._held = false; }, 500); }, 700); });
    ["pointerup", "pointerleave", "pointercancel"].forEach((name) => el.addEventListener(name, stop));
  }

  _bindHoldToggle(el) {
    const stop = () => { if (el._toggleTimer) window.clearTimeout(el._toggleTimer); el._toggleTimer = null; };
    el.addEventListener("pointerdown", () => { el._held = false; el._toggleTimer = window.setTimeout(() => { el._held = true; this._hass.callService("input_boolean", "toggle", { entity_id: el.dataset.holdToggle }); window.setTimeout(() => { el._held = false; }, 500); }, 700); });
    ["pointerup", "pointerleave", "pointercancel"].forEach((name) => el.addEventListener(name, stop));
  }

  _navigate(path) { if (!path) return; history.pushState(null, "", path); window.dispatchEvent(new Event("location-changed")); }
  _moreInfo(entity) { if (!entity) return; this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: entity } })); }

  _styles() { return `
    :host{display:block;--home-surface:var(--dashboard-card-bg,var(--surface));--home-accent:var(--dashboard-accent,var(--primary-color));--home-info:var(--dashboard-icon-info,var(--state-info-icon, var(--info-color)));--home-success:var(--dashboard-icon-positive,var(--state-success-icon, var(--success-color)));--home-warning:var(--dashboard-icon-warn,var(--state-warning-icon, var(--warning-color)));--home-danger:var(--dashboard-icon-negative-strong,var(--state-error-icon, var(--error-color)));--home-pool:var(--dashboard-chart-cool-soft,var(--state-info-icon, var(--info-color)));--home-pet:var(--purple-color,var(--dashboard-accent, var(--primary-color)));--home-camera-live:var(--presence-home,var(--state-success-icon, var(--success-color)));color:var(--primary-text-color);font-family:var(--primary-font-family,var(--paper-font-body1_-_font-family))}*{box-sizing:border-box}button{font:inherit;color:inherit}.dashboard{display:grid;gap:12px;width:100%;max-width:1540px;margin:0 auto;padding:4px 4px 94px}.card{position:relative;isolation:isolate;overflow:hidden;border:0;border-left:calc(var(--dashboard-left-accent-width,1) * var(--dashboard-card-accent-width,4px)) solid var(--accent,var(--dashboard-tab-selected-border));border-radius:18px;background:var(--home-surface);box-shadow:var(--dashboard-card-shadow,var(--ha-card-box-shadow))}
    .hero{min-height:88px;display:grid;grid-template-columns:auto minmax(150px,1fr) auto auto;align-items:center;gap:14px;padding:12px 18px;--accent:var(--mode)}.hero>*:not(.weather-fx):not(.ambient-icon){position:relative;z-index:2}.menu,.icon-button{display:grid;place-items:center;width:38px;height:38px;border:1px solid color-mix(in srgb,var(--divider-color) 72%,transparent);border-radius:12px;background:color-mix(in srgb,var(--card-background-color) 72%,transparent);cursor:pointer}.menu ha-icon{--mdc-icon-size:22px}.eyebrow{display:flex;align-items:center;gap:8px;color:var(--accent);font-size:14px;font-weight:850;letter-spacing:.02em}.eyebrow i{width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 10px var(--accent);animation:pulse 2.4s ease-in-out infinite}.mode{display:flex;align-items:center;gap:6px;margin-top:4px;color:var(--secondary-text-color);font-size:9px}.mode ha-icon{--mdc-icon-size:14px;color:var(--accent)}.clock{text-align:right}.clock strong{display:block;font-size:26px;line-height:1;letter-spacing:-.05em}.clock span{display:block;margin-top:3px;color:var(--secondary-text-color);font-size:8px;text-transform:capitalize}.weather{display:flex;align-items:center;gap:7px;min-width:105px;padding:7px 8px;border:0;border-radius:12px;background:color-mix(in srgb,var(--home-surface) 48%,transparent);cursor:pointer;text-align:left}.weather>ha-icon{--mdc-icon-size:24px;color:var(--home-info);animation:weatherIcon 4s ease-in-out infinite}.weather strong,.weather span{display:block}.weather strong{font-size:16px}.weather span{margin-top:1px;color:var(--secondary-text-color);font-size:8px}.ambient-icon,.card-bg{position:absolute;right:10px;bottom:-12px;z-index:-1;opacity:.065;pointer-events:none;animation:float 5.5s ease-in-out infinite}.ambient-icon{--mdc-icon-size:94px;color:var(--accent)}.card-bg{--mdc-icon-size:72px;color:var(--accent)}
    .weather-fx{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none;opacity:.58}.weather-fx .drop{position:absolute;left:var(--x);top:-16px;width:1px;height:12px;border-radius:99px;background:var(--home-info);opacity:.45;animation:rainFall 1.2s linear infinite;animation-delay:var(--d)}.weather-fx .flake{position:absolute;left:var(--x);top:-8px;width:4px;height:4px;border-radius:50%;background:var(--primary-text-color);opacity:.45;animation:snowFall 3.6s linear infinite;animation-delay:var(--d)}.weather-fx .cloud{position:absolute;width:92px;height:25px;border-radius:99px;background:color-mix(in srgb,var(--home-info) 12%,transparent);filter:blur(7px);animation:cloudDrift 9s ease-in-out infinite}.weather-fx .cloud.one{right:18%;top:8px}.weather-fx .cloud.two{right:2%;bottom:5px;animation-delay:-4s}.weather-fx .sun-orb{position:absolute;right:7%;top:-24px;width:76px;height:76px;border-radius:50%;background:color-mix(in srgb,var(--home-warning) 17%,transparent);box-shadow:0 0 30px color-mix(in srgb,var(--home-warning) 24%,transparent);animation:sunBreathe 4s ease-in-out infinite}.weather-fx .star{position:absolute;width:3px;height:3px;border-radius:50%;background:var(--primary-text-color);animation:starBlink 2s ease-in-out infinite}.weather-fx .star.one{right:22%;top:18%}.weather-fx .star.two{right:12%;top:50%;animation-delay:-.7s}.weather-fx .star.three{right:34%;top:70%;animation-delay:-1.3s}.weather-fx.storm:after{content:"";position:absolute;inset:0;background:color-mix(in srgb,var(--primary-text-color) 18%,transparent);opacity:0;animation:lightningFlash 6s steps(1) infinite}
    .alert-slot{min-height:0}.alert-slot.clear{display:none}.alert-card{width:100%;min-height:58px;display:grid;grid-template-columns:auto auto 1fr auto auto;align-items:center;gap:10px;padding:9px 14px;border:1px solid color-mix(in srgb,var(--home-danger) 35%,transparent);border-left:calc(var(--dashboard-left-accent-width,1) * var(--dashboard-card-accent-width,4px)) solid var(--home-danger);border-radius:18px;background:var(--home-surface);box-shadow:var(--dashboard-card-shadow,var(--ha-card-box-shadow));cursor:pointer;text-align:left}.alert-card>ha-icon{color:var(--home-danger);--mdc-icon-size:23px}.alert-card>ha-icon:last-child{color:var(--secondary-text-color);--mdc-icon-size:18px}.alert-card strong,.alert-card span{display:block}.alert-card strong{font-size:12px}.alert-card div span,.alert-card small{margin-top:2px;color:var(--secondary-text-color);font-size:9px}.alert-count{display:grid!important;place-items:center;width:24px;height:24px;border-radius:8px;background:var(--dashboard-status-off-bg,var(--home-danger));color:var(--white);font-weight:800;font-size:10px}
    .overview,.camera-panel,.family{padding:12px;--accent:var(--dashboard-tab-selected-border)}.panel-line{position:relative;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:20px;margin:0 3px 9px}.panel-line>span{display:flex;align-items:center;gap:7px;color:var(--dashboard-tab-selected-border);font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.panel-line>span>i{width:7px;height:7px;border-radius:50%;background:var(--home-camera-live);box-shadow:0 0 9px var(--home-camera-live);animation:pulse 2s ease-in-out infinite}.panel-line>b,.panel-line>button{border:0;background:none;color:var(--secondary-text-color);font-size:9px;font-weight:650}.panel-line>button{display:flex;align-items:center;gap:3px;cursor:pointer}.panel-line>button ha-icon{--mdc-icon-size:14px}.panel-divider{height:1px;margin:10px 2px;background:color-mix(in srgb,var(--divider-color) 70%,transparent)}
    .metric-grid,.system-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.metric,.system,.person{position:relative;isolation:isolate;overflow:hidden;border:1px solid color-mix(in srgb,var(--divider-color) 66%,transparent);border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--accent);border-radius:13px;background:color-mix(in srgb,var(--home-surface) 88%,var(--accent));text-align:left;cursor:pointer;transition:transform .18s ease,border-color .18s ease}.metric:hover,.person:hover,.system:hover{transform:translateY(-2px)}.metric{min-height:102px;display:grid;grid-template-columns:auto 1fr;align-items:start;gap:10px;padding:11px;--accent:var(--home-info)}.accent-energy{--accent:var(--energy-power-low,var(--home-info))}.accent-car,.accent-charging{--accent:var(--energy-ev-charging,var(--home-success))}.accent-price{--accent:var(--price-high,var(--home-warning))}.accent-warning{--accent:var(--home-danger)}.accent-pool{--accent:var(--home-pool)}.metric-icon,.system-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:11px;background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent)}.metric-icon ha-icon,.system-icon ha-icon{--mdc-icon-size:20px}.metric-copy>span{display:block;color:var(--secondary-text-color);font-size:8px;font-weight:800;letter-spacing:.07em;text-transform:uppercase}.metric-copy>strong{display:block;margin-top:4px;font-size:21px;line-height:1;letter-spacing:-.04em}.metric-copy>small{display:block;min-height:11px;margin-top:6px;color:var(--secondary-text-color);font-size:8px}.meter{display:flex;gap:3px;margin-top:8px}.meter i{width:12px;height:4px;border-radius:99px;background:var(--energy-segment-off,color-mix(in srgb,var(--dashboard-icon-muted, var(--disabled-text-color)) 26%,transparent))}.meter i.on{background:var(--accent);box-shadow:0 0 6px color-mix(in srgb,var(--accent) 38%,transparent);animation:meter 2.2s ease-in-out infinite;animation-delay:var(--delay)}.accent-energy .meter i.on{animation:powerFlow 1.8s ease-in-out infinite}.accent-charging .meter i.on{animation:chargeSweep 1.45s ease-in-out infinite;animation-delay:var(--delay)}.accent-price .card-bg{animation:pricePulse 3s ease-in-out infinite}.accent-pool .card-bg{animation:poolWave 3.6s ease-in-out infinite}
    .system{min-height:94px;padding:10px;--accent:var(--home-info)}.accent-pet{--accent:var(--home-pet)}.accent-safe{--accent:var(--home-success)}.accent-heat{--accent:var(--state-heat-icon, var(--error-color, var(--home-danger)))}.accent-settings{--accent:var(--home-info)}.system-top{display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;gap:2px 9px;align-items:center}.system-icon{grid-row:1/3}.system-top>span{color:var(--secondary-text-color);font-size:8px;font-weight:800;letter-spacing:.07em;text-transform:uppercase}.system-top>strong{font-size:16px;letter-spacing:-.02em}.system-bottom{display:flex;flex-wrap:wrap;gap:4px;margin-top:9px}.system-bottom span{padding:4px 6px;border:1px solid var(--dashboard-button-neutral-border,color-mix(in srgb,var(--divider-color) 70%,transparent));border-radius:7px;background:var(--dashboard-button-neutral-bg,var(--home-surface));color:var(--secondary-text-color);font-size:7px}.accent-heat .card-bg{animation:heatPulse 2.8s ease-in-out infinite}
    .camera-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.camera{position:relative;isolation:isolate;overflow:hidden;aspect-ratio:16/9;min-width:0;border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--camera-state,var(--divider-color));border-radius:11px;background:var(--primary-background-color);transition:border-color .2s ease,box-shadow .2s ease}.camera.detect-person{--camera-state:var(--home-danger)}.camera.detect-animal{--camera-state:var(--home-warning)}.camera.detect-vehicle{--camera-state:var(--home-info)}.camera.detect-event{--camera-state:var(--home-pet)}.camera.detect-motion{--camera-state:var(--dashboard-accent, var(--primary-color, var(--home-info)));box-shadow:0 0 12px color-mix(in srgb,var(--camera-state) 22%,transparent)}.camera-live,.camera-live>*{position:absolute;inset:0;display:block;width:100%;height:100%;overflow:hidden}.camera-live>*{--ha-card-border-width:0;--ha-card-border-radius:0;--ha-card-box-shadow:none}
    .people-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.person{min-height:88px;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:9px;padding:10px;--accent:var(--presence-away,var(--dashboard-icon-muted, var(--disabled-text-color)))}.person.home{--accent:var(--presence-home,var(--home-success))}.person.home .card-bg{animation:personDrift 4.4s ease-in-out infinite}.avatar{position:relative;width:40px;height:40px}.avatar img,.avatar>ha-icon{width:40px;height:40px;border-radius:13px;object-fit:cover}.avatar>ha-icon{padding:8px;background:color-mix(in srgb,var(--accent) 13%,transparent);color:var(--accent)}.avatar i{position:absolute;right:-2px;bottom:-2px;width:10px;height:10px;border:2px solid var(--home-surface);border-radius:50%;background:var(--accent)}.person-copy{min-width:0}.person-copy span,.person-copy strong,.person-copy small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.person-copy span{font-size:12px;font-weight:800}.person-copy span em{display:inline-grid;place-items:center;width:15px;height:15px;margin-left:4px;border-radius:5px;background:var(--dashboard-status-warn-bg,var(--home-warning));color:var(--black);font-size:8px;font-style:normal;animation:pulse 1.5s ease-in-out infinite}.person-copy strong{margin-top:3px;font-size:9px}.person-copy small{margin-top:3px;color:var(--secondary-text-color);font-size:8px}.battery{align-self:start;display:flex;align-items:center;gap:2px;color:var(--secondary-text-color);font-size:8px}.battery ha-icon{--mdc-icon-size:12px}.battery.low{color:var(--battery-critical,var(--home-danger))}
    .prices{min-height:238px;padding:13px 15px;--accent:var(--warning-color)}.price-title{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:12px}.price-title>span{color:var(--dashboard-tab-selected-border);font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.price-tabs{display:flex;gap:3px;padding:3px;border:1px solid color-mix(in srgb,var(--divider-color) 72%,transparent);border-radius:10px;background:color-mix(in srgb,var(--card-background-color) 70%,transparent)}.price-tabs button{padding:6px 9px;border:0;border-radius:7px;background:none;color:var(--secondary-text-color);font-size:9px;font-weight:700;cursor:pointer}.price-tabs button.active{background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--accent)}.chart-head{position:relative;z-index:1;display:flex;align-items:flex-end;justify-content:space-between;gap:10px;margin-top:10px}.chart-day{display:flex;align-items:center;gap:8px}.chart-head span,.chart-head strong{display:block}.chart-head span{color:var(--secondary-text-color);font-size:9px;text-transform:capitalize}.chart-head strong{margin-top:2px;font-size:10px}.chart-stats{display:flex;gap:10px}.chart-stats span{font-size:8px}.chart-stats b{display:inline;color:var(--primary-text-color);font-size:9px}.day-controls{display:flex;gap:3px}.day-controls button{display:grid;place-items:center;width:25px;height:25px;border:1px solid color-mix(in srgb,var(--divider-color) 70%,transparent);border-radius:8px;background:color-mix(in srgb,var(--home-surface) 82%,var(--accent));cursor:pointer}.day-controls ha-icon{--mdc-icon-size:15px}.bars{position:relative;z-index:1;display:flex;align-items:flex-end;gap:3px;height:113px;margin-top:7px;padding:6px 0 18px;border-bottom:1px solid color-mix(in srgb,var(--divider-color) 70%,transparent)}.bar{position:relative;flex:1;height:100%;min-width:2px;padding:0;border:0;background:none;cursor:pointer}.bar i{position:absolute;left:0;right:0;bottom:0;height:var(--h);min-height:3px;border-radius:4px 4px 1px 1px;background:var(--bar);opacity:.75;animation:priceBars 2.8s ease-in-out infinite;animation-delay:calc(var(--h) * -20ms)}.bar:hover i,.bar.current i{opacity:1;filter:drop-shadow(0 0 5px var(--bar))}.bar.current:after{content:"";position:absolute;left:50%;bottom:-4px;width:5px;height:5px;transform:translateX(-50%);border-radius:50%;background:var(--bar);box-shadow:0 0 8px var(--bar)}.bar small{position:absolute;left:50%;bottom:-16px;transform:translateX(-50%);color:var(--secondary-text-color);font-size:6px}.bar.low{--bar:var(--success-color)}.bar.medium{--bar:var(--warning-color)}.bar.high{--bar:var(--state-heat-icon,var(--error-color))}.bar.critical{--bar:var(--error-color)}.chart-empty{height:150px;display:grid;place-items:center;align-content:center;gap:8px;color:var(--secondary-text-color);font-size:10px}.chart-empty ha-icon{--mdc-icon-size:30px}.price-more{position:relative;z-index:1;display:flex;align-items:center;gap:4px;margin:8px 0 0 auto;border:0;background:none;color:var(--secondary-text-color);font-size:9px;cursor:pointer}.price-more ha-icon{--mdc-icon-size:14px}
    @keyframes pulse{50%{opacity:.45;transform:scale(.78)}}@keyframes float{50%{transform:translate(-5px,-6px) rotate(-3deg);opacity:.1}}@keyframes meter{50%{opacity:.58}}@keyframes powerFlow{50%{transform:scaleX(.72);opacity:.55}}@keyframes chargeSweep{50%{opacity:.4;transform:translateY(-1px)}}@keyframes pricePulse{50%{transform:translate(-4px,-5px) scale(1.08);opacity:.11}}@keyframes poolWave{50%{transform:translate(-7px,-3px) rotate(-4deg);opacity:.12}}@keyframes heatPulse{50%{transform:scale(1.08);opacity:.12}}@keyframes personDrift{50%{transform:translate(-4px,-4px);opacity:.1}}@keyframes priceBars{50%{opacity:.9}}@keyframes weatherIcon{50%{transform:translateY(-2px) rotate(-3deg)}}@keyframes rainFall{to{transform:translate(-8px,112px)}}@keyframes snowFall{50%{transform:translate(5px,55px)}to{transform:translate(-4px,112px) rotate(180deg)}}@keyframes cloudDrift{50%{transform:translateX(-24px) scale(1.08)}}@keyframes sunBreathe{50%{transform:scale(1.12);opacity:.7}}@keyframes starBlink{50%{opacity:.2;transform:scale(.6)}}@keyframes lightningFlash{4%,7%{opacity:.65}5%,8%,100%{opacity:0}}
    @media(max-width:700px){.dashboard{gap:8px;padding:2px 2px 86px}.hero{min-height:78px;grid-template-columns:auto minmax(74px,1fr) auto auto;gap:6px;padding:9px}.menu{width:34px;height:34px}.eyebrow{font-size:11px}.mode{font-size:7px}.clock strong{font-size:20px}.clock span{font-size:6px;max-width:62px}.weather{min-width:70px;padding:5px;gap:4px}.weather>ha-icon{--mdc-icon-size:18px}.weather strong{font-size:13px}.weather span{font-size:6px}.ambient-icon{--mdc-icon-size:70px}.overview,.camera-panel,.family{padding:7px}.panel-line{min-height:16px;margin-bottom:6px}.panel-divider{margin:7px 1px}.metric-grid,.system-grid,.people-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:4px}.metric{display:block;min-height:82px;padding:6px}.metric-icon{position:absolute;right:5px;top:5px;width:23px;height:23px;border-radius:8px}.metric-icon ha-icon{--mdc-icon-size:14px}.metric-copy>span{max-width:55px;font-size:6px}.metric-copy>strong{margin-top:12px;font-size:15px}.metric-copy>small{min-height:17px;margin-top:4px;font-size:6px;line-height:1.25}.meter{gap:2px;margin-top:5px}.meter i{width:8px;height:3px}.system{min-height:88px;padding:6px}.system-top{display:block}.system-icon{width:23px;height:23px;border-radius:8px}.system-icon ha-icon{--mdc-icon-size:14px}.system-top>span{display:block;margin-top:4px;font-size:6px}.system-top>strong{display:block;margin-top:2px;font-size:12px}.system-bottom{display:grid;gap:2px;margin-top:5px}.system-bottom span{overflow:hidden;padding:2px 3px;font-size:5px;line-height:1.2;text-overflow:ellipsis;white-space:nowrap}.camera-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:4px}.people-grid{gap:4px}.person{display:block;min-height:90px;padding:6px}.avatar,.avatar img,.avatar>ha-icon{width:29px;height:29px;border-radius:9px}.avatar i{width:8px;height:8px}.person-copy{margin-top:4px}.person-copy span{font-size:9px}.person-copy strong{margin-top:2px;font-size:6px}.person-copy small{margin-top:2px;font-size:6px}.battery{position:absolute;right:4px;top:4px;font-size:6px}.battery ha-icon{--mdc-icon-size:9px}.prices{min-height:205px;padding:9px}.chart-head{align-items:flex-start}.chart-stats{gap:5px}.bars{gap:2px;height:88px}.alert-card{grid-template-columns:auto auto 1fr auto;padding:7px}.alert-card>small,.alert-card>ha-icon:last-child{display:none}}
    @media(max-width:410px){.hero{grid-template-columns:auto minmax(64px,1fr) auto auto}.clock strong{font-size:17px}.clock span{max-width:48px;font-size:5px}.weather{min-width:68px}.price-title{align-items:center}.price-tabs{flex:1}.price-tabs button{flex:1;padding:5px 4px}.chart-stats span{font-size:7px}.panel-line>span{font-size:8px}}
    @media(prefers-reduced-motion:reduce){*,*:before,*:after{animation-duration:.001ms!important;animation-iteration-count:1!important}}
  `; }
}

class SmartHomeOverviewCardEditor extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); }
  setConfig(config) { this._config = config || {}; this._render(); }
  set hass(hass) { this._hass = hass; }

  _render() {
    const c = this._config;
    const jsonFields = [
      ["entities", "Entiteter (JSON-objekt)", DEFAULT_ENTITIES],
      ["paths", "Navigationsstier (JSON-objekt)", DEFAULT_PATHS],
      ["price_thresholds", "Prisgrænser i kr/kWh (JSON-objekt: medium/high/critical)", DEFAULT_PRICE_THRESHOLDS],
      ["alerts", "Alarmer/beskeder (JSON-array)", DEFAULT_ALERTS],
      ["people", "Familie/personer (JSON-array)", DEFAULT_PEOPLE],
      ["camera_groups", "Kameragrupper (JSON-array)", DEFAULT_CAMERA_GROUPS],
      ["night_locks", "Låse der tjekkes i nattens sikkerhedsvindue (JSON-array af entity-id'er)", DEFAULT_NIGHT_LOCKS],
      ["night_extra_contacts", "Ekstra kontakter for nattevagt (JSON-array)", []],
      ["heating_fault_entities", "Varme-fejlsensorer (JSON-array af entity-id'er)", []],
    ];
    this.shadowRoot.innerHTML = `<style>
      :host{display:block;padding:16px}
      label{display:block;margin:12px 0 5px;font-weight:700;font-size:13px}
      p.hint{margin:0;color:var(--secondary-text-color);font-size:11px}
      input,textarea{box-sizing:border-box;width:100%;padding:9px 10px;border:1px solid var(--divider-color);border-radius:9px;background:var(--card-background-color);color:var(--primary-text-color);font-family:inherit}
      textarea{min-height:130px;font-family:ui-monospace,SFMono-Regular,monospace;font-size:11px}
      .row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    </style>
      <p class="hint">Rediger kortets opsætning. Titel/navne er almindelig tekst, resten er JSON. Se README for feltbeskrivelser.</p>
      <div class="row">
        <div><label>Titel</label><input data-field="title" value="${(c.title ?? "").replace(/"/g, "&quot;")}"></div>
        <div><label>Valuta</label><input data-field="currency" value="${(c.currency ?? "").replace(/"/g, "&quot;")}"></div>
        <div><label>Kæledyrs navn</label><input data-field="pet_name" value="${(c.pet_name ?? "").replace(/"/g, "&quot;")}"></div>
        <div><label>Bilens navn</label><input data-field="car_name" value="${(c.car_name ?? "").replace(/"/g, "&quot;")}"></div>
      </div>
      ${jsonFields.map(([key, label]) => `<label>${label}</label><textarea data-json="${key}">${JSON.stringify(c[key] ?? "", null, 2)}</textarea>`).join("")}
    `;
    this.shadowRoot.querySelectorAll("input[data-field]").forEach((input) => {
      input.onchange = () => this._emit({ ...this._config, [input.dataset.field]: input.value });
    });
    this.shadowRoot.querySelectorAll("textarea[data-json]").forEach((textarea) => {
      textarea.onchange = () => {
        try {
          this._emit({ ...this._config, [textarea.dataset.json]: JSON.parse(textarea.value) });
          textarea.setCustomValidity("");
        } catch {
          textarea.setCustomValidity("Ugyldig JSON");
          textarea.reportValidity();
        }
      };
    });
  }

  _emit(config) {
    this._config = config;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }
}

if (!customElements.get("smart-home-overview-card")) customElements.define("smart-home-overview-card", SmartHomeOverviewCard);
if (!customElements.get("smart-home-overview-card-editor")) customElements.define("smart-home-overview-card-editor", SmartHomeOverviewCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({ type: "smart-home-overview-card", name: "Smart Home Overview", description: `Konfigurerbar helhedsoversigt: hero med ur/vejr, alarm-ticker, energi/EV/pris/pool-nøgletal, sikkerhed & varme, live kameragrid, familie-tilstedeværelse og elpris-graf ${VERSION}`, preview: true });
console.info(`SMART HOME OVERVIEW CARD ${VERSION}`);
