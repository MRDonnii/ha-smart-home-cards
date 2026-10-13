// HA Room Control Card v2 – the "Styring" tab of Varme Center's room popup (Claude AI, 2026-10-13; user: "flere af scenerne,
// styring og knapperne virker ikke ... byg nogle nye kort i den nye stil"). It no longer embeds the room's Bubble pop-up
// (its button-card templates only exist on the rooms dashboard, so they rendered as error cards); it draws the room from
// the pop-up's room model instead (the Rumstatus card's variables: lights, profile, presence, ambient, AL, media, timer)
// plus the profile buttons and toggles found in that pop-up. Old config (light/actions/alert) still works.
//
// Config: { name, icon, model: {room_key, presence, profile, override, ambient, al[], lights[], media_devices[], automation,
//   timer, lux, luxThreshold, luxKrav, persistent, specials[], openings[]}, profiles: [{option, name, icon}],
//   toggles: [{entity, name, icon}], light, actions: [{entity, name, icon}], alert: {entity, active, icon} }
// Taps act; a long press (or right click) opens more-info; light tiles dim when dragged sideways.

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ON = new Set(["on", "playing", "paused", "buffering", "open", "heat", "cool", "home", "active"]);
const DEAD = new Set(["unavailable", "unknown"]);
const DOMAIN_ICON = { automation: "mdi:robot-outline", input_boolean: "mdi:toggle-switch-outline", switch: "mdi:power-socket-eu", script: "mdi:play-circle-outline", scene: "mdi:palette-outline", light: "mdi:lightbulb-outline", fan: "mdi:fan", media_player: "mdi:speaker" };

// Minimal DOM patch: same tag at the same place is updated in place (attributes, text, children), anything else replaced.
const morph = (from, to) => {
  const a = [...from.childNodes]; const b = [...to.childNodes];
  b.forEach((nb, i) => {
    const na = a[i];
    if (!na) { from.appendChild(nb); return; }
    if (na.nodeType !== nb.nodeType || na.nodeName !== nb.nodeName) { from.replaceChild(nb, na); return; }
    if (nb.nodeType !== 1) { if (na.nodeValue !== nb.nodeValue) na.nodeValue = nb.nodeValue; return; }
    for (const { name } of [...na.attributes]) if (!nb.hasAttribute(name)) na.removeAttribute(name);
    for (const { name, value } of [...nb.attributes]) if (na.getAttribute(name) !== value) na.setAttribute(name, value);
    if (na.nodeName === "INPUT") { if (na !== na.getRootNode().activeElement && na.value !== nb.value) na.value = nb.value; return; }
    morph(na, nb);
  });
  a.slice(b.length).forEach((n) => n.remove());
};

