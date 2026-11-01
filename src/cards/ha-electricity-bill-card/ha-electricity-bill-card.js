import "../ha-ai-usage-card/ha-card-list-editor.js";

const VERSION="0.1.1";

// 0.1.0 (Claude AI, 2026-11-01; bruger: "jeg vil egentlig også gerne kunne skrive ind hvad mine regninger lyder på og
// sammeholde det med det vi selv måler så vi kan se hvad det burde lande på næste måned"): kortet til integrationen
// Elregning. Prognose for månedens regning (HA's måling rettet efter de seneste regninger), regningerne med HA's egen måling
// for samme dage, målt pr. måned og en formular til at skrive en regning ind eller rette den. Valgfrit: status for en ny
// elaftale (agreement_entity) med en "Vi har gjort det"-knap (agreement_script), som stopper påmindelserne.
// 0.1.1 (Claude AI, 2026-11-01): statussensoren må mangle attributter (skabelon-hjælper fra brugerfladen).
const MONTHS=["januar","februar","marts","april","maj","juni","juli","august","september","oktober","november","december"];
const MON=["jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"];
const p2=n=>String(n).padStart(2,"0");
const iso=d=>`${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;
const parseDate=v=>{const [y,m,d]=String(v||"").split("-").map(Number);return y&&m&&d?new Date(y,m-1,d):null;};
// Tal skrives på dansk: "1.234,56", "1.180" (punktum = tusinder) eller "1234.56"
const parseNumber=v=>{let s=String(v??"").trim().replace(/\s|kr\.?|kwh/gi,"");if(!s)return null;if(s.includes(","))s=s.replace(/\./g,"").replace(",",".");else if(/^\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,"");const n=Number(s);return Number.isFinite(n)?n:NaN;};
const kr=(v,d=0)=>v==null||!Number.isFinite(Number(v))?"—":`${Number(v).toLocaleString("da-DK",{minimumFractionDigits:d,maximumFractionDigits:d})} kr`;
const num=(v,d=0)=>v==null||!Number.isFinite(Number(v))?"—":Number(v).toLocaleString("da-DK",{minimumFractionDigits:d,maximumFractionDigits:d});
const signed=(v,d=0)=>v==null?"—":`${v>0?"+":v<0?"−":"±"}${num(Math.abs(v),d)}`;

class HAElectricityBillCard extends HTMLElement{
  constructor(){
    super();this.attachShadow({mode:"open"});this._signature="";this._editId=null;
    this.shadowRoot.addEventListener("click",event=>{
      const el=event.target.closest("[data-act]");if(!el)return;event.stopPropagation();
      const act=el.dataset.act;
      if(act==="save")this._save();
      else if(act==="cancel")this._resetForm();
      else if(act==="edit")this._edit(el.dataset.id);
      else if(act==="delete")this._delete(el.dataset.id);
      else if(act==="approve")this._approve(false);
      else if(act==="undo")this._approve(true);
      else if(act==="more")this._more(el.dataset.entity);
      else if(act==="month")this._fillMonth(el.dataset.month);
    });
  }
  static getStubConfig(){return{title:"Elregning",forecast_entity:"sensor.elregning_prognose_denne_maned",bills_entity:"sensor.elregning_seneste_regning",provider_entity:"sensor.stromligning_provider",agreement_entity:"",agreement_script:""};}
  static getConfigElement(){const editor=document.createElement("ha-card-list-editor");editor.definition={roots:[{key:"title",label:"Titel"},{key:"forecast_entity",label:"Prognose (Elregning)",type:"entity"},{key:"bills_entity",label:"Seneste regning (Elregning)",type:"entity"},{key:"provider_entity",label:"Elaftale (fx Strømligning Provider agreement)",type:"entity"},{key:"agreement_entity",label:"Ny aftale: status-sensor (valgfri)",type:"entity"},{key:"agreement_script",label:"Ny aftale: \"Vi har gjort det\"-script (valgfrit)",type:"entity"}],collections:[]};return editor;}
  setConfig(config){this._config={...HAElectricityBillCard.getStubConfig(),...config};this._signature="";this.shadowRoot.innerHTML="";}
  set hass(hass){
    this._hass=hass;if(!this.shadowRoot.querySelector("ha-card"))this._build();
    const c=this._config,st=id=>id?hass.states[id]:undefined;
    const signature=JSON.stringify([c.forecast_entity,c.bills_entity,c.provider_entity,c.agreement_entity].map(id=>{const s=st(id);return s?[s.state,s.last_updated]:null;}));
    if(signature!==this._signature){this._signature=signature;this._render();}
  }

  _build(){
    this.shadowRoot.innerHTML=`<style>${STYLE}</style><ha-card>
      <div class="head"><span class="badge"><ha-icon icon="mdi:receipt-text-clock-outline"></ha-icon></span><div><h2></h2><p data-provider></p></div></div>
      <div data-missing hidden class="missing"></div>
      <section data-hero class="hero"></section>
      <section data-agreement class="agreement" hidden></section>
      <section class="block"><h3>Regninger</h3><div data-bills></div></section>
      <section class="block"><h3>Målt pr. måned <small>tryk for at skrive regningen for måneden</small></h3><div data-months class="months"></div></section>
      <section class="block form"><h3 data-form-title>Skriv en regning ind</h3>
        <div class="grid">
          <label><span>Fra</span><input type="date" data-f="start"></label>
          <label><span>Til</span><input type="date" data-f="end"></label>
          <label><span>Beløb (kr inkl. moms)</span><input type="text" inputmode="decimal" placeholder="fx 1.234,56" data-f="amount"></label>
          <label><span>kWh på regningen (valgfrit)</span><input type="text" inputmode="decimal" placeholder="fx 1.180" data-f="kwh"></label>
          <label><span>Leverandør (valgfrit)</span><input type="text" data-f="supplier"></label>
          <label><span>Note (valgfri)</span><input type="text" data-f="note"></label>
        </div>
        <div class="actions"><span data-msg class="msg"></span><button type="button" class="ghost" data-act="cancel" hidden>Annullér</button><button type="button" class="primary" data-act="save">Gem regning</button></div>
      </section></ha-card>`;
    this._resetForm();
  }

  _render(){
    const root=this.shadowRoot,c=this._config,h=this._hass;if(!root||!h)return;
    root.querySelector("h2").textContent=c.title||"Elregning";
    const provider=h.states[c.provider_entity]?.state;
    root.querySelector("[data-provider]").textContent=provider&&!["unknown","unavailable"].includes(provider)?`Aftale: ${provider}`:"HA's egen måling mod regningerne";
    const fc=h.states[c.forecast_entity],bills=h.states[c.bills_entity];
    const missing=!fc||!bills;
    const miss=root.querySelector("[data-missing]");miss.hidden=!missing;
    miss.innerHTML=missing?`<ha-icon icon="mdi:puzzle-outline"></ha-icon><span>Integrationen <b>Elregning</b> er ikke sat op endnu. Indstillinger → Enheder og tjenester → Tilføj integration → Elregning.</span>`:"";
    root.querySelectorAll(".hero,.block").forEach(el=>{el.hidden=missing;});
    this._agreement();
    if(missing)return;
    this._hero(fc);
    this._bills(bills.attributes.regninger||[]);
    this._months(fc.attributes.maaneder||[]);
  }

  _hero(fc){
    const a=fc.attributes,[y,m]=String(a.maaned||"").split("-").map(Number);
    const month=m?MONTHS[m-1]:"måneden",bill=Number(fc.state),soFar=Number(a.maalt_indtil_nu);
    const pct=bill>0&&Number.isFinite(soFar)?Math.max(0,Math.min(100,soFar/bill*100)):0;
    const ratio=a.forhold_regning_maaling,n=a.regninger_i_forhold||0;
    const how=ratio?`Rettet efter ${n===1?"den seneste regning":`de seneste ${n} regninger`}: de har ligget ${signed((ratio-1)*100,1)} % i forhold til HA's beregning (${kr(a.egen_beregning)}).`
      :"Ingen hele regninger endnu – prognosen er HA's egen beregning. Skriv regningerne ind, så bliver den mere præcis.";
    this.shadowRoot.querySelector("[data-hero]").innerHTML=`
      <div class="hero-top"><div><span class="label">Prognose for ${month}${y&&y!==new Date().getFullYear()?` ${y}`:""}</span><b class="big" data-act="more" data-entity="${this._esc(this._config.forecast_entity)}">${kr(bill)}</b></div>
        <div class="kwh"><b>${num(a.forventet_kwh)}</b><span>kWh forventet</span></div></div>
      <div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div>
      <div class="facts"><span><b>${kr(soFar)}</b> målt indtil nu · ${num(a.maalt_kwh_indtil_nu)} kWh</span><span>${num(a.dage_tilbage,1)} dage tilbage · ${kr(a.dagligt_gennemsnit)}/dag (${a.gennemsnit_dage||0} dage)</span></div>
      <p class="how">${how}</p>`;
  }

  _agreement(){
    const c=this._config,h=this._hass,box=this.shadowRoot.querySelector("[data-agreement]"),s=c.agreement_entity?h.states[c.agreement_entity]:null;
    if(!s){box.hidden=true;box.innerHTML="";return;}
    // Attributterne er valgfrie (en skabelon-hjælper lavet i brugerfladen har ingen); aftalen hentes så fra provider_entity
    const provider=h.states[c.provider_entity]?.state;
    const a={ha_bruger:provider&&!["unknown","unavailable"].includes(provider)?provider:"den nuværende aftale",stromligning_produkt:"2027-aftalen",...s.attributes},state=s.state,link=a.link||"https://www.elforbundet.dk/billig-el-nu";
    const done=a.godkendt?String(a.godkendt).slice(0,16).replace(" "," kl. "):"";
    const text={
      forhandler:["mdi:handshake-outline","wait","Ny aftale for 2027 på vej",`Elforbundet forhandler stadig. HA holder øje og giver besked, når aftalen er ude – og igen, når den kan vælges i Strømligning.`],
      ude:["mdi:bell-ring-outline","act","2027-aftalen er ude",`Tilmeld jer på elforbundet.dk. HA giver besked, når den kan vælges i Strømligning. Den nuværende aftale får tillæg fra 1. januar.`],
      i_stromligning:["mdi:bell-ring-outline","act","Vælg 2027-aftalen i HA",`Strømligning har nu "${this._esc(a.stromligning_produkt)}". HA bruger stadig "${this._esc(a.ha_bruger)}": Indstillinger → Enheder og tjenester → Strømligning → Konfigurer.`],
      ha_opdateret:["mdi:check-circle-outline","act","HA bruger 2027-aftalen",`Strømligning regner nu med "${this._esc(a.ha_bruger)}". Er I også tilmeldt på elforbundet.dk, så tryk "Vi har gjort det".`],
      godkendt:["mdi:check-decagram","ok","Ny aftale klaret",`Tilmeldt og valgt i HA${done?` – godkendt ${this._esc(done)}`:""}.`],
    }[state]||["mdi:help-circle-outline","wait","Ny aftale",`Kunne ikke læse status lige nu. Se selv på elforbundet.dk.`];
    const canApprove=c.agreement_script&&["ude","i_stromligning","ha_opdateret"].includes(state);
    box.hidden=false;box.className=`agreement ${text[1]}`;
    box.innerHTML=`<ha-icon icon="${text[0]}"></ha-icon><div class="ag-copy"><b>${text[2]}</b><span>${text[3]}</span></div><div class="ag-btns">
      ${canApprove?`<button type="button" class="primary" data-act="approve">Vi har gjort det</button>`:""}
      ${state==="godkendt"&&c.agreement_script?`<button type="button" class="ghost" data-act="undo">Fortryd</button>`:""}
      ${state!=="godkendt"?`<a class="ghost" href="${this._esc(link)}" target="_blank" rel="noopener">elforbundet.dk</a>`:""}</div>`;
  }

  _period(b){
    const s=parseDate(b.start),e=parseDate(b.end);if(!s||!e)return `${b.start} – ${b.end}`;
    const last=new Date(s.getFullYear(),s.getMonth()+1,0).getDate();
    if(s.getDate()===1&&e.getFullYear()===s.getFullYear()&&e.getMonth()===s.getMonth()&&e.getDate()===last)return `${MONTHS[s.getMonth()][0].toUpperCase()}${MONTHS[s.getMonth()].slice(1)} ${s.getFullYear()}`;
    return `${s.getDate()}. ${MON[s.getMonth()]}${s.getFullYear()!==e.getFullYear()?` ${s.getFullYear()}`:""} – ${e.getDate()}. ${MON[e.getMonth()]} ${e.getFullYear()}`;
  }
  _bills(list){
    const box=this.shadowRoot.querySelector("[data-bills]");this._list=list;
    if(!list.length){box.innerHTML=`<p class="empty">Ingen regninger endnu. Skriv den seneste ind nedenfor – så holder HA den op mod sin egen måling.</p>`;return;}
    box.innerHTML=list.map(b=>{
      const pct=b.difference_pct,cls=pct==null?"":Math.abs(pct)<3?"ok":Math.abs(pct)<10?"warn":"bad";
      const diff=b.difference==null?`<span class="diff">HA har ingen måling for perioden</span>`
        :`<span class="diff ${cls}">${signed(b.difference)} kr · ${signed(pct,1)} %</span>`;
      const cover=b.coverage<1&&b.measured_cost!=null?`<em class="part">HA har kun målt ${Math.round(b.coverage*b.days)} af ${b.days} dage</em>`:"";
      const kwh=b.kwh!=null?`${num(b.kwh)} kWh på regningen · ${num(b.measured_kwh)} kWh målt${b.kwh_difference_pct!=null?` (${signed(b.kwh_difference_pct,1)} %)`:""}`:`${num(b.measured_kwh)} kWh målt`;
      const price=b.bill_price!=null?` · ${num(b.bill_price,2)} kr/kWh på regningen`:b.measured_price!=null?` · ${num(b.measured_price,2)} kr/kWh målt`:"";
      return `<div class="bill"><div class="b-main"><b>${this._period(b)}</b><span class="sub">${kwh}${price}${b.supplier?` · ${this._esc(b.supplier)}`:""}${b.note?` · ${this._esc(b.note)}`:""}</span>${cover}</div>
        <div class="b-num"><b>${kr(b.amount)}</b><span>HA: ${kr(b.measured_cost)}</span>${diff}</div>
        <div class="b-btns"><button type="button" class="icon" data-act="edit" data-id="${this._esc(b.id)}" title="Ret"><ha-icon icon="mdi:pencil-outline"></ha-icon></button><button type="button" class="icon" data-act="delete" data-id="${this._esc(b.id)}" title="Slet"><ha-icon icon="mdi:trash-can-outline"></ha-icon></button></div></div>`;
    }).join("");
  }
  _months(months){
    const box=this.shadowRoot.querySelector("[data-months]");
    box.innerHTML=months.length?[...months].reverse().map(m=>{const [y,mo]=m.month.split("-").map(Number);return `<button type="button" class="month" data-act="month" data-month="${m.month}" title="Skriv regningen for ${MONTHS[mo-1]} ${y}"><b>${MON[mo-1]} ${String(y).slice(2)}</b><span>${kr(m.cost)}</span><span>${num(m.kwh)} kWh</span>${m.coverage<1?`<em>${Math.round(m.coverage*100)} % af måneden</em>`:""}</button>`;}).join(""):`<p class="empty">Ingen målinger endnu.</p>`;
  }

  _f(key){return this.shadowRoot.querySelector(`[data-f="${key}"]`);}
  _msg(text,bad=false){const el=this.shadowRoot.querySelector("[data-msg]");el.textContent=text||"";el.classList.toggle("bad",bad);}
  _fillMonth(month){
    const [y,m]=String(month).split("-").map(Number);if(!y)return;this._resetForm();
    this._f("start").value=iso(new Date(y,m-1,1));this._f("end").value=iso(new Date(y,m,0));this._f("amount").focus();
  }
  _resetForm(){
    if(!this.shadowRoot.querySelector("[data-f]"))return;
    const now=new Date(),first=new Date(now.getFullYear(),now.getMonth()-1,1),last=new Date(now.getFullYear(),now.getMonth(),0);
    this._editId=null;this._f("start").value=iso(first);this._f("end").value=iso(last);
    for(const k of ["amount","kwh","note"])this._f(k).value="";
    const provider=this._hass?.states[this._config.provider_entity]?.state;
    this._f("supplier").value=provider&&!["unknown","unavailable"].includes(provider)?provider.split(" - ")[0]:"";
    this.shadowRoot.querySelector("[data-form-title]").textContent="Skriv en regning ind";
    this.shadowRoot.querySelector("[data-act=save]").textContent="Gem regning";
    this.shadowRoot.querySelector("[data-act=cancel]").hidden=true;this._msg("");
  }
  _edit(id){
    const b=(this._list||[]).find(x=>x.id===id);if(!b)return;
    this._editId=id;this._f("start").value=b.start;this._f("end").value=b.end;
    this._f("amount").value=num(b.amount,2);this._f("kwh").value=b.kwh!=null?num(b.kwh,2):"";
    this._f("supplier").value=b.supplier||"";this._f("note").value=b.note||"";
    this.shadowRoot.querySelector("[data-form-title]").textContent=`Ret regningen for ${this._period(b).toLowerCase()}`;
    this.shadowRoot.querySelector("[data-act=save]").textContent="Gem ændringer";
    this.shadowRoot.querySelector("[data-act=cancel]").hidden=false;this._msg("");
    this.shadowRoot.querySelector(".form").scrollIntoView({behavior:"smooth",block:"nearest"});
  }
  async _save(){
    const start=this._f("start").value,end=this._f("end").value,amount=parseNumber(this._f("amount").value),kwh=parseNumber(this._f("kwh").value);
    if(!start||!end)return this._msg("Vælg fra og til.",true);
    if(end<start)return this._msg("Til-datoen ligger før fra-datoen.",true);
    if(amount==null||Number.isNaN(amount)||amount<0)return this._msg("Skriv regningens beløb, fx 1.234,56.",true);
    if(Number.isNaN(kwh))return this._msg("kWh skal være et tal (eller tomt).",true);
    const data={start_date:start,end_date:end,amount,kwh:kwh??null,supplier:this._f("supplier").value.trim()||null,note:this._f("note").value.trim()||null};
    const btn=this.shadowRoot.querySelector("[data-act=save]");btn.disabled=true;this._msg("Gemmer …");
    try{
      if(this._editId)await this._hass.callService("elregning","update_bill",{id:this._editId,...data});
      else await this._hass.callService("elregning","add_bill",data);
      const was=this._editId;this._resetForm();this._msg(was?"Regningen er rettet.":"Regningen er gemt og holdt op mod HA's måling.");
    }catch(err){this._msg(`Kunne ikke gemme: ${err?.message||err}`,true);}
    finally{btn.disabled=false;}
  }
  async _delete(id){
    const b=(this._list||[]).find(x=>x.id===id);if(!b)return;
    if(!window.confirm(`Slet regningen for ${this._period(b).toLowerCase()} (${kr(b.amount)})?`))return;
    try{await this._hass.callService("elregning","delete_bill",{id});if(this._editId===id)this._resetForm();}
    catch(err){this._msg(`Kunne ikke slette: ${err?.message||err}`,true);}
  }
  async _approve(undo){
    const script=String(this._config.agreement_script||"");if(!script.startsWith("script."))return;
    if(!undo&&!window.confirm("Er I tilmeldt den nye aftale, og er den valgt i Strømligning i HA? Så stopper påmindelserne."))return;
    try{await this._hass.callService("script",script.slice(7),{fortryd:undo});}
    catch(err){this._msg(`Kunne ikke gemme: ${err?.message||err}`,true);}
  }
  _more(entityId){if(!entityId)return;this.dispatchEvent(new CustomEvent("hass-more-info",{detail:{entityId},bubbles:true,composed:true}));}
  _esc(v){return String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[ch]);}
  getCardSize(){return 10;}
}

