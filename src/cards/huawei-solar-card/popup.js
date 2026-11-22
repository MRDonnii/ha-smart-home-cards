// <huawei-solar-popup>: the detail / control sheet opened from the card (on document.body).
import { STYLE, POP_STYLE } from './styles.js';
import { lbl, esc, fmtW, fmtN, kwh, ic } from './util.js';
import { histChart, priceChart, cheapestWindow } from './charts.js';
import { groupDigits } from './config.js';

/* ======================= popup ======================= */
export class HuaweiSolarPopup extends HTMLElement {
  connectedCallback() {
    this._root = this.attachShadow({ mode: 'open' });
    this._dirty = {};
    this._esc = e => { if (e.key === 'Escape') this.close(); };
    window.addEventListener('keydown', this._esc);
    this._render();
  }
  disconnectedCallback() { window.removeEventListener('keydown', this._esc); }
  close() { this.dispatchEvent(new Event('closed')); this.remove(); }
  set hass(h) { this._hass = h; if (this._root && !Object.keys(this._dirty).length && !this._busy) this._refresh(); }
  get c() { return this.card; }
  $(id) { return this._root.getElementById(id); }

  _render() {
    const META = {
      solar: ['Solceller', 'var(--sun)', 'panel'], inverter: ['Inverter', 'var(--sun)', 'inverter'], home: ['Huset i dag', 'var(--home)', 'home'],
      grid: ['Elnet', 'var(--grid)', 'grid'], battery: ['Batteri', 'var(--bat)', 'battery'], control: ['Batteri · styring', 'var(--bat)', 'sliders'],
      price: ['Elpris', 'var(--sun)', 'tag'], ev: ['Elbil‑lader', 'var(--ev)', 'ev'],
    }[this.kind] || ['Detaljer', 'var(--sun)', 'panel'];
    this._root.innerHTML = `<style>${STYLE}${POP_STYLE}</style><div class="bg"></div>
      <div class="dlg" style="--c:${META[1]}" role="dialog" aria-label="${META[0]}">
        <div class="head"><div class="ib">${ic(META[2], 20)}</div><h2>${META[0]}</h2><button class="x" aria-label="Luk">×</button></div>
        <div class="body" id="body"></div>
        <div class="bar" id="apply"><span id="applyTxt" style="font-size:12px;font-weight:600"></span><div style="display:flex;gap:8px"><button class="btn" id="undo">Fortryd</button><button class="btn pri" id="ok">Anvend</button></div></div>
      </div><div class="toast" id="toast"></div>`;
    this._root.querySelector('.bg').onclick = () => this.close();
    const dlg = this._root.querySelector('.dlg');
    for (const ev of ['pointerdown', 'input', 'wheel', 'touchstart']) dlg.addEventListener(ev, () => { this._touch = Date.now(); }, { passive: true });
    this._root.querySelector('.x').onclick = () => this.close();
    this.$('undo').onclick = () => { this._dirty = {}; this._refresh(true); };
    this.$('ok').onclick = () => this._apply();
    this._refresh(true);
  }