const STYLE = `
:host{display:block;--a:var(--dashboard-accent,var(--info-color,#38bdf8));--ok:var(--dashboard-success,var(--success-color,#5bc99a));--amber:#ffb454;--warm:#ffc46b;--danger:var(--dashboard-danger,var(--error-color,#ef4444));--violet:#a78bfa;
  --ink:var(--primary-text-color,#eef3f8);--mut:var(--secondary-text-color,#8d9baa);--edge:var(--dashboard-border-neutral,var(--divider-color,rgba(255,255,255,.11)));
  --surf:var(--surface,var(--ha-card-background,var(--card-background-color,#172536)));--tint:color-mix(in srgb,var(--ink) 6%,transparent);--tile:linear-gradient(var(--tint),var(--tint)),var(--surf);--left:calc(var(--dashboard-left-accent-width,1) * 3px)}
*{box-sizing:border-box}button{font:inherit;color:inherit;-webkit-tap-highlight-color:transparent}
.wrap{display:flex;flex-direction:column;gap:18px}
.sec{display:flex;flex-direction:column;gap:9px}
.sh{display:flex;align-items:center;gap:10px;margin:0 2px}
.sh h4{margin:0;color:var(--mut);font-size:10.5px;font-weight:800;letter-spacing:.15em;text-transform:uppercase}
.sh .rule{flex:1;height:1px;background:linear-gradient(90deg,var(--edge),transparent)}
.sh .cnt{padding:2px 8px;border-radius:99px;background:color-mix(in srgb,var(--ink) 7%,transparent);font-size:10.5px;font-weight:800;color:var(--mut)}
.sh .link{border:0;background:none;padding:4px 2px;color:var(--a);font-size:11.5px;font-weight:800;cursor:pointer}
.tile{position:relative;isolation:isolate;overflow:hidden;border:0;border-left:var(--left) solid color-mix(in srgb,var(--c,var(--edge)) 80%,transparent);border-radius:15px;background:var(--tile);box-shadow:0 4px 14px rgba(0,0,0,.16);text-align:left;cursor:pointer;user-select:none;transition:transform .18s cubic-bezier(.2,1.3,.4,1),box-shadow .25s ease,background .25s ease}
.tile:active{transform:scale(.97)}
.tile .bg{position:absolute;right:-10px;bottom:-12px;z-index:-1;--mdc-icon-size:58px;width:58px;height:58px;color:var(--c,var(--mut));opacity:.1;pointer-events:none;animation:drift 6s ease-in-out infinite}
.dead{opacity:.45}
/* hero */
.hero{--c:var(--st,var(--ok));display:grid;grid-template-columns:auto 1fr;gap:4px 14px;padding:16px;cursor:default}
.hero:active{transform:none}
.hero .ic{grid-row:span 2;display:grid;place-items:center;width:50px;height:50px;border-radius:16px;background:color-mix(in srgb,var(--c) 16%,transparent);color:var(--c);--mdc-icon-size:27px}
.hero .t{display:flex;align-items:center;gap:9px;min-width:0}.hero .t strong{font-size:17px;font-weight:800;letter-spacing:-.01em}
.pill{padding:3px 9px;border-radius:99px;font-size:10px;font-weight:900;letter-spacing:.08em;color:var(--c);background:color-mix(in srgb,var(--c) 15%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 40%,transparent)}
.hero .s{display:flex;flex-wrap:wrap;gap:6px;min-width:0}
.chip{display:inline-flex;align-items:center;gap:5px;padding:4px 9px 4px 7px;border-radius:99px;font-size:11px;font-weight:700;color:var(--mut);background:color-mix(in srgb,var(--ink) 6%,transparent)}
.chip ha-icon{--mdc-icon-size:14px}.chip.on{color:var(--ok);background:color-mix(in srgb,var(--ok) 13%,transparent)}.chip.warn{color:var(--amber);background:color-mix(in srgb,var(--amber) 13%,transparent)}.chip.lit{color:var(--warm);background:rgba(255,190,110,.13)}
.hero .btns{grid-column:1/-1;display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-top:10px}
.btn{display:flex;align-items:center;justify-content:center;gap:7px;min-height:42px;padding:0 12px;border:0;border-radius:12px;background:color-mix(in srgb,var(--bc,var(--ink)) 10%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--bc,var(--ink)) 26%,transparent);color:var(--bc,var(--ink));font-size:12.5px;font-weight:800;cursor:pointer;transition:transform .18s ease,background .2s ease}
.btn:active{transform:scale(.96)}.btn ha-icon{--mdc-icon-size:18px}.btn.busy{opacity:.55;pointer-events:none}
/* profiles */
.prof{display:grid;grid-template-columns:repeat(auto-fit,minmax(88px,1fr));gap:8px}
.pf{--c:var(--amber);display:flex;flex-direction:column;align-items:flex-start;justify-content:space-between;min-height:74px;padding:11px 12px;border-left-color:transparent}
.pf ha-icon.i{--mdc-icon-size:22px;color:var(--mut);transition:color .2s ease}
.pf b{font-size:12.5px;font-weight:800}
.pf.on{border-left-color:var(--c);background:linear-gradient(150deg,color-mix(in srgb,var(--c) 28%,transparent),transparent 75%),var(--tile);box-shadow:0 0 0 1px color-mix(in srgb,var(--c) 45%,transparent),0 8px 22px -8px color-mix(in srgb,var(--c) 60%,transparent)}
.pf.on ha-icon.i{color:var(--c);filter:drop-shadow(0 0 7px color-mix(in srgb,var(--c) 70%,transparent))}
.pf.special{--c:var(--violet)}
/* lights */
.lights{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.lt{--c:var(--edge);display:flex;align-items:center;gap:11px;height:60px;padding:0 14px;touch-action:pan-y}
.lt .fill{position:absolute;inset:0 auto 0 0;z-index:-1;width:var(--p,0%);background:linear-gradient(90deg,color-mix(in srgb,var(--lc) 14%,transparent),color-mix(in srgb,var(--lc) 38%,transparent));transition:width .35s ease}
.lt.drag .fill{transition:none}
.lt .li{display:grid;place-items:center;flex:none;width:34px;height:34px;border-radius:11px;background:color-mix(in srgb,var(--ink) 7%,transparent);color:var(--mut);--mdc-icon-size:20px}
.lt.on{--c:var(--lc)}.lt.on .li{background:color-mix(in srgb,var(--lc) 22%,transparent);color:var(--lc);filter:drop-shadow(0 0 8px color-mix(in srgb,var(--lc) 55%,transparent))}
.lt .n{flex:1;min-width:0}.lt .n b{display:block;overflow:hidden;font-size:13px;font-weight:800;text-overflow:ellipsis;white-space:nowrap}.lt .n small{display:block;margin-top:1px;color:var(--mut);font-size:11px}
.lt .pct{font-size:15px;font-weight:800;font-variant-numeric:tabular-nums;color:var(--mut)}.lt.on .pct{color:var(--ink)}
/* toggles */
.tgs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.tg{--c:var(--edge);display:flex;align-items:center;gap:10px;min-height:58px;padding:9px 12px}
.tg .ti{flex:none;--mdc-icon-size:21px;color:var(--mut)}
.tg .n{flex:1;min-width:0}.tg .n b{display:-webkit-box;overflow:hidden;font-size:12.5px;font-weight:800;line-height:1.25;-webkit-line-clamp:2;-webkit-box-orient:vertical}.tg .n small{display:block;margin-top:1px;color:var(--mut);font-size:10.5px}
.sw{flex:none;position:relative;width:34px;height:20px;border-radius:99px;background:color-mix(in srgb,var(--ink) 14%,transparent);transition:background .2s ease}
.sw::after{content:"";position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:var(--ink);opacity:.7;transition:transform .22s cubic-bezier(.2,1.3,.4,1),opacity .2s}
.tg.on{--c:var(--ok)}.tg.on .ti{color:var(--ok)}.tg.on .sw{background:var(--ok)}.tg.on .sw::after{transform:translateX(14px);opacity:1;background:#fff}
/* media */
.media{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.md{--c:var(--violet);display:grid;grid-template-columns:52px 1fr;gap:8px 12px;padding:12px;cursor:default}
.md:active{transform:none}
.md .art{position:absolute;inset:0;z-index:-2;background:var(--img) center/cover;filter:blur(22px) saturate(1.3);opacity:.32;transform:scale(1.3)}
.md .cov{width:52px;height:52px;border-radius:12px;background:var(--img,color-mix(in srgb,var(--c) 18%,transparent)) center/cover;display:grid;place-items:center;color:var(--c);--mdc-icon-size:24px;box-shadow:0 6px 14px rgba(0,0,0,.25)}
.md .n{min-width:0;align-self:center}.md .n b{display:block;overflow:hidden;font-size:13px;font-weight:800;text-overflow:ellipsis;white-space:nowrap}.md .n small{display:block;overflow:hidden;margin-top:2px;color:var(--mut);font-size:11px;text-overflow:ellipsis;white-space:nowrap}
.md .ctl{grid-column:1/-1;display:flex;align-items:center;gap:6px}
.ib{display:grid;place-items:center;flex:none;width:38px;height:36px;border:0;border-radius:11px;background:color-mix(in srgb,var(--ink) 8%,transparent);cursor:pointer;--mdc-icon-size:20px;transition:transform .15s ease}
.ib:active{transform:scale(.9)}.ib.main{background:color-mix(in srgb,var(--c) 26%,transparent);color:var(--c)}
.vol{flex:1;min-width:60px;accent-color:var(--c);height:20px}
.md.off .ctl .x{display:none}
.empty{padding:22px;border-radius:15px;background:var(--tile);color:var(--mut);font-size:13px;text-align:center}
@keyframes drift{50%{transform:translate(-4px,-3px) scale(1.05) rotate(-4deg);opacity:.18}}
@media(max-width:480px){.prof{grid-template-columns:repeat(3,1fr)}.lights,.tgs{grid-template-columns:1fr 1fr}.lt{height:56px;padding:0 10px;gap:8px}.lt .li{width:30px;height:30px}.lt .pct{font-size:13px}.media{grid-template-columns:1fr}}
/* Exclusive look (Claude AI, 2026-10-13; user: "noget helt nyt eksklusivt ... popup-styringssiderne"): glass tiles, glowing
   scene buttons, big dimmers and a slim status strip, matching ha-room-climate-card's popup. */
.wrap{gap:22px}
.sh h4{font-size:10.5px;letter-spacing:.18em}.sh .rule{background:linear-gradient(90deg,rgba(255,255,255,.12),transparent)}
.tile{border-left:0;border-radius:20px;background:linear-gradient(180deg,rgba(255,255,255,.065),rgba(255,255,255,.018)),var(--surf);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.07),inset 0 0 0 1px rgba(255,255,255,.06),0 14px 30px -20px rgba(0,0,0,.85)}
.tile:hover{box-shadow:inset 0 1px 0 rgba(255,255,255,.09),inset 0 0 0 1px color-mix(in srgb,var(--c,#fff) 30%,rgba(255,255,255,.08)),0 18px 34px -20px rgba(0,0,0,.9)}
.hero{grid-template-columns:1fr;padding:16px 16px 14px;background:radial-gradient(120% 120% at 0% 0%,color-mix(in srgb,var(--c) 16%,transparent),transparent 60%),linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.015)),var(--surf)}
.hero .ic{display:none}.hero .t strong{font-size:15px}.pill{padding:4px 11px;font-size:10.5px}
.hero .btns{grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:12px}
.btn{min-height:48px;border-radius:15px;background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.02));box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);color:var(--ink);font-size:13px}
.btn ha-icon{display:grid;place-items:center;width:30px;height:30px;border-radius:10px;--mdc-icon-size:17px;color:var(--bc);background:color-mix(in srgb,var(--bc) 18%,transparent)}
.btn:hover{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--bc) 45%,transparent),0 0 22px -10px var(--bc)}
.prof{grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:10px}
.pf{min-height:96px;padding:12px;gap:10px;justify-content:space-between}
.pf ha-icon.i{display:grid;place-items:center;width:40px;height:40px;border-radius:14px;--mdc-icon-size:21px;color:var(--mut);background:rgba(255,255,255,.07);transition:all .25s ease}
.pf b{font-size:13px}
.pf.on{background:radial-gradient(120% 100% at 0% 0%,color-mix(in srgb,var(--c) 42%,transparent),color-mix(in srgb,var(--c) 10%,transparent) 70%),var(--surf);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 60%,transparent),0 14px 30px -14px color-mix(in srgb,var(--c) 75%,transparent)}
.pf.on ha-icon.i{color:#1b1206;background:var(--c);box-shadow:0 0 22px -2px var(--c);filter:none}
.pf.on::after{content:"";position:absolute;top:12px;right:12px;width:8px;height:8px;border-radius:50%;background:var(--c);box-shadow:0 0 10px var(--c)}
.lights{gap:10px}
.lt{height:72px;padding:0 16px;gap:13px;border-radius:20px}
.lt .fill{background:linear-gradient(90deg,color-mix(in srgb,var(--lc) 12%,transparent),color-mix(in srgb,var(--lc) 34%,transparent));box-shadow:inset -2px 0 0 color-mix(in srgb,var(--lc) 70%,transparent)}
.lt .li{width:42px;height:42px;border-radius:14px;--mdc-icon-size:22px}
.lt.on .li{color:#1b1206;background:var(--lc);box-shadow:0 0 22px -4px var(--lc);filter:none}
.lt .n b{font-size:14px}.lt .pct{font-size:19px;letter-spacing:-.02em}
.tgs{gap:10px}
.tg{min-height:62px;padding:10px 14px;border-radius:18px}
.tg .ti{display:grid;place-items:center;width:34px;height:34px;border-radius:12px;background:rgba(255,255,255,.06);--mdc-icon-size:19px}
.tg.on .ti{background:color-mix(in srgb,var(--ok) 18%,transparent)}
.sw{width:40px;height:24px}.sw::after{top:4px;left:4px;width:16px;height:16px}.tg.on .sw::after{transform:translateX(16px)}
.tg.on .sw{box-shadow:0 0 14px -3px var(--ok)}
.media{gap:10px}.md{padding:14px;border-radius:20px}.md .cov{width:56px;height:56px;border-radius:15px}
.ib{width:40px;height:38px;border-radius:12px}
@media(max-width:480px){.prof{grid-template-columns:repeat(3,minmax(0,1fr))}.pf{min-height:84px;padding:10px}.pf ha-icon.i{width:34px;height:34px}.lt{height:64px;padding:0 11px;gap:9px}.lt .li{width:34px;height:34px}.lt .pct{font-size:15px}.tg{padding:9px 10px;gap:8px}.tg .ti{width:30px;height:30px}.tg .n b{font-size:12px}.lights{grid-template-columns:1fr}
  .hero .btns{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.btn{flex-direction:column;gap:5px;min-height:64px;padding:8px 4px;font-size:11.5px;text-align:center;line-height:1.15}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

class HARoomControlCard extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); }
  setConfig(c) { this._config = c || {}; this._key = ""; this._html = ""; this._built = false; this._render(); }
  set hass(h) { this._hass = h; this._render(); }
  getCardSize() { return 6; }
  _st(id) { return id ? this._hass?.states?.[id] : undefined; }
  _on(id) { return ON.has(String(this._st(id)?.state)); }
  _name(id, fallback) {
    const s = this._st(id); let n = fallback || s?.attributes?.friendly_name || id || "";
    // "Spisestuen Spots" in the Spisestuen popup reads better as "Spots".
    const room = String(this._config.name || "").trim();
    if (!fallback && room && n.toLowerCase().startsWith(room.toLowerCase()) && n.length > room.length + 1) n = n.slice(room.length).trim();
    return n.charAt(0).toUpperCase() + n.slice(1);
  }
  _pct(s) { return s?.state === "on" ? Math.max(1, Math.round(((s.attributes?.brightness ?? 255) / 255) * 100)) : 0; }
  _lightColor(s) { const c = s?.attributes?.rgb_color; return Array.isArray(c) && c.length === 3 ? `rgb(${c.join(",")})` : "#ffc46b"; }
  _ago(t) { const m = Math.max(0, Math.round((Date.now() - Date.parse(t)) / 60000)); return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} t ${m % 60} min` : `${Math.floor(m / 1440)} d`; }
  _left(t) { const m = Math.max(0, Math.round((Date.parse(t) - Date.now()) / 60000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} t ${m % 60} min`; }

  // The room model; old configs (light/actions/alert from the Alle rum card) become the same shape.
  _model() {
    const c = this._config; const m = c.model || {};
    const lights = (m.lights?.length ? m.lights : c.light ? [c.light] : []).filter((id) => this._st(id));
    const toggles = [...(c.toggles || []), ...(c.actions || []), ...(c.alert?.entity ? [{ entity: c.alert.entity, name: c.alert.active, icon: c.alert.icon }] : [])]
      .filter((t, i, a) => t?.entity && this._st(t.entity) && a.findIndex((x) => x.entity === t.entity) === i && !lights.includes(t.entity));
    const media = (m.media_devices || []).filter((d) => this._st(d.id));
    const profiles = (c.profiles || []).filter((p) => p.option !== undefined && this._st(m.profile));
    const specials = (m.specials || []).filter((s) => this._st(s.id)).map((s) => ({ ...s, icon: (c.profileIcons || {})[s.id] }));
    return { m, lights, toggles: toggles.filter((t) => !specials.some((s) => s.id === t.entity)), media, profiles, specials };
  }

  // Same priority as the Rumstatus badge on the rooms page.
  _status(m) {
    const s = (id) => this._st(id); const on = (id) => s(id)?.state === "on"; const act = (x) => ON.has(String(s(x?.id)?.state));
    if ((m.criticals || []).some(act)) return ["KRITISK", "var(--danger)"];
    if ((m.important || []).some((id) => !s(id) || DEAD.has(s(id).state))) return ["FEJL", "var(--danger)"];
    if (m.automation && s(m.automation)?.state === "off") return ["AUTO FRA", "var(--danger)"];
    if ((m.openings || []).some(on)) return ["ÅBEN", "var(--amber)"];
    if (on(m.override) || (m.timer && s(m.timer)?.state === "active")) return ["MANUEL", "var(--violet)"];
    const sp = (m.specials || []).find(act); if (sp) return [String(sp.label).toUpperCase(), "var(--violet)"];
    if (on(m.gaming?.power)) return ["GAMING", "var(--violet)"];
    if (on(m.presence)) return ["AKTIV", "var(--ok)"];
    if (on(m.ambient)) return ["AMBIENT", "var(--warm)"];
    return ["OK", "var(--ok)"];
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (this._drag) return; // never repaint under a finger that is dimming
    const d = this._model(); const m = d.m;
    const ids = [m.presence, m.override, m.timer, m.automation, m.ambient, m.profile, m.lux, m.luxThreshold, ...(m.openings || []), ...(m.important || []), ...d.lights, ...d.toggles.map((t) => t.entity), ...d.specials.map((s) => s.id), ...d.media.map((x) => x.id)];
    const key = JSON.stringify(ids.map((id) => { const s = this._st(id); return s ? [s.state, s.attributes?.brightness, s.attributes?.rgb_color, s.attributes?.media_title, s.attributes?.volume_level, s.attributes?.finishes_at, s.attributes?.entity_picture, s.last_changed] : 0; })) + Math.floor(Date.now() / 60000);
    if (key === this._key) return; this._key = key;
    if (!this._built) {
      this._built = true;
      this.shadowRoot.innerHTML = `<style>${STYLE}</style><div class="wrap"></div>`;
      this._bind(this.shadowRoot.querySelector(".wrap"));
    }
    const wrap = this.shadowRoot.querySelector(".wrap");
    const html = [this._heroHtml(d), this._profilesHtml(d), this._lightsHtml(d), this._mediaHtml(d), this._togglesHtml(d)].join("");
    const next = html.trim() ? html : '<div class="empty">Ingen styring er tilknyttet dette rum</div>';
    if (next === this._html) return; this._html = next;
    // Patch instead of replacing: sensors like lux change every few seconds, and fresh <ha-icon>s would blink and
    // restart their icon loading each time.
    const tpl = document.createElement("template"); tpl.innerHTML = next;
    morph(wrap, tpl.content);
  }

  _heroHtml(d) {
    const m = d.m; if (!m.room_key && !m.presence && !d.lights.length) return "";
    const [label, color] = this._status(m);
    const chips = [];
    const p = this._st(m.presence);
    if (p) chips.push(p.state === "on" ? `<span class="chip on"><ha-icon icon="mdi:motion-sensor"></ha-icon>Tilstede</span>` : `<span class="chip"><ha-icon icon="mdi:motion-sensor-off"></ha-icon>Tomt i ${this._ago(p.last_changed)}</span>`);
    const lit = d.lights.filter((id) => this._on(id)).length;
    if (d.lights.length) chips.push(`<span class="chip ${lit ? "lit" : ""}"><ha-icon icon="${lit ? "mdi:lightbulb-on" : "mdi:lightbulb-outline"}"></ha-icon>${lit ? `${lit} af ${d.lights.length} lys tændt` : "Alt lys slukket"}</span>`);
    const lux = Number(this._st(m.lux)?.state); const thr = Number(this._st(m.luxThreshold)?.state);
    if (Number.isFinite(lux)) chips.push(`<span class="chip"><ha-icon icon="mdi:brightness-6"></ha-icon>${Math.round(lux)} lx${Number.isFinite(thr) ? ` · ${lux < thr ? "mørkt" : "lyst"}` : ""}</span>`);
    const t = this._st(m.timer); if (t?.state === "active" && t.attributes?.finishes_at) chips.push(`<span class="chip warn"><ha-icon icon="mdi:timer-sand"></ha-icon>Manuel i ${this._left(t.attributes.finishes_at)}</span>`);
    if ((m.openings || []).some((id) => this._on(id))) chips.push(`<span class="chip warn"><ha-icon icon="mdi:door-open"></ha-icon>Åben dør/vindue</span>`);
    const btns = m.room_key ? `<div class="btns">
      <button type="button" class="btn" style="--bc:var(--danger)" data-script="rum_sluk_midlertidigt"><ha-icon icon="mdi:power"></ha-icon>Sluk rummet</button>
      <button type="button" class="btn" style="--bc:var(--a)" data-script="rum_nulstil_automatisk"><ha-icon icon="mdi:restore"></ha-icon>Nulstil automatik</button>
      ${lit ? `<button type="button" class="btn" style="--bc:var(--warm)" data-all="off"><ha-icon icon="mdi:lightbulb-off-outline"></ha-icon>Sluk alt lys</button>` : d.lights.length ? `<button type="button" class="btn" style="--bc:var(--warm)" data-all="on"><ha-icon icon="mdi:lightbulb-on-outline"></ha-icon>Tænd alt lys</button>` : ""}</div>` : "";
    return `<div class="tile hero" style="--st:${color}"><span class="ic"><ha-icon icon="${esc(this._config.icon || m.icon || "mdi:home")}"></ha-icon></span>
      <div class="t"><strong>Rumstatus</strong><span class="pill">${esc(label)}</span></div><div class="s">${chips.join("")}</div>${btns}</div>`;
  }

  _profilesHtml(d) {
    if (!d.profiles.length && !d.specials.length) return "";
    const cur = this._st(d.m.profile)?.state;
    const items = d.profiles.map((p) => `<button type="button" class="tile pf ${cur === p.option ? "on" : ""}" data-option="${esc(p.option)}"><ha-icon class="i" icon="${esc(p.icon || "mdi:lightbulb-group-outline")}"></ha-icon><b>${esc(p.name || p.option)}</b></button>`)
      .concat(d.specials.map((s) => `<button type="button" class="tile pf special ${this._on(s.id) ? "on" : ""}" data-toggle="${esc(s.id)}"><ha-icon class="i" icon="${esc(s.icon || this._st(s.id)?.attributes?.icon || "mdi:star-four-points-outline")}"></ha-icon><b>${esc(s.label)}</b></button>`));
    return `<section class="sec"><div class="sh"><h4>Lysprofil</h4><i class="rule"></i>${cur && d.profiles.length ? `<span class="cnt">${esc(cur)}</span>` : ""}</div><div class="prof">${items.join("")}</div></section>`;
  }

  _lightsHtml(d) {
    if (!d.lights.length) return "";
    const lit = d.lights.filter((id) => this._on(id)).length;
    const tiles = d.lights.map((id) => {
      const s = this._st(id); const on = s.state === "on"; const pct = this._pct(s); const dead = DEAD.has(s.state);
      const dim = (s.attributes?.supported_color_modes || []).some((x) => x !== "onoff");
      return `<button type="button" class="tile lt ${on ? "on" : ""} ${dead ? "dead" : ""}" data-light="${esc(id)}" data-dim="${dim ? 1 : 0}" style="--p:${pct}%;--lc:${this._lightColor(s)}"><i class="fill"></i><span class="li"><ha-icon icon="${esc(s.attributes?.icon || (on ? "mdi:lightbulb-on" : "mdi:lightbulb-outline"))}"></ha-icon></span><span class="n"><b>${esc(this._name(id))}</b><small>${dead ? "Utilgængelig" : on ? (dim ? "Træk for at dæmpe" : "Tændt") : "Slukket"}</small></span><span class="pct">${on ? (dim ? `${pct}%` : "Til") : "Fra"}</span></button>`;
    });
    return `<section class="sec"><div class="sh"><h4>Lys</h4><span class="cnt">${lit}/${d.lights.length}</span><i class="rule"></i></div><div class="lights">${tiles.join("")}</div></section>`;
  }

  _togglesHtml(d) {
    const m = d.m; const list = [...d.toggles];
    const add = (entity, name, icon) => { if (entity && this._st(entity) && !list.some((x) => x.entity === entity)) list.push({ entity, name, icon }); };
    add(m.automation, "Presence-automatik", "mdi:motion-sensor");
    add(m.ambient, "Ambient lys", "mdi:lamp-outline");
    (m.al || []).forEach((id, i) => add(id, (m.al.length > 1 ? `Adaptive ${this._name(id).replace(/adaptive lighting:?/i, "").trim()}` : "Adaptive Lighting"), "mdi:theme-light-dark"));
    add(m.persistent, "Kræv vedvarende presence", "mdi:account-clock-outline");
    add(m.luxKrav, "Lux-krav", "mdi:brightness-auto");
    if (!list.length) return "";
    const tiles = list.map((t) => {
      const s = this._st(t.entity); const on = this._on(t.entity); const dom = t.entity.split(".")[0]; const dead = DEAD.has(s.state);
      const sub = dead ? "Utilgængelig" : dom === "script" || dom === "scene" || dom === "button" ? "Kør" : on ? (dom === "automation" ? "Aktiv" : "Til") : (dom === "automation" ? "Slået fra" : "Fra");
      return `<button type="button" class="tile tg ${on ? "on" : ""} ${dead ? "dead" : ""}" data-toggle="${esc(t.entity)}"><ha-icon class="ti" icon="${esc(t.icon || s.attributes?.icon || DOMAIN_ICON[dom] || "mdi:toggle-switch-outline")}"></ha-icon><span class="n"><b>${esc(t.name ? t.name : this._name(t.entity))}</b><small>${sub}</small></span>${["script", "scene", "button"].includes(dom) ? "" : '<i class="sw"></i>'}</button>`;
    });
    return `<section class="sec"><div class="sh"><h4>Automatik &amp; enheder</h4><i class="rule"></i></div><div class="tgs">${tiles.join("")}</div></section>`;
  }

  _mediaHtml(d) {
    if (!d.media.length) return "";
    const tiles = d.media.map((x) => {
      const s = this._st(x.id); const a = s.attributes || {}; const st = s.state; const off = ["off", "standby", "idle", "unavailable", "unknown"].includes(st);
      const pic = a.entity_picture ? `url('${String(a.entity_picture).replace(/'/g, "%27")}')` : "";
      const title = a.media_title || a.app_name || a.source || "";
      const sub = off ? (st === "idle" ? "Klar" : st === "unavailable" ? "Utilgængelig" : "Slukket") : [a.media_artist || a.media_album_name, st === "paused" ? "Pause" : st === "playing" ? "Spiller" : st].filter(Boolean).join(" · ");
      const vol = Number.isFinite(a.volume_level) ? Math.round(a.volume_level * 100) : null;
      return `<div class="tile md ${off ? "off" : ""}" style="${pic ? `--img:${pic}` : ""}">${pic && !off ? '<i class="art"></i>' : ""}<span class="cov">${pic && !off ? "" : `<ha-icon icon="${st === "playing" ? "mdi:music" : "mdi:speaker"}"></ha-icon>`}</span>
        <span class="n"><b>${esc(off ? x.label || this._name(x.id) : title || x.label || this._name(x.id))}</b><small>${esc(off ? sub : `${x.label ? `${x.label} · ` : ""}${sub}`)}</small></span>
        <div class="ctl"><button type="button" class="ib" data-media="${esc(x.id)}" data-cmd="toggle" title="Tænd/sluk"><ha-icon icon="mdi:power"></ha-icon></button>
          <button type="button" class="ib x" data-media="${esc(x.id)}" data-cmd="media_previous_track"><ha-icon icon="mdi:skip-previous"></ha-icon></button>
          <button type="button" class="ib main x" data-media="${esc(x.id)}" data-cmd="media_play_pause"><ha-icon icon="${st === "playing" ? "mdi:pause" : "mdi:play"}"></ha-icon></button>
          <button type="button" class="ib x" data-media="${esc(x.id)}" data-cmd="media_next_track"><ha-icon icon="mdi:skip-next"></ha-icon></button>
          ${vol !== null && !off ? `<input class="vol" type="range" min="0" max="100" value="${vol}" data-vol="${esc(x.id)}" aria-label="Lydstyrke">` : ""}
          <button type="button" class="ib" data-more="${esc(x.id)}" title="Mere"><ha-icon icon="mdi:dots-horizontal"></ha-icon></button></div></div>`;
    });
    return `<section class="sec"><div class="sh"><h4>Medier</h4><i class="rule"></i></div><div class="media">${tiles.join("")}</div></section>`;
  }

  _bind(wrap) {
    let hold = null; let held = false;
    const target = (e) => e.target.closest?.("[data-light],[data-toggle],[data-option]");
    wrap.addEventListener("pointerdown", (e) => {
      const el = target(e); held = false; if (!el) return;
      const id = el.dataset.light || el.dataset.toggle;
      if (id) hold = setTimeout(() => { held = true; this._more(id); }, 550);
      if (el.dataset.light && el.dataset.dim === "1") this._drag = { x: e.clientX, el, id: el.dataset.light, moved: false, pid: e.pointerId };
    });
    wrap.addEventListener("pointermove", (e) => {
      const g = this._drag; if (!g) return;
      if (!g.moved && Math.abs(e.clientX - g.x) < 8) return;
      if (!g.moved) { g.moved = true; clearTimeout(hold); try { g.el.setPointerCapture(g.pid); } catch { /* ignore */ } g.el.classList.add("drag"); }
      const r = g.el.getBoundingClientRect();
      g.pct = Math.max(1, Math.min(100, Math.round(((e.clientX - r.left) / r.width) * 100)));
      g.el.style.setProperty("--p", `${g.pct}%`); g.el.classList.add("on");
      const p = g.el.querySelector(".pct"); if (p) p.textContent = `${g.pct}%`;
    });
    const end = () => {
      clearTimeout(hold); const g = this._drag; this._drag = null;
      if (g?.moved) { held = true; g.el.classList.remove("drag"); this._hass.callService("light", "turn_on", { entity_id: g.id, brightness_pct: g.pct }); this._key = ""; }
    };
    wrap.addEventListener("pointerup", end); wrap.addEventListener("pointercancel", end);
    wrap.addEventListener("contextmenu", (e) => { const el = target(e); if (!el) return; e.preventDefault(); this._more(el.dataset.light || el.dataset.toggle); held = true; });
    wrap.addEventListener("input", (e) => { const v = e.target.closest?.("[data-vol]"); if (!v) return; clearTimeout(this._volT); this._volT = setTimeout(() => this._hass.callService("media_player", "volume_set", { entity_id: v.dataset.vol, volume_level: Number(v.value) / 100 }), 150); });
    wrap.addEventListener("pointerdown", (e) => { if (e.target.closest?.("[data-vol]")) this._drag = { vol: true, moved: false, el: e.target, id: "" }; }, true);
    wrap.addEventListener("click", (e) => {
      if (held) { held = false; return; }
      const el = e.target.closest?.("button"); if (!el) return;
      const m = this._config.model || {};
      if (el.dataset.option !== undefined) return this._hass.callService("input_select", "select_option", { entity_id: m.profile, option: el.dataset.option });
      if (el.dataset.light) return this._hass.callService("light", "toggle", { entity_id: el.dataset.light });
      if (el.dataset.toggle) return this._toggle(el.dataset.toggle);
      if (el.dataset.more) return this._more(el.dataset.more);
      if (el.dataset.media) return this._hass.callService("media_player", el.dataset.cmd, { entity_id: el.dataset.media });
      if (el.dataset.all) { const ids = this._model().lights; if (ids.length) this._hass.callService("light", el.dataset.all === "on" ? "turn_on" : "turn_off", { entity_id: ids }); return; }
      if (el.dataset.script && m.room_key) {
        el.classList.add("busy"); setTimeout(() => el.classList.remove("busy"), 1500);
        return this._hass.callService("script", el.dataset.script, { room: m.room_key });
      }
    });
  }

  _toggle(id) {
    const d = id.split(".")[0];
    if (d === "media_player") return this._hass.callService("media_player", "toggle", { entity_id: id });
    if (["scene", "script"].includes(d)) return this._hass.callService(d, "turn_on", { entity_id: id });
    if (d === "button" || d === "input_button") return this._hass.callService(d, "press", { entity_id: id });
    if (d === "automation") return this._hass.callService("automation", "toggle", { entity_id: id });
    this._hass.callService("homeassistant", "toggle", { entity_id: id });
  }
  _more(id) { if (id) this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: id }, bubbles: true, composed: true })); }
}
if (!customElements.get("ha-room-control-card")) customElements.define("ha-room-control-card", HARoomControlCard);
