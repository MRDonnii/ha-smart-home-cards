// Config for huawei-solar-card: entity ids, plant sizes and the 3D diorama ("site"). Pure functions, no DOM, no hass.
import { resolveEntities } from '../shared/huawei-solar-entities.js';

// Every value the card reads, by key. Huawei Solar values are [device, domain, suffix] so the integration's standard
// names are the default (`huawei:` renames the devices, `entities:` overrides single keys). Everything else has no
// default and is only shown when configured under `entities:`.
export const ENTITY_SPEC = Object.freeze({
  // EMMA / power flow
  pv: ['emma', 'sensor', 'pv_output_power'], load: ['emma', 'sensor', 'load_power'], invAct: ['emma', 'sensor', 'inverter_active_power'],
  pvDay: ['emma', 'sensor', 'pv_yield_today'], consDay: ['emma', 'sensor', 'consumption_today'], impDay: ['emma', 'sensor', 'supply_from_grid_today'],
  expDay: ['emma', 'sensor', 'feed_in_to_grid_today'], pvTot: ['emma', 'sensor', 'total_pv_energy_yield'],
  expTot: ['emma', 'sensor', 'total_feed_in_to_grid'], impTot: ['emma', 'sensor', 'total_supply_from_grid'],
  ess: ['emma', 'select', 'ess_control_mode'],
  // batteries
  bat: ['batteries', 'sensor', 'charge_discharge_power'], soc: ['batteries', 'sensor', 'state_of_capacity'],
  chDay: ['batteries', 'sensor', 'day_charge'], disDay: ['batteries', 'sensor', 'day_discharge'],
  mode: ['batteries', 'select', 'working_mode'], touExcess: ['batteries', 'select', 'excess_pv_energy_use_in_tou'],
  batStatus: ['batteries', 'sensor', 'status'], forc: ['batteries', 'sensor', 'forcible_charge'], stopForc: ['batteries', 'button', 'stop_forcible_charge'],
  gridCh: ['batteries', 'switch', 'charge_from_grid'], eod: ['batteries', 'number', 'end_of_discharge_soc'], busV: ['batteries', 'sensor', 'bus_voltage'],
  batTotCh: ['batteries', 'sensor', 'total_charge'], batTotDis: ['batteries', 'sensor', 'total_discharge'],
  // inverter
  invDay: ['inverter', 'sensor', 'daily_yield'], hourY: ['inverter', 'sensor', 'hourly_yield'],
  pv1v: ['inverter', 'sensor', 'pv_1_voltage'], pv1a: ['inverter', 'sensor', 'pv_1_current'],
  pv2v: ['inverter', 'sensor', 'pv_2_voltage'], pv2a: ['inverter', 'sensor', 'pv_2_current'],
  invStatus: ['inverter', 'sensor', 'device_status'], invState: ['inverter', 'sensor', 'inverter_state'], alarms: ['inverter', 'sensor', 'alarms'],
  eff: ['inverter', 'sensor', 'efficiency'], peak: ['inverter', 'sensor', 'day_active_power_peak'], start: ['inverter', 'sensor', 'startup_time'],
  pvConn: ['inverter', 'sensor', 'pv_connection_status'], invSwitch: ['inverter', 'switch', ''], derate: ['inverter', 'number', 'power_derating'],
  eoc: ['inverter', 'number', 'end_of_charge_soc'], gridCut: ['inverter', 'number', 'grid_charge_cutoff_soc'],
  gridChMax: ['inverter', 'number', 'grid_charge_maximum_power'], maxCh: ['inverter', 'number', 'maximum_charging_power'],
  maxDis: ['inverter', 'number', 'maximum_discharging_power'],
  // charger
  evTot: ['charger', 'sensor', 'charger_total_charged_energy'], evTemp: ['charger', 'sensor', 'charger_temperature'],
  // no default (not a plain Huawei Solar id or another integration)
  maxFeed: null, month: null, year: null,
  price: null, priceNow: null, co2: null,
  cloud: null, rad: null, sunH: null, rain: null, wind: null, temp: null,
  // Home Assistant built-in
  sun: 'sun.sun',
});

export function resolveCardEntities(config) {
  return resolveEntities(ENTITY_SPEC, config || {});
}

