import "./ha-card-list-editor.js";
const SECURITY_CENTER_VERSION = "0.4.1";

class HaSecurityCenterCard extends HTMLElement {
  static getStubConfig() {
    return {
      primary_alarm: "alarm_control_panel.home",
      primary_alarm_name: "Alarm",
      actions: {},
      locks: [],
      contacts: [],
      openings: [],
      openings_path: "/lovelace/security"
    };
  }
  static getConfigElement(){const e=document.createElement("ha-card-list-editor");e.definition={roots:[{key:"primary_alarm",label:"Primær alarm",type:"entity"},{key:"primary_alarm_name",label:"Navn på primær alarm"},{key:"secondary_alarm",label:"Sekundær alarm",type:"entity"},{key:"secondary_alarm_name",label:"Navn på sekundær alarm"},{key:"open_count",label:"Antal åbne",type:"entity"},{key:"openings_path",label:"Sti til åbninger"},{key:"actions.disarm",label:"Script: frakobl",type:"entity"},{key:"actions.home",label:"Script: hjemme",type:"entity"},{key:"actions.away",label:"Script: ude",type:"entity"}],collections:[{key:"locks",label:"Låse",itemLabel:"lås",defaults:{name:"Ny lås",icon:"mdi:lock"},fields:[{key:"name",label:"Navn"},{key:"icon",label:"Ikon"},{key:"entity",label:"Lås",type:"entity"},{key:"battery_entity",label:"Batteri",type:"entity"},{key:"radio_fault_entity",label:"Radiofejl",type:"entity"},{key:"network_fault_entity",label:"Netværksfejl",type:"entity"},{key:"hardware_fault_entity",label:"Hardwarefejl",type:"entity"}]},{key:"contacts",label:"Adgangspunkter",itemLabel:"kontakt",defaults:{name:"Ny kontakt",icon:"mdi:door-closed",inverted:false},fields:[{key:"name",label:"Navn"},{key:"icon",label:"Ikon"},{key:"entity",label:"Kontakt",type:"entity"},{key:"inverted",label:"Omvendt kontakt (åben = sikret)",type:"boolean"},{key:"battery_entity",label:"Batteri",type:"entity"},{key:"signal_entity",label:"Signal",type:"entity"}]},{key:"openings",label:"Vinduer og døre",itemLabel:"åbning",defaults:{name:"Ny åbning"},fields:[{key:"name",label:"Navn"},{key:"entity",label:"Sensor",type:"entity"}]}]};return e;}
  setConfig(config) {
    if (!config) throw new Error("Security Center-kortet kræver en konfiguration");
    this.config = { primary_alarm_name: "Alarm", secondary_alarm_name: "Alarm 2", actions: {}, locks: [], contacts: [], openings: [], ...config };
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    if (!this._eventsBound) {
      this._eventsBound = true;
      const R = this.shadowRoot;
      R.addEventListener("click", event => { if (event.target.closest("[data-hold]")) { if (Date.now() - (this._holdFired || 0) > 1500) this._hint(event.target.closest("[data-hold]")); return; } this._activate(event.target.closest("[data-more],[data-nav]")); });
      // Tastatur: Enter/mellemrum på en skyder eller holdeknap udfører handlingen direkte.
      R.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const t = event.target.closest("[data-slide] .thumb,[data-hold]"); if (!t) return;
        event.preventDefault();
        if (t.dataset.hold) this._runHold(t); else this._fireSlide(t.closest("[data-slide]"));
      });
      R.addEventListener("pointerdown", event => this._down(event));
      R.addEventListener("pointermove", event => this._move(event));
      ["pointerup", "pointercancel"].forEach(n => R.addEventListener(n, event => this._up(event)));
      R.addEventListener("contextmenu", event => { if (event.target.closest("[data-hold],[data-slide]")) event.preventDefault(); });
    }
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    const signature = this._signature();
    if (this._pending) for (const [ent, p] of Object.entries(this._pending)) if (hass.states[ent]?.state !== p.from && !["locking", "unlocking"].includes(hass.states[ent]?.state)) delete this._pending[ent];
    if (signature !== this._lastSignature) { this._lastSignature = signature; if (this._drag || this._holding) this._deferred = true; else this._render(); }
  }
  getCardSize() { return 8; }
  _s(id) { return this._hass?.states?.[id]; }
  _allEntities() {
    return [this.config.primary_alarm, this.config.secondary_alarm, this.config.open_count,
      ...(this.config.locks || []).flatMap(x => [x.entity, x.battery_entity, x.radio_fault_entity, x.network_fault_entity, x.hardware_fault_entity]),
      ...(this.config.contacts || []).flatMap(x => [x.entity, x.battery_entity, x.signal_entity]),
      ...(this.config.openings || []).map(x => x.entity)].filter(Boolean);
  }
  _signature() { return this._allEntities().map(id => `${id}:${this._s(id)?.state}:${this._s(id)?.last_changed}`).join("|"); }
  _alarmInfo(state) {
    return ({
      disarmed: ["Frakoblet", "Systemet overvåger uden aktiv alarm", "mdi:shield-lock-open-outline", "neutral"],
      armed_home: ["Tilkoblet hjemme", "Skallen er sikret, mens I er hjemme", "mdi:shield-home-outline", "home"],
      armed_away: ["Fuld tilkobling", "Hele hjemmet er sikret", "mdi:shield-lock-outline", "safe"],
      pending: ["Aktiverer", "Sikkerhedssystemet tæller ned", "mdi:shield-sync-outline", "home"],
      arming: ["Aktiverer", "Sikkerhedssystemet klargøres", "mdi:shield-sync-outline", "home"],
      triggered: ["Alarm udløst", "Kontrollér hjemmet med det samme", "mdi:shield-alert-outline", "danger"]
    })[state] || ["Status ukendt", "Systemet svarer ikke som forventet", "mdi:shield-alert-outline", "danger"];
  }
  _ago(iso) {
    if (!iso) return "Ukendt"; const m = Math.max(0, Math.floor((Date.now() - new Date(iso)) / 60000));
    if (m < 1) return "lige nu"; if (m < 60) return `${m} min siden`; const h = Math.floor(m / 60); return h < 24 ? `${h} t siden` : `${Math.floor(h / 24)} d siden`;
  }
  _service(domain, service, data = {}) { this._hass?.callService(domain, service, data); }
  _moreInfo(entity) { this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: entity } })); }
  _navigate(path) { history.pushState(null, "", path); window.dispatchEvent(new Event("location-changed")); }

  _activate(target) {
    if (!target) return;
    if (target.dataset.more) this._moreInfo(target.dataset.more);
    else if (target.dataset.nav) this._navigate(target.dataset.nav);
  }

  // ---- Skub for at låse / låse op (Claude AI, 2026-11-24; bruger: "slide to unlock og slide to lock låsen") ----
  _down(e) {
    const thumb = e.target.closest("[data-slide] .thumb");
    if (thumb) {
      const sl = thumb.closest("[data-slide]"); if (sl.classList.contains("busy")) return;
      e.preventDefault(); thumb.setPointerCapture?.(e.pointerId);
      const max = sl.clientWidth - thumb.offsetWidth - 8;
      this._drag = { sl, thumb, x0: e.clientX, max, dx: 0, id: e.pointerId }; sl.classList.add("dragging"); return;
    }
    const hold = e.target.closest("[data-hold]");
    if (hold && !hold.classList.contains("on")) {
      e.preventDefault(); this._holding = hold; hold.classList.add("holding");
      clearTimeout(this._holdT); this._holdT = setTimeout(() => { if (this._holding === hold) { this._holding = null; hold.classList.remove("holding"); this._runHold(hold); } }, 900);
    }
  }
  _move(e) {
    const d = this._drag; if (!d || e.pointerId !== d.id) return;
    d.dx = Math.max(0, Math.min(d.max, e.clientX - d.x0)); const k = d.max ? d.dx / d.max : 0;
    d.thumb.style.transform = `translateX(${d.dx}px)`; d.sl.style.setProperty("--k", k.toFixed(3));
  }
  _up(e) {
    if (this._holding) { clearTimeout(this._holdT); this._holding.classList.remove("holding"); this._holding = null; this._flushDeferred(); }
    const d = this._drag; if (!d || e.pointerId !== d.id) return; this._drag = null;
    d.sl.classList.remove("dragging");
    if (d.max && d.dx >= d.max * 0.86) { d.thumb.style.transform = `translateX(${d.max}px)`; d.sl.style.setProperty("--k", "1"); this._fireSlide(d.sl); }
    else { d.thumb.style.transform = ""; d.sl.style.setProperty("--k", "0"); }
    this._flushDeferred();
  }
  _fireSlide(sl) {
    if (!sl || sl.classList.contains("busy")) return;
    const ent = sl.dataset.slide, act = sl.dataset.act;
    sl.classList.add("busy", "done"); navigator.vibrate?.(25);
    const tx = sl.querySelector(".txt"); if (tx) tx.textContent = act === "unlock" ? "Låser op …" : "Låser …";
    sl.querySelector(".thumb ha-icon")?.setAttribute("icon", "mdi:loading");
    (this._pending = this._pending || {})[ent] = { t: Date.now(), from: this._s(ent)?.state };
    this._service("lock", act, { entity_id: ent });
    clearTimeout(this._pendT?.[ent]); (this._pendT = this._pendT || {})[ent] = setTimeout(() => { delete this._pending[ent]; this._lastSignature = ""; this._render(); }, 15000);
  }
  _runHold(btn) {
    const script = btn.dataset.hold; if (!script) return;
    this._holdFired = Date.now(); navigator.vibrate?.(30); btn.classList.add("fired"); setTimeout(() => btn.classList.remove("fired"), 900);
    this._service("script", "turn_on", { entity_id: script });
    this._hint(null, "Sendt til Verisure …");
  }
  _hint(btn, text) {
    const el = this.shadowRoot.querySelector("[data-hint]"); if (!el) return;
    el.textContent = text || `Hold "${btn?.dataset.label || "knappen"}" inde for at skifte`;
    el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
  }
  _flushDeferred() { if (this._deferred && !this._drag && !this._holding) { this._deferred = false; this._render(); } }

  _patchNode(current, next) {
    if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName) { current.replaceWith(next.cloneNode(true)); return; }
    if (current.nodeType === Node.TEXT_NODE) { if (current.data !== next.data) current.data = next.data; return; }
    [...current.attributes].forEach(attr => { if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name); });
    [...next.attributes].forEach(attr => { if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value); });
    const oldChildren = [...current.childNodes], newChildren = [...next.childNodes];
    for (let index = 0; index < Math.max(oldChildren.length, newChildren.length); index += 1) {
      if (!oldChildren[index]) current.appendChild(newChildren[index].cloneNode(true));
      else if (!newChildren[index]) oldChildren[index].remove();
      else this._patchNode(oldChildren[index], newChildren[index]);
    }
  }

  _commit(html) {
    if (!this.shadowRoot.hasChildNodes()) { this.shadowRoot.innerHTML = html; return; }
    const template = document.createElement("template"); template.innerHTML = html;
    const oldChildren = [...this.shadowRoot.childNodes], newChildren = [...template.content.childNodes];
    for (let index = 0; index < Math.max(oldChildren.length, newChildren.length); index += 1) {
      if (!oldChildren[index]) this.shadowRoot.appendChild(newChildren[index].cloneNode(true));
      else if (!newChildren[index]) oldChildren[index].remove();
      else this._patchNode(oldChildren[index], newChildren[index]);
    }
  }

  // Nyt design (Claude AI, 2026-11-24; bruger: "nyt, lækkert, eksplosivt og intuitivt design … Verisure og de 3 låse er det
  // vigtige, resten er information … Ajax skal stadig være der, men behøver ikke så stor en plads").
  _render() {
    if (!this.shadowRoot || !this.config || !this._hass) return;
    const C = this.config, esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const primary = this._s(C.primary_alarm), secondary = this._s(C.secondary_alarm);
    const info = this._alarmInfo(primary?.state), secInfo = this._alarmInfo(secondary?.state), mode = info[3];
    const num = (id) => { const n = Number(this._s(id)?.state); return Number.isFinite(n) ? n : undefined; };
    const on = (id) => this._s(id)?.state === "on";
    const pend = this._pending || {};
    const locks = (C.locks || []).map((x) => {
      const st = this._s(x.entity), state = st?.state;
      const fault = on(x.radio_fault_entity) || on(x.network_fault_entity) || on(x.hardware_fault_entity);
      const pp = pend[x.entity]; const moving = ["locking", "unlocking", "opening"].includes(state) || (pp && Date.now() - pp.t < 15000 && state === pp.from);
      const cls = state === undefined || ["unavailable", "unknown", "jammed"].includes(state) || fault ? "err" : state === "locked" ? "locked" : "open";
      return { ...x, state, cls, moving, fault, bat: num(x.battery_entity), since: this._ago(st?.last_changed) };
    });
    const contacts = (C.contacts || []).map((x) => { const state = this._s(x.entity)?.state; const ok = x.inverted ? state === "on" : state === "off"; return { ...x, state, cls: state === undefined || ["unavailable", "unknown"].includes(state) ? "err" : ok ? "locked" : "open", bat: num(x.battery_entity) }; });
    const opens = (C.openings || []).map((x) => ({ ...x, state: this._s(x.entity)?.state, since: this._ago(this._s(x.entity)?.last_changed) })).filter((x) => x.state === "on");
    const offline = (C.openings || []).filter((x) => ["unavailable", "unknown", undefined].includes(this._s(x.entity)?.state)).length;
    const lockedN = locks.filter((x) => x.cls === "locked").length, issues = locks.filter((x) => x.cls !== "locked").length + contacts.filter((x) => x.cls !== "locked").length + opens.length;
    const total = locks.length + contacts.length + 1, secure = lockedN + contacts.filter((x) => x.cls === "locked").length + (opens.length ? 0 : 1);
    const R = 40, CC = 2 * Math.PI * R;
    const modes = [["disarmed", "Frakoblet", "mdi:shield-off-outline", C.actions?.disarm], ["armed_home", "Hjemme", "mdi:shield-home", C.actions?.home], ["armed_away", "Ude", "mdi:shield-lock", C.actions?.away]];
    const pad = (cls) => `<svg class="pad" viewBox="-4 -12 72 76" aria-hidden="true"><path class="shk" d="M20 30V21a12 12 0 0 1 24 0v9"/><rect class="body" x="13" y="29" width="38" height="28" rx="8"/><circle class="key" cx="32" cy="41" r="3.6"/><path class="key" d="M32 43.5v5.5"/></svg>`;
    const lockCard = (x, i) => {
      const act = x.cls === "locked" ? "unlock" : "lock";
      const label = x.cls === "err" ? (x.state === "jammed" ? "Blokeret" : x.fault ? "Radiofejl" : "Ikke tilgængelig") : x.moving ? (x.state === "unlocking" || (x.state !== "locking" && x.cls === "locked") ? "Låser op …" : "Låser …") : x.cls === "locked" ? "Låst" : "Ulåst";
      const slide = x.cls === "err" ? `<button class="errbtn" data-more="${esc(x.entity)}"><ha-icon icon="mdi:alert-circle-outline"></ha-icon>Tjek låsen</button>`
        : `<div class="slide range-slider ${act}${x.moving ? " busy" : ""}" data-slide="${esc(x.entity)}" data-act="${act}" style="--k:0"><i class="fill"></i><span class="txt">${x.moving ? label : act === "unlock" ? "Skub for at låse op" : "Skub for at låse"}<b>›››</b></span><button class="thumb" aria-label="${act === "unlock" ? "Lås op" : "Lås"} ${esc(x.name)}"><ha-icon icon="${x.moving ? "mdi:loading" : act === "unlock" ? "mdi:lock-open-variant" : "mdi:lock"}"></ha-icon></button></div>`;
      return `<article class="lk ${x.cls}${x.moving ? " moving" : ""}" style="--i:${i}">
        <div class="lkh" data-more="${esc(x.entity)}">${pad(x.cls)}<div class="lkt"><span>${esc(x.name)}</span><b>${label}</b><small>${x.since}</small></div>
          <div class="lkm">${Number.isFinite(x.bat) ? `<em class="${x.bat <= 20 ? "low" : ""}"><ha-icon icon="${x.bat <= 20 ? "mdi:battery-alert-variant-outline" : x.bat <= 50 ? "mdi:battery-50" : "mdi:battery"}"></ha-icon>${x.bat} %</em>` : ""}</div></div>
        ${slide}</article>`;
    };
    const stateTxt = (st) => ({ locked: "Låst", open: "Åben", err: "Fejl" })[st];
    this._commit(`<style>${SC_STYLE}</style>
<section class="sc m-${mode}">
  <div class="aur"><i></i><i></i><i></i></div>
  <header>
    <div><div class="eye"><i></i>Sikkerhed i realtid</div><h1>Sikkerhedscenter</h1><p class="${issues ? "warn" : "ok"}">${issues ? `${issues} ${issues === 1 ? "ting kræver" : "ting kræver"} opmærksomhed` : "Alt er sikret"}</p></div>
    <div class="score" style="--p:${(secure / total).toFixed(3)}"><svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="${R}"/><circle class="fg" cx="50" cy="50" r="${R}" stroke-dasharray="${((secure / total) * CC).toFixed(1)} ${CC.toFixed(1)}"/></svg><div><b>${secure}/${total}</b><span>sikret</span></div></div>
  </header>
  <div class="hero">
    <div class="shield" data-more="${esc(C.primary_alarm)}"><i class="r r1"></i><i class="r r2"></i><i class="r r3"></i><i class="sweep"></i><div class="core"><ha-icon icon="${info[2]}"></ha-icon></div></div>
    <div class="hb">
      <span class="brand">${esc(C.primary_alarm_name)}</span>
      <h2>${info[0]}</h2>
      <p>${info[1]} · ${this._ago(primary?.last_changed)}</p>
      <div class="modes">${modes.map(([st, lbl, ic, script]) => `<button class="mode${primary?.state === st ? " on" : ""}${!script ? " dis" : ""}" ${script && primary?.state !== st ? `data-hold="${esc(script)}"` : ""} data-label="${lbl}" style="--mc:var(--c-${st})"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19"/></svg><ha-icon icon="${ic}"></ha-icon><span>${lbl}</span></button>`).join("")}</div>
      <div class="hint" data-hint>Hold en knap inde for at skifte</div>
    </div>
  </div>
  <div class="sh"><h3>Låse</h3><span>${lockedN} af ${locks.length} låst</span></div>
  <div class="locks">${locks.map(lockCard).join("")}</div>
  <div class="sh"><h3>Overblik</h3><span>${offline ? `${offline} sensor${offline > 1 ? "er" : ""} offline` : "Alle sensorer online"}</span></div>
  <div class="info">
    ${C.secondary_alarm ? `<button class="ic ajax m2-${secInfo[3]}" data-more="${esc(C.secondary_alarm)}"><ha-icon icon="${secInfo[2]}"></ha-icon><div><span>${esc(C.secondary_alarm_name)}</span><b>${secInfo[0]}</b></div></button>` : ""}
    ${contacts.map((x) => `<button class="ic c-${x.cls}" data-more="${esc(x.entity)}"><ha-icon icon="${esc(x.icon || "mdi:lock-check-outline")}"></ha-icon><div><span>${esc(x.name)}</span><b>${x.cls === "locked" ? "Låst" : stateTxt(x.cls)}${Number.isFinite(x.bat) ? ` · ${x.bat} %` : ""}</b></div></button>`).join("")}
    <button class="ic op ${opens.length ? "c-open" : "c-locked"}" ${C.openings_path ? `data-nav="${esc(C.openings_path)}"` : ""}><ha-icon icon="${opens.length ? "mdi:window-open-variant" : "mdi:check-decagram"}"></ha-icon><div><span>Vinduer og døre</span><b>${opens.length ? `${opens.length} åben${opens.length > 1 ? "e" : ""}` : "Alt er lukket"}</b></div></button>
  </div>
  ${opens.length ? `<div class="opens">${opens.map((x, i) => `<button class="oc" style="--i:${i}" data-more="${esc(x.entity)}"><i></i>${esc(x.name)}<small>${x.since}</small></button>`).join("")}</div>` : ""}
</section>`);
  }
}

const SC_STYLE = `
:host{display:block;color:var(--primary-text-color,#f5f8fc);--ok:var(--dashboard-success,var(--success-color,#4fe0a6));--warn:var(--dashboard-warning,var(--warning-color,#ffbd59));--bad:var(--dashboard-danger,var(--error-color,#ff626f));--info:var(--dashboard-accent,var(--info-color,#71bfff));--mut:var(--secondary-text-color,#a7b2c2);--s:var(--surface,var(--ha-card-background,var(--card-background-color,#141c27)));--l:color-mix(in srgb,var(--primary-text-color) 9%,transparent);--c-disarmed:var(--info);--c-armed_home:var(--warn);--c-armed_away:var(--ok)}
*{box-sizing:border-box}button{font:inherit;color:inherit;border:0;background:none;cursor:pointer;-webkit-tap-highlight-color:transparent}
.sc{--a:var(--info);position:relative;isolation:isolate;overflow:hidden;padding:22px;border-radius:28px;background:var(--s);border:1px solid var(--l);box-shadow:var(--dashboard-shadow-strong,0 16px 40px rgba(0,0,0,.25))}
.sc.m-home{--a:var(--warn)}.sc.m-safe{--a:var(--ok)}.sc.m-danger{--a:var(--bad)}
.aur{position:absolute;inset:0;z-index:-1;overflow:hidden;pointer-events:none}.aur i{position:absolute;width:60%;aspect-ratio:1;border-radius:50%;filter:blur(60px);opacity:.22;background:var(--a);animation:au 18s ease-in-out infinite alternate}
.aur i:nth-child(1){left:-15%;top:-25%}.aur i:nth-child(2){right:-20%;top:10%;background:color-mix(in srgb,var(--a) 50%,#7c5cff);animation-duration:22s;opacity:.14}.aur i:nth-child(3){left:30%;bottom:-40%;opacity:.1;animation-duration:26s}
@keyframes au{to{transform:translate(8%,10%) scale(1.15)}}
header{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:18px}
.eye{display:flex;align-items:center;gap:8px;font-size:10.5px;font-weight:850;letter-spacing:.18em;text-transform:uppercase;color:var(--a)}.eye i{width:8px;height:8px;border-radius:50%;background:var(--a);box-shadow:0 0 0 0 var(--a);animation:ping 2s infinite}
@keyframes ping{70%{box-shadow:0 0 0 10px transparent}100%{box-shadow:0 0 0 0 transparent}}
h1{margin:4px 0 2px;font-size:32px;font-weight:850;letter-spacing:-.02em;line-height:1.15}header p{margin:0;font-size:14px;font-weight:750}header p.ok{color:var(--ok)}header p.warn{color:var(--warn)}
.score{position:relative;width:92px;height:92px;flex:none}.score svg{width:100%;height:100%;transform:rotate(-90deg)}.score circle{fill:none;stroke-width:9}.score .bg{stroke:color-mix(in srgb,var(--primary-text-color) 8%,transparent)}.score .fg{stroke:var(--ok);stroke-linecap:round;filter:drop-shadow(0 0 6px color-mix(in srgb,var(--ok) 60%,transparent));animation:arc 1.4s cubic-bezier(.2,.8,.2,1) both}
@keyframes arc{from{stroke-dasharray:0 999}}.score>div{position:absolute;inset:0;display:grid;place-content:center;text-align:center;line-height:1.05}.score b{font-size:20px;font-weight:850}.score span{font-size:9.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--mut)}
.hero{position:relative;display:grid;grid-template-columns:230px minmax(0,1fr);gap:26px;align-items:center;padding:22px;border-radius:24px;background:linear-gradient(135deg,color-mix(in srgb,var(--a) 14%,transparent),color-mix(in srgb,var(--a) 3%,transparent));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--a) 30%,transparent)}
.shield{position:relative;width:210px;height:210px;display:grid;place-items:center;cursor:pointer}
.shield .r{position:absolute;inset:0;border-radius:50%;border:2px solid color-mix(in srgb,var(--a) 45%,transparent)}
.shield .r2{inset:22px;border-color:color-mix(in srgb,var(--a) 30%,transparent)}.shield .r3{inset:44px;border-style:dashed;border-color:color-mix(in srgb,var(--a) 35%,transparent);animation:spin 30s linear infinite}
.shield .r1{animation:breath 4s ease-in-out infinite}@keyframes breath{50%{transform:scale(1.05);opacity:.5}}
.shield .sweep{position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,transparent 0 70%,color-mix(in srgb,var(--a) 55%,transparent) 100%);mask:radial-gradient(circle,transparent 0 38%,#000 39%);-webkit-mask:radial-gradient(circle,transparent 0 38%,#000 39%);opacity:0}
.m-home .shield .sweep,.m-safe .shield .sweep{opacity:1;animation:spin 3.6s linear infinite}.m-danger .shield .sweep{opacity:1;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.core{position:relative;width:104px;height:104px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 30%,color-mix(in srgb,var(--a) 45%,transparent),color-mix(in srgb,var(--a) 10%,transparent) 70%);box-shadow:0 0 40px color-mix(in srgb,var(--a) 45%,transparent),inset 0 0 0 2px color-mix(in srgb,var(--a) 60%,transparent)}
.core ha-icon{--mdc-icon-size:52px;color:var(--a);filter:drop-shadow(0 0 10px color-mix(in srgb,var(--a) 70%,transparent))}
.m-danger .core{animation:alarm .7s ease-in-out infinite}@keyframes alarm{50%{box-shadow:0 0 90px var(--bad),inset 0 0 0 2px var(--bad);transform:scale(1.06)}}
.hb{min-width:0}.brand{font-size:11px;font-weight:850;letter-spacing:.16em;text-transform:uppercase;color:var(--mut)}
.hb h2{margin:2px 0 4px;font-size:38px;font-weight:850;letter-spacing:-.02em;line-height:1.15;padding-bottom:.05em;background:linear-gradient(100deg,var(--primary-text-color) 30%,var(--a));-webkit-background-clip:text;background-clip:text;color:transparent}
.hb p{margin:0 0 16px;font-size:13px;color:var(--mut)}
.modes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.mode{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 8px 12px;border-radius:18px;background:color-mix(in srgb,var(--primary-text-color) 5%,transparent);box-shadow:inset 0 0 0 1px var(--l);user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:manipulation;transition:transform .2s,background .3s,box-shadow .3s}
.mode svg{position:absolute;top:8px;left:50%;width:52px;height:52px;margin-left:-26px;transform:rotate(-90deg);pointer-events:none}.mode svg circle{fill:none;stroke:var(--mc);stroke-width:3;stroke-linecap:round;stroke-dasharray:0 120;opacity:0;transition:stroke-dasharray .15s,opacity .15s}
.mode ha-icon{--mdc-icon-size:28px;color:var(--mc);margin-top:6px;transition:transform .3s}.mode span{font-size:13px;font-weight:800}
.mode.holding{transform:scale(.96);background:color-mix(in srgb,var(--mc) 14%,transparent)}.mode.holding svg circle{opacity:1;stroke-dasharray:120 120;transition:stroke-dasharray .9s linear,opacity .1s}
.mode.on{background:color-mix(in srgb,var(--mc) 20%,transparent);box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--mc) 70%,transparent),0 10px 30px -8px color-mix(in srgb,var(--mc) 60%,transparent);cursor:default}.mode.on ha-icon{transform:scale(1.12);filter:drop-shadow(0 0 8px var(--mc))}
.mode.fired{animation:pop .6s cubic-bezier(.3,1.6,.5,1)}@keyframes pop{40%{transform:scale(1.08)}}.mode.dis{opacity:.4;cursor:default}
.hint{margin-top:10px;font-size:11.5px;color:var(--mut);opacity:.7}.hint.show{animation:hint 2.6s ease both;color:var(--primary-text-color);opacity:1}@keyframes hint{0%{transform:translateY(4px);opacity:0}12%,80%{transform:none;opacity:1}100%{opacity:.7}}
.sh{display:flex;align-items:baseline;justify-content:space-between;margin:22px 4px 10px}.sh h3{margin:0;font-size:15px;font-weight:850}.sh span{font-size:12px;color:var(--mut)}
.locks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.lk{--lc:var(--ok);position:relative;overflow:hidden;display:flex;flex-direction:column;gap:14px;padding:16px;border-radius:22px;background:linear-gradient(160deg,color-mix(in srgb,var(--lc) 13%,transparent),color-mix(in srgb,var(--primary-text-color) 3%,transparent));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--lc) 30%,transparent);animation:rise .55s cubic-bezier(.16,1,.3,1) both;animation-delay:calc(var(--i) * 70ms)}
.lk.open{--lc:var(--warn)}.lk.err{--lc:var(--bad)}@keyframes rise{from{opacity:0;transform:translateY(12px)}}
.lkh{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:center;cursor:pointer}
.pad{width:56px;height:59px;overflow:visible;filter:drop-shadow(0 0 10px color-mix(in srgb,var(--lc) 55%,transparent))}
.pad .body{fill:color-mix(in srgb,var(--lc) 25%,transparent);stroke:var(--lc);stroke-width:3}.pad .shk{fill:none;stroke:var(--lc);stroke-width:5;stroke-linecap:round;transform-origin:44px 30px;transition:transform .6s cubic-bezier(.3,1.6,.5,1)}.pad .key{fill:var(--lc);stroke:var(--lc);stroke-width:3;stroke-linecap:round}
.lk.open .pad .shk{transform:translateY(-7px) rotate(28deg)}.lk.moving .pad{animation:wig .5s ease-in-out infinite}@keyframes wig{25%{transform:rotate(-6deg)}75%{transform:rotate(6deg)}}
.lk.err .pad{animation:shake 1.6s ease-in-out infinite}@keyframes shake{0%,80%,100%{transform:none}84%,92%{transform:translateX(-3px)}88%,96%{transform:translateX(3px)}}
.lkt{min-width:0;display:flex;flex-direction:column}.lkt span{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--mut)}.lkt b{font-size:24px;font-weight:850;color:var(--lc);line-height:1.15}.lkt small{font-size:11.5px;color:var(--mut)}
.lkm em{display:inline-flex;align-items:center;gap:3px;font-style:normal;font-size:11.5px;font-weight:750;color:var(--mut)}.lkm em ha-icon{--mdc-icon-size:16px}.lkm em.low{color:var(--bad)}
.slide{--k:0;--sc:var(--warn);position:relative;height:58px;border-radius:999px;background:color-mix(in srgb,var(--sc) 12%,color-mix(in srgb,var(--primary-text-color) 4%,transparent));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--sc) 35%,transparent);overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none}
.slide.lock{--sc:var(--ok)}
.slide .fill{position:absolute;left:0;top:0;bottom:0;width:calc(58px + (100% - 58px) * var(--k));border-radius:999px;background:linear-gradient(90deg,color-mix(in srgb,var(--sc) 30%,transparent),color-mix(in srgb,var(--sc) 55%,transparent))}
.slide .txt{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:8px;padding-left:50px;font-size:13.5px;font-weight:800;opacity:calc(1 - var(--k) * 1.6);background:linear-gradient(100deg,var(--mut) 30%,var(--primary-text-color) 50%,var(--mut) 70%) 0 0/250% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:shim 2.6s linear infinite;pointer-events:none}
.slide .txt b{letter-spacing:-2px}@keyframes shim{from{background-position:100% 0}to{background-position:-150% 0}}
.slide .thumb{position:absolute;left:4px;top:4px;width:50px;height:50px;border-radius:50%;display:grid;place-items:center;background:var(--sc);color:#0d1117;box-shadow:0 6px 18px -4px color-mix(in srgb,var(--sc) 70%,transparent),inset 0 1px 0 rgba(255,255,255,.5);cursor:grab;touch-action:none;transition:transform .45s cubic-bezier(.3,1.5,.5,1)}
.slide.dragging .thumb{transition:none;cursor:grabbing}.slide .thumb ha-icon{--mdc-icon-size:24px}
.slide.done .thumb{animation:thumbok .5s ease}@keyframes thumbok{50%{box-shadow:0 0 0 10px color-mix(in srgb,var(--sc) 30%,transparent)}}
.slide.busy .thumb ha-icon{animation:spin 1s linear infinite}.slide.busy .txt{opacity:1;padding-left:50px}.slide.busy .fill{width:100%;animation:busyf 1.4s ease-in-out infinite}@keyframes busyf{50%{opacity:.45}}
.slide.busy.done .thumb{transform:translateX(calc(100% * 0))}
.errbtn{display:flex;align-items:center;justify-content:center;gap:8px;height:58px;border-radius:999px;font-weight:800;color:var(--bad);background:color-mix(in srgb,var(--bad) 12%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--bad) 40%,transparent)}
.info{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
.ic{--icc:var(--ok);display:flex;align-items:center;gap:11px;padding:12px 14px;border-radius:18px;text-align:left;background:color-mix(in srgb,var(--icc) 8%,color-mix(in srgb,var(--primary-text-color) 3%,transparent));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--icc) 25%,transparent);transition:transform .2s}
.ic:hover{transform:translateY(-2px)}.ic ha-icon{--mdc-icon-size:26px;color:var(--icc);flex:none}.ic div{min-width:0;display:flex;flex-direction:column}.ic span{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ic b{font-size:15px;font-weight:800}
.ic.c-open{--icc:var(--warn)}.ic.c-err{--icc:var(--bad)}.ic.ajax{--icc:var(--info)}.ic.m2-home{--icc:var(--warn)}.ic.m2-safe{--icc:var(--ok)}.ic.m2-danger{--icc:var(--bad)}
.ic.op.c-locked ha-icon{animation:okp 3s ease-in-out infinite}@keyframes okp{50%{transform:scale(1.12);filter:drop-shadow(0 0 8px var(--ok))}}
.opens{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.oc{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;font-size:12.5px;font-weight:750;background:color-mix(in srgb,var(--warn) 12%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--warn) 40%,transparent);animation:rise .45s both;animation-delay:calc(var(--i) * 50ms)}.oc i{width:8px;height:8px;border-radius:50%;background:var(--warn);animation:ping 1.8s infinite}.oc small{color:var(--mut);font-weight:600}
@media(max-width:900px){.hero{grid-template-columns:180px minmax(0,1fr);gap:18px}.shield{width:170px;height:170px}.core{width:86px;height:86px}.core ha-icon{--mdc-icon-size:42px}.locks{grid-template-columns:1fr}}
@media(max-width:600px){.sc{padding:16px;border-radius:24px}h1{font-size:26px}.score{width:76px;height:76px}.score b{font-size:17px}.hero{grid-template-columns:1fr;justify-items:center;text-align:center;padding:18px 14px}.hb{width:100%}.hb h2{font-size:30px}.lkt b{font-size:22px}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;
if(!customElements.get("ha-security-center-card")) customElements.define("ha-security-center-card",HaSecurityCenterCard);
window.customCards=window.customCards||[];window.customCards.push({type:"ha-security-center-card",name:"HA Security Center",description:`Security center ${SECURITY_CENTER_VERSION}`});
