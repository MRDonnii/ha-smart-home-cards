/**
 * HA Energy Center Card
 *
 * Hjemmets energioverblik i ét custom card: Oversigt, Strøm, Fjernvarme, Vand og Billader.
 *
 * Arkitektur
 *  - Shell (header + faner + popup) bygges én gang pr. konfiguration.
 *  - Hver sektion bygger først sin DOM, første gang den vises (lazy).
 *  - `set hass` gemmer kun hass og planlægger én requestAnimationFrame. Flush differ
 *    state-objekterne for den synlige sektions egne entities (HA udskifter objektet ved
 *    ændring) og opdaterer kun sektionen, hvis mindst ét af dem er ændret. DOM-skrivninger
 *    sker kun når den formatterede værdi faktisk er ny.
 *  - Skjult kort/fane/browserfane → ingen opdateringer; ved genvisning diffes der igen.
 *  - Statistik hentes lazy (viewport/fanevalg/periodevalg), batches, caches og beskyttes mod
 *    forældede svar. "I dag"-tal = timestatistik + live-hale, så de følger live-state uden polling.
 */

import { DEFAULT_CONFIG, DEFAULT_ENTITIES, DEFAULT_GROUPS, DEFAULT_PHASES } from "./defaults.js";
import { STYLE } from "./styles.js";
import { StatsStore, sumSince } from "./utils/stats.js";
import { periodRange } from "./components/history.js";
import { HOUR_MS, MINUTE_MS, escapeHtml, fmt, fmtPower, hourKey, icon, normalize, startOfDay, toNumber } from "./utils/format.js";
import { OverviewSection } from "./sections/overview.js";
import { PowerSection, groupSum } from "./sections/power.js";
import { HeatSection } from "./sections/heat.js";
import { WaterSection } from "./sections/water.js";
import { EvSection } from "./sections/ev.js";

const VERSION = "0.2.0";
const CARD_TAG = "ha-energy-center-card";

const TABS = [
  { key: "overview", label: "Oversigt", icon: "mdi:view-dashboard-outline", tone: "el", Section: OverviewSection },
  { key: "power", label: "Strøm", icon: "mdi:flash", tone: "el", Section: PowerSection },
  { key: "heat", label: "Fjernvarme", icon: "mdi:radiator", tone: "heat", Section: HeatSection },
  { key: "water", label: "Vand", icon: "mdi:water", tone: "water", Section: WaterSection },
  { key: "ev", label: "Billader", icon: "mdi:car-electric", tone: "ev", Section: EvSection },
];

const EV_MODES = {
  disconnected: "Ikke tilsluttet",
  connected_requesting: "Tilsluttet – venter",
  connected_charging: "Lader",
  connected_finished: "Færdig",
};

const PULSE_MIN_MS = 1500;

class HaEnergyCenterCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = undefined;
    this.config = undefined;
    this._sections = new Map(); // tab → { section, el, seen: Map, built }
    this._today = new Map(); // stat-id → { sod, rows }
    this._lazy = new Map(); // element → callback
    this._warned = new Set();
    this._visible = true;
    this._connected = false;
    this._frame = 0;
    this._reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.stats = new StatsStore(() => this._hass, (k, ...a) => this.warnOnce(k, ...a));
    this._onVisibility = () => this._updateActivity();
    this.metrics = { flushes: 0, sectionUpdates: 0, lastUpdateMs: 0 };
  }

  /* ---------- Lovelace API ---------- */

  static getStubConfig() {
    return { title: DEFAULT_CONFIG.title };
  }

  setConfig(config) {
    if (config && typeof config !== "object") throw new Error("Ugyldig konfiguration");
    const c = config || {};
    this.config = {
      ...DEFAULT_CONFIG,
      ...c,
      entities: { ...DEFAULT_ENTITIES, ...(c.entities || {}) },
      groups: Array.isArray(c.groups) ? c.groups.filter((g) => g && Array.isArray(g.entities)) : DEFAULT_GROUPS,
      phases: Array.isArray(c.phases) ? c.phases : DEFAULT_PHASES,
    };
    this._buildShell();
    if (this._hass) this._schedule();
  }

  set hass(hass) {
    this._hass = hass;
    if (this.config) this._schedule();
  }

  get hass() {
    return this._hass;
  }

  getCardSize() {
    return 14;
  }

  getGridOptions() {
    return { columns: "full" };
  }

  connectedCallback() {
    this._connected = true;
    document.addEventListener("visibilitychange", this._onVisibility);
    if (typeof IntersectionObserver === "function") {
      this._io = new IntersectionObserver((entries) => {
        this._visible = entries.some((e) => e.isIntersecting);
        this._updateActivity();
      });
      this._io.observe(this);
      this._lazyIo = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const cb = this._lazy.get(e.target);
            this._lazyIo.unobserve(e.target);
            this._lazy.delete(e.target);
            cb?.();
          }
        },
        { rootMargin: "200px 0px" },
      );
      for (const el of this._lazy.keys()) this._lazyIo.observe(el);
    }
    this._current()?.section.flow?.connect();
    this._updateActivity();
  }

  disconnectedCallback() {
    this._connected = false;
    document.removeEventListener("visibilitychange", this._onVisibility);
    this._io?.disconnect();
    this._io = undefined;
    this._lazyIo?.disconnect();
    this._lazyIo = undefined;
    cancelAnimationFrame(this._frame);
    this._frame = 0;
    clearTimeout(this._hourTimer);
    this._hourTimer = undefined;
    for (const s of this._sections.values()) s.section.hidden?.();
    if (this._dlg?.open) this._dlg.close();
  }

  /* ---------- aktivitet ---------- */

  get active() {
    return this._connected && this._visible && document.visibilityState !== "hidden";
  }

  _updateActivity() {
    const active = this.active;
    this.toggleAttribute("paused", !active);
    if (!active) {
      clearTimeout(this._hourTimer);
      this._hourTimer = undefined;
      return;
    }
    this._scheduleHourTick();
    if (this._stale) this._schedule();
    this._checkHour(this._current());
  }

  _scheduleHourTick() {
    if (this._hourTimer) return;
    const now = Date.now();
    // Lidt efter hel time, når HA har kompileret timestatistikken.
    const next = Math.floor(now / HOUR_MS) * HOUR_MS + HOUR_MS + 3 * MINUTE_MS + Math.random() * 30000;
    this._hourTimer = setTimeout(() => {
      this._hourTimer = undefined;
      if (!this.active) return;
      this._checkHour(this._current());
      this._scheduleHourTick();
    }, next - now);
  }

  _checkHour(entry) {
    if (!entry?.built || !this._hass) return;
    const hk = hourKey(Date.now() - 3 * MINUTE_MS);
    if (entry.hour === hk) return;
    const first = entry.hour === undefined;
    entry.hour = hk;
    if (!first) this._safe(`${entry.key}-hour`, () => entry.section.hourTick());
  }

  /* ---------- opdateringsløkke ---------- */

  _schedule() {
    if (this._frame) return;
    this._frame = requestAnimationFrame(() => {
      this._frame = 0;
      this._flush();
    });
  }

  _flush() {
    if (!this._hass || !this.config) return;
    if (!this.active && this._everFlushed) {
      this._stale = true;
      return;
    }
    this._stale = false;
    this._everFlushed = true;
    const t0 = performance.now();
    this.metrics.flushes += 1;
    const entry = this._ensureSection(this._tab);
    if (entry) this._updateSection(entry, false);
    if (this._dlg?.open) this._updateDialog();
    this.metrics.lastUpdateMs = performance.now() - t0;
  }

  _updateSection(entry, force) {
    const states = this._hass.states;
    const changed = new Set();
    for (const id of entry.ids) {
      const obj = states[id];
      if (entry.seen.get(id) !== obj) {
        entry.seen.set(id, obj);
        changed.add(id);
      }
    }
    if (!force && !changed.size) return;
    this.metrics.sectionUpdates += 1;
    this._safe(entry.key, () => entry.section.update(force ? null : changed));
    if (changed.size) this._safe(`${entry.key}-live`, () => entry.section.onLive(changed));
  }

  _ensureSection(key) {
    const entry = this._sections.get(key);
    if (!entry || entry.built || !this._hass) return entry;
    this._safe(`${key}-build`, () => {
      entry.el.innerHTML = entry.section.html();
      entry.section.mount(entry.el);
      entry.ids = [...new Set(entry.section.ids())];
      entry.built = true;
      this._updateSection(entry, true);
      entry.section.shown();
      this._checkHour(entry);
    });
    return entry;
  }

  _current() {
    return this._sections.get(this._tab);
  }

  /* ---------- shell ---------- */

  _buildShell() {
    const c = this.config;
    const saved = this._readTab();
    this._tab = TABS.some((t) => t.key === saved) ? saved : TABS.some((t) => t.key === c.default_tab) ? c.default_tab : "overview";
    this._lazy.clear();
    this._lazyIo?.disconnect();
    for (const s of this._sections.values()) s.section.hidden?.();
    this._sections.clear();
    this._today.clear();
    this.shadowRoot.innerHTML = `
<style>${STYLE}</style>
<div class="shell">
  <header class="top">
    <div class="brand">
      <span class="brand-mark">${icon("mdi:lightning-bolt-circle")}</span>
      <div><h1>${escapeHtml(c.title)}</h1><p>${escapeHtml(c.subtitle)}</p></div>
    </div>
    <nav class="tabs" role="tablist">${TABS.map(
    (t) => `<button type="button" role="tab" class="tab tone-${t.tone} ${t.key === this._tab ? "on" : ""}" data-tab="${t.key}" aria-selected="${t.key === this._tab}">${icon(t.icon)}<span>${t.label}</span></button>`,
  ).join("")}</nav>
  </header>
  <main>${TABS.map((t) => `<div class="panel" data-sec="${t.key}" role="tabpanel" ${t.key === this._tab ? "" : "hidden"}></div>`).join("")}</main>
</div>
<dialog class="detail">
  <div class="dlg-head"><span class="badge tone-el" data-dlg-icon></span><div><h3 data-dlg-title>—</h3><small data-dlg-sum>—</small></div>
    <button type="button" class="dlg-close" data-close aria-label="Luk">${icon("mdi:close")}</button></div>
  <div class="dlg-rows" data-dlg-rows></div>
</dialog>`;
    const root = this.shadowRoot;
    for (const t of TABS) {
      this._sections.set(t.key, { key: t.key, section: new t.Section(this), el: root.querySelector(`[data-sec="${t.key}"]`), seen: new Map(), ids: [], built: false });
    }
    this._dlg = root.querySelector("dialog");
    this._bindEvents();
  }

  _bindEvents() {
    const root = this.shadowRoot;
    root.addEventListener("click", (ev) => {
      const t = ev.target;
      if (t === this._dlg) return this._dlg.close(); // klik på backdrop
      const tab = t.closest?.("[data-tab]");
      if (tab) return this.switchTab(tab.dataset.tab);
      const go = t.closest?.("[data-goto]");
      if (go) return this.switchTab(go.dataset.goto);
      const grp = t.closest?.("[data-group]");
      if (grp) return this.openGroup(Number(grp.dataset.group));
      if (t.closest?.("[data-close]")) return this._dlg.close();
      if (t.closest?.(".seg, .plot")) return;
      const ent = t.closest?.("[data-entity]");
      if (ent?.dataset.entity) this.moreInfo(ent.dataset.entity);
    });
    root.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      const el = ev.target.closest?.("[data-entity][tabindex]");
      if (el && el.tagName !== "BUTTON") {
        ev.preventDefault();
        this.moreInfo(el.dataset.entity);
      }
    });
    this._dlg.addEventListener("close", () => {
      this._dlgGroup = undefined;
    });
  }

  switchTab(key) {
    if (key === this._tab || !this._sections.has(key)) return;
    const prev = this._current();
    prev?.section.hidden?.();
    if (prev) prev.el.hidden = true;
    this._tab = key;
    this._writeTab(key);
    this.shadowRoot.querySelectorAll(".tab").forEach((b) => {
      const on = b.dataset.tab === key;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", String(on));
    });
    const entry = this._sections.get(key);
    entry.el.hidden = false;
    if (!this._reducedMotion) {
      entry.el.classList.remove("enter");
      void entry.el.offsetWidth; // genstart animationen
      entry.el.classList.add("enter");
    }
    if (entry.built) {
      this._updateSection(entry, false);
      entry.section.shown();
      this._checkHour(entry);
    } else this._ensureSection(key);
  }

  _readTab() {
    try {
      return sessionStorage.getItem(`${CARD_TAG}:tab`);
    } catch {
      return undefined;
    }
  }

  _writeTab(key) {
    try {
      sessionStorage.setItem(`${CARD_TAG}:tab`, key);
    } catch {
      /* privat tilstand */
    }
  }

  /* ---------- gruppe-popup ---------- */

  openGroup(index) {
    const g = this.config.groups[index];
    if (!g || !this._dlg) return;
    this._dlgGroup = index;
    const root = this._dlg;
    root.querySelector("[data-dlg-icon]").innerHTML = icon(g.icon || "mdi:flash");
    root.querySelector("[data-dlg-title]").textContent = g.name;
    root.querySelector("[data-dlg-rows]").innerHTML = g.entities
      .map(
        (m, i) => `
      <button type="button" class="drow" data-entity="${escapeHtml(m.entity)}" data-i="${i}">
        <span class="badge sm">${icon(m.icon || this._hass?.states[m.entity]?.attributes?.icon || "mdi:flash")}</span>
        <span class="dn">${escapeHtml(m.name || this._hass?.states[m.entity]?.attributes?.friendly_name || m.entity)}</span>
        <span class="dv num">—</span>
        <span class="gbar"><i></i></span>
        <span class="ds num">—</span>
      </button>`,
      )
      .join("");
    this._dlgRows = [...root.querySelectorAll(".drow")].map((el) => ({
      el,
      v: el.querySelector(".dv"),
      s: el.querySelector(".ds"),
      bar: el.querySelector(".gbar i"),
    }));
    this._dlgSum = root.querySelector("[data-dlg-sum]");
    this._dlgSeen = new Map();
    this._updateDialog(true);
    if (!root.open) root.showModal();
  }

  _updateDialog(force = false) {
    const g = this.config.groups[this._dlgGroup];
    if (!g) return;
    let changed = force;
    for (const m of g.entities) {
      const obj = this._hass.states[m.entity];
      if (this._dlgSeen.get(m.entity) !== obj) {
        this._dlgSeen.set(m.entity, obj);
        changed = true;
      }
    }
    if (!changed) return;
    const sum = groupSum(this, g);
    const vals = g.entities.map((m) => this.wattsOf(m.entity));
    const max = Math.max(1, ...vals.filter(Number.isFinite));
    vals.forEach((w, i) => {
      const row = this._dlgRows[i];
      const p = fmtPower(w);
      row.v.textContent = Number.isFinite(w) ? `${p.v} ${p.u}` : "Ingen data";
      row.s.textContent = Number.isFinite(w) && sum.sum > 0 ? `${fmt((Math.max(w, 0) / sum.sum) * 100, 0)} % af gruppen` : "—";
      row.bar.style.setProperty("--p", Number.isFinite(w) ? (Math.max(w, 0) / max).toFixed(3) : "0");
      row.el.classList.toggle("off", !Number.isFinite(w));
      row.el.style.order = String(Number.isFinite(w) ? Math.round(-w * 10) : 1e9);
    });
    const p = fmtPower(sum.sum);
    this._dlgSum.textContent = `${p.v} ${p.u} i alt · ${g.entities.length} enheder${sum.missing ? ` · ${sum.missing} uden data` : ""}`;
  }

  /* ---------- HA-integration ---------- */

  moreInfo(entityId) {
    if (!entityId) return;
    if (this._dlg?.open) this._dlg.close(); // HA's dialog skal ikke ligge under vores popup
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
  }

  observeLazy(el, cb) {
    if (!this._lazyIo) {
      // Uden IntersectionObserver (eller før connect): hent med det samme / når kortet forbindes.
      if (typeof IntersectionObserver !== "function") return cb();
      this._lazy.set(el, cb);
      return;
    }
    this._lazy.set(el, cb);
    this._lazyIo.observe(el);
  }

  /** Diskret fade/slide når en live-værdi skifter (throttlet, kun når kortet ses). */
  pulse(el) {
    if (this._reducedMotion || !this.active || typeof el.animate !== "function") return;
    const now = performance.now();
    if (el.__pulse && now - el.__pulse < PULSE_MIN_MS) return;
    el.__pulse = now;
    el.animate([{ opacity: 0.45, transform: "translateY(3px)" }, { opacity: 1, transform: "none" }], { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" });
  }

  /* ---------- dataadgang ---------- */

  id(key) {
    return this.config?.entities?.[key] || undefined;
  }

  stateObj(key) {
    const id = this.id(key);
    return id ? this._hass?.states?.[id] : undefined;
  }

  num(key) {
    return toNumber(this.stateObj(key)?.state);
  }

  numOf(entityId) {
    return entityId ? toNumber(this._hass?.states?.[entityId]?.state) : undefined;
  }

  _norm(stateObj, kind, label) {
    const r = normalize(stateObj, kind);
    if (!r.known) this.warnOnce(`unit-${stateObj.entity_id}`, `Ukendt enhed "${r.unit}" på ${stateObj.entity_id} (${label}) – værdien vises ikke`);
    return r.value;
  }

  wattsOf(entityId) {
    const s = entityId ? this._hass?.states?.[entityId] : undefined;
    return s ? this._norm(s, "power", "effekt") : undefined;
  }

  watts(key) {
    return this.wattsOf(this.id(key));
  }

  kwh(key) {
    const s = this.stateObj(key);
    return s ? this._norm(s, "energy", "energi") : undefined;
  }

  flowLpm(key) {
    const s = this.stateObj(key);
    return s ? this._norm(s, "flow", "flow") : undefined;
  }

  /** Live-værdi i statistikkens enhed (kWh / m³ / valuta). */
  statLive(key, kind) {
    const s = this.stateObj(key);
    if (!s) return undefined;
    if (kind === "energy") return this._norm(s, "energy", "energi");
    if (kind === "volume") return this._norm(s, "volume", "volumen");
    return toNumber(s.state);
  }

  /** Henter timestatistik for i dag (deles med "Dag"-graferne via cachen). */
  loadToday(pairs, done) {
    const ids = pairs.map(([k]) => this.id(k)).filter(Boolean);
    if (!ids.length || !this._hass) return;
    const sod = startOfDay();
    const range = periodRange("day");
    this.stats.get(ids, range.stat, range.fetchStart, range.end).then((map) => {
      if (sod !== startOfDay()) return; // døgnskifte mens vi ventede
      for (const id of ids) this._today.set(id, { sod, rows: map.get(id) || [] });
      this._safe("today", done);
    });
  }

  today(key, kind) {
    const t = this._today.get(this.id(key));
    if (!t || t.sod !== startOfDay()) return undefined;
    return sumSince(t.rows, t.sod, this.statLive(key, kind));
  }

  waterFlowState(lpm) {
    if (!Number.isFinite(lpm)) return { label: "Ingen data", tone: "" };
    if (lpm <= 0.05) return { label: "Ingen flow", tone: "" };
    if (lpm >= this.config.water_high_flow_lpm) return { label: "Højt flow", tone: "warn" };
    return { label: "Normalt flow", tone: "water" };
  }

  evStatus() {
    const w = this.watts("ev_power");
    const charging = Number.isFinite(w) && w > this.config.ev_charging_threshold_w;
    const mode = this.stateObj("ev_mode")?.state;
    if (charging) return { charging, label: `Lader med ${fmtPower(w).v} ${fmtPower(w).u}` };
    if (!Number.isFinite(w)) return { charging, label: "Ingen data" };
    return { charging, label: EV_MODES[mode] || "Klar" };
  }

  /* ---------- robusthed ---------- */

  _safe(name, fn) {
    try {
      fn();
    } catch (err) {
      this.warnOnce(`section-${name}`, `Fejl i "${name}" – resten af kortet opdateres fortsat`, err);
    }
  }

  warnOnce(key, ...args) {
    if (this._warned.has(key)) return;
    this._warned.add(key);
    console.warn(`[${this.config?.log_prefix || DEFAULT_CONFIG.log_prefix}]`, ...args);
  }
}

if (!customElements.get(CARD_TAG)) customElements.define(CARD_TAG, HaEnergyCenterCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === CARD_TAG)) {
  window.customCards.push({
    type: CARD_TAG,
    name: "HA Energy Center Card",
    description: "Energioverblik med faner for strøm, fjernvarme, vand og billader – live, historik og gruppefordeling",
    preview: false,
  });
}
console.info(`%c ENERGY CENTER %c v${VERSION} `, "color:#0a101c;background:#4f8cff;font-weight:700", "color:#cfe0ff;background:#101828");
