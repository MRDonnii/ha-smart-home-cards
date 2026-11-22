/** A rough next-month estimate from the completed days used by Elregning's coordinator. */
export function nextMonthEstimate(attributes) {
  const [year, month] = String(attributes?.maaned || "").split("-").map(Number);
  const dailyCost = Number(attributes?.dagligt_gennemsnit);
  const dailyKwh = Number(attributes?.dagligt_gennemsnit_kwh);
  const daysMeasured = Number(attributes?.gennemsnit_dage);
  const ratio = Number(attributes?.forhold_regning_maaling);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12 ||
      !Number.isFinite(dailyCost) || dailyCost < 0 || daysMeasured < 3) return null;
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const adjustment = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  return {
    month: first.toLocaleDateString("da-DK", { month: "long", year: "numeric" }),
    days,
    daysMeasured,
    dailyCost,
    adjustment,
    cost: Math.round(dailyCost * days * adjustment / 10) * 10,
    kwh: Number.isFinite(dailyKwh) && dailyKwh >= 0 ? Math.round(dailyKwh * days) : null,
  };
}
