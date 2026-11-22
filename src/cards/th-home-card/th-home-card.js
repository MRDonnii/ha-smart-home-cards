/* TH Home – forside: status, rum, sikkerhed, lys og temperaturer
 * type: custom:th-home-card (also defines th-home-sheet, the pop-up sheet)
 * Everything household-specific (alarm, lock, doors, rooms, lights, prices, sensors) comes from the card config;
 * see README.md. Huawei Solar values default to the integration's standard entity names.
 */
import { HCSS, HSHEET } from './styles.js';
import { hnum, hesc, HI, hi } from './icons.js';
import { normalizeConfig, stubConfig } from './config.js';

const VH_VERSION = '3.0.0';

/** A line icon from the card's own set, or an mdi icon (e.g. "mdi:sofa") through <ha-icon>. */
const ico = (k, s = 18, sw = 1.6) => (!HI[k] && typeof k === 'string' && k.includes(':')
  ? `<ha-icon icon="${hesc(k)}" style="--mdc-icon-size:${s}px;width:${s}px;height:${s}px;display:block;flex:none"></ha-icon>` : hi(k, s, sw));

// Extra layout rule used only when no price is configured: the climate and security tiles fill the price tile's row.
const NO_PRICE_CSS = '<style>@media(min-width:1101px){.klima,.sik{grid-column:span 2}}</style>';
const EMPTY_ROOMS = '<div style="font-size:12px;color:var(--mut);padding:8px 2px">Ingen rum sat op – tilføj <b>rooms</b> i kortets konfiguration.</div>';

class ThHomeCard extends HTMLElement {
  static getStubConfig() { return stubConfig(); }
  setConfig(c) {
    this.cfg = { ...(c || {}) };
    this._c = normalizeConfig(this.cfg);
    if (this._r) { this._render(); this._update(); }
  }
  getCardSize() { return 8; }
  /** Latitude for the sun arc: config `latitude`, else Home Assistant's home location, else 50°. */
  _latitude() {
    const lat = this._c?.latitude ?? Number(this._h?.config?.latitude);
    return Number.isFinite(lat) ? lat : 50;
  }

