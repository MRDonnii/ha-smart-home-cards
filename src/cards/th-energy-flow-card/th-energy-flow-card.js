/* TH energiflow – hvor kommer strømmen fra, og hvor går den hen?
 * type: custom:th-energy-flow-card
 * Fine medaljoner med line-art for solceller, elnet, batteri og hus, forbundet af hårfine linjer med lysende kometer.
 * Starter altid i "Lige nu" (kW); "I dag" (kWh) kan vælges. mode: 'day' i opsætningen gør "I dag" til standard.
 * Entities follow the Huawei Solar integration's names by default (huawei: / entities: override them); prices have no
 * default. See README.md.
 */
import { flowSettings } from "./config.js";

const TF_VER = '2.3.0';
const TF_C = { sun: '#e8c37e', grid: '#a99bd9', bat: '#8fd4b0', home: '#e9e3d6', ev: '#e7a6c4' };
const tfn = (v, d = 1) => (Number.isFinite(v) ? v : 0).toLocaleString('da-DK', { minimumFractionDigits: d, maximumFractionDigits: d });
const tfc = (v, a, b) => Math.max(a, Math.min(b, v));

/* Planar layout: three sources around the house, charger below. */
const TF_N = { sun: [380, 75, 50], grid: [110, 355, 50], home: [380, 255, 66], bat: [650, 355, 50], ev: [380, 470, 40] };
const TF_P = {
  sunHome: 'M380 137 L380 178',
  gridHome: 'M164 335 L310 281',
  batHome: 'M596 335 L450 281',
  homeEv: 'M443 288 C 490 345, 490 425, 425 456',
  sunBat: 'M433 73 C 565 65, 655 165, 650 294',
  gridBat: 'M120 412 C 130 570, 625 570, 640 412',
  sunGrid: 'M327 73 C 195 65, 105 165, 110 294',
};
const TF_F = [['sunHome', 'sun'], ['gridHome', 'grid'], ['batHome', 'bat'], ['sunBat', 'sun'], ['gridBat', 'grid'], ['sunGrid', 'sun'], ['homeEv', 'ev']];
const TF_ICON = {
  sun: '<circle cx="0" cy="0" r="6.5"/><g class="rot"><path d="M0 -12v-4M0 12v4M-12 0h-4M12 0h4M-8.5 -8.5l-2.8 -2.8M8.5 8.5l2.8 2.8M-8.5 8.5l-2.8 2.8M8.5 -8.5l2.8 -2.8"/></g>',
  grid: '<path d="M-7 15 L-2.5 -13 H2.5 L7 15"/><path d="M-11 -6 H11 M-8.5 2 H8.5"/><path d="M-5 6 L5.5 14 M5 6 L-5.5 14 M-3.5 -6 L4 2 M3.5 -6 L-4 2"/><path d="M0 -13 V-17"/>',
  bat: '<rect x="-7.5" y="-12" width="15" height="25" rx="3.5"/><path d="M-3 -15 h6"/><rect id="bIco" x="-4.5" y="-9" width="9" height="19" rx="1.6" fill="currentColor" stroke="none" style="transform-box:fill-box;transform-origin:bottom;transition:transform 1.6s"/>',
  ev: '<rect x="-9" y="-15" width="14" height="24" rx="3"/><rect x="-6" y="-12" width="8" height="5" rx="1" stroke-width="1"/><path d="M-1.2 -4.5 l-2.6 4.6 h2.8 l-1.4 4" stroke-width="1.3"/><path d="M5 2 C 12 2, 13 8, 13 12 V15"/><path d="M11 15 h4 M12 15 v3 M14 15 v3" stroke-width="1.2"/>',
  home: '<path d="M-20 -2 L0 -19 L20 -2"/><path d="M-15 -6 V15 H15 V-6"/><path d="M-4 15 V5 H4 V15"/><rect class="hw" x="-11" y="-1" width="6" height="5" rx="1" fill="#f3d79e" stroke="none"/><rect class="hw" x="5" y="-1" width="6" height="5" rx="1" fill="#f3d79e" stroke="none"/>',
};

