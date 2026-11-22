/* Huawei Solar Card – one energy page with live info, control and popups (Huawei Solar integration).
 * type: custom:huawei-solar-card
 * section: main | side | all | 3d   (main = flow + strings + chart, side = today + battery + price + devices,
 *          3d = animated 3D diorama of the site; see README.md for every option)
 */
import { STYLE, STYLE3D } from './styles.js';
import { NS, ICON, ic, esc, lbl, fmtW, fmtN, kwh, hh } from './util.js';
import { histChart, priceChart, cheapestWindow } from './charts.js';
import { resolveCardEntities, plantConfig, normalizeSite } from './config.js';
import { HuaweiSolarPopup } from './popup.js';
import { Scene3D } from './scene3d.js';

const HSC_VERSION = '3.0.0';

/* ======================= card ======================= */
export class HuaweiSolarCard extends HTMLElement {
  setConfig(c) {
    this.config = { section: 'all', ...c };
    this._E = resolveCardEntities(this.config); this._plant = plantConfig(this.config); this._site = normalizeSite(this.config.site);
    if (this._root) this._build();
  }
  getCardSize() { return this.config.section === 'side' ? 6 : this.config.section === '3d' ? 8 : 7; }
  static getStubConfig() { return { section: 'all' }; }

  set hass(h) {
    this._hass = h;
    if (!this._root) this._build();
    const now = Date.now();
    if (!this._lastUpd || now - this._lastUpd > 900) { this._lastUpd = now; this._update(); }
    else if (!this._pending) { this._pending = setTimeout(() => { this._pending = null; this._lastUpd = Date.now(); this._update(); }, 900); }
    if (this._popup) this._popup.hass = h;
    if (!this._histAt || now - this._histAt > 5 * 60e3) { this._histAt = now; this._loadHistory(); }
  }
  connectedCallback() {
    this._run = true; requestAnimationFrame(t => this._anim(t));
    if (!this._ro) this._ro = new ResizeObserver(en => { const w = en[0].contentRect.width; this.classList.toggle('narrow', w > 0 && w < 520); });
    this._ro.observe(this);
  }
  disconnectedCallback() { this._run = false; if (this._ro) this._ro.disconnect(); }

  /** Entity id for a key of ENTITY_SPEC (null when not configured); a full entity id passes through. */
  eid(k) { const map = this._E || (this._E = resolveCardEntities(this.config)); return k in map ? map[k] : String(k).includes('.') ? k : null; }
  has(k) { return !!this.eid(k); }
  s(k) { const id = this.eid(k); return this._hass && id ? this._hass.states[id] : undefined; }
  n(k) { const s = this.s(k); const v = s ? parseFloat(s.state) : NaN; return isNaN(v) ? 0 : v; }
  st(k) { const s = this.s(k); return s ? s.state : '–'; }
  a(k, at) { const s = this.s(k); return s ? s.attributes[at] : undefined; }
  $(id) { return this._root.getElementById(id); }
  get prices() { return [...(this.a('price', 'raw_today') || []), ...(this.a('price', 'raw_tomorrow') || [])]; }

