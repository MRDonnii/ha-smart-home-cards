// Config normalisation for th-battery-card (pure functions, no DOM; unit-tested).
import { huaweiDevices, resolveEntities } from "../shared/huawei-solar-entities.js";

// Values for the battery system as a whole, as [device, domain, suffix] of the Huawei Solar integration.
export const TB_SPEC = {
  soc: ["batteries", "sensor", "state_of_capacity"], power: ["batteries", "sensor", "charge_discharge_power"],
  rated: ["batteries", "sensor", "rated_capacity"],
  ch: ["batteries", "sensor", "day_charge"], dis: ["batteries", "sensor", "day_discharge"], totDis: ["batteries", "sensor", "total_discharge"],
  maxCh: ["batteries", "sensor", "maximum_charge_power"], maxDis: ["batteries", "sensor", "maximum_discharge_power"],
  status: ["batteries", "sensor", "status"],
  mode: ["batteries", "select", "working_mode"], eod: ["batteries", "number", "end_of_discharge_soc"], eoc: ["inverter", "number", "end_of_charge_soc"],
  gridCh: ["batteries", "switch", "charge_from_grid"], load: ["emma", "sensor", "load_power"],
};

// The integration names each battery unit "<battery>_<n>" (sensor.<battery>_1_state_of_capacity) and each of its
// modules "<battery>_<n>_pack_<m>". `huawei: { battery: … }` renames the prefix; `huawei: false` drops these values.
export const TB_BATTERY_PREFIX = "battery";
export const TB_PACK_KWH = 5;
const MAX_UNITS = 8;

/** The per-unit prefix ("battery"), or null when per-unit values are switched off. */
export function batteryPrefix(config) {
  const devices = huaweiDevices(config);
  if (!devices) return null;
  return devices.battery === undefined ? TB_BATTERY_PREFIX : devices.battery || null;
}

/** Entity id of one per-unit value (unit i, optionally module j), or null without a prefix. */
export function unitEntity(prefix, i, key, j) {
  if (!prefix) return null;
  return j ? `sensor.${prefix}_${i}_pack_${j}_${key}` : `sensor.${prefix}_${i}_${key}`;
}

/** Number of battery units and modules per unit that report a state of charge (0 when none are found). */
export function detectLayout(states, prefix) {
  if (!states || !prefix) return { batteries: 0, packs: 0 };
  let batteries = 0;
  while (batteries < MAX_UNITS && states[unitEntity(prefix, batteries + 1, "state_of_capacity")]) batteries += 1;
  let packs = 0;
  for (let i = 1; i <= Math.max(1, batteries); i += 1) {
    let n = 0;
    while (n < MAX_UNITS && states[unitEntity(prefix, i, "state_of_capacity", n + 1)]) n += 1;
    packs = Math.max(packs, n);
  }
  return { batteries, packs };
}

const count = (value) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_UNITS) : 0;
};

/**
 * Normalised settings. `batteries` / `packs` come from config, else from the units found in `states`, else 1.
 * `pack_kwh` (default 5) is only used when the rated capacity sensor is missing.
 */
export function batterySettings(config, states) {
  const c = config && typeof config === "object" ? config : {};
  const prefix = batteryPrefix(c);
  const found = detectLayout(states, prefix);
  const packKwh = Number(c.pack_kwh);
  return {
    entities: resolveEntities(TB_SPEC, c),
    prefix,
    batteries: count(c.batteries) || found.batteries || 1,
    packs: count(c.packs) || found.packs || 1,
    packKwh: Number.isFinite(packKwh) && packKwh > 0 ? packKwh : TB_PACK_KWH,
    title: c.title || "Batterier",
  };
}
