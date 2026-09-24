/*
 * Designsystem: mørk navy/charcoal, diskrete kanter, funktionelle farver.
 * Ingen backdrop-filter og ingen blur/drop-shadow-filtre (kiosk/tablet-ydelse).
 * Animationer bruger transform/opacity; alt slås fra ved prefers-reduced-motion,
 * og alt pauses når kortet ikke er synligt (:host([paused])).
 * Farver, flader, kanter, skygger og font kommer fra brugerens thtema-*-temaer.
 */

export const STYLE = `
:host{
  /* Alt hentes fra de aktive thtema-*-temaer; hex-værdierne er kun fallback uden tema. */
  --ec-text:var(--primary-text-color,#e8eef8);
  --ec-muted:var(--secondary-text-color,#8e9cb4);
  --ec-faint:color-mix(in srgb,var(--ec-muted) 78%,transparent);
  --ec-surface:var(--ha-card-background,var(--card-background-color,#161f33));
  --ec-surface-2:var(--contrast1,color-mix(in srgb,var(--ec-text) 4%,transparent));
  --ec-surface-3:var(--contrast4,color-mix(in srgb,var(--ec-text) 10%,transparent));
  --ec-popup:var(--popupBG,var(--ha-dialog-surface-background,var(--card-background-color,#0f1726)));
  --ec-border:var(--divider-color,rgba(148,163,194,.14));
  --ec-border-strong:var(--ha-card-border-color,var(--outline,rgba(148,163,194,.26)));
  --ec-line:color-mix(in srgb,var(--ec-text) 9%,transparent);
  --ec-accent:var(--dashboard-accent,var(--primary-color,#4f8cff));
  --ec-shadow:var(--ha-card-box-shadow,0 8px 24px -12px rgba(0,0,0,.5));
  --c-el:var(--energy-grid-consumption-color,var(--blue-dark,#4f8cff));
  --c-heat:var(--orange,#ff8a3d);
  --c-water:var(--energy-water-color,#26c6da);
  --c-ev:var(--energy-ev-charging,var(--green,#2fd3a0));
  --c-warn:var(--dashboard-warning,var(--warning-color,#f4b740));
  --c-bad:var(--dashboard-danger,var(--error-color,#ff5d6c));
  --c-ok:var(--dashboard-success,var(--success-color,#34d399));
  --c-price:var(--yellow,#ffd400);
  --r:var(--ha-card-border-radius,18px);
  --r-sm:12px;
  --gap:var(--grid-card-gap,14px);
  display:block;
  container-type:inline-size;
  color:var(--ec-text);
  font-family:var(--primary-font-family,var(--ha-font-family-body,system-ui,sans-serif));
  -webkit-tap-highlight-color:transparent;
}
*{box-sizing:border-box}
[hidden]{display:none!important}
button{font:inherit;color:inherit;background:none;border:0;padding:0;text-align:inherit;cursor:pointer}
.ic{--mdc-icon-size:20px;display:inline-flex;flex:none}
.num{font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.num b{display:inline-block}
.tone-el{--tone:var(--c-el)}.tone-heat{--tone:var(--c-heat)}.tone-water{--tone:var(--c-water)}.tone-ev{--tone:var(--c-ev)}
.tone-warn{--tone:var(--c-warn)}.tone-bad{--tone:var(--c-bad)}.tone-ok{--tone:var(--c-ok)}
.tone-home{--tone:var(--ec-text)}.tone-muted{--tone:var(--ec-muted)}

/* ---------- ramme ---------- */
.shell{position:relative;display:flex;flex-direction:column;gap:18px;min-width:0;padding:16px;border-radius:var(--r);background:var(--dashboard-card-bg,var(--ec-surface));border:var(--ha-card-border-width,1px) solid var(--ec-border);box-shadow:var(--ec-shadow)}
.top{display:flex;align-items:center;justify-content:space-between;gap:16px 24px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:14px;min-width:0}
.brand-mark{display:grid;place-items:center;width:46px;height:46px;border-radius:14px;color:var(--ec-accent);background:color-mix(in srgb,var(--ec-accent) 12%,transparent);border:1px solid color-mix(in srgb,var(--ec-accent) 32%,transparent)}
.brand-mark .ic{--mdc-icon-size:26px}
.brand h1{margin:0;font-size:26px;line-height:1.1;font-weight:700;letter-spacing:-.015em}
.brand p{margin:3px 0 0;font-size:13.5px;color:var(--ec-muted)}

.tabs{display:flex;gap:4px;padding:4px;border-radius:14px;background:var(--ec-surface);border:1px solid var(--ec-border);box-shadow:var(--ec-shadow);overflow-x:auto;scrollbar-width:none;max-width:100%}
.tabs::-webkit-scrollbar{display:none}
.tab{position:relative;display:flex;align-items:center;gap:8px;padding:9px 16px;border-radius:10px;font-size:14px;font-weight:550;color:var(--ec-muted);white-space:nowrap;transition:color .18s ease,background-color .18s ease}
.tab .ic{--mdc-icon-size:18px;color:var(--ec-faint);transition:color .18s ease}
.tab:hover{color:var(--ec-text);background:var(--ec-surface-2)}
.tab.on{color:var(--ec-text);background:var(--dashboard-tab-selected-bg,color-mix(in srgb,var(--ec-accent) 14%,transparent));box-shadow:inset 0 0 0 1px var(--dashboard-tab-selected-border,var(--ec-accent)),0 0 18px -8px var(--ec-accent)}
.tab.on .ic{color:var(--dashboard-icon-active,var(--ec-accent))}
.tab:focus-visible,.clickable:focus-visible,.seg button:focus-visible{outline:2px solid var(--ec-accent);outline-offset:2px}

.panel.enter{animation:enter .22s cubic-bezier(.2,.8,.2,1)}
@keyframes enter{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}

/* ---------- grid ---------- */
.layout{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:var(--gap)}
.a-full{grid-column:span 12}.a-half{grid-column:span 6}.a-third{grid-column:span 4}

/* ---------- kort ---------- */
.card{position:relative;min-width:0;padding:18px;border-radius:var(--r);background:transparent;border:0;box-shadow:none}
.clickable{cursor:pointer;transition:border-color .16s ease,background-color .16s ease,transform .16s ease}
.card.clickable:hover{background:var(--ec-surface-2)}
.card-head{display:flex;align-items:center;gap:10px;min-width:0}
.card-head .ic{color:var(--tone,var(--ec-muted))}
.card-head h3{margin:0;font-size:15px;font-weight:600;line-height:1.25}
.card-head small{display:block;margin-top:2px;font-size:12px;color:var(--ec-muted)}
.hero-head,.sect-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.hint{font-size:12px;color:var(--ec-faint)}
.badge{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;flex:none;color:var(--tone);background:color-mix(in srgb,var(--tone) 12%,transparent);border:1px solid color-mix(in srgb,var(--tone) 26%,transparent)}
.badge.sm{width:32px;height:32px;border-radius:10px}.badge.sm .ic{--mdc-icon-size:18px}
.live{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:var(--ec-muted);letter-spacing:.02em}
.live i{width:7px;height:7px;border-radius:50%;background:var(--c-ok);animation:live 2.4s ease-in-out infinite}
@keyframes live{0%,100%{opacity:.35}50%{opacity:1}}
.chip{display:inline-flex;align-items:center;padding:6px 11px;border-radius:9px;font-size:12px;font-weight:650;letter-spacing:.03em;color:var(--tone,var(--ec-muted));background:color-mix(in srgb,var(--tone,var(--ec-muted)) 12%,transparent);border:1px solid color-mix(in srgb,var(--tone,var(--ec-muted)) 30%,transparent)}
.status{font-size:12.5px;font-weight:600;color:var(--tone,var(--ec-muted))}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--tone)}
.dot.el{--tone:var(--c-el)}.dot.muted{--tone:var(--ec-faint)}

/* ---------- oversigt: live hero ---------- */
.hero-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.hero-item{display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-areas:"b l" "v v" "s s";align-items:center;gap:6px 12px;padding:14px 16px;border-radius:14px;background:transparent;border:0;position:relative;overflow:hidden}
.hero-item::before{content:"";position:absolute;left:0;top:14px;bottom:14px;width:calc(var(--dashboard-left-accent-width,1) * 3px);border-radius:0 3px 3px 0;background:var(--tone);opacity:.85}
.hero-item:hover{background:color-mix(in srgb,var(--tone) 5%,transparent)}
.hero-item .badge{grid-area:b}
.hi-label{grid-area:l;font-size:13px;font-weight:600;color:var(--ec-muted);text-transform:uppercase;letter-spacing:.06em}
.hi-val{grid-area:v;display:flex;align-items:baseline;gap:6px;margin-top:6px}
.hi-val b{font-size:34px;font-weight:700;line-height:1}
.hi-val small{font-size:16px;font-weight:600;color:var(--ec-muted)}
.hi-sub{grid-area:s;font-size:12.5px;color:var(--tone,var(--ec-muted));min-height:1.2em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hero-item .hi-sub{--tone:var(--ec-muted)}
.hero-item .hi-sub.tone-ok{--tone:var(--c-ok)}.hero-item .hi-sub.tone-warn{--tone:var(--c-warn)}.hero-item .hi-sub.tone-water{--tone:var(--c-water)}

/* ---------- KPI ---------- */
.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--gap)}
.kpi{display:flex;flex-direction:column;gap:10px;text-align:left}
.kpi-top{display:flex;align-items:center;gap:10px}
.kpi-label{font-size:12px;font-weight:650;text-transform:uppercase;letter-spacing:.07em;color:var(--ec-muted)}
.kpi .chev{margin-left:auto;color:var(--ec-faint);--mdc-icon-size:18px;transition:transform .16s ease,color .16s ease}
.kpi:hover .chev{transform:translateX(2px);color:var(--tone)}
.kpi-val{display:flex;align-items:baseline;gap:6px}
.kpi-val b{font-size:30px;font-weight:700;line-height:1}
.kpi-val small{font-size:15px;font-weight:600;color:var(--ec-muted)}
.kpi-foot{display:flex;align-items:baseline;gap:6px;padding-top:10px;border-top:1px solid var(--ec-border);font-size:12.5px;color:var(--ec-muted)}
.kpi-foot .num{font-size:15px;font-weight:650;color:var(--ec-text)}

/* ---------- flow ---------- */
.flow{position:relative;height:300px;margin-top:6px}
.flow-lines{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.flow .track{fill:none;stroke:var(--ec-line);stroke-width:2}
.flow .dash{fill:none;stroke:var(--tone);stroke-width:3;stroke-linecap:round;stroke-dasharray:.1 14;opacity:0;transition:opacity .3s ease}
.flow .dash.on{opacity:.95;animation:dash var(--dur,2s) linear infinite}
@keyframes dash{to{stroke-dashoffset:-28}}
.fnode{position:absolute;display:flex;flex-direction:column;align-items:center;gap:3px;width:104px;margin-left:-52px;margin-top:-23px;text-align:center;border-radius:14px}
.fnode.big{margin-top:-32px}
.fbubble{display:grid;place-items:center;width:46px;height:46px;border-radius:50%;color:var(--tone);background:var(--ec-popup);border:1.5px solid color-mix(in srgb,var(--tone) 55%,transparent);transition:border-color .16s ease,transform .16s ease}
.fnode.big .fbubble{width:64px;height:64px}
.fnode.big .fbubble .ic{--mdc-icon-size:28px}
.fnode.clickable:hover .fbubble{transform:scale(1.05);border-color:var(--tone)}
.fval{display:flex;align-items:baseline;gap:3px;margin-top:3px}
.fval b{font-size:15px;font-weight:650}
.fval small{font-size:11.5px;color:var(--ec-muted)}
.flabel{font-size:11.5px;color:var(--ec-muted);line-height:1.2}

/* ---------- grafer ---------- */
.chart-card{display:flex;flex-direction:column;gap:10px}
.chart-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap}
.seg{display:flex;gap:2px;padding:3px;border-radius:10px;background:var(--ec-surface-2);border:1px solid var(--ec-border)}
.seg button{padding:5px 10px;border-radius:7px;font-size:12px;font-weight:600;color:var(--ec-muted);transition:color .15s ease,background-color .15s ease}
.seg button:hover{color:var(--ec-text)}
.seg button.on{color:var(--ec-text);background:color-mix(in srgb,var(--tone) 24%,transparent)}
.chart-sum{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;font-size:12.5px;color:var(--ec-muted)}
.chart-sum [data-total]{font-size:22px;font-weight:700;color:var(--ec-text)}
.sum-cost{font-size:14px;font-weight:600;color:var(--ec-muted)}
.legend-line{display:inline-flex;align-items:center;gap:6px;margin-left:auto}
.legend-line::before{content:"";width:14px;height:2px;border-radius:2px;background:var(--c-price)}
.chart{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr) auto;grid-template-rows:auto auto;column-gap:8px}
.y-axis{grid-row:1;grid-column:1;position:relative;width:30px}
.y-axis.right{grid-column:3;width:34px}
.y-axis span{position:absolute;right:0;transform:translateY(-50%);font-size:11px;color:var(--ec-faint);white-space:nowrap}
.y-axis.right span{right:auto;left:0;color:color-mix(in srgb,var(--c-price) 70%,var(--ec-faint))}
.plot{grid-row:1;grid-column:2;position:relative;height:var(--chart-h,190px);touch-action:pan-y}
.tall .plot{--chart-h:260px}
.grid i{position:absolute;left:0;right:0;border-top:1px solid var(--ec-line)}
.bars{position:absolute;inset:0;display:flex;align-items:stretch;gap:3px}
.bars i{flex:1;min-width:0;height:100%;border-radius:4px 4px 1px 1px;transform-origin:50% 100%;transform:scaleY(0);background:linear-gradient(180deg,var(--tone),color-mix(in srgb,var(--tone) 40%,transparent));opacity:.82;transition:transform .5s cubic-bezier(.2,.8,.2,1),opacity .15s ease}
.bars i.partial{opacity:.45}
.bars i.hover{opacity:1}
.line{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
.line path{fill:none;stroke:var(--c-price);stroke-width:2;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.x-axis{grid-row:2;grid-column:2;position:relative;height:18px;margin-top:6px}
.x-axis span{position:absolute;transform:translateX(-50%);font-size:11px;color:var(--ec-faint);white-space:nowrap}
.chart-msg{grid-row:1;grid-column:1/-1;place-self:center;font-size:13px;color:var(--ec-muted);padding:20px 0}
.chart.is-empty .plot{visibility:hidden}
.hover-line{position:absolute;top:0;bottom:0;border-left:1px dashed var(--ec-border-strong);pointer-events:none}
.tip{position:absolute;top:-6px;z-index:2;transform:translate(-50%,-100%);display:flex;flex-direction:column;gap:2px;min-width:120px;padding:8px 11px;border-radius:10px;font-size:12px;line-height:1.35;white-space:nowrap;background:var(--ec-popup);border:1px solid var(--ec-border-strong);box-shadow:0 10px 24px rgba(0,0,0,.35);pointer-events:none}
.tip b{font-size:12.5px;font-weight:650}
.tip em{font-style:normal;font-weight:700;color:var(--tone);font-size:14px}
.tip small{color:var(--ec-faint)}
.tip .tip-line{color:var(--c-price)}

/* ---------- strøm ---------- */
.hero-main{display:flex;flex-direction:column}
.mega{display:flex;align-items:baseline;gap:8px;margin:4px 0 18px}
.mega b{font-size:60px;font-weight:700;line-height:1;letter-spacing:-.03em}
.mega small{font-size:22px;font-weight:600;color:var(--ec-muted)}
.facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:auto}
.facts > div,.subtile,.tile{padding:10px 12px;border-radius:var(--r-sm);background:var(--ec-surface-2);border:1px solid var(--ec-border);min-width:0}
.facts small,.subtile small,.tile small{display:block;font-size:11.5px;color:var(--ec-muted);margin-bottom:3px}
.facts b,.subtile b{font-size:15px;font-weight:650;white-space:nowrap}
.quad{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--gap)}
.mini{display:flex;flex-direction:column;gap:10px;padding:16px}
.mini-val{display:flex;align-items:baseline;gap:5px}
.mini-val b{font-size:28px;font-weight:700;line-height:1}
.mini-val small{font-size:14px;color:var(--ec-muted);font-weight:600}
.mini-sub{display:flex;gap:6px;align-items:baseline;margin-top:auto;font-size:12px;color:var(--ec-muted)}
.mini-sub .num{font-size:14px;font-weight:650;color:var(--ec-text)}
.acct{--tone:var(--c-el)}
.acct.tone-warn{background:var(--dashboard-surface-warn-dark,linear-gradient(180deg,color-mix(in srgb,var(--c-warn) 10%,transparent),transparent)),var(--ec-surface)}
.stack{display:flex;height:8px;border-radius:99px;overflow:hidden;background:var(--ec-surface-3)}
.stack i{height:100%;flex:none;width:calc(var(--p,0) * 100%);transition:width .6s ease}
.stack .s-meas{background:var(--c-el)}
.stack .s-unm{background:var(--ec-faint)}
.acct-rows{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--ec-muted)}
.acct-rows span{display:inline-flex;align-items:center;gap:6px}
.acct-rows b{color:var(--ec-text);font-weight:650}
.acct-msg{margin-top:auto;font-size:12px;color:var(--ec-muted)}
.acct.tone-warn .acct-msg{color:var(--c-warn)}

.groups{display:flex;flex-direction:column;gap:6px}
.grow{display:grid;grid-template-columns:auto minmax(110px,190px) minmax(0,1fr) 76px 48px;align-items:center;gap:14px;padding:8px 12px 8px 8px;border-radius:12px;border:1px solid transparent;--tone:var(--c-el)}
.grow:hover{background:var(--ec-surface-2);border-color:var(--ec-border)}
.gname{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gwarn{width:7px;height:7px;border-radius:50%;background:var(--c-warn);flex:none}
.gbar,.meter{position:relative;height:8px;border-radius:99px;background:var(--ec-surface-3);overflow:hidden}
.gbar i,.meter i{position:absolute;inset:0;border-radius:inherit;background:linear-gradient(90deg,color-mix(in srgb,var(--tone) 55%,transparent),var(--tone));transform-origin:left;transform:scaleX(var(--p,0));transition:transform .6s cubic-bezier(.2,.8,.2,1)}
.gval{text-align:right;font-size:14px;font-weight:650;white-space:nowrap}
.gshare{text-align:right;font-size:12.5px;color:var(--ec-muted)}

.phases{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.phase{padding:14px;border-radius:14px;background:var(--ec-surface-2);border:1px solid var(--ec-border);--tone:var(--c-el)}
.phase.tone-warn,.phase.tone-bad{border-color:color-mix(in srgb,var(--tone) 45%,transparent)}
.phase:hover{border-color:var(--ec-border-strong)}
.ph-head{display:flex;justify-content:space-between;align-items:center;gap:8px}
.ph-name{font-size:12px;font-weight:650;text-transform:uppercase;letter-spacing:.07em;color:var(--ec-muted)}
.ph-flag{font-size:11px;font-weight:650;color:var(--tone)}
.ph-val{display:flex;align-items:baseline;gap:5px;margin:8px 0 10px}
.ph-val b{font-size:28px;font-weight:700;line-height:1}
.ph-val small{font-size:14px;color:var(--ec-muted);font-weight:600}
.phase dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px 12px;margin:12px 0 0}
.phase dl div{min-width:0}
.phase dt{font-size:11px;color:var(--ec-faint)}
.phase dd{margin:1px 0 0;font-size:13.5px;font-weight:600;white-space:nowrap}

/* ---------- fjernvarme / vand / billader ---------- */
.util-body{display:grid;grid-template-columns:minmax(220px,.9fr) minmax(0,1.6fr);gap:var(--gap);align-items:stretch}
.util-main{display:flex;flex-direction:column;justify-content:center;padding:14px 16px;border-radius:14px;background:var(--ec-surface-2);border:1px solid var(--ec-border)}
.util-main:hover{border-color:color-mix(in srgb,var(--tone) 40%,transparent)}
.util-main > small{font-size:12px;color:var(--ec-muted);text-transform:uppercase;letter-spacing:.07em;font-weight:600}
.util-main .mega{margin:8px 0 6px}
.tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.tiles.four{grid-template-columns:repeat(2,minmax(0,1fr))}
.tile{display:flex;flex-direction:column;justify-content:center;padding:14px 16px}
.tile.clickable:hover{border-color:var(--ec-border-strong)}
.tile b{font-size:24px;font-weight:700;white-space:nowrap}
.tile .u{font-size:14px;font-weight:600;color:var(--ec-muted)}
.subtiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-top:12px}

/* ---------- popup ---------- */
dialog.detail{width:min(560px,calc(100vw - 24px));max-height:min(80vh,720px);padding:0;border-radius:20px;border:1px solid var(--ec-border-strong);background:var(--ec-popup);color:var(--ec-text);box-shadow:0 30px 80px rgba(0,0,0,.55);overflow:hidden}
dialog.detail[open]{display:flex;flex-direction:column;animation:pop .2s cubic-bezier(.2,.8,.2,1)}
dialog.detail::backdrop{background:rgba(4,8,16,.62)}
@keyframes pop{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
.dlg-head{display:flex;align-items:center;gap:12px;padding:18px 18px 14px;border-bottom:1px solid var(--ec-border)}
.dlg-head h3{margin:0;font-size:17px;font-weight:650}
.dlg-head small{display:block;margin-top:2px;font-size:12.5px;color:var(--ec-muted)}
.dlg-close{margin-left:auto;display:grid;place-items:center;width:36px;height:36px;border-radius:10px;color:var(--ec-muted)}
.dlg-close:hover{background:var(--ec-surface-2);color:var(--ec-text)}
.dlg-rows{display:flex;flex-direction:column;gap:4px;padding:10px;overflow-y:auto}
.drow{display:grid;grid-template-columns:auto minmax(0,1fr) auto;grid-template-areas:"i n v" "i b s";align-items:center;gap:4px 12px;padding:10px 12px;border-radius:12px;border:1px solid transparent;--tone:var(--c-el)}
.drow:hover{background:var(--ec-surface-2);border-color:var(--ec-border)}
.drow .badge{grid-area:i}
.drow .dn{grid-area:n;font-size:14px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.drow .dv{grid-area:v;font-size:14px;font-weight:650;text-align:right;white-space:nowrap}
.drow .gbar{grid-area:b;height:6px}
.drow .ds{grid-area:s;font-size:12px;color:var(--ec-muted);text-align:right}
.drow.off .dv{color:var(--ec-faint)}

/* ---------- bevægelse ---------- */
:host([paused]) *,:host([paused]) *::before,:host([paused]) *::after{animation-play-state:paused!important}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}

/* ---------- tablet ---------- */
@container (max-width:1100px){
  .a-third{grid-column:span 6}
  .a-third:last-child{grid-column:span 12}
  .hero-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .util-body{grid-template-columns:1fr}
}
@container (max-width:860px){
  .a-half{grid-column:span 12}
  .kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
  .phases{grid-template-columns:1fr}
  .phase dl{grid-template-columns:repeat(5,minmax(0,1fr))}
}

/* ---------- mobil ---------- */
@container (max-width:600px){
  .shell{gap:12px}
  :host{--gap:10px}
  .layout > *{grid-column:1/-1!important}
  .top{flex-direction:column;align-items:stretch;gap:12px}
  .brand h1{font-size:22px}.brand-mark{width:40px;height:40px}
  .tabs{margin:0 -2px}
  .tab{padding:8px 12px;font-size:13px}
  .card{padding:14px}
  .hero-grid{gap:8px}
  .hero-item{padding:12px;gap:4px 10px}
  .hero-item .badge{width:32px;height:32px;border-radius:10px}
  .hi-val b{font-size:26px}.hi-val small{font-size:13px}
  .hi-label{font-size:11.5px}
  .kpis{gap:8px}
  .kpi-val b{font-size:24px}
  .kpi-label{font-size:11px}
  .mega b{font-size:46px}
  .quad{gap:8px}
  .mini-val b{font-size:22px}
  .grow{grid-template-columns:auto minmax(0,1fr) auto;grid-template-areas:"i n v" "i b s";gap:4px 10px;padding:8px}
  .grow .badge{grid-area:i}.grow .gname{grid-area:n}.grow .gbar{grid-area:b}.grow .gval{grid-area:v}.grow .gshare{grid-area:s}
  .phase dl{grid-template-columns:repeat(3,minmax(0,1fr))}
  .tiles{grid-template-columns:repeat(2,minmax(0,1fr))}
  .tiles > :first-child:nth-last-child(3){grid-column:span 2}
  .x-axis span.minor{display:none}
  .flow{height:280px}
  .fnode{width:84px;margin-left:-42px}
  .fbubble{width:40px;height:40px}
  .fnode{margin-top:-20px}
  .fnode.big{margin-top:-28px}
  .fnode.big .fbubble{width:56px;height:56px}
  .fval b{font-size:13.5px}
  .flabel{font-size:10.5px}
}
@container (max-width:360px){
  .kpis{grid-template-columns:1fr}
}
`;
