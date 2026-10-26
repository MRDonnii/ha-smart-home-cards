/* TH Kamera – UniFi Protect: live kameraer + hændelser med klip
 * type: custom:th-camera-card
 * cameras: [camera.x, …]   valgfri – ellers alle UniFi Protect-kameraer (platform: unifiprotect)
 * exclude: [camera.x, …]   kameraer der ikke skal vises (alle kanaler af kameraet), og deres hændelser
 * live_tiles: true  – fliserne viser live video (WebRTC, kameraets laveste kanal) som i UniFi Protect; false = stillbilleder
 * max_live: hvor mange fliser der må køre live på én gang (standard 16); kun fliser, der er på skærmen
 * refresh: sekunder mellem stillbilleder (standard 3, eller 5 ved mere end 8 kameraer)
 * concurrency: hvor mange kameraer der hentes hændelser fra ad gangen (standard 5)
 * nvr: { storage_entity, capacity_entity, uptime_entity, cpu_entity, temp_entity, memory_entity, hdd_entities: [] }  – optagerens status
 * quick_links: [{ name, subtitle, icon, navigation_path }]  – genveje under kameraerne
 * layout: auto (standard) – bred skærm: live til venstre, afspiller og seneste hændelser til højre; smal skærm: kun live,
 *         og et tryk på et kamera åbner afspilleren i fuld skærm. playback – afspilleren og hændelserne som hele siden
 *         (?cam=camera.x&t=<ms eller ISO> i adressen åbner et kamera på et tidspunkt).
 * Afspilleren (player.js, 2.4.0): tidslinje med hændelser, spol ved at trække, zoom, ±10 s, forrige/næste hændelse, 1–8×,
 * dato, live. Med integrationen protect_playback hentes lav kvalitet først og høj kvalitet bagefter (Claude AI, 2026-10-26).
 * Del af Smart Home Cards fra 2.1.0 (Claude AI, 2026-10-26): hurtigere med mange kameraer – hændelser hentes parallelt og vises,
 * efterhånden som hvert kamera svarer, det trykkede kamera først; de seneste hændelser huskes i browseren, så listen står klar
 * med det samme; fliserne bruger mellemkanalen, live bruger den højeste.
 */
import './player.js';

