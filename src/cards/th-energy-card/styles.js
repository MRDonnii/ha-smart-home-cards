// Styles of th-energy-card (the page) and th-energy-sheet (the detail and control sheet).
export const CSS = `
:host{display:block;--ink:#f4f1ea;--mut:rgba(244,241,234,.58);--faint:rgba(244,241,234,.32);--hair:rgba(244,241,234,.09);
  --gold:#e8c37e;--ice:#8ed1ff;--emer:#6be3a8;--vio:#b7a4ff;--coral:#ff9e7a;--rose:#ff94c9;--red:#ff6b7d;
  --surf:linear-gradient(180deg,rgba(255,255,255,.058),rgba(255,255,255,.018));--r:28px;
  color:var(--ink);font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased;padding-bottom:104px;padding-top:12px}
*{box-sizing:border-box}
button{font:inherit;color:inherit}
.page{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:8px;margin:0}
.s{grid-column:span 12;position:relative;border-radius:var(--r);background:var(--surf),rgba(12,14,20,.72);backdrop-filter:blur(18px) saturate(1.2);
  box-shadow:0 30px 60px -40px rgba(0,0,0,.9),inset 0 1px 0 rgba(255,255,255,.06);padding:clamp(18px,1.6vw,26px);overflow:hidden;isolation:isolate;
  opacity:0;transform:translateY(16px) scale(.985);filter:blur(6px);transition:opacity .9s cubic-bezier(.16,1,.3,1),transform .9s cubic-bezier(.16,1,.3,1),filter .9s}
.s.in{opacity:1;transform:none;filter:none}
.s::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;z-index:3;
  background:linear-gradient(150deg,rgba(255,255,255,.2),rgba(255,255,255,.03) 32%,rgba(255,255,255,.02) 70%,rgba(232,195,126,.22));
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
.c8{grid-column:span 8}.c7{grid-column:span 7}.c5{grid-column:span 5}.c4{grid-column:span 4}
@media(max-width:1280px){.c8,.c7{grid-column:span 7}.c5,.c4{grid-column:span 5}}
@media(max-width:1100px){:host{padding-top:max(10px,env(safe-area-inset-top))}.page{padding:0 10px;gap:8px}.c8,.c7,.c5,.c4{grid-column:span 12}:host{padding-bottom:112px}}
.k{font-size:10.5px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--mut)}
.hd{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}
.hd h3{margin:4px 0 0;font-size:19px;font-weight:500;letter-spacing:-.01em}
.chip{display:inline-flex;align-items:center;gap:7px;padding:6px 11px;border-radius:99px;font-size:11.5px;font-weight:600;white-space:nowrap;
  color:var(--c,var(--emer));background:color-mix(in srgb,var(--c,var(--emer)) 12%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c,var(--emer)) 26%,transparent)}
.chip .dot{width:6px;height:6px;border-radius:50%;background:currentColor;animation:breath 2.2s ease-in-out infinite}
@keyframes breath{50%{opacity:.25;transform:scale(.7)}}
.btn{appearance:none;border:0;cursor:pointer;display:inline-flex;align-items:center;gap:8px;padding:11px 16px;border-radius:14px;font-size:13px;font-weight:600;
  background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px var(--hair);transition:transform .2s,background .25s,box-shadow .25s}
.btn:hover{background:rgba(255,255,255,.1)}.btn:active{transform:scale(.97)}
.btn.gold{background:linear-gradient(135deg,#f3d79e,#d7a95a);color:#1b1408;box-shadow:0 10px 24px -12px rgba(232,195,126,.8)}
.big{font-weight:300;letter-spacing:-.045em;line-height:.95}
.u{font-size:.42em;font-weight:500;letter-spacing:0;color:var(--mut);margin-left:.18em}
.mut{color:var(--mut)}.ico{display:block;flex:none}

/* HERO */
.hero{padding:0;min-height:520px}
.aur{position:absolute;inset:-20%;z-index:-1;filter:blur(60px);opacity:.75;pointer-events:none}
.aur i{position:absolute;width:46%;height:46%;border-radius:50%;mix-blend-mode:screen;animation:float 22s ease-in-out infinite;transition:background 3s}
.aur i:nth-child(1){left:8%;top:10%;background:radial-gradient(circle,var(--a1,rgba(232,195,126,.55)),transparent 65%)}
.aur i:nth-child(2){right:6%;top:22%;background:radial-gradient(circle,var(--a2,rgba(142,209,255,.42)),transparent 65%);animation-delay:-7s;animation-duration:26s}
.aur i:nth-child(3){left:30%;bottom:4%;background:radial-gradient(circle,var(--a3,rgba(107,227,168,.32)),transparent 65%);animation-delay:-13s;animation-duration:30s}
@keyframes float{33%{transform:translate(8%,6%) scale(1.1)}66%{transform:translate(-6%,-4%) scale(.92)}}
.hero-top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:26px 28px 0}
.hero-top .say{font-size:clamp(20px,1.9vw,28px);font-weight:400;letter-spacing:-.02em;line-height:1.2;max-width:620px;margin-top:8px}
.hero-top .say b{font-weight:600;color:var(--gold)}
.hero-grid{display:grid;grid-template-columns:1fr minmax(300px,440px) 1fr;align-items:center;gap:18px;padding:10px 28px 28px}
.col{display:grid;gap:14px}
.ring{position:relative;aspect-ratio:1;width:100%;max-width:440px;justify-self:center}
.ring svg{width:100%;height:100%;overflow:visible}
.ring .ctr{position:absolute;inset:0;display:grid;place-items:center;text-align:center;pointer-events:none}
.ring .ctr .big{font-size:clamp(46px,4.6vw,68px)}
.ring .ctr .lbl{font-size:10.5px;letter-spacing:.24em;text-transform:uppercase;color:var(--mut);margin-bottom:10px}
.ring .ctr .mix{display:flex;gap:12px;justify-content:center;margin-top:14px;font-size:12px;color:var(--mut)}
.ring .ctr .mix span{display:inline-flex;align-items:center;gap:5px}.ring .ctr .mix i{width:7px;height:7px;border-radius:2px;display:inline-block}
.sweep{transform-origin:200px 200px;animation:spin 9s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.seg{transition:stroke-dasharray 1.6s cubic-bezier(.16,1,.3,1),stroke-dashoffset 1.6s cubic-bezier(.16,1,.3,1)}
.ins{appearance:none;border:0;text-align:left;cursor:pointer;position:relative;padding:16px 18px;border-radius:22px;background:rgba(10,12,18,.42);
  box-shadow:inset 0 0 0 1px var(--hair);backdrop-filter:blur(10px);transition:transform .35s cubic-bezier(.16,1,.3,1),box-shadow .35s,background .35s;min-width:0}
.ins:hover{transform:translateY(-3px);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 45%,transparent),0 18px 40px -20px color-mix(in srgb,var(--c) 60%,transparent)}
.ins .t{display:flex;align-items:center;gap:9px;color:var(--c)}
.ins .t .k{color:var(--mut)}
.ins .v{font-size:clamp(28px,2.3vw,36px);margin-top:12px}
.ins .sub{font-size:12px;color:var(--mut);margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ins .viz{margin-top:12px;height:6px;border-radius:6px;background:rgba(255,255,255,.07);overflow:hidden;position:relative}
.ins .viz b{position:absolute;inset:0 auto 0 0;width:0;border-radius:6px;background:linear-gradient(90deg,color-mix(in srgb,var(--c) 40%,transparent),var(--c));transition:width 1.6s cubic-bezier(.16,1,.3,1)}
.ins .viz b::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);transform:translateX(-100%);animation:shine 2.8s ease-in-out infinite}
@keyframes shine{to{transform:translateX(100%)}}
.ins .dir{position:absolute;right:16px;top:16px;color:var(--c);opacity:.9}
.ins .dir .ico{animation:nudge 1.6s ease-in-out infinite}
@keyframes nudge{50%{transform:translateY(var(--ny,3px))}}
.strs{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:12px}
.strs div{height:5px;border-radius:5px;background:rgba(255,255,255,.07);overflow:hidden}.strs div b{display:block;height:100%;width:0;background:var(--gold);transition:width 1.6s cubic-bezier(.16,1,.3,1)}
@media(max-width:1100px){.hero{min-height:0}.hero-grid{grid-template-columns:1fr 1fr;padding:6px 16px 18px;gap:12px}.ring{grid-column:span 2;order:-1;max-width:360px}
  .col{display:contents}.hero-top{padding:20px 18px 0}}
@media(max-width:420px){.ins{padding:13px 14px}.ins .v{font-size:25px}}

/* ØKONOMI I DAG */
.eco{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));margin:0 28px 26px;border-radius:20px;background:rgba(0,0,0,.24);box-shadow:inset 0 0 0 1px var(--hair);overflow:hidden;position:relative;z-index:1}
.eco.ready>div{animation:none}
.eco>div{padding:15px 18px 14px;border-left:1px solid var(--hair);min-width:0;animation:ecoIn .8s cubic-bezier(.16,1,.3,1) both}.eco>div:first-child{border-left:0}
@keyframes ecoIn{from{opacity:0;transform:translateY(8px)}}
.eco small{display:flex;align-items:center;gap:7px;font-size:9.5px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.eco small i{width:5px;height:5px;border-radius:50%;background:var(--c);box-shadow:0 0 8px var(--c);flex:none}
.eco b{display:block;font-size:clamp(20px,1.7vw,26px);font-weight:200;letter-spacing:-.02em;margin-top:7px;white-space:nowrap;color:var(--ink)}.eco b u{text-decoration:none;font-size:11px;font-weight:500;color:var(--mut);margin-left:4px;letter-spacing:.04em}
.eco em{display:block;font-style:normal;font-size:10.5px;color:var(--faint);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.eco .pos{color:var(--emer)}
@media(max-width:1100px){.eco{grid-template-columns:repeat(2,minmax(0,1fr));margin:0 16px 18px}.eco>div:nth-child(odd){border-left:0}.eco>div{border-top:1px solid var(--hair)}.eco>div:nth-child(-n+2){border-top:0}.eco>div:last-child{grid-column:span 2}}
/* SUN */
.sunsvg{width:100%;height:auto;display:block;overflow:visible}
.wx{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px}
.wx div{padding:12px;border-radius:16px;background:rgba(255,255,255,.035);box-shadow:inset 0 0 0 1px var(--hair)}
.wx div .ico{color:var(--mut)}.wx b{display:block;font-size:17px;font-weight:500;margin-top:8px;letter-spacing:-.01em}.wx small{font-size:10.5px;color:var(--mut)}
@media(max-width:420px){.wx{grid-template-columns:repeat(2,1fr)}}

/* SANKEY */
.sk svg{width:100%;height:auto;display:block;overflow:visible}
.rib{mix-blend-mode:screen;transition:opacity .4s}
.rib:hover{opacity:1!important}
.flowline{stroke-dasharray:2 14;animation:flow 1.4s linear infinite}
@keyframes flow{to{stroke-dashoffset:-16}}
.skl{font-size:12px;fill:var(--mut)}.skv{font-size:15px;fill:var(--ink);font-weight:600}

/* BATTERY */
.batwrap{display:grid;grid-template-columns:150px 1fr;gap:22px;align-items:center}
.cap{position:relative}
.cap svg{width:100%;height:auto;display:block}
.wave1{animation:wv 6s linear infinite}.wave2{animation:wv 9s linear infinite reverse}
@keyframes wv{to{transform:translateX(-120px)}}
.bub{animation:rise var(--d,3s) ease-in infinite;animation-delay:var(--dl,0s);opacity:0}
@keyframes rise{0%{transform:translateY(0);opacity:0}15%{opacity:.8}100%{transform:translateY(-190px);opacity:0}}
.charging .bub{display:block}.bub{display:none}
.drain{display:none}.discharging .drain{display:block;animation:dr 1.4s ease-in infinite}
@keyframes dr{0%{transform:translateY(0);opacity:0}30%{opacity:1}100%{transform:translateY(16px);opacity:0}}
.bstats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}
.bstats div{padding:12px 14px;border-radius:16px;background:rgba(255,255,255,.035);box-shadow:inset 0 0 0 1px var(--hair)}
.bstats small{font-size:10.5px;color:var(--mut);letter-spacing:.06em}.bstats b{display:block;font-size:16px;font-weight:500;margin-top:5px}
@media(max-width:520px){.batwrap{grid-template-columns:110px 1fr;gap:16px}}

/* PRICE + HIST */
.chart{position:relative}.chart svg{width:100%;height:auto;display:block;overflow:visible;touch-action:pan-y}
.tip{position:absolute;top:0;left:0;pointer-events:none;padding:9px 12px;border-radius:12px;font-size:12px;line-height:1.5;white-space:nowrap;
  background:rgba(14,16,24,.92);box-shadow:inset 0 0 0 1px var(--hair),0 14px 30px -10px #000;opacity:0;transition:opacity .2s;transform:translate(-50%,-115%)}
.tip b{font-size:14px}
.pills{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.pill2{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:16px;background:rgba(255,255,255,.035);box-shadow:inset 0 0 0 1px var(--hair);font-size:12.5px;color:var(--mut)}
.pill2 b{color:var(--ink);font-weight:600}
.leg{display:flex;gap:14px;font-size:11.5px;color:var(--mut)}.leg i{display:inline-block;width:14px;height:2px;border-radius:2px;margin-right:6px;vertical-align:3px}
.draw{stroke-dasharray:4000;stroke-dashoffset:4000;animation:drw 2.4s cubic-bezier(.65,0,.35,1) forwards}
@keyframes drw{to{stroke-dashoffset:0}}
.fadein{opacity:0;animation:fi 1.4s .6s forwards}@keyframes fi{to{opacity:1}}

/* CONTROL + TOTALS */
.rows{display:grid;gap:2px}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 2px;border-bottom:1px solid var(--hair);font-size:13px;color:var(--mut)}
.row:last-child{border-bottom:0}.row b{color:var(--ink);font-weight:500;text-align:right}
.tot{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.tot div{padding:14px;border-radius:18px;background:rgba(255,255,255,.035);box-shadow:inset 0 0 0 1px var(--hair)}
.tot small{font-size:10.5px;color:var(--mut);letter-spacing:.06em}.tot b{display:block;font-size:22px;font-weight:300;letter-spacing:-.03em;margin-top:6px}
.tot b em{font-style:normal;font-size:11px;color:var(--mut);margin-left:3px;letter-spacing:0;font-weight:500}
.go3d{display:flex;align-items:center;gap:16px;margin-top:14px;padding:16px;border-radius:20px;cursor:pointer;border:0;width:100%;text-align:left;
  background:linear-gradient(135deg,rgba(232,195,126,.16),rgba(142,209,255,.08));box-shadow:inset 0 0 0 1px rgba(232,195,126,.28);transition:transform .35s cubic-bezier(.16,1,.3,1)}
.go3d:hover{transform:translateY(-2px)}
.go3d .cube{width:54px;height:54px;border-radius:16px;display:grid;place-items:center;background:rgba(232,195,126,.15);color:var(--gold)}
.go3d .cube .ico{animation:spinY 6s ease-in-out infinite}
@keyframes spinY{50%{transform:rotate(180deg) scale(.9)}}
.off .live{--c:var(--red)!important}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

export const SHEET_CSS = `
:host{position:fixed;inset:0;z-index:1000;display:flex;align-items:flex-end;justify-content:center;font-family:inherit;--ink:#f4f1ea;--mut:rgba(244,241,234,.58);--hair:rgba(244,241,234,.1);
  --gold:#e8c37e;--ice:#8ed1ff;--emer:#6be3a8;--vio:#b7a4ff;--coral:#ff9e7a;--rose:#ff94c9;--red:#ff6b7d;color:var(--ink)}
*{box-sizing:border-box}button{font:inherit;color:inherit}
.bg{position:absolute;inset:0;background:rgba(3,4,8,.62);backdrop-filter:blur(8px);animation:fd .35s both}
@keyframes fd{from{opacity:0}}
.sh{position:relative;width:min(760px,100%);max-height:88vh;overflow:auto;border-radius:30px 30px 0 0;padding:10px 22px 28px;
  background:linear-gradient(180deg,#171a23,#0e1016);box-shadow:0 -30px 80px -20px #000,inset 0 1px 0 rgba(255,255,255,.08);animation:up .55s cubic-bezier(.16,1,.3,1) both;overscroll-behavior:contain}
@media(min-width:900px){:host{align-items:center}.sh{border-radius:30px;animation:pop .5s cubic-bezier(.16,1,.3,1) both}}
@keyframes up{from{transform:translateY(100%)}}@keyframes pop{from{opacity:0;transform:translateY(26px) scale(.97)}}
.grab{width:42px;height:4px;border-radius:4px;background:rgba(255,255,255,.18);margin:4px auto 14px}
.top{display:flex;align-items:center;gap:14px;margin-bottom:18px}
.top .ic{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;color:var(--c);background:color-mix(in srgb,var(--c) 14%,transparent)}
.top h2{margin:0;font-size:20px;font-weight:500;flex:1;letter-spacing:-.01em}.top small{display:block;font-size:12px;color:var(--mut);margin-top:3px;font-weight:400}
.x{appearance:none;border:0;width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.07);cursor:pointer;display:grid;place-items:center;transition:transform .3s}
.x:hover{transform:rotate(90deg)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:16px}
.cell{padding:14px;border-radius:18px;background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px var(--hair)}
.cell small{font-size:10.5px;color:var(--mut);letter-spacing:.05em}.cell b{display:block;font-size:18px;font-weight:500;margin-top:5px;letter-spacing:-.01em}
.grp{font-size:10.5px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--mut);margin:22px 2px 10px}
.ctl{padding:16px;border-radius:20px;background:rgba(255,255,255,.035);box-shadow:inset 0 0 0 1px var(--hair);margin-bottom:10px;transition:box-shadow .3s,background .3s}
.ctl.dirty{box-shadow:inset 0 0 0 1px rgba(232,195,126,.6);background:rgba(232,195,126,.05)}
.ctl .h{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:14px;font-weight:500}
.ctl .h small{font-size:12px;color:var(--mut);font-weight:400}
.ctl p{margin:8px 0 0;font-size:12px;color:var(--mut);line-height:1.5}
.seg{display:flex;flex-wrap:wrap;gap:4px;margin-top:12px;padding:4px;border-radius:14px;background:rgba(0,0,0,.25)}
.seg button{appearance:none;border:0;flex:1 1 auto;padding:9px 12px;border-radius:10px;background:transparent;color:var(--mut);font-size:12.5px;font-weight:600;cursor:pointer;transition:all .3s}
.seg button.on{background:color-mix(in srgb,var(--c) 20%,transparent);color:var(--c);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 40%,transparent)}
.rng{display:flex;align-items:center;gap:14px;margin-top:14px}
.rng output{min-width:70px;text-align:right;font-weight:600;color:var(--c)}
input[type=range]{-webkit-appearance:none;appearance:none;flex:1;height:6px;border-radius:6px;outline:none;
  background:linear-gradient(90deg,var(--c) var(--p,0%),rgba(255,255,255,.1) var(--p,0%))}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 0 0 5px color-mix(in srgb,var(--c) 30%,transparent),0 4px 10px #0008;cursor:pointer}
