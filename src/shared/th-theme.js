// TH theme (opt-in): one look across a dashboard's views, in the same style as the th-* cards.
//   1) ha-navbar-card gets an exclusive glass look (gold accent, sheen, lit indicator).
//   2) Standard cards on every view get the same dark glass surface, corners and gold accent as the th-* cards.
// It only changes looks. It is OFF unless the dashboard on screen contains the invisible card `custom:th-theme-card`
// (anywhere, in any view); leaving that dashboard removes the styles again. Was the /local resource th-theme.js
// (v1.1.1), which applied itself to every dashboard.
import { onDashboardTick, findCardConfig, lovelaceOnScreen } from "./dashboard-activation.js";

export const TH_THEME_VERSION = "1.1.1";
export const TH_THEME_TYPE = "custom:th-theme-card";

export const TH_THEME_NAVBAR_CSS = `
:host{--nb-radius:24px;--nb-knapradius:13px;--nb-hoejde:70px;--nb-knaphoejde:54px;--nb-knapbredde:64px;--nb-mellemrum:4px;--nb-ikon:25px;--nb-etiket:10.5px;
  --nb-accent:#e8c37e;--nb-ikonfarve:rgba(244,241,234,.5);--nb-bund:max(16px,calc(env(safe-area-inset-bottom) + 6px));--nb-flade-farve:rgba(12,14,20,.86);--nb-indikator-luft:7px}
.bar{border-left:0!important;padding:0 7px;backdrop-filter:blur(26px) saturate(1.4);-webkit-backdrop-filter:blur(26px) saturate(1.4);overflow:hidden;
  box-shadow:0 30px 60px -20px rgba(0,0,0,.95),0 0 0 1px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.08)!important;animation:vnIn .9s cubic-bezier(.16,1,.3,1) both}
@keyframes vnIn{from{translate:0 28px;opacity:0}}
.bar::before{background:radial-gradient(120% 140% at 50% -40%,rgba(232,195,126,.10),transparent 60%),linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.012)),rgba(12,14,20,.88)!important;opacity:1!important}
.bar::after{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;z-index:2;
  background:linear-gradient(110deg,rgba(255,255,255,.24),rgba(255,255,255,.04) 30%,rgba(232,195,126,.45) 50%,rgba(255,255,255,.04) 70%,rgba(255,255,255,.18));background-size:250% 100%;
  animation:vnSheen 9s ease-in-out infinite;-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
@keyframes vnSheen{0%,100%{background-position:100% 0}50%{background-position:0 0}}
.indikator{background:linear-gradient(180deg,rgba(232,195,126,.26),rgba(232,195,126,.06))!important;
  box-shadow:inset 0 0 0 1px rgba(232,195,126,.42),inset 0 1px 0 rgba(255,255,255,.12),0 8px 24px -8px rgba(232,195,126,.55)}
.indikator::after{content:"";position:absolute;left:50%;bottom:3px;width:18px;height:2px;border-radius:2px;transform:translateX(-50%);background:#f3d79e;box-shadow:0 0 10px #e8c37e}
.rute{transition:color .3s ease,transform .3s cubic-bezier(.2,1.4,.4,1)}
.rute:hover{transform:translateY(-2px);color:rgba(244,241,234,.92)}
.rute.aktiv{color:#f3d79e}
.rute.aktiv .nbikon,.rute.aktiv ha-icon{filter:drop-shadow(0 0 6px rgba(232,195,126,.55))}
.rute.aktiv .ikonboks{animation:vnPop .6s cubic-bezier(.2,1.6,.4,1)}
@keyframes vnPop{40%{transform:translateY(-3px) scale(1.16)}}
.rute:active .ikonboks{transform:scale(.86);transition:transform .1s}
.etiket{font-weight:600;letter-spacing:.06em;opacity:.85}
.rute.aktiv .etiket{opacity:1}
.badge{box-shadow:none!important}.badge:empty:not(.tom),.badge[hidden]{display:none!important}
@media(max-width:520px){:host{--nb-knapbredde:56px;--nb-hoejde:66px}}
`;

