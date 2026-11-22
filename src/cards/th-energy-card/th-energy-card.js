/* TH Energy – samlet energiside for Huawei SUN2000 / EMMA / LUNA2000
 * type: custom:th-energy-card
 * Entities follow the Huawei Solar integration's names (huawei: / entities: override them); prices, weather and the
 * plant's month/year totals have no default. The embedded th-energy-flow-card and th-battery-card get their entities
 * from this card's config. Options: see README.md.
 */
import { CSS, SHEET_CSS } from './styles.js';
import { batteryCapacityKwh, batteryCardConfig, batteryLayout, energySettings, flowCardConfig, groupThousands, weatherFallback } from './config.js';
import '../th-energy-flow-card/th-energy-flow-card.js';
import '../th-battery-card/th-battery-card.js';

const VE_VERSION = '1.0.0';

const NAMES = {
  maximise_self_consumption: 'Maks. egetforbrug', maximum_self_consumption: 'Maks. egetforbrug', time_of_use_luna2000: 'Tidsstyret',
  time_of_use: 'Tidsstyret', fully_fed_to_grid: 'Alt til elnettet', fixed_charge_discharge: 'Fast op/afladning', adaptive: 'Adaptiv',
  third_party_dispatch: 'Ekstern styring', fed_to_grid: 'Sælg overskud', charge: 'Lad batteriet',
};
const nm = v => NAMES[v] || String(v ?? '–').replaceAll('_', ' ');
const h2 = v => String(v).padStart(2, '0');
const num = (v, d = 1) => (Number.isFinite(v) ? v : 0).toLocaleString('da-DK', { minimumFractionDigits: d, maximumFractionDigits: d });
const kw = w => { const a = Math.abs(w || 0); return a >= 1000 ? [num(a / 1000, 2), 'kW'] : [String(Math.round(a)), 'W']; };
const kwS = w => kw(w).join(' ');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hm = d => `${h2(d.getHours())}.${h2(d.getMinutes())}`;

