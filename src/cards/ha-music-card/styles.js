// Look of ha-music-card: a dark music app (Spotify / Music Assistant web feel). By Claude AI.
export const STYLES = `
:host { display: block; --mc-accent: var(--primary-color, #1db954); --mc-accent-rgb: 29, 185, 84; --mc-bg: #0f0f10;
  --mc-surface: #18181b; --mc-surface-2: #222226; --mc-surface-3: #2c2c31; --mc-text: #f4f4f5; --mc-dim: #a1a1aa;
  --mc-faint: #71717a; --mc-line: rgba(255,255,255,.07); --mc-radius: 14px; --mc-bar-h: 88px; color-scheme: dark; }
* { box-sizing: border-box; }
ha-card.mc { display: block; overflow: hidden; background: var(--mc-bg); color: var(--mc-text); border-radius: var(--ha-card-border-radius, 16px);
  border: none; height: var(--mc-height, 760px); font-family: var(--paper-font-body1_-_font-family, Roboto, "Segoe UI", system-ui, sans-serif);
  -webkit-tap-highlight-color: transparent; position: relative; isolation: isolate; }
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; -webkit-tap-highlight-color: transparent; }
input, select { font: inherit; color: inherit; }
.ic { width: 24px; height: 24px; fill: currentColor; flex: none; display: block; }
.shell { position: relative; height: 100%; display: grid; grid-template-columns: var(--mc-side-w, 232px) minmax(0, 1fr) var(--mc-panel-w, 0px);
  grid-template-rows: minmax(0, 1fr) auto; grid-template-areas: "side main panel" "bar bar bar"; gap: 8px; padding: 8px; }
.shell.narrow { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto auto; grid-template-areas: "main" "mini" "tabs"; gap: 0; padding: 0; }
.shell.medium { --mc-side-w: 76px; }
.shell.medium.side-open { --mc-side-w: 232px; }

/* Sidebar */
.side { grid-area: side; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
.narrow .side, .narrow .bar { display: none; }
.side-box { background: var(--mc-surface); border-radius: var(--mc-radius); padding: 8px; }
.side-box.grow { flex: 1; min-height: 0; overflow: auto; scrollbar-width: thin; }
.nav-item { display: flex; align-items: center; gap: 14px; width: 100%; padding: 10px 12px; border-radius: 10px; color: var(--mc-dim);
  font-weight: 600; font-size: 14.5px; text-align: left; transition: color .15s, background .15s; white-space: nowrap; overflow: hidden; }
.nav-item:hover { color: var(--mc-text); background: rgba(255,255,255,.04); }
.nav-item.on { color: var(--mc-text); background: rgba(255,255,255,.07); }
.nav-item.on .ic { color: var(--mc-accent); }
.nav-label { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--mc-faint); padding: 12px 12px 6px; font-weight: 700; }
.medium:not(.side-open) .nav-item { justify-content: center; padding: 12px 0; }
.medium:not(.side-open) .nav-item span, .medium:not(.side-open) .nav-label, .medium:not(.side-open) .side-pl { display: none; }
.side-pl { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 8px; width: 100%; text-align: left; }
.side-pl:hover { background: rgba(255,255,255,.05); }
.side-pl img, .side-pl .ph { width: 40px; height: 40px; border-radius: 6px; object-fit: cover; flex: none; }
.side-pl .t { font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.side-pl .s { font-size: 12px; color: var(--mc-dim); }

/* Main column */
.main { grid-area: main; position: relative; min-height: 0; border-radius: var(--mc-radius); background: var(--mc-surface); overflow: hidden; display: flex; flex-direction: column; }
.narrow .main { border-radius: 0; background: var(--mc-bg); }
.top { position: absolute; top: 0; left: 0; right: 0; z-index: 5; display: flex; align-items: center; gap: 10px; padding: 12px 16px; transition: background .2s;
  pointer-events: none; }
.top > * { pointer-events: auto; }
.top.solid { background: rgba(var(--mc-top-rgb, 24, 24, 27), .94); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: 0 1px 0 var(--mc-line); }
.top-title { font-weight: 700; font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0; transition: opacity .2s; flex: 1; min-width: 0; }
.top.solid .top-title { opacity: 1; }
.round { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: rgba(0,0,0,.55); color: var(--mc-text); flex: none; transition: transform .1s, background .15s; }
.round:disabled { opacity: .35; cursor: default; }
.round:not(:disabled):hover { background: rgba(0,0,0,.75); }
.round:active { transform: scale(.94); }
.round .ic { width: 22px; height: 22px; }
.chip-player { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px 6px 8px; border-radius: 999px; background: rgba(0,0,0,.55);
  font-size: 13px; font-weight: 600; max-width: 60%; margin-left: auto; }
.chip-player .ic { width: 18px; height: 18px; color: var(--mc-accent); }
.chip-player span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.search-box { flex: 1; max-width: 420px; display: flex; align-items: center; gap: 8px; background: var(--mc-surface-3); border-radius: 999px; padding: 0 14px; height: 44px;
  border: 2px solid transparent; transition: border-color .15s, background .15s; }
.search-box:focus-within { border-color: rgba(255,255,255,.85); background: #333338; }
.search-box .ic { color: var(--mc-dim); width: 22px; height: 22px; }
.search-box input { flex: 1; min-width: 0; border: 0; outline: 0; background: none; font-size: 15px; height: 100%; }
.search-box input::-webkit-search-cancel-button { display: none; }
.search-box input::placeholder { color: var(--mc-faint); }
.content { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #3f3f46 transparent; -webkit-overflow-scrolling: touch; }
.content::-webkit-scrollbar { width: 10px; }
.content::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 10px; border: 3px solid transparent; background-clip: padding-box; }
.view { padding: 64px 20px 28px; animation: viewIn .28s ease both; min-height: 100%; }
.view.hero-view { padding-top: 0; }
.narrow .view { padding: 60px 14px 20px; }
.narrow .view.hero-view { padding-top: 0; }
@keyframes viewIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

/* Home */
.greet { font-size: clamp(24px, 3.2vw, 32px); font-weight: 800; letter-spacing: -.02em; margin: 6px 0 18px; }
.home-bg { position: absolute; left: 0; right: 0; top: 0; height: 320px; background: linear-gradient(180deg, rgba(var(--mc-accent-rgb), .35), transparent);
  pointer-events: none; transition: background .6s; }
.view.home { position: relative; }
.view.home > *:not(.home-bg) { position: relative; }
.quick { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr)); gap: 10px; margin-bottom: 30px; }
.narrow .quick { grid-template-columns: 1fr 1fr; gap: 8px; }
.qt { display: flex; align-items: center; gap: 12px; height: 60px; border-radius: 8px; background: rgba(255,255,255,.08); overflow: hidden; text-align: left;
  position: relative; transition: background .15s; padding-right: 8px; }
.narrow .qt { height: 54px; gap: 8px; }
.qt:hover { background: rgba(255,255,255,.16); }
.qt .art { width: 60px; height: 60px; border-radius: 0; flex: none; }
.narrow .qt .art { width: 54px; height: 54px; }
.qt .t { font-weight: 700; font-size: 14px; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; flex: 1; min-width: 0; }
.narrow .qt .t { font-size: 12.5px; }
.qt .eq { margin-right: 6px; }
.shelf { margin-bottom: 30px; }
.shelf-h { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.shelf-h h2 { font-size: 21px; font-weight: 800; letter-spacing: -.01em; margin: 0; }
.narrow .shelf-h h2 { font-size: 19px; }
.shelf-h button { font-size: 13px; font-weight: 700; color: var(--mc-dim); }
.shelf-h button:hover { color: var(--mc-text); text-decoration: underline; }
.row { display: grid; grid-auto-flow: column; grid-auto-columns: var(--mc-tile, 172px); gap: 14px; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x proximity;
  margin: 0 -20px; padding: 0 8px 6px; scroll-padding-inline: 8px; scrollbar-width: none; overscroll-behavior-x: contain; }
.narrow .row { --mc-tile: 142px; margin: 0 -14px; padding: 0 14px 4px; scroll-padding-inline: 14px; gap: 12px; }
.row::-webkit-scrollbar { display: none; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--mc-tile, 168px), 1fr)); gap: 14px 14px; }
.narrow .grid { --mc-tile: 140px; gap: 14px 12px; }

/* Tiles */
.tile { scroll-snap-align: start; padding: 12px; border-radius: 12px; text-align: left; transition: background .2s; position: relative; min-width: 0; }
.narrow .tile { padding: 0; }
.tile:hover { background: rgba(255,255,255,.06); }
.tile .cover { position: relative; aspect-ratio: 1; margin-bottom: 10px; }
.tile .art { width: 100%; height: 100%; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.45); }
.tile.circle .art { border-radius: 50%; }
.tile .t { font-weight: 700; font-size: 14.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tile .s { font-size: 13px; color: var(--mc-dim); margin-top: 3px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.35; }
.tile.circle .t, .tile.circle .s { text-align: center; }
.tile .fab { position: absolute; right: 8px; bottom: 8px; opacity: 0; transform: translateY(8px); transition: opacity .2s, transform .2s; }
.tile:hover .fab, .tile:focus-within .fab { opacity: 1; transform: none; }
.touch .tile .fab { display: none; }
.tile .more { position: absolute; top: 6px; right: 6px; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: rgba(0,0,0,.55);
  opacity: 0; transition: opacity .15s; }
.tile:hover .more, .touch .tile .more { opacity: 1; }
.touch .tile .more { background: rgba(0,0,0,.45); width: 28px; height: 28px; }
.tile .more .ic { width: 18px; height: 18px; }
.art { display: block; object-fit: cover; background: linear-gradient(135deg, #2c2c31, #1f1f23); color: #52525b; }
div.art, span.art { display: grid; place-items: center; }
.art-ph { background: linear-gradient(135deg, hsl(var(--h, 240) 28% 30%), hsl(var(--h, 240) 22% 16%)); color: hsla(var(--h, 240), 30%, 80%, .45); }
div.art .ic, span.art .ic { width: 42%; height: 42%; }
.fab { width: 48px; height: 48px; border-radius: 50%; background: var(--mc-accent); color: #000; display: grid; place-items: center;
  box-shadow: 0 8px 18px rgba(0,0,0,.4); transition: transform .12s, filter .15s; }
.fab:hover { transform: scale(1.06); filter: brightness(1.08); }
.fab:active { transform: scale(.95); }
.fab .ic { width: 26px; height: 26px; }
.fab.big { width: 56px; height: 56px; }
.fab.big .ic { width: 30px; height: 30px; }

/* Lists */
.tracks { display: flex; flex-direction: column; }
.tr { display: grid; grid-template-columns: 32px minmax(0, 1fr) minmax(0, .7fr) 52px 36px; align-items: center; gap: 14px; padding: 6px 10px; border-radius: 8px;
  text-align: left; width: 100%; min-height: 56px; transition: background .12s; position: relative; }
.tr.nohead { grid-template-columns: minmax(0, 1fr) minmax(0, .7fr) 52px 36px; }
.tr:hover { background: rgba(255,255,255,.07); }
.tr.on .tt { color: var(--mc-accent); }
.tr .n { color: var(--mc-dim); font-size: 14px; text-align: right; font-variant-numeric: tabular-nums; position: relative; }
.tr .n .ic { width: 18px; height: 18px; display: none; margin-left: auto; color: var(--mc-text); }
.tr:hover .n span { display: none; }
.tr:hover .n .ic { display: block; }
.tr.on .n span { display: none; }
.tr .main-c { display: flex; align-items: center; gap: 12px; min-width: 0; }
.tr .main-c .art { width: 42px; height: 42px; border-radius: 5px; flex: none; }
.tr .tt { font-size: 15px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tr .ts { font-size: 13px; color: var(--mc-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
.tr .al { font-size: 13.5px; color: var(--mc-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tr .d { font-size: 13.5px; color: var(--mc-dim); text-align: right; font-variant-numeric: tabular-nums; }
.tr .dots { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; color: var(--mc-dim); opacity: 0; }
.tr:hover .dots, .touch .tr .dots { opacity: 1; }
.tr .dots:hover { color: var(--mc-text); background: rgba(255,255,255,.08); }
.tr-head { display: grid; grid-template-columns: 32px minmax(0, 1fr) minmax(0, .7fr) 52px 36px; gap: 14px; padding: 0 10px 8px; margin-bottom: 8px; color: var(--mc-dim);
  font-size: 12.5px; letter-spacing: .06em; text-transform: uppercase; border-bottom: 1px solid var(--mc-line); }
.tr-head .r { text-align: right; }
.noalbum .tr, .noalbum .tr-head { grid-template-columns: 32px minmax(0, 1fr) 52px 36px; }
.noalbum .tr .al, .noalbum .tr-head .al { display: none; }
.cozy .tr, .cozy .tr-head { grid-template-columns: 28px minmax(0, 1fr) 46px 34px; gap: 10px; }
.cozy .tr .al, .cozy .tr-head .al { display: none; }
.cozy .tr.nohead { grid-template-columns: minmax(0, 1fr) 34px; }
.cozy .tr.nohead .d { display: none; }
.narrow .tr { padding: 6px 4px; }
.ep .ts { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.played { color: var(--mc-accent); font-weight: 700; }

/* Equalizer */
.eq { display: inline-flex; align-items: flex-end; gap: 2px; width: 14px; height: 14px; flex: none; }
.eq i { width: 3px; background: var(--mc-accent); border-radius: 1px; height: 30%; animation: eq .9s ease-in-out infinite; }
.eq i:nth-child(2) { animation-delay: -.3s; }
.eq i:nth-child(3) { animation-delay: -.6s; }
.eq.paused i { animation-play-state: paused; height: 35%; }
@keyframes eq { 0%,100% { height: 25%; } 50% { height: 100%; } }
.tr .n .eq { margin-left: auto; }

/* Detail hero */
.hero { position: relative; display: flex; align-items: flex-end; gap: 24px; padding: 76px 24px 24px; margin: 0 -20px; min-height: 300px;
  background: linear-gradient(180deg, rgba(var(--mc-hero-rgb, 82, 82, 91), .85), rgba(var(--mc-hero-rgb, 82, 82, 91), .35)); transition: background .5s; }
.narrow .hero { flex-direction: column; align-items: center; text-align: center; margin: 0 -14px; padding: 64px 18px 18px; gap: 16px; min-height: 0; }
.hero .art { width: clamp(150px, 22vw, 232px); height: clamp(150px, 22vw, 232px); border-radius: 8px; box-shadow: 0 14px 40px rgba(0,0,0,.55); flex: none; }
.narrow .hero .art { width: min(62vw, 240px); height: min(62vw, 240px); }
.hero.circle .art { border-radius: 50%; }
.hero .kind { font-size: 13px; font-weight: 700; }
.hero h1.mid { font-size: clamp(26px, 3.6vw, 48px); }
.hero h1.long { font-size: clamp(22px, 2.6vw, 34px); }
.hero h1 { font-size: clamp(28px, 5vw, 64px); line-height: 1.04; font-weight: 900; letter-spacing: -.03em; margin: 6px 0 12px; overflow: hidden;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; word-break: break-word; }
.narrow .hero h1.mid { font-size: clamp(26px, 3.6vw, 48px); }
.hero h1.long { font-size: clamp(22px, 2.6vw, 34px); }
.hero h1 { font-size: 26px; margin: 0 0 6px; }
.hero .meta { font-size: 14px; color: rgba(255,255,255,.82); display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; }
.narrow .hero .meta { justify-content: center; font-size: 13px; }
.hero .meta b { color: #fff; }
.hero .meta .link { font-weight: 700; color: #fff; }
.hero .meta .link:hover { text-decoration: underline; }
.hero .desc { font-size: 13.5px; color: rgba(255,255,255,.7); margin-top: 8px; max-width: 70ch; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.actions { display: flex; align-items: center; gap: 20px; padding: 22px 0 18px; position: relative; }
.actions-bg { position: absolute; left: -20px; right: -20px; top: 0; height: 240px; background: linear-gradient(180deg, rgba(var(--mc-hero-rgb, 82, 82, 91), .28), transparent); pointer-events: none; }
.narrow .actions-bg { left: -14px; right: -14px; }
.actions > :not(.actions-bg) { position: relative; }
.act { color: var(--mc-dim); display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; transition: color .15s, transform .1s; }
.act:hover { color: var(--mc-text); }
.act:active { transform: scale(.92); }
.act .ic { width: 30px; height: 30px; }
.act.on { color: var(--mc-accent); }
.pill { display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 999px; border: 1px solid rgba(255,255,255,.3); font-weight: 700; font-size: 13.5px; }
.pill:hover { border-color: #fff; transform: scale(1.02); }
.pill .ic { width: 18px; height: 18px; }

/* Library */
.lib-head { display: flex; flex-direction: column; gap: 12px; margin-bottom: 18px; }
.lib-head h1 { font-size: 28px; font-weight: 800; margin: 0; letter-spacing: -.02em; }
.chips { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; margin: 0 -20px; padding: 0 20px; }
.narrow .chips { margin: 0 -14px; padding: 0 14px; }
.chips::-webkit-scrollbar { display: none; }
.chip { padding: 8px 14px; border-radius: 999px; background: rgba(255,255,255,.08); font-size: 13.5px; font-weight: 600; white-space: nowrap; transition: background .15s, color .15s; flex: none; display: inline-flex; align-items: center; gap: 6px; }
.chip:hover { background: rgba(255,255,255,.14); }
.chip.on { background: var(--mc-text); color: #000; }
.chip .ic { width: 16px; height: 16px; }
.lib-tools { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.filter { display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,.07); border-radius: 8px; padding: 0 10px; height: 38px; flex: 1; min-width: 160px; max-width: 320px; }
.filter .ic { width: 18px; height: 18px; color: var(--mc-dim); }
.filter input { border: 0; outline: 0; background: none; flex: 1; min-width: 0; font-size: 14px; }
.sort { height: 38px; border-radius: 8px; background: rgba(255,255,255,.07); border: 0; padding: 0 10px; font-size: 13.5px; font-weight: 600; color: var(--mc-text); outline: 0; }
.sort option { background: #222; }
.sentinel { height: 40px; }

/* Search */
.best { display: grid; grid-template-columns: minmax(260px, 2fr) minmax(0, 3fr); gap: 22px; margin-bottom: 26px; }
.cozy .best, .narrow .best { grid-template-columns: 1fr; }
.best-tile { background: rgba(255,255,255,.05); border-radius: 12px; padding: 20px; text-align: left; position: relative; transition: background .2s; display: flex; flex-direction: column; gap: 16px; }
.best-tile:hover { background: rgba(255,255,255,.1); }
.best-tile .art { width: 96px; height: 96px; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.45); }
.best-tile.circle .art { border-radius: 50%; }
.best-tile .t { font-size: 28px; font-weight: 800; letter-spacing: -.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.best-tile .s { color: var(--mc-dim); font-size: 14px; display: flex; gap: 8px; align-items: center; }
.tag { background: rgba(0,0,0,.4); color: var(--mc-text); padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
.best-tile .fab { position: absolute; right: 18px; bottom: 18px; }
.sec-h { font-size: 21px; font-weight: 800; margin: 0 0 12px; }
.browse { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(46%, 190px), 1fr)); gap: 14px; }
.bt { position: relative; aspect-ratio: 1.7; border-radius: 10px; overflow: hidden; padding: 14px; text-align: left; font-size: 19px; font-weight: 800; transition: transform .15s; }
.bt:hover { transform: scale(1.02); }
.bt .ic { position: absolute; right: -8px; bottom: -6px; width: 74px; height: 74px; transform: rotate(22deg); opacity: .9; }
.recent { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 26px; }
.recent .chip .x { opacity: .6; }

/* Empty / error / skeleton */
.empty { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 10px; padding: 60px 20px; color: var(--mc-dim); }
.empty .ic { width: 48px; height: 48px; color: var(--mc-faint); }
.empty b { color: var(--mc-text); font-size: 17px; }
.sk { background: linear-gradient(90deg, #232327 0%, #2e2e33 50%, #232327 100%); background-size: 200% 100%; animation: sk 1.2s linear infinite; border-radius: 8px; }
@keyframes sk { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.sk-tile { display: flex; flex-direction: column; gap: 10px; padding: 12px; }
.narrow .sk-tile { padding: 0; }
.sk-tile .sk:first-child { aspect-ratio: 1; }
.sk-line { height: 12px; }

/* Right panel (queue / speakers) */
.panel { grid-area: panel; min-height: 0; background: var(--mc-surface); border-radius: var(--mc-radius); display: none; flex-direction: column; overflow: hidden; }
.shell.panel-docked .panel { display: flex; }
.shell.panel-overlay .panel { display: flex; position: absolute; right: 8px; top: 8px; bottom: calc(var(--mc-bar-h) + 16px); width: min(380px, calc(100% - 16px)); z-index: 30;
  box-shadow: -12px 0 40px rgba(0,0,0,.6); animation: panelIn .22s ease both; }
@keyframes panelIn { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }
.panel-h { display: flex; align-items: center; gap: 8px; padding: 16px 12px 8px 18px; }
.panel-h h3 { flex: 1; margin: 0; font-size: 17px; font-weight: 800; }
.panel-tabs { display: flex; gap: 6px; padding: 0 14px 10px; }
.panel-body { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 10px 16px; scrollbar-width: thin; overscroll-behavior: contain; }
.sub-h { font-size: 13px; font-weight: 700; color: var(--mc-dim); margin: 14px 8px 8px; display: flex; justify-content: space-between; align-items: center; }
.sub-h button { font-size: 12.5px; color: var(--mc-dim); font-weight: 700; }
.sub-h button:hover { color: var(--mc-text); }
.qi { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 8px; width: 100%; text-align: left; position: relative; }
.qi:hover { background: rgba(255,255,255,.07); }
.qi .art { width: 44px; height: 44px; border-radius: 5px; flex: none; }
.qi .tx { flex: 1; min-width: 0; }
.qi .tt { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.qi.on .tt { color: var(--mc-accent); }
.qi .ts { font-size: 12.5px; color: var(--mc-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
.qi.past { opacity: .5; }
.qi .qa { display: flex; gap: 2px; }
.mini-btn { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; color: var(--mc-dim); }
.mini-btn:hover { color: var(--mc-text); background: rgba(255,255,255,.08); }
.mini-btn .ic { width: 19px; height: 19px; }
.qi .qa { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); background: #2f2f35; border-radius: 999px; padding: 2px; box-shadow: -10px 0 14px #2f2f35; opacity: 0; pointer-events: none; transition: opacity .12s; }
.qi:hover .qa, .qi:focus-within .qa { opacity: 1; pointer-events: auto; }
.touch .qi .qa { position: static; transform: none; opacity: 1; pointer-events: auto; background: none; box-shadow: none; }
.sp-hint { font-size: 12.5px; color: var(--mc-faint); margin: -4px 8px 10px; line-height: 1.4; }
.sp-hint .ic { width: 14px; height: 14px; display: inline-block; vertical-align: -2px; }
.sp-cur .sp-vol .ic { width: 20px; height: 20px; color: var(--mc-accent); flex: none; }

/* Speakers */
.sp-cur { margin: 4px 4px 12px; padding: 14px; border-radius: 12px; background: linear-gradient(135deg, rgba(var(--mc-accent-rgb), .28), rgba(var(--mc-accent-rgb), .08)); }
.sp-cur .lbl { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--mc-accent); }
.sp-cur .nm { font-size: 19px; font-weight: 800; margin: 4px 0 2px; display: flex; align-items: center; gap: 8px; }
.sp-cur .nm .ic { color: var(--mc-accent); }
.sp-cur .sub { font-size: 13px; color: var(--mc-dim); }
.sp { border-radius: 12px; padding: 8px; transition: background .15s; }
.sp:hover { background: rgba(255,255,255,.05); }
.sp.active { background: rgba(var(--mc-accent-rgb), .12); }
.sp-row { display: flex; align-items: center; gap: 12px; }
.sp-main { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; text-align: left; padding: 2px 0; }
.sp-ic { width: 42px; height: 42px; border-radius: 10px; background: var(--mc-surface-3); display: grid; place-items: center; flex: none; color: var(--mc-dim); position: relative; }
.sp.active .sp-ic, .sp.grouped .sp-ic { background: rgba(var(--mc-accent-rgb), .22); color: var(--mc-accent); }
.sp-ic .eq { position: absolute; right: -3px; bottom: -3px; background: var(--mc-bg); border-radius: 4px; padding: 2px; width: 18px; height: 18px; }
.sp-tx { min-width: 0; flex: 1; }
.sp-nm { font-size: 14.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sp.active .sp-nm { color: var(--mc-accent); }
.sp-st { font-size: 12.5px; color: var(--mc-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
.grp { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; border: 2px solid rgba(255,255,255,.35); color: var(--mc-dim); flex: none; transition: all .15s; }
.grp:hover { border-color: #fff; color: #fff; }
.grp.on { background: var(--mc-accent); border-color: var(--mc-accent); color: #000; }
.grp .ic { width: 20px; height: 20px; }
.grp:disabled { opacity: .3; cursor: default; }
.sp-vol { display: flex; align-items: center; gap: 8px; padding: 6px 2px 0 54px; }
.sp-vol .mini-btn { width: 26px; height: 26px; flex: none; }
.sp-move { margin: 8px 0 0 54px; font-size: 12.5px; padding: 6px 12px; }
.sp-badge { font-size: 11px; font-weight: 700; color: var(--mc-dim); border: 1px solid rgba(255,255,255,.2); border-radius: 999px; padding: 1px 7px; margin-left: 6px; vertical-align: 1px; }

/* Sliders */
.rng { -webkit-appearance: none; appearance: none; width: 100%; height: 18px; background: transparent; cursor: pointer; margin: 0; --p: 0%; touch-action: none; }
.rng::-webkit-slider-runnable-track { height: 4px; border-radius: 4px; background: linear-gradient(90deg, var(--mc-text) var(--p), rgba(255,255,255,.22) var(--p)); }
.rng::-moz-range-track { height: 4px; border-radius: 4px; background: rgba(255,255,255,.22); }
.rng::-moz-range-progress { height: 4px; border-radius: 4px; background: var(--mc-text); }
.rng::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; border-radius: 50%; background: #fff; margin-top: -4px; opacity: 0; transition: opacity .15s; box-shadow: 0 2px 6px rgba(0,0,0,.4); }
.rng::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; background: #fff; border: 0; opacity: 0; }
.rng:hover::-webkit-slider-thumb, .rng:active::-webkit-slider-thumb, .touch .rng::-webkit-slider-thumb { opacity: 1; }
.rng:hover::-moz-range-thumb, .touch .rng::-moz-range-thumb { opacity: 1; }
.rng:hover::-webkit-slider-runnable-track { background: linear-gradient(90deg, var(--mc-accent) var(--p), rgba(255,255,255,.22) var(--p)); }
.rng:disabled { cursor: default; opacity: .5; }

/* Bottom now-playing bar */
.bar { grid-area: bar; height: var(--mc-bar-h); display: grid; grid-template-columns: minmax(180px, 1fr) minmax(300px, 1.6fr) minmax(250px, 1fr); align-items: center; gap: 16px; padding: 0 10px; }
.np-left { display: flex; align-items: center; gap: 14px; min-width: 0; }
.np-left .art { width: 60px; height: 60px; border-radius: 6px; flex: none; box-shadow: 0 4px 14px rgba(0,0,0,.4); }
.np-tx { min-width: 0; }
.np-t { font-size: 14.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; text-align: left; max-width: 100%; }
.np-a { font-size: 12.5px; color: var(--mc-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; text-align: left; max-width: 100%; margin-top: 3px; }
button.np-t:hover, button.np-a:hover { text-decoration: underline; color: var(--mc-text); }
.heart { color: var(--mc-dim); width: 34px; height: 34px; display: grid; place-items: center; flex: none; border-radius: 50%; transition: transform .12s, color .15s; }
.heart:hover { color: var(--mc-text); }
.heart.on { color: var(--mc-accent); }
.heart:active { transform: scale(.85); }
.heart .ic { width: 20px; height: 20px; }
.np-mid { display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 0; }
.ctrls { display: flex; align-items: center; gap: 18px; }
.cb { color: var(--mc-dim); width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%; position: relative; transition: color .15s, transform .1s; }
.cb:hover { color: var(--mc-text); }
.cb:active { transform: scale(.9); }
.cb.on { color: var(--mc-accent); }
.cb.on::after { content: ""; position: absolute; bottom: 0; width: 4px; height: 4px; border-radius: 50%; background: currentColor; }
.cb .ic { width: 22px; height: 22px; }
.cb:disabled { opacity: .35; cursor: default; }
.pp { width: 38px; height: 38px; border-radius: 50%; background: var(--mc-text); color: #000; display: grid; place-items: center; transition: transform .1s; }
.pp:hover { transform: scale(1.06); }
.pp:active { transform: scale(.94); }
.pp .ic { width: 24px; height: 24px; }
.seek { display: flex; align-items: center; gap: 10px; width: 100%; max-width: 640px; }
.seek .tm { font-size: 11.5px; color: var(--mc-dim); font-variant-numeric: tabular-nums; min-width: 38px; text-align: center; }
.live { font-size: 10.5px; font-weight: 800; letter-spacing: .08em; color: #fff; background: #e11d48; padding: 2px 7px; border-radius: 4px; }
.np-right { display: flex; align-items: center; justify-content: flex-end; gap: 6px; min-width: 0; }
.np-right .cb.act-p { color: var(--mc-accent); }
.vol { display: flex; align-items: center; gap: 4px; width: 140px; flex: none; }
.spk-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px; font-size: 12.5px; font-weight: 700; color: var(--mc-accent);
  background: rgba(var(--mc-accent-rgb), .12); max-width: 210px; min-width: 0; }
.spk-btn span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.spk-btn .ic { width: 18px; height: 18px; }
.spk-btn:hover { background: rgba(var(--mc-accent-rgb), .22); }
.idle-np .np-mid { opacity: .55; }
.medium .bar { grid-template-columns: minmax(150px, 1fr) minmax(260px, 1.5fr) auto; }
.medium .vol { width: 96px; }
.medium .spk-btn span { display: none; }

/* Narrow: mini player + tabs */
.mini { grid-area: mini; display: none; position: relative; margin: 0 8px 6px; border-radius: 10px; background: var(--mc-np-bg, #2a2a2f); overflow: hidden;
  transition: background .5s; box-shadow: 0 6px 20px rgba(0,0,0,.4); }
.narrow .mini { display: block; }
.mini-in { display: flex; align-items: center; gap: 10px; padding: 7px 8px; }
.mini .art { width: 42px; height: 42px; border-radius: 6px; flex: none; }
.mini-open { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; text-align: left; }
.mini .np-t { font-size: 13.5px; }
.mini .np-a { font-size: 12px; color: rgba(255,255,255,.7); }
.mini .np-a .ic { width: 14px; height: 14px; display: inline-block; vertical-align: -2px; color: var(--mc-accent); }
.mini .cb { color: var(--mc-text); width: 40px; height: 40px; }
.mini .cb .ic { width: 26px; height: 26px; }
.mini-prog { position: absolute; left: 8px; right: 8px; bottom: 0; height: 2px; background: rgba(255,255,255,.2); border-radius: 2px; overflow: hidden; }
.mini-prog i { display: block; height: 100%; width: 0; background: #fff; transition: width 1s linear; }
.tabs { grid-area: tabs; display: none; background: linear-gradient(180deg, rgba(15,15,16,.6), #0f0f10 40%); padding: 4px 4px max(6px, env(safe-area-inset-bottom, 0px)); }
.narrow .tabs { display: grid; grid-template-columns: repeat(4, 1fr); }
.tab { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 6px 0 4px; color: var(--mc-dim); font-size: 11px; font-weight: 600; }
.tab.on { color: var(--mc-text); }
.tab .ic { width: 25px; height: 25px; }

/* Sheets (narrow) */
.sheet { position: absolute; inset: 0; z-index: 40; background: var(--mc-bg); display: flex; flex-direction: column; transform: translateY(100%); visibility: hidden;
  transition: transform .32s cubic-bezier(.2,.8,.2,1), visibility 0s linear .32s; overflow: hidden; }
.sheet.open { transform: none; visibility: visible; transition: transform .32s cubic-bezier(.2,.8,.2,1), visibility 0s; }
.sheet.dragging { transition: none; }
.sheet-bg { position: absolute; inset: -40px; background-size: cover; background-position: center; filter: blur(48px) saturate(1.3) brightness(.55); transform: scale(1.15); opacity: .9; pointer-events: none; }
.sheet-bg::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.15), rgba(0,0,0,.65)); }
.sheet-h { position: relative; display: flex; align-items: center; gap: 8px; padding: max(12px, env(safe-area-inset-top, 0px)) 12px 8px; touch-action: none; }
.sheet-h .ttl { flex: 1; text-align: center; font-size: 13px; font-weight: 700; color: rgba(255,255,255,.85); }
.sheet-h .ttl small { display: block; font-size: 11px; font-weight: 600; color: rgba(255,255,255,.6); letter-spacing: .06em; text-transform: uppercase; }
.grab { position: absolute; top: 5px; left: 50%; width: 38px; height: 4px; margin-left: -19px; border-radius: 4px; background: rgba(255,255,255,.35); }
.sheet-body { position: relative; flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 14px 18px; }
.fp { display: flex; flex-direction: column; gap: 18px; padding: 8px 10px 20px; min-height: 100%; justify-content: space-evenly; max-width: 520px; margin: 0 auto; }
.fp-art { width: 100%; aspect-ratio: 1; max-width: min(100%, calc(var(--mc-height, 800px) - 420px)); margin: 0 auto; border-radius: 10px; box-shadow: 0 20px 50px rgba(0,0,0,.6); touch-action: pan-y; }
.fp-art.art { display: block; }
.fp-art.paused { transform: scale(.94); transition: transform .35s; }
.fp-art.playing { transform: none; transition: transform .35s; }
.fp-row { display: flex; align-items: center; gap: 12px; }
.fp-tx { flex: 1; min-width: 0; }
.fp-t { font-size: 22px; font-weight: 800; letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; text-align: left; max-width: 100%; }
.fp-a { font-size: 15px; color: rgba(255,255,255,.72); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; text-align: left; margin-top: 4px; max-width: 100%; }
.fp .heart { width: 44px; height: 44px; }
.fp .heart .ic { width: 28px; height: 28px; }
.fp-seek .rng { height: 22px; }
.fp-times { display: flex; justify-content: space-between; font-size: 12px; color: rgba(255,255,255,.7); font-variant-numeric: tabular-nums; margin-top: 2px; }
.fp-ctrls { display: flex; align-items: center; justify-content: space-between; }
.fp-ctrls .cb { color: #fff; width: 48px; height: 48px; }
.fp-ctrls .cb .ic { width: 30px; height: 30px; }
.fp-ctrls .cb.sidebtn .ic { width: 25px; height: 25px; }
.fp-ctrls .cb.on { color: var(--mc-accent); }
.fp-ctrls .pp { width: 70px; height: 70px; background: #fff; }
.fp-ctrls .pp .ic { width: 38px; height: 38px; }
.fp-vol { display: flex; align-items: center; gap: 10px; color: rgba(255,255,255,.75); }
.fp-vol .ic { width: 20px; height: 20px; }
.fp-foot { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.fp-foot .spk-btn { max-width: 70%; }

/* Menus, toasts */
.layer { position: absolute; inset: 0; z-index: 60; display: none; }
.layer.open { display: block; }
.layer .scrim { position: absolute; inset: 0; background: rgba(0,0,0,.001); }
.narrow .layer .scrim, .layer.sheetlike .scrim { background: rgba(0,0,0,.55); animation: fade .2s both; }
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
.menu { position: absolute; min-width: 230px; max-width: 300px; background: #2a2a2f; border-radius: 10px; padding: 5px; box-shadow: 0 16px 40px rgba(0,0,0,.6); animation: pop .14s ease both; }
@keyframes pop { from { opacity: 0; transform: scale(.96); } to { opacity: 1; transform: none; } }
.layer.sheetlike .menu { left: 0 !important; right: 0; top: auto !important; bottom: 0; max-width: none; border-radius: 16px 16px 0 0; padding: 10px 8px max(14px, env(safe-area-inset-bottom, 0px)); animation: up .24s cubic-bezier(.2,.8,.2,1) both; }
@keyframes up { from { transform: translateY(100%); } to { transform: none; } }
.menu-head { display: flex; align-items: center; gap: 12px; padding: 8px 10px 12px; border-bottom: 1px solid var(--mc-line); margin-bottom: 6px; }
.menu-head .art { width: 48px; height: 48px; border-radius: 6px; flex: none; }
.menu-head .t { font-weight: 700; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.menu-head .s { color: var(--mc-dim); font-size: 13px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mi { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 12px; border-radius: 6px; font-size: 14px; font-weight: 500; text-align: left; }
.layer.sheetlike .mi { padding: 13px 12px; font-size: 15px; }
.mi:hover { background: rgba(255,255,255,.08); }
.mi .ic { width: 20px; height: 20px; color: var(--mc-dim); }
.mi.sep { border-top: 1px solid var(--mc-line); border-radius: 0 0 6px 6px; margin-top: 4px; }
.toast { position: absolute; left: 50%; bottom: calc(var(--mc-bar-h) + 24px); transform: translate(-50%, 20px); background: #f4f4f5; color: #111; padding: 10px 18px; border-radius: 8px;
  font-size: 14px; font-weight: 600; opacity: 0; pointer-events: none; transition: opacity .2s, transform .2s; z-index: 80; max-width: calc(100% - 32px); box-shadow: 0 10px 30px rgba(0,0,0,.4); text-align: center; }
.toast.err { background: #fecaca; color: #450a0a; }
.toast.show { opacity: 1; transform: translate(-50%, 0); }
.narrow .toast { bottom: 140px; }
.hidden { display: none !important; }
@media (prefers-reduced-motion: reduce) { .view, .menu, .sheet, .panel { animation: none !important; transition: none !important; } .eq i { animation: none; height: 60%; } }
`;
