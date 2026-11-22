// Shared styles of the three TH page cards. Kept verbatim from the original file.
export const VP_CSS = `
:host{display:block;--ink:#f4f1ea;--mut:rgba(244,241,234,.56);--faint:rgba(244,241,234,.3);--hair:rgba(244,241,234,.09);
  --gold:#e8c37e;--ice:#8ed1ff;--emer:#6be3a8;--vio:#b7a4ff;--coral:#ff9e7a;--red:#ff6b7d;--amber:#ffd27a;
  color:var(--ink);font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased;padding:12px 0 100px}
@media(max-width:1100px){:host{padding:max(10px,env(safe-area-inset-top)) 10px 112px}}
*{box-sizing:border-box}button{font:inherit;color:inherit}
.g{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:8px}
.t{grid-column:span 12;position:relative;overflow:hidden;isolation:isolate;border-radius:24px;padding:16px 18px;min-width:0;
  background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.015)),rgba(12,14,20,.74);backdrop-filter:blur(18px) saturate(1.2);
  box-shadow:0 26px 50px -36px #000,inset 0 1px 0 rgba(255,255,255,.06);animation:tin .9s cubic-bezier(.16,1,.3,1) both}
.t::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;z-index:3;
  background:linear-gradient(150deg,rgba(255,255,255,.2),rgba(255,255,255,.03) 32%,rgba(255,255,255,.02) 70%,color-mix(in srgb,var(--acc,var(--gold)) 30%,transparent));
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
@keyframes tin{from{opacity:0;transform:translateY(14px);filter:blur(6px)}}
.s8{grid-column:span 8}.s7{grid-column:span 7}.s6{grid-column:span 6}.s5{grid-column:span 5}.s4{grid-column:span 4}
@media(max-width:1100px){.s8,.s7,.s6,.s5,.s4{grid-column:span 12}}
.hd{display:flex;align-items:center;gap:9px;font-size:10px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--mut);margin-bottom:12px}
.hd .ic{width:26px;height:26px;border-radius:9px;display:grid;place-items:center;color:var(--acc,var(--gold));background:color-mix(in srgb,var(--acc,var(--gold)) 13%,transparent)}
.hd .r{margin-left:auto;text-transform:none;letter-spacing:.02em;font-size:11px}
.big{font-weight:300;letter-spacing:-.045em;line-height:1}.big small{font-size:.4em;font-weight:500;letter-spacing:0;color:var(--mut);margin-left:4px}
.chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:99px;font-size:11px;font-weight:600;white-space:nowrap;color:var(--c,var(--emer));
  background:color-mix(in srgb,var(--c,var(--emer)) 12%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c,var(--emer)) 26%,transparent)}
.chip i{width:6px;height:6px;border-radius:50%;background:currentColor;animation:bl 1.8s infinite}@keyframes bl{50%{opacity:.25}}
.tabs{display:inline-flex;gap:2px;padding:3px;border-radius:11px;background:rgba(0,0,0,.3);box-shadow:inset 0 0 0 1px var(--hair)}
.tabs button{appearance:none;border:0;cursor:pointer;padding:4px 10px;border-radius:8px;background:transparent;color:var(--mut);font-size:11px;font-weight:600}
.tabs button.on{background:rgba(255,255,255,.1);color:var(--ink)}
.cells{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
@media(max-width:600px){.cells{grid-template-columns:repeat(2,minmax(0,1fr))}}
.cell{padding:12px;border-radius:16px;background:rgba(255,255,255,.035);box-shadow:inset 0 0 0 1px var(--hair);min-width:0}
.cell .k{display:flex;align-items:center;gap:6px;font-size:10.5px;color:var(--mut)}.cell .k svg{opacity:.8}
.cell b{display:block;font-size:19px;font-weight:400;letter-spacing:-.02em;margin-top:7px;white-space:nowrap}.cell b small{font-size:11px;color:var(--mut);margin-left:3px}
.cell em{display:block;font-style:normal;font-size:10.5px;color:var(--faint);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.btn{appearance:none;border:0;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:10px 14px;border-radius:13px;font-size:12.5px;font-weight:600;
  background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px var(--hair);transition:background .25s,transform .2s}
.btn:hover{background:rgba(255,255,255,.1)}.btn:active{transform:scale(.97)}
.draw{stroke-dasharray:3000;stroke-dashoffset:3000;animation:drw 2.2s cubic-bezier(.65,0,.35,1) forwards}@keyframes drw{to{stroke-dashoffset:0}}
.fadein{opacity:0;animation:fi 1.2s .4s forwards}@keyframes fi{to{opacity:1}}
/* modal */
.mod{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;background:rgba(3,4,8,.7);backdrop-filter:blur(8px);animation:fi .25s both;opacity:1}
.mod .box{width:min(420px,92vw);padding:22px;border-radius:26px;background:linear-gradient(180deg,#171a23,#0e1016);box-shadow:0 30px 80px #000,inset 0 1px 0 rgba(255,255,255,.08);animation:pop .45s cubic-bezier(.16,1,.3,1) both}
@keyframes pop{from{transform:translateY(20px) scale(.96);opacity:0}}
.mod h3{margin:0 0 6px;font-size:18px;font-weight:500}.mod p{margin:0 0 16px;font-size:13px;color:var(--mut);line-height:1.5}
.mod .row{display:flex;gap:8px;justify-content:flex-end}
.dots{display:flex;justify-content:center;gap:14px;margin:14px 0 18px}.dots i{width:13px;height:13px;border-radius:50%;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.35)}.dots i.f{background:var(--c,var(--gold));box-shadow:0 0 12px var(--c,var(--gold))}
.dots.err{animation:shake .4s}@keyframes shake{25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}
.pad{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.pad button{appearance:none;border:0;height:58px;border-radius:18px;font-size:21px;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px var(--hair);cursor:pointer}
.pad button:active{background:rgba(255,255,255,.14);transform:scale(.95)}
.go{width:100%;margin-top:14px;padding:14px;border-radius:16px;border:0;cursor:pointer;font-weight:600;font-size:14px;background:var(--c,var(--gold));color:#15110a}
.full{position:fixed;inset:0;z-index:1000;background:rgba(3,4,8,.92);display:grid;place-items:center;backdrop-filter:blur(8px)}
.full img{max-width:94vw;max-height:84vh;border-radius:18px;box-shadow:0 30px 80px #000}
.full .x{position:absolute;top:max(16px,env(safe-area-inset-top));right:16px;width:42px;height:42px;border-radius:50%;border:0;background:rgba(255,255,255,.12);cursor:pointer;display:grid;place-items:center}
.full .cap{position:absolute;left:24px;top:max(22px,env(safe-area-inset-top));font-size:15px;font-weight:600}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}

/* ---------------- VEJR ---------------- */
.wx{min-height:330px;--acc:var(--ice);padding:0}
.sky{position:absolute;inset:0;z-index:-1;transition:background 2s}
.sky .orb{position:absolute;right:6%;top:-70px;width:190px;height:190px;opacity:.75;border-radius:50%;filter:blur(2px);animation:orb 12s ease-in-out infinite}
@keyframes orb{50%{transform:translateY(10px) scale(1.04)}}
.sky .cl{position:absolute;height:60px;border-radius:60px;background:rgba(255,255,255,.07);filter:blur(10px);animation:cl linear infinite}
@keyframes cl{from{transform:translateX(-30%)}to{transform:translateX(130%)}}
.sky .st{position:absolute;width:2px;height:2px;border-radius:50%;background:#fff;animation:tw 3s ease-in-out infinite}@keyframes tw{50%{opacity:.2}}
.sky .rd{position:absolute;top:-20px;width:1px;height:16px;background:linear-gradient(transparent,rgba(180,210,255,.6));animation:rd linear infinite}@keyframes rd{to{transform:translateY(420px)}}
.now{display:grid;grid-template-columns:auto 1fr;gap:4px 24px;padding:20px 22px 0;align-items:end}
.now .big{font-size:clamp(62px,7vw,92px)}
.now .cd{font-size:18px;font-weight:400;display:flex;align-items:center;gap:10px}
.now .meta{font-size:12.5px;color:var(--mut);margin-top:6px;display:flex;flex-wrap:wrap;gap:4px 14px}
.now .meta b{color:var(--ink);font-weight:500}
.warn{margin-left:auto}
.hourly{position:relative;margin-top:14px;overflow-x:auto;scrollbar-width:none;padding:0 22px 16px}
.hourly::-webkit-scrollbar{display:none}
.hourly .in{position:relative;height:160px}
.hourly svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.hr{position:absolute;top:0;bottom:0;display:flex;flex-direction:column;align-items:center;transform:translateX(-50%);font-size:10.5px;color:var(--mut);pointer-events:none}
.hr .ico{margin-top:4px;color:var(--ink);opacity:.85}.hr b{font-size:12px;color:var(--ink);font-weight:500;position:absolute}
.hr .pp{position:absolute;bottom:0;font-size:9.5px;color:var(--ice)}
.radar{--acc:var(--ice);display:flex;flex-direction:column}
.radar .img{position:relative;flex:1;min-height:250px;border-radius:16px;overflow:hidden;background:#05060a}
.radar img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:opacity .8s}
.radar .pin{position:absolute;left:50%;top:50%;width:12px;height:12px;border-radius:50%;background:var(--gold);transform:translate(-50%,-50%);box-shadow:0 0 0 4px rgba(232,195,126,.3)}
.radar .pin::after{content:"";position:absolute;inset:-8px;border-radius:50%;border:1px solid var(--gold);animation:rng 2s ease-out infinite}@keyframes rng{from{opacity:1;transform:scale(.5)}to{opacity:0;transform:scale(2)}}
.days{display:grid;gap:2px}
.day{display:grid;grid-template-columns:60px 30px 42px 34px 1fr 34px;align-items:center;gap:8px;padding:9px 2px;border-bottom:1px solid var(--hair);font-size:13px;animation:tin .6s both}
.day:last-child{border-bottom:0}.day .nm{font-weight:500}.day .pp{font-size:11px;color:var(--ice)}.day .lo{color:var(--mut);text-align:right}.day .hi{text-align:right}
.day .rng{position:relative;height:5px;border-radius:5px;background:rgba(255,255,255,.07)}
.day .rng i{position:absolute;top:0;bottom:0;border-radius:5px}.day .rng em{position:absolute;top:50%;width:7px;height:7px;border-radius:50%;background:#fff;transform:translate(-50%,-50%);box-shadow:0 0 0 2px #0c0e14}

/* ---------------- SIKKERHED ---------------- */
.alarm{--acc:var(--c,var(--emer));display:grid;grid-template-columns:auto 1fr;gap:20px;align-items:center}
.alarm.trig{animation:tin .9s both,alm 1.1s ease-in-out infinite}@keyframes alm{50%{box-shadow:0 0 0 1px var(--red),0 0 50px -6px var(--red)}}
.sh{position:relative;width:110px;height:110px;border-radius:34px;display:grid;place-items:center;color:var(--c);background:color-mix(in srgb,var(--c) 14%,transparent)}
.sh::before,.sh::after{content:"";position:absolute;inset:-8px;border-radius:40px;border:1px solid color-mix(in srgb,var(--c) 45%,transparent);animation:rng2 3s ease-out infinite}
.sh::after{animation-delay:1.5s}@keyframes rng2{from{opacity:.9;transform:scale(.9)}to{opacity:0;transform:scale(1.25)}}
.alarm .st{font-size:clamp(26px,2.6vw,36px);font-weight:400;letter-spacing:-.02em}.alarm .sub{color:var(--mut);font-size:13px;margin-top:6px}
.arm{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:16px}
.arm button{appearance:none;border:0;cursor:pointer;padding:13px 6px;border-radius:15px;font-weight:600;font-size:13px;background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px var(--hair);transition:all .3s}
.arm button.on{background:color-mix(in srgb,var(--c) 18%,transparent);color:var(--c);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 45%,transparent)}
@media(max-width:600px){.alarm{grid-template-columns:1fr;justify-items:start}.sh{width:80px;height:80px;border-radius:26px}.arm{width:100%}}
.lockc{--acc:var(--c,var(--emer));display:flex;flex-direction:column}
.lockbtn{appearance:none;border:0;cursor:pointer;margin:6px auto 0;width:120px;height:120px;border-radius:50%;display:grid;place-items:center;color:var(--c);
  background:radial-gradient(circle at 35% 30%,color-mix(in srgb,var(--c) 30%,transparent),color-mix(in srgb,var(--c) 8%,transparent));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 40%,transparent),0 20px 40px -20px var(--c);transition:transform .3s}
.lockbtn:active{transform:scale(.94)}
.lockc .st{text-align:center;margin-top:14px;font-size:18px;font-weight:500}.lockc .sub{text-align:center;color:var(--mut);font-size:12px;margin-top:4px}
.drs{display:grid;gap:6px}
.dr{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;padding:11px 12px;border-radius:15px;background:rgba(255,255,255,.035);box-shadow:inset 0 0 0 1px var(--hair);transition:all .4s}
.dr .ic{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;color:var(--emer);background:rgba(107,227,168,.12)}
.dr b{display:block;font-size:13.5px;font-weight:500}.dr small{font-size:11px;color:var(--mut)}
.dr .s{font-size:11.5px;font-weight:600;color:var(--emer)}
.dr.open{background:rgba(255,158,122,.08);box-shadow:inset 0 0 0 1px rgba(255,158,122,.35)}.dr.open .ic{color:var(--coral);background:rgba(255,158,122,.14)}.dr.open .s{color:var(--coral)}
.dr.long{animation:alm2 1.6s infinite}@keyframes alm2{50%{box-shadow:inset 0 0 0 1px var(--red),0 0 24px -8px var(--red)}}
.alerts{display:grid;gap:6px}
.al{display:flex;gap:12px;align-items:center;padding:11px 12px;border-radius:15px;background:color-mix(in srgb,var(--c) 9%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 30%,transparent);color:var(--c)}
.al b{display:block;color:var(--ink);font-size:13px;font-weight:500}.al small{color:var(--mut);font-size:11px}
.calm{display:flex;align-items:center;gap:12px;padding:14px;border-radius:16px;background:rgba(107,227,168,.07);color:var(--emer);font-size:13px}
.photos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
@media(max-width:600px){.photos{grid-template-columns:repeat(2,minmax(0,1fr))}}
.ph{appearance:none;border:0;padding:0;cursor:pointer;position:relative;aspect-ratio:4/3;border-radius:15px;overflow:hidden;background:#06070b;box-shadow:inset 0 0 0 1px var(--hair)}
.ph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.92;transition:transform .6s}
.ph:hover img{transform:scale(1.05)}
.ph span{position:absolute;left:0;right:0;bottom:0;padding:18px 10px 8px;background:linear-gradient(transparent,rgba(0,0,0,.75));font-size:11.5px;font-weight:600;text-align:left}
.ph span small{display:block;font-weight:400;color:rgba(255,255,255,.7);font-size:10px}

/* ---------------- TEKNIK ---------------- */
.pw{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
@media(max-width:700px){.pw{grid-template-columns:repeat(2,minmax(0,1fr))}}
.pb{appearance:none;border:0;cursor:pointer;text-align:left;padding:14px;border-radius:18px;background:rgba(255,255,255,.035);box-shadow:inset 0 0 0 1px var(--hair);transition:all .4s cubic-bezier(.16,1,.3,1);min-width:0}
.pb .ic{width:40px;height:40px;border-radius:13px;display:grid;place-items:center;color:var(--mut);background:rgba(255,255,255,.06);transition:all .4s}
.pb b{display:block;font-size:13.5px;font-weight:500;margin-top:12px}.pb small{font-size:11px;color:var(--mut)}
.pb.on{background:linear-gradient(140deg,rgba(107,227,168,.13),rgba(107,227,168,.03));box-shadow:inset 0 0 0 1px rgba(107,227,168,.3)}
.pb.on .ic{color:#08261a;background:radial-gradient(circle at 35% 30%,#b7f5d6,#6be3a8);box-shadow:0 0 20px -4px rgba(107,227,168,.7)}
.pb.on small{color:var(--emer)}
.pb:active{transform:scale(.97)}
.rl{display:grid;gap:4px 16px;grid-template-columns:1fr 1fr}@media(max-width:700px){.rl{grid-template-columns:1fr}}
.rr{display:flex;align-items:center;gap:12px;padding:9px 6px 9px 10px;border-radius:13px;transition:background .3s}
.rr:hover{background:rgba(255,255,255,.03)}.rr span{flex:1;font-size:13px}.rr small{font-size:11px;color:var(--mut)}
.sw{appearance:none;border:0;width:44px;height:26px;border-radius:99px;background:rgba(255,255,255,.12);position:relative;cursor:pointer;transition:background .3s;flex:none}
.sw::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .35s cubic-bezier(.3,1.5,.5,1)}
.sw.on{background:var(--emer)}.sw.on::after{transform:translateX(18px)}
.gauges{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.ga{position:relative;padding:12px;border-radius:16px;background:rgba(255,255,255,.035);box-shadow:inset 0 0 0 1px var(--hair);text-align:center}
.ga svg{width:100%;max-width:110px;height:auto;display:block;margin:0 auto}
.ga .v{position:absolute;left:0;right:0;top:44%;font-size:20px;font-weight:300;letter-spacing:-.03em}
.ga small{font-size:10.5px;color:var(--mut)}
.inks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.prn{padding:12px;border-radius:16px;background:rgba(255,255,255,.035);box-shadow:inset 0 0 0 1px var(--hair)}
.prn .n{font-size:12px;font-weight:500;margin-bottom:10px;display:flex;justify-content:space-between}
.tanks{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.tk{display:flex;flex-direction:column;align-items:center;gap:6px;font-size:10.5px;color:var(--mut)}
.tk .tb{position:relative;width:26px;height:70px;border-radius:9px;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px var(--hair);overflow:hidden}
.tk .tb i{position:absolute;left:0;right:0;bottom:0;transition:height 1.6s cubic-bezier(.16,1,.3,1)}
.tk .tb i::before{content:"";position:absolute;left:-50%;top:-3px;width:200%;height:6px;border-radius:40%;background:inherit;filter:brightness(1.25);animation:wv 3s ease-in-out infinite}
@keyframes wv{50%{transform:translateX(18%)}}
.tk.low .tb{box-shadow:inset 0 0 0 1px var(--red),0 0 14px -4px var(--red)}.tk.low b{color:var(--red)}
.tk b{font-size:12px;color:var(--ink);font-weight:500}
`;
