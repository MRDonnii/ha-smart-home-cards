// The HCH5 reports its bypass damper as a status, not a position: 0 closed,
// 64 opening, 32 closing and 255 open (captured on the live unit 2026-09-23),
// and it always runs the damper for about three minutes. Travel progress is
// therefore the time since the damper left its end position.
export const BYPASS_TRAVEL_SECONDS = 180;

export type BypassDirection = "opening" | "closing";
const TRAVEL_CODES: Record<number, BypassDirection> = { 64: "opening", 32: "closing" };

export interface BypassTravel {
  /** null: part-way with no known direction. */
  direction: BypassDirection | null;
  /** Share of the travel done, 0-99 until the unit reports the end position; null when its start is unknown. */
  percent: number | null;
  remainingSeconds: number | null;
  /** Expected time passed, but the HCH5 has not reported an end code yet. */
  awaitingEnd: boolean;
}

function asDirection(value: unknown): BypassDirection | null {
  return value === "opening" || value === "closing" ? value : null;
}

/** The damper's travel in progress, or null when it rests at an end position. */
export function bypassTravel({ raw, requestOn, direction, seconds, total, observed = null }: {
  raw: number | null;
  requestOn: boolean;
  direction?: unknown;
  seconds?: unknown;
  total?: unknown;
  /** Direction seen from the last change of the code in this browser. */
  observed?: BypassDirection | null;
}): BypassTravel | null {
  if (raw === null) return null;
  const travelSeconds = typeof total === "number" && total > 0 ? total : BYPASS_TRAVEL_SECONDS;
  if (raw <= 0 || raw >= 255) {
    // On is read back a moment before the unit reports 64: already opening.
    return requestOn && raw <= 0 ? { direction: "opening", percent: 0, remainingSeconds: travelSeconds, awaitingEnd: false } : null;
  }
  const heading = asDirection(direction) ?? observed ?? TRAVEL_CODES[raw] ?? null;
  const elapsed = typeof seconds === "number" && Number.isFinite(seconds) ? Math.max(0, seconds) : null;
  if (elapsed === null) return { direction: heading, percent: null, remainingSeconds: null, awaitingEnd: false };
  const awaitingEnd = elapsed >= travelSeconds;
  return {
    direction: heading,
    percent: Math.min(99, Math.round((elapsed / travelSeconds) * 100)),
    remainingSeconds: awaitingEnd ? null : Math.max(0, Math.round(travelSeconds - elapsed)),
    awaitingEnd,
  };
}

/** How far open the damper is estimated to be, 0-1, for the drawing. */
export function bypassOpenShare(travel: BypassTravel | null, settledOpen: boolean): number {
  if (!travel) return settledOpen ? 1 : 0;
  if (travel.percent === null || travel.direction === null) return 0.5;
  return travel.direction === "opening" ? travel.percent / 100 : 1 - travel.percent / 100;
}

export function formatRemaining(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
