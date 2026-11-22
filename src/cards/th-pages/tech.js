// th-tech-card: power switches for equipment, Home Assistant system gauges, relays, printer ink and backups.
// Switches and printers come from the config; relays are discovered by integration (default Shelly); the gauges and
// backup times use Home Assistant's System Monitor and Backup integrations' standard entity names.
import { VBase, vico } from './base.js';
import { vesc, vi } from './util.js';
import { normalizeTechConfig } from './config.js';

export class ThTechCard extends VBase {
  static normalize(c) { return normalizeTechConfig(c); }
  static getStubConfig() { return { power: [{ entity: 'switch.router', name: 'Router', icon: 'router', warning: 'Internettet afbrydes, mens routeren er slukket.' }] }; }
  build() {
    const pr = this._c.printers.length;
    this.$('g').innerHTML = `
      <div class="t s7" style="--acc:var(--emer)"><div class="hd"><span class="ic">${vi('plug', 15)}</span>Strøm til udstyr</div><div class="pw" id="pw"></div></div>
      <div class="t s5" style="animation-delay:80ms;--acc:var(--vio)"><div class="hd"><span class="ic">${vi('cpu', 15)}</span>Home Assistant<span class="r" id="upd"></span></div><div class="gauges" id="gau"></div></div>
      <div class="t s7" style="animation-delay:140ms;--acc:var(--emer)"><div class="hd"><span class="ic">${vi('plug', 15)}</span>Relæer</div><div class="rl" id="rl"></div></div>
      <div class="t s5" style="animation-delay:200ms;--acc:var(--rose,#ff94c9)">${pr ? `<div class="hd"><span class="ic">${vi('printer', 15)}</span>Printere · blæk</div><div class="inks" id="ink"></div>
        ` : ''}<div class="hd" style="margin:${pr ? '16px' : '0'} 0 10px"><span class="ic">${vi('backup', 15)}</span>Backup</div><div class="cells" id="bk" style="grid-template-columns:1fr 1fr"></div></div>`;
    this._pk = this._rk = null;
  }
  /** Turns a switch on/off; switching off something with a warning asks first. */
  toggle(e, warn, name) { const s = this.s(e), on = s?.state === 'on', go = () => this._h.callService(e.split('.')[0], on ? 'turn_off' : 'turn_on', { entity_id: e });
    if (warn && on) this.confirm(`Sluk ${vesc(name)}?`, vesc(warn), go, 'var(--coral)'); else go(); }
  /** The relays to show: switches of `relay_platform` (default Shelly), else the configured `relays` list. */
  relays() {
    const c = this._c, H = this._h, ENT = H.entities || {}, powerIds = c.power.map(p => p.entity);
    let relays = c.relay_platform ? Object.keys(H.states).filter(e => e.startsWith('switch.') && !powerIds.includes(e) && ENT[e]?.platform === c.relay_platform && !ENT[e]?.hidden && ENT[e]?.entity_category == null) : [];
    if (!relays.length) relays = c.relays.filter(e => this.s(e));
    return relays;
  }
  update() {
    const c = this._c;
    const pk = c.power.map(p => this.st(p.entity)).join();
    if (pk !== this._pk) { this._pk = pk; this.$('pw').innerHTML = c.power.length ? c.power.map(p => { const s = this.s(p.entity), on = s?.state === 'on';
      return `<button class="pb ${on ? 'on' : ''}" data-e="${vesc(p.entity)}" ${s ? '' : 'disabled'}><div class="ic">${vico(p.icon, 20)}</div><b>${vesc(this.nm(p))}</b><small>${!s ? 'Ikke fundet' : on ? 'Tændt' : 'Slukket'}</small></button>`; }).join('')
      : '<div style="font-size:12px;color:var(--mut)">Ingen kontakter sat op – tilføj <b>power</b> i kortets konfiguration.</div>';
      this.$('pw').querySelectorAll('.pb').forEach(b => b.onclick = () => { const p = c.power.find(x => x.entity === b.dataset.e); this.toggle(p.entity, p.warning, this.nm(p)); }); }
    const H = this._h, ENT = H.entities || {}, DEV = H.devices || {}, AR = H.areas || {};
    const relays = this.relays();
    const room = e => { const en = ENT[e] || {}, dv = DEV[en.device_id] || {}; return AR[en.area_id || dv.area_id]?.name || 'Intet rum'; };
    relays.sort((a, b) => room(a).localeCompare(room(b), 'da') || (this.s(a).attributes.friendly_name || '').localeCompare(this.s(b).attributes.friendly_name || '', 'da'));
    const rk = relays.map(e => e + this.st(e)).join();
    if (rk !== this._rk) { this._rk = rk; this.$('rl').innerHTML = relays.map(e => { const s = this.s(e); if (!s) return '';
      return `<div class="rr"><span>${vesc(s.attributes.friendly_name || e)}<br><small>${vesc(room(e))}</small></span><button class="sw ${s.state === 'on' ? 'on' : ''}" data-e="${e}" aria-label="${vesc(s.attributes.friendly_name)}"></button></div>`; }).join('');
      this.$('rl').querySelectorAll('.sw').forEach(b => b.onclick = () => { b.classList.toggle('on'); this.toggle(b.dataset.e); }); }
    // system
    const g = (v, max, lbl, unit, col) => { const C = 2 * Math.PI * 40 * .75, f = Math.max(0, Math.min(1, (v || 0) / max));
      return `<div class="ga"><svg viewBox="0 0 100 86"><circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${C} 999" transform="rotate(135 50 50)"/>
        <circle cx="50" cy="50" r="40" fill="none" stroke="${col}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${C * f} 999" transform="rotate(135 50 50)" style="transition:stroke-dasharray 1.4s cubic-bezier(.16,1,.3,1);filter:drop-shadow(0 0 6px ${col})"/></svg>
        <div class="v">${Number.isFinite(v) ? Math.round(v) : '–'}<span style="font-size:11px;color:var(--mut)">${unit}</span></div><small>${lbl}</small></div>`; };
    const cpu = this.n(c.ent.cpu), ram = this.n(c.ent.memory), tmp = this.n(c.ent.cpu_temperature);
    this.set('gau', g(cpu, 100, 'CPU', '%', '#b7a4ff') + g(ram, 100, 'Hukommelse', '%', '#8ed1ff') + g(tmp, 90, 'Temperatur', '°', tmp > 70 ? '#ff6b7d' : '#6be3a8'));
    const ups = Object.keys(this._h.states).filter(k => k.startsWith('update.') && this._h.states[k].state === 'on');
    this.set('upd', ups.length ? `<span class="chip" style="--c:var(--gold)"><i></i>${ups.length} opdatering${ups.length > 1 ? 'er' : ''}</span>` : `<span class="chip"><i></i>Alt opdateret</span>`);
    // ink
    const COL = { black: ['Sort', '#d9dde3'], cyan: ['Cyan', '#22d3ee'], magenta: ['Magenta', '#e879f9'], yellow: ['Gul', '#facc15'] };
    if (c.printers.length) this.set('ink', c.printers.map(({ name, prefix }) => `<div class="prn"><div class="n"><span>${vesc(name)}</span></div><div class="tanks">${Object.entries(COL).map(([k, [l, col]]) => { const v = this.n(`sensor.${prefix}${k}_ink`);
      return `<div class="tk ${v < 10 ? 'low' : ''}"><div class="tb"><i style="height:${Math.max(3, v || 0)}%;background:${col}"></i></div><b>${Number.isFinite(v) ? Math.round(v) + '%' : '–'}</b>${l}</div>`; }).join('')}</div></div>`).join(''));
    const last = this.s(c.ent.backup_last), next = this.s(c.ent.backup_next);
    const fmt = s => s && !['unknown', 'unavailable'].includes(s.state) ? new Date(s.state).toLocaleString('da-DK', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '–';
    const ok = last && Date.now() - new Date(last.state) < 2 * 864e5;
    this.set('bk', `<div class="cell"><div class="k">${vi('check', 14)}Seneste</div><b style="font-size:15px;color:${ok ? 'var(--emer)' : 'var(--coral)'}">${fmt(last)}</b><em>${last ? this.ago(last.state) : ''}</em></div>
      <div class="cell"><div class="k">${vi('backup', 14)}Næste</div><b style="font-size:15px">${fmt(next)}</b><em>automatisk</em></div>`);
  }
}
