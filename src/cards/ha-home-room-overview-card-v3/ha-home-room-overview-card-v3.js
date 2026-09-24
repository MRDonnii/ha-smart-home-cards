import "./ha-card-list-editor.js";

// 3.0.0 – rumoversigt med levende rumstatus, status-chips,
// hurtigknapper (tryk = skift, hold = detaljer), lysfarve-glød, filtre og animationer.
// Et tryk på selve kortet åbner fortsat rummets popup via popup-hashen.
const ROOM_OVERVIEW_VERSION = "3.0.0";

const OPEN_STATES = new Set(["on", "open", "opening"]);
const PRESENT_STATES = new Set(["on", "home", "detected"]);
const MEDIA_OFF = new Set(["off", "standby", "unavailable", "unknown"]);
const DEAD = new Set(["unavailable", "unknown"]);
const TONE_RANK = { critical: 0, danger: 1, warn: 2, active: 3, info: 4 };
const OPENING_LABEL = { door: "Dør", window: "Vindue", garage_door: "Port", garage: "Port", gate: "Låge", opening: "Åbning" };
const WEATHER = {
  "clear-night": ["Klart", "mdi:weather-night"], cloudy: ["Overskyet", "mdi:weather-cloudy"], exceptional: ["Usædvanligt vejr", "mdi:alert-circle-outline"],
  fog: ["Tåge", "mdi:weather-fog"], hail: ["Hagl", "mdi:weather-hail"], lightning: ["Lyn", "mdi:weather-lightning"],
  "lightning-rainy": ["Torden og regn", "mdi:weather-lightning-rainy"], partlycloudy: ["Let skyet", "mdi:weather-partly-cloudy"],
  pouring: ["Skybrud", "mdi:weather-pouring"], rainy: ["Regn", "mdi:weather-rainy"], snowy: ["Sne", "mdi:weather-snowy"],
  "snowy-rainy": ["Slud", "mdi:weather-snowy-rainy"], sunny: ["Sol", "mdi:weather-sunny"], windy: ["Blæsende", "mdi:weather-windy"],
  "windy-variant": ["Blæsende", "mdi:weather-windy-variant"],
};
const DOMAIN_ICON = { light: "mdi:lightbulb-outline", switch: "mdi:power-socket-eu", fan: "mdi:fan", media_player: "mdi:television", lock: "mdi:lock", valve: "mdi:valve", cover: "mdi:blinds", script: "mdi:script-text-play-outline", scene: "mdi:palette-outline", input_boolean: "mdi:toggle-switch-outline", vacuum: "mdi:robot-vacuum", climate: "mdi:thermostat" };
const PILLS = [
  { key: "temp", icon: "mdi:home-thermometer-outline", label: "Inde" },
  { key: "occupied", icon: "mdi:account-multiple-outline", label: "Aktivitet", filter: true },
  { key: "lit", icon: "mdi:lightbulb-group-outline", label: "Lys tændt", filter: true },
  { key: "open", icon: "mdi:window-open-variant", label: "Åbninger", filter: true },
  { key: "running", icon: "mdi:play-circle-outline", label: "I gang", filter: true },
];

try { CSS.registerProperty({ name: "--hro-a", syntax: "<angle>", inherits: false, initialValue: "0deg" }); } catch (_) { /* allerede registreret */ }

const arr = (value) => (Array.isArray(value) ? value : value == null || value === "" ? [] : [value]);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const item = (value) => (typeof value === "string" ? { entity: value } : { ...(value || {}) });

function kelvinRgb(kelvin) {
  const t = kelvin / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return [r, g, b].map((v) => clamp(Math.round(v), 0, 255));
}

function hsRgb(h, s) {
  const f = (n) => { const k = (n + h / 60) % 6; return 255 * (1 - (s / 100) * Math.max(0, Math.min(k, 4 - k, 1))); };
  return [f(5), f(3), f(1)].map((v) => Math.round(v));
}

