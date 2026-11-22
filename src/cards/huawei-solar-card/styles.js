// Styles: the card (STYLE), the popup (POP_STYLE) and the 3D scene (STYLE3D).
export const STYLE = `
:host{--sun:#e9b85c;--home:#86c8ea;--bat:#6fd6a6;--grid:#a99cf0;--exp:#ee9b6c;--ev:#e690bb;--bad:#ef6b7b;
  --ink:var(--primary-text-color,#eceff5);--mut:color-mix(in srgb,var(--ink) 52%,transparent);--faint:color-mix(in srgb,var(--ink) 30%,transparent);
  --paper:var(--ha-card-background,var(--card-background-color,#12161f));--line:color-mix(in srgb,var(--ink) 8%,transparent);
  --soft:color-mix(in srgb,var(--ink) 3.5%,transparent);--r:var(--ha-card-border-radius,22px);display:block;font-variant-numeric:tabular-nums}
*{box-sizing:border-box}
.wrap{display:grid;gap:12px}
.card{position:relative;border-radius:var(--r);padding:18px 18px 16px;overflow:hidden;isolation:isolate;
  background:radial-gradient(120% 80% at 50% -10%,color-mix(in srgb,var(--ink) 5%,transparent),transparent 60%),var(--paper);
  box-shadow:0 1px 0 color-mix(in srgb,var(--ink) 6%,transparent) inset,0 20px 40px -24px #000c;animation:rise .8s cubic-bezier(.2,.8,.2,1) both}
.card::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;z-index:2;
  background:linear-gradient(140deg,color-mix(in srgb,var(--ink) 22%,transparent),color-mix(in srgb,var(--ink) 4%,transparent) 35%,color-mix(in srgb,var(--ink) 3%,transparent) 65%,color-mix(in srgb,var(--ink) 14%,transparent));
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
.card::after{content:"";position:absolute;inset:-40%;pointer-events:none;z-index:-1;opacity:.5;
  background:conic-gradient(from 0deg,transparent 0 70%,color-mix(in srgb,var(--glow,var(--sun)) 9%,transparent) 80%,transparent 90%);animation:spin 22s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes rise{from{opacity:0;transform:translateY(10px)}}
.eb{font-size:10px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--mut)}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.ttl{font-size:15px;font-weight:500;color:var(--ink);margin-top:5px;line-height:1.35;letter-spacing:-.005em;transition:opacity .4s}
.pill{display:inline-flex;align-items:center;gap:7px;padding:5px 10px 5px 9px;border-radius:99px;font-size:11px;font-weight:600;letter-spacing:.02em;white-space:nowrap;
  color:var(--c,var(--bat));background:color-mix(in srgb,var(--c,var(--bat)) 10%,transparent);border:1px solid color-mix(in srgb,var(--c,var(--bat)) 22%,transparent)}
.pill .d{width:6px;height:6px;border-radius:50%;background:currentColor;box-shadow:0 0 0 0 currentColor;animation:ping 2.4s infinite}
@keyframes ping{0%{box-shadow:0 0 0 0 color-mix(in srgb,currentColor 60%,transparent)}70%{box-shadow:0 0 0 6px transparent}100%{box-shadow:0 0 0 0 transparent}}
.i{display:block;flex:none}
.hair{height:1px;background:linear-gradient(90deg,transparent,var(--line) 12%,var(--line) 88%,transparent);margin:14px 0}

/* flow */
.flow{margin:6px -6px 0}
.flow svg{display:block;width:100%;height:auto;overflow:visible}
.track{fill:none;stroke:var(--line);stroke-width:1.5;stroke-linecap:round}
.lit{fill:none;stroke-width:1.5;stroke-linecap:round;opacity:0;transition:opacity 1s,stroke 1s}
.node{cursor:pointer}
.node .disc{transition:stroke 1s,fill 1s}
.node .ico{transition:color 1s}
.node:hover .disc{stroke-width:1.6}
.halo{fill:none;stroke-width:1;opacity:0;transform-box:fill-box;transform-origin:center}
.halo.on{animation:halo 3.2s cubic-bezier(.2,.6,.3,1) infinite}
@keyframes halo{0%{opacity:.55;transform:scale(1)}100%{opacity:0;transform:scale(1.7)}}
.nl{fill:var(--mut);font-size:9px;font-weight:600;letter-spacing:.18em}
.nv{fill:var(--ink);font-size:17px;font-weight:600;letter-spacing:-.02em}
.ns{fill:var(--mut);font-size:10px}
.mid{text-anchor:middle}.end{text-anchor:end}
:host(.narrow) .nv{font-size:25px}:host(.narrow) .nl{font-size:12px}:host(.narrow) .ns{font-size:13.5px}:host(.narrow) .flow{margin:10px -10px 0}
.bolt{opacity:0}.ev-on .bolt{opacity:1;animation:blink 1.4s infinite}
@keyframes blink{50%{opacity:.25}}
.noflow .top,.noflow .flow,.noflow #hair0{display:none}
.offline .flow svg{opacity:.35;filter:grayscale(1);transition:opacity .6s}

/* stat strip */
.strip{display:grid;grid-template-columns:repeat(4,1fr);gap:0}
.strip>div{padding:0 12px;border-left:1px solid var(--line);min-width:0}
.strip>div:first-child{border-left:0;padding-left:2px}
.sv{font-size:17px;font-weight:600;color:var(--ink);letter-spacing:-.02em;margin-top:5px;white-space:nowrap}
.sv small{font-size:11px;font-weight:500;color:var(--mut);margin-left:3px;letter-spacing:0}
.mbar{height:3px;border-radius:3px;background:var(--line);margin-top:8px;overflow:hidden}
.mbar i{display:block;height:100%;width:0;border-radius:3px;background:linear-gradient(90deg,color-mix(in srgb,var(--c,var(--sun)) 55%,transparent),var(--c,var(--sun)));transition:width 1.6s cubic-bezier(.2,.8,.2,1)}
@media(max-width:520px){.strip{grid-template-columns:repeat(2,1fr);row-gap:14px}.strip>div:nth-child(3){border-left:0;padding-left:2px}}

/* chart */
.chart{position:relative;margin-top:2px}
.chart svg{display:block;width:100%;height:auto;overflow:visible;color:var(--ink)}
.tip{position:absolute;pointer-events:none;background:color-mix(in srgb,var(--paper) 88%,#000);border:1px solid var(--line);border-radius:10px;
  padding:7px 10px;font-size:11px;line-height:1.5;color:var(--ink);white-space:nowrap;opacity:0;transition:opacity .15s;transform:translate(-50%,-118%);z-index:3;box-shadow:0 10px 30px #0007}
.leg{display:flex;gap:12px;font-size:10px;color:var(--mut);letter-spacing:.04em}
.leg i{display:inline-block;width:8px;height:2px;border-radius:2px;margin-right:5px;vertical-align:3px}
.draw{stroke-dasharray:3000;stroke-dashoffset:3000;animation:draw 2.4s cubic-bezier(.4,0,.2,1) forwards}
@keyframes draw{to{stroke-dashoffset:0}}
.fadein{opacity:0;animation:fi 1.6s .5s forwards}@keyframes fi{to{opacity:1}}
.grow{transform-box:fill-box;transform-origin:bottom;animation:grow .9s cubic-bezier(.2,.8,.2,1) both}
@keyframes grow{from{transform:scaleY(0)}}

/* side */
.quad{display:grid;grid-template-columns:repeat(4,1fr)}
.quad>div{padding:0 10px;border-left:1px solid var(--line);min-width:0}
.quad>div:first-child{border-left:0;padding-left:2px}
.qv{font-size:19px;font-weight:600;letter-spacing:-.025em;color:var(--ink);margin-top:5px;white-space:nowrap}
.qv small{font-size:10px;color:var(--mut);font-weight:500;margin-left:2px}
.qk{display:flex;align-items:center;gap:5px}
.qk .dt{width:6px;height:6px;border-radius:2px;background:var(--c)}
.sect{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}
.click{cursor:pointer;border-radius:14px;margin:-8px;padding:8px;transition:background .25s}
.click:hover{background:var(--soft)}
.batline{display:flex;align-items:baseline;gap:10px}
.big{font-size:30px;font-weight:600;letter-spacing:-.04em;color:var(--ink);line-height:1}
.big small{font-size:14px;color:var(--mut);font-weight:500;margin-left:1px}
.meta{font-size:12px;color:var(--mut)}
.meta b{color:var(--ink);font-weight:600}
.socbar{position:relative;height:8px;border-radius:8px;background:var(--line);overflow:hidden;margin:12px 0 10px}
.socbar i{position:absolute;inset:0 auto 0 0;width:0;border-radius:8px;background:linear-gradient(90deg,#3aa57a,var(--bat));transition:width 1.8s cubic-bezier(.2,.8,.2,1);overflow:hidden}
.socbar i::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.45),transparent);transform:translateX(-100%);animation:sweep 3s ease-in-out infinite}
.socbar.dis i::after{animation-direction:reverse}
.socbar.idle i::after{animation:none}
@keyframes sweep{to{transform:translateX(100%)}}
.socbar .mk{position:absolute;top:-2px;bottom:-2px;width:1px;background:var(--faint)}
.row2{display:flex;justify-content:space-between;align-items:center;gap:10px}
.ghost{appearance:none;border:1px solid var(--line);background:transparent;color:var(--ink);border-radius:99px;padding:6px 12px 6px 10px;font:inherit;font-size:12px;font-weight:600;
  display:inline-flex;align-items:center;gap:6px;cursor:pointer;transition:all .25s}
.ghost:hover{border-color:color-mix(in srgb,var(--c,var(--bat)) 50%,transparent);background:color-mix(in srgb,var(--c,var(--bat)) 10%,transparent);color:var(--c,var(--bat))}
.price{font-size:22px;font-weight:600;letter-spacing:-.03em;color:var(--ink)}
.price small{font-size:12px;color:var(--mut);font-weight:500;margin-left:3px}
.chips{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.chipb{appearance:none;border:1px solid var(--line);background:var(--soft);color:var(--ink);border-radius:14px;padding:10px;font:inherit;text-align:left;cursor:pointer;min-width:0;
  transition:border-color .25s,transform .2s,background .25s}
.chipb:hover{border-color:color-mix(in srgb,var(--c) 45%,transparent);background:color-mix(in srgb,var(--c) 7%,transparent);transform:translateY(-1px)}
.chipb .h{display:flex;align-items:center;gap:6px;color:var(--c);font-size:10px;font-weight:600;letter-spacing:.14em;text-transform:uppercase}
.chipb b{display:block;font-size:14px;font-weight:600;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chipb span{display:block;font-size:11px;color:var(--mut);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chipb.warn{--c:var(--bad)!important;border-color:color-mix(in srgb,var(--bad) 40%,transparent)}
@media(max-width:420px){.quad{grid-template-columns:repeat(2,1fr);row-gap:12px}.quad>div:nth-child(3){border-left:0;padding-left:2px}.qv{font-size:17px}}
`;

