/*
 * Live energiflow:  El-net ─┐            ┌─ Målte grupper
 *                           ├──▶ Hjem ──▶├─ Billader
 *               Fjernvarme ─┘            └─ Umålt
 *
 * Noder er HTML placeret i procent. Forbindelserne er én SVG i containerens egne pixels,
 * så kurverne ikke forvrænges — geometrien genberegnes kun når ResizeObserver melder en
 * reel størrelsesændring (samlet i én requestAnimationFrame).
 * Bevægelsen er en stiplet stroke-dashoffset-animation, som kun kører på aktive linjer og
 * hvis hastighed følger effekten (afrundet, så animationen ikke genstartes ved hver måling).
 */

import { escapeHtml, fmtPower, icon } from "../utils/format.js";

const ACTIVE_W = 5;

const NODES = [
  { key: "grid", x: 13, y: 26, label: "El-net", icon: "mdi:transmission-tower", tone: "el" },
  { key: "heat", x: 13, y: 70, label: "Fjernvarme", icon: "mdi:radiator", tone: "heat" },
  { key: "home", x: 50, y: 46, label: "Hjem", icon: "mdi:home-lightning-bolt-outline", tone: "home", big: true },
  { key: "measured", x: 87, y: 13, label: "Målte grupper", icon: "mdi:chart-donut", tone: "el" },
  { key: "ev", x: 87, y: 46, label: "Billader", icon: "mdi:car-electric", tone: "ev" },
  { key: "unmeasured", x: 87, y: 79, label: "Umålt", icon: "mdi:help-circle-outline", tone: "muted" },
];

const LINKS = [
  ["grid", "home"],
  ["heat", "home"],
  ["home", "measured"],
  ["home", "ev"],
  ["home", "unmeasured"],
];

const toneOf = (key) => NODES.find((n) => n.key === key).tone;

export class EnergyFlow {
  /** @param entities { key → entity-id } til more-info på noderne */
  constructor(host, entities = {}) {
    this.host = host;
    this.size = { w: 0, h: 0 };
    host.classList.add("flow");
    host.innerHTML = `
      <svg class="flow-lines" aria-hidden="true">${LINKS.map(
    ([a, b]) => `<path class="track" data-l="${a}-${b}"/><path class="dash tone-${toneOf(a === "home" ? b : a)}" data-d="${a}-${b}"/>`,
  ).join("")}</svg>
      ${NODES.map(
    (n) => `<div class="fnode tone-${n.tone} ${n.big ? "big" : ""} ${entities[n.key] ? "clickable" : ""}" ${entities[n.key] ? `data-entity="${escapeHtml(entities[n.key])}" tabindex="0" role="button"` : ""} style="left:${n.x}%;top:${n.y}%">
        <span class="fbubble">${icon(n.icon)}</span>
        <span class="fval num"><b data-v="${n.key}">—</b><small data-u="${n.key}">W</small></span>
        <span class="flabel">${n.label}</span>
      </div>`,
  ).join("")}`;
    this.svg = host.querySelector("svg");
    this.paths = {};
    this.dashes = {};
    host.querySelectorAll("path[data-l]").forEach((p) => (this.paths[p.dataset.l] = p));
    host.querySelectorAll("path[data-d]").forEach((p) => (this.dashes[p.dataset.d] = p));
    this.vEls = {};
    this.uEls = {};
    host.querySelectorAll("[data-v]").forEach((el) => (this.vEls[el.dataset.v] = el));
    host.querySelectorAll("[data-u]").forEach((el) => (this.uEls[el.dataset.u] = el));
    this.values = {};
  }

  connect() {
    if (this.ro || typeof ResizeObserver !== "function") return;
    this.ro = new ResizeObserver(() => {
      if (this.frame) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = undefined;
        this._layout();
      });
    });
    this.ro.observe(this.host);
  }

  disconnect() {
    this.ro?.disconnect();
    this.ro = undefined;
    cancelAnimationFrame(this.frame);
    this.frame = undefined;
  }

  _layout() {
    const w = Math.round(this.host.clientWidth);
    const h = Math.round(this.host.clientHeight);
    if (!w || !h || (w === this.size.w && h === this.size.h)) return;
    this.size = { w, h };
    this.svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const pos = Object.fromEntries(NODES.map((n) => [n.key, [(n.x / 100) * w, (n.y / 100) * h]]));
    for (const [a, b] of LINKS) {
      const [x1, y1] = pos[a];
      const [x2, y2] = pos[b];
      const dx = (x2 - x1) * 0.55;
      const d = `M${x1.toFixed(1)},${y1.toFixed(1)} C${(x1 + dx).toFixed(1)},${y1.toFixed(1)} ${(x2 - dx).toFixed(1)},${y2.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
      this.paths[`${a}-${b}`].setAttribute("d", d);
      this.dashes[`${a}-${b}`].setAttribute("d", d);
    }
  }

  /** @param v { grid, heat, home, measured, ev, unmeasured } i watt (undefined = mangler) */
  update(v) {
    for (const n of NODES) {
      const val = v[n.key];
      if (this.values[n.key] === val) continue;
      this.values[n.key] = val;
      const p = fmtPower(val);
      this.vEls[n.key].textContent = p.v;
      this.uEls[n.key].textContent = p.u;
    }
    for (const [a, b] of LINKS) {
      // En forbindelse bærer effekten af den ende der ikke er "Hjem".
      const w = v[a === "home" ? b : a];
      const active = Number.isFinite(w) && w > ACTIVE_W;
      const dash = this.dashes[`${a}-${b}`];
      const dur = active ? Math.max(0.6, 3.2 - 0.8 * Math.log10(w / 10)).toFixed(1) : "";
      if (dash.__dur === dur) continue;
      dash.__dur = dur;
      dash.classList.toggle("on", active);
      if (active) dash.style.setProperty("--dur", `${dur}s`);
    }
  }
}
