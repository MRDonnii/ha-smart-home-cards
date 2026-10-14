/* TH vejrkort – animeret himmel, nu-vejr, sol/måne, nowcast, målinger, time-for-time og DMI-detaljer
 * type: custom:th-weather-card
 * weather: weather.dmi_vejr   prefix: sensor.dmi_vejr_   padding: '0'
 * valgfrit: radar_image_entity, satellite_image_entity, radar_details[], detail_sections[], pollen[]
 */
const VWH_VER = '3.2.0';
const fmt = (v, d = 1) => (Number.isFinite(v) ? v : 0).toLocaleString('da-DK', { minimumFractionDigits: d, maximumFractionDigits: d });
const hhmm = d => `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DIR8 = ['N', 'NØ', 'Ø', 'SØ', 'S', 'SV', 'V', 'NV'];
const P = {
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  cloud: '<path d="M7 18.5h10.5a4 4 0 0 0 .6-8A6 6 0 0 0 6.5 11.6 3.5 3.5 0 0 0 7 18.5Z"/>',
  pcloud: '<path d="M9 4.5v1.3M4.2 6.6l1 1M2.8 11.5h1.4M13.8 6.6l-1 1"/><path d="M6.4 10.4A3.6 3.6 0 0 1 12.6 9"/><path d="M8.5 19.5h9a3.5 3.5 0 0 0 .5-7 5 5 0 0 0-9.4 1.6A2.8 2.8 0 0 0 8.5 19.5Z"/>',
  pmoon: '<path d="M12.5 9.2A4.2 4.2 0 0 1 7 4.3a4.6 4.6 0 1 0 5.5 4.9Z"/><path d="M8.5 19.5h9a3.5 3.5 0 0 0 .5-7 5 5 0 0 0-9.4 1.6A2.8 2.8 0 0 0 8.5 19.5Z"/>',
  rain: '<path d="M7 15h10.5a4 4 0 0 0 .6-8A6 6 0 0 0 6.5 8.1 3.5 3.5 0 0 0 7 15Z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
  snow: '<path d="M7 14h10.5a4 4 0 0 0 .6-8A6 6 0 0 0 6.5 7.1 3.5 3.5 0 0 0 7 14Z"/><path d="M8 18h.01M12 20h.01M16 18h.01M10 22h.01M14 22h.01"/>',
  bolt: '<path d="M7 14h10.5a4 4 0 0 0 .6-8A6 6 0 0 0 6.5 7.1 3.5 3.5 0 0 0 7 14Z"/><path d="m12.5 14-2 4h3l-2 4"/>',
  fog: '<path d="M4 9h16M3 13h18M5 17h14"/>', wind: '<path d="M3 9h11a3 3 0 1 0-3-3M3 13h15a3 3 0 1 1-3 3M3 17h7"/>',
  drop: '<path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5Z"/>', gauge: '<path d="M4 16a8 8 0 1 1 16 0"/><path d="m12 16 4-5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  dew: '<path d="M12 3.5s5 5.4 5 8.9a5 5 0 0 1-10 0c0-3.5 5-8.9 5-8.9Z"/><path d="M5 21h14"/>', uv: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  gust: '<path d="M3 8h9a2.5 2.5 0 1 0-2.5-2.5M3 12h14a3 3 0 1 1-3 3M3 16h6"/>', alert: '<path d="M12 3 2.5 20h19Z"/><path d="M12 10v4M12 17h.01"/>',
  flash: '<path d="M13 2 4 14h7l-1 8 9-12h-7Z"/>', arrow: '<path d="M12 4v16M6 10l6-6 6 6"/>', alert2: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5h.01"/>',
};
const ico = (k, s = 18, sw = 1.6) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="display:block;flex:none" aria-hidden="true">${P[k] || ''}</svg>`;
const CND = { 'clear-night': ['Klart', 'moon'], sunny: ['Sol', 'sun'], partlycloudy: ['Let skyet', 'pcloud'], cloudy: ['Overskyet', 'cloud'], rainy: ['Regn', 'rain'], pouring: ['Kraftig regn', 'rain'],
  snowy: ['Sne', 'snow'], 'snowy-rainy': ['Slud', 'snow'], fog: ['Tåge', 'fog'], lightning: ['Torden', 'bolt'], 'lightning-rainy': ['Torden og regn', 'bolt'], windy: ['Blæsende', 'wind'], 'windy-variant': ['Blæsende', 'wind'], hail: ['Hagl', 'snow'], exceptional: ['Usædvanligt', 'alert'] };
const cnd = (c, night) => { const r = CND[c] || [c || '–', 'cloud']; if (night && c === 'partlycloudy') return ['Let skyet', 'pmoon']; if (night && c === 'sunny') return ['Klart', 'moon']; return r; };
const BEAU = [[.3, 'Stille'], [1.6, 'Næsten stille'], [3.4, 'Svag vind'], [5.5, 'Let vind'], [8, 'Jævn vind'], [10.8, 'Frisk vind'], [13.9, 'Hård vind'], [17.2, 'Stiv kuling'], [20.8, 'Hård kuling'], [24.5, 'Stormende kuling'], [28.5, 'Storm'], [32.7, 'Stærk storm'], [1e9, 'Orkan']];
const beau = v => (BEAU.find(b => v < b[0]) || BEAU[12])[1];
const MOON = ['Nymåne', 'Tiltagende segl', 'Første kvarter', 'Tiltagende måne', 'Fuldmåne', 'Aftagende måne', 'Sidste kvarter', 'Aftagende segl'];
const moonPhase = (d = new Date()) => { const p = ((d - Date.UTC(2000, 0, 6, 18, 14)) / 864e5 / 29.530588853) % 1; return p < 0 ? p + 1 : p; };

