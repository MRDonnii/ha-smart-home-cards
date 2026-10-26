/* TH Kamera – UniFi Protect: live kameraer + hændelser med klip
 * type: custom:th-camera-card
 * cameras: [camera.x, …]   valgfri – ellers alle UniFi Protect-kameraer (platform: unifiprotect)
 * live_tiles: true  – fliserne viser live video (WebRTC, kameraets laveste kanal) som i UniFi Protect; false = stillbilleder
 * max_live: hvor mange fliser der må køre live på én gang (standard 16); kun fliser, der er på skærmen
 * refresh: sekunder mellem stillbilleder (standard 3, eller 5 ved mere end 8 kameraer)
 * concurrency: hvor mange kameraer der hentes hændelser fra ad gangen (standard 5)
 * nvr: { storage_entity, capacity_entity, uptime_entity, cpu_entity, temp_entity, memory_entity, hdd_entities: [] }  – optagerens status
 * quick_links: [{ name, subtitle, icon, navigation_path }]  – genveje under kameraerne
 * Del af Smart Home Cards fra 2.1.0 (Claude AI, 2026-10-26): hurtigere med mange kameraer – hændelser hentes parallelt og vises,
 * efterhånden som hvert kamera svarer, det trykkede kamera først; de seneste hændelser huskes i browseren, så listen står klar
 * med det samme; fliserne bruger mellemkanalen, live bruger den højeste.
 */
const VC_VER = '2.2.1';
const VC_CACHE = 'th-camera-card:events';
const VC_I = {
  cam: '<rect x="3" y="7" width="13" height="10" rx="2"/><path d="m16 11 5-3v8l-5-3"/>', person: '<circle cx="12" cy="7" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/>',
  car: '<path d="M4 15.5V12l2-4.6c.3-.8 1-1.4 1.9-1.4h8.2c.9 0 1.6.6 1.9 1.4L20 12v3.5"/><path d="M3 15.5h18v2.5H3z"/><circle cx="7.5" cy="18.2" r="1.6"/><circle cx="16.5" cy="18.2" r="1.6"/>',
  paw: '<circle cx="7" cy="9" r="1.8"/><circle cx="12" cy="6.5" r="1.8"/><circle cx="17" cy="9" r="1.8"/><path d="M8.5 17c0-2.5 1.6-5 3.5-5s3.5 2.5 3.5 5c0 1.6-1.5 2.5-3.5 2.5s-3.5-.9-3.5-2.5Z"/>',
  motion: '<path d="M4 12h3l2-5 3 10 2-5h6"/>', bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4Z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  play: '<path d="M8 5v14l11-7Z" fill="currentColor"/>', close: '<path d="M6 6l12 12M18 6 6 18"/>', live: '<circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
};
const vci = (k, s = 16, sw = 1.7) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="display:block;flex:none">${VC_I[k] || ''}</svg>`;
const vce = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const vct = d => `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
const TYPES = { person: ['Person', 'person', '#ff9e7a'], vehicle: ['Bil', 'car', '#8ed1ff'], animal: ['Dyr', 'paw', '#6be3a8'], ring: ['Ringede', 'bell', '#e8c37e'], motion: ['Bevægelse', 'motion', '#b7a4ff'] };
const typeOf = title => { const t = (title || '').toLowerCase(); return /person|face/.test(t) ? 'person' : /vehicle|car|license/.test(t) ? 'vehicle' : /animal/.test(t) ? 'animal' : /ring|doorbell/.test(t) ? 'ring' : 'motion'; };