export const TH_THEME_VIEW_CSS = `
hui-view,hui-panel-view,hui-sections-view,hui-masonry-view{
  --ha-card-background:rgba(13,15,21,.78)!important;--card-background-color:rgba(13,15,21,.92)!important;
  --ha-card-border-radius:24px!important;--ha-card-border-width:1px!important;--ha-card-border-color:rgba(244,241,234,.09)!important;
  --ha-card-box-shadow:0 26px 50px -36px #000,inset 0 1px 0 rgba(255,255,255,.06)!important;
  --primary-text-color:#f4f1ea!important;--secondary-text-color:rgba(244,241,234,.56)!important;
  --primary-color:#e8c37e!important;--accent-color:#e8c37e!important;--divider-color:rgba(244,241,234,.09)!important;
  --state-icon-color:rgba(244,241,234,.7)!important;--tile-color:#e8c37e!important}
`;

const NAVBAR_STYLE_ID = "th-theme-navbar";
const VIEW_STYLE_ID = "th-theme-view";

/** What the activator card asks for: { navbar, cards } (both default on), or null when there is no activator. */
export function themeOptions(cardConfig) {
  if (!cardConfig) return null;
  return { navbar: cardConfig.navbar !== false, cards: cardConfig.cards !== false };
}

function setStyle(root, id, css, on) {
  if (!root) return;
  const existing = root.getElementById?.(id) || root.querySelector?.(`#${id}`);
  if (on && !existing) {
    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    root.appendChild(style);
  } else if (!on && existing) existing.remove();
}

let state = { navbar: false, cards: false };
let lastRoot = null;
let lastPath = null;
let announced = false;
const navbarObservers = new WeakMap();

function syncNavbar(el, on) {
  const root = el.shadowRoot;
  if (!root) return;
  setStyle(root, NAVBAR_STYLE_ID, TH_THEME_NAVBAR_CSS, on);
  // ha-navbar-card rebuilds its shadow root; put the style back right away (before paint) while the theme is on.
  if (on && !navbarObservers.has(root)) {
    const observer = new MutationObserver(() => { if (state.navbar) setStyle(root, NAVBAR_STYLE_ID, TH_THEME_NAVBAR_CSS, true); });
    observer.observe(root, { childList: true });
    navbarObservers.set(root, observer);
  } else if (!on && navbarObservers.has(root)) {
    navbarObservers.get(root).disconnect();
    navbarObservers.delete(root);
  }
}

function eachNavbar(root, fn, depth = 0) {
  if (!root || depth > 16) return;
  for (const el of root.querySelectorAll("*")) {
    if (el.localName === "ha-navbar-card") fn(el);
    if (el.shadowRoot) eachNavbar(el.shadowRoot, fn, depth + 1);
  }
}

/** Applies the theme to the screen; returns true while any part of it is on (the detector keeps ticking). */
function apply(screen, force = false) {
  const options = themeOptions(screen?.config ? findCardConfig(screen.config, TH_THEME_TYPE) : null) || { navbar: false, cards: false };
  const root = screen?.root || null;
  const path = globalThis.location?.pathname || "";
  const changed = options.navbar !== state.navbar || options.cards !== state.cards || root !== lastRoot || path !== lastPath;
  if (!changed && !force) return state.navbar || state.cards;
  const leftRoot = lastRoot && lastRoot !== root ? lastRoot : null;
  const prev = state;
  if ((options.navbar || options.cards) && !announced) {
    announced = true;
    console.info(`%c TH-THEME %c ${TH_THEME_VERSION} `, "background:#e8c37e;color:#111;font-weight:700", "background:#222;color:#fff");
  }
  state = options;
  lastRoot = root;
  lastPath = path;
  // Styles only exist where the theme was on, so nothing is searched or removed on dashboards without the theme.
  if (leftRoot?.shadowRoot) {
    if (prev.cards) setStyle(leftRoot.shadowRoot, VIEW_STYLE_ID, TH_THEME_VIEW_CSS, false);
    if (prev.navbar) eachNavbar(leftRoot.shadowRoot, (el) => syncNavbar(el, false));
  }
  if (root?.shadowRoot) {
    if (state.cards || prev.cards) setStyle(root.shadowRoot, VIEW_STYLE_ID, TH_THEME_VIEW_CSS, state.cards);
    if (state.navbar || prev.navbar) eachNavbar(root.shadowRoot, (el) => syncNavbar(el, state.navbar));
    // Cards of a newly shown view render a moment later.
    if (state.navbar && changed) [400, 1500, 4000].forEach((ms) => setTimeout(() => apply(lovelaceOnScreen(), true), ms));
  }
  return state.navbar || state.cards;
}

/** Starts the (inert) detector once; called when the bundle loads. */
let started = false;
export function startThemeModule() {
  if (started) return;
  started = true;
  onDashboardTick((screen) => apply(screen));
}
