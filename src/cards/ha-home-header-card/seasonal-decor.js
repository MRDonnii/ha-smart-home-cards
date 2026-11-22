// Seasonal decoration for the header card (Claude AI, 2026-11-22; owner: "headerkortet får julestemning med julepynt, og
// til nytår skifter det til nytårspynt, men kun i december og til nytår").
//   1–30 December: a garland of small warm lights along the top edge, a star with a holly sprig, a few hanging baubles
//                  and light snowfall (left out while the weather effect already shows rain, snow or sleet).
//   31 December:   fireworks in the background corners, confetti and serpentines.
//   1 January:     the same, plus a small sparkling "Godt nytår".
// Any other day the card adds nothing: no element, no style, no listener, no animation. Pure CSS/SVG, no assets, no
// network. It sits between the weather background and the content (z-index 2, pointer-events:none), so it never covers
// text. Animations only move transform/opacity, stop with `animation: false` or reduced motion (the static picture
// stays), and pause while the card is off screen or the page is hidden.

// The season for a local date: "" (none), "xmas", "nye" (31 Dec) or "newyear" (1 Jan).
export function seasonOf(date) {
  const m = date.getMonth() + 1, d = date.getDate();
  if (m === 12) return d <= 30 ? "xmas" : "nye";
  if (m === 1 && d === 1) return "newyear";
  return "";
}

// `seasonal_date: "YYYY-MM-DD"` forces a date (for previews); anything else uses the real local date.
export function seasonalDate(forced, now = new Date()) {
  const m = typeof forced === "string" && /^(\d{4})-(\d{2})-(\d{2})$/.exec(forced.trim());
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : now;
}

// Preview from the URL on one device (Claude AI, 2026-11-22; user: "kan jeg se jule tema også med en url?"):
// ?jul=1 → Christmas (15 Dec), ?jul=nytaar → New Year's Eve, ?jul=YYYY-MM-DD → that date, ?jul=0 → back to the real date.
// The choice is remembered on the device (localStorage) until ?jul=0.
const PREVIEW_KEY = "smart-home-seasonal-preview";
export function urlSeasonPreview(search = globalThis.location?.search || "", store = globalThis.localStorage) {
  const v = new URLSearchParams(search).get("jul");
  const year = new Date().getFullYear();
  const map = { "1": `${year}-12-15`, jul: `${year}-12-15`, nytaar: `${year}-12-31`, nytår: `${year}-12-31`, nytaarsdag: `${year + 1}-01-01` };
  try {
    if (v === "0") store?.removeItem(PREVIEW_KEY);
    else if (v && (map[v] || /^\d{4}-\d{2}-\d{2}$/.test(v))) store?.setItem(PREVIEW_KEY, map[v] || v);
    return store?.getItem(PREVIEW_KEY) || undefined;
  } catch { return map[v] || undefined; }
}

const pct = (v) => `${+v.toFixed(2)}%`;

// The garland: 10 swags across the card in a 1000×24 box stretched to the card's width (the wire keeps its width).
const SWAGS = 10, SAG = 12;
const swagY = (t) => 3 + 2 * SAG * t * (1 - t); // a quadratic swag from y=3 down to 3+SAG/2 and back up
const BULB_COLORS = ["#ffd27a", "#ff6b5e", "#ffe9b0", "#7fd88f", "#ffb347", "#ffe9b0", "#ff8fa3", "#ffd27a", "#8fc8ff"];

function garland() {
  let wire = "M0,3";
  for (let i = 0; i < SWAGS; i++) wire += ` Q${i * 100 + 50},${3 + SAG} ${(i + 1) * 100},3`;
  const bulbs = [];
  let n = 0;
  for (let i = 0; i < SWAGS; i++) for (const t of [0.22, 0.5, 0.78]) {
    const c = BULB_COLORS[n % BULB_COLORS.length];
    bulbs.push(`<i class="bulb" style="left:${pct(i * 10 + t * 10)};top:${(swagY(t) - 1).toFixed(1)}px;--c:${c};animation-delay:${-((n * 0.77) % 3.1).toFixed(2)}s;animation-duration:${(2.4 + (n % 4) * 0.45).toFixed(2)}s"></i>`);
    n++;
  }
  return `<div class="lights"><svg class="garland" viewBox="0 0 1000 24" preserveAspectRatio="none"><path class="green" d="${wire}"/><path class="wire" d="${wire}"/></svg>${bulbs.join("")}</div>`;
}

const STAR = `<svg class="star" viewBox="-12 -12 24 24"><path d="M0,-10 L2.6,-3.4 9.5,-3.1 4.1,1.3 5.9,8.1 0,4.3 -5.9,8.1 -4.1,1.3 -9.5,-3.1 -2.6,-3.4Z"/></svg>`;
const HOLLY = `<svg class="holly" viewBox="0 0 40 16"><path d="M20,8 C15,2 9,3 3,5 C6,6 6,8 5,10 C8,9 10,11 11,13 C13,10 17,10 20,8Z" fill="#2f7d46"/><path d="M20,8 C25,2 31,3 37,5 C34,6 34,8 35,10 C32,9 30,11 29,13 C27,10 23,10 20,8Z" fill="#3a8f52"/><circle cx="17.5" cy="10" r="2.3" fill="#d8323c"/><circle cx="22.5" cy="10" r="2.3" fill="#e2414a"/><circle cx="20" cy="12.6" r="2.3" fill="#c92a35"/></svg>`;

