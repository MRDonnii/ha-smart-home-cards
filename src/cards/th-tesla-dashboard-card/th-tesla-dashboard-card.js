/*
 * TH Tesla Dashboard Card - `custom:th-tesla-dashboard-card`
 *
 * One Lovelace card with a complete Tesla dashboard: vehicle hero with battery ring, the native
 * Home Assistant map, charging (Monta/Zaptec), smart charge plan, TPMS, EV Ledger history and
 * economy, and a light daily usage chart.
 *
 * Maintenance notes
 * - The shadow DOM is built once per config and afterwards only updated in place.
 * - `_model()` turns hass states into display strings and flags without touching the DOM, so it is
 *   unit tested in Node (tests/th-tesla-dashboard-card.test.mjs).
 * - No polling. Rendering follows `hass`; chart statistics are fetched on demand and cached.
 * - Every entity and control is optional. Missing or unavailable data renders as "—", and a control
 *   without a working entity is removed instead of being shown as a dead button.
 * - Published source stays neutral: real entity IDs belong in the dashboard config only.
 */

const TTD_VERSION = "1.0.0";
const TTD_TAG = "th-tesla-dashboard-card";
const TTD_DASH = "—";
const TTD_EMPTY_STATES = new Set(["", "unknown", "unavailable", "none", "null", "undefined", "nan"]);
const TTD_CONTROL_KEYS = ["start_charge", "stop_charge", "charger_mode", "target_soc", "deadline", "apply_plan"];
const TTD_MAP_RANGES = [0, 1, 6, 12, 24];
const TTD_CHART_RANGES = {
  today: { label: "I dag", period: "hour", days: 1 },
  "7d": { label: "7 dage", period: "day", days: 7 },
  "30d": { label: "30 dage", period: "day", days: 30 },
};
const TTD_STATS_TTL = 15 * 60 * 1000;
const TTD_ARM_MS = 4000;
const TTD_MONTA_PLUGGED = new Set(["busy", "busy-blocked", "busy-charging", "busy-non-charging", "busy-non-released", "busy-scheduled"]);
// Display labels for units delivered by Home Assistant. The unit itself is never invented here.
const TTD_UNIT_LABELS = { DKK: "kr.", kr: "kr.", "DKK/km": "kr/km", "DKK/kWh": "kr/kWh", "km/h": "km/t", h: "t" };
const TTD_PRESSURE_TO_BAR = { bar: 1, psi: 0.0689476, kpa: 0.01, pa: 0.00001, hpa: 0.001, mbar: 0.001 };

const TTD_TEXT = {
  status: {
    charging: "Lader", complete: "Opladning færdig", waiting: "Venter på opladning", ready: "Klar til opladning",
    plugged: "Tilsluttet", online: "Online", asleep: "Sover", offline: "Offline", unknown: "Ukendt", unplugged: "Ikke tilsluttet",
  },
  monta: {
    available: "Ledig", busy: "Optaget", "busy-blocked": "Blokeret", "busy-charging": "Aktiv opladning",
    "busy-non-charging": "Tilsluttet, lader ikke", "busy-non-released": "Ikke frigivet", "busy-reserved": "Reserveret",
    "busy-scheduled": "Planlagt opladning", error: "Fejl", disconnected: "Offline", passive: "Passiv", other: "Anden status",
  },
  mode: { disconnected: "Frakoblet", connected_requesting: "Bil venter", connected_charging: "Lader", connected_finished: "Færdig", unknown: "Ukendt" },
  zone: { home: "Hjemme", not_home: "Ude" },
  tpms: { ok: "Normalt tryk", low: "Lavt tryk", critical_low: "Kritisk lavt", high: "Højt tryk", critical_high: "Kritisk højt", unknown: "Ingen måling" },
  unavailable: "Ikke tilgængelig",
  hours: "t", minutes: "min", days: "d", today: "i dag", yesterday: "i går", tomorrow: "i morgen", at: "kl.",
};

const TTD_STATUS_TONES = {
  charging: "ok", complete: "ok", waiting: "info", ready: "info", plugged: "info",
  online: "ok", asleep: "muted", offline: "muted", unknown: "muted", unplugged: "muted",
};
const TTD_STATUS_ICONS = {
  charging: "mdi:lightning-bolt", complete: "mdi:check-circle-outline", waiting: "mdi:clock-outline", ready: "mdi:power-plug",
  plugged: "mdi:power-plug", online: "mdi:check-circle-outline", asleep: "mdi:sleep", offline: "mdi:wifi-off",
  unknown: "mdi:help-circle-outline", unplugged: "mdi:power-plug-off-outline",
};
const TTD_MONTA_TONES = {
  available: "ok", "busy-charging": "ok", busy: "info", "busy-scheduled": "info", "busy-non-charging": "info", "busy-reserved": "info",
  "busy-non-released": "warn", "busy-blocked": "crit", error: "crit",
};

// Neutral fallback artwork (original, no third-party assets): used when no vehicle image is configured or it fails to load.
const TTD_FALLBACK_CAR = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 210"><defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b7482"/><stop offset=".5" stop-color="#363c47"/><stop offset="1" stop-color="#1c2027"/></linearGradient><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a3442"/><stop offset="1" stop-color="#0c1016"/></linearGradient><radialGradient id="s"><stop offset="0" stop-color="#000" stop-opacity=".5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs><ellipse cx="243" cy="186" rx="228" ry="16" fill="url(#s)"/><path fill="url(#b)" d="M30 140c-2-15 7-26 27-30l74-11c33-25 69-39 118-41 47-2 90 11 126 37l52 10c21 4 33 17 33 36l-2 14c0 6-4 10-10 10h-49a39 39 0 0 0-78 0H168a39 39 0 0 0-78 0H43c-8 0-12-6-13-13z"/><path fill="url(#g)" d="M144 99c29-21 62-31 104-33 43-2 80 9 109 29z"/><path d="M36 128h38" stroke="#c9d3e0" stroke-width="3" stroke-linecap="round"/><circle cx="129" cy="170" r="31" fill="#121418"/><circle cx="129" cy="170" r="21" fill="#3b424d"/><circle cx="364" cy="170" r="31" fill="#121418"/><circle cx="364" cy="170" r="21" fill="#3b424d"/></svg>')}`;

// Top view used by the TPMS panel. Wheel elements are tinted by tyre status.
const TTD_TOP_CAR = `<svg class="topcar" viewBox="0 0 120 250" aria-hidden="true"><defs><linearGradient id="ttd-body" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#262c36"/><stop offset=".5" stop-color="#4a5260"/><stop offset="1" stop-color="#262c36"/></linearGradient><linearGradient id="ttd-glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2735"/><stop offset="1" stop-color="#0b1018"/></linearGradient></defs><rect class="wheel" data-r="wFL" x="3" y="44" width="10" height="34" rx="4"/><rect class="wheel" data-r="wFR" x="107" y="44" width="10" height="34" rx="4"/><rect class="wheel" data-r="wRL" x="3" y="170" width="10" height="34" rx="4"/><rect class="wheel" data-r="wRR" x="107" y="170" width="10" height="34" rx="4"/><ellipse cx="9" cy="86" rx="6" ry="3.5" fill="#3a414d"/><ellipse cx="111" cy="86" rx="6" ry="3.5" fill="#3a414d"/><path fill="url(#ttd-body)" stroke="rgba(255,255,255,.14)" d="M60 8c20 0 37 5 43 18 4 10 5 26 5 44v116c0 20-2 36-8 46-6 8-20 12-40 12s-34-4-40-12c-6-10-8-26-8-46V70c0-18 1-34 5-44C23 13 40 8 60 8z"/><path fill="url(#ttd-glass)" d="M24 80c10-12 62-12 72 0l3 70c-13 6-65 6-78 0z"/><path fill="url(#ttd-glass)" d="M22 158c14 4 62 4 76 0l-2 38c-12 8-60 8-72 0z"/><path d="M24 25c6-6 13-9 21-10M96 25c-6-6-13-9-21-10" stroke="#cfd8e3" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M24 233c7 4 14 6 22 6M96 233c-7 4-14 6-22 6" stroke="#dc2626" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>`;

/* ------------------------------------------------------------------ helpers */

function ttdEsc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

function ttdHasValue(stateObj) {
  return !!stateObj && !TTD_EMPTY_STATES.has(String(stateObj.state ?? "").trim().toLowerCase());
}

function ttdToNumber(value) {
  if (value == null || typeof value === "boolean") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (!text) return null;
  const number = Number(/^-?\d+,\d+$/.test(text) ? text.replace(",", ".") : text);
  return Number.isFinite(number) ? number : null;
}

function ttdToDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const date = new Date(value < 1e12 ? value * 1000 : value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const text = String(value).trim();
  if (TTD_EMPTY_STATES.has(text.toLowerCase()) || !/^\d{4}-\d{2}-\d{2}/.test(text)) return null;
  const date = new Date(text.includes("T") ? text : text.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
}

function ttdUnit(unit) {
  if (unit == null) return "";
  const text = String(unit).trim();
  return TTD_UNIT_LABELS[text] ?? text;
}

function ttdJoin(value, unit) {
  return unit && value !== TTD_DASH ? `${value} ${unit}` : value;
}

function ttdClamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function ttdIsClock(text) {
  return typeof text === "string" && /^\d{1,2}[:.]\d{2}(?::\d{2})?$/.test(text.trim());
}

function ttdClock(text) {
  const [hours, minutes] = String(text).trim().split(/[:.]/);
  return `${hours.padStart(2, "0")}:${minutes}`;
}

function ttdHumanize(value) {
  const text = String(value ?? "").replace(/[_-]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : TTD_DASH;
}

function ttdNumberLocale(locale, language) {
  switch (locale?.number_format) {
    case "comma_decimal": return ["en-US", "en"];
    case "decimal_comma": return ["de", "es", "it"];
    case "space_comma": return ["fr", "sv", "cs"];
    case "system": return undefined;
    default: return language;
  }
}

/** Locale aware formatting that follows the user's Home Assistant profile (language, number and time format, time zone). */
class TtdFormat {
  constructor(hass) {
    const locale = hass?.locale || {};
    this.lang = locale.language || hass?.language || "da";
    this.numberLocale = ttdNumberLocale(locale, this.lang);
    this.grouping = locale.number_format !== "none";
    this.serverTz = hass?.config?.time_zone || undefined;
    this.timeZone = locale.time_zone === "server" ? this.serverTz : undefined;
    this.hour12 = locale.time_format === "12" ? true : locale.time_format === "24" ? false : undefined;
    this._cache = new Map();
  }

  _intl(key, create) {
    let formatter = this._cache.get(key);
    if (!formatter) {
      formatter = create();
      this._cache.set(key, formatter);
    }
    return formatter;
  }

  number(value, digits = 0) {
    if (value == null || !Number.isFinite(value)) return TTD_DASH;
    const factor = 10 ** digits;
    const rounded = Math.round(value * factor) / factor;
    return this._intl(`n${digits}`, () => new Intl.NumberFormat(this.numberLocale, {
      minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: this.grouping,
    })).format(rounded === 0 ? 0 : rounded);
  }

  time(value) {
    const date = ttdToDate(value);
    if (!date) return TTD_DASH;
    const parts = this._intl("time", () => new Intl.DateTimeFormat(this.lang, {
      hour: "2-digit", minute: "2-digit", hour12: this.hour12, timeZone: this.timeZone,
    })).formatToParts(date);
    const part = (type) => parts.find((item) => item.type === type)?.value;
    // Always "08:17": Danish CLDR would give "08.17", while the template sensors and the design use a colon.
    const period = part("dayPeriod");
    return `${part("hour")}:${part("minute")}${period ? ` ${period}` : ""}`;
  }

  date(value, withYear) {
    const date = ttdToDate(value);
    if (!date) return TTD_DASH;
    const year = withYear ?? this.dayKey(date).slice(0, 4) !== this.dayKey(new Date()).slice(0, 4);
    return this._intl(year ? "dateY" : "date", () => new Intl.DateTimeFormat(this.lang, {
      day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: this.timeZone,
    })).format(date);
  }

  weekday(value, style = "short", timeZone = this.timeZone) {
    return this._intl(`wd${style}${timeZone || ""}`, () => new Intl.DateTimeFormat(this.lang, { weekday: style, timeZone })).format(value);
  }

  dayKey(value, timeZone = this.timeZone) {
    return this._intl(`key${timeZone || ""}`, () => new Intl.DateTimeFormat("en-CA", {
      year: "numeric", month: "2-digit", day: "2-digit", timeZone,
    })).format(value);
  }

  hour(value, timeZone = this.timeZone) {
    return Number(this._intl(`hour${timeZone || ""}`, () => new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit", hourCycle: "h23", timeZone,
    })).format(value));
  }

  dayDiff(value) {
    const toUtc = (date) => Date.parse(`${this.dayKey(date)}T00:00:00Z`);
    return Math.round((toUtc(value) - toUtc(new Date())) / 86400000);
  }

  relativeDay(value) {
    const date = ttdToDate(value);
    if (!date) return TTD_DASH;
    const diff = this.dayDiff(date);
    if (diff === 0) return TTD_TEXT.today;
    if (diff === -1) return TTD_TEXT.yesterday;
    if (diff === 1) return TTD_TEXT.tomorrow;
    return this.date(date);
  }

  dayTime(value) {
    const date = ttdToDate(value);
    return date ? `${this.relativeDay(date)} ${TTD_TEXT.at} ${this.time(date)}` : TTD_DASH;
  }

  duration(minutes) {
    if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return TTD_DASH;
    const total = Math.round(minutes);
    const days = Math.floor(total / 1440);
    const hours = Math.floor((total % 1440) / 60);
    const mins = total % 60;
    if (days) return `${days} ${TTD_TEXT.days} ${hours} ${TTD_TEXT.hours}`;
    if (hours) return mins ? `${hours} ${TTD_TEXT.hours} ${mins} ${TTD_TEXT.minutes}` : `${hours} ${TTD_TEXT.hours}`;
    return `${mins} ${TTD_TEXT.minutes}`;
  }

  ago(value) {
    const date = ttdToDate(value);
    if (!date) return TTD_DASH;
    const seconds = (date.getTime() - Date.now()) / 1000;
    const abs = Math.abs(seconds);
    const rtf = this._intl("rtf", () => new Intl.RelativeTimeFormat(this.lang, { numeric: "auto", style: "short" }));
    if (abs < 45) return rtf.format(0, "second");
    if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
    if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
    return this.dayTime(date);
  }
}

