import "../ha-ai-usage-card/ha-card-list-editor.js";

const VERSION="0.2.0";

// 0.2.0 (Claude AI, 2026-10-27; bruger: "lav det her endnu federe og animeret"): hver affaldstype er sin egen skraldebil på
// vejen (jo tættere på huset, jo før), skraldebilen kører ind fra genbrugspladsen når kortet vises, tallene tæller op,
// ring om nedtællingen, kalenderblad med næste dato, beholder ved huset dagen før, dag/nat-himmel fra sun.sun.
// Kun transform/opacity animeres; motion-rest pauser dem efter 30 s uden aktivitet, og animation:false/reduced motion slår alt fra.
const HORIZON=28,RING=276.46,MONTHS=["jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"];
const STARS=[[7,16,0],[16,44,1.1],[27,10,2.2],[41,30,.6],[55,8,1.7],[63,40,2.8],[74,18,.3],[86,34,1.4],[94,9,2.5]];
const SKYLINE="data:image/svg+xml,"+encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='240' height='36' viewBox='0 0 240 36'><path d='M0 36V22l12-9 12 9v14z'/><rect x='30' y='12' width='14' height='24'/><path d='M48 36V24l10-8 10 8v12z'/><circle cx='80' cy='22' r='8'/><rect x='79' y='26' width='2' height='10'/><rect x='94' y='16' width='20' height='20'/><rect x='98' y='9' width='4' height='7'/><path d='M120 36V25l9-7 9 7v11z'/><circle cx='150' cy='25' r='6'/><rect x='149' y='28' width='2' height='8'/><path d='M160 36V20l14-10 14 10v16z'/><circle cx='202' cy='24' r='7'/><circle cx='210' cy='20' r='8'/><rect x='205' y='26' width='2' height='10'/><rect x='222' y='18' width='14' height='18'/></svg>");
const TRUCK=`<svg viewBox="0 0 68 44" aria-hidden="true"><circle class="t-flash" cx="51.5" cy="10.5" r="7"/><rect class="t-lamp" x="49" y="9" width="5" height="3" rx="1"/><rect class="t-box" x="4" y="10" width="38" height="22" rx="3"/><path class="t-ribs" d="M13 13v16M33 13v16"/><circle class="t-logo" cx="23" cy="21" r="4.6"/><rect class="t-rear" x="1" y="12" width="5" height="19" rx="1.5"/><path class="t-cab" d="M43 14h11l9 9v9H43z"/><path class="t-glass" d="M46 17h7l6 6H46z"/><rect class="t-chassis" x="1" y="31" width="64" height="4" rx="1.5"/><circle class="t-light" cx="63" cy="28" r="1.6"/><g class="wheel"><circle class="t-tire" cx="15" cy="36" r="6"/><path class="t-spoke" d="M15 31.5v9M10.5 36h9"/></g><g class="wheel"><circle class="t-tire" cx="53" cy="36" r="6"/><path class="t-spoke" d="M53 31.5v9M48.5 36h9"/></g></svg>`;

class HAWasteJourneyCard extends HTMLElement{
  constructor(){
    super();this.attachShadow({mode:"open"});this._signature="";
    this.shadowRoot.addEventListener("click",event=>{const target=event.target.closest("[data-entity]");if(target?.dataset.entity)this._more(target.dataset.entity);});
  }
  static getStubConfig(){return{title:"Affald & genbrug",subtitle:"Se hvornår skraldebilen kommer",next_entity:"",animation:true,waste_types:[]};}
  static getConfigElement(){const editor=document.createElement("ha-card-list-editor");editor.definition={roots:[{key:"title",label:"Titel"},{key:"subtitle",label:"Undertitel"},{key:"next_entity",label:"Næste afhentning",type:"entity"},{key:"animation",label:"Animation",type:"boolean"},{key:"sun_entity",label:"Sol (dag/nat, standard sun.sun)",type:"entity"}],collections:[{key:"waste_types",label:"Affaldstyper",itemLabel:"affaldstype",defaults:{name:"Affald",entity:"",icon:"mdi:trash-can-outline",color:"#22c55e"},fields:[{key:"name",label:"Navn"},{key:"entity",label:"Sensor",type:"entity"},{key:"icon",label:"Ikon"},{key:"color",label:"Farve"}]}]};return editor;}
  setConfig(config){this._config={...HAWasteJourneyCard.getStubConfig(),...config,waste_types:Array.isArray(config?.waste_types)?structuredClone(config.waste_types):[]};this._signature="";this._build();}
  set hass(hass){this._hass=hass;if(!this.shadowRoot?.querySelector("ha-card"))this._build();const signature=JSON.stringify([this._config?.next_entity,this._value(this._sunEntity()),new Date().getHours(),...(this._config?.waste_types||[]).map(item=>[item.entity,this._value(item.entity),this._state(item.entity)?.attributes?.date])]);if(signature!==this._signature){this._signature=signature;this._render();}}
  connectedCallback(){
    // Turen spilles, når kortet første gang bliver synligt efter at være sat ind (ikke ved hver ny tilstand)
    if(!this._io&&"IntersectionObserver" in window)this._io=new IntersectionObserver(entries=>{if(!entries.some(entry=>entry.isIntersecting)||this._shown)return;this._shown=true;if(this._rendered)this._play();else this._wantPlay=true;},{threshold:.2});
    this._shown=false;this._io?.observe(this);
  }
  disconnectedCallback(){this._io?.disconnect();this._shown=false;}
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

