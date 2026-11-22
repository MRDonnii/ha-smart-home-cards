// Delt hover til kurver (Claude AI, 2026-10-18): lodret linje, prik og et skilt med tid og værdi, når musen eller en
// finger er over en graf. Skiltet ligger inde i grafens egen boks og vender til den side, der er plads på, så det
// aldrig ryger ud over kortets kant (det gjorde det gamle skilt over rumkortenes kurver).
//
// Brug: chartHover(root, ".spark-box", (box, fraction) => ({ x, y, text }) | null)
//   root     - shadowRoot eller anden stabil node (lytteren lægges her én gang, så innerHTML-redraws ikke ødelægger den)
//   selector - grafens boks; den skal have position:relative (sættes hvis den er static)
//   resolve  - får boksen og musens vandrette placering 0..1, returnerer det nærmeste punkt:
//              x = 0..1 vandret, y = 0..1 lodret fra toppen (valgfri, uden y vises ingen prik), text = skiltets tekst,
//              color = prikkens farve (valgfri). null skjuler hoveren.

const TOUCH_HIDE_MS = 3500;

function overlay(box) {
  if (box._hoverUi?.line.isConnected) return box._hoverUi;
  if (getComputedStyle(box).position === "static") box.style.position = "relative";
  const line = document.createElement("i");
  line.style.cssText = "position:absolute;top:0;bottom:0;width:1px;margin-left:-.5px;background:color-mix(in srgb,var(--primary-text-color,#fff) 45%,transparent);pointer-events:none;opacity:0;transition:opacity .12s ease;z-index:3";
  const dot = document.createElement("i");
  dot.style.cssText = "position:absolute;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;border-radius:50%;border:2px solid var(--card-background-color,#111);box-sizing:border-box;pointer-events:none;opacity:0;transition:opacity .12s ease;z-index:4";
  const tip = document.createElement("span");
  tip.style.cssText = "position:absolute;top:2px;padding:3px 8px;border-radius:8px;background:color-mix(in srgb,var(--card-background-color,#0c1218) 92%,transparent);color:var(--primary-text-color,#fff);border:1px solid var(--divider-color,rgba(255,255,255,.15));box-shadow:0 6px 18px rgba(0,0,0,.35);font-size:10.5px;font-weight:700;line-height:1.35;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .12s ease;z-index:5;font-variant-numeric:tabular-nums";
  box.append(line, dot, tip);
  box._hoverUi = { line, dot, tip };
  return box._hoverUi;
}

function show(box, point) {
  const ui = overlay(box);
  const w = box.clientWidth;
  const h = box.clientHeight;
  const x = Math.min(1, Math.max(0, point.x)) * w;
  ui.line.style.left = `${x}px`;
  if (Number.isFinite(point.y)) {
    ui.dot.style.left = `${x}px`;
    ui.dot.style.top = `${Math.min(1, Math.max(0, point.y)) * h}px`;
    ui.dot.style.background = point.color || "var(--primary-text-color,#fff)";
    ui.dot.style.opacity = "1";
  } else ui.dot.style.opacity = "0";
  if (ui.tip.textContent !== point.text) ui.tip.textContent = point.text;
  // Skiltet står ved siden af linjen på den side, der er mest plads, og holdes inde i boksen.
  const tw = ui.tip.offsetWidth;
  const gap = 6;
  let left = x > w / 2 ? x - gap - tw : x + gap;
  // Er skiltet bredere end grafen, flugter det med den kant, der vender ind mod kortet.
  left = tw > w ? (x > w / 2 ? w - tw : 0) : Math.max(0, Math.min(w - tw, left));
  ui.tip.style.left = `${left}px`;
  // Ligger prikken oppe ved skiltet, flyttes skiltet ned i bunden af grafen.
  const dotY = Number.isFinite(point.y) ? point.y * h : h;
  ui.tip.style.top = dotY < ui.tip.offsetHeight + 8 && h > ui.tip.offsetHeight * 2 + 8 ? `${h - ui.tip.offsetHeight - 2}px` : "2px";
  ui.line.style.opacity = ui.tip.style.opacity = "1";
  box.classList.add("chart-hovering");
}

function hide(box) {
  const ui = box?._hoverUi;
  if (ui) ui.line.style.opacity = ui.dot.style.opacity = ui.tip.style.opacity = "0";
  box?.classList.remove("chart-hovering");
}

export function chartHover(root, selector, resolve) {
  if (!root || root[`_chartHover:${selector}`]) return;
  root[`_chartHover:${selector}`] = true;
  let current;
  let touchTimer;
  const clear = () => { hide(current); current = undefined; };
  const move = (event) => {
    const box = event.target?.closest?.(selector);
    if (box !== current) clear();
    if (!box) return;
    const rect = box.getBoundingClientRect();
    if (!rect.width) return;
    const point = resolve(box, Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), event);
    if (!point) { hide(box); return; }
    current = box;
    show(box, point);
    clearTimeout(touchTimer);
    if (event.pointerType && event.pointerType !== "mouse") touchTimer = setTimeout(clear, TOUCH_HIDE_MS);
  };
  root.addEventListener("pointermove", move);
  root.addEventListener("pointerdown", move);
  root.addEventListener("pointerout", (event) => { if (event.pointerType === "mouse" && current && !current.contains(event.relatedTarget)) clear(); });
}

// Nærmeste punkt i en tidsserie [{t, v}] for en vandret placering mellem t0 og t1.
export function nearestPoint(points, t0, t1, fraction) {
  if (!points?.length) return undefined;
  const time = t0 + fraction * (t1 - t0);
  let best = points[0];
  for (const p of points) if (Math.abs(p.t - time) < Math.abs(best.t - time)) best = p;
  return best;
}

// "Kl. 16.30" i dag, "man. 16.30" for andre dage, "Nu" for det seneste punkt.
export function hoverTime(t, hass, { now = false } = {}) {
  if (now) return "Nu";
  const lang = hass?.locale?.language || hass?.language || "da";
  const d = new Date(t);
  const time = d.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });
  return new Date().toDateString() === d.toDateString() ? `Kl. ${time}` : `${d.toLocaleDateString(lang, { weekday: "short" })} ${time}`;
}
