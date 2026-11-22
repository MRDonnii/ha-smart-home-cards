import {EnergyCard,register,styles,icon,power,number,escape,motionEnabled} from './fb-energy-core.js';
export class EnergyFlowCard extends EnergyCard {
  render(){
    if(!this.config)return;
    const solar=this.read('solar'),home=this.read('home'),rawGrid=this.read('grid'),rawBattery=this.read('battery');
    const grid=rawGrid===null?null:rawGrid*(this.config.grid_import_positive===false?-1:1);
    const battery=rawBattery===null?null:rawBattery*(this.config.battery_charge_positive===false?-1:1);
    const soc=this.read('soc','percent'), threshold=30;
    const solarOn=solar!==null&&solar>threshold,importing=grid!==null&&grid>threshold,exporting=grid!==null&&grid < -threshold;
    const charging=battery!==null&&battery>threshold,discharging=battery!==null&&battery < -threshold;
    const complete=[solar,home,grid,battery].every(v=>v!==null);
    const status=this.dataStatus(['solar','home','grid','battery']);
    const active=complete&&!status.problem;
    const summary=!complete?'Der mangler målinger fra anlægget.':status.problem?'Tallene er ældre. Vi venter på nye målinger.':charging&&importing?'Batteriet lades op. Der hentes også strøm fra elnettet.':solarOn&&exporting?'Solen producerer strøm. Overskud sendes til elnettet.':solarOn&&discharging?'Solen og batteriet leverer strøm.':discharging?'Batteriet leverer strøm.':solarOn?'Solcellerne producerer strøm.':importing?'Der hentes strøm fra elnettet.':'Anlægget bruger kun lidt strøm lige nu.';
    const node=(cls,label,value,caption,mdi,key)=>`<button class="node ${cls}" data-entity="${escape(this.config.entities[key])}" aria-label="${label}: ${escape(value.replace(/<[^>]*>/g,''))}. ${caption}. Åbn måling.">${icon(mdi)}<span class="node-label">${label}</span><span class="node-value">${value}</span><span class="node-caption">${caption}</span></button>`;
    const path=(route,on,reverse,color)=>`<g data-route="${route}" data-reverse="${reverse}"><path class="track"/><path class="flow ${on&&active?'moving':''} ${reverse?'reverse':''}" style="--flow-color:${color}" ${on&&active?'':'visibility="hidden"'}/><path class="arrow" fill="${color}" ${on&&active?'':'visibility="hidden"'}/></g>`;
    this.mount(`<ha-card><div class="pad"><div class="head"><div><div class="eyebrow">Strømmen hjemme</div><h2>${escape(this.config.title||'Hvor går strømmen hen?')}</h2></div><span class="head-icon">${icon('home-lightning-bolt-outline')}</span></div><p>Pilene viser, hvilken vej strømmen løber.</p>
      <div class="flow-map"><svg class="wires" viewBox="0 0 600 430" preserveAspectRatio="none" aria-hidden="true">
      ${path('solar',solarOn,false,'var(--fb-gold)')}${path('grid',importing||exporting,exporting,'var(--fb-blue)')}${path('battery',charging||discharging,discharging,'var(--fb-green)')}
      </svg>${node('solar','Solceller',power(solar),solar===null?'Måling mangler':solarOn?'Producerer strøm':'Producerer ikke nu','white-balance-sunny','solar')}
      ${node('home','Huset',power(home),home===null?'Måling mangler':'Forbrug lige nu','home-outline','home')}
      ${node('grid','Elnettet',power(grid),grid===null?'Måling mangler':importing?'Strøm ind':exporting?'Strøm ud':'Næsten ingen udveksling','transmission-tower','grid')}
      ${node('battery','Batteriet',power(battery),battery===null?'Måling mangler':charging?'Lades op':discharging?'Leverer strøm':'Holder pause','battery-outline','battery')}
      </div>
      <div class="note ${!complete||status.problem?'alert':''}">${icon('information-outline')}<span>${summary}</span></div>
      <details class="help"><summary>Sådan læser du kortet</summary><p><b>Huset</b> viser alt strømforbrug, også en eventuel biloplader. <b>Strøm ind</b> er strøm, I køber. <b>Strøm ud</b> er strøm, I sender til elnettet.</p><p><b>Batteriet</b> gemmer strøm til senere. Det kan også lades fra elnettet. Tallene er øjebliksbilleder og kan opdateres på lidt forskellige tidspunkter.</p><p><b>W og kW</b> viser, hvor meget strøm der bruges eller produceres lige nu. 1 kW er 1.000 W.</p><button class="info-button" data-action="motion" aria-pressed="${motionEnabled()}">${icon(motionEnabled()?'pause':'play')} ${motionEnabled()?'Stop animationer':'Start animationer'}</button></details>
      </div><div class="footer"><span class="pill ${status.problem||!complete?'unavailable':''}"><span class="dot"></span>${status.text}</span><span>Tryk på en måling for detaljer</span></div></ha-card>`, `
      .flow-map{position:relative;height:345px;margin:20px 0 18px}.wires{position:absolute;width:100%;height:100%;inset:0;pointer-events:none}.track{fill:none;stroke:#d8e2e1;stroke-width:4;stroke-linecap:round}.flow{fill:none;stroke:var(--flow-color);stroke-width:5;stroke-dasharray:3 13;stroke-linecap:round}.moving{animation:flow 2.6s linear infinite}.reverse{animation-direction:reverse}.node{position:absolute;bottom:0;width:calc((100% - 40px)/3);z-index:1;border-radius:21px;padding:14px 8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;min-height:150px;background:#edf3f1;color:#244a41;border:1px solid #c8dad3;text-align:center}.node ha-icon{--mdc-icon-size:31px}.node-label{font-size:19px;font-weight:700}.node-value{font-size:29px;font-weight:750;font-variant-numeric:tabular-nums;white-space:nowrap;letter-spacing:-.6px}.node-caption{font-size:14px;line-height:1.3}.solar{top:0;bottom:auto;left:calc((100% + 20px)/3);background:#fff3d6;color:#76500e;border-color:#e8d5a6}.home{left:calc((100% + 20px)/3);background:#f8e8de;border-color:#e3c7b9;color:#834120}.grid{left:0;background:#e9f1fa;color:#245e95;border-color:#c6d9eb}.battery{right:0}.direction{position:absolute;z-index:2;font-size:26px;font-weight:700;pointer-events:none}.solar-dir{left:calc(50% - 9px);top:204px;color:#875a08}.grid-dir{left:calc(33.33% - 7px);top:351px;color:#245e95}.battery-dir{left:calc(66.67% - 7px);top:351px;color:#176b58}.note{display:flex;gap:10px;align-items:flex-start}.note ha-icon{flex:none;--mdc-icon-size:23px}@keyframes flow{to{stroke-dashoffset:-32}}
      @container(max-width:430px){.flow-map{height:350px}.node{width:calc((100% - 22px)/3);min-height:146px;border-radius:17px;padding:13px 3px}.node-value{font-size:24px}.node-label{font-size:17px}.node-caption{font-size:13px}.node ha-icon{--mdc-icon-size:27px}.solar,.home{left:calc((100% + 11px)/3)}.solar{min-height:146px}.solar-dir{top:173px}.grid-dir,.battery-dir{top:325px}}
    `);
    this.shadowRoot.querySelector('[data-action="motion"]')?.addEventListener('click',()=>{try{localStorage.setItem('fb-energy-motion',motionEnabled()?'off':'on')}catch{}window.dispatchEvent(new Event('fb-energy-motion'));this.render()});
    if(!this._resize){this._resize=new ResizeObserver(()=>this.alignPaths());this._resize.observe(this);}
    requestAnimationFrame(()=>this.alignPaths());
    if(this.isConnected&&!this._timer)this._timer=setInterval(()=>this.render(),60000);
  }
  alignPaths(){
    const map=this.shadowRoot.querySelector('.flow-map'),svg=this.shadowRoot.querySelector('.wires');
    if(!map||!svg||!map.clientWidth)return;
    const r=map.getBoundingClientRect();svg.setAttribute('viewBox',`0 0 ${r.width} ${r.height}`);
    const rect=cls=>{const b=this.shadowRoot.querySelector('.'+cls).getBoundingClientRect();return {left:b.left-r.left,right:b.right-r.left,top:b.top-r.top,bottom:b.bottom-r.top,x:b.left-r.left+b.width/2,y:b.top-r.top+b.height/2}};
    const solar=rect('solar'),home=rect('home'),grid=rect('grid'),battery=rect('battery');
    for(const group of svg.querySelectorAll('g')){
      let x1,y1,x2,y2;
      if(group.dataset.route==='solar'){x1=x2=solar.x;y1=solar.bottom+1;y2=home.top-1;}
      else if(group.dataset.route==='grid'){x1=grid.right+1;x2=home.left-1;y1=y2=home.y;}
      else{x1=home.right+1;x2=battery.left-1;y1=y2=home.y;}
      const d=`M${x1} ${y1} L${x2} ${y2}`;group.querySelector('.track').setAttribute('d',d);group.querySelector('.flow').setAttribute('d',d);
      const x=(x1+x2)/2,y=(y1+y2)/2,reverse=group.dataset.reverse==='true',sign=reverse?-1:1;
      group.querySelector('.arrow').setAttribute('d',group.dataset.route==='solar'?`M${x-5} ${y-4} L${x+5} ${y-4} L${x} ${y+5} Z`:`M${x-4*sign} ${y-5} L${x-4*sign} ${y+5} L${x+5*sign} ${y} Z`);
    }
  }
  disconnectedCallback(){super.disconnectedCallback();this._resize?.disconnect();this._resize=null;}
}
register('fb-energy-flow-card',EnergyFlowCard,'Strømmen hjemme','Store danske målinger og rolige animationer af strømretningen.');
