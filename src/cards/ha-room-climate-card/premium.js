/*
 * Premium look for ha-room-climate-card (Claude AI, 2026-10-27; user: "endnu mere præmium og exclusivt, ude kortet
 * kunne også godt have info om vejret i løbet af dagen … husk at gem det gamle hvis det ikke bliver godt").
 * `style: new` (or the style_entity helper switched on) turns it on; `classic` keeps the 1.7.7 look untouched, because
 * every rule here is scoped under ha-card.premium and the extra markup is hidden without it.
 * - Room tiles: matte glass with grain, a hairline gradient edge in the room's colour, a thermostat dial (270°) with the
 *   temperature against the target, finer gauges and no hover lift (the edge lights up instead).
 * - Udendørs: weather now (animated icon, observed text), today/tomorrow, wind, rain, degree days, the next 12 hours
 *   from the weather entity's hourly forecast and a daylight arc with sunrise/sunset computed from the home location.
 */

export const WX_COND = {
  "clear-night": ["mdi:weather-night", "Klart", "night"], cloudy: ["mdi:weather-cloudy", "Overskyet", "cloud"],
  exceptional: ["mdi:alert-circle-outline", "Usædvanligt vejr", "storm"], fog: ["mdi:weather-fog", "Tåge", "fog"],
  hail: ["mdi:weather-hail", "Hagl", "rain"], lightning: ["mdi:weather-lightning", "Torden", "storm"],
  "lightning-rainy": ["mdi:weather-lightning-rainy", "Torden og regn", "storm"], partlycloudy: ["mdi:weather-partly-cloudy", "Delvist skyet", "part"],
  pouring: ["mdi:weather-pouring", "Skybrud", "rain"], rainy: ["mdi:weather-rainy", "Regn", "rain"], snowy: ["mdi:weather-snowy", "Sne", "snow"],
  "snowy-rainy": ["mdi:weather-snowy-rainy", "Slud", "snow"], sunny: ["mdi:weather-sunny", "Sol", "sun"],
  windy: ["mdi:weather-windy", "Blæsende", "wind"], "windy-variant": ["mdi:weather-windy-variant", "Blæsende og skyet", "wind"],
};
const NIGHT_ICON = { sunny: "mdi:weather-night", partlycloudy: "mdi:weather-night-partly-cloudy" };
const WX_COLOR = { sun: "#fbbf24", part: "#fcd34d", cloud: "#a5b4c8", rain: "#60a5fa", snow: "#e2e8f0", storm: "#a78bfa", fog: "#94a3b8", wind: "#7dd3fc", night: "#a5b4fc" };

export function wxInfo(condition, night) {
  const [icon, label, kind] = WX_COND[condition] || ["mdi:weather-partly-cloudy", condition || "—", "cloud"];
  const k = night && (kind === "sun" || kind === "part") ? "night" : kind;
  return { icon: night ? NIGHT_ICON[condition] || icon : icon, label, kind: k, color: WX_COLOR[k] };
}

const COMPASS = ["N", "NNØ", "NØ", "ØNØ", "Ø", "ØSØ", "SØ", "SSØ", "S", "SSV", "SV", "VSV", "V", "VNV", "NV", "NNV"];
export const compass = (deg) => COMPASS[Math.round((((Number(deg) % 360) + 360) % 360) / 22.5) % 16];

// Sunrise/sunset for the local day of `date` (the suncalc formulas; −0.833° for refraction and the sun's radius).
export function sunTimes(date, lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const rad = Math.PI / 180, dayMs = 864e5, J1970 = 2440588, J2000 = 2451545, e = rad * 23.4397, J0 = 0.0009;
  const noon = new Date(date); noon.setHours(12, 0, 0, 0);
  const d = noon.valueOf() / dayMs - 0.5 + J1970 - J2000;
  const lw = rad * -lng, phi = rad * lat;
  const n = Math.round(d - J0 - lw / (2 * Math.PI));
  const ds = J0 + lw / (2 * Math.PI) + n;
  const M = rad * (357.5291 + 0.98560028 * ds);
  const L = M + rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + rad * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const transit = (x) => J2000 + x + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const Jnoon = transit(ds);
  const w = Math.acos((Math.sin(rad * -0.833) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));
  if (!Number.isFinite(w)) return null;
  const Jset = transit(J0 + (w + lw) / (2 * Math.PI) + n), Jrise = Jnoon - (Jset - Jnoon);
  const from = (j) => new Date((j + 0.5 - J1970) * dayMs);
  return { rise: from(Jrise), set: from(Jset) };
}