const VC_CSS = `
:host{display:block;--ink:#f4f1ea;--mut:rgba(244,241,234,.56);--faint:rgba(244,241,234,.3);--hair:rgba(244,241,234,.09);--gold:#e8c37e;--emer:#6be3a8;--coral:#ff9e7a;--red:#ff6b7d;--ice:#8ed1ff;
  color:var(--ink);-webkit-font-smoothing:antialiased;padding:12px 0 var(--th-camera-bottom,100px)}
@media(max-width:1100px){:host{padding:max(10px,env(safe-area-inset-top)) 10px 112px}}
*{box-sizing:border-box}button{font:inherit;color:inherit}
.g{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:8px;align-items:start}
@media(max-width:1250px){.g{grid-template-columns:minmax(0,1fr) 320px}}
@media(max-width:1000px){.g{grid-template-columns:1fr}}
.p{position:relative;border-radius:24px;padding:16px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.015)),rgba(12,14,20,.74);
  box-shadow:0 26px 50px -36px #000,inset 0 0 0 1px var(--hair),inset 0 1px 0 rgba(255,255,255,.05);animation:in .8s cubic-bezier(.16,1,.3,1) both;min-width:0}
@keyframes in{from{opacity:0;transform:translateY(12px);filter:blur(6px)}}
.hd{display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap}
.hd .k{font-size:10px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--mut)}.hd h2{margin:2px 0 0;font-size:17px;font-weight:500}
.chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:99px;font-size:11px;font-weight:600;color:var(--c,var(--emer));background:color-mix(in srgb,var(--c,var(--emer)) 12%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c,var(--emer)) 26%,transparent)}
.chip i{width:6px;height:6px;border-radius:50%;background:currentColor;animation:bl 1.6s infinite}@keyframes bl{50%{opacity:.25}}
.cams{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
@media(max-width:640px){.cams{grid-template-columns:1fr}}
.cam{appearance:none;border:0;padding:0;cursor:pointer;position:relative;overflow:hidden;border-radius:20px;aspect-ratio:16/9;background:#05060a;text-align:left;
  box-shadow:inset 0 0 0 1px var(--hair);animation:in .8s cubic-bezier(.16,1,.3,1) both;transition:transform .5s cubic-bezier(.16,1,.3,1),box-shadow .5s}
.cam:hover{transform:translateY(-3px);box-shadow:inset 0 0 0 1px rgba(232,195,126,.35),0 24px 50px -24px #000}
.cam img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:opacity .5s,transform 8s ease}
.cam:hover img{transform:scale(1.06)}
.cam .lv{position:absolute;inset:0;pointer-events:none}.cam .lv ha-camera-stream{display:block;width:100%;height:100%;--video-max-height:100%}
.cam .sh{position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(0,0,0,.5),transparent 28%,transparent 55%,rgba(0,0,0,.82))}
.cam .nm{position:absolute;left:10px;top:10px;display:flex;align-items:center;gap:8px;padding:6px 11px 6px 9px;border-radius:12px;background:rgba(10,12,18,.5);backdrop-filter:blur(10px);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);font-size:12.5px;font-weight:600}
.cam .rec{position:absolute;right:10px;top:10px;display:flex;align-items:center;gap:6px;padding:5px 9px;border-radius:99px;font-size:10px;font-weight:700;letter-spacing:.14em;background:rgba(0,0,0,.45);backdrop-filter:blur(8px)}
.cam .rec i{width:7px;height:7px;border-radius:50%;background:var(--red);box-shadow:0 0 8px var(--red);animation:bl 1.4s infinite}
.cam .bot{position:absolute;left:12px;right:12px;bottom:10px;display:flex;align-items:flex-end;justify-content:space-between;gap:10px}
.cam .last{font-size:11.5px;color:rgba(255,255,255,.85);display:flex;align-items:center;gap:6px}
.cam .cnt{font-size:11px;font-weight:600;padding:4px 9px;border-radius:99px;background:rgba(255,255,255,.14);backdrop-filter:blur(6px)}
.cam .tag{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:99px;font-weight:700;font-size:13px;
  background:color-mix(in srgb,var(--c) 88%,transparent);color:#140f08;box-shadow:0 10px 30px -6px var(--c);animation:pop .5s cubic-bezier(.2,1.6,.4,1)}
@keyframes pop{from{transform:translate(-50%,-50%) scale(.5);opacity:0}}
.cam.act{box-shadow:inset 0 0 0 2px var(--c),0 0 40px -12px var(--c)}
.cam .pulse{position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 2px var(--c);animation:pl 1.6s ease-out infinite;pointer-events:none}@keyframes pl{to{box-shadow:inset 0 0 0 14px transparent}}
.ev{position:sticky;top:12px;max-height:calc(100dvh - 140px);display:flex;flex-direction:column}
@media(max-width:1000px){.ev{position:relative;top:0;max-height:none}}
.flt{flex:none;display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px;margin-bottom:8px}.flt::-webkit-scrollbar{display:none}
.flt button{appearance:none;border:0;cursor:pointer;flex:none;display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:99px;font-size:11.5px;font-weight:600;color:var(--mut);
  background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px var(--hair);transition:all .3s}
.flt button.on{color:#15110a;background:var(--c,var(--gold));box-shadow:none}
.list{overflow-y:auto;scrollbar-width:thin;display:grid;gap:6px;padding-right:2px;flex:1;align-content:start}
.it{appearance:none;border:0;cursor:pointer;display:grid;grid-template-columns:96px 1fr;gap:12px;align-items:center;padding:6px;border-radius:15px;text-align:left;background:rgba(255,255,255,.03);
  transition:background .3s,transform .3s;animation:in .5s both}
.it:hover{background:rgba(255,255,255,.07);transform:translateX(2px)}
.it .th{position:relative;width:96px;aspect-ratio:16/10;border-radius:11px;overflow:hidden;background:#06070b}
.it .th img{width:100%;height:100%;object-fit:cover}
.it .th span{position:absolute;inset:0;display:grid;place-items:center;color:#fff;opacity:0;background:rgba(0,0,0,.35);transition:opacity .3s}.it:hover .th span{opacity:1}
.it b{display:block;font-size:13px;font-weight:500}.it small{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--mut);margin-top:3px}
.it .ty{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;color:var(--c);margin-top:5px}
.day{font-size:10px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--faint);margin:8px 2px 2px}
.empty{padding:20px;text-align:center;color:var(--mut);font-size:13px}
.skel{height:72px;border-radius:15px;background:linear-gradient(90deg,rgba(255,255,255,.03),rgba(255,255,255,.07),rgba(255,255,255,.03));background-size:200% 100%;animation:sk 1.4s infinite}@keyframes sk{to{background-position:-200% 0}}
.mod{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;background:rgba(3,4,8,.9);backdrop-filter:blur(10px);animation:fd .3s both}@keyframes fd{from{opacity:0}}
.mod .box{width:min(1300px,96vw);display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:12px;animation:pp .45s cubic-bezier(.16,1,.3,1) both}
@keyframes pp{from{transform:translateY(20px) scale(.97);opacity:0}}
@media(max-width:900px){.mod .box{grid-template-columns:1fr;max-height:92vh;overflow:auto}}
.mod .vid{position:relative;aspect-ratio:16/9;border-radius:18px;overflow:hidden;background:#000;box-shadow:0 30px 80px #000}
.mod .vid>*{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block}
.mod .side{border-radius:18px;padding:14px;background:rgba(14,16,22,.9);box-shadow:inset 0 0 0 1px var(--hair);max-height:min(72vh,700px);overflow:auto}
.mod .side h3{margin:0 0 4px;font-size:17px;font-weight:500}.mod .side p{margin:0 0 12px;color:var(--mut);font-size:12px}
.mod .x{position:absolute;top:max(16px,env(safe-area-inset-top));right:16px;width:42px;height:42px;border-radius:50%;border:0;background:rgba(255,255,255,.12);cursor:pointer;display:grid;place-items:center;z-index:2}
.mod .tabs2{display:flex;gap:6px;margin-bottom:10px}
.mod .tabs2 button{appearance:none;border:0;cursor:pointer;display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:99px;font-size:11.5px;font-weight:600;background:rgba(255,255,255,.06);color:var(--mut)}
.mod .tabs2 button.on{background:var(--gold);color:#15110a}
#nvr{margin-top:10px;display:grid;gap:8px}
.nvr .k{font-size:10px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--mut);margin:0 2px 6px}
.nvc{display:flex;flex-wrap:wrap;gap:6px}
.nv{display:inline-flex;flex-direction:column;gap:1px;padding:7px 11px;border-radius:13px;background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px var(--hair)}
.nv small{font-size:10px;color:var(--mut);letter-spacing:.04em}.nv b{font-size:13.5px;font-weight:600;color:var(--c)}
.ql{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px}
.ql button{appearance:none;border:0;cursor:pointer;display:flex;align-items:center;gap:10px;padding:11px 13px;border-radius:15px;text-align:left;background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px var(--hair);transition:background .3s}
.ql button:hover{background:rgba(255,255,255,.08)}.ql ha-icon{--mdc-icon-size:22px;color:var(--gold)}
.ql b{display:block;font-size:13px;font-weight:600}.ql small{display:block;font-size:11px;color:var(--mut);margin-top:2px}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

class ThCameraCard extends HTMLElement {
  setConfig(c) { this.cfg = { concurrency: 5, ...c }; }
  static getStubConfig() { return {}; }
  getCardSize() { return 10; }
  connectedCallback() {
    this._tick = setInterval(() => this._refresh(), 1000); this._evt = setInterval(() => this._loadEvents(), 60e3);
  }
  disconnectedCallback() { clearInterval(this._tick); clearInterval(this._evt); this._io?.disconnect(); this._io = null; this._r?.querySelectorAll('.cam .lv').forEach(l => { l.innerHTML = ''; }); }
  set hass(h) {
    const first = !this._h; this._h = h;
    if (!this._r) { this._r = this.attachShadow({ mode: 'open' }); this._r.innerHTML = `<style>${VC_CSS}</style><div id="w"></div>`; this._ft = 'all'; this._fc = 'all'; this._signed = {}; }
    if (first) this._loadCache();
    else if (Date.now() - (this._hs || 0) > 60e3) { this._hs = Date.now(); this._r?.querySelectorAll('.cam .lv ha-camera-stream').forEach(v => { v.hass = h; }); }
    this._render(); if (first) this._loadEvents();
  }
  $(id) { return this._r.getElementById(id); }
  cams() {
    const st = this._h.states, ent = this._h.entities || {}, out = {};
    for (const id of Object.keys(st)) {
      if (!id.startsWith('camera.') || /_insecure|_package/.test(id)) continue;
      if (!this.cfg.cameras && (ent[id]?.platform || '') !== (this.cfg.platform || 'unifiprotect')) continue;
      if (this.cfg.cameras && !this.cfg.cameras.includes(id)) continue;
      const base = id.replace(/_(high|medium|low)(_resolution_channel)?$/, ''), rank = /_high/.test(id) ? 0 : /_medium/.test(id) ? 1 : /_low/.test(id) ? 2 : 0;
      if (!out[base] || rank < out[base].rank) out[base] = { ...(out[base] || {}), id, base, rank, name: (st[id].attributes.friendly_name || id).replace(/\s*-\s*UniFi Protect.*$/i, '').replace(/\s*-?\s*(High|Medium|Low|Høj|Mellem|Lav)( resolution channel| opløsning)?$/i, '').trim() };
      if (/_medium/.test(id) || (/_low/.test(id) && !out[base].tile)) out[base].tile = id;
      if (/_low/.test(id) || (/_medium/.test(id) && !out[base].live)) out[base].live = id;
    }
    return Object.values(out).map(c => ({ ...c, tile: c.tile || c.id, live: c.live || c.tile || c.id })).sort((a, b) => a.name.localeCompare(b.name, 'da'));
  }
  live(base) {
    const st = this._h.states, b = base.replace('camera.', ''), on = e => st[e]?.state === 'on';
    const ev = st['event.' + b + '_motion_detection'], t = ev && !['unknown', 'unavailable'].includes(ev.state) ? new Date(ev.state) : null;
    return on('binary_sensor.' + b + '_person_detected') ? 'person' : on('binary_sensor.' + b + '_vehicle_detected') ? 'vehicle' : on('binary_sensor.' + b + '_animal_detected') ? 'animal'
      : on('binary_sensor.' + b + '_doorbell') ? 'ring' : t && Date.now() - t < 45e3 ? 'motion' : null;
  }
  _render() {
    const cams = this.cams(), w = this.$('w'), key = cams.map(c => c.id).join();
    if (key !== this._key) { this._key = key;
      if (!cams.length) { w.innerHTML = `<div class="p"><div class="hd"><div><div class="k">Kameraer</div><h2>UniFi Protect</h2></div></div><div class="empty">Ingen UniFi‑kameraer fundet endnu.</div></div>`; return; }
      w.innerHTML = `<div class="g">
        <div class="p"><div class="hd"><div><div class="k">Kameraer · UniFi Protect</div><h2>${cams.length} kameraer</h2></div><span style="margin-left:auto" id="stat"></span></div>
          <div class="cams">${cams.map((c, i) => `<button class="cam" data-b="${c.base}" data-id="${c.id}" data-tile="${c.tile}" data-live="${c.live}" style="animation-delay:${i * 70}ms"><img alt=""><div class="lv"></div><div class="sh"></div>
            <div class="nm">${vci('cam', 14)}${vce(c.name)}</div><div class="rec"><i></i>REC</div><div class="tg"></div>
            <div class="bot"><span class="last">${vci('clock', 13)}<span>–</span></span><span class="cnt">0 i dag</span></div></button>`).join('')}</div>
          <div id="nvr"></div></div>
        <div class="p ev" style="animation-delay:120ms"><div class="hd"><div><div class="k">Hændelser · seneste døgn</div><h2 id="evn">Henter…</h2></div></div>
          <div class="flt" id="ft"></div><div class="flt" id="fc"></div><div class="list" id="list">${'<div class="skel"></div>'.repeat(5)}</div></div></div>`;
      w.querySelectorAll('.cam').forEach(b => b.onclick = () => this.openLive(b.dataset.id, b.dataset.b));
      this._renderFilters(); this._refresh(true); this._liveTiles(); if ((this._events || []).length) this._renderList();
    }
    let act = 0;
    w.querySelectorAll('.cam').forEach(b => { const ty = this.live(b.dataset.b), T = ty && TYPES[ty]; if (ty) act++;
      b.classList.toggle('act', !!ty); b.style.setProperty('--c', T ? T[2] : 'transparent');
      const tg = b.querySelector('.tg'), h = T ? `<div class="pulse"></div><div class="tag">${vci(T[1], 16, 2)}${T[0]}</div>` : ''; if (tg._v !== h) { tg.innerHTML = h; tg._v = h; }
      const evs = (this._all || this._events || []).filter(e => e.cam === b.dataset.b), lst = evs[0];
      b.querySelector('.last span').textContent = lst ? `${TYPES[lst.type][0]} ${vct(lst.t)}` : 'Ingen hændelser';
      b.querySelector('.cnt').textContent = `${evs.filter(e => e.t.toDateString() === new Date().toDateString()).length} i dag`; });
    this._renderNvr();
    const st = this.$('stat'); if (st) { const h = `<span class="chip" style="--c:${act ? 'var(--coral)' : 'var(--emer)'}"><i></i>${act ? `Aktivitet på ${act} kamera${act > 1 ? 'er' : ''}` : 'Alt roligt'}</span>`; if (st._v !== h) { st.innerHTML = h; st._v = h; } }
  }
  // Optagerens status og genveje (fra det gamle Overvågning-kort; Claude AI, 2026-10-26)
  _renderNvr() {
    const box = this.$('nvr'); if (!box) return; const n = this.cfg.nvr || {}, links = this.cfg.quick_links || [], st = this._h.states;
    const v = (id) => st[id]; const num = (id) => { const x = Number(v(id)?.state); return Number.isFinite(x) ? x : null; };
    const chips = [];
    const pct = (id, label, warn = 90) => { const x = num(id); if (x == null) return; chips.push([label, `${Math.round(x)} %`, x >= warn ? 'var(--coral)' : 'var(--emer)']); };
    pct(n.storage_entity, 'Lager', 101); pct(n.cpu_entity, 'CPU'); pct(n.memory_entity, 'Hukommelse');
    const temp = num(n.temp_entity); if (temp != null) chips.push(['Temperatur', `${Math.round(temp)} °C`, temp >= 70 ? 'var(--coral)' : 'var(--emer)']);
    const cap = v(n.capacity_entity); if (cap && Number.isFinite(Number(cap.state))) { const sec = Number(cap.state) * ({ min: 60, h: 3600, d: 86400 }[cap.attributes?.unit_of_measurement] || 1); chips.push(['Optager bagud', `${Math.round(sec / 86400)} dage`, 'var(--ice)']); }
    const up = v(n.uptime_entity); if (up && !Number.isNaN(Date.parse(up.state))) { const d = Math.floor((Date.now() - Date.parse(up.state)) / 86400e3); chips.push(['Oppe', d >= 1 ? `${d} dage` : 'under 1 dag', 'var(--emer)']); }
    const hdd = (n.hdd_entities || []).map((id, i) => [`Disk ${i + 1}`, v(id)]).filter(([, s]) => s);
    hdd.forEach(([l, s]) => chips.push([l, s.state === 'on' ? 'Fejl' : 'OK', s.state === 'on' ? 'var(--red)' : 'var(--emer)']));
    if (!chips.length && !links.length) { if (box._v) { box.innerHTML = ''; box._v = ''; } return; }
    const h = `${chips.length ? `<div class="nvr"><div class="k">Optager</div><div class="nvc">${chips.map(([l, x, c]) => `<span class="nv" style="--c:${c}"><small>${vce(l)}</small><b>${vce(x)}</b></span>`).join('')}</div></div>` : ''}
      ${links.length ? `<div class="ql">${links.map((q, i) => `<button data-q="${i}"><ha-icon icon="${vce(q.icon || 'mdi:link')}"></ha-icon><span><b>${vce(q.name)}</b>${q.subtitle ? `<small>${vce(q.subtitle)}</small>` : ''}</span></button>`).join('')}</div>` : ''}`;
    if (box._v === h) return; box._v = h; box.innerHTML = h;
    box.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { const q = links[+b.dataset.q]; if (!q?.navigation_path) return; history.pushState(null, '', q.navigation_path); window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } })); });
  }
  // Live fliser som i UniFi Protect (Claude AI, 2026-10-26; bruger: "mere som i unifi hvor det kommer hurtigt og er live"): hver
  // synlig flise får HA's egen kamerastrøm (WebRTC via go2rtc) på kameraets laveste kanal; stillbilledet står under, til videoen
  // spiller. Fliser uden for skærmen stopper deres strøm.
  async _liveTiles() {
    if (this.cfg.live_tiles === false || !this._r) return;
    if (!customElements.get('ha-camera-stream')) {
      // HA indlæser sin kamerastrøm først, når et kamera vises live: en usynlig live-flise henter den.
      try { const h = await window.loadCardHelpers?.(); const id = this.cams()[0]?.live;
        if (h && id && !this._loader) { const c = h.createCardElement({ type: 'picture-entity', entity: id, camera_view: 'live', show_name: false, show_state: false });
          c.hass = this._h; const box = document.createElement('div'); box.style.cssText = 'position:absolute;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none'; box.appendChild(c); this._r.appendChild(box); this._loader = box; } } catch (e) { /* stillbilleder */ }
      try { await Promise.race([customElements.whenDefined('ha-camera-stream'), new Promise((_, r) => setTimeout(r, 15000))]); } catch (e) { return; }
      this._loader?.remove(); this._loader = null;
    }
    this._io?.disconnect();
    const max = this.cfg.max_live || 16, on = new Set();
    const start = (b) => { const lv = b.querySelector('.lv'); if (!lv || lv.firstChild || on.size >= max) return; const s = this._h.states[b.dataset.live]; if (!s) return;
      const v = document.createElement('ha-camera-stream'); v.hass = this._h; v.stateObj = s; v.muted = true; v.controls = false; v.allowExoPlayer = false; lv.appendChild(v); on.add(b); };
    const stop = (b) => { const lv = b.querySelector('.lv'); if (lv) lv.innerHTML = ''; on.delete(b); };
    this._io = new IntersectionObserver((list) => list.forEach(x => x.isIntersecting ? start(x.target) : stop(x.target)), { rootMargin: '100px' });
    this._r.querySelectorAll('.cam').forEach(b => this._io.observe(b));
  }
  _refresh(force) {
    if (!this._r || document.hidden) return;
    const every = (this.cfg.refresh || (this.cams().length > 8 ? 5 : 3)) * 1000; // stillbilleder: sjældnere med mange kameraer
    if (!force && Date.now() - (this._lastRef || 0) < every - 50) return; this._lastRef = Date.now();
    this._r.querySelectorAll('.cam').forEach(b => { if (b.querySelector('.lv')?.firstChild && b.dataset.img) return; const s = this._h.states[b.dataset.tile || b.dataset.id]; if (!s?.attributes?.entity_picture) return; b.dataset.img = 1;
      const img = b.querySelector('img'), n = new Image(); n.onload = () => { img.src = n.src; }; n.src = s.attributes.entity_picture + '&t=' + Date.now(); });
  }
  async _browse(id) { return this._h.callWS({ type: 'media_source/browse_media', media_content_id: id }); }
  async _sign(path) { if (this._signed[path]) return this._signed[path]; try { const r = await this._h.callWS({ type: 'auth/sign_path', path, expires: 3600 }); this._signed[path] = r.path; return r.path; } catch (e) { return path; } }
  // Hændelser: hvert kamera for sig, flere ad gangen (cfg.concurrency), det ønskede kamera først; listen tegnes, efterhånden som
  // kameraerne svarer, og gemmes i browseren til næste visning (Claude AI, 2026-10-26).
  async _loadEvents(first) {
    if (!this._h?.callWS) return; if (this._loading) { if (first) this._wantFirst = first; return; } this._loading = true;
    try {
      if (!this._nodes) {
        const root = await this._browse('media-source://unifiprotect');
        let nvr = root; if (!/:browse$/.test(root.media_content_id || '') && root.children?.length === 1) nvr = await this._browse(root.children[0].media_content_id);
        const cams = this.cams();
        this._nodes = (nvr.children || []).filter(c => !/:browse:all$/.test(c.media_content_id)).map(ch => ({ ch,
          cam: cams.find(c => c.name.toLowerCase() === ch.title.toLowerCase()) || cams.find(c => ch.title.toLowerCase().startsWith(c.name.toLowerCase())) }));
      }
      const order = [...this._nodes].sort((a, b) => (b.cam?.base === first) - (a.cam?.base === first));
      const per = this._per || (this._per = new Map()); let i = 0;
      const work = async () => { while (i < order.length) { const { ch, cam } = order[i++]; let r; try { r = await this._browse(ch.media_content_id + ':all:recent:1'); } catch (e) { continue; }
        const evs = [];
        for (const e of r.children || []) {
          const m = e.title.match(/^(\d+)\/(\d+)\/(\d+) (\d+):(\d+):(\d+)\s+(\S+)\s+(.*)$/); if (!m) continue;
          const t = new Date(2000 + +m[3], +m[1] - 1, +m[2], +m[4], +m[5], +m[6]);
          const old = (this._events || []).find(x => x.id === e.media_content_id);
          evs.push({ id: e.media_content_id, thumb: e.thumbnail, thumbS: old?.thumbS, t, dur: m[7], type: typeOf(m[8]), raw: m[8], cam: cam?.base || ch.title, camName: cam?.name || ch.title });
        }
        per.set(ch.media_content_id, evs); this._mergeSoon(); } };
      await Promise.all(Array.from({ length: Math.max(1, Math.min(this.cfg.concurrency || 5, order.length)) }, work));
      this._merge(); this._saveCache();
    } catch (e) { const l = this.$('list'); if (l && !(this._events || []).length) l.innerHTML = `<div class="empty">Kunne ikke hente hændelser (${vce(e.message || e)})</div>`; }
    this._loading = false;
    if (this._wantFirst) { const f = this._wantFirst; this._wantFirst = null; this._loadEvents(f); }
  }
  _merge() {
    clearTimeout(this._mt); this._mt = null;
    this._all = [...(this._per || new Map()).values()].flat().sort((a, b) => b.t - a.t); // fliserne tæller alle; listen viser de 150 nyeste
    this._events = this._all.slice(0, 150);
    this._renderFilters(); this._renderList(); this._render();
    const m = this._r.querySelector('.mod'); if (m?._cam) this._renderList(m.querySelector('#mlist'), m._cam);
  }
  _mergeSoon() { if (!this._mt) this._mt = setTimeout(() => this._merge(), 250); }
  _loadCache() {
    try { const c = JSON.parse(localStorage.getItem(VC_CACHE) || 'null'); if (!c || Date.now() - c.at > 6 * 3600e3) return;
      const fresh = Date.now() - c.at < 50 * 60e3; // signerede miniaturer gælder en time
      this._events = c.events.map(e => ({ ...e, t: new Date(e.t), thumbS: fresh ? e.thumbS : undefined })); } catch (e) { /* intet gemt */ }
  }
  _saveCache() {
    try { localStorage.setItem(VC_CACHE, JSON.stringify({ at: Date.now(), events: (this._events || []).slice(0, 80).map(e => ({ ...e, t: +e.t })) })); } catch (e) { /* fuld */ }
  }
  _renderFilters() {
    const ft = this.$('ft'), fc = this.$('fc'); if (!ft) return; const ev = this._events || [];
    const cnt = k => ev.filter(e => k === 'all' || e.type === k).length;
    ft.innerHTML = [['all', 'Alle', null, '#e8c37e'], ...Object.entries(TYPES).filter(([k]) => cnt(k)).map(([k, v]) => [k, v[0], v[1], v[2]])]
      .map(([k, l, ic, c]) => `<button data-k="${k}" class="${this._ft === k ? 'on' : ''}" style="--c:${c}">${ic ? vci(ic, 13, 2) : ''}${l} · ${cnt(k)}</button>`).join('');
    fc.innerHTML = [['all', 'Alle kameraer'], ...this.cams().map(c => [c.base, c.name])].map(([k, l]) => `<button data-k="${k}" class="${this._fc === k ? 'on' : ''}">${vce(l)}</button>`).join('');
    ft.querySelectorAll('button').forEach(b => b.onclick = () => { this._ft = b.dataset.k; this._renderFilters(); this._renderList(); });
    fc.querySelectorAll('button').forEach(b => b.onclick = () => { this._fc = b.dataset.k; this._renderFilters(); this._renderList(); });
  }
  async _renderList(target, camFilter) {
    const l = target || this.$('list'); if (!l) return;
    const ev = (this._events || []).filter(e => (camFilter ? e.cam === camFilter : (this._fc === 'all' || e.cam === this._fc)) && (camFilter || this._ft === 'all' || e.type === this._ft));
    if (!target) this.$('evn').textContent = `${ev.length} hændelse${ev.length === 1 ? '' : 'r'}`;
    const key = ev.slice(0, 60).map(e => e.id).join(); if (l._key === key && l.childElementCount) return; l._key = key; // uændret: tegn ikke om
    if (!ev.length) { l.innerHTML = '<div class="empty">Ingen hændelser i det valgte filter</div>'; return; }
    let lastDay = '', html = '';
    ev.slice(0, 60).forEach((e, i) => { const d = e.t.toDateString() === new Date().toDateString() ? 'I dag' : e.t.toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'short' });
      if (d !== lastDay) { html += `<div class="day">${d}</div>`; lastDay = d; } const T = TYPES[e.type];
      html += `<button class="it" data-i="${this._events.indexOf(e)}" style="animation-delay:${Math.min(i, 12) * 35}ms"><div class="th">${e.thumbS ? `<img loading="lazy" src="${e.thumbS}" alt="">` : ''}<span>${vci('play', 22)}</span></div>
        <div style="min-width:0"><b>${vce(e.camName)}</b><small>${vci('clock', 12)}${vct(e.t)} · ${vce(e.dur)}</small><span class="ty" style="--c:${T[2]}">${vci(T[1], 12, 2)}${T[0]}</span></div></button>`; });
    l.innerHTML = html;
    l.querySelectorAll('.it').forEach(b => b.onclick = () => this.play(this._events[+b.dataset.i]));
    // Miniaturer signeres ti ad gangen i stedet for én ad gangen (Claude AI, 2026-10-26)
    const todo = ev.slice(0, 60).filter(e => !e.thumbS && e.thumb);
    for (let k = 0; k < todo.length; k += 10) await Promise.all(todo.slice(k, k + 10).map(async e => { e.thumbS = await this._sign(e.thumb.replace(/width=\d+&height=\d+/, 'width=320&height=200'));
      const im = l.querySelector(`.it[data-i="${this._events.indexOf(e)}"] .th`); if (im && !im.querySelector('img')) im.insertAdjacentHTML('afterbegin', `<img src="${e.thumbS}" alt="">`); }));
  }
  _modal(title, sub) {
    this._r.querySelector('.mod')?.remove();
    const m = document.createElement('div'); m.className = 'mod';
    m.innerHTML = `<button class="x">${vci('close', 18)}</button><div class="box"><div class="vid" id="vid"></div><div class="side"><h3>${vce(title)}</h3><p>${sub}</p><div class="tabs2" id="mt"></div><div class="list" id="mlist"></div></div></div>`;
    m.onclick = e => { if (e.target === m || e.target.closest('.x')) { clearInterval(m._t); m.remove(); } }; this._r.appendChild(m); return m;
  }
  _liveInto(box, id, m) {
    clearInterval(m._t); box.innerHTML = ''; const s = this._h.states[id];
    if (customElements.get('ha-camera-stream')) { const v = document.createElement('ha-camera-stream'); v.hass = this._h; v.stateObj = s; v.muted = true; v.controls = true; v.allowExoPlayer = true; box.appendChild(v); }
    else { const im = document.createElement('img'); box.appendChild(im); const up = () => { im.src = s.attributes.entity_picture + '&t=' + Date.now(); }; up(); m._t = setInterval(up, 1000); }
    m.querySelector('[data-l]')?.classList.add('on');
  }
  openLive(id, base) {
    const cam = this.cams().find(c => c.id === id), m = this._modal(cam?.name || id, 'Live · tryk på en hændelse for at afspille klippet');
    m.querySelector('#mt').innerHTML = `<button data-l>${vci('live', 13)} Live</button>`; m.querySelector('[data-l]').onclick = () => this._liveInto(m.querySelector('#vid'), id, m);
    m._cam = base; this._liveInto(m.querySelector('#vid'), id, m); this._renderList(m.querySelector('#mlist'), base);
    if (!(this._events || []).some(e => e.cam === base)) this._loadEvents(base);
  }
  async play(e) {
    if (!e) return; let m = this._r.querySelector('.mod'); const sub = `${TYPES[e.type][0]} · ${e.t.toLocaleString('da-DK', { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · ${e.dur}`;
    if (!m) { m = this._modal(e.camName, sub); m._cam = e.cam; this._renderList(m.querySelector('#mlist'), e.cam);
      const cam = this.cams().find(c => c.base === e.cam); if (cam) { m.querySelector('#mt').innerHTML = `<button data-l>${vci('live', 13)} Live</button>`; m.querySelector('[data-l]').onclick = () => this._liveInto(m.querySelector('#vid'), cam.id, m); } }
    else m.querySelector('.side p').textContent = sub;
    m.querySelector('[data-l]')?.classList.remove('on');
    clearInterval(m._t); const box = m.querySelector('#vid'); box.innerHTML = e.thumbS ? `<img src="${e.thumbS}" style="filter:blur(2px) brightness(.6)">` : '';
    try { const r = await this._h.callWS({ type: 'media_source/resolve_media', media_content_id: e.id }); let url = r.url; if (url.startsWith('/') && !/authSig=/.test(url)) url = await this._sign(url);
      box.innerHTML = `<video src="${url}" controls autoplay playsinline muted></video>`; }
    catch (er) { box.insertAdjacentHTML('beforeend', `<div style="display:grid;place-items:center;color:#fff;font-size:13px">Klippet kunne ikke afspilles (${vce(er.message || er)})</div>`); }
  }
}
if (!customElements.get('th-camera-card')) customElements.define('th-camera-card', ThCameraCard);
console.info(`%c TH-CAMERA %c ${VC_VER} `, 'background:#e8c37e;color:#111;font-weight:700', 'background:#222;color:#fff');