/* --------------------------------------------------------------- config */

function ttdNormalizeConfig(raw) {
  const config = JSON.parse(JSON.stringify(raw || {}));
  const vehicle = config.vehicle && typeof config.vehicle === "object" ? config.vehicle : {};
  const entities = {};
  for (const [key, value] of Object.entries(config.entities || {})) {
    if (typeof value === "string" && value.includes(".")) entities[key] = value.trim();
  }
  const controls = {};
  for (const key of TTD_CONTROL_KEYS) {
    const value = config.controls?.[key];
    const entity = typeof value === "string" ? value : value?.entity;
    if (typeof entity === "string" && entity.includes(".")) controls[key] = { ...(typeof value === "object" ? value : {}), entity: entity.trim() };
  }
  const map = { hours_to_show: 6, theme_mode: "auto", default_zoom: 14, ...(config.map || {}) };
  map.ranges = Array.isArray(map.ranges) && map.ranges.length ? map.ranges.map(Number).filter((hours) => Number.isFinite(hours) && hours >= 0) : TTD_MAP_RANGES;
  map.hours_to_show = Number.isFinite(Number(map.hours_to_show)) ? Number(map.hours_to_show) : 6;
  const chart = { range: "today", ...(config.chart || {}) };
  if (!TTD_CHART_RANGES[chart.range]) chart.range = "today";
  chart.distance_entity = chart.distance_entity || entities.odometer || null;
  chart.energy_entity = chart.energy_entity || null;
  // Pressure thresholds are in bar and compared after converting the sensor's own unit.
  const tpms = { unit: null, digits: null, warning_low: 2.6, critical_low: 2.2, warning_high: 3.5, critical_high: 3.8, ...(config.tpms || {}) };
  const battery = { low: 20, critical: 10, ...(config.battery || {}) };
  const precision = config.precision && typeof config.precision === "object" ? config.precision : {};
  return {
    name: String(config.name || "Tesla"),
    model: String(vehicle.model || config.model || "Tesla"),
    image: vehicle.image || config.vehicle_image || null,
    location: config.location_entity || entities.location || null,
    entities, controls, map, chart, tpms, battery, precision,
  };
}

/** One user-facing vehicle status derived from Tesla, Monta and Zaptec data. Pure function (unit tested). */
function ttdDeriveStatus(snapshot) {
  const s = snapshot || {};
  const mode = s.mode || "";
  const monta = s.monta || "";
  const chargingState = s.chargingState || "";
  const plugged = s.plug === true || s.cable === true || mode.startsWith("connected_") || TTD_MONTA_PLUGGED.has(monta);
  const charging = s.charging === true || chargingState === "Charging" || mode === "connected_charging" || monta === "busy-charging"
    || (s.power != null && s.power >= 0.3);
  const reached = s.soc != null && s.target != null && s.soc >= s.target - 0.5;
  let key;
  if (charging) key = "charging";
  else if (plugged) {
    if (chargingState === "Complete" || (mode === "connected_finished" && (reached || s.target == null))) key = "complete";
    else if (monta === "busy-scheduled" || s.scheduled === true || chargingState === "Stopped" || chargingState === "NoPower" || mode === "connected_finished") key = "waiting";
    else if (mode === "connected_requesting" || chargingState === "Starting") key = "ready";
    else key = "plugged";
  } else if (s.asleep === true || s.vehicleState === "asleep") key = "asleep";
  else if (s.online === true || s.vehicleState === "online") key = "online";
  else if (s.online === false || s.vehicleState === "offline") key = "offline";
  else key = "unknown";
  return { key, label: TTD_TEXT.status[key], tone: TTD_STATUS_TONES[key], icon: TTD_STATUS_ICONS[key], plugged: plugged || charging, charging };
}

/** Tyre pressure with unit conversion; thresholds are evaluated in bar whatever unit the sensor reports. */
function ttdPressure(stateObj, options, format) {
  const value = ttdHasValue(stateObj) ? ttdToNumber(stateObj.state) : null;
  const unit = String(stateObj?.attributes?.unit_of_measurement ?? "").trim();
  if (value == null) return { text: TTD_DASH, tone: "muted", status: TTD_TEXT.tpms.unknown, bar: null };
  const toBar = TTD_PRESSURE_TO_BAR[unit.toLowerCase()];
  const bar = toBar ? value * toBar : null;
  const wanted = options.unit && TTD_PRESSURE_TO_BAR[String(options.unit).toLowerCase()] ? String(options.unit) : null;
  const displayUnit = wanted && bar != null ? wanted : unit;
  const shown = displayUnit === unit ? value : bar / TTD_PRESSURE_TO_BAR[displayUnit.toLowerCase()];
  const digits = Number.isInteger(options.digits) ? options.digits : displayUnit.toLowerCase() === "bar" ? 1 : 0;
  let tone = "ok";
  let status = TTD_TEXT.tpms.ok;
  if (bar == null) {
    tone = "info";
    status = "";
  } else if (bar <= options.critical_low) {
    tone = "crit"; status = TTD_TEXT.tpms.critical_low;
  } else if (bar >= options.critical_high) {
    tone = "crit"; status = TTD_TEXT.tpms.critical_high;
  } else if (bar <= options.warning_low) {
    tone = "warn"; status = TTD_TEXT.tpms.low;
  } else if (bar >= options.warning_high) {
    tone = "warn"; status = TTD_TEXT.tpms.high;
  }
  return { text: ttdJoin(format.number(shown, digits), displayUnit), tone, status, bar };
}

/* -------------------------------------------------------------- markup */

function ttdIcon(icon, cls = "") {
  return `<ha-icon icon="${icon}"${cls ? ` class="${cls}"` : ""}></ha-icon>`;
}