export const POP_STYLE = `
:host{position:fixed;inset:0;z-index:1000;display:grid;place-items:center}
.bg{position:absolute;inset:0;background:color-mix(in srgb,#000 62%,transparent);backdrop-filter:blur(10px) saturate(.8);animation:fade .3s both}
@keyframes fade{from{opacity:0}}
.dlg{position:relative;width:min(640px,94vw);max-height:86vh;overflow:auto;color:var(--ink);border-radius:26px;overscroll-behavior:contain;
  background:radial-gradient(120% 60% at 50% -10%,color-mix(in srgb,var(--c) 9%,transparent),transparent 60%),var(--paper);
  box-shadow:0 40px 100px -20px #000,0 0 0 1px color-mix(in srgb,var(--ink) 10%,transparent);animation:pop .45s cubic-bezier(.16,1,.3,1) both}
@keyframes pop{from{opacity:0;transform:translateY(24px) scale(.97)}}
.head{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:12px;padding:18px 20px 14px;
  background:linear-gradient(var(--paper) 70%,transparent)}
.head .ib{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;color:var(--c);background:color-mix(in srgb,var(--c) 12%,transparent);border:1px solid color-mix(in srgb,var(--c) 25%,transparent)}
.head h2{margin:0;font-size:17px;font-weight:600;flex:1;letter-spacing:-.01em}
.x{appearance:none;border:1px solid var(--line);background:transparent;color:var(--mut);width:34px;height:34px;border-radius:50%;font-size:18px;cursor:pointer;transition:all .2s}
.x:hover{color:var(--ink);transform:rotate(90deg)}
.body{padding:2px 20px 22px;display:grid;gap:12px}
.sec{font-size:10px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--mut);margin-top:8px}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:1px;background:var(--line);border-radius:16px;overflow:hidden;border:1px solid var(--line)}
.cell{padding:12px 14px;background:var(--paper)}
.cell span{font-size:11px;color:var(--mut)}
.cell b{display:block;font-size:16px;font-weight:600;margin-top:4px;letter-spacing:-.015em}
.ctl{display:grid;gap:10px;padding:14px 16px;border-radius:16px;border:1px solid var(--line);transition:border-color .3s,background .3s}
.ctl.dirty{border-color:color-mix(in srgb,var(--sun) 60%,transparent);background:color-mix(in srgb,var(--sun) 5%,transparent)}
.ctl .h{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:13px;font-weight:600}
.ctl .h small{font-weight:500;color:var(--mut);font-size:11px}
.ctl .help{font-size:11.5px;color:var(--mut);line-height:1.5}
.seg{display:flex;flex-wrap:wrap;gap:4px;padding:3px;border-radius:12px;background:var(--soft);border:1px solid var(--line)}
.seg button{appearance:none;flex:1 1 auto;border:0;background:transparent;color:var(--mut);padding:7px 10px;border-radius:9px;font:inherit;font-size:12px;font-weight:600;cursor:pointer;transition:all .25s}
.seg button:hover{color:var(--ink)}
.seg button.on{background:color-mix(in srgb,var(--c,var(--sun)) 18%,transparent);color:var(--c,var(--sun));box-shadow:0 0 0 1px color-mix(in srgb,var(--c,var(--sun)) 35%,transparent) inset}
input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:4px;border-radius:4px;background:var(--line);outline:none}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:var(--paper);border:2px solid var(--c,var(--sun));box-shadow:0 0 0 4px color-mix(in srgb,var(--c,var(--sun)) 18%,transparent);cursor:pointer}
input[type=range]::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:var(--paper);border:2px solid var(--c,var(--sun))}
.val{font-weight:600;color:var(--c,var(--sun))}
.sw{position:relative;width:42px;height:24px;border-radius:99px;background:var(--line);cursor:pointer;transition:background .3s;flex:none;border:0}
.sw::after{content:"";position:absolute;left:3px;top:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .3s cubic-bezier(.3,1.4,.5,1);box-shadow:0 2px 6px #0005}
.sw.on{background:var(--c,var(--bat))}.sw.on::after{transform:translateX(18px)}
.bar{position:sticky;bottom:0;display:flex;gap:10px;align-items:center;justify-content:space-between;padding:14px 20px;z-index:3;
  background:color-mix(in srgb,var(--paper) 92%,transparent);backdrop-filter:blur(12px);border-top:1px solid var(--line);transform:translateY(110%);transition:transform .45s cubic-bezier(.16,1,.3,1)}
.bar.show{transform:none}
.btn{appearance:none;border:1px solid var(--line);background:transparent;color:var(--ink);border-radius:99px;padding:9px 16px;font:inherit;font-size:12px;font-weight:600;cursor:pointer;transition:all .2s}
.btn.pri{background:var(--sun);color:#17130a;border-color:transparent}
.btn.pri:hover{filter:brightness(1.08)}
.btn.warn{background:var(--bad);color:#fff;border-color:transparent}
.toast{position:fixed;left:50%;bottom:28px;transform:translate(-50%,40px);opacity:0;background:var(--paper);border:1px solid var(--line);color:var(--ink);padding:10px 16px;border-radius:99px;
  font-size:12px;font-weight:600;transition:all .4s cubic-bezier(.16,1,.3,1);box-shadow:0 10px 30px #0008;z-index:5}
.toast.show{transform:translate(-50%,0);opacity:1}
.note{font-size:11.5px;color:var(--mut);line-height:1.6;padding:12px 14px;border-radius:14px;border:1px dashed var(--line)}
a.mi{color:var(--mut);font-size:11px;cursor:pointer;text-decoration:underline}
`;