export const GRAIN = `url("data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .055 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>")}")`;

export const DIAL_MARKUP = `<div class="dial" data-f="dial" aria-hidden="true"><i class="ring"></i><i class="glow"><i></i></i><i class="fill"><i></i></i><i class="tick"></i><i class="knob"></i>
  <div class="dv"><span class="dn"><b data-d="int">—</b><i data-d="dec"></i><small>°</small></span><span class="dt"><em data-d="tl">Mål</em><strong data-d="tv">—</strong></span></div></div>`;

export const WX_MARKUP = `<div class="wx" data-f="wx">
  <div class="wx-now"><span class="wx-ic" data-f="wxic"><i class="wx-rays"></i><ha-icon icon="mdi:weather-partly-cloudy"></ha-icon><i class="p"></i><i class="p"></i><i class="p"></i></span>
    <div class="wx-txt"><strong data-f="wxlabel">—</strong><em data-f="wxsub">—</em></div></div>
  <div class="wx-chips" data-f="wxchips"></div>
  <div class="hours" data-f="hours"></div>
  <div class="daylight" data-f="daylight"><svg viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true"><path class="dl-track" d="M4 38 Q100 -34 196 38"></path><path class="dl-done" d=""></path></svg><i class="dl-sun"></i>
    <span class="dl-l" data-f="dlrise">—</span><span class="dl-c" data-f="dltext">—</span><span class="dl-r" data-f="dlset">—</span></div>
</div>`;