  _refresh(force) {
    if (!this._hass || !this.$('body')) return;
    const now = Date.now();
    if (!force && (now - (this._touch || 0) < 15000 || now - (this._lastR || 0) < 10000)) return;
    this._lastR = now;
    const keep = { ph: this.$('ph'), pp: this.$('pp') };
    const c = this.c, d = c.calc(), b = this.$('body'), P = c._plant;
    const cell = (k, v, col) => `<div class="cell"><span>${k}</span><b ${col ? `style="color:${col}"` : ''}>${v}</b></div>`;
    const chart = id => `<div class="chart" id="${id}"><div class="tip"></div><svg></svg></div>`;
    const leg = `<div class="leg"><span><i style="background:var(--sun)"></i>Sol</span><span><i style="background:var(--home)"></i>Forbrug</span><span><i style="background:var(--bat)"></i>Batteri %</span></div>`;
    const mi = k => `<a class="mi" data-mi="${c.eid(k)}">historik</a>`;
    let h = '';
    switch (this.kind) {
      case 'solar': {
        const s1 = c.n('pv1v') * c.n('pv1a'), s2 = c.n('pv2v') * c.n('pv2a');
        h = `<div class="grid2">${cell('Produktion nu', fmtW(d.pv), 'var(--sun)')}${cell('I dag', fmtN(d.pvDay, 1) + ' kWh')}${cell('Denne time', fmtN(c.n('hourY'), 2) + ' kWh')}${cell('Peak i dag', fmtW(c.n('peak')))}</div>
          <div class="sec">Strenge</div><div class="grid2">${cell('Streng 1', fmtW(s1), 'var(--sun)')}${cell('Spænding / strøm', fmtN(c.n('pv1v'), 0) + ' V · ' + fmtN(c.n('pv1a'), 2) + ' A')}${cell('Streng 2', fmtW(s2), 'var(--sun)')}${cell('Spænding / strøm', fmtN(c.n('pv2v'), 0) + ' V · ' + fmtN(c.n('pv2a'), 2) + ' A')}</div>
          <div class="sec">Sidste 24 timer</div>${leg}${chart('ph')}
          <div class="sec">Produktion over tid</div><div class="grid2">${cell('Denne måned', c.has('month') ? kwh(c.n('month')) + ' kWh' : '–')}${cell('I år', c.has('year') ? kwh(c.n('year')) + ' kWh' : '–')}${cell('Total', kwh(c.n('pvTot')) + ' kWh')}${cell('Egetforbrug i dag', (d.pvDay ? Math.round(d.selfUse / d.pvDay * 100) : 0) + ' %')}</div>
          <div class="sec">Vejret</div><div class="grid2">${cell('Solindstråling', c.has('rad') ? fmtN(c.n('rad'), 0) + ' W/m²' : '–')}${cell('Skydække', c.has('cloud') ? fmtN(c.n('cloud'), 0) + ' %' : '–')}${cell('Solskin i dag', c.has('sunH') ? fmtN(c.n('sunH'), 1) + ' t' : '–')}${cell('Solhøjde', fmtN(c.a('sun', 'elevation') || 0, 1) + '°')}</div>`;
        break;
      }
      case 'home':
        h = `<div class="grid2">${cell('Forbrug nu', fmtW(d.load), 'var(--home)')}${cell('Forbrug i dag', fmtN(d.cons, 1) + ' kWh')}${cell('Selvforsynet i dag', Math.round(d.aut) + ' %', 'var(--bat)')}${cell('Sol til huset nu', Math.round(Math.min(1, d.pv / Math.max(d.load, 1)) * 100) + ' %')}
          ${cell('Produceret', fmtN(d.pvDay, 1) + ' kWh', 'var(--sun)')}${cell('Købt', fmtN(d.impD, 1) + ' kWh', 'var(--grid)')}${cell('Solgt', fmtN(d.expD, 1) + ' kWh', 'var(--exp)')}${cell('Sparet ca.', d.hasPrice ? fmtN(d.selfUse * d.mean, 0) + ' kr' : '–', 'var(--sun)')}</div>
          <div class="sec">Sidste 24 timer</div>${leg}${chart('ph')}`;
        break;
      case 'grid':
        h = `<div class="grid2">${cell(d.grid > 0 ? 'Køber nu' : 'Sælger nu', fmtW(d.grid), d.grid > 0 ? 'var(--grid)' : 'var(--exp)')}${cell('Købt i dag', fmtN(d.impD, 1) + ' kWh')}${cell('Solgt i dag', fmtN(d.expD, 1) + ' kWh')}${cell('Elpris nu', d.hasPrice ? fmtN(d.priceNow, 2) + ' kr' : '–')}
          ${cell('Købt i alt', kwh(c.n('impTot')) + ' kWh')}${cell('Solgt i alt', kwh(c.n('expTot')) + ' kWh')}${cell('CO₂ i nettet', c.has('co2') ? fmtN(c.n('co2'), 0) + ' g/kWh' : '–')}</div>
          <div class="sec">Styring</div>
          ${this._num('maxFeed', 'Maks. salg til elnettet', 'Hvor meget strøm anlægget må sende ud på elnettet. 0 W = intet salg.', 'var(--exp)', 0, P.max_power, 100)}`;
        break;
      case 'inverter': {
        const alarm = c.st('alarms');
        h = `<div class="grid2">${cell('Status', esc(c.st('invStatus')), 'var(--bat)')}${cell('Aktiv effekt', fmtW(d.inv))}${cell('Virkningsgrad', fmtN(c.n('eff'), 1) + ' %')}${cell('Alarmer', alarm === 'None' ? 'Ingen ✓' : esc(alarm), alarm === 'None' ? 'var(--bat)' : 'var(--bad)')}
          ${cell('Produceret i dag', fmtN(c.n('invDay'), 2) + ' kWh')}${cell('PV‑forbindelse', esc(c.st('pvConn')))}${cell('Startet i dag', c.s('start') ? new Date(c.st('start')).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' }) : '–')}${cell('Total produceret', kwh(c.n('pvTot')) + ' kWh')}</div>
          <div class="note">${esc(c.st('invState'))}</div>
          <div class="sec">Styring</div>
          ${this._num('derate', 'Effektbegrænsning', `Maks. AC‑effekt fra inverteren. ${groupDigits(P.max_power)} W = ingen begrænsning.`, 'var(--sun)', 0, P.max_power, 100)}
          ${this._sw('invSwitch', 'Inverter tændt', 'Slukker du, stopper al solcelleproduktion indtil den tændes igen.', 'var(--sun)')}`;
        break;
      }
      case 'battery':
        h = `<div class="grid2">${cell('Ladestand', Math.round(d.soc) + ' %', 'var(--bat)')}${cell('Effekt', (d.bat > 25 ? '+' : d.bat < -25 ? '−' : '') + fmtW(d.bat))}${cell('Status', esc(c.st('batStatus') === 'Running' ? 'Kører' : c.st('batStatus')))}${cell('Driftsform', lbl(c.st('mode')))}
          ${cell('Ladet i dag', fmtN(c.n('chDay'), 1) + ' kWh')}${cell('Afladet i dag', fmtN(c.n('disDay'), 1) + ' kWh')}${cell('Ladet i alt', kwh(c.n('batTotCh')) + ' kWh')}${cell('Afladet i alt', kwh(c.n('batTotDis')) + ' kWh')}
          ${cell('Busspænding', fmtN(c.n('busV'), 0) + ' V')}${cell('Tvangsopladning', c.st('forc') === 'Stopped' ? 'Stoppet' : esc(c.st('forc')))}${cell('Min. / maks. SOC', fmtN(c.n('eod'), 0) + ' / ' + fmtN(c.n('eoc'), 0) + ' %')}${cell('Opladning fra net', c.st('gridCh') === 'on' ? 'Til' : 'Fra')}</div>
          <div class="sec">Sidste 24 timer</div>${leg}${chart('ph')}
          <button class="btn pri" id="toCtl" style="background:var(--bat);justify-self:start">Åbn styring</button>`;
        break;
      case 'control':
        h = `<div class="grid2">${cell('Ladestand', Math.round(d.soc) + ' %', 'var(--bat)')}${cell('Effekt', (d.bat > 25 ? '+' : d.bat < -25 ? '−' : '') + fmtW(d.bat))}${cell('Elpris nu', d.hasPrice ? fmtN(d.priceNow, 2) + ' kr' : '–')}</div>
          ${this._sel('mode', 'Driftsform', 'Maks. egetforbrug bruger solen og batteriet først. Tidsstyret lader/aflader efter tidsplan i FusionSolar.', 'var(--bat)')}
          ${this._sel('ess', 'EMMA styring', 'Hvordan EMMA styrer hele anlægget.', 'var(--bat)', o => !o.startsWith('reserved'))}
          ${this._sel('touExcess', 'Overskudssol ved tidsstyring', 'Hvad der sker med overskud, når driftsformen er Tidsstyret.', 'var(--sun)')}
          ${this._sw('gridCh', 'Opladning fra elnettet', 'Tillader at batteriet lades med strøm fra elnettet (fx når prisen er lav).', 'var(--grid)')}
          ${this._num('eod', 'Minimum ladestand', 'Batteriet aflader ikke under denne grænse.', 'var(--bat)', null, null, 1, '%')}
          ${this._num('eoc', 'Maksimum ladestand', 'Batteriet stopper opladning her.', 'var(--bat)', null, null, 1, '%')}
          ${this._num('gridCut', 'Stop netopladning ved', 'Opladning fra elnettet stopper ved denne ladestand.', 'var(--grid)', null, null, 1, '%')}
          ${this._num('maxCh', 'Maks. ladeeffekt', '', 'var(--bat)', null, null, 100)}
          ${this._num('maxDis', 'Maks. afladeeffekt', '', 'var(--bat)', null, null, 100)}
          ${this._num('gridChMax', 'Maks. effekt ved netopladning', '', 'var(--grid)', null, null, 100)}
          ${c.st('forc') !== 'Stopped' && c.st('forc') !== '–' ? `<div class="ctl"><div class="h">Tvangsopladning kører<button class="btn warn" id="stopForc">Stop</button></div></div>` : ''}
          <div class="note">Ændringer sendes direkte til Huawei‑anlægget, når du trykker <b>Anvend</b>. Tidsplaner for Tidsstyret laves i FusionSolar‑appen.</div>`;
        break;
      case 'price': {
        const w = cheapestWindow(c.prices, 3), w2 = cheapestWindow(c.prices, 1);
        h = `<div class="grid2">${cell('Pris nu', fmtN(d.priceNow, 2) + ' kr', 'var(--sun)')}${cell('Snit i dag', fmtN(c.a('price', 'today_mean') || 0, 2) + ' kr')}${cell('Min / maks i dag', fmtN(c.a('price', 'today_min') || 0, 2) + ' / ' + fmtN(c.a('price', 'today_max') || 0, 2))}${cell('CO₂ i nettet', fmtN(c.n('co2'), 0) + ' g/kWh')}
          ${w2 ? cell('Billigste time', 'kl. ' + String(w2.start.getHours()).padStart(2, '0') + ' · ' + fmtN(w2.avg, 2), 'var(--bat)') : ''}${w ? cell('Billigste 3 timer', 'kl. ' + String(w.start.getHours()).padStart(2, '0') + '–' + String((w.start.getHours() + 3) % 24).padStart(2, '0') + ' · ' + fmtN(w.avg, 2), 'var(--bat)') : ''}
          ${c.a('price', 'tomorrow_mean') ? cell('Snit i morgen', fmtN(c.a('price', 'tomorrow_mean'), 2) + ' kr') : ''}</div>
          <div class="sec">I dag og i morgen (kr/kWh)</div>${chart('pp')}`;
        break;
      }
      case 'ev':
        h = `<div class="grid2">${cell('Status', d.evOn ? 'Lader' : 'Standby', d.evOn ? 'var(--ev)' : '')}${cell('Temperatur', fmtN(c.n('evTemp'), 1) + ' °C')}${cell('Ladet i alt', kwh(d.evTot) + ' kWh', 'var(--ev)')}${P.charger_model ? cell('Model', esc(P.charger_model)) : ''}</div>
          <div class="note"><b>Styring:</b> Huawei‑integrationen i Home Assistant kan i dag kun <i>aflæse</i> laderen (energi og temperatur). Start/stop, ladestrøm og sol‑ladning styres i FusionSolar‑appen.<br><br>
          Status “Lader” vurderes ud fra, at den samlede ladede energi stiger.</div>`;
        break;
    }
    b.innerHTML = h;
    b.querySelectorAll('[data-mi]').forEach(a => a.onclick = () => { this.dispatchEvent(new CustomEvent('hass-more-info', { bubbles: true, composed: true, detail: { entityId: a.dataset.mi } })); });
    const ph = this.$('ph');
    if (ph && keep.ph && this._phS === this.series) ph.replaceWith(keep.ph); else if (ph && this.series) { histChart(ph, this.series, { h: 200 }); this._phS = this.series; }
    const pp = this.$('pp'), pk = c.prices.length + '|' + new Date().getHours();
    if (pp && keep.pp && this._ppK === pk) pp.replaceWith(keep.pp); else if (pp) { priceChart(pp, c.prices, { h: 170, every: 3 }); this._ppK = pk; }
    const tc = this.$('toCtl'); if (tc) tc.onclick = () => { this.kind = 'control'; this._render(); };
    const sf = this.$('stopForc'); if (sf) sf.onclick = () => this._call('button', 'press', { entity_id: c.eid('stopForc') }, 'Tvangsopladning stoppet');
    this._wire();
  }