// Plant sizes (W / kWh) used for percentages, bar scales, slider ranges and animation speed.
export const PLANT_DEFAULTS = Object.freeze({
  name: 'Solcelleanlæg',     // 3D header: "<name> · live"
  pv_capacity: 10000,        // W, 100 % for "% af kapacitet" and the 3D Solceller bar
  max_power: 11000,          // W, inverter max AC power: derating/feed-in slider max, flow scales
  string_max_power: 5500,    // W, full bar for Streng 1 / Streng 2
  month_target: 1200,        // kWh, full bar for "Denne måned"
  day_target: 40,            // kWh, the "I dag" bar is full at max(day_target, 5 × today's peak)
  charger_model: null,       // shown as "Model" in the Elbil-lader popup when set
});

const posNum = (v, d) => { const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : d; };

export function plantConfig(config) {
  const c = config || {};
  const text = (v, d) => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : d);
  return {
    name: text(c.name, PLANT_DEFAULTS.name),
    pv_capacity: posNum(c.pv_capacity, PLANT_DEFAULTS.pv_capacity),
    max_power: posNum(c.max_power, PLANT_DEFAULTS.max_power),
    string_max_power: posNum(c.string_max_power, PLANT_DEFAULTS.string_max_power),
    month_target: posNum(c.month_target, PLANT_DEFAULTS.month_target),
    day_target: posNum(c.day_target, PLANT_DEFAULTS.day_target),
    charger_model: text(c.charger_model, PLANT_DEFAULTS.charger_model),
  };
}

/** "11000" -> "11 000" (space as thousands separator, as in the card's help texts). */
export const groupDigits = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/* ---------- 3D diorama ---------- */
// Local metres around the house: x = east, z = south. `paint`, `trees`, `cars` and `conifers` use "pixel" units that
// tiles: {ox, oy, res} turns into metres ((px - ox) * res); the default res 1 means they are metres too.
// A neutral example plot (made-up, not a real place): a house, a garage, a shed, one row of 24 panels in the garden.
export const DEFAULT_SITE = Object.freeze({
  tiles: { ox: 0, oy: 0, res: 1 },
  island: { x: 0, z: 0, size: 80, depth: 5 },
  main: 'house',
  blds: [
    { id: 'house', p: [[-12, 2], [4, 2], [4, 11], [-12, 11]] },
    { id: 'garage', p: [[10, 4], [17, 4], [17, 11], [10, 11]] },
    { id: 'shed', p: [[-24, 18], [-20, 18], [-20, 22], [-24, 22]] },
  ],
  roofColors: { house: '#3e4756', garage: '#6b7480' },
  array: { x0: -12, z0: -20, x1: 12, z1: -20, n: 24, tilt: 0.44 },
  cab: { x: 6, z: 1 },
  ev: { x: 11.5, z: 2.6 },
  pole: { x: -33, z: -6 },
  house: { x: -4, z: 6.5 },
  cars: [[13.5, -0.5, 0, '#2f5a8a']],
  paint: {
    fields: [{ p: [[-40, -40], [-14, -40], [-14, -28], [-40, -28]], c: '#d3bc80', r: 'rgba(150,115,60,.32)', a: 0.3 }],
    lawn: [[-30, -27], [30, -27], [30, 30], [-30, 30]],
    paved: [[[-36, -4.5], [18, -4.5], [18, 3.5], [-36, 3.5]]],
    road: [[-36, -45], [-36, 45]],
    hedges: [[[-30, -27], [30, -27]], [[30, -27], [30, 30]], [[30, 30], [-30, 30]]],
  },
  trees: [[22, 20, 3.2], [-12, 24, 3.4], [26, -10, 2.8], [-26, 12, 3], [20, -33, 2.6], [4, 24, 2.8]],
});

const REQUIRED = ['island', 'house', 'cab', 'ev', 'pole', 'array'];
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const pt3 = (v) => (Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n)) ? v.slice() : null);

/** Nearest point on a closed polygon's outline to (x, z). */
export function nearestOnOutline(x, z, poly) {
  let best = null, bd = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length], dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)), qx = ax + t * dx, qz = az + t * dz, d = (x - qx) ** 2 + (z - qz) ** 2;
    if (d < bd) { bd = d; best = [qx, qz]; }
  }
  return best;
}

/** Signs (label posts) for a site that names none: on the panel row, the roof, beside the cabinet, the pole, the charger. */
export function defaultSigns(s) {
  const A = s.array, rc = [(A.x0 + A.x1) / 2, (A.z0 + A.z1) / 2];
  return {
    pv: { x: rc[0], z: rc[1] + 2.5, y0: 0, y1: 6.5 },
    home: { x: s.house.x, z: s.house.z, y0: 6.5, y1: 12.5 },
    bat: { x: s.cab.x + 2.5, z: s.cab.z + 1.5, y0: 0, y1: 6.2 },
    grid: { x: s.pole.x, z: s.pole.z, y0: 7.6, y1: 11.2 },
    ev: { x: s.ev.x - 1, z: s.ev.z - 1.5, y0: 0, y1: 4.8 },
  };
}