/* store animerede ikoner (viewBox 64) */
const CLOUD = 'M18 50h29a11 11 0 0 0 1.6-21.9A15.5 15.5 0 0 0 19 26.5 11.8 11.8 0 0 0 18 50Z';
const bigIcon = (k, mp) => {
  const defs = `<defs><radialGradient id="bs" cx=".38" cy=".35"><stop offset="0" stop-color="#fff7de"/><stop offset=".55" stop-color="#f6d58f"/><stop offset="1" stop-color="#e2a84e"/></radialGradient>
    <linearGradient id="bc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f6fb"/><stop offset="1" stop-color="#aeb8cc"/></linearGradient>
    <linearGradient id="bd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa6bd"/><stop offset="1" stop-color="#5d6a82"/></linearGradient>
    <radialGradient id="bm" cx=".4" cy=".35"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#c9d2ec"/></radialGradient></defs>`;
  const sun = (x, y, r, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><circle r="${r + 10}" fill="#f6d58f" opacity=".16" class="pulse"/><g class="spin">${Array.from({ length: 12 }, (_, i) => `<path d="M0 ${-r - 5}v-6" stroke="#f6d58f" stroke-width="2.6" stroke-linecap="round" transform="rotate(${i * 30})" opacity="${i % 2 ? .55 : .95}"/>`).join('')}</g><circle r="${r}" fill="url(#bs)"/></g>`;
  const moon = (x, y, r) => { const p = mp ?? moonPhase(), k = Math.cos(2 * Math.PI * p), wax = p < .5, ex = Math.abs(k) * r;
    const lit = wax ? `M0 ${-r}A${r} ${r} 0 0 1 0 ${r}A${ex} ${r} 0 0 ${k > 0 ? 0 : 1} 0 ${-r}Z` : `M0 ${-r}A${r} ${r} 0 0 0 0 ${r}A${ex} ${r} 0 0 ${k > 0 ? 1 : 0} 0 ${-r}Z`;
    return `<g transform="translate(${x} ${y})"><circle r="${r + 9}" fill="#c9d2ec" opacity=".12" class="pulse"/><circle r="${r}" fill="#2a3150" stroke="rgba(220,228,255,.28)" stroke-width="1"/><path d="${lit}" fill="url(#bm)"/><circle cx="${-r * .3}" cy="${-r * .2}" r="${r * .14}" fill="#000" opacity=".06"/><circle cx="${r * .25}" cy="${r * .35}" r="${r * .1}" fill="#000" opacity=".06"/></g>`; };
  const cloud = (x, y, s, fill = 'url(#bc)', cls = 'drift') => `<g class="${cls}"><path d="${CLOUD}" transform="translate(${x} ${y}) scale(${s})" fill="${fill}"/></g>`;
  const drops = (col, snow) => [18, 30, 42].map((x, i) => snow ? `<circle cx="${x}" cy="54" r="2.2" fill="${col}" class="flake" style="animation-delay:${i * .45}s"/>` : `<path d="M${x} 52l-2.5 7" stroke="${col}" stroke-width="2.6" stroke-linecap="round" class="drop" style="animation-delay:${i * .3}s"/>`).join('');
  let b = '';
  if (k === 'sun') b = sun(32, 32, 13);
  else if (k === 'moon') b = moon(32, 32, 15) + `<path d="M52 14l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1Z" fill="#fff" class="twk"/><path d="M12 46l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7Z" fill="#fff" class="twk" style="animation-delay:1.2s"/>`;
  else if (k === 'pcloud') b = sun(24, 24, 10) + cloud(6, 10, .92);
  else if (k === 'pmoon') b = moon(24, 23, 11) + cloud(6, 10, .92);
  else if (k === 'cloud') b = cloud(-4, -6, .8, 'url(#bd)', 'drift2') + cloud(4, 6, .92);
  else if (k === 'rain') b = cloud(2, -4, .95, 'url(#bd)') + drops('#8ed1ff');
  else if (k === 'snow') b = cloud(2, -4, .95) + drops('#ffffff', 1);
  else if (k === 'bolt') b = cloud(2, -6, .95, 'url(#bd)') + `<path d="M34 40l-7 11h6l-3 9 10-13h-6l3-7Z" fill="#ffd27a" class="flash"/>`;
  else if (k === 'fog') b = cloud(2, -8, .9) + [44, 51, 58].map((y, i) => `<path d="M${10 + i * 3} ${y}h${40 - i * 6}" stroke="#c7cfdd" stroke-width="3" stroke-linecap="round" class="fogl" style="animation-delay:${i * .6}s"/>`).join('');
  else if (k === 'wind') b = [20, 32, 44].map((y, i) => `<path d="M8 ${y}h${34 - i * 6}a6 6 0 1 0-6-6" fill="none" stroke="#c7cfdd" stroke-width="3" stroke-linecap="round" class="gustl" style="animation-delay:${i * .4}s"/>`).join('');
  else b = cloud(4, 0, .92);
  return `<svg viewBox="0 0 64 64" class="bi" aria-hidden="true">${defs}${b}</svg>`;
};

const CSS = `
:host{display:block;--ink:#f4f1ea;--mut:rgba(244,241,234,.58);--faint:rgba(244,241,234,.32);--hair:rgba(244,241,234,.09);
  --gold:#e8c37e;--ice:#8ed1ff;--emer:#6be3a8;--coral:#ff9e7a;--red:#ff6b7d;--amber:#ffd27a;--vio:#b7a4ff;
  color:var(--ink);font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
*{box-sizing:border-box}button{font:inherit;color:inherit}
.c{position:relative;overflow:hidden;isolation:isolate;border-radius:26px;min-width:0;
  background:rgba(10,12,18,.82);box-shadow:0 30px 60px -40px #000,inset 0 1px 0 rgba(255,255,255,.07);animation:tin 1s cubic-bezier(.16,1,.3,1) both}
.c::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;z-index:5;
  background:linear-gradient(150deg,rgba(255,255,255,.22),rgba(255,255,255,.03) 30%,rgba(255,255,255,.02) 70%,rgba(142,209,255,.28));
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
@keyframes tin{from{opacity:0;transform:translateY(16px);filter:blur(6px)}}
/* himmel */
.sky{position:absolute;inset:0;z-index:-1;transition:background 2.5s;overflow:hidden}
.sky::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 35%,rgba(8,9,14,.55) 70%,rgba(8,9,14,.9))}
.glow{position:absolute;width:520px;height:520px;right:-120px;top:-260px;border-radius:50%;filter:blur(10px);animation:gl 14s ease-in-out infinite}
@keyframes gl{50%{transform:translate(-20px,14px) scale(1.06)}}
.st{position:absolute;width:2px;height:2px;border-radius:50%;background:#fff;animation:tw 3.4s ease-in-out infinite}@keyframes tw{50%{opacity:.15}}
.shoot{position:absolute;top:12%;left:70%;width:120px;height:1.5px;background:linear-gradient(90deg,#fff,transparent);opacity:0;transform:rotate(-24deg);animation:sh 11s 3s ease-in infinite}
@keyframes sh{0%,92%{opacity:0;transform:rotate(-24deg) translateX(0)}93%{opacity:1}100%{opacity:0;transform:rotate(-24deg) translateX(-420px)}}
.cl{position:absolute;opacity:.0;animation:cl linear infinite,fi 2s forwards}
.cl svg{display:block;width:100%;height:auto;filter:blur(9px)}
@keyframes cl{from{translate:-40% 0}to{translate:140vw 0}}
.rd{position:absolute;top:-30px;width:1.2px;height:22px;background:linear-gradient(transparent,rgba(170,205,255,.65));animation:rd linear infinite;rotate:12deg}
@keyframes rd{to{transform:translateY(760px)}}
.sf{position:absolute;top:-10px;width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.85);filter:blur(.4px);animation:sf linear infinite}
@keyframes sf{to{transform:translate(40px,760px)}}
.fogb{position:absolute;left:-20%;width:140%;height:70px;border-radius:50%;background:rgba(220,228,240,.07);filter:blur(16px);animation:fg 18s ease-in-out infinite alternate}
@keyframes fg{to{transform:translateX(12%)}}
.lt{position:absolute;inset:0;background:radial-gradient(70% 60% at 60% 10%,rgba(220,225,255,.5),transparent 60%);opacity:0;animation:lt 7s infinite}
@keyframes lt{0%,88%,94%,100%{opacity:0}89%,92%{opacity:1}90%{opacity:.2}}
/* top */
.top{display:flex;align-items:center;gap:10px;padding:18px 22px 0;font-size:10px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--mut)}
.top .loc{display:flex;align-items:center;gap:8px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.top .loc i{width:7px;height:7px;border-radius:50%;background:var(--emer);box-shadow:0 0 0 3px rgba(107,227,168,.18);animation:bl 2.4s infinite;flex:none}@keyframes bl{50%{opacity:.35}}
.top .r{margin-left:auto;display:flex;gap:6px;align-items:center}
.chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:99px;font-size:11px;font-weight:600;letter-spacing:0;text-transform:none;white-space:nowrap;color:var(--c,var(--emer));
  background:color-mix(in srgb,var(--c,var(--emer)) 13%,rgba(0,0,0,.25));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c,var(--emer)) 30%,transparent);backdrop-filter:blur(8px)}
.chip.pl i{width:6px;height:6px;border-radius:50%;background:currentColor;animation:bl 1.6s infinite}
/* nu */
.main{display:grid;grid-template-columns:minmax(0,1fr) 290px;gap:18px;padding:10px 22px 0;align-items:center}
.now{display:flex;align-items:center;gap:16px;min-width:0}
.bi{width:clamp(78px,9vw,112px);height:auto;flex:none;overflow:visible;filter:drop-shadow(0 12px 22px rgba(0,0,0,.45))}
.big{font-size:clamp(66px,8vw,104px);font-weight:200;letter-spacing:-.055em;line-height:.9}
.big sup{font-size:.42em;font-weight:300;vertical-align:.95em;margin-left:2px;color:var(--mut)}
.cd{font-size:19px;font-weight:500;letter-spacing:-.01em}
.meta{font-size:12.5px;color:var(--mut);margin-top:7px;display:flex;flex-wrap:wrap;gap:4px 14px}
.meta b{color:var(--ink);font-weight:500}
.hl{display:inline-flex;gap:8px}.hl .u{color:var(--coral)}.hl .d{color:var(--ice)}
.cast{display:flex;align-items:center;gap:10px;margin:14px 22px 0;padding:10px 14px;border-radius:15px;font-size:13px;
  background:linear-gradient(90deg,color-mix(in srgb,var(--c,var(--ice)) 14%,transparent),rgba(255,255,255,.02));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c,var(--ice)) 22%,transparent)}
.cast .ic{color:var(--c,var(--ice));flex:none}.cast b{font-weight:600}.cast small{margin-left:auto;color:var(--mut);font-size:11.5px;white-space:nowrap}
.cast .bar{display:flex;gap:2px;align-items:flex-end;height:18px;margin-left:auto;flex:none}.cast .bar i{width:4px;border-radius:2px;background:var(--ice);opacity:.85;transform-origin:bottom;animation:gr .8s cubic-bezier(.16,1,.3,1) both}
@keyframes gr{from{transform:scaleY(0)}}
/* sol/måne */
.cel{position:relative;padding:12px 14px 10px;border-radius:20px;background:rgba(0,0,0,.22);box-shadow:inset 0 0 0 1px var(--hair);backdrop-filter:blur(10px)}
.cel svg{display:block;width:100%;height:auto;overflow:visible}
.cel .row{display:flex;justify-content:space-between;font-size:11px;color:var(--mut);margin-top:2px}.cel .row b{display:block;color:var(--ink);font-size:13px;font-weight:500}
.cel .ttl{font-size:10px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--mut);display:flex;justify-content:space-between}
.cel .ttl span:last-child{letter-spacing:.02em;text-transform:none;color:var(--gold)}
.mn{display:grid;grid-template-columns:auto 1fr;gap:14px;align-items:center}.mn svg{width:72px}
.mn b{display:block;font-size:15px;font-weight:500}.mn small{display:block;font-size:11.5px;color:var(--mut);margin-top:3px}
/* målinger */
.tiles{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:8px;padding:14px 22px 0}
@media(max-width:1250px){.tiles{grid-template-columns:repeat(4,minmax(0,1fr))}}
.tl{position:relative;padding:11px 12px 12px;border-radius:17px;background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px var(--hair);min-width:0;overflow:hidden;
  animation:tin .8s cubic-bezier(.16,1,.3,1) both;transition:transform .35s cubic-bezier(.16,1,.3,1),background .35s}