  /* --- control builders --- */
  _sel(k, title, help, col, filter = () => true) {
    const s = this.c.s(k); if (!s) return '';
    const opts = (s.attributes.options || []).filter(filter), cur = this._dirty[k] ?? s.state;
    return `<div class="ctl ${this._dirty[k] != null ? 'dirty' : ''}" style="--c:${col}"><div class="h">${title}<small>${lbl(s.state)}</small></div>
      <div class="seg" data-k="${k}">${opts.map(o => `<button data-v="${o}" class="${o === cur ? 'on' : ''}">${lbl(o)}</button>`).join('')}</div>${help ? `<div class="help">${help}</div>` : ''}</div>`;
  }
  _sw(k, title, help, col) {
    const s = this.c.s(k); if (!s) return '';
    const cur = this._dirty[k] ?? s.state;
    return `<div class="ctl ${this._dirty[k] != null ? 'dirty' : ''}" style="--c:${col}"><div class="h">${title}<button class="sw ${cur === 'on' ? 'on' : ''}" data-sw="${k}" aria-label="${title}"></button></div>${help ? `<div class="help">${help}</div>` : ''}</div>`;
  }
  _num(k, title, help, col, min, max, step, unit) {
    const s = this.c.s(k); if (!s) return '';
    const a = s.attributes; min = min ?? a.min; max = max ?? a.max; step = step || a.step || 1; unit = unit || a.unit_of_measurement || '';
    const cur = parseFloat(this._dirty[k] ?? s.state);
    const show = v => unit === 'W' ? fmtW(v) : fmtN(v, step < 1 ? 1 : 0) + ' ' + unit;
    return `<div class="ctl ${this._dirty[k] != null ? 'dirty' : ''}" style="--c:${col}"><div class="h">${title}<span class="val" data-show="${k}">${show(cur)}</span></div>
      <input type="range" data-num="${k}" data-unit="${unit}" data-step="${step}" min="${min}" max="${max}" step="${step}" value="${cur}">${help ? `<div class="help">${help}</div>` : ''}</div>`;
  }
  _wire() {
    const r = this._root;
    r.querySelectorAll('.seg').forEach(seg => seg.querySelectorAll('button').forEach(btn => btn.onclick = () => {
      const k = seg.dataset.k; seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === btn));
      this._mark(k, btn.dataset.v, seg.closest('.ctl'));
    }));
    r.querySelectorAll('[data-sw]').forEach(sw => sw.onclick = () => { sw.classList.toggle('on'); this._mark(sw.dataset.sw, sw.classList.contains('on') ? 'on' : 'off', sw.closest('.ctl')); });
    r.querySelectorAll('[data-num]').forEach(inp => {
      inp.oninput = () => { const v = parseFloat(inp.value), u = inp.dataset.unit;
        r.querySelector(`[data-show="${inp.dataset.num}"]`).textContent = u === 'W' ? fmtW(v) : fmtN(v, parseFloat(inp.dataset.step) < 1 ? 1 : 0) + ' ' + u; };
      inp.onchange = () => this._mark(inp.dataset.num, inp.value, inp.closest('.ctl'));
    });
  }
  _mark(k, v, el) {
    const s = this.c.s(k);
    if (s && String(s.state) === String(v) || s && parseFloat(s.state) === parseFloat(v) && !isNaN(parseFloat(v))) delete this._dirty[k]; else this._dirty[k] = v;
    if (el) el.classList.toggle('dirty', k in this._dirty);
    const n = Object.keys(this._dirty).length;
    this.$('applyTxt').textContent = n ? `${n} ændring${n > 1 ? 'er' : ''} klar` : '';
    this.$('apply').classList.toggle('show', n > 0);
    if (n && this._dirty.invSwitch === 'off') this.$('applyTxt').textContent = '⚠ Inverteren slukkes – produktionen stopper';
  }
  async _apply() {
    this._busy = true; const ok = this.$('ok'); ok.disabled = true; ok.textContent = 'Sender…';
    try {
      for (const [k, v] of Object.entries(this._dirty)) {
        const id = this.c.eid(k); if (!id) continue;
        const dom = id.split('.')[0];
        if (dom === 'select') await this._hass.callService('select', 'select_option', { entity_id: id, option: v });
        else if (dom === 'switch') await this._hass.callService('switch', v === 'on' ? 'turn_on' : 'turn_off', { entity_id: id });
        else if (dom === 'number') await this._hass.callService('number', 'set_value', { entity_id: id, value: parseFloat(v) });
      }
      this._toast('✓ Gemt på anlægget'); this._dirty = {}; this.$('apply').classList.remove('show');
    } catch (e) { this._toast('⚠ Fejl: ' + (e.message || e)); }
    ok.disabled = false; ok.textContent = 'Anvend'; this._busy = false;
    setTimeout(() => this._refresh(true), 1500);
  }
  async _call(d, s, data, msg) { try { await this._hass.callService(d, s, data); this._toast('✓ ' + msg); } catch (e) { this._toast('⚠ Fejl: ' + (e.message || e)); } }
  _toast(t) { const el = this.$('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(this._tt); this._tt = setTimeout(() => el.classList.remove('show'), 2600); }
}
