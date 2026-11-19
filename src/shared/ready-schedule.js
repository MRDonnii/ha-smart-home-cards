/*
 * "Klar kl.": when the car should be warm. Pure functions (times in epoch seconds), so they are unit tested in Node and
 * give the same answer as the Home Assistant automation that does the work: a weekly plan plus an optional one-time run.
 * Change by Claude AI.
 */

// Two runs closer than this are the same morning: only one of them runs, and a one-time run wins.
export const RS_COLLISION_S = 3 * 3600;

const pad = (value) => String(value).padStart(2, "0");
const WEEKDAYS = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
const MONTHS = ["jan.", "feb.", "mar.", "apr.", "maj", "jun.", "jul.", "aug.", "sep.", "okt.", "nov.", "dec."];

/** "1,2,5" (ISO weekdays, Monday = 1) to a sorted list without doubles or nonsense. */
export function rsDays(value) {
  const days = String(value ?? "").split(",").map((part) => Number(part.trim()))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7);
  return [...new Set(days)].sort((a, b) => a - b);
}

/** "06:45:00" to [6, 45]; null when it is not a time. */
export function rsTime(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? ""));
  if (!match) return null;
  const hour = Number(match[1]); const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? [hour, minute] : null;
}

/** A stored epoch (text helper) in seconds; 0 when empty. */
export function rsEpoch(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

const isoDay = (date) => date.getDay() || 7;

/** The next weekly ready time after now, leaving out mornings a one-time run or the last run already covers. */
export function rsWeeklyGoal({ nowS, time, days, onceS = 0, lastS = 0 }) {
  const clock = rsTime(time); const list = rsDays(days);
  if (!clock || !list.length) return 0;
  const base = new Date(nowS * 1000);
  for (let offset = 0; offset < 9; offset += 1) {
    // Local wall clock: a time the clocks skip moves forward, a time they repeat counts the first time.
    const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset, clock[0], clock[1], 0, 0);
    const goal = Math.floor(date.getTime() / 1000);
    if (!list.includes(isoDay(date)) || goal <= nowS) continue;
    if (onceS > nowS && Math.abs(goal - onceS) < RS_COLLISION_S) continue;
    if (lastS > 0 && Math.abs(goal - lastS) < RS_COLLISION_S) continue;
    return goal;
  }
  return 0;
}

/** The next run: { kind: "once" | "week", goal, start } or null. The one-time run does not need the weekly plan to be on. */
export function rsNext({ nowS, weeklyOn, time, days, onceS = 0, lastS = 0, leadMin = 20 }) {
  const once = onceS > nowS ? onceS : 0;
  const week = weeklyOn ? rsWeeklyGoal({ nowS, time, days, onceS, lastS }) : 0;
  if (!once && !week) return null;
  const kind = once && (!week || once <= week) ? "once" : "week";
  const goal = kind === "once" ? once : week;
  return { kind, goal, start: goal - Math.round(Number(leadMin) * 60) };
}

/** Whole calendar days from now to the time (clock changes do not count). */
function dayDiff(goalS, nowS) {
  const a = new Date(nowS * 1000); const b = new Date(goalS * 1000);
  return Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}

/** "06.45" */
export function rsClock(goalS) {
  const date = new Date(goalS * 1000);
  return `${pad(date.getHours())}.${pad(date.getMinutes())}`;
}

/** "i dag", "i morgen", "fredag" (within a week) or "fredag 4. dec." */
export function rsDayWord(goalS, nowS) {
  const diff = dayDiff(goalS, nowS);
  const date = new Date(goalS * 1000);
  if (diff === 0) return "i dag";
  if (diff === 1) return "i morgen";
  const day = WEEKDAYS[date.getDay()];
  return diff < 7 ? day : `${day} ${date.getDate()}. ${MONTHS[date.getMonth()]}`;
}

/** "Engang: i morgen kl. 06.45" or "Næste: fredag kl. 06.45". */
export function rsLabel(next, nowS) {
  if (!next) return "Ikke planlagt";
  return `${next.kind === "once" ? "Engang" : "Næste"}: ${rsDayWord(next.goal, nowS)} kl. ${rsClock(next.goal)}`;
}

/** "2026-11-20" in local time. */
export function rsDateInput(epochS) {
  const date = new Date(epochS * 1000);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The date a quick choice means: "today", "tomorrow" (local calendar, also across a clock change). */
export function rsQuickDate(choice, nowS) {
  const base = new Date(nowS * 1000);
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + (choice === "tomorrow" ? 1 : 0), 12);
  return rsDateInput(Math.floor(date.getTime() / 1000));
}

/** A one-time ready time from the form: { ok: true, goal } or { ok: false, error } with the reason in Danish. */
export function rsOnceAt(dateText, timeText, nowS) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateText ?? ""));
  const clock = rsTime(timeText);
  if (!match) return { ok: false, error: "Vælg en dato." };
  if (!clock) return { ok: false, error: "Vælg et klokkeslæt." };
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), clock[0], clock[1], 0, 0);
  const goal = Math.floor(date.getTime() / 1000);
  if (!Number.isFinite(goal)) return { ok: false, error: "Datoen findes ikke." };
  if (goal <= nowS) return { ok: false, error: `Kl. ${rsClock(goal)} ${rsDayWord(goal, nowS)} er allerede passeret. Vælg et senere tidspunkt.` };
  return { ok: true, goal };
}
