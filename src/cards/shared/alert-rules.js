// Shared alert-rule matching for the header card and the alarm center popup.
//
// A rule picks its entities with `entity`, or with any mix of:
//   entity_filter  regex on the entity_id ("/^sensor\..*$/")
//   device_class   attributes.device_class must equal this ("battery")
//   exclude_filter regex on the entity_id that removes matches
// and may require the matched state to have held for `for_minutes`.
// Text fields accept {name}, {device}, {state}, {unit} and {since}.

const regex = (source) => {
  if (!source) return null;
  try {
    return new RegExp(String(source).replace(/^\//, "").replace(/\/[gimyus]*$/, ""));
  } catch {
    return undefined;
  }
};

export const isFilterRule = (rule) => !rule?.entity && !!(rule?.entity_filter || rule?.device_class);

export const ruleKey = (rule) => JSON.stringify([rule.entity_filter || "", rule.device_class || "", rule.exclude_filter || ""]);

// entity_ids per rule key, for every filter rule.
export function scanRuleMatches(states, rules) {
  const matches = {};
  for (const rule of rules.filter(isFilterRule)) {
    const key = ruleKey(rule);
    if (matches[key]) continue;
    const include = regex(rule.entity_filter), exclude = regex(rule.exclude_filter);
    if (include === undefined || exclude === undefined) { matches[key] = []; continue; }
    matches[key] = Object.keys(states).filter((id) =>
      (!include || include.test(id))
      && (!rule.device_class || states[id]?.attributes?.device_class === rule.device_class)
      && (!exclude || !exclude.test(id)));
  }
  return matches;
}

// True when the rule has no `for_minutes`, or the state has been unchanged that long.
export function ruleHeld(rule, entity, now = Date.now()) {
  const minutes = Number(rule?.for_minutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return true;
  const changed = Date.parse(entity?.last_changed || "");
  return Number.isFinite(changed) && now - changed >= minutes * 60000;
}

// Signature that changes when a match's state or held flag changes, so cards
// re-render when a `for_minutes` rule starts to apply without any state change.
export function matchSignature(states, rules, matches) {
  const timed = rules.filter((rule) => isFilterRule(rule) && Number(rule.for_minutes) > 0);
  return JSON.stringify([
    Object.entries(matches).map(([key, ids]) => [key, ids.map((id) => [id, states[id]?.state])]),
    timed.map((rule) => (matches[ruleKey(rule)] || []).map((id) => ruleHeld(rule, states[id]))),
  ]);
}

// Device name for an entity: the HA device name, else the friendly name without a
// trailing "Battery"/"batteri".
export function deviceName(hass, entity) {
  const id = entity?.entity_id;
  const deviceId = id && hass?.entities?.[id]?.device_id;
  const device = deviceId && hass?.devices?.[deviceId];
  const name = device?.name_by_user || device?.name;
  if (name) return name;
  return String(entity?.attributes?.friendly_name || id || "").replace(/\s+(battery( level)?|batteri(niveau)?)$/i, "").trim();
}

const sinceText = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const time = date.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === today.toDateString()) return `i dag ${time}`;
  return `${date.toLocaleDateString("da-DK", { day: "numeric", month: "numeric" })} kl. ${time}`;
};

export function fillAlertText(text, entity, hass) {
  if (text == null) return text;
  const state = entity?.state;
  const number = Number(state);
  return String(text)
    .replace(/\{name\}/g, entity?.attributes?.friendly_name || entity?.entity_id || "")
    .replace(/\{device\}/g, deviceName(hass, entity))
    .replace(/\{state\}/g, Number.isFinite(number) ? String(Math.round(number * 10) / 10).replace(".", ",") : String(state ?? ""))
    .replace(/\{unit\}/g, entity?.attributes?.unit_of_measurement || "")
    .replace(/\{since\}/g, sinceText(entity?.last_changed));
}
