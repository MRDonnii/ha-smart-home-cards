/*
 * Standardopsætning. Alt kan overstyres i YAML:
 *
 *   type: custom:ha-energy-center-card
 *   entities:
 *     grid_power: sensor.min_anden_maaler
 *
 * `entities` flettes nøgle for nøgle, `groups` og `phases` erstattes helt hvis de angives.
 * Entities der ikke findes i HA vises som "—" — kortet fejler aldrig på en manglende sensor.
 */

export const DEFAULT_ENTITIES = {
  grid_power: "sensor.grid_power",
  grid_energy: "sensor.grid_energy",
  grid_cost: "sensor.grid_cost",
  grid_price: "sensor.grid_price",
  grid_returned: "sensor.grid_returned",
  grid_apparent: "sensor.grid_apparent",
  meter_temperature: "sensor.meter_temperature",
  measured_power: "sensor.measured_power",
  unmeasured_power: "sensor.unmeasured_power",
  heat_power: "sensor.heat_power",
  heat_energy: "sensor.heat_energy",
  heat_cost: "sensor.heat_cost",
  heat_price: "sensor.heat_price",
  heat_flow: "sensor.heat_flow",
  heat_supply: "sensor.heat_supply",
  heat_return: "sensor.heat_return",
  heat_cooling: "sensor.heat_cooling",
  water_flow: "sensor.water_flow",
  water_total: "sensor.water_total",
  water_cost_today: "sensor.water_cost_today",
  water_price: "sensor.water_price",
  ev_power: "sensor.ev_power",
  ev_energy_today: "sensor.ev_energy_today",
  ev_energy_month: "sensor.ev_energy_month",
  ev_energy_total: "sensor.ev_energy_total",
  ev_session: "sensor.ev_session",
  ev_cost_today: "sensor.ev_cost_today",
  ev_mode: "sensor.ev_mode",
};

export const DEFAULT_PHASES = ["a", "b", "c"].map((p) => ({
  name: p.toUpperCase(),
  power: `sensor.phase_${p}_power`,
  apparent: `sensor.phase_${p}_apparent_power`,
  power_factor: `sensor.phase_${p}_power_factor`,
  current: `sensor.phase_${p}_current`,
  voltage: `sensor.phase_${p}_voltage`,
  frequency: `sensor.phase_${p}_frequency`,
}));

// Grupper af forbrugere angives i kortets config (`groups:`); der er ingen standardgrupper.
export const DEFAULT_GROUPS = [];

export const DEFAULT_CONFIG = {
  title: "Energi",
  subtitle: "Hjemmets energioverblik",
  default_tab: "overview",
  log_prefix: "energy-center",
  // Strømregnskab: advar når kortlagt forbrug og hovedmåler afviger mere end dette.
  accounting_tolerance_w: 25,
  // Fasebalance: afvigelse fra gennemsnitsstrømmen i ampere.
  phase_moderate_a: 3,
  phase_high_a: 6,
  // Vandflow-klassifikation i L/min (ingen lækagealarm — kun visning).
  water_high_flow_lpm: 15,
  // Billader: effekt over denne værdi (W) regnes som "oplader".
  ev_charging_threshold_w: 0,
};