  _build() {
    if (!this._root) this._root = this.attachShadow({ mode: 'open' });
    const sec = this.config.section, is3d = sec === '3d', main = !is3d && sec !== 'side', side = !is3d && sec !== 'main';
    if (this._3d) { this._3d.dead = true; this._3d.renderer.dispose(); this._3d.io.disconnect(); this._3d.ro.disconnect(); this._3d = null; }
    this._root.innerHTML = `<style>${STYLE}${is3d ? STYLE3D : ''}</style><div class="wrap">${is3d ? this._sceneHTML() : ''}${main ? this._mainHTML() : ''}${side ? this._sideHTML() : ''}</div>`;
    this._flows = null; this._tw = {}; this._pk = null;
    if (main) { this._initFlow(); if (this.config.flow === false) this.$('main').classList.add('noflow'); }
    if (is3d) this._init3d();
    this._root.querySelectorAll('[data-pop]').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); if (el.dataset.focus && this._3d) this._focus3d(el.dataset.focus, el.dataset.pop); else this.openPopup(el.dataset.pop); }));
    if (this._series) this._drawHist();
  }

  _node(id, pop, x, y, r, col, icon, extra = '') {
    return `<g class="node" data-pop="${pop}" transform="translate(${x} ${y})" id="${id}" style="--nc:${col}">
      <circle class="halo" r="${r}" stroke="${col}"/>
      <circle class="disc" r="${r}" fill="url(#rg-${id})" stroke="${col}" stroke-opacity=".55" stroke-width="1.1"/>
      <g class="ico" style="color:${col}"><svg x="${-r * .55}" y="${-r * .55}" width="${r * 1.1}" height="${r * 1.1}" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">${ICON[icon]}</svg></g>${extra}
    </g>`;
  }

  _mainHTML() {
    const rg = (id, c) => `<radialGradient id="rg-${id}" cx=".5" cy=".35" r=".75"><stop offset="0" style="stop-color:${c}" stop-opacity=".22"/><stop offset="1" style="stop-color:${c}" stop-opacity=".02"/></radialGradient>`;
    return `
    <div class="card" id="main" style="--glow:var(--sun)">
      <div class="top"><div style="min-width:0"><div class="eb">Solcelleanlæg · Huawei</div><div class="ttl" id="summary">&nbsp;</div></div>
        <span class="pill" id="live"><span class="d"></span><span id="liveTxt">Live</span></span></div>

      <div class="flow"><svg viewBox="0 0 600 272" id="flowSvg">
        <defs>${rg('nPV', 'var(--sun)')}${rg('nGrid', 'var(--grid)')}${rg('nHome', 'var(--home)')}${rg('nBat', 'var(--bat)')}${rg('nEV', 'var(--ev)')}${rg('nHub', 'var(--ink)')}
          <filter id="glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          <radialGradient id="sunG"><stop offset="0" stop-color="#fff4d6" stop-opacity=".9"/><stop offset=".35" style="stop-color:var(--sun)" stop-opacity=".45"/><stop offset="1" style="stop-color:var(--sun)" stop-opacity="0"/></radialGradient>
        </defs>
        <path d="M20 40 Q300 -24 580 40" fill="none" stroke="currentColor" style="color:var(--ink)" opacity=".06" stroke-dasharray="1 6" stroke-linecap="round"/>
        <g id="skySun" style="transition:transform 2s,opacity 2s"><circle r="18" fill="url(#sunG)"/><circle r="3.5" fill="#fff6dc"/></g>

        <path id="pPV" class="track" d="M300 70 L300 112"/>
        <path id="pGrid" class="track" d="M272 140 L118 140"/>
        <path id="pHome" class="track" d="M328 140 L482 140"/>
        <path id="pBat" class="track" d="M300 168 L300 208"/>
        <path id="pEV" class="track" d="M328 140 C392 140 404 236 450 236"/>
        <path class="lit" id="lPV" d="M300 70 L300 112" style="stroke:var(--sun)"/><path class="lit" id="lGrid" d="M272 140 L118 140" style="stroke:var(--grid)"/>
        <path class="lit" id="lHome" d="M328 140 L482 140" style="stroke:var(--home)"/><path class="lit" id="lBat" d="M300 168 L300 208" style="stroke:var(--bat)"/>
        <path class="lit" id="lEV" d="M328 140 C392 140 404 236 450 236" style="stroke:var(--ev)"/>
        <g id="particles" filter="url(#glow)"></g>

        ${this._node('nPV', 'solar', 300, 42, 28, 'var(--sun)', 'panel')}
        <text x="342" y="32" class="nl">SOLCELLER</text><text x="342" y="52" class="nv" id="tPV">–</text><text x="342" y="66" class="ns" id="tPVs"></text>

        <g class="node" data-pop="inverter" transform="translate(300 140)" id="nHub">
          <rect x="-26" y="-26" width="52" height="52" rx="15" fill="url(#rg-nHub)" stroke="currentColor" style="color:var(--ink)" stroke-opacity=".22" stroke-width="1.1"/>
          <svg x="-13" y="-13" width="26" height="26" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" style="color:var(--ink)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" opacity=".85"><path d="M-6-1.5q3-5 6 0t6 0"/><path d="M-6 4.5h12" stroke-dasharray="2.4 1.8"/></svg>
          <circle id="invLed" cx="17" cy="-17" r="2.2" fill="var(--bat)"><animate attributeName="opacity" values="1;.25;1" dur="2.6s" repeatCount="indefinite"/></circle>
        </g>

        ${this._node('nGrid', 'grid', 90, 140, 28, 'var(--grid)', 'grid')}
        <text x="90" y="98" class="nl mid">ELNET</text><text x="90" y="192" class="nv mid" id="tGrid">–</text><text x="90" y="206" class="ns mid" id="tGrids"></text>

        ${this._node('nHome', 'home', 510, 140, 28, 'var(--home)', 'home')}
        <text x="510" y="98" class="nl mid">HUS</text><text x="510" y="192" class="nv mid" id="tHome">–</text><text x="510" y="206" class="ns mid" id="tHomes"></text>

        ${this._node('nBat', 'battery', 300, 236, 28, 'var(--bat)', 'battery')}
        <text x="258" y="230" class="nv end" id="tBat">–</text><text x="258" y="244" class="ns end" id="tBats"></text>

        ${this._node('nEV', 'ev', 472, 236, 22, 'var(--ev)', 'ev')}
        <text x="502" y="232" class="nl">ELBIL</text><text x="502" y="246" class="ns" id="tEV"></text>
      </svg></div>

      <div class="hair" id="hair0"></div>
      <div class="strip">
        <div class="click" data-pop="solar" style="margin:0;padding:0 12px 0 2px;border-radius:0"><div class="eb">I dag</div><div class="sv"><span id="sDay">–</span><small>kWh</small></div><div class="mbar" style="--c:var(--sun)"><i id="sDayB"></i></div></div>
        <div class="click" data-pop="solar" style="margin:0;border-radius:0"><div class="eb">Streng 1</div><div class="sv" id="s1">–</div><div class="mbar" style="--c:var(--sun)"><i id="s1b"></i></div></div>
        <div class="click" data-pop="solar" style="margin:0;border-radius:0"><div class="eb">Streng 2</div><div class="sv" id="s2">–</div><div class="mbar" style="--c:var(--sun)"><i id="s2b"></i></div></div>
        <div class="click" data-pop="solar" style="margin:0;border-radius:0"><div class="eb">Denne måned</div><div class="sv"><span id="sMonth">–</span><small>kWh</small></div><div class="mbar" style="--c:var(--sun)"><i id="sMonthB"></i></div></div>
      </div>
      <div class="hair"></div>
      <div class="sect" style="margin-bottom:4px"><div class="eb">Sidste 24 timer</div>
        <div class="leg"><span><i style="background:var(--sun)"></i>Sol</span><span><i style="background:var(--home)"></i>Forbrug</span><span><i style="background:var(--bat)"></i>Batteri</span></div></div>
      <div class="chart" id="hist"><div class="tip"></div><svg></svg></div>
    </div>`;
  }

  _sideHTML() {
    return `
    <div class="card" id="side" style="--glow:var(--bat);animation-delay:.08s">
      <div class="sect"><div class="eb">I dag</div><span class="pill" id="autPill" style="--c:var(--bat)"><span id="autTxt">–</span></span></div>
      <div class="quad click" data-pop="home" style="margin:-8px -8px 0;padding:8px">
        <div style="--c:var(--sun)"><div class="qk"><span class="dt"></span><span class="eb">Produceret</span></div><div class="qv"><span id="q0">–</span><small>kWh</small></div></div>
        <div style="--c:var(--home)"><div class="qk"><span class="dt"></span><span class="eb">Forbrug</span></div><div class="qv"><span id="q1">–</span><small>kWh</small></div></div>
        <div style="--c:var(--grid)"><div class="qk"><span class="dt"></span><span class="eb">Købt</span></div><div class="qv"><span id="q2">–</span><small>kWh</small></div></div>
        <div style="--c:var(--exp)"><div class="qk"><span class="dt"></span><span class="eb">Solgt</span></div><div class="qv"><span id="q3">–</span><small>kWh</small></div></div>
      </div>

      <div class="hair"></div>
      <div class="click" data-pop="battery">
        <div class="sect" style="margin-bottom:6px"><div class="eb">Batteri · LUNA2000</div><span class="pill" id="batPill" style="--c:var(--bat)">–</span></div>
        <div class="row2"><div class="batline"><div class="big"><span id="socTxt">–</span><small>%</small></div><div class="meta" id="batMeta"></div></div>
          <button class="ghost" data-pop="control" style="--c:var(--bat)">${ic('sliders', 14)}Styring</button></div>
        <div class="socbar" id="socbar"><i id="socFill"></i><span class="mk" id="mkMin"></span></div>
        <div class="meta" id="batMeta2"></div>
      </div>

      ${this.has('priceNow') || this.has('price') ? `<div class="hair"></div>
      <div class="click" data-pop="price">
        <div class="sect" style="margin-bottom:6px"><div class="eb">Elpris inkl. afgifter</div><span class="pill" id="pricePill">–</span></div>
        <div class="row2" style="align-items:flex-end"><div class="price"><span id="priceNow">–</span><small>kr/kWh</small></div><div class="meta" id="priceHint" style="text-align:right"></div></div>
        <div class="chart" id="priceMini" style="margin-top:10px"><div class="tip"></div><svg></svg></div>
      </div>` : ''}

      <div class="hair"></div>
      <div class="chips">
        <button class="chipb" data-pop="grid" id="cGrid" style="--c:var(--grid)"><div class="h">${ic('grid', 13)}Elnet</div><b id="cGridV">–</b><span id="cGridS">–</span></button>
        <button class="chipb" data-pop="inverter" id="cInv" style="--c:var(--sun)"><div class="h">${ic('inverter', 13)}Inverter</div><b id="cInvV">–</b><span id="cInvS">–</span></button>
        <button class="chipb" data-pop="ev" id="cEv" style="--c:var(--ev)"><div class="h">${ic('ev', 13)}Lader</div><b id="cEvV">–</b><span id="cEvS">–</span></button>
      </div>
    </div>`;
  }

  tween(id, val, fmt) {
    const el = this.$(id); if (!el) return;
    const from = this._tw[id] ?? 0; this._tw[id] = val; const t0 = performance.now();
    if (Math.abs(from - val) < 1e-6) { el.textContent = fmt(val); return; }
    const step = t => { const p = Math.min(1, (t - t0) / 1100), e = 1 - Math.pow(1 - p, 4); el.textContent = fmt(from + (val - from) * e); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  txt(id, t) { const el = this.$(id); if (el && el.textContent !== t) el.textContent = t; }
  html(id, t) { const el = this.$(id); if (el && el._h !== t) { el.innerHTML = t; el._h = t; } }
  width(id, frac) { const el = this.$(id); if (el) el.style.width = Math.max(1, Math.min(100, frac * 100)) + '%'; }
  pill(id, text, col) { const el = this.$(id); if (!el) return; const t = `<span class="d"></span>${esc(text)}`; if (el._h !== t) { el.innerHTML = t; el._h = t; } el.style.setProperty('--c', col); }

  /* ---- flow particles ---- */
  _initFlow() {
    this._flows = {}; this._parts = [];
    const pg = this.$('particles');
    for (const [id, c] of [['pPV', 'var(--sun)'], ['pGrid', 'var(--grid)'], ['pHome', 'var(--home)'], ['pBat', 'var(--bat)'], ['pEV', 'var(--ev)']]) {
      const el = this.$(id); const f = { el, len: 0, w: 0, dir: 1, c, vis: 0 }; this._flows[id] = f;
      for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
        const ci = document.createElementNS(NS, 'circle'); ci.style.opacity = 0; pg.appendChild(ci);
        this._parts.push({ id, c: ci, o: i / 5, lag: j * .018, k: 1 - j * .32 });
      }
    }
  }
  _anim(t) {
    if (!this._run) return;
    requestAnimationFrame(tt => this._anim(tt));
    if (!this._flows || document.hidden) { this._last = t; return; }
    const dt = Math.min(.1, (t - (this._last || t)) / 1000); this._last = t;
    const MAXW = this._plant.max_power;
    for (const id in this._flows) { const f = this._flows[id]; if (!f.len) f.len = f.el.getTotalLength() || 0; f.vis += ((f.w > 25 ? 1 : 0) - f.vis) * Math.min(1, dt * 2.5); f.ph = ((f.ph || 0) + dt * (.12 + Math.sqrt(Math.min(f.w, MAXW) / MAXW) * .55)) % 1; }
    for (const p of this._parts) {
      const f = this._flows[p.id]; if (f.vis < .02 || !f.len) { if (p.c.style.opacity !== '0') p.c.style.opacity = 0; continue; }
      const o = ((f.ph + p.o - p.lag) % 1 + 1) % 1;
      const pos = f.el.getPointAtLength((f.dir > 0 ? o : 1 - o) * f.len);
      const k = Math.sqrt(Math.min(f.w, MAXW) / MAXW);
      p.c.setAttribute('cx', pos.x); p.c.setAttribute('cy', pos.y); if (p.fc !== f.c) { p.c.style.fill = f.c; p.fc = f.c; }
      p.c.setAttribute('r', (1.9 + k * 2.3) * p.k);
      p.c.style.opacity = f.vis * p.k * Math.min(1, Math.min(o, 1 - o) * 7);
    }
  }
  _setFlow(id, lit, node, w, dir, c) {
    const f = this._flows[id]; f.w = w; f.dir = dir; if (c) f.c = c;
    const l = this.$(lit); l.style.opacity = w > 25 ? .5 : 0; if (c) l.style.stroke = c;
    if (node) { const n = this.$(node); n.querySelector('.halo').classList.toggle('on', w > 25); n.querySelector('.disc').setAttribute('stroke-opacity', w > 25 ? .9 : .35);
      if (c) { n.querySelector('.halo').setAttribute('stroke', c); n.querySelector('.disc').setAttribute('stroke', c); n.querySelector('.ico').style.color = c; } }
  }

  calc() {
    const pv = this.n('pv'), load = this.n('load'), inv = this.n('invAct'), bat = this.n('bat'), soc = this.n('soc');
    const grid = load - inv; // + import, − export
    const evTot = this.n('evTot');
    if (this._evLast != null && evTot > this._evLast) this._evUntil = Date.now() + 10 * 60e3;
    if (evTot > 0) this._evLast = evTot;
    const evOn = Date.now() < (this._evUntil || 0);
    const pvDay = this.n('pvDay'), cons = this.n('consDay'), impD = this.n('impDay'), expD = this.n('expDay');
    const selfUse = Math.max(0, pvDay - expD);
    const aut = cons > 0 ? Math.max(0, Math.min(100, (1 - impD / cons) * 100)) : 0;
    const priceNow = this.n('priceNow') || this.n('price'), hasPrice = this.has('priceNow') || this.has('price');
    const mean = this.a('price', 'today_mean') || priceNow;
    const ps = this.s('pv'); const offline = !ps || ['unavailable', 'unknown'].includes(ps.state);
    const alarm = this.st('alarms'); const fault = alarm !== 'None' && alarm !== '–' && !offline || this.st('invSwitch') === 'off';
    return { offline, fault, alarm, since: ps ? new Date(ps.last_changed) : null, pv, load, inv, bat, soc, grid, evOn, evTot, pvDay, cons, impD, expD, selfUse, aut, priceNow, mean, hasPrice };
  }

  _update() {
    if (!this._hass || !this._root) return;
    const d = this.calc();
    if (this._flows) this._updateMain(d);
    if (this.$('side')) this._updateSide(d);
    if (this._3d) this._update3d(d);
  }

  _updateMain(d) {
    const { pv, load, bat, soc, grid, evOn } = d;
    const off = d.offline;
    this.$('main').classList.toggle('offline', off);
    // sky
    const sun = this.s('sun'), el = sun ? sun.attributes.elevation : 0, az = sun ? sun.attributes.azimuth : 180;
    const tt = Math.max(0, Math.min(1, (az - 60) / 240));
    const x = (1 - tt) ** 2 * 20 + 2 * (1 - tt) * tt * 300 + tt * tt * 580, y = (1 - tt) ** 2 * 40 + 2 * (1 - tt) * tt * -24 + tt * tt * 40;
    const ss = this.$('skySun'); ss.style.transform = `translate(${x}px,${y}px)`; ss.style.opacity = el > 0 ? 1 : el > -4 ? .4 : 0;

    const imp = grid > 0, gcol = imp ? 'var(--grid)' : 'var(--exp)';
    this._setFlow('pPV', 'lPV', 'nPV', off ? 0 : pv, 1);
    this._setFlow('pHome', 'lHome', 'nHome', off ? 0 : load, 1);
    this._setFlow('pGrid', 'lGrid', 'nGrid', off ? 0 : Math.abs(grid), imp ? -1 : 1, gcol);
    this._setFlow('pBat', 'lBat', 'nBat', off ? 0 : Math.abs(bat), bat > 0 ? 1 : -1);
    this._setFlow('pEV', 'lEV', 'nEV', evOn ? 2500 : 0, 1);
    this.$('nEV').classList.toggle('ev-on', evOn);
    this.$('invLed').setAttribute('fill', off || d.fault ? 'var(--bad)' : 'var(--bat)');

    if (off) {
      for (const id of ['tPV', 'tHome', 'tGrid', 'tBat']) { this._tw[id] = 0; this.txt(id, '–'); }
      for (const id of ['tPVs', 'tHomes', 'tGrids', 'tBats']) this.txt(id, '');
      this.txt('summary', `Ingen forbindelse til anlægget${d.since ? ' siden ' + d.since.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' }) : ''}.`);
      this.pill('live', 'Offline', 'var(--bad)');
    } else {
      this.tween('tPV', pv, fmtW); this.txt('tPVs', pv > 50 ? `${Math.round(pv * 100 / this._plant.pv_capacity)} % af kapacitet` : el > 0 ? 'Lav sol' : 'Nat');
      this.tween('tHome', load, fmtW); this.txt('tHomes', `${Math.round(Math.min(1, pv / Math.max(load, 1)) * 100)} % fra sol`);
      this.tween('tGrid', grid, fmtW); this.txt('tGrids', Math.abs(grid) < 25 ? 'I balance' : imp ? 'Køber' : 'Sælger');
      this.$('tGrid').style.fill = Math.abs(grid) < 25 ? '' : gcol;
      this.tween('tBat', bat, fmtW); this.txt('tBats', Math.abs(bat) < 25 ? `${Math.round(soc)} % · hviler` : `${Math.round(soc)} % · ${bat > 0 ? 'lader' : 'aflader'}`);
      const solarOn = pv > 50, exp = grid < -25;
      this.txt('summary', d.fault ? 'Inverteren melder en fejl – tryk på inverteren for detaljer.'
        : solarOn && exp ? 'Solen dækker huset, og overskuddet sælges.'
        : solarOn && bat > 25 && !imp ? 'Solen dækker huset og lader batteriet.'
        : solarOn && imp ? `Solen dækker ${Math.round(Math.min(1, pv / Math.max(load, 1)) * 100)} % af forbruget lige nu.`
        : solarOn ? 'Solen dækker forbruget lige nu.'
        : bat < -25 ? 'Batteriet forsyner huset.'
        : imp ? 'Huset forsynes fra elnettet.' : 'Anlægget er i ro.');
      const upd = this.s('pv'); const age = upd ? (Date.now() - new Date(upd.last_updated)) / 1000 : 999;
      this.pill('live', age < 120 ? 'Live' : `${Math.round(age / 60)} min siden`, age < 120 ? 'var(--bat)' : 'var(--sun)');
    }
    this.txt('tEV', evOn ? 'Lader' : 'Standby');

    // stat strip
    const s1 = this.n('pv1v') * this.n('pv1a'), s2 = this.n('pv2v') * this.n('pv2a');
    this.tween('sDay', d.pvDay, v => fmtN(v, 1));
    this.tween('s1', off ? 0 : s1, fmtW); this.tween('s2', off ? 0 : s2, fmtW);
    const P = this._plant;
    if (this.has('month')) this.tween('sMonth', this.n('month'), v => kwh(v)); else { this._tw.sMonth = 0; this.txt('sMonth', '–'); }
    this.width('sDayB', d.pvDay / Math.max(P.day_target, this.n('peak') / 1000 * 5)); this.width('s1b', s1 / P.string_max_power); this.width('s2b', s2 / P.string_max_power); this.width('sMonthB', this.n('month') / P.month_target);
  }

  _updateSide(d) {
    const { bat, soc, grid, aut, priceNow, mean } = d;
    this.tween('q0', d.pvDay, v => fmtN(v, 1)); this.tween('q1', d.cons, v => fmtN(v, 1));
    this.tween('q2', d.impD, v => fmtN(v, 1)); this.tween('q3', d.expD, v => fmtN(v, 1));
    this.txt('autTxt', `${Math.round(aut)} % selvforsynet`);

    // battery
    this.tween('socTxt', soc, v => Math.round(v));
    this.width('socFill', soc / 100);
    this.$('mkMin').style.left = this.n('eod') + '%';
    const sb = this.$('socbar'); sb.classList.toggle('dis', bat < -25); sb.classList.toggle('idle', Math.abs(bat) < 25);
    this.html('batMeta', `<b>${bat > 25 ? '+' : bat < -25 ? '−' : ''}${fmtW(bat)}</b>`);
    this.html('batMeta2', `${esc(lbl(this.st('mode')))} · grænser ${fmtN(this.n('eod'), 0)}–${fmtN(this.n('eoc'), 0)} % · ladet ${fmtN(this.n('chDay'), 1)} / afladet ${fmtN(this.n('disDay'), 1)} kWh`);
    this.pill('batPill', d.offline ? 'Offline' : Math.abs(bat) < 25 ? 'Hviler' : bat > 0 ? 'Lader' : 'Aflader', d.offline ? 'var(--bad)' : Math.abs(bat) < 25 ? 'var(--mut)' : 'var(--bat)');

    // price (only when a price entity is configured)
    if (d.hasPrice) {
    this.txt('priceNow', fmtN(priceNow, 2));
    const rel = mean ? priceNow / mean : 1;
    this.pill('pricePill', rel < .9 ? 'Billig nu' : rel > 1.1 ? 'Dyr nu' : 'Normal', rel < .9 ? 'var(--bat)' : rel > 1.1 ? 'var(--exp)' : 'var(--sun)');
    const now = new Date(); now.setMinutes(0, 0, 0);
    const fut = this.prices.filter(p => new Date(p.hour) >= now).slice(0, 24);
    const key = fut.length + '|' + now.getTime();
    if (key !== this._pk) {
      this._pk = key; priceChart(this.$('priceMini'), fut, { h: 46, axis: false });
      const w = cheapestWindow(this.prices, 3);
      this.html('priceHint', w ? `Billigst <b>kl. ${hh(w.start)}–${String((w.start.getHours() + 3) % 24).padStart(2, '0')}</b>${w.start.getDate() !== new Date().getDate() ? ' i morgen' : ''}<br>snit ${fmtN(w.avg, 2)} kr` : '');
    }
    }

    // device chips
    this.txt('cGridV', d.offline ? '–' : fmtW(grid));
    this.txt('cGridS', d.offline ? 'Offline' : Math.abs(grid) < 25 ? 'I balance' : grid > 0 ? 'Køber' : 'Sælger');
    this.$('cGrid').style.setProperty('--c', grid > 0 ? 'var(--grid)' : 'var(--exp)');
    this.txt('cInvV', d.offline ? '–' : fmtW(d.inv));
    this.txt('cInvS', d.offline ? 'Offline' : d.fault ? (this.st('invSwitch') === 'off' ? 'Slukket' : 'Alarm') : 'Kører normalt');
    this.$('cInv').classList.toggle('warn', d.offline || d.fault);
    this.txt('cEvV', d.evOn ? 'Lader' : 'Standby');
    this.txt('cEvS', `${fmtN(this.n('evTemp'), 0)} °C · ${kwh(d.evTot)} kWh`);
  }

  async _loadHistory() {
    if (!this._hass) return;
    try {
      const t0 = Date.now() - 24 * 3600e3, B = 144, step = 24 * 3600e3 / B;
      const ids = { pv: this.eid('pv'), load: this.eid('load'), soc: this.eid('soc') }, list = [...new Set(Object.values(ids).filter(Boolean))];
      if (!list.length) return;
      const r = await this._hass.callWS({ type: 'history/history_during_period', start_time: new Date(t0).toISOString(),
        entity_ids: list, minimal_response: true, no_attributes: true });
      const bucket = arr => {
        const out = new Array(B).fill(null), cnt = new Array(B).fill(0); let last = null;
        for (const p of arr || []) { const v = parseFloat(p.s); const ts = (p.lu || p.lc) * 1000; const i = Math.floor((ts - t0) / step);
          if (isNaN(v)) { if (i < 0) last = null; continue; }
          if (i < 0) { last = v; continue; } if (i < B) { out[i] = (out[i] || 0) + v; cnt[i]++; } }
        for (let i = 0; i < B; i++) { if (cnt[i]) { out[i] /= cnt[i]; last = out[i]; } else out[i] = last; } return out;
      };
      this._series = { pv: bucket(ids.pv && r[ids.pv]), load: bucket(ids.load && r[ids.load]), soc: bucket(ids.soc && r[ids.soc]), t0, step };
      this._drawHist();
      if (this._popup) this._popup.series = this._series;
    } catch (e) { console.warn('huawei-solar-card history', e); }
  }
  _drawHist() { const h = this.$('hist'); if (h && this._series) histChart(h, this._series, { h: 92 }); }

  openPopup(kind) {
    if (this._popup) this._popup.remove();
    const p = document.createElement('huawei-solar-popup');
    const cs = getComputedStyle(this);
    for (const v of ['--primary-text-color', '--secondary-text-color', '--ha-card-background', '--card-background-color', '--primary-font-family'])
      { const val = cs.getPropertyValue(v); if (val) p.style.setProperty(v, val); }
    p.style.fontFamily = cs.fontFamily;
    p.card = this; p.kind = kind; p.series = this._series;
    p.addEventListener('closed', () => { if (this._popup === p) this._popup = null; if (this._3d) { this._3d.focus = null; this._3d.orbit.tDist = 150; this._3d.orbit.tEl = .52; } });
    document.body.appendChild(p); this._popup = p; p.hass = this._hass;
  }
}
Object.assign(HuaweiSolarCard.prototype, Scene3D);


if (!customElements.get('huawei-solar-card')) customElements.define('huawei-solar-card', HuaweiSolarCard);
if (!customElements.get('huawei-solar-popup')) customElements.define('huawei-solar-popup', HuaweiSolarPopup);
window.customCards = window.customCards || [];
if (!window.customCards.some(c => c.type === 'huawei-solar-card'))
  window.customCards.push({ type: 'huawei-solar-card', name: 'Huawei Solar Card', description: 'Samlet animeret solcelle-side med info, styring og popups', preview: false });
console.info(`%c HUAWEI-SOLAR-CARD %c ${HSC_VERSION} `, 'background:#f7b733;color:#111;font-weight:700', 'background:#222;color:#fff');
