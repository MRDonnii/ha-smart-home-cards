// Tal der tæller op fra 0, når et kort tegnes (Claude AI, 2026-11-24; bruger: "der mangler stadigvæk noget animation").
// Elementer med data-count="1234.5" (og evt. data-dec, data-pre, data-suf) får deres tekst animeret over `ms`.
export function countUp(root, ms = 1000) {
  if (!root || (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
  const t0 = performance.now();
  root.querySelectorAll("[data-count]").forEach((el) => {
    const to = Number(el.dataset.count); if (!Number.isFinite(to)) return;
    const d = Number(el.dataset.dec || 0); const pre = el.dataset.pre || ""; const suf = el.dataset.suf || "";
    const out = (v) => `${pre}${v.toLocaleString("da-DK", { minimumFractionDigits: d, maximumFractionDigits: d })}${suf}`;
    const step = (t) => { const k = Math.min(1, (t - t0) / ms); const e = 1 - Math.pow(1 - k, 3); el.textContent = out(to * e); if (k < 1 && el.isConnected) requestAnimationFrame(step); };
    el.textContent = out(0); requestAnimationFrame(step);
  });
}
