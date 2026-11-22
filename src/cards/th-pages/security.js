// th-security-card: alarm panel, lock, doors and warnings. Alarm, lock, doors, freezers and printers come from the
// config; the "no solar data" warning uses the Huawei Solar integration's standard PV sensor (shared helper).
import { VBase } from './base.js';
import { vn, vesc, vh2, vi } from './util.js';
import { normalizeSecurityConfig } from './config.js';

const NOTHING = '<div class="t s6"><div class="hd">Sikkerhed</div><div style="font-size:13px;color:var(--mut)">Tilføj <b>alarm</b>, <b>lock</b> og <b>doors</b> i kortets konfiguration.</div></div>';
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

export class ThSecurityCard extends VBase {
  static normalize(c) { return normalizeSecurityConfig(c); }
  static getStubConfig() { return { alarm: 'alarm_control_panel.home_alarm', lock: { entity: 'lock.front_door', name: 'Hoveddør' }, doors: [{ entity: 'binary_sensor.front_door', name: 'Hoveddør' }] }; }
  build() {
    const c = this._c, al = c.alarm, lk = c.lock;
    this.$('g').innerHTML = `${al ? `
      <div class="t${lk ? ' s8' : ''} alarm" id="alarm"><div class="sh" id="shi"></div><div style="min-width:0"><div class="hd" style="margin-bottom:6px">${al.name ? `${vesc(al.name)} alarm` : 'Alarm'}</div><div class="st" id="ast">–</div><div class="sub" id="asub"></div>
        <div class="arm" id="arm"><button data-a="disarm">Fra</button><button data-a="arm_home">Hjemme</button><button data-a="arm_away">Ude</button></div></div></div>` : ''}${lk ? `
      <div class="t${al ? ' s4' : ''} lockc" id="lockc" style="animation-delay:80ms"><div class="hd"><span class="ic">${vi('lock', 15)}</span>${vesc(lk.name)}</div><button class="lockbtn" id="lockb"></button><div class="st" id="lst">–</div><div class="sub" id="lsub"></div></div>` : ''}${c.doors.length ? `
      <div class="t s6" style="animation-delay:140ms;--acc:var(--emer)"><div class="hd"><span class="ic">${vi('door', 15)}</span>Døre<span class="r" id="dsum"></span></div><div class="drs" id="drs"></div></div>` : ''}${al || lk || c.doors.length ? '' : NOTHING}
      <div class="t${c.doors.length || !(al || lk) ? ' s6' : ''}" style="animation-delay:200ms;--acc:var(--coral)"><div class="hd"><span class="ic">${vi('alert', 15)}</span>Advarsler</div><div class="alerts" id="als"></div></div>`;
    if (al) this.$('arm').querySelectorAll('button').forEach(b => b.onclick = () => this.armPad(b.dataset.a));
    if (lk) this.$('lockb').onclick = () => this.lockPad();
  }
  /** Opens the code pad for an alarm action (disarm / arm_home / arm_away). */
  armPad(a) { const L = { disarm: 'Slå alarmen fra', arm_home: 'Slå til · hjemme', arm_away: 'Slå til · ude' };
    this.keypad(L[a], a === 'disarm' ? 'var(--coral)' : 'var(--emer)', code => this._h.callService('alarm_control_panel', 'alarm_' + a, { entity_id: this._c.alarm.entity, ...(code ? { code } : {}) })); }
  /** Opens the code pad to lock or unlock the configured lock. */
  lockPad() { const k = this._c.lock, lk = this.st(k.entity) === 'locked', act = lk ? 'unlock' : 'lock', d = vesc(k.definite);
    this.keypad(lk ? `Lås ${d} op` : `Lås ${d}`, lk ? 'var(--coral)' : 'var(--emer)', code => this._h.callService('lock', act, { entity_id: k.entity, ...(code ? { code } : {}) })); }
  update() {
    const c = this._c;
    const al = c.alarm ? this.st(c.alarm.entity) || 'unknown' : null;
    if (c.alarm) {
      const A = { disarmed: ['Alarmen er slået fra', 'var(--ice)'], armed_home: ['Til · hjemme', 'var(--emer)'], armed_away: ['Til · ude', 'var(--emer)'], armed_night: ['Til · nat', 'var(--emer)'],
        arming: ['Slår til…', 'var(--amber)'], pending: ['Venter…', 'var(--amber)'], triggered: ['ALARMEN ER UDLØST', 'var(--red)'] }[al] || [al, 'var(--mut)'];
      const box = this.$('alarm'); box.style.setProperty('--c', A[1]); box.classList.toggle('trig', al === 'triggered');
      this.set('shi', vi(al === 'disarmed' ? 'shieldOff' : 'shield', 46, 1.4)); this.set('ast', A[0]);
      this.set('asub', `${al === 'disarmed' ? 'Tryk Hjemme eller Ude for at slå til' : 'Huset er beskyttet'} · ændret ${this.ago(this.s(c.alarm.entity)?.last_changed)}`);
      this.$('arm').querySelectorAll('button').forEach(b => b.classList.toggle('on', ({ disarm: 'disarmed', arm_home: 'armed_home', arm_away: 'armed_away' })[b.dataset.a] === al));
    }
    const lk = c.lock ? this.st(c.lock.entity) : undefined;
    if (c.lock) {
      const L = { locked: ['Låst', 'var(--emer)'], unlocked: ['Ulåst', 'var(--coral)'], locking: ['Låser…', 'var(--amber)'], unlocking: ['Låser op…', 'var(--amber)'], jammed: ['Fastklemt!', 'var(--red)'] }[lk] || [lk || '–', 'var(--mut)'];
      this.$('lockc').style.setProperty('--c', L[1]); this.set('lockb', vi(lk === 'locked' ? 'lock' : 'unlock', 44, 1.4)); this.set('lst', L[0]); this.set('lsub', `Tryk for at ${lk === 'locked' ? 'låse op' : 'låse'} · ${this.ago(this.s(c.lock.entity)?.last_changed)}`);
    }
    // doors
    if (c.doors.length) {
      let open = 0;
      this.set('drs', c.doors.map(ref => { const s = this.s(ref.entity), o = s?.state === 'on'; if (o) open++; const mins = s ? (Date.now() - new Date(s.last_changed)) / 6e4 : 0;
        return `<div class="dr ${o ? 'open' : ''} ${o && mins > 30 ? 'long' : ''}"><div class="ic">${vi('door', 18)}</div><div><b>${vesc(this.nm(ref))}</b><small>${o ? 'Åben siden ' + vh2(new Date(s.last_changed)) : 'Lukket · ' + (s ? this.ago(s.last_changed) : '–')}</small></div><span class="s">${o ? 'Åben' : 'Lukket'}</span></div>`; }).join(''));
      this.set('dsum', open ? `<span class="chip" style="--c:var(--coral)"><i></i>${open} åben</span>` : `<span class="chip"><i></i>Alle lukket</span>`);
    }
    // warnings
    const list = [];
    if (al === 'triggered') list.push(['Alarmen er udløst!', 'Kontrollér huset nu', 'var(--red)']);
    c.doors.forEach(ref => { const s = this.s(ref.entity); if (s?.state === 'on' && Date.now() - new Date(s.last_changed) > 6e5) list.push([`${this.nm(ref)} står åben`, `Åben siden ${vh2(new Date(s.last_changed))}`, 'var(--coral)']); });
    if (lk === 'unlocked' && Date.now() - new Date(this.s(c.lock.entity).last_changed) > 9e5) list.push([`${cap(c.lock.definite)} er ikke låst`, `Ulåst siden ${vh2(new Date(this.s(c.lock.entity).last_changed))}`, 'var(--amber)']);
    for (const f of c.freezers) { const fz = this.n(f.entity); if (fz > f.max) list.push([`${f.name} er for varm`, `${vn(fz, 1)} °C`, 'var(--red)']); }
    for (const p of c.printers) { const re = new RegExp(`^sensor\\.${reEsc(p.prefix)}.*_ink$`);
      Object.keys(this._h.states).filter(k => re.test(k)).forEach(k => { const v = this.n(k); if (v < 5) list.push([`Printer ${p.name}: blæk snart tomt`, `${this._h.states[k].attributes.friendly_name}: ${v} %`, 'var(--vio)']); }); }
    if (c.ent.pv && this.st(c.ent.pv) === 'unavailable') list.push(['Ingen data fra solcellerne', 'Huawei‑integrationen svarer ikke', 'var(--amber)']);
    this.set('als', list.length ? list.map(([t, s, col]) => `<div class="al" style="--c:${col}">${vi('alert', 18)}<div><b>${vesc(t)}</b><small>${vesc(s)}</small></div></div>`).join('') : `<div class="calm">${vi('check', 20)}Alt er roligt – ingen advarsler lige nu</div>`);
  }
}