input[type=range]::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:#fff;border:0}
.sw{appearance:none;border:0;width:50px;height:30px;border-radius:99px;background:rgba(255,255,255,.12);position:relative;cursor:pointer;transition:background .3s;flex:none}
.sw::after{content:"";position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:#fff;transition:transform .35s cubic-bezier(.3,1.5,.5,1);box-shadow:0 2px 6px #0006}
.sw.on{background:var(--c)}.sw.on::after{transform:translateX(20px)}
.bar{position:sticky;bottom:-28px;margin:18px -22px -28px;padding:16px 22px 22px;display:flex;align-items:center;justify-content:space-between;gap:12px;
  background:linear-gradient(180deg,rgba(14,16,22,.6),#0e1016 40%);backdrop-filter:blur(10px);transform:translateY(120%);transition:transform .5s cubic-bezier(.16,1,.3,1)}
.bar.show{transform:none}
.btn{appearance:none;border:0;cursor:pointer;padding:12px 18px;border-radius:14px;font-size:13px;font-weight:600;background:rgba(255,255,255,.07)}
.btn.gold{background:linear-gradient(135deg,#f3d79e,#d7a95a);color:#1b1408}
.btn.red{background:var(--red);color:#fff}
.note{font-size:12px;color:var(--mut);line-height:1.6;padding:14px 16px;border-radius:16px;box-shadow:inset 0 0 0 1px var(--hair);margin-top:12px}
.toast{position:fixed;left:50%;bottom:30px;transform:translate(-50%,30px);opacity:0;padding:12px 18px;border-radius:99px;background:#1c1f28;font-size:13px;font-weight:600;
  box-shadow:0 14px 40px #000a,inset 0 0 0 1px var(--hair);transition:all .45s cubic-bezier(.16,1,.3,1);z-index:5}
.toast.show{opacity:1;transform:translate(-50%,0)}
`;