.tl:hover{transform:translateY(-2px);background:rgba(255,255,255,.065)}
.tl .k{display:flex;align-items:center;gap:6px;font-size:9.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);white-space:nowrap}
.tl .k svg{color:var(--a,var(--gold))}
.tl .v{font-size:21px;font-weight:300;letter-spacing:-.03em;margin-top:8px;white-space:nowrap}.tl .v small{font-size:11px;font-weight:500;color:var(--mut);margin-left:3px;letter-spacing:0}
.tl .s{font-size:10.5px;color:var(--faint);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tl .vis{position:absolute;right:9px;top:26px;width:42px;height:42px}.tl.hv .v,.tl.hv .s{max-width:calc(100% - 48px)}
.tl .meter{height:4px;border-radius:4px;background:rgba(255,255,255,.08);margin-top:8px;position:relative;overflow:visible}
.tl .meter i{position:absolute;left:0;top:0;bottom:0;border-radius:4px;background:var(--a);width:var(--p,0%);transition:width 1.4s cubic-bezier(.16,1,.3,1)}
.tl .meter em{position:absolute;top:50%;left:var(--p,0%);width:9px;height:9px;border-radius:50%;background:#fff;transform:translate(-50%,-50%);box-shadow:0 0 0 2px #0c0e14,0 0 10px var(--a);transition:left 1.4s cubic-bezier(.16,1,.3,1)}
.tl .meter.uv{background:linear-gradient(90deg,#6be3a8,#ffd27a 30%,#ff9e7a 55%,#ff6b7d 75%,#b7a4ff)}
.ndl{transition:transform 1.6s cubic-bezier(.3,1.4,.5,1);transform-origin:22px 22px}
.ring{transition:stroke-dashoffset 1.6s cubic-bezier(.16,1,.3,1)}
/* time for time */
.hh{white-space:nowrap;display:flex;align-items:center;gap:10px;padding:18px 22px 6px;font-size:10px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--mut)}
.hh .sum{text-transform:none;letter-spacing:.01em;font-weight:500;font-size:11.5px;color:var(--faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tabs{margin-left:auto;display:inline-flex;gap:2px;padding:3px;border-radius:11px;background:rgba(0,0,0,.3);box-shadow:inset 0 0 0 1px var(--hair);flex:none}
.tabs button{appearance:none;border:0;cursor:pointer;padding:4px 11px;border-radius:8px;background:transparent;color:var(--mut);font-size:11px;font-weight:600;letter-spacing:0;transition:all .3s}
.tabs button.on{background:rgba(255,255,255,.11);color:var(--ink)}
.hs{position:relative;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;padding:0 22px 18px;-webkit-mask:linear-gradient(90deg,transparent,#000 22px,#000 calc(100% - 22px),transparent);mask:linear-gradient(90deg,transparent,#000 22px,#000 calc(100% - 22px),transparent)}
.hs::-webkit-scrollbar{display:none}
.hs .in{position:relative}
.hs svg{display:block;overflow:visible;touch-action:pan-x}
.hs text{font-family:inherit}
.tip{position:absolute;top:4px;z-index:4;pointer-events:none;width:150px;padding:10px 12px;border-radius:14px;font-size:11px;line-height:1.55;color:var(--mut);
  background:rgba(14,16,24,.92);box-shadow:0 16px 40px -10px #000,inset 0 0 0 1px rgba(255,255,255,.1);backdrop-filter:blur(10px);opacity:0;transition:opacity .2s,left .12s}
.tip.on{opacity:1}.tip b{color:var(--ink);font-weight:500}.tip .t{color:var(--gold);font-weight:600;font-size:11.5px;margin-bottom:3px;display:flex;justify-content:space-between}
.draw{stroke-dasharray:4000;stroke-dashoffset:4000;animation:drw 2.4s cubic-bezier(.65,0,.35,1) forwards}@keyframes drw{to{stroke-dashoffset:0}}
.fi{opacity:0;animation:fi 1.2s .5s forwards}@keyframes fi{to{opacity:1}}
.gbar{transform-box:fill-box;transform-origin:bottom;animation:gr .9s cubic-bezier(.16,1,.3,1) both}
.nowdot{animation:pd 2s ease-in-out infinite}@keyframes pd{50%{r:9;opacity:.15}}
/* ikon-animationer */
.spin{animation:spin 26s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.pulse{animation:pls 4s ease-in-out infinite;transform-box:fill-box;transform-origin:center}@keyframes pls{50%{transform:scale(1.18);opacity:.06}}
.drift{animation:dr 7s ease-in-out infinite}.drift2{animation:dr 9s ease-in-out infinite reverse}@keyframes dr{50%{transform:translateX(3px)}}
.drop{animation:dp 1.1s linear infinite}@keyframes dp{0%{transform:translateY(-6px);opacity:0}30%{opacity:1}100%{transform:translateY(8px);opacity:0}}
.flake{animation:fk 2.2s linear infinite}@keyframes fk{0%{transform:translate(0,-8px);opacity:0}30%{opacity:1}100%{transform:translate(3px,8px);opacity:0}}
.flash{animation:fl 3.2s infinite}@keyframes fl{0%,60%,70%,100%{opacity:1}64%,67%{opacity:.2}}
.twk{animation:tk 2.6s ease-in-out infinite;transform-box:fill-box;transform-origin:center}@keyframes tk{50%{transform:scale(.4);opacity:.3}}
.fogl{animation:fo 4s ease-in-out infinite alternate}@keyframes fo{to{transform:translateX(5px)}}
.gustl{stroke-dasharray:60;animation:gs 2.8s ease-in-out infinite}@keyframes gs{0%{stroke-dashoffset:60}60%,100%{stroke-dashoffset:0}}
@media(max-width:820px){.main{grid-template-columns:1fr}}
@media(max-width:600px){.top,.main,.hh{padding-left:16px;padding-right:16px}.cast{margin-left:16px;margin-right:16px}.tiles{grid-template-columns:repeat(2,minmax(0,1fr));padding:12px 16px 0;gap:8px}.hs{padding:0 16px 16px}
  .now{flex-wrap:wrap;gap:6px 14px}.now>div:last-child{flex-basis:100%}.cd{font-size:17px}.meta{margin-top:4px}.hh .sum{display:none}
  .cel{padding:10px 12px}.mn svg{width:52px!important}.mn small{display:inline;margin-right:8px}.cast small{display:none}.bi{width:80px}}
/* detaljer */
.c{border-left:calc(var(--dashboard-left-accent-width,0) * 4px) solid var(--dashboard-accent,var(--ice))}
.warns{display:grid;gap:6px;margin:14px 22px 0}
.wn{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:14px;font-size:12px;color:var(--mut);background:color-mix(in srgb,var(--c) 10%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 32%,transparent)}
.wn svg{color:var(--c);margin-top:1px}.wn b{display:block;color:var(--ink);font-size:13px;font-weight:600}
.dt{border-top:1px solid var(--hair);margin-top:4px;padding:14px 22px 20px;background:linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.05))}
.dtabs{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;padding:3px;border-radius:13px;background:rgba(0,0,0,.28);box-shadow:inset 0 0 0 1px var(--hair)}
.dtabs::-webkit-scrollbar{display:none}
.dtabs button{appearance:none;border:0;cursor:pointer;flex:none;display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:10px;background:transparent;color:var(--mut);font-size:11.5px;font-weight:600;white-space:nowrap;transition:all .3s}
.dtabs button ha-icon{--mdc-icon-size:15px}
.dtabs button.on{background:rgba(255,255,255,.1);color:var(--ink);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.dtabs button.on ha-icon{color:var(--dashboard-accent,var(--gold))}
.dbody{margin-top:12px;animation:tin .6s cubic-bezier(.16,1,.3,1) both}
.dsub{display:flex;align-items:center;gap:8px;font-size:10px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--mut);margin:0 0 10px}
.dsub span{margin-left:auto;letter-spacing:.02em;text-transform:none;font-weight:500;color:var(--faint)}
.dg{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.dc{position:relative;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.035);box-shadow:inset 0 0 0 1px var(--hair);min-width:0;animation:tin .6s cubic-bezier(.16,1,.3,1) both}
.dc .n{display:flex;align-items:center;gap:6px;font-size:10.5px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dc .n ha-icon{--mdc-icon-size:14px;color:var(--dashboard-accent,var(--gold));opacity:.85;flex:none}
.dc b{display:block;font-size:17px;font-weight:400;letter-spacing:-.02em;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dc b small{font-size:10.5px;color:var(--mut);margin-left:3px;font-weight:500}
.dc em{display:block;font-style:normal;font-size:10px;color:var(--faint);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dc .rb{height:4px;border-radius:4px;background:rgba(255,255,255,.07);margin-top:7px;overflow:hidden}.dc .rb i{display:block;height:100%;border-radius:4px;background:var(--c);transform-origin:left;animation:grx 1.1s cubic-bezier(.16,1,.3,1) both}
@keyframes grx{from{transform:scaleX(0)}}
.dc.hot{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 45%,transparent),0 0 24px -12px var(--c)}
.dt{container-type:inline-size}
.rad{display:grid;gap:12px}
.rimgs{display:grid;grid-template-columns:1fr;gap:12px}
.rimg[data-k]:not(.on){display:none}

/* "Nedbør og lyn lige nu" står til venstre for kortene så snart der er plads, ingen tom plads under (Claude AI, 2026-10-13) */
@container (min-width:760px){.rad{grid-template-columns:clamp(240px,26%,380px) minmax(0,1fr);align-items:stretch}.rad .rside{order:-1;display:flex;flex-direction:column}.rad .rside .dg{flex:1;grid-template-columns:repeat(2,minmax(0,1fr))!important;grid-auto-rows:1fr}.rad .rside .dc{display:flex;flex-direction:column;justify-content:center}}
@container (min-width:1200px){.rimgs{grid-template-columns:1fr 1fr}.rimg[data-k]:not(.on){display:block}.rimg .rtabs{display:none}}
.rimg{position:relative;aspect-ratio:4/3;width:100%;border-radius:16px;overflow:hidden;background:#05060a;box-shadow:inset 0 0 0 1px var(--hair);cursor:zoom-in}
.rimg img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:opacity .8s}
.rimg .sw{position:absolute;left:50%;top:50%;width:150%;aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;background:conic-gradient(from 0deg,rgba(142,209,255,.22),transparent 18%);animation:swp 6s linear infinite;pointer-events:none;mix-blend-mode:screen}
@keyframes swp{to{transform:translate(-50%,-50%) rotate(360deg)}}
.rimg .pin{position:absolute;left:50%;top:50%;width:11px;height:11px;border-radius:50%;background:var(--gold);transform:translate(-50%,-50%);box-shadow:0 0 0 4px rgba(232,195,126,.3)}
.rimg .pin::after{content:"";position:absolute;inset:-8px;border-radius:50%;border:1px solid var(--gold);animation:rng 2s ease-out infinite}@keyframes rng{from{opacity:1;transform:scale(.5)}to{opacity:0;transform:scale(2.2)}}
.rimg .rt{position:absolute;left:10px;bottom:10px;padding:4px 9px;border-radius:99px;font-size:10.5px;background:rgba(0,0,0,.55);backdrop-filter:blur(6px)}
.rimg .rtabs{position:absolute;right:10px;top:10px;margin:0}
.pl{display:grid;gap:6px}
.pr{display:grid;grid-template-columns:110px 1fr auto;gap:12px;align-items:center;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.035);box-shadow:inset 0 0 0 1px var(--hair);animation:tin .6s cubic-bezier(.16,1,.3,1) both}
.pr b{font-size:13px;font-weight:500}.pr small{display:block;font-size:10.5px;color:var(--mut)}
.pd{display:flex;gap:4px}.pd i{width:100%;max-width:34px;height:6px;border-radius:4px;background:rgba(255,255,255,.08)}.pd i.f{background:var(--c);box-shadow:0 0 8px -2px var(--c)}
.pf{display:flex;gap:10px;font-size:10.5px;color:var(--mut)}.pf span{display:flex;align-items:center;gap:4px}.pf i{width:7px;height:7px;border-radius:50%;background:var(--c)}
.full{position:fixed;inset:0;z-index:1000;background:rgba(3,4,8,.92);display:grid;place-items:center;backdrop-filter:blur(8px);animation:fi .25s both;opacity:1}
.full img{max-width:94vw;max-height:84vh;border-radius:18px;box-shadow:0 30px 80px #000}
.full button{position:absolute;top:max(16px,env(safe-area-inset-top));right:16px;width:42px;height:42px;border-radius:50%;border:0;background:rgba(255,255,255,.12);color:#fff;cursor:pointer;font-size:20px}
@media(max-width:600px){.dt{padding:12px 16px 16px}.warns{margin:12px 16px 0}.dg{grid-template-columns:repeat(2,minmax(0,1fr))}.pr{grid-template-columns:1fr auto}.pr .pd{grid-column:span 2;order:3}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

class ThWeatherCard extends HTMLElement {
  static getStubConfig() { return { weather: 'weather.dmi_vejr' }; }
  setConfig(c) { this.cfg = c || {}; this._hrs = this.cfg.hours === 48 ? 48 : 24; }
  getCardSize() { return 9; }
  get W() { return this.cfg.weather || 'weather.dmi_vejr'; }
  get PX() { return this.cfg.prefix || 'sensor.dmi_vejr_'; }
  set hass(h) {
    this._h = h;
    if (!this._r) this.build();
    const t = Date.now(); if (!this._t || t - this._t > 800) { this._t = t; this.update(); }
    else if (!this._q) this._q = setTimeout(() => { this._q = null; this._t = Date.now(); this.update(); }, 800);
    if (!this._unsub && h.connection && this.isConnected) this.subscribe();
  }
  s(e) { const x = this._h?.states[e]; return x && !['unknown', 'unavailable'].includes(x.state) ? x : null; }
  n(e) { const x = this.s(e), v = x ? parseFloat(x.state) : NaN; return Number.isFinite(v) ? v : NaN; }
  d(k) { return this.n(this.PX + k); }
  $(id) { return this._r.getElementById(id); }
  set(id, h) { const e = this.$(id); if (e && e._v !== h) { e.innerHTML = h; e._v = h; } }
  pick(...v) { return v.find(Number.isFinite) ?? NaN; }

  build() {
    this._r = this.attachShadow({ mode: 'open' });
    if (this.cfg.padding) this.style.padding = this.cfg.padding;
    const tile = (id, k, ic, a, vis = '', meter = '') => `<div class="tl${vis ? ' hv' : ''}" id="t-${id}" style="--a:${a};animation-delay:${180 + this._ti++ * 55}ms"><div class="k">${ico(ic, 13, 1.8)}${k}</div>${vis}<div class="v" id="v-${id}">–</div>${meter}<div class="s" id="s-${id}"></div></div>`;
    this._ti = 0;
    const ring = `<svg class="vis" viewBox="0 0 44 44"><circle cx="22" cy="22" r="17" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="4"/><circle id="hum-r" class="ring" cx="22" cy="22" r="17" fill="none" stroke="#8ed1ff" stroke-width="4" stroke-linecap="round" stroke-dasharray="106.8" stroke-dashoffset="106.8" transform="rotate(-90 22 22)"/></svg>`;
    const comp = `<svg class="vis" viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.12)"/>${[0, 90, 180, 270].map(a => `<path d="M22 4v4" stroke="rgba(255,255,255,.4)" stroke-width="1.4" transform="rotate(${a} 22 22)"/>`).join('')}
      <text x="22" y="13.5" text-anchor="middle" font-size="5.5" fill="rgba(255,255,255,.55)" font-weight="700">N</text><g id="w-ndl" class="ndl"><path d="M22 9l3.5 13h-7Z" fill="#e8c37e"/><path d="M22 35l3.5-13h-7Z" fill="rgba(255,255,255,.3)"/></g><circle cx="22" cy="22" r="2" fill="#0c0e14"/></svg>`;
    const baro = `<svg class="vis" viewBox="0 0 44 44"><path d="M7 30a15 15 0 1 1 30 0" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="4" stroke-linecap="round"/><path id="p-arc" class="ring" d="M7 30a15 15 0 1 1 30 0" fill="none" stroke="#b7a4ff" stroke-width="4" stroke-linecap="round" stroke-dasharray="47.1" stroke-dashoffset="47.1"/><g id="p-ndl" class="ndl" style="transform-origin:22px 30px"><path d="M22 30V17" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></g><circle cx="22" cy="30" r="2.4" fill="#fff"/></svg>`;
    const spark = `<svg class="vis" viewBox="0 0 44 44" id="rr-sp"></svg>`;
    this._r.innerHTML = `<style>${CSS}</style><div class="c" id="c"><div class="sky" id="sky"></div>
      <div class="top"><div class="loc"><i></i><span id="loc">Vejret nu</span></div><div class="r" id="chips"></div></div>
      <div class="main"><div class="now"><div id="bi"></div><div><div class="big" id="temp">–</div></div><div style="min-width:0"><div class="cd" id="cd">–</div><div class="meta" id="meta"></div></div></div>
        <div class="cel" id="cel"></div></div>
      <div class="cast" id="cast"></div>
      <div class="tiles">${tile('wind', 'Vind', 'wind', '#e8c37e', comp)}${tile('gust', 'Vindstød', 'gust', '#ff9e7a', '', '<div class="meter"><i></i></div>')}${tile('hum', 'Fugtighed', 'drop', '#8ed1ff', ring)}${tile('rain', 'Regnrisiko', 'rain', '#8ed1ff', spark)}
        ${tile('pres', 'Lufttryk', 'gauge', '#b7a4ff', baro)}${tile('dew', 'Dugpunkt', 'dew', '#6be3a8', '', '<div class="meter"><i></i></div>')}${tile('vis', 'Sigtbarhed', 'eye', '#6be3a8', '', '<div class="meter"><i></i></div>')}${tile('uv', 'UV‑indeks', 'uv', '#ffd27a', '', '<div class="meter uv"><em></em></div>')}</div>
      <div class="hh"><span>Time for time</span><span class="sum" id="hsum"></span><div class="tabs" id="tabs"><button data-h="24">24 t</button><button data-h="48">48 t</button></div></div>
      <div class="hs" id="hs"><div class="in" id="hin"><svg id="hsvg"></svg><div class="tip" id="tip"></div></div></div>
      <div class="warns" id="warns"></div><div class="dt" id="dt" hidden><div class="dtabs" id="dtabs"></div><div class="dbody" id="dbody"></div></div></div>`;
    this._r.querySelectorAll('#tabs button').forEach(b => { b.classList.toggle('on', +b.dataset.h === this._hrs); b.onclick = () => { this._hrs = +b.dataset.h; this._r.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b)); this._hk = null; this.hourly(); }; });
    const svg = this.$('hsvg'), tip = this.$('tip');
    svg.addEventListener('pointermove', e => this.scrub(e)); svg.addEventListener('pointerleave', () => { tip.classList.remove('on'); const h = this._r.getElementById('hl'); if (h) h.setAttribute('opacity', 0); });
    this._ro = new ResizeObserver(() => { const w = this.$('hs').clientWidth; if (Math.abs(w - (this._hw || 0)) > 20) { this._hw = w; this._hk = null; this.hourly(); } }); this._ro.observe(this.$('hs'));
    this._tick = setInterval(() => { this._ck = null; this.update(); }, 60e3);
    this._rtk = setInterval(() => { if (this._dtab === 'radar') { this._dk = null; this.details(true); } }, 5 * 60e3);
  }
  connectedCallback() { if (this._h && !this._unsub) this.subscribe(); if (this._r && !this._rtk) this._rtk = setInterval(() => { if (this._dtab === 'radar') { this._dk = null; this.details(true); } }, 5 * 60e3); }
  disconnectedCallback() { clearInterval(this._rtk); this._rtk = null; this._unsub?.forEach(u => Promise.resolve(u).then(f => typeof f === 'function' && f()).catch(() => {})); this._unsub = null; }
  subscribe() {
    if (!this._h?.connection) return; this._unsub = [];
    for (const type of ['hourly', 'daily']) {
      try { this._unsub.push(this._h.connection.subscribeMessage(m => { this['_' + type] = m.forecast || []; if (type === 'hourly') { this._hk = null; this.hourly(); } this._ck = null; this.update(); },
        { type: 'weather/subscribe_forecast', forecast_type: type, entity_id: this.W })); } catch (e) { /* ignorer */ }
    }
  }
  sunTimes() {
    const sun = this._h.states['sun.sun']; if (!sun) return null; const a = sun.attributes, now = Date.now();
    let rise = new Date(a.next_rising), set = new Date(a.next_setting); const night = sun.state === 'below_horizon';
    if (!night) rise = new Date(rise - 864e5);                    // dagens solopgang
    else if (set > rise) set = new Date(set - 864e5);              // før midnat: aftenens solnedgang
    const toM = d => d.getHours() * 60 + d.getMinutes();
    return { night, rise, set, riseM: toM(rise), setM: toM(set), nextRise: new Date(a.next_rising), nextSet: new Date(a.next_setting), elev: a.elevation, now };
  }

  update() {
    const w = this.s(this.W); if (!w || !this._r) return; const a = w.attributes, S = this.sunTimes(), night = S ? S.night : w.state === 'clear-night';
    const [txt, ic] = cnd(w.state, night);
    const temp = this.pick(this.d('temperatur'), a.temperature), feels = this.pick(a.apparent_temperature, temp);
    const ws = this.pick(this.d('vindhastighed'), (a.wind_speed ?? NaN) / 3.6), gust = this.pick(this.d('vindstod'), (a.wind_gust_speed ?? NaN) / 3.6);
    const wb = this.pick(this.d('vindretning'), a.wind_bearing, 0);
    const day0 = (this._daily || [])[0];
    const hi = this.pick(day0?.temperature, this.d('hojeste_temperatur_i_dag')), lo = this.pick(day0?.templow, this.d('laveste_temperatur_i_dag'));
    // top
    const st = this.s(this.PX + 'temperatur');
    this.set('loc', `Vejret nu${st?.attributes?.station ? ' · ' + st.attributes.station : ''}${st?.attributes?.målt ? ' · målt ' + hhmm(new Date(st.attributes.målt)) : ''}`);
    const nw = this.d('varsler'), lyn = this.d('lyn_sidste_30_min');
    this.set('chips', (nw > 0 ? `<span class="chip pl" style="--c:var(--coral)"><i></i>${nw} varsel${nw > 1 ? 'er' : ''}</span>` : '')
      + (lyn > 0 ? `<span class="chip pl" style="--c:var(--amber)">${ico('flash', 12, 2)}${fmt(lyn, 0)} lyn · 30 min</span>` : '')
      + (!nw && !(lyn > 0) ? `<span class="chip" style="--c:var(--emer)">Ingen varsler</span>` : ''));
    // ikon + temperatur (tæller op)
    const ik = ic + (ic === 'moon' || ic === 'pmoon' ? Math.round(moonPhase() * 28) : '');
    if (this._ik !== ik) { this._ik = ik; this.$('bi').innerHTML = bigIcon(ic); }
    if (Number.isFinite(temp) && temp !== this._tv) this.countTo(temp);
    this.set('cd', txt);
    this.set('meta', `<span>Føles som <b>${fmt(feels, 1)}°</b></span>${Number.isFinite(hi) ? `<span class="hl"><span>H <b class="u">${Math.round(hi)}°</b></span><span>L <b class="d">${Math.round(lo)}°</b></span></span>` : ''}
      ${Number.isFinite(ws) ? `<span>${beau(ws)} fra <b>${DIR8[Math.round(wb / 45) % 8]}</b></span>` : ''}`);
    this.sky(w.state, night, S);
    // sol / måne
    if (S && this._ck !== Math.floor(Date.now() / 6e4)) { this._ck = Math.floor(Date.now() / 6e4); this.celestial(S); }
    this.nowcast();
    this.tiles({ a, ws, gust, wb, temp });
    this.warnings();
    this.details();
  }
  countTo(v) {
    const el = this.$('temp'), from = Number.isFinite(this._tv) ? this._tv : v - 4, t0 = performance.now(); this._tv = v; cancelAnimationFrame(this._raf);
    const step = t => { const k = Math.min(1, (t - t0) / 1400), e = 1 - Math.pow(1 - k, 4), x = from + (v - from) * e;
      el.innerHTML = `${fmt(x, 1)}<sup>°</sup>`; if (k < 1) this._raf = requestAnimationFrame(step); };
    if (document.hidden) el.innerHTML = `${fmt(v, 1)}<sup>°</sup>`; else this._raf = requestAnimationFrame(step);
  }
  sky(state, night, S) {
    const el = this.$('sky'), elev = S?.elev ?? (night ? -20 : 30), phase = night ? (elev > -8 ? 'dusk' : 'night') : elev < 8 ? 'golden' : 'day';
    const wet = ['rainy', 'pouring', 'lightning', 'lightning-rainy', 'snowy', 'snowy-rainy', 'hail'].includes(state), grey = wet || ['cloudy', 'fog'].includes(state);
    const key = state + phase; if (el._k === key) return; el._k = key;
    const BG = {
      night: 'radial-gradient(120% 100% at 85% 0%,#1c2852 0%,#0d1430 40%,#080a14 75%)',
      dusk: 'radial-gradient(120% 100% at 85% 0%,#4a3a6a 0%,#22264a 40%,#0b0d18 78%)',
      golden: 'radial-gradient(120% 100% at 85% 0%,#8a6a46 0%,#3c3f5c 42%,#10131c 80%)',
      day: 'radial-gradient(120% 100% at 85% 0%,#4b78ad 0%,#22406a 42%,#0e1420 80%)' };
    let bg = BG[phase]; if (grey) bg = night ? 'radial-gradient(120% 100% at 85% 0%,#262d3e 0%,#141824 50%,#090b11 80%)' : 'radial-gradient(120% 100% at 85% 0%,#4a5568 0%,#262d3c 45%,#0e1118 80%)';
    el.style.background = bg;
    const R = Math.random; let h = '';
    const glow = night ? 'radial-gradient(circle,rgba(200,212,255,.22),transparent 60%)' : grey ? 'radial-gradient(circle,rgba(255,255,255,.08),transparent 60%)' : 'radial-gradient(circle,rgba(255,214,140,.38),rgba(232,195,126,.08) 40%,transparent 62%)';
    h += `<div class="glow" style="background:${glow}"></div>`;
    if (night && !grey) { for (let i = 0; i < 70; i++) h += `<i class="st" style="left:${R() * 100}%;top:${R() * 65}%;animation-delay:-${R() * 3.4}s;opacity:${.25 + R() * .75};${R() > .85 ? 'width:3px;height:3px;' : ''}"></i>`; h += `<i class="shoot"></i>`; }
    const nc = grey ? 7 : state === 'partlycloudy' ? 4 : 2;
    for (let i = 0; i < nc; i++) { const wd = 220 + R() * 260, op = grey ? .13 + R() * .1 : .06 + R() * .06;
      h += `<div class="cl" style="top:${-4 + R() * 46}%;width:${wd}px;animation-duration:${60 + R() * 70}s,2s;animation-delay:-${R() * 120}s,0s"><svg viewBox="0 0 64 30"><path d="M10 28h44a8 8 0 0 0 0-16 12 12 0 0 0-22-6A9 9 0 0 0 16 12a8 8 0 0 0-6 16Z" fill="rgba(235,240,250,${op})"/></svg></div>`; }
    if (['rainy', 'pouring', 'lightning-rainy', 'snowy-rainy'].includes(state)) { const nr = state === 'pouring' ? 120 : 70; for (let i = 0; i < nr; i++) h += `<i class="rd" style="left:${R() * 104 - 2}%;animation-duration:${.55 + R() * .45}s;animation-delay:-${R() * 1.2}s;opacity:${.4 + R() * .6}"></i>`; }
    if (['snowy', 'snowy-rainy', 'hail'].includes(state)) for (let i = 0; i < 60; i++) { const s = 2 + R() * 4; h += `<i class="sf" style="left:${R() * 100}%;width:${s}px;height:${s}px;animation-duration:${5 + R() * 6}s;animation-delay:-${R() * 10}s"></i>`; }
    if (state === 'fog') for (let i = 0; i < 4; i++) h += `<i class="fogb" style="top:${20 + i * 18}%;animation-delay:-${i * 4}s"></i>`;
    if (state.startsWith('lightning')) h += `<i class="lt"></i>`;
    el.innerHTML = h;
  }
  celestial(S) {
    const el = this.$('cel'), now = Date.now();
    const hdr = (a, b) => `<div class="ttl"><span>${a}</span><span>${b}</span></div>`;
    if (!S.night) {
      // dagbue
      const dayLen = (S.set - S.rise) / 6e4, k = Math.max(0, Math.min(1, (now - S.rise) / (S.set - S.rise))), pre = now < S.rise;
      const ang = Math.PI * (1 - k), cx = 130, cy = 92, rx = 110, ry = 74, sx = cx + rx * Math.cos(ang), sy = cy - ry * Math.sin(ang);
      const left = Math.max(0, (S.set - now) / 6e4);
      el.innerHTML = hdr('Solens bane', pre ? `op om ${Math.floor((S.rise - now) / 36e5)} t ${Math.round((S.rise - now) / 6e4) % 60} m` : `${Math.floor(left / 60)} t ${Math.round(left % 60)} m dagslys tilbage`)
        + `<svg viewBox="0 0 260 104"><defs><linearGradient id="sa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8c37e" stop-opacity=".35"/><stop offset="1" stop-color="#e8c37e" stop-opacity="0"/></linearGradient>
          <clipPath id="sc"><rect x="0" y="0" width="${sx}" height="104"/></clipPath><radialGradient id="sg"><stop offset="0" stop-color="#fff6dc"/><stop offset=".4" stop-color="#f6d58f"/><stop offset="1" stop-color="#f6d58f" stop-opacity="0"/></radialGradient></defs>
          <path d="M${cx - rx} ${cy}A${rx} ${ry} 0 0 1 ${cx + rx} ${cy}" fill="none" stroke="rgba(255,255,255,.16)" stroke-dasharray="2 5" stroke-linecap="round"/>
          <path d="M${cx - rx} ${cy}A${rx} ${ry} 0 0 1 ${cx + rx} ${cy}Z" fill="url(#sa)" clip-path="url(#sc)" class="fi"/>
          <path d="M${cx - rx} ${cy}A${rx} ${ry} 0 0 1 ${cx + rx} ${cy}" fill="none" stroke="#e8c37e" stroke-width="2" clip-path="url(#sc)" class="draw"/>
          <line x1="6" y1="${cy}" x2="254" y2="${cy}" stroke="rgba(255,255,255,.14)"/>
          <circle cx="${sx}" cy="${sy}" r="20" fill="url(#sg)" opacity=".55" class="pulse"/><circle cx="${sx}" cy="${sy}" r="7" fill="#fff3d0"/></svg>`
        + `<div class="row"><span>Sol op<b>${hhmm(S.rise)}</b></span><span style="text-align:center">Dagslys<b>${Math.floor(dayLen / 60)} t ${Math.round(dayLen % 60)} m</b></span><span style="text-align:right">Sol ned<b>${hhmm(S.set)}</b></span></div>`;
    } else {
      const p = moonPhase(), idx = Math.round(p * 8) % 8, ill = Math.round((1 - Math.cos(2 * Math.PI * p)) / 2 * 100), tl = (S.nextRise - now) / 6e4;
      const nf = ((.5 - p + 1) % 1) * 29.53;
      el.innerHTML = hdr('Natten', `sol op ${hhmm(S.nextRise)}`) + `<div class="mn" style="margin-top:8px">${bigIcon('moon', p).replace('class="bi"', 'class="bi" style="width:72px"')}<div><b>${MOON[idx]}</b><small>${ill} % oplyst</small>
        <small>${nf < 1 ? 'Fuldmåne i nat' : `Fuldmåne om ${Math.round(nf)} dage`}</small><small>Lyst om ${Math.floor(tl / 60)} t ${Math.round(tl % 60)} m</small></div></div>`;
    }
  }
  nowcast() {
    const fc = (this._hourly || []).filter(f => new Date(f.datetime) >= Date.now() - 36e5).slice(0, 12); const el = this.$('cast');
    const rnow = this.d('nedbor_lige_nu'), raining = rnow > .05 || this._h.states['binary_sensor.dmi_vejr_regner_nu']?.state === 'on' || (fc[0]?.precipitation || 0) >= .2;
    const near = this.d('afstand_til_naermeste_regn'), H = f => String(new Date(f.datetime).getHours()).padStart(2, '0');
    const bars = fc.length ? `<span class="bar">${fc.map((f, i) => `<i style="height:${Math.max(2, Math.min(18, (f.precipitation || 0) * 7 + (f.precipitation_probability || 0) / 25))}px;opacity:${.25 + (f.precipitation_probability || 0) / 140};animation-delay:${i * 40}ms"></i>`).join('')}</span>` : '';
    let c = 'var(--emer)', i = 'sun', t;
    if (!fc.length) t = '<b>Henter prognose…</b>';
    else if (raining) { const j = fc.findIndex((f, k) => k > 0 && (f.precipitation || 0) < .1); c = 'var(--ice)'; i = 'rain';
      t = `<b>Det regner nu${rnow > 0 ? ` · ${fmt(rnow, 1)} mm/t` : ''}</b>&nbsp;${j > 0 ? `– ophold fra ca. kl. ${H(fc[j])}` : '– fortsætter de næste timer'}`; }
    else { const j = fc.findIndex(f => (f.precipitation || 0) >= .2 || (f.precipitation_probability || 0) >= 60);
      if (j >= 0) { const mm = fc.slice(j, j + 4).reduce((s, f) => s + (f.precipitation || 0), 0); c = 'var(--ice)'; i = 'drop';
        t = `<b>Regn fra ca. kl. ${H(fc[j])}</b>&nbsp;– omkring ${fmt(mm, 1)} mm de første timer`; }
      else { const fr = fc.find(f => f.temperature <= 0); t = `<b>Tørvejr de næste 12 timer</b>${fr ? `&nbsp;– frost fra ca. kl. ${H(fr)}` : ''}`; if (fr) { c = 'var(--ice)'; i = 'snow'; } } }
    const sub = Number.isFinite(near) && !raining ? `<small>nærmeste byge ${fmt(near, 0)} km</small>` : '';
    el.style.setProperty('--c', c);
    this.set('cast', `<span class="ic">${ico(i, 17, 1.8)}</span><span>${t}</span>${sub || bars}`);
  }
  tiles({ a, ws, gust, wb, temp }) {
    const tx = (id, v, s) => { this.set('v-' + id, v); this.set('s-' + id, s); };
    const hum = this.pick(this.d('luftfugtighed'), a.humidity), pres = this.pick(this.d('lufttryk'), a.pressure), dew = this.pick(this.d('dugpunkt'), a.dew_point);
    const vis = this.pick(this.d('sigtbarhed'), a.visibility), uv = this.pick(a.uv_index, 0), gmax = this.d('kraftigste_vindstod_i_dag');
    // vind
    tx('wind', `${fmt(ws, 1)}<small>m/s</small>`, `fra ${DIR8[Math.round(wb / 45) % 8]} · ${beau(ws).toLowerCase()}`);
    const nd = this.$('w-ndl'); if (nd) nd.style.transform = `rotate(${wb + 180}deg)`;
    // vindstød
    tx('gust', `${fmt(gust, 1)}<small>m/s</small>`, Number.isFinite(gmax) ? `kraftigste i dag ${fmt(gmax, 1)}` : beau(gust).toLowerCase());
    this.$('t-gust').style.setProperty('--p', Math.min(100, gust / Math.max(15, gmax || 0) * 100) + '%');
    // fugt
    tx('hum', `${fmt(hum, 0)}<small>%</small>`, hum > 90 ? 'meget fugtigt' : hum > 70 ? 'fugtigt' : hum < 35 ? 'tørt' : 'behageligt');
    const hr = this.$('hum-r'); if (hr) hr.style.strokeDashoffset = 106.8 * (1 - Math.min(1, hum / 100));
    // regnrisiko næste 24 t
    const fc = (this._hourly || []).filter(f => new Date(f.datetime) >= Date.now() - 36e5).slice(0, 24);
    if (fc.length) { const mx = Math.max(...fc.map(f => f.precipitation_probability || 0)), mm = fc.reduce((s, f) => s + (f.precipitation || 0), 0);
      tx('rain', `${Math.round(mx)}<small>%</small>`, mm > 0 ? `${fmt(mm, 1)} mm næste døgn` : 'tørt næste døgn');
      const k = fc.map(f => f.precipitation_probability || 0).join(); const sp = this.$('rr-sp');
      if (sp && sp._k !== k) { sp._k = k; const pts = fc.map((f, i) => `${i / (fc.length - 1) * 44},${34 - (f.precipitation_probability || 0) / 100 * 22}`).join(' ');
        sp.innerHTML = `<polygon points="0,34 ${pts} 44,34" fill="rgba(142,209,255,.18)" class="fi"/><polyline points="${pts}" fill="none" stroke="#8ed1ff" stroke-width="1.4" stroke-linejoin="round" class="draw"/>`; } }
    // tryk
    const tr = this._ptr; tx('pres', `${fmt(pres, 0)}<small>hPa</small>`, Number.isFinite(tr) ? `${tr > .5 ? '↗ stigende' : tr < -.5 ? '↘ faldende' : '→ stabilt'} ${tr > 0 ? '+' : ''}${fmt(tr, 1)} / 3 t` : pres > 1020 ? 'højtryk' : pres < 1000 ? 'lavtryk' : 'normalt');
    const pk = Math.max(0, Math.min(1, (pres - 970) / 80)); const pa = this.$('p-arc'); if (pa) pa.style.strokeDashoffset = 47.1 * (1 - pk);
    const pn = this.$('p-ndl'); if (pn) pn.style.transform = `rotate(${-90 + pk * 180}deg)`;
    this.pressureTrend();
    // dugpunkt
    const spr = temp - dew; tx('dew', `${fmt(dew, 1)}<small>°</small>`, Number.isFinite(spr) ? `${fmt(spr, 1)}° spredning · ${spr < 1.5 ? 'tåge/dug mulig' : spr < 4 ? 'fugtig luft' : 'tør luft'}` : '');
    this.$('t-dew').style.setProperty('--p', Math.max(4, 100 - Math.min(100, spr / 12 * 100)) + '%');
    // sigt
    tx('vis', `${fmt(vis, vis < 10 ? 1 : 0)}<small>km</small>`, vis >= 20 ? 'fremragende' : vis >= 10 ? 'god' : vis >= 4 ? 'moderat' : vis >= 1 ? 'dårlig' : 'tåge');
    this.$('t-vis').style.setProperty('--p', Math.min(100, vis / 50 * 100) + '%');
    // uv
    const fuv = Math.max(uv, ...(fc.map(f => f.uv_index || 0)));
    tx('uv', `${fmt(uv, 1)}`, `${uv < 3 ? 'lav' : uv < 6 ? 'moderat' : uv < 8 ? 'høj' : 'meget høj'}${fuv > uv + .4 ? ` · op til ${fmt(fuv, 1)}` : ''}`);
    this.$('t-uv').style.setProperty('--p', Math.min(100, uv / 11 * 100) + '%');
  }
  /* ---------- varsler og detaljer ---------- */
  warnings() {
    const v = this.s(this.PX + 'varsler'), list = (v?.attributes?.varsler || []).filter(Boolean);
    const lvl = n => n >= 3 ? 'var(--red)' : n >= 2 ? 'var(--coral)' : 'var(--amber)';
    this.set('warns', list.slice(0, 4).map(w => { const t = typeof w === 'string' ? w : (w.headline || w.title || w.event || w.overskrift || w.type || 'Varsel');
      const d = typeof w === 'string' ? '' : (w.description || w.beskrivelse || ''), n = Number(w.level ?? w.niveau ?? w.severity_level ?? 1) || 1;
      const til = w.expires || w.ends || w.slut || w.til; return `<div class="wn" style="--c:${lvl(n)}">${ico('alert', 17, 1.8)}<div><b>${esc(t)}</b>${esc(String(d).slice(0, 180))}${til ? ` · til ${hhmm(new Date(til))}` : ''}</div></div>`; }).join(''));
  }
  dTabs() {
    const c = this.cfg, t = [];
    if (c.radar_image_entity || c.satellite_image_entity) t.push({ id: 'radar', label: 'Radar', icon: 'mdi:radar' });
    (c.detail_sections || []).forEach((sec, i) => t.push({ id: 's' + i, label: String(sec.title || 'Data').split(' · ')[0], icon: sec.icon || 'mdi:information-outline', sec }));
    if ((c.pollen || []).length) t.push({ id: 'pollen', label: 'Pollen', icon: 'mdi:flower-pollen' });
    return t;
  }
  details(force) {
    const tabs = this.dTabs(), dt = this.$('dt'); if (!tabs.length) return; dt.hidden = false;
    if (!tabs.find(t => t.id === this._dtab)) { try { this._dtab = localStorage.getItem('th-weather-tab'); } catch (e) {} if (!tabs.find(t => t.id === this._dtab)) this._dtab = tabs[0].id; }
    const tk = tabs.map(t => t.id).join() + this._dtab;
    if (this._dtk !== tk) { this._dtk = tk; this._dk = null;
      this.$('dtabs').innerHTML = tabs.map(t => `<button data-t="${t.id}" class="${t.id === this._dtab ? 'on' : ''}"><ha-icon icon="${t.icon}"></ha-icon>${esc(t.label)}</button>`).join('');
      this.$('dtabs').querySelectorAll('button').forEach(b => b.onclick = () => { this._dtab = b.dataset.t; try { localStorage.setItem('th-weather-tab', this._dtab); } catch (e) {} this._dtk = null; this.details(); }); }
    const tab = tabs.find(t => t.id === this._dtab), body = this.$('dbody');
    let html, key;
    if (tab.id === 'radar') { key = 'radar' + (force ? Date.now() : ''); if (this._dk && this._dk.startsWith('radar') && !force) { this.radarCells(); return; } }
    else { const ents = tab.id === 'pollen' ? this.cfg.pollen.map(p => p.entity) : tab.sec.items.map(i => i.entity);
      key = tab.id + ents.map(e => this._h.states[e]?.state).join('|'); }
    if (key === this._dk) return; const fresh = this._dlast !== tab.id; this._dlast = tab.id; this._dk = key;
    if (tab.id === 'radar') html = this.dRadar(); else if (tab.id === 'pollen') html = this.dPollen(); else html = this.dSection(tab.sec);
    body.innerHTML = html; if (fresh) { body.style.animation = 'none'; void body.offsetWidth; body.style.animation = ''; }
    if (tab.id === 'radar') this.wireRadar();
  }
  val(e) {
    const st = this._h.states[e]; if (!st || ['unknown', 'unavailable'].includes(st.state)) return null; const a = st.attributes, u = a.unit_of_measurement || '';
    if (a.device_class === 'timestamp') { const d = new Date(st.state), diff = (d - Date.now()) / 6e4, day = d.toDateString() === new Date().toDateString();
      return { v: `${day ? '' : d.toLocaleDateString('da-DK', { weekday: 'short' }) + ' '}${hhmm(d)}`, u: '', sub: Math.abs(diff) < 1440 ? (diff >= 0 ? `om ${diff < 60 ? Math.round(diff) + ' min' : Math.floor(diff / 60) + ' t ' + Math.round(diff % 60) + ' m'}` : `${-diff < 60 ? Math.round(-diff) + ' min' : Math.floor(-diff / 60) + ' t'} siden`) : '', a }; }
    const n = parseFloat(st.state);
    if (Number.isFinite(n) && String(+st.state) === String(n)) { const d = Math.abs(n) >= 100 || Number.isInteger(n) && !/°|mm|m\/s/.test(u) ? 0 : 1; return { v: fmt(n, d), n, u, a }; }
    return { v: esc(st.state), u: '', a };
  }
  riskCol(p) { return p < 10 ? 'var(--emer)' : p < 30 ? 'var(--amber)' : p < 60 ? 'var(--coral)' : 'var(--red)'; }
  dSection(sec) {
    const risk = /risiko/i.test(sec.title || '');
    let items = sec.items.map(it => ({ it, x: this.val(it.entity) })).filter(o => o.x);
    if (risk) items.sort((p, q) => (q.x.n ?? -1) - (p.x.n ?? -1));
    if (!items.length) return `<div class="dsub">${esc(sec.title)}</div><div class="dc" style="text-align:center;color:var(--mut)">Ingen data lige nu</div>`;
    const src = items.find(o => o.x.a.station || o.x.a.kilde)?.x.a;
    return `<div class="dsub">${esc(sec.title)}<span>${esc(src?.station ? src.station + (src.afstand_km ? ` · ${fmt(src.afstand_km, 0)} km` : '') : src?.kilde || '')}</span></div><div class="dg">${items.map(({ it, x }, i) => {
      const a = x.a, isR = (risk || x.u === '%' && /risiko/i.test(it.name)) && Number.isFinite(x.n), c = isR ? this.riskCol(x.n) : '';
      const extra = isR && a.tidspunkt && x.n >= 5 ? `mest sandsynligt kl. ${hhmm(new Date(a.tidspunkt))}` : a.niveau_cm != null ? `${fmt(a.niveau_cm, 0)} cm` : a.hændelse ? esc(a.hændelse) : x.sub || (a.i_går != null ? `i går ${fmt(+a.i_går, 1)}` : '');
      return `<div class="dc ${isR && x.n >= 30 ? 'hot' : ''}" style="animation-delay:${Math.min(i * 30, 600)}ms;${c ? '--c:' + c : ''}"><div class="n"><ha-icon icon="${esc(it.icon || a.icon || 'mdi:information-outline')}"></ha-icon>${esc(it.name)}</div>
        <b${c ? ` style="color:${c}"` : ''}>${x.v}${x.u ? `<small>${esc(x.u)}</small>` : ''}</b>${isR ? `<div class="rb"><i style="width:${Math.max(2, Math.min(100, x.n))}%"></i></div>` : ''}${extra ? `<em>${extra}</em>` : ''}</div>`; }).join('')}</div>`;
  }
  dRadar() {
    const c = this.cfg; if (!this._rad) this._rad = c.radar_image_entity ? 'radar' : 'sat';
    const both = c.radar_image_entity && c.satellite_image_entity, ks = [c.radar_image_entity && 'radar', c.satellite_image_entity && 'sat'].filter(Boolean);
    const tabs = both ? `<div class="tabs rtabs"><button data-r="radar" class="${this._rad === 'radar' ? 'on' : ''}">Radar</button><button data-r="sat" class="${this._rad === 'sat' ? 'on' : ''}">Satellit</button></div>` : '';
    return `<div class="rad"><div class="rimgs">${ks.map(k => `<div class="rimg ${k === this._rad ? 'on' : ''}" data-k="${k}"><img alt=""><i class="sw"></i><i class="pin"></i><span class="rt"></span>${tabs}</div>`).join('')}</div>
      <div class="rside"><div class="dsub">Nedbør og lyn lige nu</div><div class="dg" id="rcells" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))"></div></div></div>`;
  }
  wireRadar() {
    const c = this.cfg;
    this._r.querySelectorAll('.rimg[data-k]').forEach(box => { const k = box.dataset.k, e = k === 'sat' ? c.satellite_image_entity : c.radar_image_entity, st = this._h.states[e], img = box.querySelector('img');
      if (st?.attributes?.entity_picture) { const n = new Image(); n.onload = () => { img.style.opacity = 0; setTimeout(() => { img.src = n.src; img.style.opacity = 1; }, 120); };
        n.src = st.attributes.entity_picture + (st.attributes.entity_picture.includes('?') ? '&' : '?') + 't=' + Math.floor(Date.now() / 3e5);
        const ts = new Date(st.state); box.querySelector('.rt').textContent = `${k === 'sat' ? 'Satellit' : 'Radar'} · ${isNaN(ts) ? '' : hhmm(ts)} · DMI`; }
      box.onclick = ev => { if (ev.target.closest('.rtabs')) return; const d = document.createElement('div'); d.className = 'full'; d.innerHTML = `<button aria-label="Luk">×</button><img src="${img.src}">`; d.onclick = () => d.remove(); this._r.appendChild(d); }; });
    this._r.querySelectorAll('.rtabs button').forEach(b => b.onclick = ev => { ev.stopPropagation(); this._rad = b.dataset.r;
      this._r.querySelectorAll('.rimg[data-k]').forEach(x => x.classList.toggle('on', x.dataset.k === this._rad)); this._r.querySelectorAll('.rtabs button').forEach(x => x.classList.toggle('on', x.dataset.r === this._rad)); });
    this.radarCells();
  }
  radarCells() {
    const items = [...(this.cfg.radar_details || []), { name: 'Nærmeste lyn', entity: this.PX + 'lyn_naermeste_afstand', icon: 'mdi:flash-alert' }, { name: 'Målt sidste time', entity: this.PX + 'nedbor_malt_sidste_time', icon: 'mdi:cup-water' }, { name: 'Nedbør i dag', entity: this.PX + 'nedbor_i_dag', icon: 'mdi:weather-rainy' }]
      .filter((it, i, arr) => arr.findIndex(x => x.entity === it.entity) === i);
    this.set('rcells', items.map((it, i) => { const x = this.val(it.entity); const near = /naermeste_regn/.test(it.entity);
      return `<div class="dc" style="animation-delay:${i * 40}ms"><div class="n"><ha-icon icon="${esc(it.icon || 'mdi:information-outline')}"></ha-icon>${esc(it.name)}</div><b>${x ? `${x.v}${x.u ? `<small>${esc(x.u)}</small>` : ''}` : near ? '<small style="margin:0">ingen inden for 30 km</small>' : '–'}</b></div>`; }).join(''));
  }
  dPollen() {
    const DA = { 'no data': 'Ingen data', none: 'Ingen', 'very low': 'Meget lav', low: 'Lav', moderate: 'Moderat', high: 'Høj', 'very high': 'Meget høj' };
    const col = n => n <= 0 ? 'rgba(255,255,255,.25)' : n <= 1 ? 'var(--emer)' : n <= 2 ? '#b8e07a' : n <= 3 ? 'var(--amber)' : n <= 4 ? 'var(--coral)' : 'var(--red)';
    const rows = this.cfg.pollen.map(p => ({ p, st: this._h.states[p.entity] })).filter(o => o.st);
    rows.sort((x, y) => (+y.st.attributes.index_value || 0) - (+x.st.attributes.index_value || 0));
    return `<div class="dsub">Pollen · Google<span>i dag og de næste dage</span></div><div class="pl">${rows.map(({ p, st }, i) => { const a = st.attributes, n = +a.index_value || 0, c = col(n);
      const fut = [['I morgen', a.tomorrow], ['Dag 3', a['day 3']], ['Dag 4', a['day 4']]].filter(f => f[1] != null);
      return `<div class="pr" style="--c:${c};animation-delay:${i * 50}ms"><div><b>${esc(p.name)}</b><small>${DA[String(st.state).toLowerCase()] || esc(st.state)}${a.in_season === 'True' || a.in_season === true ? ' · i sæson' : ''}</small></div>
        <div class="pd">${[1, 2, 3, 4, 5].map(k => `<i class="${k <= n ? 'f' : ''}"></i>`).join('')}</div><div class="pf">${fut.map(([l, v]) => `<span style="--c:${col(+v)}"><i></i>${l}</span>`).join('')}</div></div>`; }).join('') || '<div class="dc">Ingen pollendata</div>'}</div>`;
  }

  async pressureTrend() {
    if (!this._h.callWS || (this._pt && Date.now() - this._pt < 10 * 60e3)) return; this._pt = Date.now();
    const e = this.PX + 'lufttryk'; if (!this.s(e)) return;
    try { const r = await this._h.callWS({ type: 'history/history_during_period', start_time: new Date(Date.now() - 3 * 36e5).toISOString(), entity_ids: [e], minimal_response: true, no_attributes: true });
      const arr = (r[e] || []).map(x => parseFloat(x.s ?? x.state)).filter(Number.isFinite); if (arr.length) { this._ptr = this.n(e) - arr[0]; this.set('s-pres', ''); this.update(); } } catch (er) { /* ingen historik */ }
  }

  hourly() {
    if (!this._r) return; const fc = (this._hourly || []).filter(f => new Date(f.datetime) >= Date.now() - 36e5).slice(0, this._hrs); if (fc.length < 2) return;
    const n = fc.length, avail = (this.$('hs').clientWidth || 900) - 44, cw = Math.max(this._hrs > 24 ? 40 : 46, avail / n), W = n * cw, H = 196;
    const k = n + '|' + Math.round(cw) + fc.map(f => f.temperature + f.condition + (f.precipitation || 0)).join(); if (k === this._hk) return; this._hk = k; this._fc = fc; this._cw = cw;
    const S = this.sunTimes(), T = fc.map(f => f.temperature), mx = Math.max(...T), mn = Math.min(...T), rg = Math.max(4, mx - mn);
    const mid = (mx + mn) / 2, X = i => (i + .5) * cw, Y = v => 99 - (v - mid) / rg * 46;
    const isNight = d => { if (!S) return d.getHours() < 7 || d.getHours() >= 19; const m = d.getHours() * 60 + d.getMinutes() + 30; return m < S.riseM || m >= S.setM; };
    const pts = fc.map((f, i) => [X(i), Y(f.temperature)]);
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < n - 1; i++) { const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += `C${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]} ${p2[1]}`; }
    const tc = t => t <= 0 ? '#8ed1ff' : t < 8 ? '#9fd8c4' : t < 16 ? '#e8c37e' : t < 24 ? '#ffb27a' : '#ff8a7a';
    let g = `<defs><linearGradient id="tl" x1="0" y1="0" x2="${W}" y2="0" gradientUnits="userSpaceOnUse">${fc.map((f, i) => `<stop offset="${(X(i) / W).toFixed(4)}" stop-color="${tc(f.temperature)}"/>`).join('')}</linearGradient>
      <linearGradient id="ta" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8c37e" stop-opacity=".2"/><stop offset="1" stop-color="#e8c37e" stop-opacity="0"/></linearGradient>
      <linearGradient id="pb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9e3ff"/><stop offset="1" stop-color="#4f9fe0"/></linearGradient></defs>`;
    // nat-bånd
    let run = -1; const bands = [];
    fc.forEach((f, i) => { const nt = isNight(new Date(f.datetime)); if (nt && run < 0) run = i; if ((!nt || i === n - 1) && run >= 0) { bands.push([run, nt ? i : i - 1]); run = -1; } });
    bands.forEach(([a, b]) => g += `<rect x="${a * cw}" y="0" width="${(b - a + 1) * cw}" height="${H}" rx="12" fill="rgba(110,130,220,.09)" class="fi"/>`);
    // døgnskifte
    fc.forEach((f, i) => { const dt = new Date(f.datetime); if (i && dt.getHours() === 0) g += `<line x1="${i * cw}" y1="2" x2="${i * cw}" y2="${H - 4}" stroke="rgba(232,195,126,.25)" stroke-dasharray="2 4"/>`; });
    // sol op/ned
    if (S) { const t0 = new Date(fc[0].datetime).getTime();
      for (let dd = -1; dd <= 2; dd++) for (const [m, lbl, col] of [[S.riseM, 'op', '#ffd27a'], [S.setM, 'ned', '#ff9e7a']]) {
        const base = new Date(t0); base.setHours(0, 0, 0, 0); const tt = base.getTime() + dd * 864e5 + m * 6e4, x = ((tt - t0) / 36e5 + .5) * cw;
        if (x > 4 && x < W - 4) { const dt = new Date(tt); g += `<g class="fi"><line x1="${x}" y1="50" x2="${x}" y2="158" stroke="${col}" stroke-opacity=".55" stroke-dasharray="1 3"/><circle cx="${x}" cy="50" r="2.6" fill="${col}"/>
          <text x="${x + 5}" y="53.5" font-size="9" fill="${col}" font-weight="600">${lbl} ${hhmm(dt)}</text></g>`; } } }
    // nedbør
    const pmax = Math.max(1.5, ...fc.map(f => f.precipitation || 0));
    fc.forEach((f, i) => { const p = f.precipitation || 0, pp = f.precipitation_probability || 0;
      if (p > 0.04) { const h = Math.max(3, p / pmax * 24), bw = Math.min(18, cw * .42);
        g += `<rect x="${X(i) - bw / 2}" y="${158 - h}" width="${bw}" height="${h}" rx="${Math.min(4, bw / 3)}" fill="url(#pb)" opacity="${.45 + pp / 200}" class="gbar" style="animation-delay:${.6 + i * .02}s"/>
          <text x="${X(i)}" y="${155 - h}" text-anchor="middle" font-size="8.5" fill="#8ed1ff" font-weight="600" class="fi">${p >= 1 ? fmt(p, 0) : fmt(p, 1)}</text>`; }
      else if (pp >= 30) g += `<text x="${X(i)}" y="155" text-anchor="middle" font-size="8.5" fill="rgba(142,209,255,.7)" class="fi">${Math.round(pp)}%</text>`; });
    g += `<line x1="0" y1="158.5" x2="${W}" y2="158.5" stroke="rgba(255,255,255,.07)"/>`;
    // temperaturkurve
    g += `<path d="${d}L${pts[n - 1][0]} 158L${pts[0][0]} 158Z" fill="url(#ta)" class="fi"/><path d="${d}" fill="none" stroke="url(#tl)" stroke-width="2.6" stroke-linecap="round" class="draw"/>`;
    const step = cw < 40 ? 2 : 1, iMax = T.indexOf(mx), iMin = T.indexOf(mn);
    fc.forEach((f, i) => { const dt = new Date(f.datetime), [, ic] = cnd(f.condition, isNight(dt)), ext = i === iMax || i === iMin;
      const lbl = i === 0 ? 'Nu' : dt.getHours() === 0 ? dt.toLocaleDateString('da-DK', { weekday: 'short' }).replace('.', '') : String(dt.getHours()).padStart(2, '0');
      g += `<text x="${X(i)}" y="12" text-anchor="middle" font-size="10.5" font-weight="${i === 0 || dt.getHours() === 0 ? 700 : 500}" fill="${i === 0 ? '#f4f1ea' : dt.getHours() === 0 ? '#e8c37e' : 'rgba(244,241,234,.55)'}" style="text-transform:capitalize">${lbl}</text>`;
      if (i % step === 0) g += `<g transform="translate(${X(i) - 9} 20) scale(.75)" fill="none" stroke="${['sun', 'pcloud'].includes(ic) ? '#f6d58f' : ic === 'rain' ? '#8ed1ff' : 'rgba(244,241,234,.85)'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="fi" style="animation-delay:${.3 + i * .015}s">${P[ic]}</g>`;
      if (i % step === 0 || ext) g += `<text x="${X(i)}" y="${pts[i][1] - 9}" text-anchor="middle" font-size="${ext ? 12 : 11}" font-weight="${ext ? 600 : 500}" fill="${ext ? tc(f.temperature) : '#f4f1ea'}" class="fi" style="animation-delay:${.8 + i * .02}s">${Math.round(f.temperature)}°</text>`;
      g += `<circle cx="${pts[i][0]}" cy="${pts[i][1]}" r="${i === 0 ? 3.6 : 1.8}" fill="${i === 0 ? '#fff' : tc(f.temperature)}" class="fi" style="animation-delay:${1 + i * .02}s"/>`;
      // vind
      const wv = (f.wind_speed || 0) / 3.6, wc = wv >= 10.8 ? '#ff9e7a' : wv >= 5.5 ? '#e8c37e' : 'rgba(244,241,234,.5)';
      if (i % step === 0) g += `<g transform="translate(${X(i)} 174) rotate(${(f.wind_bearing || 0) + 180})" class="fi"><path d="M0 -5.5 3.6 4 0 2 -3.6 4Z" fill="${wc}"/></g><text x="${X(i)}" y="192" text-anchor="middle" font-size="9.5" fill="${wc}">${Math.round(wv)}</text>`; });
    g += `<circle cx="${pts[0][0]}" cy="${pts[0][1]}" r="4" fill="#fff" class="nowdot"/>`;
    g += `<rect id="hl" x="0" y="0" width="${cw}" height="${H}" rx="12" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.12)" opacity="0" style="transition:x .12s,opacity .2s"/>`;
    const sv = this.$('hsvg'); sv.setAttribute('viewBox', `0 0 ${W} ${H}`); sv.setAttribute('width', W); sv.setAttribute('height', H); sv.innerHTML = g;
    this.$('hin').style.width = W + 'px';
    const tot = fc.reduce((s, f) => s + (f.precipitation || 0), 0);
    this.set('hsum', `${Math.round(mn)}° – ${Math.round(mx)}° · ${tot > 0.05 ? fmt(tot, 1) + ' mm nedbør' : 'ingen nedbør'} · vind m/s`);
  }
  scrub(e) {
    const fc = this._fc; if (!fc) return; const r = this.$('hsvg').getBoundingClientRect(), x = e.clientX - r.left, i = Math.max(0, Math.min(fc.length - 1, Math.floor(x / this._cw))), f = fc[i];
    const hl = this._r.getElementById('hl'); hl.setAttribute('x', i * this._cw); hl.setAttribute('opacity', 1);
    const dt = new Date(f.datetime), tip = this.$('tip'), [txt] = cnd(f.condition, false);
    tip.innerHTML = `<div class="t"><span>${dt.toLocaleDateString('da-DK', { weekday: 'short' })} kl. ${String(dt.getHours()).padStart(2, '0')}</span><span>${Math.round(f.temperature)}°</span></div>${txt}<br>
      Føles som <b>${fmt(f.apparent_temperature ?? f.temperature, 0)}°</b><br>Nedbør <b>${fmt(f.precipitation || 0, 1)} mm</b> · ${Math.round(f.precipitation_probability || 0)} %<br>
      Vind <b>${fmt((f.wind_speed || 0) / 3.6, 0)}</b> (stød ${fmt((f.wind_gust_speed || 0) / 3.6, 0)}) m/s<br>Fugt <b>${Math.round(f.humidity ?? 0)} %</b>${f.cloud_coverage != null ? ` · skyer <b>${Math.round(f.cloud_coverage)} %</b>` : ''}`;
    const sc = this.$('hs').scrollLeft, vw = this.$('hs').clientWidth; let L = (i + 1) * this._cw + 8; if (L + 158 - sc > vw) L = i * this._cw - 158;
    tip.style.left = Math.max(0, L) + 'px'; tip.classList.add('on');
  }
}
if (!customElements.get('th-weather-card')) customElements.define('th-weather-card', ThWeatherCard);
window.customCards = window.customCards || [];
if (!window.customCards.some(c => c.type === 'th-weather-card')) window.customCards.push({ type: 'th-weather-card', name: 'TH vejr', description: 'Animeret vejrkort med himmel, sol/måne, nowcast, målinger og time-for-time', preview: true });
console.info(`%c TH-WEATHER %c ${VWH_VER} `, 'background:#8ed1ff;color:#0b0d12;font-weight:700', 'color:#8ed1ff');