export const STYLE3D = `
.scene{padding:0}
:host{padding-top:12px}
@media(max-width:1100px){:host{padding-top:max(10px,env(safe-area-inset-top))}}
.stage{position:relative;width:100%;aspect-ratio:16/10;border-radius:var(--r);overflow:hidden;background:linear-gradient(#1b2433,#0f1520)}
:host(.narrow) .stage{aspect-ratio:4/4.2}
.stage canvas{display:block;width:100%!important;height:100%!important;touch-action:none;cursor:grab}
.stage canvas:active{cursor:grabbing}
.hud{position:absolute;left:0;right:0;top:0;padding:16px 18px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;pointer-events:none;
  background:linear-gradient(rgba(8,10,16,.55),transparent);z-index:2}
.hud .ttl{color:#f3f5f9;text-shadow:0 1px 8px #0008}
.hud .eb{color:rgba(243,245,249,.7)}
.hud .pill{pointer-events:auto;backdrop-filter:blur(8px)}
.labs{position:absolute;inset:0;pointer-events:none;z-index:1}
.lab{position:absolute;left:0;top:0;pointer-events:auto;cursor:pointer;display:flex;align-items:center;gap:7px;padding:5px 10px 5px 6px;border-radius:99px;
  background:rgba(14,17,24,.62);backdrop-filter:blur(10px) saturate(1.3);border:1px solid color-mix(in srgb,var(--c) 45%,transparent);color:#f3f5f9;
  box-shadow:0 6px 18px -6px #000a;white-space:nowrap;transition:opacity .4s,border-color .4s;will-change:transform;font:inherit}
.lab .ic2{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:color-mix(in srgb,var(--c) 22%,transparent);color:var(--c)}
.lab b{font-size:12.5px;font-weight:600;letter-spacing:-.01em}
.lab small{display:block;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:rgba(243,245,249,.62);font-weight:600;line-height:1}
.lab::after{content:"";position:absolute;left:50%;top:100%;width:1px;height:14px;background:linear-gradient(color-mix(in srgb,var(--c) 70%,transparent),transparent)}
.lab.dim{opacity:.55}
.sign{position:absolute;left:0;top:0;pointer-events:auto;cursor:pointer;min-width:122px;padding:10px 12px 10px;border-radius:14px;text-align:left;font:inherit;color:#f3f5f9;
  background:linear-gradient(160deg,rgba(28,32,44,.88),rgba(12,14,20,.84));backdrop-filter:blur(12px) saturate(1.3);border:1px solid rgba(255,255,255,.12);
  box-shadow:0 14px 34px -12px #000d,inset 0 1px 0 rgba(255,255,255,.08);transform-origin:50% 100%;will-change:transform,opacity;transition:filter .5s}
.sign::before{content:"";position:absolute;left:12px;right:12px;top:-1px;height:2px;border-radius:2px;background:var(--c);box-shadow:0 0 14px var(--c)}
.sign::after{content:"";position:absolute;left:50%;bottom:-6px;width:10px;height:10px;transform:translateX(-50%) rotate(45deg);background:rgba(13,15,21,.86);border-right:1px solid rgba(255,255,255,.12);border-bottom:1px solid rgba(255,255,255,.12)}
.sign .sh{display:flex;gap:7px;align-items:center;font-size:9px;letter-spacing:.17em;text-transform:uppercase;color:rgba(243,245,249,.66);font-weight:700}
.sign .ic2{width:20px;height:20px;border-radius:7px;display:grid;place-items:center;background:color-mix(in srgb,var(--c) 22%,transparent);color:var(--c)}
.sign .sv{font-size:19px;font-weight:700;letter-spacing:-.02em;margin-top:6px;white-space:nowrap}
.sign .ss{font-size:10.5px;color:rgba(243,245,249,.62);margin-top:2px;white-space:nowrap}
.sign .sb{height:3px;border-radius:3px;background:rgba(255,255,255,.1);margin-top:8px;overflow:hidden}
.sign .sb i{display:block;height:100%;width:0;border-radius:3px;background:linear-gradient(90deg,color-mix(in srgb,var(--c) 50%,transparent),var(--c));transition:width 1.4s cubic-bezier(.2,.8,.2,1)}
.sign.dim{filter:saturate(.4) brightness(.8)}
.sign .stem{position:absolute;left:50%;top:calc(100% + 4px);width:1.5px;height:var(--stem,0px);transform:translateX(-50%);background:linear-gradient(var(--c),color-mix(in srgb,var(--c) 10%,transparent));pointer-events:none}
.sign.far .ss,.sign.far .sb{display:none}.sign.far{min-width:0;padding:7px 10px}.sign.far .sv{font-size:15px;margin-top:4px}
.sign.pulse{animation:spulse .7s ease-out}
@keyframes spulse{30%{box-shadow:0 0 0 4px color-mix(in srgb,var(--c) 40%,transparent),0 14px 34px -12px #000d}}
.sign:hover{border-color:color-mix(in srgb,var(--c) 55%,transparent)}
:host(.narrow) .sign{min-width:0;padding:7px 9px}:host(.narrow) .sign .ss,:host(.narrow) .sign .sb{display:none}:host(.narrow) .sign .sv{font-size:14px;margin-top:3px}
.info{position:absolute;left:50%;bottom:44px;transform:translateX(-50%);display:flex;padding:9px 4px;border-radius:16px;z-index:2;pointer-events:none;color:#f3f5f9;
  background:rgba(12,14,20,.6);backdrop-filter:blur(12px) saturate(1.3);border:1px solid rgba(255,255,255,.1);box-shadow:0 12px 30px -14px #000c;white-space:nowrap}
.info>div{padding:0 14px;border-left:1px solid rgba(255,255,255,.1);text-align:center}
.info>div:first-child{border-left:0}
.info small{display:block;font-size:8.5px;letter-spacing:.16em;text-transform:uppercase;color:rgba(243,245,249,.55);font-weight:700}
.info b{display:block;font-size:14px;font-weight:700;margin-top:3px;letter-spacing:-.01em}
.info b em{font-style:normal;font-size:10px;color:rgba(243,245,249,.55);font-weight:600;margin-left:2px}
:host(.narrow) .info{bottom:42px;padding:7px 2px}:host(.narrow) .info>div{padding:0 9px}:host(.narrow) .info .x4,:host(.narrow) .info .x5{display:none}:host(.narrow) .info b{font-size:12.5px}
.hud .wx{pointer-events:none;display:inline-flex;gap:6px;align-items:center;color:#f3f5f9;font-size:11px;font-weight:600;padding:5px 10px;border-radius:99px;background:rgba(12,14,20,.45);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.12)}
.hud .rt{display:flex;gap:6px;align-items:center}
.foot{position:absolute;left:14px;right:14px;bottom:10px;display:flex;justify-content:space-between;align-items:flex-end;gap:10px;pointer-events:none;z-index:2;
  font-size:9px;color:rgba(243,245,249,.5)}
.foot .btns3{display:flex;gap:6px;pointer-events:auto}
.foot button{appearance:none;border:1px solid rgba(255,255,255,.14);background:rgba(14,17,24,.55);backdrop-filter:blur(8px);color:#f3f5f9;border-radius:99px;
  padding:6px 10px;font:inherit;font-size:11px;font-weight:600;cursor:pointer}
.foot button:hover{border-color:rgba(255,255,255,.35)}
.loading{position:absolute;inset:0;display:grid;place-items:center;color:rgba(243,245,249,.7);font-size:12px;letter-spacing:.12em;text-transform:uppercase;z-index:3;transition:opacity .8s}
.loading i{display:block;width:120px;height:2px;margin:10px auto 0;border-radius:2px;background:linear-gradient(90deg,transparent,var(--sun),transparent);background-size:200% 100%;animation:ld 1.2s linear infinite}
@keyframes ld{from{background-position:200% 0}to{background-position:-200% 0}}
`;
