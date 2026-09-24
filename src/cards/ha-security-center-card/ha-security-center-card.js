import "./ha-card-list-editor.js";
const SECURITY_CENTER_VERSION = "0.3.4";

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
      this.shadowRoot.addEventListener("click", event => this._activate(event.target.closest("[data-script],[data-more],[data-lock],[data-nav]")));
      this.shadowRoot.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const target = event.target.closest("[data-lock]");
        if (!target) return;
        event.preventDefault(); this._activate(target);
      });
    }
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    const signature = this._signature();
    if (signature !== this._lastSignature) { this._lastSignature = signature; this._render(); }
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
    if (target.dataset.script) this._service("script", "turn_on", { entity_id: target.dataset.script });
    else if (target.dataset.lock) this._service("lock", target.dataset.state === "locked" ? "unlock" : "lock", { entity_id: target.dataset.lock });
    else if (target.dataset.more) this._moreInfo(target.dataset.more);
    else if (target.dataset.nav) this._navigate(target.dataset.nav);
  }

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

  _render() {
    if (!this.shadowRoot || !this.config || !this._hass) return;
    const primary = this._s(this.config.primary_alarm), secondary = this._s(this.config.secondary_alarm);
    const info = this._alarmInfo(primary?.state), secondaryInfo = this._alarmInfo(secondary?.state);
    const LOCK_ERROR_STATES = ["unavailable", "unknown", "jammed"];
    const battery = id => { const n = Number(this._s(id)?.state); return Number.isFinite(n) ? n : undefined; };
    const linkq = id => { const n = Number(this._s(id)?.state); return Number.isFinite(n) ? Math.round(Math.min(100, (n / 255) * 100)) : undefined; };
    const faulted = id => this._s(id)?.state === "on";
    const locks = (this.config.locks || []).map(x => {
      const state = this._s(x.entity)?.state;
      const hasRadio = !!(x.radio_fault_entity || x.network_fault_entity || x.hardware_fault_entity);
      const radioFault = faulted(x.radio_fault_entity) || faulted(x.network_fault_entity) || faulted(x.hardware_fault_entity);
      const cls = (state === undefined || LOCK_ERROR_STATES.includes(state) || radioFault) ? "error" : state === "locked" ? "locked" : "unlocked";
      return { ...x, state, cls, battery: battery(x.battery_entity), hasRadio, radioFault };
    });
    const contacts = (this.config.contacts || []).map(x => {
      const state = this._s(x.entity)?.state;
      const secured = x.inverted ? state === "on" : state === "off";
      const cls = (state === undefined || ["unavailable", "unknown"].includes(state)) ? "error" : secured ? "locked" : "unlocked";
      return { ...x, state, cls, battery: battery(x.battery_entity), signal: linkq(x.signal_entity) };
    });
    const clsColor = c => c === "locked" ? "var(--dashboard-success, var(--success-color, #5edbb0))" : c === "unlocked" ? "var(--dashboard-warning, var(--warning-color, #ffbd59))" : "var(--dashboard-danger, var(--error-color, #ff626f))";
    const batteryIcon = b => b <= 20 ? "mdi:battery-alert-variant-outline" : b <= 50 ? "mdi:battery-50" : "mdi:battery";
    const openings = (this.config.openings || []).map(x => ({ ...x, state: this._s(x.entity)?.state })).filter(x => x.state === "on");
    const unavailable = (this.config.openings || []).filter(x => ["unavailable", "unknown", undefined].includes(this._s(x.entity)?.state));
    const locked = locks.filter(x => x.cls === "locked").length;
    const insecureContacts = contacts.filter(x => x.cls === "unlocked").length;
    const mode = info[3];
    this._commit(`<style>
      :host{display:block;color:var(--primary-text-color,#f5f8fc);font-family:var(--paper-font-body1_-_font-family,Inter,system-ui,sans-serif)}*{box-sizing:border-box}
      .shell{--accent:${mode === "danger" ? "var(--dashboard-danger, var(--error-color, #ff626f))" : mode === "home" ? "var(--dashboard-warning, var(--warning-color, #ffbd59))" : mode === "safe" ? "var(--dashboard-success, var(--success-color, #5edbb0))" : "var(--dashboard-accent, var(--info-color, #68b8ff))"};--sc-muted:var(--secondary-text-color,var(--sc-muted));--sc-edge:var(--dashboard-border-neutral,var(--divider-color,rgba(145,174,203,.16)));--sc-tile:color-mix(in srgb,var(--primary-text-color,#fff) 4%,transparent);position:relative;isolation:isolate;overflow:hidden;padding:28px;border:1px solid var(--sc-edge);border-radius:30px;background:radial-gradient(circle at 88% 3%,color-mix(in srgb,var(--accent) 14%,transparent),transparent 30%),var(--dashboard-card-bg,var(--ha-card-background,var(--card-background-color,#0d1c2b)));box-shadow:var(--dashboard-card-shadow,var(--ha-card-box-shadow,0 24px 60px rgba(0,0,0,.3)))}
      .shell:before{content:"";position:absolute;inset:0;z-index:-1;opacity:.17;background-image:linear-gradient(color-mix(in srgb,var(--primary-text-color,#fff) 3%,transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb,var(--primary-text-color,#fff) 3%,transparent) 1px,transparent 1px);background-size:40px 40px}
      header{display:flex;justify-content:space-between;align-items:flex-start;gap:22px;margin-bottom:20px}.eyebrow{display:flex;align-items:center;gap:9px;color:var(--accent);font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase}.pulse{width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 14px var(--accent)}h1{margin:7px 0 4px;font-size:clamp(29px,3.2vw,44px);line-height:1;letter-spacing:-.045em}.subtitle{color:var(--sc-muted);font-size:14px}.summary{display:flex;gap:8px}.sum{min-width:105px;padding:11px 13px;border:1px solid var(--sc-edge);border-radius:15px;background:var(--sc-tile)}.sum span{display:block;color:var(--sc-muted);font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.sum strong{display:block;margin-top:5px;font-size:17px}.warn{color:var(--dashboard-warning, var(--warning-color, #ffbd59))!important}.danger{color:var(--dashboard-danger, var(--error-color, #ff6f79))!important}
      .hero{position:relative;overflow:hidden;display:grid;grid-template-columns:240px minmax(0,1fr);gap:24px;padding:22px;border:1px solid color-mix(in srgb,var(--accent) 36%,var(--sc-edge));border-radius:24px;background:var(--sc-tile)}.visual{display:grid;place-items:center;min-height:210px}.radar{position:relative;display:grid;place-items:center;width:158px;height:158px;border-radius:50%;border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);background:radial-gradient(circle,color-mix(in srgb,var(--accent) 15%,transparent),transparent 63%)}.radar:before,.radar:after{content:"";position:absolute;border-radius:50%;border:1px solid color-mix(in srgb,var(--accent) 25%,transparent);animation:breathe 3s ease-in-out infinite}.radar:before{inset:16px}.radar:after{inset:-12px;animation-delay:1s}.radar ha-icon{--mdc-icon-size:62px;color:var(--accent);filter:drop-shadow(0 0 13px color-mix(in srgb,var(--accent) 60%,transparent))}.shell.danger-mode .radar{animation:alarm 1.1s ease-in-out infinite}.hero-body{display:flex;flex-direction:column;justify-content:center;min-width:0}.state-label{color:var(--sc-muted);font-size:10px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}.state-title{margin-top:5px;font-size:30px;font-weight:800;letter-spacing:-.035em}.state-copy{margin-top:4px;color:var(--sc-muted);font-size:13px}.changed{margin-top:12px;color:var(--sc-muted);font-size:11px}.modes{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:22px}.mode{display:flex;align-items:center;gap:9px;min-height:58px;padding:10px 12px;border:1px solid var(--sc-edge);border-radius:14px;background:var(--sc-tile);color:var(--sc-muted);cursor:pointer;transition:.2s ease}.mode:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--tone) 48%,transparent)}.mode.active{color:var(--primary-text-color,#fff);border-color:color-mix(in srgb,var(--tone) 52%,transparent);background:color-mix(in srgb,var(--tone) 14%,transparent);box-shadow:0 0 22px color-mix(in srgb,var(--tone) 10%,transparent)}.mode.disabled{cursor:default;opacity:.4}.mode.disabled:hover{transform:none;border-color:var(--sc-edge)}.mode ha-icon{--mdc-icon-size:22px;color:var(--tone)}.mode b{font-size:12px}
      .section-title{display:flex;align-items:center;justify-content:space-between;margin:24px 2px 10px}.section-title h2{margin:0;font-size:14px;letter-spacing:.02em}.section-title span{color:var(--sc-muted);font-size:11px}.systems{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:12px}.system,.access,.open-panel{border:1px solid var(--sc-edge);border-radius:19px;background:var(--sc-tile)}.system{display:flex;align-items:center;gap:13px;padding:15px;cursor:pointer}.system-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:13px;background:color-mix(in srgb,var(--color) 14%,transparent);color:var(--color)}.system-icon ha-icon{--mdc-icon-size:23px}.system b{display:block;font-size:14px}.system small{display:block;margin-top:3px;color:var(--sc-muted)}.system-state{margin-left:auto;color:var(--color);font-size:11px;font-weight:800;text-transform:uppercase}
      .access-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,145px),1fr));gap:10px}.access{position:relative;min-height:135px;padding:14px;overflow:hidden}.access ha-icon{--mdc-icon-size:28px;color:var(--color)}.access b{display:block;margin-top:20px;font-size:13px}.access span{display:block;margin-top:4px;color:var(--color);font-size:11px;font-weight:750}.access .meta{display:flex;gap:9px;flex-wrap:wrap;margin-top:7px}.access .meta span{display:inline-flex;align-items:center;gap:3px;color:var(--sc-muted);font-size:10px;font-weight:700}.access .meta ha-icon{--mdc-icon-size:12px;color:var(--sc-muted)}.access.has-error{animation:access-error-pulse 1.8s ease-in-out infinite}@keyframes access-error-pulse{0%,100%{box-shadow:0 0 0 0 color-mix(in srgb,var(--dashboard-danger, var(--error-color, #ff626f)) 0%,transparent)}50%{box-shadow:0 0 0 3px color-mix(in srgb,var(--dashboard-danger, var(--error-color, #ff626f)) 30%,transparent)}}.lock-action{position:absolute;right:10px;bottom:10px;display:grid;place-items:center;width:32px;height:32px;border:1px solid var(--sc-edge);border-radius:10px;background:var(--sc-tile);cursor:pointer}.lock-action ha-icon{--mdc-icon-size:17px}.open-panel{padding:16px;cursor:pointer}.open-head{display:flex;align-items:center;gap:12px}.open-head>ha-icon{--mdc-icon-size:27px;color:${openings.length ? "var(--dashboard-warning, var(--warning-color, #ffbd59))" : "var(--dashboard-success, var(--success-color, #5edbb0))"}}.open-head b{display:block;font-size:15px}.open-head span{display:block;margin-top:2px;color:var(--sc-muted);font-size:11px}.chevron{margin-left:auto;color:var(--sc-muted)}.open-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:7px;margin-top:13px}.opening{display:flex;align-items:center;gap:7px;padding:8px 9px;border-radius:10px;background:color-mix(in srgb,var(--dashboard-warning,var(--warning-color,#ffbd59)) 10%,transparent);color:var(--dashboard-warning, var(--warning-color, #ffca75));font-size:11px}.opening ha-icon{--mdc-icon-size:15px}.empty{margin-top:12px;color:var(--dashboard-success, var(--success-color, #69d8b1));font-size:12px}
      .access[data-lock]{cursor:pointer;transition:transform .18s ease,border-color .18s ease,background .18s ease}.access[data-lock]:hover,.access[data-lock]:focus-visible{transform:translateY(-2px);border-color:color-mix(in srgb,var(--color) 52%,transparent);background:color-mix(in srgb,var(--color) 9%,transparent);outline:none}.access[data-lock] .lock-action{pointer-events:none}
      @keyframes breathe{50%{transform:scale(1.07);opacity:.5}}@keyframes alarm{50%{box-shadow:0 0 45px color-mix(in srgb,var(--dashboard-danger, var(--error-color, #ff4655)) 32%,transparent)}}
      @media(max-width:900px){header{flex-direction:column}.summary{width:100%}.sum{flex:1;min-width:0}.hero{grid-template-columns:190px 1fr}.access-grid{grid-template-columns:repeat(3,1fr)}}
      @media(max-width:600px){.shell{padding:14px;border-radius:21px}h1{font-size:29px}.subtitle{font-size:12px}.summary{display:grid;grid-template-columns:repeat(3,1fr)}.sum{padding:8px}.sum strong{font-size:14px}.hero{grid-template-columns:1fr;padding:15px}.visual{min-height:145px}.radar{width:125px;height:125px}.radar ha-icon{--mdc-icon-size:48px}.state-title{font-size:25px;text-align:center}.state-copy,.changed,.state-label{text-align:center}.modes{gap:6px}.mode{justify-content:center;min-height:54px;padding:7px}.mode b{font-size:10px}.mode ha-icon{--mdc-icon-size:19px}.systems{grid-template-columns:1fr}.access-grid{grid-template-columns:repeat(2,1fr)}.access{min-height:120px}.open-list{grid-template-columns:1fr}}
    </style><section class="shell ${mode === "danger" ? "danger-mode" : ""}">
      <header><div><div class="eyebrow"><i class="pulse"></i>Sikkerhed i realtid</div><h1>Sikkerhedscenter</h1><div class="subtitle">Alarm, adgangspunkter og hjemmets ydre skal</div></div><div class="summary"><div class="sum"><span>Alarm</span><strong>${info[0]}</strong></div><div class="sum"><span>Låste døre</span><strong>${locked} / ${locks.length}</strong></div><div class="sum"><span>Åbninger</span><strong class="${openings.length ? "warn" : ""}">${openings.length}</strong></div></div></header>
      <div class="hero"><div class="visual"><div class="radar"><ha-icon icon="${info[2]}"></ha-icon></div></div><div class="hero-body"><div class="state-label">${this.config.primary_alarm_name} alarm</div><div class="state-title">${info[0]}</div><div class="state-copy">${info[1]}</div><div class="changed">Sidst ændret ${this._ago(primary?.last_changed)}</div><div class="modes">
        ${[["disarmed","Frakoblet","mdi:shield-lock-open-outline","var(--dashboard-accent, var(--info-color, #71bfff))",this.config.actions.disarm],["armed_home","Hjemme","mdi:shield-home-outline","var(--dashboard-warning, var(--warning-color, #ffbd59))",this.config.actions.home],["armed_away","Ude","mdi:shield-lock-outline","var(--dashboard-success, var(--success-color, #5edbb0))",this.config.actions.away]].map(x=>`<div class="mode ${primary?.state===x[0]?"active":""} ${x[4]?"":"disabled"}" style="--tone:${x[3]}" ${x[4]?`data-script="${x[4]}"`:""}><ha-icon icon="${x[2]}"></ha-icon><b>${x[1]}</b></div>`).join("")}
      </div></div></div>
      <div class="section-title"><h2>Systemer</h2><span>Tryk for detaljer</span></div><div class="systems">
        ${[[this.config.primary_alarm,this.config.primary_alarm_name,info],...(this.config.secondary_alarm?[[this.config.secondary_alarm,this.config.secondary_alarm_name,secondaryInfo]]:[])].map(x=>`<div class="system" data-more="${x[0]}" style="--color:${x[2][3]==="danger"?"var(--dashboard-danger, var(--error-color, #ff626f))":x[2][3]==="home"?"var(--dashboard-warning, var(--warning-color, #ffbd59))":x[2][3]==="safe"?"var(--dashboard-success, var(--success-color, #5edbb0))":"var(--dashboard-accent, var(--info-color, #68b8ff))"}"><div class="system-icon"><ha-icon icon="${x[2][2]}"></ha-icon></div><div><b>${x[1]}</b><small>Ændret ${this._ago(this._s(x[0])?.last_changed)}</small></div><div class="system-state">${x[2][0]}</div></div>`).join("")}
      </div><div class="section-title"><h2>Adgangspunkter</h2><span>${locked + (contacts.length-insecureContacts)} af ${locks.length+contacts.length} sikret</span></div><div class="access-grid">
        ${locks.map(x=>{
          const color = clsColor(x.cls);
          const label = x.cls==='error' ? 'Fejl' : x.state==='locked' ? 'Låst' : 'Ulåst';
          const meta = [];
          if (Number.isFinite(x.battery)) meta.push(`<span><ha-icon icon="${batteryIcon(x.battery)}"></ha-icon>${x.battery}%</span>`);
          if (x.hasRadio) meta.push(`<span><ha-icon icon="${x.radioFault?'mdi:wifi-alert':'mdi:wifi'}"></ha-icon>${x.radioFault?'Fejl':'OK'}</span>`);
          return `<div class="access ${x.cls==='error'?'has-error':''}" data-lock="${x.entity}" data-state="${x.state}" role="button" tabindex="0" aria-label="${x.state==='locked'?'Lås op':'Lås'} ${x.name}" style="--color:${color}"><ha-icon icon="${x.icon||'mdi:door-closed-lock'}"></ha-icon><b>${x.name}</b><span>${label}</span>${meta.length?`<div class="meta">${meta.join('')}</div>`:''}<div class="lock-action" aria-hidden="true"><ha-icon icon="${x.state==='locked'?'mdi:lock-open-variant-outline':'mdi:lock-outline'}"></ha-icon></div></div>`;
        }).join("")}
        ${contacts.map(x=>{
          const color = clsColor(x.cls);
          const label = x.cls==='error' ? 'Fejl' : x.cls==='locked' ? 'Sikret' : 'Ikke sikret';
          const meta = [];
          if (Number.isFinite(x.battery)) meta.push(`<span><ha-icon icon="${batteryIcon(x.battery)}"></ha-icon>${x.battery}%</span>`);
          if (Number.isFinite(x.signal)) meta.push(`<span><ha-icon icon="${x.signal<=30?'mdi:wifi-strength-1-alert':'mdi:wifi'}"></ha-icon>${x.signal}%</span>`);
          return `<div class="access ${x.cls==='error'?'has-error':''}" data-more="${x.entity}" style="--color:${color}"><ha-icon icon="${x.icon||'mdi:lock-check-outline'}"></ha-icon><b>${x.name}</b><span>${label}</span>${meta.length?`<div class="meta">${meta.join('')}</div>`:''}</div>`;
        }).join("")}
      </div><div class="section-title"><h2>Vinduer og døre</h2><span>${unavailable.length ? `${unavailable.length} utilgængelig` : 'Alle sensorer online'}</span></div><div class="open-panel" ${this.config.openings_path ? `data-nav="${this.config.openings_path}"` : ""}><div class="open-head"><ha-icon icon="${openings.length?'mdi:door-open':'mdi:shield-check-outline'}"></ha-icon><div><b>${openings.length?`${openings.length} åbne kontakter`:'Hele huset er lukket'}</b><span>${openings.length?'Tryk for det komplette overblik':'Ingen åbne vinduer eller døre'}</span></div><ha-icon class="chevron" icon="mdi:chevron-right"></ha-icon></div>${openings.length?`<div class="open-list">${openings.slice(0,6).map(x=>`<div class="opening"><ha-icon icon="mdi:window-open-variant"></ha-icon>${x.name}</div>`).join('')}</div>`:`<div class="empty">Alt ser sikkert ud</div>`}</div>
    </section>`);
  }
}
if(!customElements.get("ha-security-center-card")) customElements.define("ha-security-center-card",HaSecurityCenterCard);
window.customCards=window.customCards||[];window.customCards.push({type:"ha-security-center-card",name:"HA Security Center",description:`Security center ${SECURITY_CENTER_VERSION}`});
