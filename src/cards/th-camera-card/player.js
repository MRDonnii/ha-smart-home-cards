/* TH Protect-afspiller – del af TH Camera Card (Claude AI, 2026-10-26; bruger: "en oplevelse mere som Unifi protect med
 * mulighed for at spole og flyttes på slider med start og alt det, med en snappy oplevelse så det bliver en løsning man vil
 * benytte istedet for protect").
 *
 * Optagelserne hentes i stykker á 10 s fra UniFi Protect gennem Home Assistant. Med integrationen protect_playback hentes
 * først kameraets lave kanal (360p, ~0,4 MB, ~0,3 s), så billedet står der med det samme, og derefter den høje kanal, som
 * afspilleren skifter over til midt i afspilningen. Uden integrationen bruges HA's eget endpoint (kun den høje kanal).
 * Protects eksport starter ved keyframen før det ønskede tidspunkt og slutter præcist, så stykkets start = slut − varighed.
 * To <video> skiftes, så næste stykke allerede står på det rigtige billede, når det forrige slutter.
 *
 * Bruges af th-camera-card: setup({ hass, nvr, pb, compact, cams(), cid(base), ready, events(base), version(), loadDay(),
 * thumb(e), types, onCam(base) }) og open(base, tid | null = live, afspil).
 */
const SEG = 10000;          // ét stykke optagelse
const LIVE_LAG = 20000;     // tættere på nu end det = live
const READY_LAG = 10000;    // et stykke hentes først, når det er optaget færdigt
const SPANS = [60e3, 2 * 60e3, 5 * 60e3, 15 * 60e3, 30 * 60e3, 3600e3, 3 * 3600e3, 6 * 3600e3, 12 * 3600e3, 24 * 3600e3];
const STEPS = [5e3, 10e3, 30e3, 60e3, 2 * 60e3, 5 * 60e3, 10 * 60e3, 15 * 60e3, 30 * 60e3, 3600e3, 2 * 3600e3, 3 * 3600e3, 6 * 3600e3, 12 * 3600e3];
const SPEEDS = [1, 2, 4, 8];
const QKEY = 'th-camera-player:quality';
const isoZ = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, '+00:00');
const pad = n => String(n).padStart(2, '0');
const hms = (d, sec = true) => `${pad(d.getHours())}.${pad(d.getMinutes())}${sec ? '.' + pad(d.getSeconds()) : ''}`;
export const durMs = s => { const g = r => +((String(s || '').match(r) || [])[1] || 0); return (g(/(\d+)h/) * 3600 + g(/(\d+)m/) * 60 + g(/(\d+)s/)) * 1000; };
// Den første, der lykkes – eller null, når alle er slået fejl.
const firstOk = ps => new Promise(res => { let left = ps.length; if (!left) res(null);
  ps.forEach(p => p.then(v => { if (v) res(v); else if (!--left) res(null); }, () => { if (!--left) res(null); })); });

