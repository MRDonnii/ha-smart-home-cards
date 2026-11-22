// Config normalisation for th-home-card. Pure functions (no hass, no DOM) so they can be unit-tested.
// Nothing household-specific lives here: every entity comes from the card config, except the Huawei Solar values,
// which default to the integration's standard entity names (see ../shared/huawei-solar-entities.js).
import { resolveEntities } from "../shared/huawei-solar-entities.js";

/** Single values read by the solar tile. Huawei values are [device, domain, suffix]; null = no default. */
export const ENTITY_SPEC = Object.freeze({
  pv: ["emma", "sensor", "pv_output_power"],
  load: ["emma", "sensor", "load_power"],
  inverter_power: ["emma", "sensor", "inverter_active_power"],
  battery_power: ["batteries", "sensor", "charge_discharge_power"],
  battery_soc: ["batteries", "sensor", "state_of_capacity"],
  pv_today: ["emma", "sensor", "pv_yield_today"],
  feed_in_today: ["emma", "sensor", "feed_in_to_grid_today"],
  sunshine_hours: null,
});

// The Strømligning integration's standard entity names, as [domain, suffix] after "<prefix>_".
const STROMLIGNING = Object.freeze({
  current: ["sensor", "current_price_vat"],
  mean: ["sensor", "today_mean_vat"],
  tomorrow: ["binary_sensor", "tomorrow_available_vat"],
  forecast: ["sensor", "forecasts_vat"],
});
const STROMLIGNING_PARTS = Object.freeze([
  ["Spotpris", "spotprice_vat", "#e8c37e"], ["Nettarif", "distribution_vat", "#8ed1ff"], ["Systemtarif", "systemtariff_vat", "#b7a4ff"],
  ["Transport", "nettariff_vat", "#7fb0ff"], ["Tillæg", "surcharge_vat", "#ff9e7a"], ["Elafgift", "electricity_tax_vat", "#6be3a8"],
]);
export const PART_COLORS = Object.freeze(["#e8c37e", "#8ed1ff", "#b7a4ff", "#7fb0ff", "#ff9e7a", "#6be3a8"]);

export const DEFAULTS = Object.freeze({
  energy: "/energy",
  lock_name: "Hoveddør",
  freezer_name: "Fryser",
  freezer_max: -15,
  room_icon: "home",
});

const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const objectId = (v) => str(v)?.replace(/^[a-z_]+\./, "").replace(/_+$/, "") || null;

/** "entity" or { entity, name, … } → { entity, name, …rest } (null when there is no entity). */
export function entityRef(value, extra = {}) {
  if (typeof value === "string") return str(value) ? { entity: value.trim(), name: null, ...extra } : null;
  if (!value || typeof value !== "object" || !str(value.entity)) return null;
  return { ...extra, ...value, entity: value.entity.trim(), name: str(value.name) };
}

/** A list of entities with names: ["light.a", { entity: "light.b", name: "B" }] → [{ entity, name }]. */
export function entityList(value, extra = {}) {
  return (Array.isArray(value) ? value : []).map((v) => entityRef(v, extra)).filter(Boolean);
}

/** Danish definite form used in "Lås hoveddøren": "Bagdør" → "bagdøren", "Garage" → "garagen". */
export function definiteForm(name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return "";
  return n.endsWith("e") ? `${n}n` : `${n}en`;
}

/**
 * price: false | "sensor.current_price" | {
 *   stromligning: "stromligning" | true,   // the integration's entity prefix; fills the ids below
 *   title, current, mean, tomorrow, forecast, fallback, components: [{ name, entity, color }] }
 * Returns null when no price entity is configured (the price tile is then hidden).
 */
export function normalizePrice(raw) {
  if (!raw) return null;
  if (typeof raw === "string") raw = { current: raw };
  if (typeof raw !== "object") return null;
  const prefix = raw.stromligning === true ? "stromligning" : objectId(raw.stromligning);
  const out = { title: prefix ? "Strømligning" : "", current: null, mean: null, tomorrow: null, forecast: null, fallback: null, components: [] };
  if (prefix) {
    for (const [key, [domain, suffix]] of Object.entries(STROMLIGNING)) out[key] = `${domain}.${prefix}_${suffix}`;
    out.components = STROMLIGNING_PARTS.map(([name, suffix, color]) => ({ name, entity: `sensor.${prefix}_${suffix}`, color }));
  }
  for (const key of ["current", "mean", "tomorrow", "forecast", "fallback"]) {
    if (key in raw) out[key] = str(raw[key]);
  }
  if (typeof raw.title === "string") out.title = raw.title;
  if (Array.isArray(raw.components)) {
    out.components = raw.components.map((c, i) => {
      const ref = entityRef(c);
      return ref && { name: ref.name || "", entity: ref.entity, color: str(c?.color) || PART_COLORS[i % PART_COLORS.length] };
    }).filter(Boolean);
  }
  return out.current || out.fallback ? out : null;
}

