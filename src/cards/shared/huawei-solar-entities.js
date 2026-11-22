// Entity ids for cards built around the Huawei Solar integration (SUN2000 inverter, LUNA2000 batteries, EMMA, power
// meter, charger). The integration names its entities "<domain>.<device>_<entity name>", e.g. sensor.roof_inverter_pv_1_voltage
// for a device called "Roof inverter". A card therefore describes each value it reads as [device, domain, suffix] and this
// module turns that into an entity id from the device names in the card's config:
//
//   huawei:              # optional; the device part of the entity ids (defaults: the integration's own device names)
//     inverter: inverter
//     batteries: batteries
//     emma: emma
//     meter: power_meter
//     charger: charger
//   huawei: false        # no derived ids at all; only what `entities` names is used
//   entities:            # optional; any single value by the card's key, a full entity id (null/"" hides it)
//     pv: sensor.my_pv_power
//
// Values that do not come from the Huawei Solar integration (prices, weather, rooms …) have no default id and are only
// shown when configured. Nothing here reads hass; it only builds ids.

export const HUAWEI_DEVICE_DEFAULTS = Object.freeze({
  inverter: "inverter",
  batteries: "batteries",
  emma: "emma",
  meter: "power_meter",
  charger: "charger",
});

/** The device-name prefixes to use, or null when derived ids are switched off (`huawei: false`). */
export function huaweiDevices(config) {
  const value = config?.huawei;
  if (value === false) return null;
  const custom = value && typeof value === "object" ? value : {};
  const out = { ...HUAWEI_DEVICE_DEFAULTS };
  for (const [device, prefix] of Object.entries(custom)) {
    if (prefix === false || prefix === null || prefix === "") out[device] = null;
    else if (typeof prefix === "string") out[device] = prefix.trim().replace(/^[a-z_]+\./, "");
  }
  return out;
}

/** One id from a [device, domain, suffix] description; an empty suffix means the device itself (switch.<inverter>). */
export function huaweiEntityId(devices, [device, domain, suffix]) {
  const prefix = devices?.[device];
  if (!prefix) return null;
  return suffix ? `${domain}.${prefix}_${suffix}` : `${domain}.${prefix}`;
}

/**
 * Resolves a card's entity map.
 *   spec:   { key: [device, domain, suffix] | "domain.object_id" (a generic built-in such as sun.sun) | null }
 *   config: the card config; `huawei` picks the device names, `entities` (or `overridesKey`) overrides single keys.
 * Returns { key: entity_id | null } with every key of `spec` plus any extra keys named in the overrides.
 */
export function resolveEntities(spec, config, { overridesKey = "entities" } = {}) {
  const devices = huaweiDevices(config);
  const out = {};
  for (const [key, value] of Object.entries(spec || {})) {
    if (Array.isArray(value)) out[key] = huaweiEntityId(devices, value);
    else out[key] = typeof value === "string" && value ? value : null;
  }
  const overrides = config?.[overridesKey];
  if (overrides && typeof overrides === "object" && !Array.isArray(overrides)) {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null || value === false || value === "") out[key] = null;
      else if (typeof value === "string") out[key] = value.trim();
    }
  }
  return out;
}
