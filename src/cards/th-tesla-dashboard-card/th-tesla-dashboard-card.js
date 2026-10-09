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

const TTD_VERSION = "1.5.0";
// The smart charge plan comes from the user's own template sensors; without any of them the panel is left out.
const TTD_PLAN_ENTITY_KEYS = ["best_charge_start", "best_charge_end", "best_charge_price", "missing_wall_kwh", "charge_minutes_needed"];
const TTD_PLAN_CONTROL_KEYS = ["apply_plan", "target_soc", "deadline"];
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
const TTD_PENDING_MS = 8000;
const TTD_REFRESH_MS = 60 * 1000;
// Esri World Imagery (satellite) and its place-name overlay, shown on top of Home Assistant's own map on request.
const TTD_SATELLITE = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  labels: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  attribution: "Tiles &copy; Esri &mdash; Esri, Maxar, Earthstar Geographics",
};
// Shared by every card instance (dashboard view and popup), so opening both never doubles the refresh requests.
let ttdLastRefresh = 0;
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

// Smart charging by the EV Smart Charge integration (ev_smart_charge). Its entities are found on the car's device by
// translation key; the English entity id suffixes are the fallback when the entity registry is not available.
const TTD_SC_ROLES = {
  charge_mode: "select._charge_mode", default_charge_mode: "select._default_plan", charge_status: "sensor._charge_status", next_charge_start: "sensor._next_charge_start",
  next_charge_end: "sensor._next_charge_end", planned_cost: "sensor._planned_charge_cost", planned_energy: "sensor._planned_charge_energy",
  plan_target_soc: "sensor._plan_target_soc", target_soc: "number._target_soc", ready_by_time: "time._ready_by",
  fixed_start: "time._fixed_charging_start", fixed_end: "time._fixed_charging_end", price_cap: "number._price_cap",
  min_soc: "number._minimum_soc", trip_departure: "datetime._temporary_departure", trip_destination: "text._trip_destination",
  trip_round_trip: "switch._round_trip", trip_clear: "button._clear_temporary_plan", trip_distance: "sensor._trip_distance",
  trip_energy: "sensor._trip_energy", trip_target_soc: "sensor._trip_soc_needed", charge_now: "binary_sensor._charge_now",
  confirm_on_phone: "switch._confirm_plan_on_phone", confirm_plan: "button._confirm_plan",
  notify_plan: "switch._notify_plan_on_phone", send_plan: "button._send_plan_to_phone",
};
const TTD_SC_MODES = [
  ["smart", "Billigst", "mdi:piggy-bank-outline"], ["fixed", "Fast tid", "mdi:clock-time-four-outline"],
  ["now", "Lad nu", "mdi:lightning-bolt"], ["price_cap", "Prisloft", "mdi:cash-lock"],
  ["off", "Pause", "mdi:pause"], ["manual", "Manuel", "mdi:hand-back-right-outline"],
];
// Plans that can be the default (used when the cable goes in, and returned to after another plan has run).
const TTD_SC_DEFAULTS = ["smart", "fixed", "price_cap", "now", "manual"];
const ttdScLabel = (mode) => TTD_SC_MODES.find(([key]) => key === mode)?.[1] || ttdHumanize(mode || "");
const TTD_SC_STATUS = {
  plan_only: ["Kun plan", "muted"], manual: ["Manuel", "muted"], disconnected: ["Ikke tilsluttet", "muted"],
  other_car: ["Anden bil i laderen", "muted"], unknown: ["Ukendt", "muted"], charging: ["Lader", "ok"],
  stopped_externally: ["Stoppet af bil/app", "warn"], not_responding: ["Laderen svarer ikke", "crit"], paused: ["På pause", "warn"],
  starting: ["Starter", "info"], done: ["Mål nået", "ok"], waiting: ["Venter på billig strøm", "info"],
  awaiting_confirmation: ["Venter på bekræftelse", "warn"],
};

// Original side views of every Tesla body (no third-party assets), front to the left, painted from TTD_PAINTS.
const TTD_PAINTS = {
  grey: ["#6b7482", "#363c47", "#1c2027"], black: ["#4a5058", "#1d2026", "#0b0d10"], white: ["#f4f6f8", "#d3d8de", "#98a0aa"],
  silver: ["#dde1e6", "#9aa2ab", "#5c636d"], blue: ["#4a72b8", "#1f3d78", "#0e1f40"], red: ["#d23b45", "#8e1820", "#4d0b10"],
};
const TTD_BODIES = {
  model_3: {
    body: "M30 140c-2-15 7-26 27-30l74-11c33-25 69-39 118-41 47-2 90 11 126 37l52 10c21 4 33 17 33 36l-2 14c0 6-4 10-10 10h-49a39 39 0 0 0-78 0H168a39 39 0 0 0-78 0H43c-8 0-12-6-13-13z",
    glass: "M144 99c29-21 62-31 104-33 43-2 80 9 109 29z", light: "M36 128h38", tail: "M448 126l14 3", wheels: [129, 364], wy: 170, wr: 31,
  },
  model_3_highland: {
    body: "M30 140c-2-15 7-26 27-30l74-11c33-25 69-39 118-41 47-2 90 11 126 37l52 10c21 4 33 17 33 36l-2 14c0 6-4 10-10 10h-49a39 39 0 0 0-78 0H168a39 39 0 0 0-78 0H43c-8 0-12-6-13-13z",
    glass: "M144 99c29-21 62-31 104-33 43-2 80 9 109 29z", light: "M34 124c11-3 22-4 33-4", tail: "M440 122h22", wheels: [129, 364], wy: 170, wr: 31,
  },
  model_y: {
    body: "M28 146C26 128 36 116 58 112L128 100C160 72 200 56 252 54C300 52 338 64 372 92L420 104C442 110 454 124 454 142L452 158C452 164 448 168 442 168L402 168A39 39 0 0 0 324 168L168 168A39 39 0 0 0 90 168L40 168C33 168 29 160 28 146Z",
    glass: "M142 98C172 76 206 64 250 62C292 60 326 70 356 92Z", light: "M34 132h40", tail: "M440 120l14 3", wheels: [129, 363], wy: 168, wr: 31,
  },
  model_y_juniper: {
    body: "M28 146C26 128 36 116 58 112L128 100C160 72 200 56 252 54C300 52 338 64 372 92L420 104C442 110 454 124 454 142L452 158C452 164 448 168 442 168L402 168A39 39 0 0 0 324 168L168 168A39 39 0 0 0 90 168L40 168C33 168 29 160 28 146Z",
    glass: "M142 98C172 76 206 64 250 62C292 60 326 70 356 92Z", light: "M30 122c16-2 34-2 52 0", tail: "M432 118h22", wheels: [129, 363], wy: 168, wr: 31,
  },
  model_s: {
    body: "M20 142C18 128 28 118 48 114L122 102C156 78 196 64 250 62C304 60 352 74 392 100L436 108C454 112 464 126 464 142L462 156C462 163 458 168 451 168L414 168A39 39 0 0 0 336 168L164 168A39 39 0 0 0 86 168L34 168C26 168 21 158 20 142Z",
    glass: "M138 100C170 80 206 70 250 68C296 66 338 78 372 100Z", light: "M26 128h40", tail: "M450 122l13 3", wheels: [125, 375], wy: 170, wr: 31,
  },
  model_x: {
    body: "M22 148C20 130 30 118 52 114L120 100C150 66 196 50 256 48C316 46 362 62 398 96L440 106C458 112 466 126 466 144L464 158C464 164 460 168 453 168L416 168A40 40 0 0 0 336 168L166 168A40 40 0 0 0 86 168L36 168C28 168 23 160 22 148Z",
    glass: "M136 98C166 70 206 58 254 56C302 54 342 68 376 96Z", light: "M28 132h40", tail: "M452 120l13 3", wheels: [126, 376], wy: 170, wr: 32,
  },
  cybertruck: {
    body: "M22 140L28 118L240 44L454 104L460 140L458 162L420 162A40 40 0 0 0 340 162L172 162A40 40 0 0 0 92 162L26 162Z",
    glass: "M150 94L240 56L322 80L322 94Z", light: "M26 120l40-14", tail: "M454 106l4 12", wheels: [132, 380], wy: 166, wr: 32,
  },
  roadster: {
    body: "M40 150C38 138 46 130 62 126L150 112C176 92 206 84 240 84C278 84 312 96 340 112L408 120C426 122 438 134 438 150L436 160C436 165 432 168 426 168L388 168A35 35 0 0 0 318 168L170 168A35 35 0 0 0 100 168L52 168C45 168 41 162 40 150Z",
    glass: "M176 110C196 96 216 90 240 90C266 90 290 98 310 110Z", light: "M46 136h32", tail: "M424 128l12 2", wheels: [135, 353], wy: 170, wr: 28,
  },
};

