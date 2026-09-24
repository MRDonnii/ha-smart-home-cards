(() => {
const VERSION = '0.4.5';
const POOL_TAB_KEY = 'ha-pool-card:last-tab';
const TAB_TTL_MS = 5 * 60 * 1000;
const savePoolTab = key => { try { sessionStorage.setItem(POOL_TAB_KEY, JSON.stringify({key,at:Date.now()})); } catch {} };
const readPoolTab = () => { try { const item=JSON.parse(sessionStorage.getItem(POOL_TAB_KEY)||'null'); return item && Date.now()-item.at<TAB_TTL_MS && Date.now()>=item.at ? item.key : null; } catch { return null; } };
const DEFAULTS = {
  camera: 'camera.terrasse_syd_medium_resolution_channel',
  water: 'sensor.pool_vandtemperatur', rise: 'sensor.pool_temperaturstigning_i_dag',
  low: 'sensor.pool_laveste_vandtemperatur_i_dag', high: 'sensor.pool_hojeste_vandtemperatur_i_dag',
  running: 'binary_sensor.poolpumpe_korer', pump: 'switch.pool_pumpe_styring',
  status: 'sensor.poolpumpe_driftstatus', power: 'sensor.terrassen_pool_power',
  runtime: 'sensor.poolpumpe_koeretid_i_dag', goal: 'input_number.pool_pumpe_normal_timer_pr_dag',
  energy: 'sensor.poolpumpe_forbrug_i_dag', cost: 'sensor.poolpumpe_pris_i_dag',
  afterPending: 'input_boolean.pool_efterbad_venter', terrace: 'binary_sensor.terrasse_syd_person_detected',
  automatic: 'input_boolean.pool_automation_aktiv', pause: 'input_boolean.pool_pumpe_tvangspause_aktiv',
  mode: 'input_select.pool_pumpe_manuel_override_varighed', manualTimer: 'timer.pool_pumpe_manuel_override',
  afterTimer: 'timer.pool_pumpe_efterbad', filter: 'sensor.pool_filterfremdrift',
  warning: 'sensor.pool_statusadvarsel', next: 'sensor.pool_naeste_handling',
  swim: 'sensor.pool_bedste_badetid', cover: 'input_boolean.pool_cover_pa',
  maintenance: 'sensor.pool_vedligeholdelsesstatus', forecast: 'sensor.pool_forventet_vandtemperatur',
  accuracy: 'sensor.pool_forecast_nojagtighed', ready: 'input_number.pool_badeklar_temperatur',
  service: 'input_select.pool_backwash_status', backwashTimer: 'timer.pool_backwash', rinseTimer: 'timer.pool_rinse',
  winter: 'binary_sensor.pool_vinterblokering', winterThreshold: 'input_number.pool_vinterblokering_temperatur',
  settingsPath: null,
};
const ACTIONS = {
  pause1: 'script.pool_pumpe_tvangspause_1_time', pause2: 'script.pool_pumpe_tvangspause_2_timer',
  prepare: 'script.pool_backwash_forbered', backwash: 'script.pool_backwash_start',
  abort: 'script.pool_backwash_afbryd', rinse: 'script.pool_rinse_start', finish: 'script.pool_backwash_afslut',
};
const safe = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const valid = state => state && !['unknown','unavailable','none',''].includes(String(state).toLowerCase());
const number = state => valid(state) && Number.isFinite(Number(state)) ? Number(state) : null;

class HAPoolCard extends HTMLElement {
  constructor() {
    super(); this.attachShadow({mode:'open'}); this.config = {...DEFAULTS}; this.ha = null;
    this.signatures = new Map(); this.history = []; this.historyAt = 0; this.cameraCard = null;
    this.shadowRoot.addEventListener('click', e => this.click(e));
    this.shadowRoot.addEventListener('change', e => this.change(e));
  }
  static getStubConfig() { return {}; }
  setConfig(config) { this.config = {...DEFAULTS, ...config}; this.signatures.clear(); if (this.isConnected) this.mount(); }
  connectedCallback() { if (this.restoreTab()) return; this.mount(); this.fetchHistory(); }
  disconnectedCallback() { clearInterval(this.historyTimer); clearInterval(this.timerTick); this.historyTimer = null; this.timerTick = null; this.cameraCard = null; }
  set hass(ha) { this.ha = ha; if (this.cameraCard) this.cameraCard.hass = ha; this.update(); this.mountCamera(); this.fetchHistory(); }
  restoreTab() { if (this.config.restore_last_tab===false || readPoolTab()!=='settings' || !/\/pool\/?$/.test(location.pathname)) return false; history.replaceState(null,'',this.settingsPath()); window.dispatchEvent(new Event('location-changed')); return true; }
  poolPath() { return `/${location.pathname.split('/')[1]}/pool`; }
  settingsPath() { return this.config.settingsPath || `/${location.pathname.split('/')[1]}/pool-indstillinger`; }
  state(id) { return this.ha?.states?.[this.config[id]]; }
  raw(id) { return this.state(id)?.state; }
  txt(id, suffix='') { const v = this.raw(id); return valid(v) ? `${safe(v)}${suffix}` : 'Ikke tilgængelig'; }
  num(id) { return number(this.raw(id)); }
  fmt(v, digits=1) { return v == null ? 'Ikke tilgængelig' : v.toLocaleString('da-DK',{minimumFractionDigits:digits,maximumFractionDigits:digits}); }
  on(id) { return this.raw(id) === 'on'; }
  icon(name) { return `<ha-icon icon="mdi:${name}"></ha-icon>`; }
  mount() {
    if (!this.isConnected) return;
    this.shadowRoot.innerHTML = `<style>${HAPoolCard.css}</style><ha-card>
      <header class="top"><div class="brand"><span class="brand-mark">${this.icon('pool')}</span><div><h1>Pool</h1><p>Drift, historik og indstillinger samlet ét sted</p></div></div><nav class="tabs" role="tablist" aria-label="Pool"><a class="tab on" role="tab" aria-selected="true" href="${safe(this.poolPath())}" data-pool-tab="pool">${this.icon('view-dashboard-outline')}<span>Pool</span></a><a class="tab" role="tab" aria-selected="false" href="${safe(this.settingsPath())}" data-pool-tab="settings">${this.icon('cog-outline')}<span>Indstillinger</span></a></nav></header>
      <div class="dashboard">
        <div class="kpis" id="kpis"></div>
        <section class="panel camera-panel"><h2>${this.icon('cctv')} Livekamera <span class="live">● Live</span></h2><div class="camera-frame" id="camera"></div><div class="presence" id="presence"></div></section>
        <section class="panel pump-panel"><h2>${this.icon('pump')} Pumpestyring</h2><div id="pumpBody"></div></section>
        <section class="panel history-panel"><h2>${this.icon('chart-areaspline')} Historik – sidste 7 dage</h2><div id="history"></div></section>
        <section class="panel forecast-panel"><h2>${this.icon('chart-line')} Prognose – forventet vandtemperatur</h2><div id="forecast"></div></section>
        <section class="panel service-panel"><h2>${this.icon('wrench')} Service og handlinger</h2><div id="service"></div></section>
        <section class="panel advice-panel"><h2>${this.icon('lightbulb-on-outline')} Status, rådgivning og anbefalinger</h2><div id="advice"></div></section>
        <section class="panel winter-panel"><h2>${this.icon('snowflake')} Vinterblokering</h2><div id="winter"></div></section>
      </div><div class="feedback" id="feedback" role="status" aria-live="polite"></div>
    </ha-card>`;
    this.signatures.clear(); this.update(); this.mountCamera();
    if (!this.historyTimer) this.historyTimer = setInterval(() => this.fetchHistory(), 600000);
    if (!this.timerTick) this.timerTick = setInterval(() => this.updateTimers(), 1000);
  }
  patch(id, html) {
    const el = this.shadowRoot.getElementById(id);
    if (!el || this.signatures.get(id) === html) return;
    this.signatures.set(id, html); el.innerHTML = html;
  }
  kpi(icon, label, value, detail, tone='') { return `<article class="kpi ${tone}">${this.icon(icon)}<span>${label}</span><strong>${value}</strong><small>${detail}</small></article>`; }
  update() {
    if (!this.shadowRoot.getElementById('kpis') || !this.ha) return;
    const runtime = this.num('runtime'), goal = this.num('goal');
    const rise = this.num('rise');
    this.patch('kpis', [
      this.kpi('thermometer-water','Vandtemperatur',`${this.fmt(this.num('water'))} °C`,rise == null ? 'Udvikling ukendt' : `${rise >= 0 ? '+' : ''}${this.fmt(rise)} °C i dag`),
      this.kpi('pump','Pumpe',this.raw('running') === 'on' ? 'Kører' : this.raw('running') === 'off' ? 'Stoppet' : 'Ikke tilgængelig',this.txt('status'),this.on('running')?'good':''),
      this.kpi('flash','Aktuel effekt',`${this.fmt(this.num('power'),0)} W`,'Poolpumpe'),
      this.kpi('clock-outline','Køretid i dag',`${this.fmt(runtime)} t`,goal == null ? 'Mål ukendt' : `af ${this.fmt(goal)} t`),
      this.kpi('leaf','Elforbrug i dag',`${this.fmt(this.num('energy'),2)} kWh`,'Poolpumpe'),
      this.kpi('cash','Pris i dag',`${this.fmt(this.num('cost'),2)} kr.`,'Poolpumpe'),
    ].join(''));
    this.patch('presence',`<div class="chip ${this.on('afterPending')?'detected':''}">${this.icon('account-swim')}<span>Efter badning</span><b>${this.raw('afterPending')==='on'?'Venter':this.raw('afterPending')==='off'?'Ingen ventende':'Ikke tilgængelig'}</b></div><div class="chip ${this.on('terrace')?'detected':''}">${this.icon('account')}<span>Person på terrassen</span><b>${this.raw('terrace')==='on'?'Registreret':this.raw('terrace')==='off'?'Ingen registreret':'Ikke tilgængelig'}</b></div>`);
    const blocked = this.raw('winter') !== 'off';
    const mode = this.raw('mode');
    const progress = runtime != null && goal > 0 ? Math.min(100,Math.max(0,100*runtime/goal)) : 0;
    this.patch('pumpBody',`<div class="pump-controls">
      <div class="statebox ${this.on('pump')?'good':''}">${this.icon('pump')}<span>Pumpe</span><b>${this.raw('pump')==='on'?'Tændt':this.raw('pump')==='off'?'Slukket':'Ikke tilgængelig'}</b></div>
      <button data-toggle="automatic" class="statebox ${this.on('automatic')?'good':''}">${this.icon('autorenew')}<span>Automatisk styring</span><b>${this.on('automatic')?'Aktiv':'Inaktiv'}</b></button>
      <div class="statebox ${this.on('pause')?'warn':''}">${this.icon('pause-circle')}<span>Tvangspause</span><b>${this.on('pause')?'Aktiv':'Nej'}</b></div>
      <label class="mode-label">Manuel drift<select data-mode ${blocked?'disabled':''}>${(this.state('mode')?.attributes?.options||[]).map(o=>`<option value="${safe(o)}" ${o===mode?'selected':''}>${safe(o)}</option>`).join('')}</select></label>
    </div><div class="metric">Normal daglig køretid <b>${this.fmt(goal)} t</b><div class="progress"><i style="width:${progress}%"></i></div></div>
    <div class="timers"><span>Manuel override <b data-timer="manualTimer">${this.timer('manualTimer')}</b></span><span>Efter badning <b data-timer="afterTimer">${this.timer('afterTimer')}</b></span></div>
    <div class="actions"><button data-pump ${blocked?'disabled':''}>${this.on('pump')?'Sluk pumpe':'Start 1 time'}</button><button data-script="pause1" ${blocked?'disabled':''}>Pause 1 time</button><button data-script="pause2" ${blocked?'disabled':''}>Pause 2 timer</button><button data-after ${blocked?'disabled':''}>Efter badning</button></div>
    ${blocked?`<p class="notice warn">${this.icon('snowflake')} Pumpen er vinterblokeret. Se status nederst.</p>`:''}`);
    this.patch('history',this.historyChart()); this.patch('forecast',this.forecastChart());
    this.patch('service',this.serviceView()); this.patch('advice',this.adviceView()); this.patch('winter',this.winterView());
  }
  timer(key) {
    const s=this.state(key); if(s?.state!=='active') return 'Inaktiv';
    const finish=s.attributes?.finishes_at; const seconds=finish?Math.max(0,Math.floor((new Date(finish).getTime()-Date.now())/1000)):null;
    if(seconds==null||!Number.isFinite(seconds)) return 'Aktiv';
    return `${Math.floor(seconds/3600)}:${String(Math.floor(seconds%3600/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  }
  updateTimers(){for(const el of this.shadowRoot.querySelectorAll('[data-timer]')){const value=this.timer(el.dataset.timer);if(el.textContent!==value)el.textContent=value;}}
  serviceView(){
    const state=this.raw('service')||'Inaktiv';
    const phases=[['Forbered','prepare'],['Backwash','backwash'],['Afbryd','abort'],['Rinse','rinse'],['Afslut','finish']];
    const allowed={Inaktiv:['prepare'],'Klar til BACKWASH':['backwash','abort'],'BACKWASH kører':['abort'],'Klar til RINSE':['rinse','abort'],'RINSE kører':['abort'],'Sæt på FILTER':['finish','abort']};
    const can=allowed[state]||[]; const blocked=this.raw('winter')!=='off';
    return `<div class="workflow">${phases.map(([label,key],i)=>`<button class="phase ${can.includes(key)?'ready':''} ${key==='abort'?'danger':''}" data-script="${key}" ${!can.includes(key)||(blocked&&key!=='abort')?'disabled':''}><small>0${i+1}</small>${this.icon(['cog','filter','stop','water','check'][i])}<b>${label}</b></button>`).join('')}</div><div class="timers"><span>Status <b>${safe(state)}</b></span><span>Backwash <b data-timer="backwashTimer">${this.timer('backwashTimer')}</b></span><span>Rinse <b data-timer="rinseTimer">${this.timer('rinseTimer')}</b></span></div><p class="hint">Flyt kun multiventilen, når pumpen er stoppet. Bekræft hvert trin før start.</p>`;
  }
  adviceView(){const rows=[['filter','Filtreringsfremdrift','progress-check'],['warning','Statusadvarsel','alert-circle-outline'],['next','Næste handling','calendar-check'],['swim','Bedste badetid','weather-sunny'],['cover','Coverstatus','pool'],['maintenance','Vedligeholdelse','wrench']];return `<div class="advice-grid">${rows.map(([key,label,icon])=>`<div class="advice-row">${this.icon(icon)}<span>${label}</span><b>${key==='cover'?(this.on('cover')?'På':'Af'):this.txt(key)}</b></div>`).join('')}</div>`;}
  winterView(){const s=this.state('winter');const blocked=s?.state==='on',override=s?.attributes?.status==='override';const fault=s?.attributes?.sensor_ok===false;const status=fault?'Sensorfejl':override?'Midlertidig override':blocked?'Aktiv':'Ikke aktiv';return `<div class="winter ${blocked?'blocked':''} ${override?'override':''}"><div class="winter-stats"><span>Status <b>${status}</b></span><span>Vand <b>${this.txt('water',' °C')}</b></span><span>Grænse <b>${this.txt('winterThreshold',' °C')}</b></span><span>Periode <b>${safe(s?.attributes?.periode_tekst||'Ikke tilgængelig')}</b></span></div><p>${safe(s?.attributes?.aarsag||'Vinterstatus ikke tilgængelig')}</p><a href="${safe(this.settingsPath())}" data-nav>Åbn vinterindstillinger ${this.icon('arrow-right')}</a></div>`;}
  async fetchHistory(){if(!this.ha?.callApi||!this.isConnected||Date.now()-this.historyAt<600000)return;this.historyAt=Date.now();const start=new Date();start.setDate(start.getDate()-6);start.setHours(0,0,0,0);try{const ids=[this.config.water,this.config.runtime].join(',');const data=await this.ha.callApi('GET',`history/period/${encodeURIComponent(start.toISOString())}?filter_entity_id=${encodeURIComponent(ids)}&minimal_response`);if(!this.isConnected)return;const days=Array.from({length:7},(_,i)=>{const d=new Date(start);d.setDate(d.getDate()+i);return {key:d.toISOString().slice(0,10),label:d.toLocaleDateString('da-DK',{day:'numeric',month:'short'}),temps:[],pump:null};});for(const series of data||[]){const entity=series[0]?.entity_id;for(const item of series){const date=new Date(item.last_changed||item.last_updated);if(Number.isNaN(date.getTime()))continue;const day=days.find(d=>d.key===date.toISOString().slice(0,10));if(!day)continue;const n=number(item.state);if(n==null)continue;if(entity===this.config.water)day.temps.push(n);if(entity===this.config.runtime)day.pump=n;}}this.history=days.map(d=>({...d,temp:d.temps.length?d.temps.at(-1):null}));this.update();}catch(e){console.warn('Poolhistorik kunne ikke hentes',e);}}
  historyChart(){const pts=this.history;if(!pts.length)return '<p class="empty">Henter historik…</p>';const validPts=pts.map(d=>d.temp).filter(v=>v!=null);if(!validPts.length)return '<p class="empty">Ingen temperaturhistorik tilgængelig</p>';const min=Math.floor(Math.min(...validPts)-1),max=Math.ceil(Math.max(...validPts)+1),span=Math.max(1,max-min);const x=i=>40+i*82,y=v=>155-(v-min)/span*125;const line=pts.map((d,i)=>d.temp==null?'':`${i?'L':'M'} ${x(i)} ${y(d.temp)}`).join(' ');const bars=pts.map((d,i)=>d.pump==null?'':`<rect x="${x(i)-12}" y="${155-Math.min(d.pump,12)*5}" width="24" height="${Math.min(d.pump,12)*5}" rx="3" class="bar"/>`).join('');return `<svg viewBox="0 0 580 190" role="img" aria-label="Vandtemperatur og pumpekøretid i syv dage"><line x1="32" y1="155" x2="560" y2="155" class="axis"/>${bars}<path d="${line}" class="line"/>${pts.map((d,i)=>`<text x="${x(i)}" y="181" text-anchor="middle">${safe(d.label)}</text>${d.temp==null?'':`<circle cx="${x(i)}" cy="${y(d.temp)}" r="4" class="dot"><title>${safe(d.label)}: ${this.fmt(d.temp)} °C</title></circle>`}`).join('')}</svg><div class="legend"><span>● Vandtemperatur</span><span>▇ Pumpens køretid</span></div>`;}
  forecastChart(){const state=this.state('forecast'),points=state?.attributes?.forecast_points;let data=Array.isArray(points)?points:[];if(!data.length){const n=this.num('forecast');if(n!=null)data=[{temperature:this.num('water')??n},{temperature:n}];}const vals=data.map(p=>number(p.temperature??p.temp??p.value)).filter(v=>v!=null);if(!vals.length)return '<p class="empty">Prognose ikke tilgængelig</p>';const ready=this.num('ready');const min=Math.floor(Math.min(...vals,ready??Infinity)-1),max=Math.ceil(Math.max(...vals,ready??-Infinity)+1),span=Math.max(1,max-min);const x=i=>36+i*500/Math.max(1,vals.length-1),y=v=>150-(v-min)/span*120;return `<svg viewBox="0 0 560 185" role="img" aria-label="Forventet vandtemperatur"><line x1="35" y1="150" x2="545" y2="150" class="axis"/>${ready==null?'':`<line x1="35" y1="${y(ready)}" x2="545" y2="${y(ready)}" class="threshold"/><text x="38" y="${y(ready)-6}">Badeklar ${this.fmt(ready)} °C</text>`}<path d="${vals.map((v,i)=>`${i?'L':'M'} ${x(i)} ${y(v)}`).join(' ')}" class="line"/>${vals.map((v,i)=>`<circle cx="${x(i)}" cy="${y(v)}" r="4" class="dot"><title>${this.fmt(v)} °C</title></circle>`).join('')}</svg><div class="legend"><span>Forventet temperatur</span><span>Nøjagtighed: ${this.txt('accuracy',' %')}</span></div>`;}
  async mountCamera(){const host=this.shadowRoot.getElementById('camera');if(!host||this.cameraCard||!this.ha)return;const entity=this.config.camera;const s=this.ha.states[entity];if(!s){host.innerHTML='<div class="empty">Kamera ikke tilgængeligt</div>';return;}try{const helpers=await window.loadCardHelpers();if(!host.isConnected)return;const card=await helpers.createCardElement({type:'picture-elements',camera_image:entity,camera_view:'live',elements:[],aspect_ratio:'16:9',tap_action:{action:'more-info'}});card.hass=this.ha;host.replaceChildren(card);this.cameraCard=card;}catch(e){host.innerHTML='<div class="empty">Livekamera kunne ikke indlæses</div>';console.warn('Poolkamera',e);}}
  async call(service,entity,data={}){try{const [domain,name]=service.split('.');await this.ha.callService(domain,name,{entity_id:entity,...data});this.feedback('Handling udført');}catch(e){this.feedback(`Handling mislykkedes: ${e.message||e}`);}}
  feedback(text){const el=this.shadowRoot.getElementById('feedback');if(!el)return;el.textContent=text;el.classList.add('show');clearTimeout(this.feedbackTimeout);this.feedbackTimeout=setTimeout(()=>el.classList.remove('show'),4000);}
  click(e){const el=e.target.closest('[data-script],[data-toggle],[data-after],[data-pump],[data-pool-tab],[data-nav]');if(!el)return;if(el.dataset.poolTab!==undefined){e.preventDefault();if(el.dataset.poolTab!=='pool'){savePoolTab(el.dataset.poolTab);history.pushState(null,'',el.href);window.dispatchEvent(new Event('location-changed'));}return;}if(el.dataset.nav!==undefined){e.preventDefault();history.pushState(null,'',el.href);window.dispatchEvent(new Event('location-changed'));return;}if(el.dataset.pump!==undefined){this.call('input_select.select_option',this.config.mode,{option:this.on('pump')?'Fra (til jeg tænder)':'1 time'});return;}if(el.dataset.toggle){this.call('input_boolean.toggle',this.config[el.dataset.toggle]);return;}if(el.dataset.after!==undefined){this.call('script.turn_on','script.pool_efterbad_start');return;}if(el.dataset.script){const key=el.dataset.script;if(['backwash','rinse','finish','prepare'].includes(key)&&!window.confirm('Bekræft at multiventilen står korrekt, og pumpen er stoppet før ventilen flyttes.'))return;this.call('script.turn_on',ACTIONS[key]);}}
  change(e){if(e.target.matches('[data-mode]'))this.call('input_select.select_option',this.config.mode,{option:e.target.value});}
  getCardSize(){return 18;}
}
HAPoolCard.css = `
:host{display:block;--pool-bg:var(--lovelace-background,var(--primary-background-color));--pool-card-bg:var(--dashboard-card-bg,var(--ha-card-background,var(--card-background-color)));--pool-border:var(--dashboard-border-neutral,var(--divider-color));--pool-accent:var(--dashboard-accent,var(--primary-color));--pool-success:var(--dashboard-success,var(--success-color));--pool-warning:var(--dashboard-warning,var(--warning-color));--pool-danger:var(--dashboard-danger,var(--error-color));--pool-muted:var(--secondary-text-color);--pool-text:var(--primary-text-color);font-family:var(--primary-font-family,inherit)}
*{box-sizing:border-box}ha-card{padding:16px;background:var(--pool-card-bg);color:var(--pool-text);box-shadow:var(--ha-card-box-shadow,0 8px 24px -12px rgba(0,0,0,.5));border:var(--ha-card-border-width,1px) solid var(--pool-border);border-radius:var(--ha-card-border-radius,18px)}button,select{font:inherit}.top{display:flex;align-items:center;justify-content:space-between;gap:16px 24px;flex-wrap:wrap;margin-bottom:18px}.brand{display:flex;align-items:center;gap:14px;min-width:0}.brand-mark{display:grid;place-items:center;width:46px;height:46px;border-radius:14px;color:var(--pool-accent);background:color-mix(in srgb,var(--pool-accent) 12%,transparent);border:1px solid color-mix(in srgb,var(--pool-accent) 32%,transparent)}.brand-mark ha-icon{--mdc-icon-size:26px}.brand h1{margin:0;font-size:26px;line-height:1.1;font-weight:700;letter-spacing:-.015em}.brand p{margin:3px 0 0;font-size:13.5px;color:var(--pool-muted)}.tabs{display:flex;gap:4px;padding:4px;border-radius:14px;background:var(--ha-card-background,var(--card-background-color));border:1px solid var(--divider-color,var(--pool-border));box-shadow:var(--ha-card-box-shadow,none);overflow-x:auto;scrollbar-width:none;max-width:100%}.tabs::-webkit-scrollbar{display:none}.tab{display:flex;align-items:center;gap:8px;padding:9px 16px;border-radius:10px;color:var(--pool-muted);font-size:14px;font-weight:550;white-space:nowrap;text-decoration:none;transition:color .18s ease,background-color .18s ease}.tab ha-icon{--mdc-icon-size:18px;color:var(--disabled-text-color,var(--pool-muted))}.tab:hover{color:var(--pool-text);background:var(--contrast1,color-mix(in srgb,var(--pool-text) 4%,transparent))}.tab.on{color:var(--pool-text);background:var(--dashboard-tab-selected-bg,color-mix(in srgb,var(--pool-accent) 14%,transparent));box-shadow:inset 0 0 0 1px var(--dashboard-tab-selected-border,var(--pool-accent)),0 0 18px -8px var(--pool-accent)}.tab.on ha-icon{color:var(--dashboard-icon-active,var(--pool-accent))}.tab:focus-visible{outline:2px solid var(--pool-accent);outline-offset:2px}.title{display:flex;gap:14px;align-items:center;margin-bottom:16px}.title>ha-icon{--mdc-icon-size:38px;color:var(--pool-accent)}h1{font-size:22px;margin:0;line-height:1.2}p{margin:0}.title p{font-size:12px;color:var(--pool-muted);margin-top:4px}.title a{margin-left:auto}.title a,.winter a{color:var(--pool-accent);text-decoration:none;display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700}.title a ha-icon,.winter a ha-icon{--mdc-icon-size:17px}.dashboard{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:12px}.kpis{grid-column:1/-1;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}.kpi,.panel{background:transparent;border:0;border-radius:var(--ha-card-border-radius,18px)}.kpi{display:flex;flex-direction:column;gap:5px;min-width:0;padding:14px}.kpi ha-icon{color:var(--pool-accent);--mdc-icon-size:25px}.kpi.good ha-icon{color:var(--pool-success)}.kpi span,.kpi small{font-size:11px;color:var(--pool-muted)}.kpi strong{font-size:clamp(16px,1.5vw,23px);line-height:1.2;overflow-wrap:anywhere}.panel{padding:14px;min-width:0}.panel h2{display:flex;align-items:center;gap:8px;font-size:15px;margin:0 0 12px}.panel h2 ha-icon{color:var(--pool-accent);--mdc-icon-size:20px}.camera-panel,.pump-panel{grid-column:span 6}.history-panel,.forecast-panel,.service-panel,.advice-panel{grid-column:span 6}.winter-panel{grid-column:1/-1}.live{margin-left:auto;color:var(--pool-success);font-size:11px}.camera-frame{aspect-ratio:16/9;overflow:hidden;border-radius:12px;background:color-mix(in srgb,var(--pool-text) 8%,var(--pool-card-bg))}.camera-frame>*{width:100%;height:100%}.presence,.pump-controls,.timers,.actions,.workflow,.advice-grid,.winter-stats{display:grid;gap:8px}.presence{grid-template-columns:1fr 1fr;margin-top:10px}.chip,.statebox,.metric,.mode-label,.timers span,.advice-row,.winter-stats span{border:1px solid var(--pool-border);border-radius:10px;background:color-mix(in srgb,var(--pool-accent) 4%,var(--pool-card-bg));padding:9px}.chip{display:grid;grid-template-columns:20px 1fr;gap:2px 7px;font-size:11px}.chip ha-icon{grid-row:span 2;--mdc-icon-size:19px;color:var(--pool-muted)}.chip b{color:var(--pool-muted)}.chip.detected{border-color:var(--pool-success)}.chip.detected b,.chip.detected ha-icon{color:var(--pool-success)}.pump-controls{grid-template-columns:1fr 1fr}.statebox{display:grid;grid-template-columns:23px 1fr;gap:2px 7px;text-align:left;color:var(--pool-text);font-size:11px}.statebox ha-icon{grid-row:span 2;color:var(--pool-accent)}.statebox b{font-size:13px}.statebox.good b{color:var(--pool-success)}.statebox.warn b{color:var(--pool-warning)}button.statebox{cursor:pointer}.mode-label{font-size:11px}.mode-label select{display:block;width:100%;margin-top:5px;padding:6px;background:var(--pool-card-bg);color:var(--pool-text);border:1px solid var(--pool-border);border-radius:7px}.metric{margin-top:9px;font-size:11px}.metric b{float:right}.progress{height:6px;background:var(--pool-border);border-radius:8px;overflow:hidden;margin-top:10px}.progress i{display:block;height:100%;background:var(--pool-accent)}.timers{grid-template-columns:repeat(2,minmax(0,1fr));margin-top:9px}.timers span{font-size:11px}.timers b{float:right}.actions{grid-template-columns:repeat(4,1fr);margin-top:9px}.actions button,.phase{border:1px solid var(--pool-border);border-radius:9px;background:color-mix(in srgb,var(--pool-accent) 11%,var(--pool-card-bg));color:var(--pool-text);padding:9px;cursor:pointer;font-size:11px}.actions button:disabled,.phase:disabled{opacity:.43;cursor:default}.notice{margin-top:9px}.warn{color:var(--pool-warning)}svg{width:100%;height:auto;display:block;max-height:220px}svg .axis{stroke:var(--pool-border)}svg .line{fill:none;stroke:var(--pool-accent);stroke-width:3}svg .dot{fill:var(--pool-accent)}svg .bar{fill:color-mix(in srgb,var(--pool-accent) 55%,transparent)}svg .threshold{stroke:var(--pool-warning);stroke-dasharray:5 4}svg text{fill:var(--pool-muted);font-size:10px}.legend{display:flex;gap:18px;color:var(--pool-muted);font-size:11px}.workflow{grid-template-columns:repeat(5,1fr)}.phase{display:flex;flex-direction:column;align-items:center;gap:4px}.phase.ready{border-color:var(--pool-accent)}.phase.danger.ready{border-color:var(--pool-danger);color:var(--pool-danger)}.phase ha-icon{--mdc-icon-size:20px}.phase small{align-self:flex-start;color:var(--pool-muted)}.hint,.empty{color:var(--pool-muted);font-size:11px;margin-top:10px}.advice-grid{grid-template-columns:1fr 1fr}.advice-row{display:grid;grid-template-columns:18px 1fr;gap:3px 7px;font-size:11px}.advice-row ha-icon{grid-row:span 2;color:var(--pool-accent);--mdc-icon-size:17px}.advice-row b{grid-column:2;overflow-wrap:anywhere}.winter{border:1px solid var(--pool-border);border-radius:10px;padding:10px}.winter.blocked,.winter.override{border-color:var(--pool-warning);background:color-mix(in srgb,var(--pool-warning) 8%,var(--pool-card-bg))}.winter-stats{grid-template-columns:repeat(4,1fr)}.winter-stats span{display:flex;flex-direction:column;gap:4px;font-size:11px}.winter-stats b{font-size:13px}.winter p{margin:10px 0;font-size:12px;color:var(--pool-muted)}.feedback{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);padding:8px 14px;border-radius:9px;background:var(--pool-card-bg);border:1px solid var(--pool-border);opacity:0;pointer-events:none}.feedback.show{opacity:1}
@media(max-width:1100px){.kpis{grid-template-columns:repeat(3,1fr)}}@media(max-width:700px){.kpis{grid-template-columns:repeat(2,1fr)}.camera-panel,.pump-panel,.history-panel,.forecast-panel,.service-panel,.advice-panel{grid-column:1/-1}.camera-panel{grid-row:1}.kpis{grid-row:2}.winter-panel{grid-row:3}.pump-panel{grid-row:4}.tabs{width:100%}.tab{flex:1 1 0;min-width:0;justify-content:center;padding:8px 6px;font-size:13px}.winter-stats{grid-template-columns:repeat(2,1fr)}}@media(max-width:380px){.kpis{grid-template-columns:1fr 1fr}.advice-grid{grid-template-columns:1fr}.workflow{gap:3px}.phase{padding:5px;font-size:9px}}
`;
if(!customElements.get('ha-pool-card'))customElements.define('ha-pool-card',HAPoolCard);
window.customCards=window.customCards||[];window.customCards.push({type:'ha-pool-card',name:'HA Pool Card',description:'Pooldrift, historik og vinterblokering',preview:true});
console.info(`HA POOL CARD v${VERSION}`);

})();
