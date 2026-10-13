/*
 * HA Room Climate Card - `custom:ha-room-climate-card` (Claude AI, 2026-10-13)
 * User: "Det skal være noget helt nyt eksklusivt med rumkort-fliserne og popup-styringssiderne".
 *
 * A new look for Varme Center's rooms on top of ha-radiator-overview-card-v2's data layer (same config, statistics,
 * room model, room controls from room_controls_dashboard and popup cards). Only the drawing is new:
 * - Room tiles: glass tiles with an aurora glow in the room's colour, the big temperature with − / + for the setpoint
 *   right on the tile, a rail showing the temperature against the target, small gauges for humidity, valve and
 *   feels-like, the 24 h curve across the whole tile and a dock with the room's light, quick buttons and Styring.
 * - Room popup: a hero top with the room, temperature and setpoint, tabs with a sliding marker (Varme, AC, Optimering,
 *   Styring) and a bottom sheet on phones. Luftkvalitet is not in the rooms; it has its own tab in Varme Center.
 * The old card (ha-radiator-overview-card-v2) stays as it is, so the dashboard can switch back by changing the type.
 */
import { HARadiatorOverviewCardV2 } from "../ha-radiator-overview-card-v2/ha-radiator-overview-card-v2.js";
import { AC_UNIT_VISUAL_STYLE, acUnitVisualMarkup } from "../ha-radiator-overview-card-v2/ac-unit-visual.js";

const VERSION = "1.7.0";
const TAG = "ha-room-climate-card";
const DASH = "—";
const SPARK_W = 240;
const SPARK_H = 44;
const RADIATOR_MARKUP = '<div class="radiator" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>';

