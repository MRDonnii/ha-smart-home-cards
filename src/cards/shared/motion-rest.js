// Motion rest: the cards' endless animations (drifting tile icons, breathing glows, flowing lines) run while someone uses
// the screen and stand still when nobody has touched it for a while. A running animation makes the browser draw the
// whole page on every frame; measured on a wall display, a view with only a few small endless animations kept the GPU
// at about 30 % that dropped to 0 % with them still. Alerts (alarm, error, warning, critical, danger) keep moving.
//
// Imported first in src/index.js: every element class the bundle defines between that import and motionRestEnd() is
// registered, so the cards need no changes. Opt out per device with localStorage "shc-motion" = "always".

const REST_AFTER_MS = 30000;
const RESCAN_MS = 3000;
const KEEP = /alarm|alert|error|warn|critical|danger|triggered|siren/i;
const ACTIVITY = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"];

const hosts = new Set();
const paused = new Set();
let resting = false;
let restTimer = 0;
let scanTimer = 0;
let originalDefine = null;

function alwaysMove() {
  try {
    return localStorage.getItem("shc-motion") === "always";
  } catch (_) {
    return false;
  }
}

function endless(animation) {
  const timing = animation.effect?.getTiming?.();
  return timing && timing.iterations === Infinity;
}

// While resting, each card's shadow root adopts a style sheet that pauses every animation at once, so elements a card
// renders again (innerHTML or not, adopted sheets survive it) start out paused too. Alert animations are then played
// explicitly: play() overrides the paused style.
let restSheet = null;
try {
  restSheet = new CSSStyleSheet();
  restSheet.replaceSync("*,*::before,*::after{animation-play-state:paused!important}");
} catch (_) {
  restSheet = null;
}

function pauseIn(host) {
  const root = host.shadowRoot;
  const adopted = Boolean(root && restSheet && root.adoptedStyleSheets);
  if (adopted && !root.adoptedStyleSheets.includes(restSheet)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, restSheet];
  const list = root?.getAnimations ? root.getAnimations() : host.getAnimations({ subtree: true });
  list.forEach((animation) => {
    if (!endless(animation)) return;
    if (KEEP.test(animation.animationName || animation.id || "")) {
      if (animation.playState === "paused") animation.play();
      return;
    }
    // Without an adopted sheet (light-DOM cards, old browsers) animations are paused one at a time.
    if (!adopted && animation.playState === "running") { animation.pause(); paused.add(animation); }
  });
}

function wakeIn(host) {
  const root = host.shadowRoot;
  if (root?.adoptedStyleSheets?.includes(restSheet)) root.adoptedStyleSheets = root.adoptedStyleSheets.filter((sheet) => sheet !== restSheet);
}

function rest() {
  if (resting || alwaysMove()) return;
  resting = true;
  hosts.forEach((host) => { if (host.isConnected) pauseIn(host); });
  // Cards that appear meanwhile, and new alert animations.
  scanTimer = window.setInterval(() => hosts.forEach((host) => { if (host.isConnected) pauseIn(host); }), RESCAN_MS);
}

function wake() {
  window.clearTimeout(restTimer);
  restTimer = window.setTimeout(rest, REST_AFTER_MS);
  if (!resting) return;
  resting = false;
  window.clearInterval(scanTimer);
  hosts.forEach(wakeIn);
  paused.forEach((animation) => { try { animation.play(); } catch (_) { /* gone */ } });
  paused.clear();
}

let lastMove = 0;
function onActivity(event) {
  // Pointer moves come many times a second; one wake per second is enough.
  if (event.type === "pointermove") {
    const now = Date.now();
    if (now - lastMove < 1000 && !resting) return;
    lastMove = now;
  }
  wake();
}

ACTIVITY.forEach((type) => window.addEventListener(type, onActivity, { capture: true, passive: true }));
document.addEventListener("visibilitychange", () => { if (!document.hidden) wake(); });
restTimer = window.setTimeout(rest, REST_AFTER_MS);

function track(cls) {
  const proto = cls?.prototype;
  if (!proto || Object.prototype.hasOwnProperty.call(proto, "__shcMotionRest")) return;
  Object.defineProperty(proto, "__shcMotionRest", { value: true });
  const connected = proto.connectedCallback;
  const disconnected = proto.disconnectedCallback;
  proto.connectedCallback = function (...args) {
    hosts.add(this);
    const result = connected?.apply(this, args);
    // A card that appears while the screen rests starts resting after its first render.
    if (resting) window.setTimeout(() => { if (resting && this.isConnected) pauseIn(this); }, 0);
    return result;
  };
  proto.disconnectedCallback = function (...args) {
    hosts.delete(this);
    wakeIn(this);
    return disconnected?.apply(this, args);
  };
}

// Register the classes the bundle defines from here on.
if (window.customElements && !window.customElements.__shcMotionRest) {
  originalDefine = window.customElements.define;
  window.customElements.define = function (name, cls, options) {
    track(cls);
    return originalDefine.call(this, name, cls, options);
  };
  window.customElements.__shcMotionRest = true;
}

// Called at the end of src/index.js: element classes defined later (Home Assistant's own) are left alone.
export function motionRestEnd() {
  if (originalDefine) window.customElements.define = originalDefine;
  originalDefine = null;
}

window.shcMotion = Object.freeze({ wake, rest, get resting() { return resting; }, get cards() { return hosts.size; } });