  _build(){
    if(!this._config)return;this._rendered=false;
    const stars=STARS.map(([x,y,d])=>`<i class="star" style="left:${x}%;top:${y}%;animation-delay:-${d}s"></i>`).join("");
    this.shadowRoot.innerHTML=`<style>
      :host{display:block;--accent:var(--dashboard-accent,var(--primary-color,#22c9ff));--green:var(--dashboard-success,var(--success-color,#22c55e));--warn:var(--dashboard-warning,var(--warning-color,#f59e0b));--danger:var(--dashboard-danger,var(--error-color,#ef4444));--muted:var(--secondary-text-color,#8d9baa);--surface:var(--dashboard-card-bg,var(--ha-card-background,var(--card-background-color,#11161d)));--edge:var(--dashboard-border-neutral,var(--divider-color,rgba(135,155,175,.2)))}
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
      .journey{position:relative;overflow:hidden;margin-top:15px;padding:17px 17px 12px;border:1px solid color-mix(in srgb,var(--tone) 25%,var(--edge));border-radius:20px;background:radial-gradient(circle at 80% 0,color-mix(in srgb,var(--tone) 12%,transparent),transparent 37%),rgba(0,0,0,.12);transition:background 1s}
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
      .hero h3{margin:6px 0 4px;font-size:22px;line-height:1.15}.hero p{margin:0;color:var(--muted);font-size:12px}
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
      .out .bin{opacity:1;transform:none}.tomorrow .bin svg{animation:hop 3.2s ease-in-out infinite}
      .b-body{fill:var(--truck)}.b-lid{fill:color-mix(in srgb,var(--truck) 65%,white)}.b-wheel{fill:#0d1218}
      .distance{position:absolute;left:var(--x0);right:var(--x1);bottom:0;color:var(--muted);font-size:9.5px;text-align:center}
      .message{display:flex;align-items:center;gap:9px;overflow:hidden;margin-top:6px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--tone) 28%,var(--edge));border-radius:12px;background:color-mix(in srgb,var(--tone) 8%,transparent);color:var(--tone);font-size:11.5px;font-weight:800}
      .message ha-icon{flex:none;--mdc-icon-size:18px;transform-origin:50% 15%}.alert .message ha-icon{animation:bell 2.8s ease-in-out infinite}
      .alert .message:after{content:"";position:absolute;inset:0;background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.1) 50%,transparent 65%);transform:translateX(-100%);animation:sheen 4.5s ease-in-out infinite;pointer-events:none}
      .types{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:9px;margin-top:12px}
      .waste{--c:var(--green);--level:10%;position:relative;display:grid;grid-template-columns:44px minmax(0,1fr) auto;align-items:center;gap:10px;min-height:107px;padding:12px 12px 20px;overflow:hidden;border:1px solid color-mix(in srgb,var(--c) 24%,var(--edge));border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--c);border-radius:16px;background:radial-gradient(circle at 100% 0,color-mix(in srgb,var(--c) 12%,transparent),transparent 43%),rgba(255,255,255,.025);text-align:left;cursor:pointer}
      .waste:hover{background-color:rgba(255,255,255,.05);border-color:color-mix(in srgb,var(--c) 40%,var(--edge))}
      .waste.next{border-color:color-mix(in srgb,var(--c) 45%,var(--edge));box-shadow:0 0 22px -8px var(--c)}
      .waste-icon{position:relative;display:grid;place-items:center;width:44px;height:44px;border-radius:14px;background:color-mix(in srgb,var(--c) 14%,transparent);color:var(--c)}
      .waste-icon ha-icon{--mdc-icon-size:24px;animation:float 3.4s ease-in-out infinite;animation-delay:calc(var(--i) * -.8s)}
      .next .waste-icon:before{content:"";position:absolute;inset:-1px;border:2px solid var(--c);border-radius:15px;opacity:0;animation:halo 2.4s ease-out infinite}
      .waste-copy{min-width:0}.waste-copy b,.waste-copy small{display:block}.waste-copy b{font-size:12px}
      .waste-copy small{overflow:hidden;margin-top:4px;color:var(--muted);font-size:9px;text-overflow:ellipsis;white-space:nowrap}
      .chip{display:inline-block;margin-bottom:5px;padding:2px 7px;border-radius:99px;background:color-mix(in srgb,var(--c) 20%,transparent);color:var(--c);font-size:8.5px;font-style:normal;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
      .waste-days{text-align:right}.waste-days b{display:block;color:var(--c);font-size:26px;line-height:1;font-variant-numeric:tabular-nums}.waste-days span{color:var(--muted);font-size:8px;text-transform:uppercase}
      .bar{position:absolute;left:12px;right:12px;bottom:9px;height:5px;border-radius:99px;background:rgba(255,255,255,.07)}
      .bar i{position:relative;display:block;width:var(--level);height:100%;overflow:hidden;border-radius:inherit;background:linear-gradient(90deg,color-mix(in srgb,var(--c) 50%,transparent),var(--c));box-shadow:0 0 9px var(--c);transition:width 1.3s cubic-bezier(.2,.8,.2,1) calc(var(--i) * 90ms + 300ms)}
      .close .bar i:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.6),transparent);transform:translateX(-100%);animation:sheen 2.6s ease-in-out infinite}
      /* Indkørslen er overgange (ikke animationer), så motion-rest aldrig kan fryse den halvvejs med usynlige rækker */
      .hero,.leaf,.waste{transition:opacity .6s ease,transform .8s cubic-bezier(.2,.9,.3,1.2)}.leaf{transition-delay:.15s}
      .waste{transition:opacity .6s cubic-bezier(.2,.8,.2,1) calc(var(--i) * 90ms + 150ms),transform .6s cubic-bezier(.2,.8,.2,1) calc(var(--i) * 90ms + 150ms),background-color .25s,border-color .25s}
      .pre .scene{--hf:0!important}.pre .mini{--f:0!important}.pre .ring{stroke-dashoffset:${RING}!important}.pre .bar i{width:0!important}
      .pre .hero,.pre .waste{opacity:0;transform:translateY(12px)}.pre .leaf{opacity:0;transform:rotateX(-100deg)}.pre *{transition:none!important}
      .intro .body{animation-duration:.22s}.intro .wheel{animation-duration:.28s}
      .no-animation *,.no-animation *:before,.no-animation *:after{animation:none!important;transition:none!important}
      @keyframes pulse{50%{opacity:.4;transform:scale(.7)}}@keyframes ping{0%{opacity:.7;transform:scale(1)}100%{opacity:0;transform:scale(3.2)}}
      @keyframes halo{0%{opacity:.7;transform:scale(.94)}100%{opacity:0;transform:scale(1.2)}}@keyframes twinkle{50%{opacity:.12}}
      @keyframes spin{to{transform:rotate(360deg)}}@keyframes skyline{to{transform:translateX(-240px)}}@keyframes lane{to{transform:translateX(-42px)}}
      @keyframes drift{to{transform:translateX(calc(100% + 80px))}}@keyframes run{from{transform:translateX(-100%)}to{transform:translateX(100%)}}@keyframes bob{to{transform:translateY(-1.6px)}}
      @keyframes puff{0%{opacity:.6;transform:translate(0,0) scale(.35)}100%{opacity:0;transform:translate(-20px,-16px) scale(1.7)}}@keyframes flash{50%{opacity:.8}}
      @keyframes hop{0%,70%,100%{transform:none}78%{transform:translateY(-4px) rotate(-7deg)}86%{transform:rotate(5deg)}93%{transform:rotate(-2deg)}}
      @keyframes bell{0%,60%,82%,100%{transform:rotate(0)}64%{transform:rotate(14deg)}68%{transform:rotate(-12deg)}72%{transform:rotate(9deg)}77%{transform:rotate(-5deg)}}
      @keyframes sheen{0%,50%{transform:translateX(-100%)}100%{transform:translateX(100%)}}@keyframes float{50%{transform:translateY(-3px)}}
            @container (max-width:620px){.shell{padding:13px}header{display:block}.next-date{display:inline-flex;margin-top:10px}h2{font-size:24px}.journey{padding:14px 13px 10px}.hero h3{font-size:18px}.count{width:80px;height:80px}.num b{font-size:32px}.scene{--x0:68px;--x1:84px;height:108px}.mini{width:34px;height:22px;bottom:21px}.depot,.home{width:46px;height:46px;border-radius:14px}.depot ha-icon{--mdc-icon-size:25px}.home svg{width:29px;height:29px}.truck{width:58px;height:38px}.bin{right:38px}.types{grid-template-columns:1fr}.waste{min-height:86px}}
      @media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}}
    </style><ha-card class="${this._config.animation===false?"no-animation":""}"><div class="shell"><header><div><div class="eyebrow"><i class="dot"></i>Renovation</div><h2>${this._esc(this._config.title)}</h2><div class="sub">${this._esc(this._config.subtitle)}</div></div><div class="next-date"><span class="leaf"><i data-cal-month>—</i><b data-cal-day>—</b></span><span class="nd-text"><span>Næste dato</span><b data-next-date>—</b></span></div></header><section class="journey"><div class="sky">${stars}</div><div class="hero"><div><div class="hero-label"><i class="beacon"></i><span data-status>—</span></div><h3 data-next-name>Henter data …</h3><p data-description></p></div><div class="count"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="ring-bg" cx="50" cy="50" r="44"/><circle class="ring" cx="50" cy="50" r="44" style="stroke-dashoffset:${RING}"/></svg><div class="num"><b data-days data-delay="200" data-duration="1300">—</b><span data-unit>dage</span></div></div></div><div class="scene"><i class="sun"></i><i class="moon"></i><i class="cloud"></i><i class="cloud"></i><div class="skyline"><i></i></div><div class="road"><i class="lane"></i></div><div class="trail"></div><div class="depot" title="Genbrugspladsen"><ha-icon icon="mdi:recycle-variant"></ha-icon></div><div class="convoy"></div><button class="truck" type="button"><i class="puff"></i><i class="puff"></i><i class="puff"></i><span class="body">${TRUCK}</span><i class="beam"></i></button><div class="home" title="Hjemme"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 15 16 5l12 10"/><path d="M7 13v14h18V13"/><rect class="win" x="10" y="16" width="5" height="5" rx=".6"/><path d="M18 27v-8h4v8"/></svg></div><div class="bin" aria-hidden="true"><svg viewBox="0 0 16 21"><rect class="b-lid" x="1" y="2" width="14" height="3" rx="1"/><path class="b-body" d="M2.5 6h11l-1.2 12H3.7z"/><circle class="b-wheel" cx="5" cy="19" r="1.8"/></svg></div><div class="distance" data-distance></div></div><div class="message"><ha-icon icon="mdi:information-outline"></ha-icon><span data-message>Afventer næste afhentning</span></div></section><section class="types"></section></div></ha-card>`;this._render();
  }