const STYLE = `
:host{display:block;--rc-accent:var(--dashboard-accent,var(--info-color,#38bdf8));--rc-ok:var(--dashboard-success,var(--success-color,#5bc99a));--rc-hot:#ff8a3d;--rc-hot2:#ffca62;--rc-warm:#f2c14e;--rc-cool:var(--state-cool-icon,var(--info-color,#58aaf8));--rc-open:#a78bfa;--rc-danger:var(--dashboard-danger,var(--error-color,#ef4444));
  --rc-edge:var(--dashboard-border-neutral,var(--divider-color,rgba(255,255,255,.11)));--rc-muted:var(--secondary-text-color,#93a1b0);--rc-ink:var(--primary-text-color,#eef3f8);--rc-surface:var(--dashboard-card-bg,var(--ha-card-background,var(--card-background-color,#141a22)))}
*{box-sizing:border-box}
ha-card{position:relative;overflow:visible;background:none;border:0;border-radius:0;box-shadow:none;color:var(--rc-ink);font-family:var(--primary-font-family,var(--paper-font-body1_-_font-family,inherit))}
button{font:inherit;color:inherit;-webkit-tap-highlight-color:transparent}
.shell{position:relative;padding:22px;container-type:inline-size}

/* header */
.head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:20px}
.eyebrow{display:flex;align-items:center;gap:8px;color:var(--rc-muted);font-size:10.5px;font-weight:800;letter-spacing:.18em;text-transform:uppercase}
.live{width:7px;height:7px;border-radius:50%;background:var(--rc-ok);animation:live 2.6s ease-out infinite}
h2{margin:7px 0 0;font-size:28px;font-weight:800;line-height:1.05;letter-spacing:-.04em}
.sub{margin:6px 0 0;color:var(--rc-muted);font-size:12.5px}
.flow{position:relative;display:flex;align-items:center;gap:12px;min-width:260px;padding:12px 16px 14px;overflow:hidden;border-radius:18px;background:linear-gradient(135deg,rgba(255,255,255,.07),rgba(255,255,255,.02)),var(--rc-surface);box-shadow:inset 0 0 0 1px rgba(255,255,255,.07),0 14px 30px -18px rgba(0,0,0,.7)}
.flow ha-icon{--mdc-icon-size:22px;color:var(--rc-muted)}
.flow span{display:block;color:var(--rc-muted);font-size:9.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
.flow strong{display:block;margin-top:2px;font-size:13.5px;font-weight:800}
.flow-line{position:absolute;left:14px;right:14px;bottom:6px;height:2px;border-radius:2px;background:rgba(255,255,255,.08)}
.flow.on ha-icon{color:var(--rc-hot);filter:drop-shadow(0 0 8px rgba(255,138,61,.6))}
.flow.on .flow-line{background:linear-gradient(90deg,transparent,var(--rc-hot2),var(--rc-hot),transparent);background-size:200% 100%;animation:flow 1.6s linear infinite}
.notice{display:none;align-items:center;gap:10px;margin:-6px 0 18px;padding:11px 15px;border-radius:16px;background:color-mix(in srgb,var(--rc-warm) 11%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--rc-warm) 40%,transparent);font-size:12px}
.notice.show{display:flex}.notice ha-icon{--mdc-icon-size:18px;color:var(--rc-warm)}
.group-head{display:flex;align-items:center;gap:10px;margin:0 4px 14px}
.group-head h3{margin:0;color:var(--rc-muted);font-size:11px;font-weight:800;letter-spacing:.17em;text-transform:uppercase}
.count{min-width:24px;padding:2px 9px;border-radius:99px;background:rgba(255,255,255,.07);font-size:11px;font-weight:800;text-align:center}
.rule{flex:1;height:1px;background:linear-gradient(90deg,var(--rc-edge),transparent)}
.legend{display:flex;flex-wrap:wrap;gap:14px;color:var(--rc-muted);font-size:11px}
.legend span{display:inline-flex;align-items:center;gap:6px}.legend i{width:8px;height:8px;border-radius:50%;background:var(--c);box-shadow:0 0 8px var(--c)}

/* room colours */
.zone,.tile,.spread-dot{--room-color:var(--rc-ok)}
.zone.a-ok,.tile.a-ok,.spread-dot.a-ok{--room-color:var(--rc-ok)}.zone.a-cold,.tile.a-cold,.spread-dot.a-cold{--room-color:var(--rc-cool)}.zone.a-warm,.zone.a-warn,.tile.a-warm,.tile.a-warn,.spread-dot.a-warm,.spread-dot.a-warn{--room-color:var(--rc-warm)}
.zone.a-heating,.tile.a-heating,.spread-dot.a-heating{--room-color:var(--rc-hot)}.zone.a-open,.tile.a-open,.spread-dot.a-open{--room-color:var(--rc-open)}
.zone.a-neutral,.tile.a-neutral{--room-color:color-mix(in srgb,var(--rc-muted) 80%,transparent)}.zone.a-ac-cool,.spread-dot.a-ac-cool{--room-color:var(--rc-cool)}.zone.a-ac-hot,.spread-dot.a-ac-hot{--room-color:var(--rc-hot)}.zone.a-ac-dry{--room-color:#7dd3fc}.zone.a-ac-fan{--room-color:#94a3b8}
.zone.outdoor{--room-color:var(--rc-accent)}

.zones{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,310px),1fr));gap:16px}

/* room tile */
.zone,.tile{position:relative;isolation:isolate;min-width:0;overflow:hidden;border:0;color:inherit;font:inherit;text-align:left;cursor:pointer;
  background:radial-gradient(130% 85% at 100% 0%,color-mix(in srgb,var(--room-color) 20%,transparent),transparent 58%),linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.012) 60%),var(--rc-surface);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.08),inset 0 0 0 1px color-mix(in srgb,var(--room-color) 16%,rgba(255,255,255,.055)),0 22px 44px -26px rgba(0,0,0,.85);
  transition:transform .3s cubic-bezier(.2,1,.3,1),box-shadow .3s ease}
.zone{display:flex;flex-direction:column;border-radius:28px;padding:0}
.zone:hover,.tile:hover{transform:translateY(-3px);box-shadow:inset 0 1px 0 rgba(255,255,255,.1),inset 0 0 0 1px color-mix(in srgb,var(--room-color) 34%,rgba(255,255,255,.06)),0 28px 54px -24px rgba(0,0,0,.9),0 0 40px -22px var(--room-color)}
.zone:focus-visible,.tile:focus-visible{outline:2px solid var(--rc-accent);outline-offset:3px}
.zone .mark{position:absolute;right:-34px;bottom:58px;z-index:-1;--mdc-icon-size:170px;width:170px;height:170px;color:var(--room-color);opacity:.035;pointer-events:none}
/* A light runs around the tile's edge while someone is in the room (user: "løbe rundt ... ligesom navbaren"; "jeg tænkte det skulle være presence"). */
.zone .sheen{position:absolute;inset:0;z-index:2;border-radius:inherit;padding:1.6px;overflow:hidden;opacity:0;pointer-events:none;transition:opacity .4s ease;
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}
.zone .sheen::before{content:"";position:absolute;left:50%;top:50%;width:160%;aspect-ratio:1;translate:-50% -50%;background:conic-gradient(from 0deg,transparent 0 62%,color-mix(in srgb,var(--room-color) 40%,transparent) 76%,var(--glow2,var(--room-color)) 88%,#fff 91%,var(--room-color) 94%,transparent 100%);animation:orbit 4.5s linear infinite}
.zone.is-present .sheen{opacity:1}

.z-head{display:flex;align-items:center;gap:12px;padding:18px 18px 0;min-width:0}
.z-icon{position:relative;flex:none;display:grid;place-items:center;width:46px;height:46px;border-radius:16px;color:var(--room-color);
  background:linear-gradient(145deg,color-mix(in srgb,var(--room-color) 30%,transparent),color-mix(in srgb,var(--room-color) 8%,transparent));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--room-color) 35%,transparent),0 8px 20px -10px var(--room-color)}
.z-icon ha-icon{--mdc-icon-size:24px}
.zone.is-heating .z-icon::after,.zone.is-ac .z-icon::after{content:"";position:absolute;inset:-4px;border-radius:19px;box-shadow:0 0 0 2px color-mix(in srgb,var(--room-color) 55%,transparent);animation:ring 2.4s ease-out infinite}
.z-title{flex:1;min-width:0}
.z-title strong{display:block;overflow:hidden;font-size:18px;font-weight:800;letter-spacing:-.02em;text-overflow:ellipsis;white-space:nowrap}
.z-status{display:flex;align-items:center;gap:7px;margin-top:4px;color:color-mix(in srgb,var(--room-color) 70%,var(--rc-ink));font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap}
.z-status b{flex:none;width:7px;height:7px;border-radius:50%;background:var(--room-color);box-shadow:0 0 10px var(--room-color)}
.z-status em{min-width:0;overflow:hidden;font-style:normal;text-overflow:ellipsis}
.badges{display:flex;flex:none;align-items:center;gap:6px}
.badge{display:none;place-items:center;width:30px;height:30px;border-radius:11px;background:rgba(255,255,255,.06);color:var(--rc-muted);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.badge.show{display:grid}.badge ha-icon{--mdc-icon-size:16px}
.badge.window{color:var(--rc-open);background:color-mix(in srgb,var(--rc-open) 14%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--rc-open) 45%,transparent)}
.badge.battery{color:var(--rc-danger);background:color-mix(in srgb,var(--rc-danger) 14%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--rc-danger) 45%,transparent)}
.badge.ac.on{color:var(--room-color);background:color-mix(in srgb,var(--room-color) 16%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--room-color) 50%,transparent);animation:badge 2.2s ease-in-out infinite}

.z-body{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:16px;align-items:end;padding:16px 18px 10px}
.t-big{display:flex;align-items:flex-start;font-size:56px;font-weight:700;line-height:.9;letter-spacing:-.06em;font-variant-numeric:tabular-nums}
.t-big small{margin:5px 0 0 3px;color:var(--rc-muted);font-size:17px;font-weight:700;letter-spacing:0}
.rail{position:relative;height:6px;margin:14px 2px 0;border-radius:99px;background:linear-gradient(90deg,color-mix(in srgb,var(--rc-cool) 55%,transparent),color-mix(in srgb,var(--rc-ok) 55%,transparent) 50%,color-mix(in srgb,var(--rc-hot) 60%,transparent))}
.rail .tgt{position:absolute;top:-5px;width:2px;height:16px;margin-left:-1px;border-radius:2px;background:var(--rc-ink);opacity:.85;transition:left .5s ease}
.rail .cur{position:absolute;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:var(--room-color);box-shadow:0 0 0 3px var(--rc-surface),0 0 14px var(--room-color);transition:left .6s cubic-bezier(.2,1,.3,1)}
.rail.na .cur,.rail.na .tgt{display:none}
.step{display:flex;align-items:center;gap:6px;margin-top:14px}
.sb{display:grid;place-items:center;flex:none;width:34px;height:34px;padding:0;border:0;border-radius:12px;cursor:pointer;background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.09);--mdc-icon-size:18px;transition:transform .15s ease,background .2s ease}
.sb:hover{background:color-mix(in srgb,var(--room-color) 20%,transparent)}.sb:active{transform:scale(.88)}
.step .tv{flex:1;min-width:0;text-align:left;white-space:nowrap}
.step .tv{display:flex;align-items:baseline;gap:8px}.step .tv strong{margin:0}
.step .tv span{display:block;color:var(--rc-muted);font-size:9px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
.step .tv strong{display:block;margin-top:1px;font-size:15px;font-weight:800;font-variant-numeric:tabular-nums}
.step.pending .tv strong{color:var(--room-color)}
.step.none .sb{visibility:hidden}

.gauges{display:flex;flex-direction:column;gap:9px;min-width:0}
.g{display:grid;grid-template-columns:18px minmax(0,1fr) auto;align-items:center;gap:4px 8px}
.g ha-icon{--mdc-icon-size:16px;color:var(--gc,var(--rc-muted))}
.g span{color:var(--rc-muted);font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.g strong{font-size:13px;font-weight:800;font-variant-numeric:tabular-nums;text-align:right}
.g i{grid-column:2/-1;height:4px;border-radius:9px;background:rgba(255,255,255,.07);overflow:hidden}
.g i::after{content:"";display:block;width:var(--v,0%);height:100%;border-radius:inherit;background:linear-gradient(90deg,color-mix(in srgb,var(--gc,var(--room-color)) 55%,transparent),var(--gc,var(--room-color)));transition:width .6s ease}
.g.na strong{color:var(--rc-muted);font-weight:600}.g.na i::after{width:0}
.g.low{--gc:var(--rc-danger)}.g.low strong{color:var(--rc-danger)}
.g[data-m="humidity"]{--gc:#60a5fa}.g[data-m="valve"]{--gc:var(--rc-hot)}.g[data-m="feels"]{--gc:var(--room-color)}.g[data-m="battery"]{--gc:var(--rc-ok)}

/* curve band */
.band{position:relative;margin-top:auto}
.spark-wrap{position:relative;min-width:0}
.spark-box{position:relative;height:var(--spark-h,56px)}
.spark{position:absolute;inset:0;display:block;width:100%;height:100%;overflow:visible}
.spark .area{fill:var(--room-color);opacity:.13}
.spark .line{fill:none;stroke:var(--room-color);stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke;filter:drop-shadow(0 0 6px color-mix(in srgb,var(--room-color) 60%,transparent))}
.spark .target{stroke:var(--rc-ink);stroke-width:1;stroke-dasharray:3 5;opacity:.35;vector-effect:non-scaling-stroke}
.spark-dot{position:absolute;left:calc(100% - 6px);width:9px;height:9px;margin:-4.5px 0 0 -4.5px;border-radius:50%;background:var(--room-color);box-shadow:0 0 0 3px var(--rc-surface),0 0 12px var(--room-color);pointer-events:none}
.spark-cross{position:absolute;top:0;height:100%;width:1px;background:rgba(255,255,255,.4);opacity:0;pointer-events:none}
.spark-tip{position:absolute;top:-28px;padding:4px 9px;border-radius:9px;background:rgba(10,14,20,.92);color:#fff;font-size:10.5px;font-weight:700;white-space:nowrap;transform:translateX(-50%);opacity:0;pointer-events:none;box-shadow:0 6px 18px rgba(0,0,0,.4)}
.spark-wrap.hover .spark-tip,.spark-wrap.hover .spark-cross{opacity:1}
.spark-wrap.empty .spark,.spark-wrap.empty .spark-dot{visibility:hidden}
.spark-range{position:absolute;left:18px;right:18px;bottom:6px;display:flex;justify-content:space-between;color:var(--rc-muted);font-size:10px;font-weight:700;font-variant-numeric:tabular-nums;pointer-events:none;text-shadow:0 1px 6px rgba(0,0,0,.7)}
.zone .spark-box{margin:0 -1px}

/* room dock */
.z-room{display:none}
.zone.has-room .z-room{display:flex;flex-direction:column;gap:9px;padding:12px 14px 14px;background:linear-gradient(180deg,rgba(0,0,0,.16),rgba(0,0,0,.26));box-shadow:inset 0 1px 0 rgba(255,255,255,.05)}
.chips{overflow:hidden;-webkit-mask:linear-gradient(90deg,#000 calc(100% - 18px),transparent);mask:linear-gradient(90deg,#000 calc(100% - 18px),transparent)}
.chips:not(.mq){-webkit-mask:none;mask:none}
.ct{display:inline-flex;gap:6px;white-space:nowrap}.chips.mq .ct{animation:chipScroll var(--cdur,8s) ease-in-out infinite alternate}
.rc{flex:none;display:inline-flex;align-items:center;gap:5px;padding:4px 10px 4px 7px;overflow:hidden;border-radius:99px;font-size:10.5px;font-weight:750;color:var(--rc-muted);background:rgba(255,255,255,.06);white-space:nowrap;text-overflow:ellipsis}
.rc ha-icon{flex:none;--mdc-icon-size:14px}
.rc.on{color:color-mix(in srgb,var(--rc-ok) 85%,var(--rc-ink));background:color-mix(in srgb,var(--rc-ok) 14%,transparent)}
.rc.lit{color:#ffc46b;background:rgba(255,190,110,.13)}.rc.lit ha-icon{filter:drop-shadow(0 0 5px rgba(255,190,110,.7))}
.rc.media{color:#c4b5fd;background:rgba(167,139,250,.14)}
.rc.warn{color:var(--rc-warm);background:color-mix(in srgb,var(--rc-warm) 14%,transparent)}
.rc.prof{color:#ffb454;background:rgba(255,180,84,.12)}
.rc.manual{color:#c4b5fd;background:rgba(167,139,250,.14)}
.qrow{display:flex;gap:7px}
.qa{position:relative;display:grid;place-items:center;flex:0 0 40px;height:40px;padding:0;border:0;border-radius:14px;overflow:hidden;cursor:pointer;color:var(--rc-muted);background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);transition:transform .15s ease,background .2s ease}
.qa:active{transform:scale(.9)}.qa ha-icon{position:relative;--mdc-icon-size:19px}
.qa.on{color:var(--rc-ok);background:color-mix(in srgb,var(--rc-ok) 15%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--rc-ok) 45%,transparent),0 0 14px -5px var(--rc-ok)}
.qa.light{flex:1;min-width:84px;display:flex;justify-content:flex-start;gap:8px;padding:0 13px;font-size:12.5px;font-weight:800;white-space:nowrap}
.qa.light i{position:absolute;inset:0 auto 0 0;width:var(--lv,0%);background:linear-gradient(90deg,rgba(255,190,110,.16),rgba(255,190,110,.42));transition:width .4s ease}
.qa.light[data-dim='1']{touch-action:pan-y;user-select:none;-webkit-user-select:none}.qa.light.drag i{transition:none}.qa.light.drag{transform:scale(1.02)}
.qa.light i::after{content:"";position:absolute;right:0;top:7px;bottom:7px;width:3px;border-radius:3px;background:#ffd28a;opacity:0;box-shadow:0 0 8px #ffc46b}.qa.light.on i::after{opacity:.9}
.qa.light span{position:relative}.qa.light.on{color:#ffd28a;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,190,110,.5),0 0 18px -8px rgba(255,190,110,.9)}
.qa.more{flex:0 0 auto;display:flex;gap:6px;padding:0 13px;color:var(--rc-accent);font-size:12px;font-weight:800;background:color-mix(in srgb,var(--rc-accent) 12%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--rc-accent) 40%,transparent)}

/* outdoor */
.zone.outdoor{--room-color:var(--rc-accent)}
.zone.outdoor .z-status{color:var(--rc-accent)}

/* measuring points */
.tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:1fr;gap:12px;min-width:0}
.tile{display:flex;flex-direction:column;min-height:96px;padding:13px 14px 0;border-radius:22px}
.tile .t-top{display:flex;align-items:center;gap:8px;min-width:0}
.tile .t-ic{flex:none;display:grid;place-items:center;width:26px;height:26px;border-radius:9px;color:var(--room-color);background:color-mix(in srgb,var(--room-color) 16%,transparent)}
.tile .t-ic ha-icon{--mdc-icon-size:15px}
.tile .t-top strong{flex:1;min-width:0;overflow:hidden;font-size:12.5px;font-weight:800;text-overflow:ellipsis;white-space:nowrap}
.tile .t-top b{flex:none;width:6px;height:6px;border-radius:50%;background:var(--room-color);box-shadow:0 0 8px var(--room-color)}
.tile .t-row{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;margin-top:8px}
.tile .t-temp{display:flex;align-items:flex-start;font-size:26px;font-weight:750;line-height:1;letter-spacing:-.05em;font-variant-numeric:tabular-nums}
.tile .t-temp small{margin:2px 0 0 2px;color:var(--rc-muted);font-size:11px;font-weight:700;letter-spacing:0}
.tile .t-meta{min-width:0;overflow:hidden;color:var(--rc-muted);font-size:10.5px;line-height:1.35;text-align:right}
.tile .spark-wrap{--spark-h:30px;margin:auto -14px 0;padding-top:6px}

/* summary */
.hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.35fr);gap:14px;margin-top:26px}
.panel,.stat{position:relative;isolation:isolate;min-width:0;overflow:hidden;border-radius:24px;background:radial-gradient(120% 90% at 100% 0%,color-mix(in srgb,var(--sc,var(--rc-accent)) 16%,transparent),transparent 60%),linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.012)),var(--rc-surface);box-shadow:inset 0 1px 0 rgba(255,255,255,.07),inset 0 0 0 1px rgba(255,255,255,.055),0 20px 40px -26px rgba(0,0,0,.85)}
.panel{padding:18px 20px}
.label{display:block;color:var(--rc-muted);font-size:10px;font-weight:800;letter-spacing:.15em;text-transform:uppercase}
.big{display:flex;align-items:flex-start;margin-top:8px;font-size:50px;font-weight:700;line-height:.95;letter-spacing:-.055em}
.big small{margin:5px 0 0 4px;color:var(--rc-muted);font-size:16px;font-weight:700;letter-spacing:0}
.spread{position:relative;height:36px;margin:16px 0 4px}
.spread-track{position:absolute;left:0;right:0;top:16px;height:3px;border-radius:3px;background:linear-gradient(90deg,color-mix(in srgb,var(--rc-cool) 45%,transparent),color-mix(in srgb,var(--rc-ok) 45%,transparent),color-mix(in srgb,var(--rc-hot) 45%,transparent))}
.spread-band{position:absolute;top:8px;height:19px;border-radius:8px;background:color-mix(in srgb,var(--rc-ok) 14%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--rc-ok) 50%,transparent)}
.spread-dot{position:absolute;top:0;width:12px;height:12px;margin-left:-6px;border-radius:50%;background:var(--room-color,var(--rc-ok));box-shadow:0 0 0 2px var(--rc-surface),0 0 10px var(--room-color,var(--rc-ok));transition:left .6s ease,top .3s ease}
.spread-dot[hidden]{display:none}
.spread-scale{display:flex;justify-content:space-between;gap:10px;color:var(--rc-muted);font-size:11px}.spread-scale b{color:var(--rc-ink);font-weight:700}
.stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;min-width:0}
.stat{--sc:var(--rc-muted);display:flex;align-items:center;gap:13px;padding:14px 16px}
.stat.hot{--sc:var(--rc-hot)}.stat.warn{--sc:var(--rc-warm)}.stat.cool{--sc:var(--rc-cool)}.stat.ok{--sc:var(--rc-ok)}.stat.open{--sc:var(--rc-open)}
.stat .ic{flex:none;display:grid;place-items:center;width:44px;height:44px;border-radius:15px;color:var(--sc);background:color-mix(in srgb,var(--sc) 16%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--sc) 30%,transparent)}
.stat .ic ha-icon{--mdc-icon-size:22px}
.stat div{min-width:0}
.stat span{display:block;color:var(--rc-muted);font-size:9.5px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}
.stat strong{display:block;margin-top:3px;font-size:19px;font-weight:800;line-height:1.1}
.stat em{display:-webkit-box;margin-top:2px;overflow:hidden;color:var(--rc-muted);font-size:11px;font-style:normal;line-height:1.35;-webkit-line-clamp:2;-webkit-box-orient:vertical}

/* heat visual in the tile corner (user: "en radiator der viser om der kommer varme ... når AC kører den animation fra
   popup-siden"): the radiator glows and flows while it heats; a running AC shows the shared AC unit animation. */
.hv{flex:none;display:flex;align-items:center;justify-content:center;width:70px;height:48px;margin-left:2px}
.radiator{position:relative;display:flex;align-items:flex-end;gap:3px;height:40px;padding:0 4px 6px;color:color-mix(in srgb,var(--rc-muted) 60%,transparent)}
.radiator::before{content:"";position:absolute;left:2px;right:2px;bottom:3px;height:3px;border-radius:9px;background:currentColor;opacity:.45}
.radiator::after{content:"";display:none;position:absolute;left:2px;bottom:2px;width:13px;height:5px;border-radius:9px;background:linear-gradient(90deg,transparent,var(--rc-hot2),#fff,var(--rc-hot2),transparent);filter:drop-shadow(0 0 5px var(--rc-hot))}
.radiator i{display:block;width:7px;height:29px;border:1px solid currentColor;border-radius:3px;background:rgba(145,158,171,.10)}
.zone.is-heating .radiator{color:var(--rc-hot);filter:drop-shadow(0 0 10px rgba(255,138,61,.35))}
.zone.is-heating .radiator::before{opacity:.85;box-shadow:0 0 6px rgba(255,138,61,.5)}
.zone.is-heating .radiator::after{display:block;animation:radiatorFlow 1.25s linear infinite}
.zone.is-heating .radiator i{background:linear-gradient(180deg,rgba(255,202,98,.75),rgba(255,138,61,.14) 46%,rgba(255,138,61,.03) 72%);background-size:100% 230%;box-shadow:inset 0 0 7px rgba(255,202,98,.45),0 0 7px rgba(255,138,61,.24);animation:radiatorFill 1.8s ease-in-out infinite}
.zone.is-heating .radiator i:nth-child(2){animation-delay:.12s}.zone.is-heating .radiator i:nth-child(3){animation-delay:.24s}.zone.is-heating .radiator i:nth-child(4){animation-delay:.36s}.zone.is-heating .radiator i:nth-child(5){animation-delay:.48s}
.ac-mini{position:relative;width:67px;height:50px;overflow:hidden}
.ac-mini .ac-unit-visual{transform:scale(.5);transform-origin:top left}
@keyframes radiatorFlow{from{transform:translateX(-13px)}to{transform:translateX(43px)}}
@keyframes radiatorFill{0%,100%{background-position:0 100%;opacity:.62}50%{background-position:0 0;opacity:1}}
@container (max-width:560px){.hv{width:60px}}

.no-animation *,.no-animation *::before,.no-animation *::after{animation:none!important}
@keyframes live{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--rc-ok) 60%,transparent)}70%,100%{box-shadow:0 0 0 8px transparent}}
@keyframes flow{from{background-position:200% 0}to{background-position:0 0}}
@keyframes orbit{to{rotate:360deg}}
@keyframes chipScroll{0%,15%{transform:translateX(0)}85%,100%{transform:translateX(calc(-1 * var(--cd,0px)))}}
@keyframes ring{0%{opacity:.9;transform:scale(.92)}100%{opacity:0;transform:scale(1.18)}}
@keyframes badge{50%{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--room-color) 50%,transparent),0 0 0 5px color-mix(in srgb,var(--room-color) 16%,transparent)}}
@container (max-width:1180px){.hero{grid-template-columns:1fr}.hero .stats{grid-template-columns:repeat(4,minmax(0,1fr))}}
@container (max-width:760px){.shell{padding:14px}.head{flex-direction:column;align-items:stretch}.flow{min-width:0}.hero .stats{grid-template-columns:repeat(2,minmax(0,1fr))}.big{font-size:42px}.legend{display:none}}
@container (max-width:560px){.zones{grid-template-columns:1fr;gap:12px}.tiles{grid-template-columns:repeat(2,minmax(0,1fr))!important;grid-column:1/-1!important;grid-template-rows:none!important;grid-auto-flow:row!important}
  .zone{border-radius:24px}.z-head{padding:15px 15px 0}.z-body{padding:12px 15px 8px;gap:12px}.t-big{font-size:48px}.stat{padding:12px}.stat .ic{width:38px;height:38px}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
`;

