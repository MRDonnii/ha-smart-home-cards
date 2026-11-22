// Styles for th-home-card (the card) and th-home-sheet (its pop-up sheet). Kept verbatim from the original card.
export const HCSS = `
:host{display:block;--ink:#f4f1ea;--mut:rgba(244,241,234,.56);--faint:rgba(244,241,234,.3);--hair:rgba(244,241,234,.09);
  --gold:#e8c37e;--ice:#8ed1ff;--emer:#6be3a8;--vio:#b7a4ff;--coral:#ff9e7a;--red:#ff6b7d;--amber:#ffd27a;
  color:var(--ink);font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased;padding-bottom:100px}
*{box-sizing:border-box}button{font:inherit;color:inherit}
.bento{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:0}
.t{position:relative;overflow:hidden;isolation:isolate;border-radius:24px;padding:16px 18px;border:0;text-align:left;color:var(--ink);min-width:0;cursor:pointer;
  background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.015)),rgba(12,14,20,.74);backdrop-filter:blur(18px) saturate(1.2);
  box-shadow:0 26px 50px -36px #000,inset 0 1px 0 rgba(255,255,255,.06);transition:transform .45s cubic-bezier(.16,1,.3,1),box-shadow .45s;animation:tin .9s cubic-bezier(.16,1,.3,1) both}
.t::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;z-index:2;
  background:linear-gradient(150deg,rgba(255,255,255,.2),rgba(255,255,255,.03) 32%,rgba(255,255,255,.02) 70%,color-mix(in srgb,var(--acc,var(--gold)) 30%,transparent));
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
.t::after{content:"";position:absolute;width:220px;height:220px;right:-80px;top:-90px;border-radius:50%;z-index:-1;pointer-events:none;
  background:radial-gradient(circle,color-mix(in srgb,var(--acc,var(--gold)) 22%,transparent),transparent 70%);animation:drift 16s ease-in-out infinite}
@keyframes drift{50%{transform:translate(-30px,24px) scale(1.15)}}
.t:hover{transform:translateY(-3px);box-shadow:0 30px 60px -34px #000,0 0 0 1px color-mix(in srgb,var(--acc) 30%,transparent)}
@keyframes tin{from{opacity:0;transform:translateY(14px);filter:blur(6px)}}
.hd{display:flex;align-items:center;gap:9px;font-size:10px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--mut)}
.hd .ic{width:26px;height:26px;border-radius:9px;display:grid;place-items:center;color:var(--acc);background:color-mix(in srgb,var(--acc) 13%,transparent)}
.hd .more{margin-left:auto;display:flex;align-items:center;gap:3px;font-size:11px;letter-spacing:.02em;text-transform:none;color:var(--faint);transition:color .3s}
.t:hover .hd .more{color:var(--acc)}
.big{font-weight:300;letter-spacing:-.045em;line-height:1}
.big small{font-size:.4em;font-weight:500;letter-spacing:0;color:var(--mut);margin-left:4px}
.sub{font-size:12px;color:var(--mut);margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/* ---------- SOL (hero) ---------- */
.sol{grid-column:span 4;--acc:var(--gold);display:grid;grid-template-columns:150px minmax(0,1fr) minmax(0,1.15fr);gap:22px;align-items:center;padding:16px 20px}
.ring{position:relative;width:150px;height:150px}
.ring svg{width:100%;height:100%;overflow:visible}
.ring .c{position:absolute;inset:0;display:grid;place-items:center;text-align:center;pointer-events:none}
.ring .c .big{font-size:30px}.ring .c small{display:block;font-size:9px;letter-spacing:.2em;color:var(--mut);margin-top:6px}
.seg{transition:stroke-dasharray 1.6s cubic-bezier(.16,1,.3,1),stroke-dashoffset 1.6s cubic-bezier(.16,1,.3,1)}
.sw8{transform-origin:75px 75px;animation:spin 8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 18px}
.stat .k{font-size:9.5px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--mut);display:flex;align-items:center;gap:6px}
.stat .k i{width:6px;height:6px;border-radius:2px;display:inline-block}
.stat .big{font-size:clamp(24px,2vw,30px);margin-top:6px}
.stat .mbar{height:3px;border-radius:3px;background:rgba(255,255,255,.07);margin-top:8px;overflow:hidden}
.stat .mbar b{display:block;height:100%;width:0;border-radius:3px;transition:width 1.6s cubic-bezier(.16,1,.3,1)}
.curve{position:relative;height:150px;display:flex;flex-direction:column;cursor:crosshair}
.plot{position:relative;flex:1;margin-top:20px;min-height:60px}
.plot svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.sunm{position:absolute;width:34px;height:34px;transform:translate(-50%,-50%);border-radius:50%;pointer-events:none;
  background:radial-gradient(circle,#fff8e6 0 18%,#f3cf86 30%,rgba(232,195,126,.35) 52%,transparent 72%);animation:sunp 4s ease-in-out infinite;transition:left 2s,top 2s}
@keyframes sunp{50%{transform:translate(-50%,-50%) scale(1.18)}}
.sunm.moon{width:16px;height:16px;background:radial-gradient(circle at 60% 40%,#eef1ff 0 45%,rgba(200,210,255,.25) 60%,transparent 75%);animation:none}
.peak{position:absolute;transform:translate(-50%,-100%);font-size:9.5px;font-weight:600;color:var(--gold);white-space:nowrap;pointer-events:none;padding-bottom:6px}
.peak::after{content:"";position:absolute;left:50%;bottom:0;width:5px;height:5px;border-radius:50%;background:var(--gold);transform:translate(-50%,50%);box-shadow:0 0 8px var(--gold)}
.tl{position:absolute;bottom:-14px;font-size:9.5px;color:var(--faint);transform:translateX(-50%);white-space:nowrap}
.ctip{position:absolute;top:0;padding:6px 9px;border-radius:10px;background:rgba(14,16,24,.94);box-shadow:inset 0 0 0 1px var(--hair);font-size:11px;line-height:1.45;white-space:nowrap;pointer-events:none;opacity:0;transform:translate(-50%,-105%);transition:opacity .15s;z-index:4}
.cx{position:absolute;top:0;bottom:0;width:1px;background:rgba(244,241,234,.3);pointer-events:none;opacity:0}
.cstats{display:flex;gap:14px;margin-top:18px;font-size:11px;color:var(--mut);white-space:nowrap;overflow:hidden}
.cstats b{color:var(--ink);font-weight:600}.cstats span{display:inline-flex;align-items:center;gap:5px}.cstats i{width:8px;height:3px;border-radius:2px;display:inline-block}
.curve .lbl{position:absolute;left:0;top:0;font-size:9.5px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--mut)}
.curve .say{position:absolute;right:0;top:-2px;font-size:12px;color:var(--mut);text-align:right}
.curve .say b{color:var(--gold);font-weight:600}
.draw{stroke-dasharray:3000;stroke-dashoffset:3000;animation:drw 2.4s cubic-bezier(.65,0,.35,1) forwards}@keyframes drw{to{stroke-dashoffset:0}}
.fadein{opacity:0;animation:fi 1.4s .5s forwards}@keyframes fi{to{opacity:1}}

/* ---------- LYS ---------- */
.lys{grid-column:span 2;--acc:var(--amber)}
.lys .top{display:flex;align-items:baseline;gap:10px;margin-top:12px}
.lys .big{font-size:32px}
.lgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(66px,1fr));gap:8px 4px;margin-top:12px}
.lb{appearance:none;border:0;background:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;padding:0;min-width:0}
.lb i{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;font-style:normal;color:var(--mut);background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px var(--hair);
  transition:all .5s cubic-bezier(.16,1,.3,1);position:relative}
.lb.on i{color:#3a2706;background:radial-gradient(circle at 35% 30%,#fff1c9,#f5cf7a 55%,#d9a54e);box-shadow:0 0 0 3px rgba(232,195,126,.14),0 0 22px -2px rgba(232,195,126,.7)}
.lb.on i::after{content:"";position:absolute;inset:-5px;border-radius:50%;border:1px solid rgba(232,195,126,.45);animation:halo 2.8s ease-out infinite}
@keyframes halo{from{opacity:.9;transform:scale(.92)}to{opacity:0;transform:scale(1.3)}}
.lb:active i{transform:scale(.88)}
.lb span{font-size:10.5px;color:var(--mut);max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lb.on span{color:var(--ink)}

/* ---------- PRIS ---------- */
.pris{grid-column:span 2;--acc:var(--gold);display:flex;flex-direction:column}
.pt{display:flex;align-items:flex-end;gap:14px;margin-top:10px;flex-wrap:wrap}
.pt .big{font-size:34px}
.pchip{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:99px;font-size:11px;font-weight:600;color:var(--c);background:color-mix(in srgb,var(--c) 13%,transparent);margin-bottom:5px}
.pchip i{width:5px;height:5px;border-radius:50%;background:currentColor;animation:bl 1.6s infinite}
.comp{flex:1;min-width:180px;margin-bottom:4px}
.comp .bar{display:flex;height:6px;border-radius:6px;overflow:hidden;gap:2px}
.comp .bar b{display:block;height:100%;border-radius:2px;transform-origin:left;animation:grow 1.2s cubic-bezier(.16,1,.3,1) both}
@keyframes grow{from{transform:scaleX(0)}}
.comp .lg{display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:6px;font-size:10px;color:var(--mut)}
.comp .lg span{display:inline-flex;align-items:center;gap:4px}.comp .lg i{width:6px;height:6px;border-radius:2px}
.pchart{position:relative;height:104px;margin-top:10px;flex:1;min-height:100px}
.pchart svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.pchart .dl2{position:absolute;bottom:-2px;font-size:9.5px;color:var(--faint);transform:translateX(4px);white-space:nowrap}
.pchart .now{position:absolute;top:0;bottom:16px;width:1px;background:rgba(244,241,234,.35)}
.pchart .nowdot{position:absolute;width:9px;height:9px;border-radius:50%;background:#fff6dc;transform:translate(-50%,-50%);box-shadow:0 0 0 0 rgba(232,195,126,.6);animation:pulse 2s infinite}
@keyframes pulse{70%{box-shadow:0 0 0 10px rgba(232,195,126,0)}}
.pchart .band{position:absolute;top:0;bottom:16px;border-radius:8px;background:rgba(107,227,168,.08);box-shadow:inset 0 0 0 1px rgba(107,227,168,.3)}
.pchart .band span{position:absolute;top:3px;left:50%;transform:translateX(-50%);font-size:9px;font-weight:700;letter-spacing:.12em;color:var(--emer);white-space:nowrap}
.pchart .ptip{position:absolute;top:0;padding:6px 9px;border-radius:10px;background:rgba(14,16,24,.94);box-shadow:inset 0 0 0 1px var(--hair);font-size:11px;white-space:nowrap;pointer-events:none;opacity:0;transform:translate(-50%,-105%);transition:opacity .15s;z-index:3}
.pchart .ptip b{font-size:13px}
.ptabs{margin-left:auto}.ptabs button{display:grid;place-items:center;padding:4px 8px}
.days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;margin-top:10px}
.day{display:flex;flex-direction:column;align-items:center;gap:3px;padding:5px 4px;border-radius:12px;font-size:10px;color:var(--mut);background:rgba(255,255,255,.025)}
.day .col{width:100%;height:4px;border-radius:4px;background:rgba(255,255,255,.06);overflow:hidden;order:3}
.day .col b{display:block;height:100%;border-radius:4px;animation:grow 1.2s cubic-bezier(.16,1,.3,1) both}
@keyframes rise{from{transform:scaleY(0)}}
.day strong{font-size:12px;color:var(--ink);font-weight:500}
.day.best{background:rgba(107,227,168,.08);box-shadow:inset 0 0 0 1px rgba(107,227,168,.25)}.day.best strong{color:var(--emer)}
.day.fc{opacity:.8}
.rum .more{cursor:pointer}

@keyframes barin{from{transform:scaleY(0)}}
/* ---------- KLIMA ---------- */
.klima{--acc:var(--ice)}
.klima .big{font-size:32px;margin-top:12px}
.kl{display:grid;gap:7px;margin-top:12px}
.kl div{display:grid;grid-template-columns:1fr auto;gap:3px 8px;align-items:center;font-size:11.5px;color:var(--mut)}
.kl b{color:var(--ink);font-weight:500;font-size:12.5px}
.kl i{grid-column:span 2;height:2px;border-radius:2px;background:rgba(255,255,255,.06);overflow:hidden}.kl i em{display:block;height:100%;border-radius:2px}
.frz{display:inline-flex;align-items:center;gap:6px;margin-top:10px;font-size:11px;color:var(--emer)}.frz.bad{color:var(--red)}

/* ---------- SIKKERHED ---------- */
.sik{--acc:var(--emer)}
.sik.warn{--acc:var(--coral)}.sik.alarm{--acc:var(--red);animation:tin .9s both,alm 1.1s ease-in-out infinite}
@keyframes alm{50%{box-shadow:0 0 0 1px var(--red),0 0 40px -6px var(--red)}}
.sik .row{display:flex;align-items:center;gap:12px;margin-top:14px}
.shield{position:relative;width:44px;height:44px;border-radius:15px;display:grid;place-items:center;color:var(--acc);background:color-mix(in srgb,var(--acc) 14%,transparent);flex:none}
.shield::after{content:"";position:absolute;inset:-5px;border-radius:19px;border:1px solid color-mix(in srgb,var(--acc) 45%,transparent);animation:halo 2.6s ease-out infinite}
.sik .row b{font-size:18px;font-weight:500;display:block}.sik .row small{font-size:11.5px;color:var(--mut)}
.dl{display:flex;flex-wrap:wrap;gap:5px;margin-top:12px}
.dl span{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:99px;font-size:10.5px;color:var(--mut);background:rgba(255,255,255,.04)}
.dl span i{width:5px;height:5px;border-radius:50%;background:var(--emer)}.dl span.o{color:var(--ink);background:rgba(255,158,122,.12)}.dl span.o i{background:var(--coral);animation:bl 1.2s infinite}
@keyframes bl{50%{opacity:.2}}

/* ---------- RUM ---------- */
.rum{grid-column:span 4;--acc:var(--vio);cursor:default;padding:14px 16px}
.rlist{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;margin-top:10px;scroll-snap-type:x mandatory}
.rlist::-webkit-scrollbar{display:none}
.rc{appearance:none;border:0;cursor:pointer;flex:1 0 150px;scroll-snap-align:start;display:flex;align-items:center;gap:10px;padding:8px 12px 8px 8px;border-radius:15px;text-align:left;
  background:rgba(255,255,255,.035);box-shadow:inset 0 0 0 1px var(--hair);transition:all .35s cubic-bezier(.16,1,.3,1)}
.rc:hover{background:rgba(255,255,255,.06);transform:translateY(-1px)}
.rc i{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;font-style:normal;color:var(--mut);background:rgba(255,255,255,.05);transition:all .4s;flex:none}
.rc.lit{box-shadow:inset 0 0 0 1px rgba(232,195,126,.3);background:linear-gradient(120deg,rgba(232,195,126,.12),rgba(232,195,126,.02))}
.rc.lit i{color:#3a2706;background:radial-gradient(circle at 35% 30%,#fff1c9,#e8c37e)}
.rc b{display:block;font-size:12px;font-weight:500;white-space:nowrap}.rc small{font-size:11px;color:var(--mut);white-space:nowrap}
.rc .d{width:6px;height:6px;border-radius:50%;background:var(--coral);margin-left:auto;animation:bl 1.2s infinite;flex:none}
.tabs{display:inline-flex;gap:2px;padding:3px;border-radius:11px;background:rgba(0,0,0,.3);margin-left:auto;box-shadow:inset 0 0 0 1px var(--hair)}
.tabs button{appearance:none;border:0;cursor:pointer;padding:4px 10px;border-radius:8px;background:transparent;color:var(--mut);font-size:11px;font-weight:600;letter-spacing:.02em;text-transform:none}
.tabs button.on{background:rgba(255,255,255,.1);color:var(--ink)}

/* ---------- mobil / mindre skærme ---------- */
@media(max-width:1250px){.sol{grid-template-columns:130px minmax(0,1fr)}.ring{width:130px;height:130px}.curve{grid-column:span 2;height:150px}}
@media(max-width:1100px){.bento{grid-template-columns:repeat(2,minmax(0,1fr));padding:0 10px;gap:8px;margin-top:0}:host{padding-bottom:110px}
  .sol,.lys,.pris,.rum{grid-column:span 2}.days{gap:4px}.t{padding:14px;border-radius:20px}}
@media(max-width:560px){.sol{grid-template-columns:112px minmax(0,1fr);gap:14px;padding:14px}.ring{width:112px;height:112px}.ring .c .big{font-size:24px}
  .stats{gap:10px 12px}.stat .big{font-size:21px}.curve{height:140px}.cstats{gap:10px;font-size:10.5px}.lgrid{grid-template-columns:repeat(4,1fr)}.lb i{width:44px;height:44px}
  .klima .big,.lys .big{font-size:26px}.sik .row b{font-size:15px}.shield{width:38px;height:38px}.rc{flex:0 0 140px}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

export const HSHEET = `
:host{position:fixed;inset:0;z-index:1000;display:flex;align-items:flex-end;justify-content:center;--ink:#f4f1ea;--mut:rgba(244,241,234,.58);--hair:rgba(244,241,234,.1);
  --amber:#ffd27a;--emer:#6be3a8;--red:#ff6b7d;--coral:#ff9e7a;--ice:#8ed1ff;color:var(--ink)}
*{box-sizing:border-box}button{font:inherit;color:inherit}
.bg{position:absolute;inset:0;background:rgba(3,4,8,.62);backdrop-filter:blur(8px);animation:fd .35s both}@keyframes fd{from{opacity:0}}
.sh{position:relative;width:min(560px,100%);max-height:88vh;overflow:auto;border-radius:30px 30px 0 0;padding:10px 22px 26px;background:linear-gradient(180deg,#171a23,#0e1016);
  box-shadow:0 -30px 80px -20px #000,inset 0 1px 0 rgba(255,255,255,.08);animation:up .55s cubic-bezier(.16,1,.3,1) both}
@media(min-width:900px){:host{align-items:center}.sh{border-radius:30px;animation:pop .5s cubic-bezier(.16,1,.3,1) both}}
@keyframes up{from{transform:translateY(100%)}}@keyframes pop{from{opacity:0;transform:translateY(24px) scale(.97)}}
.grab{width:42px;height:4px;border-radius:4px;background:rgba(255,255,255,.18);margin:4px auto 14px}
.top{display:flex;align-items:center;gap:14px;margin-bottom:18px}
.top .ic{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;color:var(--c);background:color-mix(in srgb,var(--c) 14%,transparent)}
.top h2{margin:0;font-size:20px;font-weight:500;flex:1}.top small{display:block;font-size:12px;color:var(--mut);margin-top:3px;font-weight:400}
.x{appearance:none;border:0;width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.07);cursor:pointer;display:grid;place-items:center}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:16px}
.cell{padding:14px;border-radius:18px;background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px var(--hair)}
.cell small{font-size:10.5px;color:var(--mut)}.cell b{display:block;font-size:18px;font-weight:500;margin-top:5px}
.list{display:grid;gap:8px}
.item{display:flex;align-items:center;gap:12px;padding:14px;border-radius:18px;background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px var(--hair)}
.item span{flex:1;font-size:14px}
.sw{appearance:none;border:0;width:50px;height:30px;border-radius:99px;background:rgba(255,255,255,.12);position:relative;cursor:pointer;transition:background .3s;flex:none}
.sw::after{content:"";position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:#fff;transition:transform .35s cubic-bezier(.3,1.5,.5,1)}
.sw.on{background:var(--amber)}.sw.on::after{transform:translateX(20px)}
.pad{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;max-width:300px;margin:8px auto 0}
.pad button{appearance:none;border:0;height:62px;border-radius:20px;font-size:22px;font-weight:400;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px var(--hair);cursor:pointer;transition:transform .15s,background .2s}
.pad button:active{transform:scale(.94);background:rgba(255,255,255,.14)}
.dots{display:flex;justify-content:center;gap:14px;margin:6px 0 18px}
.dots i{width:13px;height:13px;border-radius:50%;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.35);transition:all .2s}
.dots i.f{background:var(--c);box-shadow:0 0 12px var(--c)}
.dots.err{animation:shake .4s}@keyframes shake{25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}
.go{width:100%;margin-top:16px;padding:15px;border-radius:16px;border:0;cursor:pointer;font-weight:600;font-size:14px;background:var(--c);color:#14110a}
.note{font-size:12px;color:var(--mut);text-align:center;margin-top:12px}
.top .ic{background:var(--c)!important;color:#15110a!important;box-shadow:0 10px 24px -10px var(--c)}
.grp{font-size:10.5px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--mut);margin:16px 4px 8px}
.seg{display:flex;gap:4px;padding:4px;border-radius:14px;background:rgba(0,0,0,.3);margin-bottom:6px}
.seg button{appearance:none;border:0;flex:1;padding:10px;border-radius:10px;background:transparent;color:var(--mut);font-weight:700;font-size:13px;cursor:pointer}
.seg button.on{background:var(--c);color:#15110a}
.acts{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:4px 0 8px}
.acts button{appearance:none;border:0;padding:14px 8px;border-radius:16px;font-weight:700;font-size:13px;cursor:pointer;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px var(--hair)}
.acts button.on{background:var(--c);color:#15110a;box-shadow:none}
.tv{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;background:rgba(255,255,255,.04)}
.tv span{flex:1;font-size:14px}.tv b{font-size:16px}.tv .bar{width:70px;height:5px;border-radius:5px;background:rgba(255,255,255,.08);overflow:hidden}.tv .bar i{display:block;height:100%;border-radius:5px}
`;