  set hass(h) {
    this._h = h; if (!this._c) this._c = normalizeConfig({}); if (!this._r) this._build();
    const t = Date.now();
    if (!this._t || t - this._t > 700) { this._t = t; this._update(); } else if (!this._q) this._q = setTimeout(() => { this._q = null; this._t = Date.now(); this._update(); }, 700);
    if (this._sheet) this._sheet.hass = h;
    if (!this._ht || t - this._ht > 5 * 60e3) { this._ht = t; this._hist(); }
  }
  disconnectedCallback() { clearTimeout(this._q); this._q = null; }
  s(e) { return e ? this._h && this._h.states[e] : undefined; }
  n(e) { const s = this.s(e), v = s ? parseFloat(s.state) : NaN; return Number.isFinite(v) ? v : NaN; }
  on(e) { const s = this.s(e); return !!s && s.state === 'on'; }
  /** Display name of a configured { entity, name }: the configured name, else the entity's friendly name. */
  nm(ref) { return ref.name || this.s(ref.entity)?.attributes?.friendly_name || ref.entity; }
  $(id) { return this._r.getElementById(id); }
  set(id, h) { const e = this.$(id); if (e && e._v !== h) { e.innerHTML = h; e._v = h; } }
  toggle(e) { const d = e.split('.')[0]; this._h.callService(d === 'switch' ? 'switch' : 'light', 'toggle', { entity_id: e }); }
  nav(p) { history.pushState(null, '', p); window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } })); }
  count(id, val, fmt, unit) { const e = this.$(id); if (!e) return; this._cv = this._cv || {}; const from = this._cv[id] ?? 0; this._cv[id] = val; const t0 = performance.now(), u = unit ? `<small>${unit}</small>` : '';
    if (Math.abs(from - val) < 1e-9) { e.innerHTML = fmt(val) + u; return; }
    const st = t => { const p = Math.min(1, (t - t0) / 1200), k = 1 - Math.pow(1 - p, 4); e.innerHTML = fmt(from + (val - from) * k) + u; if (p < 1) requestAnimationFrame(st); }; requestAnimationFrame(st); }

  _build() {
    this._r = this.attachShadow({ mode: 'open' }); this._rtab = 'in';
    this._render();
  }

  _render() {
    const cf = this._c, pr = cf.price, C = 2 * Math.PI * 62;
    this._ck = this._pk = this._compK = this._rk = null; this._cv = {};
    this._r.innerHTML = `<style>${HCSS}</style>${pr ? '' : NO_PRICE_CSS}<div class="bento">
      <div class="t sol" id="tSol" role="button" tabindex="0"${cf.ent.pv ? '' : ' style="display:none"'}>
        <div class="ring"><svg viewBox="0 0 150 150">
          <defs><linearGradient id="gw" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".6"/></linearGradient>
            <linearGradient id="gpv" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0c9"/><stop offset="1" stop-color="#d9a54e"/></linearGradient></defs>
          <circle cx="75" cy="75" r="72" fill="none" stroke="rgba(244,241,234,.06)" stroke-width="2"/>
          <circle id="pvArc" class="seg" cx="75" cy="75" r="72" fill="none" stroke="url(#gpv)" stroke-width="2" stroke-linecap="round" stroke-dasharray="0 999" transform="rotate(-90 75 75)"/>
          <circle cx="75" cy="75" r="62" fill="none" stroke="rgba(244,241,234,.06)" stroke-width="9"/>
          <g transform="rotate(-90 75 75)">
            <circle id="aS" class="seg" cx="75" cy="75" r="62" fill="none" stroke="var(--gold)" stroke-width="9" stroke-linecap="round" stroke-dasharray="0 ${C}"/>
            <circle id="aB" class="seg" cx="75" cy="75" r="62" fill="none" stroke="var(--emer)" stroke-width="9" stroke-linecap="round" stroke-dasharray="0 ${C}"/>
            <circle id="aG" class="seg" cx="75" cy="75" r="62" fill="none" stroke="var(--vio)" stroke-width="9" stroke-linecap="round" stroke-dasharray="0 ${C}"/></g>
          <circle class="sw8" cx="75" cy="75" r="62" fill="none" stroke="url(#gw)" stroke-width="9" stroke-dasharray="30 400" stroke-linecap="round" opacity=".35"/>
        </svg><div class="c"><div><div class="big" id="selfPct">–</div><small>FRA SOLEN</small></div></div></div>
        <div class="stats">
          <div class="stat"><div class="k"><i style="background:var(--gold)"></i>Sol nu</div><div class="big" id="sPv">–</div><div class="mbar"><b id="bPv" style="background:var(--gold)"></b></div></div>
          <div class="stat"><div class="k"><i style="background:var(--ice)"></i>Huset bruger</div><div class="big" id="sLoad">–</div><div class="mbar"><b id="bLoad" style="background:var(--ice)"></b></div></div>
          <div class="stat"><div class="k"><i style="background:var(--emer)"></i>Batteri</div><div class="big" id="sBat">–</div><div class="mbar"><b id="bBat" style="background:var(--emer)"></b></div></div>
          <div class="stat"><div class="k"><i style="background:var(--vio)" id="gDot"></i><span id="gLbl">Elnet</span></div><div class="big" id="sGrid">–</div><div class="sub" id="sPrice" style="margin-top:6px">–</div></div>
        </div>
        <div class="curve" id="cv"><div class="lbl">Solen i dag</div><div class="say" id="say"></div><div class="plot" id="plot"><svg viewBox="0 0 1000 100" preserveAspectRatio="none" id="curve"></svg><div id="cov"></div><div class="cx" id="cx"></div><div class="ctip" id="ctip"></div></div><div class="cstats" id="cstats"></div></div>
      </div>
      <div class="t pris" id="tPris" style="animation-delay:90ms${pr ? '' : ';display:none'}">
        <div class="hd"><span class="ic">${hi('bolt', 15)}</span>Elpris${pr && pr.title ? ` · ${hesc(pr.title)}` : ''}<div class="tabs ptabs" id="pstyle" style="margin-right:6px"><button data-s="line" title="Linje" aria-label="Linje">${hi('chartL', 14)}</button><button data-s="bar" title="Søjler" aria-label="Søjler">${hi('chartB', 14)}</button></div><div class="tabs" id="ptabs"><button data-m="24" class="on">24 t</button><button data-m="48">48 t</button><button data-m="7">7 dage</button></div></div>
        <div class="pt"><div><div class="pchip" id="pchip"><i></i>–</div><div class="big" id="pNow">–</div></div><div class="comp"><div class="bar" id="pbar"></div><div class="lg" id="plg"></div></div></div>
        <div class="pchart" id="pchart"><svg id="psvg" preserveAspectRatio="none"></svg><div id="pov"></div><div class="ptip" id="ptip"></div></div>
        <div class="days" id="days"></div></div>
      <div class="t klima" id="tKl" role="button" tabindex="0" style="animation-delay:150ms">
        <div class="hd"><span class="ic">${hi('temp', 15)}</span>Klima<span class="more">${hi('chev', 13)}</span></div>
        <div class="big" id="klBig">–</div><div class="sub">${hesc(cf.climate.label)}</div><div class="kl" id="kl"></div><div class="frz" id="frz"></div></div>
      <div class="t sik" id="tSik" role="button" tabindex="0" style="animation-delay:210ms">
        <div class="hd"><span class="ic">${hi('lock', 15)}</span>Sikkerhed<span class="more">${hi('chev', 13)}</span></div>
        <div class="row"><div class="shield" id="shield"></div><div style="min-width:0"><b id="sikBig">–</b><small id="sikSub"></small></div></div><div class="dl" id="dl"></div></div>
      <div class="t rum" style="animation-delay:270ms">
        <div class="hd"><span class="ic">${hi('home', 15)}</span>Rummene<span class="more" id="allLights" style="margin-left:14px">${hi('bulb', 13)} Alle lys</span><div class="tabs" id="rtabs"><button data-t="in" class="${this._rtab === 'in' ? 'on' : ''}">Inde</button><button data-t="out"${this._rtab === 'out' ? ' class="on"' : ''}>Ude</button></div></div>
        <div class="rlist" id="rlist"></div></div>
    </div>`;
    this.$('tSol').onclick = () => { if (this._c.energy) this.nav(this._c.energy); };
    this.$('allLights').onclick = () => this.open('lights'); this._pm = '24';
    try { this._ps = localStorage.getItem('th-price-style-fil') || 'line'; } catch (e) { this._ps = 'line'; }
    const syncPs = () => this._r.querySelectorAll('#pstyle button').forEach(x => x.classList.toggle('on', x.dataset.s === this._ps)); syncPs();
    this._r.querySelectorAll('#pstyle button').forEach(b => b.onclick = e => { e.stopPropagation(); this._ps = b.dataset.s; try { localStorage.setItem('th-price-style-fil', this._ps); } catch (er) {} syncPs(); this._pk = null; this._update(); });
    this._r.querySelectorAll('#ptabs button').forEach(b => b.onclick = e => { e.stopPropagation(); this._pm = b.dataset.m; this._r.querySelectorAll('#ptabs button').forEach(x => x.classList.toggle('on', x === b)); this._pk = null; this._update(); });
    this.$('tKl').onclick = () => this.open('temps'); this.$('tSik').onclick = () => this.open('alarm');
    this._r.querySelectorAll('#rtabs button').forEach(b => b.onclick = e => { e.stopPropagation(); this._rtab = b.dataset.t; this._r.querySelectorAll('#rtabs button').forEach(x => x.classList.toggle('on', x === b)); this._rk = null; this._update(); });
  }

  async _hist() {
    const { pv, load } = this._c.ent; if (!pv) return;
    try { const t0 = new Date(); t0.setHours(0, 0, 0, 0);
      const r = await this._h.callWS({ type: 'history/history_during_period', start_time: t0.toISOString(), entity_ids: [pv, load].filter(Boolean), minimal_response: true, no_attributes: true });
      const m = a => (a || []).map(p => [(p.lu || p.lc) * 1000, parseFloat(p.s)]).filter(p => Number.isFinite(p[1]));
      this._pvh = m(r[pv]); this._ldh = m(load && r[load]); this._ck = null; this._update();
    } catch (e) { /* historik er valgfri */ }
  }

  _update() {
    if (!this._h || !this._r) return;
    const cf = this._c;
    // ---- SOL
    if (cf.ent.pv) this._solar();
    // ---- PRIS
    if (cf.price) this._price();
    // ---- KLIMA
    const cl = cf.climate;
    this.set('klBig', cl.entity ? `${hnum(this.n(cl.entity))}°` : '–');
    this.set('kl', cl.sensors.map(ref => { const v = this.n(ref.entity), c = v < 10 ? 'var(--ice)' : v < 18 ? '#9fd8c4' : v < 24 ? 'var(--emer)' : 'var(--coral)';
      return `<div><span>${hesc(this.nm(ref))}</span><b>${hnum(v)}°</b><i><em style="width:${Math.max(4, Math.min(100, (v + 5) / 35 * 100))}%;background:${c}"></em></i></div>`; }).join(''));
    const fz = this.$('frz');
    if (cf.freezer) { const frz = this.n(cf.freezer.entity), ok = !Number.isFinite(frz) || frz <= cf.freezer.max; fz.classList.toggle('bad', !ok);
      this.set('frz', `${hi('snow', 12, 2)}${hesc(cf.freezer.name)} ${Number.isFinite(frz) ? hnum(frz) + '°' : '–'} · ${ok ? 'OK' : 'for varm'}`); }
    else fz.style.display = 'none';
    // ---- SIKKERHED
    const al = cf.alarm ? this.s(cf.alarm.entity)?.state || 'unknown' : null, lk = cf.lock ? this.s(cf.lock.entity)?.state || 'unknown' : null, open = cf.doors.filter(d => this.on(d.entity));
    const AL = al === null ? '–' : { disarmed: 'Alarm fra', armed_home: 'Til · hjemme', armed_away: 'Til · ude', armed_night: 'Til · nat', arming: 'Slår til…', pending: 'Venter…', triggered: 'ALARM!' }[al] || al;
    const sk = this.$('tSik'); sk.classList.toggle('alarm', al === 'triggered'); sk.classList.toggle('warn', al !== 'triggered' && ((lk !== null && lk !== 'locked') || open.length > 0));
    this.set('sikBig', AL); this.set('sikSub', lk === null ? '' : `${hesc(cf.lock.name)} ${lk === 'locked' ? 'låst' : 'ulåst'}`); this.set('shield', hi(al === 'disarmed' ? 'shieldOff' : 'shield', 20, 1.6));
    this.set('dl', cf.doors.map(d => `<span class="${this.on(d.entity) ? 'o' : ''}"><i></i>${hesc(this.nm(d))}</span>`).join(''));
    // ---- RUM
    const rooms = cf.rooms.filter(r => r.out === (this._rtab === 'out'));
    const rk = this._rtab + rooms.map(r => [r.temp && this.s(r.temp)?.state, r.door && this.s(r.door)?.state, ...r.lights.map(l => this.s(l.entity)?.state)].join()).join('|');
    if (rk !== this._rk) { this._rk = rk;
      this.$('rlist').innerHTML = !cf.rooms.length ? EMPTY_ROOMS : rooms.map(r => { const ls = r.lights.filter(l => this.s(l.entity)), lit = ls.filter(l => this.on(l.entity)).length, t = r.temp ? this.n(r.temp) : NaN, door = r.door && this.on(r.door);
        return `<button class="rc ${lit ? 'lit' : ''}" data-r="${hesc(r.id)}"><i>${ico(r.icon, 17)}</i><span><b>${hesc(r.name)}</b><small>${Number.isFinite(t) ? hnum(t) + '°' : '—'}${lit ? ` · ${lit} lys` : ''}</small></span>${door ? '<span class="d" title="Dør åben"></span>' : ''}</button>`; }).join('');
      this.$('rlist').querySelectorAll('.rc').forEach(b => b.onclick = () => this.open('room', { room: this._c.rooms.find(x => x.id === b.dataset.r) })); }
  }

  _solar() {
    const cf = this._c, ent = cf.ent, pc = cf.price;
    const E = k => this.n(k), pv = E(ent.pv), load = E(ent.load), inv = E(ent.inverter_power), bat = E(ent.battery_power);
    const soc = E(ent.battery_soc), day = E(ent.pv_today), pr = pc ? (Number.isFinite(E(pc.current)) ? E(pc.current) : E(pc.fallback)) : NaN, off = !Number.isFinite(pv);
    const grid = (load || 0) - (inv || 0), fromBat = Math.max(0, -(bat || 0)), fromGrid = Math.max(0, grid), fromSun = Math.max(0, (load || 0) - fromBat - fromGrid), L = Math.max(load || 0, 1);
    const C = 2 * Math.PI * 62; let o = 0;
    for (const [id, v] of [['aS', fromSun], ['aB', fromBat], ['aG', fromGrid]]) { const len = off ? 0 : Math.max(0, v / L * C - 5); const el = this.$(id); el.setAttribute('stroke-dasharray', `${len} ${C}`); el.setAttribute('stroke-dashoffset', -o); o += v / L * C; }
    const Cp = 2 * Math.PI * 72; this.$('pvArc').setAttribute('stroke-dasharray', `${Math.min(1, (pv || 0) / 10000) * Cp} ${Cp}`);
    this.count('selfPct', off ? 0 : Math.round(fromSun / L * 100), v => off ? '–' : Math.round(v), off ? '' : '%');
    const kw = w => Math.abs(w) >= 1000 ? [hnum(Math.abs(w) / 1000, 2), 'kW'] : [String(Math.round(Math.abs(w))), 'W'];
    this.count('sPv', pv || 0, v => kw(v)[0], kw(pv || 0)[1]); this.$('bPv').style.width = Math.min(100, (pv || 0) / 100) + '%';
    this.count('sLoad', load || 0, v => kw(v)[0], kw(load || 0)[1]); this.$('bLoad').style.width = Math.min(100, (load || 0) / 110) + '%';
    this.count('sBat', soc || 0, v => Math.round(v), '%'); this.$('bBat').style.width = (soc || 0) + '%';
    const imp = grid > 25, exp = grid < -25;
    this.count('sGrid', Math.abs(grid), v => kw(v)[0], kw(grid)[1]); this.set('gLbl', imp ? 'Køber' : exp ? 'Sælger' : 'Elnet');
    this.$('gDot').style.background = exp ? 'var(--coral)' : 'var(--vio)'; this.set('sPrice', pc ? `${hnum(pr, 2)} kr/kWh` : '');
    // kurve
    const sun = this.s('sun.sun'), el = sun ? sun.attributes.elevation : 0;
    this.set('say', off ? 'Ingen forbindelse' : pv > 50 ? `<b>${hnum(day, 1)} kWh</b> produceret i dag` : el > 0 ? `<b>${hnum(day, 1)} kWh</b> i dag · lav sol` : `<b>${hnum(day, 1)} kWh</b> i dag · solen er nede`);
    const ck = (this._pvh || []).length + '|' + Math.round(Date.now() / 6e4) + '|' + Math.round(day * 10);
    if (ck !== this._ck) { this._ck = ck; this._sunCurve(sun, day); }
  }

  _sunCurve(sun, day) {
    const now = new Date(), h2 = d => `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
    let rise = sun ? new Date(sun.attributes.next_rising) : null, set = sun ? new Date(sun.attributes.next_setting) : null;
    if (rise && set) { if (rise > set) rise = new Date(rise - 864e5); if (rise.getDate() !== now.getDate()) rise = new Date(rise - 864e5); if (set.getDate() !== now.getDate()) set = new Date(set - 864e5); }
    if (!rise) { rise = new Date(now); rise.setHours(7, 0, 0, 0); set = new Date(now); set.setHours(18, 0, 0, 0); }
    const t0 = rise.getTime() - 54e5, t1 = set.getTime() + 54e5, W = 1000, H = 100, X = t => (t - t0) / (t1 - t0) * W;
    // 5-minute buckets for solar and consumption
    const B = Math.ceil((t1 - t0) / 3e5), bin = arr => { const o = new Array(B).fill(null), n = new Array(B).fill(0); let last = null;
      for (const [t, v] of arr || []) { const i = Math.floor((t - t0) / 3e5); if (i < 0) { last = v; continue; } if (i < B) { o[i] = (o[i] || 0) + v; n[i]++; } }
      const lim = Math.min(B, Math.ceil((now - t0) / 3e5)); for (let i = 0; i < B; i++) { if (i >= lim) { o[i] = null; continue; } if (n[i]) { o[i] /= n[i]; last = o[i]; } else o[i] = last; } return o; };
    const pv = bin(this._pvh), ld = bin(this._ldh), mx = Math.max(2500, ...pv.filter(v => v != null), ...ld.filter(v => v != null).map(v => Math.min(v, 12000))) * 1.12;
    const Y = v => H - (v / mx) * (H - 4), XB = i => X(t0 + (i + .5) * 3e5);
    const seg = arr => { const out = []; let c = []; arr.forEach((v, i) => { if (v == null) { if (c.length) out.push(c); c = []; } else c.push([XB(i), Y(v)]); }); if (c.length) out.push(c); return out; };
    const sm = pts => { let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`; for (let i = 0; i < pts.length - 1; i++) { const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`; } return d; };
    const area = pts => `${sm(pts)}L${pts[pts.length - 1][0]} ${H}L${pts[0][0]} ${H}Z`;
    // sun arc
    const N = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5), noon = 90 - this._latitude() + 23.44 * Math.sin(2 * Math.PI * (284 + N) / 365), arcTop = H - Math.min(1, noon / 55) * 92;
    const AX = f => X(rise.getTime() + f * (set - rise)), AY = f => H - Math.sin(f * Math.PI) * (H - arcTop);
    let arc = '', done = ''; const fr = Math.max(0, Math.min(1, (now - rise) / (set - rise)));
    for (let i = 0; i <= 60; i++) arc += (i ? 'L' : 'M') + AX(i / 60).toFixed(1) + ' ' + AY(i / 60).toFixed(1);
    for (let i = 0; i <= Math.round(fr * 60); i++) done += (i ? 'L' : 'M') + AX(i / 60).toFixed(1) + ' ' + AY(i / 60).toFixed(1);
    let g = `<defs><linearGradient id="gcA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8c37e" stop-opacity=".22"/><stop offset="1" stop-color="#e8c37e" stop-opacity="0"/></linearGradient>
      <linearGradient id="gcS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3d79e" stop-opacity=".7"/><stop offset="1" stop-color="#e8c37e" stop-opacity=".12"/></linearGradient></defs>
      <line x1="0" x2="${W}" y1="${H}" y2="${H}" stroke="rgba(244,241,234,.14)" vector-effect="non-scaling-stroke"/>
      <path d="${arc}" fill="none" stroke="rgba(244,241,234,.16)" stroke-dasharray="2 6" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
      <path d="${done}" fill="none" stroke="rgba(232,195,126,.55)" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`;
    const self = pv.map((v, i) => v == null || ld[i] == null ? null : Math.min(v, ld[i]));
    for (const s of seg(pv)) if (s.length > 1) g += `<path d="${area(s)}" fill="url(#gcA)" class="fadein"/>`;
    for (const s of seg(self)) if (s.length > 1) g += `<path d="${area(s)}" fill="url(#gcS)" class="fadein"/>`;
    for (const s of seg(ld.map(v => v == null ? null : Math.min(v, mx)))) if (s.length > 1) g += `<path d="${sm(s)}" fill="none" stroke="var(--ice)" stroke-width="1.1" stroke-dasharray="3 3" opacity=".7" vector-effect="non-scaling-stroke" class="fadein"/>`;
    for (const s of seg(pv)) if (s.length > 1) g += `<path d="${sm(s)}" fill="none" stroke="var(--gold)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" class="draw"/>`;
    this.$('curve').innerHTML = g;
    // overlay: sun/moon, peak, times
    const up = now >= rise && now <= set; let ov = '';
    ov += up ? `<div class="sunm" style="left:${AX(fr) / W * 100}%;top:${AY(fr)}%"></div>` : `<div class="sunm moon" style="left:${(now < rise ? 2 : 98)}%;top:${H - 6}%"></div>`;
    let pk = -1; pv.forEach((v, i) => { if (v != null && (pk < 0 || v > pv[pk])) pk = i; });
    if (pk >= 0 && pv[pk] > 300) ov += `<div class="peak" style="left:${XB(pk) / W * 100}%;top:${Y(pv[pk])}%">${hnum(pv[pk] / 1000, 1)} kW · ${h2(new Date(t0 + pk * 3e5))}</div>`;
    ov += `<div class="tl" style="left:${X(rise.getTime()) / W * 100}%">↑ ${h2(rise)}</div><div class="tl" style="left:${X(set.getTime()) / W * 100}%">↓ ${h2(set)}</div>`;
    for (const hh of [9, 12, 15]) { const d = new Date(now); d.setHours(hh, 0, 0, 0); const x = X(d.getTime()) / W * 100; if (x > 12 && x < 88) ov += `<div class="tl" style="left:${x}%;opacity:.7">${hh}.00</div>`; }
    this.$('cov').innerHTML = ov;
    // key figures
    const ent = this._c.ent, exp = this.n(ent.feed_in_today), selfPct = day > 0 ? Math.round(Math.max(0, day - (exp || 0)) / day * 100) : 0, sunH = this.n(ent.sunshine_hours);
    const left = (set - now) / 36e5;
    this.set('cstats', `<span><i style="background:var(--gold)"></i>Produceret <b>${hnum(day, 1)} kWh</b></span><span><i style="background:#f3d79e"></i>Brugt selv <b>${selfPct} %</b></span>`
      + `<span><i style="background:var(--ice)"></i>Forbrug</span>${Number.isFinite(sunH) ? `<span>Solskin <b>${hnum(sunH, 1)} t</b></span>` : ''}${up && left > 0 ? `<span>Ned om <b>${Math.floor(left)} t ${String(Math.round(left % 1 * 60)).padStart(2, '0')} m</b></span>` : ''}`);
    // drag for details
    const plot = this.$('plot'), tip = this.$('ctip'), cx = this.$('cx');
    plot.onpointermove = plot.onpointerdown = e => { const b = plot.getBoundingClientRect(), f = (e.clientX - b.left) / b.width, i = Math.max(0, Math.min(B - 1, Math.floor(f * (t1 - t0) / 3e5)));
      if (pv[i] == null) { tip.style.opacity = cx.style.opacity = 0; return; }
      cx.style.left = (XB(i) / W * 100) + '%'; cx.style.opacity = 1;
      tip.innerHTML = `<b>${h2(new Date(t0 + i * 3e5))}</b><br><span style="color:var(--gold)">Sol ${hnum(pv[i] / 1000, 2)} kW</span><br><span style="color:var(--ice)">Forbrug ${hnum((ld[i] || 0) / 1000, 2)} kW</span>`;
      tip.style.left = Math.max(55, Math.min(b.width - 55, e.clientX - b.left)) + 'px'; tip.style.top = (Y(pv[i]) / H * b.height) + 'px'; tip.style.opacity = 1; };
    plot.onpointerleave = () => { tip.style.opacity = 0; cx.style.opacity = 0; };
  }

  _price() {
    const pc = this._c.price;
    const A = (e, k) => { const s = this.s(e); return s ? s.attributes[k] : undefined; };
    const cur = this.n(pc.current), mean = this.n(pc.mean);
    const rel = mean ? cur / mean : 1, ch = this.$('pchip'), col = rel < .9 ? 'var(--emer)' : rel > 1.1 ? 'var(--coral)' : 'var(--gold)';
    ch.style.setProperty('--c', col); this.set('pchip', `<i></i>${rel < .9 ? 'Billig nu' : rel > 1.1 ? 'Dyr nu' : 'Normal pris'} · ${rel >= 1 ? '+' : '−'}${Math.abs(Math.round((rel - 1) * 100))} % ift. snit`);
    this.set('pNow', `${hnum(cur, 2)}<small>kr/kWh</small>`);
    const parts = pc.components.map(({ name, entity, color }) => [hesc(name), this.n(entity), color]).filter(x => Number.isFinite(x[1]) && x[1] > 0);
    const sum = parts.reduce((a, b) => a + b[1], 0) || 1, ck = parts.map(x => x[1].toFixed(3)).join();
    if (ck !== this._compK) { this._compK = ck;
      this.$('pbar').innerHTML = parts.map(([n, v, c], i) => `<b title="${n} ${hnum(v, 2)} kr" style="width:${v / sum * 100}%;background:${c};animation-delay:${i * 80}ms"></b>`).join('');
      this.$('plg').innerHTML = parts.map(([n, v, c]) => `<span><i style="background:${c}"></i>${n} ${hnum(v, 2)}</span>`).join(''); }
    // prices: actual 15-minute slots for today/tomorrow, then the hourly forecast
    const act = [...(A(pc.current, 'prices') || []), ...(A(pc.tomorrow, 'prices') || [])]
      .map(p => ({ t: new Date(p.start).getTime(), e: new Date(p.end).getTime(), p: p.price, f: false }));
    const lastA = act.length ? act[act.length - 1].e : 0;
    const fc = (A(pc.forecast, 'prices') || []).map(p => ({ t: new Date(p.start).getTime(), e: new Date(p.end).getTime(), p: p.price, f: true })).filter(p => p.t >= lastA);
    const all = [...act, ...fc]; if (!all.length) return;
    const now = Date.now(), mode = this._pm || '24', t0 = now - (mode === '24' ? 2 : 3) * 36e5, t1 = mode === '24' ? now + 24 * 36e5 : mode === '48' ? now + 48 * 36e5 : Math.max(...all.map(p => p.e));
    const pk = (this._ps || 'line') + mode + all.length + '|' + Math.floor(now / 9e5) + (this.$('pchart').clientWidth > 0);
    if (pk === this._pk) return; this._pk = pk;
    let pts = all.filter(p => p.e > t0 && p.t < t1);
    if (mode === '7') { const hr = {}; for (const p of pts) { const h = Math.floor(p.t / 36e5); (hr[h] = hr[h] || { t: h * 36e5, e: h * 36e5 + 36e5, s: 0, n: 0, f: p.f }).s += p.p; hr[h].n++; hr[h].f = hr[h].f && p.f; }
      pts = Object.values(hr).map(h => ({ t: h.t, e: h.e, p: h.s / h.n, f: h.f })).sort((a, b) => a.t - b.t); }
    const max = Math.max(...pts.map(p => p.p)) * 1.06, min = Math.min(...pts.map(p => p.p)) * .9, W = 1000, H = 100, base = 100;
    const X = t => (t - t0) / (t1 - t0) * W, Y = v => 8 + (1 - (v - min) / (max - min)) * (H - 14);
    const line = arr => arr.map((p, i) => `${i ? 'L' : 'M'}${X((p.t + p.e) / 2).toFixed(1)} ${Y(p.p).toFixed(1)}`).join('');
    const A1 = pts.filter(p => !p.f), F1 = pts.filter(p => p.f); if (A1.length && F1.length) F1.unshift(A1[A1.length - 1]);
    let g = `<defs><linearGradient id="pl" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}"><stop offset="0" stop-color="#ff9e7a"/><stop offset=".55" stop-color="#e8c37e"/><stop offset="1" stop-color="#6be3a8"/></linearGradient>
      <linearGradient id="pa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8c37e" stop-opacity=".25"/><stop offset="1" stop-color="#e8c37e" stop-opacity="0"/></linearGradient></defs>`;
    if (this._ps === 'bar') {
      const col = v => { const r = (v - min / .9) / ((max / 1.06) - min / .9 || 1); return r < .33 ? '#6be3a8' : r < .66 ? '#e8c37e' : '#ff9e7a'; };
      const gap = mode === '48' ? .25 : .6;
      pts.forEach((p, i) => { const x = X(p.t), w = Math.max(.5, X(p.e) - X(p.t) - gap), y = Y(p.p), past = p.e <= now;
        g += `<rect x="${x.toFixed(2)}" y="${y.toFixed(1)}" width="${w.toFixed(2)}" height="${(base - y).toFixed(1)}" rx="1.5" fill="${col(p.p)}" opacity="${past ? .25 : p.f ? .45 : .85}" style="transform-origin:${x}px ${base}px;animation:barin .7s cubic-bezier(.16,1,.3,1) ${Math.min(i * 6, 900)}ms both"/>`; });
    } else if (A1.length) { const d = line(A1); g += `<path d="${d}L${X((A1[A1.length - 1].t + A1[A1.length - 1].e) / 2)} ${base}L${X((A1[0].t + A1[0].e) / 2)} ${base}Z" fill="url(#pa)" class="fadein"/><path d="${d}" fill="none" stroke="url(#pl)" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linejoin="round" class="draw"/>`; }
    if (this._ps !== 'bar' && F1.length > 1) g += `<path d="${line(F1)}" fill="none" stroke="url(#pl)" stroke-width="1.6" stroke-dasharray="4 5" vector-effect="non-scaling-stroke" opacity=".7" class="fadein"/>`;
    this.$('psvg').setAttribute('viewBox', `0 0 ${W} ${H}`); this.$('psvg').innerHTML = g;
    // overlay: days, now, cheapest window
    let ov = ''; const day0 = new Date(t0); day0.setHours(0, 0, 0, 0);
    for (let d = new Date(day0.getTime() + 864e5); d.getTime() < t1; d = new Date(d.getTime() + 864e5)) { const x = X(d.getTime()) / W * 100;
      ov += `<div style="position:absolute;left:${x}%;top:0;bottom:16px;border-left:1px dashed rgba(244,241,234,.12)"></div><div class="dl2" style="left:${x}%">${d.toLocaleDateString('da-DK', { weekday: 'short' })}${d.getTime() >= lastA ? ' · prognose' : ''}</div>`; }
    const nx = X(now) / W * 100, cp = all.find(p => p.t <= now && p.e > now);
    if (cp) ov += `<div class="now" style="left:${nx}%"></div><div class="nowdot" style="left:${nx}%;top:${Y(cp.p)}%"></div>`;
    const fut = act.filter(p => p.t >= now - 9e5); let best = null; const win = 12;
    for (let i = 0; i + win <= fut.length; i++) { const a = fut.slice(i, i + win).reduce((s, p) => s + p.p, 0) / win; if (!best || a < best.a) best = { a, t: fut[i].t, e: fut[i + win - 1].e }; }
    if (best && best.t < t1) { const l = X(best.t) / W * 100, r = X(best.e) / W * 100; ov += `<div class="band" style="left:${l}%;width:${r - l}%"><span>BILLIGST</span></div>`; }
    this.$('pov').innerHTML = ov;
    const ch2 = this.$('pchart'), tip = this.$('ptip');
    ch2.onpointermove = ch2.onpointerdown = e => { const b = ch2.getBoundingClientRect(), t = t0 + (e.clientX - b.left) / b.width * (t1 - t0), p = pts.find(q => q.t <= t && q.e > t); if (!p) { tip.style.opacity = 0; return; }
      tip.innerHTML = `${new Date(p.t).toLocaleString('da-DK', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}${p.f ? ' · prognose' : ''}<br><b>${hnum(p.p, 2)} kr</b>`;
      tip.style.left = Math.max(60, Math.min(b.width - 60, e.clientX - b.left)) + 'px'; tip.style.top = (Y(p.p) / H * b.height) + 'px'; tip.style.opacity = 1; };
    ch2.onpointerleave = () => tip.style.opacity = 0;
    // day overview (7 days)
    const days = {}; for (const p of all) { const d = new Date(p.t); d.setHours(0, 0, 0, 0); const k = d.getTime(); (days[k] = days[k] || { k, s: 0, n: 0, min: 1e9, f: true }); days[k].s += p.p; days[k].n++; days[k].min = Math.min(days[k].min, p.p); days[k].f = days[k].f && p.f; }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dl = Object.values(days).filter(d => d.k >= today.getTime()).sort((a, b) => a.k - b.k).slice(0, 7).map(d => ({ ...d, avg: d.s / d.n }));
    const dmax = Math.max(...dl.map(d => d.avg)), dmin = Math.min(...dl.map(d => d.avg)), bi = dl.findIndex(d => d.avg === dmin);
    this.$('days').innerHTML = dl.map((d, i) => { const r = (d.avg - dmin * .8) / (dmax - dmin * .8 || 1), c = d.avg === dmin ? '#6be3a8' : r > .8 ? '#ff9e7a' : '#e8c37e';
      return `<div class="day ${i === bi ? 'best' : ''} ${d.f ? 'fc' : ''}" title="${d.f ? 'Prognose' : 'Faktisk pris'} · laveste ${hnum(d.min, 2)} kr"><span>${i === 0 ? 'I dag' : new Date(d.k).toLocaleDateString('da-DK', { weekday: 'short' })}</span>
        <div class="col"><b style="width:${Math.max(12, r * 100)}%;background:${c};animation-delay:${i * 70}ms"></b></div><strong>${hnum(d.avg, 2)}</strong></div>`; }).join('');
  }

  open(kind, opts = {}) {
    if (this._sheet) this._sheet.remove();
    const s = document.createElement('th-home-sheet'); Object.assign(s, { card: this, kind, opts });
    s.style.fontFamily = getComputedStyle(this).fontFamily; s.addEventListener('closed', () => { if (this._sheet === s) this._sheet = null; });
    document.body.appendChild(s); this._sheet = s; s.hass = this._h;
  }
}

class ThHomeSheet extends HTMLElement {
  connectedCallback() { this._r = this.attachShadow({ mode: 'open' }); this._code = ''; this._esc = e => { if (e.key === 'Escape') this.close(); }; window.addEventListener('keydown', this._esc); this._render(); }
  disconnectedCallback() { window.removeEventListener('keydown', this._esc); }
  close() { const sh = this._r.querySelector('.sh'); sh.style.transition = 'all .3s'; sh.style.opacity = 0; sh.style.transform = 'translateY(30px)'; this._r.querySelector('.bg').style.opacity = 0;
    setTimeout(() => { this.dispatchEvent(new Event('closed')); this.remove(); }, 280); }
  set hass(h) { this._h = h; if (this._r && ['room', 'lights', 'temps', 'alarm'].includes(this.kind)) this._render(true); }
  _render(soft) {
    const c = this.card, k = this.kind, o = this.opts || {}, cf = c._c, lightRow = l => `<div class="item">${hi('bulb', 20)}<span>${hesc(c.nm(l))}</span><button class="sw ${c.on(l.entity) ? 'on' : ''}" data-e="${hesc(l.entity)}" ${c.s(l.entity) ? '' : 'disabled'}></button></div>`;
    let col = 'var(--amber)', icon = 'bulb', title = '', sub = '', body = '';
    if (k === 'room') { const r = o.room; icon = r.icon; title = r.name; sub = r.out ? 'Udenfor' : 'Inde';
      const t = r.temp ? c.n(r.temp) : NaN, h = r.hum ? c.n(r.hum) : NaN;
      body = `<div class="grid">${Number.isFinite(t) ? `<div class="cell"><small>Temperatur</small><b>${hnum(t)} °C</b></div>` : ''}${Number.isFinite(h) ? `<div class="cell"><small>Luftfugtighed</small><b>${Math.round(h)} %</b></div>` : ''}
        ${r.door ? `<div class="cell"><small>Dør</small><b>${c.on(r.door) ? 'Åben' : 'Lukket'}</b></div>` : ''}${r.tv ? `<div class="cell"><small>TV</small><b>${({ idle: 'Standby', off: 'Slukket', playing: 'Spiller', on: 'Tændt', paused: 'Pause' })[c.s(r.tv)?.state] || c.s(r.tv)?.state || '–'}</b></div>` : ''}</div>
        <div class="list">${r.lights.map(lightRow).join('') || '<div class="note">Ingen lys i dette rum.</div>'}</div>`; }
    else if (k === 'lights') { col = '#e8c37e'; icon = 'bulb'; const tab = this._lt || 'in'; title = 'Lys'; sub = 'Tryk for at tænde eller slukke';
      body = `<div class="seg" id="lseg"><button data-t="in" class="${tab === 'in' ? 'on' : ''}">Inde</button><button data-t="out" class="${tab === 'out' ? 'on' : ''}">Ude</button></div>`
        + cf.rooms.filter(r => r.out === (tab === 'out') && r.lights.length).map(r => `<div class="grp">${hesc(r.name)}</div><div class="list">${r.lights.map(lightRow).join('')}</div>`).join('')
        + `<button class="go" id="alloff" style="background:rgba(255,255,255,.08);color:var(--ink)">Sluk alle ${tab === 'out' ? 'udendørs' : 'indendørs'} lys</button>`; }
    else if (k === 'temps') { col = '#8ed1ff'; icon = 'temp'; title = 'Temperaturer'; sub = 'Alle målere';
      const fzMax = cf.freezer ? cf.freezer.max : -15;
      body = cf.temps.map(ref => { const { entity: e, kind } = ref, v = c.n(e); if (!Number.isFinite(v)) return ''; const warn = kind === 'freezer' && v > fzMax;
        const cl = kind === 'freezer' ? '#5fb7ff' : v < 10 ? '#5fb7ff' : v < 18 ? '#7ad6c8' : v < 24 ? '#2fe6a6' : '#ff9a6b', fr = kind === 'freezer' ? Math.min(1, Math.max(0, (-v - 10) / 20)) : Math.min(1, Math.max(0, (v + 5) / 35));
        return `<div class="tv" style="margin-bottom:6px">${hi(kind === 'freezer' ? 'snow' : 'temp', 18)}<span>${hesc(c.nm(ref))}</span><div class="bar"><i style="width:${fr * 100}%;background:${cl}"></i></div><b style="${warn ? 'color:var(--red)' : ''}">${hnum(v)}°</b></div>`; }).join(''); }
    else if (k === 'alarm') { const al = cf.alarm ? c.s(cf.alarm.entity)?.state : undefined, lock = cf.lock, locked = lock && c.s(lock.entity)?.state === 'locked';
      col = al === 'triggered' ? '#ff6b7d' : '#6be3a8'; icon = 'shield'; title = 'Sikkerhed'; sub = cf.alarm ? hesc(cf.alarm.name || 'Alarm') : '';
      body = `<div class="grid">${cf.alarm ? `<div class="cell"><small>Alarm</small><b>${{ disarmed: 'Fra', armed_home: 'Hjemme', armed_away: 'Ude', triggered: 'Udløst' }[al] || al}</b></div>` : ''}${lock ? `<div class="cell"><small>${hesc(lock.name)}</small><b>${locked ? 'Låst' : 'Ulåst'}</b></div>` : ''}</div>
        ${cf.alarm ? `<div class="acts" id="acts"><button data-a="disarm" class="${al === 'disarmed' ? 'on' : ''}">Fra</button><button data-a="arm_home" class="${al === 'armed_home' ? 'on' : ''}">Hjemme</button><button data-a="arm_away" class="${al === 'armed_away' ? 'on' : ''}">Ude</button></div>` : ''}
        ${lock ? `<button class="go" id="lockgo" style="margin:0 0 14px">${locked ? `Lås ${hesc(lock.definite)} op` : `Lås ${hesc(lock.definite)}`}</button>` : ''}
        ${cf.doors.length ? `<div class="grp">Døre</div><div class="list">${cf.doors.map(d => `<div class="item">${hi('door', 20)}<span>${hesc(c.nm(d))}</span><b style="color:${c.on(d.entity) ? 'var(--coral)' : 'var(--emer)'}">${c.on(d.entity) ? 'Åben' : 'Lukket'}</b></div>`).join('')}</div>` : ''}`; }
    else if (k === 'code') { const a = o.action, lk = cf.lock ? cf.lock.definite : '', L = { disarm: 'Slå alarmen fra', arm_home: 'Slå til · hjemme', arm_away: 'Slå til · ude', lock: `Lås ${lk}`, unlock: `Lås ${lk} op` };
      col = a === 'disarm' || a === 'unlock' ? '#ff9e7a' : '#6be3a8'; icon = a.includes('lock') ? (a === 'lock' ? 'lock' : 'unlock') : 'shield'; title = L[a]; sub = 'Indtast kode';
      body = `<div class="dots" id="dots">${[0, 1, 2, 3].map(i => `<i class="${i < this._code.length ? 'f' : ''}"></i>`).join('')}</div>
        <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-n="${n}">${n}</button>`).join('')}<button data-n="c" style="font-size:13px">Ryd</button><button data-n="0">0</button><button data-n="b">${hi('back', 20)}</button></div>
        <button class="go" id="go">${hesc(title)}</button><div class="note">Koden sendes direkte til ${a.includes('lock') ? 'låsen' : hesc(cf.alarm?.name || 'alarmen')} og gemmes ikke.</div>`; }
    this._r.innerHTML = `<style>${HSHEET}</style><div class="bg" style="${soft ? 'animation:none' : ''}"></div><div class="sh" style="--c:${col};${soft ? 'animation:none' : ''}"><div class="grab"></div>
      <div class="top"><div class="ic">${ico(icon, 22)}</div><h2>${hesc(title)}<small>${sub}</small></h2><button class="x" aria-label="Luk">${hi('close', 18)}</button></div>${body}</div>`;
    this._r.querySelector('.bg').onclick = () => this.close(); this._r.querySelector('.x').onclick = () => this.close();
    this._r.querySelectorAll('#lseg button').forEach(b => b.onclick = () => { this._lt = b.dataset.t; this._render(true); });
    const ao = this._r.getElementById('alloff'); if (ao) ao.onclick = () => this.allOff();
    this._r.querySelectorAll('#acts button').forEach(b => b.onclick = () => { this.kind = 'code'; this.opts = { action: b.dataset.a }; this._code = ''; this._render(true); });
    const lg = this._r.getElementById('lockgo'); if (lg) lg.onclick = () => { this.kind = 'code'; this.opts = { action: c.s(cf.lock?.entity)?.state === 'locked' ? 'unlock' : 'lock' }; this._code = ''; this._render(true); };
    this._r.querySelectorAll('.sw[data-e]').forEach(b => b.onclick = () => { b.classList.toggle('on'); c.toggle(b.dataset.e); });
    this._r.querySelectorAll('.pad button').forEach(b => b.onclick = () => { const n = b.dataset.n; if (n === 'c') this._code = ''; else if (n === 'b') this._code = this._code.slice(0, -1); else if (this._code.length < 8) this._code += n;
      this._r.getElementById('dots').innerHTML = Array.from({ length: Math.max(4, this._code.length) }, (_, i) => `<i class="${i < this._code.length ? 'f' : ''}"></i>`).join(''); });
    const go = this._r.getElementById('go');
    if (go) go.onclick = () => this.submit();
  }
  /** Turns off every light that is on in the current tab (Inde/Ude) of the lights sheet. */
  allOff() { const c = this.card; c._c.rooms.filter(r => r.out === ((this._lt || 'in') === 'out')).flatMap(r => r.lights.map(l => l.entity)).filter(e => c.on(e)).forEach(e => c.toggle(e)); }
  /** Sends the alarm/lock action of the code sheet with the typed code. */
  async submit() { const a = (this.opts || {}).action, cf = this.card._c, data = this._code ? { code: this._code } : {};
    try {
      if (a === 'lock' || a === 'unlock') await this._h.callService('lock', a, { entity_id: cf.lock?.entity, ...data });
      else await this._h.callService('alarm_control_panel', 'alarm_' + a, { entity_id: cf.alarm?.entity, ...data });
      this._code = ''; this.close();
    } catch (e) { this._code = ''; const d = this._r.getElementById('dots'); d.classList.remove('err'); void d.offsetWidth; d.classList.add('err');
      d.innerHTML = [0, 1, 2, 3].map(() => '<i></i>').join(''); this._r.querySelector('.note').textContent = 'Det lykkedes ikke: ' + (e.message || e); } }
}

if (!customElements.get('th-home-card')) customElements.define('th-home-card', ThHomeCard);
if (!customElements.get('th-home-sheet')) customElements.define('th-home-sheet', ThHomeSheet);
window.customCards = window.customCards || [];
if (!window.customCards.some(c => c.type === 'th-home-card')) window.customCards.push({ type: 'th-home-card', name: 'TH Home', description: 'Forside', preview: false });
console.info(`%c TH-HOME %c ${VH_VERSION} `, 'background:#ffd27a;color:#111;font-weight:700', 'background:#222;color:#fff');
