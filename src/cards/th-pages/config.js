// Config normalisation for the three TH page cards. Pure functions (no hass, no DOM) so they can be unit-tested.
// No household entity has a default: alarm, lock, doors, switches, printers and weather sensors come from the config.
// Defaults exist only for Home Assistant's own integrations (System Monitor, Backup) and the Huawei Solar integration.
import { resolveEntities } from "../shared/huawei-solar-entities.js";

const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const objectPart = (v) => str(v)?.replace(/^[a-z_]+\./, "").replace(/_+$/, "") || null;

/** "entity" or { entity, name, … } → { …, entity, name } (null without an entity). */
export function entityRef(value) {
  if (typeof value === "string") return str(value) ? { entity: value.trim(), name: null } : null;
  if (!value || typeof value !== "object" || !str(value.entity)) return null;
  return { ...value, entity: value.entity.trim(), name: str(value.name) };
}
export const entityList = (value) => (Array.isArray(value) ? value : []).map(entityRef).filter(Boolean);

/** Danish definite form used in "Lås hoveddøren": "Bagdør" → "bagdøren", "Garage" → "garagen". */
export function definiteForm(name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return "";
  return n.endsWith("e") ? `${n}n` : `${n}en`;
}

/** Applies `entities:` overrides ({ key: id | null }) on top of a map of defaults. */
function withOverrides(defaults, overrides) {
  const out = { ...defaults };
  if (overrides && typeof overrides === "object" && !Array.isArray(overrides)) {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null || value === false || value === "") out[key] = null;
      else if (typeof value === "string") out[key] = value.trim();
    }
  }
  return out;
}

/** Ids from [integration prefix, domain, suffix] → "<domain>.<prefix>_<suffix>" (the integration's standard names). */
function standardIds(spec) {
  const out = {};
  for (const [key, [prefix, domain, suffix]] of Object.entries(spec)) out[key] = `${domain}.${prefix}_${suffix}`;
  return out;
}

const alarmRef = (raw) => { const a = entityRef(raw); return a && { entity: a.entity, name: a.name }; };
function lockRef(raw, defaultName = "Hoveddør") {
  const l = entityRef(raw);
  if (!l) return null;
  const name = l.name || defaultName;
  return { entity: l.entity, name, definite: str(l.name_definite) || definiteForm(name) };
}

/** printers: [{ name, prefix }] — prefix of the ink sensors, e.g. "sensor.my_printer_" → sensor.my_printer_black_ink. */
export function printerList(value) {
  return (Array.isArray(value) ? value : []).map((p, i) => {
    const prefix = objectPart(typeof p === "string" ? p : p?.prefix);
    return prefix && { name: str(p?.name) || `Printer ${i + 1}`, prefix: `${prefix}_` };
  }).filter(Boolean);
}

// ---------------------------------------------------------------- weather page

/** Measurement keys and the DMI Vejr integration's entity names after the prefix (used when `prefix` is set). */
export const WEATHER_SUFFIXES = Object.freeze({
  temperature: "temperatur",
  solar_radiation: "solindstraling",
  solar_radiation_hour: "solindstraling_middel_sidste_time",
  sunshine_today: "solskinstimer_i_dag",
  sunshine_month: "solskinstimer_denne_maned",
  precipitation_today: "nedbor_i_dag",
  precipitation_now: "nedbor_lige_nu",
  wind_gust: "vindstod",
  wind_gust_max: "kraftigste_vindstod_i_dag",
  humidity: "luftfugtighed",
  dew_point: "dugpunkt",
  pressure: "lufttryk",
  cloud_cover: "skydaekke",
  visibility: "sigtbarhed",
  ground_temperature: "jordtemperatur",
  water_temperature: "vandtemperatur_havn",
});

export function normalizeWeatherConfig(raw) {
  const c = raw && typeof raw === "object" ? raw : {};
  const px = objectPart(c.prefix);
  const defaults = {};
  for (const [key, suffix] of Object.entries(WEATHER_SUFFIXES)) defaults[key] = px ? `sensor.${px}_${suffix}` : null;
  const image = (key, suffix) => (key in c ? str(c[key]) : px ? `image.${px}_${suffix}` : null);
  return {
    weather: str(c.weather),
    prefix: px ? `sensor.${px}_` : null,
    ent: withOverrides(defaults, c.entities),
    radar: image("radar_image_entity", "radarkort"),
    satellite: image("satellite_image_entity", "satellitkort"),
    source: typeof c.source === "string" ? c.source : px ? "DMI" : "",
    hero: c.hero && typeof c.hero === "object" ? c.hero : {},
  };
}

// ---------------------------------------------------------------- security

export const SECURITY_SPEC = Object.freeze({ pv: ["emma", "sensor", "pv_output_power"] });

export function normalizeSecurityConfig(raw) {
  const c = raw && typeof raw === "object" ? raw : {};
  return {
    alarm: alarmRef(c.alarm),
    lock: lockRef(c.lock),
    doors: entityList(c.doors),
    freezers: entityList(c.freezers).map((f) => ({ entity: f.entity, name: f.name || "Fryseren", max: Number.isFinite(Number(f.max)) && f.max !== null && f.max !== "" ? Number(f.max) : -15 })),
    printers: printerList(c.printers),
    ent: resolveEntities(SECURITY_SPEC, c),
  };
}

// ---------------------------------------------------------------- tech

export const TECH_SPEC = Object.freeze({
  cpu: ["system_monitor", "sensor", "processor_use"],
  memory: ["system_monitor", "sensor", "memory_usage"],
  cpu_temperature: ["system_monitor", "sensor", "processor_temperature"],
  backup_last: ["backup", "sensor", "last_successful_automatic_backup"],
  backup_next: ["backup", "sensor", "next_scheduled_automatic_backup"],
});

export function normalizeTechConfig(raw) {
  const c = raw && typeof raw === "object" ? raw : {};
  return {
    power: entityList(c.power).map((p) => ({ entity: p.entity, name: p.name, icon: str(p.icon) || "plug", warning: typeof p.warning === "string" ? p.warning : "" })),
    relay_platform: c.relay_platform === false || c.relay_platform === null ? null : str(c.relay_platform) || "shelly",
    relays: (Array.isArray(c.relays) ? c.relays : []).map((r) => str(typeof r === "string" ? r : r?.entity)).filter(Boolean),
    printers: printerList(c.printers),
    ent: withOverrides(standardIds(TECH_SPEC), c.entities),
  };
}