  _render(){
    if(!this._hass||!this.shadowRoot?.querySelector("ha-card"))return;
    const root=this.shadowRoot,card=root.querySelector("ha-card"),next=this._state(this._config.next_entity),hour=new Date().getHours();
    const types=this._config.waste_types.map((item,index)=>({...item,index,days:this._days(item.entity),attrs:this._state(item.entity)?.attributes||{}}));
    const known=types.filter(item=>item.days!=null).sort((a,b)=>a.days-b.days);
    const days=this._days(this._config.next_entity)??known[0]?.days??null,attrs=next?.attributes||known[0]?.attrs||{};
    // Den type, der hentes næste gang, er den store skraldebil; de andre kører bagved i deres egne farver
    const lead=known.find(item=>attrs.name&&item.attrs.name===attrs.name)||known.find(item=>item.days===days)||null;
    const tone=this._tone(days),heroF=this._road(days);
    for(const name of ["urgent","tomorrow","soon","planned","neutral"])card.classList.toggle(name,name===tone);
    card.classList.toggle("alert",days!=null&&days<=1);card.classList.toggle("out",days!=null&&days<=1);
    card.classList.toggle("night",this._value(this._sunEntity())==="below_horizon");
    card.style.setProperty("--truck",lead?.color||"var(--tone)");
    root.querySelector(".scene").style.setProperty("--hf",heroF.toFixed(4));
    root.querySelector(".ring").style.strokeDashoffset=(RING*(1-(days==null?0:heroF))).toFixed(2);
    const truck=root.querySelector(".truck");truck.dataset.entity=lead?.entity||this._config.next_entity||"";truck.title=`${attrs.name||"Næste afhentning"} · ${attrs.date_short||""}`;
    const [, month, day]=String(attrs.date||"").split("-").map(Number);
    root.querySelector("[data-cal-month]").textContent=month?MONTHS[month-1]:"—";root.querySelector("[data-cal-day]").textContent=day||"—";
    root.querySelector("[data-next-date]").textContent=attrs.date_long||attrs.date_short||"Dato ukendt";
    root.querySelector("[data-next-name]").textContent=attrs.name||"Næste afhentning";
    root.querySelector("[data-description]").textContent=attrs.description||"Planlagt afhentning";
    const daysEl=root.querySelector("[data-days]");daysEl.textContent=days??"—";daysEl.dataset.count=days??"";
    root.querySelector("[data-unit]").textContent=days===1?"dag":"dage";
    root.querySelector("[data-status]").textContent=this._label(days);
    root.querySelector("[data-distance]").textContent=days==null?"Ruten er ikke beregnet":days===0?"Skraldebilen er ved huset i dag":days===1?"Skraldebilen er næsten fremme":`${days} dage tilbage på ruten`;
    const [icon,message]=days==null?["mdi:information-outline","Afventer næste afhentning"]:days===0?["mdi:bell-ring-outline",hour<12?"Beholderen skal stå klar nu – skraldebilen kommer i dag":"Afhentning i dag – tag beholderen ind, når den er tømt"]:days===1?["mdi:bell-ring-outline",hour>=16?"Tid til at stille beholderen ud – den tømmes i morgen":"Husk at stille beholderen ud i aften"]:days<=3?["mdi:calendar-clock","Gør beholderen klar – afhentning er tæt på"]:["mdi:check-circle-outline","Du behøver ikke gøre noget endnu"];
    root.querySelector(".message ha-icon").setAttribute("icon",icon);root.querySelector("[data-message]").textContent=message;
    let previous=heroF,gap=.17;
    root.querySelector(".convoy").innerHTML=known.filter(item=>item!==lead).map((item,j)=>{const f=Math.max(0,Math.min(this._road(item.days),previous-gap));previous=f;gap=.12;return `<button class="mini" type="button" data-entity="${this._esc(item.entity)}" title="${this._esc(item.name||item.attrs.name||"Affald")} · ${this._esc(item.attrs.date_short||"")}" style="--truck:${this._esc(item.color||"#22c55e")};--f:${f.toFixed(4)};--j:${j}"><span class="tag">${item.days} d</span><span class="body">${TRUCK}</span></button>`;}).join("");
    root.querySelector(".types").innerHTML=types.map(item=>this._type(item,item.days!=null&&item.days===days)).join("");
    this._rendered=true;if(this._wantPlay){this._wantPlay=false;this._play();}
  }
  _type(item,isNext){const days=item.days,level=days==null?0:Math.max(7,Math.min(100,100-(Math.min(days,35)/35)*100)),chip=isNext?`<em class="chip">${days===0?"I dag":days===1?"I morgen":"Næste"}</em>`:"";return `<button class="waste${isNext?" next":""}${days!=null&&days<=3?" close":""}" type="button" data-entity="${this._esc(item.entity)}" style="--c:${this._esc(item.color||"#22c55e")};--level:${level}%;--i:${item.index}"><span class="waste-icon"><ha-icon icon="${this._esc(item.icon||item.attrs.icon||"mdi:trash-can-outline")}"></ha-icon></span><span class="waste-copy">${chip}<b>${this._esc(item.name||item.attrs.name||"Affald")}</b><small>${this._esc(item.attrs.date_short||"Dato ukendt")} · ${this._esc(item.attrs.description||"Planlagt afhentning")}</small></span><span class="waste-days"><b data-count="${days??""}" data-delay="${item.index*90+300}" data-duration="1000">${days??"—"}</b><span>${days===1?"dag":"dage"}</span></span><span class="bar"><i></i></span></button>`;}

  // Indkørslen: alt starter ved genbrugspladsen og kører på plads, tallene tæller op
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
  getCardSize(){return 7;}
}

if(!customElements.get("ha-waste-journey-card"))customElements.define("ha-waste-journey-card",HAWasteJourneyCard);
window.customCards=window.customCards||[];window.customCards.push({type:"ha-waste-journey-card",name:"HA Waste Journey Card",description:"Animeret affaldskalender med skraldebiler på vej mod huset",preview:true});
console.info(`%c HA-WASTE-JOURNEY-CARD %c ${VERSION} `,"color:#06150e;background:#22c55e;font-weight:800","color:#22c55e;background:#102030");