export const PREMIUM_STYLE = `
.dial,.wx{display:none}
ha-card.premium{--pm-grain:${GRAIN}}
.premium .head h2{background:linear-gradient(100deg,var(--rc-ink) 30%,color-mix(in srgb,var(--rc-ink) 55%,var(--rc-accent)));-webkit-background-clip:text;background-clip:text;color:transparent}
.premium .eyebrow{letter-spacing:.24em}
.premium .flow{border-radius:20px;background:var(--pm-grain),linear-gradient(135deg,rgba(255,255,255,.08),rgba(255,255,255,.015)),var(--rc-surface)}
.premium .group-head h3{letter-spacing:.24em}.premium .count{background:linear-gradient(135deg,rgba(255,255,255,.12),rgba(255,255,255,.04))}

/* glass tiles with grain and a hairline edge in the room's colour; hover lights the edge, nothing moves */
.premium .zone,.premium .tile,.premium .panel,.premium .stat{
  background:radial-gradient(95% 70% at 100% 0%,color-mix(in srgb,var(--room-color,var(--sc,var(--rc-accent))) 24%,transparent),transparent 62%),
    radial-gradient(80% 60% at 0% 100%,color-mix(in srgb,var(--room-color,var(--sc,var(--rc-accent))) 8%,transparent),transparent 72%),
    var(--pm-grain),linear-gradient(165deg,rgba(255,255,255,.075),rgba(255,255,255,.012) 42%,rgba(0,0,0,.2)),var(--rc-surface);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.11),0 34px 64px -38px rgba(0,0,0,.95),0 16px 32px -26px color-mix(in srgb,var(--room-color,var(--sc,transparent)) 55%,transparent)}
.premium .zone::before,.premium .tile::before,.premium .panel::before,.premium .stat::before{content:"";position:absolute;inset:0;z-index:3;padding:1px;border-radius:inherit;pointer-events:none;opacity:.6;transition:opacity .35s ease;
  background:linear-gradient(150deg,color-mix(in srgb,var(--room-color,var(--sc,var(--rc-accent))) 75%,#fff 8%),rgba(255,255,255,.09) 32%,rgba(255,255,255,.02) 62%,color-mix(in srgb,var(--room-color,var(--sc,var(--rc-accent))) 32%,transparent));
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}
.premium .zone:hover,.premium .tile:hover{transform:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.13),0 34px 64px -36px rgba(0,0,0,.95),0 0 46px -20px var(--room-color)}
.premium .zone:hover::before,.premium .tile:hover::before{opacity:1}
.premium .zone{border-radius:30px}.premium .tile{border-radius:24px}
.premium .zone .mark{opacity:.045;filter:blur(.3px)}
.premium .z-icon{border-radius:17px;background:linear-gradient(150deg,color-mix(in srgb,var(--room-color) 34%,rgba(255,255,255,.06)),color-mix(in srgb,var(--room-color) 6%,transparent));box-shadow:inset 0 1px 0 rgba(255,255,255,.18),inset 0 0 0 1px color-mix(in srgb,var(--room-color) 38%,transparent),0 10px 24px -12px var(--room-color)}
.premium .z-title strong{font-size:18.5px;font-weight:750;letter-spacing:-.025em}
.premium .z-status{font-size:9.5px;letter-spacing:.16em}

/* thermostat dial */
.premium .z-body{grid-template-columns:auto minmax(0,1fr);gap:20px;align-items:center;padding:14px 18px 10px}
.premium .zone:not(.outdoor) .z-temp .t-big,.premium .zone:not(.outdoor) .z-temp .rail,.premium .zone:not(.outdoor) .z-temp .step{display:none}
.premium .dial{--a:0deg;--t:135deg;position:relative;display:grid;place-items:center;width:146px;height:146px;border-radius:50%;
  background:radial-gradient(circle at 50% 38%,rgba(255,255,255,.07),rgba(0,0,0,.18) 70%);box-shadow:inset 0 1px 0 rgba(255,255,255,.07),inset 0 -14px 24px -18px rgba(0,0,0,.8),0 18px 30px -22px rgba(0,0,0,.9)}
.dial>i{position:absolute;inset:0;border-radius:50%;pointer-events:none}
.dial .ring,.dial .fill,.dial .glow{-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 9px),#000 calc(100% - 8px),#000 calc(100% - 2px),transparent calc(100% - 1px));mask:radial-gradient(farthest-side,transparent calc(100% - 9px),#000 calc(100% - 8px),#000 calc(100% - 2px),transparent calc(100% - 1px))}
.dial .ring{background:conic-gradient(from 225deg,rgba(255,255,255,.09) 0 270deg,transparent 270deg)}
.dial .fill i,.dial .glow i{position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 225deg,var(--rc-cool),var(--rc-ok) 135deg,var(--rc-warm) 205deg,var(--rc-hot) 270deg,transparent 270deg);
  -webkit-mask:conic-gradient(from 225deg,#000 0 var(--a),transparent var(--a));mask:conic-gradient(from 225deg,#000 0 var(--a),transparent var(--a))}
.dial .glow{filter:blur(7px);opacity:0}
.zone.is-heating .dial .glow,.zone.is-ac .dial .glow{animation:dialGlow 2.6s ease-in-out infinite}
.dial .tick{transform:rotate(calc(225deg + var(--t)))}
.dial .tick::before{content:"";position:absolute;left:50%;top:-3px;width:2px;height:15px;margin-left:-1px;border-radius:2px;background:var(--rc-ink);box-shadow:0 0 6px rgba(255,255,255,.6)}
.dial .knob{transform:rotate(calc(225deg + var(--a)));transition:transform .9s cubic-bezier(.2,1,.3,1)}
.dial .knob::before{content:"";position:absolute;left:50%;top:-1px;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:var(--room-color);box-shadow:0 0 0 3px var(--rc-surface),0 0 16px var(--room-color)}
.dial.na .fill,.dial.na .knob,.dial.na .glow{display:none}.dial.notgt .tick{display:none}
.dv{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;font-variant-numeric:tabular-nums}
.dn{display:flex;align-items:flex-start;line-height:.9}
.dn b{font-size:44px;font-weight:650;letter-spacing:-.06em;background:linear-gradient(180deg,#fff,color-mix(in srgb,var(--rc-ink) 70%,var(--room-color)));-webkit-background-clip:text;background-clip:text;color:transparent}
.dn i{margin-top:4px;color:color-mix(in srgb,var(--rc-ink) 75%,transparent);font-size:20px;font-style:normal;font-weight:650;letter-spacing:-.03em}
.dn small{margin:5px 0 0 1px;color:var(--rc-muted);font-size:13px;font-weight:700}
.dt{display:flex;align-items:baseline;gap:5px;padding:3px 9px;border-radius:99px;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}
.dt em{color:var(--rc-muted);font-size:8.5px;font-style:normal;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
.dt strong{font-size:12.5px;font-weight:800}.dial.pending .dt strong{color:var(--room-color)}

/* finer gauges */
.premium .gauges{gap:10px}
.premium .g{grid-template-columns:26px minmax(0,1fr) auto;gap:3px 9px}
.premium .g ha-icon{grid-row:span 2;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9px;--mdc-icon-size:15px;background:color-mix(in srgb,var(--gc,var(--rc-muted)) 13%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--gc,var(--rc-muted)) 22%,transparent)}
.premium .g span{font-size:9.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
.premium .g strong{font-size:13.5px;font-weight:750}
.premium .g i{grid-column:2/-1;height:3px;background:rgba(255,255,255,.06)}
.premium .g i::after{box-shadow:0 0 10px var(--gc,var(--room-color))}
.premium .spark .area{opacity:.2}.premium .spark .line{stroke-width:2}
/* the curve takes the room's spare height, so tiles in a tall row have no empty middle */
.premium .zone .band{flex:1 1 auto;display:flex;flex-direction:column;justify-content:flex-end;min-height:var(--spark-h,56px)}
.premium .zone .band .spark-wrap{flex:1 1 auto;display:flex;flex-direction:column;justify-content:flex-end}
.premium .zone .band .spark-box{flex:1 1 auto;height:auto;min-height:var(--spark-h,56px);max-height:150px}
.premium .zone.has-room .z-room{background:linear-gradient(180deg,rgba(0,0,0,.06),rgba(0,0,0,.3));box-shadow:inset 0 1px 0 rgba(255,255,255,.06)}
.premium .qa{border-radius:15px;background:linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.035));box-shadow:inset 0 1px 0 rgba(255,255,255,.08),inset 0 0 0 1px rgba(255,255,255,.06)}
.premium .rc{background:rgba(255,255,255,.055);box-shadow:inset 0 0 0 1px rgba(255,255,255,.05)}

/* measuring points and summary */
.premium .tile .t-temp{font-weight:650;background:linear-gradient(180deg,#fff,color-mix(in srgb,var(--rc-ink) 70%,var(--room-color)));-webkit-background-clip:text;background-clip:text;color:transparent}
.premium .tile .t-temp small{-webkit-text-fill-color:var(--rc-muted)}
.premium .panel,.premium .stat{border-radius:28px}
.premium .big{font-weight:650}.premium .big span{background:linear-gradient(180deg,#fff,color-mix(in srgb,var(--rc-ink) 65%,var(--rc-accent)));-webkit-background-clip:text;background-clip:text;color:transparent}
.premium .stat .ic{border-radius:16px;box-shadow:inset 0 1px 0 rgba(255,255,255,.14),inset 0 0 0 1px color-mix(in srgb,var(--sc) 32%,transparent),0 10px 22px -14px var(--sc)}

/* Udendørs: weather through the day */
.premium .zone.outdoor{--room-color:var(--wx-c,var(--rc-accent));container-type:inline-size}
.premium .zone.outdoor .gauges{display:none}
.premium .zone.outdoor .z-body{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px 14px;align-items:center;padding:8px 18px 0}
.premium .zone.outdoor .t-big{font-size:54px;font-weight:650;background:linear-gradient(180deg,#fff,color-mix(in srgb,var(--rc-ink) 65%,var(--room-color)));-webkit-background-clip:text;background-clip:text;color:transparent}
.premium .zone.outdoor .t-big small{-webkit-text-fill-color:var(--rc-muted)}
.premium .wx{display:contents}
.wx-now{display:flex;align-items:center;justify-content:flex-end;gap:10px;min-width:0}
.wx-txt{min-width:0;text-align:right}.wx-txt strong{display:block;overflow:hidden;font-size:15px;font-weight:800;text-overflow:ellipsis;white-space:nowrap}
.wx-txt em{display:block;margin-top:3px;overflow:hidden;color:var(--rc-muted);font-size:10.5px;font-style:normal;text-overflow:ellipsis;white-space:nowrap}
.wx-ic{position:relative;flex:none;display:grid;place-items:center;width:56px;height:56px;color:var(--wx-c,var(--rc-accent))}
.wx-ic ha-icon{position:relative;z-index:1;--mdc-icon-size:42px;filter:drop-shadow(0 0 12px color-mix(in srgb,var(--wx-c,var(--rc-accent)) 55%,transparent))}
.wx-rays{position:absolute;inset:-2px;border-radius:50%;opacity:0;background:repeating-conic-gradient(color-mix(in srgb,var(--wx-c) 45%,transparent) 0 6deg,transparent 6deg 30deg);-webkit-mask:radial-gradient(circle,transparent 0 46%,#000 50% 66%,transparent 70%);mask:radial-gradient(circle,transparent 0 46%,#000 50% 66%,transparent 70%)}
.wx-ic .p{position:absolute;top:62%;width:2px;height:8px;border-radius:2px;background:var(--wx-c);opacity:0}
.wx-ic .p:nth-of-type(2){left:38%}.wx-ic .p:nth-of-type(3){left:52%}.wx-ic .p:nth-of-type(4){left:66%}
.wx-ic.sun .wx-rays,.wx-ic.part .wx-rays{opacity:1;animation:pmSpin 26s linear infinite}
.wx-ic.sun ha-icon{animation:pmBreath 4s ease-in-out infinite}
.wx-ic.cloud ha-icon,.wx-ic.part ha-icon,.wx-ic.fog ha-icon,.wx-ic.wind ha-icon,.wx-ic.night ha-icon{animation:pmDrift 6s ease-in-out infinite}
.wx-ic.rain .p,.wx-ic.storm .p{animation:pmDrop 1.1s linear infinite}.wx-ic.rain .p:nth-of-type(3),.wx-ic.storm .p:nth-of-type(3){animation-delay:.37s}.wx-ic.rain .p:nth-of-type(4),.wx-ic.storm .p:nth-of-type(4){animation-delay:.74s}
.wx-ic.snow .p{width:4px;height:4px;border-radius:50%;animation:pmFlake 2.4s linear infinite}.wx-ic.snow .p:nth-of-type(3){animation-delay:.8s}.wx-ic.snow .p:nth-of-type(4){animation-delay:1.6s}
.wx-ic.storm ha-icon{animation:pmFlash 3.2s steps(1) infinite}
.wx-chips{grid-column:1/-1;display:flex;gap:5px;overflow:hidden;-webkit-mask:linear-gradient(90deg,#000 calc(100% - 18px),transparent);mask:linear-gradient(90deg,#000 calc(100% - 18px),transparent)}
.wx-chip{flex:none;display:inline-flex;align-items:center;gap:4px;padding:4px 9px 4px 6px;border-radius:99px;background:rgba(255,255,255,.055);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06);font-size:10.5px;font-weight:750;white-space:nowrap;font-variant-numeric:tabular-nums}
.wx-chip ha-icon{--mdc-icon-size:13px;color:var(--cc,var(--rc-muted))}.wx-chip small{color:var(--rc-muted);font-size:10px;font-weight:700}
.wx-chip .arrow{display:inline-flex;transition:transform .6s ease}
.hours{grid-column:1/-1;display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:1px;padding:6px 4px;border-radius:16px;background:linear-gradient(180deg,rgba(0,0,0,.12),rgba(0,0,0,.24));box-shadow:inset 0 0 0 1px rgba(255,255,255,.05)}
.hours:empty{display:none}
.hr{display:flex;flex-direction:column;align-items:center;gap:2px;min-width:0;padding:2px 0 3px;border-radius:11px;font-variant-numeric:tabular-nums}
.hr.now{background:color-mix(in srgb,var(--wx-c,var(--rc-accent)) 13%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--wx-c,var(--rc-accent)) 30%,transparent)}
.hr>span{color:var(--rc-muted);font-size:9px;font-weight:800}.hr.now>span{color:var(--rc-ink)}
.hr ha-icon{--mdc-icon-size:15px;color:var(--hc,var(--rc-muted))}
.hr b{font-size:10.5px;font-weight:800}
.hr i{position:relative;width:4px;height:9px;overflow:hidden;border-radius:3px;background:rgba(255,255,255,.07)}
.hr i::after{content:"";position:absolute;left:0;right:0;bottom:0;height:var(--p,0%);border-radius:inherit;background:#60a5fa;box-shadow:0 0 6px #60a5fa}
.daylight{grid-column:1/-1;position:relative;height:42px;margin:0 4px}
.daylight svg{position:absolute;left:12%;right:12%;top:4px;width:76%;height:24px;overflow:visible}
.dl-track{fill:none;stroke:rgba(255,255,255,.14);stroke-width:1.5;stroke-dasharray:2 4;vector-effect:non-scaling-stroke}
.dl-done{fill:none;stroke:#fbbf24;stroke-width:2;stroke-linecap:round;vector-effect:non-scaling-stroke;filter:drop-shadow(0 0 4px rgba(251,191,36,.7))}
.dl-sun{position:absolute;width:13px;height:13px;margin:-6.5px 0 0 -6.5px;border-radius:50%;background:radial-gradient(circle,#fff7d6,#fbbf24 60%);box-shadow:0 0 0 3px rgba(251,191,36,.18),0 0 18px #fbbf24;transition:left 1s ease,top 1s ease}
.daylight.dark .dl-sun{display:none}.daylight.dark .dl-track{stroke:rgba(165,180,252,.18)}
.daylight span{position:absolute;bottom:0;color:var(--rc-muted);font-size:10px;font-weight:750;white-space:nowrap;font-variant-numeric:tabular-nums}
.dl-l{left:0;bottom:12px!important}.dl-r{right:0;bottom:12px!important}.dl-c{left:50%;transform:translateX(-50%);color:var(--rc-ink)!important}
.premium .zone.outdoor .band{margin-top:4px;min-height:30px}.premium .zone.outdoor .band .spark-box{min-height:30px}
@container (max-width:400px){.hr:nth-child(n+9){display:none}.wx-txt em{white-space:normal}}
@keyframes dialGlow{0%,100%{opacity:.15}50%{opacity:.55}}
@keyframes pmSpin{to{transform:rotate(360deg)}}@keyframes pmBreath{50%{transform:scale(1.06)}}@keyframes pmDrift{50%{transform:translateX(3px)}}
@keyframes pmDrop{0%{opacity:0;transform:translateY(-4px)}25%{opacity:.9}100%{opacity:0;transform:translateY(12px)}}
@keyframes pmFlake{0%{opacity:0;transform:translate(0,-4px)}30%{opacity:.9}100%{opacity:0;transform:translate(3px,12px)}}
@keyframes pmFlash{0%,88%,94%,100%{opacity:1}90%,96%{opacity:.35}}
@container (max-width:560px){.premium .dial{width:128px;height:128px}.dn b{font-size:38px}.premium .z-body{gap:14px}}
`;
