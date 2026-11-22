// Config normalisation for th-energy-card (pure functions, no DOM; unit-tested).
import { resolveEntities } from "../shared/huawei-solar-entities.js";
import { TF_SCALE_DEFAULTS, positive } from "../th-energy-flow-card/config.js";
import { batteryPrefix, detectLayout, TB_PACK_KWH } from "../th-battery-card/config.js";

// Every value the page reads. Huawei Solar values are [device, domain, suffix] (see shared/huawei-solar-entities.js).
// null = not from the Huawei Solar integration (prices, weather, the plant's month/year totals …): no default, the card
// hides the value or shows "–" until it is configured under `entities`.
export const ENERGY_SPEC = {
  pv: ["emma", "sensor", "pv_output_power"], load: ["emma", "sensor", "load_power"], inv: ["emma", "sensor", "inverter_active_power"],
  bat: ["batteries", "sensor", "charge_discharge_power"], soc: ["batteries", "sensor", "state_of_capacity"],
  pvDay: ["emma", "sensor", "pv_yield_today"], cons: ["emma", "sensor", "consumption_today"],
  imp: ["emma", "sensor", "supply_from_grid_today"], exp: ["emma", "sensor", "feed_in_to_grid_today"],
  ch: ["batteries", "sensor", "day_charge"], dis: ["batteries", "sensor", "day_discharge"],
  hourY: ["inverter", "sensor", "hourly_yield"], peak: ["inverter", "sensor", "day_active_power_peak"],
  pv1v: ["inverter", "sensor", "pv_1_voltage"], pv1a: ["inverter", "sensor", "pv_1_current"],
  pv2v: ["inverter", "sensor", "pv_2_voltage"], pv2a: ["inverter", "sensor", "pv_2_current"],
  invStatus: ["inverter", "sensor", "device_status"], invState: ["inverter", "sensor", "inverter_state"],
  alarms: ["inverter", "sensor", "alarms"], eff: ["inverter", "sensor", "efficiency"],
  invSwitch: ["inverter", "switch", ""], derate: ["inverter", "number", "power_derating"],
  mode: ["batteries", "select", "working_mode"], ess: ["emma", "select", "ess_control_mode"],
  tou: ["batteries", "select", "excess_pv_energy_use_in_tou"],
  batStatus: ["batteries", "sensor", "status"], forc: ["batteries", "sensor", "forcible_charge"],
  stopForc: ["batteries", "button", "stop_forcible_charge"],
  gridCh: ["batteries", "switch", "charge_from_grid"], eod: ["batteries", "number", "end_of_discharge_soc"],
  eoc: ["inverter", "number", "end_of_charge_soc"],
  gridCut: ["inverter", "number", "grid_charge_cutoff_soc"], gridChMax: ["inverter", "number", "grid_charge_maximum_power"],
  maxCh: ["inverter", "number", "maximum_charging_power"], maxDis: ["inverter", "number", "maximum_discharging_power"],
  maxFeed: null,
  batTotCh: ["batteries", "sensor", "total_charge"], batTotDis: ["batteries", "sensor", "total_discharge"],
  rated: ["batteries", "sensor", "rated_capacity"],
  evTot: ["charger", "sensor", "charger_total_charged_energy"], evTemp: ["charger", "sensor", "charger_temperature"],
  pvTot: ["emma", "sensor", "total_pv_energy_yield"], expTot: ["emma", "sensor", "total_feed_in_to_grid"],
  impTot: ["emma", "sensor", "total_supply_from_grid"],
  month: null, year: null,
  price: null, priceNow: null, spotNow: null, priceMean: null, co2: null,
  sun: "sun.sun",
  temp: null, cloud: null, wind: null, rad: null,
};

export const ENERGY_DEFAULTS = Object.freeze({
  ...TF_SCALE_DEFAULTS,
  inverter_model: "SUN2000",
  charger_model: "Huawei SCharger",
});

const text = (value) => (typeof value === "string" && value.trim() ? value.trim() : null);
const entityId = (value, domain) => {
  const id = text(value);
  return id && (!domain || id.startsWith(`${domain}.`)) ? id : null;
};

