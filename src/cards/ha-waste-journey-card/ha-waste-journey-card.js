import "../ha-ai-usage-card/ha-card-list-editor.js";

const VERSION="0.3.0";

// 0.2.0 (Claude AI, 2026-10-27; bruger: "lav det her endnu federe og animeret"): hver affaldstype er sin egen skraldebil på
// vejen (jo tættere på huset, jo før), skraldebilen kører ind fra genbrugspladsen når kortet vises, tallene tæller op,
// ring om nedtællingen, kalenderblad med næste dato, beholder ved huset dagen før, dag/nat-himmel fra sun.sun.
// 0.3.0 (Claude AI, 2026-10-27; bruger: "gør endnu mere ud af kortene"): hver affaldstype har en beholder, der fyldes op
// frem mod tømningen (interval fra beskrivelsen, "interval" eller lært på enheden), "Hører til"-tekster der skifter, kalender
// for de næste uger, afhentningstid og nedtælling fra calendar_entity og en "Sat ud"-knap (confirm_entity/confirm_script),
// der stopper påmindelserne. Kun transform/opacity animeres løbende; motion-rest pauser dem efter 30 s uden aktivitet,
// og indkørslen er overgange, så den aldrig fryser halvvejs. animation:false/reduced motion slår alt fra.
const HORIZON=28,RING=276.46,DAY=864e5;
const MONTHS=["jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"];
const MONTHS_LONG=["Januar","Februar","Marts","April","Maj","Juni","Juli","August","September","Oktober","November","December"];
const WEEKDAYS=["Søndag","Mandag","Tirsdag","Onsdag","Torsdag","Fredag","Lørdag"];
const HINTS=[
  [/plast|glas|metal|madkarton|mdk/i,["Plastflasker, bøtter og bakker","Mælke- og juicekartoner","Dåser, låg og folie i metal","Glas og flasker – skyllet"]],
  [/rest|madaffald/i,["Madrester og skræller","Kaffegrums og teposer","Bleer og hygiejneaffald","Snavset emballage"]],
  [/pap|papir/i,["Aviser, blade og reklamer","Papkasser – foldet sammen","Breve og kontorpapir","Æggebakker og karton"]],
  [/storskrald/i,["Møbler og madrasser","Tæpper og større ting","Cykler og havemøbler","Stil det frem aftenen før"]],
  [/have/i,["Grene og blade","Græs og ukrudt","Afklip fra hæk og buske","Uden jord og sten"]],
  [/farlig|batter|kemi/i,["Batterier","Maling og lak","Spraydåser","Kemikalier i original emballage"]],
  [/tekstil|tøj/i,["Rent tøj og sko","Sengetøj og håndklæder","I lukkede poser","Også hullet tøj"]],
];
const STARS=[[7,16,0],[16,44,1.1],[27,10,2.2],[41,30,.6],[55,8,1.7],[63,40,2.8],[74,18,.3],[86,34,1.4],[94,9,2.5]];
const SKYLINE="data:image/svg+xml,"+encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='240' height='36' viewBox='0 0 240 36'><path d='M0 36V22l12-9 12 9v14z'/><rect x='30' y='12' width='14' height='24'/><path d='M48 36V24l10-8 10 8v12z'/><circle cx='80' cy='22' r='8'/><rect x='79' y='26' width='2' height='10'/><rect x='94' y='16' width='20' height='20'/><rect x='98' y='9' width='4' height='7'/><path d='M120 36V25l9-7 9 7v11z'/><circle cx='150' cy='25' r='6'/><rect x='149' y='28' width='2' height='8'/><path d='M160 36V20l14-10 14 10v16z'/><circle cx='202' cy='24' r='7'/><circle cx='210' cy='20' r='8'/><rect x='205' y='26' width='2' height='10'/><rect x='222' y='18' width='14' height='18'/></svg>");
const WAVE="data:image/svg+xml,"+encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='24' height='6' viewBox='0 0 24 6'><path d='M0 3q6-3 12 0t12 0v3H0z'/></svg>");
const TRUCK=`<svg viewBox="0 0 68 44" aria-hidden="true"><circle class="t-flash" cx="51.5" cy="10.5" r="7"/><rect class="t-lamp" x="49" y="9" width="5" height="3" rx="1"/><rect class="t-box" x="4" y="10" width="38" height="22" rx="3"/><path class="t-ribs" d="M13 13v16M33 13v16"/><circle class="t-logo" cx="23" cy="21" r="4.6"/><rect class="t-rear" x="1" y="12" width="5" height="19" rx="1.5"/><path class="t-cab" d="M43 14h11l9 9v9H43z"/><path class="t-glass" d="M46 17h7l6 6H46z"/><rect class="t-chassis" x="1" y="31" width="64" height="4" rx="1.5"/><circle class="t-light" cx="63" cy="28" r="1.6"/><g class="wheel"><circle class="t-tire" cx="15" cy="36" r="6"/><path class="t-spoke" d="M15 31.5v9M10.5 36h9"/></g><g class="wheel"><circle class="t-tire" cx="53" cy="36" r="6"/><path class="t-spoke" d="M53 31.5v9M48.5 36h9"/></g></svg>`;
const LEARN_KEY="ha-waste-journey:intervals";
const p2=n=>String(n).padStart(2,"0");
const parseDate=value=>{const [y,m,d]=String(value||"").split("-").map(Number);return y&&m&&d?new Date(y,m-1,d):null;};
const dayDiff=(a,b)=>Math.round((b-a)/DAY);
const clock=date=>`${p2(date.getHours())}:${p2(date.getMinutes())}`;
// "Hører til"-teksten skifter linje for linje; listen har den første linje igen til sidst, så løkken er sømløs
const tickFrames=n=>{let frames="";for(let i=0;i<n;i++)frames+=`${(i/n*100).toFixed(2)}%,${((i+.84)/n*100).toFixed(2)}%{transform:translateY(${(-i/(n+1)*100).toFixed(3)}%)}`;return `@keyframes tick${n}{${frames}100%{transform:translateY(${(-n/(n+1)*100).toFixed(3)}%)}}.tk${n}{animation:tick${n} ${(n*3.2).toFixed(1)}s ease-in-out infinite;animation-delay:calc(var(--i) * -1.3s)}`;};

