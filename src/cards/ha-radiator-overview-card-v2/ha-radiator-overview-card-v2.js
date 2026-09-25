/*
 * HA Radiator Overview Card v2 - `custom:ha-radiator-overview-card-v2`
 * Redesign af Temperatur-fanen i Varme Center.
 *
 * Samme config og samme rum-popups som ha-radiator-overview-card v0.6.1 - kun hovedsiden er
 * bygget om: termostatzoner med udendørs først, termostat-skive og 24-timers kurve,
 * kompakte målepunkter og et afsluttende overblik.
 *
 * Vedligeholdelse
 * - DOM'en bygges én gang pr. config (_build) og opdateres derefter kun målrettet: et rum får kun
 *   nye tekster/attributter, når dets viste værdier faktisk har ændret sig (_renderRoom).
 * - Ingen polling af states. 24-timers kurver hentes som timestatistik fra recorderen, når kortet
 *   vises, og igen lige efter hver hel time, mens det er synligt. Det aktuelle punkt tegnes live.
 * - AC-animationen er den delte ac-unit-visual (samme som ha-ac-climate-card og v1).
 * - Popups (Temperatur/AC/Optimering) er kopieret uændret fra v0.6.1.
 */
import "./ha-card-list-editor.js";
import { AC_UNIT_VISUAL_STYLE, acUnitVisualMarkup } from "./ac-unit-visual.js";

const VERSION = "2.0.5";
const TAG = "ha-radiator-overview-card-v2";
const DASH = "—";
const DIAL = { cx: 60, cy: 60, r: 47, start: 150, sweep: 240 };
const SPARK_W = 240;
const SPARK_H = 44;
const RADIATOR_MARKUP = '<div class="radiator" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>';

const polar = (angle, radius = DIAL.r) => {
  const a = (angle * Math.PI) / 180;
  return [DIAL.cx + radius * Math.cos(a), DIAL.cy + radius * Math.sin(a)];
};
const DIAL_PATH = (() => {
  const [x1, y1] = polar(DIAL.start);
  const [x2, y2] = polar(DIAL.start + DIAL.sweep);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${DIAL.r} ${DIAL.r} 0 1 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
})();

