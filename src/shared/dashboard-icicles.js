// Icicles on the dashboard cards when it freezes (Claude AI, 2026-11-22; user: "små istapper på kort i HA, sådan på en
// diskret måde" + an on/off switch and temperature limits in the settings menu). Opt-in, driven by helpers:
//   input_boolean.dashboard_istapper           → on/off (missing helper = off, so nothing happens on other HAs)
//   input_number.dashboard_istapper_til        → icicles appear when the outdoor temperature drops below this (°C, default 0)
//   input_number.dashboard_istapper_fra        → and disappear again when it rises to this or above (°C, default 1)
//   input_text.dashboard_istapper_sensor       → optional: the outdoor temperature sensor; else the first weather entity
// Preview: add ?istapper=1 to the dashboard URL (only while it is in the address).
// A transparent layer over the page (pointer-events: none) draws small icicles along the top edge of each innermost
// rounded card/tile. It never touches the cards' own DOM, so taps and redraws are not affected; icicles on a card that a
// popup or dialog covers are hidden. Nothing runs while the switch is off or the page is hidden.
(() => {
  if (window.__smartHomeIcicles) return;
  window.__smartHomeIcicles = true;
  const H = { on: "input_boolean.dashboard_istapper", below: "input_number.dashboard_istapper_til",
    above: "input_number.dashboard_istapper_fra", sensor: "input_text.dashboard_istapper_sensor" };
  let layer = null; let boxes = []; let lastScan = 0; let lastPath = ""; let frozen = false; let timer = null;

  // Preview only while ?istapper=1 is in the address (not remembered, so a kiosk never gets stuck in it).
  const preview = () => new URLSearchParams(location.search).get("istapper") === "1";

  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : NaN; };
  function outdoor(states) {
    const id = states[H.sensor]?.state;
    if (id && states[id]) return num(states[id].state);
    const w = Object.keys(states).find((k) => k.startsWith("weather."));
    return w ? num(states[w].attributes?.temperature) : NaN;
  }
  // Hysteresis: on below "til", off again at or above "fra", so it does not flicker around the limit.
  function active() {
    if (preview()) return true;
    const states = document.querySelector("home-assistant")?.hass?.states;
    if (!states || states[H.on]?.state !== "on") return (frozen = false);
    const t = outdoor(states);
    if (!Number.isFinite(t)) return frozen;
    const below = Number.isFinite(num(states[H.below]?.state)) ? num(states[H.below].state) : 0;
    let above = Number.isFinite(num(states[H.above]?.state)) ? num(states[H.above].state) : below + 1;
    if (above < below) above = below;
    if (!frozen && t < below) frozen = true;
    else if (frozen && t >= above) frozen = false;
    return frozen;
  }

  function ensureLayer() {
    if (layer?.isConnected) return layer;
    layer = document.createElement("div");
    layer.id = "smart-home-icicles";
    layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2;overflow:hidden;contain:strict";
    const st = document.createElement("style");
    st.textContent = `
      #smart-home-icicles svg{position:absolute;left:0;top:0;overflow:visible;transition:opacity .6s}
      #smart-home-icicles .drip{animation:shc-icicle-drip var(--d) linear var(--del) infinite;opacity:0}
      @keyframes shc-icicle-drip{0%,88%{transform:translateY(0);opacity:0}90%{opacity:.75}100%{transform:translateY(22px);opacity:0}}
      @media (prefers-reduced-motion: reduce){#smart-home-icicles .drip{display:none}}`;
    layer.appendChild(st);
    document.body.appendChild(layer);
    return layer;
  }

  // Pseudo-random but stable per card, so the icicles do not jump around between rescans.
  const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  function makeSvg(w, seed, radius) {
    const r = rng((seed % 2147483646) + 7);
    const pad = Math.max(radius, 10);
    const span = w - pad * 2;
    const n = Math.max(3, Math.round(span / 26));
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", w);
    svg.setAttribute("height", 30);
    const gid = `shc-ice-${seed}`;
    let parts = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#eaf6ff" stop-opacity=".9"/><stop offset=".6" stop-color="#cfeaff" stop-opacity=".45"/>
      <stop offset="1" stop-color="#cfeaff" stop-opacity="0"/></linearGradient></defs>
      <path d="M${pad} 0.8 H${w - pad}" stroke="#eaf6ff" stroke-opacity=".38" stroke-width="1.2" stroke-linecap="round"/>`;
    let drips = 0;
    for (let i = 0; i < n; i++) {
      const x = pad + (span * (i + 0.2 + r() * 0.6)) / n;
      if (r() < 0.25) continue; // gaps, so it looks natural
      const long = r() < 0.15;
      const len = long ? 12 + r() * 7 : 4 + r() * 7;
      const hw = long ? 2.2 + r() * 0.8 : 1.3 + r() * 1.1;
      parts += `<path d="M${(x - hw).toFixed(1)} 0.5 Q${(x - hw * 0.35).toFixed(1)} ${(len * 0.55).toFixed(1)} ${x.toFixed(1)} ${len.toFixed(1)} Q${(x + hw * 0.35).toFixed(1)} ${(len * 0.55).toFixed(1)} ${(x + hw).toFixed(1)} 0.5 Z" fill="url(#${gid})"/>`;
      if (long && drips < 1) {
        drips++;
        parts += `<circle class="drip" style="--d:${(14 + r() * 12).toFixed(1)}s;--del:${(-r() * 20).toFixed(1)}s" cx="${x.toFixed(1)}" cy="${(len + 1.2).toFixed(1)}" r="1" fill="#dff1ff"/>`;
      }
    }
    svg.innerHTML = parts;
    return svg;
  }

  // The innermost rounded boxes with a background or border, across shadow DOM.
  function scan() {
    const cands = [];
    const walk = (root) => {
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) walk(el.shadowRoot);
        if (el === layer) continue;
        const rc = el.getBoundingClientRect();
        if (rc.width < 120 || rc.height < 60 || rc.width > 2400) continue;
        const cs = getComputedStyle(el);
        const rad = parseFloat(cs.borderTopLeftRadius) || 0;
        if (rad < 8 || cs.visibility === "hidden" || cs.display === "contents") continue;
        const bg = cs.backgroundImage !== "none" || !/rgba\(.*,\s*0\)|transparent/.test(cs.backgroundColor);
        if (!bg && !(parseFloat(cs.borderTopWidth) > 0)) continue;
        cands.push({ el, rc, rad });
      }
    };
    walk(document);
    const inside = (a, b) => a !== b && a.rc.left >= b.rc.left - 1 && a.rc.right <= b.rc.right + 1 && a.rc.top >= b.rc.top - 1 && a.rc.bottom <= b.rc.bottom + 1;
    const same = (a, b) => Math.abs(a.rc.left - b.rc.left) < 2 && Math.abs(a.rc.top - b.rc.top) < 2 && Math.abs(a.rc.width - b.rc.width) < 2 && Math.abs(a.rc.height - b.rc.height) < 2;
    const flush = (a, b) => Math.abs(a.rc.left - b.rc.left) < 3 && Math.abs(a.rc.right - b.rc.right) < 3;
    // innermost: nothing else lies inside, unless it spans the full width (e.g. a camera image under the card title)
    const leaf = cands.filter((c) => !cands.some((o) => inside(o, c) && !same(o, c) && !flush(o, c)));
    const out = [];
    for (const c of leaf) {
      if (leaf.some((o) => o !== c && inside(c, o) && flush(c, o) && !same(c, o))) continue; // the outer card draws it
      const i = out.findIndex((o) => same(o, c));
      if (i < 0) out.push(c); else out[i] = c;
    }
    return out;
  }

  // Is the card's top edge visible (not under a popup/dialog)? elementFromPoint skips our pointer-events:none layer.
  function deepHit(x, y) {
    let e = document.elementFromPoint(x, y);
    while (e?.shadowRoot) { const n = e.shadowRoot.elementFromPoint(x, y); if (!n || n === e) break; e = n; }
    return e;
  }
  const containsDeep = (box, e) => { for (let n = e; n; n = n.parentNode || n.host) if (n === box) return true; return false; };

  function place(checkCover) {
    for (const b of boxes) {
      const rc = b.el.getBoundingClientRect();
      const ok = b.el.isConnected && rc.width > 0 && rc.bottom > 0 && rc.top < innerHeight;
      if (ok && checkCover) { const hit = deepHit(rc.left + rc.width / 2, Math.max(0, rc.top) + 4); b.covered = !hit || !containsDeep(b.el, hit); }
      b.svg.style.opacity = ok && !b.covered ? "1" : "0";
      b.svg.style.transform = `translate(${rc.left}px,${rc.top}px)`;
    }
  }
  function clear() { boxes.forEach((b) => b.svg.remove()); boxes = []; }
  function rebuild() {
    if (!active()) return;
    clear();
    const L = ensureLayer();
    scan().forEach((c, i) => {
      const w = Math.round(c.rc.width);
      const svg = makeSvg(w, Math.round(c.rc.width * 31 + c.rc.height * 7 + i), c.rad);
      L.appendChild(svg);
      boxes.push({ el: c.el, svg, w, covered: false });
    });
    lastScan = Date.now();
    place(true);
  }
  function tick() {
    if (!active() || document.visibilityState !== "visible") {
      if (boxes.length) clear();
      if (layer) layer.style.display = "none";
      lastPath = "";
      return;
    }
    ensureLayer().style.display = "";
    const changed = location.pathname !== lastPath || boxes.some((b) => !b.el.isConnected || Math.abs(b.el.getBoundingClientRect().width - b.w) > 2);
    if (changed || Date.now() - lastScan > 60000) { lastPath = location.pathname; setTimeout(rebuild, changed ? 1500 : 0); } else place(true);
  }

  let raf = 0;
  const onMove = () => { if (boxes.length && !raf) raf = requestAnimationFrame(() => { raf = 0; place(false); }); };
  addEventListener("scroll", onMove, { capture: true, passive: true });
  addEventListener("resize", () => { lastScan = 0; onMove(); });
  const start = () => { if (!timer) timer = setInterval(tick, 1500); };
  start();
  addEventListener("pagehide", () => { clearInterval(timer); timer = null; });
  addEventListener("pageshow", start);
})();