const TF_CSS = `
:host{display:block;height:100%;--ink:#f4f1ea;--mut:rgba(244,241,234,.55);--faint:rgba(244,241,234,.3);--hair:rgba(244,241,234,.08);--gold:#e8c37e;
  color:var(--ink);font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
*{box-sizing:border-box}button{font:inherit;color:inherit}
.c{height:100%;display:flex;flex-direction:column;position:relative;overflow:hidden;isolation:isolate;border-radius:var(--tf-radius,28px);padding:clamp(18px,1.7vw,26px);
  background:radial-gradient(120% 90% at 50% 45%,rgba(232,195,126,.045),transparent 60%),linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.012)),rgba(11,12,17,.8);
  backdrop-filter:blur(18px) saturate(1.15);box-shadow:0 30px 60px -40px rgba(0,0,0,.95),inset 0 1px 0 rgba(255,255,255,.06);animation:tin .9s cubic-bezier(.16,1,.3,1) both}
.c::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;z-index:3;
  background:linear-gradient(150deg,rgba(255,255,255,.18),rgba(255,255,255,.02) 30%,rgba(255,255,255,.02) 70%,rgba(232,195,126,.3));
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
.c::after{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;opacity:.5;
  background-image:radial-gradient(rgba(244,241,234,.09) 1px,transparent 1px);background-size:22px 22px;
  -webkit-mask:radial-gradient(70% 60% at 50% 50%,#000,transparent);mask:radial-gradient(70% 60% at 50% 50%,#000,transparent)}
@keyframes tin{from{opacity:0;transform:translateY(14px);filter:blur(6px)}}
.hd{display:flex;align-items:flex-end;gap:12px}
.hd .k{display:flex;align-items:center;gap:8px;font-size:10px;font-weight:600;letter-spacing:.24em;text-transform:uppercase;color:var(--mut)}
.hd .k i{width:6px;height:6px;border-radius:50%;background:#8fd4b0;box-shadow:0 0 0 3px rgba(143,212,176,.15);animation:bl 2.4s infinite}@keyframes bl{50%{opacity:.3}}
.hd h3{margin:6px 0 0;font-size:20px;font-weight:300;letter-spacing:-.01em}
.tabs{margin-left:auto;display:flex;gap:18px}
.tabs button{appearance:none;border:0;background:none;cursor:pointer;padding:4px 0;font-size:11px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);position:relative;transition:color .4s}
.tabs button::after{content:"";position:absolute;left:0;right:0;bottom:-2px;height:1px;background:var(--gold);transform:scaleX(0);transition:transform .5s cubic-bezier(.16,1,.3,1)}
.tabs button.on{color:var(--ink)}.tabs button.on::after{transform:scaleX(1)}
.stage{flex:1;display:flex;align-items:center;margin:8px 0 4px;min-height:0}
svg.dio{display:block;width:100%;height:auto;overflow:visible}
svg text{font-family:inherit}
.nm{font-size:9.5px;font-weight:600;letter-spacing:.28em;fill:var(--mut)}
.sb{font-size:10.5px;fill:var(--faint)}
.vv{font-size:19px;font-weight:300;letter-spacing:-.02em;fill:var(--ink)}
.vh{font-size:30px;font-weight:200;letter-spacing:-.03em;fill:var(--ink)}
.vu{font-size:10px;font-weight:500;fill:var(--mut);letter-spacing:.06em}
.ico{fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.rot{animation:rot 40s linear infinite;transform-box:view-box;transform-origin:0 0}@keyframes rot{to{transform:rotate(360deg)}}
.arc{transition:stroke-dasharray 1.4s cubic-bezier(.16,1,.3,1),stroke-dashoffset 1.4s cubic-bezier(.16,1,.3,1)}
.breathe{animation:br 5s ease-in-out infinite;transform-box:fill-box;transform-origin:center}@keyframes br{50%{opacity:.35;transform:scale(1.04)}}
.comet{animation:cm linear infinite}@keyframes cm{to{stroke-dashoffset:-32}}
.hw{transition:opacity 1.2s}
.evon .ico{animation:evp 1.6s ease-in-out infinite}@keyframes evp{50%{filter:drop-shadow(0 0 5px #e7a6c4);opacity:.75}}
.evon circle[fill^='url(#halo']{animation-duration:1.8s}
.draw{stroke-dasharray:600;stroke-dashoffset:600;animation:drw 1.8s cubic-bezier(.65,0,.35,1) forwards}@keyframes drw{to{stroke-dashoffset:0}}
.st{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-top:1px solid var(--hair);padding-top:14px;margin-top:2px}
.st>div{padding:0 14px;border-left:1px solid var(--hair);min-width:0;animation:tin .8s cubic-bezier(.16,1,.3,1) both}.st.ready>div{animation:none}
.fl{transition:opacity .8s}.fl.off{opacity:0}.st>div:first-child{padding-left:0;border-left:0}
.st small{display:flex;align-items:center;gap:7px;font-size:9.5px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.st small i{width:5px;height:5px;border-radius:50%;background:var(--c);flex:none}
.st b{display:block;font-size:22px;font-weight:200;letter-spacing:-.02em;margin-top:6px;white-space:nowrap}.st b u{text-decoration:none;font-size:11px;font-weight:500;color:var(--mut);margin-left:3px;letter-spacing:.04em}
.st em{display:block;font-style:normal;font-size:10.5px;color:var(--faint);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.st .ln{display:block;height:1px;background:rgba(244,241,234,.1);margin-top:9px;position:relative}.st .ln i{position:absolute;left:0;top:-.5px;height:2px;background:var(--c);transition:width 1.4s cubic-bezier(.16,1,.3,1)}
@media(max-width:700px){.st{grid-template-columns:repeat(2,minmax(0,1fr));row-gap:14px}.st>div:nth-child(3){padding-left:0;border-left:0}.hd h3{font-size:18px}.hd{flex-wrap:wrap}.tabs{margin-left:0;width:100%}
  .nm{font-size:15px;letter-spacing:.16em}.vv{font-size:26px}.vh{font-size:38px}.vu{font-size:14px}.sb{display:none}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

class ThEnergyFlowCard extends HTMLElement {
  static getStubConfig() { return {}; }
  setConfig(c) {
    this.cfg = c || {}; const S = flowSettings(this.cfg); this.E = S.entities; this.M = S.max; this._mode = S.mode;
    if (this._r) { this._rb = true; if (this._h) this.hass = this._h; } // config changed after the first render: rebuild
  }
  getCardSize() { return 8; }
  set hass(h) {
    this._h = h; if (!this._r || this._rb) this.build();
    const t = Date.now(); if (!this._t || t - this._t > 900) { this._t = t; this.update(); }
    else if (!this._q) this._q = setTimeout(() => { this._q = null; this._t = Date.now(); this.update(); }, 900);
  }
  n(k) { const id = this.E[k], s = id ? this._h?.states[id] : undefined; const v = s ? parseFloat(s.state) : NaN; return Number.isFinite(v) ? v : NaN; }
  z(k) { const v = this.n(k); return Number.isFinite(v) ? v : 0; }
  $(id) { return this._r.getElementById(id); }
  txt(id, v) { const e = this.$(id); if (e && e.textContent !== v) e.textContent = v; }

  medal(key, label) {
    const [x, y, r] = TF_N[key], c = TF_C[key], big = key === 'home', C = 2 * Math.PI * (r + 7);
    return `<g id="m-${key}">
      <circle cx="${x}" cy="${y}" r="${r + 18}" fill="url(#halo-${key})" class="breathe" style="animation-delay:-${(x + y) % 5}s"/>
      <circle cx="${x}" cy="${y}" r="${r}" fill="url(#disc)" stroke="rgba(244,241,234,.16)" stroke-width="1"/>
      <circle cx="${x}" cy="${y}" r="${r - 6}" fill="none" stroke="rgba(244,241,234,.05)" stroke-width="1"/>
      <circle cx="${x}" cy="${y}" r="${r + 7}" fill="none" stroke="rgba(244,241,234,.06)" stroke-width="${big ? 3 : 2}"/>
      ${big ? ['sun', 'bat', 'grid'].map(s => `<circle id="hr-${s}" class="arc" cx="${x}" cy="${y}" r="${r + 7}" fill="none" stroke="${TF_C[s]}" stroke-width="3" stroke-linecap="round" stroke-dasharray="0 ${C}" transform="rotate(-90 ${x} ${y})"/>`).join('')
        : `<circle id="ar-${key}" class="arc" cx="${x}" cy="${y}" r="${r + 7}" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-dasharray="0 ${C}" transform="rotate(-90 ${x} ${y})"/>`}
      <g transform="translate(${x} ${y - (big ? 26 : 14)}) scale(${big ? 1.05 : .82})" class="ico" stroke="${big ? '#e9e3d6' : c}" style="color:${c}">${TF_ICON[key]}</g>
      <text id="v-${key}" class="${big ? 'vh' : 'vv'}" x="${x}" y="${y + (big ? 22 : 18)}" text-anchor="middle">–</text>
      <text id="u-${key}" class="vu" x="${x}" y="${y + (big ? 40 : 32)}" text-anchor="middle"></text>
      <text class="nm" x="${key === 'sun' ? x + 100 : x}" y="${key === 'sun' ? y - 12 : y + r + 30}" text-anchor="${key === 'sun' ? 'start' : 'middle'}">${label}</text>
      <text id="s-${key}" class="sb" x="${key === 'sun' ? x + 100 : x}" y="${key === 'sun' ? y + 8 : y + r + 46}" text-anchor="${key === 'sun' ? 'start' : 'middle'}"></text></g>`;
  }
  build() {
    this._r = this.shadowRoot || this.attachShadow({ mode: 'open' }); this._rb = false; this._fk = this._sk = null;
    // Without a charger entity the charger medallion and its flow are left out.
    const FL = this.E.ev ? TF_F : TF_F.filter(([id]) => id !== 'homeEv');
    const halo = k => `<radialGradient id="halo-${k}"><stop offset=".55" stop-color="${TF_C[k]}" stop-opacity="${k === 'home' ? .06 : .1}"/><stop offset="1" stop-color="${TF_C[k]}" stop-opacity="0"/></radialGradient>`;
    const svg = `<svg class="dio" viewBox="0 0 760 590" aria-label="Energiflow">
      <defs>${['sun', 'grid', 'bat', 'home', 'ev'].map(halo).join('')}
        <radialGradient id="disc" cx=".5" cy=".35"><stop offset="0" stop-color="#262a35"/><stop offset="1" stop-color="#12141b"/></radialGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter></defs>
      ${FL.map(([id]) => `<path id="p-${id}" d="${TF_P[id]}" fill="none" stroke="rgba(244,241,234,.07)" stroke-width="1" stroke-dasharray="2 5"/>`).join('')}
      <g id="flows">${FL.map(([id, a]) => `<g class="fl off" id="f-${id}"><path d="${TF_P[id]}" fill="none" stroke="${TF_C[a]}" stroke-opacity=".28" stroke-width="1"/>
        <path class="cm1 comet" d="${TF_P[id]}" pathLength="100" fill="none" stroke="${TF_C[a]}" stroke-linecap="round" stroke-dasharray="7 25" opacity=".35" filter="url(#glow)"/>
        <path class="cm2 comet" d="${TF_P[id]}" pathLength="100" fill="none" stroke="${TF_C[a]}" stroke-linecap="round" stroke-dasharray="7 25"/>
        <path class="cm3 comet" d="${TF_P[id]}" pathLength="100" fill="none" stroke="#fffaf0" stroke-linecap="round" stroke-dasharray="1.6 30.4" stroke-dashoffset="-5.4"/></g>`).join('')}</g>
      ${this.medal('sun', 'SOLCELLER')}${this.medal('grid', 'ELNETTET')}${this.medal('bat', 'BATTERI')}${this.E.ev ? this.medal('ev', 'BILLADER') : ''}${this.medal('home', 'HUSET')}
    </svg>`;
    this._r.innerHTML = `<style>${TF_CSS}</style><div class="c">
      <div class="hd"><div><div class="k"><i id="liveDot"></i><span id="kick">Lige nu</span></div><h3>${this.cfg.title || 'Hvor kommer strømmen fra?'}</h3></div>
        <div class="tabs" id="tabs"><button data-m="now">Lige nu</button><button data-m="day">I dag</button></div></div>
      <div class="stage">${svg}</div><div class="st" id="st"></div></div>`;
    const sync = () => this._r.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.m === this._mode));
    sync();
    this._r.querySelectorAll('#tabs button').forEach(b => b.onclick = () => { this._mode = b.dataset.m; sync(); this._fk = null; this.update(); });
  }

  data() {
    if (this._mode === 'now') {
      const pv = Math.max(0, this.z('pv')), load = Math.max(0, this.z('load')), bat = this.z('bat'), grid = this.z('load') - this.z('inv');
      const batHome = Math.max(0, -bat), gridHome = Math.max(0, grid), sunHome = Math.max(0, Math.min(pv, load - batHome - gridHome));
      const chg = Math.max(0, bat), sunBat = Math.min(chg, Math.max(0, pv - sunHome)), gridBat = Math.max(0, chg - sunBat), sunGrid = Math.max(0, -grid);
      const EV = this.ev(), homeEv = Math.min(EV.w, load);
      return { now: true, sun: pv, home: load, imp: gridHome + gridBat, exp: sunGrid, ch: chg, dis: batHome, bat, grid, EV, f: { sunHome, gridHome, batHome, sunBat, gridBat, sunGrid, homeEv } };
    }
    const pvDay = this.z('pvDay'), imp = this.z('imp'), exp = this.z('exp'), ch = this.z('ch'), dis = this.z('dis');
    const sunGrid = Math.min(exp, pvDay), sunBat = Math.min(ch, Math.max(0, pvDay - sunGrid)), gridBat = Math.max(0, ch - sunBat);
    const sunHome = Math.max(0, pvDay - sunGrid - sunBat), batHome = dis, gridHome = Math.max(0, imp - gridBat);
    const EV = this.ev();
    return { now: false, sun: pvDay, home: sunHome + batHome + gridHome, imp, exp, ch, dis, EV, f: { sunHome, gridHome, batHome, sunBat, gridBat, sunGrid, homeEv: EV.day } };
  }
  /* billader: effekt ud fra hvor hurtigt "total opladet" stiger + 5-min statistik; i dag fra timestatistik */
  ev() {
    const v = this.n('ev'), t = Date.now();
    if (Number.isFinite(v)) {
      if (!this._evL) this._evL = { v, t };
      else if (v > this._evL.v + 1e-6) { const dh = (t - this._evL.t) / 36e5; if (dh > 2e-4) this._evW = (v - this._evL.v) / dh * 1000; this._evL = { v, t }; }
      else if (t - this._evL.t > 8 * 60e3) this._evW = 0;
    }
    if (this.E.ev && this._h.callWS && !this._evBusy && (!this._evT || t - this._evT > 60e3)) {
      this._evBusy = true; this._evT = t; const id = this.E.ev, d0 = new Date(); d0.setHours(0, 0, 0, 0);
      Promise.all([
        this._h.callWS({ type: 'recorder/statistics_during_period', start_time: new Date(t - 25 * 6e4).toISOString(), statistic_ids: [id], period: '5minute', types: ['change'] }),
        this._h.callWS({ type: 'recorder/statistics_during_period', start_time: d0.toISOString(), statistic_ids: [id], period: 'hour', types: ['change'], units: { energy: 'kWh' } }),
      ]).then(([a, b]) => {
        const f = (a[id] || []).filter(x => (x.change || 0) > 0 && (typeof x.end === 'number' ? x.end : Date.parse(x.end)) > Date.now() - 12 * 6e4).pop();
        this._evS = f ? f.change * 12 * 1000 : 0;
        this._evH = (b[id] || []).reduce((s2, x) => s2 + Math.max(0, x.change || 0), 0); this._evHv = v;
      }).catch(() => {}).finally(() => { this._evBusy = false; });
    }
    const w = Math.max(this._evW || 0, this._evS || 0), day = (this._evH || 0) + (Number.isFinite(v) && Number.isFinite(this._evHv) ? Math.max(0, v - this._evHv) : 0);
    return { w: w > 60 ? w : 0, day, tot: v, temp: this.n('evTemp') };
  }
  val(v, D) { return D.now ? [tfn(v / 1000, v >= 10000 ? 1 : 2), 'kW'] : [tfn(v, 1), 'kWh']; }

  update() {
    if (!this._h || !this._r) return;
    const D = this.data(), F = D.f, thr = D.now ? 20 : .05;
    this.txt('kick', D.now ? 'Lige nu · live' : 'Dagens energi'); this.$('liveDot').style.display = D.now ? '' : 'none';
    const put = (k, v, sub) => { const [a, u] = this.val(v, D); this.txt('v-' + k, a); this.txt('u-' + k, u); this.txt('s-' + k, sub || ''); };
    put('sun', D.sun, D.sun > thr ? (D.now ? `${Math.round(tfc(D.sun / this.M.sun * 100, 0, 100))} % af anlægget` : `${tfn(F.sunGrid, 1)} kWh solgt`) : 'ingen sol');
    const sell = D.now ? D.exp > thr : false;
    put('grid', sell ? D.exp : D.imp, D.now ? (sell ? 'sælger' : D.imp > thr ? 'køber' : 'i balance') : `købt · ${tfn(D.exp, 1)} kWh solgt`);
    const soc = this.n('soc');
    this.txt('v-bat', Number.isFinite(soc) ? `${Math.round(soc)}` : '–'); this.txt('u-bat', '%');
    this.txt('s-bat', D.now ? (D.ch > thr ? `lader ${this.val(D.ch, D).join(' ')}` : D.dis > thr ? `afgiver ${this.val(D.dis, D).join(' ')}` : 'hviler') : `↑ ${tfn(D.ch, 1)} · ↓ ${tfn(D.dis, 1)} kWh`);
    put('home', D.home, D.home > 0 ? `${Math.round(tfc((F.sunHome + F.batHome) / D.home * 100, 0, 100))} % sol og batteri` : '');
    const arc = (id, r, f) => { const e = this.$(id), C = 2 * Math.PI * r; if (e) e.setAttribute('stroke-dasharray', `${(tfc(f, 0, 1) * C).toFixed(1)} ${C.toFixed(1)}`); };
    const EV = D.EV, evOn = D.now ? EV.w > 60 : EV.day > .05;
    if (D.now && evOn) put('ev', EV.w, 'lader bilen'); else if (!D.now) put('ev', EV.day, evOn ? 'opladet i dag' : 'ingen opladning i dag');
    else { this.txt('v-ev', 'Klar'); this.txt('u-ev', 'STANDBY'); this.txt('s-ev', Number.isFinite(EV.temp) ? `${tfn(EV.temp, 0)} °C · ${Math.round(EV.tot || 0).toLocaleString('da-DK')} kWh i alt` : ''); }
    this.$('m-ev')?.classList.toggle('evon', D.now && evOn);
    arc('ar-ev', 57, D.now ? EV.w / this.M.ev : Math.min(1, EV.day / 40));
    const bI = this.$('bIco'); if (bI) bI.style.transform = `scaleY(${tfc((soc || 0) / 100, .05, 1)})`;
    // buer: størrelse / niveau
    arc('ar-sun', 57, D.now ? D.sun / this.M.sun : D.sun > 0 ? (D.sun - F.sunGrid) / D.sun : 0);
    arc('ar-grid', 57, D.now ? Math.abs(D.grid || 0) / this.M.grid : D.imp + D.exp > 0 ? D.imp / (D.imp + D.exp) : 0);
    arc('ar-bat', 57, (soc || 0) / 100);
    const tot = Math.max(F.sunHome + F.batHome + F.gridHome, 1e-6), C = 2 * Math.PI * 91, gap = 5;
    let off = 0; for (const [s, v] of [['sun', F.sunHome], ['bat', F.batHome], ['grid', F.gridHome]]) {
      const len = v / tot * C, e = this.$('hr-' + s); e.setAttribute('stroke-dasharray', `${Math.max(0, len - gap).toFixed(1)} ${C.toFixed(1)}`); e.setAttribute('stroke-dashoffset', (-off).toFixed(1)); e.style.opacity = v > thr ? 1 : 0; off += len; }
    const load = Math.max(0, this.z('load'));
    this._r.querySelectorAll('.hw').forEach((w, i) => w.style.opacity = tfc(.25 + load / 5000 - i * .05, .2, 1).toFixed(2));
    this.flows(D, thr);
    this.stats(D);
  }
  flows(D, thr) {
    const F = D.f, max = Math.max(...Object.values(F), 1e-6);
    const key = this._mode + TF_F.map(([id]) => F[id] > thr ? Math.round(F[id] / max * 6) : 0).join('');
    if (key === this._fk) return; this._fk = key;
    TF_F.forEach(([id]) => {
      const g = this.$('f-' + id), v = F[id], on = v > thr; if (!g) return; g.classList.toggle('off', !on); if (!on) return;
      const r = v / max, w = 1.2 + r * 2.4, dur = (4.2 - r * 2.2).toFixed(2) + 's';
      const [c1, c2, c3] = ['.cm1', '.cm2', '.cm3'].map(q => g.querySelector(q));
      c1.setAttribute('stroke-width', (w + 3).toFixed(1)); c2.setAttribute('stroke-width', w.toFixed(2)); c3.setAttribute('stroke-width', (w * .45).toFixed(2));
      [c1, c2, c3].forEach(p => { if (p.style.animationDuration !== dur) p.style.animationDuration = dur; });
    });
  }
  stats(D) {
    const F = D.f, price = this.n('price'), mean = this.n('mean') || price;
    const card = (c, k, v, u, sub, pct) => `<div style="--c:${c}"><small><i></i>${k}</small><b>${v}<u>${u}</u></b>${sub ? `<em>${sub}</em>` : ''}${pct != null ? `<span class="ln"><i style="width:${tfc(pct, 0, 100)}%"></i></span>` : ''}</div>`;
    let h;
    if (D.now) {
      const sunPct = D.home > 0 ? tfc(F.sunHome / D.home * 100, 0, 100) : 0, own = D.home > 0 ? tfc((F.sunHome + F.batHome) / D.home * 100, 0, 100) : 0;
      h = card(TF_C.sun, 'Sol dækker', Math.round(sunPct), '%', `${this.val(D.sun, D).join(' ')} fra panelerne`, sunPct)
        + card(TF_C.bat, 'Uden elnet', Math.round(own), '%', 'af husets forbrug lige nu', own)
        + card(TF_C.grid, D.exp > 20 ? 'Sælger' : 'Køber', tfn((D.exp > 20 ? D.exp : D.imp) / 1000, 2), 'kW', Number.isFinite(price) && D.imp > 20 ? `≈ ${tfn(price * D.imp / 1000, 2)} kr i timen` : D.exp > 20 ? 'til elnettet' : 'i balance')
        + card(TF_C.home, 'Pris nu', Number.isFinite(price) ? tfn(price, 2) : '–', 'kr/kWh', Number.isFinite(mean) ? `snit i dag ${tfn(mean, 2)}` : 'Strømligning');
    } else {
      const self = D.home > 0 ? tfc((1 - F.gridHome / D.home) * 100, 0, 100) : 0, used = D.sun > 0 ? tfc((D.sun - F.sunGrid) / D.sun * 100, 0, 100) : 0;
      h = card(TF_C.bat, 'Selvforsynet', Math.round(self), '%', 'huset dækket uden elnettet', self)
        + card(TF_C.sun, 'Sol brugt selv', D.sun > 0 ? Math.round(used) : '–', D.sun > 0 ? '%' : '', D.sun > 0 ? `af ${tfn(D.sun, 1)} kWh produceret` : 'ingen sol endnu i dag', D.sun > 0 ? used : 0)
        + card(TF_C.grid, 'Fra elnettet', tfn(D.imp, 1), 'kWh', `solgt ${tfn(D.exp, 1)} kWh`)
        + card(TF_C.home, 'Batteriet', tfn(D.dis, 1), 'kWh', `leveret til huset · ladet ${tfn(D.ch, 1)}`);
    }
    if (h !== this._sk) { const st = this.$('st'); if (this._sk) st.classList.add('ready'); this._sk = h; st.innerHTML = h; }
  }
}
if (!customElements.get('th-energy-flow-card')) customElements.define('th-energy-flow-card', ThEnergyFlowCard);
window.customCards = window.customCards || [];
if (!window.customCards.some(c => c.type === 'th-energy-flow-card')) window.customCards.push({ type: 'th-energy-flow-card', name: 'TH energiflow', description: 'Elegant, animeret energiflow mellem sol, elnet, batteri og hus', preview: true });
console.info(`%c TH-ENERGIFLOW %c ${TF_VER} `, 'background:#e8c37e;color:#15110a;font-weight:700', 'color:#e8c37e');
