/*
 * Comfort for rooms without a thermostat (Claude AI, 2026-10-27; user: "visuelt om det er godt klima … soveværelet har jo
 * en lavere behagelig temp til at sove i så den skal matche det"). Each room type has its own comfortable temperature and
 * humidity; a room overrides them with comfort_min / comfort_max (°C) and humidity_min / humidity_max (%).
 * Used by the premium room tiles on the front page (ha-home-summary-card) and in Varme Center (ha-room-climate-card).
 */
import { co2Rank } from "./air-quality.js";

const PROFILES = [
  // Sleep: 16–19 °C is the usual advice for a bedroom at night.
  [/sove|bedroom|sleep/i, { kind: "sleep", temp: [16, 19], hum: [40, 60], ok: "God sovetemp.", low: "Under sovetemp.", high: "Over sovetemp." }],
  [/lille ?wc|toilet|\bwc\b/i, { kind: "wc", temp: [19, 23], hum: [40, 60] }],
  // A bathroom may be warmer (floor heating) and wetter after a shower.
  [/bad/i, { kind: "bath", temp: [22, 26], hum: [40, 70] }],
  [/bryggers|teknik|vaske|utility|depot|kælder|kaelder|garage|værksted/i, { kind: "utility", temp: [17, 24], hum: [35, 65] }],
];
const DEFAULT = { kind: "living", temp: [20, 23], hum: [40, 60] };

export function comfortProfile(room = {}) {
  const found = PROFILES.find(([pattern]) => pattern.test(`${room.name || ""} ${room.comfort_profile || ""}`))?.[1] || DEFAULT;
  const num = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : d);
  return { ...found, temp: [num(room.comfort_min, found.temp[0]), num(room.comfort_max, found.temp[1])], hum: [num(room.humidity_min, found.hum[0]), num(room.humidity_max, found.hum[1])] };
}

const fmt = (v, d = 1) => Number(v).toLocaleString("da-DK", { maximumFractionDigits: d, minimumFractionDigits: 0 });

/**
 * The room's comfort right now. tone: ok | cool | cold | warm | hot | dry | humid | air; level 0 (fine) … 3 (bad).
 * label is the short verdict for the tile, detail the reason (temperature first, then humidity, then CO₂).
 */
export function roomComfort(room, temp, humidity, co2) {
  const p = comfortProfile(room);
  const [lo, hi] = p.temp; const [hlo, hhi] = p.hum;
  const parts = [];
  if (Number.isFinite(temp)) {
    // 0.25° slack, so a room shown as "23°" is not "a little warm" at 23.04°
    const over = temp - hi - 0.25, under = lo - temp - 0.25;
    if (over > 1.5) parts.push({ tone: "hot", level: 3, label: p.kind === "sleep" ? p.high : "For varmt", detail: `+${fmt(temp - hi)}° over ${fmt(hi)}°` });
    else if (over > 0) parts.push({ tone: "warm", level: 1, label: p.kind === "sleep" ? p.high : "Lidt varmt", detail: `+${fmt(temp - hi)}° over ${fmt(hi)}°` });
    else if (under > 1.5) parts.push({ tone: "cold", level: 3, label: p.kind === "sleep" ? p.low : "For koldt", detail: `${fmt(lo - temp)}° under ${fmt(lo)}°` });
    else if (under > 0) parts.push({ tone: "cool", level: 1, label: p.kind === "sleep" ? p.low : "Lidt køligt", detail: `${fmt(lo - temp)}° under ${fmt(lo)}°` });
  }
  if (Number.isFinite(humidity)) {
    if (humidity < hlo - 10) parts.push({ tone: "dry", level: 2, label: "Meget tør luft", detail: `fugt ${fmt(humidity, 0)} %` });
    else if (humidity < hlo) parts.push({ tone: "dry", level: 1, label: "Tør luft", detail: `fugt ${fmt(humidity, 0)} %` });
    else if (humidity > hhi + 10) parts.push({ tone: "humid", level: 2, label: "Meget fugtigt", detail: `fugt ${fmt(humidity, 0)} %` });
    else if (humidity > hhi) parts.push({ tone: "humid", level: 1, label: "Fugtigt", detail: `fugt ${fmt(humidity, 0)} %` });
  }
  const rank = co2Rank(co2, room);
  if (rank >= 3) parts.push({ tone: "air", level: rank === 4 ? 3 : 2, label: rank === 4 ? "Luft ud nu" : "Luft ud", detail: `CO₂ ${fmt(co2, 0)} ppm` });
  const worst = parts.sort((a, b) => b.level - a.level)[0];
  const range = `${fmt(lo)}–${fmt(hi)}°`;
  if (!worst) return { tone: "ok", level: 0, label: p.kind === "sleep" ? p.ok : "Behageligt", detail: `${range} er behageligt`, profile: p, range };
  return { ...worst, profile: p, range };
}

/** Where a temperature sits on a 14–28 °C scale (0–1), for the comfort bar. */
export const comfortScale = (v, min = 14, max = 28) => Math.max(0, Math.min(1, (v - min) / (max - min)));