function baubles() {
  // [class, colour, string length px]
  const b = [["b1", "#d8323c", 14], ["b2", "#e0b84f", 7], ["b3", "#3c8fd0", 11]];
  return b.map(([k, c, s], i) => `<span class="bauble ${k}" style="--c:${c};--s:${s}px;animation-delay:${-i * 1.3}s"><i></i></span>`).join("");
}

// Fixed, scattered positions so a redraw never moves anything.
const SCATTER = [[4, 0], [11, 37], [17, 71], [23, 18], [29, 55], [35, 88], [41, 9], [47, 46], [53, 79], [59, 27], [65, 64], [71, 3], [77, 41], [83, 75], [89, 22], [95, 58]];

function snow() {
  return SCATTER.map(([x, y], i) => `<i class="flake" style="left:${x + (i % 3)}%;--y:${y};--z:${(i % 3) * 0.6 + 1.6}px;animation-delay:${-((i * 1.37) % 9).toFixed(2)}s;animation-duration:${(8 + (i % 5) * 1.3).toFixed(1)}s"></i>`).join("");
}

const CONFETTI_COLORS = ["#ffd36b", "#ff7ab6", "#6fd8ff", "#b6f36b", "#c79bff", "#ff9a5a"];
function confetti() {
  return SCATTER.map(([x, y], i) => `<i class="confetto" style="left:${x + 1}%;--y:${y};--c:${CONFETTI_COLORS[i % 6]};--r:${(i * 47) % 180}deg;animation-delay:${-((i * 1.91) % 11).toFixed(2)}s;animation-duration:${(9 + (i % 4) * 1.6).toFixed(1)}s"></i>`).join("");
}

function burst(k, a, b, delay) {
  let rays = "";
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang), col = i % 2 ? b : a;
    rays += `<line x1="${(c * 6).toFixed(2)}" y1="${(s * 6).toFixed(2)}" x2="${(c * 15).toFixed(2)}" y2="${(s * 15).toFixed(2)}" stroke="${col}"/><circle cx="${(c * 18).toFixed(2)}" cy="${(s * 18).toFixed(2)}" r="1.1" fill="${col}"/>`;
  }
  return `<svg class="burst ${k}" viewBox="-20 -20 40 40" style="animation-delay:${delay}s"><circle r="1.8" fill="#fff6d8"/>${rays}</svg>`;
}

const SERPENTINE = (k, c) => `<svg class="serp ${k}" viewBox="0 0 20 40"><path d="M10,0 C2,5 18,9 10,14 C2,19 18,23 10,28 C4,32 14,36 8,40" stroke="${c}"/></svg>`;

