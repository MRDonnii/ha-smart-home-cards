// Config normalisation for th-energy-flow-card (pure functions, no DOM; unit-tested).
import { resolveEntities } from "../shared/huawei-solar-entities.js";

// Every value the card reads. Huawei Solar values are [device, domain, suffix] (see shared/huawei-solar-entities.js);
// prices come from another integration and have no default (configure them under `entities`).
export const TF_SPEC = {
  pv: ["emma", "sensor", "pv_output_power"], load: ["emma", "sensor", "load_power"], inv: ["emma", "sensor", "inverter_active_power"],
  bat: ["batteries", "sensor", "charge_discharge_power"], soc: ["batteries", "sensor", "state_of_capacity"],
  pvDay: ["emma", "sensor", "pv_yield_today"], cons: ["emma", "sensor", "consumption_today"],
  imp: ["emma", "sensor", "supply_from_grid_today"], exp: ["emma", "sensor", "feed_in_to_grid_today"],
  ch: ["batteries", "sensor", "day_charge"], dis: ["batteries", "sensor", "day_discharge"],
  price: null, mean: null,
  ev: ["charger", "sensor", "charger_total_charged_energy"], evTemp: ["charger", "sensor", "charger_temperature"],
};

// Full-scale values (W) for the arcs around the medallions.
export const TF_SCALE_DEFAULTS = Object.freeze({ inverter_w: 10000, grid_max_w: 11000, ev_max_w: 11000 });

/** A positive number from config, else the fallback. */
export function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Normalised settings: resolved entity ids, start mode, title and arc scales. */
export function flowSettings(config) {
  const c = config && typeof config === "object" ? config : {};
  return {
    entities: resolveEntities(TF_SPEC, c),
    mode: c.mode === "day" ? "day" : "now",
    title: c.title || "Hvor kommer strømmen fra?",
    max: {
      sun: positive(c.inverter_w, TF_SCALE_DEFAULTS.inverter_w),
      grid: positive(c.grid_max_w, TF_SCALE_DEFAULTS.grid_max_w),
      ev: positive(c.ev_max_w, TF_SCALE_DEFAULTS.ev_max_w),
    },
  };
}