function ttdTemplate(cfg) {
  const e = ttdEsc;
  const stat = (key, icon, ref, label) => `<button class="stat" data-more="${key}">${ttdIcon(icon)}<span class="stat-t"><b data-r="${ref}">${TTD_DASH}</b><small>${label}</small></span></button>`;
  const kpi = (key, ref, label) => `<button class="kpi" data-more="${key}"><b data-r="${ref}">${TTD_DASH}</b><small>${label}</small></button>`;
  const cell = (key, icon, tone, ref, label, extra = "") => `<button class="cell" data-more="${key}">${ttdIcon(icon, `ic ${tone}`)}<span><small>${label}</small><b data-r="${ref}">${TTD_DASH}</b>${extra}</span></button>`;
  const row = (key, label, ref, extra = "") => `<button class="row" data-more="${key}"><span class="row-l">${label}</span><span class="row-v"${extra ? ` data-r="${ref}Box"` : ""}>${extra}<b data-r="${ref}">${TTD_DASH}</b></span></button>`;
  const tire = (key, ref, label) => `<button class="tire" data-more="${key}" data-r="${ref}"><b data-r="${ref}V">${TTD_DASH}</b><small>${label}</small><em data-r="${ref}S"></em></button>`;
  const item = (key, icon, ref, label) => `<div class="lc"><span class="lc-i">${ttdIcon(icon)}</span><span><b data-r="${ref}">${TTD_DASH}</b><small>${label}</small></span></div>`;
  const ranges = cfg.map.ranges.map((hours) => `<button type="button" data-range="${hours}" aria-pressed="false">${hours === 0 ? "Nu" : `${hours}t`}</button>`).join("");
  const chartOptions = Object.entries(TTD_CHART_RANGES).map(([key, range]) => `<option value="${key}">${range.label}</option>`).join("");
  return `<div class="wrap" data-r="wrap"><div class="dash">
<section class="panel hero" data-r="hero" aria-label="Bilstatus">
  <div class="hero-info">
    <div class="hero-title"><h2 class="name">${e(cfg.name)}</h2><button class="pill" data-more="online" data-r="pill"><i class="dot"></i><span data-r="statusText">${TTD_DASH}</span></button></div>
    <p class="model">${e(cfg.model)}</p>
    <button class="updated" data-more="last_update"><span>Sidst opdateret</span><span data-r="updatedLong">${TTD_DASH}</span></button>
  </div>
  <div class="hero-car"><img data-r="carImg" alt="${e(cfg.model)}" decoding="async" width="900" height="434"></div>
  <button class="ring-wrap" data-more="battery" data-r="ring">
    <svg class="ring" viewBox="0 0 120 120" aria-hidden="true"><circle class="ring-track" cx="60" cy="60" r="52"/><circle class="ring-fill" data-r="ringFill" cx="60" cy="60" r="52" pathLength="100" stroke-dasharray="0 100"/></svg>
    <span class="ring-t"><span class="soc"><b data-r="soc">${TTD_DASH}</b><small data-r="socUnit">%</small>${ttdIcon("mdi:lightning-bolt", "bolt")}</span><span class="range" data-r="range">${TTD_DASH}</span><span class="muted">rækkevidde</span></span>
  </button>
  <div class="hero-stats">${stat("odometer", "mdi:speedometer", "odometer", "Kilometerstand")}${stat("temperature_inside", "mdi:thermometer", "inside", "Indetemperatur")}${stat("temperature_outside", "mdi:thermometer", "outside", "Udetemperatur")}${stat("last_update", "mdi:refresh", "updatedShort", "Sidst opdateret")}</div>
</section>
<section class="panel charge" data-r="charge" aria-label="Opladning">
  <header class="ph">${ttdIcon("mdi:lightning-bolt", "ph-i green")}<div class="ph-t"><h3>Opladning</h3><p data-r="chargeSub">${TTD_DASH}</p></div><span class="badge" data-r="chargeBadge">${ttdIcon("mdi:power-plug", "")}<span data-r="chargeBadgeText">${TTD_DASH}</span></span></header>
  <div class="soc-row"><b data-r="chargeSoc">${TTD_DASH}</b><span data-r="chargeTarget"></span></div>
  <div class="bar" data-r="bar"><i class="bar-fill" data-r="barFill"></i><i class="bar-mark" data-r="barMark"></i></div>
  <div class="box kpis">${kpi("charger_power", "power", "Aktuel effekt")}${kpi("charging_rate", "rate", "Ladehastighed")}${kpi("charging_finish_time", "finish", "Forventet slut")}${kpi("charging_time_remaining", "remaining", "Resttid")}</div>
  <div class="box monta">
    <button class="monta-main" data-more="monta_state"><i class="mdot" data-r="montaDot"></i><span><b>Monta</b><small data-r="montaState">${TTD_DASH}</small></span></button>
    <div class="monta-mode" data-r="modeBox"><small>Ladertilstand</small><button class="mode-v" data-more="charger_mode" data-r="chargerMode">${TTD_DASH}</button><select class="mode-sel" data-r="modeSelect" aria-label="Ladertilstand" hidden></select></div>
    <div class="acts"><button type="button" class="btn go" data-action="start_charge" data-r="startBtn" hidden>Lad nu</button><button type="button" class="btn stop" data-action="stop_charge" data-r="stopBtn" hidden>Stop</button></div>
  </div>
  <button class="foot" data-more="charging_price_estimate" data-r="estimate" hidden></button>
</section>
<section class="panel plan" data-r="plan" aria-label="Smart ladeplan">
  <header class="ph">${ttdIcon("mdi:clock-outline", "ph-i")}<div class="ph-t"><h3>Smart ladeplan</h3><p data-r="planSub">${TTD_DASH}</p></div><span class="badge" data-r="planBadge"><span data-r="planBadgeText">${TTD_DASH}</span></span></header>
  <div class="box plan-top">${cell("best_charge_start", "mdi:clock-start", "blue", "bestStart", "Bedste start")}${cell("best_charge_end", "mdi:check-circle-outline", "green", "bestEnd", "Forventet slut")}${cell("best_charge_price", "mdi:cash", "amber", "bestPrice", "Forventet pris", `<em data-r="bestPriceKwh"></em>`)}</div>
  <div class="box plan-mid">${cell("missing_wall_kwh", "mdi:alarm", "orange", "missing", "Mangler for mål")}${cell("charge_minutes_needed", "mdi:timer-outline", "green", "minutes", "Ladetid (est.)")}</div>
  <button type="button" class="btn go wide" data-action="apply_plan" data-r="applyBtn" hidden>Brug ladeplan</button>
  <div class="plan-ctl" data-r="planCtl" hidden>
    <label class="ctl" data-r="socCtl" hidden>${ttdIcon("mdi:target", "ic green")}<span>Mål SOC</span><b data-r="socCtlVal">${TTD_DASH}</b><input type="range" data-r="socRange" aria-label="Mål SOC"></label>
    <label class="ctl" data-r="dlCtl" hidden>${ttdIcon("mdi:calendar-clock", "ic blue")}<span>Klar senest</span><input type="time" data-r="dlInput" aria-label="Klar senest"></label>
  </div>
</section>
<section class="panel map" data-r="mapPanel" aria-label="Bilens placering">
  <header class="ph">${ttdIcon("mdi:map-marker-radius", "ph-i blue")}<div class="ph-t"><h3>Bilens placering</h3></div><span class="meta" data-r="mapMeta"><i class="dot"></i><span data-r="mapMetaText">${TTD_DASH}</span></span><button class="icon-btn" data-more="location" aria-label="Åbn placering">${ttdIcon("mdi:arrow-expand")}</button></header>
  <div class="map-body"><div class="map-host" data-r="mapHost"></div><p class="map-empty" data-r="mapEmpty" hidden></p><div class="seg" role="group" aria-label="Vis rute for" data-r="mapSeg">${ranges}</div></div>
</section>
<section class="panel tpms" data-r="tpms" aria-label="Dæktryk">
  <header class="ph">${ttdIcon("mdi:tire", "ph-i")}<div class="ph-t"><h3>Dæktryk</h3></div><span class="meta" data-r="tpmsTime"></span></header>
  <div class="tpms-body">${tire("tpms_front_left", "tFL", "Venstre for")}${tire("tpms_front_right", "tFR", "Højre for")}${TTD_TOP_CAR}${tire("tpms_rear_left", "tRL", "Venstre bag")}${tire("tpms_rear_right", "tRR", "Højre bag")}</div>
</section>
<section class="panel list drive" data-r="drive" aria-label="Kørsel og historik">
  <header class="ph">${ttdIcon("mdi:road-variant", "ph-i")}<div class="ph-t"><h3>Kørsel &amp; historik</h3></div><button class="icon-btn" data-more="trips" aria-label="Åbn ture">${ttdIcon("mdi:chevron-right")}</button></header>
  <div class="rows">${row("monthly_performance", "Denne måned", "month")}${row("total_distance", "Total distance", "totalDist")}${row("trips", "Antal ture", "tripCount")}<button class="row" data-more="last_trip"><span class="row-l">Seneste tur</span><span class="row-v stack"><b data-r="lastTrip">${TTD_DASH}</b><small data-r="lastTripMeta"></small></span></button></div>
</section>
<section class="panel list econ" data-r="econ" aria-label="Økonomi">
  <header class="ph">${ttdIcon("mdi:chart-bar", "ph-i")}<div class="ph-t"><h3>Økonomi <span class="light">(EV Ledger)</span></h3></div><button class="icon-btn" data-more="charges" aria-label="Åbn opladninger">${ttdIcon("mdi:chevron-right")}</button></header>
  <div class="rows">${row("cost_per_km", "Pris pr. km", "costKm")}${row("efficiency_score", "Effektivitetsscore", "effScore")}${row("monthly_performance", "Månedlig performance", "monthly", ttdIcon("mdi:arrow-up", "trend"))}${row("charges", "Antal opladninger", "chargeCount")}${row("charges_needing_price", "Opladninger uden pris", "noPrice", ttdIcon("mdi:alert-outline", "trend"))}${row("monta_wallet", "Monta wallet", "wallet")}</div>
</section>
<section class="panel last" data-r="last" aria-label="Seneste opladning">
  <header class="ph">${ttdIcon("mdi:ev-station", "ph-i")}<div class="ph-t"><h3>Seneste opladning</h3></div><button class="icon-btn" data-more="last_charge" data-r="lastMore" aria-label="Åbn seneste opladning">${ttdIcon("mdi:chevron-right")}</button></header>
  <div class="lc-grid">${item("", "mdi:battery-charging-medium", "lcKwh", "Opladet energi")}${item("", "mdi:cash", "lcPrice", "Total pris")}${item("", "mdi:calendar-month-outline", "lcStart", "Starttidspunkt")}${item("", "mdi:clock-outline", "lcDuration", "Varighed")}</div>
  <p class="lc-foot" data-r="lcFoot"></p><p class="lc-foot" data-r="lcMonta"></p>
</section>
<section class="panel daily" data-r="daily" aria-label="Dagligt forbrug">
  <header class="ph">${ttdIcon("mdi:chart-bar", "ph-i")}<div class="ph-t"><h3>Dagligt forbrug</h3><p data-r="dailySub">${TTD_DASH}</p></div><select class="range-sel" data-r="rangeSelect" aria-label="Periode">${chartOptions}</select></header>
  <div class="chart" data-r="chart" tabindex="0" role="img" aria-label="Dagligt forbrug">
    <div class="sm" data-r="smD"><div class="sm-h"><i class="sw sw-d"></i><span>Kørsel</span><em data-r="maxD"></em></div><div class="bars bars-d" data-r="barsD"></div></div>
    <div class="sm" data-r="smE"><div class="sm-h"><i class="sw sw-e"></i><span>Opladning</span><em data-r="maxE"></em></div><div class="bars bars-e" data-r="barsE"></div></div>
    <div class="axis" data-r="axis"></div>
    <div class="tip" data-r="tip" hidden><span class="tip-l" data-r="tipL"></span><span class="tip-r" data-r="tipDRow"><i class="key key-d"></i><b data-r="tipD"></b></span><span class="tip-r" data-r="tipERow"><i class="key key-e"></i><b data-r="tipE"></b></span></div>
    <p class="chart-empty" data-r="chartEmpty" hidden></p>
  </div>
</section>
</div></div>`;
}