/** Normalised settings of the page. */
export function energySettings(config) {
  const c = config && typeof config === "object" ? config : {};
  const inverterW = positive(c.inverter_w, ENERGY_DEFAULTS.inverter_w);
  const panels = Math.round(Number(c.panels));
  const lat = Number(c.latitude);
  const batteryKwh = Number(c.battery_kwh);
  const packKwh = Number(c.pack_kwh);
  return {
    entities: resolveEntities(ENERGY_SPEC, c),
    name: text(c.name),
    panels: Number.isFinite(panels) && panels > 0 ? panels : null,
    view3d: text(c.view3d),
    weather: entityId(c.weather, "weather"),
    latitude: c.latitude !== undefined && c.latitude !== null && c.latitude !== "" && Number.isFinite(lat) ? lat : null,
    inverterW,
    gridMaxW: positive(c.grid_max_w, ENERGY_DEFAULTS.grid_max_w),
    stringMaxW: positive(c.string_max_w, inverterW / 2),
    inverterModel: c.inverter_model === "" || c.inverter_model === false ? null : text(c.inverter_model) || ENERGY_DEFAULTS.inverter_model,
    chargerModel: c.charger_model === "" || c.charger_model === false ? null : text(c.charger_model) || ENERGY_DEFAULTS.charger_model,
    batteryKwh: Number.isFinite(batteryKwh) && batteryKwh > 0 ? batteryKwh : null,
    batteries: positive(c.batteries, null),
    packs: positive(c.packs, null),
    packKwh: Number.isFinite(packKwh) && packKwh > 0 ? packKwh : TB_PACK_KWH,
  };
}

/** Units and modules: config first, else what the integration reports, else 1. */
export function batteryLayout(config, states) {
  const S = energySettings(config);
  const found = detectLayout(states, batteryPrefix(config));
  return { batteries: Math.round(S.batteries || found.batteries || 1), packs: Math.round(S.packs || found.packs || 1) };
}

/** Usable battery capacity in kWh: `battery_kwh`, else the rated capacity sensor (Wh), else units × modules × pack_kwh. */
export function batteryCapacityKwh(settings, ratedWh, layout) {
  if (settings.batteryKwh) return settings.batteryKwh;
  if (Number.isFinite(ratedWh) && ratedWh > 0) return ratedWh / 1000;
  return layout.batteries * layout.packs * settings.packKwh;
}

const pick = (obj, keys) => {
  const out = {};
  for (const k of keys) if (obj?.[k] !== undefined && obj[k] !== null) out[k] = obj[k];
  return out;
};
const sub = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});

/**
 * Config for the embedded th-energy-flow-card: the page's own entities under the flow card's key names, so one config
 * on th-energy-card is enough. `flow_card:` (any th-energy-flow-card option) is merged on top.
 */
export function flowCardConfig(config) {
  const c = config && typeof config === "object" ? config : {};
  const E = energySettings(c).entities, own = sub(c.flow_card);
  return {
    title: "Hvor kommer strømmen fra?",
    ...pick(c, ["huawei", "inverter_w", "grid_max_w", "ev_max_w"]),
    ...own,
    entities: {
      pv: E.pv, load: E.load, inv: E.inv, bat: E.bat, soc: E.soc,
      pvDay: E.pvDay, cons: E.cons, imp: E.imp, exp: E.exp, ch: E.ch, dis: E.dis,
      price: E.priceNow, mean: E.priceMean, ev: E.evTot, evTemp: E.evTemp,
      ...sub(own.entities),
    },
  };
}

/** Config for the embedded th-battery-card (same idea; `battery_card:` is merged on top). */
export function batteryCardConfig(config) {
  const c = config && typeof config === "object" ? config : {};
  const E = energySettings(c).entities, own = sub(c.battery_card);
  return {
    title: "Batterier",
    ...pick(c, ["huawei", "batteries", "packs", "pack_kwh"]),
    ...own,
    entities: {
      soc: E.soc, power: E.bat, rated: E.rated, ch: E.ch, dis: E.dis, totDis: E.batTotDis, status: E.batStatus,
      mode: E.mode, eod: E.eod, eoc: E.eoc, gridCh: E.gridCh, load: E.load,
      ...sub(own.entities),
    },
  };
}

/** Wind speed in m/s from a weather entity's value and unit. */
export function windToMs(value, unit) {
  const v = Number(value);
  if (!Number.isFinite(v)) return NaN;
  switch (String(unit || "").toLowerCase()) {
    case "km/h": return v / 3.6;
    case "mph": return v * 0.44704;
    case "kn": case "kt": case "knots": return v * 0.514444;
    case "ft/s": return v * 0.3048;
    default: return v;
  }
}

/** The weather row's fallback: values from a weather.* entity (no solar irradiance there). */
export function weatherFallback(stateObj) {
  const a = stateObj?.attributes || {};
  const n = (v) => (v === null || v === undefined || v === "" ? NaN : Number(v));
  return { temp: n(a.temperature), cloud: n(a.cloud_coverage), wind: windToMs(a.wind_speed, a.wind_speed_unit), rad: NaN };
}

/** 11000 -> "11 000" (the sheet's help texts group thousands with a space). */
export function groupThousands(value) {
  return String(Math.round(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
