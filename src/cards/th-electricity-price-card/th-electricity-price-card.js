/* TH elpris – Strømligning med 24 t / 48 t / 7 dage, linje/søjler, prissammensætning, billigste vindue og bilens ladeplan
 * type: custom:th-electricity-price-card
 * style: new | classic  – nyt kort eller det klassiske (custom:ha-electricity-price-card), valgt i kortets opsætning
 * style_entity (eller switch_entity): input_boolean der vælger mellem dette kort (til) og det klassiske kort (fra)
 * classic: konfiguration til custom:ha-electricity-price-card
 * days: false  – uden dagsgennemsnit i bunden (de vises aldrig på mobil)
 * charge: { plan, mode, cost, energy, cable, tracker, charger_mode, soc, target, name }  – vises kun når ladeplanen er aktiv og bilen er sat i laderen derhjemme
 * Bruger temaets variabler: --dashboard-accent/success/warning/danger, --dashboard-left-accent-width, --dashboard-card-highlight m.fl.
 */
import { isNewLook, lookFormSchema, LOOK_LABELS } from '../../shared/look.js';

const TEP_VER = '1.7.0';
const tn = (v, d = 2) => (Number.isFinite(v) ? v : 0).toLocaleString('da-DK', { minimumFractionDigits: d, maximumFractionDigits: d });
const tt = d => `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
const TI = {
  bolt: '<path d="M13 2.5 5.5 13.5H11L9.8 21.5 18.5 9.5H13l1-7Z"/>', line: '<path d="M3 17l5-6 4 3 6-8 3 3"/>', bars: '<path d="M5 20v-7M10 20V8M15 20v-5M20 20V5"/>',
  car: '<path d="M5 16.5V12l2-5.2A2 2 0 0 1 8.9 5.5h6.2a2 2 0 0 1 1.9 1.3l2 5.2v4.5"/><path d="M3.5 16.5h17v2.5a1 1 0 0 1-1 1H18a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1Z"/><path d="M5 12h14M7.5 14.5h1M15.5 14.5h1"/>',
  plug: '<path d="M8 3v5M16 3v5M6 8h12v3a6 6 0 0 1-12 0Z"/><path d="M12 17v4"/>',
};
const ti = (k, s = 16, sw = 1.7) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="display:block;flex:none" aria-hidden="true">${TI[k] || ''}</svg>`;