const TTD_STYLES = `
:host{display:block}
*{box-sizing:border-box}
.wrap{container:ttd / inline-size;
  --tdc-text:var(--primary-text-color,#eef2f7);--tdc-muted:var(--secondary-text-color,#94a3b8);
  --tdc-panel:var(--ha-card-background,var(--card-background-color,#111827));
  --tdc-line:color-mix(in srgb,var(--tdc-text) 9%,transparent);--tdc-tile:color-mix(in srgb,var(--tdc-text) 3%,transparent);
  --tdc-hover:color-mix(in srgb,var(--tdc-text) 7%,transparent);--tdc-grid:color-mix(in srgb,var(--tdc-text) 16%,transparent);
  --tdc-green:var(--success-color,#22c55e);--tdc-orange:var(--warning-color,#f59e0b);--tdc-red:var(--error-color,#ef4444);
  --tdc-blue:var(--primary-color,#2f81f7);--tdc-amber:#eab308;--tdc-drive:#1baf7a;--tdc-energy:#2a78d6;
  --tdc-radius:16px;--tdc-gap:16px;--tdc-pad:20px;color:var(--tdc-text);line-height:1.3}
.wrap.dark{--tdc-drive:#199e70;--tdc-energy:#3987e5;color-scheme:dark}
[data-tone=ok]{--tone:var(--tdc-green)}[data-tone=warn]{--tone:var(--tdc-orange)}[data-tone=crit]{--tone:var(--tdc-red)}
[data-tone=info]{--tone:var(--tdc-blue)}[data-tone=muted]{--tone:var(--tdc-muted)}
button,select,input{font:inherit;color:inherit}
button{background:none;border:0;padding:0;margin:0;text-align:inherit;cursor:pointer;border-radius:10px}
button[data-dead]{cursor:default}
button:focus-visible,select:focus-visible,input:focus-visible,.chart:focus-visible{outline:2px solid var(--tdc-blue);outline-offset:2px}
[hidden]{display:none!important}
ha-icon{--mdc-icon-size:22px;display:inline-flex;flex:none;color:var(--tdc-muted)}
h2,h3,p{margin:0}
.muted{color:var(--tdc-muted)}
.dash{display:grid;gap:var(--tdc-gap);grid-template-columns:repeat(12,minmax(0,1fr));
  grid-template-areas:"hero hero hero hero hero hero hero map map map map map" "charge charge charge charge charge plan plan plan plan tpms tpms tpms" "drive drive drive econ econ econ last last last daily daily daily"}
.panel{position:relative;min-width:0;container:panel / inline-size;padding:var(--tdc-pad);border-radius:var(--tdc-radius);background:var(--tdc-panel);border:1px solid var(--tdc-line);box-shadow:var(--tdc-shadow,none);overflow:hidden}
.hero{grid-area:hero}.map{grid-area:map}.charge{grid-area:charge}.plan{grid-area:plan}.tpms{grid-area:tpms}.drive{grid-area:drive}.econ{grid-area:econ}.last{grid-area:last}.daily{grid-area:daily}
.ph{display:flex;align-items:center;gap:12px;margin-bottom:16px;min-width:0}
.ph-i{--mdc-icon-size:28px;color:var(--tdc-text)}
.ph-t{flex:1;min-width:0}
.ph h3{font-size:20px;font-weight:600;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ph h3 .light{font-weight:400;color:var(--tdc-muted);font-size:16px}
.ph p{margin-top:4px;font-size:14px;color:var(--tdc-muted);overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2}
.meta{display:inline-flex;align-items:center;gap:7px;font-size:13px;color:var(--tdc-muted);white-space:nowrap;min-width:0}
.meta>span{overflow:hidden;text-overflow:ellipsis}
.dot{width:9px;height:9px;border-radius:50%;background:var(--tone,var(--tdc-muted));flex:none}
.icon-btn{display:inline-grid;place-items:center;width:36px;height:36px;border-radius:10px;border:1px solid var(--tdc-line);flex:none}
.icon-btn:hover{background:var(--tdc-hover)}
.green{color:var(--tdc-green)}.blue{color:var(--tdc-blue)}.amber{color:var(--tdc-amber)}.orange{color:var(--tdc-orange)}
.box{border:1px solid var(--tdc-line);border-radius:12px;background:var(--tdc-tile)}
.badge{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 14px;border-radius:999px;font-size:14px;font-weight:600;white-space:nowrap;flex:none;
  background:color-mix(in srgb,var(--tone,var(--tdc-muted)) 16%,transparent);border:1px solid color-mix(in srgb,var(--tone,var(--tdc-muted)) 45%,transparent)}
.badge ha-icon{--mdc-icon-size:18px;color:var(--tone)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:36px;padding:0 14px;border-radius:10px;font-size:14px;font-weight:600;white-space:nowrap}
.btn.go{background:var(--tdc-blue);color:var(--text-primary-color,#fff)}
.btn.stop{background:color-mix(in srgb,var(--tdc-red) 16%,transparent);color:var(--tdc-red);border:1px solid color-mix(in srgb,var(--tdc-red) 40%,transparent)}
.btn[data-armed]{outline:2px solid var(--tdc-orange);outline-offset:2px}
.btn.wide{width:100%;min-height:42px;margin-top:14px;font-size:15px}
.stat:hover,.kpi:hover,.cell:hover,.row:hover,.tire:hover,.monta-main:hover,.mode-v:hover,.foot:hover,.updated:hover,.pill:hover{background:var(--tdc-hover)}
button[data-dead]:hover{background:none}
/* hero */
.hero{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto minmax(150px,1fr) auto;column-gap:16px;padding:24px;
  background:radial-gradient(90% 70% at 42% 52%,color-mix(in srgb,var(--tdc-text) 6%,transparent),transparent 70%),var(--tdc-panel)}
.hero-info{grid-area:1/1/2/2;position:relative;z-index:1;min-width:0}
.hero-title{display:flex;align-items:center;gap:14px;min-width:0}
.name{font-size:36px;font-weight:700;letter-spacing:-.02em;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.pill{display:inline-flex;align-items:center;gap:8px;padding:4px 8px;margin-left:-8px;font-size:16px;font-weight:600;color:var(--tone);white-space:nowrap}
.model{margin-top:6px;font-size:19px;color:var(--tdc-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.updated{display:grid;margin:18px 0 0 -6px;padding:4px 6px;font-size:14px;color:var(--tdc-muted)}
.updated span+span{color:var(--tdc-text)}
.hero-car{grid-area:1/1/3/2;display:flex;align-items:flex-end;justify-content:center;min-width:0;min-height:0;padding:36px 0 0 16%;pointer-events:none}
.hero-car img{display:block;width:100%;height:100%;max-height:270px;object-fit:contain;object-position:center bottom;filter:drop-shadow(0 16px 16px rgba(0,0,0,.35))}
.ring-wrap{grid-area:1/2/3/3;align-self:center;position:relative;width:var(--ring,196px);height:var(--ring,196px);border-radius:50%}
.ring{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)}
.ring circle{fill:none;stroke-width:9}
.ring-track{stroke:color-mix(in srgb,var(--tdc-text) 12%,transparent)}
.ring-fill{stroke:var(--tone,var(--tdc-green));stroke-linecap:round;transition:stroke-dasharray .6s ease,stroke .3s ease}
.ring-fill[data-zero]{stroke:none}
.hero[data-charging] .ring-fill{filter:drop-shadow(0 0 5px color-mix(in srgb,var(--tone) 60%,transparent))}
.ring-t{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.soc{display:flex;align-items:baseline;font-weight:700;letter-spacing:-.02em}
.soc b{font-size:var(--soc-size,46px);line-height:1}
.soc small{font-size:calc(var(--soc-size,46px) * .5);margin-left:3px}
.soc .bolt{display:none;--mdc-icon-size:22px;color:var(--tone);align-self:center;margin-left:2px}
.hero[data-charging] .soc .bolt{display:inline-flex}
.range{margin-top:6px;font-size:20px;font-weight:600}
.ring-t .muted{font-size:13px}
.hero-stats{grid-area:3/1/4/3;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:14px}
.stat{display:flex;align-items:center;gap:12px;min-width:0;padding:13px 14px;border:1px solid var(--tdc-line);border-radius:12px;background:var(--tdc-tile)}
.stat ha-icon{--mdc-icon-size:28px}
.stat-t{display:grid;min-width:0}
.stat b,.kpi b,.cell b,.tire b,.lc b{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.stat b{font-size:17px}
.stat small,.kpi small,.cell small,.tire small,.lc small{font-size:14px;color:var(--tdc-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* charge */
.charge[data-active]{border-color:color-mix(in srgb,var(--tdc-green) 38%,var(--tdc-line))}
.charge[data-active]::before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(70% 55% at 0 0,color-mix(in srgb,var(--tdc-green) 9%,transparent),transparent 70%)}
.soc-row{display:flex;justify-content:space-between;gap:12px;font-size:19px;font-weight:600}
.soc-row span{font-weight:500}
.bar{position:relative;height:14px;margin:10px 0 18px;border-radius:999px;background:color-mix(in srgb,var(--tdc-text) 12%,transparent)}
.bar-fill{position:absolute;left:0;top:0;bottom:0;width:calc(var(--soc,0) * 1%);border-radius:inherit;background:var(--tone,var(--tdc-green));transition:width .6s ease}
.bar-mark{position:absolute;top:-5px;bottom:-5px;width:3px;left:calc(var(--target,0) * 1% - 1.5px);border-radius:2px;background:var(--tdc-text)}
.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr))}
.kpi{display:grid;gap:6px;min-width:0;padding:14px 16px;border-radius:0}
.kpi+.kpi{border-left:1px solid var(--tdc-line)}
.kpi b{font-size:18px}
.monta{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;margin-top:14px}
.monta-main{display:flex;align-items:center;gap:12px;min-width:0;padding:12px 16px;border-radius:12px 0 0 12px}
.monta-main>span{display:grid;min-width:0}
.monta-main b{font-size:16px;font-weight:600}
.monta-main small{display:flex;align-items:center;gap:6px;font-size:14px;color:var(--tdc-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mdot{width:22px;height:22px;border-radius:50%;flex:none;display:grid;place-items:center;background:color-mix(in srgb,var(--tone,var(--tdc-muted)) 22%,transparent)}
.mdot::after{content:"";width:10px;height:10px;border-radius:50%;background:var(--tone,var(--tdc-muted))}
.monta-mode{display:grid;gap:2px;padding:8px 16px;border-left:1px solid var(--tdc-line);min-width:0}
.monta-mode small{font-size:13px;color:var(--tdc-muted)}
.mode-v{font-size:15px;font-weight:600;padding:2px 6px;margin:0 -6px;white-space:nowrap}
.mode-sel{min-height:30px;border-radius:8px;border:1px solid var(--tdc-line);background:var(--tdc-panel);padding:0 8px;font-size:14px}
.acts{display:flex;gap:8px;padding:8px 12px}
.acts:not(:has(.btn:not([hidden]))){display:none}
.foot{display:block;width:100%;margin-top:12px;padding:6px 8px;font-size:13px;color:var(--tdc-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* plan */
.plan-top{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}
.plan-mid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:12px}
.cell{display:flex;align-items:flex-start;gap:8px;min-width:0;padding:14px 12px;border-radius:0}
.cell+.cell{border-left:1px solid var(--tdc-line)}
.cell ha-icon{--mdc-icon-size:20px}
.cell small{font-size:13px}
.cell>span{display:grid;gap:4px;min-width:0}
.cell b{font-size:19px}
.cell em{font-style:normal;font-size:12px;color:var(--tdc-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.plan-ctl{display:grid;gap:10px;margin-top:14px}
.ctl{display:grid;grid-template-columns:auto auto auto minmax(0,1fr);align-items:center;gap:10px;font-size:14px;color:var(--tdc-muted)}
.ctl b{color:var(--tdc-text);font-weight:600;min-width:44px}
.ctl input[type=time]{justify-self:start;grid-column:3/5;min-height:32px;padding:0 8px;border-radius:8px;border:1px solid var(--tdc-line);background:var(--tdc-tile);color:var(--tdc-text)}
input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:6px;border-radius:999px;margin:0;
  background:linear-gradient(to right,var(--tdc-blue) var(--p,0%),color-mix(in srgb,var(--tdc-text) 14%,transparent) var(--p,0%))}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;background:#fff;border:4px solid var(--tdc-blue);cursor:pointer}
input[type=range]::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:#fff;border:4px solid var(--tdc-blue);cursor:pointer}
/* map */
.map{display:flex;flex-direction:column;padding:0;min-height:340px}
.map .ph{padding:16px 16px 12px 20px;margin:0}
.map .ph-t{flex:0 0 auto}
.map .meta{flex:1 1 auto;justify-content:flex-end}
.map-body{position:relative;flex:1;min-height:240px;background:color-mix(in srgb,var(--tdc-text) 4%,transparent)}
.map-host{position:absolute;inset:0}
.map-host>*{display:block;height:100%;--ha-card-border-radius:0;--ha-card-border-width:0;--ha-card-box-shadow:none}
.map-empty{position:absolute;inset:0;display:grid;place-items:center;padding:24px;text-align:center;font-size:14px;color:var(--tdc-muted)}
.seg{position:absolute;left:12px;bottom:12px;z-index:3;display:flex;gap:2px;padding:4px;border-radius:12px;border:1px solid var(--tdc-line);background:color-mix(in srgb,var(--tdc-panel) 92%,transparent)}
.seg button{min-width:48px;height:36px;padding:0 10px;border-radius:9px;font-size:15px;text-align:center}
.seg button:hover{background:var(--tdc-hover)}
.seg button[aria-pressed=true]{background:var(--tdc-blue);color:var(--text-primary-color,#fff)}
/* tpms */
.tpms{display:flex;flex-direction:column}
.tpms-body{flex:1;display:grid;grid-template-columns:minmax(0,1fr) minmax(56px,84px) minmax(0,1fr);grid-template-rows:1fr 1fr;gap:12px 10px;align-items:start}
.tpms-body .tire:nth-child(n+4){align-self:end}
.topcar{grid-column:2;grid-row:1/3;align-self:center;width:100%;max-height:260px}
.topcar .wheel{fill:var(--tone,var(--tdc-muted))}
.tire{display:grid;gap:4px;min-width:0;padding:10px;border:1px solid var(--tdc-line);border-radius:12px;background:var(--tdc-tile)}
.tire b{font-size:19px;color:var(--tone,var(--tdc-text))}
.tire em{font-style:normal;font-size:12px;font-weight:600;color:var(--tone)}
.tire em:empty{display:none}
/* lists */
.rows{display:grid}
.row{display:flex;align-items:baseline;justify-content:space-between;gap:12px;min-width:0;padding:8px 6px;margin:0 -6px;font-size:16px}
.row-l{color:color-mix(in srgb,var(--tdc-text) 80%,transparent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.row-v{display:inline-flex;align-items:center;gap:6px;min-width:0;justify-content:flex-end}
.row-v b{font-size:17px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row-v.stack{display:grid;justify-items:end;gap:2px}
.row-v small{font-size:13px;color:var(--tdc-muted);white-space:nowrap}
.row-v[data-tone] b,.row-v[data-tone] .trend{color:var(--tone)}
.trend{--mdc-icon-size:18px}
.row-v:not([data-tone]) .trend{display:none}
/* last charge */
.lc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 14px}
.lc{display:flex;align-items:flex-start;gap:12px;min-width:0}
.lc>span:last-child{display:grid;gap:4px;min-width:0}
.lc-i ha-icon{--mdc-icon-size:26px}
.lc b{font-size:18px}
.lc-foot{margin-top:14px;font-size:13px;color:var(--tdc-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lc-foot+.lc-foot{margin-top:4px}
.lc-foot:empty{display:none}
/* daily chart */
.range-sel{flex:none;min-height:32px;padding:0 8px;border-radius:8px;border:1px solid var(--tdc-line);background:var(--tdc-panel);font-size:14px}
.chart{position:relative;display:grid;gap:10px;border-radius:8px}
.chart[data-loading] .sm{opacity:.55}
.sm{display:grid;gap:6px;transition:opacity .2s}
.sm-h{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--tdc-muted)}
.sm-h em{margin-left:auto;font-style:normal;font-variant-numeric:tabular-nums;white-space:nowrap}
.sw{width:10px;height:10px;border-radius:3px;flex:none}
.sw-d,.key-d{background:var(--tdc-drive)}.sw-e,.key-e{background:var(--tdc-energy)}
.bars{display:grid;grid-template-columns:repeat(var(--n,24),minmax(0,1fr));grid-auto-rows:100%;column-gap:2px;align-items:end;height:48px;border-bottom:1px solid var(--tdc-grid)}
.bars i{display:block;justify-self:center;width:100%;max-width:24px;height:var(--h,0%);border-radius:4px 4px 0 0;background:var(--c);transition:height .3s ease}
.bars-d{--c:var(--tdc-drive)}.bars-e{--c:var(--tdc-energy)}
.bars i.nz{min-height:2px}
.bars i.hi{filter:brightness(1.3)}
.axis{display:grid;grid-template-columns:repeat(var(--n,24),minmax(0,1fr));font-size:12px;color:var(--tdc-muted);font-variant-numeric:tabular-nums;min-height:15px}
.axis span{white-space:nowrap;justify-self:center}
.tip{position:absolute;top:-6px;z-index:4;display:grid;gap:3px;min-width:120px;padding:8px 10px;border-radius:10px;border:1px solid var(--tdc-line);background:var(--tdc-panel);box-shadow:0 6px 18px rgba(0,0,0,.28);pointer-events:none;font-size:13px}
.tip-l{color:var(--tdc-muted)}
.tip-r{display:flex;align-items:center;gap:8px}
.key{width:12px;height:3px;border-radius:2px;flex:none}
.chart-empty{font-size:14px;color:var(--tdc-muted)}
/* tablet */
@container ttd (max-width:1199px){
  .dash{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-areas:"hero hero" "charge plan" "map tpms" "drive econ" "last daily"}
}
/* narrow tablet: stack the paired charge/plan panels to keep their inner grids readable */
@container ttd (max-width:899px){
  .dash{grid-template-areas:"hero hero" "charge charge" "plan plan" "map tpms" "drive econ" "last daily"}
}
/* mobile */
@container ttd (max-width:699px){
  .wrap{--tdc-gap:12px;--tdc-pad:16px}
  .dash{grid-template-columns:minmax(0,1fr);grid-template-areas:"hero" "charge" "plan" "map" "tpms" "drive" "econ" "last" "daily"}
  .hero{padding:18px;grid-template-rows:auto auto auto}
  .hero-title{flex-wrap:wrap;row-gap:2px}
  .name{font-size:28px;white-space:normal;overflow-wrap:anywhere}
  .model{font-size:16px}
  .updated{margin-top:10px}
  .hero-car{grid-area:2/1/3/3;padding:8px 0 0;height:190px}
  .ring-wrap{grid-area:1/2/2/3;align-self:start;--ring:136px;--soc-size:30px}
  .range{font-size:15px;margin-top:2px}
  .ring-t .muted{font-size:11px}
  .hero-stats{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  .monta{grid-template-columns:minmax(0,1fr) auto}
  .acts{grid-column:1/-1;border-top:1px solid var(--tdc-line);justify-content:flex-end}
  .map{min-height:300px}
  .badge{height:28px;padding:0 10px;font-size:13px}
}
@container ttd (max-width:380px){
  .ph h3{font-size:18px}
  .hero-car{height:150px}
  .ring-wrap{--ring:108px;--soc-size:26px}
  .stat{padding:10px}
  .stat ha-icon{display:none}
  .monta{grid-template-columns:minmax(0,1fr)}
  .monta-mode{border-left:0;border-top:1px solid var(--tdc-line)}
}
/* panel width driven: keep inner grids readable whatever the dashboard layout */
@container panel (max-width:560px){
  .kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
  .kpi:nth-child(3){border-left:0}
  .kpi:nth-child(n+3){border-top:1px solid var(--tdc-line)}
}
@container panel (max-width:440px){
  .plan-top .cell{flex-direction:column;gap:6px;padding:12px 10px}
  .plan-top .cell small{white-space:normal}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

/* ----------------------------------------------------------------- card */

class ThTeslaDashboardCard extends HTMLElement {
  static deriveStatus(snapshot) {
    return ttdDeriveStatus(snapshot);
  }

  static getStubConfig() {
    return {
      name: "Tesla",
      vehicle: { model: "Tesla Model 3 RWD" },
      location_entity: "device_tracker.tesla_location_tracker",
      entities: {
        battery: "sensor.tesla_battery", range: "sensor.tesla_range", odometer: "sensor.tesla_odometer",
        temperature_inside: "sensor.tesla_temperature_inside", temperature_outside: "sensor.tesla_temperature_outside",
        online: "binary_sensor.tesla_online", asleep: "binary_sensor.tesla_asleep",
        charger: "binary_sensor.tesla_charger", charging: "binary_sensor.tesla_charging",
      },
    };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._cfg = null;
    this._hass = null;
    this._built = false;
    this._r = {};
    this._seen = new Map();
    this._stats = {};
    this._loading = {};
    this._hi = -1;
    // All interaction is delegated from the shadow root, so rebuilding the DOM never duplicates listeners.
    this.shadowRoot.addEventListener("click", (event) => this._onClick(event));
    this.shadowRoot.addEventListener("change", (event) => this._onChange(event));
    this.shadowRoot.addEventListener("input", (event) => this._onInput(event));
    this.shadowRoot.addEventListener("keydown", (event) => this._onKey(event));
  }

  setConfig(config) {
    if (!config || typeof config !== "object") throw new Error("th-tesla-dashboard-card: ugyldig konfiguration");
    this._cfg = ttdNormalizeConfig(config);
    this._mapHours = this._cfg.map.hours_to_show;
    this._chartRange = this._cfg.chart.range;
    this._built = false;
    this._stats = {};
    this._map = null;
    this._mapError = false;
    if (this._hass) this._queue(true);
  }

  set hass(hass) {
    this._hass = hass;
    this._queue(false);
  }

  get hass() {
    return this._hass;
  }

  getCardSize() {
    return 16;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto", min_columns: 12 };
  }

  connectedCallback() {
    this._connected = true;
    if (!this._tick) this._tick = setInterval(() => this._onTick(), 60000);
    this._observe();
    if (this._hass) this._queue(true);
  }

  disconnectedCallback() {
    this._connected = false;
    clearInterval(this._tick);
    this._tick = null;
    this._io?.disconnect();
    this._io = null;
    this._disarm(false);
  }

  /* ------------------------------------------------------ update loop */

  _queue(force) {
    if (force) this._force = true;
    if (this._pending) return;
    this._pending = true;
    requestAnimationFrame(() => {
      this._pending = false;
      this._flush();
    });
  }

  _flush() {
    if (!this._cfg || !this._hass) return;
    if (!this._built) this._build();
    const changed = this._force || this._statesChanged();
    this._force = false;
    if (!changed) return;
    if (this._map) this._map.hass = this._hass;
    this._apply(this._model());
    this._renderChart(false);
  }

  _statesChanged() {
    const states = this._hass.states || {};
    let changed = false;
    for (const id of this._watch) {
      const stateObj = states[id];
      if (this._seen.get(id) !== stateObj) {
        this._seen.set(id, stateObj);
        changed = true;
      }
    }
    const locale = this._hass.locale || {};
    const env = [this._hass.themes?.darkMode, locale.language, locale.number_format, locale.time_format, locale.time_zone].join("|");
    if (env !== this._env) {
      this._env = env;
      this._fmt = null;
      changed = true;
    }
    return changed;
  }

  _onTick() {
    // Relative times ("5 min. siden", "i dag") and the chart's current hour age without any state change.
    if (!this._hass || !this._built) return;
    this._queue(true);
    if (this._visible) this._loadStats(this._chartRange, false);
  }

  _observe() {
    if (this._io || typeof IntersectionObserver === "undefined") {
      if (typeof IntersectionObserver === "undefined") this._onVisible();
      return;
    }
    this._io = new IntersectionObserver((entries) => {
      this._visible = entries.some((entry) => entry.isIntersecting);
      if (this._visible) this._onVisible();
    });
    this._io.observe(this);
  }

  _onVisible() {
    this._visible = true;
    if (!this._built) return;
    this._ensureMap();
    this._loadStats(this._chartRange, false);
  }

  _format() {
    if (!this._fmt) this._fmt = new TtdFormat(this._hass);
    return this._fmt;
  }

  /* ------------------------------------------------------ state access */

  _id(key) {
    return this._cfg.entities[key];
  }

  _so(key) {
    const id = this._id(key);
    return id ? this._hass?.states?.[id] : undefined;
  }

  _num(key) {
    const stateObj = this._so(key);
    return ttdHasValue(stateObj) ? ttdToNumber(stateObj.state) : null;
  }

  _text(key) {
    const stateObj = this._so(key);
    return ttdHasValue(stateObj) ? String(stateObj.state).trim() : null;
  }

  _bool(key) {
    const stateObj = this._so(key);
    if (!ttdHasValue(stateObj)) return null;
    if (stateObj.state === "on") return true;
    return stateObj.state === "off" ? false : null;
  }

  _attr(key, name) {
    return this._so(key)?.attributes?.[name];
  }

  _unit(key, fallback = "") {
    return ttdUnit(this._so(key)?.attributes?.unit_of_measurement ?? fallback);
  }

  _digits(key, fallback) {
    const precision = this._cfg.precision[key];
    return Number.isInteger(precision) ? precision : fallback;
  }

  _value(key, digits, unitFallback = "") {
    const value = this._num(key);
    return value == null ? TTD_DASH : ttdJoin(this._format().number(value, this._digits(key, digits)), this._unit(key, unitFallback));
  }

  _control(key) {
    const id = this._cfg.controls[key]?.entity;
    const stateObj = id ? this._hass?.states?.[id] : undefined;
    return stateObj && stateObj.state !== "unavailable" ? { id, stateObj, domain: id.split(".")[0] } : null;
  }

  _targetEntity() {
    return this._cfg.controls.target_soc?.entity || this._id("target_soc") || null;
  }

  _deadlineEntity() {
    return this._cfg.controls.deadline?.entity || this._id("deadline") || null;
  }

  _targetSoc() {
    const stateObj = this._hass?.states?.[this._targetEntity()];
    return ttdHasValue(stateObj) ? ttdToNumber(stateObj.state) : null;
  }

  _snapshot() {
    const vehicleState = this._attr("online", "state");
    return {
      online: this._bool("online"),
      vehicleState: ttdHasValue(this._so("online")) && vehicleState ? String(vehicleState).toLowerCase() : null,
      asleep: this._bool("asleep"),
      plug: this._bool("charger"),
      chargingState: ttdHasValue(this._so("charger")) ? this._attr("charger", "charging_state") ?? null : null,
      charging: this._bool("charging"),
      mode: this._text("charger_mode"),
      monta: this._text("monta_state"),
      cable: this._bool("monta_cable_connected"),
      scheduled: this._bool("scheduled_charging"),
      power: this._num("charger_power"),
      soc: this._num("battery"),
      target: this._targetSoc(),
    };
  }

  /* ------------------------------------------------------ view model */

  _model() {
    const f = this._format();
    const cfg = this._cfg;
    const status = ttdDeriveStatus(this._snapshot());
    const soc = this._num("battery");
    const target = this._targetSoc();
    const socTone = soc == null ? "muted" : soc <= cfg.battery.critical ? "crit" : soc <= cfg.battery.low ? "warn" : "ok";
    const lastUpdate = ttdToDate(this._text("last_update"));
    const hero = {
      status: status.label, tone: status.tone, charging: status.charging,
      updatedLong: lastUpdate ? f.dayTime(lastUpdate) : TTD_DASH,
      updatedShort: lastUpdate ? (f.dayDiff(lastUpdate) === 0 ? f.time(lastUpdate) : f.date(lastUpdate)) : TTD_DASH,
      soc: soc == null ? TTD_DASH : f.number(soc, 0), socKnown: soc != null, socPercent: soc == null ? 0 : ttdClamp(soc, 0, 100), socTone,
      range: this._value("range", 0), odometer: this._value("odometer", 0),
      inside: this._value("temperature_inside", 1), outside: this._value("temperature_outside", 1),
    };
    return {
      status, hero,
      charge: this._chargeModel(f, status, soc, target, socTone),
      plan: this._planModel(f),
      tpms: this._tpmsModel(f),
      drive: this._driveModel(f),
      econ: this._econModel(f),
      last: this._lastChargeModel(f),
      map: this._mapModel(f),
    };
  }

  _chargeModel(f, status, soc, target, socTone) {
    const cable = this._bool("monta_cable_connected");
    const plug = this._bool("charger");
    const montaKey = this._text("monta_state");
    const montaConfigured = !!this._id("monta_state");
    const montaLabel = montaKey ? TTD_TEXT.monta[montaKey] ?? ttdHumanize(montaKey) : montaConfigured ? TTD_TEXT.unavailable : null;
    const mode = this._text("charger_mode");
    const known = cable != null || plug != null || !!montaKey || !!mode;
    const cableText = cable === true || (cable == null && plug === true) ? "Kabel tilsluttet"
      : cable === false || (cable == null && plug === false) ? "Kabel ikke tilsluttet" : null;
    let activity = null;
    if (status.charging) activity = montaKey === "busy-charging" ? "Lader via Monta" : this._attr("charger", "fast_charger_present") === true ? "Lader på hurtiglader" : "Lader";
    else if (montaLabel) activity = `Monta ${montaLabel.toLowerCase()}`;
    const badgeKey = !known ? "unknown" : status.plugged ? status.key : "unplugged";
    const rate = this._num("charging_rate");
    const rateText = rate == null ? TTD_DASH : `${rate > 0 ? "+" : ""}${ttdJoin(f.number(rate, 0), this._unit("charging_rate", "km/h"))}`;
    const remainingRaw = this._text("charging_time_remaining");
    const remainingNumber = ttdToNumber(remainingRaw);
    const remainingUnit = String(this._attr("charging_time_remaining", "unit_of_measurement") || "min");
    const remaining = remainingRaw == null ? TTD_DASH : remainingNumber == null ? remainingRaw
      : remainingNumber <= 0 ? TTD_DASH : f.duration(remainingUnit === "h" ? remainingNumber * 60 : remainingNumber);
    const finishRaw = this._text("charging_finish_time");
    const finish = finishRaw == null ? TTD_DASH : ttdIsClock(finishRaw) ? ttdClock(finishRaw) : ttdToDate(finishRaw) ? f.time(finishRaw) : finishRaw;
    const start = this._control("start_charge");
    const stop = this._control("stop_charge");
    const scheduled = montaKey === "busy-scheduled";
    const estimate = this._num("charging_price_estimate");
    let estimateText = null;
    if (estimate != null) {
      const unit = this._unit("charging_price_estimate", "kr.");
      const kwh = ttdToNumber(this._attr("charging_price_estimate", "estimated_kwh_needed"));
      const price = ttdToNumber(this._attr("charging_price_estimate", "current_price"));
      estimateText = `Estimeret pris ved ladning nu: ${ttdJoin(f.number(estimate, 2), unit)}`
        + (kwh != null && price != null ? ` (${f.number(kwh, 1)} kWh à ${f.number(price, 2)} ${ttdPerKwh(unit)})` : "");
    }
    return {
      active: status.charging,
      sub: [cableText, activity].filter(Boolean).join(" · ") || TTD_DASH,
      badge: { text: TTD_TEXT.status[badgeKey], tone: TTD_STATUS_TONES[badgeKey], icon: TTD_STATUS_ICONS[badgeKey] },
      soc: soc == null ? TTD_DASH : `${f.number(soc, 0)} %`, socPercent: soc == null ? 0 : ttdClamp(soc, 0, 100), socTone,
      target: target == null ? null : `Mål ${f.number(target, 0)} %`, targetPercent: target == null ? null : ttdClamp(target, 0, 100),
      power: this._value("charger_power", 1), rate: rateText, finish, remaining,
      monta: montaLabel ?? TTD_DASH, montaTone: montaKey ? TTD_MONTA_TONES[montaKey] || "muted" : "muted",
      mode: mode ? TTD_TEXT.mode[mode] ?? ttdHumanize(mode) : this._id("charger_mode") ? TTD_TEXT.unavailable : TTD_DASH,
      startVisible: !!start && status.plugged && !status.charging && ttdControlReady(start, "on"),
      stopVisible: !!stop && (status.charging || scheduled) && ttdControlReady(stop, "off"),
      modeOptions: this._modeOptions(),
      estimate: estimateText,
    };
  }

  _modeOptions() {
    const control = this._control("charger_mode");
    if (!control || !["select", "input_select"].includes(control.domain)) return null;
    const options = Array.isArray(control.stateObj.attributes?.options) ? control.stateObj.attributes.options.map(String) : [];
    return options.length ? { options, value: control.stateObj.state } : null;
  }

  _planModel(f) {
    const missing = this._num("missing_wall_kwh");
    const reached = missing != null && missing <= 0.05;
    const startText = this._text("best_charge_start");
    const endText = this._text("best_charge_end");
    const validStart = ttdIsClock(startText);
    let badge = null;
    if (reached) badge = { text: "Mål nået", tone: "ok" };
    else if (validStart) badge = { text: "Aktivt forslag", tone: "info" };
    else if (startText) badge = { text: "Ingen gyldig plan", tone: "warn" };
    else if (this._id("best_charge_start")) badge = { text: TTD_TEXT.status.unknown, tone: "muted" };
    const price = this._num("best_charge_price");
    const priceUnit = this._unit("best_charge_price", "kr.");
    const minutesRaw = this._num("charge_minutes_needed");
    const minutes = minutesRaw == null ? null : String(this._attr("charge_minutes_needed", "unit_of_measurement")) === "h" ? minutesRaw * 60 : minutesRaw;
    const deadline = this._deadlineModel(f);
    const targetId = this._targetEntity();
    const targetControl = this._control("target_soc");
    let soc = null;
    if (targetControl && ["input_number", "number"].includes(targetControl.domain) && ttdHasValue(targetControl.stateObj)) {
      const attrs = targetControl.stateObj.attributes || {};
      const value = ttdToNumber(targetControl.stateObj.state);
      const min = ttdToNumber(attrs.min) ?? 0;
      const max = ttdToNumber(attrs.max) ?? 100;
      soc = { value, min, max, step: ttdToNumber(attrs.step) ?? 1, text: `${f.number(value, 0)} %`, percent: max > min ? ttdClamp(((value - min) / (max - min)) * 100, 0, 100) : 0 };
    }
    return {
      badge,
      sub: `Bedste ladetid baseret på elpris og deadline${deadline.text && !deadline.editable ? ` · klar ${TTD_TEXT.at} ${deadline.text}` : ""}`,
      bestStart: !reached && validStart ? ttdClock(startText) : TTD_DASH,
      bestEnd: !reached && ttdIsClock(endText) ? ttdClock(endText) : TTD_DASH,
      bestPrice: !reached && price != null ? ttdJoin(f.number(price, 2), priceUnit) : TTD_DASH,
      bestPriceKwh: !reached && price != null && price > 0 && missing != null && missing > 0 ? `≈ ${f.number(price / missing, 2)} ${ttdPerKwh(priceUnit)}` : "",
      missing: missing == null ? TTD_DASH : ttdJoin(f.number(Math.max(0, missing), 1), this._unit("missing_wall_kwh", "kWh")),
      minutes: minutes == null ? TTD_DASH : f.duration(Math.max(0, minutes)),
      applyVisible: !!this._control("apply_plan") && !reached,
      soc, targetKnown: !!targetId,
      deadline,
    };
  }

  _deadlineModel(f) {
    const id = this._deadlineEntity();
    const stateObj = id ? this._hass?.states?.[id] : undefined;
    const editable = !!this._control("deadline");
    if (!ttdHasValue(stateObj)) return { text: null, input: "", type: "time", editable: false };
    const domain = id.split(".")[0];
    const attrs = stateObj.attributes || {};
    const raw = String(stateObj.state).trim();
    const hasDate = domain === "datetime" || (domain === "input_datetime" && attrs.has_date === true && attrs.has_time !== false);
    if (domain === "input_datetime" && attrs.has_date === true && attrs.has_time === false) return { text: f.date(`${raw}T00:00:00`), input: raw, type: "date", editable };
    if (hasDate) {
      const date = ttdToDate(raw);
      if (!date) return { text: null, input: "", type: "datetime-local", editable: false };
      const local = domain === "datetime" ? "" : raw.slice(0, 16).replace(" ", "T");
      return { text: f.dayDiff(date) === 0 ? f.time(date) : `${f.date(date)} ${f.time(date)}`, input: local, type: "datetime-local", editable: editable && domain === "input_datetime" };
    }
    return ttdIsClock(raw) ? { text: ttdClock(raw), input: ttdClock(raw), type: "time", editable } : { text: null, input: "", type: "time", editable: false };
  }

  _tpmsModel(f) {
    const tires = {};
    let newest = null;
    for (const [ref, key] of [["FL", "tpms_front_left"], ["FR", "tpms_front_right"], ["RL", "tpms_rear_left"], ["RR", "tpms_rear_right"]]) {
      const stateObj = this._so(key);
      tires[ref] = ttdPressure(stateObj, this._cfg.tpms, f);
      const seen = ttdToNumber(stateObj?.attributes?.tpms_last_seen_pressure_timestamp);
      if (ttdHasValue(stateObj) && seen != null && (newest == null || seen > newest)) newest = seen;
    }
    return { tires, measured: newest == null ? "" : `Målt ${f.dayDiff(newest * 1000) === 0 ? f.time(newest * 1000) : f.dayTime(newest * 1000)}` };
  }

  _driveModel(f) {
    const months = this._attr("monthly_performance", "months");
    let month = TTD_DASH;
    if (Array.isArray(months) && ttdHasValue(this._so("monthly_performance"))) {
      const current = f.dayKey(new Date(), f.serverTz).slice(0, 7);
      const entry = months.find((item) => item?.month === current);
      month = entry ? ttdJoin(f.number(ttdToNumber(entry.distance_km), 0), "km") : ttdJoin(f.number(0, 0), "km");
    }
    const tripAttrs = this._so("last_trip")?.attributes || {};
    const tripStart = ttdToDate(tripAttrs.started_at);
    const tripEnd = ttdToDate(tripAttrs.ended_at);
    const tripMinutes = tripStart && tripEnd ? (tripEnd - tripStart) / 60000 : null;
    return {
      month,
      total: this._value("total_distance", 0),
      trips: this._value("trips", 0),
      lastTrip: this._value("last_trip", 1),
      lastTripMeta: ttdHasValue(this._so("last_trip")) && tripStart ? [f.relativeDay(tripStart), tripMinutes != null && tripMinutes >= 0 ? f.duration(tripMinutes) : null].filter(Boolean).join(" · ") : "",
    };
  }

  _econModel(f) {
    const score = this._num("efficiency_score");
    const monthly = this._num("monthly_performance");
    const missing = this._num("charges_needing_price");
    return {
      costKm: this._value("cost_per_km", 2),
      effScore: this._value("efficiency_score", 0), effTone: score != null && score >= 100 ? "ok" : null,
      monthly: this._value("monthly_performance", 0), monthlyTone: monthly == null ? null : monthly >= 100 ? "ok" : "warn",
      monthlyIcon: monthly != null && monthly < 100 ? "mdi:arrow-down" : "mdi:arrow-up",
      charges: this._value("charges", 0),
      noPrice: this._value("charges_needing_price", 0), noPriceTone: missing != null && missing > 0 ? "warn" : null,
      wallet: this._value("monta_wallet", 2),
    };
  }

  _lastChargeModel(f) {
    const ledger = this._so("last_charge");
    const monta = this._so("monta_last_charge");
    const useLedger = ttdHasValue(ledger);
    const a = (useLedger ? ledger : monta)?.attributes || {};
    const source = useLedger ? "last_charge" : ttdHasValue(monta) ? "monta_last_charge" : null;
    const kwh = ttdToNumber(useLedger ? a.kwh : a.consumedKwh);
    const price = useLedger ? ttdToNumber(a.price) ?? ttdToNumber(ledger.state) : ttdToNumber(a.cost);
    const currency = ttdUnit(useLedger ? a.price_currency || ledger.attributes?.unit_of_measurement : a.currency?.identifier?.toUpperCase());
    const start = ttdToDate(useLedger ? a.started_at : a.startedAt);
    const end = ttdToDate(useLedger ? a.ended_at : a.stoppedAt);
    const minutes = start && end ? (end - start) / 60000 : null;
    const fromSoc = ttdToNumber(useLedger ? a.start_battery_pct : null);
    const toSoc = ttdToNumber(useLedger ? a.end_battery_pct : a.soc?.percentage);
    const foot = source ? [
      end ? `Slut ${f.dayDiff(end) === f.dayDiff(start || end) ? f.time(end) : f.dayTime(end)}` : null,
      kwh && price != null ? `${f.number(price / kwh, 2)} ${ttdPerKwh(currency || "kr.")}` : null,
      fromSoc != null && toSoc != null ? `${f.number(fromSoc, 0)} → ${f.number(toSoc, 0)} %` : toSoc != null ? `${f.number(toSoc, 0)} %` : null,
      useLedger && a.location_name ? String(a.location_name) : null,
    ].filter(Boolean).join(" · ") : "";
    let montaLine = "";
    if (useLedger) {
      const energy = this._num("monta_charge_energy") ?? this._num("monta_last_meter_reading");
      const cost = ttdHasValue(monta) ? ttdToNumber(monta.attributes?.cost) : null;
      const montaCurrency = ttdUnit(monta?.attributes?.currency?.identifier?.toUpperCase());
      const parts = [energy != null ? `${f.number(energy, 2)} kWh` : null, cost != null ? ttdJoin(f.number(cost, 2), montaCurrency || "kr.") : null].filter(Boolean);
      if (parts.length) montaLine = `Monta: ${parts.join(" · ")}`;
    }
    return {
      source,
      kwh: kwh == null ? TTD_DASH : `${f.number(kwh, 2)} kWh`,
      price: price == null ? TTD_DASH : ttdJoin(f.number(price, 2), currency || "kr."),
      start: start ? `${f.date(start)} ${f.time(start)}` : TTD_DASH,
      duration: minutes == null || minutes < 0 ? TTD_DASH : f.duration(minutes),
      foot, montaLine,
    };
  }

  _mapModel(f) {
    const id = this._cfg.location;
    const stateObj = id ? this._hass?.states?.[id] : undefined;
    const lat = ttdToNumber(stateObj?.attributes?.latitude);
    const lon = ttdToNumber(stateObj?.attributes?.longitude);
    const updated = ttdToDate(stateObj?.last_updated);
    const zone = ttdHasValue(stateObj) ? TTD_TEXT.zone[stateObj.state] ?? String(stateObj.state) : null;
    let empty = null;
    if (!id) empty = "Ingen placering konfigureret";
    else if (!stateObj) empty = "Placeringen findes ikke i Home Assistant";
    else if (stateObj.state === "unavailable") empty = "Placering ikke tilgængelig";
    else if (lat == null || lon == null) empty = "Ingen GPS-position";
    else if (this._mapError) empty = "Kortet kunne ikke indlæses";
    return {
      empty,
      meta: [zone, updated ? f.ago(updated) : null].filter(Boolean).join(" · ") || TTD_DASH,
      fresh: !!updated && Date.now() - updated.getTime() < 30 * 60000 && !empty,
    };
  }

  /* ------------------------------------------------------ DOM */

  _build() {
    this.shadowRoot.innerHTML = `<style>${TTD_STYLES}</style>${ttdTemplate(this._cfg)}`;
    this._r = {};
    for (const el of this.shadowRoot.querySelectorAll("[data-r]")) this._r[el.dataset.r] = el;
    this._moreEls = [...this.shadowRoot.querySelectorAll("[data-more]")];
    this._rangeEls = [...this.shadowRoot.querySelectorAll("[data-range]")];
    const cfg = this._cfg;
    this._watch = [...new Set([
      ...Object.values(cfg.entities), ...Object.values(cfg.controls).map((control) => control.entity),
      cfg.location, cfg.chart.distance_entity, cfg.chart.energy_entity,
    ].filter(Boolean))];
    this._seen.clear();
    this._force = true;
    this._built = true;
    this._chartSig = null;
    this._hi = -1;
    const img = this._r.carImg;
    img.addEventListener("error", () => {
      if (img.dataset.fallback) img.hidden = true;
      else {
        img.dataset.fallback = "1";
        img.src = TTD_FALLBACK_CAR;
      }
    });
    img.src = cfg.image || TTD_FALLBACK_CAR;
    this._r.rangeSelect.value = this._chartRange;
    const chart = this._r.chart;
    chart.addEventListener("pointermove", (event) => this._onChartPointer(event));
    chart.addEventListener("pointerleave", () => this._showTip(-1));
    chart.addEventListener("blur", () => this._showTip(-1));
    if (this._visible || typeof IntersectionObserver === "undefined") this._onVisible();
  }

  _t(ref, value) {
    const el = this._r[ref];
    const text = value == null ? "" : String(value);
    if (el && el.textContent !== text) el.textContent = text;
  }

  _hide(ref, hidden) {
    const el = this._r[ref];
    if (el && el.hidden !== !!hidden) el.hidden = !!hidden;
  }

  _attrSet(ref, name, value) {
    const el = typeof ref === "string" ? this._r[ref] : ref;
    if (!el) return;
    if (value == null || value === false) {
      if (el.hasAttribute(name)) el.removeAttribute(name);
    } else {
      const text = value === true ? "" : String(value);
      if (el.getAttribute(name) !== text) el.setAttribute(name, text);
    }
  }

  _style(ref, name, value) {
    const el = this._r[ref];
    if (el && el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
  }

  _apply(m) {
    const r = this._r;
    this._attrSet("wrap", "class", this._hass.themes?.darkMode ? "wrap dark" : "wrap");
    // hero
    this._attrSet("pill", "data-tone", m.hero.tone);
    this._t("statusText", m.hero.status);
    this._t("updatedLong", m.hero.updatedLong);
    this._t("updatedShort", m.hero.updatedShort);
    this._attrSet("hero", "data-charging", m.hero.charging);
    this._attrSet("ring", "data-tone", m.hero.socTone);
    this._t("soc", m.hero.soc);
    this._hide("socUnit", !m.hero.socKnown);
    this._attrSet("ringFill", "stroke-dasharray", `${m.hero.socPercent} 100`);
    this._attrSet("ringFill", "data-zero", m.hero.socPercent <= 0);
    this._t("range", m.hero.range);
    this._attrSet("ring", "aria-label", `Batteri ${m.hero.soc}${m.hero.socKnown ? " %" : ""}, rækkevidde ${m.hero.range}`);
    this._t("odometer", m.hero.odometer);
    this._t("inside", m.hero.inside);
    this._t("outside", m.hero.outside);
    // charge
    const c = m.charge;
    this._attrSet("charge", "data-active", c.active);
    this._t("chargeSub", c.sub);
    this._attrSet("chargeBadge", "data-tone", c.badge.tone);
    this._attrSet(r.chargeBadge.firstElementChild, "icon", c.badge.icon);
    this._t("chargeBadgeText", c.badge.text);
    this._t("chargeSoc", c.soc);
    this._t("chargeTarget", c.target || "");
    this._attrSet("bar", "data-tone", c.socTone);
    this._style("bar", "--soc", String(c.socPercent));
    this._hide("barMark", c.targetPercent == null);
    this._style("bar", "--target", String(c.targetPercent ?? 0));
    this._t("power", c.power);
    this._t("rate", c.rate);
    this._t("finish", c.finish);
    this._t("remaining", c.remaining);
    this._attrSet("montaDot", "data-tone", c.montaTone);
    this._t("montaState", c.monta);
    this._t("chargerMode", c.mode);
    this._renderModeSelect(c.modeOptions);
    this._hide("startBtn", !c.startVisible);
    this._hide("stopBtn", !c.stopVisible);
    this._t("startBtn", this._armed === "start_charge" ? "Bekræft: lad nu" : "Lad nu");
    this._t("stopBtn", this._armed === "stop_charge" ? "Bekræft: stop" : "Stop");
    this._attrSet("startBtn", "data-armed", this._armed === "start_charge");
    this._attrSet("stopBtn", "data-armed", this._armed === "stop_charge");
    this._hide("estimate", !c.estimate);
    this._t("estimate", c.estimate || "");
    // plan
    const p = m.plan;
    this._hide("planBadge", !p.badge);
    if (p.badge) {
      this._attrSet("planBadge", "data-tone", p.badge.tone);
      this._t("planBadgeText", p.badge.text);
    }
    this._t("planSub", p.sub);
    this._t("bestStart", p.bestStart);
    this._t("bestEnd", p.bestEnd);
    this._t("bestPrice", p.bestPrice);
    this._t("bestPriceKwh", p.bestPriceKwh);
    this._t("missing", p.missing);
    this._t("minutes", p.minutes);
    this._hide("applyBtn", !p.applyVisible);
    this._t("applyBtn", this._armed === "apply_plan" ? "Bekræft: brug ladeplan" : "Brug ladeplan");
    this._attrSet("applyBtn", "data-armed", this._armed === "apply_plan");
    this._hide("socCtl", !p.soc);
    if (p.soc) {
      const range = r.socRange;
      this._attrSet(range, "min", p.soc.min);
      this._attrSet(range, "max", p.soc.max);
      this._attrSet(range, "step", p.soc.step);
      if (!this._dragSoc) {
        if (range.value !== String(p.soc.value)) range.value = String(p.soc.value);
        this._t("socCtlVal", p.soc.text);
        range.style.setProperty("--p", `${p.soc.percent}%`);
      }
    }
    const dl = p.deadline;
    this._hide("dlCtl", !dl.editable);
    if (dl.editable) {
      const input = r.dlInput;
      if (input.type !== dl.type) input.type = dl.type;
      if (this.shadowRoot.activeElement !== input && input.value !== dl.input) input.value = dl.input;
    }
    this._hide("planCtl", !p.soc && !dl.editable);
    // tpms
    for (const key of ["FL", "FR", "RL", "RR"]) {
      const tire = m.tpms.tires[key];
      this._attrSet(`t${key}`, "data-tone", tire.tone);
      this._attrSet(`w${key}`, "data-tone", tire.tone);
      this._t(`t${key}V`, tire.text);
      this._t(`t${key}S`, tire.tone === "ok" ? "" : tire.status);
      this._attrSet(`t${key}`, "aria-label", `${r[`t${key}`].querySelector("small").textContent}: ${tire.text}${tire.status ? `, ${tire.status}` : ""}`);
    }
    this._t("tpmsTime", m.tpms.measured);
    // drive & economy
    this._t("month", m.drive.month);
    this._t("totalDist", m.drive.total);
    this._t("tripCount", m.drive.trips);
    this._t("lastTrip", m.drive.lastTrip);
    this._t("lastTripMeta", m.drive.lastTripMeta);
    const e = m.econ;
    this._t("costKm", e.costKm);
    this._t("effScore", e.effScore);
    this._attrSet(r.effScore.parentElement, "data-tone", e.effTone);
    this._t("monthly", e.monthly);
    this._attrSet("monthlyBox", "data-tone", e.monthlyTone);
    this._attrSet(r.monthlyBox.querySelector(".trend"), "icon", e.monthlyIcon);
    this._t("chargeCount", e.charges);
    this._t("noPrice", e.noPrice);
    this._attrSet("noPriceBox", "data-tone", e.noPriceTone);
    this._t("wallet", e.wallet);
    // last charge
    const l = m.last;
    this._attrSet("lastMore", "data-more", l.source === "monta_last_charge" ? "monta_last_charge" : "last_charge");
    this._t("lcKwh", l.kwh);
    this._t("lcPrice", l.price);
    this._t("lcStart", l.start);
    this._t("lcDuration", l.duration);
    this._t("lcFoot", l.foot);
    this._t("lcMonta", l.montaLine);
    // map
    this._attrSet("mapMeta", "data-tone", m.map.fresh ? "ok" : "muted");
    this._t("mapMetaText", m.map.meta);
    this._hide("mapEmpty", !m.map.empty);
    this._t("mapEmpty", m.map.empty || "");
    this._hide("mapHost", !!m.map.empty);
    this._hide("mapSeg", !!m.map.empty);
    for (const el of this._rangeEls) this._attrSet(el, "aria-pressed", String(Number(el.dataset.range) === this._mapHours));
    // Tiles whose entity is missing stay visible (layout) but stop acting like buttons.
    for (const el of this._moreEls) this._attrSet(el, "data-dead", !this._hass.states[this._moreId(el.dataset.more)]);
  }

  _renderModeSelect(model) {
    const select = this._r.modeSelect;
    this._hide("modeSelect", !model);
    this._hide("chargerMode", !!model);
    if (!model) return;
    const signature = model.options.join("\u0001");
    if (select.dataset.sig !== signature) {
      select.dataset.sig = signature;
      select.replaceChildren(...model.options.map((option) => {
        const el = document.createElement("option");
        el.value = option;
        el.textContent = TTD_TEXT.mode[option] ?? ttdHumanize(option);
        return el;
      }));
    }
    if (this.shadowRoot.activeElement !== select && select.value !== model.value) select.value = model.value;
  }

  /* ------------------------------------------------------ map */

  _mapConfig() {
    const map = this._cfg.map;
    return {
      type: "map",
      entities: [{ entity: this._cfg.location, focus: true }],
      hours_to_show: this._mapHours,
      theme_mode: map.theme_mode,
      default_zoom: map.default_zoom,
      ...(map.auto_fit != null ? { auto_fit: !!map.auto_fit } : {}),
    };
  }

  async _ensureMap() {
    if (this._map || this._mapLoading || !this._cfg.location || !this._r.mapHost) return;
    const stateObj = this._hass?.states?.[this._cfg.location];
    if (!stateObj || stateObj.state === "unavailable") return;
    this._mapLoading = true;
    const host = this._r.mapHost;
    try {
      const helpers = await window.loadCardHelpers?.();
      if (!helpers?.createCardElement) throw new Error("loadCardHelpers unavailable");
      const card = helpers.createCardElement(this._mapConfig());
      card.layout = "grid";
      card.hass = this._hass;
      card.addEventListener("ll-rebuild", (event) => {
        event.stopPropagation();
        if (this._map === card) {
          this._map = null;
          this._ensureMap();
        }
      });
      if (host.isConnected && this._r.mapHost === host) {
        host.replaceChildren(card);
        this._map = card;
      }
    } catch (err) {
      this._mapError = true;
      this._queue(true);
    } finally {
      this._mapLoading = false;
    }
  }

  _setMapHours(hours) {
    if (!Number.isFinite(hours) || hours === this._mapHours) return;
    this._mapHours = hours;
    this._map?.setConfig?.(this._mapConfig());
    this._queue(true);
  }

  /* ------------------------------------------------------ chart */

  async _loadStats(range, force) {
    const ids = [this._cfg.chart.distance_entity, this._cfg.chart.energy_entity].filter((id) => id && this._hass?.states?.[id]);
    if (!ids.length || typeof this._hass?.callWS !== "function" || this._loading[range]) return;
    const cached = this._stats[range];
    if (!force && cached && Date.now() - cached.at < TTD_STATS_TTL) return;
    this._loading[range] = true;
    this._attrSet("chart", "data-loading", range === this._chartRange);
    const spec = TTD_CHART_RANGES[range];
    const hoursBack = range === "today" ? 26 : (spec.days + 1) * 24;
    try {
      const rows = await this._hass.callWS({
        type: "recorder/statistics_during_period",
        start_time: new Date(Date.now() - hoursBack * 3600000).toISOString(),
        statistic_ids: ids,
        period: spec.period,
        types: ["change", "state"],
      });
      this._stats[range] = { at: Date.now(), rows: rows || {} };
    } catch (err) {
      this._stats[range] = { at: Date.now(), rows: {}, error: true };
    } finally {
      this._loading[range] = false;
      this._attrSet("chart", "data-loading", false);
    }
    if (range === this._chartRange) this._renderChart(true);
  }

  /** Buckets for the chart: statistic changes plus the live, not yet compiled part of the current period. */
  _chartData() {
    const f = this._format();
    const range = this._chartRange;
    const spec = TTD_CHART_RANGES[range];
    const tz = f.serverTz;
    const now = new Date();
    const todayKey = f.dayKey(now, tz);
    const nowHour = f.hour(now, tz);
    const stats = this._stats[range];
    let slots;
    if (range === "today") {
      slots = Array.from({ length: 24 }, (_, hour) => ({ key: hour, future: hour > nowHour, axis: hour % 4 === 0 ? String(hour).padStart(2, "0") : "", tip: `${String(hour).padStart(2, "0")}:00–${String((hour + 1) % 24).padStart(2, "0")}:00` }));
    } else {
      const keys = [];
      for (let step = 0; keys.length < spec.days && step < spec.days * 4 + 8; step += 1) {
        const key = f.dayKey(new Date(now.getTime() - step * 6 * 3600000), tz);
        if (!keys.includes(key)) keys.push(key);
      }
      slots = keys.reverse().map((key, index) => {
        const date = new Date(`${key}T12:00:00Z`);
        const fromEnd = keys.length - 1 - index;
        const axis = range === "7d" ? f.weekday(date, "short", "UTC").replace(/\.$/, "") : fromEnd % 5 === 0 ? String(Number(key.slice(8))) : "";
        return { key, future: false, axis, tip: `${f.weekday(date, "long", "UTC")} ${Number(key.slice(8))}.${Number(key.slice(5, 7))}.` };
      });
    }
    const series = (id) => {
      const rows = stats?.rows?.[id];
      if (!id || !Array.isArray(rows)) return null;
      const values = new Map();
      let last = null;
      for (const row of rows) {
        const start = typeof row.start === "number" ? row.start : Date.parse(row.start);
        if (!Number.isFinite(start)) continue;
        const key = range === "today" ? (f.dayKey(start, tz) === todayKey ? f.hour(start, tz) : null) : f.dayKey(start, tz);
        const change = ttdToNumber(row.change);
        if (key != null && change != null) values.set(key, (values.get(key) || 0) + Math.max(0, change));
        const state = ttdToNumber(row.state);
        if (state != null && (!last || start > last.start)) last = { start, state };
      }
      const live = ttdHasValue(this._hass.states[id]) ? ttdToNumber(this._hass.states[id].state) : null;
      if (live != null && last) {
        const delta = live - last.state;
        const currentKey = range === "today" ? nowHour : todayKey;
        if (delta > 0 && delta < 1000) values.set(currentKey, (values.get(currentKey) || 0) + delta);
      }
      return values;
    };
    const drive = series(this._cfg.chart.distance_entity);
    const energy = series(this._cfg.chart.energy_entity);
    for (const slot of slots) {
      slot.d = drive && !slot.future ? drive.get(slot.key) ?? 0 : null;
      slot.e = energy && !slot.future ? energy.get(slot.key) ?? 0 : null;
    }
    return { range, slots, hasDrive: !!drive, hasEnergy: !!energy, error: !!stats?.error, loaded: !!stats };
  }

  _renderChart(force) {
    const r = this._r;
    if (!r.chart || !this._hass) return;
    const f = this._format();
    const cfg = this._cfg.chart;
    const live = [cfg.distance_entity, cfg.energy_entity, this._id("daily_energy")].map((id) => this._hass.states[id]?.state).join("|");
    const now = new Date();
    const signature = [this._chartRange, this._stats[this._chartRange]?.at, live, f.hour(now, f.serverTz), f.dayKey(now, f.serverTz), this._env].join("|");
    if (!force && signature === this._chartSig) return;
    this._chartSig = signature;
    const data = this._chartData();
    this._chart = data;
    const dUnit = ttdUnit(this._hass.states[cfg.distance_entity]?.attributes?.unit_of_measurement || "km");
    const eUnit = ttdUnit(this._hass.states[cfg.energy_entity]?.attributes?.unit_of_measurement || "kWh");
    this._chartUnits = { d: dUnit, e: eUnit };
    const n = data.slots.length;
    r.chart.style.setProperty("--n", String(n));
    const bars = (field) => {
      const max = Math.max(0, ...data.slots.map((slot) => slot[field] ?? 0));
      const html = data.slots.map((slot) => {
        const value = slot[field];
        if (value == null) return "<i></i>";
        const height = max > 0 ? Math.round((value / max) * 1000) / 10 : 0;
        return `<i${value > 0 ? ' class="nz"' : ""} style="--h:${height}%"></i>`;
      }).join("");
      return { max, html };
    };
    const drive = bars("d");
    const energy = bars("e");
    const sum = (field) => data.slots.reduce((total, slot) => total + (slot[field] ?? 0), 0);
    this._hide("smD", !data.hasDrive);
    this._hide("smE", !data.hasEnergy);
    if (data.hasDrive && r.barsD.innerHTML !== drive.html) r.barsD.innerHTML = drive.html;
    if (data.hasEnergy && r.barsE.innerHTML !== energy.html) r.barsE.innerHTML = energy.html;
    this._t("maxD", data.hasDrive ? `maks ${f.number(drive.max, 1)} ${dUnit}` : "");
    this._t("maxE", data.hasEnergy ? `maks ${f.number(energy.max, 1)} ${eUnit}` : "");
    const axis = data.slots.map((slot, index) => (slot.axis ? `<span style="grid-column:${index + 1}">${ttdEsc(slot.axis)}</span>` : "")).join("");
    if (r.axis.innerHTML !== axis) r.axis.innerHTML = axis;
    const anySeries = data.hasDrive || data.hasEnergy;
    this._hide("axis", !anySeries);
    let empty = "";
    if (!cfg.distance_entity && !cfg.energy_entity) empty = "Ingen historik konfigureret";
    else if (!anySeries && data.error) empty = "Historik ikke tilgængelig";
    else if (!anySeries && data.loaded) empty = "Ingen historik fundet";
    else if (!anySeries) empty = "Henter historik …";
    this._hide("chartEmpty", !empty);
    this._t("chartEmpty", empty);
    // Totals as text keep every value reachable without hovering (tooltips only enhance).
    const period = TTD_CHART_RANGES[data.range].label.toLowerCase();
    const totals = [
      data.hasDrive ? `${f.number(data.range === "today" && this._num("daily_energy") != null ? this._num("daily_energy") : sum("d"), 1)} ${dUnit}` : null,
      data.hasEnergy ? `${f.number(sum("e"), 1)} ${eUnit}` : null,
    ].filter(Boolean);
    const daily = this._value("daily_energy", 1);
    this._t("dailySub", totals.length ? `${totals.join(" · ")} ${period}` : daily === TTD_DASH ? "" : `${daily} kørt i dag`);
    const peak = data.hasDrive && drive.max > 0 ? data.slots.find((slot) => slot.d === drive.max) : null;
    const spoken = [totals[0] && data.hasDrive ? `${totals[0]} kørt` : null, data.hasEnergy ? `${totals[totals.length - 1]} ladet` : null].filter(Boolean);
    this._attrSet("chart", "aria-label", `Dagligt forbrug ${period}. ${spoken.join(", ") || "Ingen data"}${peak ? `. Mest kørsel ${peak.tip}: ${f.number(drive.max, 1)} ${dUnit}` : ""}.`);
    this._hi = -1;
    this._hide("tip", true);
  }

  _onChartPointer(event) {
    const bars = !this._r.smD.hidden ? this._r.barsD : this._r.barsE;
    const rect = bars.getBoundingClientRect();
    const n = this._chart?.slots.length || 0;
    if (!n || rect.width <= 0) return;
    this._showTip(Math.floor(ttdClamp((event.clientX - rect.left) / rect.width, 0, 0.9999) * n));
  }

  _showTip(index) {
    const data = this._chart;
    const r = this._r;
    if (!data || index < 0 || index >= data.slots.length || data.slots[index].future) {
      if (this._hi >= 0) for (const row of [r.barsD, r.barsE]) row.children[this._hi]?.classList.remove("hi");
      this._hi = -1;
      this._hide("tip", true);
      return;
    }
    if (this._hi !== index) {
      for (const row of [r.barsD, r.barsE]) {
        row.children[this._hi]?.classList.remove("hi");
        row.children[index]?.classList.add("hi");
      }
      this._hi = index;
    }
    const f = this._format();
    const slot = data.slots[index];
    this._t("tipL", slot.tip);
    this._hide("tipDRow", !data.hasDrive);
    this._hide("tipERow", !data.hasEnergy);
    this._t("tipD", `${f.number(slot.d, 1)} ${this._chartUnits.d}`);
    this._t("tipE", `${f.number(slot.e, 1)} ${this._chartUnits.e}`);
    const width = r.chart.clientWidth;
    const x = ((index + 0.5) / data.slots.length) * width;
    r.tip.style.left = `${ttdClamp(x, 70, Math.max(70, width - 70))}px`;
    this._hide("tip", false);
  }

  /* ------------------------------------------------------ interaction */

  _moreId(key) {
    if (!key) return null;
    if (key === "location") return this._cfg.location;
    if (key === "target_soc") return this._targetEntity();
    if (key === "deadline") return this._deadlineEntity();
    return this._cfg.entities[key] || this._cfg.controls[key]?.entity || null;
  }

  _onClick(event) {
    const target = event.target?.closest?.("[data-range],[data-action],[data-more]");
    if (!target) return;
    if (target.dataset.range != null) this._setMapHours(Number(target.dataset.range));
    else if (target.dataset.action) this._action(target.dataset.action);
    else if (target.dataset.more) {
      const entityId = this._moreId(target.dataset.more);
      if (entityId && this._hass?.states?.[entityId]) {
        this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId } }));
      }
    }
  }

  _onChange(event) {
    const el = event.target;
    const r = this._r;
    if (el === r.rangeSelect) {
      this._chartRange = TTD_CHART_RANGES[el.value] ? el.value : "today";
      this._renderChart(true);
      this._loadStats(this._chartRange, false);
    } else if (el === r.socRange) {
      this._dragSoc = false;
      this._setTargetSoc(Number(el.value));
    } else if (el === r.dlInput) this._setDeadline(el.value);
    else if (el === r.modeSelect) this._setChargerMode(el.value);
  }

  _onInput(event) {
    if (event.target !== this._r.socRange) return;
    const el = event.target;
    this._dragSoc = true;
    const min = Number(el.min) || 0;
    const max = Number(el.max) || 100;
    this._t("socCtlVal", `${this._format().number(Number(el.value), 0)} %`);
    el.style.setProperty("--p", `${max > min ? ((Number(el.value) - min) / (max - min)) * 100 : 0}%`);
  }

  _onKey(event) {
    if (event.target !== this._r.chart || !this._chart) return;
    const n = this._chart.slots.length;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const start = this._hi < 0 ? n - 1 : this._hi + (event.key === "ArrowRight" ? 1 : -1);
      let index = ttdClamp(start, 0, n - 1);
      while (index > 0 && this._chart.slots[index].future) index -= 1;
      this._showTip(index);
    } else if (event.key === "Escape") this._showTip(-1);
  }

  _action(name) {
    const control = this._control(name);
    if (!control) return;
    // Two-step confirmation: the first press arms the button for a few seconds, the second one executes.
    if (this._armed !== name) {
      this._disarm(false);
      this._armed = name;
      this._armTimer = setTimeout(() => this._disarm(true), TTD_ARM_MS);
      this._queue(true);
      return;
    }
    this._disarm(true);
    const { id, domain } = control;
    if (domain === "button" || domain === "input_button") this._call(domain, "press", { entity_id: id });
    else if (domain === "switch" || domain === "input_boolean") this._call(domain, name === "stop_charge" ? "turn_off" : "turn_on", { entity_id: id });
    else if (domain === "script" || domain === "scene") this._call(domain, "turn_on", { entity_id: id });
    else if (domain === "automation") this._call(domain, "trigger", { entity_id: id });
  }

  _disarm(render) {
    clearTimeout(this._armTimer);
    this._armTimer = null;
    if (!this._armed) return;
    this._armed = null;
    if (render) this._queue(true);
  }

  _setTargetSoc(value) {
    const control = this._control("target_soc");
    if (!control || !Number.isFinite(value)) return;
    if (["input_number", "number"].includes(control.domain)) this._call(control.domain, "set_value", { entity_id: control.id, value });
  }

  _setDeadline(value) {
    const control = this._control("deadline");
    if (!control || !value) return;
    const { id, domain } = control;
    const attrs = control.stateObj.attributes || {};
    if (domain === "input_datetime") {
      if (attrs.has_date && attrs.has_time !== false) this._call(domain, "set_datetime", { entity_id: id, datetime: `${value.replace("T", " ")}:00` });
      else if (attrs.has_date) this._call(domain, "set_datetime", { entity_id: id, date: value });
      else this._call(domain, "set_datetime", { entity_id: id, time: `${value}:00` });
    } else if (domain === "time") this._call(domain, "set_value", { entity_id: id, time: `${value}:00` });
  }

  _setChargerMode(option) {
    const control = this._control("charger_mode");
    if (control && ["select", "input_select"].includes(control.domain)) this._call(control.domain, "select_option", { entity_id: control.id, option });
  }

  async _call(domain, service, data) {
    try {
      await this._hass.callService(domain, service, data);
    } catch (err) {
      this.dispatchEvent(new CustomEvent("hass-notification", {
        bubbles: true, composed: true, detail: { message: `Handlingen mislykkedes: ${err?.message || err}` },
      }));
    }
  }
}

function ttdPerKwh(unit) {
  return unit === "kr." || unit === "kr" ? "kr/kWh" : `${unit}/kWh`;
}

/** A switch used for start/stop is only offered in the state where pressing it changes something. */
function ttdControlReady(control, wanted) {
  if (!["switch", "input_boolean"].includes(control.domain)) return true;
  return wanted === "on" ? control.stateObj.state === "off" : control.stateObj.state === "on";
}

if (!customElements.get(TTD_TAG)) customElements.define(TTD_TAG, ThTeslaDashboardCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === TTD_TAG)) {
  window.customCards.push({
    type: TTD_TAG,
    name: "TH Tesla Dashboard Card",
    description: `Tesla-dashboard med batteri, kort, opladning, ladeplan, dæktryk og EV Ledger v${TTD_VERSION}`,
    preview: false,
    documentationURL: "https://github.com/MRDonnii/ha-smart-home-cards/tree/main/src/cards/th-tesla-dashboard-card",
  });
}