/** Where the overhead cable meets the house: the main building's outline nearest the pole, else the house point. */
export function defaultWire(s) {
  const main = (s.blds || []).find((b) => (b.main === true || (s.main != null && b.id === s.main)) && Array.isArray(b.p) && b.p.length > 2);
  if (main) { const q = nearestOnOutline(s.pole.x, s.pole.z, main.p); return [q[0], 3.4, q[1]]; }
  return [s.house.x, 3.6, s.house.z];
}

/** Via points of the energy-flow curves (hub = inverter at the cabinet). */
export function defaultVia(s, wire) {
  const A = s.array, hub = [s.cab.x - 0.5, 1.4, s.cab.z + 0.3], rc = [(A.x0 + A.x1) / 2, (A.z0 + A.z1) / 2];
  const mid = (a, b, y) => [(a[0] + b[0]) / 2, y, (a[2] + b[2]) / 2];
  const poleTop = [s.pole.x + 0.8, 7.4, s.pole.z];
  return {
    pv: [mid([rc[0], 0, rc[1]], hub, 3.4)],
    grid: [wire.slice(), mid(wire, poleTop, 4.8)],
    home: [mid(hub, [s.house.x, 0, s.house.z], 3.8)],
    ev: [mid(hub, [s.ev.x, 0, s.ev.z], 2)],
  };
}

/**
 * The site the 3D section draws. No `site` = the neutral example. A custom `site` keeps what it names; missing
 * positions (island, house, cab, ev, pole, array) come from the example, missing signs / via / wire / yard are worked
 * out from the positions, and missing decoration (buildings, trees, cars, paint, garden, trampoline, conifers) is not drawn.
 */
export function normalizeSite(raw) {
  const custom = isObj(raw);
  const src = custom ? raw : DEFAULT_SITE;
  const s = {};
  for (const k of REQUIRED) s[k] = isObj(src[k]) ? { ...src[k] } : { ...DEFAULT_SITE[k] };
  s.tiles = { ...DEFAULT_SITE.tiles, ...(isObj(src.tiles) ? src.tiles : {}) };
  s.blds = Array.isArray(src.blds) ? src.blds.filter((b) => isObj(b) && Array.isArray(b.p) && b.p.length > 2) : [];
  s.main = src.main ?? null;
  s.roofColors = isObj(src.roofColors) ? { ...src.roofColors } : {};
  s.trees = Array.isArray(src.trees) ? src.trees : [];
  s.cars = Array.isArray(src.cars) ? src.cars : [];
  const p = isObj(src.paint) ? src.paint : {};
  s.paint = {
    fields: Array.isArray(p.fields) ? p.fields : [], gravel: Array.isArray(p.gravel) ? p.gravel : [],
    paved: Array.isArray(p.paved) ? p.paved : [], hedges: Array.isArray(p.hedges) ? p.hedges : [],
    lawn: Array.isArray(p.lawn) ? p.lawn : null, lane: Array.isArray(p.lane) ? p.lane : null,
    road: Array.isArray(p.road) ? p.road : null, plot: Array.isArray(p.plot) ? p.plot : null,
  };
  s.garden = isObj(src.garden) ? { ...src.garden } : null;
  s.trampoline = isObj(src.trampoline) ? { ...src.trampoline } : null;
  s.conifers = Array.isArray(src.conifers) && src.conifers.length === 3 && Number(src.conifers[2]) > 1 ? src.conifers : null;
  const signs = defaultSigns(s), given = isObj(src.signs) ? src.signs : {};
  for (const k of Object.keys(signs)) if (isObj(given[k])) signs[k] = { ...signs[k], ...given[k] };
  s.signs = signs;
  s.wire = pt3(src.wire) || defaultWire(s);
  const via = defaultVia(s, s.wire), gv = isObj(src.via) ? src.via : {};
  for (const k of Object.keys(via)) if (Array.isArray(gv[k]) && gv[k].every(pt3)) via[k] = gv[k].map(pt3);
  s.via = via;
  s.yard = pt3(src.yard) || [(s.cab.x + s.house.x) / 2, 4, (s.cab.z + s.house.z) / 2];
  s.attribution = typeof src.attribution === 'string' ? src.attribution : '';
  return s;
}