// Blød kurve gennem punkterne (Catmull-Rom som kubiske Bézier-segmenter).
const smoothPath = (points) => {
  if (points.length < 3) return points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  let d = `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
};

const STYLE = `
:host{display:block;--rc-accent:var(--dashboard-accent,var(--info-color,#38bdf8));--rc-ok:var(--dashboard-success,var(--success-color,#5bc99a));--rc-hot:#ff8a3d;--rc-hot2:#ffca62;--rc-warm:#f2c14e;--rc-cool:var(--state-cool-icon,var(--info-color,#58aaf8));--rc-open:#a78bfa;--rc-danger:var(--dashboard-danger,var(--error-color,#ef4444));--rc-edge:var(--dashboard-border-neutral,var(--divider-color,rgba(255,255,255,.11)));--rc-muted:var(--secondary-text-color);--rc-surface:var(--dashboard-card-bg,var(--ha-card-background,var(--card-background-color,#141a22)));--rc-glass:rgba(255,255,255,.035);--rc-glass2:rgba(255,255,255,.06);--rc-left:calc(var(--dashboard-left-accent-width,1) * 3px)}
*{box-sizing:border-box}
ha-card{position:relative;overflow:hidden;background:none;border:0;border-radius:0;box-shadow:none;color:var(--primary-text-color);font-family:var(--primary-font-family,var(--paper-font-body1_-_font-family,inherit))}
.shell{position:relative;padding:22px;isolation:isolate;container-type:inline-size}
.head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:18px}
.eyebrow{display:flex;align-items:center;gap:8px;color:var(--rc-muted);font-size:10.5px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}
.live{width:7px;height:7px;border-radius:50%;background:var(--rc-ok);animation:live 2.6s ease-out infinite}
h2{margin:6px 0 0;font-size:25px;font-weight:800;line-height:1.08;letter-spacing:-.035em}
.sub{margin:5px 0 0;color:var(--rc-muted);font-size:12px}
.flow{position:relative;display:flex;align-items:center;gap:11px;min-width:250px;padding:11px 15px 13px;overflow:hidden;border:1px solid var(--rc-edge);border-radius:15px;background:var(--rc-glass)}
.flow ha-icon{--mdc-icon-size:21px;color:var(--rc-muted);transition:color .3s ease}
.flow span{display:block;color:var(--rc-muted);font-size:9.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
.flow strong{display:block;margin-top:2px;font-size:13px;font-weight:750}
.flow-line{position:absolute;left:12px;right:12px;bottom:5px;height:2px;border-radius:2px;background:color-mix(in srgb,var(--rc-muted) 22%,transparent)}
.flow.on{border-color:color-mix(in srgb,var(--rc-hot) 42%,var(--rc-edge))}
.flow.on ha-icon{color:var(--rc-hot)}
.flow.on .flow-line{background:linear-gradient(90deg,color-mix(in srgb,var(--rc-hot) 20%,transparent),var(--rc-hot2),var(--rc-hot),color-mix(in srgb,var(--rc-hot) 20%,transparent));background-size:200% 100%;animation:flow 1.6s linear infinite}
.hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:12px;margin-top:24px}
.panel{position:relative;min-width:0;padding:16px 18px;overflow:hidden;border:1px solid var(--rc-edge);border-radius:20px;background:linear-gradient(160deg,var(--rc-glass2),rgba(255,255,255,.012) 55%,rgba(0,0,0,.05));box-shadow:0 10px 26px rgba(0,0,0,.12)}
.label{display:block;color:var(--rc-muted);font-size:10px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}
.big{display:flex;align-items:flex-start;margin-top:8px;font-size:46px;font-weight:750;line-height:.95;letter-spacing:-.045em}
.big small{margin:4px 0 0 4px;color:var(--rc-muted);font-size:16px;font-weight:700;letter-spacing:0}
.indoor .big{color:var(--primary-text-color)}
.spread{position:relative;height:34px;margin:14px 0 4px}
.spread-track{position:absolute;left:0;right:0;top:16px;height:2px;border-radius:2px;background:color-mix(in srgb,var(--rc-muted) 26%,transparent)}
.spread-band{position:absolute;top:8px;height:18px;border-radius:7px;border:1px solid color-mix(in srgb,var(--rc-ok) 55%,transparent);background:color-mix(in srgb,var(--rc-ok) 14%,transparent)}
.spread-dot{position:absolute;top:0;width:12px;height:12px;margin-left:-6px;border-radius:50%;background:var(--room-color,var(--rc-ok));box-shadow:0 0 0 2px var(--rc-surface);transition:left .6s ease,top .3s ease}
.spread-dot[hidden]{display:none}
.spread-scale{display:flex;justify-content:space-between;gap:10px;color:var(--rc-muted);font-size:10.5px}
.spread-scale b{color:var(--primary-text-color);font-weight:700}
.outdoor{--room-color:var(--rc-accent);display:block;width:100%;color:inherit;font:inherit;text-align:left;cursor:pointer;transition:transform .2s ease,border-color .25s ease}
.outdoor:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--rc-accent) 40%,var(--rc-edge))}
.outdoor .wx{position:absolute;right:16px;top:14px;--mdc-icon-size:30px;color:var(--rc-accent);opacity:.9}
.meta{margin-top:9px;color:var(--rc-muted);font-size:12px;line-height:1.55}
.meta b{color:var(--primary-text-color);font-weight:700}
.outdoor .spark-wrap{margin-top:8px}
.stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;min-width:0}
.stat{--stat-color:var(--rc-muted);display:flex;align-items:center;gap:11px;min-width:0;padding:12px 13px;border:1px solid var(--rc-edge);border-radius:16px;background:var(--rc-glass)}
.stat.hot{--stat-color:var(--rc-hot)}.stat.warn{--stat-color:var(--rc-warm)}.stat.cool{--stat-color:var(--rc-cool)}.stat.ok{--stat-color:var(--rc-ok)}.stat.accent{--stat-color:var(--rc-accent)}.stat.open{--stat-color:var(--rc-open)}
.stat .ic{flex:none;display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:color-mix(in srgb,var(--stat-color) 15%,transparent);color:var(--stat-color)}
.stat .ic ha-icon{--mdc-icon-size:20px}
.stat div{min-width:0}
.stat span{display:block;color:var(--rc-muted);font-size:9.5px;font-weight:800;letter-spacing:.11em;text-transform:uppercase}
.stat strong{display:block;margin-top:3px;font-size:17px;font-weight:750;line-height:1.1}
.stat em{display:-webkit-box;margin-top:2px;overflow:hidden;color:var(--rc-muted);font-size:11px;font-style:normal;line-height:1.35;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.notice{display:none;align-items:center;gap:10px;margin:-10px 0 20px;padding:10px 14px;border:1px solid color-mix(in srgb,var(--rc-warm) 45%,var(--rc-edge));border-radius:14px;background:color-mix(in srgb,var(--rc-warm) 10%,transparent);font-size:12px}
.notice.show{display:flex}.notice ha-icon{--mdc-icon-size:18px;color:var(--rc-warm)}
.group+.group{margin-top:24px}
.group-head{display:flex;align-items:center;gap:10px;margin:0 2px 12px}
.group-head h3{margin:0;color:var(--rc-muted);font-size:11px;font-weight:800;letter-spacing:.15em;text-transform:uppercase}
.count{min-width:24px;padding:2px 8px;border:1px solid var(--rc-edge);border-radius:99px;background:var(--rc-glass2);font-size:11px;font-weight:800;text-align:center}
.rule{flex:1;height:1px;background:linear-gradient(90deg,var(--rc-edge),transparent)}
.legend{display:flex;flex-wrap:wrap;gap:14px;color:var(--rc-muted);font-size:11px}
.legend span{display:inline-flex;align-items:center;gap:6px}
.legend i{width:8px;height:8px;border-radius:50%;background:var(--c)}
.zones{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,305px),1fr));gap:14px}
.zone,.tile{--room-color:var(--rc-ok);position:relative;min-width:0;overflow:hidden;color:inherit;font:inherit;text-align:left;cursor:pointer;transition:transform .2s ease,border-color .25s ease,box-shadow .25s ease}
.zone{display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-areas:"top top" "dial metrics" "foot foot";gap:12px 14px;padding:16px 16px 13px;border:1px solid color-mix(in srgb,var(--room-color) 26%,var(--rc-edge));border-left:var(--rc-left) solid var(--room-color);border-radius:20px;background:radial-gradient(110% 80% at 100% 0%,color-mix(in srgb,var(--room-color) 13%,transparent),transparent 58%),linear-gradient(160deg,var(--rc-glass2),rgba(255,255,255,.012) 55%,rgba(0,0,0,.05));box-shadow:0 10px 26px rgba(0,0,0,.14)}
.zone:hover,.tile:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--room-color) 52%,var(--rc-edge));box-shadow:0 16px 34px rgba(0,0,0,.2)}
.zone.outdoor{--room-color:var(--rc-accent);width:auto}
.zone.outdoor .dial .tick,.zone.outdoor .dial .halo{display:none}
.zone.outdoor [data-m="day"]{grid-column:1/-1}
.zone:focus-visible,.tile:focus-visible,.outdoor:focus-visible{outline:2px solid var(--rc-accent);outline-offset:2px}
.a-ok{--room-color:var(--rc-ok)}.a-cold{--room-color:var(--rc-cool)}.a-warm,.a-warn{--room-color:var(--rc-warm)}.a-heating{--room-color:var(--rc-hot)}.a-open{--room-color:var(--rc-open)}.a-neutral{--room-color:color-mix(in srgb,var(--rc-muted) 75%,transparent)}.a-ac-cool{--room-color:var(--rc-cool)}.a-ac-hot{--room-color:var(--rc-hot)}.a-ac-dry{--room-color:#a68cff}.a-ac-fan{--room-color:#63d4c1}
.z-top{grid-area:top;display:flex;align-items:center;gap:11px;min-width:0}
.z-icon{flex:none;display:grid;place-items:center;width:38px;height:38px;border-radius:13px;background:color-mix(in srgb,var(--room-color) 15%,transparent);color:var(--room-color);transition:color .3s ease,background .3s ease}
.z-icon ha-icon{--mdc-icon-size:21px}
.z-title{flex:1;min-width:0}
.z-title strong{display:block;overflow:hidden;font-size:15px;font-weight:800;text-overflow:ellipsis;white-space:nowrap}
.z-status{display:flex;align-items:center;gap:6px;min-width:0;margin-top:3px;color:var(--rc-muted);font-size:10.5px;font-weight:750;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}
.z-status b{flex:none;width:6px;height:6px;border-radius:50%;background:var(--room-color);box-shadow:0 0 8px var(--room-color)}
.z-status em{min-width:0;overflow:hidden;font-style:normal;text-overflow:ellipsis}
.badges{display:flex;flex:none;align-items:center;gap:6px}
.badge{display:none;place-items:center;width:26px;height:26px;border:1px solid var(--rc-edge);border-radius:9px;background:var(--rc-glass2);color:var(--rc-muted)}
.badge.show{display:grid}.badge ha-icon{--mdc-icon-size:15px}
.badge.window{color:var(--rc-open);border-color:color-mix(in srgb,var(--rc-open) 42%,var(--rc-edge))}
.badge.battery{color:var(--rc-danger);border-color:color-mix(in srgb,var(--rc-danger) 42%,var(--rc-edge))}
.badge.ac.on{color:var(--room-color);border-color:color-mix(in srgb,var(--room-color) 50%,var(--rc-edge));animation:badge 2.2s ease-in-out infinite}
.chev{--mdc-icon-size:18px;color:var(--rc-muted);opacity:.38;transition:opacity .2s ease,transform .2s ease}
.zone:hover .chev{opacity:.85;transform:translateX(2px)}
.dial{grid-area:dial;position:relative;width:124px;height:98px}
.dial svg{display:block;width:124px;height:98px;overflow:visible}
.dial .track{fill:none;stroke:color-mix(in srgb,var(--room-color) 15%,rgba(255,255,255,.07));stroke-width:8;stroke-linecap:round}
.dial .value{fill:none;stroke:var(--room-color);stroke-width:8;stroke-linecap:round;transition:stroke-dasharray .6s ease,stroke .3s ease}
.dial .halo{fill:none;stroke:var(--room-color);stroke-width:15;stroke-linecap:round;opacity:0;filter:blur(5px)}
.zone.is-heating .dial .halo{animation:halo 2.4s ease-in-out infinite}
.dial .tick{stroke:var(--primary-text-color);stroke-width:3;stroke-linecap:round;opacity:.9;transition:all .5s ease}
.dial-center{position:absolute;left:0;right:0;top:31px;text-align:center}
.dial-center strong{display:inline-flex;align-items:flex-start;font-size:27px;font-weight:750;line-height:1;letter-spacing:-.045em}
.dial-center strong small{margin:3px 0 0 2px;color:var(--rc-muted);font-size:12px;font-weight:700;letter-spacing:0}
.dial-target{display:block;margin-top:6px;color:var(--rc-muted);font-size:10px;font-weight:750;letter-spacing:.07em;text-transform:uppercase}
.metrics{grid-area:metrics;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-content:center;gap:8px}
.metric{min-width:0;padding:8px 10px;border:1px solid var(--rc-edge);border-radius:12px;background:rgba(0,0,0,.08)}
.metric span{display:block;color:var(--rc-muted);font-size:9px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;white-space:nowrap}
.metric strong{display:block;margin-top:3px;overflow:hidden;font-size:13.5px;font-weight:750;text-overflow:ellipsis;white-space:nowrap}
.metric.na strong{color:var(--rc-muted);font-weight:600}
.metric.low{border-color:color-mix(in srgb,var(--rc-danger) 45%,var(--rc-edge))}.metric.low strong{color:var(--rc-danger)}
.z-foot{grid-area:foot;display:flex;align-items:flex-end;gap:12px;min-width:0;padding-top:10px;border-top:1px solid color-mix(in srgb,var(--rc-edge) 80%,transparent)}
.spark-wrap{position:relative;flex:1;min-width:0}
.spark{display:block;width:100%;height:44px;overflow:visible}
.spark .area{fill:var(--room-color);opacity:.1}
.spark .line{fill:none;stroke:var(--room-color);stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.spark .target{stroke:var(--primary-text-color);stroke-width:1;stroke-dasharray:3 4;opacity:.38;vector-effect:non-scaling-stroke}
.spark-dot{position:absolute;left:100%;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:var(--room-color);box-shadow:0 0 0 2px var(--rc-surface);pointer-events:none}
.spark-cross{position:absolute;top:0;height:44px;width:1px;background:color-mix(in srgb,var(--primary-text-color) 45%,transparent);opacity:0;pointer-events:none}
.spark-tip{position:absolute;top:-26px;padding:3px 8px;border-radius:8px;background:var(--card-background-color,rgba(8,12,18,.9));color:var(--primary-text-color,#fff);border:1px solid var(--divider-color,transparent);font-size:10.5px;font-weight:700;white-space:nowrap;opacity:0;transform:translateX(-50%);pointer-events:none;transition:opacity .12s ease}
.spark-wrap.hover .spark-tip,.spark-wrap.hover .spark-cross{opacity:1}
.spark-wrap.empty .spark,.spark-wrap.empty .spark-dot{visibility:hidden}
.spark-range{display:flex;justify-content:space-between;gap:8px;margin-top:5px;color:var(--rc-muted);font-size:10px;font-weight:650}
.visual{display:flex;flex:none;align-items:flex-end;justify-content:center;width:70px;height:52px}
.radiator{position:relative;display:flex;align-items:flex-end;gap:3px;height:40px;padding:0 4px 6px;color:color-mix(in srgb,var(--rc-muted) 65%,transparent)}
.radiator::before{content:"";position:absolute;left:2px;right:2px;bottom:3px;height:3px;border-radius:9px;background:currentColor;opacity:.45}
.radiator::after{content:"";display:none;position:absolute;left:2px;bottom:2px;width:13px;height:5px;border-radius:9px;background:linear-gradient(90deg,transparent,var(--rc-hot2),#fff,var(--rc-hot2),transparent);filter:drop-shadow(0 0 5px var(--rc-hot))}
.radiator i{display:block;width:6px;height:27px;border:1px solid currentColor;border-radius:3px;background:rgba(145,158,171,.10)}
.zone.is-heating .radiator{color:var(--rc-hot)}
.zone.is-heating .radiator::before{opacity:.8;box-shadow:0 0 6px rgba(255,138,61,.45)}
.zone.is-heating .radiator::after{display:block;animation:radiatorFlow 1.25s linear infinite}
.zone.is-heating .radiator i{background:linear-gradient(180deg,rgba(255,202,98,.72),rgba(255,138,61,.12) 46%,rgba(255,138,61,.03) 72%);background-size:100% 230%;box-shadow:inset 0 0 7px rgba(255,202,98,.45),0 0 7px rgba(255,138,61,.22);animation:radiatorFill 1.35s ease-in-out infinite}
.zone.is-heating .radiator i:nth-child(2){animation-delay:.12s}.zone.is-heating .radiator i:nth-child(3){animation-delay:.24s}.zone.is-heating .radiator i:nth-child(4){animation-delay:.36s}.zone.is-heating .radiator i:nth-child(5){animation-delay:.48s}
.ac-mini{position:relative;width:67px;height:50px;overflow:hidden}
.ac-mini .ac-unit-visual{transform:scale(.5);transform-origin:top left}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:12px}
.tile{display:block;padding:13px 14px 11px;border:1px solid color-mix(in srgb,var(--room-color) 20%,var(--rc-edge));border-radius:18px;background:linear-gradient(160deg,var(--rc-glass2),rgba(255,255,255,.01) 60%,rgba(0,0,0,.04))}
.t-top{display:flex;align-items:center;gap:9px;min-width:0}
.t-top .t-ic{flex:none;display:grid;place-items:center;width:30px;height:30px;border-radius:10px;background:color-mix(in srgb,var(--room-color) 14%,transparent);color:var(--room-color)}
.t-top ha-icon{--mdc-icon-size:17px}
.t-top strong{flex:1;overflow:hidden;font-size:13px;font-weight:800;text-overflow:ellipsis;white-space:nowrap}
.t-top b{flex:none;width:6px;height:6px;border-radius:50%;background:var(--room-color);box-shadow:0 0 8px var(--room-color)}
.t-row{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;margin-top:9px}
.t-temp{display:flex;align-items:flex-start;font-size:27px;font-weight:750;line-height:1;letter-spacing:-.04em}
.t-temp small{margin:3px 0 0 2px;color:var(--rc-muted);font-size:12px;font-weight:700;letter-spacing:0}
.t-meta{overflow:hidden;color:var(--rc-muted);font-size:11px;line-height:1.45;text-align:right;white-space:nowrap}
.tile .spark-wrap{margin-top:9px}.tile .spark,.tile .spark-cross{height:30px}
.no-animation *,.no-animation *::before,.no-animation *::after{animation:none!important}
@keyframes live{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--rc-ok) 60%,transparent)}70%,100%{box-shadow:0 0 0 7px transparent}}
@keyframes flow{from{background-position:200% 0}to{background-position:0 0}}
@keyframes halo{0%,100%{opacity:0}50%{opacity:.4}}
@keyframes badge{50%{box-shadow:0 0 0 4px color-mix(in srgb,var(--room-color) 18%,transparent)}}
@keyframes radiatorFlow{from{transform:translateX(-13px)}to{transform:translateX(43px)}}
@keyframes radiatorFill{0%,100%{background-position:0 100%;opacity:.62}50%{background-position:0 0;opacity:1}}
@container (max-width:1180px){.hero{grid-template-columns:1fr}.hero .stats{grid-template-columns:repeat(4,minmax(0,1fr))}}
@container (max-width:760px){.shell{padding:16px}.head{flex-direction:column;align-items:stretch}.flow{min-width:0}.hero .stats{grid-template-columns:repeat(2,minmax(0,1fr))}.big{font-size:40px}.legend{display:none}}
@container (max-width:560px){.hero{grid-template-columns:1fr}.zones,.tiles{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.zone{grid-template-columns:minmax(0,1fr);grid-template-areas:"top" "dial" "metrics" "foot";gap:8px;padding:12px 11px 10px;border-radius:18px}.z-top{gap:8px}.z-icon{width:30px;height:30px;border-radius:10px}.z-icon ha-icon{--mdc-icon-size:17px}.z-title strong{font-size:13px}.z-status{align-items:flex-start;gap:5px;font-size:9px;letter-spacing:.03em}.z-status b{margin-top:2px}.z-status em{white-space:normal;line-height:1.25}.badges{gap:4px}.badge{width:22px;height:22px;border-radius:7px}.badge ha-icon{--mdc-icon-size:13px}.badges .badge.show:not(.window):not(.battery),.chev{display:none}.dial{justify-self:center}.dial,.dial svg{width:112px;height:89px}.dial-center{top:27px}.dial-center strong{font-size:24px}.metrics{gap:6px}.metric{padding:6px 7px;border-radius:10px}.metric span{font-size:8px;letter-spacing:.05em}.metric strong{margin-top:2px;font-size:12px}.z-foot{gap:6px;padding-top:8px}.spark-range span:first-child{display:none}.visual{width:56px;height:44px}.radiator{height:34px;gap:2px}.radiator i{width:5px;height:23px}.ac-mini{width:56px;height:42px}.ac-mini .ac-unit-visual{transform:scale(.42)}.tile{padding:12px 12px 10px}.t-row{display:block}.t-meta{margin-top:5px;text-align:left}}
@container (max-width:360px){.t-temp{font-size:24px}}@container (max-width:300px){.zones,.tiles{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
`;

class HARadiatorOverviewCardV2 extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._built = false;
    this._refs = [];
    this._summary = undefined;
    this._roomIds = [];
    this._summaryIds = [];
    this._dirty = new Set();
    this._raf = 0;
    this._stats = {};
    this._statsRevision = 0;
    this._statsLoading = false;
    this._statsFetchedAt = 0;
    this._statsTimer = undefined;
    this._hoverWrap = undefined;
    this._popupEl = undefined;
    this._popupRoomIndex = undefined;
    this._popupCards = [];
    this._escapeHandler = undefined;
    this._bodyOverflow = undefined;
    // Én delegeret lytter pr. hændelsestype for hele kortet - aldrig pr. rum.
    this.shadowRoot.addEventListener("click", (event) => {
      const target = event.target?.closest?.("[data-room]");
      if (target) this._openRoomPopup(Number(target.dataset.room));
    });
    this.shadowRoot.addEventListener("pointermove", (event) => this._onPointerMove(event));
    this.shadowRoot.addEventListener("pointerleave", () => this._clearHover(), true);
  }

  static getStubConfig() {
    return { title: "Radiatorer & rumklima", rooms: [] };
  }

  static getConfigElement(){const e=document.createElement("ha-card-list-editor");e.definition={roots:[{key:"title",label:"Titel"},{key:"animation",label:"Animation",type:"boolean"}],collections:[{key:"rooms",label:"Radiatorer og rum",itemLabel:"rum",defaults:{name:"Nyt rum",icon:"mdi:radiator"},fields:[{key:"name",label:"Navn"},{key:"icon",label:"Ikon"},{key:"temperature",label:"Temperatur",type:"entity"},{key:"humidity",label:"Luftfugtighed",type:"entity"},{key:"comfort",label:"Komfortstatus",type:"entity"},{key:"climate",label:"Termostat",type:"entity"},{key:"window",label:"Vindue/dør",type:"entity"}]}]};return e;}

  setConfig(config) {
    if (!config || !Array.isArray(config.rooms)) throw new Error("Radiatoroverblik kræver en rooms-liste");
    this._config = { title: "Radiatorer & rumklima", animation: true, history_hours: 24, dial_min: 14, dial_max: 30, ...config };
    this._stats = {};
    this._statsFetchedAt = 0;
    this._build();
    if (this._hass && this.isConnected) {
      this._dirtyAll();
      this._ensureStats();
    }
  }

  connectedCallback() {
    // Kortet ligger bag en fane (local-conditional-card) og bliver løsnet, når fanen skjules.
    // Opdateringer springes over imens; her indhentes de i én samlet opdatering.
    if (this._built && this._hass) this._dirtyAll();
    this._ensureStats();
  }

  disconnectedCallback() {
    clearTimeout(this._statsTimer);
    this._statsTimer = undefined;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    this._clearHover();
    this._closeRoomPopup();
  }

  set hass(hass) {
    const previous = this._hass;
    this._hass = hass;
    this._updateRoomPopup();
    this._popupCards.forEach((card) => { card.hass = hass; });
    if (!this._built || !this.isConnected) return;
    if (!previous) {
      this._dirtyAll();
    } else {
      this._roomIds.forEach((ids, index) => {
        if (ids.some((id) => previous.states[id] !== hass.states[id])) this._dirty.add(index);
      });
      if (this._summaryIds.some((id) => previous.states[id] !== hass.states[id])) this._dirty.add("summary");
      if (this._dirty.size) {
        this._dirty.add("summary");
        this._schedule();
      }
    }
    this._ensureStats();
  }

  getCardSize() { return 14; }
  getGridOptions() { return { rows: "auto", columns: 12, min_columns: 6 }; }

  // ---------- Data ----------

  _entity(id) {
    const entity = id ? this._hass?.states?.[id] : undefined;
    return entity && !["unknown", "unavailable", ""].includes(entity.state) ? entity : undefined;
  }

  _number(value) {
    if (value === null || value === undefined || value === "") return undefined;
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }

  _object(value) {
    if (value && typeof value === "object") return value;
    if (typeof value !== "string" || !value.trim()) return {};
    try { return JSON.parse(value); } catch { return {}; }
  }

  _acState(room) {
    const climate = this._entity(room?.ac?.climate);
    const mode = String(climate?.state || "off").toLowerCase();
    const active = !!climate && !["off", "unknown", "unavailable"].includes(mode);
    const tone = mode === "cool" ? "cool" : mode === "heat" ? "hot" : mode === "dry" ? "dry" : "fan";
    const label = mode === "cool" ? "Køler via AC" : mode === "heat" ? "Varmer via AC" : mode === "dry" ? "Affugter via AC" : mode === "fan_only" ? "Ventilerer via AC" : "";
    return { climate, mode, active, tone, label };
  }

  _roomState(room) {
    const climate = this._entity(room.climate);
    const temperatureEntity = this._entity(room.temperature);
    const humidityEntity = this._entity(room.humidity);
    const comfortEntity = this._entity(room.comfort);
    const current = this._number(climate?.attributes?.current_temperature ?? temperatureEntity?.state);
    const target = this._number(climate?.attributes?.temperature);
    const humidity = this._number(climate?.attributes?.current_humidity ?? humidityEntity?.state);
    const windowOpen = ["on", "open", "opening"].includes(String(this._entity(room.window)?.state).toLowerCase()) || climate?.attributes?.window_open === true || climate?.attributes?.door_open === true;
    const off = climate ? climate.state === "off" : false;
    const delta = current !== undefined && target !== undefined ? current - target : undefined;
    const comfortable = comfortEntity?.attributes?.is_comfortable;
    const valveValues = Object.values(this._object(climate?.attributes?.calibration_balance))
      .map((entry) => this._number(entry?.["valve%"] ?? entry?.valve ?? entry?.position))
      .filter((value) => value !== undefined);
    const valve = valveValues.length ? Math.max(...valveValues) : undefined;
    const heating = climate?.attributes?.hvac_action === "heating" && !windowOpen && (valve === undefined || valve > 0);
    const batteryValues = Object.entries(this._object(climate?.attributes?.batteries))
      .filter(([entityId]) => entityId.startsWith("climate."))
      // Better Thermostat's copy of a TRV battery is often "unavailable"; the TRV's own
      // battery sensor (battery_id) is the reliable source, so fall back to it.
      .map(([, entry]) => this._number(entry?.battery) ?? this._number(this._entity(entry?.battery_id)?.state))
      .filter((value) => value !== undefined);
    const batteries = batteryValues.length ? batteryValues : [];
    const ac = room.ac ? this._acState(room) : undefined;
    let tone = "neutral";
    if (delta !== undefined && delta < -0.4) tone = "cold";
    else if (delta !== undefined && delta > 0.7) tone = "warm";
    else if (target !== undefined && current !== undefined) tone = "ok";
    else if (comfortable === false) tone = "warn";
    else if (current !== undefined) tone = "ok";
    return { climate, current, target, humidity, windowOpen, heating, off, delta, comfortable, valve, batteries, tone, ac };
  }

  // Visningsmodel for et rum: alt det, hovedsiden viser, uden at røre DOM'en.
  _roomModel(room) {
    const state = this._roomState(room);
    const comfort = this._entity(room.comfort);
    const feels = this._number(comfort?.state);
    const kind = room.outdoor ? "outdoor" : room.climate ? "zone" : "sensor";
    const acActive = !!state.ac?.active;
    const batteryMin = state.batteries.length ? Math.min(...state.batteries) : undefined;
    let status;
    if (kind === "zone") {
      if (acActive) status = state.ac.label || "Kører via AC";
      else if (!state.climate) status = "Termostat offline";
      else if (state.windowOpen) status = "Vindue/dør åben";
      else if (state.off) status = "Slukket";
      else if (state.heating) status = "Varmer nu";
      else if (state.tone === "cold") status = `Under mål ${this._format(state.delta)}°`;
      else if (state.tone === "warm") status = `Over mål +${this._format(state.delta)}°`;
      else if (state.current === undefined) status = "Ingen data";
      else status = "På mål";
    } else if (state.current === undefined) status = "Ingen data";
    else status = state.comfortable === false ? "Uden for komfort" : state.comfortable === true ? "Komfortabel" : "Måling";
    let accent = state.tone;
    if (acActive) accent = `ac-${state.ac.tone}`;
    else if (state.heating) accent = "heating";
    else if (state.windowOpen) accent = "open";
    else if (state.off || (kind === "zone" && !state.climate)) accent = "neutral";
    return { ...state, kind, feels, acActive, batteryMin, batteryLow: batteryMin !== undefined && batteryMin <= 20, status, accent };
  }

  _format(value, digits = 1) {
    if (value === undefined) return DASH;
    const language = this._hass?.locale?.language || this._hass?.language || "da";
    return value.toLocaleString(language, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  _escape(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  _setText(node, text) {
    if (node && node.textContent !== text) node.textContent = text;
  }

  // ---------- Statistik til 24-timers kurverne ----------

  _statIds() {
    return [...new Set((this._config.rooms || []).map((room) => room.temperature).filter((id) => typeof id === "string" && id.includes(".")))];
  }

  _time(value) {
    if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  _ensureStats() {
    if (!this._hass?.callWS || this._statsLoading || !this.isConnected || !this._built) return;
    if (this._statsFetchedAt && Date.now() - this._statsFetchedAt < 55 * 60000) {
      if (!this._statsTimer) this._scheduleStatsRefresh();
      return;
    }
    this._fetchStats();
  }

  _scheduleStatsRefresh() {
    clearTimeout(this._statsTimer);
    if (!this.isConnected) { this._statsTimer = undefined; return; }
    // Timestatistik skrives lige efter hver hele time; hent kort efter.
    const now = Date.now();
    const next = Math.ceil(now / 3600000) * 3600000 + 3 * 60000;
    this._statsTimer = setTimeout(() => { this._statsTimer = undefined; this._fetchStats(); }, Math.max(next - now, 5 * 60000));
  }

  async _fetchStats() {
    const ids = this._statIds();
    if (!ids.length || !this._hass?.callWS) return;
    this._statsLoading = true;
    const hours = this._config.history_hours || 24;
    const end = new Date();
    const start = new Date(end.getTime() - hours * 3600000);
    const stats = {};
    try {
      const result = await this._hass.callWS({ type: "recorder/statistics_during_period", start_time: start.toISOString(), end_time: end.toISOString(), statistic_ids: ids, period: "hour", types: ["mean", "min", "max"] });
      for (const id of ids) {
        const rows = Array.isArray(result?.[id]) ? result[id] : [];
        const points = rows
          .map((row) => ({ t: this._time(row.start) + 1800000, v: this._number(row.mean), min: this._number(row.min), max: this._number(row.max) }))
          .filter((point) => Number.isFinite(point.t) && point.v !== undefined);
        if (points.length) stats[id] = points;
      }
      const missing = ids.filter((id) => !stats[id]);
      if (missing.length) Object.assign(stats, await this._historyFallback(missing, start, end));
    } catch (error) {
      console.warn("HA Radiator Overview Card v2: statistik kunne ikke hentes", error);
      try { Object.assign(stats, await this._historyFallback(ids, start, end)); } catch { /* kurverne vises bare uden historik */ }
    } finally {
      this._statsLoading = false;
    }
    this._stats = stats;
    this._statsRevision += 1;
    this._statsFetchedAt = Date.now();
    this._scheduleStatsRefresh();
    if (this._built && this._hass && this.isConnected) this._dirtyAll();
  }

  // Til sensorer uden langtidsstatistik: rå historik lagt i timespande.
  async _historyFallback(ids, start, end) {
    if (!this._hass?.callApi || !ids.length) return {};
    const path = `history/period/${encodeURIComponent(start.toISOString())}?end_time=${encodeURIComponent(end.toISOString())}&filter_entity_id=${encodeURIComponent(ids.join(","))}&minimal_response&no_attributes`;
    const result = await this._hass.callApi("GET", path);
    const out = {};
    for (const series of Array.isArray(result) ? result : []) {
      const entityId = series.find((entry) => entry.entity_id)?.entity_id;
      if (!entityId) continue;
      const buckets = new Map();
      for (const entry of series) {
        const value = this._number(entry.state);
        const time = this._time(entry.last_changed || entry.last_updated);
        if (value === undefined || !Number.isFinite(time)) continue;
        const hour = Math.floor(time / 3600000);
        const bucket = buckets.get(hour) || { sum: 0, n: 0, min: value, max: value };
        bucket.sum += value; bucket.n += 1; bucket.min = Math.min(bucket.min, value); bucket.max = Math.max(bucket.max, value);
        buckets.set(hour, bucket);
      }
      const points = [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([hour, b]) => ({ t: hour * 3600000 + 1800000, v: b.sum / b.n, min: b.min, max: b.max }));
      if (points.length) out[entityId] = points;
    }
    return out;
  }

  _sparkPoints(room, model) {
    const hours = this._config.history_hours || 24;
    const now = Date.now();
    const series = (this._stats[room.temperature] || []).filter((point) => point.t >= now - (hours + 1) * 3600000 && point.t < now);
    const points = series.map((point) => ({ t: point.t, v: point.v, min: point.min, max: point.max }));
    if (model.current !== undefined) points.push({ t: now, v: model.current, min: model.current, max: model.current, now: true });
    return points;
  }

  // ---------- Opbygning (én gang pr. config) ----------

  _build() {
    const rooms = this._config.rooms || [];
    const indexed = rooms.map((room, index) => ({ room, index }));
    const outdoor = indexed.find(({ room }) => room.outdoor);
    const zones = indexed.filter(({ room }) => !room.outdoor && room.climate);
    const sensors = indexed.filter(({ room }) => !room.outdoor && !room.climate);
    const isId = (id) => typeof id === "string" && id.includes(".");
    this._roomIds = rooms.map((room) => [room.climate, room.temperature, room.humidity, room.window, room.comfort, room.ac?.climate].filter(isId));
    this._summaryIds = [this._config.total_demand, this._config.data_problem].filter(isId);
    const spark = (small = false) => `<div class="spark-wrap"><svg class="spark" viewBox="0 0 ${SPARK_W} ${SPARK_H}" preserveAspectRatio="none" aria-hidden="true"><path class="area" d=""></path><line class="target" x1="0" x2="${SPARK_W}" y1="-9" y2="-9"></line><path class="line" d=""></path></svg><i class="spark-dot"></i><i class="spark-cross"></i><span class="spark-tip"></span>${small ? "" : `<div class="spark-range"><span>${this._config.history_hours || 24} t</span><span data-f="range">${DASH}</span></div>`}</div>`;
    const zoneMarkup = ({ room, index }) => `
      <button class="zone a-neutral" type="button" data-room="${index}">
        <div class="z-top">
          <span class="z-icon"><ha-icon icon="${this._escape(room.icon || "mdi:radiator")}"></ha-icon></span>
          <span class="z-title"><strong>${this._escape(room.name)}</strong><span class="z-status"><b></b><em data-f="status">${DASH}</em></span></span>
          <span class="badges">
            <span class="badge window" data-b="window" title="Vindue eller dør er åben"><ha-icon icon="mdi:window-open-variant"></ha-icon></span>
            <span class="badge battery" data-b="battery" title="Lavt batteri i termostat"><ha-icon icon="mdi:battery-alert-variant-outline"></ha-icon></span>
            ${room.ac ? '<span class="badge ac show" data-b="ac" title="AC tilknyttet"><ha-icon icon="mdi:air-conditioner"></ha-icon></span>' : ""}
            ${room.optimization ? '<span class="badge show" title="Optimering tilknyttet"><ha-icon icon="mdi:chart-timeline-variant"></ha-icon></span>' : ""}
            <ha-icon class="chev" icon="mdi:chevron-right"></ha-icon>
          </span>
        </div>
        <div class="dial">
          <svg viewBox="0 0 120 95" aria-hidden="true"><path class="track" d="${DIAL_PATH}"></path><path class="halo" d="${DIAL_PATH}" pathLength="100" stroke-dasharray="0 100"></path><path class="value" d="${DIAL_PATH}" pathLength="100" stroke-dasharray="0 100"></path><line class="tick" x1="-20" y1="-20" x2="-20" y2="-20"></line></svg>
          <div class="dial-center"><strong><span data-f="temp">${DASH}</span><small>°C</small></strong><span class="dial-target" data-f="target">Mål ${DASH}</span></div>
        </div>
        <div class="metrics">
          <div class="metric na" data-m="humidity"><span>Fugt</span><strong>${DASH}</strong></div>
          <div class="metric na" data-m="valve"><span>Ventil</span><strong>${DASH}</strong></div>
          <div class="metric na" data-m="feels"><span>Føles som</span><strong>${DASH}</strong></div>
          <div class="metric na" data-m="battery"><span>Batteri</span><strong>${DASH}</strong></div>
        </div>
        <div class="z-foot">${spark()}<div class="visual" data-f="visual"></div></div>
      </button>`;
    const outdoorMarkup = ({ room, index }) => `
      <button class="zone outdoor" type="button" data-room="${index}">
        <div class="z-top">
          <span class="z-icon"><ha-icon icon="${this._escape(room.icon || "mdi:weather-partly-cloudy")}"></ha-icon></span>
          <span class="z-title"><strong>${this._escape(room.name || "Udendørs")}</strong><span class="z-status"><b></b><em>Ude nu</em></span></span>
          <ha-icon class="chev" icon="mdi:chevron-right"></ha-icon>
        </div>
        <div class="dial">
          <svg viewBox="0 0 120 95" aria-hidden="true"><path class="track" d="${DIAL_PATH}"></path><path class="value" d="${DIAL_PATH}" pathLength="100" stroke-dasharray="0 100"></path></svg>
          <div class="dial-center"><strong><span data-f="temp">${DASH}</span><small>°C</small></strong><span class="dial-target">Lige nu</span></div>
        </div>
        <div class="metrics">
          <div class="metric" data-m="feels"><span>Føles som</span><strong data-f="feels">${DASH}</strong></div>
          <div class="metric" data-m="humidity"><span>Fugt</span><strong data-f="humidity">${DASH}</strong></div>
          <div class="metric" data-m="day"><span>Døgnets spænd</span><strong data-f="day">${DASH}</strong></div>
        </div>
        <div class="z-foot">${spark()}</div>
      </button>`;
    const tileMarkup = ({ room, index }) => `
      <button class="tile a-neutral" type="button" data-room="${index}">
        <div class="t-top"><span class="t-ic"><ha-icon icon="${this._escape(room.icon || "mdi:home-thermometer-outline")}"></ha-icon></span><strong>${this._escape(room.name)}</strong><b title="Status"></b></div>
        <div class="t-row"><div class="t-temp"><span data-f="temp">${DASH}</span><small>°C</small></div><div class="t-meta" data-f="meta">${DASH}</div></div>
        ${spark(true)}
      </button>`;
    const dots = indexed.filter(({ room }) => !room.outdoor).map(({ room, index }) => `<i class="spread-dot" data-dot="${index}" title="${this._escape(room.name)}" hidden></i>`).join("");
    const legend = [["var(--rc-cool)", "Under mål"], ["var(--rc-ok)", "På mål"], ["var(--rc-warm)", "Over mål"], ["var(--rc-hot)", "Varmer"], ["var(--rc-open)", "Åben"]]
      .map(([color, label]) => `<span><i style="--c:${color}"></i>${label}</span>`).join("");
    this.shadowRoot.innerHTML = `
      <style>${STYLE}${AC_UNIT_VISUAL_STYLE}</style>
      <ha-card class="${this._config.animation === false ? "no-animation" : ""}">
        <div class="shell">
          <header class="head">
            <div>
              <div class="eyebrow"><i class="live"></i>Rumklima · live</div>
              <h2>${this._escape(this._config.title)}</h2>
              <p class="sub">${zones.length} termostatzoner · ${sensors.length} målepunkter</p>
            </div>
            <div class="flow" data-s="flow"><ha-icon icon="mdi:heat-wave"></ha-icon><div><span>Varmekreds</span><strong data-s="flowText">${DASH}</strong></div><i class="flow-line"></i></div>
          </header>
          <div class="notice" data-s="notice"><ha-icon icon="mdi:alert-outline"></ha-icon><span>Rumoptimeringen melder et dataproblem – tallene for ventiler og varme kan være ufuldstændige.</span></div>
          ${(outdoor || zones.length) ? `<section class="group"><div class="group-head"><h3>Termostatzoner</h3><span class="count">${zones.length}</span><i class="rule"></i><div class="legend">${legend}</div></div><div class="zones">${outdoor ? outdoorMarkup(outdoor) : ""}${zones.map(zoneMarkup).join("")}</div></section>` : ""}
          ${sensors.length ? `<section class="group"><div class="group-head"><h3>Målepunkter</h3><span class="count">${sensors.length}</span><i class="rule"></i></div><div class="tiles">${sensors.map(tileMarkup).join("")}</div></section>` : ""}
          <section class="hero" aria-label="Supplerende overblik">
            <div class="panel indoor">
              <span class="label">Indendørs gennemsnit</span>
              <div class="big"><span data-s="avg">${DASH}</span><small>°C</small></div>
              <div class="spread" data-s="spread"><i class="spread-track"></i><i class="spread-band" data-s="band"></i>${dots}</div>
              <div class="spread-scale"><span data-s="coldest">${DASH}</span><span data-s="warmest">${DASH}</span></div>
            </div>
            <div class="stats">
              <div class="stat" data-s="heat"><span class="ic"><ha-icon icon="mdi:radiator"></ha-icon></span><div><span>Varmer nu</span><strong>${DASH}</strong><em>${DASH}</em></div></div>
              <div class="stat" data-s="open"><span class="ic"><ha-icon icon="mdi:window-open-variant"></ha-icon></span><div><span>Åbninger</span><strong>${DASH}</strong><em>${DASH}</em></div></div>
              <div class="stat" data-s="ac"><span class="ic"><ha-icon icon="mdi:air-conditioner"></ha-icon></span><div><span>Aircondition</span><strong>${DASH}</strong><em>${DASH}</em></div></div>
              <div class="stat" data-s="demand"><span class="ic"><ha-icon icon="mdi:home-lightning-bolt-outline"></ha-icon></span><div><span>Varmebehov</span><strong>${DASH}</strong><em>${DASH}</em></div></div>
            </div>
          </section>
        </div>
      </ha-card>`;
    const root = this.shadowRoot;
    const sparkRefs = (host) => {
      const wrap = host.querySelector(".spark-wrap");
      if (!wrap) return undefined;
      const refs = { wrap, area: wrap.querySelector(".area"), line: wrap.querySelector(".line"), target: wrap.querySelector(".target"), dot: wrap.querySelector(".spark-dot"), cross: wrap.querySelector(".spark-cross"), tip: wrap.querySelector(".spark-tip"), range: wrap.querySelector('[data-f="range"]'), data: [], scale: undefined };
      wrap._spark = refs;
      return refs;
    };
    this._refs = rooms.map((room, index) => {
      const host = root.querySelector(`[data-room="${index}"]`);
      if (!host) return undefined;
      const kind = room.outdoor ? "outdoor" : room.climate ? "zone" : "sensor";
      const f = (name) => host.querySelector(`[data-f="${name}"]`);
      const refs = { kind, host, view: "", status: f("status"), temp: f("temp"), target: f("target"), meta: f("meta"), feels: f("feels"), humidity: f("humidity"), day: f("day"), visual: f("visual"), visualKind: "", spark: sparkRefs(host) };
      if (kind === "zone" || kind === "outdoor") {
        refs.value = host.querySelector(".dial .value");
        refs.halo = host.querySelector(".dial .halo");
        refs.tick = host.querySelector(".dial .tick");
        refs.metrics = Object.fromEntries(["humidity", "valve", "feels", "battery"].map((name) => [name, host.querySelector(`[data-m="${name}"]`)]));
        refs.badges = { window: host.querySelector('[data-b="window"]'), battery: host.querySelector('[data-b="battery"]'), ac: host.querySelector('[data-b="ac"]') };
      }
      return refs;
    });
    const s = (name) => root.querySelector(`[data-s="${name}"]`);
    const stat = (name) => { const el = s(name); return el ? { el, value: el.querySelector("strong"), sub: el.querySelector("em") } : undefined; };
    this._summary = {
      view: "", flow: s("flow"), flowText: s("flowText"), avg: s("avg"), band: s("band"), coldest: s("coldest"), warmest: s("warmest"), notice: s("notice"),
      dots: [...root.querySelectorAll("[data-dot]")].map((el) => ({ el, index: Number(el.dataset.dot) })),
      heat: stat("heat"), open: stat("open"), ac: stat("ac"), demand: stat("demand"),
    };
    this._built = true;
  }

  // ---------- Målrettede opdateringer ----------

  _dirtyAll() {
    (this._config.rooms || []).forEach((_, index) => this._dirty.add(index));
    this._dirty.add("summary");
    this._schedule();
  }

  _schedule() {
    if (!this._raf) this._raf = requestAnimationFrame(() => this._flush());
  }

  _flush() {
    this._raf = 0;
    if (!this._built || !this._hass) { this._dirty.clear(); return; }
    const models = (this._config.rooms || []).map((room) => this._roomModel(room));
    for (const key of this._dirty) {
      if (key === "summary") this._renderSummary(models);
      else if (models[key]) this._renderRoom(key, models[key]);
    }
    this._dirty.clear();
  }

  _renderRoom(index, model) {
    const refs = this._refs[index];
    if (!refs) return;
    const room = this._config.rooms[index];
    const view = [model.accent, model.status, model.current, model.target, model.humidity, model.valve, model.feels, model.batteryMin, model.windowOpen, model.acActive, model.acActive ? this._acMiniLabel(model) : "", model.heating, this._statsRevision, Math.floor(Date.now() / 600000)].join("|");
    if (refs.view === view) return;
    refs.view = view;
    if (refs.kind === "zone") this._renderZone(room, refs, model);
    else if (refs.kind === "sensor") this._renderTile(room, refs, model);
    else this._renderOutdoor(room, refs, model);
  }

  _dialFraction(value) {
    const min = this._number(this._config.dial_min) ?? 14;
    const max = this._number(this._config.dial_max) ?? 30;
    return Math.min(1, Math.max(0, (value - min) / Math.max(max - min, 1)));
  }

  _metric(node, text, missing, low = false) {
    if (!node) return;
    this._setText(node.querySelector("strong"), text);
    node.classList.toggle("na", missing);
    node.classList.toggle("low", low);
  }

  _renderZone(room, refs, model) {
    refs.host.className = `zone a-${model.accent}${model.heating && !model.acActive ? " is-heating" : ""}${model.acActive ? " is-ac" : ""}`;
    this._setText(refs.status, model.status);
    this._setText(refs.temp, this._format(model.current));
    this._setText(refs.target, model.target === undefined ? "Intet mål" : `Mål ${this._format(model.target)}°`);
    const dash = `${(model.current === undefined ? 0 : this._dialFraction(model.current) * 100).toFixed(2)} 100`;
    refs.value.setAttribute("stroke-dasharray", dash);
    refs.halo.setAttribute("stroke-dasharray", dash);
    if (model.target === undefined) refs.tick.style.display = "none";
    else {
      const angle = DIAL.start + this._dialFraction(model.target) * DIAL.sweep;
      const [x1, y1] = polar(angle, DIAL.r - 8);
      const [x2, y2] = polar(angle, DIAL.r + 8);
      refs.tick.style.display = "";
      refs.tick.setAttribute("x1", x1.toFixed(2)); refs.tick.setAttribute("y1", y1.toFixed(2));
      refs.tick.setAttribute("x2", x2.toFixed(2)); refs.tick.setAttribute("y2", y2.toFixed(2));
    }
    this._metric(refs.metrics.humidity, model.humidity === undefined ? DASH : `${this._format(model.humidity, 0)} %`, model.humidity === undefined);
    this._metric(refs.metrics.valve, model.valve === undefined ? DASH : `${this._format(model.valve, 0)} %`, model.valve === undefined);
    this._metric(refs.metrics.feels, model.feels === undefined ? DASH : `${this._format(model.feels)}°`, model.feels === undefined);
    this._metric(refs.metrics.battery, model.batteryMin === undefined ? DASH : `${this._format(model.batteryMin, 0)} %`, model.batteryMin === undefined, model.batteryLow);
    refs.badges.window?.classList.toggle("show", model.windowOpen);
    refs.badges.battery?.classList.toggle("show", model.batteryLow);
    refs.badges.ac?.classList.toggle("on", model.acActive);
    const visualKind = model.acActive ? "ac" : "radiator";
    if (refs.visualKind !== visualKind) {
      refs.visual.innerHTML = model.acActive ? this._acMiniMarkup(model) : RADIATOR_MARKUP;
      refs.visualKind = visualKind;
    } else if (model.acActive) {
      this._setText(refs.visual.querySelector('[data-role="ac-unit-display"]'), this._acMiniLabel(model));
    }
    this._renderSpark(refs.spark, this._sparkPoints(room, model), model.target);
    refs.host.setAttribute("aria-label", `${room.name}: ${this._format(model.current)} grader, ${model.status}. Åbn detaljer`);
  }

  _renderTile(room, refs, model) {
    refs.host.className = `tile a-${model.accent}`;
    this._setText(refs.temp, this._format(model.current));
    const parts = [];
    if (model.humidity !== undefined) parts.push(`Fugt ${this._format(model.humidity, 0)} %`);
    if (model.feels !== undefined) parts.push(`Føles ${this._format(model.feels)}°`);
    this._setText(refs.meta, parts.join(" · ") || model.status);
    refs.host.querySelector(".t-top b")?.setAttribute("title", model.status);
    this._renderSpark(refs.spark, this._sparkPoints(room, model), undefined);
    refs.host.setAttribute("aria-label", `${room.name}: ${this._format(model.current)} grader, ${model.status}. Åbn detaljer`);
  }

  _renderOutdoor(room, refs, model) {
    this._setText(refs.temp, this._format(model.current));
    const outdoorFraction = model.current === undefined ? 0 : Math.min(1, Math.max(0, (model.current + 20) / 60));
    refs.value.setAttribute("stroke-dasharray", `${(outdoorFraction * 100).toFixed(2)} 100`);
    this._setText(refs.feels, model.feels === undefined ? DASH : `${this._format(model.feels)}°`);
    this._setText(refs.humidity, model.humidity === undefined ? DASH : `${this._format(model.humidity, 0)} %`);
    const points = this._sparkPoints(room, model);
    const lows = points.map((point) => point.min ?? point.v);
    const highs = points.map((point) => point.max ?? point.v);
    this._setText(refs.day, points.length > 1 ? `${this._format(Math.min(...lows))}° – ${this._format(Math.max(...highs))}°` : DASH);
    this._renderSpark(refs.spark, points, undefined);
    refs.host.setAttribute("aria-label", `${room.name}: ${this._format(model.current)} grader. Åbn detaljer`);
  }

  _renderSpark(spark, points, target) {
    if (!spark) return;
    spark.data = points;
    if (points.length < 2) {
      spark.wrap.classList.add("empty");
      spark.scale = undefined;
      this._setText(spark.range, DASH);
      return;
    }
    spark.wrap.classList.remove("empty");
    const t0 = points[0].t;
    const t1 = points[points.length - 1].t;
    const values = points.map((point) => point.v);
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    const showTarget = target !== undefined && target > lo - 1.5 && target < hi + 1.5;
    if (showTarget) { lo = Math.min(lo, target); hi = Math.max(hi, target); }
    const span = Math.max(hi - lo, 1.2);
    const middle = (hi + lo) / 2;
    lo = middle - span * 0.62;
    hi = middle + span * 0.62;
    const x = (time) => ((time - t0) / Math.max(t1 - t0, 1)) * SPARK_W;
    const y = (value) => SPARK_H - ((value - lo) / (hi - lo)) * SPARK_H;
    const line = smoothPath(points.map((point) => [x(point.t), y(point.v)]));
    spark.line.setAttribute("d", line);
    spark.area.setAttribute("d", `${line}L${SPARK_W} ${SPARK_H}L0 ${SPARK_H}Z`);
    if (showTarget) {
      const ty = y(target).toFixed(1);
      spark.target.setAttribute("y1", ty);
      spark.target.setAttribute("y2", ty);
      spark.target.style.display = "";
    } else spark.target.style.display = "none";
    const last = points[points.length - 1];
    spark.dot.style.top = `${((y(last.v) / SPARK_H) * 100).toFixed(1)}%`;
    spark.scale = { t0, t1, lo, hi };
    if (spark.range) {
      const lows = points.map((point) => point.min ?? point.v);
      const highs = points.map((point) => point.max ?? point.v);
      this._setText(spark.range, `${this._format(Math.min(...lows))}° – ${this._format(Math.max(...highs))}°`);
    }
  }

  _renderSummary(models) {
    const summary = this._summary;
    if (!summary) return;
    const rooms = this._config.rooms || [];
    const entries = models.map((model, index) => ({ model, index, room: rooms[index] }));
    const indoor = entries.filter(({ model }) => model.kind !== "outdoor" && model.current !== undefined);
    const zones = entries.filter(({ model }) => model.kind === "zone");
    const heating = zones.filter(({ model }) => model.heating && !model.acActive);
    const open = entries.filter(({ model }) => model.windowOpen);
    const acUnits = new Map();
    entries.filter(({ room }) => room.ac?.climate).forEach(({ room, model }) => {
      const unit = acUnits.get(room.ac.climate) || { names: [], active: false, label: "" };
      unit.names.push(room.name);
      if (model.acActive) { unit.active = true; unit.label = model.ac.label; }
      acUnits.set(room.ac.climate, unit);
    });
    const acOn = [...acUnits.values()].filter((unit) => unit.active);
    const average = indoor.length ? indoor.reduce((sum, { model }) => sum + model.current, 0) / indoor.length : undefined;
    const targets = zones.map(({ model }) => model.target).filter((value) => value !== undefined);
    const demandEntity = this._entity(this._config.total_demand);
    const demand = this._number(demandEntity?.state);
    const dataProblem = this._entity(this._config.data_problem)?.state === "on";
    const view = JSON.stringify([indoor.map(({ model, index }) => [index, model.current, model.accent]), heating.map(({ index }) => index), open.map(({ index }) => index), acOn.map((unit) => unit.names.join()), targets, demand, dataProblem, zones.length]);
    if (summary.view === view) return;
    summary.view = view;
    const names = (list) => list.map(({ room }) => room.name).join(", ");

    summary.flow?.classList.toggle("on", heating.length > 0);
    this._setText(summary.flowText, heating.length ? `Leverer varme · ${heating.length} ${heating.length === 1 ? "zone" : "zoner"}` : "I hvile");
    this._setText(summary.avg, this._format(average));

    // Temperaturspredning: ét punkt pr. rum på fælles akse, målområdet som grønt bånd.
    const values = indoor.map(({ model }) => model.current);
    if (values.length) {
      let lo = Math.floor(Math.min(...values, ...targets) - 0.6);
      let hi = Math.ceil(Math.max(...values, ...targets) + 0.6);
      if (hi - lo < 4) { const pad = (4 - (hi - lo)) / 2; lo -= pad; hi += pad; }
      const pos = (value) => ((value - lo) / (hi - lo)) * 100;
      if (targets.length) {
        const bandLo = Math.min(...targets) - 0.4;
        const bandHi = Math.max(...targets) + 0.7;
        summary.band.style.display = "";
        summary.band.style.left = `${pos(bandLo).toFixed(2)}%`;
        summary.band.style.width = `${Math.max(pos(bandHi) - pos(bandLo), 1).toFixed(2)}%`;
      } else summary.band.style.display = "none";
      const byIndex = new Map(indoor.map((entry) => [entry.index, entry]));
      const lanes = [-1e9, -1e9];
      const placed = summary.dots
        .map((dot) => ({ dot, entry: byIndex.get(dot.index) }))
        .sort((a, b) => (a.entry?.model.current ?? 1e9) - (b.entry?.model.current ?? 1e9));
      for (const { dot, entry } of placed) {
        if (!entry) { dot.el.hidden = true; continue; }
        const left = pos(entry.model.current);
        const lane = left - lanes[0] >= 3.2 ? 0 : left - lanes[1] >= 3.2 ? 1 : (lanes[0] <= lanes[1] ? 0 : 1);
        lanes[lane] = left;
        dot.el.hidden = false;
        dot.el.className = `spread-dot a-${entry.model.accent}`;
        dot.el.style.left = `${left.toFixed(2)}%`;
        dot.el.style.top = lane ? "20px" : "4px";
        dot.el.title = `${entry.room.name}: ${this._format(entry.model.current)}°`;
      }
      const coldest = indoor.reduce((a, b) => (b.model.current < a.model.current ? b : a));
      const warmest = indoor.reduce((a, b) => (b.model.current > a.model.current ? b : a));
      summary.coldest.innerHTML = `Koldest <b>${this._escape(coldest.room.name)} ${this._format(coldest.model.current)}°</b>`;
      summary.warmest.innerHTML = `Varmest <b>${this._escape(warmest.room.name)} ${this._format(warmest.model.current)}°</b>`;
    }

    const setStat = (stat, tone, value, sub) => {
      if (!stat) return;
      stat.el.className = `stat ${tone}`;
      this._setText(stat.value, value);
      this._setText(stat.sub, sub);
    };
    setStat(summary.heat, heating.length ? "hot" : "", `${heating.length} af ${zones.length}`, heating.length ? names(heating) : "Ingen zoner kalder på varme");
    setStat(summary.open, open.length ? "open" : "ok", String(open.length), open.length ? names(open) : "Alle vinduer og døre lukket");
    setStat(summary.ac, acOn.length ? "cool" : "", acOn.length ? `${acOn.length} kører` : "Slukket", acOn.length ? acOn.map((unit) => `${unit.names.join("/")} · ${unit.label.replace(" via AC", "").toLowerCase()}`).join(", ") : `${acUnits.size} ${acUnits.size === 1 ? "enhed" : "enheder"} klar`);
    if (demand !== undefined) {
      setStat(summary.demand, demand > 0 ? "hot" : "", demand >= 1000 ? `${this._format(demand / 1000, 1)} kW` : `${this._format(demand, 0)} W`, "Estimeret varmebehov i alt");
    } else {
      const under = zones.filter(({ model }) => model.tone === "cold").length;
      const over = zones.filter(({ model }) => model.tone === "warm").length;
      setStat(summary.demand, under + over ? "warn" : "ok", String(under + over), `${under} under · ${over} over mål`);
    }
    summary.notice?.classList.toggle("show", dataProblem);
  }

  // ---------- Hover på kurverne (én delegeret lytter) ----------

  _clearHover() {
    this._hoverWrap?.classList.remove("hover");
    this._hoverWrap = undefined;
  }

  _onPointerMove(event) {
    const wrap = event.target?.closest?.(".spark-wrap");
    if (wrap !== this._hoverWrap) this._clearHover();
    const spark = wrap?._spark;
    if (!wrap || !spark?.scale || spark.data.length < 2) return;
    const rect = wrap.querySelector(".spark").getBoundingClientRect();
    if (!rect.width) return;
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const time = spark.scale.t0 + fraction * (spark.scale.t1 - spark.scale.t0);
    let nearest = spark.data[0];
    for (const point of spark.data) if (Math.abs(point.t - time) < Math.abs(nearest.t - time)) nearest = point;
    const left = `${(((nearest.t - spark.scale.t0) / Math.max(spark.scale.t1 - spark.scale.t0, 1)) * 100).toFixed(2)}%`;
    const when = nearest.now ? "Nu" : `Kl. ${new Date(nearest.t).toLocaleTimeString(this._hass?.locale?.language || "da", { hour: "2-digit", minute: "2-digit" })}`;
    spark.cross.style.left = left;
    spark.tip.style.left = left;
    this._setText(spark.tip, `${when} · ${this._format(nearest.v)}°`);
    wrap.classList.add("hover");
    this._hoverWrap = wrap;
  }

  // ---------- AC-animation (delt med ha-ac-climate-card) ----------

  _acMiniLabel(state) {
    const climate = state.ac?.climate;
    const temp = climate?.attributes?.temperature ?? climate?.attributes?.current_temperature;
    return Number.isFinite(Number(temp)) ? `${Math.round(Number(temp))}°` : "AC";
  }

  _acMiniMarkup(state) {
    return `<div class="ac-mini" aria-hidden="true" style="--tone:var(--room-color)">${acUnitVisualMarkup(this._escape(this._acMiniLabel(state)), true)}</div>`;
  }

  // ---------- Rum-popup (uændret fra ha-radiator-overview-card v0.6.1) ----------
  _clampTarget(climate, value) {
    const min = this._number(climate?.attributes?.min_temp) ?? 5;
    const max = this._number(climate?.attributes?.max_temp) ?? 30;
    const step = this._number(climate?.attributes?.target_temp_step) ?? 0.5;
    return Math.min(max, Math.max(min, Math.round(value / step) * step));
  }

  async _setTarget(room, value) {
    const climate = this._entity(room?.climate);
    if (!room?.climate || !climate || !this._hass?.callService) return;
    const temperature = this._clampTarget(climate, value);
    await this._hass.callService("climate", "set_temperature", { entity_id: room.climate, temperature });
  }

  async _setHvac(room, hvacMode) {
    if (!room?.climate || !this._hass?.callService) return;
    await this._hass.callService("climate", "set_hvac_mode", { entity_id: room.climate, hvac_mode: hvacMode });
  }

  _openRoomPopup(index) {
    const room = this._config.rooms?.[index];
    if (!room) return;
    this._closeRoomPopup();
    this._popupRoomIndex = index;
    const backdrop = document.createElement("div");
    backdrop.className = "ha-radiator-room-popup";
    backdrop.style.cssText = "position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;padding:4px;background:rgba(5,9,15,.68);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px)";
    const panel = document.createElement("div");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", `${room.name || "Rum"} varmestyring`);
    panel.tabIndex = -1;
    // Popuppen ruller selv, så indhold under skærmkanten (fx Optimering på en telefon) kan nås.
    panel.style.cssText = "position:relative;width:min(100%,900px);max-height:calc(100dvh - 8px);overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;border-radius:24px;box-shadow:0 28px 80px rgba(0,0,0,.58);outline:none";
    const content = document.createElement("div");
    content.className = "room-popup-content";
    panel.appendChild(content);
    backdrop.appendChild(panel);
    backdrop.addEventListener("click", (event) => { if (event.target === backdrop) this._closeRoomPopup(); });
    // Popuppen ligger uden for Home Assistants app-element, så kortenes more-info-events sendes videre til appen.
    backdrop.addEventListener("hass-more-info", (event) => {
      const app = document.querySelector("home-assistant");
      if (!app) return;
      event.stopPropagation();
      app.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: event.detail }));
    });
    // Escape i Home Assistants egen dialog (fx more-info oven på popuppen) må ikke også lukke popuppen.
    this._escapeHandler = (event) => { if (event.key === "Escape" && !document.querySelector("home-assistant")?.contains(event.target)) this._closeRoomPopup(); };
    document.addEventListener("keydown", this._escapeHandler);
    this._bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.appendChild(backdrop);
    this._popupEl = backdrop;
    this._updateRoomPopup();
    panel.focus();
  }

  _closeRoomPopup() {
    this._popupEl?.remove();
    this._popupEl = undefined;
    this._popupRoomIndex = undefined;
    this._popupCards = [];
    if (this._bodyOverflow !== undefined) document.body.style.overflow = this._bodyOverflow;
    this._bodyOverflow = undefined;
    if (this._escapeHandler) document.removeEventListener("keydown", this._escapeHandler);
    this._escapeHandler = undefined;
  }

  _updateRoomPopup() {
    const content = this._popupEl?.querySelector(".room-popup-content");
    const room = this._config.rooms?.[this._popupRoomIndex];
    if (!content || !room) return;
    const state = this._roomState(room);
    const modes = Array.isArray(state.climate?.attributes?.hvac_modes) ? state.climate.attributes.hvac_modes : [];
    const target = state.target ?? state.current ?? 20;
    const batteryLow = state.batteries.some((value) => value <= 20);
    const acActive = !!state.ac?.active;
    const modeText = acActive ? state.ac.label : !state.climate ? "Måling" : state.off ? "Slukket" : state.heating ? "Varmer nu" : "Holder temperaturen";
    const tabs = [{ id: "temperature", label: "Temperatur" }];
    if (room.ac) tabs.push({ id: "ac", label: "AC" });
    if (room.optimization) tabs.push({ id: "optimization", label: "Optimering" });
    if (!content.dataset.ready) {
      content.dataset.ready = "true";
      // When AC is running it also switches the radiator off, so lead with the
      // AC tab instead of a temperature panel showing a dead radiator.
      content.dataset.defaultTab = acActive ? "ac" : "temperature";
      const defaultTab = content.dataset.defaultTab;
      content.innerHTML = `
      <style>
        *{box-sizing:border-box}.popup{--accent:var(--dashboard-accent,var(--info-color,#38bdf8));--hot:#ff8a3d;--cool:var(--state-cool-icon, var(--info-color, #58aaf8));--ok:var(--dashboard-success,var(--success-color,#5bc99a));--edge:var(--dashboard-border-neutral,var(--divider-color,rgba(255,255,255,.12)));position:relative;overflow:hidden;padding:22px;color:var(--primary-text-color);background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 10%,transparent),transparent 42%),var(--dashboard-card-bg,var(--surface,var(--ha-card-background,var(--card-background-color,#111820))));border:1px solid color-mix(in srgb,var(--accent) 22%,var(--edge));border-radius:24px;font-family:var(--paper-font-body1_-_font-family,inherit)}
        .glow{position:absolute;width:240px;height:240px;right:-110px;top:-120px;border-radius:50%;background:var(--accent);opacity:.13;filter:blur(34px);pointer-events:none}.popup.heating .glow{background:var(--hot)}.popup.ac-cool .glow{background:var(--cool)}.popup.ac-hot .glow{background:var(--hot)}.top{position:relative;display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.eyebrow{display:flex;align-items:center;gap:7px;color:var(--secondary-text-color);font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.dot{width:7px;height:7px;border-radius:50%;background:var(--ok);box-shadow:0 0 12px currentColor}.popup.heating .dot{background:var(--hot)}.popup.ac-cool .dot{background:var(--cool)}.popup.ac-hot .dot{background:var(--hot)}h2{margin:5px 0 0;font-size:25px;line-height:1.05;letter-spacing:-.03em}.close{min-width:42px;min-height:42px;border:1px solid var(--edge);border-radius:50%;background:rgba(0,0,0,.16);color:var(--primary-text-color);font-size:21px;cursor:pointer}.tabs{position:relative;display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:18px 0}.tab{min-height:42px;border:1px solid var(--edge);border-radius:13px;background:rgba(255,255,255,.035);color:var(--secondary-text-color);font:inherit;font-size:12px;font-weight:800;cursor:pointer}.tab.active{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 15%,transparent);color:var(--accent)}.panel[hidden]{display:none}.hero{position:relative;display:grid;grid-template-columns:1fr auto;align-items:center;gap:16px;margin:0 0 20px;padding:18px;border:1px solid color-mix(in srgb,var(--accent) 18%,var(--edge));border-left:calc(var(--dashboard-left-accent-width, 1) * 4px) solid var(--accent);border-radius:18px;background:rgba(255,255,255,.035)}.popup.heating .hero{border-left-color:var(--hot)}.current span,.target-label{display:block;color:var(--secondary-text-color);font-size:10px;font-weight:800;letter-spacing:.09em;text-transform:uppercase}.current strong{display:block;margin-top:3px;font-size:42px;line-height:1}.target{text-align:right}.target strong{display:block;margin-top:3px;font-size:24px}.adjust{display:grid;grid-template-columns:52px 1fr 52px;gap:9px;margin-bottom:12px}.adjust button,.preset,.mode,.details{min-height:46px;border:1px solid var(--edge);border-radius:14px;background:rgba(255,255,255,.045);color:var(--primary-text-color);font:inherit;font-weight:800;cursor:pointer}.adjust .value{display:flex;align-items:center;justify-content:center;border:1px solid color-mix(in srgb,var(--accent) 24%,var(--edge));border-radius:14px;background:color-mix(in srgb,var(--accent) 8%,transparent);font-size:18px;font-weight:800}.presets{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.preset.active{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent)}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:18px 0}.metric{min-width:0;padding:11px;border:1px solid var(--edge);border-radius:14px;background:rgba(0,0,0,.08)}.metric span{display:block;color:var(--secondary-text-color);font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.metric strong{display:block;overflow:hidden;margin-top:4px;font-size:13px;text-overflow:ellipsis;white-space:nowrap}.metric.warn strong{color:var(--error-color,#db4437)}.actions{display:grid;grid-template-columns:1fr 1fr;gap:9px}.mode.on{border-color:color-mix(in srgb,var(--hot) 42%,var(--edge));background:color-mix(in srgb,var(--hot) 12%,transparent)}.details{border-color:color-mix(in srgb,var(--accent) 28%,var(--edge));color:var(--accent)}.empty{padding:30px 18px;text-align:center;border:1px dashed var(--edge);border-radius:16px;color:var(--secondary-text-color)}button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}@media(max-width:440px){.popup{padding:17px}.metrics{grid-template-columns:repeat(2,1fr)}.presets{grid-template-columns:repeat(2,1fr)}.tab{font-size:10px}}
        [data-card-host]{transform-origin:top center}.panel{min-height:0}@media(max-height:700px){.popup{padding:12px}.top h2{font-size:20px}.tabs{margin:8px 0}.tab{min-height:34px}[data-card-host]{zoom:.72}}@media(min-height:701px) and (max-height:820px){[data-card-host]{zoom:.86}}
      </style>
      <div class="popup"><div class="glow"></div><div class="top"><div><div class="eyebrow"><i class="dot"></i>Rumklima · <span data-value="mode-label"></span></div><h2>${this._escape(room.name)}</h2></div><button class="close" aria-label="Luk popup">×</button></div>
        ${tabs.length > 1 ? `<nav class="tabs" aria-label="Indhold for rummet" style="grid-template-columns:repeat(${tabs.length},1fr)">${tabs.map((tab) => `<button class="tab${tab.id === defaultTab ? " active" : ""}" data-tab="${tab.id}">${tab.label}</button>`).join("")}</nav>` : ""}
        ${tabs.map((tab) => `<section class="panel" data-panel="${tab.id}"${tab.id === defaultTab ? "" : " hidden"}><div data-card-host="${tab.id}"></div></section>`).join("")}
      </div>`;
      content.querySelector(".close")?.addEventListener("click", () => this._closeRoomPopup());
      content.querySelectorAll("[data-delta]").forEach((button) => button.addEventListener("click", () => {
        const latest = this._roomState(room);
        this._setTarget(room, (latest.target ?? latest.current ?? 20) + Number(button.dataset.delta));
      }));
      content.querySelectorAll("[data-target]").forEach((button) => button.addEventListener("click", () => this._setTarget(room, Number(button.dataset.target))));
      content.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => this._setHvac(room, button.dataset.mode)));
      content.querySelector(".details")?.addEventListener("click", () => this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles:true, composed:true, detail:{ entityId:room.climate } })));
      content.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => this._selectPopupTab(button.dataset.tab)));
      this._mountPopupCards(content, room);
    }
    const setText = (name, value) => { const node = content.querySelector(`[data-value="${name}"]`); if (node && node.textContent !== value) node.textContent = value; };
    const popup = content.querySelector(".popup");
    popup?.classList.toggle("heating", state.heating && !acActive);
    popup?.classList.toggle("ac-cool", acActive && state.ac.tone === "cool");
    popup?.classList.toggle("ac-hot", acActive && state.ac.tone === "hot");
    setText("mode-label", modeText); setText("mode", modeText);
    setText("current", `${this._format(state.current)}°`); setText("target", `${this._format(state.target)}°`); setText("target-control", `${this._format(target)} °C`);
    setText("humidity", `${this._format(state.humidity,0)}%`); setText("valve", `${this._format(state.valve,0)}%`); setText("window", state.windowOpen ? "Åben" : "Lukket");
    setText("delta", state.delta === undefined ? "—" : `${state.delta > 0 ? "+" : ""}${this._format(state.delta)}°`);
    setText("battery", state.batteries.length ? state.batteries.map((value)=>`${this._format(value,0)}%`).join(" · ") : "—");
    content.querySelector('[data-metric="window"]')?.classList.toggle("warn", state.windowOpen);
    content.querySelector('[data-metric="battery"]')?.classList.toggle("warn", batteryLow);
    content.querySelectorAll("[data-target]").forEach((button) => button.classList.toggle("active", Math.abs(target - Number(button.dataset.target)) < .1));
    content.querySelectorAll("[data-mode]").forEach((button) => { button.disabled = !modes.includes(button.dataset.mode); button.classList.toggle("on", button.dataset.mode === "heat" && !state.off); });
  }

  _selectPopupTab(selected) {
    const content = this._popupEl?.querySelector(".room-popup-content");
    content?.querySelectorAll("[data-tab]").forEach((button) => button.classList.toggle("active", button.dataset.tab === selected));
    content?.querySelectorAll("[data-panel]").forEach((panel) => { panel.hidden = panel.dataset.panel !== selected; });
  }

  async _mountPopupCards(content, room) {
    const definitions = {
      temperature: { type:"custom:ha-temperature-target-card", title:`Temperatur · ${room.name}`, hours:this._config.history_hours || 24, animation:this._config.animation, rooms:[{ name:room.name, icon:room.icon, temperature:room.temperature, climate:room.climate }] },
      ac: room.ac ? { type:"custom:ha-ac-climate-card", title:`AC · ${room.name}`, animation:this._config.animation, units:[room.ac] } : null,
      optimization: room.optimization ? { type:"custom:ha-heating-diagnostics-card", title:`Optimering · ${room.name}`, animation:this._config.animation, learning_hours:this._config.learning_hours || 48, total_demand:this._config.total_demand, data_problem:this._config.data_problem, rooms:[room.optimization] } : null,
    };
    try {
      const helpers = await window.loadCardHelpers();
      if (!this._popupEl || this._config.rooms?.[this._popupRoomIndex] !== room) return;
      for (const [key, definition] of Object.entries(definitions)) {
        const host = content.querySelector(`[data-card-host="${key}"]`);
        if (!host) continue;
        if (!definition) { host.innerHTML = `<div class="empty">${key === "ac" ? "Ingen AC er tilknyttet dette rum" : "Ingen optimeringsdata er tilknyttet dette rum"}</div>`; continue; }
        const card = helpers.createCardElement(definition);
        card.hass = this._hass;
        host.replaceChildren(card);
        this._popupCards.push(card);
      }
    } catch (error) {
      console.warn("HA Radiator Overview Card: popup cards could not be mounted", error);
    }
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, HARadiatorOverviewCardV2);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === TAG)) {
  window.customCards.push({ type: TAG, name: "HA Radiator Overview Card v2", description: "Rumklima-overblik med termostat-skiver, 24-timers kurver og AC-animation", preview: true });
}
console.info(`%c HA RADIATOR OVERVIEW CARD V2 %c v${VERSION} `, "color:white;background:#ef7d32;font-weight:700", "color:#ef7d32;background:#161b22");
