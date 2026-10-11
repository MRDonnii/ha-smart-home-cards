/**
 * Cards that redraw part of themselves with innerHTML remove the control that was just tapped. WebKit (Safari and the
 * Home Assistant apps on iPhone, iPad and Mac) then scrolls the page up to the card itself. Run such a redraw through
 * keepScroll: the page and every scrolled container around the card are put back before anything is painted, and
 * the tapped control (the new one with the same data-* attributes) gets the focus back without scrolling.
 * By Claude AI.
 */
export function keepScroll(host, render) {
  const saved = [];
  for (let node = host; node; node = node.parentNode || node.host) {
    if (node.nodeType === 1 && node.scrollHeight > node.clientHeight) saved.push([node, node.scrollTop, node.scrollLeft]);
  }
  const x = window.scrollX;
  const y = window.scrollY;
  const root = host.shadowRoot;
  const focused = root?.activeElement;
  const key = focused && Object.keys(focused.dataset || {}).length
    ? Object.entries(focused.dataset).map(([k, v]) => `[data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${CSS.escape(v)}"]`).join("")
    : "";
  const restore = () => {
    for (const [el, top, left] of saved) {
      if (el.scrollTop !== top) el.scrollTop = top;
      if (el.scrollLeft !== left) el.scrollLeft = left;
    }
    if (window.scrollY !== y || window.scrollX !== x) window.scrollTo(x, y);
  };
  try {
    return render();
  } finally {
    // Focus first: WebKit may scroll to a focused control even with preventScroll.
    if (key && !focused.isConnected) root.querySelector(key)?.focus({ preventScroll: true });
    restore();
    // WebKit can move the page again while the new icons and child cards finish drawing (the page may also be briefly
    // shorter): put it back once more right before the next paint, unless the user scrolled in the meantime.
    let moved = false;
    const mark = () => { moved = true; };
    const opts = { capture: true, passive: true };
    for (const type of ["touchmove", "wheel", "keydown"]) window.addEventListener(type, mark, opts);
    requestAnimationFrame(() => {
      for (const type of ["touchmove", "wheel", "keydown"]) window.removeEventListener(type, mark, opts);
      if (!moved) restore();
    });
  }
}
