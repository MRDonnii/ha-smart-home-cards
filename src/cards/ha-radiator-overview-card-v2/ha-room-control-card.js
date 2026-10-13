// HA Room Control Card – the "Styring" tab of Varme Center's room popup (Claude AI, 2026-10-13; user: "byg styringsdelen til
// rum ind i den også med sin egen fane"). Same keys as a room in ha-home-room-overview-card-v3: light (dimmable), actions
// [{entity, name, icon}] and alert {entity, active, idle, icon}. Taps toggle; a long press opens more-info.
import { luxCss, LUX_ACCENT } from "../../shared/lux.js";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ON = new Set(["on", "playing", "paused", "open", "heat", "cool", "home", "active"]);

class HARoomControlCard extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); }
  setConfig(c) { this._config = c || {}; this._key = ""; this._built = false; this._render(); }
  set hass(h) { this._hass = h; this._render(); }
  getCardSize() { return 3; }
  _st(id) { return id ? this._hass?.states?.[id] : undefined; }
  _on(id) { const s = this._st(id)?.state; return ON.has(String(s)); }
  _items() {
    const c = this._config; const out = [];
    for (const a of c.actions || []) if (a?.entity) out.push({ entity: a.entity, name: a.name || this._st(a.entity)?.attributes?.friendly_name || a.entity, icon: a.icon });
    if (c.alert?.entity && !out.some((x) => x.entity === c.alert.entity)) out.push({ entity: c.alert.entity, name: c.alert.active || "Scene", icon: c.alert.icon });
    return out;
  }
  _render() {
    if (!this._config || !this._hass) return;
    const c = this._config; const light = this._st(c.light); const items = this._items();
    const key = JSON.stringify([light?.state, light?.attributes?.brightness, ...items.map((i) => this._st(i.entity)?.state)]);
    if (key === this._key) return; this._key = key;
    const lOn = light?.state === "on"; const pct = lOn ? Math.round(((light.attributes?.brightness ?? 255) / 255) * 100) : 0;
    const dimmable = light && (light.attributes?.supported_color_modes || []).some((m) => m !== "onoff");
    if (!this._built) {
      this._built = true;
      this.shadowRoot.innerHTML = `<style>
:host{display:block;--a:${LUX_ACCENT};--ink:var(--primary-text-color,#eef3f8);--mut:var(--secondary-text-color,#8d9baa)}
*{box-sizing:border-box}button{font:inherit;color:inherit}
.wrap{display:flex;flex-direction:column;gap:12px;padding:16px;border-radius:20px;background:var(--ha-card-background,var(--card-background-color,#161a21));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ink) 8%,transparent)}
h4{margin:0 0 2px;font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:var(--mut)}
.light{position:relative;display:flex;align-items:center;gap:12px;height:58px;padding:0 14px;border-radius:16px;overflow:hidden;cursor:pointer;touch-action:pan-y;user-select:none;
  background:color-mix(in srgb,var(--ink) 6%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ink) 10%,transparent)}
.light .fill{position:absolute;inset:0 auto 0 0;width:var(--p,0%);background:linear-gradient(90deg,rgba(255,190,110,.18),rgba(255,190,110,.45));transition:width .4s ease}
.light ha-icon{position:relative;--mdc-icon-size:24px;color:var(--mut)}.light.on ha-icon{color:#ffc46b;filter:drop-shadow(0 0 8px rgba(255,190,110,.7))}
.light b{position:relative;font-size:15px}.light span{position:relative;margin-left:auto;font-size:14px;font-weight:800;color:var(--mut)}.light.on span{color:var(--ink)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px}
.act{display:flex;align-items:center;gap:9px;min-height:52px;padding:8px 12px;border:0;border-radius:15px;cursor:pointer;text-align:left;background:color-mix(in srgb,var(--ink) 6%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ink) 10%,transparent)}
.act ha-icon{--mdc-icon-size:21px;color:var(--mut);flex:none}.act b{display:block;font-size:13px}.act small{display:block;font-size:11px;color:var(--mut)}
.empty{color:var(--mut);font-size:13px;padding:6px 2px}
${luxCss({ base: ".act", active: ".act.on" })}
</style><div class="wrap"></div>`;
      const wrap = this.shadowRoot.querySelector(".wrap");
      wrap.addEventListener("click", (e) => { const b = e.target.closest("[data-toggle]"); if (b && !this._held) this._toggle(b.dataset.toggle); this._held = false; });
      wrap.addEventListener("contextmenu", (e) => { const b = e.target.closest("[data-toggle]"); if (!b) return; e.preventDefault(); this._more(b.dataset.toggle); });
      let t = null;
      wrap.addEventListener("pointerdown", (e) => { const b = e.target.closest("[data-toggle]"); if (!b) return; t = setTimeout(() => { this._held = true; this._more(b.dataset.toggle); }, 550);
        if (b.classList.contains("light") && dimmable) this._drag = { x: e.clientX, el: b, id: b.dataset.toggle, moved: false }; });
      wrap.addEventListener("pointermove", (e) => { const d = this._drag; if (!d) return; if (Math.abs(e.clientX - d.x) > 6) { clearTimeout(t); d.moved = true; const r = d.el.getBoundingClientRect(); d.pct = Math.max(1, Math.min(100, Math.round(((e.clientX - r.left) / r.width) * 100))); d.el.style.setProperty("--p", `${d.pct}%`); d.el.querySelector("span").textContent = `${d.pct}%`; } });
      const end = () => { clearTimeout(t); const d = this._drag; this._drag = null; if (d?.moved) { this._held = true; this._hass.callService("light", "turn_on", { entity_id: d.id, brightness_pct: d.pct }); } };
      wrap.addEventListener("pointerup", end); wrap.addEventListener("pointercancel", end); wrap.addEventListener("pointerleave", end);
    }
    const lightHtml = light ? `<h4>Lys</h4><div class="light ${lOn ? "on" : ""}" data-toggle="${esc(c.light)}" style="--p:${pct}%"><i class="fill"></i><ha-icon icon="${lOn ? "mdi:lightbulb-on" : "mdi:lightbulb-outline"}"></ha-icon><b>${esc(light.attributes?.friendly_name || "Lys")}</b><span>${lOn ? `${pct}%` : "Fra"}</span></div>` : "";
    const actHtml = items.length ? `<h4>Styring</h4><div class="grid">${items.map((i) => { const on = this._on(i.entity); const st = this._st(i.entity)?.state;
      return `<button type="button" class="act ${on ? "on" : ""}" data-toggle="${esc(i.entity)}"><ha-icon icon="${esc(i.icon || this._st(i.entity)?.attributes?.icon || "mdi:toggle-switch-outline")}"></ha-icon><span><b>${esc(i.name)}</b><small>${st === "playing" ? "Spiller" : st === "paused" ? "Pause" : on ? "Til" : st === "unavailable" ? "Utilgængelig" : "Fra"}</small></span></button>`; }).join("")}</div>` : "";
    this.shadowRoot.querySelector(".wrap").innerHTML = lightHtml + actHtml || '<div class="empty">Ingen styring er tilknyttet dette rum</div>';
  }
  _toggle(id) {
    const d = id.split(".")[0];
    if (d === "media_player") return this._hass.callService("media_player", "toggle", { entity_id: id });
    if (["scene", "script"].includes(d)) return this._hass.callService(d, "turn_on", { entity_id: id });
    if (d === "button" || d === "input_button") return this._hass.callService(d, "press", { entity_id: id });
    this._hass.callService("homeassistant", "toggle", { entity_id: id });
  }
  _more(id) { this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: id }, bubbles: true, composed: true })); }
}
if (!customElements.get("ha-room-control-card")) customElements.define("ha-room-control-card", HARoomControlCard);
