/* TH batterier – Huawei LUNA2000, flere batterier med hver sine moduler
 * type: custom:th-battery-card
 * batteries / packs: found from the integration's per-unit sensors (override with batteries: 2, packs: 3)
 * pack_kwh: 5 (only used without the rated capacity sensor)
 * Hvert batteri tegnes som et tårn af moduler med eget niveau, effekt og temperatur.
 * Knappen "Styr batteri og anlæg" sender hændelsen 'th-battery-control' (bubbles, composed).
 * Entities follow the Huawei Solar integration's names (huawei: / entities: override them). See README.md.
 */
import { batterySettings, unitEntity } from "./config.js";

const TB_VER = '1.0.2';
const TB_MODE = { maximise_self_consumption: 'Maks. eget forbrug', fully_fed_to_grid: 'Alt til nettet', time_of_use_luna2000: 'Tidsstyret (TOU)', fixed_charge_discharge: 'Fast lad/aflad', adaptive: 'Adaptiv' };
const tbn = (v, d = 1) => (Number.isFinite(v) ? v : 0).toLocaleString('da-DK', { minimumFractionDigits: d, maximumFractionDigits: d });
const tbc = (v, a, b) => Math.max(a, Math.min(b, v));
const tbkw = w => `${tbn(Math.abs(w) / 1000, Math.abs(w) >= 10000 ? 1 : 2)} kW`;

