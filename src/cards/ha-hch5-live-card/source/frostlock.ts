// Afterheat frost lock ("Frostsikring"). The water coil sits in a cold attic,
// so while it freezes the Pi keeps the afterheat on at a minimum setpoint. The
// card only reflects that: the HCH5 Control climate entity then offers no "off"
// mode and its min_temp is the lowest setpoint the Pi accepts.
export type AfterheatValue = number | "off";

export const AFTERHEAT_MIN = 10;
export const AFTERHEAT_MAX = 35;

export const FROST_LOCK_NOTE = "Frostsikring: eftervarmen kan ikke slukkes i frostvejr";
export const FROST_LOCK_BLOCKED = "Spærret af frostsikring";

export interface FrostLock {
  locked: boolean;
  /** Lowest allowed setpoint; AFTERHEAT_MIN when not locked. */
  floor: number;
}

export const NO_FROST_LOCK: FrostLock = { locked: false, floor: AFTERHEAT_MIN };

/** Older integrations always list "off" (or no modes at all) and so never lock. */
export function frostLockOf(attributes: Record<string, unknown> | undefined): FrostLock {
  const modes = attributes?.hvac_modes;
  if (!Array.isArray(modes) || modes.includes("off")) return NO_FROST_LOCK;
  const min = Number(attributes?.min_temp);
  const floor = Number.isFinite(min) ? Math.min(AFTERHEAT_MAX, Math.max(AFTERHEAT_MIN, Math.ceil(min))) : AFTERHEAT_MIN;
  return { locked: true, floor };
}

/** The lowest value the controls may produce; "off" only without a lock. */
const lowest = (lock: FrostLock): AfterheatValue => lock.locked ? lock.floor : "off";

/** Minus button / arrow down: never below the floor and never "off" while locked. */
export function stepDown(value: AfterheatValue, lock: FrostLock = NO_FROST_LOCK): AfterheatValue {
  if (value === "off") return lowest(lock);
  if (!lock.locked) return value - 1 < AFTERHEAT_MIN ? "off" : value - 1;
  // A stored value already under the floor is left alone rather than raised by "minus".
  return value - 1 >= lock.floor ? value - 1 : value > lock.floor ? lock.floor : value;
}

/** Whether the minus button can still lower the value. */
export function canStepDown(value: AfterheatValue, lock: FrostLock = NO_FROST_LOCK): boolean {
  return value !== "off" && (!lock.locked || value > lock.floor);
}

/** Plus button / arrow up: from "off" it starts at the lowest allowed setpoint. */
export function stepUp(value: AfterheatValue, lock: FrostLock = NO_FROST_LOCK): AfterheatValue {
  if (value === "off") return lock.locked ? lock.floor : AFTERHEAT_MIN;
  return Math.min(AFTERHEAT_MAX, Math.max(value + 1, lock.locked ? lock.floor : AFTERHEAT_MIN));
}

/** A dragged or picked setpoint snapped to the allowed range. */
export function clampSetpoint(value: number, lock: FrostLock = NO_FROST_LOCK): number {
  return Math.min(AFTERHEAT_MAX, Math.max(lock.locked ? lock.floor : AFTERHEAT_MIN, value));
}

/** Whether a value may be confirmed; "off" and values below the floor are refused while locked. */
export function allowedWhileLocked(value: AfterheatValue, lock: FrostLock): boolean {
  return !lock.locked || (value !== "off" && value >= lock.floor);
}

/** The Danish refusal shown when a draft cannot be confirmed, or null when it can. */
export function frostRefusal(value: AfterheatValue, lock: FrostLock): string | null {
  if (allowedWhileLocked(value, lock)) return null;
  return value === "off"
    ? "Frostsikring: eftervarmen kan ikke slukkes, mens det fryser."
    : `Frostsikring: eftervarmen kan ikke sættes under ${lock.floor} °C, mens det fryser.`;
}

/** A Køl button is blocked while locked, and when HA reports it unavailable (the integration's own lock). */
export function coolBlocked(lock: FrostLock, state: string | undefined): boolean {
  return lock.locked || state === "unavailable";
}
