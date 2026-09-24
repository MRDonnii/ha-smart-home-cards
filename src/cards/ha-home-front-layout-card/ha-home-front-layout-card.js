const VERSION = "0.1.0";

// Forsidens layout. Kortnoden og dens børn bevares ved visningsskift.
class HaHomeDesktopLayoutCard extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});this._children=[];this._headerChildren=[];this._desktopChildren=[];this._mobileChildren=[];this._verticalChildren=[];this._mqList=[];this._resize=()=>requestAnimationFrame(()=>this._fitViewport());this._onBreakpoint=()=>this._flushActive();this._slots={header_cards:[],left_cards:[],right_cards:[],mobile_cards:[],vertical_cards:[]};this._slotSig={header_cards:[],left_cards:[],right_cards:[],mobile_cards:[],vertical_cards:[]};this._mode=this._initialMode();}
  _initialMode(){try{return localStorage.getItem("ha-home-front-surface-mode")==="unified"?"unified":"cards";}catch{return "cards";}}
  _setMode(mode){
    this._mode=mode==="unified"?"unified":"cards";
    try{localStorage.setItem("ha-home-front-surface-mode",this._mode);}catch{}
    this._applyMode();
  }
  _applyMode(){
    const surface=this.shadowRoot?.querySelector(".surface");
    if(!surface)return;
    const unified=this._mode==="unified";
    surface.classList.toggle("unified",unified);
    this.shadowRoot.querySelectorAll(".modebar button").forEach((button)=>{
      const active=button.dataset.mode===this._mode;
      button.classList.toggle("active",active);
      button.setAttribute("aria-pressed",String(active));
    });
    this._headerChildren.forEach((card)=>card.toggleAttribute("home-unified",unified));
    this._fitViewport();
  }
  connectedCallback(){window.addEventListener("resize",this._resize);window.visualViewport?.addEventListener("resize",this._resize);this._resize();this._flushActive();}
  disconnectedCallback(){window.removeEventListener("resize",this._resize);window.visualViewport?.removeEventListener("resize",this._resize);this._unbindBreakpoints();}
  // This card builds all three layouts up front (desktop columns, the mobile
  // column, and the vertical-only extras) and lets CSS show one set. Without the
  // split below, `set hass` fed every state tick to all ~29 card instances, so
  // roughly half of them re-rendered continuously while permanently invisible --
  // including a camera card. Only the set the current breakpoint actually shows
  // receives updates now; the others are refreshed by _flushActive() the moment
  // a breakpoint change makes them visible.
  _activeChildren(){
    const mb=this._mobileBreakpoint||1100,pb=this._phoneBreakpoint||700;
    // This runs on every `set hass` tick, so reuse the MediaQueryList objects
    // _bindBreakpoints() already created for the exact same two queries instead
    // of parsing a fresh media query twice per tick. Fallback covers the window
    // between connectedCallback() and the async _build() that binds them.
    const desktopMq=this._mqList[0]||window.matchMedia(`(min-width:${mb+1}px)`);
    const tabletMq=this._mqList[1]||window.matchMedia(`(min-width:${pb+1}px)`);
    // .header is never display:none -- it stays visible at every breakpoint, so
    // its cards are always part of the active set. Only .layout (the desktop
    // columns) and .mobile swap.
    if(desktopMq.matches)return this._headerChildren.concat(this._desktopChildren);
    if(tabletMq.matches)return this._headerChildren.concat(this._mobileChildren,this._verticalChildren);
    return this._headerChildren.concat(this._mobileChildren);
  }
  _flushActive(){if(this._hass)this._activeChildren().forEach((card)=>{card.hass=this._hass;});}
  _unbindBreakpoints(){this._mqList.forEach((mq)=>mq.removeEventListener?.("change",this._onBreakpoint));this._mqList=[];}
  _bindBreakpoints(mobileBreakpoint,phoneBreakpoint){
    this._unbindBreakpoints();
    this._mqList=[window.matchMedia(`(min-width:${mobileBreakpoint+1}px)`),window.matchMedia(`(min-width:${phoneBreakpoint+1}px)`)];
    this._mqList.forEach((mq)=>mq.addEventListener?.("change",this._onBreakpoint));
  }
  setConfig(config){
    if(!Array.isArray(config.left_cards)||!Array.isArray(config.right_cards)) throw new Error("Angiv left_cards og right_cards");
    const next=structuredClone(config);
    next.header_cards=Array.isArray(config.header_cards)?structuredClone(config.header_cards):[];
    next.mobile_cards=Array.isArray(config.mobile_cards)?structuredClone(config.mobile_cards):[];
    next.vertical_cards=Array.isArray(config.vertical_cards)?structuredClone(config.vertical_cards):[];
    const newKey=this._structureKey(next);
    const oldKey=this.config?this._structureKey(this.config):null;
    this.config=next;
    if(oldKey!==null&&oldKey===newKey){this._applyLayoutVars();this._updateExistingCards();return;}
    this._build();
  }
  // Kun kort-TYPERNE pr. side + de to breakpoints (som begge er bagt ind i
  // <style>-strengen i _build()) taeller som "strukturel". Aendrer denne
  // noegle sig IKKE, er det kun indhold i EKSISTERENDE kort eller rene
  // CSS-variable (kolonner/afstand/bottom_gap) der er aendret - saa opdateres
  // det billigt i stedet for at bygge alle ~20-29 kort (inkl. kameraer)
  // forfra igen. Foer kaldte setConfig() ALTID _build() ubetinget, saa hvert
  // eneste tastatur/pil-tryk i wrapperens egen editor genopbyggede HELE
  // forsidens kortsaet asynkront fra bunden - flere overlappende genopbygninger
  // i rap kunne let overbelaste fanen nok til at hele siden frøs/crashede.
  _structureKey(config){
    const sides=["header_cards","left_cards","right_cards","mobile_cards","vertical_cards"];
    return JSON.stringify([sides.map((side)=>(config[side]||[]).map((c)=>c?.type||"")),Number(config.mobile_breakpoint)||1100,Number(config.phone_breakpoint)||700]);
  }
  _applyLayoutVars(){const layout=this.shadowRoot?.querySelector(".layout");if(!layout)return;layout.style.setProperty("--desktop-columns",this.config.columns||"minmax(0,.9fr) minmax(440px,1.1fr)");layout.style.setProperty("--desktop-gap",this.config.gap||"clamp(10px,.75vw,18px)");this._fitViewport();}
  _updateExistingCards(){
    // KRITISK: uden aendrings-tjek her kaldte dette setConfig() paa ALLE ~20-29
    // kort (inkl. de 3 kamera-feeds) hver eneste gang ÉT ENESTE kort aendrede
    // sig - fx sky-fart inde i header-kortet. Kamera-strom-kort genopretter
    // typisk deres video-forbindelse ved hvert setConfig()-kald, saa gentagne
    // pile-klik/tastatur-slag kunne laekke streams indtil fanen loeb toer for
    // hukommelse og crashede (Chrome-fejlkode 5 = out of memory). Nu kaldes
    // setConfig() KUN paa det/de kort hvis config rent faktisk aendrede sig.
    ["header_cards","left_cards","right_cards","mobile_cards","vertical_cards"].forEach((side)=>{
      const cfgs=this.config[side]||[],slots=this._slots[side]||[],sigs=this._slotSig[side];
      cfgs.forEach((cfg,i)=>{
        if(!slots[i])return;
        const sig=JSON.stringify(cfg);
        if(sigs[i]===sig)return;
        sigs[i]=sig;
        slots[i].setConfig(cfg);
      });
    });
  }
  set hass(hass){this._hass=hass;this._activeChildren().forEach((card)=>{card.hass=hass;});}
  async _build(){
    const token={};this._buildToken=token;
    const helpers=await window.loadCardHelpers();if(this._buildToken!==token)return;
    const mobileBreakpoint=Math.min(2400,Math.max(600,Number(this.config.mobile_breakpoint)||1100));
    const phoneBreakpoint=Math.min(mobileBreakpoint-1,Math.max(360,Number(this.config.phone_breakpoint)||700));
    this._mobileBreakpoint=mobileBreakpoint;this._phoneBreakpoint=phoneBreakpoint;this._bindBreakpoints(mobileBreakpoint,phoneBreakpoint);
    this.shadowRoot.innerHTML=`<style>:host{display:block}.modebar{display:flex;justify-content:flex-end;margin:0 0 7px}.modebar .choices{display:flex;gap:3px;padding:3px;border:1px solid var(--divider-color,rgba(255,255,255,.18));border-radius:12px;background:var(--ha-card-background,var(--card-background-color));box-shadow:var(--dashboard-shadow-soft,none)}.modebar button{min-height:32px;padding:5px 11px;border:0;border-radius:9px;background:transparent;color:var(--secondary-text-color);font:inherit;font-size:12px;font-weight:600;cursor:pointer}.modebar button.active{background:var(--dashboard-tab-selected-bg,color-mix(in srgb,var(--dashboard-accent,var(--primary-color)) 16%,transparent));color:var(--primary-text-color);box-shadow:inset 0 0 0 1px var(--dashboard-tab-selected-border,var(--dashboard-accent,var(--primary-color)))}.modebar button:focus-visible{outline:2px solid var(--dashboard-accent,var(--primary-color));outline-offset:2px}.surface.unified{padding:10px 14px 18px;border:1px solid var(--dashboard-border-neutral,var(--divider-color));border-radius:24px;background:var(--dashboard-card-bg,var(--ha-card-background,var(--card-background-color)));box-shadow:var(--dashboard-shadow-soft,var(--ha-card-box-shadow,none));overflow:hidden}.surface.unified .header:not(:empty){margin-bottom:0}.surface.unified .body-cards{padding-top:8px;--surface:transparent;--dashboard-card-bg:transparent;--ha-card-background:transparent;--card-surface:transparent;--dashboard-shadow-strong:none;--dashboard-shadow-deep:none;--dashboard-card-shadow:none;--state-card-shadow:none;--ha-card-box-shadow:none;--dashboard-left-accent-width:0}.header,.mobile{display:flex;flex-direction:column;min-width:0;gap:var(--desktop-gap,clamp(10px,.75vw,18px))}.header:not(:empty){margin-bottom:var(--desktop-gap,clamp(10px,.75vw,18px))}.layout{display:grid;grid-template-columns:var(--desktop-columns,minmax(0,.9fr) minmax(440px,1.1fr));align-items:stretch;height:var(--desktop-height,auto);min-height:0;overflow:hidden;gap:var(--desktop-gap,clamp(10px,.75vw,18px))}.column{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden;gap:var(--desktop-gap,clamp(10px,.75vw,18px))}.slot{min-width:0;flex:0 0 auto}.slot.grow{display:flex;flex:1 1 0;min-height:0;overflow:hidden}.slot.grow>*{flex:1;min-width:0;min-height:0}.mobile,.vertical-only{display:none}@media(max-width:1399px) and (min-width:${mobileBreakpoint+1}px){.layout{grid-template-columns:minmax(0,1fr) minmax(420px,1fr)}}@media(max-width:${mobileBreakpoint}px){.header:not(:empty){margin-bottom:8px}.layout{display:none}.mobile{display:flex;gap:8px}}@media(min-width:${phoneBreakpoint+1}px) and (max-width:${mobileBreakpoint}px){.vertical-only{display:block}}</style><div class="modebar" role="group" aria-label="Forsidens kortvisning"><div class="choices"><button type="button" data-mode="cards">Kort</button><button type="button" data-mode="unified">Samlet flade</button></div></div><div class="surface"><div class="header"></div><div class="body-cards"><div class="layout"><div class="column left"></div><div class="column right"></div></div><div class="mobile"></div></div></div>`;
    this.shadowRoot.querySelectorAll(".modebar button").forEach((button)=>button.addEventListener("click",()=>this._setMode(button.dataset.mode)));
    const make=(cfg,parent,index,total,growLast=false,extraClass="",sideKey)=>{const card=helpers.createCardElement(cfg);const slot=document.createElement("div");slot.className=`slot${growLast&&index===total-1?" grow":""}${extraClass?` ${extraClass}`:""}`;slot.append(card);parent.append(slot);this._children.push(card);(extraClass==="vertical-only"?this._verticalChildren:parent===header?this._headerChildren:parent===mobile?this._mobileChildren:this._desktopChildren).push(card);if(sideKey){this._slots[sideKey].push(card);this._slotSig[sideKey].push(JSON.stringify(cfg));}};
    this._children=[];this._headerChildren=[];this._desktopChildren=[];this._mobileChildren=[];this._verticalChildren=[];this._slots={header_cards:[],left_cards:[],right_cards:[],mobile_cards:[],vertical_cards:[]};this._slotSig={header_cards:[],left_cards:[],right_cards:[],mobile_cards:[],vertical_cards:[]};const header=this.shadowRoot.querySelector(".header"),left=this.shadowRoot.querySelector(".left"),right=this.shadowRoot.querySelector(".right"),mobile=this.shadowRoot.querySelector(".mobile");
    this.config.header_cards.forEach((cfg,i)=>make(cfg,header,i,this.config.header_cards.length,false,"","header_cards"));
    this.config.left_cards.forEach((cfg,i)=>make(cfg,left,i,this.config.left_cards.length,true,"","left_cards"));
    this.config.right_cards.forEach((cfg,i)=>make(cfg,right,i,this.config.right_cards.length,true,"","right_cards"));
    this.config.mobile_cards.forEach((cfg,i)=>{if(i===this.config.mobile_cards.length-1)this.config.vertical_cards.forEach((verticalCfg,j)=>make(verticalCfg,mobile,j,this.config.vertical_cards.length,false,"vertical-only","vertical_cards"));make(cfg,mobile,i,this.config.mobile_cards.length,false,"","mobile_cards");});
    if(!this.config.mobile_cards.length)this.config.vertical_cards.forEach((cfg,i)=>make(cfg,mobile,i,this.config.vertical_cards.length,false,"vertical-only","vertical_cards"));
    this._applyLayoutVars();this._applyMode();this._flushActive();this._fitViewport();
  }
  _fitViewport(){const layout=this.shadowRoot?.querySelector(".layout");if(!layout||!window.matchMedia(`(min-width:${(this._mobileBreakpoint||1100)+1}px)`).matches)return;const top=layout.getBoundingClientRect().top;const viewportHeight=window.visualViewport?.height||window.innerHeight;const bottomGap=Math.max(90,Number(this.config?.bottom_gap)||110)+(this._mode==="unified"?18:0);layout.style.setProperty("--desktop-height",`${Math.max(0,viewportHeight-top-bottomGap)}px`);}
  getCardSize(){return 12;}
  static getConfigElement(){return document.createElement("ha-home-desktop-layout-card-front-editor");}
  static getStubConfig(){return{columns:"minmax(0,.9fr) minmax(440px,1.1fr)",gap:"clamp(10px,.75vw,18px)",bottom_gap:110,mobile_breakpoint:1100,phone_breakpoint:700,header_cards:[],left_cards:[],right_cards:[],mobile_cards:[],vertical_cards:[]};}
}
class HaHomeDesktopLayoutCardEditor extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});this._nestedEditors=new Set();this._configSig="";this._listKey="";}
  // HA's vaert normaliserer/geninstantierer configen paa vejen tilbage (websocket-
  // roundtrip), saa noegle-raekkefoelgen kan skifte selv naar INGEN vaerdi rent
  // faktisk er aendret. Almindelig JSON.stringify er raekkefoelge-foelsom og
  // ville derfor fejlagtigt opfatte det som en aegte aendring hver gang -
  // hvilket udloeser render() og lukker den indlejrede kort-editor igen (den
  // "blinker og kan ikke redigeres"-fejl). _sig() sorterer noegler paa alle
  // niveauer foerst, saa signaturen kun aendrer sig ved en AEGTE vaerdi-aendring.
  _sig(value){if(Array.isArray(value))return `[${value.map((item)=>this._sig(item)).join(",")}]`;if(value&&typeof value==="object")return `{${Object.keys(value).sort().map((key)=>`${JSON.stringify(key)}:${this._sig(value[key])}`).join(",")}}`;return JSON.stringify(value);}
  // HA's dashboard-editor sender configen tilbage igen (config-changed-roundtrip)
  // hver gang et NESTED kort-editor (fx header-kortets egne felter) aendrer noget.
  // Foer kaldte det ubetinget render() her, som tomte .nested-beholderen og lukkede
  // den aabne under-editor efter hver eneste tastatur-aendring. Er configen uaendret
  // siden vi selv sendte den (aekko), springes genopbygningen over.
  setConfig(config){const sig=this._sig(config);this.config=structuredClone(config);if(sig===this._configSig)return;this._configSig=sig;const listKey=this._computeListKey();if(this._listKey&&listKey===this._listKey){this._syncSettings();return;}this.render();}
  set hass(hass){this._hass=hass;this._nestedEditors.forEach((item)=>item.hass=hass);}
  set lovelace(lovelace){this._lovelace=lovelace;this._nestedEditors.forEach((item)=>item.lovelace=lovelace);}
  _escape(value){return String(value??"").replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);}
  _emit(config){this.config=structuredClone(config);this._configSig=this._sig(this.config);this.dispatchEvent(new CustomEvent("config-changed",{bubbles:true,composed:true,detail:{config:this.config}}));}
  _cards(side){return Array.isArray(this.config?.[side])?this.config[side]:[];}
  _title(config,index){const type=String(config?.type||"Kort").replace(/^custom:/,"");return `${index+1}. ${type}`;}
  _changeSetting(input){this._emit({...this.config,[input.dataset.key]:input.type==="number"?Number(input.value):input.value});}
  _move(side,index,direction){const cards=structuredClone(this._cards(side));const target=index+direction;if(target<0||target>=cards.length)return;[cards[index],cards[target]]=[cards[target],cards[index]];this._emit({...this.config,[side]:cards});}
  _remove(side,index){const cards=structuredClone(this._cards(side));cards.splice(index,1);this._emit({...this.config,[side]:cards});}
  _toggleEditor(side,index,row){const host=row.querySelector(".nested");const button=row.querySelector(".edit");if(host.childElementCount){host.replaceChildren();button.classList.remove("active");return;}const editor=document.createElement("hui-card-element-editor");editor.hass=this._hass;editor.lovelace=this._lovelace;editor.value=structuredClone(this._cards(side)[index]);editor.addEventListener("config-changed",(event)=>{event.stopPropagation();if(!event.detail?.config)return;const cards=structuredClone(this._cards(side));cards[index]=structuredClone(event.detail.config);this._emit({...this.config,[side]:cards});});this._nestedEditors.add(editor);host.append(editor);button.classList.add("active");}
  _showPicker(side){const host=this.shadowRoot.querySelector(`.picker[data-side="${side}"]`);if(host.childElementCount){host.replaceChildren();return;}const picker=document.createElement("hui-card-picker");picker.hass=this._hass;picker.lovelace=this._lovelace;let handled=false;const accept=(event)=>{event.stopPropagation();const picked=event.detail?.config||event.detail?.cardConfig;if(handled||!picked)return;handled=true;const cards=[...structuredClone(this._cards(side)),structuredClone(picked)];this._emit({...this.config,[side]:cards});};picker.addEventListener("config-changed",accept);picker.addEventListener("card-picked",accept);this._nestedEditors.add(picker);host.append(picker);}
  _column(side,label){const cards=this._cards(side);return `<section><div class="section-head"><div><h3>${label}</h3><small>${cards.length} kort</small></div><button class="add" data-add="${side}" type="button"><ha-icon icon="mdi:plus"></ha-icon> Tilføj kort</button></div><div class="list">${cards.map((config,index)=>`<article class="row" data-side="${side}" data-index="${index}"><div class="row-head"><strong>${this._escape(this._title(config,index))}</strong><div class="actions"><button data-move="-1" title="Flyt op" ${index===0?"disabled":""}><ha-icon icon="mdi:arrow-up"></ha-icon></button><button data-move="1" title="Flyt ned" ${index===cards.length-1?"disabled":""}><ha-icon icon="mdi:arrow-down"></ha-icon></button><button class="edit" title="Rediger kort"><ha-icon icon="mdi:pencil"></ha-icon><span>Rediger</span></button><button class="delete" title="Fjern kort"><ha-icon icon="mdi:delete-outline"></ha-icon></button></div></div><div class="nested"></div></article>`).join("")}</div><div class="picker" data-side="${side}"></div></section>`;}
  render(){if(!this.config)return;this._nestedEditors.clear();this.shadowRoot.innerHTML=`<style>*{box-sizing:border-box}:host{display:block;color:var(--primary-text-color)}.settings,section{margin-bottom:14px;padding:14px;border:1px solid var(--divider-color);border-radius:14px;background:var(--card-background-color)}.settings{display:grid;grid-template-columns:2fr 1.3fr 1fr 1fr 1fr;gap:10px}.field span{display:block;margin-bottom:5px;color:var(--secondary-text-color);font-size:12px;font-weight:600}.field input{width:100%;padding:10px;border:1px solid var(--divider-color);border-radius:9px;background:var(--secondary-background-color,var(--card-background-color));color:inherit}.section-head,.row-head,.actions{display:flex;align-items:center}.section-head,.row-head{justify-content:space-between;gap:10px}.section-head{margin-bottom:10px}.section-head h3{margin:0;font-size:16px}.section-head small{color:var(--secondary-text-color)}.list{display:grid;gap:8px}.row{overflow:hidden;border:1px solid var(--divider-color);border-radius:11px;background:var(--secondary-background-color,var(--card-background-color))}.row-head{min-height:48px;padding:7px 9px 7px 12px}.row-head strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.actions{gap:5px}button{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:34px;padding:6px 9px;border:1px solid var(--divider-color);border-radius:9px;background:var(--card-background-color);color:inherit;cursor:pointer}button:hover,.edit.active{border-color:var(--primary-color);color:var(--primary-color)}button:disabled{cursor:default;opacity:.3}.delete:hover{border-color:var(--error-color);color:var(--error-color)}ha-icon{width:18px;height:18px;--mdc-icon-size:18px}.nested:not(:empty),.picker:not(:empty){padding:12px;border-top:1px solid var(--divider-color)}.picker:empty{display:none}.add{color:var(--primary-color)}@media(max-width:650px){.settings{grid-template-columns:1fr}.edit span{display:none}.actions{gap:3px}button{padding:6px}}</style><div class="settings"><label class="field"><span>PC-kolonner</span><input data-key="columns" value="${this._escape(this.config.columns||"")}"></label><label class="field"><span>Responsiv afstand</span><input data-key="gap" value="${this._escape(this.config.gap||"")}"></label><label class="field"><span>Skift til mobil ved (px)</span><input data-key="mobile_breakpoint" type="number" min="600" max="2400" step="10" value="${Number(this.config.mobile_breakpoint)||1100}"></label><label class="field"><span>Telefonvisning til (px)</span><input data-key="phone_breakpoint" type="number" min="360" max="1400" step="10" value="${Number(this.config.phone_breakpoint)||700}"></label><label class="field"><span>Afstand over navbar (px)</span><input data-key="bottom_gap" type="number" min="90" max="180" value="${Number(this.config.bottom_gap)||110}"></label></div>${this._column("header_cards","Top i fuld bredde")}${this._column("left_cards","Venstre PC-kolonne")}${this._column("right_cards","Højre PC-kolonne")}${this._column("mobile_cards","Mobilkort")}${this._column("vertical_cards","Ekstra kort på lodret skærm")}`;this.shadowRoot.querySelectorAll(".settings input").forEach((input)=>input.addEventListener("change",()=>this._changeSetting(input)));this.shadowRoot.querySelectorAll(".row").forEach((row)=>{const side=row.dataset.side,index=Number(row.dataset.index);row.querySelectorAll("[data-move]").forEach((button)=>button.addEventListener("click",()=>this._move(side,index,Number(button.dataset.move))));row.querySelector(".edit").addEventListener("click",()=>this._toggleEditor(side,index,row));row.querySelector(".delete").addEventListener("click",()=>this._remove(side,index));});this.shadowRoot.querySelectorAll("[data-add]").forEach((button)=>button.addEventListener("click",()=>this._showPicker(button.dataset.add)));this._listKey=this._computeListKey();}
  _computeListKey(){return JSON.stringify(["header_cards","left_cards","right_cards","mobile_cards","vertical_cards"].map((side)=>this._cards(side).map((c)=>c?.type||"")));}
  // Opdaterer kun de 5 rod-indstillingsfelter (kolonner/afstand/breakpoints) uden
  // at roere resten af DOM'en - saa et aabent "Rediger"-panel for et kort forbliver
  // aabent. Springer et felt over mens man rent faktisk sidder og skriver i det.
  _syncSettings(){const map={columns:this.config.columns||"",gap:this.config.gap||"",mobile_breakpoint:Number(this.config.mobile_breakpoint)||1100,phone_breakpoint:Number(this.config.phone_breakpoint)||700,bottom_gap:Number(this.config.bottom_gap)||110};this.shadowRoot.querySelectorAll(".settings input").forEach((input)=>{if(this.shadowRoot.activeElement===input)return;const key=input.dataset.key;if(key in map)input.value=map[key];});}
}

if (!customElements.get("ha-home-desktop-layout-card-front")) customElements.define("ha-home-desktop-layout-card-front",HaHomeDesktopLayoutCard);
if (!customElements.get("ha-home-desktop-layout-card-front-editor")) customElements.define("ha-home-desktop-layout-card-front-editor",HaHomeDesktopLayoutCardEditor);
window.customCards=window.customCards||[];
window.customCards.push({type:"ha-home-desktop-layout-card-front",name:"HA Home Front Layout",description:"Forside med valg mellem kort og samlet flade",preview:false});
console.info(`HA HOME FRONT LAYOUT v${VERSION}`);