/** Side view of a Tesla body in a paint colour, as an image URL. */
function ttdCarArt(bodyKey, paintKey) {
  const b = TTD_BODIES[bodyKey] || TTD_BODIES.model_3;
  const [hi, mid, lo] = TTD_PAINTS[paintKey] || TTD_PAINTS.grey;
  const wheel = (x) => `<circle cx="${x}" cy="${b.wy}" r="${b.wr}" fill="#121418"/><circle cx="${x}" cy="${b.wy}" r="${Math.round(b.wr * 0.68)}" fill="#3b424d"/><circle cx="${x}" cy="${b.wy}" r="${Math.round(b.wr * 0.24)}" fill="#1b1f25"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 210"><defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset=".5" stop-color="${mid}"/><stop offset="1" stop-color="${lo}"/></linearGradient><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a3442"/><stop offset="1" stop-color="#0c1016"/></linearGradient><radialGradient id="s"><stop offset="0" stop-color="#000" stop-opacity=".5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs><ellipse cx="243" cy="188" rx="228" ry="15" fill="url(#s)"/><path fill="url(#b)" d="${b.body}"/><path fill="url(#g)" d="${b.glass}"/><path d="${b.light}" stroke="#e7eef6" stroke-width="3" stroke-linecap="round" fill="none"/><path d="${b.tail}" stroke="#e0464f" stroke-width="3" stroke-linecap="round" fill="none"/>${b.wheels.map(wheel).join("")}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

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
  const map = { hours_to_show: 6, theme_mode: "auto", default_zoom: 14, style: "default", satellite_labels: true, ...(config.map || {}) };
  map.style = map.style === "satellite" ? "satellite" : "default";
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
    // "auto" or no model: the name and body come from the car EV Smart Charge plans for.
    model: (vehicle.model || config.model) && (vehicle.model || config.model) !== "auto" ? String(vehicle.model || config.model) : null,
    body: TTD_BODIES[vehicle.body] ? vehicle.body : null,
    paint: TTD_PAINTS[vehicle.color] ? vehicle.color : "grey",
    image: vehicle.image || config.vehicle_image || null,
    smart_charge: typeof config.smart_charge === "string" && config.smart_charge.includes(".") ? config.smart_charge.trim() : null,
    charger_label: typeof config.charger_label === "string" && config.charger_label.trim() ? config.charger_label.trim() : null,
    confirm_mode_change: config.confirm_mode_change !== false,
    location: config.location_entity || entities.location || null,
    entities, controls, map, chart, tpms, battery, precision,
    layout: config.layout === "charge" ? "charge" : "full",
    navigation_path: typeof config.navigation_path === "string" && config.navigation_path.startsWith("/") ? config.navigation_path : null,
    // Entities asked to refresh (homeassistant.update_entity) when the card becomes visible, e.g. a cloud-polled charger.
    plan: TTD_PLAN_ENTITY_KEYS.some((key) => entities[key]) || TTD_PLAN_CONTROL_KEYS.some((key) => controls[key])
      || (typeof config.smart_charge === "string" && config.smart_charge.includes(".")),
    refresh: (Array.isArray(config.refresh_entities) ? config.refresh_entities : []).filter((id) => typeof id === "string" && id.includes(".")),
  };
}

/** One user-facing vehicle status derived from Tesla, Monta and Zaptec data. Pure function (unit tested). */
function ttdDeriveStatus(snapshot) {
  const s = snapshot || {};
  const mode = s.mode || "";
  const monta = s.monta || "";
  const chargingState = s.chargingState || "";
  const plugged = s.plug === true || s.cable === true || mode.startsWith("connected_") || TTD_MONTA_PLUGGED.has(monta);
  // Plugged into the home charger, the charger decides whether it charges: the car's own charging flag can stand still
  // for an hour after a stop (Claude AI, 2026-10-09: stopped, yet shown charging with only "Stop"). Elsewhere (a public
  // charger) the car's own state counts.
  const atCharger = s.cable === true || mode.startsWith("connected_") || TTD_MONTA_PLUGGED.has(monta);
  const chargerCharging = mode === "connected_charging" || monta === "busy-charging" || (s.power != null && s.power >= 0.3);
  const charging = atCharger ? chargerCharging : s.charging === true || chargingState === "Charging" || chargerCharging;
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
  const kpi = (key, icon, ref, label) => `<button class="kpi" data-more="${key}">${ttdIcon(icon, "tile-i")}<b data-r="${ref}">${TTD_DASH}</b><small>${label}</small></button>`;
  const cell = (key, icon, tone, ref, label, extra = "") => `<button class="cell" data-more="${key}">${ttdIcon(icon, `ic ${tone}`)}<span><small>${label}</small><b data-r="${ref}">${TTD_DASH}</b>${extra}</span></button>`;
  const row = (key, label, ref, extra = "") => `<button class="row" data-more="${key}"><span class="row-l">${label}</span><span class="row-v"${extra ? ` data-r="${ref}Box"` : ""}>${extra}<b data-r="${ref}">${TTD_DASH}</b></span></button>`;
  const tire = (key, ref, label) => `<button class="tire" data-more="${key}" data-r="${ref}">${ttdIcon("mdi:tire", "tile-i")}<b data-r="${ref}V">${TTD_DASH}</b><small>${label}</small><em data-r="${ref}S"></em></button>`;
  const item = (key, icon, ref, label) => `<div class="lc"><span class="lc-i">${ttdIcon(icon)}</span><span><b data-r="${ref}">${TTD_DASH}</b><small>${label}</small></span></div>`;
  const ranges = cfg.map.ranges.map((hours) => `<button type="button" data-range="${hours}" aria-pressed="false">${hours === 0 ? "Nu" : `${hours}t`}</button>`).join("");
  const chartOptions = Object.entries(TTD_CHART_RANGES).map(([key, range]) => `<option value="${key}">${range.label}</option>`).join("");
  const full = cfg.layout !== "charge";
  return `<div class="wrap" data-r="wrap"><div class="dash${full ? "" : " charge-layout"}${cfg.plan ? "" : " no-plan"}">
<section class="panel hero" data-r="hero" aria-label="Bilstatus">
  <div class="hero-info">
    <div class="hero-title"><h2 class="name">${e(cfg.name)}</h2><button class="pill" data-more="online" data-r="pill"><i class="dot"></i><span data-r="statusText">${TTD_DASH}</span></button></div>
    <p class="model" data-r="model">${e(cfg.model || "Tesla")}</p>
    <button class="updated" data-more="last_update"><span>Sidst opdateret</span><span data-r="updatedLong">${TTD_DASH}</span></button>
  </div>
  <div class="hero-car"><img data-r="carImg" alt="${e(cfg.model || "Tesla")}" decoding="async" width="900" height="434"></div>
  <button class="ring-wrap" data-more="battery" data-r="ring">
    <svg class="ring" viewBox="0 0 120 120" aria-hidden="true"><circle class="ring-track" cx="60" cy="60" r="52"/><circle class="ring-fill" data-r="ringFill" cx="60" cy="60" r="52" pathLength="100" stroke-dasharray="0 100"/></svg>
    <span class="ring-t"><span class="soc"><b data-r="soc">${TTD_DASH}</b><small data-r="socUnit">%</small>${ttdIcon("mdi:lightning-bolt", "bolt")}</span><span class="range" data-r="range">${TTD_DASH}</span><span class="muted">rækkevidde</span></span>
  </button>
  ${full ? `<div class="hero-stats">${stat("odometer", "mdi:speedometer", "odometer", "Kilometerstand")}${stat("temperature_inside", "mdi:thermometer", "inside", "Indetemperatur")}${stat("temperature_outside", "mdi:thermometer", "outside", "Udetemperatur")}${stat("last_update", "mdi:refresh", "updatedShort", "Sidst opdateret")}</div>` : ""}
</section>
<section class="panel charge" data-r="charge" aria-label="Opladning">
  <header class="ph">${ttdIcon("mdi:lightning-bolt", "ph-i green")}<div class="ph-t"><h3>Opladning</h3><p data-r="chargeSub">${TTD_DASH}</p></div><span class="badge" data-r="chargeBadge">${ttdIcon("mdi:power-plug", "")}<span data-r="chargeBadgeText">${TTD_DASH}</span></span></header>
  <div class="soc-row"><b data-r="chargeSoc">${TTD_DASH}</b><span data-r="chargeTarget"></span></div>
  <div class="bar" data-r="bar"><i class="bar-fill" data-r="barFill"></i><i class="bar-mark" data-r="barMark"></i></div>
  <div class="box kpis">${kpi("charger_power", "mdi:flash", "power", "Aktuel effekt")}${kpi("charging_rate", "mdi:speedometer", "rate", "Ladehastighed")}${kpi("charging_finish_time", "mdi:flag-checkered", "finish", "Forventet slut")}${kpi("charging_time_remaining", "mdi:timer-sand", "remaining", "Resttid")}</div>
  <div class="box monta">
    <button class="monta-main" data-more="${cfg.entities.monta_state ? "monta_state" : "charger_mode"}"><i class="mdot" data-r="montaDot"></i><span><b>${e(cfg.charger_label || (cfg.entities.monta_state ? "Monta" : "Lader"))}</b><small data-r="montaState">${TTD_DASH}</small></span></button>
    <div class="monta-mode" data-r="modeBox"><small>Ladertilstand</small><button class="mode-v" data-more="charger_mode" data-r="chargerMode">${TTD_DASH}</button><select class="mode-sel" data-r="modeSelect" aria-label="Ladertilstand" hidden></select></div>
    <div class="acts"><button type="button" class="btn go" data-action="start_charge" data-r="startBtn" hidden>Lad nu</button><button type="button" class="btn stop" data-action="stop_charge" data-r="stopBtn" hidden>Stop</button></div>
  </div>
  <div class="cmp" data-r="cmp" role="radiogroup" aria-label="Pris pr. ladeplan" hidden></div>
  <button class="foot" data-more="charging_price_estimate" data-r="estimate" hidden></button>
</section>
${cfg.smart_charge ? `<section class="panel plan sc" data-r="plan" aria-label="Smart opladning">
  <header class="ph">${ttdIcon("mdi:clock-outline", "ph-i")}<div class="ph-t"><h3>Smart opladning</h3><p data-r="scSub">${TTD_DASH}</p></div><span class="badge" data-r="scBadge"><span data-r="scBadgeText">${TTD_DASH}</span></span></header>
  <div class="sc-modes" role="radiogroup" aria-label="Ladeplan">${TTD_SC_MODES.map(([key, label, icon]) => `<button type="button" role="radio" aria-checked="false" data-scmode="${key}">${ttdIcon(icon)}<span>${label}</span>${ttdIcon("mdi:star", "sc-star")}</button>`).join("")}</div>
  <button type="button" class="btn go wide sc-confirm" data-scconfirm data-r="scConfirm" hidden>Bekræft billigst</button>
  <div class="sc-time" data-r="scTime"><div class="sc-track" data-r="scTrack"></div><div class="sc-axis"><span data-r="scAxisL">Nu</span><span data-r="scAxisM"></span><span data-r="scAxisR"></span></div></div>
  <div class="box plan-top">${cell("sc:next_charge_start", "mdi:clock-start", "blue", "scStart", "Næste start", `<em data-r="scStartDay"></em>`)}${cell("sc:next_charge_end", "mdi:check-circle-outline", "green", "scEnd", "Forventet slut", `<em data-r="scEndDay"></em>`)}${cell("sc:planned_cost", "mdi:cash", "amber", "scCost", "Planlagt pris", `<em data-r="scKwh"></em>`)}</div>
  <div class="plan-ctl" data-r="planCtl">
    <label class="ctl" data-r="socCtl" hidden>${ttdIcon("mdi:target", "ic green")}<span>Mål SOC</span><b data-r="socCtlVal">${TTD_DASH}</b><input type="range" data-r="socRange" aria-label="Mål SOC"></label>
    <label class="ctl" data-r="dlCtl" hidden>${ttdIcon("mdi:calendar-clock", "ic blue")}<span>Klar senest</span><input type="time" data-r="dlInput" aria-label="Klar senest"></label>
    <div class="ctl2" data-r="scFixed" hidden>${ttdIcon("mdi:clock-time-four-outline", "ic blue")}<span>Fast tid</span><input type="time" data-r="scFixedStart" aria-label="Fast ladestart"><span>–</span><input type="time" data-r="scFixedEnd" aria-label="Fast ladeslut"></div>
    <div class="ctl2" data-r="scCap" hidden>${ttdIcon("mdi:cash-lock", "ic amber")}<span>Prisloft</span><input type="number" step="0.05" inputmode="decimal" data-r="scCapInput" aria-label="Prisloft"><small data-r="scCapUnit"></small><span>min.</span><input type="number" step="5" min="0" max="100" inputmode="numeric" data-r="scMinInput" aria-label="Minimum-SOC"><small>%</small></div>
  </div>
  <div class="sc-trip" data-r="scTrip">
    <button type="button" class="sc-trip-h" data-sctrip data-r="scTripHead" aria-expanded="false">${ttdIcon("mdi:map-marker-path", "ic blue")}<span><b>Midlertidig plan</b><small data-r="scTripSum">${TTD_DASH}</small></span>${ttdIcon("mdi:chevron-down", "sc-chev")}</button>
    <div class="sc-trip-b" data-r="scTripBody" hidden>
      <label class="sc-f"><span>Afgang</span><input type="datetime-local" data-r="scDep"></label>
      <label class="sc-f"><span>Destination (valgfri)</span><input type="text" data-r="scDest" placeholder="Adresse, by eller zone.arbejde" enterkeyhint="done" autocomplete="off"></label>
      <div class="sc-row"><button type="button" class="chip" data-scround data-r="scRound" aria-pressed="false">${ttdIcon("mdi:swap-horizontal")}<span>Tur/retur</span></button><span class="sc-info" data-r="scTripInfo"></span></div>
      <button type="button" class="btn stop wide" data-scclear data-r="scClear" hidden>Ryd midlertidig plan</button>
    </div>
  </div>
  <div class="sc-trip sc-def" data-r="scDef" hidden>
    <button type="button" class="sc-trip-h" data-scdef data-r="scDefHead" aria-expanded="false">${ttdIcon("mdi:calendar-star", "ic amber")}<span><b>Standardplan</b><small data-r="scDefSum">${TTD_DASH}</small></span>${ttdIcon("mdi:chevron-down", "sc-chev")}</button>
    <div class="sc-trip-b" data-r="scDefBody" hidden>
      <p class="sc-note">Kører når kablet sættes i. Vælger du en anden plan, kører den én gang og går så tilbage hertil.</p>
      <div class="sc-modes sc-defs" role="radiogroup" aria-label="Standardplan">${TTD_SC_MODES.filter(([key]) => TTD_SC_DEFAULTS.includes(key)).map(([key, label, icon]) => `<button type="button" role="radio" aria-checked="false" data-scdefault="${key}">${ttdIcon(icon)}<span>${label}</span></button>`).join("")}</div>
    </div>
  </div>
  <div class="sc-row sc-phone" data-r="scPhone" hidden><button type="button" class="chip" data-scinfo data-r="scInfoChip" aria-pressed="false" hidden>${ttdIcon("mdi:cellphone-message")}<span>Besked om plan</span></button><button type="button" class="chip" data-scphone data-r="scPhoneChip" aria-pressed="false">${ttdIcon("mdi:cellphone-check")}<span>Bekræft på mobil</span></button><button type="button" class="chip" data-scsend data-r="scSendChip" hidden>${ttdIcon("mdi:send")}<span>Send nu</span></button><span class="sc-info" data-r="scPhoneInfo"></span></div>
</section>` : `<section class="panel plan" data-r="plan" aria-label="Smart ladeplan"${cfg.plan ? "" : " hidden"}>
  <header class="ph">${ttdIcon("mdi:clock-outline", "ph-i")}<div class="ph-t"><h3>Smart ladeplan</h3><p data-r="planSub">${TTD_DASH}</p></div><span class="badge" data-r="planBadge"><span data-r="planBadgeText">${TTD_DASH}</span></span></header>
  <div class="box plan-top">${cell("best_charge_start", "mdi:clock-start", "blue", "bestStart", "Bedste start")}${cell("best_charge_end", "mdi:check-circle-outline", "green", "bestEnd", "Forventet slut")}${cell("best_charge_price", "mdi:cash", "amber", "bestPrice", "Forventet pris", `<em data-r="bestPriceKwh"></em>`)}</div>
  <div class="box plan-mid">${cell("missing_wall_kwh", "mdi:alarm", "orange", "missing", "Mangler for mål")}${cell("charge_minutes_needed", "mdi:timer-outline", "green", "minutes", "Ladetid (est.)")}</div>
  <button type="button" class="btn go wide" data-action="apply_plan" data-r="applyBtn" hidden>Brug ladeplan</button>
  <div class="plan-ctl" data-r="planCtl" hidden>
    <label class="ctl" data-r="socCtl" hidden>${ttdIcon("mdi:target", "ic green")}<span>Mål SOC</span><b data-r="socCtlVal">${TTD_DASH}</b><input type="range" data-r="socRange" aria-label="Mål SOC"></label>
    <label class="ctl" data-r="dlCtl" hidden>${ttdIcon("mdi:calendar-clock", "ic blue")}<span>Klar senest</span><input type="time" data-r="dlInput" aria-label="Klar senest"></label>
  </div>
</section>`}
${full ? `<section class="panel map" data-r="mapPanel" aria-label="Bilens placering">
  <header class="ph">${ttdIcon("mdi:map-marker-radius", "ph-i blue")}<div class="ph-t"><h3>Bilens placering</h3></div><span class="meta" data-r="mapMeta"><i class="dot"></i><span data-r="mapMetaText">${TTD_DASH}</span></span><button type="button" class="icon-btn" data-mapstyle data-r="styleBtn" aria-pressed="false" aria-label="Satellitbillede" title="Satellitbillede" hidden>${ttdIcon("mdi:satellite-variant")}</button><button class="icon-btn" data-more="location" aria-label="Åbn placering">${ttdIcon("mdi:arrow-expand")}</button></header>
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
  <div class="rows">${row("cost_per_km", "Pris pr. km", "costKm")}${row("efficiency_score", "Effektivitetsscore", "effScore")}${row("monthly_performance", "Månedlig performance", "monthly", ttdIcon("mdi:arrow-up", "trend"))}${row("charges", "Antal opladninger", "chargeCount")}${row("charges_needing_price", "Opladninger uden pris", "noPrice", ttdIcon("mdi:alert-outline", "trend"))}${cfg.entities.monta_wallet ? row("monta_wallet", "Monta wallet", "wallet") : ""}</div>
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
</section>` : ""}
${cfg.navigation_path ? `<button type="button" class="panel navlink" data-nav>${ttdIcon("mdi:car-info", "ph-i")}<span>Åbn hele Tesla-oversigten</span>${ttdIcon("mdi:chevron-right")}</button>` : ""}
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
/* price per plan */
.cmp{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:14px}
.cmp-i{display:grid;align-content:start;gap:3px;min-width:0;padding:12px 14px;border-radius:12px;border:1px solid var(--tdc-line);
  background:color-mix(in srgb,var(--primary-text-color,#fff) 5%,var(--surface,var(--ha-card-background,var(--card-background-color,#172536))))}
.cmp-i:hover{background:var(--tdc-hover)}
.cmp-i small{font-size:13px;font-weight:700;color:var(--tdc-muted)}
.cmp-i b{font-size:21px;font-weight:750;line-height:1.15;color:var(--tdc-text);white-space:nowrap}
.cmp-i span{font-size:13px;color:color-mix(in srgb,var(--tdc-text) 75%,transparent);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cmp-i em{font-style:normal;font-size:13px;font-weight:700;color:var(--tdc-green)}
.cmp-i[aria-checked=true]{border-color:color-mix(in srgb,var(--tdc-blue) 70%,transparent);background:color-mix(in srgb,var(--tdc-blue) 16%,transparent)}
.cmp-i[aria-checked=true] small{color:var(--tdc-blue)}
.cmp-i[data-armed],.sc-modes button[data-armed]{outline:2px solid var(--tdc-orange);outline-offset:2px}
.cmp-i[data-armed] small{color:var(--tdc-orange)}
@container panel (max-width:420px){.cmp{grid-template-columns:minmax(0,1fr)}.cmp-i{grid-template-columns:auto 1fr;column-gap:12px}.cmp-i b{grid-row:1/3;grid-column:1;align-self:center}}
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
/* smart charging (EV Smart Charge) */
.sc-modes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:16px}
.sc-modes button{display:flex;align-items:center;justify-content:center;gap:6px;min-width:0;min-height:40px;padding:0 8px;border-radius:10px;
  border:1px solid var(--tdc-line);background:var(--tdc-tile);font-size:14px;font-weight:600;white-space:nowrap}
.sc-modes button span{overflow:hidden;text-overflow:ellipsis}
.sc-modes button ha-icon{--mdc-icon-size:18px}
.sc-modes button:hover{background:var(--tdc-hover)}
.sc-modes button[aria-checked=true]{background:color-mix(in srgb,var(--tdc-blue) 24%,transparent);border-color:color-mix(in srgb,var(--tdc-blue) 65%,transparent)}
.sc-modes button[aria-checked=true] ha-icon{color:var(--tdc-blue)}
.sc-modes button{position:relative}
.sc-modes .sc-star{display:none;position:absolute;top:3px;right:4px;--mdc-icon-size:13px;color:var(--tdc-amber)}
.sc-modes button[data-default] .sc-star{display:block}
.sc-modes button[aria-checked=true] .sc-star{color:var(--tdc-amber)}
.sc-time{margin-bottom:14px}
.sc-track{position:relative;height:14px;border-radius:999px;background:color-mix(in srgb,var(--tdc-text) 11%,transparent)}
.sc-seg{position:absolute;top:0;bottom:0;border-radius:999px;background:var(--tdc-green);box-shadow:0 0 8px color-mix(in srgb,var(--tdc-green) 45%,transparent)}
.sc-seg[data-est]{background:repeating-linear-gradient(45deg,var(--tdc-green) 0 5px,color-mix(in srgb,var(--tdc-green) 50%,transparent) 5px 10px)}
.sc-mark{position:absolute;top:-4px;bottom:-4px;width:3px;margin-left:-1.5px;border-radius:2px;background:var(--tdc-text)}
.sc-mark.trip{background:var(--tdc-blue)}
.sc-axis{display:grid;grid-template-columns:auto 1fr auto;gap:8px;margin-top:7px;font-size:12px;color:var(--tdc-muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.sc-axis span:nth-child(2){text-align:center;color:var(--tdc-green);font-weight:600;overflow:hidden;text-overflow:ellipsis}
.sc .plan-ctl{margin-top:14px}
.ctl2{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:14px;color:var(--tdc-muted)}
.ctl2 small{font-size:13px}
.ctl2 input,.sc-f input{min-height:34px;padding:0 10px;border-radius:8px;border:1px solid var(--tdc-line);background:var(--tdc-tile);color:var(--tdc-text);font-size:15px;min-width:0}
.ctl2 input[type=number]{width:86px}
.sc-trip{margin-top:14px;border-radius:12px;background:color-mix(in srgb,var(--primary-text-color,#fff) 5%,var(--surface,var(--ha-card-background,var(--card-background-color,#172536))));
  border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid color-mix(in srgb,var(--tdc-blue) 70%,transparent)}
.sc-trip[data-active]{background:color-mix(in srgb,var(--tdc-blue) 12%,var(--surface,var(--ha-card-background,var(--card-background-color,#172536))))}
.sc-trip-h{display:flex;align-items:center;gap:12px;width:100%;padding:12px 14px}
.sc-trip-h:hover{background:var(--tdc-hover)}
.sc-trip-h>span{display:grid;gap:2px;flex:1;min-width:0}
.sc-trip-h b{font-size:15px;font-weight:600}
.sc-trip-h small{font-size:13px;color:var(--tdc-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sc-chev{transition:transform .2s}
.sc-trip-h[aria-expanded=true] .sc-chev{transform:rotate(180deg)}
.sc-trip-b{display:grid;gap:12px;padding:2px 14px 14px}
.sc-f{display:grid;gap:5px;font-size:13px;color:var(--tdc-muted)}
.sc-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;min-width:0}
.chip{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:0 12px;border-radius:999px;border:1px solid var(--tdc-line);font-size:14px;font-weight:600}
.chip ha-icon{--mdc-icon-size:18px}
.chip[aria-pressed=true]{background:color-mix(in srgb,var(--tdc-blue) 24%,transparent);border-color:color-mix(in srgb,var(--tdc-blue) 65%,transparent)}
.chip[aria-pressed=true] ha-icon{color:var(--tdc-blue)}
.sc-info{flex:1;min-width:0;font-size:13px;color:var(--tdc-text)}
.sc-trip .btn.wide{margin-top:0}
.sc-confirm{margin:0 0 14px}
.sc-phone{margin-top:12px}
.sc-def{border-left-color:color-mix(in srgb,var(--tdc-amber) 70%,transparent)}
.sc-def .sc-defs{margin:0}
.sc-defs button[aria-checked=true]{background:color-mix(in srgb,var(--tdc-amber) 22%,transparent);border-color:color-mix(in srgb,var(--tdc-amber) 65%,transparent)}
.sc-defs button[aria-checked=true] ha-icon{color:var(--tdc-amber)}
.sc-note{margin:0;font-size:13px;line-height:1.4;color:var(--tdc-muted)}
@container panel (max-width:380px){.sc-modes button ha-icon:not(.sc-star){display:none}}
/* narrow panels: the status badge moves below the title instead of cutting it off */
@container panel (max-width:520px){.ph:has(.badge){flex-wrap:wrap;row-gap:8px}.ph:has(.badge) .ph-t{flex:1 1 calc(100% - 52px)}.ph .badge{margin-left:40px}}
/* map */
.map{display:flex;flex-direction:column;padding:0;min-height:340px}
.map .ph{padding:16px 16px 12px 20px;margin:0}
.map .ph-t{flex:0 0 auto}
.map .meta{flex:1 1 auto;justify-content:flex-end}
.map-body{position:relative;flex:1;min-height:240px;background:color-mix(in srgb,var(--tdc-text) 4%,transparent)}
.map-host{position:absolute;inset:0}
.map-host>*{display:block;height:100%;--ha-card-border-radius:0;--ha-card-border-width:0;--ha-card-box-shadow:none}
.map-empty{position:absolute;inset:0;display:grid;place-items:center;padding:24px;text-align:center;font-size:14px;color:var(--tdc-muted)}
.seg{position:absolute;left:12px;bottom:12px;z-index:3;display:flex;gap:2px;padding:4px;border-radius:12px;border:1px solid var(--tdc-line);background:color-mix(in srgb,var(--primary-background-color,#0b0f16) 88%,transparent);color:var(--primary-text-color,#eef2f7)}
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
/* popup layout (layout: charge): status, charging and plan only */
.dash.charge-layout{grid-template-columns:minmax(0,1fr);grid-template-areas:"hero" "charge" "plan" "nav"}
/* no smart charge plan configured: charging takes the plan's place */
.dash.no-plan{grid-template-areas:"hero hero hero hero hero hero hero map map map map map" "charge charge charge charge charge charge charge charge charge tpms tpms tpms" "drive drive drive econ econ econ last last last daily daily daily"}
@container ttd (max-width:1199px){.dash.no-plan{grid-template-areas:"hero hero" "charge charge" "map tpms" "drive econ" "last daily"}}
@container ttd (max-width:699px){.dash.no-plan{grid-template-areas:"hero" "charge" "map" "tpms" "drive" "econ" "last" "daily"}}
.dash.charge-layout.no-plan{grid-template-columns:minmax(0,1fr);grid-template-areas:"hero" "charge" "nav"}
.charge-layout .hero{grid-template-rows:auto minmax(120px,1fr)}
.charge-layout .hero-car img{max-height:200px}
@container panel (min-width:540px){
  .charge-layout .hero-car{grid-area:1/1/3/2;height:auto;padding:30px 0 0 24%}
  .charge-layout .ring-wrap{grid-area:1/2/3/3;align-self:center;--ring:172px;--soc-size:40px}
  .charge-layout .range{font-size:17px;margin-top:4px}
  .charge-layout .ring-t .muted{font-size:12px}
}
.navlink{grid-area:nav;display:flex;align-items:center;justify-content:center;gap:10px;padding:14px 16px;font-size:15px;font-weight:600}
.navlink:hover{background:var(--tdc-hover)}
.icon-btn[aria-pressed=true]{background:color-mix(in srgb,var(--tdc-blue) 22%,transparent);border-color:color-mix(in srgb,var(--tdc-blue) 50%,transparent)}
.icon-btn[aria-pressed=true] ha-icon{color:var(--tdc-text)}
.btn[data-busy]{opacity:.7;cursor:progress}
/* Tiles use the same design as the front page status buttons (custom:ha-home-status-card):
   card surface, shadow and rounded corners on the panels; the stat, KPI, plan, tyre and last-charge
   tiles get an accent edge, the big value first with detail and label below, and a large faint drifting icon. */
.wrap{--tdc-panel:var(--surface,var(--ha-card-background,var(--card-background-color,#172536)));--tdc-radius:15px;
  --tdc-shadow:var(--dashboard-shadow-strong,var(--ha-card-box-shadow,0 8px 22px rgba(0,0,0,.22)));
  --ttd-info:var(--state-info-icon,var(--info-color,#38bdf8));--ttd-ok:var(--state-on-icon,var(--success-color,#20e3a2));
  --ttd-warm:var(--orange,var(--warning-color,#fb923c));--ttd-warn:var(--warning-color,#f59e0b);
  --ttd-err:var(--error-color,#ef4444);--ttd-muted:var(--dashboard-icon-muted,var(--disabled-text-color,#64748b))}
.dash .panel{border-radius:15px;box-shadow:var(--tdc-shadow)}
.dash .kpis.box,.dash .plan-top.box,.dash .plan-mid.box{border:0;border-radius:0;background:none;gap:10px}
.dash .stat,.dash .kpi,.dash .cell,.dash .tire,.dash .lc{--tile-accent:var(--ttd-info);position:relative;isolation:isolate;overflow:hidden;
  display:flex;flex-direction:column;align-items:stretch;justify-content:center;gap:0;min-width:0;padding:10px 12px;text-align:left;
  border:0;border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid color-mix(in srgb,var(--tile-accent) 78%,transparent);border-radius:12px;
  background:color-mix(in srgb,var(--primary-text-color,#fff) 5%,var(--surface,var(--ha-card-background,var(--card-background-color,#172536))));
  box-shadow:0 4px 12px rgba(0,0,0,.14)}
.dash .stat:hover,.dash .kpi:hover,.dash .cell:hover,.dash .tire:hover{background:color-mix(in srgb,var(--primary-text-color,#fff) 9%,var(--surface,var(--ha-card-background,var(--card-background-color,#172536))))}
.dash .stat-t,.dash .cell>span,.dash .lc>span,.dash .lc-i{display:contents}
.dash .stat>ha-icon,.dash .kpi>.tile-i,.dash .cell>ha-icon,.dash .tire>.tile-i,.dash .lc-i ha-icon{display:block;position:absolute;right:-10px;bottom:-10px;z-index:0;
  width:58px;height:58px;--mdc-icon-size:58px;color:var(--tile-accent);opacity:.12;pointer-events:none;animation:ttdTileDrift 5s ease-in-out infinite}
.dash .stat b,.dash .kpi b,.dash .cell b,.dash .tire b,.dash .lc b{order:1;position:relative;z-index:1;font-size:18px;font-weight:750;line-height:21px;
  color:var(--gray800,var(--primary-text-color,#f8fafc));white-space:normal;overflow:visible;text-overflow:clip;overflow-wrap:anywhere}
.dash .cell em,.dash .tire em{order:3;position:relative;z-index:1;margin:0;padding-right:35px;font-size:11px;line-height:14px;white-space:normal;overflow:visible}
.dash .cell em{color:var(--gray600,var(--secondary-text-color,#a7b2c2))}
.dash .tire em{color:var(--tile-accent);font-weight:700}
.dash .stat small,.dash .kpi small,.dash .cell small,.dash .tire small,.dash .lc small{order:4;position:relative;z-index:1;margin:0;padding-right:35px;
  font-size:11px;font-weight:700;line-height:14px;color:var(--gray700,var(--secondary-text-color,#cbd5e1));letter-spacing:0;text-transform:none;white-space:normal;overflow:visible}
.dash .lc-grid{gap:10px}
.dash .hero-stats{gap:10px}
.dash .stat:nth-child(2){--tile-accent:var(--ttd-warm)}
.dash .stat:nth-child(4){--tile-accent:var(--ttd-ok)}
.dash .kpi:nth-child(1){--tile-accent:var(--ttd-warm)}
.dash .kpi:nth-child(2){--tile-accent:var(--ttd-ok)}
.dash .cell:has(>.ic.green){--tile-accent:var(--ttd-ok)}
.dash .cell:has(>.ic.amber){--tile-accent:var(--ttd-warm)}
.dash .cell:has(>.ic.orange){--tile-accent:var(--ttd-warn)}
.dash .tire{--tile-accent:var(--ttd-muted)}
.dash .tire[data-tone=ok]{--tile-accent:var(--ttd-ok)}
.dash .tire[data-tone=info]{--tile-accent:var(--ttd-info)}
.dash .tire[data-tone=warn]{--tile-accent:var(--ttd-warn)}
.dash .tire[data-tone=crit]{--tile-accent:var(--ttd-err)}
.dash .tire small{padding-right:0}
.dash .tpms-body{grid-template-columns:minmax(0,1fr) minmax(44px,68px) minmax(0,1fr)}
@container panel (max-width:360px){.dash .tire{padding:9px}.dash .tire b{font-size:16px;line-height:19px}}
.dash .lc:nth-child(1){--tile-accent:var(--ttd-ok)}
.dash .lc:nth-child(2){--tile-accent:var(--ttd-warm)}
.dash .monta.box{border:0;border-radius:12px;background:color-mix(in srgb,var(--primary-text-color,#fff) 5%,var(--surface,var(--ha-card-background,var(--card-background-color,#172536))));box-shadow:0 4px 12px rgba(0,0,0,.14)}
@keyframes ttdTileDrift{50%{transform:translate(-4px,-3px) scale(1.04) rotate(-4deg);opacity:.22}}
@container ttd (max-width:699px){
  .dash .stat,.dash .kpi,.dash .cell,.dash .tire,.dash .lc{padding:9px}
  .dash .stat b,.dash .kpi b,.dash .cell b,.dash .tire b,.dash .lc b{font-size:16px}
  .dash .stat small,.dash .kpi small,.dash .cell small,.dash .tire small,.dash .lc small,.dash .cell em,.dash .tire em{font-size:10px}
}
@media (max-width:600px){
  .dash .stat,.dash .kpi,.dash .cell,.dash .tire,.dash .lc{padding:9px}
  .dash .stat b,.dash .kpi b,.dash .cell b,.dash .tire b,.dash .lc b{font-size:16px}
  .dash .stat small,.dash .kpi small,.dash .cell small,.dash .tire small,.dash .lc small,.dash .cell em,.dash .tire em{font-size:10px}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important}.dash ha-icon{animation:none!important}}
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
    this.shadowRoot.addEventListener("focusout", (event) => this._commitInput(event.target));
  }

  setConfig(config) {
    if (!config || typeof config !== "object") throw new Error("th-tesla-dashboard-card: ugyldig konfiguration");
    this._cfg = ttdNormalizeConfig(config);
    this._mapHours = this._cfg.map.hours_to_show;
    this._chartRange = this._cfg.chart.range;
    this._mapStyle = this._cfg.map.style;
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
    // Layout cards may move the element (disconnect + connect); forget cleared timers so they restart.
    clearTimeout(this._styleTimer);
    this._styleTimer = null;
    clearTimeout(this._pendingTimer);
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
    if (this._map && !this._satMap && !this._styleTimer && Date.now() - (this._styleGaveUp || 0) > 30000) this._applyMapStyle(0);
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
    this._refresh(false);
  }

  /** Ask cloud-polled integrations for fresh data (at most once a minute across all card instances). */
  _refresh(force) {
    const ids = this._cfg.refresh.filter((id) => this._hass?.states?.[id]);
    if (!ids.length || (!force && Date.now() - ttdLastRefresh < TTD_REFRESH_MS)) return;
    ttdLastRefresh = Date.now();
    this._hass.callService("homeassistant", "update_entity", { entity_id: ids }).catch(() => {});
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
    const fallback = { target_soc: "target_soc", deadline: "ready_by_time" }[key];
    const id = this._cfg.controls[key]?.entity || (fallback && this._scIds()[fallback]);
    const stateObj = id ? this._hass?.states?.[id] : undefined;
    return stateObj && stateObj.state !== "unavailable" ? { id, stateObj, domain: id.split(".")[0] } : null;
  }

  _targetEntity() {
    return this._cfg.controls.target_soc?.entity || this._id("target_soc") || this._scIds().target_soc || null;
  }

  _deadlineEntity() {
    return this._cfg.controls.deadline?.entity || this._id("deadline") || this._scIds().ready_by_time || null;
  }

  /** Entity ids of the EV Smart Charge car the card follows, by role (translation key). */
  _scIds() {
    const anchor = this._cfg?.smart_charge;
    if (!anchor) return {};
    const registry = this._hass?.entities;
    if (this._scMap && this._scMapSrc === registry) return this._scMap;
    const map = {};
    const own = registry?.[anchor];
    if (own?.device_id) {
      for (const entry of Object.values(registry)) {
        if (entry.device_id === own.device_id && entry.platform === own.platform && TTD_SC_ROLES[entry.translation_key]) map[entry.translation_key] = entry.entity_id;
      }
    }
    if (!Object.keys(map).length) {
      // No entity registry (or an older frontend): derive the siblings from the English entity id suffixes.
      const object = anchor.split(".")[1] || "";
      const suffix = Object.values(TTD_SC_ROLES).map((pattern) => pattern.split("._")[1]).find((end) => object.endsWith(`_${end}`));
      const prefix = suffix ? object.slice(0, -suffix.length - 1) : object;
      for (const [role, pattern] of Object.entries(TTD_SC_ROLES)) {
        const [domain, end] = pattern.split("._");
        map[role] = `${domain}.${prefix}_${end}`;
      }
    }
    this._scMap = map;
    this._scMapSrc = registry;
    return map;
  }

  _sc(role) {
    const id = this._scIds()[role];
    return id ? this._hass?.states?.[id] : undefined;
  }

  _scNum(role) {
    const stateObj = this._sc(role);
    return ttdHasValue(stateObj) ? ttdToNumber(stateObj.state) : null;
  }

  _scCall(role, domain, service, data = {}) {
    const id = this._scIds()[role];
    if (id && this._hass?.states?.[id]) this._call(domain, service, { entity_id: id, ...data });
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
      sc: this._cfg.smart_charge ? this._scModel(f) : null,
      vehicle: this._vehicleModel(),
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
    // Any plug signal wins (Zaptec/Tesla often know seconds to minutes before Monta's cloud poll).
    const cableText = status.plugged || cable === true || plug === true ? "Kabel tilsluttet"
      : cable === false || plug === false ? "Kabel ikke tilsluttet" : null;
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
    // Without own start/stop controls the buttons switch the EV Smart Charge plan: "Lad nu", or "Pause".
    const scMode = this._cfg.smart_charge && ttdHasValue(this._sc("charge_mode")) ? this._sc("charge_mode") : null;
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
      monta: montaLabel ?? (mode ? TTD_TEXT.mode[mode] ?? ttdHumanize(mode) : TTD_DASH),
      montaTone: montaKey ? TTD_MONTA_TONES[montaKey] || "muted" : { connected_charging: "ok", connected_requesting: "info", connected_finished: "info" }[mode] || "muted",
      modeBoxVisible: montaConfigured || !!this._modeOptions(),
      mode: mode ? TTD_TEXT.mode[mode] ?? ttdHumanize(mode) : this._id("charger_mode") ? TTD_TEXT.unavailable : TTD_DASH,
      // Offered on the fastest plug signal (Zaptec/Tesla/Monta) instead of waiting for a single, possibly stale, source.
      startVisible: (!!start || !!scMode) && status.plugged && !status.charging,
      stopVisible: (!!stop && (status.charging || scheduled)) || (!stop && !!scMode && status.charging),
      startBusy: this._busy("start_charge", start),
      stopBusy: this._busy("stop_charge", stop),
      modeOptions: this._modeOptions(),
      estimate: estimateText,
      compare: this._compareModel(f),
    };
  }

  /** Price of charging now, cheapest and in the fixed window, from EV Smart Charge (empty without it). */
  _compareModel(f) {
    if (!this._cfg.smart_charge) return null;
    const costObj = this._sc("planned_cost");
    const alternatives = costObj?.attributes?.alternatives;
    if (!alternatives || typeof alternatives !== "object") return null;
    const unit = ttdUnit(costObj.attributes.unit_of_measurement ?? "kr.");
    const mode = this._sc("charge_mode")?.state;
    const now = ttdToNumber(alternatives.now?.cost);
    const clock = (role) => (ttdIsClock(this._sc(role)?.state) ? ttdClock(this._sc(role).state) : null);
    const items = [["now", "Lad nu"], ["smart", "Billigst"], ["fixed", "Fast tid"]].map(([key, name]) => {
      let label = name;
      const plan = alternatives[key] || {};
      const cost = ttdToNumber(plan.cost);
      const start = ttdToDate(plan.start);
      const end = ttdToDate(plan.end);
      const detail = start && end ? `${start.getTime() <= Date.now() + 60000 ? "nu" : f.time(start)}–${f.time(end)}${ttdToNumber(plan.blocks) > 1 ? " (delt)" : ""}` : "Intet at lade";
      if (key === "fixed" && clock("fixed_start") && clock("fixed_end")) label = `${label} ${clock("fixed_start")}–${clock("fixed_end")}`;
      const saving = key !== "now" && cost != null && now != null && now - cost >= 0.5 ? `spar ${ttdJoin(f.number(now - cost, 2), unit)}` : "";
      return { key, label, price: cost == null ? TTD_DASH : ttdJoin(f.number(cost, 2), unit), detail, saving, active: key === mode, estimated: !!plan.estimated };
    });
    return items.some((item) => item.price !== TTD_DASH) ? items : null;
  }

  /** A control is busy while its script runs, or for a few seconds after a direct command. */
  _busy(name, control) {
    if (control?.domain === "script" && control.stateObj.state === "on") return true;
    return this._pending?.name === name && Date.now() < this._pending.until;
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

  /** Name and artwork: configured, or the model EV Smart Charge recognised for this car. */
  _vehicleModel() {
    const attrs = this._sc("charge_status")?.attributes || {};
    const name = this._cfg.model || (attrs.vehicle_name ? `Tesla ${attrs.vehicle_name}` : "Tesla");
    const body = this._cfg.body || (TTD_BODIES[attrs.vehicle_body] ? attrs.vehicle_body : "model_3");
    return { name, body, paint: this._cfg.paint, image: this._cfg.image };
  }

  _scModel(f) {
    const status = this._sc("charge_status");
    const statusKey = ttdHasValue(status) ? status.state : null;
    const [label, tone] = TTD_SC_STATUS[statusKey] || [statusKey ? ttdHumanize(statusKey) : TTD_TEXT.unavailable, "muted"];
    const modeObj = this._sc("charge_mode");
    const mode = ttdHasValue(modeObj) ? modeObj.state : null;
    const plan = this._sc("next_charge_start")?.attributes || {};
    const now = Date.now();
    const blocks = (Array.isArray(plan.blocks) ? plan.blocks : [])
      .map((block) => ({ start: ttdToDate(block.start), end: ttdToDate(block.end), estimated: !!block.estimated }))
      .filter((block) => block.start && block.end && block.end.getTime() > now);
    const deadline = ttdToDate(plan.deadline);
    const trip = ttdToDate(this._sc("trip_departure")?.state);
    const target = this._scNum("plan_target_soc");
    // Timeline from now to the latest of the deadline, the trip and the plan (at least an hour, at most two days).
    const until = Math.min(now + 48 * 3600000, Math.max(now + 3600000, deadline?.getTime() || 0, trip?.getTime() || 0, ...blocks.map((block) => block.end.getTime())));
    const at = (date) => ttdClamp(((date.getTime() - now) / (until - now)) * 100, 0, 100);
    const segments = blocks.filter((block) => block.start.getTime() < until).map((block) => {
      const left = at(new Date(Math.max(block.start.getTime(), now)));
      return { left, width: Math.max(at(block.end) - left, 0.6), estimated: block.estimated, title: `${f.time(block.start)}–${f.time(block.end)}` };
    });
    const marks = [deadline && deadline.getTime() <= until ? { left: at(deadline), kind: "deadline" } : null, trip && trip.getTime() <= until ? { left: at(trip), kind: "trip" } : null].filter(Boolean);
    const next = blocks[0];
    const cost = this._scNum("planned_cost");
    const energy = this._scNum("planned_energy");
    const costUnit = ttdUnit(this._sc("planned_cost")?.attributes?.unit_of_measurement ?? "kr.");
    const sub = [];
    if (mode === "now") sub.push("Lader nu til bilens egen grænse");
    else if (mode === "off") sub.push("Laderen holdes på pause");
    else if (mode === "manual") sub.push("Laderen styres ikke");
    else if (deadline) sub.push(`Klar ${f.dayTime(trip && trip < deadline ? trip : deadline)}`);
    if (target != null && mode !== "now" && mode !== "off") sub.push(`mål ${f.number(target, 0)} %`);
    const time = (role) => {
      const raw = this._sc(role)?.state;
      return ttdIsClock(raw) ? ttdClock(raw) : "";
    };
    const capObj = this._sc("price_cap");
    const distanceObj = this._sc("trip_distance");
    const distance = ttdHasValue(distanceObj) ? ttdToNumber(distanceObj.state) : null;
    const dAttrs = distanceObj?.attributes || {};
    const need = this._scNum("trip_target_soc");
    const tripEnergy = this._scNum("trip_energy");
    const destination = ttdHasValue(this._sc("trip_destination")) ? String(this._sc("trip_destination").state) : "";
    const roundTrip = this._sc("trip_round_trip")?.state === "on";
    let tripInfo = "";
    if (dAttrs.looking_up) tripInfo = "Finder ruten …";
    else if (dAttrs.error === "not_found") tripInfo = "Adressen blev ikke fundet";
    else if (dAttrs.error) tripInfo = "Ruten kunne ikke hentes, prøver igen";
    else if (distance != null) {
      tripInfo = [`${f.number(distance, 0)} km${roundTrip ? " hver vej" : ""}`, dAttrs.duration_min ? f.duration(dAttrs.duration_min) : null,
        tripEnergy != null ? `${f.number(tripEnergy, 1)} kWh` : null, need != null ? `kræver ${f.number(Math.min(need, 100), 0)} %${need > 100 ? " (rækker ikke)" : ""}` : null].filter(Boolean).join(" · ");
    }
    const tripSum = trip ? [destination || "Uden destination", f.dayTime(trip), need != null ? `kræver ${f.number(Math.min(need, 100), 0)} %` : null].filter(Boolean).join(" · ")
      : "Afgang på et andet tidspunkt eller en længere tur";
    return {
      badge: { text: label, tone }, sub: sub.join(" · ") || TTD_DASH,
      mode, modes: Array.isArray(modeObj?.attributes?.options) ? modeObj.attributes.options.map(String) : TTD_SC_MODES.map(([key]) => key),
      segments, marks, axisRight: f.dayTime(new Date(until)), axisMid: next ? `${f.time(next.start)}–${f.time(next.end)}` : "",
      start: next ? (next.start.getTime() <= now ? "Nu" : f.time(next.start)) : TTD_DASH,
      startDay: next && next.start.getTime() > now ? f.relativeDay(next.start) : "",
      end: next ? f.time(blocks[blocks.length - 1].end) : TTD_DASH,
      endDay: next ? f.relativeDay(blocks[blocks.length - 1].end) : "",
      cost: cost == null ? TTD_DASH : ttdJoin(f.number(cost, 2), costUnit),
      kwh: energy != null && energy > 0 ? `${f.number(energy, 1)} kWh${blocks.some((block) => block.estimated) ? " · delvist skønnet pris" : ""}` : "",
      fixed: mode === "fixed" ? { start: time("fixed_start"), end: time("fixed_end") } : null,
      cap: mode === "price_cap" ? { value: ttdHasValue(capObj) ? String(ttdToNumber(capObj.state)) : "", unit: ttdUnit(capObj?.attributes?.unit_of_measurement ?? ""), min: this._scNum("min_soc") } : null,
      trip: { active: !!trip, departure: trip, summary: tripSum, info: tripInfo, destination, roundTrip },
      awaiting: statusKey === "awaiting_confirmation",
      confirmLabel: `Bekræft ${ttdScLabel(mode).toLowerCase()}`,
      def: (() => {
        const obj = this._sc("default_charge_mode");
        if (!ttdHasValue(obj)) return null;
        const value = obj.state;
        const label = ttdScLabel(value);
        let summary = label;
        if (mode === "manual" && value !== "manual") summary = `${label} · Manuel er valgt, indtil du skifter`;
        else if (mode && mode !== value) summary = `${label} · går tilbage hertil efter ${ttdScLabel(mode)}`;
        const options = Array.isArray(obj.attributes?.options) ? obj.attributes.options.map(String) : TTD_SC_DEFAULTS;
        return { mode: value, label, summary, options };
      })(),
      phone: (() => {
        const sw = this._sc("confirm_on_phone");
        if (!sw || sw.state === "unavailable") return null;
        const phones = Array.isArray(sw.attributes?.phones) ? sw.attributes.phones.length : 0;
        const info = this._sc("notify_plan");
        return {
          on: sw.state === "on", phones,
          info: phones ? `${phones} ${phones === 1 ? "mobil" : "mobiler"}` : "Vælg mobiler under Konfigurer",
          notify: info && info.state !== "unavailable" ? info.state === "on" : null,
          send: !!phones && !!this._sc("send_plan") && this._sc("send_plan").state !== "unavailable",
        };
      })(),
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
    // EV Ledger's session counts as soon as it has started, also while its price is still unknown.
    const useLedger = ttdHasValue(ledger) || !!ttdToDate(ledger?.attributes?.started_at);
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
      cfg.location, cfg.chart.distance_entity, cfg.chart.energy_entity, ...Object.values(this._scIds()),
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
    img.src = cfg.image || ttdCarArt(cfg.body || "model_3", cfg.paint);
    if (!cfg.image) img.dataset.art = `${cfg.body || "model_3"}|${cfg.paint}`;
    const chart = this._r.chart;
    if (chart) {
      this._r.rangeSelect.value = this._chartRange;
      chart.addEventListener("pointermove", (event) => this._onChartPointer(event));
      chart.addEventListener("pointerleave", () => this._showTip(-1));
      chart.addEventListener("blur", () => this._showTip(-1));
    }
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
    this._hide("modeBox", !c.modeBoxVisible);
    this._renderModeSelect(c.modeOptions);
    this._hide("startBtn", !c.startVisible);
    this._hide("stopBtn", !c.stopVisible);
    this._t("startBtn", c.startBusy ? "Starter …" : this._armed === "start_charge" ? "Bekræft: lad nu" : "Lad nu");
    this._t("stopBtn", c.stopBusy ? "Stopper …" : this._armed === "stop_charge" ? "Bekræft: stop" : "Stop");
    this._attrSet("startBtn", "data-busy", c.startBusy);
    this._attrSet("stopBtn", "data-busy", c.stopBusy);
    this._attrSet("startBtn", "aria-busy", c.startBusy ? "true" : null);
    this._attrSet("stopBtn", "aria-busy", c.stopBusy ? "true" : null);
    this._attrSet("startBtn", "data-armed", this._armed === "start_charge");
    this._attrSet("stopBtn", "data-armed", this._armed === "stop_charge");
    this._hide("estimate", !c.estimate || !!c.compare);
    this._t("estimate", c.estimate || "");
    this._hide("cmp", !c.compare);
    if (c.compare) {
      const signature = JSON.stringify([c.compare, this._armed]);
      if (r.cmp.dataset.sig !== signature) {
        r.cmp.dataset.sig = signature;
        r.cmp.innerHTML = c.compare.map((item) => `<button type="button" role="radio" class="cmp-i" data-scmode="${item.key}" aria-checked="${item.active}"${this._armed === `mode:${item.key}` ? " data-armed" : ""}><small>${ttdEsc(this._armed === `mode:${item.key}` ? "Tryk igen for at vælge" : item.label)}</small><b>${ttdEsc(item.price)}${item.estimated ? "*" : ""}</b><span>${ttdEsc(item.detail)}</span>${item.saving ? `<em>${ttdEsc(item.saving)}</em>` : ""}</button>`).join("");
      }
    }
    // vehicle
    const v = m.vehicle;
    this._t("model", v.name);
    if (!v.image) {
      const art = `${v.body}|${v.paint}`;
      if (r.carImg.dataset.art !== art) {
        r.carImg.dataset.art = art;
        r.carImg.src = ttdCarArt(v.body, v.paint);
      }
    }
    if (m.sc) this._applySmart(m.sc);
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
    this._hide("planCtl", !m.sc && !p.soc && !dl.editable);
    // tpms
    for (const key of ["FL", "FR", "RL", "RR"]) {
      const tire = m.tpms.tires[key];
      this._attrSet(`t${key}`, "data-tone", tire.tone);
      this._attrSet(`w${key}`, "data-tone", tire.tone);
      this._t(`t${key}V`, tire.text);
      this._t(`t${key}S`, tire.tone === "ok" ? "" : tire.status);
      if (r[`t${key}`]) this._attrSet(`t${key}`, "aria-label", `${r[`t${key}`].querySelector("small").textContent}: ${tire.text}${tire.status ? `, ${tire.status}` : ""}`);
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
    if (r.effScore) this._attrSet(r.effScore.parentElement, "data-tone", e.effTone);
    this._t("monthly", e.monthly);
    this._attrSet("monthlyBox", "data-tone", e.monthlyTone);
    if (r.monthlyBox) this._attrSet(r.monthlyBox.querySelector(".trend"), "icon", e.monthlyIcon);
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
    this._attrSet("styleBtn", "aria-pressed", String(this._mapStyle === "satellite"));
    // Tiles whose entity is missing stay visible (layout) but stop acting like buttons.
    for (const el of this._moreEls) this._attrSet(el, "data-dead", !this._hass.states[this._moreId(el.dataset.more)]);
  }

  _applySmart(sc) {
    const r = this._r;
    this._attrSet("scBadge", "data-tone", sc.badge.tone);
    this._t("scBadgeText", sc.badge.text);
    this._t("scSub", sc.sub);
    for (const button of this.shadowRoot.querySelectorAll(".sc-modes [data-scmode]")) {
      const armed = this._armed === `mode:${button.dataset.scmode}`;
      this._attrSet(button, "aria-checked", String(button.dataset.scmode === sc.mode));
      this._attrSet(button, "data-armed", armed);
      button.hidden = !sc.modes.includes(button.dataset.scmode);
      const label = button.querySelector("span");
      const text = armed ? "Bekræft" : TTD_SC_MODES.find(([key]) => key === button.dataset.scmode)?.[1] || "";
      if (label && label.textContent !== text) label.textContent = text;
      const isDefault = sc.def?.mode === button.dataset.scmode;
      this._attrSet(button, "data-default", isDefault);
      this._attrSet(button, "title", isDefault ? "Standardplan" : null);
    }
    this._hide("scDef", !sc.def);
    if (sc.def) {
      this._t("scDefSum", sc.def.summary);
      this._attrSet("scDefHead", "aria-expanded", String(!!this._defOpen));
      this._hide("scDefBody", !this._defOpen);
      for (const button of this.shadowRoot.querySelectorAll(".sc-defs [data-scdefault]")) {
        const key = button.dataset.scdefault;
        const armed = this._armed === `default:${key}`;
        this._attrSet(button, "aria-checked", String(key === sc.def.mode));
        this._attrSet(button, "data-armed", armed);
        button.hidden = !sc.def.options.includes(key);
        const label = button.querySelector("span");
        const text = armed ? "Bekræft" : ttdScLabel(key);
        if (label && label.textContent !== text) label.textContent = text;
      }
    }
    const signature = JSON.stringify([sc.segments, sc.marks]);
    if (r.scTrack && r.scTrack.dataset.sig !== signature) {
      r.scTrack.dataset.sig = signature;
      r.scTrack.replaceChildren(
        ...sc.segments.map((segment) => {
          const el = document.createElement("i");
          el.className = "sc-seg";
          el.title = segment.title;
          el.style.left = `${segment.left}%`;
          el.style.width = `${segment.width}%`;
          if (segment.estimated) el.dataset.est = "";
          return el;
        }),
        ...sc.marks.map((mark) => {
          const el = document.createElement("i");
          el.className = `sc-mark ${mark.kind}`;
          el.style.left = `${mark.left}%`;
          return el;
        }),
      );
    }
    this._t("scAxisM", sc.axisMid);
    this._t("scAxisR", sc.axisRight);
    this._t("scStart", sc.start);
    this._t("scEnd", sc.end);
    this._t("scStartDay", sc.startDay);
    this._t("scEndDay", sc.endDay);
    this._t("scCost", sc.cost);
    this._t("scKwh", sc.kwh);
    const active = this.shadowRoot.activeElement;
    this._hide("scFixed", !sc.fixed);
    if (sc.fixed) {
      if (active !== r.scFixedStart && r.scFixedStart.value !== sc.fixed.start) r.scFixedStart.value = sc.fixed.start;
      if (active !== r.scFixedEnd && r.scFixedEnd.value !== sc.fixed.end) r.scFixedEnd.value = sc.fixed.end;
    }
    this._hide("scCap", !sc.cap);
    if (sc.cap) {
      if (active !== r.scCapInput && r.scCapInput.value !== sc.cap.value) r.scCapInput.value = sc.cap.value;
      this._t("scCapUnit", sc.cap.unit);
      const min = sc.cap.min == null ? "" : String(sc.cap.min);
      if (active !== r.scMinInput && r.scMinInput.value !== min) r.scMinInput.value = min;
    }
    const trip = sc.trip;
    this._t("scTripSum", trip.summary);
    this._attrSet("scTrip", "data-active", trip.active);
    this._attrSet("scTripHead", "aria-expanded", String(!!this._tripOpen));
    this._hide("scTripBody", !this._tripOpen);
    const dep = trip.departure ? ttdLocalInput(trip.departure) : "";
    if (active !== r.scDep && r.scDep.value !== dep) r.scDep.value = dep;
    if (active !== r.scDest && r.scDest.value !== trip.destination) r.scDest.value = trip.destination;
    this._attrSet("scRound", "aria-pressed", String(trip.roundTrip));
    this._t("scTripInfo", trip.info);
    this._hide("scClear", !trip.active && !trip.destination);
    this._hide("scConfirm", !sc.awaiting);
    if (sc.awaiting) this._t("scConfirm", sc.confirmLabel);
    this._hide("scPhone", !sc.phone);
    if (sc.phone) {
      this._attrSet("scPhoneChip", "aria-pressed", String(sc.phone.on));
      this._t("scPhoneInfo", sc.phone.info);
      this._hide("scInfoChip", sc.phone.notify == null);
      this._attrSet("scInfoChip", "aria-pressed", String(!!sc.phone.notify));
      this._hide("scSendChip", !sc.phone.send);
    }
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
        this._applyMapStyle(0);
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
    this._applyMapStyle(0);
    this._queue(true);
  }

  _toggleMapStyle() {
    this._mapStyle = this._mapStyle === "satellite" ? "default" : "satellite";
    this._applyMapStyle(0);
    this._queue(true);
  }

  /**
   * Satellite imagery on top of Home Assistant's own (Leaflet based) map, so markers, route, zoom and
   * more-info keep working. Uses frontend internals defensively: when they are missing, the toggle stays
   * hidden and the normal map is shown.
   */
  _applyMapStyle(attempt) {
    clearTimeout(this._styleTimer);
    this._styleTimer = null;
    try {
      this._applyMapStyleNow(attempt);
    } catch (err) {
      // Leaflet refuses layers until the map has a view; try again shortly.
      this._styleErr = err;
      if (attempt < 30) this._styleTimer = setTimeout(() => this._applyMapStyle(attempt + 1), 1000);
    }
  }

  _applyMapStyleNow(attempt) {
    const haMap = ttdFindDeep(this._map, "ha-map");
    const L = haMap?.Leaflet;
    const map = haMap?.leafletMap;
    if (!L?.tileLayer || !map?.addLayer) {
      // The native map loads lazily; retry for ~30 s, then again after the next state update (see _flush).
      if (this._map && attempt < 30) this._styleTimer = setTimeout(() => this._applyMapStyle(attempt + 1), 1000);
      else this._styleGaveUp = Date.now();
      this._hide("styleBtn", true);
      return;
    }
    this._hide("styleBtn", false);
    if (this._satMap !== map) {
      const options = { maxZoom: 20, maxNativeZoom: 19 };
      const layers = [L.tileLayer(this._cfg.map.satellite_url || TTD_SATELLITE.url, { ...options, attribution: this._cfg.map.satellite_attribution || TTD_SATELLITE.attribution })];
      if (this._cfg.map.satellite_labels !== false && !this._cfg.map.satellite_url) layers.push(L.tileLayer(TTD_SATELLITE.labels, options));
      // Home Assistant's dark mode inverts map tiles with a CSS filter; photos must be shown as they are.
      for (const layer of layers) layer.on("tileload", (event) => event.tile.style.setProperty("filter", "none", "important"));
      this._sat = L.layerGroup(layers);
      this._satLayers = layers;
      this._satMap = map;
      // Home Assistant may (re)create its base layer, e.g. on theme changes; keep it hidden while satellite is chosen.
      map.on("layeradd", () => this._syncBaseLayers(map));
    }
    const satellite = this._mapStyle === "satellite";
    if (satellite && !map.hasLayer(this._sat)) this._sat.addTo(map);
    if (!satellite && map.hasLayer(this._sat)) map.removeLayer(this._sat);
    this._syncBaseLayers(map);
  }

  /** Hides (never removes) Home Assistant's own base map below the satellite layers, so its theme handling keeps working. */
  _syncBaseLayers(map) {
    const pane = map.getPane?.("tilePane");
    if (!pane) return;
    const ours = new Set((this._satLayers || []).map((layer) => layer.getContainer?.()).filter(Boolean));
    const hide = this._mapStyle === "satellite";
    for (const el of pane.children) {
      if (ours.has(el)) continue;
      const value = hide ? "hidden" : "";
      if (el.style.visibility !== value) el.style.visibility = value;
    }
  }

  /* ------------------------------------------------------ chart */

  async _loadStats(range, force) {
    const ids = [this._cfg.chart.distance_entity, this._cfg.chart.energy_entity].filter((id) => id && this._hass?.states?.[id]);
    if (!this._r.chart || !ids.length || typeof this._hass?.callWS !== "function" || this._loading[range]) return;
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
    if (key.startsWith("sc:")) return this._scIds()[key.slice(3)] || null;
    if (key === "location") return this._cfg.location;
    if (key === "target_soc") return this._targetEntity();
    if (key === "deadline") return this._deadlineEntity();
    return this._cfg.entities[key] || this._cfg.controls[key]?.entity || null;
  }

  _onClick(event) {
    const target = event.target?.closest?.("[data-range],[data-action],[data-more],[data-nav],[data-mapstyle],[data-scmode],[data-scdefault],[data-scdef],[data-sctrip],[data-scround],[data-scclear],[data-scconfirm],[data-scphone],[data-scinfo],[data-scsend]");
    if (!target) return;
    if (target.dataset.scmode) this._chooseMode(target.dataset.scmode);
    else if (target.dataset.scdefault) this._chooseDefault(target.dataset.scdefault);
    else if (target.dataset.scdef != null) {
      this._defOpen = !this._defOpen;
      this._queue(true);
    } else if (target.dataset.sctrip != null) {
      this._tripOpen = !this._tripOpen;
      this._queue(true);
    } else if (target.dataset.scround != null) this._scCall("trip_round_trip", "switch", "toggle");
    else if (target.dataset.scclear != null) this._scCall("trip_clear", "button", "press");
    else if (target.dataset.scconfirm != null) this._scCall("confirm_plan", "button", "press");
    else if (target.dataset.scphone != null) this._scCall("confirm_on_phone", "switch", "toggle");
    else if (target.dataset.scinfo != null) this._scCall("notify_plan", "switch", "toggle");
    else if (target.dataset.scsend != null) this._scCall("send_plan", "button", "press");
    else if (target.dataset.nav != null) this._navigate();
    else if (target.dataset.mapstyle != null) this._toggleMapStyle();
    else if (target.dataset.range != null) this._setMapHours(Number(target.dataset.range));
    else if (target.dataset.action) this._action(target.dataset.action);
    else if (target.dataset.more) {
      const entityId = this._moreId(target.dataset.more);
      if (entityId && this._hass?.states?.[entityId]) {
        this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId } }));
      }
    }
  }

  _navigate() {
    const path = this._cfg.navigation_path;
    if (!path) return;
    history.pushState(null, "", path);
    window.dispatchEvent(new CustomEvent("location-changed"));
    // Lets a surrounding popup close itself.
    this.dispatchEvent(new CustomEvent("tesla-popup-close", { bubbles: true, composed: true }));
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
    } else if (el === r.dlInput) {
      clearTimeout(this._dlTimer);
      this._dlTimer = setTimeout(() => this._setDeadline(el.value), 1500);
    }
    else if (el === r.modeSelect) this._setChargerMode(el.value);
    else if ([r.scFixedStart, r.scFixedEnd, r.scCapInput, r.scMinInput, r.scDest, r.scDep].includes(el)) this._deferInput(el);
  }

  /** Time pickers report every step (22 → 23 → 00 …); only the value the user stops at is sent. */
  _deferInput(el) {
    clearTimeout(this._inputTimer);
    this._inputEl = el;
    this._inputTimer = setTimeout(() => this._commitInput(el), 1500);
  }

  _commitInput(el) {
    if (!el || el !== this._inputEl) return;
    clearTimeout(this._inputTimer);
    this._inputEl = null;
    const r = this._r;
    if (el === r.scFixedStart && el.value) this._scCall("fixed_start", "time", "set_value", { time: `${el.value}:00` });
    else if (el === r.scFixedEnd && el.value) this._scCall("fixed_end", "time", "set_value", { time: `${el.value}:00` });
    else if (el === r.scCapInput && el.value !== "" && Number.isFinite(Number(el.value))) this._scCall("price_cap", "number", "set_value", { value: Number(el.value) });
    else if (el === r.scMinInput && el.value !== "" && Number.isFinite(Number(el.value))) this._scCall("min_soc", "number", "set_value", { value: Number(el.value) });
    else if (el === r.scDest) this._scCall("trip_destination", "text", "set_value", { value: el.value.trim() });
    else if (el === r.scDep && el.value) {
      const date = new Date(el.value);
      if (!Number.isNaN(date.getTime())) this._scCall("trip_departure", "datetime", "set_value", { datetime: date.toISOString() });
    }
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
    let control = this._control(name);
    if (!control && (name === "start_charge" || name === "stop_charge") && this._cfg.smart_charge) {
      const id = this._scIds().charge_mode;
      const stateObj = id ? this._hass?.states?.[id] : undefined;
      if (stateObj && stateObj.state !== "unavailable") control = { id, stateObj, domain: "select", option: name === "start_charge" ? "now" : "off" };
    }
    if (!control || this._busy(name, control)) return;
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
    if (domain !== "script") {
      // Direct commands: show progress briefly and fetch the charger's new state instead of waiting for its next poll.
      this._pending = { name, until: Date.now() + TTD_PENDING_MS };
      clearTimeout(this._pendingTimer);
      this._pendingTimer = setTimeout(() => {
        this._refresh(true);
        this._queue(true);
      }, 4000);
      setTimeout(() => this._queue(true), TTD_PENDING_MS + 50);
    }
    if (control.option) this._call("select", "select_option", { entity_id: id, option: control.option });
    else if (domain === "button" || domain === "input_button") this._call(domain, "press", { entity_id: id });
    else if (domain === "switch" || domain === "input_boolean") this._call(domain, name === "stop_charge" ? "turn_off" : "turn_on", { entity_id: id });
    else if (domain === "script" || domain === "scene") this._call(domain, "turn_on", { entity_id: id });
    else if (domain === "automation") this._call(domain, "trigger", { entity_id: id });
  }

  /** Switching plan can start or stop the charger, so it takes a second tap within a few seconds. */
  _chooseMode(mode) {
    if (this._sc("charge_mode")?.state === mode) return;
    const key = `mode:${mode}`;
    if (this._cfg.confirm_mode_change && this._armed !== key) {
      this._disarm(false);
      this._armed = key;
      this._armTimer = setTimeout(() => this._disarm(true), TTD_ARM_MS);
      this._queue(true);
      return;
    }
    this._disarm(true);
    this._scCall("charge_mode", "select", "select_option", { option: mode });
  }

  /** The default plan decides what runs when the cable goes in, so it takes a second tap as well. */
  _chooseDefault(mode) {
    if (this._sc("default_charge_mode")?.state === mode) return;
    const key = `default:${mode}`;
    if (this._cfg.confirm_mode_change && this._armed !== key) {
      this._disarm(false);
      this._armed = key;
      this._armTimer = setTimeout(() => this._disarm(true), TTD_ARM_MS);
      this._queue(true);
      return;
    }
    this._disarm(true);
    this._scCall("default_charge_mode", "select", "select_option", { option: mode });
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

/** A date as the value of an <input type="datetime-local"> in the browser's time zone. */
function ttdLocalInput(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ttdPerKwh(unit) {
  return unit === "kr." || unit === "kr" ? "kr/kWh" : `${unit}/kWh`;
}

/** Finds an element by tag through nested shadow roots (bounded depth; used once per map creation). */
function ttdFindDeep(root, tag, depth = 0) {
  if (!root || depth > 6) return null;
  const scope = root.shadowRoot || root;
  const direct = scope.querySelector?.(tag);
  if (direct) return direct;
  for (const el of scope.querySelectorAll?.("*") || []) {
    if (el.shadowRoot) {
      const found = ttdFindDeep(el, tag, depth + 1);
      if (found) return found;
    }
  }
  return null;
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