/** One room: { id, name, icon, temperature, humidity, door, media_player, outdoor, lights: [...] }. */
export function normalizeRoom(raw, index) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    id: str(r.id === undefined || r.id === null ? null : String(r.id)) || `r${index}`,
    name: str(r.name) || `Rum ${index + 1}`,
    icon: str(r.icon) || DEFAULTS.room_icon,
    temp: str(r.temperature),
    hum: str(r.humidity),
    door: str(r.door),
    tv: str(r.media_player),
    out: !!r.outdoor,
    lights: entityList(r.lights),
  };
}

/** The full card config with defaults applied. Never throws. */
export function normalizeConfig(raw) {
  const c = raw && typeof raw === "object" ? raw : {};
  const ent = resolveEntities(ENTITY_SPEC, c);
  const alarm = entityRef(c.alarm);
  const lockRef = entityRef(c.lock);
  const lock = lockRef && {
    entity: lockRef.entity,
    name: lockRef.name || DEFAULTS.lock_name,
    definite: str(lockRef.name_definite) || definiteForm(lockRef.name || DEFAULTS.lock_name),
  };
  const climateRaw = typeof c.climate === "string" ? { entity: c.climate } : c.climate && typeof c.climate === "object" ? c.climate : {};
  const climate = {
    entity: str(climateRaw.entity),
    label: typeof climateRaw.label === "string" ? climateRaw.label : "",
    sensors: entityList(climateRaw.sensors),
  };
  const fz = entityRef(c.freezer);
  const freezer = fz && { entity: fz.entity, name: fz.name || DEFAULTS.freezer_name, max: Number.isFinite(Number(fz.max)) && fz.max !== null && fz.max !== "" ? Number(fz.max) : DEFAULTS.freezer_max };
  const rooms = (Array.isArray(c.rooms) ? c.rooms : []).map(normalizeRoom);
  let temps = entityList(c.temperatures).map((t) => ({ entity: t.entity, name: t.name, kind: t.kind === "freezer" ? "freezer" : "in" }));
  if (!Array.isArray(c.temperatures)) {
    // Not configured: every room's temperature, then the freezer.
    temps = rooms.filter((r) => r.temp).map((r) => ({ entity: r.temp, name: r.name, kind: "in" }));
    if (freezer) temps.push({ entity: freezer.entity, name: freezer.name, kind: "freezer" });
  }
  const latitude = Number(c.latitude);
  return {
    energy: c.energy === false || c.energy === null ? null : str(c.energy) || DEFAULTS.energy,
    // Latitude for the height of the sun arc; null = Home Assistant's home location (hass.config.latitude).
    latitude: c.latitude !== undefined && c.latitude !== null && c.latitude !== "" && Number.isFinite(latitude) && Math.abs(latitude) <= 90 ? latitude : null,
    ent,
    price: normalizePrice(c.price),
    alarm,
    lock,
    doors: entityList(c.doors),
    climate,
    freezer,
    rooms,
    temps,
  };
}

/** A generic example for the card picker. */
export function stubConfig() {
  return {
    alarm: "alarm_control_panel.home_alarm",
    lock: { entity: "lock.front_door", name: "Hoveddør" },
    doors: [{ entity: "binary_sensor.front_door", name: "Hoveddør" }],
    climate: { entity: "sensor.living_room_temperature", label: "i stuen", sensors: [{ entity: "sensor.outdoor_temperature", name: "Udenfor" }] },
    rooms: [
      { name: "Stue", icon: "sofa", temperature: "sensor.living_room_temperature", lights: [{ entity: "light.living_room", name: "Loftlampe" }] },
      { name: "Have", icon: "tree", outdoor: true, lights: [{ entity: "light.garden", name: "Have" }] },
    ],
  };
}