const IC = {
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
  home: '<path d="M3.5 11 12 4l8.5 7"/><path d="M6 9.6V20h12V9.6"/><path d="M10 20v-5h4v5"/>',
  battery: '<rect x="3" y="7" width="16" height="10" rx="2.6"/><path d="M21 10.5v3"/><path d="M7 12h6" class="fillbar"/>',
  grid: '<path d="M12 2.8 7 21.2M12 2.8l5 18.4M8.6 9h6.8M7.5 14h9M5 5.6h14"/>',
  car: '<path d="M4 15.5V12l2-4.6c.3-.8 1-1.4 1.9-1.4h8.2c.9 0 1.6.6 1.9 1.4L20 12v3.5"/><path d="M3 15.5h18v2.5H3z"/><circle cx="7.5" cy="18.2" r="1.6"/><circle cx="16.5" cy="18.2" r="1.6"/><path d="M6.5 11.5h11"/>',
  bolt: '<path d="M13 2.5 5.5 13.5H11L9.8 21.5 18.5 9.5H13l1-7Z"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  cube: '<path d="M12 2.8 20.5 7.5v9L12 21.2 3.5 16.5v-9Z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9.2"/>',
  leaf: '<path d="M5 19c0-8 5-13.5 15-14 0 10-6 15-13 14"/><path d="M5 19c3-4 6.5-6.5 10-8"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M14.8 9.2c-.5-1-1.5-1.5-2.8-1.5-1.7 0-2.8.9-2.8 2.1 0 2.9 5.8 1.5 5.8 4.4 0 1.2-1.2 2.1-3 2.1-1.4 0-2.5-.6-3-1.6M12 6v1.7M12 16.3V18"/>',
  cloud: '<path d="M7 18.5h10.5a4 4 0 0 0 .6-8A6 6 0 0 0 6.5 11.6 3.5 3.5 0 0 0 7 18.5Z"/>',
  wind: '<path d="M3 9h11a3 3 0 1 0-3-3M3 13h15a3 3 0 1 1-3 3M3 17h7"/>',
  temp: '<path d="M10 4.5a2 2 0 0 1 4 0v9.3a4 4 0 1 1-4 0Z"/><path d="M12 10v6"/>',
  arrowDown: '<path d="M12 4v15M6 13l6 6 6-6"/>', arrowUp: '<path d="M12 20V5M6 11l6-6 6 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>', chart: '<path d="M3.5 19.5h17"/><path d="M5 16l4.5-5 3.5 3 6-7"/>',
  power: '<path d="M12 3v8"/><path d="M6.4 6.6a8 8 0 1 0 11.2 0"/>', tag: '<path d="M3.5 12V4h8l9 9-8 8z"/><circle cx="8" cy="8.5" r="1.4"/>',
};
const ico = (k, s = 18, sw = 1.6) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k] || ''}</svg>`;


/* ---------- små hjælpere til grafer ---------- */
function smooth(pts) { // catmull-rom → bezier
  if (pts.length < 2) return '';
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}
const segs = arr => { const out = []; let cur = []; arr.forEach((p, i) => { if (p[1] == null) { if (cur.length) out.push(cur); cur = []; } else cur.push(p); }); if (cur.length) out.push(cur); return out; };

/* ======================================================================= */
class ThEnergyCard extends HTMLElement {
  setConfig(c) {
    this.cfg = c || {}; this.S = energySettings(this.cfg); this.E = this.S.entities; this._lay = this._bcfg = this._fcfg = null;
    if (this._r) { this._rb = true; if (this._h) this.hass = this._h; } // config changed after the first render: rebuild
  }
  getCardSize() { return 14; }
  static getStubConfig() { return {}; }

  set hass(h) {
    this._h = h;
    if (!this._r || this._rb) this._build();
    const t = Date.now();
    if (!this._t || t - this._t > 1000) { this._t = t; this._update(); }
    else if (!this._q) this._q = setTimeout(() => { this._q = null; this._t = Date.now(); this._update(); }, 1000);
    if (this._sheet) this._sheet.hass = h;
    if (!this._ht || t - this._ht > 5 * 60e3) { this._ht = t; this._history(); }
  }
  connectedCallback() { this._run = true; if (this._r) this._loop(); }
  disconnectedCallback() { this._run = false; }

  s(k) { const id = this.E[k]; return id && this._h ? this._h.states[id] : undefined; }
  n(k) { const s = this.s(k), v = s ? parseFloat(s.state) : NaN; return Number.isFinite(v) ? v : 0; }
  st(k) { const s = this.s(k); return s ? s.state : '–'; }
  at(k, a) { const s = this.s(k); return s ? s.attributes[a] : undefined; }
  $(id) { return this._r.getElementById(id); }
  set(id, html) { const e = this.$(id); if (e && e._v !== html) { e.innerHTML = html; e._v = html; } }
  w(id, frac) { const e = this.$(id); if (e) e.style.width = clamp(frac * 100, 0, 100) + '%'; }
  count(id, val, fmt, unit = '') {
    const e = this.$(id); if (!e) return; this._cv = this._cv || {};
    const from = this._cv[id] ?? 0; this._cv[id] = val; const t0 = performance.now(), u = unit ? `<span class="u">${unit}</span>` : '';
    if (Math.abs(from - val) < 1e-9) { e.innerHTML = fmt(val) + u; return; }
    const step = t => { const p = Math.min(1, (t - t0) / 1300), k = 1 - Math.pow(1 - p, 4); e.innerHTML = fmt(from + (val - from) * k) + u; if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  get hasPrice() { return !!(this.E.priceNow || this.E.price); }
  // Battery units/modules (config, else found from the integration) and capacity in kWh.
  get layout() { return this._lay || (this._lay = batteryLayout(this.cfg, this._h?.states)); }
  batKwh() { const r = this.s('rated'), v = r ? parseFloat(r.state) : NaN; return batteryCapacityKwh(this.S, v, this.layout); }
  // A weather value: its own sensor when configured, else the configured weather entity's attribute, else NaN.
  wx(k) { if (this.E[k]) return this.n(k); const w = this.S.weather && this._h?.states[this.S.weather]; return w ? weatherFallback(w)[k] : NaN; }
  get prices() { return [...(this.at('price', 'raw_today') || []), ...(this.at('price', 'raw_tomorrow') || [])]; }

  calc() {
    const pv = this.n('pv'), load = this.n('load'), inv = this.n('inv'), bat = this.n('bat'), soc = this.n('soc'), grid = load - inv;
    const ps = this.s('pv'), off = !ps || ['unavailable', 'unknown'].includes(ps.state);
    const evTot = this.n('evTot'); if (this._evL != null && evTot > this._evL) this._evU = Date.now() + 6e5; if (evTot > 0) this._evL = evTot;
    const pvDay = this.n('pvDay'), cons = this.n('cons'), imp = this.n('imp'), exp = this.n('exp'), ch = this.n('ch'), dis = this.n('dis');
    const aut = cons > 0 ? clamp((1 - imp / cons) * 100, 0, 100) : 0;
    const priceNow = this.n('priceNow') || this.n('price'), mean = this.at('price', 'today_mean') || priceNow;
    // husets forsyning lige nu
    const fromBat = Math.max(0, -bat), fromGrid = Math.max(0, grid), fromSun = Math.max(0, load - fromBat - fromGrid);
    const alarm = this.st('alarms'), fault = !off && (alarm !== 'None' && alarm !== '–' || this.st('invSwitch') === 'off');
    return { pv, load, inv, bat, soc, grid, off, fault, alarm, evOn: Date.now() < (this._evU || 0), evTot, pvDay, cons, imp, exp, ch, dis, aut, priceNow, mean,
      fromSun, fromBat, fromGrid, saved: Math.max(0, pvDay - exp) * mean };
  }

  /* ---------------- markup ---------------- */
  _build() {
    if (this._r) { this._sunKey = this._pk = null; this._cv = {}; this._ecoR = 0; } // rebuild after a config change
    this._r = this.shadowRoot || this.attachShadow({ mode: 'open' }); this._rb = false;
    const ins = (id, pop, col, icon, name) => `<button class="ins" id="i-${id}" data-sheet="${pop}" style="--c:${col}">
      <div class="t">${ico(icon, 18)}<span class="k">${name}</span></div><div class="v big" id="v-${id}">–</div><div class="sub" id="s-${id}">&nbsp;</div>
      <div class="dir" id="d-${id}"></div>${id === 'sun' ? `<div class="strs"><div><b id="str1"></b></div><div><b id="str2"></b></div></div>` : `<div class="viz"><b id="z-${id}"></b></div>`}</button>`;
    // urskive-tikker
    let ticks = ''; for (let i = 0; i < 72; i++) { const a = i / 72 * Math.PI * 2, r1 = i % 6 ? 127 : 122, r2 = 131;
      ticks += `<line x1="${200 + Math.sin(a) * r1}" y1="${200 - Math.cos(a) * r1}" x2="${200 + Math.sin(a) * r2}" y2="${200 - Math.cos(a) * r2}" stroke="rgba(244,241,234,${i % 6 ? .14 : .3})" stroke-width="${i % 6 ? 1 : 1.6}"/>`; }
    this._r.innerHTML = `<style>${CSS}</style><div class="page" id="page">

      <section class="s hero c8" id="hero">
        <div class="aur" id="aur"><i></i><i></i><i></i></div>
        <div class="hero-top"><div><div class="k">Energi${this.S.name ? ` · ${esc(this.S.name)}` : ''}</div><div class="say" id="say">&nbsp;</div></div><span class="chip live" id="live"><span class="dot"></span>Live</span></div>
        <div class="hero-grid">
          <div class="col">${ins('sun', 'solar', 'var(--gold)', 'sun', 'Solceller')}${ins('grid', 'grid', 'var(--vio)', 'grid', 'Elnet')}</div>
          <div class="ring" id="ring">
            <svg viewBox="0 0 400 400">
              <defs>
                <linearGradient id="gPV" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0c9"/><stop offset="1" stop-color="#d9a54e"/></linearGradient>
                <radialGradient id="gCore"><stop offset="0" stop-color="rgba(255,255,255,.06)"/><stop offset="1" stop-color="rgba(255,255,255,0)"/></radialGradient>
                <filter id="glw" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.5"/></filter>
                <linearGradient id="gSw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".55"/></linearGradient>
              </defs>
              <circle cx="200" cy="200" r="118" fill="url(#gCore)"/>
              ${ticks}
              <circle cx="200" cy="200" r="176" fill="none" stroke="rgba(244,241,234,.06)" stroke-width="3"/>
              <circle id="pvArc" class="seg" cx="200" cy="200" r="176" fill="none" stroke="url(#gPV)" stroke-width="3" stroke-linecap="round" stroke-dasharray="0 2000" transform="rotate(-90 200 200)"/>
              <circle id="pvDot" r="5" cx="200" cy="24" fill="#fff4d8" filter="url(#glw)" style="opacity:0"/>
              <circle cx="200" cy="200" r="150" fill="none" stroke="rgba(244,241,234,.06)" stroke-width="16"/>
              <g transform="rotate(-90 200 200)">
                <circle id="sgSun" class="seg" cx="200" cy="200" r="150" fill="none" stroke="var(--gold)" stroke-width="16" stroke-linecap="round" stroke-dasharray="0 2000"/>
                <circle id="sgBat" class="seg" cx="200" cy="200" r="150" fill="none" stroke="var(--emer)" stroke-width="16" stroke-linecap="round" stroke-dasharray="0 2000"/>
                <circle id="sgGrid" class="seg" cx="200" cy="200" r="150" fill="none" stroke="var(--vio)" stroke-width="16" stroke-linecap="round" stroke-dasharray="0 2000"/>
              </g>
              <circle class="sweep" cx="200" cy="200" r="150" fill="none" stroke="url(#gSw)" stroke-width="16" stroke-dasharray="70 1000" stroke-linecap="round" opacity=".35"/>
              <g id="orb"></g>
            </svg>
            <div class="ctr"><div><div class="lbl">Huset bruger nu</div><div class="big" id="vLoad">–</div>
              <div class="mix"><span><i style="background:var(--gold)"></i><b id="mxS">–</b></span><span><i style="background:var(--emer)"></i><b id="mxB">–</b></span><span><i style="background:var(--vio)"></i><b id="mxG">–</b></span></div></div></div>
          </div>
          <div class="col">${ins('bat', 'battery', 'var(--emer)', 'battery', 'Batteri')}${ins('ev', 'ev', 'var(--rose)', 'car', 'Elbil')}</div>
        </div>
        <div class="eco" id="eco"></div>
      </section>

      <section class="s c4" id="sunS" style="--d:1">
        <div class="hd"><div><div class="k">Solen i dag</div><h3 id="sunT">–</h3></div><span class="chip" id="sunChip" style="--c:var(--gold)">–</span></div>
        <svg class="sunsvg" viewBox="0 0 600 270" id="sunSvg"></svg>
        <div class="wx" id="wx"></div>
      </section>

      <div class="c7" style="min-width:0;display:grid"><th-energy-flow-card id="flow"></th-energy-flow-card></div>

      <div class="c5" style="min-width:0;display:grid"><th-battery-card id="batc"></th-battery-card></div>

      <section class="s c8" id="priceS"${this.hasPrice ? '' : ' style="display:none"'}>
        <div class="hd"><div><div class="k">Elpris inkl. afgifter</div><h3><span id="pNow">–</span> <span class="mut" style="font-size:14px">kr/kWh lige nu</span></h3></div><span class="chip" id="pChip">–</span></div>
        <div class="chart" id="pChart"><div class="tip"></div><svg viewBox="0 0 800 220"></svg></div>
        <div class="pills" id="pPills"></div>
      </section>

      <section class="s c4" id="ctlS">
        <div class="hd"><div><div class="k">Anlæg</div><h3>Status og styring</h3></div><span class="chip" id="invChip">–</span></div>
        <div class="rows" id="ctlRows"></div>
        <button class="btn" data-sheet="control" style="margin-top:14px;width:100%;justify-content:center">${ico('gear', 16)}Åbn styring</button>
      </section>

      <section class="s c8" id="histS">
        <div class="hd"><div><div class="k">Sidste 24 timer</div><h3>Produktion, forbrug og batteri</h3></div>
          <div class="leg"><span><i style="background:var(--gold)"></i>Sol</span><span><i style="background:var(--ice)"></i>Forbrug</span><span><i style="background:var(--emer)"></i>Batteri %</span></div></div>
        <div class="chart" id="hChart"><div class="tip"></div><svg viewBox="0 0 800 240"></svg></div>
      </section>

      <section class="s c4" id="totS">
        <div class="hd"><div><div class="k">Over tid</div><h3>Anlæggets historie</h3></div></div>
        <div class="tot" id="tot"></div>
        ${this.S.view3d ? `<button class="go3d" id="go3d"><span class="cube">${ico('cube', 26, 1.4)}</span><span><b style="font-size:15px;font-weight:600;display:block">Se huset i 3D</b>
          <span class="mut" style="font-size:12px">Animeret overblik med live strøm</span></span><span style="margin-left:auto;color:var(--gold)">${ico('arrowUp', 18)}</span></button>` : ''}
      </section>
    </div>`;
    const go3d = this.S.view3d && this.$('go3d'); if (go3d) go3d.querySelector('span:last-child .ico').style.transform = 'rotate(90deg)';
    this._r.querySelectorAll('[data-sheet]').forEach(b => b.addEventListener('click', () => this.open(b.dataset.sheet)));
    this._r.addEventListener('th-battery-control', () => this.open('control'));
    if (go3d) go3d.onclick = () => { history.pushState(null, '', this.S.view3d); window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } })); };
    // indgangsanimation
    const io = new IntersectionObserver(en => en.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .08 });
    [...this._r.querySelectorAll('.s')].forEach((s, i) => { s.style.transitionDelay = `${Math.min(i, 4) * 90}ms`; io.observe(s); });
    setTimeout(() => this._r.querySelectorAll('.s').forEach(s => s.classList.add('in')), 2500);
    // partikler på ringen
    const orb = this.$('orb'); this._orb = [];
    for (let i = 0; i < 26; i++) { const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('r', '2.2'); c.setAttribute('cx', '200'); c.setAttribute('cy', '50'); c.style.opacity = 0; c.style.fill = 'var(--gold)'; c.setAttribute('filter', 'url(#glw)'); orb.appendChild(c); this._orb.push({ c, a: Math.random(), sp: .02 + Math.random() * .03 }); }
    this._loop();
  }

  _loop() {
    if (this._lp) return; this._lp = true;
    let last = performance.now();
    const f = t => {
      if (!this._run) { this._lp = false; return; }
      requestAnimationFrame(f);
      const dt = Math.min(.05, (t - last) / 1000); last = t; if (document.hidden || !this._seg) return;
      const S = this._seg, tot = S.sun + S.bat + S.grid || 1, speed = .25 + clamp(S.load / 8000, 0, 1) * .9;
      for (const p of this._orb) {
        p.a = (p.a + dt * p.sp * speed * 6) % 1;
        const col = p.a < S.sun / tot ? 'var(--gold)' : p.a < (S.sun + S.bat) / tot ? 'var(--emer)' : 'var(--vio)';
        const ang = p.a * Math.PI * 2 - Math.PI / 2, rr = 150 + Math.sin(t / 600 + p.sp * 400) * 5;
        p.c.setAttribute('cx', 200 + Math.cos(ang) * rr); p.c.setAttribute('cy', 200 + Math.sin(ang) * rr);
        if (p.col !== col) { p.c.style.fill = col; p.col = col; }
        p.c.style.opacity = S.load > 30 ? .9 : 0;
      }
      // solprik på yderringen
      const a = (this._pvFrac || 0) * Math.PI * 2 - Math.PI / 2, dot = this.$('pvDot');
      dot.setAttribute('cx', 200 + Math.cos(a) * 176); dot.setAttribute('cy', 200 + Math.sin(a) * 176); dot.style.opacity = this._pvFrac > .005 ? .6 + .4 * Math.sin(t / 300) : 0;
    };
    requestAnimationFrame(f);
  }

  /* ---------------- opdatering ---------------- */
  _update() {
    if (!this._h || !this._r) return;
    const d = this._d = this.calc();
    this.$('page').classList.toggle('off', d.off);
    this._hero(d); this._eco(d); this._sun(d); this._flow(); this._batc(); this._price(d); this._ctl(d); this._totals(d);
  }

  _hero(d) {
    const hr = new Date().getHours(), greet = hr < 5 ? 'God nat' : hr < 10 ? 'Godmorgen' : hr < 17 ? 'God dag' : hr < 22 ? 'God aften' : 'God nat';
    const sunPct = d.load > 0 ? Math.round(d.fromSun / d.load * 100) : 0;
    let say;
    if (d.off) say = 'Ingen forbindelse til anlægget lige nu.';
    else if (d.fault) say = `${greet}. <b>Inverteren melder en fejl</b> – tryk på Solceller for detaljer.`;
    else if (d.pv > 50 && d.grid < -25) say = `${greet}. Solen dækker hele huset, og <b>${kwS(-d.grid)}</b> sælges til nettet.`;
    else if (d.pv > 50 && d.bat > 25 && d.grid <= 25) say = `${greet}. Solen dækker huset og lader batteriet med <b>${kwS(d.bat)}</b>.`;
    else if (d.pv > 50) say = `${greet}. Solen dækker <b>${sunPct} %</b> af husets forbrug lige nu.`;
    else if (d.bat < -25) say = `${greet}. Batteriet forsyner huset – <b>${Math.round(d.soc)} %</b> tilbage.`;
    else say = this.hasPrice ? `${greet}. Huset forsynes fra elnettet til <b>${num(d.priceNow, 2)} kr</b>/kWh.` : `${greet}. Huset forsynes fra elnettet.`;
    this.set('say', say);
    const lv = this.$('live'); lv.style.setProperty('--c', d.off ? 'var(--red)' : 'var(--emer)'); this.set('live', `<span class="dot"></span>${d.off ? 'Offline' : 'Live'}`);
    // aurora følger tilstanden
    const au = this.$('aur'), night = (this.at('sun', 'elevation') ?? 10) < -2;
    au.style.setProperty('--a1', d.pv > 50 ? 'rgba(232,195,126,.6)' : night ? 'rgba(80,90,180,.45)' : 'rgba(232,195,126,.25)');
    au.style.setProperty('--a2', d.grid > 25 ? 'rgba(183,164,255,.45)' : 'rgba(142,209,255,.35)');
    au.style.setProperty('--a3', d.bat > 25 ? 'rgba(107,227,168,.5)' : d.bat < -25 ? 'rgba(107,227,168,.35)' : 'rgba(107,227,168,.15)');
    // ring
    const C = 2 * Math.PI * 150, gap = 7, tot = Math.max(d.load, 1), parts = [['sgSun', d.fromSun], ['sgBat', d.fromBat], ['sgGrid', d.fromGrid]];
    let off = 0;
    for (const [id, v] of parts) { const len = d.off ? 0 : Math.max(0, v / tot * C - gap); const e = this.$(id); e.setAttribute('stroke-dasharray', `${len} ${C}`); e.setAttribute('stroke-dashoffset', `${-off}`); off += v / tot * C; }
    this._seg = { sun: d.fromSun, bat: d.fromBat, grid: d.fromGrid, load: d.off ? 0 : d.load };
    const Cp = 2 * Math.PI * 176; this._pvFrac = d.off ? 0 : clamp(d.pv / this.S.inverterW, 0, 1); this.$('pvArc').setAttribute('stroke-dasharray', `${this._pvFrac * Cp} ${Cp}`);
    const [lv1, lu] = kw(d.load); this.count('vLoad', d.off ? 0 : d.load, v => d.off ? '–' : kw(v)[0], d.off ? '' : lu);
    const pct = v => d.load > 0 ? Math.round(v / d.load * 100) + ' %' : '–';
    this.set('mxS', pct(d.fromSun)); this.set('mxB', pct(d.fromBat)); this.set('mxG', pct(d.fromGrid));
    // instrumenter
    const s1 = this.n('pv1v') * this.n('pv1a'), s2 = this.n('pv2v') * this.n('pv2a');
    this.count('v-sun', d.off ? 0 : d.pv, v => kw(v)[0], kw(d.pv)[1]); this.set('s-sun', `I dag ${num(d.pvDay, 1)} kWh${this.S.panels ? ` · ${this.S.panels} paneler` : ''}`);
    this.w('str1', s1 / this.S.stringMaxW); this.w('str2', s2 / this.S.stringMaxW);
    const imp = d.grid > 25, exp = d.grid < -25, gc = imp ? 'var(--vio)' : exp ? 'var(--coral)' : 'var(--vio)';
    this.$('i-grid').style.setProperty('--c', gc);
    this.count('v-grid', d.off ? 0 : Math.abs(d.grid), v => kw(v)[0], kw(d.grid)[1]);
    const pr = this.hasPrice ? ` · ${num(d.priceNow, 2)} kr/kWh` : '';
    this.set('s-grid', d.off ? 'Offline' : imp ? `Køber${pr}` : exp ? `Sælger${pr}` : 'I balance');
    this.set('d-grid', imp ? ico('arrowDown', 20) : exp ? ico('arrowUp', 20) : ''); this.$('d-grid').style.setProperty('--ny', imp ? '3px' : '-3px');
    this.w('z-grid', Math.abs(d.grid) / this.S.gridMaxW);
    this.count('v-bat', d.soc, v => Math.round(v), '%');
    this.set('s-bat', d.off ? 'Offline' : Math.abs(d.bat) < 25 ? 'Hviler' : `${d.bat > 0 ? 'Lader' : 'Aflader'} ${kwS(d.bat)}`);
    this.set('d-bat', Math.abs(d.bat) > 25 && !d.off ? ico('bolt', 20) : ''); this.w('z-bat', d.soc / 100);
    this.set('v-ev', !this.E.evTot ? '–' : d.evOn ? 'Lader' : 'Standby'); this.$('v-ev').style.fontSize = 'clamp(24px,2vw,30px)';
    this.set('s-ev', this.E.evTot ? `${num(this.n('evTemp'), 0)} °C · ${Math.round(d.evTot).toLocaleString('da-DK')} kWh i alt` : '&nbsp;'); this.w('z-ev', d.evOn ? 1 : 0);
  }

  _sun(d) {
    const sun = this.s('sun'); if (!sun) return;
    const now = new Date(), el = sun.attributes.elevation ?? 0;
    let rise = new Date(sun.attributes.next_rising), set = new Date(sun.attributes.next_setting);
    if (rise > set) rise = new Date(rise.getTime() - 864e5); // solen er oppe: brug dagens solopgang
    if (now > set) { set = new Date(set.getTime()); }
    if (set.getDate() !== rise.getDate() && now < rise) set = new Date(set.getTime() - 864e5);
    const day = (set - rise) / 36e5, frac = clamp((now - rise) / (set - rise), 0, 1);
    const N = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5), decl = 23.44 * Math.sin(2 * Math.PI * (284 + N) / 365), lat = this.S.latitude ?? this._h?.config?.latitude ?? 0, noonEl = 90 - lat + decl;
    const key = `${rise.getHours()}${rise.getMinutes()}|${Math.round(frac * 400)}|${this._histKey || ''}`;
    this.set('sunT', el > 0 ? `${num(d.pvDay, 1)} kWh produceret` : 'Solen er gået ned');
    const chip = this.$('sunChip'); chip.style.setProperty('--c', el > 0 ? 'var(--gold)' : 'var(--ice)');
    const left = (set - now) / 36e5, until = (rise.getTime() + (now > rise ? 864e5 : 0) - now) / 36e5;
    this.set('sunChip', el > 0 && left > 0 ? `Ned om ${Math.floor(left)} t ${h2(Math.round((left % 1) * 60))} m` : el > 0 ? 'Solnedgang' : `Op kl. ${hm(new Date(sun.attributes.next_rising))}`);
    const wt = this.wx('temp'), wc = this.wx('cloud'), ww = this.wx('wind'), wr = this.wx('rad'), ok = Number.isFinite;
    this.set('wx', [['temp', ok(wt) ? `${num(wt, 1)}°` : '–', 'Temperatur'], ['cloud', ok(wc) ? `${Math.round(wc)} %` : '–', 'Skydække'],
      ['wind', ok(ww) ? `${num(ww, 1)}` : '–', 'Vind m/s'], ['sun', ok(wr) ? `${Math.round(wr)}` : '–', 'W/m² sol']].map(([i, v, l]) => `<div>${ico(i, 16)}<b>${v}</b><small>${l}</small></div>`).join(''));
    if (key === this._sunKey) return; this._sunKey = key;
    const W = 600, x0 = 30, x1 = 570, yH = 210, peakY = 210 - clamp(noonEl / 60, .25, 1) * 170;
    const X = f => x0 + f * (x1 - x0), Y = f => yH - Math.sin(f * Math.PI) * (yH - peakY);
    let path = ''; for (let i = 0; i <= 60; i++) path += (i ? 'L' : 'M') + X(i / 60).toFixed(1) + ' ' + Y(i / 60).toFixed(1);
    let done = ''; const nf = Math.round(frac * 60); for (let i = 0; i <= nf; i++) done += (i ? 'L' : 'M') + X(i / 60).toFixed(1) + ' ' + Y(i / 60).toFixed(1);
    // produktionskurve i dag fra historikken
    let prod = '';
    if (this._series) { const S = this._series, pts = []; let mx = 1;
      S.pv.forEach((v, i) => { const t = S.t0 + i * S.step, f = (t - rise) / (set - rise); if (f >= 0 && f <= 1 && v != null && t <= now) { pts.push([X(f), v]); mx = Math.max(mx, v); } });
      if (pts.length > 2) { const sc = (yH - peakY) * .8 / Math.max(mx, 3000), p2 = pts.map(([x, v]) => [x, yH - v * sc]);
        prod = `<path d="${smooth(p2)} L${p2[p2.length - 1][0]} ${yH} L${p2[0][0]} ${yH}Z" fill="url(#gProd)" class="fadein"/><path d="${smooth(p2)}" fill="none" stroke="var(--gold)" stroke-width="1.6" class="draw" opacity=".9"/>`; } }
    const sx = X(frac), sy = Y(frac), up = el > 0;
    this.$('sunSvg').innerHTML = `<defs><linearGradient id="gProd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8c37e" stop-opacity=".42"/><stop offset="1" stop-color="#e8c37e" stop-opacity="0"/></linearGradient>
        <radialGradient id="gSun"><stop offset="0" stop-color="#fff6dc"/><stop offset=".3" stop-color="#f3cf86"/><stop offset="1" stop-color="#e8c37e" stop-opacity="0"/></radialGradient></defs>
      <line x1="10" x2="590" y1="${yH}" y2="${yH}" stroke="rgba(244,241,234,.14)"/>
      ${prod}
      <path d="${path}" fill="none" stroke="rgba(244,241,234,.16)" stroke-dasharray="2 7" stroke-linecap="round" stroke-width="2"/>
      <path d="${done}" fill="none" stroke="var(--gold)" stroke-width="2.4" stroke-linecap="round" class="draw" opacity=".85"/>
      <g transform="translate(${sx} ${up ? sy : yH + 4})" opacity="${up ? 1 : .35}"><circle r="34" fill="url(#gSun)"><animate attributeName="r" values="30;38;30" dur="4s" repeatCount="indefinite"/></circle><circle r="8" fill="#fff8e6"/></g>
      <text x="${x0}" y="${yH + 30}" fill="rgba(244,241,234,.55)" font-size="13">Op ${hm(rise)}</text>
      <text x="${x1}" y="${yH + 30}" fill="rgba(244,241,234,.55)" font-size="13" text-anchor="end">Ned ${hm(set)}</text>
      <text x="${W / 2}" y="${yH + 30}" fill="rgba(244,241,234,.4)" font-size="12" text-anchor="middle">${Math.floor(day)} t ${h2(Math.round((day % 1) * 60))} m dagslys</text>`;
  }

  /* økonomi i dag: timeforbrug fra statistikken x timepris fra Strømligning */
  async _ecoFetch() {
    if (!this._h?.callWS || this._ecoBusy || (this._ecoT && Date.now() - this._ecoT < 5 * 60e3) || !(this.E.imp || this.E.exp || this.E.pvDay)) return;
    this._ecoBusy = true; this._ecoT = Date.now();
    try {
      const t0 = new Date(); t0.setHours(0, 0, 0, 0);
      const r = await this._h.callWS({ type: 'recorder/statistics_during_period', start_time: t0.toISOString(), statistic_ids: [this.E.imp, this.E.exp, this.E.pvDay].filter(Boolean), period: 'hour', types: ['change'], units: { energy: 'kWh' } });
      const hourly = id => (r[id] || []).map(x => ({ t: typeof x.start === 'number' ? x.start : Date.parse(x.start), v: Math.max(0, x.change || 0) }));
      const pr = (this.at('priceNow', 'prices') || []).map(p => ({ t: Date.parse(p.start), p: p.price })), sp = (this.at('spotNow', 'prices') || []).map(p => ({ t: Date.parse(p.start), p: p.price }));
      const avg = (arr, t) => { const xs = arr.filter(x => x.t >= t && x.t < t + 36e5).map(x => x.p); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN; };
      const imp = hourly(this.E.imp), exp = hourly(this.E.exp), pv = hourly(this.E.pvDay), fb = this.n('priceNow');
      let cost = 0, impS = 0, sale = 0, expS = 0, saved = 0, pvS = 0;
      for (const h of imp) { const p = avg(pr, h.t); cost += h.v * (Number.isFinite(p) ? p : fb); impS += h.v; }
      for (const h of exp) { const p = avg(sp, h.t); sale += h.v * (Number.isFinite(p) ? p / 1.25 : 0); expS += h.v; }
      for (const h of pv) { const e = exp.find(x => x.t === h.t)?.v || 0, p = avg(pr, h.t); saved += Math.max(0, h.v - e) * (Number.isFinite(p) ? p : fb); pvS += h.v; }
      this._ecoD = { cost, impS, sale, expS, saved, pvS };
    } catch (e) { this._ecoD = null; } finally { this._ecoBusy = false; }
  }
  _eco(d) {
    this._ecoFetch();
    if (!this._ecoR) { this._ecoR = 1; setTimeout(() => this.$('eco')?.classList.add('ready'), 1500); }
    const E = this._ecoD, pNow = this.n('priceNow'), spot = this.n('spotNow') || NaN;
    // del af indeværende time som statistikken endnu ikke har med
    const restImp = E ? Math.max(0, d.imp - E.impS) : d.imp, restExp = E ? Math.max(0, d.exp - E.expS) : d.exp, restPv = E ? Math.max(0, d.pvDay - E.pvS) : d.pvDay;
    const cost = (E ? E.cost : 0) + restImp * (pNow || 0), saved = (E ? E.saved : 0) + Math.max(0, restPv - restExp) * (pNow || 0);
    const sale = (E ? E.sale : 0) + restExp * (Number.isFinite(spot) ? spot / 1.25 : 0);
    const avgP = d.imp > .05 ? cost / d.imp : NaN, net = cost - sale;
    const cell = (c, k, v, u, sub, cls = '') => `<div style="--c:${c}"><small><i></i>${k}</small><b class="${cls}">${v}<u>${u}</u></b><em>${sub}</em></div>`;
    this.set('eco', cell('var(--vio)', 'Fra elnettet i dag', num(d.imp, 1), 'kWh', `heraf ${num(Math.max(0, d.ch - Math.min(d.ch, Math.max(0, d.pvDay - d.exp))), 1)} kWh til batteriet`)
      + cell('var(--coral)', 'Købt for i dag', num(cost, 2), 'kr', Number.isFinite(avgP) ? `snit ${num(avgP, 2)} kr/kWh` : 'ingen køb endnu')
      + cell('var(--emer)', 'Sparet i dag', num(saved, 2), 'kr', `egen sol ${num(Math.max(0, d.pvDay - d.exp), 1)} kWh`, saved > .05 ? 'pos' : '')
      + cell('var(--gold)', 'Solgt i dag', num(d.exp, 1), 'kWh', d.exp > .05 ? `≈ ${num(sale, 2)} kr ved spotpris` : 'intet solgt endnu')
      + cell('var(--ice)', 'Netto i dag', num(net, 2), 'kr', `produceret ${num(d.pvDay, 1)} kWh · brugt ${num(d.cons, 1)} kWh`));
  }
  // The embedded cards get this card's entities (mapped to their own keys); a new config is passed on when it changes.
  _embed(id, tag, cfg) { const f = this.$(id); if (!f || !customElements.get(tag)) return; const key = JSON.stringify(cfg);
    if (!f.cfg || f._thKey !== key) { f._thKey = key; f.setConfig(cfg); } f.hass = this._h; }
  _batc() { this._embed('batc', 'th-battery-card', this._bcfg || (this._bcfg = batteryCardConfig(this.cfg))); }
  _flow() { this._embed('flow', 'th-energy-flow-card', this._fcfg || (this._fcfg = flowCardConfig(this.cfg))); }
  _price(d) {
    if (!this.hasPrice) return;
    this.set('pNow', num(d.priceNow, 2));
    const rel = d.mean ? d.priceNow / d.mean : 1, c = this.$('pChip');
    c.style.setProperty('--c', rel < .9 ? 'var(--emer)' : rel > 1.1 ? 'var(--coral)' : 'var(--gold)');
    this.set('pChip', `<span class="dot"></span>${rel < .9 ? 'Billig lige nu' : rel > 1.1 ? 'Dyr lige nu' : 'Normal pris'}`);
    const all = this.prices, nowH = new Date(); nowH.setMinutes(0, 0, 0);
    const key = all.length + '|' + nowH.getTime(); if (key === this._pk || !all.length) return; this._pk = key;
    const W = 800, H = 220, pt = 20, pb = 30, max = Math.max(...all.map(p => p.price)) * 1.08, min = Math.min(...all.map(p => p.price)) * .9;
    const Xp = i => 10 + i / (all.length - 1) * (W - 20), Yp = v => pt + (H - pt - pb) * (1 - (v - min) / (max - min));
    const pts = all.map((p, i) => [Xp(i), Yp(p.price)]), line = smooth(pts);
    const ni = all.findIndex(p => new Date(p.hour).getTime() === nowH.getTime());
    const win = (len) => { let best = null; for (let i = Math.max(0, ni); i + len <= all.length; i++) { const a = all.slice(i, i + len).reduce((s, p) => s + p.price, 0) / len; if (!best || a < best.a) best = { i, a }; } return best; };
    const worst = () => { let b = null; for (let i = Math.max(0, ni); i + 3 <= all.length; i++) { const a = all.slice(i, i + 3).reduce((s, p) => s + p.price, 0) / 3; if (!b || a > b.a) b = { i, a }; } return b; };
    const cw = win(3), ww = worst();
    let g = `<defs><linearGradient id="gPA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8c37e" stop-opacity=".28"/><stop offset="1" stop-color="#e8c37e" stop-opacity="0"/></linearGradient>
      <linearGradient id="gPL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9e7a"/><stop offset=".5" stop-color="#e8c37e"/><stop offset="1" stop-color="#6be3a8"/></linearGradient>
      <linearGradient id="gPLx" gradientUnits="userSpaceOnUse" x1="0" y1="${pt}" x2="0" y2="${H - pb}"><stop offset="0" stop-color="#ff9e7a"/><stop offset=".55" stop-color="#e8c37e"/><stop offset="1" stop-color="#6be3a8"/></linearGradient></defs>`;
    if (cw) g += `<rect x="${Xp(cw.i)}" y="${pt - 6}" width="${Xp(cw.i + 2) - Xp(cw.i)}" height="${H - pt - pb + 6}" rx="10" fill="rgba(107,227,168,.09)" stroke="rgba(107,227,168,.3)" stroke-dasharray="3 4"/>
      <text x="${(Xp(cw.i) + Xp(cw.i + 2)) / 2}" y="${pt - 10}" text-anchor="middle" fill="#6be3a8" font-size="11" font-weight="600">BILLIGST</text>`;
    for (let i = 0; i < all.length; i++) { const t = new Date(all[i].hour); if (t.getHours() % 6 === 0) g += `<text x="${Xp(i)}" y="${H - 8}" fill="rgba(244,241,234,.38)" font-size="11" text-anchor="middle">${h2(t.getHours())}</text>`;
      if (t.getHours() === 0 && i) g += `<line x1="${Xp(i)}" x2="${Xp(i)}" y1="${pt}" y2="${H - pb}" stroke="rgba(244,241,234,.12)" stroke-dasharray="2 4"/><text x="${Xp(i) + 6}" y="${pt + 10}" fill="rgba(244,241,234,.45)" font-size="11">I morgen</text>`; }
    g += `<path d="${line} L${Xp(all.length - 1)} ${H - pb} L${Xp(0)} ${H - pb}Z" fill="url(#gPA)" class="fadein"/>`;
    g += `<path d="${line}" fill="none" stroke="url(#gPLx)" stroke-width="2.6" stroke-linecap="round" class="draw"/>`;
    if (ni >= 0) g += `<line x1="${Xp(ni)}" x2="${Xp(ni)}" y1="${pt}" y2="${H - pb}" stroke="rgba(244,241,234,.35)"/><circle cx="${Xp(ni)}" cy="${Yp(all[ni].price)}" r="14" fill="#e8c37e" opacity=".18"><animate attributeName="r" values="8;18;8" dur="2.4s" repeatCount="indefinite"/></circle><circle cx="${Xp(ni)}" cy="${Yp(all[ni].price)}" r="5" fill="#fff6dc"/>`;
    g += `<line class="hx" y1="${pt}" y2="${H - pb}" stroke="rgba(244,241,234,.4)" opacity="0"/><circle class="hd" r="5" fill="#fff" opacity="0"/>`;
    const svg = this.$('pChart').querySelector('svg'), tip = this.$('pChart').querySelector('.tip'); svg.innerHTML = g;
    const move = e => { const b = svg.getBoundingClientRect(), i = clamp(Math.round(((e.clientX - b.left) / b.width * W - 10) / (W - 20) * (all.length - 1)), 0, all.length - 1), p = all[i];
      svg.querySelector('.hx').setAttribute('x1', Xp(i)); svg.querySelector('.hx').setAttribute('x2', Xp(i)); svg.querySelector('.hx').setAttribute('opacity', 1);
      const hd = svg.querySelector('.hd'); hd.setAttribute('cx', Xp(i)); hd.setAttribute('cy', Yp(p.price)); hd.setAttribute('opacity', 1);
      tip.innerHTML = `${new Date(p.hour).toLocaleString('da-DK', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}<br><b>${num(p.price, 2)} kr</b>`;
      tip.style.left = clamp(Xp(i) / W * b.width, 50, b.width - 50) + 'px'; tip.style.top = (Yp(p.price) / H * b.height) + 'px'; tip.style.opacity = 1; };
    svg.onpointermove = move; svg.onpointerdown = move; svg.onpointerleave = () => { tip.style.opacity = 0; svg.querySelector('.hx').setAttribute('opacity', 0); svg.querySelector('.hd').setAttribute('opacity', 0); };
    const t = i => `kl. ${h2(new Date(all[i].hour).getHours())}–${h2((new Date(all[i].hour).getHours() + 3) % 24)}${new Date(all[i].hour).getDate() !== new Date().getDate() ? ' i morgen' : ''}`;
    this.set('pPills', `${cw ? `<div class="pill2" style="color:var(--emer)">${ico('leaf', 16)}<span class="mut">Billigst</span><b>${t(cw.i)}</b><span>${num(cw.a, 2)} kr</span></div>` : ''}
      ${ww ? `<div class="pill2" style="color:var(--coral)">${ico('bolt', 16)}<span class="mut">Dyrest</span><b>${t(ww.i)}</b><span>${num(ww.a, 2)} kr</span></div>` : ''}
      <div class="pill2">${ico('chart', 16)}<span>Snit i dag</span><b>${num(this.at('price', 'today_mean') || 0, 2)} kr</b></div>
      ${this.E.co2 ? `<div class="pill2">${ico('leaf', 16)}<span>CO₂ i nettet</span><b>${Math.round(this.n('co2'))} g/kWh</b></div>` : ''}`);
  }

  _ctl(d) {
    const c = this.$('invChip'); c.style.setProperty('--c', d.off || d.fault ? 'var(--red)' : 'var(--emer)');
    this.set('invChip', `<span class="dot"></span>${d.off ? 'Offline' : d.fault ? 'Fejl' : 'Kører normalt'}`);
    const r = (k, v) => `<div class="row"><span>${k}</span><b>${v}</b></div>`;
    this.set('ctlRows', r('Inverter', `${esc(this.st('invStatus'))} · ${kwS(d.inv)}`) + r('Driftsform', nm(this.st('mode'))) + r('Opladning fra elnet', this.st('gridCh') === 'on' ? 'Tilladt' : 'Slået fra')
      + (this.E.maxFeed ? r('Maks. salg til net', kwS(this.n('maxFeed'))) : '') + r('Alarmer', d.alarm === 'None' ? 'Ingen' : esc(d.alarm)));
  }

  _totals(d) {
    const t = (k, v, u) => `<div><small>${k}</small><b>${v}<em>${u}</em></b></div>`, big = v => Math.round(v).toLocaleString('da-DK');
    const opt = k => this.E[k] ? big(this.n(k)) : '–';
    this.set('tot', t('DENNE MÅNED', opt('month'), 'kWh') + t('I ÅR', opt('year'), 'kWh') + t('PRODUCERET I ALT', big(this.n('pvTot')), 'kWh')
      + t('SOLGT I ALT', big(this.n('expTot')), 'kWh') + t('BATTERI-CYKLUSSER', big(this.n('batTotDis') / this.batKwh()), 'stk') + t('SPARET I DAG (CA.)', big(d.saved), 'kr'));
  }

  async _history() {
    if (!this._h || !(this.E.pv || this.E.load || this.E.soc)) return;
    try {
      const t0 = Date.now() - 864e5, B = 144, step = 864e5 / B;
      const r = await this._h.callWS({ type: 'history/history_during_period', start_time: new Date(t0).toISOString(), entity_ids: [this.E.pv, this.E.load, this.E.soc].filter(Boolean), minimal_response: true, no_attributes: true });
      const bucket = arr => { const out = new Array(B).fill(null), n = new Array(B).fill(0); let last = null;
        for (const p of arr || []) { const v = parseFloat(p.s), ts = (p.lu || p.lc) * 1000, i = Math.floor((ts - t0) / step); if (!Number.isFinite(v)) { if (i < 0) last = null; continue; } if (i < 0) { last = v; continue; } if (i < B) { out[i] = (out[i] || 0) + v; n[i]++; } }
        for (let i = 0; i < B; i++) { if (n[i]) { out[i] /= n[i]; last = out[i]; } else out[i] = last; } return out; };
      this._series = { pv: bucket(r[this.E.pv]), load: bucket(r[this.E.load]), soc: bucket(r[this.E.soc]), t0, step }; this._histKey = Date.now();
      this._drawHist(); if (this._d) this._sun(this._d);
    } catch (e) { console.warn('th-energy history', e); }
  }
  _drawHist() {
    const S = this._series; if (!S) return;
    const W = 800, H = 240, pt = 14, pb = 26, B = S.pv.length, max = Math.max(1500, ...S.pv.filter(v => v != null), ...S.load.filter(v => v != null)) * 1.1;
    const Xh = i => i / (B - 1) * W, Yh = v => pt + (H - pt - pb) * (1 - v / max), Ys = v => pt + (H - pt - pb) * (1 - v / 100);
    const series = (a, f) => segs(a.map((v, i) => [Xh(i), v == null ? null : f(v)]));
    let g = `<defs><linearGradient id="gHS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8c37e" stop-opacity=".4"/><stop offset="1" stop-color="#e8c37e" stop-opacity="0"/></linearGradient>
      <linearGradient id="gHL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ed1ff" stop-opacity=".16"/><stop offset="1" stop-color="#8ed1ff" stop-opacity="0"/></linearGradient></defs>`;
    for (let k = 0; k < 4; k++) { const y = pt + (H - pt - pb) * k / 3; g += `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="rgba(244,241,234,.06)"/>`; if (k < 3) g += `<text x="0" y="${y - 5}" fill="rgba(244,241,234,.35)" font-size="11">${num(max * (1 - k / 3) / 1000, 1)} kW</text>`; }
    for (let i = 0; i < B; i++) { const t = new Date(S.t0 + i * S.step); if (t.getMinutes() < 10 && t.getHours() % 4 === 0) g += `<text x="${Xh(i)}" y="${H - 6}" fill="rgba(244,241,234,.38)" font-size="11" text-anchor="middle">${h2(t.getHours())}.00</text>`; }
    for (const sg of series(S.load, Yh)) g += `<path d="${smooth(sg)} L${sg[sg.length - 1][0]} ${H - pb} L${sg[0][0]} ${H - pb}Z" fill="url(#gHL)" class="fadein"/><path d="${smooth(sg)}" fill="none" stroke="var(--ice)" stroke-width="1.6" class="draw" opacity=".85"/>`;
    for (const sg of series(S.pv, Yh)) g += `<path d="${smooth(sg)} L${sg[sg.length - 1][0]} ${H - pb} L${sg[0][0]} ${H - pb}Z" fill="url(#gHS)" class="fadein"/><path d="${smooth(sg)}" fill="none" stroke="var(--gold)" stroke-width="2.2" class="draw"/>`;
    for (const sg of series(S.soc, Ys)) g += `<path d="${smooth(sg)}" fill="none" stroke="var(--emer)" stroke-width="1.4" stroke-dasharray="4 5" class="fadein"/>`;
    g += `<line class="hx" y1="${pt}" y2="${H - pb}" stroke="rgba(244,241,234,.4)" opacity="0"/>`;
    const svg = this.$('hChart').querySelector('svg'), tip = this.$('hChart').querySelector('.tip'); svg.innerHTML = g;
    const f = v => v == null ? '–' : kwS(v);
    const move = e => { const b = svg.getBoundingClientRect(), i = clamp(Math.round((e.clientX - b.left) / b.width * (B - 1)), 0, B - 1), hx = svg.querySelector('.hx');
      hx.setAttribute('x1', Xh(i)); hx.setAttribute('x2', Xh(i)); hx.setAttribute('opacity', 1);
      tip.innerHTML = `<b>${hm(new Date(S.t0 + i * S.step))}</b><br><span style="color:var(--gold)">Sol ${f(S.pv[i])}</span><br><span style="color:var(--ice)">Forbrug ${f(S.load[i])}</span><br><span style="color:var(--emer)">Batteri ${S.soc[i] == null ? '–' : Math.round(S.soc[i]) + ' %'}</span>`;
      tip.style.left = clamp(Xh(i) / W * b.width, 60, b.width - 60) + 'px'; tip.style.top = (b.height * .35) + 'px'; tip.style.opacity = 1; };
    svg.onpointermove = move; svg.onpointerdown = move; svg.onpointerleave = () => { tip.style.opacity = 0; svg.querySelector('.hx').setAttribute('opacity', 0); };
  }

  open(kind) {
    if (this._sheet) this._sheet.remove();
    const s = document.createElement('th-energy-sheet'); s.card = this; s.kind = kind;
    s.style.fontFamily = getComputedStyle(this).fontFamily;
    s.addEventListener('closed', () => { if (this._sheet === s) this._sheet = null; });
    document.body.appendChild(s); this._sheet = s; s.hass = this._h;
  }
}

/* ======================= detalje- og styringsark ======================= */
class ThEnergySheet extends HTMLElement {
  connectedCallback() {
    this._r = this.attachShadow({ mode: 'open' }); this._dirty = {};
    this._esc = e => { if (e.key === 'Escape') this.close(); }; window.addEventListener('keydown', this._esc);
    this._render(true);
  }
  disconnectedCallback() { window.removeEventListener('keydown', this._esc); }
  close() { const sh = this._r.querySelector('.sh'); sh.style.transition = 'transform .35s, opacity .35s'; sh.style.transform = 'translateY(40px)'; sh.style.opacity = '0';
    this._r.querySelector('.bg').style.opacity = 0; setTimeout(() => { this.dispatchEvent(new Event('closed')); this.remove(); }, 300); }
  set hass(h) { this._h = h; if (this._r && !Object.keys(this._dirty).length && !this._busy && Date.now() - (this._touch || 0) > 12000 && Date.now() - (this._lr || 0) > 8000) this._render(false); }
  get c() { return this.card; }
  $(id) { return this._r.getElementById(id); }

  _render(first) {
    this._lr = Date.now();
    const c = this.c, d = c.calc(), k = this.kind;
    const S = c.S, kwh = c.batKwh(), solarSub = [S.panels ? `${S.panels} paneler` : '', S.inverterModel || ''].filter(Boolean).join(' · ');
    const META = { solar: ['Solceller', 'var(--gold)', 'sun', esc(solarSub)], grid: ['Elnet', 'var(--vio)', 'grid', 'EMMA energistyring'], battery: ['Batteri', 'var(--emer)', 'battery', `${c.layout.batteries}× LUNA2000 · ca. ${num(kwh, kwh % 1 ? 1 : 0)} kWh`],
      ev: ['Elbil‑lader', 'var(--rose)', 'car', esc(S.chargerModel || '')], control: ['Styring', 'var(--gold)', 'gear', 'Ændringer sendes først, når du trykker Anvend'] }[k] || ['Detaljer', 'var(--gold)', 'gear', ''];
    const cell = (l, v, col) => `<div class="cell"><small>${l}</small><b ${col ? `style="color:${col}"` : ''}>${v}</b></div>`;
    let body = '';
    if (k === 'solar') { const s1 = c.n('pv1v') * c.n('pv1a'), s2 = c.n('pv2v') * c.n('pv2a');
      body = `<div class="grid">${cell('Produktion nu', kwS(d.pv), 'var(--gold)')}${cell('I dag', num(d.pvDay, 1) + ' kWh')}${cell('Denne time', num(c.n('hourY'), 2) + ' kWh')}${cell('Peak i dag', kwS(c.n('peak')))}</div>
      <div class="grp">Strenge</div><div class="grid">${cell('Streng 1', kwS(s1), 'var(--gold)')}${cell('Streng 1 spænding', `${Math.round(c.n('pv1v'))} V · ${num(c.n('pv1a'), 2)} A`)}${cell('Streng 2', kwS(s2), 'var(--gold)')}${cell('Streng 2 spænding', `${Math.round(c.n('pv2v'))} V · ${num(c.n('pv2a'), 2)} A`)}</div>
      <div class="grp">Inverter</div><div class="grid">${cell('Status', esc(c.st('invStatus')), d.fault ? 'var(--red)' : 'var(--emer)')}${cell('Virkningsgrad', num(c.n('eff'), 1) + ' %')}${cell('Alarmer', d.alarm === 'None' ? 'Ingen' : esc(d.alarm))}${cell('AC‑effekt', kwS(d.inv))}</div>
      <div class="note">${esc(c.st('invState'))}</div>`; }
    else if (k === 'grid') body = `<div class="grid">${cell(d.grid > 0 ? 'Køber nu' : 'Sælger nu', kwS(d.grid), d.grid > 0 ? 'var(--vio)' : 'var(--coral)')}${cell('Købt i dag', num(d.imp, 1) + ' kWh')}${cell('Solgt i dag', num(d.exp, 1) + ' kWh')}${c.hasPrice ? cell('Elpris nu', num(d.priceNow, 2) + ' kr') : ''}
      ${cell('Købt i alt', Math.round(c.n('impTot')).toLocaleString('da-DK') + ' kWh')}${cell('Solgt i alt', Math.round(c.n('expTot')).toLocaleString('da-DK') + ' kWh')}${c.E.co2 ? cell('CO₂ i nettet', Math.round(c.n('co2')) + ' g/kWh') : ''}</div>`;
    else if (k === 'battery') body = `<div class="grid">${cell('Ladestand', Math.round(d.soc) + ' %', 'var(--emer)')}${cell('Effekt', kwS(d.bat))}${cell('Status', c.st('batStatus') === 'Running' ? 'Kører' : esc(c.st('batStatus')))}${cell('Driftsform', nm(c.st('mode')))}
      ${cell('Ladet i dag', num(d.ch, 1) + ' kWh')}${cell('Afladet i dag', num(d.dis, 1) + ' kWh')}${cell('Ladet i alt', Math.round(c.n('batTotCh')).toLocaleString('da-DK') + ' kWh')}${cell('Afladet i alt', Math.round(c.n('batTotDis')).toLocaleString('da-DK') + ' kWh')}</div>
      <button class="btn gold" id="toCtl">Åbn styring</button>`;
    else if (k === 'ev') body = `<div class="grid">${cell('Status', d.evOn ? 'Lader' : 'Standby', d.evOn ? 'var(--rose)' : '')}${cell('Temperatur', num(c.n('evTemp'), 1) + ' °C')}${cell('Ladet i alt', Math.round(d.evTot).toLocaleString('da-DK') + ' kWh', 'var(--rose)')}${c.hasPrice ? cell('Elpris nu', num(d.priceNow, 2) + ' kr') : ''}</div>
      <div class="note">Huawei‑integrationen i Home Assistant kan kun aflæse laderen. Start/stop og ladestrøm styres i FusionSolar‑appen. “Lader” vises, når den samlede ladede energi stiger.</div>`;
    else body = `<div class="grid">${cell('Batteri', Math.round(d.soc) + ' %', 'var(--emer)')}${cell('Batterieffekt', kwS(d.bat))}${c.hasPrice ? cell('Elpris nu', num(d.priceNow, 2) + ' kr') : ''}</div>
      <div class="grp">Batteri</div>
      ${this._sel('mode', 'Driftsform', 'Maks. egetforbrug bruger sol og batteri først. Tidsstyret følger tidsplanen i FusionSolar.', 'var(--emer)')}
      ${this._sel('ess', 'EMMA‑styring', 'Hvordan EMMA styrer hele anlægget.', 'var(--emer)', o => !o.startsWith('reserved'))}
      ${this._sel('tou', 'Overskudssol ved tidsstyring', '', 'var(--gold)')}
      ${this._sw('gridCh', 'Opladning fra elnettet', 'Lad batteriet med strøm fra nettet, fx når prisen er lav.', 'var(--vio)')}
      ${this._num('eod', 'Mindste ladestand', 'Batteriet aflader ikke under denne grænse.', 'var(--emer)', '%')}
      ${this._num('eoc', 'Største ladestand', '', 'var(--emer)', '%')}
      ${this._num('gridCut', 'Stop netopladning ved', '', 'var(--vio)', '%')}
      ${this._num('maxCh', 'Maks. ladeeffekt', '', 'var(--emer)', 'W', 100)}
      ${this._num('maxDis', 'Maks. afladeeffekt', '', 'var(--emer)', 'W', 100)}
      ${c.st('forc') !== 'Stopped' && c.st('forc') !== '–' ? `<div class="ctl"><div class="h">Tvangsopladning kører<button class="btn red" id="stopF">Stop</button></div></div>` : ''}
      <div class="grp">Elnet og inverter</div>
      ${this._num('maxFeed', 'Maks. salg til elnettet', '0 W betyder, at der ikke sælges strøm.', 'var(--coral)', 'W', 100, 0, S.gridMaxW)}
      ${this._num('derate', 'Effektbegrænsning på inverteren', Number.isFinite(+c.at('derate', 'max')) ? `${groupThousands(c.at('derate', 'max'))} W betyder ingen begrænsning.` : '', 'var(--gold)', 'W', 100)}
      ${this._sw('invSwitch', 'Inverter tændt', 'Slukker du, stopper al solcelleproduktion.', 'var(--gold)')}`;
    this._r.innerHTML = `<style>${SHEET_CSS}</style><div class="bg"></div><div class="sh" style="--c:${META[1]}"><div class="grab"></div>
      <div class="top"><div class="ic">${ico(META[2], 22)}</div><h2>${META[0]}<small>${META[3]}</small></h2><button class="x" aria-label="Luk">${ico('close', 18)}</button></div>
      ${body}
      <div class="bar" id="bar"><span id="barT" style="font-size:13px;font-weight:600"></span><div style="display:flex;gap:8px"><button class="btn" id="undo">Fortryd</button><button class="btn gold" id="ok">Anvend</button></div></div>
    </div><div class="toast" id="toast"></div>`;
    if (!first) { const sh = this._r.querySelector('.sh'); sh.style.animation = 'none'; this._r.querySelector('.bg').style.animation = 'none'; }
    this._r.querySelector('.bg').onclick = () => this.close(); this._r.querySelector('.x').onclick = () => this.close();
    const sh = this._r.querySelector('.sh'); for (const ev of ['pointerdown', 'input', 'wheel', 'touchstart']) sh.addEventListener(ev, () => { this._touch = Date.now(); }, { passive: true });
    this.$('undo').onclick = () => { this._dirty = {}; this._render(false); }; this.$('ok').onclick = () => this._apply();
    const tc = this.$('toCtl'); if (tc) tc.onclick = () => { this.kind = 'control'; this._render(true); };
    const sf = c.E.stopForc && this.$('stopF'); if (sf) sf.onclick = async () => { await this._h.callService('button', 'press', { entity_id: c.E.stopForc }); this._toast('Tvangsopladning stoppet'); };
    this._wire();
  }
  _sel(k, t, help, col, filt = () => true) { const s = this.c.s(k); if (!s) return ''; const cur = this._dirty[k] ?? s.state;
    return `<div class="ctl ${k in this._dirty ? 'dirty' : ''}" style="--c:${col}"><div class="h">${t}<small>${nm(s.state)}</small></div>${help ? `<p>${help}</p>` : ''}
      <div class="seg" data-k="${k}">${(s.attributes.options || []).filter(filt).map(o => `<button data-v="${o}" class="${o === cur ? 'on' : ''}">${nm(o)}</button>`).join('')}</div></div>`; }
  _sw(k, t, help, col) { const s = this.c.s(k); if (!s) return ''; const cur = this._dirty[k] ?? s.state;
    return `<div class="ctl ${k in this._dirty ? 'dirty' : ''}" style="--c:${col}"><div class="h">${t}<button class="sw ${cur === 'on' ? 'on' : ''}" data-sw="${k}" aria-label="${t}"></button></div>${help ? `<p>${help}</p>` : ''}</div>`; }
  _num(k, t, help, col, unit, step, min, max) { const s = this.c.s(k); if (!s) return ''; const a = s.attributes; min = min ?? a.min; max = max ?? a.max; step = step || a.step || 1;
    const cur = parseFloat(this._dirty[k] ?? s.state), p = (cur - min) / (max - min) * 100, show = v => unit === 'W' ? kwS(v) : `${num(v, step < 1 ? 1 : 0)} ${unit}`;
    return `<div class="ctl ${k in this._dirty ? 'dirty' : ''}" style="--c:${col}"><div class="h">${t}</div>${help ? `<p>${help}</p>` : ''}
      <div class="rng"><input type="range" data-n="${k}" data-u="${unit}" data-st="${step}" min="${min}" max="${max}" step="${step}" value="${cur}" style="--p:${p}%"><output id="o-${k}">${show(cur)}</output></div></div>`; }
  _wire() {
    this._r.querySelectorAll('.seg').forEach(sg => sg.querySelectorAll('button').forEach(b => b.onclick = () => { sg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); this._mark(sg.dataset.k, b.dataset.v, sg.closest('.ctl')); }));
    this._r.querySelectorAll('[data-sw]').forEach(b => b.onclick = () => { b.classList.toggle('on'); this._mark(b.dataset.sw, b.classList.contains('on') ? 'on' : 'off', b.closest('.ctl')); });
    this._r.querySelectorAll('[data-n]').forEach(i => { i.oninput = () => { const v = parseFloat(i.value); i.style.setProperty('--p', (v - i.min) / (i.max - i.min) * 100 + '%');
      this.$('o-' + i.dataset.n).textContent = i.dataset.u === 'W' ? kwS(v) : `${num(v, parseFloat(i.dataset.st) < 1 ? 1 : 0)} ${i.dataset.u}`; }; i.onchange = () => this._mark(i.dataset.n, i.value, i.closest('.ctl')); });
  }
  _mark(k, v, el) {
    const s = this.c.s(k); if (s && (String(s.state) === String(v) || (Number.isFinite(parseFloat(v)) && parseFloat(s.state) === parseFloat(v)))) delete this._dirty[k]; else this._dirty[k] = v;
    el && el.classList.toggle('dirty', k in this._dirty);
    const n = Object.keys(this._dirty).length;
    this.$('barT').textContent = this._dirty.invSwitch === 'off' ? 'Advarsel: inverteren slukkes' : n ? `${n} ændring${n > 1 ? 'er' : ''} klar` : '';
    this.$('bar').classList.toggle('show', n > 0);
  }
  async _apply() {
    this._busy = true; const ok = this.$('ok'); ok.textContent = 'Sender…'; ok.disabled = true;
    try {
      for (const [k, v] of Object.entries(this._dirty)) { const id = this.c.E[k]; if (!id) continue; const dom = id.split('.')[0];
        if (dom === 'select') await this._h.callService('select', 'select_option', { entity_id: id, option: v });
        else if (dom === 'switch') await this._h.callService('switch', v === 'on' ? 'turn_on' : 'turn_off', { entity_id: id });
        else if (dom === 'number') await this._h.callService('number', 'set_value', { entity_id: id, value: parseFloat(v) }); }
      this._dirty = {}; this.$('bar').classList.remove('show'); this._toast('Gemt på anlægget');
    } catch (e) { this._toast('Fejl: ' + (e.message || e)); }
    ok.textContent = 'Anvend'; ok.disabled = false; this._busy = false; setTimeout(() => this._render(false), 1500);
  }
  _toast(t) { const e = this.$('toast'); e.textContent = t; e.classList.add('show'); clearTimeout(this._tt); this._tt = setTimeout(() => e.classList.remove('show'), 2600); }
}

if (!customElements.get('th-energy-card')) customElements.define('th-energy-card', ThEnergyCard);
if (!customElements.get('th-energy-sheet')) customElements.define('th-energy-sheet', ThEnergySheet);
window.customCards = window.customCards || [];
if (!window.customCards.find(c => c.type === 'th-energy-card')) window.customCards.push({ type: 'th-energy-card', name: 'TH Energy', description: 'Samlet energiside', preview: false });
console.info(`%c TH-ENERGY %c ${VE_VERSION} `, 'background:#e8c37e;color:#111;font-weight:700', 'background:#222;color:#fff');
