import "../ha-ai-usage-card/ha-card-list-editor.js";

const VERSION = "0.1.0";

class HALightAutomationCard extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});this._activeRoom=0;}

  static getStubConfig(){
    return {
      title:"Automatisk lys",
      subtitle:"Bevægelse, dagslys og lux samlet ét sted",
      daylight:{
        active_entity:"binary_sensor.lys_dagvindue_aktiv",
        mode_entity:"input_select.lys_dagvindue_tilstand",
        planned_start_entity:"sensor.dagvindue_planlagt_start",
        planned_end_entity:"sensor.dagvindue_planlagt_slut",
        sunrise_delay_entity:"input_number.dagvindue_forsinkelse_efter_solopgang",
        sunset_early_entity:"input_number.dagvindue_tidligere_stop_for_solnedgang",
        manual_start_entity:"input_datetime.lys_dagvindue_manuel_start",
        manual_end_entity:"input_datetime.lys_dagvindue_manuel_slut"
      },
      rooms:[]
    };
  }

  static getConfigElement(){
    const editor=document.createElement("ha-card-list-editor");
    editor.definition={
      roots:[{key:"title",label:"Titel"},{key:"subtitle",label:"Undertitel"},{key:"daylight.active_entity",label:"Dagvindue aktivt",type:"entity"},{key:"daylight.mode_entity",label:"Dagvindue tilstand",type:"entity"},{key:"daylight.planned_start_entity",label:"Planlagt start",type:"entity"},{key:"daylight.planned_end_entity",label:"Planlagt slut",type:"entity"},{key:"daylight.sunrise_delay_entity",label:"Efter solopgang",type:"entity"},{key:"daylight.sunset_early_entity",label:"Før solnedgang",type:"entity"},{key:"daylight.manual_start_entity",label:"Manuel start",type:"entity"},{key:"daylight.manual_end_entity",label:"Manuel slut",type:"entity"}],
      collections:[{key:"rooms",label:"Rum",itemLabel:"rum",defaults:{name:"Nyt rum",icon:"mdi:lightbulb-auto"},fields:[{key:"name",label:"Navn"},{key:"icon",label:"Ikon"},{key:"presence_entity",label:"Vedvarende tilstedeværelse",type:"entity"},{key:"lux_enabled_entity",label:"Lux-krav",type:"entity"},{key:"vacuum_exception_entity",label:"Støvsuger-undtagelse",type:"entity"},{key:"delay_entity",label:"Forsinkelse",type:"entity"},{key:"lux_threshold_entity",label:"Lux-tærskel",type:"entity"}]}]
    };
    return editor;
  }

  setConfig(config){
    const defaults=HALightAutomationCard.getStubConfig();
    this._config={...defaults,...config,daylight:{...defaults.daylight,...config?.daylight},rooms:Array.isArray(config?.rooms)?structuredClone(config.rooms):[]};
    this._build();
  }

  set hass(hass){this._hass=hass;if(!this.shadowRoot?.querySelector("ha-card"))this._build();this._sync();}
  _state(entity){return this._hass?.states?.[entity];}
  _value(entity,fallback=""){const value=this._state(entity)?.state;return value==null||["unknown","unavailable"].includes(value)?fallback:value;}
  _on(entity){return this._value(entity)==="on";}
  _esc(value){return String(value??"").replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);}
  _call(domain,service,data){return this._hass?.callService(domain,service,data);}
  _toggle(entity){if(entity)this._call("input_boolean",this._on(entity)?"turn_off":"turn_on",{entity_id:entity});}
  _set(entity,value){
    if(!entity)return;
    const domain=entity.split(".")[0];
    if(domain==="input_number")this._call(domain,"set_value",{entity_id:entity,value:Number(value)});
    if(domain==="input_select")this._call(domain,"select_option",{entity_id:entity,option:value});
    if(domain==="input_datetime")this._call(domain,"set_datetime",{entity_id:entity,time:String(value).length===5?`${value}:00`:value});
  }
  _moreInfo(entity){if(entity)this.dispatchEvent(new CustomEvent("hass-more-info",{detail:{entityId:entity},bubbles:true,composed:true}));}
  _options(entity){return this._state(entity)?.attributes?.options||[];}

  _room(room,index){
    const switches=[
      ["presence_entity","mdi:timer-sand","Vedvarende tilstedeværelse"],
      ["lux_enabled_entity","mdi:brightness-6","Brug lux-krav"],
      ["vacuum_exception_entity","mdi:robot-vacuum-variant-off","Undtag ved støvsugning"]
    ].filter(([key])=>room[key]);
    return `<section class="room ${index===this._activeRoom?"active":""}" data-room="${index}">
      <div class="switches">${switches.map(([key,icon,label])=>`<button class="switch-card" data-toggle="${this._esc(room[key])}"><ha-icon icon="${icon}"></ha-icon><span><b>${label}</b><small data-switch-state>Fra</small></span><i class="switch"></i></button>`).join("")}</div>
      <div class="settings">
        ${this._slider(room.delay_entity,"mdi:timer-outline","Tænd-forsinkelse","sek")}
        ${this._slider(room.lux_threshold_entity,"mdi:brightness-5","Lux-tærskel","lx")}
      </div>
    </section>`;
  }

  _slider(entity,icon,label,unit){
    if(!entity)return "";
    const state=this._state(entity),min=state?.attributes?.min??0,max=state?.attributes?.max??100,step=state?.attributes?.step??1;
    return `<div class="control"><div class="control-head"><span><ha-icon icon="${icon}"></ha-icon>${label}</span><b data-output="${this._esc(entity)}">—</b></div><input type="range" min="${min}" max="${max}" step="${step}" data-range="${this._esc(entity)}"><small>${unit}</small></div>`;
  }

  _build(){
    if(!this._config)return;
    const d=this._config.daylight;
    this.shadowRoot.innerHTML=`<style>
      :host{display:block;--accent:var(--dashboard-accent,var(--primary-color,#22c9ff));--sun:#ffc247;--green:var(--dashboard-success,var(--success-color,#00e69a));--muted:var(--secondary-text-color,#8d9baa);--surface:var(--dashboard-card-bg,var(--ha-card-background,var(--card-background-color,#11161d)));--edge:var(--dashboard-border-neutral,var(--divider-color,rgba(135,155,175,.2)))}*{box-sizing:border-box}button,input,select{font:inherit;color:inherit}ha-card{overflow:hidden;border:1px solid var(--edge);border-left:4px solid var(--sun);border-radius:24px;background:radial-gradient(circle at 90% -5%,color-mix(in srgb,var(--sun) 15%,transparent),transparent 28%),linear-gradient(145deg,color-mix(in srgb,var(--surface) 97%,var(--sun) 3%),var(--surface));box-shadow:var(--dashboard-shadow-deep,var(--ha-card-box-shadow))}.shell{padding:20px}header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:15px}.eyebrow{display:flex;align-items:center;gap:8px;color:var(--sun);font-size:11px;font-weight:900;letter-spacing:.13em;text-transform:uppercase}.sun-dot{width:9px;height:9px;border-radius:50%;background:var(--sun);box-shadow:0 0 16px var(--sun);animation:glow 2.4s ease-in-out infinite}h2{margin:5px 0 3px;font-size:27px;line-height:1.05}.sub{color:var(--muted);font-size:13px}.summary{display:flex;gap:7px}.badge{min-width:82px;padding:8px 11px;border:1px solid var(--edge);border-radius:12px;background:rgba(255,255,255,.035);color:var(--muted);font-size:10px}.badge b{display:block;color:var(--primary-text-color);font-size:15px}.daylight{display:grid;grid-template-columns:210px minmax(260px,1fr) minmax(290px,1.2fr);gap:11px;padding:13px;border:1px solid color-mix(in srgb,var(--sun) 24%,var(--edge));border-radius:18px;background:radial-gradient(circle at 0 0,color-mix(in srgb,var(--sun) 10%,transparent),transparent 40%),rgba(0,0,0,.1)}.day-status{position:relative;overflow:hidden;display:flex;align-items:center;gap:12px;min-height:103px;padding:13px;border-radius:14px;background:rgba(255,255,255,.04);cursor:pointer}.day-status>ha-icon{--mdc-icon-size:42px;color:var(--muted)}.day-status.on>ha-icon{color:var(--sun);filter:drop-shadow(0 0 9px color-mix(in srgb,var(--sun) 70%,transparent))}.day-status b,.day-status small{display:block}.day-status b{font-size:15px}.day-status small{margin-top:4px;color:var(--muted)}.day-status .orb{position:absolute;right:-26px;bottom:-32px;width:90px;height:90px;border-radius:50%;background:var(--sun);filter:blur(25px);opacity:.08}.day-status.on .orb{opacity:.25}.mode{display:grid;align-content:center;gap:8px}.field-label{color:var(--muted);font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}select,input[type=time]{width:100%;height:42px;padding:0 11px;border:1px solid var(--edge);border-radius:11px;outline:0;background:color-mix(in srgb,var(--surface) 91%,black 9%)}select:focus,input:focus{border-color:var(--accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 15%,transparent)}.times{display:grid;grid-template-columns:repeat(2,1fr);gap:7px}.time{padding:9px 10px;border:1px solid var(--edge);border-radius:12px;background:rgba(255,255,255,.025)}.time span,.time b{display:block}.time span{color:var(--muted);font-size:9px;font-weight:800;text-transform:uppercase}.time b{margin-top:4px;font-size:16px}.day-controls{display:grid;grid-template-columns:repeat(2,1fr);gap:7px;margin-top:7px}.mini-control{padding:8px 9px;border:1px solid var(--edge);border-radius:11px;background:rgba(255,255,255,.025)}.mini-control span{display:flex;justify-content:space-between;color:var(--muted);font-size:9px}.mini-control b{color:var(--primary-text-color)}.mini-control input[type=range]{width:100%;margin-top:8px;accent-color:var(--sun)}.manual{display:grid;grid-template-columns:repeat(2,1fr);gap:7px;margin-top:7px}.manual label{color:var(--muted);font-size:9px}.manual input{height:34px;margin-top:4px;font-size:12px}.rooms-wrap{margin-top:13px;padding:13px;border:1px solid var(--edge);border-radius:18px;background:rgba(0,0,0,.1)}.section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:11px}.section-head b{display:block;font-size:15px}.section-head span{color:var(--muted);font-size:11px}.tabs{display:flex;gap:6px;overflow-x:auto}.tab{flex:0 0 auto;min-height:39px;padding:0 12px;border:1px solid var(--edge);border-radius:11px;background:rgba(255,255,255,.03);color:var(--muted);font-size:11px;font-weight:900;cursor:pointer}.tab.active{border-color:color-mix(in srgb,var(--accent) 55%,var(--edge));background:color-mix(in srgb,var(--accent) 13%,transparent);color:var(--accent)}.tab ha-icon{--mdc-icon-size:17px;margin-right:5px}.room{display:none;grid-template-columns:minmax(0,1.3fr) minmax(260px,.7fr);gap:10px}.room.active{display:grid}.switches{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.switch-card{display:grid;grid-template-columns:37px minmax(0,1fr) auto;align-items:center;gap:8px;min-height:70px;padding:9px;border:1px solid var(--edge);border-left:3px solid var(--muted);border-radius:13px;background:rgba(255,255,255,.025);text-align:left;cursor:pointer}.switch-card.on{border-left-color:var(--green);background:color-mix(in srgb,var(--green) 8%,transparent)}.switch-card>ha-icon{--mdc-icon-size:23px;color:var(--muted)}.switch-card.on>ha-icon{color:var(--green)}.switch-card b,.switch-card small{display:block}.switch-card b{font-size:11px;line-height:1.2}.switch-card small{margin-top:4px;color:var(--muted);font-size:9px}.switch{position:relative;width:32px;height:18px;border-radius:20px;background:rgba(255,255,255,.12)}.switch:after{content:"";position:absolute;top:3px;left:3px;width:12px;height:12px;border-radius:50%;background:var(--muted);transition:.2s}.switch-card.on .switch{background:color-mix(in srgb,var(--green) 30%,transparent)}.switch-card.on .switch:after{left:17px;background:var(--green);box-shadow:0 0 8px var(--green)}.settings{display:grid;grid-template-columns:repeat(2,1fr);gap:7px}.control{position:relative;padding:10px;border:1px solid var(--edge);border-radius:13px;background:rgba(255,255,255,.025)}.control-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.control-head span{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:10px;font-weight:800}.control-head ha-icon{--mdc-icon-size:17px}.control-head b{color:var(--accent);font-size:16px}.control input{width:100%;margin-top:13px;accent-color:var(--accent)}.control>small{position:absolute;right:10px;bottom:4px;color:var(--muted);font-size:8px}@keyframes glow{50%{opacity:.45;transform:scale(.75)}}@media(max-width:900px){.daylight{grid-template-columns:190px 1fr}.day-settings{grid-column:1/-1}.room{grid-template-columns:1fr}.switches{grid-template-columns:repeat(3,1fr)}}@media(max-width:650px){.shell{padding:13px}header{display:block}.summary{margin-top:10px}.daylight{grid-template-columns:1fr}.day-settings{grid-column:auto}.section-head{align-items:flex-start;flex-direction:column}.tabs{width:100%}.switches{grid-template-columns:1fr}.settings{grid-template-columns:1fr}h2{font-size:23px}}@media(prefers-reduced-motion:reduce){*{animation:none!important}}
    </style><ha-card><div class="shell">
      <header><div><div class="eyebrow"><i class="sun-dot"></i>Lysautomatik</div><h2>${this._esc(this._config.title)}</h2><div class="sub">${this._esc(this._config.subtitle)}</div></div><div class="summary"><div class="badge"><b data-day-summary>—</b>Dagvindue</div><div class="badge"><b data-room-summary>—</b>Lux aktive</div></div></header>
      <section class="daylight">
        <button class="day-status" data-info="${this._esc(d.active_entity)}"><ha-icon icon="mdi:weather-sunny"></ha-icon><span><b>Dagvindue</b><small data-day-state>—</small></span><i class="orb"></i></button>
        <div class="mode"><span class="field-label">Styringstilstand</span><select data-select="${this._esc(d.mode_entity)}"></select><div class="times"><button class="time" data-info="${this._esc(d.planned_start_entity)}"><span>Planlagt start</span><b data-value="${this._esc(d.planned_start_entity)}">—</b></button><button class="time" data-info="${this._esc(d.planned_end_entity)}"><span>Planlagt slut</span><b data-value="${this._esc(d.planned_end_entity)}">—</b></button></div></div>
        <div class="day-settings"><div class="day-controls">${this._miniSlider(d.sunrise_delay_entity,"Efter solopgang","min")}${this._miniSlider(d.sunset_early_entity,"Før solnedgang","min")}</div><div class="manual"><label>Manuel start<input type="time" data-time="${this._esc(d.manual_start_entity)}"></label><label>Manuel slut<input type="time" data-time="${this._esc(d.manual_end_entity)}"></label></div></div>
      </section>
      <section class="rooms-wrap"><div class="section-head"><div><b>Rumautomatik</b><span>Vælg rum og justér betingelserne direkte</span></div><nav class="tabs">${this._config.rooms.map((room,index)=>`<button class="tab ${index===0?"active":""}" data-tab="${index}"><ha-icon icon="${this._esc(room.icon||"mdi:lightbulb-auto")}"></ha-icon>${this._esc(room.name)}</button>`).join("")}</nav></div>${this._config.rooms.map((room,index)=>this._room(room,index)).join("")}</section>
    </div></ha-card>`;
    this._bind();
    this._sync();
  }

  _miniSlider(entity,label,unit){
    const state=this._state(entity),min=state?.attributes?.min??0,max=state?.attributes?.max??180,step=state?.attributes?.step??1;
    return `<div class="mini-control"><span>${label}<b data-output="${this._esc(entity)}">—</b></span><input type="range" min="${min}" max="${max}" step="${step}" data-range="${this._esc(entity)}"><small>${unit}</small></div>`;
  }

  _bind(){
    const root=this.shadowRoot;
    root.querySelectorAll("[data-tab]").forEach((button)=>button.addEventListener("click",()=>{
      this._activeRoom=Number(button.dataset.tab);
      root.querySelectorAll("[data-tab]").forEach((node)=>node.classList.toggle("active",node===button));
      root.querySelectorAll("[data-room]").forEach((node)=>node.classList.toggle("active",Number(node.dataset.room)===this._activeRoom));
    }));
    root.querySelectorAll("[data-toggle]").forEach((button)=>button.addEventListener("click",()=>this._toggle(button.dataset.toggle)));
    root.querySelectorAll("[data-info]").forEach((button)=>button.addEventListener("click",()=>this._moreInfo(button.dataset.info)));
    root.querySelectorAll("[data-range]").forEach((input)=>{
      input.addEventListener("input",()=>{const output=root.querySelector(`[data-output="${CSS.escape(input.dataset.range)}"]`);if(output)output.textContent=input.value;});
      input.addEventListener("change",()=>this._set(input.dataset.range,input.value));
    });
    root.querySelectorAll("[data-time]").forEach((input)=>input.addEventListener("change",()=>this._set(input.dataset.time,input.value)));
    root.querySelector("[data-select]")?.addEventListener("change",(event)=>this._set(event.target.dataset.select,event.target.value));
  }

  _sync(){
    if(!this._hass||!this.shadowRoot?.querySelector("ha-card"))return;
    const root=this.shadowRoot,d=this._config.daylight,dayOn=this._on(d.active_entity);
    root.querySelector(".day-status")?.classList.toggle("on",dayOn);
    root.querySelector("[data-day-state]").textContent=dayOn?"Aktiv lige nu":"Inaktiv lige nu";
    root.querySelector("[data-day-summary]").textContent=dayOn?"Aktivt":"Inaktivt";
    root.querySelectorAll("[data-value]").forEach((node)=>node.textContent=this._value(node.dataset.value,"—").slice(0,5));
    const select=root.querySelector("[data-select]"),options=this._options(d.mode_entity),signature=options.join("|");
    if(select&&select.dataset.options!==signature){select.innerHTML=options.map((option)=>`<option value="${this._esc(option)}">${this._esc(option)}</option>`).join("");select.dataset.options=signature;}
    if(select)select.value=this._value(d.mode_entity);
    root.querySelectorAll("[data-time]").forEach((input)=>{if(root.activeElement!==input)input.value=this._value(input.dataset.time,"00:00:00").slice(0,5);});
    root.querySelectorAll("[data-range]").forEach((input)=>{const state=this._state(input.dataset.range);if(state){input.min=state.attributes?.min??input.min;input.max=state.attributes?.max??input.max;input.step=state.attributes?.step??input.step;if(root.activeElement!==input)input.value=state.state;}const output=root.querySelector(`[data-output="${CSS.escape(input.dataset.range)}"]`);if(output)output.textContent=input.value;});
    let luxActive=0;
    root.querySelectorAll(".switch-card[data-toggle]").forEach((button)=>{const on=this._on(button.dataset.toggle);button.classList.toggle("on",on);button.querySelector("[data-switch-state]").textContent=on?"Aktiv":"Fra";});
    this._config.rooms.forEach((room)=>{if(this._on(room.lux_enabled_entity))luxActive++;});
    root.querySelector("[data-room-summary]").textContent=`${luxActive}/${this._config.rooms.length}`;
  }

  getCardSize(){return 7;}
}

if(!customElements.get("ha-light-automation-card"))customElements.define("ha-light-automation-card",HALightAutomationCard);
window.customCards=window.customCards||[];
window.customCards.push({type:"ha-light-automation-card",name:"HA Light Automation Card",description:"Samlet styring af dagvindue og rumbaseret lysautomatik",preview:true});
console.info(`%c HA-LIGHT-AUTOMATION-CARD %c ${VERSION} `,"color:#1b1300;background:#ffc247;font-weight:800","color:#ffc247;background:#102030");