const TB_CSS = `
:host{display:block;height:100%;--ink:#f4f1ea;--mut:rgba(244,241,234,.56);--faint:rgba(244,241,234,.3);--hair:rgba(244,241,234,.09);
  --emer:#6be3a8;--gold:#e8c37e;--coral:#ff9e7a;--ice:#8ed1ff;--red:#ff6b7d;color:var(--ink);font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
*{box-sizing:border-box}button{font:inherit;color:inherit}
.c{height:100%;display:flex;flex-direction:column;position:relative;overflow:hidden;isolation:isolate;border-radius:var(--tb-radius,28px);padding:clamp(16px,1.6vw,24px);
  background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.015)),rgba(12,14,20,.74);backdrop-filter:blur(18px) saturate(1.2);
  box-shadow:0 30px 60px -40px rgba(0,0,0,.9),inset 0 1px 0 rgba(255,255,255,.06);animation:tin .9s cubic-bezier(.16,1,.3,1) both}
.c::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;z-index:3;
  background:linear-gradient(150deg,rgba(255,255,255,.2),rgba(255,255,255,.03) 32%,rgba(255,255,255,.02) 70%,color-mix(in srgb,var(--st,var(--emer)) 35%,transparent));
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
.c::after{content:"";position:absolute;right:-120px;bottom:-140px;width:420px;height:420px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--st,var(--emer)) 14%,transparent),transparent 65%);z-index:-1;pointer-events:none;animation:amb 9s ease-in-out infinite}
@keyframes amb{50%{transform:translate(-30px,-16px) scale(1.08)}}
@keyframes tin{from{opacity:0;transform:translateY(14px);filter:blur(6px)}}
.hd{display:flex;align-items:center;gap:12px}
.hd .k{font-size:10.5px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--mut)}
.hd h3{margin:4px 0 0;font-size:19px;font-weight:500;letter-spacing:-.01em}
.chip{margin-left:auto;display:inline-flex;align-items:center;gap:7px;padding:6px 11px;border-radius:99px;font-size:11.5px;font-weight:600;white-space:nowrap;color:var(--st);
  background:color-mix(in srgb,var(--st) 13%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--st) 30%,transparent)}
.chip i{width:7px;height:7px;border-radius:50%;background:currentColor;animation:bl 1.6s infinite}@keyframes bl{50%{opacity:.25}}
.top{display:grid;grid-template-columns:auto minmax(0,1fr);gap:18px;align-items:center;margin-top:14px}
.big{font-size:clamp(50px,5vw,68px);font-weight:200;letter-spacing:-.05em;line-height:.9}.big small{font-size:.36em;font-weight:500;color:var(--mut);letter-spacing:0;margin-left:3px}
.sub{font-size:13px;color:var(--mut)}.sub b{color:var(--ink);font-weight:500}
.eta{font-size:12.5px;color:var(--faint);margin-top:3px}
.gauge{position:relative;height:10px;border-radius:10px;background:rgba(255,255,255,.06);margin-top:10px;overflow:visible}
.gauge i{position:absolute;left:0;top:0;bottom:0;border-radius:10px;background:linear-gradient(90deg,#1f9d68,#6be3a8 70%,#b9f7d6);box-shadow:0 0 14px -2px rgba(107,227,168,.6);transition:width 1.6s cubic-bezier(.16,1,.3,1)}
.gauge i::after{content:"";position:absolute;inset:0;border-radius:inherit;background:linear-gradient(90deg,transparent,rgba(255,255,255,.45),transparent);background-size:40% 100%;background-repeat:no-repeat;animation:shm 2.6s linear infinite;opacity:var(--sh,0)}
@keyframes shm{from{background-position:-40% 0}to{background-position:140% 0}}
.gauge b{position:absolute;top:-4px;bottom:-4px;width:2px;border-radius:2px;background:rgba(244,241,234,.5)}
.gauge span{position:absolute;top:14px;font-size:9.5px;color:var(--faint);transform:translateX(-50%);white-space:nowrap}
.stage{flex:1;display:flex;align-items:center;margin-top:10px;min-height:0}
svg.tw{display:block;width:100%;height:auto;max-height:330px;overflow:visible}
svg text{font-family:inherit}
.wave{animation:wav 3s linear infinite}@keyframes wav{to{transform:translateX(-36px)}}
.lvl{transform-box:fill-box;transform-origin:bottom;transition:transform 1.8s cubic-bezier(.16,1,.3,1)}
.led{animation:led 2.4s ease-in-out infinite}@keyframes led{50%{opacity:.35}}
.halo{animation:hal 4s ease-in-out infinite;transform-box:fill-box;transform-origin:center}@keyframes hal{50%{opacity:.4;transform:scale(1.05)}}
.bub{animation:bub var(--d,3s) ease-in infinite;animation-delay:var(--dl,0s);opacity:0}@keyframes bub{0%{opacity:0;transform:translateY(0)}20%{opacity:.8}100%{opacity:0;transform:translateY(-46px)}}
.cap2{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px}
.cap2.ready .bc{animation:none}
.bc{padding:11px 12px;border-radius:15px;background:rgba(255,255,255,.035);box-shadow:inset 0 0 0 1px var(--hair);min-width:0;animation:tin .7s cubic-bezier(.16,1,.3,1) both}
.bc .n{display:flex;align-items:center;gap:7px;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--mut)}
.bc .n i{width:7px;height:7px;border-radius:50%;background:var(--s);box-shadow:0 0 8px var(--s)}
.bc b{display:block;font-size:22px;font-weight:300;letter-spacing:-.02em;margin-top:6px}.bc b u{text-decoration:none;font-size:12px;font-weight:500;color:var(--s);margin-left:8px;letter-spacing:0}
.bc em{display:block;font-style:normal;font-size:11px;color:var(--faint);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bal{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:11.5px;color:var(--mut)}.bal i{flex:none;width:7px;height:7px;border-radius:50%;background:var(--bc)}
.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:8px}
.grid div{padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.03);box-shadow:inset 0 0 0 1px var(--hair);min-width:0}
.grid small{display:block;font-size:9.5px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.grid b{display:block;font-size:14px;font-weight:500;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.btn{appearance:none;border:0;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:10px;padding:12px;border-radius:14px;font-size:13px;font-weight:600;
  color:#15110a;background:linear-gradient(180deg,#f3d79e,#e8c37e);box-shadow:0 10px 24px -12px rgba(232,195,126,.8);transition:transform .2s}
.btn:active{transform:scale(.98)}
@media(max-width:700px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.top{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

class ThBatteryCard extends HTMLElement {
  static getStubConfig() { return {}; }
  setConfig(c) {
    this.cfg = c || {}; this._apply(this._h?.states);
    if (this._r) { this._rb = true; if (this._h) this.hass = this._h; } // config changed after the first render: rebuild
  }
  // Entity ids, units and modules (the layout is found from hass when the card is built).
  _apply(states) { const S = batterySettings(this.cfg, states); this.E = S.entities; this.P = S.prefix; this.NB = S.batteries; this.NP = S.packs; this.PK = S.packKwh; }
  getCardSize() { return 9; }
  set hass(h) {
    this._h = h; if (!this._r || this._rb) this.build();
    const t = Date.now(); if (!this._t || t - this._t > 900) { this._t = t; this.update(); }
    else if (!this._q) this._q = setTimeout(() => { this._q = null; this._t = Date.now(); this.update(); }, 900);
  }
  st(e) { const s = e ? this._h?.states[e] : undefined; return s && !['unknown', 'unavailable'].includes(s.state) ? s.state : undefined; }
  num(e) { const v = parseFloat(this.st(e)); return Number.isFinite(v) ? v : NaN; }
  n(k) { return this.num(this.E[k]); }
  b(i, k) { return this.num(unitEntity(this.P, i, k)); }
  p(i, j, k) { return this.num(unitEntity(this.P, i, k, j)); }
  $(id) { return this._r.getElementById(id); }
  set(id, v) { const e = this.$(id); if (e && e._v !== v) { e.innerHTML = v; e._v = v; } }

  build() {
    this._r = this.shadowRoot || this.attachShadow({ mode: 'open' }); this._rb = false; this._fk = null; this._capR = 0;
    this._apply(this._h?.states);
    const NB = this.NB, NP = this.NP, W = 460, top = 70, mh = Math.min(78, (226 - (NP - 1) * 6) / NP), cx = i => NB === 1 ? W / 2 : 120 + (i - 1) * (220 / Math.max(1, NB - 1)), tw = 112;
    this._geo = { top, mh, cx, tw };
    const towers = Array.from({ length: NB }, (_, k) => { const i = k + 1, x = cx(i) - tw / 2;
      let g = `<g id="t${i}">
        <ellipse cx="${cx(i)}" cy="${top + NP * (mh + 6) + 6}" rx="${tw / 2 + 10}" ry="8" fill="rgba(0,0,0,.45)"/>
        <rect class="halo" id="h${i}" x="${x - 10}" y="${top - 52}" width="${tw + 20}" height="${NP * (mh + 6) + 62}" rx="22" fill="none" stroke="var(--emer)" stroke-opacity="0" stroke-width="1.5"/>
        <rect x="${x}" y="${top - 46}" width="${tw}" height="40" rx="10" fill="url(#gHead)" stroke="rgba(244,241,234,.16)"/>
        <rect id="hl${i}" class="led" x="${x + 14}" y="${top - 37}" width="${tw - 28}" height="4" rx="2" fill="var(--emer)"/>
        <text x="${x + 14}" y="${top - 14}" font-size="9.5" font-weight="700" letter-spacing="1.2" fill="rgba(244,241,234,.6)">LUNA ${i}</text>
        <text id="ht${i}" x="${x + tw - 14}" y="${top - 14}" font-size="9.5" text-anchor="end" fill="rgba(244,241,234,.5)"></text>`;
      for (let j = 1; j <= NP; j++) { const y = top + (j - 1) * (mh + 6);
        g += `<rect x="${x}" y="${y}" width="${tw}" height="${mh}" rx="10" fill="url(#gMod)" stroke="rgba(244,241,234,.13)"/>
          <rect x="${x + 9}" y="${y + 10}" width="4" height="${mh - 20}" rx="2" fill="rgba(255,255,255,.08)"/>
          <rect id="ml${i}${j}" class="led" x="${x + 9}" y="${y + 10}" width="4" height="${mh - 20}" rx="2" fill="var(--emer)" opacity=".2" style="animation-delay:${j * .4}s"/>
          <rect x="${x + 20}" y="${y + 8}" width="${tw - 30}" height="${mh - 16}" rx="7" fill="rgba(0,0,0,.4)" stroke="rgba(244,241,234,.08)"/>
          <g clip-path="url(#cw${i}${j})"><g id="lv${i}${j}" class="lvl" style="transform:scaleY(.5)">
            <rect x="${x + 20}" y="${y + 8}" width="${tw - 30}" height="${mh - 16}" fill="url(#gLiq)" id="lq${i}${j}"/>
            <path class="wave" d="M${x + 20} ${y + 8} q9 -4 18 0 t18 0 t18 0 t18 0 t18 0 t18 0 v6 h-108 Z" fill="rgba(220,255,236,.5)" style="animation-duration:${2.6 + j * .4}s"/></g>
            ${[0, 1, 2].map(b => `<circle class="bub" cx="${x + 34 + b * 22}" cy="${y + mh - 12}" r="${1.6 + b * .5}" fill="rgba(255,255,255,.7)" style="--d:${2.2 + b * .6}s;--dl:${b * .7 + j * .3}s"/>`).join('')}</g>
          <rect x="${x + 20}" y="${y + 8}" width="${(tw - 30) * .35}" height="${mh - 16}" rx="7" fill="rgba(255,255,255,.06)"/>
          <text id="mp${i}${j}" x="${x + 20 + (tw - 30) / 2}" y="${y + mh / 2 + 5}" text-anchor="middle" font-size="14" font-weight="600" fill="#f4f1ea" style="paint-order:stroke" stroke="rgba(0,0,0,.45)" stroke-width="3">–</text>`; }
      return g + '</g>'; }).join('');
    const clips = Array.from({ length: NB }, (_, k) => Array.from({ length: NP }, (_, m) => { const i = k + 1, j = m + 1, x = cx(i) - tw / 2, y = top + m * (mh + 6);
      return `<clipPath id="cw${i}${j}"><rect x="${x + 20}" y="${y + 8}" width="${tw - 30}" height="${mh - 16}" rx="7"/></clipPath>`; }).join('')).join('');
    const busY = top + NP * (mh + 6) + 20, bx = W / 2;
    this._bpd = {};
    const paths = Array.from({ length: NB }, (_, k) => { const i = k + 1, x = cx(i), side = x < bx ? 1 : -1, hx = x + side * tw / 2;
      this._bpd[i] = `M${hx} ${top - 26} H${bx - side * 14} Q${bx} ${top - 26} ${bx} ${top - 12} V${busY - 4}`;
      return `<path id="bp${i}" d="${this._bpd[i]}" fill="none" stroke="rgba(244,241,234,.08)" stroke-width="5" stroke-linecap="round"/>`; }).join('');
    const svg = `<svg class="tw" viewBox="0 0 ${W} ${busY + 26}">
      <defs>${clips}
        <linearGradient id="gHead" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4152"/><stop offset="1" stop-color="#232834"/></linearGradient>
        <linearGradient id="gMod" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2b3140"/><stop offset=".5" stop-color="#353c4d"/><stop offset="1" stop-color="#262b37"/></linearGradient>
        <linearGradient id="gLiq" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a6f5cf"/><stop offset="1" stop-color="#1f9d68"/></linearGradient>
        <linearGradient id="gLow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc7a8"/><stop offset="1" stop-color="#d5582f"/></linearGradient>
        <linearGradient id="gMid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe3a3"/><stop offset="1" stop-color="#c48a1f"/></linearGradient>
        <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter></defs>
      ${paths}<g id="flow"></g>${towers}
      <rect x="${bx - 58}" y="${busY - 6}" width="116" height="26" rx="13" fill="rgba(0,0,0,.35)" stroke="rgba(244,241,234,.14)"/>
      <text id="busT" x="${bx}" y="${busY + 11}" text-anchor="middle" font-size="11" font-weight="600" fill="rgba(244,241,234,.75)">Omformer</text>
    </svg>`;
    this._r.innerHTML = `<style>${TB_CSS}</style><div class="c" id="c">
      <div class="hd"><div><div class="k" id="kick">LUNA2000</div><h3>${this.cfg.title || 'Batterier'}</h3></div><span class="chip" id="chip"><i></i>–</span></div>
      <div class="top"><div class="big" id="soc">–</div><div><div class="sub" id="sub">&nbsp;</div><div class="eta" id="eta">&nbsp;</div>
        <div class="gauge" id="gauge"><i id="gi" style="width:0%"></i><b id="geod"></b><b id="geoc"></b><span id="seod"></span><span id="seoc"></span></div></div></div>
      <div class="stage">${svg}</div>
      <div class="cap2" id="cap2"></div><div class="bal" id="bal"></div>
      <div class="grid" id="grid"></div>
      <button class="btn" id="ctl"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>Styr batteri og anlæg</button></div>`;
    this.$('ctl').onclick = () => this.dispatchEvent(new CustomEvent('th-battery-control', { bubbles: true, composed: true }));
  }

  update() {
    if (!this._h || !this._r) return;
    const NB = this.NB, NP = this.NP, rated = (this.n('rated') || NB * NP * this.PK * 1000) / 1000;
    const soc = this.n('soc'), pw = this.n('power'), eod = this.n('eod'), eoc = this.n('eoc');
    const state = !Number.isFinite(pw) ? 'off' : pw > 25 ? 'ch' : pw < -25 ? 'dis' : 'idle';
    const col = { ch: 'var(--emer)', dis: 'var(--coral)', idle: 'var(--ice)', off: 'var(--faint)' }[state];
    this.$('c').style.setProperty('--st', col);
    this.set('kick', `LUNA2000 · ${NB} × ${tbn(NP * this.PK, 0)} kWh`);
    this.set('chip', `<i></i>${{ ch: `Lader ${tbkw(pw)}`, dis: `Aflader ${tbkw(pw)}`, idle: 'Hviler', off: 'Offline' }[state]}`);
    this.set('soc', `${Number.isFinite(soc) ? Math.round(soc) : '–'}<small>%</small>`);
    const kwh = (soc || 0) / 100 * rated;
    this.set('sub', `<b>${tbn(kwh, 1)} kWh</b> af ${tbn(rated, 0)} kWh lagret`);
    let eta = '&nbsp;';
    if (state === 'ch' && Number.isFinite(eoc)) { const h = (eoc / 100 * rated - kwh) / (pw / 1000); if (h > 0 && h < 48) eta = `Fuld (${Math.round(eoc)} %) om ca. ${Math.floor(h)} t ${String(Math.round(h % 1 * 60)).padStart(2, '0')} m`; }
    if (state === 'dis' && Number.isFinite(eod)) { const h = (kwh - eod / 100 * rated) / (-pw / 1000); if (h > 0) eta = h > 36 ? 'Rækker mere end et døgn ved dette forbrug' : `Rækker ca. ${Math.floor(h)} t ${String(Math.round(h % 1 * 60)).padStart(2, '0')} m ved dette forbrug`; }
    if (state === 'idle') eta = soc >= (eoc || 100) - 1 ? 'Fuldt opladet' : 'Venter på overskud fra solen eller billig strøm';
    this.set('eta', eta);
    this.$('gi').style.width = tbc(soc || 0, 0, 100) + '%'; this.$('gi').style.setProperty('--sh', state === 'ch' ? 1 : 0);
    for (const [id, v, lab] of [['eod', eod, 'min'], ['eoc', eoc, 'maks']]) { const ok = Number.isFinite(v); this.$('g' + id).style.cssText = ok ? `left:${v}%` : 'display:none'; this.$('s' + id).style.cssText = ok ? `left:${v}%;transform:translateX(${v > 85 ? '-100%' : v < 15 ? '0' : '-50%'})` : 'display:none'; this.set('s' + id, ok ? `${lab} ${Math.round(v)} %` : ''); }

    // tårne og moduler
    const bats = [];
    for (let i = 1; i <= NB; i++) {
      const bs = Number.isFinite(this.b(i, 'state_of_capacity')) ? this.b(i, 'state_of_capacity') : soc, bp = Number.isFinite(this.b(i, 'charge_discharge_power')) ? this.b(i, 'charge_discharge_power') : (pw || 0) / NB;
      const packs = []; for (let j = 1; j <= NP; j++) { const ps = this.p(i, j, 'state_of_capacity'); packs.push({ soc: Number.isFinite(ps) ? ps : bs, p: this.p(i, j, 'charge_discharge_power'), t: this.p(i, j, 'max_temperature') }); }
      bats.push({ i, soc: bs, p: bp, temp: this.b(i, 'bms_temperature'), ch: this.b(i, 'day_charge'), dis: this.b(i, 'day_discharge'), st: this.st(unitEntity(this.P, i, 'running_status')), packs });
      const bcol = bp > 25 ? 'var(--emer)' : bp < -25 ? 'var(--coral)' : 'var(--ice)';
      this.$('hl' + i).setAttribute('fill', bcol); this.$('h' + i).setAttribute('stroke', bcol); this.$('h' + i).setAttribute('stroke-opacity', Math.abs(bp) > 25 ? '.45' : '0');
      this.$('ht' + i).textContent = Number.isFinite(bats[i - 1].temp) ? `${tbn(bats[i - 1].temp, 0)}°` : '';
      packs.forEach((pk, m) => { const j = m + 1, lv = tbc((pk.soc || 0) / 100, .03, 1);
        this.$(`lv${i}${j}`).style.transform = `scaleY(${lv})`;
        this.$(`lq${i}${j}`).setAttribute('fill', pk.soc < 15 ? 'url(#gLow)' : pk.soc < 35 ? 'url(#gMid)' : 'url(#gLiq)');
        this.$(`mp${i}${j}`).textContent = `${Math.round(pk.soc || 0)} %`;
        const pp = Number.isFinite(pk.p) ? pk.p : bp / NP, ml = this.$(`ml${i}${j}`);
        ml.setAttribute('fill', pp > 15 ? 'var(--emer)' : pp < -15 ? 'var(--coral)' : 'var(--ice)'); ml.setAttribute('opacity', Math.abs(pp) > 15 ? '1' : '.25');
        ml.classList.toggle('led', Math.abs(pp) > 15); });
    }
    this.flow(bats);
    // bus-etiket
    this.$('busT').textContent = state === 'ch' ? `↑ ${tbkw(pw)} ind` : state === 'dis' ? `↓ ${tbkw(pw)} til huset` : 'Omformer';
    // pr. batteri
    this.set('cap2', bats.map((b, k) => { const s = b.p > 25 ? 'var(--emer)' : b.p < -25 ? 'var(--coral)' : 'var(--ice)', ts = b.packs.map(x => x.t).filter(Number.isFinite);
      return `<div class="bc" style="--s:${s};animation-delay:${k * 80}ms"><div class="n"><i></i>Batteri ${b.i}${b.st && b.st !== 'Running' ? ` · ${b.st}` : ''}</div>
        <b>${Math.round(b.soc || 0)} %<u>${Math.abs(b.p) > 25 ? (b.p > 0 ? '+' : '−') + tbkw(b.p) : 'hviler'}</u></b>
        <em>${tbn((b.soc || 0) / 100 * NP * this.PK, 1)} kWh · moduler ${ts.length ? `${tbn(Math.min(...ts), 0)}–${tbn(Math.max(...ts), 0)} °C` : '–'}</em>
        <em>i dag ↑ ${tbn(b.ch, 1)} · ↓ ${tbn(b.dis, 1)} kWh</em></div>`; }).join(''));
    if (!this._capR) { this._capR = 1; setTimeout(() => this.$('cap2').classList.add('ready'), 1500); }
    const all = bats.flatMap(b => b.packs.map(p => p.soc)).filter(Number.isFinite), spread = all.length ? Math.max(...all) - Math.min(...all) : 0;
    const bsp = bats.length > 1 ? Math.abs(bats[0].soc - bats[1].soc) : 0, bcCol = spread <= 3 ? 'var(--emer)' : spread <= 8 ? 'var(--gold)' : 'var(--coral)';
    this.$('bal').style.setProperty('--bc', bcCol);
    this.set('bal', `<i></i>${spread <= 3 ? 'Godt balanceret' : spread <= 8 ? 'Let ubalance' : 'Ubalance mellem modulerne'} · ${bats.length > 1 ? `${Math.round(bsp)} % mellem batterierne · ` : ''}modulerne ${all.length ? `${Math.round(Math.min(...all))}–${Math.round(Math.max(...all))} %` : '–'}`);
    // nøgletal
    const tot = this.n('totDis'), cyc = Number.isFinite(tot) ? tot / rated : NaN, mode = this.st(this.E.mode), grid = this.st(this.E.gridCh);
    const mc = this.n('maxCh'), md = this.n('maxDis');
    this.set('grid', [['Driftsform', TB_MODE[mode] || (mode || '–').replace(/_/g, ' ')], ['Grænser', Number.isFinite(eod) ? `${Math.round(eod)}–${Math.round(eoc)} %` : '–'],
      ['Cyklusser', Number.isFinite(cyc) ? `≈ ${tbn(cyc, 0)}` : '–'], ['Maks. effekt', Number.isFinite(mc) ? `${tbn(mc / 1000, 0)} / ${tbn(md / 1000, 0)} kW` : '–'],
      ['Ladet i dag', `${tbn(this.n('ch'), 1)} kWh`], ['Afgivet i dag', `${tbn(this.n('dis'), 1)} kWh`], ['Lad fra elnet', grid === 'on' ? 'Tilladt' : grid === 'off' ? 'Slået fra' : '–'],
      ['Status', this.st(this.E.status) === 'Running' ? 'Kører' : (this.st(this.E.status) || '–')]].map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join(''));
  }
  flow(bats) {
    const key = bats.map(b => Math.sign(Math.round(b.p / 25)) + ':' + Math.round(Math.abs(b.p) / 1250)).join('|'); if (key === this._fk) return; this._fk = key;
    let g = '';
    bats.forEach(b => { const a = Math.abs(b.p); if (a < 25) return; const ch = b.p > 0, r = tbc(a / 5000, .1, 1), n = Math.round(2 + r * 4), dur = (3.2 - r * 1.6).toFixed(2), col = ch ? '#6be3a8' : '#ff9e7a';
      g += `<path d="${this._bpd[b.i]}" fill="none" stroke="${col}" stroke-opacity=".4" stroke-width="${(2 + r * 4).toFixed(1)}" stroke-linecap="round"/>`;
      for (let k = 0; k < n; k++) g += `<g><circle r="5" fill="${col}" opacity=".35" filter="url(#soft)"/><circle r="2.2" fill="#fff"/>
        <animateMotion dur="${dur}s" begin="${(-k * dur / n).toFixed(2)}s" repeatCount="indefinite" ${ch ? 'keyPoints="1;0" keyTimes="0;1" calcMode="linear"' : ''}><mpath href="#bp${b.i}"/></animateMotion></g>`; });
    this.$('flow').innerHTML = g;
  }
}
if (!customElements.get('th-battery-card')) customElements.define('th-battery-card', ThBatteryCard);
window.customCards = window.customCards || [];
if (!window.customCards.some(c => c.type === 'th-battery-card')) window.customCards.push({ type: 'th-battery-card', name: 'TH batterier', description: 'Huawei LUNA2000 med flere batterier og moduler, animeret', preview: true });
console.info(`%c TH-BATTERI %c ${TB_VER} `, 'background:#6be3a8;color:#0b1a12;font-weight:700', 'color:#6be3a8');