const STYLE = `
:host{display:block;container:roomcard / inline-size;color:var(--primary-text-color);font-family:var(--paper-font-body1_-_font-family,Inter,system-ui,sans-serif);--ok:var(--dashboard-success,var(--success-color,#00e676));--warn:var(--dashboard-warning,var(--warning-color,#ff8a00));--bad:var(--dashboard-danger,var(--error-color,#ff365e));--line:var(--dashboard-border-neutral,var(--divider-color,rgba(255,255,255,.2)));--muted:var(--secondary-text-color,#8898ad);--brand:var(--dashboard-accent,var(--primary-color,#00b8ff));--ease:cubic-bezier(.2,.8,.2,1)}
*{box-sizing:border-box}button{font:inherit;color:inherit;margin:0}
.shell{position:relative;overflow:hidden;padding:26px;border:1px solid color-mix(in srgb,var(--line) 70%,transparent);border-radius:30px;background:radial-gradient(110% 80% at 100% 0%,color-mix(in srgb,var(--brand) 11%,transparent),transparent 45%),radial-gradient(70% 60% at 0% 100%,color-mix(in srgb,var(--brand) 5%,transparent),transparent 60%),var(--dashboard-card-bg,var(--ha-card-background,var(--card-background-color,#14171c)));box-shadow:var(--dashboard-shadow-deep,0 20px 50px rgba(0,0,0,.3))}
.shell::before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.22;background-image:linear-gradient(rgba(255,255,255,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.02) 1px,transparent 1px);background-size:42px 42px;-webkit-mask-image:linear-gradient(180deg,#000,transparent 70%);mask-image:linear-gradient(180deg,#000,transparent 70%)}
.top{position:relative;display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:22px;animation:fadeUp .7s var(--ease) backwards}
.eyebrow{display:flex;align-items:center;gap:10px;color:var(--brand);font-size:11px;font-weight:800;letter-spacing:.2em;text-transform:uppercase}
.live{position:relative;width:8px;height:8px;border-radius:50%;background:var(--ok);box-shadow:0 0 12px var(--ok)}
.live::after{content:"";position:absolute;inset:0;border-radius:50%;background:var(--ok);animation:ping 2.4s cubic-bezier(0,0,.2,1) infinite}
h1{margin:8px 0 4px;font-size:clamp(28px,3vw,42px);font-weight:800;line-height:1.02;letter-spacing:-.045em}
.sub{min-height:1.35em;color:var(--muted);font-size:14px;font-weight:500;transition:opacity .3s}
.pills{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}
.pill{position:relative;display:flex;align-items:center;gap:10px;min-width:122px;padding:9px 14px 9px 9px;border:1px solid color-mix(in srgb,var(--line) 55%,transparent);border-radius:17px;background:var(--contrast1,rgba(255,255,255,.04));text-align:left;cursor:default;transition:border-color .3s,background .3s,box-shadow .3s,transform .2s var(--ease),opacity .3s}
.pill[data-filter]{cursor:pointer}
.pill[data-filter]:hover{border-color:color-mix(in srgb,var(--pc,var(--brand)) 55%,transparent)}
.pill[data-filter]:active{transform:scale(.96)}
.pill .pi{display:grid;place-items:center;flex:0 0 34px;width:34px;height:34px;border-radius:11px;background:color-mix(in srgb,var(--pc,var(--brand)) 15%,transparent);color:var(--pc,var(--brand));transition:background .3s,color .3s}
.pill .pi ha-icon{--mdc-icon-size:19px}
.pill b{display:block;font-size:18px;font-weight:800;line-height:1.1;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.pill small{display:block;margin-top:2px;color:var(--muted);font-size:10px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;white-space:nowrap}
.pill small em{font-style:normal;letter-spacing:.02em;text-transform:none;font-weight:700;opacity:.85}
.pill.zero{opacity:.62}
.pill.hot{--pc:var(--warn)}
.pill.hot b{color:var(--warn)}
.pill.sel{border-color:var(--pc,var(--brand));background:color-mix(in srgb,var(--pc,var(--brand)) 12%,transparent);box-shadow:0 10px 26px color-mix(in srgb,var(--pc,var(--brand)) 20%,transparent)}
.pill.sel .pi{background:var(--pc,var(--brand));color:#fff}
.bump{animation:bump .5s var(--ease)}
.grid{position:relative;display:grid;grid-template-columns:repeat(var(--cols,4),minmax(0,1fr));gap:14px}
.tile{--accent:var(--brand);--bc:var(--accent);--lrgb:255,190,110;--level:0;position:relative;isolation:isolate;min-width:0;container:tile / inline-size;border:1px solid color-mix(in srgb,var(--line) 52%,transparent);border-radius:24px;background:linear-gradient(160deg,color-mix(in srgb,var(--accent) 11%,transparent) 0%,transparent 46%),var(--surface-soft-gradient,rgba(255,255,255,.03));overflow:hidden;cursor:pointer;outline:none;-webkit-tap-highlight-color:transparent;transition:transform .35s var(--ease),border-color .35s,box-shadow .35s,opacity .35s,filter .35s;animation:tileIn .75s var(--ease) backwards;animation-delay:calc(var(--i) * 55ms + 80ms)}
.tile::after{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;background:radial-gradient(320px circle at var(--mx,50%) var(--my,-30%),color-mix(in srgb,var(--accent) 17%,transparent),transparent 62%);opacity:0;transition:opacity .45s;pointer-events:none}
.tile:focus-visible{box-shadow:0 0 0 2px var(--brand)}
.tile.press{transform:scale(.985)}
@media (hover:hover){.tile:hover{transform:translateY(-4px);border-color:color-mix(in srgb,var(--accent) 50%,transparent);box-shadow:0 18px 38px rgba(0,0,0,.28),inset 0 0 0 1px color-mix(in srgb,var(--accent) 16%,transparent)}.tile:hover::after{opacity:1}.tile:hover .spark{opacity:.5}}
.tile.lit{border-color:color-mix(in srgb,rgb(var(--lrgb)) calc(18% + var(--level) * 30%),color-mix(in srgb,var(--line) 52%,transparent))}
.tile.alarm{border-color:color-mix(in srgb,var(--bad) 58%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--bad) 22%,transparent),0 0 34px color-mix(in srgb,var(--bad) 13%,transparent)}
.tile.critical{animation:tileIn .75s var(--ease) backwards,alarm 1.6s ease-in-out infinite}
.grid[data-filter] .tile:not(.match){opacity:.24;filter:saturate(.25);transform:scale(.97)}
.grid[data-filter] .tile.match{border-color:color-mix(in srgb,var(--accent) 60%,transparent)}
.glow{position:absolute;z-index:-1;top:-44%;right:-30%;width:84%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle,rgba(var(--lrgb),.5) 0%,rgba(var(--lrgb),.16) 36%,transparent 66%);opacity:0;scale:.55;transition:opacity 1s ease,scale 1s var(--ease),background 1s;pointer-events:none}
.tile.lit .glow{opacity:calc(.3 + var(--level) * .7);scale:1;animation:breathe 7s ease-in-out infinite}
.spark{position:absolute;left:0;right:0;bottom:64px;z-index:-1;width:100%;height:76px;opacity:.3;pointer-events:none;transition:opacity .45s;overflow:visible}
.spark .stroke{fill:none;stroke:var(--accent);stroke-width:1.6;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke;filter:drop-shadow(0 0 4px var(--accent))}
.spark .s0{stop-color:var(--accent);stop-opacity:.34}.spark .s1{stop-color:var(--accent);stop-opacity:0}
.spark.draw{animation:draw 1.8s cubic-bezier(.45,0,.2,1) backwards;animation-delay:calc(var(--i) * 55ms + 250ms)}
.in{position:relative;display:grid;grid-template-rows:auto 1fr auto;gap:12px;min-height:238px;height:100%;padding:18px}
.head{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:start;gap:12px}
.badge{position:relative;display:grid;place-items:center;width:46px;height:46px;border-radius:15px;background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 24%,transparent);transition:background .4s,color .4s}
.badge ha-icon{--mdc-icon-size:24px}
.rings i{position:absolute;inset:0;border:1.5px solid var(--ok);border-radius:inherit;opacity:0;pointer-events:none}
.tile.occupied .rings i{animation:ring 2.8s cubic-bezier(.2,.6,.3,1) infinite}
.tile.occupied .rings i:nth-child(2){animation-delay:1.4s}
.tile.occupied .badge{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ok) 45%,transparent)}
.ident{min-width:0;padding-top:1px}
.name{overflow:hidden;font-size:18px;font-weight:800;line-height:1.2;letter-spacing:-.025em;white-space:nowrap;text-overflow:ellipsis}
.line{display:flex;align-items:center;gap:7px;min-width:0;margin-top:5px;color:var(--muted);font-size:11.5px;font-weight:650;white-space:nowrap}
.line .lt{overflow:hidden;text-overflow:ellipsis}
.dot{position:relative;flex:0 0 7px;width:7px;height:7px;border-radius:50%;background:color-mix(in srgb,var(--muted) 55%,transparent);transition:background .4s}
.line.live{color:color-mix(in srgb,var(--ok) 82%,var(--primary-text-color))}
.line.live .dot{background:var(--ok);box-shadow:0 0 10px var(--ok)}
.line.live .dot::after{content:"";position:absolute;inset:0;border-radius:50%;background:var(--ok);animation:ping 2s cubic-bezier(0,0,.2,1) infinite}
.line.weather .dot{background:var(--accent)}
.line.off .dot{background:var(--warn)}
.clim{text-align:right}
.temp{display:flex;align-items:flex-start;justify-content:flex-end;font-size:32px;font-weight:800;line-height:.95;letter-spacing:-.05em;font-variant-numeric:tabular-nums;white-space:nowrap}
.tv{display:inline-block;transition:color .4s}
.tv.bump{animation:bump .6s var(--ease)}
.tu{margin:2px 0 0 1px;color:var(--muted);font-size:15px;font-weight:650;letter-spacing:0}
.trend{display:none;--mdc-icon-size:15px;margin:2px 0 0 1px}
.trend.up,.trend.down{display:inline-flex}
.trend.up{color:var(--warn)}.trend.down{color:#5fb8ff}
.meta{display:flex;justify-content:flex-end;gap:9px;margin-top:7px;color:var(--muted);font-size:11px;font-weight:700;white-space:nowrap}
.meta>span{display:inline-flex;align-items:center;gap:3px;transition:color .3s}
.meta ha-icon{--mdc-icon-size:13px;opacity:.85}
.meta .hide{display:none}
.hum.crit{color:var(--bad)}
.tgt.heat{color:var(--warn)}
.tgt.heat ha-icon{opacity:1;animation:flame 1.3s ease-in-out infinite}
.chips{position:relative;display:flex;flex-wrap:wrap;align-content:flex-start;gap:6px;min-width:0}
.chip{--cc:var(--accent);position:relative;display:inline-flex;align-items:center;gap:6px;max-width:100%;height:27px;padding:0 10px 0 8px;overflow:hidden;border:1px solid color-mix(in srgb,var(--cc) 32%,transparent);border-radius:999px;background:color-mix(in srgb,var(--cc) 13%,transparent);color:color-mix(in srgb,var(--cc) 72%,var(--primary-text-color));font-size:11px;font-weight:750;white-space:nowrap;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);animation:chipIn .5s var(--ease) backwards}
.chip.danger,.chip.critical{--cc:var(--bad)}.chip.warn{--cc:var(--warn)}.chip.info{--cc:var(--muted)}
.chip.critical{animation:chipIn .5s var(--ease) backwards,alarm 1.4s ease-in-out infinite}
.chip.out{animation:chipOut .32s ease forwards;pointer-events:none}
.chip.tap{cursor:pointer;transition:transform .18s var(--ease),background .3s}
.chip.tap:hover{background:color-mix(in srgb,var(--cc) 22%,transparent)}
.chip.tap:active{transform:scale(.94)}
.chip.tap .ct::after{content:" ↺";opacity:.7}
.ci{position:relative;display:grid;place-items:center;flex:0 0 15px;width:15px;height:15px}
.ci ha-icon{--mdc-icon-size:15px}
.ct{position:relative;overflow:hidden;text-overflow:ellipsis}
.cm{position:relative;flex:0 0 auto;font-weight:650;opacity:.72}
.cm:empty{display:none}
.chip.prog{background:linear-gradient(90deg,color-mix(in srgb,var(--cc) 30%,transparent) 0 var(--p,0%),color-mix(in srgb,var(--cc) 10%,transparent) var(--p,0%) 100%)}
.chip.prog::before{content:"";position:absolute;inset:0;width:var(--p,0%);background:repeating-linear-gradient(115deg,rgba(255,255,255,.13) 0 6px,transparent 6px 12px);background-size:24px 100%;animation:stripes 1.2s linear infinite;transition:width .8s var(--ease)}
.eq{display:none;align-items:flex-end;gap:1.5px;width:13px;height:12px}
.eq i{flex:1;height:100%;border-radius:1px;background:currentColor;transform-origin:bottom;animation:eq 1s ease-in-out infinite}
.eq i:nth-child(2){animation-delay:-.45s}.eq i:nth-child(3){animation-delay:-.2s}.eq i:nth-child(4){animation-delay:-.7s}
.chip.eqon .eq{display:flex}.chip.eqon .ci ha-icon{display:none}
.anim-pulse ha-icon{animation:blink 1.5s ease-in-out infinite}
.anim-spin ha-icon{animation:spin 1.6s linear infinite}
.anim-wiggle ha-icon{animation:wiggle 1.2s ease-in-out infinite}
.anim-flame ha-icon{animation:flame 1.3s ease-in-out infinite}
.anim-bob ha-icon{animation:bob 1.6s ease-in-out infinite}
.acts{position:relative;display:flex;align-items:center;gap:8px;min-width:0}
.btn{--bc:var(--accent);position:relative;display:grid;place-items:center;flex:0 0 auto;width:42px;height:42px;padding:0;border:1px solid color-mix(in srgb,var(--line) 55%,transparent);border-radius:14px;background:color-mix(in srgb,var(--primary-text-color) 5%,transparent);color:var(--muted);cursor:pointer;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation;transition:transform .2s var(--ease),background .35s,border-color .35s,color .35s,box-shadow .35s,opacity .3s}
.btn ha-icon{--mdc-icon-size:20px;pointer-events:none;transition:color .35s}
@media (hover:hover){.btn:hover{border-color:color-mix(in srgb,var(--bc) 50%,transparent);color:var(--primary-text-color)}}
.btn:active{transform:scale(.9)}
.btn:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
.btn.on{color:color-mix(in srgb,var(--bc) 78%,#fff);border-color:color-mix(in srgb,var(--bc) 55%,transparent);background:color-mix(in srgb,var(--bc) 19%,transparent);box-shadow:0 0 22px color-mix(in srgb,var(--bc) 24%,transparent),inset 0 0 0 1px color-mix(in srgb,var(--bc) 16%,transparent)}
.btn.secure{color:color-mix(in srgb,var(--ok) 80%,var(--primary-text-color))}
.btn.unavail{opacity:.38}
.btn.pending::after{content:"";position:absolute;inset:-1px;border-radius:inherit;padding:2px;background:conic-gradient(from var(--hro-a),transparent 0 62%,var(--bc) 100%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0);animation:orbit .9s linear infinite;pointer-events:none}
.btn.err{animation:shake .45s;border-color:var(--bad);color:var(--bad)}
.btn .arm{display:none;font-size:11px;font-weight:800;white-space:nowrap}
.btn.armed{--bc:var(--warn);display:flex;gap:6px;width:auto;padding:0 12px;color:var(--warn);border-color:color-mix(in srgb,var(--warn) 65%,transparent);background:color-mix(in srgb,var(--warn) 16%,transparent);animation:armed 1s ease-in-out infinite}
.btn.armed .arm{display:inline}
.btn.light{display:flex;align-items:center;justify-content:flex-start;gap:9px;flex:1 1 auto;width:auto;min-width:42px;padding:0 13px 0 11px;overflow:hidden}
.lf{position:absolute;inset:0;width:calc(var(--level) * 100%);background:linear-gradient(90deg,rgba(var(--lrgb),.1),rgba(var(--lrgb),.36));opacity:0;transition:width .7s var(--ease),opacity .45s,background .6s;pointer-events:none}
.btn.light ha-icon,.btn.light .ll,.btn.light .lv{position:relative}
.ll{overflow:hidden;color:var(--primary-text-color);font-size:12px;font-weight:800;white-space:nowrap;text-overflow:ellipsis}
.lv{margin-left:auto;font-size:12px;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
.btn.light.on{color:color-mix(in srgb,rgb(var(--lrgb)) 62%,#fff);border-color:rgba(var(--lrgb),.55);background:rgba(var(--lrgb),.08);box-shadow:0 0 26px rgba(var(--lrgb),.22),inset 0 0 0 1px rgba(var(--lrgb),.14)}
.btn.light.on .lf{opacity:1}
.btn.light.on ha-icon{filter:drop-shadow(0 0 6px rgba(var(--lrgb),.9))}
.btn.off{--bc:var(--bad);width:0;margin-left:-8px;border-width:0;opacity:0;overflow:hidden;pointer-events:none;transition:width .4s var(--ease),margin .4s var(--ease),opacity .3s,border-color .3s,color .3s,background .3s}
.btn.off.show{width:42px;margin-left:0;border-width:1px;opacity:1;pointer-events:auto}
@media (hover:hover){.btn.off:hover{color:var(--bad);background:color-mix(in srgb,var(--bad) 12%,transparent)}}
.btn.on.anim-spin ha-icon{animation:spin 1.4s linear infinite}
.btn.on.anim-flame ha-icon{animation:flame 1.3s ease-in-out infinite}
.btn.on.anim-bob ha-icon{animation:bob 1.6s ease-in-out infinite}
.btn.on.anim-glow ha-icon{animation:glow 2.6s ease-in-out infinite}
.btn.on.anim-wiggle ha-icon{animation:wiggle 1.4s ease-in-out infinite}
@container roomcard (max-width:1240px){.grid{grid-template-columns:repeat(min(var(--cols,4),3),minmax(0,1fr))}}
@container roomcard (max-width:900px){.top{flex-direction:column;align-items:stretch;gap:16px}.pills{justify-content:flex-start}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@container roomcard (max-width:620px){.shell{padding:14px;border-radius:22px}.top{margin-bottom:14px}h1{font-size:28px}.sub{font-size:12.5px}.pills{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}.pill{flex-direction:column;align-items:center;gap:5px;min-width:0;padding:9px 4px 8px;border-radius:15px;text-align:center}.pill .pi{flex:0 0 auto;width:28px;height:28px;border-radius:9px}.pill .pi ha-icon{--mdc-icon-size:16px}.pill b{font-size:15px}.pill small{margin-top:1px;font-size:8.5px;letter-spacing:.05em}.pill small em{display:none}.grid{grid-template-columns:1fr;gap:9px}}
@container roomcard (max-width:300px){.grid{grid-template-columns:1fr}}
@container tile (max-width:250px){.in{gap:9px;min-height:214px;padding:12px}.head{grid-template-columns:auto minmax(0,1fr);gap:9px}.badge{width:36px;height:36px;border-radius:12px}.badge ha-icon{--mdc-icon-size:20px}.name{font-size:14.5px}.line{gap:5px;margin-top:3px;font-size:10.5px}.clim{grid-column:1/-1;display:flex;align-items:baseline;justify-content:space-between;gap:6px;text-align:left}.temp{font-size:27px}.tu{font-size:13px}.meta{gap:6px;margin-top:0;font-size:10.5px}.chip{height:24px;gap:5px;padding:0 8px 0 6px;font-size:10px}.chips .chip:nth-child(n+3){display:none}.acts{gap:6px}.btn{width:34px;height:34px;border-radius:11px}.btn ha-icon{--mdc-icon-size:18px}.btn.light{min-width:34px;gap:6px;padding:0 9px 0 7px}.btn.light .ll{display:none}.lv{font-size:11px}.btn.opt{display:none}.btn.off{margin-left:-6px}.btn.off.show{width:34px;margin-left:0}.btn.armed{padding:0 9px}.btn .arm{font-size:10px}.spark{bottom:50px;height:60px}.glow{width:120%;top:-40%;right:-55%}}
@container tile (max-width:170px){.btn.light .lv{display:none}.btn.light{flex:0 0 34px;justify-content:center;padding:0}}
@keyframes tileIn{from{opacity:0;transform:translateY(18px) scale(.97)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}}
@keyframes chipIn{from{opacity:0;transform:translateY(5px) scale(.88)}}
@keyframes chipOut{to{opacity:0;transform:scale(.85)}}
@keyframes ping{0%{transform:scale(1);opacity:.75}80%,100%{transform:scale(2.6);opacity:0}}
@keyframes ring{0%{transform:scale(1);opacity:.75}100%{transform:scale(1.6);opacity:0}}
@keyframes breathe{0%,100%{scale:1}50%{scale:1.1}}
@keyframes draw{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes bump{0%{transform:none}35%{transform:translateY(-3px) scale(1.06)}100%{transform:none}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes orbit{to{--hro-a:360deg}}
@keyframes eq{0%,100%{transform:scaleY(.28)}50%{transform:scaleY(1)}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes flame{0%,100%{transform:scale(1) rotate(-3deg)}25%{transform:scale(1.08,1.14) rotate(2deg)}50%{transform:scale(.95,1.03) rotate(-1deg)}75%{transform:scale(1.05,.97) rotate(2deg)}}
@keyframes wiggle{0%,100%{transform:rotate(0)}25%{transform:rotate(-12deg)}75%{transform:rotate(12deg)}}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes glow{0%,100%{filter:drop-shadow(0 0 0 transparent)}50%{filter:drop-shadow(0 0 6px currentColor)}}
@keyframes stripes{to{background-position:24px 0}}
@keyframes alarm{0%,100%{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--bad) 25%,transparent),0 0 0 0 color-mix(in srgb,var(--bad) 0%,transparent)}50%{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--bad) 60%,transparent),0 0 26px 2px color-mix(in srgb,var(--bad) 28%,transparent)}}
@keyframes armed{0%,100%{box-shadow:0 0 0 0 color-mix(in srgb,var(--warn) 40%,transparent)}50%{box-shadow:0 0 0 5px color-mix(in srgb,var(--warn) 0%,transparent)}}
@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-3px)}40%,80%{transform:translateX(3px)}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;animation-delay:0s!important;transition-duration:.001ms!important}}
`;