const POPUP_STYLE = `
*{box-sizing:border-box}button{font:inherit;color:inherit;-webkit-tap-highlight-color:transparent}
.pop{--accent:var(--dashboard-accent,var(--info-color,#38bdf8));--rc-ok:var(--dashboard-success,var(--success-color,#5bc99a));--rc-hot:#ff8a3d;--rc-hot2:#ffca62;--rc-warm:#f2c14e;--rc-cool:var(--state-cool-icon,var(--info-color,#58aaf8));--rc-open:#a78bfa;--rc-danger:var(--dashboard-danger,var(--error-color,#ef4444));--rc-muted:var(--secondary-text-color,#93a1b0);--rc-ink:var(--primary-text-color,#eef3f8);
  --room-color:var(--rc-ok);position:relative;overflow:hidden;color:var(--rc-ink);border-radius:inherit;
  background:radial-gradient(90% 60% at 100% 0%,color-mix(in srgb,var(--room-color) 24%,transparent),transparent 62%),radial-gradient(60% 40% at 0% 0%,color-mix(in srgb,var(--accent) 10%,transparent),transparent 70%),linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,0) 40%),var(--dashboard-card-bg,var(--ha-card-background,var(--card-background-color,#111820)));
  font-family:var(--primary-font-family,var(--paper-font-body1_-_font-family,inherit))}
.a-ok{--room-color:var(--rc-ok)}.a-cold{--room-color:var(--rc-cool)}.a-warm,.a-warn{--room-color:var(--rc-warm)}.a-heating{--room-color:var(--rc-hot)}.a-open{--room-color:var(--rc-open)}
.a-neutral{--room-color:color-mix(in srgb,var(--rc-muted) 80%,transparent)}.a-ac-cool{--room-color:var(--rc-cool)}.a-ac-hot{--room-color:var(--rc-hot)}.a-ac-dry{--room-color:#7dd3fc}.a-ac-fan{--room-color:#94a3b8}
.grab{display:none;width:44px;height:5px;margin:9px auto 0;border-radius:9px;background:rgba(255,255,255,.22)}
.ph{position:relative;padding:22px 24px 0}
.ph .mark{position:absolute;right:-30px;top:-40px;--mdc-icon-size:220px;width:220px;height:220px;color:var(--room-color);opacity:.06;pointer-events:none}
.ph-top{position:relative;display:flex;align-items:center;gap:14px}
.ph-ic{flex:none;display:grid;place-items:center;width:54px;height:54px;border-radius:19px;color:var(--room-color);background:linear-gradient(145deg,color-mix(in srgb,var(--room-color) 32%,transparent),color-mix(in srgb,var(--room-color) 8%,transparent));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--room-color) 40%,transparent),0 10px 26px -10px var(--room-color)}
.ph-ic ha-icon{--mdc-icon-size:28px}
.ph-t{flex:1;min-width:0}
.ph-eb{display:flex;align-items:center;gap:7px;color:color-mix(in srgb,var(--room-color) 72%,var(--rc-ink));font-size:10.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
.ph-eb b{width:7px;height:7px;border-radius:50%;background:var(--room-color);box-shadow:0 0 10px var(--room-color)}
.ph h2{margin:4px 0 0;overflow:hidden;font-size:28px;font-weight:800;line-height:1.05;letter-spacing:-.04em;text-overflow:ellipsis;white-space:nowrap}
.close{flex:none;display:grid;place-items:center;width:44px;height:44px;padding:0;border:0;border-radius:15px;cursor:pointer;background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1);--mdc-icon-size:22px;transition:transform .15s ease,background .2s}
.close:hover{background:rgba(255,255,255,.12)}.close:active{transform:scale(.9)}
.ph-main{position:relative;display:flex;flex-wrap:wrap;align-items:flex-end;gap:14px 26px;margin-top:20px}
.ph-temp{display:flex;align-items:flex-start;font-size:66px;font-weight:700;line-height:.85;letter-spacing:-.06em;font-variant-numeric:tabular-nums}
.ph-temp small{margin:6px 0 0 4px;color:var(--rc-muted);font-size:20px;font-weight:700;letter-spacing:0}
.ph-step{display:flex;align-items:center;gap:8px;padding:6px;border-radius:18px;background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.ph-step .sb{display:grid;place-items:center;width:42px;height:42px;padding:0;border:0;border-radius:13px;cursor:pointer;background:rgba(255,255,255,.08);--mdc-icon-size:20px;transition:transform .15s ease,background .2s}
.ph-step .sb:hover{background:color-mix(in srgb,var(--room-color) 24%,transparent)}.ph-step .sb:active{transform:scale(.88)}
.ph-step .tv{min-width:88px;text-align:center}.ph-step .tv span{display:block;color:var(--rc-muted);font-size:9px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
.ph-step .tv strong{display:block;margin-top:2px;font-size:19px;font-weight:800;font-variant-numeric:tabular-nums}
.ph-step.pending .tv strong{color:var(--room-color)}
.ph-step[hidden]{display:none}
.ph-chips{display:flex;flex-wrap:wrap;gap:7px;flex:1 1 220px;justify-content:flex-end}
.pc{display:inline-flex;align-items:center;gap:6px;padding:6px 11px 6px 8px;border-radius:99px;color:var(--rc-muted);background:rgba(255,255,255,.06);font-size:11.5px;font-weight:750;white-space:nowrap}
.pc ha-icon{--mdc-icon-size:15px;color:var(--pcc,var(--rc-muted))}
.pc.warn{color:var(--rc-warm);background:color-mix(in srgb,var(--rc-warm) 14%,transparent)}.pc.warn ha-icon{color:var(--rc-warm)}
.pc[hidden]{display:none}
.tabs{position:sticky;top:0;z-index:5;display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));margin:20px 24px 0;padding:5px;border-radius:18px;background:rgba(10,14,20,.55);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}
.tabs .ind{position:absolute;left:5px;top:5px;bottom:5px;width:calc((100% - 10px) / var(--n));border-radius:13px;background:linear-gradient(145deg,color-mix(in srgb,var(--room-color) 30%,transparent),color-mix(in srgb,var(--room-color) 12%,transparent));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--room-color) 50%,transparent),0 6px 18px -8px var(--room-color);transform:translateX(calc(var(--i) * 100%));transition:transform .38s cubic-bezier(.2,1.1,.3,1)}
.tab{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;gap:7px;min-height:44px;padding:0 6px;border:0;border-radius:13px;background:none;color:var(--rc-muted);font-size:12.5px;font-weight:800;cursor:pointer;transition:color .25s}
.tab ha-icon{--mdc-icon-size:18px}.tab.active{color:var(--rc-ink)}.tab.active ha-icon{color:var(--room-color)}
/* All tabs share one grid cell, so the popup is as tall as its tallest tab and does not jump when switching
   (user: "lav popup i hvert rum så det bare er højden af det største"). */
.body{display:grid;padding:18px 24px 24px}
.panel{grid-area:1/1;min-width:0;animation:fadeUp .35s cubic-bezier(.2,1,.3,1)}
.panel[hidden]{display:block;visibility:hidden;pointer-events:none;animation:none}
.empty{padding:30px 18px;border-radius:18px;background:rgba(255,255,255,.04);color:var(--rc-muted);text-align:center}
button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media(max-width:600px){.grab{display:block}.ph{padding:12px 16px 0}.ph h2{font-size:23px}.ph-ic{width:46px;height:46px;border-radius:16px}.ph-ic ha-icon{--mdc-icon-size:24px}.close{width:40px;height:40px}
  .ph-main{margin-top:14px;gap:12px 16px}.ph-temp{font-size:54px}.ph-chips{justify-content:flex-start;flex-basis:100%}.tabs{margin:14px 12px 0}.tab{flex-direction:column;gap:2px;min-height:48px;font-size:10.5px}.body{padding:14px 12px 20px}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

const TAB_ICONS = { temperature: "mdi:radiator", ac: "mdi:air-conditioner", optimization: "mdi:chart-timeline-variant", controls: "mdi:tune-variant" };

class HARoomClimateCard extends HARadiatorOverviewCardV2 {
  constructor() {
    super();
    this._pending = {};
    // Capture phase: these buttons sit inside the room tile, so they must act before the tile opens its popup.
    this.shadowRoot.addEventListener("click", (event) => {
      const step = event.target?.closest?.("[data-step]");
      if (step) { event.stopPropagation(); event.preventDefault(); this._step(Number(step.closest("[data-room]")?.dataset.room), Number(step.dataset.step)); return; }
      const act = event.target?.closest?.("[data-act]");
      if (act) { event.stopPropagation(); event.preventDefault(); if (this._dimmed) { this._dimmed = false; return; } this._quickAction(act.dataset.act); }
    }, true);
    // The light button in the room dock is a slider (user: "lys-slideren skal kunne bruges, ikke bare tænde og slukke"):
    // a sideways drag dims, a tap toggles. Vertical moves are left to the page, so scrolling still works.
    this.shadowRoot.addEventListener("pointerdown", (e) => {
      const el = e.target?.closest?.(".qa.light[data-dim='1']"); if (!el) return;
      this._dim = { el, id: el.dataset.act, x: e.clientX, y: e.clientY, pid: e.pointerId, moved: false };
    });
    this.shadowRoot.addEventListener("pointermove", (e) => {
      const d = this._dim; if (!d) return;
      if (!d.moved) {
        const dx = Math.abs(e.clientX - d.x), dy = Math.abs(e.clientY - d.y);
        if (dy > 10 && dy > dx) { this._dim = null; return; }
        if (dx < 8) return;
        d.moved = true; try { d.el.setPointerCapture(d.pid); } catch { /* ignore */ } d.el.classList.add("drag", "on");
      }
      const r = d.el.getBoundingClientRect();
      d.pct = Math.max(1, Math.min(100, Math.round(((e.clientX - r.left) / r.width) * 100)));
      d.el.style.setProperty("--lv", `${d.pct}%`);
      const t = d.el.querySelector("span"); if (t) t.textContent = `${d.pct} %`;
    });
    const end = () => {
      const d = this._dim; this._dim = null; if (!d?.moved) return;
      this._dimmed = true; setTimeout(() => { this._dimmed = false; }, 400);
      d.el.classList.remove("drag");
      this._hass.callService("light", "turn_on", { entity_id: d.id, brightness_pct: d.pct });
      this._roomInfoSig = "";
    };
    this.shadowRoot.addEventListener("pointerup", end);
    this.shadowRoot.addEventListener("pointercancel", () => { const d = this._dim; this._dim = null; if (d?.moved) { d.el.classList.remove("drag"); this._roomInfoSig = ""; this._paintRoomInfo(); } });
  }

  static getStubConfig() { return { title: "Radiatorer & rumklima", rooms: [] }; }

  // ---------- setpoint (tile and popup) ----------
  // Presses add up and are sent once the finger rests, so 3 taps = one service call of +1.5°.
  // What the room is steered by right now: the AC's setpoint while the AC runs (it also switches the radiator off),
  // otherwise the radiator thermostat (user: "Når AC kører skal det være dens setpoint der vises og styres efter").
  _control(room, model) {
    if (model?.acActive && model.ac?.climate) { const c = model.ac.climate; return { ac: true, climate: c, target: this._number(c.attributes?.temperature) }; }
    return { ac: false, climate: model?.climate, target: model?.target };
  }

  _step(index, dir) {
    const room = this._config.rooms?.[index]; if (!room) return;
    const model = this._roomModel(room); const ctl = this._control(room, model);
    if (!ctl.climate) return;
    const stepSize = this._number(ctl.climate.attributes?.target_temp_step) ?? (ctl.ac ? 1 : 0.5);
    const base = (this._pending[index]?.ac === ctl.ac ? this._pending[index]?.value : undefined) ?? ctl.target ?? model.current ?? 20;
    const value = this._clampTarget(ctl.climate, base + dir * stepSize);
    clearTimeout(this._pending[index]?.timer);
    const send = () => ctl.ac ? this._hass.callService("climate", "set_temperature", { entity_id: ctl.climate.entity_id, temperature: value }) : this._setTarget(room, value);
    const entry = { value, ac: ctl.ac, timer: setTimeout(async () => { try { await send(); } finally { setTimeout(() => { if (this._pending[index] === entry) { delete this._pending[index]; this._dirty.add(index); this._schedule(); this._updateRoomPopup(); } }, 2500); } }, 700) };
    this._pending[index] = entry;
    this._dirty.add(index); this._schedule(); this._updateRoomPopup();
  }

  _quickAction(id) {
    const d = id.split(".")[0];
    if (d === "media_player") this._hass.callService("media_player", "toggle", { entity_id: id });
    else if (["scene", "script"].includes(d)) this._hass.callService(d, "turn_on", { entity_id: id });
    else if (["button", "input_button"].includes(d)) this._hass.callService(d, "press", { entity_id: id });
    else this._hass.callService("homeassistant", "toggle", { entity_id: id });
  }

  // ---------- build ----------
  _build() {
    const rooms = this._config.rooms || [];
    const indexed = rooms.map((room, index) => ({ room, index }));
    const outdoor = indexed.find(({ room }) => room.outdoor);
    const zones = indexed.filter(({ room }) => !room.outdoor && room.climate);
    const sensors = indexed.filter(({ room }) => !room.outdoor && !room.climate);
    const isId = (id) => typeof id === "string" && id.includes(".");
    this._roomIds = rooms.map((room) => [room.climate, room.temperature, room.humidity, room.window, room.comfort, room.ac?.climate].filter(isId));
    this._summaryIds = [this._config.total_demand, this._config.data_problem].filter(isId);
    const esc = (v) => this._escape(v);
    const spark = (range = true) => `<div class="spark-wrap"><div class="spark-box"><svg class="spark" viewBox="0 0 ${SPARK_W} ${SPARK_H}" preserveAspectRatio="none" aria-hidden="true"><path class="area" d=""></path><line class="target" x1="0" x2="${SPARK_W}" y1="-9" y2="-9"></line><path class="line" d=""></path></svg><i class="spark-dot"></i><i class="spark-cross"></i><span class="spark-tip"></span></div>${range ? `<div class="spark-range"><span>${this._config.history_hours || 24} t</span><span data-f="range">${DASH}</span></div>` : ""}</div>`;
    const gauge = (key, icon, label) => `<div class="g na" data-m="${key}"><ha-icon icon="${icon}"></ha-icon><span>${label}</span><strong>${DASH}</strong><i></i></div>`;
    const zoneMarkup = ({ room, index }) => `
      <div class="zone a-neutral" role="button" tabindex="0" data-room="${index}">
        <i class="sheen"></i><ha-icon class="mark" icon="${esc(room.icon || "mdi:radiator")}"></ha-icon>
        <div class="z-head">
          <span class="z-icon"><ha-icon icon="${esc(room.icon || "mdi:radiator")}"></ha-icon></span>
          <span class="z-title"><strong>${esc(room.name)}</strong><span class="z-status"><b></b><em data-f="status">${DASH}</em></span></span>
          <span class="badges">
            <span class="badge window" data-b="window" title="Vindue eller dør er åben"><ha-icon icon="mdi:window-open-variant"></ha-icon></span>
            <span class="badge battery" data-b="battery" title="Lavt batteri i termostat"><ha-icon icon="mdi:battery-alert-variant-outline"></ha-icon></span>
          </span>
          <span class="hv" data-f="visual" title="Varme"></span>
        </div>
        <div class="z-body">
          <div class="z-temp">
            <div class="t-big"><span data-f="temp">${DASH}</span><small>°C</small></div>
            <div class="rail na" data-f="rail"><i class="tgt"></i><i class="cur"></i></div>
            <div class="step" data-f="step"><div class="tv"><span data-f="tlabel">Mål</span><strong data-f="target">${DASH}</strong></div></div>
          </div>
          <div class="gauges">${gauge("humidity", "mdi:water-percent", "Fugt")}${gauge("valve", "mdi:valve", "Ventil")}${gauge("feels", "mdi:thermometer", "Føles")}${gauge("battery", "mdi:battery-outline", "Batteri")}</div>
        </div>
        <div class="band">${spark()}</div>
        <div class="z-room" data-f="roominfo"></div>
      </div>`;
    const outdoorMarkup = ({ room, index }) => `
      <div class="zone outdoor" role="button" tabindex="0" data-room="${index}">
        <ha-icon class="mark" icon="${esc(room.icon || "mdi:weather-partly-cloudy")}"></ha-icon>
        <div class="z-head">
          <span class="z-icon"><ha-icon icon="${esc(room.icon || "mdi:weather-partly-cloudy")}"></ha-icon></span>
          <span class="z-title"><strong>${esc(room.name || "Udendørs")}</strong><span class="z-status"><b></b><em>Ude nu</em></span></span>
        </div>
        <div class="z-body">
          <div class="z-temp"><div class="t-big"><span data-f="temp">${DASH}</span><small>°C</small></div></div>
          <div class="gauges">
            <div class="g" data-m="feels"><ha-icon icon="mdi:thermometer"></ha-icon><span>Føles</span><strong data-f="feels">${DASH}</strong></div>
            <div class="g" data-m="humidity"><ha-icon icon="mdi:water-percent"></ha-icon><span>Fugt</span><strong data-f="humidity">${DASH}</strong><i data-f="humbar"></i></div>
            <div class="g" data-m="day"><ha-icon icon="mdi:arrow-expand-vertical"></ha-icon><span>Døgnet</span><strong data-f="day">${DASH}</strong></div>
          </div>
        </div>
        <div class="band">${spark()}</div>
      </div>`;
    const tileMarkup = ({ room, index }) => `
      <div class="tile a-neutral" role="button" tabindex="0" data-room="${index}">
        <div class="t-top"><span class="t-ic"><ha-icon icon="${esc(room.icon || "mdi:home-thermometer-outline")}"></ha-icon></span><strong>${esc(room.name)}</strong><b title="Status"></b></div>
        <div class="t-row"><div class="t-temp"><span data-f="temp">${DASH}</span><small>°C</small></div><div class="t-meta" data-f="meta">${DASH}</div></div>
        ${spark(false)}
      </div>`;
    const dots = indexed.filter(({ room }) => !room.outdoor).map(({ room, index }) => `<i class="spread-dot" data-dot="${index}" title="${esc(room.name)}" hidden></i>`).join("");
    const legend = [["var(--rc-cool)", "Under mål"], ["var(--rc-ok)", "På mål"], ["var(--rc-warm)", "Over mål"], ["var(--rc-hot)", "Varmer"], ["var(--rc-open)", "Åben"]].map(([c, l]) => `<span><i style="--c:${c}"></i>${l}</span>`).join("");
    this.shadowRoot.innerHTML = `
      <style>${STYLE}${AC_UNIT_VISUAL_STYLE}</style>
      <ha-card class="${this._config.animation === false ? "no-animation" : ""}">
        <div class="shell">
          <header class="head">
            <div><div class="eyebrow"><i class="live"></i>Rumklima · live</div><h2>${esc(this._config.title)}</h2><p class="sub">${zones.length} termostatzoner · ${sensors.length} målepunkter</p></div>
            <div class="flow" data-s="flow"><ha-icon icon="mdi:heat-wave"></ha-icon><div><span>Varmekreds</span><strong data-s="flowText">${DASH}</strong></div><i class="flow-line"></i></div>
          </header>
          <div class="notice" data-s="notice"><ha-icon icon="mdi:alert-outline"></ha-icon><span>Rumoptimeringen melder et dataproblem – tallene for ventiler og varme kan være ufuldstændige.</span></div>
          <section class="group"><div class="group-head"><h3>Rum</h3><span class="count">${zones.length + sensors.length}</span><i class="rule"></i><div class="legend">${legend}</div></div>
            <div class="zones">${outdoor ? outdoorMarkup(outdoor) : ""}${zones.map(zoneMarkup).join("")}${sensors.length ? `<div class="tiles" role="group" aria-label="Målepunkter">${sensors.map(tileMarkup).join("")}</div>` : ""}</div></section>
          <section class="hero" aria-label="Supplerende overblik">
            <div class="panel indoor"><span class="label">Indendørs gennemsnit</span><div class="big"><span data-s="avg">${DASH}</span><small>°C</small></div>
              <div class="spread" data-s="spread"><i class="spread-track"></i><i class="spread-band" data-s="band"></i>${dots}</div>
              <div class="spread-scale"><span data-s="coldest">${DASH}</span><span data-s="warmest">${DASH}</span></div></div>
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
    if (!this._keyBound) {
      this._keyBound = true;
      root.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target?.matches?.("[data-room]")) { e.preventDefault(); this._openRoomPopup(Number(e.target.dataset.room)); } });
    }
    const sparkRefs = (host) => {
      const wrap = host.querySelector(".spark-wrap"); if (!wrap) return undefined;
      const refs = { wrap, area: wrap.querySelector(".area"), line: wrap.querySelector(".line"), target: wrap.querySelector(".target"), dot: wrap.querySelector(".spark-dot"), cross: wrap.querySelector(".spark-cross"), tip: wrap.querySelector(".spark-tip"), range: wrap.querySelector('[data-f="range"]'), data: [], scale: undefined };
      wrap._spark = refs; return refs;
    };
    this._refs = rooms.map((room, index) => {
      const host = root.querySelector(`[data-room="${index}"]`); if (!host) return undefined;
      const kind = room.outdoor ? "outdoor" : room.climate ? "zone" : "sensor";
      const f = (name) => host.querySelector(`[data-f="${name}"]`);
      return { kind, host, view: "", status: f("status"), temp: f("temp"), target: f("target"), meta: f("meta"), feels: f("feels"), humidity: f("humidity"), humbar: f("humbar"), day: f("day"), rail: f("rail"), step: f("step"), visual: f("visual"), visualKind: "",
        gauges: Object.fromEntries(["humidity", "valve", "feels", "battery"].map((n) => [n, host.querySelector(`.gauges [data-m="${n}"]`)])),
        badges: { window: host.querySelector('[data-b="window"]'), battery: host.querySelector('[data-b="battery"]'), ac: host.querySelector('[data-b="ac"]') }, spark: sparkRefs(host) };
    });
    const s = (name) => root.querySelector(`[data-s="${name}"]`);
    const stat = (name) => { const el = s(name); return el ? { el, value: el.querySelector("strong"), sub: el.querySelector("em") } : undefined; };
    this._summary = { view: "", flow: s("flow"), flowText: s("flowText"), avg: s("avg"), band: s("band"), coldest: s("coldest"), warmest: s("warmest"), notice: s("notice"),
      dots: [...root.querySelectorAll("[data-dot]")].map((el) => ({ el, index: Number(el.dataset.dot) })), heat: stat("heat"), open: stat("open"), ac: stat("ac"), demand: stat("demand") };
    this._zonesEl = root.querySelector(".zones");
    this._tilesEl = root.querySelector(".zones > .tiles");
    this._built = true;
    this._roomInfoSig = "";
    this._observeLayout();
  }

  _fitMetrics() { /* the gauges have room for their values */ }

  // Columns fill the page (user: "bredere så de passer med at fylde siden ud ... selv justere men have en minimum
  // bredde"): as many columns as tile_min_width (default 340 px) allows, or one fewer when that leaves a cleaner last row;
  // the measuring points fill the cells after the last room, two stacked per cell (four when only one cell is free).
  _layoutTiles() {
    const grid = this._zonesEl, block = this._tilesEl;
    if (!grid?.isConnected) return;
    this._fitChips();
    const width = grid.clientWidth; if (!width) return;
    if (width <= 560) { grid.style.gridTemplateColumns = ""; if (block) { block.dataset.layout = ""; block.removeAttribute("style"); } return; }
    const gap = 16, min = Math.max(220, Number(this._config.tile_min_width) || 340);
    const zones = grid.children.length - (block ? 1 : 0), sensors = block ? block.children.length : 0;
    const maxCols = Math.max(1, Math.floor((width + gap) / (min + gap)));
    let best;
    for (let cols = maxCols; cols >= Math.max(1, maxCols - 2); cols--) {
      const used = zones % cols, empty = used ? cols - used : 0;
      let score = (maxCols - cols) * 0.6;
      if (!sensors) score += empty ? 1 : 0;
      else if (empty) { const need = Math.ceil(sensors / 2); score += sensors > empty * 4 ? 9 : Math.abs(empty - need) * (empty < need ? 0.8 : 1); }
      else score += sensors % cols ? 1.2 : 0.4;
      if (!best || score < best.score) best = { cols, empty, score };
    }
    const { cols, empty } = best;
    const tracks = `repeat(${cols}, minmax(0, 1fr))`;
    if (grid.style.gridTemplateColumns !== tracks) grid.style.gridTemplateColumns = tracks;
    if (!block) return;
    let span = cols, columns = Math.min(sensors, cols), rows = 0;
    if (empty && sensors <= empty * 2) { span = empty; columns = Math.ceil(sensors / 2); rows = 2; }
    else if (empty && sensors <= empty * 4) { span = empty; columns = Math.ceil(sensors / 2); rows = 2; }
    const layout = `${span}|${columns}|${rows}`;
    if (block.dataset.layout === layout) return;
    block.dataset.layout = layout;
    block.style.gridColumn = `span ${span}`;
    block.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
    block.style.gridTemplateRows = rows ? "repeat(2, minmax(0, 1fr))" : "";
    block.style.gridAutoFlow = rows ? "column" : "row";
  }

  _renderRoom(index, model) {
    const refs = this._refs[index]; if (!refs) return;
    const room = this._config.rooms[index];
    const view = [model.accent, model.status, model.acActive ? this._acMiniLabel(model) : "", model.current, model.target, this._pending[index]?.value, model.humidity, model.valve, model.feels, model.batteryMin, model.windowOpen, model.acActive, model.heating, this._statsRevision, Math.floor(Date.now() / 600000)].join("|");
    if (refs.view === view) return; refs.view = view;
    if (refs.kind === "zone") this._renderZone(room, refs, model, index);
    else if (refs.kind === "sensor") this._renderTile(room, refs, model);
    else this._renderOutdoor(room, refs, model);
  }

  _gauge(node, text, fraction, missing, low = false) {
    if (!node) return;
    this._setText(node.querySelector("strong"), text);
    node.classList.toggle("na", missing); node.classList.toggle("low", low);
    node.style.setProperty("--v", `${Math.round(Math.min(1, Math.max(0, fraction || 0)) * 100)}%`);
  }

  _renderZone(room, refs, model, index) {
    const keepRoom = (refs.host.querySelector('[data-f="roominfo"]')?._h ? " has-room" : "") + (refs.host.classList.contains("is-present") ? " is-present" : "");
    refs.host.className = `zone a-${model.accent}${model.heating && !model.acActive ? " is-heating" : ""}${model.acActive ? " is-ac" : ""}${keepRoom}`;
    this._setText(refs.status, model.status);
    this._setText(refs.temp, this._format(model.current));
    const ctl = this._control(room, model);
    const pending = this._pending[index]?.ac === ctl.ac ? this._pending[index]?.value : undefined;
    const target = pending ?? ctl.target;
    this._setText(refs.target, target === undefined ? "Intet mål" : `${this._format(target)}°`);
    this._setText(refs.host.querySelector('[data-f="tlabel"]'), ctl.ac ? "AC-mål" : "Mål");
    refs.step?.classList.toggle("pending", pending !== undefined);
    // Rail: target ± 3° with the room's temperature on it.
    if (refs.rail) {
      const ok = model.current !== undefined && target !== undefined;
      refs.rail.classList.toggle("na", !ok);
      if (ok) {
        const pos = (v) => `${(Math.min(1, Math.max(0, (v - target + 3) / 6)) * 100).toFixed(1)}%`;
        refs.rail.querySelector(".tgt").style.left = "50%";
        refs.rail.querySelector(".cur").style.left = pos(model.current);
      }
    }
    this._gauge(refs.gauges.humidity, model.humidity === undefined ? DASH : `${this._format(model.humidity, 0)} %`, (model.humidity ?? 0) / 100, model.humidity === undefined);
    this._gauge(refs.gauges.valve, model.valve === undefined ? DASH : `${this._format(model.valve, 0)} %`, (model.valve ?? 0) / 100, model.valve === undefined);
    this._gauge(refs.gauges.feels, model.feels === undefined ? DASH : `${this._format(model.feels)}°`, model.feels === undefined ? 0 : (model.feels - 14) / 14, model.feels === undefined);
    this._gauge(refs.gauges.battery, model.batteryMin === undefined ? DASH : `${this._format(model.batteryMin, 0)} %`, (model.batteryMin ?? 0) / 100, model.batteryMin === undefined, model.batteryLow);
    refs.badges.window?.classList.toggle("show", model.windowOpen);
    refs.badges.battery?.classList.toggle("show", model.batteryLow);
    const kind = model.acActive ? "ac" : "radiator";
    if (refs.visual && refs.visualKind !== kind) { refs.visual.innerHTML = model.acActive ? this._acMiniMarkup(model) : RADIATOR_MARKUP; refs.visualKind = kind; }
    else if (model.acActive) this._setText(refs.visual?.querySelector('[data-role="ac-unit-display"]'), this._acMiniLabel(model));
    if (refs.visual) refs.visual.title = model.acActive ? model.status : model.heating ? "Radiatoren varmer" : "Radiatoren hviler";
    this._renderSpark(refs.spark, this._sparkPoints(room, model), target);
    refs.host.setAttribute("aria-label", `${room.name}: ${this._format(model.current)} grader, ${model.status}. Åbn detaljer`);
  }

  _renderTile(room, refs, model) {
    refs.host.className = `tile a-${model.accent}`;
    this._setText(refs.temp, this._format(model.current));
    const parts = [];
    if (model.humidity !== undefined) parts.push(`Fugt ${this._format(model.humidity, 0)} %`);
    if (model.feels !== undefined) parts.push(`Føles ${this._format(model.feels)}°`);
    if (refs.meta) refs.meta.innerHTML = parts.length ? parts.map((p) => this._escape(p)).join("<br>") : this._escape(model.status);
    refs.host.querySelector(".t-top b")?.setAttribute("title", model.status);
    this._renderSpark(refs.spark, this._sparkPoints(room, model), undefined);
    refs.host.setAttribute("aria-label", `${room.name}: ${this._format(model.current)} grader, ${model.status}. Åbn detaljer`);
  }

  _renderOutdoor(room, refs, model) {
    this._setText(refs.temp, this._format(model.current));
    this._setText(refs.feels, model.feels === undefined ? DASH : `${this._format(model.feels)}°`);
    this._setText(refs.humidity, model.humidity === undefined ? DASH : `${this._format(model.humidity, 0)} %`);
    refs.host.querySelector('[data-m="humidity"]')?.style.setProperty("--v", `${Math.round(model.humidity ?? 0)}%`);
    const points = this._sparkPoints(room, model);
    const lows = points.map((p) => p.min ?? p.v); const highs = points.map((p) => p.max ?? p.v);
    this._setText(refs.day, points.length > 1 ? `${this._format(Math.min(...lows))}°–${this._format(Math.max(...highs))}°` : DASH);
    this._renderSpark(refs.spark, points, undefined);
    refs.host.setAttribute("aria-label", `${room.name}: ${this._format(model.current)} grader. Åbn detaljer`);
  }

  // ---------- room dock (presence, light, media, profile + quick buttons) ----------
  _paintRoomInfo() {
    if (this._dim?.moved) return;
    if (!this._built || !this._hass || !this._config?.rooms?.some((r) => r.roomInfo || r.controls)) return;
    const st = (id) => (id ? this._hass.states[id] : undefined);
    const sig = JSON.stringify(this._config.rooms.map((r) => { const i = r.roomInfo; if (!i) return r.controls ? 1 : 0; return [st(i.presence)?.state, st(i.presence)?.last_changed, st(i.light)?.state, st(i.light)?.attributes?.brightness, ...(i.status || []).map((x) => [st(x.entity)?.state, st(x.entity)?.attributes?.media_title, st(x.entity)?.attributes?.app_name]), st(i.alert?.entity)?.state, st(i.opening)?.state, st(i.profile)?.state, st(i.model?.override)?.state, st(i.model?.timer)?.state, ...(i.actions || []).map((a) => st(a.entity)?.state)]; })) + Math.floor(Date.now() / 60000);
    if (sig === this._roomInfoSig) return; this._roomInfoSig = sig;
    const ago = (t) => { const m = Math.round((Date.now() - Date.parse(t)) / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} t`; };
    const pct = (l) => Math.round(((l.attributes?.brightness ?? 255) / 255) * 100);
    this._config.rooms.forEach((r, i) => {
      const host = this.shadowRoot.querySelector(`.zone[data-room="${i}"] [data-f="roominfo"]`); if (!host) return;
      const info = r.roomInfo; const chips = [];
      if (info) {
        const p = st(info.presence); if (p) chips.push(p.state === "on" ? ["on", "mdi:account", "Tilstede"] : ["", "mdi:account-outline", `Tomt ${ago(p.last_changed)}`]);
        (info.status || []).forEach((x) => { const s = st(x.entity); if (!s || !["on", "playing", "paused"].includes(s.state)) return;
          const what = x.kind === "media" ? (s.attributes?.media_title || s.attributes?.app_name || s.attributes?.source) : "";
          chips.push(["media", x.icon || (x.kind === "media" ? (s.state === "paused" ? "mdi:pause-circle-outline" : "mdi:play-circle-outline") : "mdi:power"), x.text || (what ? `${x.name || ""}${x.name ? " · " : ""}${what}` : `${x.name || s.attributes?.friendly_name} ${s.state === "playing" ? "spiller" : s.state === "paused" ? "pause" : "tændt"}`)]); });
        const a = st(info.alert?.entity); if (a?.state === "on") chips.push(["on", info.alert.icon || "mdi:star", info.alert.active || "Aktiv"]);
        const o = st(info.opening); if (o?.state === "on") chips.push(["warn", "mdi:window-open-variant", "Åbent"]);
        const pf = st(info.profile); if (pf && !["unknown", "unavailable"].includes(pf.state)) chips.push(["prof", "mdi:palette-outline", pf.state]);
        if (st(info.model?.override)?.state === "on" || st(info.model?.timer)?.state === "active") chips.push(["manual", "mdi:hand-back-right-outline", "Manuel"]);
      }
      const acts = [];
      const l = st(info?.light);
      if (l) { const on = l.state === "on"; const dim = (l.attributes?.supported_color_modes || []).some((m) => m !== "onoff"); acts.push(`<button type="button" class="qa light ${on ? "on" : ""}" data-dim="${dim ? 1 : 0}" data-act="${this._escape(info.light)}" style="--lv:${on ? pct(l) : 0}%" title="Tryk: tænd/sluk · træk til siden: dæmp"><i></i><ha-icon icon="${on ? "mdi:lightbulb-on" : "mdi:lightbulb-outline"}"></ha-icon><span>${on ? `${pct(l)} %` : "Fra"}</span></button>`); }
      (info?.actions || []).slice(0, 2).forEach((x) => { const s2 = st(x.entity); if (!s2) return; const on = ["on", "playing", "paused"].includes(s2.state); acts.push(`<button type="button" class="qa ${on ? "on" : ""}" data-act="${this._escape(x.entity)}" title="${this._escape(x.name || s2.attributes?.friendly_name || "")}"><ha-icon icon="${this._escape(x.icon || s2.attributes?.icon || "mdi:power")}"></ha-icon></button>`); });
      if (r.controls) acts.push(`<button type="button" class="qa more" data-ctl="${i}" title="Styring"><ha-icon icon="mdi:tune-variant"></ha-icon><span>Styring</span></button>`);
      const html = (chips.length ? `<div class="chips"><div class="ct">${chips.map(([cls, ic, t]) => `<span class="rc ${cls}"><ha-icon icon="${this._escape(ic)}"></ha-icon>${this._escape(t)}</span>`).join("")}</div></div>` : "") + (acts.length ? `<div class="qrow">${acts.join("")}</div>` : "");
      if (host._h !== html) { host._h = html; host.innerHTML = html; }
      host.closest(".zone")?.classList.toggle("has-room", !!html);
      host.closest(".zone")?.classList.toggle("is-present", st(info?.presence)?.state === "on");
    });
    this._fitChips();
  }

  // Too many or too long chips stay on one line and scroll back and forth instead of wrapping.
  _fitChips() {
    cancelAnimationFrame(this._chipRaf);
    this._chipRaf = requestAnimationFrame(() => this.shadowRoot?.querySelectorAll(".chips").forEach((box) => {
      const track = box.firstElementChild; if (!track) return;
      const dist = Math.ceil(track.scrollWidth - box.clientWidth);
      const on = box.clientWidth > 0 && dist > 2;
      box.classList.toggle("mq", on);
      if (on) { box.style.setProperty("--cd", `${dist + 18}px`); box.style.setProperty("--cdur", `${Math.max(5, 3 + dist / 18).toFixed(1)}s`); }
    }));
  }

  // ---------- popup ----------
  _openRoomPopup(index) {
    const room = this._config.rooms?.[index]; if (!room) return;
    this._closeRoomPopup();
    this._popupRoomIndex = index;
    const phone = window.matchMedia?.("(max-width:600px)").matches;
    const backdrop = document.createElement("div");
    backdrop.className = "ha-radiator-room-popup";
    backdrop.style.cssText = `position:fixed;inset:0;z-index:999999;display:flex;align-items:${phone ? "flex-end" : "center"};justify-content:center;padding:${phone ? "0" : "12px"};background:rgba(4,7,12,.66);backdrop-filter:blur(8px) saturate(1.2);-webkit-backdrop-filter:blur(8px) saturate(1.2);opacity:0;transition:opacity .25s ease`;
    const panel = document.createElement("div");
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true"); panel.setAttribute("aria-label", `${room.name || "Rum"}`);
    panel.tabIndex = -1;
    panel.style.cssText = `position:relative;width:${phone ? "100%" : "min(100%,960px)"};max-height:${phone ? "94dvh" : "calc(100dvh - 24px)"};overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;border-radius:${phone ? "28px 28px 0 0" : "30px"};box-shadow:0 40px 100px rgba(0,0,0,.65),0 0 0 1px rgba(255,255,255,.08);outline:none;transform:translateY(${phone ? "40px" : "14px"}) scale(${phone ? 1 : 0.98});transition:transform .42s cubic-bezier(.2,1.1,.3,1)`;
    const content = document.createElement("div");
    content.className = "room-popup-content";
    panel.appendChild(content); backdrop.appendChild(panel);
    backdrop.addEventListener("click", (event) => { if (event.target === backdrop) this._closeRoomPopup(); });
    backdrop.addEventListener("hass-more-info", (event) => { const app = document.querySelector("home-assistant"); if (!app) return; event.stopPropagation(); app.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: event.detail })); });
    // Phones: pull the sheet down from the top to close it.
    let y0 = null;
    panel.addEventListener("touchstart", (e) => { y0 = panel.scrollTop <= 0 && e.target.closest?.(".ph") ? e.touches[0].clientY : null; }, { passive: true });
    panel.addEventListener("touchmove", (e) => { if (y0 === null) return; const dy = e.touches[0].clientY - y0; if (dy > 0) { panel.style.transition = "none"; panel.style.transform = `translateY(${dy}px)`; } }, { passive: true });
    panel.addEventListener("touchend", (e) => { if (y0 === null) return; const dy = e.changedTouches[0].clientY - y0; y0 = null; panel.style.transition = "transform .3s cubic-bezier(.2,1,.3,1)"; if (dy > 110) this._closeRoomPopup(); else panel.style.transform = "none"; });
    this._escapeHandler = (event) => { if (event.key === "Escape" && !document.querySelector("home-assistant")?.contains(event.target)) this._closeRoomPopup(); };
    document.addEventListener("keydown", this._escapeHandler);
    this._bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.appendChild(backdrop);
    this._popupEl = backdrop;
    this._updateRoomPopup();
    requestAnimationFrame(() => { backdrop.style.opacity = "1"; panel.style.transform = "none"; });
    panel.focus();
  }

  _selectPopupTab(selected) {
    const content = this._popupEl?.querySelector(".room-popup-content"); if (!content) return;
    const tabs = [...content.querySelectorAll("[data-tab]")];
    const i = Math.max(0, tabs.findIndex((t) => t.dataset.tab === selected));
    if (!tabs.some((t) => t.dataset.tab === selected)) return;
    content.querySelector(".tabs")?.style.setProperty("--i", i);
    tabs.forEach((t) => { t.classList.toggle("active", t.dataset.tab === selected); t.setAttribute("aria-selected", t.dataset.tab === selected ? "true" : "false"); });
    content.querySelectorAll("[data-panel]").forEach((p) => { p.hidden = p.dataset.panel !== selected; });
  }

  _updateRoomPopup() {
    const content = this._popupEl?.querySelector(".room-popup-content");
    const index = this._popupRoomIndex;
    const room = this._config.rooms?.[index];
    if (!content || !room) return;
    const model = this._roomModel(room);
    const tabs = [];
    if (room.climate || room.temperature) tabs.push({ id: "temperature", label: "Varme" });
    if (room.ac) tabs.push({ id: "ac", label: "AC" });
    if (room.optimization) tabs.push({ id: "optimization", label: "Optimering" });
    if (room.controls) tabs.push({ id: "controls", label: "Styring" });
    if (!content.dataset.ready) {
      content.dataset.ready = "true";
      const def = model.acActive && room.ac ? "ac" : tabs[0]?.id;
      const di = Math.max(0, tabs.findIndex((t) => t.id === def));
      content.innerHTML = `<style>${POPUP_STYLE}</style>
        <div class="pop a-neutral">
          <i class="grab"></i>
          <div class="ph">
            <ha-icon class="mark" icon="${this._escape(room.icon || "mdi:home")}"></ha-icon>
            <div class="ph-top">
              <span class="ph-ic"><ha-icon icon="${this._escape(room.icon || "mdi:home")}"></ha-icon></span>
              <div class="ph-t"><div class="ph-eb"><b></b><span data-v="status"></span></div><h2>${this._escape(room.name)}</h2></div>
              <button class="close" aria-label="Luk"><ha-icon icon="mdi:close"></ha-icon></button>
            </div>
            <div class="ph-main">
              <div class="ph-temp"><span data-v="temp">${DASH}</span><small>°C</small></div>
              <div class="ph-step" data-v="step"${room.climate ? "" : " hidden"}><button type="button" class="sb" data-pstep="-1" aria-label="Sænk mål"><ha-icon icon="mdi:minus"></ha-icon></button><div class="tv"><span data-v="tlabel">Mål</span><strong data-v="target">${DASH}</strong></div><button type="button" class="sb" data-pstep="1" aria-label="Hæv mål"><ha-icon icon="mdi:plus"></ha-icon></button></div>
              <div class="ph-chips">
                <span class="pc" data-c="humidity" style="--pcc:#60a5fa"><ha-icon icon="mdi:water-percent"></ha-icon><span></span></span>
                <span class="pc" data-c="feels"><ha-icon icon="mdi:thermometer"></ha-icon><span></span></span>
                <span class="pc" data-c="valve" style="--pcc:var(--rc-hot)"><ha-icon icon="mdi:valve"></ha-icon><span></span></span>
                <span class="pc" data-c="battery" style="--pcc:var(--rc-ok)"><ha-icon icon="mdi:battery-outline"></ha-icon><span></span></span>
                <span class="pc warn" data-c="window"><ha-icon icon="mdi:window-open-variant"></ha-icon><span>Åben</span></span>
              </div>
            </div>
          </div>
          ${tabs.length > 1 ? `<nav class="tabs" role="tablist" style="--n:${tabs.length};--i:${di}"><i class="ind"></i>${tabs.map((t) => `<button class="tab${t.id === def ? " active" : ""}" role="tab" data-tab="${t.id}"><ha-icon icon="${TAB_ICONS[t.id]}"></ha-icon><span>${t.label}</span></button>`).join("")}</nav>` : ""}
          <div class="body">${tabs.map((t) => `<section class="panel" data-panel="${t.id}"${t.id === def ? "" : " hidden"}><div data-card-host="${t.id}"></div></section>`).join("") || '<div class="empty">Ingen data for dette rum</div>'}</div>
        </div>`;
      content.querySelector(".close")?.addEventListener("click", () => this._closeRoomPopup());
      content.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => this._selectPopupTab(b.dataset.tab)));
      content.querySelectorAll("[data-pstep]").forEach((b) => b.addEventListener("click", () => this._step(index, Number(b.dataset.pstep))));
      this._mountPopupCards(content, room);
    }
    const pop = content.querySelector(".pop");
    const cls = `pop a-${model.accent}`; if (pop && pop.className !== cls) pop.className = cls;
    const set = (k, v) => { const n = content.querySelector(`[data-v="${k}"]`); if (n && n.textContent !== v) n.textContent = v; };
    set("status", model.status);
    set("temp", this._format(model.current));
    const ctl = this._control(room, model);
    const pending = this._pending[index]?.ac === ctl.ac ? this._pending[index]?.value : undefined; const target = pending ?? ctl.target;
    set("target", target === undefined ? DASH : `${this._format(target)}°`);
    set("tlabel", ctl.ac ? "AC-mål" : "Mål");
    const stepEl = content.querySelector('[data-v="step"]'); if (stepEl) stepEl.hidden = !ctl.climate;
    content.querySelector('[data-v="step"]')?.classList.toggle("pending", pending !== undefined);
    const chip = (k, text) => { const n = content.querySelector(`[data-c="${k}"]`); if (!n) return; n.hidden = text === undefined; if (text !== undefined) { const s = n.querySelector("span"); if (s.textContent !== text) s.textContent = text; } };
    chip("humidity", model.humidity === undefined ? undefined : `${this._format(model.humidity, 0)} % fugt`);
    chip("feels", model.feels === undefined ? undefined : `Føles ${this._format(model.feels)}°`);
    chip("valve", model.valve === undefined ? undefined : `Ventil ${this._format(model.valve, 0)} %`);
    chip("battery", model.batteryMin === undefined ? undefined : `Batteri ${this._format(model.batteryMin, 0)} %`);
    content.querySelector('[data-c="battery"]')?.classList.toggle("warn", !!model.batteryLow);
    chip("window", model.windowOpen ? "Vindue/dør åben" : undefined);
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, HARoomClimateCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === TAG)) {
  window.customCards.push({ type: TAG, name: "HA Room Climate Card", description: "Varme Centers rum: eksklusive rumfliser med mål-justering, kurve og rumstyring, og en ny rum-popup", preview: true });
}
console.info(`%c HA ROOM CLIMATE CARD %c v${VERSION} `, "color:white;background:#ff8a3d;font-weight:700", "color:#ff8a3d;background:#161b22");
