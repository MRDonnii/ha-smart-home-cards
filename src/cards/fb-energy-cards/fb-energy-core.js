// Accessible, read-only cards for the Huawei Solar integration (EMMA + inverter). No external dependencies.
import {resolveEntities} from '../shared/huawei-solar-entities.js';

// Every value the cards read, as [device, domain, suffix] for the Huawei Solar integration's standard entity names
// (see ../shared/huawei-solar-entities.js). `huawei:` renames the devices, `entities:` overrides single keys.
export const ENTITY_SPEC = Object.freeze({
  solar: ['emma', 'sensor', 'pv_output_power'], home: ['emma', 'sensor', 'load_power'],
  grid: ['emma', 'sensor', 'feed_in_power'], battery: ['emma', 'sensor', 'battery_charge_discharge_power'],
  soc: ['emma', 'sensor', 'state_of_capacity'], solar_today: ['emma', 'sensor', 'pv_yield_today'],
  home_today: ['emma', 'sensor', 'consumption_today'], bought_today: ['emma', 'sensor', 'supply_from_grid_today'],
  sold_today: ['emma', 'sensor', 'feed_in_to_grid_today'], charged_today: ['emma', 'sensor', 'energy_charged_today'],
  discharged_today: ['emma', 'sensor', 'energy_discharged_today'], alarm: ['inverter', 'sensor', 'alarms'],
});
/** The card config with `entities` resolved to { key: entity_id | null } (pure; used by setConfig and the tests). */
export function normalizeConfig(config) {
  const c = config && typeof config === 'object' ? config : {};
  return {...c, entities: resolveEntities(ENTITY_SPEC, c)};
}
export const number = (n, digits = 1) => Number.isFinite(n) ? n.toLocaleString('da-DK', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—';
export const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function measure(hass, entity, kind = 'power') {
  const s = hass?.states?.[entity];
  if (!s || !s.state?.trim() || ['unknown','unavailable','none'].includes(s.state.toLowerCase())) return null;
  const value = Number(s.state);
  if (!Number.isFinite(value)) return null;
  const unit = s.attributes?.unit_of_measurement;
  if (kind === 'power') return unit === 'W' ? value : unit === 'kW' ? value * 1000 : null;
  if (kind === 'energy') return unit === 'kWh' ? value : unit === 'Wh' ? value / 1000 : null;
  return unit === '%' && value >= 0 && value <= 100 ? value : null;
}
export function power(n) { return n === null ? '—' : Math.abs(n) >= 1000 ? `${number(Math.abs(n) / 1000, 2)} <small>kW</small>` : `${number(Math.abs(n), 0)} <small>W</small>`; }
export function motionEnabled() { try { return localStorage.getItem('fb-energy-motion') !== 'off'; } catch { return true; } }
export const icon = (name, cls = '') => `<ha-icon class="${cls}" icon="mdi:${name}" aria-hidden="true"></ha-icon>`;
export const styles = `
  :host{display:block;min-width:0;--fb-ink:var(--primary-text-color,#20343b);--fb-muted:color-mix(in srgb,var(--primary-text-color,#20343b) 78%,transparent);--fb-line:var(--ha-card-border-color,var(--divider-color,#dce4e4));--fb-paper:var(--ha-card-background,var(--card-background-color,#fbfcfa));--fb-gold:var(--color-warning-500,var(--warning-color,#b58116));--fb-green:var(--color-success-500,var(--success-color,#1a956b));--fb-blue:var(--color-info-500,var(--primary-color,#367db5));--fb-warm:var(--orange-color,var(--warning-color,#b66a32));color:var(--fb-ink);font-family:var(--primary-font-family,system-ui),sans-serif;container-type:inline-size}
  *{box-sizing:border-box}ha-card{display:block;background:var(--fb-paper);color:var(--fb-ink);border:var(--ha-card-border-width,1px) solid var(--fb-line);border-radius:var(--ha-card-border-radius,26px);box-shadow:var(--ha-card-box-shadow,0 6px 20px #102a3210);backdrop-filter:var(--ha-card-backdrop-filter,none);overflow:hidden}
  .pad{padding:26px}.eyebrow{margin:0 0 7px;color:var(--fb-muted);font-size:14px;font-weight:750;letter-spacing:.12em;text-transform:uppercase}
  h2{margin:0;font-size:28px;font-weight:750;line-height:1.2;letter-spacing:-.5px}p{line-height:1.5;margin:10px 0 0;font-size:17px;color:var(--fb-muted)}
  .head{display:flex;align-items:center;justify-content:space-between;gap:15px}.head-icon{--mdc-icon-size:30px;display:grid;place-items:center;width:58px;height:58px;flex:none;border-radius:18px;background:#e5f1ed;color:var(--fb-green)}
  .footer{border-top:1px solid var(--fb-line);padding:17px 26px;font-size:15px;color:var(--fb-muted);line-height:1.5;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
  .pill{display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border-radius:50px;background:#e8f3ee;color:#215b48;font-weight:700;font-size:15px}.dot{width:8px;height:8px;border-radius:50%;background:currentColor;display:inline-block;flex:none}
  button{font:inherit;color:inherit;cursor:pointer;border:0;background:none}button:focus-visible,summary:focus-visible{outline:3px solid #2075ba;outline-offset:4px;border-radius:10px}button:hover{filter:brightness(.96)}button:active{transform:translateY(1px)}
  .info-button{min-height:48px;border:1px solid var(--fb-line);border-radius:12px;padding:10px 14px;background:#fff;font-size:16px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;gap:8px;--mdc-icon-size:20px}
  .note{padding:15px 18px;border-radius:14px;background:#edf3f3;color:#354b53;font-size:16px;line-height:1.5}.alert{background:#fff0dc;color:#765019}.unavailable{color:#6c6570;background:#f1edf3}
  small{font-size:.5em;font-weight:600;letter-spacing:0} .value{font-variant-numeric:tabular-nums;letter-spacing:-1px;font-size:38px;font-weight:750;line-height:1.2}
  .help{margin-top:18px;border-top:1px solid var(--fb-line);padding-top:16px}summary{cursor:pointer;font-size:17px;font-weight:700;min-height:44px;line-height:44px}details p{font-size:16px;margin:4px 0 12px}
  @container(max-width:430px){.pad{padding:21px 18px}h2{font-size:26px}.footer{padding:16px 18px}.value{font-size:32px}.head-icon{width:49px;height:49px}.eyebrow{font-size:13px}}
  @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
  :host([motion-off]) *, :host([motion-off]) *::after{animation:none!important;transition:none!important}
`;
export const themeStyles = `
  .head-icon,.pill,.node,.battery-state,.note,.row-icon{color:var(--fb-ink)}
  .head-icon,.pill{background:color-mix(in srgb,var(--fb-green) 12%,transparent)}
  button:focus-visible,summary:focus-visible{outline-color:var(--primary-color,#2075ba)}
  .info-button{background:color-mix(in srgb,var(--fb-ink) 5%,transparent)}
  .note{background:color-mix(in srgb,var(--fb-ink) 5%,transparent);color:var(--fb-ink)}
  .alert{background:color-mix(in srgb,var(--warning-color,var(--fb-gold)) 16%,transparent);color:var(--fb-ink)}
  .unavailable{background:color-mix(in srgb,var(--disabled-text-color,var(--fb-muted)) 12%,transparent);color:var(--fb-muted)}
  .track{stroke:color-mix(in srgb,var(--fb-ink) 22%,transparent)}
  .node{background:color-mix(in srgb,var(--fb-green) 10%,transparent);border-color:color-mix(in srgb,var(--fb-green) 26%,transparent);color:var(--fb-ink)}
  .node.solar{background:color-mix(in srgb,var(--fb-gold) 12%,transparent);border-color:color-mix(in srgb,var(--fb-gold) 26%,transparent);color:var(--fb-ink)}
  .node.home{background:color-mix(in srgb,var(--fb-warm) 10%,transparent);border-color:color-mix(in srgb,var(--fb-warm) 26%,transparent);color:var(--fb-ink)}
  .node.grid{background:color-mix(in srgb,var(--fb-blue) 10%,transparent);border-color:color-mix(in srgb,var(--fb-blue) 26%,transparent);color:var(--fb-ink)}
  .battery-state{background:color-mix(in srgb,var(--fb-green) 12%,transparent);color:var(--fb-ink)}
  .battery-state.alert{background:color-mix(in srgb,var(--fb-gold) 16%,transparent)}
  .percentage{color:var(--fb-ink)}
  .battery-illustration{background:color-mix(in srgb,var(--fb-ink) 5%,transparent);border-color:var(--fb-ink)}
  .battery-illustration:before{background:var(--fb-ink)}
  .battery-illustration ha-icon{color:var(--fb-ink)}
  .battery-fill{background:color-mix(in srgb,var(--fb-green) 38%,transparent)}
  .row.solar{--row-color:var(--fb-gold)}.row.home{--row-color:var(--fb-warm)}.row.grid{--row-color:var(--fb-blue)}.row.export{--row-color:var(--fb-green)}
  .row .row-icon{background:color-mix(in srgb,var(--row-color) 12%,transparent);color:var(--fb-ink)}
  .bar{background:color-mix(in srgb,var(--fb-ink) 10%,transparent)}
`;
export class EnergyCard extends HTMLElement {
  constructor() { super(); this.attachShadow({mode:'open'}); this._motion = () => {this.toggleAttribute('motion-off', !motionEnabled());this.render();}; }
  connectedCallback() { this._motion(); window.addEventListener('fb-energy-motion',this._motion); this.render(); }
  disconnectedCallback() { window.removeEventListener('fb-energy-motion',this._motion); clearInterval(this._timer); this._timer=null; }
  setConfig(config) { this.config = normalizeConfig(config); this.render(); }
  set hass(hass) {
    const previous = this._hass;
    const connectionChanged=this._connected!==hass.connection?.connected;
    this._connected=hass.connection?.connected;this._hass = hass;
    if (!this.config) return;
    if (!previous || connectionChanged || Object.values(this.config.entities).some(id=>previous.states[id]!==hass.states[id])) this.render();
  }
  get hass() { return this._hass; }
  read(key,kind) { return measure(this._hass,this.config.entities[key],kind); }
  dataStatus(keys) {
    const sensors=keys.map(k=>this._hass?.states?.[this.config.entities[k]]);
    if(sensors.some(s=>!s||['unavailable','unknown'].includes(s.state)))return {text:'Målinger mangler',problem:true};
    if(this._hass?.connection?.connected === false)return {text:'Forbindelsen til Home Assistant er afbrudt',problem:true};
    // Frontend last_updated is the time the value changed, not the last poll.
    // Unchanged values are not stale. Only use genuine last_reported timestamps.
    const times=sensors.map(s=>Date.parse(s.last_reported));
    if(times.every(t=>Number.isFinite(t))){
      const age=Math.max(0,(Date.now()-Math.min(...times))/1000);
      if(age>180)return {text:`Målinger er ${number(Math.floor(age/60),0)} min. gamle`,problem:true};
    }
    return {text:'Målinger fra anlægget',problem:false};
  }
  mount(html,css='') {
    if(!this.config)return;
    // Keep native disclosure state across live readings.
    const opened=[...this.shadowRoot.querySelectorAll('details')].map(x=>x.open);
    const focused=this.shadowRoot.activeElement;
    const focus=focused?.dataset?.action,entityFocus=focused?.dataset?.entity;
    this.shadowRoot.innerHTML=`<style>${styles}${css}${themeStyles}</style>${html}`;
    this.shadowRoot.querySelectorAll('details').forEach((x,i)=>x.open=opened[i]||false);
    this.shadowRoot.querySelectorAll('[data-entity]').forEach(button=>button.addEventListener('click',()=>button.dataset.entity&&this.dispatchEvent(new CustomEvent('hass-more-info',{detail:{entityId:button.dataset.entity},bubbles:true,composed:true}))));
    if(focus)this.shadowRoot.querySelector(`[data-action="${focus}"]`)?.focus({preventScroll:true});
    else if(entityFocus)[...this.shadowRoot.querySelectorAll('[data-entity]')].find(el=>el.dataset.entity===entityFocus)?.focus({preventScroll:true});
  }
  getCardSize(){return 5;}
  getGridOptions(){return {columns:'full',rows:'auto',min_columns:6};}
  static getStubConfig(){return {entities:resolveEntities(ENTITY_SPEC,{})};}
}
export function register(tag,klass,name,description) {
  if(!customElements.get(tag))customElements.define(tag,klass);
  window.customCards=window.customCards||[];
  if(!window.customCards.some(c=>c.type===tag))window.customCards.push({type:tag,name,description,preview:true});
}
