/*
 * Fælles grundlag for kortets fem sektioner.
 *
 * Livscyklus (styres af kortet):
 *   html()            → markup, kaldes første gang sektionen vises (lazy DOM)
 *   mount(root)       → slå refs op én gang
 *   ids()             → entity-ids sektionen lytter på (kortet differ kun disse)
 *   update(changed)   → changed = Set af ændrede ids, eller null = alt (første visning)
 *   shown()           → sektionen er blevet synlig (grafer lazy-loader via IntersectionObserver)
 *   hourTick()        → ny time: forny statistikafhængige tal
 */

export class Section {
  constructor(card) {
    this.card = card;
    this.refs = {};
    this.panels = [];
  }

  html() {
    return "";
  }

  mount(root) {
    this.root = root;
    root.querySelectorAll("[data-ref]").forEach((el) => {
      this.refs[el.dataset.ref] = el;
    });
    for (const p of this.panels) p.mount(root);
  }

  ids() {
    return [];
  }

  update() {}

  shown() {
    for (const p of this.panels) p.observe();
  }

  hourTick() {
    for (const p of this.panels) p.refresh();
  }

  onLive(changed) {
    for (const p of this.panels) p.onLive(changed);
  }

  /* ---------- DOM-hjælpere: skriv kun når værdien faktisk ændrer sig ---------- */

  text(ref, value, pulse = false) {
    const el = typeof ref === "string" ? this.refs[ref] : ref;
    if (!el || el.__v === value) return;
    const first = el.__v === undefined;
    el.__v = value;
    el.textContent = value;
    if (pulse && !first) this.card.pulse(el);
  }

  /** Sætter { v, u } fra fmtPower/fmtEnergy på et .v/.u-par. */
  value(prefix, pair, pulse = false) {
    this.text(`${prefix}V`, pair.v, pulse);
    this.text(`${prefix}U`, pair.u);
  }

  show(ref, visible) {
    const el = typeof ref === "string" ? this.refs[ref] : ref;
    if (el && el.hidden === visible) el.hidden = !visible;
  }

  tone(ref, tone) {
    const el = typeof ref === "string" ? this.refs[ref] : ref;
    if (!el || el.__tone === tone) return;
    if (el.__tone) el.classList.remove(`tone-${el.__tone}`);
    if (tone) el.classList.add(`tone-${tone}`);
    el.__tone = tone;
  }

  style(ref, prop, value) {
    const el = typeof ref === "string" ? this.refs[ref] : ref;
    const key = `__s_${prop}`;
    if (!el || el[key] === value) return;
    el[key] = value;
    el.style.setProperty(prop, value);
  }

  /** Bar-fyld via transform: scaleX (0–1). */
  bar(ref, fraction) {
    const f = Number.isFinite(fraction) ? Math.min(Math.max(fraction, 0), 1) : 0;
    this.style(ref, "--p", f.toFixed(3));
  }

  /**
   * Shows only the parts that are set up (`items` = [[ref, visible], …]) and tells the grid how many are left
   * (`data-n`), so the remaining tiles share the row instead of leaving gaps. Returns that number (Claude AI).
   */
  fit(grid, items) {
    let n = 0;
    for (const [ref, on] of items) {
      this.show(ref, on);
      if (on) n += 1;
    }
    const el = typeof grid === "string" ? this.refs[grid] : grid;
    if (el && el.dataset.n !== String(n)) el.dataset.n = String(n);
    return n;
  }

  /** Swaps the grid width class (a-full / a-half / a-third) of a layout child. */
  span(ref, cls) {
    const el = typeof ref === "string" ? this.refs[ref] : ref;
    if (!el || el.classList.contains(cls)) return;
    el.classList.remove("a-full", "a-half", "a-third");
    el.classList.add(cls);
  }

  /** Runs `apply` only when the set-up signature of `keys` changed (the card's parts follow what HA has). */
  setupChanged(keys) {
    const sig = keys.map((k) => (typeof k === "boolean" ? k : this.card.has(k)) ? 1 : 0).join("");
    if (sig === this._setupSig) return false;
    this._setupSig = sig;
    return true;
  }

  setIcon(ref, name) {
    const el = typeof ref === "string" ? this.refs[ref] : ref;
    if (el && el.__icon !== name) {
      el.__icon = name;
      el.setAttribute("icon", name);
    }
  }
}