const PI = {
  play: '<path d="M8 5.5v13l10.5-6.5Z" fill="currentColor" stroke="none"/>', pause: '<path d="M8 5.5v13M16 5.5v13" stroke-width="3"/>',
  prev: '<path d="M6 5v14"/><path d="M19 5.5v13L9 12Z" fill="currentColor" stroke="none"/>', next: '<path d="M18 5v14"/><path d="M5 5.5v13L15 12Z" fill="currentColor" stroke="none"/>',
  back: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4.5v4h4"/><text x="12" y="15.2" font-size="7.5" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">10</text>',
  fwd: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4.5v4h-4"/><text x="12" y="15.2" font-size="7.5" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">10</text>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z"/><path d="M16 9a4.5 4.5 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  cal: '<rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>', minus: '<path d="M6 12h12"/>', plus: '<path d="M6 12h12M12 6v12"/>',
};
const pi = (k, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PI[k]}</svg>`;

const CSS = `
:host{display:block;position:relative;color:#f4f1ea;--gold:#e8c37e;--mut:rgba(244,241,234,.56);--hair:rgba(244,241,234,.09);--red:#ff4d63;outline:none;-webkit-font-smoothing:antialiased}
*{box-sizing:border-box}
.stage{position:relative;aspect-ratio:16/9;background:#000;border-radius:16px;overflow:hidden;box-shadow:inset 0 0 0 1px var(--hair);touch-action:manipulation;cursor:pointer}
.stage video,.stage .live,.stage .poster{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:0;transition:opacity .12s;pointer-events:none}
.stage .poster{object-fit:cover;filter:blur(14px) brightness(.5) saturate(1.2);transform:scale(1.1)}
.stage video.on,.stage .live.on,.stage .poster.on{opacity:1}
.stage .live ha-camera-stream{display:block;width:100%;height:100%;--video-max-height:100%}
.stage .live img{width:100%;height:100%;object-fit:contain}
.top{position:absolute;left:10px;right:10px;top:10px;display:flex;align-items:flex-start;gap:8px;pointer-events:none}
.cn{padding:5px 10px;border-radius:10px;background:rgba(10,12,18,.55);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);font-size:12.5px;font-weight:600;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
.q{margin-left:auto;padding:4px 8px;border-radius:99px;font-size:10px;font-weight:800;letter-spacing:.12em;background:rgba(0,0,0,.5);backdrop-filter:blur(8px)}
.q.live{background:var(--red);color:#fff}.q:empty{display:none}
.spin{position:absolute;left:50%;top:50%;width:34px;height:34px;margin:-17px;border-radius:50%;border:3px solid rgba(255,255,255,.18);border-top-color:var(--gold);animation:sp .8s linear infinite;opacity:0;transition:opacity .2s;pointer-events:none}
.spin.on{opacity:1}@keyframes sp{to{transform:rotate(1turn)}}
.msg{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);padding:6px 12px;border-radius:99px;background:rgba(0,0,0,.65);font-size:12px;opacity:0;transition:opacity .2s;pointer-events:none;white-space:nowrap}
.msg.on{opacity:1}
.row{display:flex;align-items:center;gap:4px;margin-top:8px}
.row button{appearance:none;border:0;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px;flex:none;min-width:34px;height:34px;padding:0 8px;border-radius:11px;
  background:rgba(255,255,255,.05);color:inherit;font:inherit;font-size:11.5px;font-weight:700;box-shadow:inset 0 0 0 1px var(--hair);transition:background .2s}
.row button:hover{background:rgba(255,255,255,.1)}.row button:active{transform:scale(.95)}
.row .pp{min-width:46px;background:var(--gold);color:#15110a;box-shadow:none}.row .pp:hover{background:#f1d199}
.row .lv i{width:7px;height:7px;border-radius:50%;background:currentColor}
.row .lv.on{background:var(--red);color:#fff;box-shadow:none}
.row .on2{color:var(--gold)}
.clock{font-variant-numeric:tabular-nums;font-size:12.5px;font-weight:600;margin:0 4px 0 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.grow{flex:1;min-width:0}
.span{font-size:11px;font-weight:600;color:var(--mut);min-width:44px;text-align:center;font-variant-numeric:tabular-nums}
.date{position:relative}.date input{position:absolute;left:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none;border:0;padding:0}
.tlw{position:relative;height:58px;margin-top:8px;border-radius:12px;background:rgba(255,255,255,.03);box-shadow:inset 0 0 0 1px var(--hair);overflow:hidden;touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none}
.tlw.drag{cursor:grabbing}
.tlw canvas{position:absolute;inset:0;width:100%;height:100%}
.ph{position:absolute;left:50%;top:0;bottom:0;width:2px;margin-left:-1px;background:var(--gold);box-shadow:0 0 10px color-mix(in srgb,var(--gold) 70%,transparent);pointer-events:none}
.ph::before{content:"";position:absolute;left:50%;top:0;border:6px solid transparent;border-top-color:var(--gold);transform:translateX(-50%)}
.tip{position:absolute;bottom:72px;width:168px;padding:6px;border-radius:12px;background:rgba(14,16,22,.96);box-shadow:0 14px 34px -10px #000,inset 0 0 0 1px var(--hair);pointer-events:none;opacity:0;transition:opacity .15s;z-index:3}
.tip.on{opacity:1}.tip img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:8px;background:#06070b}
.tip b{display:block;font-size:11.5px;margin:5px 2px 1px}.tip small{display:block;font-size:10.5px;color:var(--mut);margin:0 2px}
:host([compact]) .row button{min-width:32px;height:32px;padding:0 7px}
:host([compact]) .hidec{display:none}
:host(:fullscreen){background:#000;padding:14px;display:flex;flex-direction:column}
:host(:fullscreen) .stage{flex:1;aspect-ratio:auto;border-radius:12px}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

const HTML = `
<div class="stage" part="stage">
  <img class="poster" alt=""><video class="v" playsinline muted preload="auto"></video><video class="v" playsinline muted preload="auto"></video><div class="live"></div>
  <div class="top"><span class="cn"></span><span class="q"></span></div><div class="spin"></div><div class="msg"></div>
</div>
<div class="row">
  <button data-a="prev" title="Forrige hændelse">${pi('prev')}</button><button data-a="back" title="10 s tilbage (←)">${pi('back')}</button>
  <button data-a="play" class="pp" title="Afspil / pause (mellemrum)">${pi('play')}</button>
  <button data-a="fwd" title="10 s frem (→)">${pi('fwd')}</button><button data-a="next" title="Næste hændelse">${pi('next')}</button>
  <span class="clock"></span><span class="grow"></span>
  <button data-a="live" class="lv" title="Live (L)"><i></i>LIVE</button>
</div>
<div class="tlw"><canvas></canvas><div class="ph"></div><div class="tip"><img alt=""><b></b><small></small></div></div>
<div class="row">
  <button data-a="speed" title="Hastighed">1×</button><button data-a="quality" title="Kvalitet: Auto viser lav kvalitet med det samme og skifter til høj">Auto</button>
  <button data-a="mute" title="Lyd">${pi('mute', 17)}</button>
  <button data-a="date" class="date" title="Gå til en dato">${pi('cal', 17)}<span class="hidec">Dato</span><input type="date" tabindex="-1"></button>
  <span class="grow"></span>
  <button data-a="zout" title="Vis længere tid">${pi('minus', 16)}</button><span class="span"></span><button data-a="zin" title="Vis kortere tid">${pi('plus', 16)}</button>
  <button data-a="full" title="Fuld skærm (F)">${pi('full', 17)}</button>
</div>`;

class ThProtectPlayer extends HTMLElement {
  constructor() {
    super();
    this._r = this.attachShadow({ mode: 'open' });
    this._r.innerHTML = `<style>${CSS}</style>${HTML}`;
    this._cache = new Map(); this._bytes = 0; this._gen = 0; this._sgen = 0; this._rate = 1;
    this._span = 30 * 60e3; this._t = Date.now(); this._live = false; this._playing = false; this._muted = true;
    try { this._quality = localStorage.getItem(QKEY) || 'auto'; } catch (e) { this._quality = 'auto'; }
    this._vids = [...this._r.querySelectorAll('video')];
    this._fr = () => this._frame();
    this._bind();
  }
  q(s) { return this._r.querySelector(s); }
  setup(o) {
    this._o = o; this._h = o.hass; this._pb = !!o.pb; this.toggleAttribute('compact', !!o.compact);
    this.q('[data-a="quality"]').style.display = this._pb ? '' : 'none';
    this._labels();
  }
  set hass(h) {
    this._h = h;
    const s = this.q('.live ha-camera-stream');
    if (s && Date.now() - (this._hs || 0) > 60e3) { this._hs = Date.now(); s.hass = h; }
  }
  get cam() { return this._cam?.base; }
  get time() { return this._live ? null : this._t; }
  connectedCallback() { if (!this.hasAttribute('tabindex')) this.tabIndex = 0; clearTimeout(this._gcT); if (this._cam) this._loop(); if (!this._ro) { this._ro = new ResizeObserver(() => { this._dirty = true; }); this._ro.observe(this.q('.tlw')); } }
  disconnectedCallback() {
    cancelAnimationFrame(this._raf); this._raf = null; this._sgen++; this._gen++;
    this._vids.forEach(v => v.pause()); this._exitLive(); this._playing = false; this._ppBtn();
    this._gcT = setTimeout(() => this._free(), 60e3); // ryddes, hvis afspilleren ikke kommer tilbage
  }
  _free() { for (const e of this._cache.values()) { e.ctrl?.abort(); if (e.url) URL.revokeObjectURL(e.url); } this._cache.clear(); this._bytes = 0; this._vids.forEach(v => { v.removeAttribute('src'); v.load(); v._e = null; }); this._cur = null; }
  _loop() { if (!this._raf) this._raf = requestAnimationFrame(this._fr); }

  // Åbn et kamera på et tidspunkt (ms) eller live (null). Samme tidspunkt bevares, når man skifter kamera.
  open(base, at, play = true) {
    const cam = this._o?.cams().find(c => c.base === base); if (!cam) return;
    if (this._cam?.base !== base) { this._sgen++; this._gen++; this._hand = null; this._vids.forEach(v => { v.pause(); v.classList.remove('on'); }); this._cur = null; this._exitLive(); this._evc = null; }
    this._cam = cam; this.q('.cn').textContent = cam.name; this._loop();
    if (at == null) this.goLive();
    else { this._poster(at); this._seek(at, play); }
    this._o.onCam?.(base);
  }
  pause() { if (this._live) return; this._playing = false; this._cur?.v.pause(); this._ppBtn(); }

  // ---- hentning ----------------------------------------------------------------------------------------------------
  _path(cid, q, k) {
    const s = isoZ(k * SEG), e = isoZ((k + 1) * SEG);
    return this._pb ? `/api/protect_playback/video/${this._o.nvr}/${cid}/${q === 'hd' ? 0 : 2}/${s}/${e}` : `/api/unifiprotect/video/${this._o.nvr}/${cid}/${s}/${e}`;
  }
  async _fetch(path, signal) {
    if (typeof this._h?.fetchWithAuth === 'function') return this._h.fetchWithAuth(path, { signal });
    const r = await this._h.callWS({ type: 'auth/sign_path', path, expires: 300 }); return fetch(r.path, { signal });
  }
  _qs() { // de kvaliteter, afspilningen bruger lige nu
    if (!this._pb) return ['hd'];
    if (this._quality === 'sd') return ['sd'];
    if (this._quality === 'hd') return ['hd'];
    return this._rate >= 4 ? ['sd'] : ['sd', 'hd'];
  }
  _get(k, q, scrub = false) {
    const cid = this._cam && this._o.cid(this._cam.base); if (!cid) return null;
    if (!this._pb) q = 'hd';
    const key = `${cid}|${q}|${k}`; let e = this._cache.get(key);
    if (e?.failed && Date.now() - e.failed > 20e3) { this._cache.delete(key); e = null; }
    if (e) { e.used = Date.now(); return e; }
    if ((k + 1) * SEG > Date.now() - READY_LAG) return null;
    const inflight = [...this._cache.values()].filter(x => x.q === q && !x.ok && !x.failed).length;
    if (!scrub && inflight >= (q === 'hd' ? 3 : 4)) return null;
    e = { key, k, q, cid, used: Date.now(), ctrl: new AbortController() };
    e.p = (async () => {
      const res = await this._fetch(this._path(cid, q, k), e.ctrl.signal);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const b = await res.blob(); if (b.size < 4096) throw new Error('tom');
      e.url = URL.createObjectURL(b); e.bytes = b.size; this._bytes += b.size; e.ok = true; this._evict(); return e;
    })();
    e.p.catch(() => { e.failed = Date.now(); });
    this._cache.set(key, e);
    if (scrub) { // under spoling vinder den seneste – ældre, ufærdige hentninger afbrydes
      (this._scrubs ||= []).push(e);
      while (this._scrubs.length > 2) { const o = this._scrubs.shift(); if (!o.ok && !o.failed && !this._vids.some(v => v._e === o)) { o.ctrl.abort(); this._cache.delete(o.key); } }
    }
    return e;
  }
  _ready(k) { // bedste færdige stykke til tidspunktet
    const cid = this._cam && this._o.cid(this._cam.base); if (!cid) return null;
    for (const q of this._quality === 'sd' && this._pb ? ['sd'] : ['hd', 'sd']) { const e = this._cache.get(`${cid}|${q}|${k}`); if (e?.ok) { e.used = Date.now(); return e; } }
    return null;
  }
  _evict() {
    const budget = (matchMedia('(pointer:coarse)').matches ? 90 : 260) * 1048576;
    if (this._bytes <= budget) return;
    const inUse = new Set(this._vids.map(v => v._e));
    for (const e of [...this._cache.values()].filter(x => x.ok && !inUse.has(x)).sort((a, b) => a.used - b.used)) {
      if (this._bytes <= budget * 0.75) break; URL.revokeObjectURL(e.url); this._bytes -= e.bytes; this._cache.delete(e.key);
    }
  }
  _prefetch(k) {
    const qs = this._qs(), ahead = Math.ceil(2 * this._rate) + 1;
    for (let i = 0; i <= ahead; i++) {
      if ((k + i + 1) * SEG > Date.now() - READY_LAG) break;
      if (qs.includes('sd')) this._get(k + i, 'sd');
      if (qs.includes('hd') && i <= 2) this._get(k + i, 'hd');
    }
  }

  // ---- video --------------------------------------------------------------------------------------------------------
  _load(v, e) {
    if (v._e === e && v.readyState >= 1) return Promise.resolve(true);
    v._e = e; v.src = e.url;
    return new Promise(res => {
      const done = ok => { v.removeEventListener('loadedmetadata', onOk); v.removeEventListener('error', onErr);
        if (v._e !== e) return res(false);
        if (ok && e.t0 == null && Number.isFinite(v.duration)) e.t0 = (e.k + 1) * SEG - v.duration * 1000;
        res(ok && e.t0 != null); };
      const onOk = () => done(true), onErr = () => done(false);
      v.addEventListener('loadedmetadata', onOk); v.addEventListener('error', onErr);
    });
  }
  _seekV(v, abs) {
    const e = v._e; if (!e || e.t0 == null) return Promise.resolve();
    const ct = Math.min(Math.max(0, (abs - e.t0) / 1000), Math.max(0, v.duration - 0.04));
    if (Math.abs(v.currentTime - ct) < 0.03 && !v.seeking) return Promise.resolve();
    return new Promise(res => { const t = setTimeout(res, 2500); v.addEventListener('seeked', () => { clearTimeout(t); res(); }, { once: true }); v.currentTime = ct; });
  }
  _other() { return this._vids.find(v => v !== this._cur?.v); }
  _activate(v) {
    const old = this._cur?.v;
    if (old && old !== v) { old.pause(); old.classList.remove('on'); }
    v.classList.add('on'); v.playbackRate = this._rate; v.muted = this._muted;
    this._cur = { v }; this.q('.poster').classList.remove('on'); this._badge();
  }
  _play(v) {
    v.playbackRate = this._rate; v.muted = this._muted;
    v.play()?.catch(() => { if (!v.muted) { this._muted = true; v.muted = true; this._labels(); v.play().catch(() => {}); } });
  }
  async _present(e, abs, play) {
    const gen = ++this._gen; this._hand = null;
    const v = this._cur?.v._e === e ? this._cur.v : this._other();
    if (!(await this._load(v, e)) || gen !== this._gen) return false;
    await this._seekV(v, abs); if (gen !== this._gen) return false;
    this._activate(v);
    if (play) this._play(v); else v.pause();
    this._spin(false); this._msg(''); this._o.onFrame?.();
    return true;
  }
  // Næste stykke (eller samme stykke i høj kvalitet) gøres klar i den skjulte video og står på det rigtige billede.
  async _arm(e, at, up = false) {
    const v = this._other(), h = this._hand = { v, e, at, up, ready: false };
    if (!(await this._load(v, e)) || this._hand !== h) return;
    await this._seekV(v, at); if (this._hand !== h) return;
    v.pause(); h.ready = true;
  }
  _doHand() { const h = this._hand; this._hand = null; this._activate(h.v); this._play(h.v); }

  async _seek(abs, play = this._playing) {
    abs = Math.min(abs, Date.now());
    if (abs > Date.now() - LIVE_LAG) { this.goLive(); return; }
    this._exitLive();
    this._t = abs; this._playing = play; this._ppBtn(); this._dirty = true; this._msg('');
    const sgen = ++this._sgen;
    if (!this._o.cid(this._cam.base)) { this._spinSoon(); await this._o.ready; if (sgen !== this._sgen) return; }
    this._loadDays();
    const k = Math.floor(abs / SEG);
    let e = this._ready(k);
    if (!e) {
      this._spinSoon();
      // Lav kvalitet først og alene (0,3 s); den høje hentes, når den lave er der – eller efter 0,4 s, hvis den lave mangler.
      const first = this._get(k, this._pb && this._quality !== 'hd' ? 'sd' : 'hd', true), ps = first ? [first.p.catch(() => null)] : [];
      if (this._pb && this._quality === 'auto' || this._quality === 'hd' && this._pb && first?.q === 'sd')
        ps.push(Promise.race([ps[0], new Promise(r => setTimeout(r, 400))]).then(() => sgen === this._sgen ? this._get(k, 'hd', true)?.p.catch(() => null) : null));
      e = await firstOk(ps);
      if (sgen !== this._sgen) return;
      if (!e) { this._spin(false); this._msg('Ingen optagelse på dette tidspunkt'); this._playing = false; this._ppBtn(); return; }
    }
    await this._present(e, abs, this._playing);
    if (sgen !== this._sgen || e.q !== 'sd' || this._playing || !this._qs().includes('hd')) return;
    // På pause: skift til høj kvalitet, når den er hentet.
    this._get(k, 'hd')?.p.then(x => { if (x && sgen === this._sgen && !this._playing && !this._drag && !this._live) this._present(x, this._t, false); }, () => {});
  }

  goLive() {
    if (!this._cam) return;
    this._sgen++; this._gen++; this._hand = null; this._stalling = false;
    this._live = true; this._playing = true; this._t = Date.now();
    this._vids.forEach(v => { v.pause(); v.classList.remove('on'); }); this._cur = null;
    this.q('.poster').classList.remove('on'); this._spin(false); this._msg('');
    const box = this.q('.live'), ent = this._o.compact ? (this._cam.tile || this._cam.id) : this._cam.id;
    if (box._ent !== ent) {
      box.innerHTML = ''; box._ent = ent; clearInterval(this._liveT);
      const s = this._h.states[ent];
      if (s && customElements.get('ha-camera-stream')) { const el = document.createElement('ha-camera-stream'); el.hass = this._h; el.stateObj = s; el.muted = this._muted; el.controls = false; el.allowExoPlayer = false; box.appendChild(el); }
      else if (s) { const im = document.createElement('img'); box.appendChild(im); const up = () => { const p = this._h.states[ent]?.attributes?.entity_picture; if (p) im.src = `${p}&t=${Date.now()}`; }; up(); this._liveT = setInterval(up, 1000); }
    }
    box.classList.add('on'); this._badge(); this._ppBtn(); this._labels(); this._dirty = true; this._loop();
  }
  _exitLive() {
    if (!this._live) return;
    this._live = false; const box = this.q('.live'); box.classList.remove('on'); box.innerHTML = ''; box._ent = null; clearInterval(this._liveT);
    this._labels(); this._badge();
  }

  // ---- løkke --------------------------------------------------------------------------------------------------------
  _frame() {
    this._raf = requestAnimationFrame(this._fr);
    const now = Date.now();
    if (this._live) { if (now - (this._lastDraw || 0) > 1000) { this._t = now; this._draw(); this._clock(); } return; }
    const v = this._cur?.v, e = v?._e;
    if (!this._drag && v && e?.t0 != null && !v.paused && !v.seeking) {
      this._t = e.t0 + v.currentTime * 1000;
      const end = (e.k + 1) * SEG, h = this._hand;
      if (h?.ready && this._t >= h.at - 40) {
        if (h.up && this._t > h.at + 250) this._hand = null; // kvalitetsskiftet nåede ikke frem i tide – prøv igen
        else this._doHand();
      } else if (v.ended || this._t >= end - 25) this._stall(end);
      if (this._t > now - LIVE_LAG) { this.goLive(); return; }
    }
    if (now - (this._lastArm || 0) > 250) { this._lastArm = now; this._tickArm(); }
    if (this._dirty || this._t !== this._drawnT) this._draw();
    if (now - (this._lastClock || 0) > 150) this._clock();
  }
  _stall(end) {
    if (this._stalling) return; this._stalling = true;
    this._seek(end + 1, true).finally(() => { this._stalling = false; });
  }
  _tickArm() {
    if (this._live || this._drag || !this._playing || this._stalling) return;
    const v = this._cur?.v, e = v?._e; if (!e) return;
    const k = e.k, end = (k + 1) * SEG, qs = this._qs();
    this._prefetch(k);
    const h = this._hand;
    // Samme stykke i høj kvalitet: skift midt i afspilningen.
    if (e.q === 'sd' && qs.includes('hd') && !h?.up) {
      const hd = this._cache.get(`${e.cid}|hd|${k}`);
      if (hd?.ok && this._t + 900 < end - 200) { this._arm(hd, this._t + 900, true); return; }
    }
    if (!h) { const n = this._ready(k + 1); if (n) this._arm(n, end); }
    else if (!h.up && h.at === end && h.e.q === 'sd' && qs.includes('hd')) { const hd = this._cache.get(`${e.cid}|hd|${k + 1}`); if (hd?.ok) this._arm(hd, end); }
  }

  // ---- tidslinje ----------------------------------------------------------------------------------------------------
  _events() {
    if (!this._cam) return [];
    const ver = this._o.version();
    if (this._evc?.base === this._cam.base && this._evc.ver === ver) return this._evc.list;
    const list = this._o.events(this._cam.base).map(e => ({ s: +e.t, d: Math.max(durMs(e.dur), 2000), type: e.type, e })).sort((a, b) => a.s - b.s);
    this._evc = { base: this._cam.base, ver, list }; this._dirty = true; return list;
  }
  _loadDays() {
    if (!this._cam || !this._o.loadDay) return;
    const from = new Date(this._t - this._span / 2); from.setHours(0, 0, 0, 0);
    for (let d = +from, n = 0; d <= this._t + this._span / 2 && n < 3; n++) {
      if (d <= Date.now()) this._o.loadDay(this._cam.base, d)?.then(() => { this._dirty = true; }, () => {});
      const nx = new Date(d); nx.setDate(nx.getDate() + 1); d = +nx;
    }
  }
  _draw() {
    this._lastDraw = Date.now(); this._drawnT = this._t; this._dirty = false;
    const cv = this.q('canvas'), W = cv.clientWidth, H = cv.clientHeight, dpr = devicePixelRatio || 1; if (!W) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    const span = this._span, T = this._t, t0 = T - span / 2, t1 = T + span / 2, x = t => (t - t0) / span * W, now = Date.now();
    const laneY = 30, laneH = 14;
    // optaget (fortid) og fremtid
    const xn = Math.min(W, Math.max(0, x(now)));
    c.fillStyle = 'rgba(255,255,255,.07)'; c.beginPath(); c.roundRect(0, laneY, xn, laneH, 4); c.fill();
    if (xn < W) { c.fillStyle = 'rgba(255,255,255,.025)'; c.fillRect(xn, laneY, W - xn, laneH); c.fillStyle = '#ff4d63'; c.fillRect(xn - 1, 18, 2, H - 22); }
    // skala
    const step = STEPS.find(s => s / span * W >= 74) || STEPS[STEPS.length - 1];
    const off = -new Date(t0).getTimezoneOffset() * 60e3;
    c.font = '600 10.5px system-ui, -apple-system, Segoe UI, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    for (let t = Math.ceil((t0 + off) / step) * step - off; t <= t1; t += step) {
      const px = x(t), d = new Date(t), midnight = d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0;
      c.fillStyle = midnight ? 'rgba(232,195,126,.7)' : 'rgba(255,255,255,.22)'; c.fillRect(px - .5, 18, 1, midnight ? H - 22 : 8);
      c.fillStyle = midnight ? '#e8c37e' : 'rgba(244,241,234,.56)';
      c.fillText(midnight ? d.toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short' }) : hms(d, step < 60e3), px, 13);
    }
    // halve trin som små streger
    c.fillStyle = 'rgba(255,255,255,.1)';
    for (let t = Math.ceil((t0 + off) / (step / 2)) * (step / 2) - off; t <= t1; t += step / 2) c.fillRect(x(t) - .5, 22, 1, 4);
    // hændelser
    const types = this._o.types || {};
    for (const ev of this._events()) {
      if (ev.s + ev.d < t0 || ev.s > t1) continue;
      const px = x(ev.s), w = Math.max(3, ev.d / span * W);
      c.fillStyle = (types[ev.type] || [])[2] || '#b7a4ff'; c.globalAlpha = ev.type === 'motion' ? .55 : .95;
      c.beginPath(); c.roundRect(px, laneY, w, laneH, 3); c.fill(); c.globalAlpha = 1;
    }
  }
  _hit(t, W) { const tol = 6 / W * this._span; return this._events().find(ev => t >= ev.s - tol && t <= ev.s + ev.d + tol) || null; }
  _setSpan(s) { this._span = Math.min(SPANS[SPANS.length - 1], Math.max(SPANS[0], s)); this._labels(); this._dirty = true; this._loadDays(); }
  _zoom(dir) { const i = SPANS.findIndex(s => s >= this._span - 1); this._setSpan(SPANS[Math.min(SPANS.length - 1, Math.max(0, (i < 0 ? SPANS.length - 1 : i) + dir))]); }

  _dragStart(x, rebase) {
    if (!rebase) {
      this._drag = true; this._moved = false; this._wasPlaying = this._playing; this._wasLive = this._live;
      this._sgen++; this._hand = null; this._cur?.v.pause(); this.q('.tlw').classList.add('drag');
    }
    this._dx0 = x; this._dt0 = this._t; this._tip(null);
  }
  _dragMove(x) {
    const dx = x - this._dx0; if (Math.abs(dx) > 4) this._moved = true; if (!this._moved) return;
    this._t = Math.min(Date.now(), this._dt0 - dx / this.q('.tlw').clientWidth * this._span);
    if (this._live && this._t < Date.now() - LIVE_LAG) this._exitLive();
    this._dirty = true; this._scrubSoon();
  }
  _dragEnd(ev, pinch) {
    this._drag = false; this.q('.tlw').classList.remove('drag'); clearTimeout(this._scT);
    if (pinch) { if (!this._live) this._seek(this._t, this._wasPlaying); return; }
    if (!this._moved) { // tryk: hop til tidspunktet eller til starten af den hændelse, der blev trykket på
      const r = this.q('.tlw').getBoundingClientRect(), t = this._t + (ev.clientX - r.left - r.width / 2) / r.width * this._span, hit = this._hit(t, r.width);
      this._seek(hit ? hit.s - 2000 : t, true); return;
    }
    if (this._t > Date.now() - LIVE_LAG) { this.goLive(); return; }
    this._seek(this._t, this._wasPlaying || this._wasLive);
  }
  _scrubSoon() {
    const now = Date.now(); clearTimeout(this._scT);
    if (now - (this._lastScrub || 0) > 70) { this._lastScrub = now; this._scrub(); } else this._scT = setTimeout(() => { if (this._drag) { this._lastScrub = Date.now(); this._scrub(); } }, 80);
  }
  // Forhåndsvisning under spoling: hent lav kvalitet for stedet og stil billedet, så snart det er der.
  _scrub() {
    if (this._live) return;
    const abs = this._t, k = Math.floor(abs / SEG);
    if ((k + 1) * SEG > Date.now() - READY_LAG) return;
    const e = this._ready(k);
    if (e) { if (this._cur?.v._e === e) { if (!this._cur.v.seeking) this._seekV(this._cur.v, abs); } else this._present(e, abs, false); return; }
    if (!this._cur) this._poster(abs);
    this._get(k, 'sd', true)?.p.then(x => { if (x && this._drag && Math.floor(this._t / SEG) === k) this._present(x, this._t, false); }, () => {});
  }
  async _poster(at) {
    const ev = this._events().find(x => Math.abs(x.s - at) < 20e3 || (at >= x.s && at <= x.s + x.d)); const im = this.q('.poster');
    if (!ev || !this._o.thumb) { im.classList.remove('on'); return; }
    const url = await this._o.thumb(ev.e); if (!url) return;
    im.src = url; if (!this._cur && !this._live) im.classList.add('on');
  }
  async _tip(ev, cx) {
    const tip = this.q('.tip'); if (!ev) { tip.classList.remove('on'); this._tipEv = null; return; }
    const W = this.q('.tlw').clientWidth; tip.style.left = `${Math.max(4, Math.min(W - 172, cx - 84))}px`;
    if (this._tipEv === ev) return; this._tipEv = ev;
    const T = (this._o.types || {})[ev.type] || ['Hændelse'];
    tip.querySelector('b').textContent = T[0]; tip.querySelector('small').textContent = `${hms(new Date(ev.s))} · ${ev.e.dur || ''}`;
    const im = tip.querySelector('img'); im.removeAttribute('src'); tip.classList.add('on');
    const url = await this._o.thumb?.(ev.e); if (url && this._tipEv === ev) im.src = url;
  }

  // ---- knapper og visning ---------------------------------------------------------------------------------------------
  _bind() {
    const tl = this.q('.tlw'), pts = new Map();
    tl.addEventListener('pointerdown', ev => {
      tl.setPointerCapture?.(ev.pointerId); pts.set(ev.pointerId, ev.clientX);
      if (pts.size === 1) this._dragStart(ev.clientX);
      else if (pts.size === 2) { const [a, b] = [...pts.values()]; this._pinch = { d: Math.max(10, Math.abs(a - b)), span: this._span }; }
    });
    tl.addEventListener('pointermove', ev => {
      if (!pts.has(ev.pointerId)) { if (ev.pointerType === 'mouse' && !this._drag) { const r = tl.getBoundingClientRect(), t = this._t + (ev.clientX - r.left - r.width / 2) / r.width * this._span; this._tip(this._hit(t, r.width), ev.clientX - r.left); } return; }
      pts.set(ev.pointerId, ev.clientX);
      if (pts.size >= 2 && this._pinch) { const [a, b] = [...pts.values()]; this._setSpan(this._pinch.span * this._pinch.d / Math.max(10, Math.abs(a - b))); this._moved = true; return; }
      this._dragMove(ev.clientX);
    });
    const up = ev => {
      if (!pts.has(ev.pointerId)) return; pts.delete(ev.pointerId);
      if (!pts.size) { const pinch = !!this._pinch; this._pinch = null; this._dragEnd(ev, pinch); }
      else if (pts.size === 1) this._dragStart([...pts.values()][0], true);
    };
    tl.addEventListener('pointerup', up); tl.addEventListener('pointercancel', up);
    tl.addEventListener('pointerleave', ev => { if (ev.pointerType === 'mouse') this._tip(null); });
    tl.addEventListener('wheel', ev => {
      ev.preventDefault();
      if (Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) { // vandret: spol
        if (!this._drag) { this._dragStart(0); this._moved = true; }
        this._dt0 = this._t = Math.min(Date.now(), this._t + ev.deltaX / tl.clientWidth * this._span); this._dx0 = 0;
        if (this._live && this._t < Date.now() - LIVE_LAG) this._exitLive();
        this._dirty = true; this._scrubSoon(); clearTimeout(this._wheelT); this._wheelT = setTimeout(() => this._dragEnd({}, false), 280);
      } else this._setSpan(this._span * Math.pow(1.0018, ev.deltaY)); // lodret: zoom
    }, { passive: false });

    const st = this.q('.stage');
    st.addEventListener('click', () => { if (!this._live) this._act('play'); });
    st.addEventListener('dblclick', () => this._act('full'));
    this._r.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', ev => { ev.stopPropagation(); this._act(b.dataset.a); }));
    const di = this.q('.date input');
    di.addEventListener('change', () => {
      if (!di.value) return; const [y, m, d] = di.value.split('-').map(Number), base = new Date(this._live ? Date.now() - 3600e3 : this._t);
      const t = new Date(y, m - 1, d, base.getHours(), base.getMinutes(), base.getSeconds()); this._seek(Math.min(+t, Date.now() - LIVE_LAG - 1000), false);
    });
    this.addEventListener('keydown', ev => {
      if (ev.target !== this || ev.altKey || ev.ctrlKey || ev.metaKey) return;
      const k = ev.key, step = ev.shiftKey ? 60e3 : 5e3;
      if (k === ' ' || k === 'k') this._act('play');
      else if (k === 'ArrowLeft') this._seek((this._live ? Date.now() - LIVE_LAG : this._t) - step, this._playing);
      else if (k === 'ArrowRight' && !this._live) this._seek(this._t + step, this._playing);
      else if (k === 'l' || k === 'L') this.goLive();
      else if (k === 'f' || k === 'F') this._act('full');
      else return;
      ev.preventDefault();
    });
    document.addEventListener('visibilitychange', () => {
      const v = this._cur?.v; if (!v || this._live) return;
      if (document.hidden && !v.paused) { this._resume = true; v.pause(); }
      else if (!document.hidden && this._resume) { this._resume = false; if (this._playing) this._play(v); }
    });
  }
  _act(a) {
    const now = Date.now(), evs = this._events();
    if (a === 'play') {
      if (this._live) { this._seek(now - LIVE_LAG - 8000, false); return; }
      if (this._playing) { this.pause(); return; }
      const v = this._cur?.v, e = v?._e;
      if (v && e?.t0 != null && !v.ended && this._t < (e.k + 1) * SEG - 60) { this._playing = true; this._ppBtn(); this._play(v); }
      else this._seek(this._t + (v?.ended ? 60 : 0), true);
    }
    else if (a === 'back') this._seek((this._live ? now - LIVE_LAG : this._t) - 10e3, true);
    else if (a === 'fwd' && !this._live) this._seek(this._t + 10e3, this._playing);
    else if (a === 'prev') { const ref = this._live ? now : this._t - 3000, ev = [...evs].reverse().find(x => x.s < ref); if (ev) this._seek(ev.s - 2000, true); }
    else if (a === 'next') { if (this._live) return; const ev = evs.find(x => x.s > this._t + 1000); if (ev) this._seek(ev.s - 2000, true); else this.goLive(); }
    else if (a === 'live') this.goLive();
    else if (a === 'speed') { this._rate = SPEEDS[(SPEEDS.indexOf(this._rate) + 1) % SPEEDS.length]; this._vids.forEach(v => { v.playbackRate = this._rate; }); this._labels(); }
    else if (a === 'quality') { const Q = ['auto', 'hd', 'sd']; this._quality = Q[(Q.indexOf(this._quality) + 1) % Q.length]; try { localStorage.setItem(QKEY, this._quality); } catch (e) { /* privat */ } this._hand = null; this._labels(); }
    else if (a === 'mute') { this._muted = !this._muted; this._vids.forEach(v => { v.muted = this._muted; }); const s = this.q('.live ha-camera-stream'); if (s) s.muted = this._muted; this._labels(); }
    else if (a === 'date') { const di = this.q('.date input'); const d = new Date(this._live ? Date.now() : this._t); di.max = new Date().toISOString().slice(0, 10); di.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; try { di.showPicker(); } catch (e) { di.focus(); di.click(); } }
    else if (a === 'zin') this._zoom(-1);
    else if (a === 'zout') this._zoom(1);
    else if (a === 'full') {
      if (document.fullscreenElement) document.exitFullscreen?.();
      else if (this.requestFullscreen) this.requestFullscreen().catch(() => this._cur?.v.webkitEnterFullscreen?.());
      else this._cur?.v.webkitEnterFullscreen?.();
    }
    this.focus({ preventScroll: true });
  }
  _labels() {
    const sp = this.q('.span'), s = this._span; sp.textContent = s >= 3600e3 ? `${s / 3600e3} t` : `${Math.round(s / 60e3)} min`;
    this.q('[data-a="speed"]').textContent = `${this._rate}×`; this.q('[data-a="speed"]').classList.toggle('on2', this._rate !== 1);
    this.q('[data-a="quality"]').textContent = { auto: 'Auto', hd: 'HD', sd: 'SD' }[this._quality];
    this.q('[data-a="mute"]').innerHTML = pi(this._muted ? 'mute' : 'sound', 17);
    this.q('[data-a="live"]').classList.toggle('on', this._live);
    this._ppBtn();
  }
  _ppBtn() { const b = this.q('[data-a="play"]'); const h = pi(this._playing && !this._live ? 'pause' : 'play'); if (b._h !== h) { b._h = h; b.innerHTML = h; } }
  _badge() { const q = this.q('.q'); q.classList.toggle('live', this._live); q.textContent = this._live ? 'LIVE' : this._cur?.v._e ? (this._cur.v._e.q === 'hd' ? 'HD' : 'SD') : ''; }
  _clock() {
    this._lastClock = Date.now(); const d = new Date(this._t), el = this.q('.clock');
    const txt = this._live ? `Live · ${hms(new Date())}` : `${d.toDateString() === new Date().toDateString() ? 'I dag' : d.toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short' })} · ${hms(d)}`;
    if (el.textContent !== txt) el.textContent = txt;
  }
  _spin(on) { clearTimeout(this._spT); this.q('.spin').classList.toggle('on', on); }
  _spinSoon() { clearTimeout(this._spT); this._spT = setTimeout(() => this.q('.spin').classList.add('on'), 150); }
  _msg(t) { const m = this.q('.msg'); m.textContent = t; m.classList.toggle('on', !!t); }
}
if (!customElements.get('th-protect-player')) customElements.define('th-protect-player', ThProtectPlayer);
