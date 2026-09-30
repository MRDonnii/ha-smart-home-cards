// Shared air quality levels for the room cards and the air quality card.
// Rank 0-5 follows the Matter air quality scale that monitors such as
// IKEA ALPSTUGA report: good, fair, moderate, poor, very_poor, extremely_poor.

export const AIR_LABELS = ["God", "Rimelig", "Moderat", "Dårlig", "Meget dårlig", "Ekstremt dårlig"];
export const AIR_TONES = ["good", "fair", "moderate", "poor", "bad", "bad"];
export const AIR_COLORS = {
  good: "#4fd08f",
  fair: "#a3d65c",
  moderate: "#ffc157",
  poor: "#ff9a4d",
  bad: "#ff5d73",
};

const QUALITY_RANK = { good: 0, excellent: 0, fair: 1, moderate: 2, poor: 3, very_poor: 4, extremely_poor: 5, unhealthy: 4, hazardous: 5 };
const DEAD = new Set(["unknown", "unavailable", ""]);

export const AIR_DEFAULTS = { co2_good: 800, co2_warning: 1000, co2_critical: 1400, pm25_good: 15, pm25_moderate: 25, pm25_poor: 35, pm25_bad: 55 };

export function co2Rank(value, cfg = {}) {
  if (!Number.isFinite(value)) return undefined;
  const good = cfg.co2_good ?? AIR_DEFAULTS.co2_good;
  const warning = cfg.co2_warning ?? AIR_DEFAULTS.co2_warning;
  const critical = cfg.co2_critical ?? AIR_DEFAULTS.co2_critical;
  if (value < good) return 0;
  if (value < warning) return 1;
  if (value < critical) return 3;
  return 4;
}

export function pm25Rank(value) {
  if (!Number.isFinite(value)) return undefined;
  if (value < AIR_DEFAULTS.pm25_good) return 0;
  if (value < AIR_DEFAULTS.pm25_moderate) return 1;
  if (value < AIR_DEFAULTS.pm25_poor) return 2;
  if (value < AIR_DEFAULTS.pm25_bad) return 3;
  return 4;
}

export function qualityRank(state) {
  const rank = QUALITY_RANK[String(state ?? "").trim().toLowerCase().replace(/\s+/g, "_")];
  return rank === undefined ? undefined : rank;
}

// cfg holds the entity ids (co2, pm25, air_quality) plus optional CO2 thresholds.
export function airQuality(hass, cfg = {}) {
  const ids = [cfg.co2, cfg.pm25, cfg.air_quality].filter((id) => typeof id === "string" && id.includes("."));
  if (!ids.length) return { configured: false };
  const live = (id) => {
    const entity = id ? hass?.states?.[id] : undefined;
    return entity && !DEAD.has(String(entity.state)) ? entity : undefined;
  };
  const number = (id) => {
    const value = Number(live(id)?.state);
    return Number.isFinite(value) ? value : undefined;
  };
  const co2 = number(cfg.co2);
  const pm25 = number(cfg.pm25);
  const quality = live(cfg.air_quality)?.state;
  const ranks = [co2Rank(co2, cfg), pm25Rank(pm25), qualityRank(quality)].filter((rank) => rank !== undefined);
  if (!ranks.length) return { configured: true, offline: true, co2, pm25, quality, tone: "offline", label: "Offline", text: "Offline" };
  const rank = Math.max(...ranks);
  const text = co2 !== undefined ? `${Math.round(co2)} ppm` : pm25 !== undefined ? `PM2,5 ${Math.round(pm25)}` : AIR_LABELS[rank];
  return { configured: true, offline: false, co2, pm25, quality, rank, tone: AIR_TONES[rank], label: AIR_LABELS[rank], text };
}