class HaHomeRoomOverviewCard extends HTMLElement {
  static getStubConfig() {
    return {
      title: "Alle rum",
      rooms: [{
        name: "Stue", icon: "mdi:sofa-outline", popup: "#stue",
        temperature: "sensor.living_room_temperature", humidity: "sensor.living_room_humidity",
        light: "light.living_room", presence: "binary_sensor.living_room_presence",
        actions: [{ entity: "media_player.living_room_tv", name: "TV", icon: "mdi:television" }],
      }],
    };
  }

  static getConfigElement() {
    const editor = document.createElement("ha-card-list-editor");
    editor.definition = {
      roots: [{ key: "title", label: "Titel" }, { key: "desktop_columns", label: "PC-kolonner", type: "number" }],
      collections: [{
        key: "rooms", label: "Rum (hurtigknapper og status redigeres i YAML: actions / status / openings)", itemLabel: "rum",
        defaults: { name: "Nyt rum", icon: "mdi:home-outline" },
        fields: [
          { key: "name", label: "Navn" }, { key: "icon", label: "Ikon" }, { key: "accent", label: "Accentfarve" },
          { key: "popup", label: "Popup-id" }, { key: "temperature", label: "Temperatur", type: "entity" },
          { key: "humidity", label: "Luftfugtighed", type: "entity" }, { key: "light", label: "Lys", type: "entity" },
          { key: "light_name", label: "Lysknap-tekst" }, { key: "presence", label: "Tilstedeværelse", type: "entity" },
          { key: "opening", label: "Vindue/dør", type: "entity" }, { key: "climate", label: "Termostat", type: "entity" },
          { key: "co2", label: "CO₂", type: "entity" }, { key: "weather", label: "Vejr (udendørs)", type: "entity" },
          { key: "info", label: "Info-sensor (vises uden presence)", type: "entity" }, { key: "info_name", label: "Info-tekst" },
        ],
      }],
    };
    return editor;
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._history = new Map();
    this._pending = new Map();
    this._seen = new Map();
    this._batteryCache = new Map();
    this._filter = null;
    this._armed = null;
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.rooms) || !config.rooms.length) throw new Error("rooms is required");
    this.config = config;
    this._rooms = config.rooms.map((room, index) => this._normalize(room, index));
    this._watch = this._watchList();
    this._seen = new Map();
    this._filter = null;
    this._built = false;
    this._build();
    if (this._hass) this._update();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (!this._built) return;
    if (this._changed(hass) || first) this._schedule();
    this._loadHistory();
  }

  getCardSize() { return 12; }

  connectedCallback() {
    if (!this._tick) this._tick = setInterval(() => { this._update(); this._loadHistory(); }, 30000);
    if (this._built && this._hass) this._schedule();
  }

  disconnectedCallback() {
    clearInterval(this._tick);
    this._tick = null;
  }

  _normalize(room, index) {
    const status = arr(room.status).map(item).filter((x) => x.entity);
    if (room.alert?.entity) status.unshift({ entity: room.alert.entity, text: room.alert.active, icon: room.alert.icon, above: room.alert.above });
    const openings = [...arr(room.opening), ...arr(room.openings)].map(item).filter((x) => x.entity);
    const actions = arr(room.actions).map(item).filter((x) => x.entity || x.tap_action).slice(0, 3);
    return { ...room, index, status, openings, actions };
  }

  _watchList() {
    const ids = new Set();
    const add = (id) => { if (typeof id === "string" && id.includes(".")) ids.add(id); };
    for (const room of this._rooms) {
      [room.temperature, room.humidity, room.light, room.presence, room.climate, room.co2, room.weather, room.info].forEach(add);
      arr(room.batteries).forEach(add);
      room.openings.forEach((x) => add(x.entity));
      room.status.forEach((x) => { add(x.entity); add(x.progress); add(x.remaining); });
      room.actions.forEach((x) => add(x.entity));
    }
    return [...ids];
  }

  _changed(hass) {
    let changed = false;
    const check = (id) => {
      const st = hass.states[id];
      if (this._seen.get(id) !== st) { this._seen.set(id, st); changed = true; }
    };
    this._watch.forEach(check);
    for (const room of this._rooms) {
      for (const opening of room.openings) {
        const members = hass.states[opening.entity]?.attributes?.entity_id;
        if (Array.isArray(members)) members.forEach(check);
      }
    }
    const lang = hass.locale?.language || hass.language;
    if (lang !== this._lang) { this._lang = lang; changed = true; }
    return changed;
  }

  _schedule() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = null; this._update(); });
  }

  _state(id) { return id ? this._hass?.states?.[id] : undefined; }
  _num(id) {
    const st = typeof id === "string" ? this._state(id) : id;
    if (!st || DEAD.has(st.state)) return null;
    const value = Number(st.state);
    return Number.isFinite(value) ? value : null;
  }
  _fmt(value, digits = 1) {
    if (value == null || !Number.isFinite(value)) return "–";
    return value.toLocaleString(this._lang || "da", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  _dur(minutes) {
    if (minutes == null || !Number.isFinite(minutes)) return "";
    const m = Math.max(0, Math.round(minutes));
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60), rest = m % 60;
    if (h < 24) return rest && h < 10 ? `${h} t ${rest} min` : `${h} t`;
    const d = Math.floor(h / 24);
    return d < 3 && h % 24 ? `${d} d ${h % 24} t` : `${d} d`;
  }
  _since(st) {
    const time = Date.parse(st?.last_changed);
    return Number.isFinite(time) ? (Date.now() - time) / 60000 : null;
  }
  _minutes(st) {
    if (!st || DEAD.has(st.state)) return null;
    if (st.attributes?.device_class === "timestamp") {
      const end = Date.parse(st.state);
      return Number.isFinite(end) ? Math.max(0, (end - Date.now()) / 60000) : null;
    }
    const value = Number(st.state);
    if (!Number.isFinite(value)) return null;
    const unit = st.attributes?.unit_of_measurement;
    return unit === "h" ? value * 60 : unit === "s" ? value / 60 : unit === "d" ? value * 1440 : value;
  }
  _name(id) { return this._state(id)?.attributes?.friendly_name || id; }
  _isOn(id) {
    const st = this._state(id);
    if (!st) return false;
    const domain = id.split(".")[0];
    if (domain === "media_player") return !MEDIA_OFF.has(st.state);
    if (domain === "lock") return st.state !== "locked";
    if (domain === "climate") return st.state !== "off" && !DEAD.has(st.state);
    if (domain === "vacuum") return ["cleaning", "returning"].includes(st.state);
    return ["on", "open", "opening", "playing", "home", "active"].includes(st.state);
  }
  _lightRgb(st) {
    const a = st?.attributes || {};
    let rgb = Array.isArray(a.rgb_color) ? a.rgb_color : a.color_temp_kelvin ? kelvinRgb(a.color_temp_kelvin) : Array.isArray(a.hs_color) ? hsRgb(a.hs_color[0], a.hs_color[1]) : [255, 190, 110];
    const max = Math.max(...rgb);
    if (max > 0 && max < 200) rgb = rgb.map((v) => Math.round(v * 200 / max));
    return rgb.map((v) => clamp(Math.round(v), 0, 255));
  }

  _openParts(room) {
    const parts = [];
    for (const opening of room.openings) {
      const st = this._state(opening.entity);
      if (!st) continue;
      const members = Array.isArray(st.attributes?.entity_id) ? st.attributes.entity_id.map((id) => this._state(id)).filter(Boolean) : [];
      const open = members.filter((m) => OPEN_STATES.has(m.state));
      const list = open.length ? open : OPEN_STATES.has(st.state) ? [st] : [];
      for (const part of list) {
        const dc = part.attributes?.device_class;
        const label = members.length && opening.names?.[part.entity_id] ? opening.names[part.entity_id] : !members.length && opening.name ? opening.name : OPENING_LABEL[dc] || opening.name || "Åbning";
        parts.push({ st: part, dc, label });
      }
    }
    return parts;
  }

  _lowBattery(room, climate) {
    const values = [];
    const raw = climate?.attributes?.batteries;
    if (raw) {
      let parsed = this._batteryCache.get(raw);
      if (parsed === undefined) {
        try { parsed = typeof raw === "string" ? JSON.parse(raw) : raw; } catch (_) { parsed = null; }
        this._batteryCache.set(raw, parsed);
        if (this._batteryCache.size > 64) this._batteryCache.delete(this._batteryCache.keys().next().value);
      }
      if (parsed && typeof parsed === "object") Object.values(parsed).forEach((x) => values.push(Number(x?.battery)));
    }
    arr(room.batteries).forEach((id) => values.push(this._num(id)));
    const valid = values.filter((v) => Number.isFinite(v));
    if (!valid.length) return null;
    const min = Math.min(...valid);
    return min <= (room.battery_low ?? this.config.battery_low ?? 15) ? Math.round(min) : null;
  }

  _statusChip(cfg, index) {
    const st = this._state(cfg.entity);
    if (!st || DEAD.has(st.state)) return null;
    const domain = cfg.entity.split(".")[0];
    const dc = st.attributes?.device_class;
    const name = cfg.name || st.attributes?.friendly_name || cfg.entity;
    const chip = { key: `s${index}`, tone: cfg.tone || "active", icon: cfg.icon || st.attributes?.icon || DOMAIN_ICON[domain] || "mdi:information-outline", text: cfg.text || name, meta: "", anim: cfg.animation, tap: cfg.tap_action, entity: cfg.entity, running: true };
    const kind = cfg.kind || (domain === "lock" ? "lock" : domain === "media_player" ? "media" : domain === "vacuum" ? "vacuum" : ["moisture", "smoke", "gas", "carbon_monoxide", "safety"].includes(dc) ? "alarm" : cfg.progress || cfg.remaining ? "task" : "state");
    if (kind === "lock") {
      if (st.state === "locked") return null;
      chip.running = false;
      if (st.state === "jammed") return { ...chip, tone: "danger", icon: "mdi:lock-alert", text: `${name} blokeret` };
      if (["locking", "unlocking", "opening"].includes(st.state)) return { ...chip, tone: "active", icon: "mdi:lock-clock", text: st.state === "locking" ? `${name} låser` : `${name} låser op` };
      return { ...chip, tone: cfg.tone || "warn", icon: cfg.icon || "mdi:lock-open-variant", text: cfg.text || `${name} ulåst`, meta: this._dur(this._since(st)) };
    }
    if (kind === "media") {
      if (st.state !== "playing" && !(cfg.show_paused && st.state === "paused")) return null;
      const a = st.attributes || {};
      const what = cfg.text || a.app_name || a.media_title || a.source || name;
      return { ...chip, text: what, meta: cfg.text ? "" : (a.app_name && a.media_title ? "" : ""), eq: st.state === "playing", icon: st.state === "paused" ? "mdi:pause" : chip.icon };
    }
    if (kind === "vacuum") {
      if (st.state === "error") return { ...chip, tone: "danger", icon: "mdi:robot-vacuum-alert", text: `${name} fejl`, running: false };
      if (st.state === "cleaning") return { ...chip, icon: cfg.icon || "mdi:robot-vacuum", text: `${name} støvsuger`, anim: cfg.animation || "wiggle" };
      if (st.state === "returning") return { ...chip, icon: cfg.icon || "mdi:home-import-outline", text: `${name} kører hjem` };
      return null;
    }
    if (kind === "alarm") {
      if (!OPEN_STATES.has(st.state)) return null;
      return { ...chip, tone: "critical", icon: cfg.icon || "mdi:water-alert", text: cfg.text || `${name}!`, anim: "pulse", running: false };
    }
    let active;
    if (cfg.above != null) active = (this._num(st) ?? -Infinity) > Number(cfg.above);
    else if (cfg.active_states) active = arr(cfg.active_states).includes(st.state);
    else if (cfg.hide_states) active = !arr(cfg.hide_states).includes(st.state);
    else active = ["on", "open", "playing", "running", "true", "active", "home"].includes(st.state);
    if (!active) return null;
    if (kind === "task") {
      const progress = this._num(cfg.progress);
      const remaining = this._minutes(this._state(cfg.remaining));
      chip.progress = progress == null ? null : clamp(progress, 0, 100);
      chip.meta = remaining != null && remaining > 0 ? this._dur(remaining) : progress != null ? `${Math.round(progress)}%` : "";
      return chip;
    }
    if (cfg.show_state) chip.meta = domain === "sensor" && this._num(st) != null ? `${this._fmt(this._num(st), cfg.digits ?? 0)} ${st.attributes?.unit_of_measurement || ""}`.trim() : st.state;
    if (chip.tone !== "active") chip.running = false;
    return chip;
  }

  _chips(room, ctx) {
    const out = [];
    if (ctx.open.length) {
      const first = ctx.open[0];
      const icon = first.dc === "window" ? "mdi:window-open-variant" : first.dc === "garage_door" ? "mdi:garage-open-variant" : "mdi:door-open";
      const text = ctx.open.length > 1 ? `${ctx.open.length} åbninger` : `${first.label} åben`;
      out.push({ key: "open", tone: "danger", icon, text, meta: this._dur(Math.max(...ctx.open.map((p) => this._since(p.st) ?? 0))), anim: "pulse" });
    }
    if (room.temperature && ctx.tempDead) out.push({ key: "offline", tone: "warn", icon: "mdi:thermometer-off", text: "Sensor offline" });
    if (!room.outdoor && ctx.humidity != null && ctx.humidity >= (room.humidity_critical ?? 70)) out.push({ key: "hum", tone: "warn", icon: "mdi:water-alert-outline", text: "Høj fugt", meta: `${this._fmt(ctx.humidity, 0)}%` });
    const co2 = this._num(room.co2);
    if (co2 != null && co2 >= (room.co2_warning ?? 1000)) out.push({ key: "co2", tone: co2 >= (room.co2_critical ?? 1400) ? "danger" : "warn", icon: "mdi:molecule-co2", text: "Luft ud", meta: `${this._fmt(co2, 0)} ppm` });
    const battery = this._lowBattery(room, ctx.climate);
    if (battery != null) out.push({ key: "bat", tone: "warn", icon: "mdi:battery-alert-variant-outline", text: "Lavt batteri", meta: `${battery}%` });
    room.status.forEach((cfg, index) => { const chip = this._statusChip(cfg, index); if (chip) out.push(chip); });
    return out.map((chip, order) => ({ ...chip, order })).sort((a, b) => (TONE_RANK[a.tone] ?? 9) - (TONE_RANK[b.tone] ?? 9) || a.order - b.order);
  }

  _line(room, ctx) {
    if (room.weather) {
      const w = this._state(room.weather);
      if (w && !DEAD.has(w.state)) {
        const label = WEATHER[w.state]?.[0] || w.state;
        const wind = Number(w.attributes?.wind_speed);
        const unit = String(w.attributes?.wind_speed_unit || "km/h").replace("km/h", "km/t");
        return { text: `${label}${Number.isFinite(wind) ? ` · ${this._fmt(wind, 0)} ${unit}` : ""}`, cls: "weather" };
      }
    }
    const presence = this._state(room.presence);
    if (presence) {
      if (DEAD.has(presence.state)) return { text: "Sensor offline", cls: "off" };
      const motion = presence.attributes?.device_class === "motion";
      if (ctx.present) return { text: motion ? "Bevægelse nu" : "Aktivitet nu", cls: "live" };
      const since = this._since(presence);
      if (since != null && since < 2) return { text: motion ? "Stille lige nu" : "Lige forladt", cls: "" };
      return { text: since == null ? (motion ? "Stille" : "Tomt") : `${motion ? "Stille" : "Tomt"} i ${this._dur(since)}`, cls: "" };
    }
    const info = this._state(room.info);
    if (info && !DEAD.has(info.state)) {
      const unit = info.attributes?.unit_of_measurement;
      const value = ["h", "min", "s", "d"].includes(unit) ? this._dur(this._minutes(info)) : `${info.state}${unit ? ` ${unit}` : ""}`;
      return { text: `${room.info_name || info.attributes?.friendly_name || ""} ${value}`.trim(), cls: "" };
    }
    return { text: ctx.lightOn ? "Lys tændt" : "Alt slukket", cls: "" };
  }

  _model(room) {
    const tempState = this._state(room.temperature);
    const temp = this._num(tempState);
    const humidity = this._num(room.humidity);
    const light = this._state(room.light);
    const lightOn = light?.state === "on";
    const level = lightOn ? clamp(Math.round((light.attributes?.brightness ?? 255) / 2.55), 1, 100) : 0;
    const presence = this._state(room.presence);
    const present = !!presence && PRESENT_STATES.has(presence.state);
    const climate = this._state(room.climate);
    const target = Number(climate?.attributes?.temperature);
    const open = this._openParts(room);
    const ctx = { humidity, lightOn, present, climate, open, tempDead: !tempState || DEAD.has(tempState.state) };
    const chips = this._chips(room, ctx);
    const mediaOn = [...room.actions, ...room.status].some((x) => x.entity?.startsWith("media_player.") && this._isOn(x.entity));
    return {
      room, temp, humidity, light, lightOn, level, present, climate, open, chips, mediaOn,
      rgb: lightOn ? this._lightRgb(light) : null,
      target: Number.isFinite(target) ? target : null,
      heating: climate?.attributes?.hvac_action === "heating",
      climateOff: climate?.state === "off",
      running: chips.some((c) => c.running && c.tone === "active"),
      alarm: chips.some((c) => c.tone === "danger" || c.tone === "critical"),
      critical: chips.some((c) => c.tone === "critical"),
      line: this._line(room, { ...ctx }),
    };
  }

  _build() {
    const cols = clamp(Number(this.config.desktop_columns) || 4, 2, 6);
    this.shadowRoot.innerHTML = `<style>${STYLE}</style><section class="shell" style="--cols:${cols}">
      <header class="top"><div class="intro"><div class="eyebrow"><i class="live"></i>${esc(this.config.eyebrow || "Hjemmet lige nu")}</div><h1>${esc(this.config.title || "Alle rum")}</h1><div class="sub"></div></div>
      <div class="pills">${PILLS.map((p) => `<button class="pill" type="button" data-pill="${p.key}"${p.filter ? ` data-filter="${p.key}" aria-pressed="false" title="Fremhæv rum"` : " tabindex=\"-1\""}><span class="pi"><ha-icon icon="${p.icon}"></ha-icon></span><span><b>–</b><small>${p.label}${p.key === "temp" ? "<em></em>" : ""}</small></span></button>`).join("")}</div></header>
      <div class="grid">${this._rooms.map((room) => this._tileHtml(room)).join("")}</div></section>`;
    const root = this.shadowRoot;
    this._grid = root.querySelector(".grid");
    this._sub = root.querySelector(".sub");
    this._pills = Object.fromEntries([...root.querySelectorAll(".pill")].map((el) => [el.dataset.pill, el]));
    this._tiles = [...root.querySelectorAll(".tile")].map((el, index) => this._refs(el, this._rooms[index]));
    Object.values(this._pills).forEach((el) => {
      if (!el.dataset.filter) return;
      el.addEventListener("click", () => { this._filter = this._filter === el.dataset.filter ? null : el.dataset.filter; this._update(); });
    });
    this._tiles.forEach((t) => this._bindTile(t));
    this._built = true;
  }

  _tileHtml(room) {
    const id = `hro-g${room.index}`;
    const actions = room.actions.map((a, i) => `<button class="btn act${i >= 2 ? " opt" : ""}" type="button" data-a="${i}"><ha-icon icon="${esc(a.icon || "mdi:gesture-tap")}"></ha-icon><span class="arm"></span></button>`).join("");
    return `<article class="tile" style="--i:${room.index};--accent:${esc(room.accent || "var(--brand)")}" role="button" tabindex="0" aria-label="${esc(`Åbn ${room.name || "rum"}`)}">
      <div class="glow"></div>
      <svg class="spark" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="s0"/><stop offset="1" class="s1"/></linearGradient></defs><path class="area" fill="url(#${id})"/><polyline class="stroke"/></svg>
      <div class="in">
        <div class="head"><div class="badge"><span class="rings"><i></i><i></i></span><ha-icon icon="${esc(room.icon || "mdi:home-outline")}"></ha-icon></div>
          <div class="ident"><div class="name">${esc(room.name || "Rum")}</div><div class="line"><i class="dot"></i><span class="lt"></span></div></div>
          <div class="clim"><div class="temp"><span class="tv">–</span><span class="tu">°</span><ha-icon class="trend"></ha-icon></div><div class="meta"><span class="hum"><ha-icon icon="mdi:water-percent"></ha-icon><b></b></span><span class="tgt"><ha-icon icon="mdi:thermostat"></ha-icon><b></b></span></div></div></div>
        <div class="chips"></div>
        <div class="acts">${room.light ? `<button class="btn light" type="button"><span class="lf"></span><ha-icon icon="mdi:lightbulb-outline"></ha-icon><span class="ll">${esc(room.light_name || "Lys")}</span><span class="lv"></span></button>` : ""}${actions}${room.room_off ? `<button class="btn off" type="button" aria-label="Sluk rummet" title="Sluk rummet (lys og medier)"><ha-icon icon="mdi:power"></ha-icon></button>` : ""}</div>
      </div></article>`;
  }

  _refs(el, room) {
    const q = (selector) => el.querySelector(selector);
    return {
      el, room, glow: q(".glow"), spark: q(".spark"), area: q(".area"), stroke: q(".stroke"), badgeIcon: q(".badge > ha-icon"),
      line: q(".line"), lt: q(".lt"), tv: q(".tv"), tu: q(".tu"), trend: q(".trend"), hum: q(".hum"), humB: q(".hum b"),
      tgt: q(".tgt"), tgtB: q(".tgt b"), tgtIcon: q(".tgt ha-icon"), chips: q(".chips"), light: q(".btn.light"),
      lightIcon: q(".btn.light ha-icon"), lv: q(".lv"), acts: [...el.querySelectorAll(".btn.act")], off: q(".btn.off"),
    };
  }

  _bindTile(t) {
    const { el, room } = t;
    el.addEventListener("click", () => this._navigate(room.popup));
    el.addEventListener("keydown", (event) => {
      if ((event.key === "Enter" || event.key === " ") && event.target === el) { event.preventDefault(); this._navigate(room.popup); }
    });
    el.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "mouse") return;
      const rect = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      el.style.setProperty("--my", `${event.clientY - rect.top}px`);
    });
    el.addEventListener("pointerdown", (event) => { if (!event.target.closest?.(".btn,.chip.tap")) el.classList.add("press"); });
    ["pointerup", "pointerleave", "pointercancel"].forEach((type) => el.addEventListener(type, () => el.classList.remove("press")));
    if (t.light) this._press(t.light, () => this._tapLight(t), () => this._moreInfo(room.light));
    t.acts.forEach((button, index) => this._press(button, () => this._tapAction(t, index), () => this._holdAction(t, index)));
    if (t.off) this._press(t.off, () => this._roomOff(t), null);
  }

  _press(el, onTap, onHold) {
    let timer = null, held = false, x = 0, y = 0;
    const cancel = () => { clearTimeout(timer); timer = null; };
    el.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      if (event.button > 0) return;
      held = false; x = event.clientX; y = event.clientY; cancel();
      if (onHold) timer = setTimeout(() => { timer = null; held = true; navigator.vibrate?.(12); onHold(); }, 520);
    });
    el.addEventListener("pointermove", (event) => { if (timer && Math.hypot(event.clientX - x, event.clientY - y) > 10) cancel(); });
    ["pointerup", "pointerleave", "pointercancel"].forEach((type) => el.addEventListener(type, cancel));
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      if (held) { held = false; return; }
      onTap(event);
    });
    el.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") event.stopPropagation(); });
    el.addEventListener("contextmenu", (event) => { if (onHold) event.preventDefault(); });
  }

  _update() {
    if (!this._built || !this._hass) return;
    const models = this._rooms.map((room) => {
      try { return this._model(room); } catch (err) { console.warn("Room overview:", room.name, err); return null; }
    });
    try { this._patchHeader(models.filter(Boolean)); } catch (err) { console.warn("Room overview header:", err); }
    models.forEach((model, index) => {
      if (!model) return;
      try { this._patchTile(this._tiles[index], model); } catch (err) { console.warn("Room overview:", model.room.name, err); }
    });
  }

  _setText(el, text, bump = false) {
    if (!el || el.textContent === text) return;
    const had = el.textContent !== "" && el.textContent !== "–";
    el.textContent = text;
    if (bump && had) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
  }

  _patchHeader(models) {
    const indoor = models.filter((m) => !m.room.outdoor && m.temp != null).map((m) => m.temp);
    const avg = indoor.length ? indoor.reduce((a, b) => a + b, 0) / indoor.length : null;
    const outdoor = models.find((m) => m.room.outdoor && m.temp != null)?.temp ?? null;
    const counts = {
      occupied: models.filter((m) => m.present).length,
      lit: models.filter((m) => m.lightOn).length,
      open: models.reduce((n, m) => n + m.open.length, 0),
      running: models.filter((m) => m.running).length,
    };
    this._setText(this._pills.temp.querySelector("b"), `${this._fmt(avg)}°`, true);
    this._setText(this._pills.temp.querySelector("em"), outdoor == null ? "" : ` · ude ${this._fmt(outdoor, 0)}°`);
    for (const key of ["occupied", "lit", "open", "running"]) {
      const pill = this._pills[key];
      this._setText(pill.querySelector("b"), String(counts[key]), true);
      pill.classList.toggle("zero", counts[key] === 0);
      pill.classList.toggle("hot", key === "open" && counts[key] > 0);
      pill.classList.toggle("sel", this._filter === key);
      pill.setAttribute("aria-pressed", String(this._filter === key));
    }
    const parts = [];
    if (counts.occupied) parts.push(`aktivitet i ${counts.occupied} rum`);
    if (counts.lit) parts.push(`lys tændt i ${counts.lit} rum`);
    if (counts.open) parts.push(counts.open === 1 ? "1 åbning står åben" : `${counts.open} åbninger står åbne`);
    if (counts.running) parts.push(`${counts.running} ${counts.running === 1 ? "rum" : "rum"} med noget i gang`);
    const sentence = parts.length ? parts.join(" · ") : "alt er roligt i huset";
    this._setText(this._sub, sentence.charAt(0).toUpperCase() + sentence.slice(1));
    if (this._filter) this._grid.dataset.filter = this._filter; else delete this._grid.dataset.filter;
  }

  _patchTile(t, m) {
    const { el, room } = t;
    const match = this._filter === "occupied" ? m.present : this._filter === "lit" ? m.lightOn : this._filter === "open" ? m.open.length > 0 : this._filter === "running" ? m.running : false;
    el.classList.toggle("match", !!match);
    el.classList.toggle("lit", m.lightOn);
    el.classList.toggle("occupied", m.present);
    el.classList.toggle("alarm", m.alarm);
    el.classList.toggle("critical", m.critical);
    if (m.rgb) el.style.setProperty("--lrgb", m.rgb.join(","));
    el.style.setProperty("--level", String(m.level / 100));

    if (room.weather) {
      const w = this._state(room.weather);
      const icon = (w && WEATHER[w.state]?.[1]) || room.icon || "mdi:weather-partly-cloudy";
      if (t.badgeIcon.getAttribute("icon") !== icon) t.badgeIcon.setAttribute("icon", icon);
    }
    t.line.className = `line ${m.line.cls}`;
    this._setText(t.lt, m.line.text);

    this._setText(t.tv, this._fmt(m.temp), true);
    const trend = this._trend(room, m.temp);
    t.trend.className = `trend ${trend || ""}`;
    if (trend) t.trend.setAttribute("icon", trend === "up" ? "mdi:arrow-top-right" : "mdi:arrow-bottom-right");
    t.trend.title = trend === "up" ? "Stigende den seneste time" : trend === "down" ? "Faldende den seneste time" : "";

    t.hum.classList.toggle("hide", m.humidity == null);
    t.hum.classList.toggle("crit", !room.outdoor && m.humidity != null && m.humidity >= (room.humidity_critical ?? 70));
    this._setText(t.humB, `${this._fmt(m.humidity, 0)}%`);
    const showTarget = !!room.climate && (m.target != null || m.climateOff);
    t.tgt.classList.toggle("hide", !showTarget);
    t.tgt.classList.toggle("heat", m.heating);
    t.tgt.title = m.heating ? "Varmer op mod måltemperaturen" : m.climateOff ? "Varme slukket" : "Måltemperatur";
    const tgtIcon = m.heating ? "mdi:fire" : m.climateOff ? "mdi:thermostat-off" : "mdi:thermostat";
    if (t.tgtIcon.getAttribute("icon") !== tgtIcon) t.tgtIcon.setAttribute("icon", tgtIcon);
    this._setText(t.tgtB, m.climateOff ? "Fra" : `${this._fmt(m.target, m.target != null && m.target % 1 ? 1 : 0)}°`);

    this._syncChips(t, m.chips);
    this._patchActions(t, m);
    this._patchSpark(t, room);
  }

  _syncChips(t, chips) {
    const container = t.chips;
    const visible = chips.slice(0, 3);
    const current = new Map([...container.children].filter((el) => !el.classList.contains("out")).map((el) => [el.dataset.key, el]));
    const keep = new Set(visible.map((c) => c.key));
    current.forEach((el, key) => {
      if (keep.has(key)) return;
      el.classList.add("out");
      container.append(el);
      setTimeout(() => el.remove(), 340);
    });
    visible.forEach((chip, index) => {
      let el = current.get(chip.key);
      if (!el) {
        el = document.createElement("div");
        el.dataset.key = chip.key;
        el.innerHTML = `<span class="ci"><ha-icon></ha-icon><span class="eq"><i></i><i></i><i></i><i></i></span></span><span class="ct"></span><span class="cm"></span>`;
        el.addEventListener("click", (event) => {
          if (!el._tap) return;
          event.stopPropagation();
          this._runAction(el._tap, el._entity);
        });
      }
      el.className = `chip ${chip.tone}${chip.anim ? ` anim-${chip.anim}` : ""}${chip.progress != null ? " prog" : ""}${chip.tap ? " tap" : ""}${chip.eq ? " eqon" : ""}`;
      el._tap = chip.tap || null;
      el._entity = chip.entity;
      el.title = chip.tap ? `${chip.text} – tryk for at nulstille` : [chip.text, chip.meta].filter(Boolean).join(" · ");
      if (chip.progress != null) el.style.setProperty("--p", `${chip.progress}%`); else el.style.removeProperty("--p");
      const icon = el.querySelector("ha-icon");
      if (icon.getAttribute("icon") !== chip.icon) icon.setAttribute("icon", chip.icon);
      this._setText(el.querySelector(".ct"), chip.text);
      this._setText(el.querySelector(".cm"), chip.meta || "");
      const at = container.children[index];
      if (at !== el) container.insertBefore(el, at || null);
    });
  }

  _patchActions(t, m) {
    const { room } = t;
    if (t.light) {
      const dead = !m.light || DEAD.has(m.light.state);
      t.light.classList.toggle("on", m.lightOn);
      t.light.classList.toggle("unavail", dead);
      t.light.classList.toggle("pending", this._isPending(room.light));
      t.light.setAttribute("aria-pressed", String(m.lightOn));
      const icon = m.lightOn ? "mdi:lightbulb-on" : dead ? "mdi:lightbulb-off-outline" : "mdi:lightbulb-outline";
      if (t.lightIcon.getAttribute("icon") !== icon) t.lightIcon.setAttribute("icon", icon);
      this._setText(t.lv, m.lightOn ? `${m.level}%` : dead ? "Offline" : "Fra");
      const members = Array.isArray(m.light?.attributes?.entity_id) ? m.light.attributes.entity_id : [];
      const onCount = members.filter((id) => this._state(id)?.state === "on").length;
      t.light.title = `${room.light_name || "Lys"}: ${m.lightOn ? `tændt ${m.level}%` : "slukket"}${members.length ? ` (${onCount} af ${members.length} tændt)` : ""} – hold for detaljer`;
    }
    t.acts.forEach((button, index) => {
      const cfg = room.actions[index];
      const st = this._state(cfg.entity);
      const domain = cfg.entity?.split(".")[0];
      const dead = !!cfg.entity && (!st || DEAD.has(st.state));
      const on = cfg.entity ? this._isOn(cfg.entity) : false;
      const lock = domain === "lock";
      const armed = this._armed?.key === `${room.index}:${index}`;
      button.classList.toggle("on", lock ? on : on);
      button.classList.toggle("secure", lock && st?.state === "locked");
      button.classList.toggle("unavail", dead);
      button.classList.toggle("pending", !!cfg.entity && this._isPending(cfg.entity));
      button.classList.toggle("armed", armed);
      if (lock) button.style.setProperty("--bc", "var(--warn)");
      else if (domain === "light" && on) button.style.setProperty("--bc", `rgb(${this._lightRgb(st).join(",")})`);
      else if (cfg.color) button.style.setProperty("--bc", cfg.color);
      else button.style.removeProperty("--bc");
      const anim = cfg.animation || (domain === "fan" ? "spin" : domain === "valve" ? "bob" : domain === "media_player" ? "glow" : "");
      ["spin", "flame", "bob", "glow", "wiggle"].forEach((name) => button.classList.toggle(`anim-${name}`, anim === name));
      const icon = lock ? (st?.state === "locked" ? "mdi:lock" : st?.state === "jammed" ? "mdi:lock-alert" : "mdi:lock-open-variant") : (on && cfg.icon_on) || cfg.icon || st?.attributes?.icon || DOMAIN_ICON[domain] || "mdi:gesture-tap";
      const iconEl = button.querySelector("ha-icon");
      if (iconEl.getAttribute("icon") !== icon) iconEl.setAttribute("icon", icon);
      this._setText(button.querySelector(".arm"), armed ? this._armed.label : "");
      const name = cfg.name || (cfg.entity ? this._name(cfg.entity) : "Handling");
      const stateText = dead ? "ikke tilgængelig" : lock ? (st.state === "locked" ? "låst" : st.state === "unlocked" ? "ulåst" : st.state) : on ? "til" : "fra";
      button.title = `${name}: ${stateText}${cfg.entity ? " – hold for detaljer" : ""}`;
      button.setAttribute("aria-label", `${name}: ${stateText}`);
      button.setAttribute("aria-pressed", String(on));
    });
    if (t.off) {
      const show = m.lightOn || m.mediaOn;
      t.off.classList.toggle("show", show);
      t.off.classList.toggle("pending", !!room.light && this._isPending(`off:${room.index}`));
    }
  }

  _trend(room, current) {
    const points = this._history.get(room.temperature);
    if (!points?.length || current == null) return null;
    const cutoff = Date.now() - 3600e3;
    let past = null;
    for (const point of points) { if (point.t <= cutoff) past = point.v; else break; }
    if (past == null) return null;
    const diff = current - past;
    return diff >= (room.trend_threshold ?? 0.3) ? "up" : diff <= -(room.trend_threshold ?? 0.3) ? "down" : null;
  }

  _patchSpark(t, room) {
    const points = this._history.get(room.temperature);
    const signature = points?.length ? `${this._historyVersion}:${points.length}` : "";
    if (t.sparkSig === signature) return;
    t.sparkSig = signature;
    if (!points || points.length < 2) { t.spark.style.display = "none"; return; }
    const start = this._historyStart, end = this._historyEnd;
    const values = points.map((p) => p.v);
    let min = Math.min(...values), max = Math.max(...values);
    if (max - min < 0.8) { const mid = (max + min) / 2; min = mid - 0.4; max = mid + 0.4; }
    const coords = points.map((p) => [clamp((p.t - start) / (end - start) * 100, 0, 100), 37 - (p.v - min) / (max - min) * 30]);
    coords.push([100, coords[coords.length - 1][1]]);
    const line = coords.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
    t.stroke.setAttribute("points", line);
    t.area.setAttribute("d", `M${coords[0][0].toFixed(2)},40 L${line.replace(/ /g, " L")} L100,40 Z`);
    t.spark.style.display = "";
    if (!t.sparkDrawn) { t.sparkDrawn = true; t.spark.classList.add("draw"); }
  }

  async _loadHistory() {
    if (!this._hass || this._historyLoading || !this.isConnected) return;
    if (this._historyAt && Date.now() - this._historyAt < 600000) return;
    const ids = [...new Set(this._rooms.map((r) => r.temperature).filter(Boolean))];
    if (!ids.length) return;
    this._historyLoading = true;
    const end = Date.now(), start = end - 24 * 3600e3;
    try {
      let series;
      try {
        const result = await this._hass.callWS({ type: "history/history_during_period", start_time: new Date(start).toISOString(), end_time: new Date(end).toISOString(), entity_ids: ids, minimal_response: true, no_attributes: true, significant_changes_only: true });
        series = Object.entries(result || {}).map(([id, rows]) => [id, rows.map((r) => ({ v: Number(r.s), t: (r.lu ?? r.lc) * 1000 }))]);
      } catch (_) {
        const data = await this._hass.callApi("GET", `history/period/${new Date(start).toISOString()}?filter_entity_id=${encodeURIComponent(ids.join(","))}&minimal_response&no_attributes&significant_changes_only`);
        series = (data || []).filter((rows) => rows?.length).map((rows) => [rows[0].entity_id, rows.map((r) => ({ v: Number(r.state), t: Date.parse(r.last_changed || r.last_updated) }))]);
      }
      for (const [id, rows] of series) {
        const points = rows.filter((p) => Number.isFinite(p.v) && Number.isFinite(p.t)).sort((a, b) => a.t - b.t);
        const step = Math.max(1, Math.ceil(points.length / 90));
        this._history.set(id, points.filter((_, i) => i % step === 0 || i === points.length - 1));
      }
      this._historyStart = start;
      this._historyEnd = end;
      this._historyVersion = (this._historyVersion || 0) + 1;
    } catch (err) {
      console.warn("Room overview history", err);
    } finally {
      this._historyLoading = false;
      this._historyAt = Date.now();
      this._schedule();
    }
  }

  _isPending(id) {
    const pending = this._pending.get(id);
    if (!pending) return false;
    const st = this._state(pending.entity || id);
    if (Date.now() > pending.until || st?.state !== pending.state) { this._pending.delete(id); return false; }
    return true;
  }

  _setPending(id, entity = id) {
    this._pending.set(id, { entity, state: this._state(entity)?.state, until: Date.now() + 8000 });
    clearTimeout(this._pendingTimer);
    this._pendingTimer = setTimeout(() => this._schedule(), 8100);
    this._schedule();
  }

  _flash(el) {
    if (!el) return;
    el.classList.remove("err");
    void el.offsetWidth;
    el.classList.add("err");
    setTimeout(() => el.classList.remove("err"), 600);
  }

  _call(domain, service, data, target, pendingId, pendingEntity, el) {
    if (pendingId) this._setPending(pendingId, pendingEntity);
    return this._hass.callService(domain, service, data, target).catch((err) => {
      console.warn("Room overview action failed", `${domain}.${service}`, err);
      if (pendingId) this._pending.delete(pendingId);
      this._flash(el);
      this._schedule();
    });
  }

  _toggle(entity, el) {
    const st = this._state(entity);
    if (!st) return;
    const domain = entity.split(".")[0];
    const call = (service, svcDomain = domain) => this._call(svcDomain, service, { entity_id: entity }, undefined, entity, entity, el);
    if (DEAD.has(st.state)) return this._moreInfo(entity);
    switch (domain) {
      case "lock": return call(st.state === "locked" ? "unlock" : "lock");
      case "media_player": return call(MEDIA_OFF.has(st.state) ? "turn_on" : "turn_off");
      case "cover": case "valve": case "light": case "switch": case "fan": case "input_boolean": case "automation": case "siren": case "humidifier": return call("toggle");
      case "vacuum": return call(st.state === "cleaning" ? "return_to_base" : "start");
      case "script": case "scene": return call("turn_on");
      case "button": case "input_button": return call("press");
      case "climate": case "sensor": case "binary_sensor": return this._moreInfo(entity);
      default: return call("toggle", "homeassistant");
    }
  }

  _runAction(cfg, entity, el) {
    const type = cfg?.action || "toggle";
    if (type === "none") return;
    if (type === "more-info") return this._moreInfo(cfg.entity || entity);
    if (type === "navigate") {
      const path = cfg.navigation_path;
      if (!path) return;
      if (path.startsWith("#")) return this._navigate(path);
      history.pushState(null, "", path);
      window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
      return;
    }
    if (type === "url") { if (cfg.url_path) window.open(cfg.url_path, cfg.new_tab === false ? "_self" : "_blank"); return; }
    if (type === "perform-action" || type === "call-service") {
      const service = cfg.perform_action || cfg.service;
      if (!service?.includes(".")) return;
      const [domain, name] = service.split(".");
      return this._call(domain, name, cfg.data || cfg.service_data || {}, cfg.target, entity, entity, el);
    }
    if (entity) return this._toggle(entity, el);
  }

  _needsConfirm(cfg) {
    if (cfg.confirm === "always" || cfg.tap_action?.confirmation) return true;
    if (!cfg.confirm || !cfg.entity) return false;
    const st = this._state(cfg.entity);
    if (cfg.entity.startsWith("lock.")) return st?.state === "locked";
    return this._isOn(cfg.entity);
  }

  _tapAction(t, index) {
    const cfg = t.room.actions[index];
    const button = t.acts[index];
    const key = `${t.room.index}:${index}`;
    if (cfg.entity && DEAD.has(this._state(cfg.entity)?.state ?? "unavailable")) return this._moreInfo(cfg.entity);
    if (this._needsConfirm(cfg) && this._armed?.key !== key) {
      const label = cfg.entity?.startsWith("lock.") ? "Lås op?" : cfg.confirm_text || "Sluk?";
      this._armed = { key, label };
      clearTimeout(this._armTimer);
      this._armTimer = setTimeout(() => { this._armed = null; this._schedule(); }, 3200);
      navigator.vibrate?.(8);
      this._update();
      return;
    }
    if (this._armed?.key === key) { this._armed = null; clearTimeout(this._armTimer); }
    this._runAction(cfg.tap_action || { action: "toggle" }, cfg.entity, button);
    this._update();
  }

  _holdAction(t, index) {
    const cfg = t.room.actions[index];
    if (cfg.hold_action) return this._runAction(cfg.hold_action, cfg.entity, t.acts[index]);
    if (cfg.entity) this._moreInfo(cfg.entity);
  }

  _tapLight(t) {
    const st = this._state(t.room.light);
    if (!st || DEAD.has(st.state)) return this._moreInfo(t.room.light);
    this._call("light", "toggle", { entity_id: t.room.light }, undefined, t.room.light, t.room.light, t.light);
    this._update();
  }

  _roomOff(t) {
    const cfg = t.room.room_off;
    const action = typeof cfg === "string" ? { action: "perform-action", perform_action: "script.rum_sluk_midlertidigt", data: { room: cfg } } : cfg;
    if (!action) return;
    const service = action.perform_action || action.service;
    if (!service?.includes(".")) return;
    const [domain, name] = service.split(".");
    this._call(domain, name, action.data || action.service_data || {}, action.target, `off:${t.room.index}`, t.room.light, t.off);
    this._update();
  }

  _moreInfo(entityId) {
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId } }));
  }

  _navigate(path) {
    if (!path) return;
    const hash = path.startsWith("#") ? path : `#${path}`;
    const sameHash = window.location.hash === hash;
    if (!sameHash) history.pushState(null, "", hash);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { source: "bubble-popup-add-hash", sameHash, replace: false } }));
  }
}

if (!customElements.get("ha-home-room-overview-card-v3")) customElements.define("ha-home-room-overview-card-v3", HaHomeRoomOverviewCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "ha-home-room-overview-card-v3", name: "HA Home Room Overview", description: `Room overview ${ROOM_OVERVIEW_VERSION}` });
