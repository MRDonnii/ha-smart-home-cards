// Pure config helpers for mr-weather-studio-card (no DOM, no hass), so they can be unit-tested.

// Detail groups: [key, title, icon, [[label, sensor key], …]]. A sensor key is resolved to an entity id via
// `entities.<key>` or `sensor_prefix + key` (see sensorId). The "today" title comes from `today_title`.
export const GROUPS = [
  ['measurements', 'DMI-målinger', 'thermometer', [['Temperatur', 'temperatur'], ['Luftfugtighed', 'luftfugtighed'], ['Vindhastighed', 'vindhastighed'], ['Vindstød', 'vindstod'], ['Vindretning', 'vindretning'], ['Lufttryk', 'lufttryk'], ['Sigtbarhed', 'sigtbarhed'], ['Dugpunkt', 'dugpunkt'], ['Skydække', 'skydaekke']]],
  ['today', null, 'calendar-today', [['Regn i kommunen', 'nedbor_i_dag'], ['Solskinstimer', 'solskinstimer_i_dag'], ['Dagens højeste temperatur', 'hojeste_temperatur_i_dag'], ['Dagens laveste temperatur', 'laveste_temperatur_i_dag'], ['Kraftigste vindstød i dag', 'kraftigste_vindstod_i_dag'], ['Regn denne måned', 'nedbor_denne_maned']]],
  ['coast', 'Ved vandet', 'waves', [['Vandstand ved havnen', 'vandstand_havn'], ['Vandtemperatur', 'vandtemperatur_havn'], ['Næste højvande', 'naeste_hojvande'], ['Næste lavvande', 'naeste_lavvande']]],
  ['risk', 'Avancerede risikoprognoser', 'shield-alert-outline', [['Frost · næste døgn', 'frostrisiko_naeste_dogn'], ['Kraftig regn · næste døgn', 'risiko_for_kraftig_regn_naeste_dogn'], ['Skybrud · næste døgn', 'risiko_for_skybrud_naeste_dogn'], ['Stormstød · næste døgn', 'risiko_for_stormstod_naeste_dogn'], ['Sne · næste døgn', 'snerisiko_naeste_dogn'], ['Tåge · næste døgn', 'tagerisiko_naeste_dogn']]],
];

// Sensor keys outside the detail groups (radar insight and the radar tab's facts).
export const EXTRA_SENSOR_KEYS = ['nedbor_lige_nu', 'nedbor_maks_inden_for_5_km', 'radartidspunkt', 'lyn_sidste_30_min', 'afstand_til_naermeste_regn'];

// When no sensor is configured for a measurement, the Details tab shows the weather entity's own attribute instead:
// key -> [attribute, unit attribute or fixed unit].
export const WEATHER_FALLBACK = {
  temperatur: ['temperature', 'temperature_unit'], luftfugtighed: ['humidity', '%'], vindhastighed: ['wind_speed', 'wind_speed_unit'],
  vindstod: ['wind_gust_speed', 'wind_speed_unit'], vindretning: ['wind_bearing', '°'], lufttryk: ['pressure', 'pressure_unit'],
  sigtbarhed: ['visibility', 'visibility_unit'], dugpunkt: ['dew_point', 'temperature_unit'], skydaekke: ['cloud_coverage', '%'],
};

// Only generic defaults: every DMI sensor, warning and map entity comes from the config.
export const DEFAULTS = {
  title: 'Vejret', location: null, today_title: 'Dagen i kommunen', weather_entity: null, sun_entity: 'sun.sun',
  warnings_entity: null, radar_image_entity: null, satellite_image_entity: null, sensor_prefix: null, entities: null,
  radar_lat: null, radar_lon: null,
};

/** The card config merged over the defaults (never throws). */
export function normalizeConfig(config) {
  const c = config && typeof config === 'object' ? config : {};
  return { ...DEFAULTS, ...c };
}

/** Entity id for a sensor key: `entities.<key>`, else `sensor_prefix + key`, else null (not configured). */
export function sensorId(config, key) {
  const own = config?.entities?.[key];
  if (typeof own === 'string' && own) return own;
  return config?.sensor_prefix ? config.sensor_prefix + key : null;
}

/** Every sensor key the card can read. */
export function sensorKeys() {
  return [...new Set([...GROUPS.flatMap((g) => g[3].map((i) => i[1])), ...EXTRA_SENSOR_KEYS])];
}

/** The location text: `location`, else Home Assistant's location name, else empty. */
export function locationText(config, hass) {
  const value = config?.location ?? hass?.config?.location_name ?? '';
  return String(value ?? '');
}

/** A stub config for the card picker: the first weather entity, or the Met.no default name. */
export function stubConfig(hass, entities) {
  const ids = Array.isArray(entities) && entities.length ? entities : Object.keys(hass?.states || {});
  return { type: 'custom:mr-weather-studio-card', weather_entity: ids.find((id) => String(id).startsWith('weather.')) || 'weather.forecast_home' };
}
