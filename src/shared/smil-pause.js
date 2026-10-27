// A card's SVG (SMIL) animations run only while it can be seen (Claude AI, 2026-10-27; optimisation round). They are
// paused while the card is off screen, the tab is hidden, or the screen rests (motion-rest's "shc-motion" event).
// SMIL animates geometry, so each running one costs style, layout and paint every frame and motion-rest's sheet cannot
// stop it. Usage: const smil = smilPause(this, () => this.shadowRoot); smil.connect() / smil.disconnect() / smil.apply()
// after a redraw.
export function smilPause(host, rootOf) {
  let visible = true, io = null;
  const apply = () => {
    const run = visible && !document.hidden && !window.shcMotion?.resting;
    rootOf()?.querySelectorAll("svg").forEach((svg) => {
      if (svg.ownerSVGElement || !svg.querySelector("animate,animateTransform,animateMotion,set")) return;
      try { if (run && svg.animationsPaused()) svg.unpauseAnimations(); else if (!run && !svg.animationsPaused()) svg.pauseAnimations(); } catch (_) { /* not an SVG root */ }
    });
  };
  const onChange = () => apply();
  return {
    apply,
    connect() {
      window.addEventListener("shc-motion", onChange);
      document.addEventListener("visibilitychange", onChange);
      if (!io && "IntersectionObserver" in window) { io = new IntersectionObserver((entries) => { visible = entries.some((e) => e.isIntersecting); apply(); }); io.observe(host); }
      apply();
    },
    disconnect() {
      window.removeEventListener("shc-motion", onChange);
      document.removeEventListener("visibilitychange", onChange);
      io?.disconnect(); io = null;
    },
  };
}
