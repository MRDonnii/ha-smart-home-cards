// The charge plan as one timeline, shared by the Tesla glance card (front page), the Tesla dashboard card (the Tesla page
// and the quick charge popup): the charging periods, the pauses between them, the wait before the first one and the time
// after the last one until the ready-by time. Every part has a tooltip (hover with a mouse, tap on a touch screen) that
// says when it charges or pauses, how much and at what price (Claude AI, 2026-10-16; user: "vise hele forløbet, så den
// viser pauserne og at der er en hover så man kan se hvornår den lader og hvornår der holder pause").
//
// Colours come from the card: --ctl-ev (charging), --ctl-warn (dear), --ctl-good (ready-by flag), --ctl-muted, --ctl-text.

const HOUR = 3600000;

const pad = (n) => String(n).padStart(2, "0");
const hm = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const num = (v, d) => Number(v).toLocaleString("da-DK", { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** A duration in Danish: "45 min", "2 t", "1 t 15 min". */
export function ctlDuration(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  return h ? `${h} t${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`;
}

/** The day word for a time that is not today: "i morgen", "lør". */
function dayWord(t, now) {
  const a = new Date(now); a.setHours(0, 0, 0, 0);
  const b = new Date(t); b.setHours(0, 0, 0, 0);
  const days = Math.round((b - a) / 86400000);
  if (days <= 0) return "";
  return days === 1 ? "i morgen " : `${new Date(t).toLocaleDateString("da-DK", { weekday: "short" }).replace(".", "")} `;
}

/** Mean price of the price slots inside [t, e). */
function meanPrice(prices, minutes, t, e) {
  if (!Array.isArray(prices) || !prices.length) return NaN;
  const len = (minutes || 15) * 60000;
  let sum = 0; let n = 0;
  for (const x of prices) {
    if (x.t + len <= t || x.t >= e || !Number.isFinite(x.p)) continue;
    sum += x.p; n += 1;
  }
  return n ? sum / n : NaN;
}

/**
 * The parts of the plan from now: [{kind: "wait"|"charge"|"pause"|"done", t, e, kwh, cost, n, of, price}].
 * blocks: [{t, e, kwh, cost}] in ms; deadline: ms or NaN; prices: [{t, p}] for the pause prices.
 */
export function ctlParts({ now = Date.now(), blocks = [], deadline = NaN, prices = [], minutes = 15 }) {
  const list = blocks.filter((b) => Number.isFinite(b.t) && Number.isFinite(b.e) && b.e > now).sort((a, b) => a.t - b.t);
  // Blocks that touch are one charging period (the plan keeps quarters apart only by their prices).
  const runs = [];
  for (const b of list) {
    const last = runs[runs.length - 1];
    if (last && b.t - last.e < 60000) { last.e = b.e; last.kwh += Number(b.kwh) || 0; last.cost += Number(b.cost) || 0; } else runs.push({ t: b.t, e: b.e, kwh: Number(b.kwh) || 0, cost: Number(b.cost) || 0 });
  }
  const parts = [];
  let cursor = now;
  runs.forEach((b, i) => {
    const t = Math.max(b.t, now);
    if (t - cursor >= 60000) parts.push({ kind: i === 0 ? "wait" : "pause", t: cursor, e: t, price: meanPrice(prices, minutes, cursor, t) });
    parts.push({ kind: "charge", t, e: b.e, kwh: b.kwh, cost: b.cost, n: i + 1, of: runs.length, price: b.kwh > 0 ? b.cost / b.kwh : NaN, running: b.t <= now });
    cursor = b.e;
  });
  if (Number.isFinite(deadline) && deadline - cursor >= 60000) parts.push({ kind: "done", t: cursor, e: deadline });
  return parts;
}

/** What the parts add up to: periods, time charging, time paused and the end of the last period. */
export function ctlSummary(parts) {
  const charge = parts.filter((p) => p.kind === "charge");
  const pause = parts.filter((p) => p.kind === "pause");
  return {
    periods: charge.length,
    charging: charge.reduce((a, p) => a + (p.e - p.t), 0),
    paused: pause.reduce((a, p) => a + (p.e - p.t), 0),
    end: charge.length ? charge[charge.length - 1].e : NaN,
    next: charge[0] || null,
  };
}

/** The tooltip of one part. unit: "kr"; held: {reach, later} when the plan waits with the rest. */
function tipText(p, { now, unit = "kr", deadline, held }) {
  const per = `${unit}/kWh`;
  const span = `${dayWord(p.t, now)}${hm(p.t)}–${hm(p.e)}`;
  if (p.kind === "charge") {
    const head = p.running ? `Lader nu til ${hm(p.e)}` : `Lader ${span}`;
    const money = p.kwh > 0 ? ` · ${num(p.kwh, 1)} kWh · ${num(p.cost, 2)} ${unit} (${num(p.price, 2)} ${per})` : "";
    return `${head}${money}${p.of > 1 ? ` · periode ${p.n} af ${p.of}` : ""}`;
  }
  const price = Number.isFinite(p.price) ? ` · strømmen koster ca. ${num(p.price, 2)} ${per}` : "";
  if (p.kind === "pause") return `Pause ${span} (${ctlDuration(p.e - p.t)})${price} – dyrere end planens kvarterer`;
  if (p.kind === "wait") return `Venter ${span} (${ctlDuration(p.e - p.t)})${price}`;
  const ready = Number.isFinite(deadline) ? ` · klar ${dayWord(deadline, now)}${hm(deadline)}` : "";
  const rest = held ? ` · stopper ved ca. ${Math.round(held.reach)} %${held.later ? `, resten ${held.later}` : ""}` : "";
  return `Færdig ca. ${hm(p.t)}${rest}${ready}`;
}

/**
 * The track: parts as positioned elements with data-tip, the now dot, the ready-by flag and hour ticks.
 * opts: { now, deadline, unit, held, dear(part) → bool, extra: html drawn first (e.g. price-limit stripes),
 *         X: optional (t) => percent, end: ms }
 */
export function ctlTrack(parts, opts = {}) {
  const now = opts.now ?? Date.now();
  const deadline = Number.isFinite(opts.deadline) ? opts.deadline : NaN;
  const end = opts.end ?? Math.max(Number.isFinite(deadline) ? deadline : now + HOUR, ...parts.map((p) => p.e));
  const span = Math.max(end - now, HOUR);
  const X = opts.X || ((t) => Math.max(0, Math.min(100, ((t - now) / span) * 100)));
  const pos = (p) => `left:${X(p.t).toFixed(2)}%;width:${Math.max(0.8, X(p.e) - X(p.t)).toFixed(2)}%`;
  const items = parts.map((p) => {
    const cls = p.kind === "charge" ? `ctl-c${opts.dear?.(p) ? " dear" : ""}${p.running ? " run" : ""}` : `ctl-${p.kind}`;
    return `<i class="ctl-p ${cls}" style="${pos(p)}" data-tip="${esc(tipText(p, { now, unit: opts.unit, deadline, held: opts.held }))}"></i>`;
  }).join("");
  const ticks = [];
  const d0 = new Date(now); d0.setMinutes(0, 0, 0);
  const step = span > 30 * HOUR ? 12 : span > 12 * HOUR ? 6 : span > 6 * HOUR ? 3 : span > 3 * HOUR ? 2 : 1;
  for (let t = +d0 + HOUR; t < end; t += HOUR) {
    const h = new Date(t).getHours(); const x = X(t);
    if (h % step === 0 && x > 6 && (!Number.isFinite(deadline) || Math.abs(x - X(deadline)) > 12)) ticks.push(`<span class="ctl-t" style="left:${x.toFixed(2)}%">${String(h).padStart(2, "0")}</span>`);
  }
  const dl = Number.isFinite(deadline) ? `${dayWord(deadline, now)}${hm(deadline)}` : "";
  return `<div class="ctl-track">${opts.extra || ""}${items}<i class="ctl-now"></i>${Number.isFinite(deadline) ? `<i class="ctl-flag" style="left:${X(deadline).toFixed(2)}%"></i>` : ""}</div>`
    + `<div class="ctl-ticks"><span class="ctl-t" style="left:0">nu</span>${ticks.join("")}${dl ? `<span class="ctl-t end" style="left:${X(deadline).toFixed(2)}%">klar ${esc(dl)}</span>` : ""}</div>`;
}

/** One line in words: "5 perioder · lader 3 t · pauser 1 t 15 min · færdig ca. 05:45". */
export function ctlLine(parts, now = Date.now()) {
  const s = ctlSummary(parts);
  if (!s.periods) return "";
  const bits = [s.periods > 1 ? `${s.periods} perioder` : "1 periode", `lader ${ctlDuration(s.charging)}`];
  if (s.paused >= 60000) bits.push(`pauser ${ctlDuration(s.paused)}`);
  bits.push(`færdig ca. ${dayWord(s.end, now)}${hm(s.end)}`);
  return bits.join(" · ");
}

/** The charger's state in words from the plan: waiting, charging in period n, or paused until the next one. */
export function ctlStatus(parts, { now = Date.now(), charging = false } = {}) {
  const charge = parts.filter((p) => p.kind === "charge");
  if (!charge.length) return "";
  const end = charge[charge.length - 1].e;
  const cur = charge.find((p) => p.t <= now && now < p.e);
  const next = charge.find((p) => p.t > now);
  const of = charge.length;
  const fin = `færdig ca. ${dayWord(end, now)}${hm(end)}`;
  if (cur && charging) {
    const after = next ? ` · derefter pause til ${hm(next.t)}` : "";
    return of > 1 ? `Lader til ${hm(cur.e)} (periode ${cur.n} af ${of})${after} · ${fin}` : `Lader til ${hm(cur.e)} · ${fin}`;
  }
  if (!next) return cur ? `Starter nu · ${fin}` : "";
  const first = next.n === 1;
  const lead = first ? `Starter ${dayWord(next.t, now)}${hm(next.t)}` : `Pause til ${hm(next.t)}`;
  return `${lead}${of > 1 ? ` (periode ${next.n} af ${of})` : ""} · ${fin}`;
}

export const CTL_CSS = `
.ctl-tl{display:block;position:relative;padding:2px 0 14px}
.ctl-track{position:relative;height:12px;border-radius:7px;background:color-mix(in srgb,var(--ctl-text,currentColor) 8%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ctl-text,currentColor) 6%,transparent)}
.ctl-p{position:absolute;top:0;bottom:0;cursor:help;touch-action:pan-y}
.ctl-c{border-radius:7px;background:linear-gradient(180deg,color-mix(in srgb,var(--ctl-ev,#9b7bff) 95%,#fff),var(--ctl-ev,#9b7bff));box-shadow:0 0 12px -1px var(--ctl-ev,#9b7bff)}
.ctl-c.dear{background:linear-gradient(180deg,color-mix(in srgb,#ff6a3d 92%,#fff),#ff6a3d);box-shadow:0 0 12px -1px #ff6a3d}
.ctl-c.run{animation:ctlRun 1.6s ease-in-out infinite alternate}
@keyframes ctlRun{to{filter:brightness(1.25)}}
.ctl-pause{top:3px;bottom:3px;border-radius:3px;background:repeating-linear-gradient(90deg,color-mix(in srgb,var(--ctl-muted,#8a8f98) 55%,transparent) 0 4px,transparent 4px 8px)}
.ctl-pause::after{content:"";position:absolute;left:50%;top:50%;width:5px;height:8px;margin:-4px 0 0 -2.5px;border-left:2px solid var(--ctl-muted,#8a8f98);border-right:2px solid var(--ctl-muted,#8a8f98);box-sizing:border-box;opacity:.9}
.ctl-wait,.ctl-done{top:-3px;bottom:-3px}
.ctl-p:hover,.ctl-p[data-on]{outline:2px solid color-mix(in srgb,var(--ctl-text,#fff) 55%,transparent);outline-offset:1px;border-radius:7px}
.ctl-now{position:absolute;left:0;top:50%;width:12px;height:12px;margin:-6px 0 0 -2px;border-radius:50%;background:#fff;pointer-events:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--ctl-ev,#9b7bff) 45%,transparent);animation:ctlNow 2s ease-out infinite}
@keyframes ctlNow{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--ctl-ev,#9b7bff) 70%,transparent)}80%,100%{box-shadow:0 0 0 9px transparent}}
.ctl-flag{position:absolute;top:-5px;bottom:-5px;width:2px;margin-left:-1px;border-radius:2px;pointer-events:none;background:var(--ctl-good,#3fc27e);box-shadow:0 0 8px var(--ctl-good,#3fc27e)}
.ctl-ticks{position:absolute;left:0;right:0;bottom:-1px;height:12px;pointer-events:none}
.ctl-t{position:absolute;transform:translateX(-50%);font-size:9.5px;color:var(--ctl-muted,#8a8f98);white-space:nowrap}
.ctl-t[style*="left:0"]{transform:none}.ctl-t.end{transform:translateX(-100%);color:var(--ctl-good,#3fc27e);font-weight:700}
.ctl-tip{position:absolute;z-index:20;left:0;top:0;max-width:min(320px,90%);padding:7px 10px;border-radius:10px;pointer-events:none;
  font-size:12px;line-height:1.35;font-weight:600;color:#f3f5f8;background:rgba(14,17,23,.94);border:1px solid rgba(255,255,255,.12);
  box-shadow:0 10px 26px -10px rgba(0,0,0,.7);opacity:0;transform:translateY(4px);transition:opacity .12s,transform .12s;white-space:normal}
.ctl-tip.on{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.ctl-now,.ctl-c.run{animation:none}}
`;

/**
 * Tooltips for the parts inside `root` (a shadow root or element; listeners are added once). The tip element is made
 * inside `host(target)` – the closest positioned box that holds the timeline – so it survives the timeline being drawn
 * again. A tap on a touch screen shows the tip (and does not reach the card's own tap action).
 */
export function ctlTips(root, host = (el) => el.closest(".ctl-host") || el.closest(".ctl-tl")?.parentElement) {
  if (!root || root.__ctlTips) return;
  root.__ctlTips = true;
  let shown = null;
  const tipFor = (box) => {
    let tip = box.querySelector(":scope > .ctl-tip");
    if (!tip) { tip = document.createElement("div"); tip.className = "ctl-tip"; tip.setAttribute("role", "tooltip"); box.appendChild(tip); }
    return tip;
  };
  const hide = () => {
    if (!shown) return;
    shown.tip.classList.remove("on");
    shown.seg?.removeAttribute("data-on");
    shown = null;
  };
  const show = (seg) => {
    const box = host(seg); if (!box) return;
    const tip = tipFor(box);
    if (shown && shown.seg !== seg) shown.seg?.removeAttribute("data-on");
    tip.textContent = seg.dataset.tip;
    seg.setAttribute("data-on", "");
    const b = box.getBoundingClientRect(); const s = seg.getBoundingClientRect();
    const w = tip.offsetWidth; const h = tip.offsetHeight;
    const left = Math.max(4, Math.min(b.width - w - 4, s.left - b.left + s.width / 2 - w / 2));
    const above = s.top - b.top - h - 8;
    const top = above >= 0 ? above : s.bottom - b.top + 8;
    tip.style.left = `${left}px`; tip.style.top = `${top}px`;
    tip.classList.add("on");
    shown = { tip, seg };
  };
  const segOf = (event) => event.composedPath?.().find((n) => n?.classList?.contains?.("ctl-p")) || null;
  root.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    const seg = segOf(event);
    if (seg) { if (!shown || shown.seg !== seg || !shown.tip.classList.contains("on")) show(seg); } else hide();
  });
  root.addEventListener("pointerout", (event) => {
    if (event.pointerType !== "mouse" || !segOf(event)) return;
    if (!event.relatedTarget?.classList?.contains?.("ctl-p")) hide();
  });
  root.addEventListener("click", (event) => {
    const seg = segOf(event);
    if (!seg) { hide(); return; }
    event.stopPropagation();
    if (shown && shown.seg === seg) hide(); else show(seg);
  }, true);
}