const STYLE=`
:host{--eb-accent:#f59e0b;--eb-ok:#22c55e;--eb-warn:#f59e0b;--eb-bad:#ef4444;--eb-muted:var(--secondary-text-color);--eb-line:color-mix(in srgb,var(--primary-text-color) 10%,transparent);--eb-soft:color-mix(in srgb,var(--primary-text-color) 5%,transparent)}
ha-card{padding:18px;overflow:hidden}
.head{display:flex;gap:12px;align-items:center;margin-bottom:14px}
.badge{display:grid;place-items:center;width:42px;height:42px;border-radius:13px;background:color-mix(in srgb,var(--eb-accent) 18%,transparent);color:var(--eb-accent)}
h2{margin:0;font-size:18px;font-weight:700}.head p{margin:2px 0 0;color:var(--eb-muted);font-size:13px}
h3{margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--eb-muted)}h3 small{text-transform:none;letter-spacing:0;font-weight:500;margin-left:6px}
.missing{display:flex;gap:10px;align-items:center;padding:12px;border-radius:12px;background:var(--eb-soft);font-size:14px}
.hero{padding:16px;border-radius:16px;background:linear-gradient(135deg,color-mix(in srgb,var(--eb-accent) 16%,transparent),color-mix(in srgb,var(--eb-accent) 4%,transparent));margin-bottom:12px}
.hero-top{display:flex;justify-content:space-between;align-items:flex-end;gap:12px}
.label{display:block;font-size:13px;color:var(--eb-muted)}
.big{display:block;font-size:34px;line-height:1.1;font-weight:800;cursor:pointer;font-variant-numeric:tabular-nums}
.kwh{text-align:right}.kwh b{display:block;font-size:20px;font-variant-numeric:tabular-nums}.kwh span{font-size:12px;color:var(--eb-muted)}
.bar{height:8px;border-radius:99px;background:var(--eb-line);margin:12px 0 8px;overflow:hidden}.bar i{display:block;height:100%;border-radius:inherit;background:var(--eb-accent);transition:width .6s ease}
.facts{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 12px;font-size:13px;color:var(--eb-muted)}.facts b{color:var(--primary-text-color)}
.how{margin:10px 0 0;font-size:13px;color:var(--eb-muted)}
.agreement{display:flex;gap:12px;align-items:center;padding:12px 14px;border-radius:14px;margin-bottom:12px;background:var(--eb-soft);border:1px solid var(--eb-line)}
.agreement>ha-icon{flex:none;color:var(--eb-muted)}.agreement.act{border-color:color-mix(in srgb,var(--eb-accent) 55%,transparent);background:color-mix(in srgb,var(--eb-accent) 10%,transparent)}.agreement.act>ha-icon{color:var(--eb-accent)}
.agreement.ok>ha-icon{color:var(--eb-ok)}
.ag-copy{flex:1;min-width:0}.ag-copy b{display:block;font-size:14px}.ag-copy span{display:block;font-size:13px;color:var(--eb-muted);margin-top:2px}
.ag-btns{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}
.block{margin-top:14px}
.bill{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--eb-line)}.bill:first-child{border-top:0}
.b-main b{display:block;font-size:14px}.sub{display:block;font-size:12px;color:var(--eb-muted);margin-top:2px}.part{display:block;font-size:12px;color:var(--eb-warn);font-style:normal;margin-top:2px}
.b-num{text-align:right;font-variant-numeric:tabular-nums}.b-num b{display:block;font-size:15px}.b-num span{display:block;font-size:12px;color:var(--eb-muted)}
.diff.ok{color:var(--eb-ok)!important}.diff.warn{color:var(--eb-warn)!important}.diff.bad{color:var(--eb-bad)!important}
.b-btns{display:flex;gap:2px}
.months{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px}
.month{flex:none;display:flex;flex-direction:column;align-items:flex-start;gap:1px;padding:8px 12px;border-radius:12px;border:1px solid var(--eb-line);background:var(--eb-soft);color:inherit;font:inherit;cursor:pointer;text-align:left}
.month b{font-size:13px;text-transform:capitalize}.month span{font-size:12px;color:var(--eb-muted);font-variant-numeric:tabular-nums}.month em{font-size:11px;color:var(--eb-warn);font-style:normal}
.month:hover{border-color:var(--eb-accent)}
.empty{margin:0;font-size:13px;color:var(--eb-muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
label span{display:block;font-size:12px;color:var(--eb-muted);margin-bottom:4px}
input{box-sizing:border-box;width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--eb-line);background:var(--card-background-color,transparent);color:var(--primary-text-color);font:inherit;font-size:14px}
input:focus{outline:2px solid color-mix(in srgb,var(--eb-accent) 60%,transparent);outline-offset:0}
.actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:12px}.msg{flex:1;font-size:13px;color:var(--eb-ok)}.msg.bad{color:var(--eb-bad)}
button,a.ghost{font:inherit;font-size:13px;font-weight:600;border-radius:10px;padding:8px 14px;cursor:pointer;text-decoration:none;white-space:nowrap}
.primary{border:0;background:var(--eb-accent);color:#1b1205}.primary:disabled{opacity:.6;cursor:default}
.ghost{border:1px solid var(--eb-line);background:transparent;color:var(--primary-text-color)}
.icon{border:0;background:none;padding:6px;color:var(--eb-muted);border-radius:8px}.icon:hover{background:var(--eb-soft);color:var(--primary-text-color)}
[hidden]{display:none!important}
@media (max-width:520px){.bill{grid-template-columns:1fr auto}.b-btns{grid-column:1/-1;justify-content:flex-end;margin-top:-6px}.agreement{flex-wrap:wrap}.ag-btns{width:100%;justify-content:flex-start}.big{font-size:30px}}
`;

if(!customElements.get("ha-electricity-bill-card"))customElements.define("ha-electricity-bill-card",HAElectricityBillCard);
window.customCards=window.customCards||[];window.customCards.push({type:"ha-electricity-bill-card",name:"HA Electricity Bill Card",description:"Elregninger mod HA's egen måling, prognose for måneden og status for ny elaftale",preview:true});
console.info(`%c HA-ELECTRICITY-BILL-CARD %c ${VERSION} `,"color:#1b1205;background:#f59e0b;font-weight:800","color:#f59e0b;background:#1b1205");