const CSS = `
.season{position:absolute;inset:0;z-index:2;overflow:hidden;pointer-events:none;border-radius:inherit;contain:strict;container-type:size}
.season *{pointer-events:none}
.season .lights{position:absolute;left:0;top:0;width:100%;height:36px;-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 13%,#000 85%,transparent 97%);mask-image:linear-gradient(90deg,transparent 0,#000 13%,#000 85%,transparent 97%)}
.season .garland{position:absolute;left:0;top:0;width:100%;height:24px;overflow:visible}
.season .garland path{fill:none;vector-effect:non-scaling-stroke;stroke-linecap:round}
.season .garland .green{stroke:#2e6b3d;stroke-width:5;opacity:.45}
.season .garland .wire{stroke:#1f4a2a;stroke-width:1.4;opacity:.9}
.season .bulb{position:absolute;width:4.5px;height:7px;margin-left:-2.25px;border-radius:50% 50% 45% 45%/60% 60% 40% 40%;background:var(--c);box-shadow:0 0 5px 1px color-mix(in srgb,var(--c) 75%,transparent),0 0 12px 2px color-mix(in srgb,var(--c) 30%,transparent);opacity:.95;animation:season-twinkle 2.8s ease-in-out infinite}
.season .bulb:before{content:"";position:absolute;left:1px;top:-2px;width:3px;height:2.5px;border-radius:1px;background:#4b5b4f}
.season .star{position:absolute;left:50%;top:0;width:17px;height:17px;margin-left:-8.5px;fill:#ffd65c;filter:drop-shadow(0 0 4px rgba(255,205,90,.85));animation:season-glow 4s ease-in-out infinite}
.season .holly{position:absolute;left:50%;top:0;width:34px;height:12px;margin-left:-17px}
.season .bauble{position:absolute;top:3px;width:13px;margin-left:-6.5px;transform-origin:50% 0;animation:season-sway 6s ease-in-out infinite}
.season .bauble:before{content:"";display:block;width:1px;height:var(--s);margin:0 auto;background:rgba(200,180,120,.7)}
.season .bauble i{display:block;width:13px;height:13px;border-radius:50%;background:radial-gradient(circle at 35% 32%,rgba(255,255,255,.85) 0 1.5px,color-mix(in srgb,var(--c) 70%,#fff) 2.5px,var(--c) 55%,color-mix(in srgb,var(--c) 55%,#000) 100%);box-shadow:0 1px 3px rgba(0,0,0,.3)}
.season .bauble i:before{content:"";display:block;width:5px;height:3px;margin:-2px auto 0;border-radius:1px;background:#c9a94f}
.season .b1{left:30%}.season .b2{left:36.4%}.season .b3{left:70%}
.season .flake{position:absolute;top:0;width:var(--z);height:var(--z);border-radius:50%;background:color-mix(in srgb,var(--primary-text-color,#fff) 22%,#e4eef8);opacity:.7;transform:translateY(calc(var(--y) * 1cqh));animation:season-fall 10s linear infinite}
@keyframes season-twinkle{0%,100%{opacity:.95}45%{opacity:.5}60%{opacity:1}}
@keyframes season-glow{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.8;transform:scale(.92)}}
@keyframes season-sway{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
@keyframes season-fall{from{transform:translate(0,-6px)}50%{transform:translate(6px,50cqh)}to{transform:translate(0,100cqh)}}
.season .burst{position:absolute;width:var(--w,46px);height:var(--w,46px);overflow:visible;opacity:.7;animation:season-burst 4.2s ease-out infinite}
.season .burst line{stroke-width:1.6;stroke-linecap:round}
.season .f1{left:-10px;bottom:-12px;--w:62px}.season .f2{right:23%;bottom:-16px;--w:58px}.season .f3{left:24%;top:8px;--w:40px}.season .f4{left:70%;top:4px;--w:34px}
.season .confetto{position:absolute;width:3px;height:6px;border-radius:1px;background:var(--c);opacity:.6;top:0;transform:translateY(calc(var(--y) * 1cqh)) rotate(var(--r));animation:season-confetti 11s linear infinite}
.season .serp{position:absolute;top:-2px;width:12px;height:30px;overflow:visible}
.season .serp path{fill:none;stroke-width:2;stroke-linecap:round;opacity:.85}
.season .s1{left:31%}.season .s2{left:63%}
.season .ny{position:absolute;left:50%;top:1px;transform:translateX(-50%);white-space:nowrap;font-size:10px;line-height:11px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:#e0a92e;--g1:color-mix(in srgb,#e0a92e 72%,var(--primary-text-color,#fff));--g2:color-mix(in srgb,#fff2c4 60%,var(--primary-text-color,#fff));background:linear-gradient(100deg,var(--g1) 20%,var(--g2) 40%,var(--g1) 55%,var(--g1) 75%) 0 0/250% 100%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 0 4px rgba(255,200,90,.45));animation:season-shimmer 3.5s linear infinite}
@keyframes season-burst{0%{transform:scale(.2);opacity:0}12%{opacity:.9}55%{transform:scale(1);opacity:.75}100%{transform:scale(1.08);opacity:0}}
@keyframes season-confetti{from{transform:translateY(-8px) rotate(var(--r))}to{transform:translateY(100cqh) rotate(calc(var(--r) + 540deg))}}
@keyframes season-shimmer{to{background-position:-250% 0}}
@container (max-width:700px){.season .b1,.season .f3{display:none}.season .b2{left:43.6%}.season .b3{left:63.6%}.season .s1{left:30%}.season .s2{left:74%}.season .f2{right:auto;left:58%;bottom:-24px;--w:52px}.season .f4{left:40%;top:auto;bottom:2px}.season .holly{display:none}.season .flake:nth-child(2n),.season .confetto:nth-child(2n){display:none}}
.season.paused *{animation-play-state:paused!important}
.no-animation .season *{animation:none!important}
@media (prefers-reduced-motion:reduce){.season *{animation:none!important}}
`;

// The decoration's markup (with its own <style>) for a season; "" for none.
export function seasonHtml(season, { snow: withSnow = false } = {}) {
  if (season === "xmas") return `<style>${CSS}</style>${garland()}${HOLLY}${STAR}${baubles()}${withSnow ? snow() : ""}`;
  if (season === "nye" || season === "newyear") return `<style>${CSS}</style>${burst("f1", "#ffd36b", "#ff7ab6", 0)}${burst("f2", "#6fd8ff", "#b6f36b", -2.1)}${burst("f3", "#c79bff", "#ffd36b", -1.1)}${burst("f4", "#ff9a5a", "#6fd8ff", -3.2)}${confetti()}${SERPENTINE("s1", "#ff7ab6")}${SERPENTINE("s2", "#6fd8ff")}${season === "newyear" ? `<div class="ny">✦ Godt nytår ✦</div>` : ""}`;
  return "";
}