class HAWasteJourneyCard extends HTMLElement{
  constructor(){
    super();this.attachShadow({mode:"open"});this._signature="";
    this.shadowRoot.addEventListener("click",event=>{
      if(event.target.closest(".ack")){event.stopPropagation();this._confirm();return;}
      const target=event.target.closest("[data-entity]");if(target?.dataset.entity)this._more(target.dataset.entity);
    });
    // Lyskeglen på affaldskortene følger musen (kortet flytter sig ikke, så kanterne kan ikke blinke)
    this.shadowRoot.addEventListener("pointermove",event=>{
      if(event.pointerType!=="mouse")return;const tile=event.target.closest?.(".waste");if(!tile)return;
      const rect=tile.getBoundingClientRect();tile.style.setProperty("--mx",`${Math.round(event.clientX-rect.left)}px`);tile.style.setProperty("--my",`${Math.round(event.clientY-rect.top)}px`);
    });
  }
  static getStubConfig(){return{title:"Affald & genbrug",subtitle:"Se hvornår skraldebilen kommer",next_entity:"",animation:true,waste_types:[]};}
  static getConfigElement(){const editor=document.createElement("ha-card-list-editor");editor.definition={roots:[{key:"title",label:"Titel"},{key:"subtitle",label:"Undertitel"},{key:"next_entity",label:"Næste afhentning",type:"entity"},{key:"calendar_entity",label:"Affaldskalender (tidspunkt og nedtælling)",type:"entity"},{key:"confirm_entity",label:"Kvittering: input_text med datoen for \"sat ud\"",type:"entity"},{key:"confirm_script",label:"Kvittering: script (valgfrit, får fortryd: true/false)",type:"entity"},{key:"animation",label:"Animation",type:"boolean"},{key:"sun_entity",label:"Sol (dag/nat, standard sun.sun)",type:"entity"}],collections:[{key:"waste_types",label:"Affaldstyper",itemLabel:"affaldstype",defaults:{name:"Affald",entity:"",icon:"mdi:trash-can-outline",color:"#22c55e"},fields:[{key:"name",label:"Navn"},{key:"entity",label:"Sensor",type:"entity"},{key:"icon",label:"Ikon"},{key:"color",label:"Farve"},{key:"interval",label:"Dage mellem tømninger (valgfrit)"},{key:"items",label:"Hører til (adskilt med komma, valgfrit)"}]}]};return editor;}
  setConfig(config){this._config={...HAWasteJourneyCard.getStubConfig(),...config,waste_types:Array.isArray(config?.waste_types)?structuredClone(config.waste_types):[]};this._signature="";this._build();}
  set hass(hass){
    this._hass=hass;if(!this.shadowRoot?.querySelector("ha-card"))this._build();
    const cfg=this._config||{},calendar=this._state(cfg.calendar_entity);
    const signature=JSON.stringify([cfg.next_entity,this._value(this._sunEntity()),new Date().getHours(),this._value(cfg.confirm_entity),calendar?.state,calendar?.attributes?.start_time,...(cfg.waste_types||[]).map(item=>[item.entity,this._value(item.entity),this._state(item.entity)?.attributes?.date])]);
    if(signature!==this._signature){this._signature=signature;this._render();}
  }
  connectedCallback(){
    // Turen spilles, når kortet første gang bliver synligt efter at være sat ind (ikke ved hver ny tilstand)
    if(!this._io&&"IntersectionObserver" in window)this._io=new IntersectionObserver(entries=>{if(!entries.some(entry=>entry.isIntersecting)||this._shown)return;this._shown=true;if(this._rendered)this._play();else this._wantPlay=true;},{threshold:.2});
    this._shown=false;this._io?.observe(this);
    clearInterval(this._clock);this._clock=setInterval(()=>this._tick(),30000);
  }
  disconnectedCallback(){this._io?.disconnect();this._shown=false;clearInterval(this._clock);this._clock=null;}
  _state(entity){return entity?this._hass?.states?.[entity]:undefined;}
  _value(entity){return this._state(entity)?.state;}
  _days(entity){const days=Number.parseInt(this._value(entity),10);return Number.isFinite(days)?days:null;}
  _sunEntity(){return this._config?.sun_entity||"sun.sun";}
  _esc(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);}
  _tone(days){return days==null?"neutral":days===0?"urgent":days===1?"tomorrow":days<=3?"soon":"planned";}
  _label(days){return days==null?"Ukendt":days===0?"I dag":days===1?"I morgen":days<=3?"Meget snart":"Planlagt";}
  // Vejen fra genbrugspladsen (0) til huset (1); kvadratroden giver de nære dage mest plads
  _road(days){return days==null?0:1-Math.sqrt(Math.min(Math.max(days,0),HORIZON)/HORIZON);}
  _motion(){return this._config?.animation!==false&&!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;}
  _more(entity){this.dispatchEvent(new CustomEvent("hass-more-info",{detail:{entityId:entity},bubbles:true,composed:true}));}
  // Tegn kun om, når indholdet faktisk er nyt (færre DOM-skift, og Safari hopper ikke)
  _set(el,html){if(el&&el._html!==html){el._html=html;el.innerHTML=html;}}

  // Dage mellem tømninger: "interval" i konfigurationen, "14 dags" i beskrivelsen, ellers lært på denne enhed, når datoen
  // springer videre lige efter en afhentning (gemt i localStorage)
  _learn(types){
    let store={};try{store=JSON.parse(localStorage.getItem(LEARN_KEY)||"{}")||{};}catch(_){store={};}
    const today=new Date();today.setHours(0,0,0,0);let changed=false;
    for(const item of types){
      const date=item.attrs.date;if(!date||!item.entity)continue;const seen=store[item.entity]||{};
      if(seen.date&&date>seen.date){const before=parseDate(seen.date),after=parseDate(date),gap=before&&after?dayDiff(before,after):0;if(before&&dayDiff(before,today)<=3&&gap>=5&&gap<=120)seen.interval=gap;}
      if(seen.date!==date){seen.date=date;store[item.entity]=seen;changed=true;}
    }
    if(changed)try{localStorage.setItem(LEARN_KEY,JSON.stringify(store));}catch(_){}
    this._learned=store;
  }
  _interval(item){
    const set=Number(item.interval);if(set>0)return set;
    const match=/(\d+)\s*dag/i.exec(item.attrs.description||"");if(match)return Number(match[1]);
    return this._learned?.[item.entity]?.interval||null;
  }
  // Hvor fyldt beholderen er tegnet: den del af perioden, der er gået siden sidste tømning
  _fill(item){if(item.days==null)return 0;const interval=this._interval(item)||HORIZON;return Math.max(.08,Math.min(1,1-item.days/Math.max(interval,item.days,1)));}
  _hints(item){
    if(Array.isArray(item.items))return item.items.map(String).filter(Boolean);
    if(typeof item.items==="string"&&item.items.trim())return item.items.split(",").map(text=>text.trim()).filter(Boolean);
    const text=`${item.name||""} ${item.attrs.name||""} ${item.attrs.description||""}`;return HINTS.find(([pattern])=>pattern.test(text))?.[1]||[];
  }
  // Afhentningsvinduet fra kalenderen (fx 07:00–15:00), kun når kalenderens næste begivenhed er samme dag
  _window(date){
    const attrs=this._state(this._config.calendar_entity)?.attributes;if(!attrs?.start_time||!date||!String(attrs.start_time).startsWith(date))return null;
    const start=new Date(String(attrs.start_time).replace(" ","T")),end=new Date(String(attrs.end_time||attrs.start_time).replace(" ","T"));
    return Number.isFinite(start.getTime())?{start,end:Number.isFinite(end.getTime())?end:start}:null;
  }
  _phase(win){if(!win)return null;const now=Date.now();return now<win.start?"before":now<win.end?"during":"after";}
  _whenText(win,days){
    if(!win)return "";const now=Date.now(),phase=this._phase(win);
    if(phase==="during")return ` · i gang nu, til kl. ${clock(win.end)}`;if(phase==="after")return " · færdig for i dag";
    let text=` · fra kl. ${clock(win.start)}`;
    if(days!=null&&days<=1){const ms=win.start-now,h=Math.floor(ms/36e5),m=Math.floor(ms%36e5/6e4);text+=` · om ${h?`${h} t ${m} min`:`${m} min`}`;}
    return text;
  }
  // Hvert halve minut: nedtællingen, og en ny tegning når afhentningen går i gang eller slutter
  _tick(){
    if(!this._rendered||!this._nextDate)return;const win=this._window(this._nextDate);
    if(this._phase(win)!==this._lastPhase){this._signature="";this._render();return;}
    const el=this.shadowRoot.querySelector("[data-when]");if(el)el.textContent=this._whenText(win,this._nextDays);
  }
  async _confirm(){
    const cfg=this._config,card=this.shadowRoot.querySelector("ha-card"),button=this.shadowRoot.querySelector(".ack");if(!this._hass||!cfg.confirm_entity||!button)return;
    const undo=card.classList.contains("done");button.classList.add("busy");
    try{
      if(cfg.confirm_script){const [domain,name]=String(cfg.confirm_script).split(".");await this._hass.callService(domain,name,{fortryd:undo});}
      else await this._hass.callService("input_text","set_value",{entity_id:cfg.confirm_entity,value:undo?"":this._nextDate||""});
    }catch(error){console.warn("ha-waste-journey-card: kvittering fejlede",error);}
    finally{button.classList.remove("busy");}
  }

  _build(){
    if(!this._config)return;this._rendered=false;
    const stars=STARS.map(([x,y,d])=>`<i class="star" style="left:${x}%;top:${y}%;animation-delay:-${d}s"></i>`).join("");
    this.shadowRoot.innerHTML=`<style>
      :host{display:block;--accent:var(--dashboard-accent,var(--primary-color,#22c9ff));--green:var(--dashboard-success,var(--success-color,#22c55e));--warn:var(--dashboard-warning,var(--warning-color,#f59e0b));--danger:var(--dashboard-danger,var(--error-color,#ef4444));--muted:var(--secondary-text-color,#8d9baa);--text:var(--primary-text-color,#f1f5f9);--surface:var(--dashboard-card-bg,var(--ha-card-background,var(--card-background-color,#11161d)));--edge:var(--dashboard-border-neutral,var(--divider-color,rgba(135,155,175,.2)))}
      *{box-sizing:border-box}button{font:inherit;color:inherit}
      ha-card{--tone:var(--green);--truck:var(--tone);container-type:inline-size;overflow:hidden;border:1px solid var(--edge);border-left:calc(var(--dashboard-left-accent-width, 1) * 4px) solid var(--green);border-radius:25px;background:radial-gradient(circle at 90% -10%,color-mix(in srgb,var(--green) 14%,transparent),transparent 28%),linear-gradient(145deg,color-mix(in srgb,var(--surface) 97%,var(--green) 3%),var(--surface));box-shadow:var(--dashboard-shadow-deep,var(--ha-card-box-shadow))}
      ha-card.urgent{--tone:var(--danger)}ha-card.tomorrow,ha-card.soon{--tone:var(--warn)}
      .shell{padding:20px}header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}
      .eyebrow{display:flex;align-items:center;gap:8px;color:var(--green);font-size:11px;font-weight:900;letter-spacing:.13em;text-transform:uppercase}
      .dot{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 14px var(--green);animation:pulse 2.2s ease-in-out infinite}
      h2{margin:5px 0 3px;font-size:28px;line-height:1.05}.sub{color:var(--muted);font-size:13px}
      .next-date{display:flex;align-items:center;gap:11px;padding:7px 13px 7px 7px;border:1px solid var(--edge);border-radius:14px;background:rgba(255,255,255,.035);perspective:300px}
      .leaf{display:grid;grid-template-rows:auto 1fr;flex:none;width:40px;height:44px;overflow:hidden;border-radius:9px;background:color-mix(in srgb,var(--surface) 80%,white 9%);box-shadow:0 5px 12px rgba(0,0,0,.32);text-align:center;transform-origin:50% 0}
      .leaf i{display:block;padding:2px 0 1px;background:var(--tone);color:#071018;font-size:8px;font-style:normal;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
      .leaf b{display:grid;place-items:center;font-size:19px;line-height:1;font-variant-numeric:tabular-nums}
      .nd-text span{display:block;color:var(--muted);font-size:9px;letter-spacing:.06em;text-transform:uppercase}.nd-text b{display:block;margin-top:3px;font-size:14px}
      .top{display:grid;gap:12px;margin-top:15px}
      @container (min-width:980px){.top{grid-template-columns:minmax(0,1fr) 300px}}
      .journey{position:relative;overflow:hidden;min-width:0;padding:17px 17px 12px;border:1px solid color-mix(in srgb,var(--tone) 25%,var(--edge));border-radius:20px;background:radial-gradient(circle at 80% 0,color-mix(in srgb,var(--tone) 12%,transparent),transparent 37%),rgba(0,0,0,.12);transition:background 1s}
      .night .journey{background:radial-gradient(circle at 80% 0,color-mix(in srgb,var(--tone) 10%,transparent),transparent 37%),linear-gradient(180deg,rgba(12,20,52,.5),rgba(0,0,0,.14) 70%)}
      .sky{position:absolute;inset:0;pointer-events:none}
      .star{position:absolute;width:2px;height:2px;border-radius:50%;background:#fff;box-shadow:0 0 4px #fff;opacity:0;transition:opacity 1.2s}
      .night .star{opacity:.6;animation:twinkle 3.4s ease-in-out infinite}
      .hero,.scene,.message{position:relative;z-index:1}
      .hero{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:15px}
      .hero-label{display:flex;align-items:center;gap:7px;color:var(--tone);font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
      .beacon{position:relative;width:7px;height:7px;border-radius:50%;background:var(--tone)}
      .beacon:after{content:"";position:absolute;inset:0;border-radius:50%;background:var(--tone);opacity:0}
      .urgent .beacon:after,.tomorrow .beacon:after,.soon .beacon:after{animation:ping 1.6s ease-out infinite}
      .hero h3{margin:6px 0 4px;font-size:22px;line-height:1.15}.hero p{margin:0;color:var(--muted);font-size:12px}.hero p [data-when]{color:var(--text);font-weight:700}
      .count{position:relative;display:grid;place-items:center;width:96px;height:96px}
      .count svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;transform:rotate(-90deg)}
      .ring-bg,.ring{fill:none;stroke-width:6}.ring-bg{stroke:rgba(255,255,255,.07)}
      .ring{stroke:var(--tone);stroke-linecap:round;stroke-dasharray:${RING};filter:drop-shadow(0 0 4px color-mix(in srgb,var(--tone) 55%,transparent));transition:stroke-dashoffset 1.6s cubic-bezier(.2,.8,.2,1) .2s}
      .count:before{content:"";position:absolute;inset:2px;border:2px solid var(--tone);border-radius:50%;opacity:0}
      .alert .count:before{animation:halo 2.4s ease-out infinite}
      .num{position:relative;text-align:center}.num b{display:block;color:var(--tone);font-size:40px;line-height:.9;font-variant-numeric:tabular-nums}
      .num span{display:block;margin-top:4px;color:var(--muted);font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
      .scene{--x0:84px;--x1:98px;--hf:0;height:118px;margin-top:4px}
      .sun,.moon{position:absolute;top:8px;left:31%;width:20px;height:20px;border-radius:50%;transition:opacity 1.2s}
      .sun{background:radial-gradient(circle,#ffe6a0 0 42%,rgba(255,200,90,.35) 52%,transparent 70%);opacity:.6}
      .sun:before{content:"";position:absolute;inset:-9px;border-radius:50%;background:repeating-conic-gradient(rgba(255,214,120,.42) 0 7deg,transparent 7deg 30deg);-webkit-mask:radial-gradient(circle,transparent 0 46%,#000 47% 68%,transparent 70%);mask:radial-gradient(circle,transparent 0 46%,#000 47% 68%,transparent 70%);animation:spin 40s linear infinite}
      .moon{box-shadow:inset -6px 3px 0 0 #eef2ff;opacity:0;transform:rotate(-18deg);filter:drop-shadow(0 0 6px rgba(215,225,255,.5))}
      .night .sun{opacity:0}.night .moon{opacity:.92}
      .cloud{position:absolute;top:10px;left:-80px;width:100%;height:24px;background:radial-gradient(16px 9px at 22px 15px,rgba(255,255,255,.13) 60%,transparent),radial-gradient(20px 13px at 40px 11px,rgba(255,255,255,.15) 60%,transparent),radial-gradient(15px 8px at 58px 16px,rgba(255,255,255,.12) 60%,transparent) no-repeat;background-size:80px 24px;background-repeat:no-repeat;animation:drift 90s linear infinite;pointer-events:none;transition:opacity 1.2s}
      .cloud+.cloud{top:30px;scale:.7;opacity:.8;animation-duration:130s;animation-delay:-70s}.night .cloud{opacity:.35}
      .skyline{position:absolute;left:0;right:0;bottom:30px;height:36px;overflow:hidden;-webkit-mask:linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent);mask:linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent)}
      .skyline i{position:absolute;top:0;bottom:0;left:0;width:calc(100% + 240px);background:color-mix(in srgb,var(--tone) 15%,rgba(255,255,255,.05));-webkit-mask:url("${SKYLINE}") repeat-x left bottom/240px 36px;mask:url("${SKYLINE}") repeat-x left bottom/240px 36px;animation:skyline 30s linear infinite}
      .night .skyline i{background:rgba(125,145,200,.17)}
      .road{position:absolute;left:0;right:0;bottom:18px;height:12px;overflow:hidden;border-radius:6px;background:linear-gradient(180deg,rgba(255,255,255,.075),rgba(255,255,255,.025));box-shadow:inset 0 1px 0 rgba(255,255,255,.1)}
      .lane{position:absolute;left:0;right:-42px;top:5px;height:2px;background:repeating-linear-gradient(90deg,rgba(255,255,255,.34) 0 20px,transparent 20px 42px);animation:lane 1s linear infinite}
      .trail{position:absolute;left:var(--x0);bottom:18px;width:calc((100% - var(--x0) - var(--x1)) * var(--hf));height:12px;overflow:hidden;border-radius:6px;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--truck) 42%,transparent));transition:width 2.4s cubic-bezier(.25,.8,.25,1)}
      .trail:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent 40%,color-mix(in srgb,var(--truck) 70%,white) 50%,transparent 60%);opacity:.6;animation:run 2.6s linear infinite}
      .depot,.home{position:absolute;bottom:12px;z-index:2;display:grid;place-items:center;width:54px;height:54px;border:1px solid var(--edge);border-radius:16px;background:color-mix(in srgb,var(--surface) 88%,black 12%);box-shadow:0 6px 14px rgba(0,0,0,.28)}
      .depot{left:0;color:var(--muted)}.depot ha-icon{--mdc-icon-size:30px;animation:spin 16s linear infinite}
      .home{right:0;color:var(--tone)}.home svg{width:34px;height:34px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
      .home .win{fill:currentColor;fill-opacity:.16;stroke-width:1.4;transition:fill 1s,fill-opacity 1s}
      .night .home .win{fill:#ffd27a;fill-opacity:.95;stroke:#ffd27a;filter:drop-shadow(0 0 3px #ffb84a)}
      .truck,.mini{position:absolute;padding:0;border:0;background:none;cursor:pointer;transform:translateX(-50%)}
      .truck{left:calc(var(--x0) + (100% - var(--x0) - var(--x1)) * var(--hf));bottom:17px;z-index:4;width:68px;height:44px;transition:left 2.4s cubic-bezier(.25,.8,.25,1)}
      .mini{left:calc(var(--x0) + (100% - var(--x0) - var(--x1)) * var(--f));bottom:20px;z-index:3;width:40px;height:26px;transition:left 2.4s cubic-bezier(.25,.8,.25,1) calc(var(--j) * 160ms + 150ms)}
      .body{display:block;width:100%;height:100%;animation:bob .5s ease-in-out infinite alternate}
      .truck .body{filter:drop-shadow(0 6px 6px rgba(0,0,0,.45))}.mini .body{opacity:.9;animation-duration:.62s;animation-delay:calc(var(--j) * -.21s)}
      .during .truck .body{animation-duration:.3s}
      .body svg{display:block;width:100%;height:100%;overflow:visible}
      .t-box{fill:var(--truck)}.t-ribs{fill:none;stroke:color-mix(in srgb,var(--truck) 55%,black);stroke-width:1.4;opacity:.6}
      .t-logo{fill:none;stroke:rgba(255,255,255,.6);stroke-width:1.6;stroke-dasharray:6 3.6}
      .t-rear{fill:color-mix(in srgb,var(--truck) 62%,black)}.t-cab{fill:color-mix(in srgb,var(--truck) 58%,white)}.t-glass{fill:#0c1722;opacity:.85}
      .t-chassis{fill:#1a2330}.t-tire{fill:#0d1218;stroke:#2c3846;stroke-width:1.5}.t-spoke{fill:none;stroke:#8c99a8;stroke-width:1.4}
      .t-light{fill:#ffe7a8}.t-lamp{fill:#ffb020;opacity:.35}.t-flash{fill:#ffb020;opacity:0}
      .alert .truck .t-lamp{opacity:1}.alert .truck .t-flash{animation:flash 1.1s ease-in-out infinite}
      .wheel{transform-box:fill-box;transform-origin:center;animation:spin .7s linear infinite}
      .puff{position:absolute;left:-5px;bottom:9px;width:12px;height:12px;border-radius:50%;background:radial-gradient(circle,rgba(210,220,232,.55),transparent 70%);opacity:0;animation:puff 1.8s ease-out infinite}
      .puff+.puff{animation-delay:.6s}.puff+.puff+.puff{animation-delay:1.2s}
      .beam{position:absolute;left:94%;bottom:4px;width:58px;height:22px;background:linear-gradient(90deg,rgba(255,232,160,.42),transparent);clip-path:polygon(0 42%,100% 0,100% 100%,0 64%);opacity:0;transition:opacity 1.2s;pointer-events:none}
      .night .beam{opacity:1}
      .tag{position:absolute;left:50%;bottom:calc(100% + 3px);padding:1px 6px;border-radius:99px;background:color-mix(in srgb,var(--truck) 24%,rgba(0,0,0,.45));color:var(--truck);font-size:9px;font-weight:900;white-space:nowrap;transform:translateX(-50%)}
      .bin{position:absolute;right:46px;bottom:12px;z-index:5;width:16px;height:21px;opacity:0;transform:translateX(16px) scale(.6);transition:opacity .5s,transform .8s cubic-bezier(.3,1.6,.5,1)}
      .bin svg{display:block;width:100%;height:100%;transform-origin:50% 100%}
      .out .bin{opacity:1;transform:none}.tomorrow:not(.done) .bin svg{animation:hop 3.2s ease-in-out infinite}
      .b-body{fill:var(--truck)}.b-lid{fill:color-mix(in srgb,var(--truck) 65%,white)}.b-wheel{fill:#0d1218}
      .ok{position:absolute;right:-7px;top:-8px;display:grid;place-items:center;width:13px;height:13px;border-radius:50%;background:var(--green);color:#06150e;font-size:9px;font-style:normal;font-weight:900;opacity:0;transform:scale(0);transition:opacity .3s,transform .5s cubic-bezier(.3,1.8,.5,1)}
      .done .ok{opacity:1;transform:none}
      .distance{position:absolute;left:var(--x0);right:var(--x1);bottom:0;color:var(--muted);font-size:9.5px;text-align:center}
      .message{display:flex;align-items:center;gap:9px;overflow:hidden;min-height:44px;margin-top:6px;padding:7px 8px 7px 12px;border:1px solid color-mix(in srgb,var(--tone) 28%,var(--edge));border-radius:12px;background:color-mix(in srgb,var(--tone) 8%,transparent);color:var(--tone);font-size:11.5px;font-weight:800;transition:background .5s,border-color .5s,color .5s}
      .done .message{--tone:var(--green)}
      .message>ha-icon{flex:none;--mdc-icon-size:18px;transform-origin:50% 15%}.alert:not(.done) .message>ha-icon{animation:bell 2.8s ease-in-out infinite}
      .message [data-message]{flex:1;min-width:0}
      .alert:not(.done) .message:after{content:"";position:absolute;inset:0;background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.1) 50%,transparent 65%);transform:translateX(-100%);animation:sheen 4.5s ease-in-out infinite;pointer-events:none}
      .ack{position:relative;z-index:1;flex:none;display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border:0;border-radius:9px;background:var(--tone);color:#071018;font-size:11px;font-weight:900;cursor:pointer;box-shadow:0 6px 16px -6px var(--tone);transition:opacity .2s,background .3s}
      .ack[hidden]{display:none}.ack ha-icon{--mdc-icon-size:15px}.ack.busy{opacity:.55;pointer-events:none}
      .done .ack{background:rgba(255,255,255,.08);color:var(--muted);box-shadow:none}
      .cal{display:flex;flex-direction:column;min-width:0;padding:14px 14px 12px;border:1px solid var(--edge);border-radius:20px;background:rgba(0,0,0,.12)}
      .cal-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:9px}
      .cal-head span{color:var(--muted);font-size:9.5px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.cal-head b{font-size:12px}
      .cal-grid{flex:1;display:grid;grid-template-columns:20px repeat(7,minmax(0,1fr));grid-template-rows:16px;grid-auto-rows:minmax(32px,1fr);gap:4px}
      .dow,.wk{display:grid;place-items:center;color:var(--muted);font-size:8.5px;font-style:normal;font-weight:800;text-transform:uppercase}
      .wk{color:color-mix(in srgb,var(--muted) 65%,transparent);font-variant-numeric:tabular-nums}
      .cell{--c:var(--muted);position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;min-width:0;padding:0;border:1px solid transparent;border-radius:9px;background:rgba(255,255,255,.035);color:var(--text);font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;transition:opacity .4s ease calc(var(--k) * 12ms + 250ms),transform .5s cubic-bezier(.3,1.5,.5,1) calc(var(--k) * 12ms + 250ms)}
      .cell.we{background:rgba(255,255,255,.015);color:color-mix(in srgb,var(--text) 72%,transparent)}.cell.past{opacity:.3}
      .cell small{position:absolute;top:2px;left:4px;color:var(--muted);font-size:7px;font-weight:900;text-transform:uppercase}
      .cell.has{background:color-mix(in srgb,var(--c) 20%,transparent);border-color:color-mix(in srgb,var(--c) 50%,transparent);color:var(--c);cursor:pointer}
      .cell.near{box-shadow:0 0 16px -4px var(--c)}
      .cell.today{border-color:color-mix(in srgb,var(--text) 80%,transparent)}
      .cell.today:before{content:"";position:absolute;inset:-1px;border:1.5px solid var(--text);border-radius:9px;opacity:0;animation:halo 2.6s ease-out infinite}
      .dots{display:flex;gap:2px;height:5px}
      .dots i{width:5px;height:5px;border-radius:50%;background:var(--c);box-shadow:0 0 6px var(--c);transition:transform .45s cubic-bezier(.3,1.9,.5,1) calc(var(--k) * 12ms + 700ms)}
      .types{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:9px;margin-top:12px}
      .waste{--c:var(--green);--fill:.1;position:relative;display:grid;grid-template-columns:46px minmax(0,1fr) auto;align-items:center;gap:12px;min-height:118px;padding:12px 13px 21px 12px;overflow:hidden;border:1px solid color-mix(in srgb,var(--c) 24%,var(--edge));border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--c);border-radius:16px;background:radial-gradient(circle at 100% 0,color-mix(in srgb,var(--c) 12%,transparent),transparent 43%),rgba(255,255,255,.025);text-align:left;cursor:pointer}
      .waste.next{border-color:color-mix(in srgb,var(--c) 45%,var(--edge));box-shadow:0 0 24px -8px var(--c)}
      .waste.next:after{content:"";position:absolute;left:0;top:0;width:45%;height:2px;background:linear-gradient(90deg,transparent,var(--c),transparent);animation:sweep 3.4s ease-in-out infinite;pointer-events:none}
      .spot{position:absolute;inset:0;background:radial-gradient(200px circle at var(--mx,50%) var(--my,50%),color-mix(in srgb,var(--c) 17%,transparent),transparent 70%);opacity:0;transition:opacity .3s;pointer-events:none}
      @media(hover:hover){.waste:hover .spot{opacity:1}.waste:hover{border-color:color-mix(in srgb,var(--c) 45%,var(--edge))}}
      .can{position:relative;width:46px;height:60px}
      .lid{position:absolute;left:1px;right:1px;top:7px;height:7px;border-radius:4px 4px 2px 2px;background:color-mix(in srgb,var(--c) 70%,white);box-shadow:0 2px 4px rgba(0,0,0,.35);transform-origin:6% 100%;animation:peek 9s ease-in-out infinite;animation-delay:calc(var(--i) * -2.3s)}
      .lid:before{content:"";position:absolute;left:50%;top:-4px;width:14px;height:4px;border-radius:3px 3px 0 0;background:inherit;transform:translateX(-50%)}
      .next .lid{animation:flap 2.6s ease-in-out infinite}
      .tank{position:absolute;left:3px;right:3px;top:15px;bottom:6px;overflow:hidden;clip-path:polygon(0 0,100% 0,91% 100%,9% 100%);background:linear-gradient(90deg,rgba(0,0,0,.28),transparent 30%,transparent 70%,rgba(0,0,0,.28)),color-mix(in srgb,var(--c) 13%,rgba(0,0,0,.35))}
      .tank:after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 9px,rgba(0,0,0,.16) 9px 10px)}
      .liquid{position:absolute;left:0;right:0;bottom:0;height:calc(var(--fill) * 100%);background:linear-gradient(180deg,color-mix(in srgb,var(--c) 80%,white),color-mix(in srgb,var(--c) 85%,black));transition:height 1.4s cubic-bezier(.2,.8,.2,1) calc(var(--i) * 90ms + 400ms)}
      .wave{position:absolute;left:0;top:-5px;width:calc(100% + 24px);height:6px;background:color-mix(in srgb,var(--c) 80%,white);-webkit-mask:url("${WAVE}") repeat-x 0 0/24px 6px;mask:url("${WAVE}") repeat-x 0 0/24px 6px;animation:wave 1.8s linear infinite}
      .bubble{position:absolute;bottom:0;left:30%;width:4px;height:4px;border-radius:50%;background:rgba(255,255,255,.55);opacity:0}
      .close .bubble{animation:bubble 2.6s ease-in infinite}.close .bubble+.bubble{left:62%;animation-delay:1.3s}
      .can ha-icon{position:absolute;left:50%;top:58%;z-index:1;--mdc-icon-size:18px;color:#fff;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6));transform:translate(-50%,-50%)}
      .wheels{position:absolute;left:7px;right:7px;bottom:0;height:7px;background:radial-gradient(circle at 4px 3.5px,#0d1218 3px,#3a4655 3.4px,transparent 3.8px),radial-gradient(circle at calc(100% - 4px) 3.5px,#0d1218 3px,#3a4655 3.4px,transparent 3.8px)}
      .waste-copy{position:relative;min-width:0}.waste-copy b{display:block;font-size:12.5px;line-height:1.25}
      .when{display:block;overflow:hidden;margin-top:4px;color:var(--muted);font-size:10px;text-overflow:ellipsis;white-space:nowrap}.when strong{color:var(--text);font-weight:800}
      .ticker{display:flex;gap:4px;height:15px;margin-top:6px;overflow:hidden;font-size:10px;line-height:15px}
      .ticker em{flex:none;color:var(--c);font-style:normal;font-weight:800}.tk{display:block;align-self:flex-start;min-width:0}.tk i{display:block;overflow:hidden;font-style:normal;text-overflow:ellipsis;white-space:nowrap}
      .chip{display:inline-block;margin-bottom:5px;padding:2px 7px;border-radius:99px;background:color-mix(in srgb,var(--c) 20%,transparent);color:var(--c);font-size:8.5px;font-style:normal;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
      .waste-days{position:relative;text-align:right}.waste-days b{display:block;color:var(--c);font-size:28px;line-height:1;font-variant-numeric:tabular-nums}.waste-days span{color:var(--muted);font-size:8px;text-transform:uppercase}
      .bar{position:absolute;left:12px;right:12px;bottom:9px;height:5px;border-radius:99px;background:rgba(255,255,255,.07)}
      .bar i{position:relative;display:block;width:calc(var(--fill) * 100%);height:100%;overflow:hidden;border-radius:inherit;background:linear-gradient(90deg,color-mix(in srgb,var(--c) 50%,transparent),var(--c));box-shadow:0 0 9px var(--c);transition:width 1.3s cubic-bezier(.2,.8,.2,1) calc(var(--i) * 90ms + 300ms)}
      .close .bar i:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.6),transparent);transform:translateX(-100%);animation:sheen 2.6s ease-in-out infinite}
      ${[2,3,4,5,6].map(tickFrames).join("")}
      /* Indkørslen er overgange (ikke animationer), så motion-rest aldrig kan fryse den halvvejs med usynlige rækker */
      .hero,.leaf{transition:opacity .6s ease,transform .8s cubic-bezier(.2,.9,.3,1.2)}.leaf{transition-delay:.15s}
      .waste{transition:opacity .6s cubic-bezier(.2,.8,.2,1) calc(var(--i) * 90ms + 150ms),transform .6s cubic-bezier(.2,.8,.2,1) calc(var(--i) * 90ms + 150ms)}
      .pre .scene{--hf:0!important}.pre .mini{--f:0!important}.pre .ring{stroke-dashoffset:${RING}!important}.pre .bar i{width:0!important}.pre .liquid{height:0!important}
      .pre .hero,.pre .waste{opacity:0;transform:translateY(12px)}.pre .leaf{opacity:0;transform:rotateX(-100deg)}.pre .cell{opacity:0;transform:scale(.6)}.pre .dots i{transform:scale(0)}.pre *{transition:none!important}
      .intro .body{animation-duration:.22s}.intro .wheel{animation-duration:.28s}
      .no-animation *,.no-animation *:before,.no-animation *:after{animation:none!important;transition:none!important}
      @keyframes pulse{50%{opacity:.4;transform:scale(.7)}}@keyframes ping{0%{opacity:.7;transform:scale(1)}100%{opacity:0;transform:scale(3.2)}}
      @keyframes halo{0%{opacity:.7;transform:scale(.94)}100%{opacity:0;transform:scale(1.2)}}@keyframes twinkle{50%{opacity:.12}}
      @keyframes spin{to{transform:rotate(360deg)}}@keyframes skyline{to{transform:translateX(-240px)}}@keyframes lane{to{transform:translateX(-42px)}}
      @keyframes drift{to{transform:translateX(calc(100% + 80px))}}@keyframes run{from{transform:translateX(-100%)}to{transform:translateX(100%)}}@keyframes bob{to{transform:translateY(-1.6px)}}
      @keyframes puff{0%{opacity:.6;transform:translate(0,0) scale(.35)}100%{opacity:0;transform:translate(-20px,-16px) scale(1.7)}}@keyframes flash{50%{opacity:.8}}
      @keyframes hop{0%,70%,100%{transform:none}78%{transform:translateY(-4px) rotate(-7deg)}86%{transform:rotate(5deg)}93%{transform:rotate(-2deg)}}
      @keyframes bell{0%,60%,82%,100%{transform:rotate(0)}64%{transform:rotate(14deg)}68%{transform:rotate(-12deg)}72%{transform:rotate(9deg)}77%{transform:rotate(-5deg)}}
      @keyframes sheen{0%,50%{transform:translateX(-100%)}100%{transform:translateX(100%)}}@keyframes sweep{from{transform:translateX(-100%)}to{transform:translateX(330%)}}
      @keyframes wave{to{transform:translateX(-24px)}}@keyframes bubble{0%{opacity:0;transform:translateY(0)}20%{opacity:.8}100%{opacity:0;transform:translateY(-30px)}}
      @keyframes peek{0%,88%,100%{transform:none}92%{transform:rotate(-22deg)}96%{transform:rotate(-4deg)}}
      @keyframes flap{0%,55%,100%{transform:none}65%{transform:rotate(-26deg)}75%{transform:rotate(-6deg)}82%{transform:rotate(-14deg)}90%{transform:none}}
      @container (max-width:620px){.shell{padding:13px}header{display:block}.next-date{display:inline-flex;margin-top:10px}h2{font-size:24px}.journey{padding:14px 13px 10px}.hero h3{font-size:18px}.count{width:80px;height:80px}.num b{font-size:32px}.scene{--x0:68px;--x1:84px;height:108px}.mini{width:34px;height:22px;bottom:21px}.depot,.home{width:46px;height:46px;border-radius:14px}.depot ha-icon{--mdc-icon-size:25px}.home svg{width:29px;height:29px}.truck{width:58px;height:38px}.bin{right:38px}.cal{padding:12px 11px 10px}.cal-grid{grid-auto-rows:36px}.types{grid-template-columns:1fr}.waste{min-height:100px}}
      @media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}}
    </style><ha-card class="${this._config.animation===false?"no-animation":""}"><div class="shell"><header><div><div class="eyebrow"><i class="dot"></i>Renovation</div><h2>${this._esc(this._config.title)}</h2><div class="sub">${this._esc(this._config.subtitle)}</div></div><div class="next-date"><span class="leaf"><i data-cal-month>—</i><b data-cal-day>—</b></span><span class="nd-text"><span>Næste dato</span><b data-next-date>—</b></span></div></header><div class="top"><section class="journey"><div class="sky">${stars}</div><div class="hero"><div><div class="hero-label"><i class="beacon"></i><span data-status>—</span></div><h3 data-next-name>Henter data …</h3><p><span data-description></span><span data-when></span></p></div><div class="count"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="ring-bg" cx="50" cy="50" r="44"/><circle class="ring" cx="50" cy="50" r="44" style="stroke-dashoffset:${RING}"/></svg><div class="num"><b data-days data-delay="200" data-duration="1300">—</b><span data-unit>dage</span></div></div></div><div class="scene"><i class="sun"></i><i class="moon"></i><i class="cloud"></i><i class="cloud"></i><div class="skyline"><i></i></div><div class="road"><i class="lane"></i></div><div class="trail"></div><div class="depot" title="Genbrugspladsen"><ha-icon icon="mdi:recycle-variant"></ha-icon></div><div class="convoy"></div><button class="truck" type="button"><i class="puff"></i><i class="puff"></i><i class="puff"></i><span class="body">${TRUCK}</span><i class="beam"></i></button><div class="home" title="Hjemme"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 15 16 5l12 10"/><path d="M7 13v14h18V13"/><rect class="win" x="10" y="16" width="5" height="5" rx=".6"/><path d="M18 27v-8h4v8"/></svg></div><div class="bin" aria-hidden="true"><svg viewBox="0 0 16 21"><rect class="b-lid" x="1" y="2" width="14" height="3" rx="1"/><path class="b-body" d="M2.5 6h11l-1.2 12H3.7z"/><circle class="b-wheel" cx="5" cy="19" r="1.8"/></svg><i class="ok">✓</i></div><div class="distance" data-distance></div></div><div class="message"><ha-icon icon="mdi:information-outline"></ha-icon><span data-message>Afventer næste afhentning</span><button class="ack" type="button" hidden><ha-icon icon="mdi:check-bold"></ha-icon><span>Sat ud</span></button></div></section><section class="cal"><div class="cal-head"><span>Kalender</span><b data-cal-title></b></div><div class="cal-grid"></div></section></div><section class="types"></section></div></ha-card>`;this._render();
  }

  _render(){
    if(!this._hass||!this.shadowRoot?.querySelector("ha-card"))return;
    const cfg=this._config,root=this.shadowRoot,card=root.querySelector("ha-card"),next=this._state(cfg.next_entity),hour=new Date().getHours();
    const types=cfg.waste_types.map((item,index)=>({...item,index,days:this._days(item.entity),attrs:this._state(item.entity)?.attributes||{}}));
    this._learn(types);
    const known=types.filter(item=>item.days!=null).sort((a,b)=>a.days-b.days);
    const days=this._days(cfg.next_entity)??known[0]?.days??null,attrs=next?.attributes||known[0]?.attrs||{};
    // Den type, der hentes næste gang, er den store skraldebil; de andre kører bagved i deres egne farver
    const lead=known.find(item=>attrs.name&&item.attrs.name===attrs.name)||known.find(item=>item.days===days)||null;
    const win=this._window(attrs.date),phase=this._phase(win),confirmed=!!cfg.confirm_entity&&!!attrs.date&&this._value(cfg.confirm_entity)===attrs.date;
    this._nextDate=attrs.date||"";this._nextDays=days;this._lastPhase=phase;
    const tone=this._tone(days),heroF=this._road(days),soon=days!=null&&days<=1;
    for(const name of ["urgent","tomorrow","soon","planned","neutral"])card.classList.toggle(name,name===tone);
    card.classList.toggle("alert",soon&&phase!=="after");card.classList.toggle("out",soon);card.classList.toggle("done",soon&&confirmed);
    card.classList.toggle("during",days===0&&phase==="during");card.classList.toggle("night",this._value(this._sunEntity())==="below_horizon");
    card.style.setProperty("--truck",lead?.color||"var(--tone)");
    root.querySelector(".scene").style.setProperty("--hf",heroF.toFixed(4));
    root.querySelector(".ring").style.strokeDashoffset=(RING*(1-(days==null?0:heroF))).toFixed(2);
    const truck=root.querySelector(".truck");truck.dataset.entity=lead?.entity||cfg.next_entity||"";truck.title=`${attrs.name||"Næste afhentning"} · ${attrs.date_short||""}`;
    const nextDate=parseDate(attrs.date);
    root.querySelector("[data-cal-month]").textContent=nextDate?MONTHS[nextDate.getMonth()]:"—";root.querySelector("[data-cal-day]").textContent=nextDate?nextDate.getDate():"—";
    root.querySelector("[data-next-date]").textContent=attrs.date_long||attrs.date_short||"Dato ukendt";
    root.querySelector("[data-next-name]").textContent=attrs.name||"Næste afhentning";
    root.querySelector("[data-description]").textContent=attrs.description||"Planlagt afhentning";
    root.querySelector("[data-when]").textContent=this._whenText(win,days);
    const daysEl=root.querySelector("[data-days]");daysEl.textContent=days??"—";daysEl.dataset.count=days??"";
    root.querySelector("[data-unit]").textContent=days===1?"dag":"dage";
    root.querySelector("[data-status]").textContent=this._label(days);
    root.querySelector("[data-distance]").textContent=days==null?"Ruten er ikke beregnet":days===0?(phase==="during"?"Skraldebilen kører i området nu":phase==="after"?"Dagens afhentning er slut":"Skraldebilen er ved huset i dag"):days===1?"Skraldebilen er næsten fremme":`${days} dage tilbage på ruten`;
    const [icon,message]=days==null?["mdi:information-outline","Afventer næste afhentning"]
      :soon&&confirmed&&phase!=="after"?["mdi:check-circle-outline","Beholderen står ude – I får ikke flere påmindelser"]
      :days===0?(phase==="after"?["mdi:home-import-outline","Afhentet – husk at tage beholderen ind igen"]:["mdi:bell-ring-outline",hour<12||phase==="before"?"Beholderen skal stå klar nu – skraldebilen kommer i dag":"Afhentning i dag – tag beholderen ind, når den er tømt"])
      :days===1?["mdi:bell-ring-outline",hour>=16?"Tid til at stille beholderen ud – den tømmes i morgen":"Husk at stille beholderen ud i aften"]
      :days<=3?["mdi:calendar-clock","Gør beholderen klar – afhentning er tæt på"]:["mdi:check-circle-outline","Du behøver ikke gøre noget endnu"];
    root.querySelector(".message>ha-icon").setAttribute("icon",icon);root.querySelector("[data-message]").textContent=message;
    // "Sat ud" (kvitteringen stopper påmindelserne) – samme knap fortryder; knappen bliver stående, så Safari ikke hopper
    const ack=root.querySelector(".ack");ack.hidden=!(cfg.confirm_entity&&soon&&phase!=="after");
    ack.querySelector("ha-icon").setAttribute("icon",confirmed?"mdi:undo-variant":"mdi:check-bold");ack.querySelector("span").textContent=confirmed?"Fortryd":"Sat ud";
    ack.title=confirmed?"Fjern markeringen":"Markér beholderen som sat ud – stopper påmindelserne";
    let previous=heroF,gap=.17;
    this._set(root.querySelector(".convoy"),known.filter(item=>item!==lead).map((item,j)=>{const f=Math.max(0,Math.min(this._road(item.days),previous-gap));previous=f;gap=.12;return `<button class="mini" type="button" data-entity="${this._esc(item.entity)}" title="${this._esc(item.name||item.attrs.name||"Affald")} · ${this._esc(item.attrs.date_short||"")}" style="--truck:${this._esc(item.color||"#22c55e")};--f:${f.toFixed(4)};--j:${j}"><span class="tag">${item.days} d</span><span class="body">${TRUCK}</span></button>`;}).join(""));
    this._calendar(known);
    this._set(root.querySelector(".types"),types.map(item=>this._type(item,item.days!=null&&item.days===days)).join(""));
    this._rendered=true;if(this._wantPlay){this._wantPlay=false;this._play();}
  }

  // Kalender fra mandag i denne uge, mindst 4 og højst 6 uger, så alle kendte afhentninger kommer med
  _calendar(known){
    const today=new Date();today.setHours(0,0,0,0);const start=new Date(today);start.setDate(today.getDate()-(today.getDay()+6)%7);
    const pickups=new Map();for(const item of known){const date=parseDate(item.attrs.date);if(!date)continue;const key=dayDiff(start,date);if(!pickups.has(key))pickups.set(key,[]);pickups.get(key).push(item);}
    const last=Math.max(0,...[...pickups.keys()].filter(key=>key<42)),weeks=Math.min(6,Math.max(4,Math.ceil((last+1)/7)));
    let html=`<i class="wk"></i>${["M","T","O","T","F","L","S"].map(day=>`<i class="dow">${day}</i>`).join("")}`;
    for(let week=0;week<weeks;week++){
      const monday=new Date(start);monday.setDate(start.getDate()+week*7);html+=`<i class="wk">${this._isoWeek(monday)}</i>`;
      for(let weekday=0;weekday<7;weekday++){
        const index=week*7+weekday,date=new Date(start);date.setDate(start.getDate()+index);const offset=dayDiff(today,date),items=pickups.get(index)||[];
        const cls=["cell",weekday>4?"we":"",offset<0?"past":"",offset===0?"today":"",items.length?"has":"",items.length&&offset>=0&&offset<=1?"near":""].filter(Boolean).join(" ");
        const label=items.map(item=>item.name||item.attrs.name||"Affald").join(" + ");
        const inner=`${date.getDate()===1?`<small>${MONTHS[date.getMonth()]}</small>`:""}${date.getDate()}<span class="dots">${items.map(item=>`<i style="--c:${this._esc(item.color||"#22c55e")}"></i>`).join("")}</span>`;
        html+=items.length?`<button class="${cls}" type="button" data-entity="${this._esc(items[0].entity)}" title="${this._esc(`${WEEKDAYS[date.getDay()]} ${date.getDate()}. ${MONTHS[date.getMonth()]}: ${label}`)}" style="--k:${index};--c:${this._esc(items[0].color||"#22c55e")}">${inner}</button>`:`<span class="${cls}" style="--k:${index}">${inner}</span>`;
      }
    }
    const end=new Date(start);end.setDate(start.getDate()+weeks*7-1);
    this.shadowRoot.querySelector("[data-cal-title]").textContent=start.getMonth()===end.getMonth()?`${MONTHS_LONG[start.getMonth()]} ${start.getFullYear()}`:`${MONTHS_LONG[start.getMonth()]} – ${MONTHS_LONG[end.getMonth()].toLowerCase()}`;
    this._set(this.shadowRoot.querySelector(".cal-grid"),html);
  }
  _isoWeek(date){const t=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())),day=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-day);return Math.ceil(((t-Date.UTC(t.getUTCFullYear(),0,1))/DAY+1)/7);}

  _type(item,isNext){
    const days=item.days,fill=this._fill(item),date=parseDate(item.attrs.date),hints=this._hints(item),n=Math.min(hints.length,6);
    const chip=isNext?`<em class="chip">${days===0?"I dag":days===1?"I morgen":"Næste"}</em>`:"";
    const when=date?`<strong>${WEEKDAYS[date.getDay()]} ${date.getDate()}. ${MONTHS[date.getMonth()]}</strong> · ${this._esc(item.attrs.description||"Planlagt afhentning")}`:this._esc(item.attrs.date_short||"Dato ukendt");
    const ticker=!n?"":n===1?`<span class="ticker"><em>Hører til</em><span class="tk"><i>${this._esc(hints[0])}</i></span></span>`:`<span class="ticker"><em>Hører til</em><span class="tk tk${n}">${[...hints.slice(0,n),hints[0]].map(text=>`<i>${this._esc(text)}</i>`).join("")}</span></span>`;
    return `<button class="waste${isNext?" next":""}${days!=null&&days<=3?" close":""}" type="button" data-entity="${this._esc(item.entity)}" style="--c:${this._esc(item.color||"#22c55e")};--fill:${fill.toFixed(3)};--i:${item.index}"><span class="spot"></span><span class="can" aria-hidden="true"><i class="lid"></i><span class="tank"><i class="liquid"><i class="wave"></i></i><i class="bubble"></i><i class="bubble"></i></span><ha-icon icon="${this._esc(item.icon||item.attrs.icon||"mdi:trash-can-outline")}"></ha-icon><i class="wheels"></i></span><span class="waste-copy">${chip}<b>${this._esc(item.name||item.attrs.name||"Affald")}</b><span class="when">${when}</span>${ticker}</span><span class="waste-days"><b data-count="${days??""}" data-delay="${item.index*90+300}" data-duration="1000">${days??"—"}</b><span>${days===1?"dag":"dage"}</span></span><span class="bar"><i></i></span></button>`;
  }

  // Indkørslen: alt starter ved genbrugspladsen og kører på plads, beholderne fyldes, tallene tæller op
  _play(){
    const card=this.shadowRoot?.querySelector("ha-card");if(!card||!this._motion())return;
    const now=Date.now();if(now-(this._playedAt||0)<15000)return;this._playedAt=now;
    clearTimeout(this._introTimer);card.classList.remove("intro");card.classList.add("pre");void card.offsetWidth;
    requestAnimationFrame(()=>{card.classList.remove("pre");card.classList.add("intro");this.shadowRoot.querySelectorAll("[data-count]").forEach(el=>this._countUp(el));this._introTimer=setTimeout(()=>card.classList.remove("intro"),3400);});
  }
  _countUp(el){
    const to=Number.parseInt(el.dataset.count,10);if(!Number.isFinite(to)||to<1)return;
    const start=performance.now()+Number(el.dataset.delay||0),duration=Number(el.dataset.duration||1000);cancelAnimationFrame(el._raf);el.textContent="0";
    const step=time=>{const k=Math.min(1,Math.max(0,(time-start)/duration));el.textContent=String(Math.round(to*(1-Math.pow(1-k,3))));if(k<1&&el.isConnected)el._raf=requestAnimationFrame(step);};
    el._raf=requestAnimationFrame(step);
  }
  getCardSize(){return 9;}
}

if(!customElements.get("ha-waste-journey-card"))customElements.define("ha-waste-journey-card",HAWasteJourneyCard);
window.customCards=window.customCards||[];window.customCards.push({type:"ha-waste-journey-card",name:"HA Waste Journey Card",description:"Animeret affaldskalender med skraldebiler på vej mod huset",preview:true});
console.info(`%c HA-WASTE-JOURNEY-CARD %c ${VERSION} `,"color:#06150e;background:#22c55e;font-weight:800","color:#22c55e;background:#102030");