const TEP_CSS = `
:host{display:block;--acc:var(--dashboard-accent,#e8c37e);--good:var(--dashboard-success,#6be3a8);--warn:var(--dashboard-warning,#e8c37e);--bad:var(--dashboard-danger,#ff9e7a);
  --ev:var(--dashboard-ev,#b7a4ff);--ink:var(--primary-text-color,#f4f1ea);--mut:var(--secondary-text-color,rgba(244,241,234,.58));--hair:var(--dashboard-border-neutral,rgba(127,145,165,.18));
  color:var(--ink);font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
:host([fill]){height:100%}
*{box-sizing:border-box}button{font:inherit;color:inherit}
/* Rammen er et rigtigt ha-card, så baggrund, kant, skygge og hover er temaets – ens med alle de andre kort (Claude AI, 2026-10-12) */
.c{position:relative;overflow:hidden;isolation:isolate;display:flex;flex-direction:column;height:100%;padding:14px 16px 12px;
  border-left:calc(var(--dashboard-left-accent-width,0) * 4px) solid var(--acc)}
@keyframes gl{50%{transform:translate(-24px,18px) scale(1.08)}}
@keyframes tin{from{opacity:0;transform:translateY(12px)}}
.hd{display:flex;align-items:center;gap:10px}
.ic{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;color:var(--acc);background:color-mix(in srgb,var(--acc) 14%,transparent);flex:none}
.ic svg{animation:zap 4s ease-in-out infinite}@keyframes zap{0%,86%,100%{opacity:1}88%,92%{opacity:.35}}
.ttl b{display:block;font-size:17px;font-weight:700;letter-spacing:-.01em;line-height:1.1}.ttl small{display:flex;align-items:center;gap:6px;font-size:10.5px;color:var(--mut);margin-top:2px}
.ttl small i{width:6px;height:6px;border-radius:50%;background:var(--good);box-shadow:0 0 8px var(--good);animation:bl 2s infinite}.ttl small.off i{background:var(--mut);box-shadow:none;animation:none}
@keyframes bl{50%{opacity:.35}}
.sp{flex:1}
.seg{display:inline-flex;gap:2px;padding:3px;border-radius:12px;background:color-mix(in srgb,var(--ink) 5%,transparent);box-shadow:inset 0 0 0 1px var(--hair);flex:none}
.seg button{appearance:none;border:0;cursor:pointer;position:relative;display:grid;place-items:center;min-width:34px;padding:6px 10px;border-radius:9px;background:transparent;color:var(--mut);font-size:12px;font-weight:700;transition:transform .25s cubic-bezier(.2,1.4,.4,1),background .3s,box-shadow .3s,color .3s}
.seg button:active{transform:scale(.9);transition-duration:.08s}
.seg button:hover{color:var(--ink)}
/* Navbarens look på den aktive knap (Claude AI, 2026-10-13): glas i temaets lux-accent, lysende streg og et tyggegummi-squash når den vælges */
.seg button.on{background:linear-gradient(180deg,color-mix(in srgb,var(--lux-accent,var(--dashboard-accent,#e8c37e)) 28%,transparent),color-mix(in srgb,var(--lux-accent,var(--dashboard-accent,#e8c37e)) 7%,transparent));color:color-mix(in srgb,var(--lux-accent,var(--dashboard-accent,#e8c37e)) 70%,#fff);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--lux-accent,var(--dashboard-accent,#e8c37e)) 45%,transparent),inset 0 1px 0 rgba(255,255,255,.12),0 8px 24px -8px color-mix(in srgb,var(--lux-accent,var(--dashboard-accent,#e8c37e)) 60%,transparent);animation:luxGum .7s ease-out}
.seg button.on::after{content:"";position:absolute;left:50%;bottom:2px;width:14px;height:2px;border-radius:2px;transform:translateX(-50%);background:var(--lux-accent,var(--dashboard-accent,#e8c37e));box-shadow:0 0 10px var(--lux-accent,var(--dashboard-accent,#e8c37e));pointer-events:none}
@keyframes luxGum{0%{transform:none}25%{transform:scale(1.12,.86)}50%{transform:scale(.93,1.08)}70%{transform:scale(1.04,.97)}100%{transform:none}}
.seg button.on svg{color:color-mix(in srgb,var(--lux-accent,var(--dashboard-accent,#e8c37e)) 80%,#fff);filter:drop-shadow(0 0 6px color-mix(in srgb,var(--lux-accent,var(--dashboard-accent,#e8c37e)) 60%,transparent))}
.pt{display:grid;grid-template-columns:auto minmax(0,1fr) auto;grid-template-areas:'chip . ctl' 'big comp comp';gap:6px 20px;align-items:end}
.pt .chip{grid-area:chip;justify-self:start;align-self:center}.pt .ctl{grid-area:ctl;display:flex;gap:6px;align-self:start}.pt .big{grid-area:big}.pt .comp{grid-area:comp}
.lv{display:inline-block;width:7px;height:7px;border-radius:50%;margin-left:8px;vertical-align:.55em;background:var(--good);box-shadow:0 0 8px var(--good);animation:bl 2s infinite}.lv.off{background:var(--mut);box-shadow:none;animation:none}
.chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:99px;font-size:11.5px;font-weight:700;color:var(--c);background:color-mix(in srgb,var(--c) 14%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 28%,transparent)}
.chip i{width:6px;height:6px;border-radius:50%;background:currentColor;animation:bl 1.6s infinite}
.big{font-size:40px;font-weight:300;letter-spacing:-.045em;line-height:1;white-space:nowrap}.big small{font-size:14px;font-weight:600;letter-spacing:0;color:var(--mut);margin-left:5px}
.comp{min-width:0;margin-bottom:4px}
.comp .bar{display:flex;height:7px;border-radius:7px;overflow:hidden;gap:2px}
/* Tarif-bjælken står stille – den voksede ind igen ved hver ændring og så ud som et hop (Claude AI, 2026-10-12) */
.comp .bar b{display:block;height:100%;border-radius:2px;transition:width .6s ease}
@keyframes grow{from{transform:scaleX(0)}}
.comp .lg{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:7px;font-size:11px;color:var(--mut)}
.comp .lg span{display:inline-flex;align-items:center;gap:5px}.comp .lg i{width:7px;height:7px;border-radius:2px}
/* ladeplan */
.ev{display:none;grid-template-columns:auto minmax(0,1fr) auto;gap:14px;align-items:center;margin-top:12px;padding:10px 12px;border-radius:15px;
  background:linear-gradient(100deg,color-mix(in srgb,var(--ev) 16%,transparent),color-mix(in srgb,var(--ev) 4%,transparent));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ev) 32%,transparent);animation:tin .7s cubic-bezier(.16,1,.3,1) both}
.ev.on{display:grid}
.ev .car{position:relative;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;color:var(--ev);background:color-mix(in srgb,var(--ev) 16%,transparent)}
.ev .car em{position:absolute;right:-4px;top:-4px;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;background:var(--ev);color:#141018;animation:pz 2s ease-in-out infinite}
@keyframes pz{50%{transform:scale(1.15);box-shadow:0 0 14px var(--ev)}}
.ev .t{font-size:13px;font-weight:700}.ev .t span{font-weight:500;color:var(--mut)}
.ev .soc{position:relative;height:6px;border-radius:6px;background:color-mix(in srgb,var(--ink) 8%,transparent);margin-top:7px;overflow:hidden}
.ev .soc i{position:absolute;left:0;top:0;bottom:0;border-radius:6px;background:var(--ev);opacity:.9}
.ev .soc u{position:absolute;top:0;bottom:0;border-radius:6px;background:repeating-linear-gradient(90deg,color-mix(in srgb,var(--ev) 55%,transparent) 0 6px,transparent 6px 10px);animation:fl 1.2s linear infinite;text-decoration:none}
@keyframes fl{to{background-position:10px 0}}
.ev .m{display:flex;gap:16px;flex-wrap:wrap;justify-content:flex-end;text-align:right}
.ev .m div{font-size:10px;color:var(--mut);white-space:nowrap}.ev .m b{display:block;font-size:14px;font-weight:600;color:var(--ink)}.ev .m b.g{color:var(--good)}
/* graf */
.pc{position:relative;flex:1;min-height:90px;margin-top:10px}
/* Bundstriben under grafen (--gb) = kortets sidemargen; dagsnavnet står midt i den, og uden dagsfirkanter er striben kortets bundmargen (Claude AI, 2026-10-12) */
/* På mobil vokser grafen ned til navbaren med forsidens --front-mobile-fill, som det klassiske kort */
.pc{--gb:16px;min-height:calc(90px + var(--front-mobile-fill,0px))}.pc svg{position:absolute;inset:0 0 var(--gb) 0;width:100%;height:calc(100% - var(--gb));overflow:visible}
.pc .dl{position:absolute;bottom:calc((var(--gb) - 10px) / 2);line-height:10px;font-size:10px;color:var(--mut);transform:translateX(4px);white-space:nowrap;text-transform:capitalize}
.pc .now{position:absolute;top:0;bottom:var(--gb);width:1px;background:color-mix(in srgb,var(--ink) 40%,transparent)}
.pc .nd{position:absolute;width:10px;height:10px;border-radius:50%;background:var(--ink);transform:translate(-50%,-50%);animation:pu 2s infinite}
@keyframes pu{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--acc) 60%,transparent)}70%{box-shadow:0 0 0 11px transparent}}
.pc .band{position:absolute;top:0;bottom:var(--gb);border-radius:10px;background:color-mix(in srgb,var(--good) 9%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--good) 35%,transparent)}
.pc .band span{position:absolute;top:4px;left:50%;transform:translateX(-50%);font-size:9.5px;font-weight:800;letter-spacing:.14em;color:var(--good);white-space:nowrap}
/* Ladetiden som et blødt, flydende lilla skær (Claude AI, 2026-10-13; brugeren: "noget flydende rart for øjnene") */
.pc .chg{position:absolute;top:0;bottom:var(--gb);pointer-events:none}
.pc .chg::after{content:"";position:absolute;left:12%;right:12%;bottom:0;height:3px;border-radius:3px;background:var(--ev);box-shadow:0 0 10px 1px color-mix(in srgb,var(--ev) 60%,transparent);opacity:.8}
.pc .chg span{position:absolute;top:4px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:3px;padding:2px 6px;border-radius:99px;font-size:9px;font-weight:800;letter-spacing:.06em;color:var(--ev);background:color-mix(in srgb,var(--ev) 16%,rgba(10,12,18,.6));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ev) 40%,transparent);backdrop-filter:blur(4px);white-space:nowrap}
.pc .tip{position:absolute;top:0;padding:7px 10px;border-radius:11px;background:var(--surface,rgba(14,16,24,.95));box-shadow:0 10px 30px -8px rgba(0,0,0,.6),inset 0 0 0 1px var(--hair);font-size:11px;color:var(--mut);white-space:nowrap;pointer-events:none;opacity:0;transform:translate(-50%,-110%);transition:opacity .15s;z-index:3}
.pc .tip b{font-size:14px;color:var(--ink)}.pc .tip em{font-style:normal;color:var(--ev);font-weight:700}
@keyframes barin{from{transform:scaleY(0)}}.pc svg.still *,.days.still .day,.days.still b{animation:none!important;stroke-dashoffset:0}.pc svg.still .fadein{opacity:1}
.draw{stroke-dasharray:3000;stroke-dashoffset:3000;animation:drw 2s cubic-bezier(.65,0,.35,1) forwards}@keyframes drw{to{stroke-dashoffset:0}}
.fadein{opacity:0;animation:fi 1.1s .3s forwards}@keyframes fi{to{opacity:1}}
/* dage */
.days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;margin-top:10px;flex:none}
.day{display:flex;flex-direction:column;align-items:center;gap:3px;padding:5px 4px 6px;border-radius:13px;font-size:11px;color:var(--mut);background:color-mix(in srgb,var(--ink) 3.5%,transparent);box-shadow:inset 0 0 0 1px var(--hair);
  transition:transform .3s cubic-bezier(.16,1,.3,1);animation:tin .6s cubic-bezier(.16,1,.3,1) both}
.day:hover{transform:translateY(calc(var(--dashboard-card-highlight,1) * -2px))}
.day span{text-transform:capitalize}.day strong{font-size:13px;color:var(--ink);font-weight:600}
.day .col{width:100%;height:4px;border-radius:4px;background:color-mix(in srgb,var(--ink) 7%,transparent);overflow:hidden;order:3}
.day .col b{display:block;height:100%;border-radius:4px;transform-origin:left;animation:grow 1.2s cubic-bezier(.16,1,.3,1) both}
.day.best{background:color-mix(in srgb,var(--good) 10%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--good) 35%,transparent)}.day.best strong{color:var(--good)}
.day.fc{opacity:.8}
/* Dagsgennemsnittene kun på store skærme; på mobil ligger de under navbaren (Claude AI, 2026-10-12). days: false fjerner dem helt. */
:host([nodays]) .days{display:none}:host([nodays]) .c{padding-bottom:0}
.empty{display:grid;place-items:center;flex:1;color:var(--mut);font-size:13px}
@media(max-width:700px){.days{display:none}.c{padding-bottom:0!important}.pc{min-height:calc(190px + var(--front-mobile-fill,0px));--gb:12px}.c{padding:13px 12px 12px}.pt{grid-template-columns:auto minmax(0,1fr);grid-template-areas:'ctl ctl' 'big chip' 'comp comp'}.pt .chip{justify-self:end;align-self:center;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pt .ctl{width:100%}.seg.m{flex:1}.seg.m button{flex:1}.big{font-size:34px}
  .ev{grid-template-columns:auto minmax(0,1fr)}.ev .m{grid-column:span 2;justify-content:space-between;text-align:left}.days{gap:4px}.day{padding:6px 2px}.day strong{font-size:12px}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

class ThElectricityPriceCard extends HTMLElement {
  static getStubConfig() { return { style: 'new', charge: {} }; }
  // Part of Smart Home Cards since 1.7.0 (Claude AI, 2026-10-14): new/classic like the other cards' looks.
  static getConfigForm() {
    return {
      schema: [...lookFormSchema(), { name: 'days', selector: { boolean: {} } }, { name: 'fill_height', selector: { boolean: {} } }],
      computeLabel: (s) => ({ ...LOOK_LABELS, days: 'Dagsgennemsnit i bunden (kun store skærme)', fill_height: 'Fyld højden' })[s.name] || s.name,
    };
  }
  setConfig(c) {
    this.cfg = { current: 'sensor.stromligning_current_price_vat', tomorrow: 'binary_sensor.stromligning_tomorrow_available_vat', forecast: 'sensor.stromligning_forecasts_vat', mean: 'sensor.stromligning_today_mean_vat', ...c };
    this.toggleAttribute('fill', c.fill_height !== false); this.toggleAttribute('nodays', c.days === false);
    this._mode = null;
  }
  getCardSize() { return 6; }
  getGridOptions() { return { columns: 12, rows: 6, min_columns: 6 }; }
  set hass(h) {
    this._h = h; const mode = isNewLook(h, this.cfg, { entity: this.cfg.style_entity ? 'style_entity' : 'switch_entity', fallback: true }) ? 'new' : 'classic';
    if (mode !== this._mode) { this._mode = mode; this.mount(); }
    if (mode === 'classic') { if (this._cl) this._cl.hass = h; return; }
    const t = Date.now(); if (!this._t || t - this._t > 900) { this._t = t; this.update(); }
    else if (!this._q) this._q = setTimeout(() => { this._q = null; this._t = Date.now(); this.update(); }, 900);
  }
  mount() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    const r = this.shadowRoot; this._pk = this._ck = this._ek = null;
    if (this._mode === 'classic') {
      r.innerHTML = '<style>:host{display:block}:host([fill]){height:100%}</style>';
      this._cl = document.createElement('ha-electricity-price-card');
      try { this._cl.setConfig(this.cfg.classic || {}); } catch (e) { r.innerHTML += `<div style="padding:16px">Klassisk elpriskort mangler: ${e.message}</div>`; return; }
      if (this.hasAttribute('fill')) this._cl.style.height = '100%';
      r.appendChild(this._cl); if (this._h) this._cl.hass = this._h; return;
    }
    this._cl = null;
    r.innerHTML = `<style>${TEP_CSS}</style><ha-card class="c">
      <div class="pt"><span class="chip" id="chip"><i></i>–</span>
        <div class="ctl"><div class="seg" id="st"><button data-s="line" title="Linje" aria-label="Linje">${ti('line', 15)}</button><button data-s="bar" title="Søjler" aria-label="Søjler">${ti('bars', 15)}</button></div>
          <div class="seg m" id="md"><button data-m="24">24 t</button><button data-m="48">48 t</button><button data-m="7">7 dage</button></div></div>
        <div class="big"><span id="now">–</span><i class="lv" id="live" title="Strømligning"></i></div><div class="comp"><div class="bar" id="cbar"></div><div class="lg" id="clg"></div></div></div>
      <div class="ev" id="ev"></div>
      <div class="pc" id="pc"><svg id="svg" preserveAspectRatio="none"></svg><div id="ov"></div><div class="tip" id="tip"></div></div>
      <div class="days" id="days"></div></ha-card>`;
    try { this._ps = localStorage.getItem('th-price-style') || this.cfg.style || 'bar'; this._pm = localStorage.getItem('th-price-range') || '24'; } catch (e) { this._ps = 'bar'; this._pm = '24'; }
    const sync = () => { r.querySelectorAll('#st button').forEach(b => b.classList.toggle('on', b.dataset.s === this._ps)); r.querySelectorAll('#md button').forEach(b => b.classList.toggle('on', b.dataset.m === this._pm)); };
    sync();
    r.querySelectorAll('#st button').forEach(b => b.onclick = () => { this._ps = b.dataset.s; try { localStorage.setItem('th-price-style', this._ps); } catch (e) {} sync(); this._pk = null; this.update(); });
    r.querySelectorAll('#md button').forEach(b => b.onclick = () => { this._pm = b.dataset.m; try { localStorage.setItem('th-price-range', this._pm); } catch (e) {} sync(); this._pk = null; this.update(); });
    if (!this._ro) { this._ro = new ResizeObserver(() => { this._pk = null; this.update(); }); }
    this._ro.disconnect(); this._ro.observe(r.getElementById('pc'));
  }
  disconnectedCallback() { this._ro?.disconnect(); }
  connectedCallback() { if (this._ro && this.shadowRoot?.getElementById('pc')) this._ro.observe(this.shadowRoot.getElementById('pc')); }
  $(id) { return this.shadowRoot.getElementById(id); }
  set(id, h) { const e = this.$(id); if (e && e._v !== h) { e.innerHTML = h; e._v = h; } }
  s(e) { const x = this._h?.states[e]; return x && !['unknown', 'unavailable'].includes(x.state) ? x : null; }
  n(e) { const v = parseFloat(this.s(e)?.state); return Number.isFinite(v) ? v : NaN; }
  A(e, k) { return this.s(e)?.attributes?.[k]; }

  charge() {
    const c = this.cfg.charge; if (!c || !this._h) return null; const st = id => id ? this._h.states[id]?.state : undefined;
    const plan = this._h.states[c.plan]; const blocks = (plan?.attributes?.blocks || []).map(b => ({ t: new Date(b.start).getTime(), e: new Date(b.end).getTime(), kwh: b.kwh, cost: b.cost, est: b.estimated })).filter(b => b.e > Date.now());
    const mode = st(c.mode) || plan?.attributes?.mode, cm = st(c.charger_mode);
    const plugged = st(c.cable) === 'on' && (!c.tracker || st(c.tracker) === 'home') && (!c.charger_mode || (cm && !['disconnected', 'unavailable', 'unknown'].includes(cm)));
    const active = mode && !['off', 'manual'].includes(mode) && blocks.length > 0;
    if (!(c.force || (plugged && active))) return null;
    const kwh = this.n(c.energy), cost = this.n(c.cost), alt = this.A(c.cost, 'alternatives') || {}, now = alt.now?.cost;
    return { blocks, mode, kwh: Number.isFinite(kwh) ? kwh : blocks.reduce((a, b) => a + (b.kwh || 0), 0), cost: Number.isFinite(cost) ? cost : blocks.reduce((a, b) => a + (b.cost || 0), 0),
      save: Number.isFinite(now) && Number.isFinite(cost) ? now - cost : NaN, soc: this.n(c.soc), target: this.n(c.target), deadline: plan?.attributes?.deadline, charging: st(c.charging) === 'on' || cm === 'charging', name: c.name || 'Bilen' };
  }
  update() {
    if (this._mode !== 'new' || !this._h || !this.$('pc')) return;
    const C = this.cfg, cur = this.n(C.current), mean = this.n(C.mean);
    const live = this.s(C.current) && Date.now() - new Date(this.s(C.current).last_updated) < 2 * 36e5; const lv = this.$('live'); lv.classList.toggle('off', !live); lv.title = live ? 'Strømligning live' : 'Strømligning ikke live';
    const rel = mean ? cur / mean : 1, col = rel < .9 ? 'var(--good)' : rel > 1.1 ? 'var(--bad)' : 'var(--warn)';
    this.$('chip').style.setProperty('--c', col);
    this.set('chip', `<i></i>${rel < .9 ? 'Billig nu' : rel > 1.1 ? 'Dyr nu' : 'Normal pris'} · ${rel >= 1 ? '+' : '−'}${Math.abs(Math.round((rel - 1) * 100))} % ift. snit`);
    this.set('now', `${tn(cur, 2)}<small>kr/kWh</small>`);
    const parts = [['Spotpris', 'sensor.stromligning_spotprice_vat', 'var(--acc)'], ['Nettarif', 'sensor.stromligning_distribution_vat', '#8ed1ff'], ['Systemtarif', 'sensor.stromligning_systemtariff_vat', '#b7a4ff'],
      ['Transport', 'sensor.stromligning_nettariff_vat', '#7fb0ff'], ['Tillæg', 'sensor.stromligning_surcharge_vat', '#ff9e7a'], ['Elafgift', 'sensor.stromligning_electricity_tax_vat', '#6be3a8']]
      .map(([n, e, c]) => [n, this.n(e), c]).filter(x => Number.isFinite(x[1]) && x[1] > 0);
    const sum = parts.reduce((a, b) => a + b[1], 0) || 1, ck = parts.map(x => x[1].toFixed(3)).join();
    if (ck !== this._ck) { this._ck = ck;
      this.$('cbar').innerHTML = parts.map(([n, v, c]) => `<b title="${n} ${tn(v)} kr" style="width:${v / sum * 100}%;background:${c}"></b>`).join('');
      this.$('clg').innerHTML = parts.map(([n, v, c]) => `<span><i style="background:${c}"></i>${n} ${tn(v)}</span>`).join(''); }
    // ladeplan
    const ch = this.charge(), ev = this.$('ev'), ek = ch ? JSON.stringify([ch.kwh, ch.cost, ch.blocks.length, ch.soc, ch.target, ch.charging, ch.mode]) : '';
    if (ek !== this._ek) { this._ek = ek; this._pk = null; ev.classList.toggle('on', !!ch && this.cfg.charge_panel !== false); /* charge_panel: false – planen vises på Tesla-kortet i stedet (Claude AI, 2026-10-13) */
      if (ch) { const avg = ch.kwh ? ch.cost / ch.kwh : NaN, st = ch.blocks[0], soc = Number.isFinite(ch.soc) ? ch.soc : 0, tg = Number.isFinite(ch.target) ? ch.target : 100;
        const MODE = { smart: 'Smart', fixed: 'Fast tid', now: 'Lad nu', price_cap: 'Prisloft' };
        ev.innerHTML = `<div class="car">${ti('car', 22)}<em>${ti('bolt', 11, 2.2)}</em></div>
          <div style="min-width:0"><div class="t">${ch.charging ? 'Lader nu' : 'Ladeplan aktiv'} <span>· ${this.esc(ch.name)} · ${MODE[ch.mode] || ch.mode}</span></div>
            <div class="soc"><i style="width:${soc}%"></i><u style="left:${soc}%;width:${Math.max(0, tg - soc)}%"></u></div>
            <div style="font-size:10.5px;color:var(--mut);margin-top:5px">${Math.round(soc)} % → ${Math.round(tg)} %${ch.deadline ? ` · klar ${new Date(ch.deadline).toLocaleDateString('da-DK', { weekday: 'short' })} ${tt(new Date(ch.deadline))}` : ''}</div></div>
          <div class="m"><div>Ladepris<b>${tn(avg)} kr/kWh</b></div><div>${tn(ch.kwh, 1)} kWh<b>${tn(ch.cost)} kr</b></div><div>${st.t <= Date.now() ? 'I gang' : 'Start'}<b>${st.t <= Date.now() ? 'nu' : tt(new Date(st.t))}</b></div>${Number.isFinite(ch.save) && ch.save > .5 ? `<div>Sparer<b class="g">${tn(ch.save)} kr</b></div>` : ''}</div>`; } }
    this.chart(ch);
  }
  esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  chart(ch) {
    const C = this.cfg, toP = (p, f) => ({ t: new Date(p.start).getTime(), e: new Date(p.end || new Date(p.start).getTime() + 36e5).getTime(), p: p.price, f });
    const act = [...(this.A(C.current, 'prices') || []), ...(this.A(C.tomorrow, 'prices') || [])].map(p => toP(p, false));
    const lastA = act.length ? act[act.length - 1].e : 0;
    const fc = (this.A(C.forecast, 'prices') || []).map(p => toP(p, true)).filter(p => p.t >= lastA);
    const all = [...act, ...fc]; const pc = this.$('pc');
    if (!all.length) { this.set('ov', '<div class="empty">Ingen prisdata endnu</div>'); return; }
    // Vinduet går fra lidt før nu, men aldrig før den første pris eller efter den sidste – ingen tom plads i siderne (Claude AI, 2026-10-13)
    const first = Math.min(...all.map(p => p.t)), last = Math.max(...all.map(p => p.e));
    const now = Date.now(), mode = this._pm || '24', t0 = Math.max(first, now - (mode === '24' ? 2 : 3) * 36e5), t1 = Math.min(last, mode === '24' ? now + 24 * 36e5 : mode === '48' ? now + 48 * 36e5 : last);
    const pk = this._ps + mode + all.length + '|' + Math.floor(now / 9e5) + '|' + pc.clientWidth + 'x' + pc.clientHeight + (this._ek || '');
    if (pk === this._pk) return; this._pk = pk;
    let pts = all.filter(p => p.e > t0 && p.t < t1);
    if (mode === '7') { const hr = {}; for (const p of pts) { const h = Math.floor(p.t / 36e5); (hr[h] = hr[h] || { t: h * 36e5, e: h * 36e5 + 36e5, s: 0, n: 0, f: p.f }).s += p.p; hr[h].n++; hr[h].f = hr[h].f && p.f; }
      pts = Object.values(hr).map(h => ({ t: h.t, e: h.e, p: h.s / h.n, f: h.f })).sort((a, b) => a.t - b.t); }
    if (!pts.length) return;
    const gb = parseFloat(getComputedStyle(pc).getPropertyValue('--gb')) || 16;
    const vmax = Math.max(...pts.map(p => p.p)), vmin = Math.min(...pts.map(p => p.p)), max = vmax * 1.06, min = Math.min(vmin * .9, vmin - .05), W = 1000, H = 100, base = 100;
    const X = t => (t - t0) / (t1 - t0) * W, Y = v => 8 + (1 - (v - min) / (max - min)) * (H - 14);
    const inCh = p => ch && ch.blocks.some(b => b.t < p.e && b.e > p.t);
    const line = arr => arr.map((p, i) => `${i ? 'L' : 'M'}${X((p.t + p.e) / 2).toFixed(1)} ${Y(p.p).toFixed(1)}`).join('');
    const A1 = pts.filter(p => !p.f), F1 = pts.filter(p => p.f); if (A1.length && F1.length) F1.unshift(A1[A1.length - 1]);
    const cs = getComputedStyle(this), cv = n => cs.getPropertyValue(n).trim();
    const cG = cv('--good') || '#6be3a8', cW = cv('--warn') || '#e8c37e', cB = cv('--bad') || '#ff9e7a', cE = cv('--ev') || '#b7a4ff';
    const tone = v => { const r = (v - vmin) / (vmax - vmin || 1); return r < .33 ? cG : r < .66 ? cW : cB; };
    let g = `<defs><linearGradient id="pl" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}"><stop offset="0" stop-color="${cB}"/><stop offset=".55" stop-color="${cW}"/><stop offset="1" stop-color="${cG}"/></linearGradient>
      <linearGradient id="pa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${cW}" stop-opacity=".28"/><stop offset="1" stop-color="${cW}" stop-opacity="0"/></linearGradient></defs>`;
    const evBars = [];
    if (this._ps === 'bar') {
      const gap = mode === '48' ? .3 : mode === '7' ? .4 : .7;
      pts.forEach((p, i) => { const x = Math.max(0, X(p.t)), w = Math.max(.5, Math.min(W, X(p.e)) - x - gap), y = Y(p.p), past = p.e <= now, evp = inCh(p); if (evp) evBars.push({ x, w, y });
        g += `<rect x="${x.toFixed(2)}" y="${y.toFixed(1)}" width="${w.toFixed(2)}" height="${(base - y).toFixed(1)}" rx="1.5" fill="${tone(p.p)}" opacity="${past ? .25 : p.f ? .45 : .9}" style="transform-origin:${x}px ${base}px;animation:barin .7s cubic-bezier(.16,1,.3,1) ${Math.min(i * 6, 900)}ms both"/>`; });
    } else {
      if (A1.length) { const d = line(A1); g += `<path d="${d}L${X((A1[A1.length - 1].t + A1[A1.length - 1].e) / 2)} ${base}L${X((A1[0].t + A1[0].e) / 2)} ${base}Z" fill="url(#pa)" class="fadein"/><path d="${d}" fill="none" stroke="url(#pl)" stroke-width="2.4" vector-effect="non-scaling-stroke" stroke-linejoin="round" class="draw"/>`; }
      if (F1.length > 1) g += `<path d="${line(F1)}" fill="none" stroke="url(#pl)" stroke-width="1.6" stroke-dasharray="4 5" vector-effect="non-scaling-stroke" opacity=".7" class="fadein"/>`;
    }
    // Indflyvning kun ved første tegning og ved skift af visning; en ny højde (fx når forsiden fylder ud til navbaren)
    // tegner bare om, så grafen ikke ser ud til at loade to gange (Claude AI, 2026-10-12).
    const ak = this._ps + mode, anim = this._ak !== ak; this._ak = ak;
    // Boblende væske (Claude AI, 2026-10-13): ladetiden i lilla, ellers det billigste vindue i grønt. Søjlerne fyldes, og boblerne
    // stiger op over søjlen (højere op, så det er let at se). viewBox'en strækkes ulige, så boblerne tegnes som ellipser.
    let liq = evBars, liqCol = cE, liqId = 'ev';
    if (!liq.length) { const fut = act.filter(p => p.t >= now - 9e5); let best = null; const win = Math.max(1, Math.round(3 * 36e5 / ((fut[0]?.e - fut[0]?.t) || 9e5)));
      for (let i = 0; i + win <= fut.length; i++) { const a2 = fut.slice(i, i + win).reduce((s2, p) => s2 + p.p, 0) / win; if (!best || a2 < best.a) best = { a: a2, t: fut[i].t, e: fut[i + win - 1].e }; }
      if (best && this._ps === 'bar') { liq = pts.filter(p => p.t < best.e && p.e > best.t).map(p => { const x = Math.max(0, X(p.t)), gap = mode === '48' ? .3 : mode === '7' ? .4 : .7; return { x, w: Math.max(.5, Math.min(W, X(p.e)) - x - gap), y: Y(p.p) }; }); liqCol = '#2ee6d6'; liqId = 'bs'; } }
    if (liq.length) {
      const sx = Math.max(.1, pc.clientWidth / W), sy = Math.max(.1, (pc.clientHeight - gb) / H);
      let seed = liq.length * 7 + Math.floor(liq[0].x); const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
      const rise = H * .45;
      g += `<defs><clipPath id="${liqId}c">${liq.map(b => `<rect x="${b.x.toFixed(2)}" y="${b.y.toFixed(1)}" width="${b.w.toFixed(2)}" height="${(base - b.y).toFixed(1)}" rx="1.5"/>`).join('')}</clipPath>
        <linearGradient id="${liqId}l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${liqCol}" stop-opacity="1"/><stop offset="1" stop-color="${liqCol}" stop-opacity=".92"/></linearGradient></defs><g clip-path="url(#${liqId}c)"><rect x="0" y="0" width="${W}" height="${base}" fill="url(#${liqId}l)"/>
        <rect x="0" y="0" width="${W}" height="${base}" fill="#fff" opacity="0"><animate attributeName="opacity" values="0;.14;0" dur="3.2s" repeatCount="indefinite"/></rect></g>`;
      liq.forEach((b) => { const n = Math.max(2, Math.round((base - b.y) / 16)); for (let k = 0; k < n; k++) {
        const r = 1.8 + rnd() * 2.4, cx = b.x + b.w * (.2 + rnd() * .6), dur = (2.8 + rnd() * 3).toFixed(2), delay = (rnd() * 4.5).toFixed(2), top = Math.max(3, b.y - rise * (.35 + rnd() * .65));
        g += `<ellipse cx="${cx.toFixed(2)}" cy="${base}" rx="${(r / sx).toFixed(2)}" ry="${(r / sy).toFixed(2)}" fill="${k % 3 ? '#fff' : liqCol}" opacity="0"><animate attributeName="cy" from="${base}" to="${top.toFixed(1)}" dur="${dur}s" begin="${delay}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;.6;.5;0" keyTimes="0;.15;.75;1" dur="${dur}s" begin="${delay}s" repeatCount="indefinite"/></ellipse>`; } });
    }
    const svg = this.$('svg'); svg.classList.toggle('still', !anim); this.$('days').classList.toggle('still', !anim); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = g;
    // overlay
    let ov = ''; const day0 = new Date(t0); day0.setHours(0, 0, 0, 0);
    for (let d = new Date(day0.getTime() + 864e5); d.getTime() < t1; d = new Date(d.getTime() + 864e5)) { const x = X(d.getTime()) / W * 100;
      ov += `<div style="position:absolute;left:${x}%;top:0;bottom:var(--gb);border-left:1px dashed color-mix(in srgb,var(--ink) 14%,transparent)"></div>${x > 92 ? '' : `<div class="dl" style="left:${x}%">${d.toLocaleDateString('da-DK', { weekday: 'short' })}${d.getTime() >= lastA ? ' · prognose' : ''}</div>`}`; }
    if (ch) { const merged = []; for (const b of ch.blocks) { const l = merged[merged.length - 1]; if (l && b.t - l.e < 20 * 6e4) l.e = Math.max(l.e, b.e); else merged.push({ ...b }); }
      const vis = merged.filter(b => b.e > t0 && b.t < t1), wid = vis.reduce((m, b, i) => (b.e - b.t > (vis[m]?.e - vis[m]?.t || 0) ? i : m), 0);
      vis.forEach((b, i) => { const l = Math.max(0, X(b.t) / W * 100), r = Math.min(100, X(b.e) / W * 100);
        ov += `<div class="chg" style="left:${l}%;width:${Math.max(.6, r - l)}%">${i === wid ? `<span>${ti('bolt', 9, 2.4)}LADER</span>` : ''}</div>`; }); }
    else { const fut = act.filter(p => p.t >= now - 9e5); let best = null; const win = Math.max(1, Math.round(3 * 36e5 / ((fut[0]?.e - fut[0]?.t) || 9e5)));
      for (let i = 0; i + win <= fut.length; i++) { const a = fut.slice(i, i + win).reduce((s2, p) => s2 + p.p, 0) / win; if (!best || a < best.a) best = { a, t: fut[i].t, e: fut[i + win - 1].e }; }
      if (best && best.t < t1) { const l = X(best.t) / W * 100, r = X(best.e) / W * 100; ov += `<div class="band" style="left:${l}%;width:${r - l}%;background:none;box-shadow:none"><span style="color:#2ee6d6">BILLIGST</span></div>`; } }
    const nx = X(now) / W * 100, cp = all.find(p => p.t <= now && p.e > now);
    if (cp) ov += `<div class="now" style="left:${nx}%"></div><div class="nd" style="left:${nx}%;top:${Y(cp.p) / H * (pc.clientHeight - gb)}px"></div>`;
    this.$('ov').innerHTML = ov;
    const tip = this.$('tip');
    pc.onpointermove = pc.onpointerdown = e => { const b = pc.getBoundingClientRect(), t = t0 + (e.clientX - b.left) / b.width * (t1 - t0), p = pts.find(q => q.t <= t && q.e > t); if (!p) { tip.style.opacity = 0; return; }
      tip.innerHTML = `${new Date(p.t).toLocaleString('da-DK', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}${p.f ? ' · prognose' : ''}<br><b>${tn(p.p)} kr</b>${inCh(p) ? ' · <em>bilen lader</em>' : ''}`;
      tip.style.left = Math.max(70, Math.min(b.width - 70, e.clientX - b.left)) + 'px'; tip.style.top = (Y(p.p) / H * (b.height - gb)) + 'px'; tip.style.opacity = 1; };
    pc.onpointerleave = () => tip.style.opacity = 0;
    // dage
    const days = {}; for (const p of all) { const d = new Date(p.t); d.setHours(0, 0, 0, 0); const k = d.getTime(); (days[k] = days[k] || { k, s: 0, n: 0, min: 1e9, f: true }); days[k].s += p.p; days[k].n++; days[k].min = Math.min(days[k].min, p.p); days[k].f = days[k].f && p.f; }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dl = Object.values(days).filter(d => d.k >= today.getTime()).sort((a, b) => a.k - b.k).slice(0, 7).map(d => ({ ...d, avg: d.s / d.n }));
    const dmax = Math.max(...dl.map(d => d.avg)), dmin = Math.min(...dl.map(d => d.avg)), bi = dl.findIndex(d => d.avg === dmin);
    this.$('days').innerHTML = dl.map((d, i) => { const r = (d.avg - dmin * .8) / (dmax - dmin * .8 || 1), c = d.avg === dmin ? 'var(--good)' : r > .8 ? 'var(--bad)' : 'var(--warn)';
      return `<div class="day ${i === bi ? 'best' : ''} ${d.f ? 'fc' : ''}" style="animation-delay:${i * 50}ms" title="${d.f ? 'Prognose' : 'Faktisk pris'} · laveste ${tn(d.min)} kr"><span>${i === 0 ? 'I dag' : new Date(d.k).toLocaleDateString('da-DK', { weekday: 'short' })}</span>
        <div class="col"><b style="width:${Math.max(12, r * 100)}%;background:${c};animation-delay:${i * 70}ms"></b></div><strong>${tn(d.avg)}</strong></div>`; }).join('');
  }
}
if (!customElements.get('th-electricity-price-card')) customElements.define('th-electricity-price-card', ThElectricityPriceCard);
window.customCards = window.customCards || [];
if (!window.customCards.some(c => c.type === 'th-electricity-price-card')) window.customCards.push({ type: 'th-electricity-price-card', name: 'TH elpris', description: 'Elpris fra Strømligning med graf, sammensætning, billigste vindue og bilens ladeplan', preview: true });
console.info(`%c TH-ELPRIS %c ${TEP_VER} `, 'background:#e8c37e;color:#15110a;font-weight:700', 'color:#e8c37e');