const VC_VER = '2.4.0';
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
.g{display:grid;grid-template-columns:1fr;gap:8px;align-items:start}
.g.wide{grid-template-columns:minmax(0,1fr) minmax(400px,34%)}
.g.pb.wide{grid-template-columns:minmax(0,1fr) 380px}
.side{position:sticky;top:12px;display:flex;flex-direction:column;gap:8px;max-height:calc(100dvh - 130px);min-width:0}
.side .ev{flex:1 1 auto;min-height:220px}
.plp{padding:12px}
.g.pb.wide .ev{position:sticky;top:12px;max-height:calc(100dvh - 130px)}
.g.pb:not(.wide) .plp{position:sticky;top:0;z-index:5;background:rgba(10,12,17,.97);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
#pc{margin-bottom:10px}
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
/* Registrering som lille mærke i hjørnet i stedet for REC (brugeren: det store mærke midt i billedet skjulte, hvad der skete) */
.cam .tag{position:absolute;right:10px;top:10px;display:flex;align-items:center;gap:6px;padding:5px 10px 5px 8px;border-radius:99px;font-weight:700;font-size:11px;
  background:color-mix(in srgb,var(--c) 90%,transparent);color:#140f08;box-shadow:0 6px 18px -6px var(--c);animation:pop .4s cubic-bezier(.2,1.6,.4,1)}
.cam.act .rec{display:none}
@keyframes pop{from{transform:scale(.6);opacity:0}}
.cam.act{box-shadow:inset 0 0 0 2px var(--c),0 0 40px -12px var(--c)}
.cam .pulse{position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 2px var(--c);animation:pl 1.6s ease-out infinite;pointer-events:none}@keyframes pl{to{box-shadow:inset 0 0 0 14px transparent}}
.ev{display:flex;flex-direction:column;min-height:0}
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
@keyframes fd{from{opacity:0}}
.sheet{position:fixed;inset:0;z-index:1000;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;background:rgba(3,4,8,.96);backdrop-filter:blur(10px);
  -webkit-backdrop-filter:blur(10px);animation:fd .25s both;padding:max(10px,env(safe-area-inset-top)) 10px max(24px,env(safe-area-inset-bottom))}
.sh-in{max-width:900px;margin:0 auto;display:flex;flex-direction:column;gap:10px}
.sh-top{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:8px;background:rgba(3,4,8,.96);padding:2px 0 4px}
.sh-top .x{flex:none;width:40px;height:40px;border-radius:50%;border:0;background:rgba(255,255,255,.12);cursor:pointer;display:grid;place-items:center}
.sh-top .flt{margin:0;flex:1;min-width:0}
.sh-pl{position:sticky;top:48px;z-index:2;background:rgba(3,4,8,.96);padding-bottom:6px}
.sh-k{font-size:10px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--mut);margin:4px 2px 0}
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
    if (!this._ro) this._ro = new ResizeObserver(() => { if (this._h && this._mode() !== this._lastMode) this._render(); });
    this._ro.observe(this);
  }
  disconnectedCallback() { clearInterval(this._tick); clearInterval(this._evt); this._ro?.disconnect(); this._io?.disconnect(); this._io = null; this._r?.querySelectorAll('.cam .lv').forEach(l => { l.innerHTML = ''; }); this._closeSheet(); }
  set hass(h) {
    const first = !this._h; this._h = h;
    if (!this._r) { this._r = this.attachShadow({ mode: 'open' }); this._r.innerHTML = `<style>${VC_CSS}</style><div id="w"></div>`; this._ft = 'all'; this._fc = 'all'; this._signed = {};
      this._evVer = 0; this._nodesP = new Promise(r => { this._nodesR = r; }); this._frameP = new Promise(r => { this._frameR = r; }); }
    if (this._player) this._player.hass = h;
    if (first) {
      this._loadCache();
      // Findes integrationen protect_playback, kan afspilleren hente kameraets lave kanal først.
      ThCameraCard._pbP ||= h.callApi('GET', 'protect_playback/cameras').then(() => true, () => false);
      ThCameraCard._pbP.then(v => { this._pb = v; if (this._player?._o) this._player.setup(this._plOpts(this._player.hasAttribute('compact'))); });
    }
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
      const strip = x => String(x).replace(/_(high|medium|low)(_resolution_channel)?$/, '');
      if ((this.cfg.exclude || []).some(x => strip(x) === strip(id))) continue;
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
  // auto: bred skærm = live + afspiller + hændelser, smal = kun live (afspilleren åbnes i fuld skærm); playback = afspilleren som side.
  _mode() { const wide = (this.getBoundingClientRect().width || window.innerWidth) >= 1000; return this.cfg.layout === 'playback' ? (wide ? 'pbw' : 'pbn') : wide ? 'wide' : 'narrow'; }
  _render() {
    const cams = this.cams(), w = this.$('w'), mode = this._mode(), key = mode + cams.map(c => c.id).join();
    if (key !== this._key) { this._key = key; this._lastMode = mode;
      if (!cams.length) { w.innerHTML = `<div class="p"><div class="hd"><div><div class="k">Kameraer</div><h2>UniFi Protect</h2></div></div><div class="empty">Ingen UniFi‑kameraer fundet endnu.</div></div>`; return; }
      const camsP = `<div class="p"><div class="hd"><div><div class="k">Kameraer · UniFi Protect</div><h2>${cams.length} kameraer</h2></div><span style="margin-left:auto" id="stat"></span></div>
          <div class="cams">${cams.map((c, i) => `<button class="cam" data-b="${c.base}" data-id="${c.id}" data-tile="${c.tile}" data-live="${c.live}" style="animation-delay:${i * 70}ms"><img alt=""><div class="lv"></div><div class="sh"></div>
            <div class="nm">${vci('cam', 14)}${vce(c.name)}</div><div class="rec"><i></i>REC</div><div class="tg"></div>
            <div class="bot"><span class="last">${vci('clock', 13)}<span>–</span></span><span class="cnt">0 i dag</span></div></button>`).join('')}</div>
          <div id="nvr"></div></div>`;
      const evP = `<div class="p ev" style="animation-delay:120ms"><div class="hd"><div><div class="k">Hændelser · seneste døgn</div><h2 id="evn">Henter…</h2></div></div>
          <div class="flt" id="ft"></div><div class="flt" id="fc"></div><div class="list" id="list">${'<div class="skel"></div>'.repeat(5)}</div></div>`;
      const plP = (cams2) => `<div class="p plp">${cams2 ? '<div class="flt" id="pc"></div>' : ''}<div id="plbox"></div></div>`;
      this._closeSheet();
      w.innerHTML = mode === 'wide' ? `<div class="g wide">${camsP}<div class="side">${plP(false)}${evP}</div></div>`
        : mode === 'narrow' ? `<div class="g narrow">${camsP}</div>`
          : `<div class="g pb ${mode === 'pbw' ? 'wide' : ''}">${plP(true)}${evP}</div>`;
      w.querySelectorAll('.cam').forEach(b => b.onclick = () => this._openCam(b.dataset.b));
      const box = this.$('plbox'); if (box) { box.appendChild(this._pl(mode === 'wide')); this._startPlayer(); }
      this._renderFilters(); this._refresh(true); this._liveTiles(); if ((this._events || []).length) this._renderList();
    }
    let act = 0;
    w.querySelectorAll('.cam').forEach(b => { const ty = this.live(b.dataset.b), T = ty && TYPES[ty]; if (ty) act++;
      b.classList.toggle('act', !!ty); b.style.setProperty('--c', T ? T[2] : 'transparent');
      const tg = b.querySelector('.tg'), h = T ? `<div class="pulse"></div><div class="tag">${vci(T[1], 13, 2.2)}${T[0]}</div>` : ''; if (tg._v !== h) { tg.innerHTML = h; tg._v = h; }
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
        this._nvr = String(nvr.media_content_id || '').split('/').pop().split(':')[0];
        this._nodes = (nvr.children || []).filter(c => !/:browse:all$/.test(c.media_content_id)).map(ch => ({ ch, cid: ch.media_content_id.split(':browse:')[1],
          cam: cams.find(c => c.name.toLowerCase() === ch.title.toLowerCase()) || cams.find(c => ch.title.toLowerCase().startsWith(c.name.toLowerCase())) }))
          .filter(n => n.cam || !(this.cfg.exclude || []).length); // udeladte kameraer: ingen hændelser
        this._cid = Object.fromEntries(this._nodes.filter(n => n.cam).map(n => [n.cam.base, n.cid])); this._nodesR();
        // Afspilleren først: optageren svarer langsomt på video, mens den samtidig leverer 11 hændelseslister og miniaturer.
        if (this._player?.isConnected && (this._events || []).length) await this._afterFrame();
      }
      const order = [...this._nodes].sort((a, b) => (b.cam?.base === first) - (a.cam?.base === first));
      const per = this._per || (this._per = new Map()); let i = 0;
      const work = async () => { while (i < order.length) { const n = order[i++]; let r; try { r = await this._browse(n.ch.media_content_id + ':all:recent:1'); } catch (e) { continue; }
        per.set(n.ch.media_content_id, this._parse(r.children, n)); this._mergeSoon(); } };
      await Promise.all(Array.from({ length: Math.max(1, Math.min(this.cfg.concurrency || 5, order.length)) }, work));
      this._merge(); this._saveCache();
    } catch (e) { this._nodesR?.(); const l = this.$('list'); if (l && !(this._events || []).length) l.innerHTML = `<div class="empty">Kunne ikke hente hændelser (${vce(e.message || e)})</div>`; }
    this._loading = false;
    if (this._wantFirst) { const f = this._wantFirst; this._wantFirst = null; this._loadEvents(f); }
  }
  // "10/26/26 07:11:06 1m 5s Object Detection - Person" (lokal tid) – varigheden kan have flere led.
  _parse(children, n) {
    const evs = [];
    for (const e of children || []) {
      const m = e.title.match(/^(\d+)\/(\d+)\/(\d+) (\d+):(\d+):(\d+)\s+((?:\d+[hms]\s?)+)\s*(.*)$/); if (!m) continue;
      const t = new Date(2000 + +m[3], +m[1] - 1, +m[2], +m[4], +m[5], +m[6]);
      const old = (this._events || []).find(x => x.id === e.media_content_id);
      evs.push({ id: e.media_content_id, thumb: e.thumbnail, thumbS: old?.thumbS, t, dur: m[7].trim(), type: typeOf(m[8]), raw: m[8], cam: n.cam?.base || n.ch.title, camName: n.cam?.name || n.ch.title });
    }
    return evs;
  }
  _merge() {
    clearTimeout(this._mt); this._mt = null;
    this._all = [...(this._per || new Map()).values()].flat().sort((a, b) => b.t - a.t); // fliserne tæller alle; listen viser de 150 nyeste
    this._events = this._all.slice(0, 150); this._evVer++;
    this._renderFilters(); this._renderList(); this._render(); this._renderSheet(); this._startPlayer();
  }
  _mergeSoon() { if (!this._mt) this._mt = setTimeout(() => this._merge(), 250); }
  _loadCache() {
    try { const c = JSON.parse(localStorage.getItem(VC_CACHE) || 'null'); if (!c || Date.now() - c.at > 6 * 3600e3) return;
      const fresh = Date.now() - c.at < 50 * 60e3; // signerede miniaturer gælder en time
      this._events = c.events.map(e => ({ ...e, t: new Date(e.t), dur: String(e.dur || ''), thumbS: fresh ? e.thumbS : undefined })); this._evVer++;
      if (c.nvr && c.cid) { this._nvr = c.nvr; this._cid = c.cid; } } catch (e) { /* intet gemt */ }
  }
  _saveCache() {
    try { localStorage.setItem(VC_CACHE, JSON.stringify({ at: Date.now(), nvr: this._nvr, cid: this._cid, events: (this._events || []).slice(0, 80).map(e => ({ ...e, t: +e.t })) })); } catch (e) { /* fuld */ }
  }
  _afterFrame() { return Promise.race([this._frameP, new Promise(r => setTimeout(r, 2500))]); }
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
    // Ét kamera (fuldskærmsafspilleren): alle dets hændelser, også dem uden for de 150 nyeste på tværs af kameraerne.
    const src = camFilter ? this._camEvents(camFilter).sort((a, b) => b.t - a.t) : (this._events || []);
    const ev = src.filter(e => (camFilter || this._fc === 'all' || e.cam === this._fc) && (camFilter || this._ft === 'all' || e.type === this._ft));
    if (!target && this.$('evn')) this.$('evn').textContent = `${ev.length} hændelse${ev.length === 1 ? '' : 'r'}`;
    const key = ev.slice(0, 60).map(e => e.id).join(); if (l._key === key && l.childElementCount) return; l._key = key; l._ev = ev; // uændret: tegn ikke om
    if (!ev.length) { l.innerHTML = '<div class="empty">Ingen hændelser i det valgte filter</div>'; return; }
    let lastDay = '', html = '';
    ev.slice(0, 60).forEach((e, i) => { const d = e.t.toDateString() === new Date().toDateString() ? 'I dag' : e.t.toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'short' });
      if (d !== lastDay) { html += `<div class="day">${d}</div>`; lastDay = d; } const T = TYPES[e.type];
      html += `<button class="it" data-i="${i}" style="animation-delay:${Math.min(i, 12) * 35}ms"><div class="th">${e.thumbS ? `<img loading="lazy" src="${e.thumbS}" alt="">` : ''}<span>${vci('play', 22)}</span></div>
        <div style="min-width:0"><b>${vce(e.camName)}</b><small>${vci('clock', 12)}${vct(e.t)} · ${vce(e.dur)}</small><span class="ty" style="--c:${T[2]}">${vci(T[1], 12, 2)}${T[0]}</span></div></button>`; });
    l.innerHTML = html;
    l.querySelectorAll('.it').forEach(b => b.onclick = () => this._openEvent(l._ev[+b.dataset.i]));
    // Miniaturer signeres ti ad gangen i stedet for én ad gangen (Claude AI, 2026-10-26)
    const todo = ev.slice(0, 60).filter(e => !e.thumbS && e.thumb);
    if (todo.length && this._player?.isConnected) await this._afterFrame(); // miniaturerne venter på afspillerens første billede
    for (let k = 0; k < todo.length; k += 10) await Promise.all(todo.slice(k, k + 10).map(async e => { e.thumbS = await this._sign(e.thumb.replace(/width=\d+&height=\d+/, 'width=320&height=200'));
      const im = l.querySelector(`.it[data-i="${ev.indexOf(e)}"] .th`); if (im && !im.querySelector('img')) im.insertAdjacentHTML('afterbegin', `<img loading="lazy" decoding="async" src="${e.thumbS}" alt="">`); }));
  }
  // ---- afspiller (player.js) -------------------------------------------------------------------------------------------
  _plOpts(compact) {
    const self = this;
    return { hass: this._h, get nvr() { return self._nvr; }, pb: !!this._pb, compact, cams: () => this.cams(), cid: b => this._cid?.[b], ready: this._nodesP,
      events: b => this._camEvents(b), version: () => this._evVer || 0, loadDay: (b, d) => this._loadDay(b, d), thumb: e => this._thumbUrl(e), types: TYPES,
      onCam: b => this._onPlayerCam(b), onFrame: () => this._frameR() };
  }
  _pl(compact = false) {
    if (!this._player) this._player = document.createElement('th-protect-player');
    this._player.setup(this._plOpts(compact)); this._player.hass = this._h;
    return this._player;
  }
  // Første visning: kamera og tidspunkt fra adressen (?cam=&t=), ellers den seneste hændelse på pause.
  _startPlayer() {
    const p = this._player; if (!p?.isConnected || p.cam || !this._h) return;
    const u = new URLSearchParams(location.search), qc = u.get('cam'), qt = u.get('t');
    if (qc && !this._usedQuery) { this._usedQuery = true; const base = qc.replace(/_(high|medium|low)(_resolution_channel)?$/, '');
      if (this.cams().some(c => c.base === base)) { const t = qt ? (/^\d+$/.test(qt) ? +qt : Date.parse(qt)) : null; p.open(base, Number.isFinite(t) ? t : null, true); return; } }
    const ev = (this._events || [])[0];
    if (ev) p.open(ev.cam, +ev.t - 2000, false);
    else if (this._all) p.open(this.cams()[0]?.base, null);
  }
  _openEvent(e) {
    if (!e) return;
    if (this._lastMode === 'narrow') this._openSheet(e.cam, +e.t - 2000);
    else this._pl(this._lastMode === 'wide').open(e.cam, +e.t - 2000, true);
  }
  _openCam(base) {
    if (this._lastMode === 'narrow') this._openSheet(base, null);
    else this._pl(true).open(base, null);
  }
  _onPlayerCam(b) {
    const pc = this.$('pc');
    if (pc) { pc.innerHTML = this.cams().map(c => `<button data-k="${c.base}" class="${c.base === b ? 'on' : ''}">${vce(c.name)}</button>`).join('');
      pc.querySelectorAll('button').forEach(x => x.onclick = () => this._player.open(x.dataset.k, this._player.time, true)); }
    this._renderSheet();
  }
  // Smal skærm: afspilleren i fuld skærm med kameraets hændelser under sig.
  _openSheet(base, at) {
    this._closeSheet();
    const s = document.createElement('div'); s.className = 'sheet';
    s.innerHTML = `<div class="sh-in"><div class="sh-top"><button class="x" aria-label="Luk">${vci('close', 18)}</button><div class="flt" id="sc"></div></div>
      <div class="sh-pl"></div><div class="sh-k">Hændelser på kameraet</div><div class="list" id="slist"></div></div>`;
    s.querySelector('.x').onclick = () => this._closeSheet();
    this._r.appendChild(s); this._sheet = s;
    s.querySelector('.sh-pl').appendChild(this._pl(false));
    this._player.open(base, at, true); this._renderSheet();
  }
  _closeSheet() { if (!this._sheet) return; this._sheet.remove(); this._sheet = null; }
  _renderSheet() {
    const s = this._sheet, b = this._player?.cam; if (!s || !b) return;
    const sc = s.querySelector('#sc'), h = this.cams().map(c => `<button data-k="${c.base}" class="${c.base === b ? 'on' : ''}">${vce(c.name)}</button>`).join('');
    if (sc._v !== h) { sc._v = h; sc.innerHTML = h; sc.querySelectorAll('button').forEach(x => x.onclick = () => this._player.open(x.dataset.k, this._player.time, true));
      sc.querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'center' }); }
    this._renderList(s.querySelector('#slist'), b);
    if (!(this._events || []).some(e => e.cam === b)) this._loadEvents(b);
  }
  _camEvents(b) {
    const out = new Map();
    for (const e of this._all || this._events || []) if (e.cam === b) out.set(e.id, e);
    for (const e of this._dayEv?.[b] || []) if (!out.has(e.id)) out.set(e.id, e);
    return [...out.values()];
  }
  // Hændelser for en hel dag, når tidslinjen vises længere tilbage end det seneste døgn.
  _loadDay(b, day) {
    const key = `${b}|${day}`; this._dayL ||= new Map(); if (this._dayL.has(key)) return this._dayL.get(key);
    const p = (async () => {
      await this._nodesP; const n = this._nodes?.find(x => x.cam?.base === b); if (!n || !this._nvr) return;
      const d = new Date(day);
      const r = await this._browse(`media-source://unifiprotect/${this._nvr}:browse:${n.cid}:all:range:${d.getFullYear()}:${d.getMonth() + 1}:${d.getDate()}`);
      const have = new Set((this._dayEv?.[b] || []).map(e => e.id));
      (this._dayEv ||= {})[b] = [...(this._dayEv[b] || []), ...this._parse(r.children, n).filter(e => !have.has(e.id))]; this._evVer++;
    })();
    p.catch(() => this._dayL.delete(key)); this._dayL.set(key, p); return p;
  }
  async _thumbUrl(e) {
    if (e.thumbS) return e.thumbS; if (!e.thumb) return null;
    e.thumbS = await this._sign(e.thumb.replace(/width=\d+&height=\d+/, 'width=320&height=200')); return e.thumbS;
  }
}
if (!customElements.get('th-camera-card')) customElements.define('th-camera-card', ThCameraCard);
console.info(`%c TH-CAMERA %c ${VC_VER} `, 'background:#e8c37e;color:#111;font-weight:700', 'background:#222;color:#fff');
