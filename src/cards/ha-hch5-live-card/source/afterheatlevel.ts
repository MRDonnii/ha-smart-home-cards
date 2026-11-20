// HAC1 afterheat output level ("Trin"). With the Pi controller (HCH5 Control
// gateway 1.9.0+) the afterheat climate entity carries the actual HAC1 level
// (0..10), the continuous level the Pi wants and a short Danish reason. Older
// integrations have none of these attributes, and the card then shows nothing.
export const AFTERHEAT_LEVEL_MAX = 10;

export interface AfterheatLevel {
  /** HAC1's actual output level, 0..10, or null when unknown. */
  level: number | null;
  /** The continuous level the controller wants, 0..10, or null. */
  wanted: number | null;
  /** Short Danish text from the controller, or null. */
  reason: string | null;
}

// Number(null) is 0, so only real numbers and numeric strings count.
function finite(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

const clampLevel = (value: number) => Math.min(AFTERHEAT_LEVEL_MAX, Math.max(0, value));

/** The level block from the climate attributes, or null when there is nothing to show. */
export function afterheatLevelOf(attributes: Record<string, unknown> | undefined): AfterheatLevel | null {
  if (!attributes) return null;
  const level = finite(attributes.hac1_level);
  const wanted = finite(attributes.level_wanted);
  const rawReason = attributes.control_reason;
  const reason = typeof rawReason === "string" && rawReason.trim() !== "" ? rawReason.trim() : null;
  if (level === null && reason === null) return null;
  return {
    level: level === null ? null : clampLevel(Math.round(level)),
    wanted: wanted === null ? null : clampLevel(Math.round(wanted * 10) / 10),
    reason,
  };
}

/** "Trin 3/10", or "Trin —/10" when the level is unknown. */
export function levelLabel(info: AfterheatLevel): string {
  return `Trin ${info.level === null ? "—" : info.level}/${AFTERHEAT_LEVEL_MAX}`;
}

/** "mål 3,4" for the wanted level, or null. */
export function wantedLabel(info: AfterheatLevel): string | null {
  if (info.wanted === null) return null;
  return `mål ${info.wanted.toLocaleString("da-DK", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
}

/** Position on the bar in percent. */
export const levelPercent = (value: number) => (clampLevel(value) / AFTERHEAT_LEVEL_MAX) * 100;
