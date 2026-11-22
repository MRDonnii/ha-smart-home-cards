// A permissive, dependency-free stand-in for the browser DOM, so card modules can be imported and rendered in Node
// with a mock `hass` (render smoke tests). It is not a real DOM: `innerHTML` is kept as a string, and
// `querySelector()` returns a recording stub per selector (assignments such as `.textContent = …` can be read back via
// `root.queried(selector)`). Anything else answers with a harmless stub, so render code runs through without a browser.
//
//   import { installFakeDom, mockHass, renderCard } from "./helpers/fake-dom.mjs";
//   const dom = installFakeDom();               // before importing the card module
//   await import("../src/cards/<slug>/<file>.js");
//   const card = await renderCard("my-card", { type: "custom:my-card", entity: "sensor.example" }, mockHass({ … }));
//   assert.match(card.shadowRoot.innerHTML, /Example/);

/** A callable proxy that accepts any property access, call or assignment. */
export function stub(label = "stub") {
  const store = new Map();
  const target = function () {};
  return new Proxy(target, {
    get(_t, prop) {
      if (store.has(prop)) return store.get(prop);
      if (prop === Symbol.iterator) return function* () {};
      if (prop === Symbol.toPrimitive) return (hint) => (hint === "number" ? 0 : "");
      if (prop === Symbol.toStringTag) return label;
      if (prop === "then") return undefined;
      if (prop === "length" || prop === "childElementCount") return 0;
      if (prop === "querySelectorAll" || prop === "getElementsByTagName" || prop === "getElementsByClassName" || prop === "getAnimations" || prop === "getClientRects") return () => [];
      if (prop === "children" || prop === "childNodes" || prop === "dataset" || prop === "style") {
        const value = prop === "style" ? styleStub() : prop === "dataset" ? {} : [];
        store.set(prop, value);
        return value;
      }
      if (prop === "getBoundingClientRect") return () => ({ left: 0, top: 0, right: 320, bottom: 200, width: 320, height: 200, x: 0, y: 0 });
      if (prop === "getContext") return () => stub("context");
      if (prop === "textContent" || prop === "innerHTML" || prop === "value") return "";
      if (prop === "isConnected") return true;
      if (prop === "contains" || prop === "matches") return () => false;
      return stub(String(prop));
    },
    set(_t, prop, value) { store.set(prop, value); return true; },
    apply() { return stub("result"); },
    construct() { return stub("instance"); },
  });
}

function styleStub() {
  const props = {};
  return new Proxy(props, {
    get(t, prop) {
      if (prop === "setProperty") return (k, v) => { t[k] = String(v); };
      if (prop === "removeProperty") return (k) => { delete t[k]; };
      if (prop === "getPropertyValue") return (k) => t[k] ?? "";
      return t[prop] ?? "";
    },
    set(t, prop, value) { t[prop] = value; return true; },
  });
}

/** A shadow root / container whose innerHTML is a plain string and whose queries return recording stubs. */
export class FakeRoot {
  constructor(host) {
    this.host = host;
    this._html = "";
    this._queried = new Map();
    this._listeners = [];
    this.appended = [];
    this.adoptedStyleSheets = [];
  }
  get innerHTML() { return this._html; }
  set innerHTML(value) { this._html = String(value); this._queried.clear(); }
  get textContent() { return this._html.replace(/<[^>]*>/g, ""); }
  querySelector(selector) {
    if (!this._queried.has(selector)) this._queried.set(selector, stub(selector));
    return this._queried.get(selector);
  }
  querySelectorAll() { return []; }
  getElementById(id) { return this.querySelector(`#${id}`); }
  queried(selector) { return this._queried.get(selector); }
  appendChild(node) { this.appended.push(node); return node; }
  append(...nodes) { this.appended.push(...nodes); }
  prepend(...nodes) { this.appended.unshift(...nodes); }
  replaceChildren(...nodes) { this.appended = [...nodes]; this._html = ""; }
  removeChild(node) { this.appended = this.appended.filter((n) => n !== node); return node; }
  addEventListener(type, fn) { this._listeners.push([type, fn]); }
  removeEventListener() {}
  contains() { return false; }
  get firstChild() { return this.appended[0] ?? null; }
  get firstElementChild() { return this.appended[0] ?? null; }
  get children() { return this.appended; }
  get childNodes() { return this.appended; }
  get activeElement() { return null; }
  getAnimations() { return []; }
}

/** Installs the fake globals (idempotent). Returns the element registry and helpers. */
export function installFakeDom({ now } = {}) {
  if (globalThis.__fakeDom) return globalThis.__fakeDom;
  const registry = new Map();
  const whenDefined = new Map();

  class FakeElement {
    constructor() {
      this._attrs = new Map();
      this._listeners = [];
      this.style = styleStub();
      this.dataset = {};
      this.classList = classListStub();
      this.isConnected = false;
      this._root = null;
    }
    attachShadow() { this._root = new FakeRoot(this); this.shadowRoot = this._root; return this._root; }
    get localName() { return this.constructor.__tag || "div"; }
    get tagName() { return this.localName.toUpperCase(); }
    setAttribute(k, v) { this._attrs.set(k, String(v)); }
    getAttribute(k) { return this._attrs.has(k) ? this._attrs.get(k) : null; }
    hasAttribute(k) { return this._attrs.has(k); }
    removeAttribute(k) { this._attrs.delete(k); }
    toggleAttribute(k, force) { const on = force ?? !this._attrs.has(k); if (on) this._attrs.set(k, ""); else this._attrs.delete(k); return on; }
    addEventListener(type, fn) { this._listeners.push([type, fn]); }
    removeEventListener(type, fn) { this._listeners = this._listeners.filter(([t, f]) => t !== type || f !== fn); }
    dispatchEvent(event) { this.lastEvent = event; (this.events ||= []).push(event); for (const [t, f] of this._listeners) if (t === event.type) f.call(this, event); return true; }
    querySelector(selector) { return (this._root || (this._light ||= new FakeRoot(this))).querySelector(selector); }
    querySelectorAll() { return []; }
    appendChild(node) { (this._light ||= new FakeRoot(this)).appendChild(node); return node; }
    append(...nodes) { (this._light ||= new FakeRoot(this)).append(...nodes); }
    remove() { this.isConnected = false; }
    get innerHTML() { return (this._light ||= new FakeRoot(this)).innerHTML; }
    set innerHTML(v) { (this._light ||= new FakeRoot(this)).innerHTML = v; }
    get children() { return this._light?.appended || []; }
    get parentNode() { return null; }
    get parentElement() { return null; }
    getRootNode() { return globalThis.document; }
    closest() { return null; }
    getBoundingClientRect() { return { left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300, x: 0, y: 0 }; }
    get clientWidth() { return 400; }
    get clientHeight() { return 300; }
    get offsetWidth() { return 400; }
    get offsetHeight() { return 300; }
    animate() { return stub("animation"); }
    getAnimations() { return []; }
    focus() {}
    blur() {}
    scrollTo() {}
    scrollIntoView() {}
    requestUpdate() {}
  }

  function classListStub() {
    const set = new Set();
    return {
      add: (...c) => c.forEach((x) => set.add(x)),
      remove: (...c) => c.forEach((x) => set.delete(x)),
      toggle: (c, force) => { const on = force ?? !set.has(c); if (on) set.add(c); else set.delete(c); return on; },
      contains: (c) => set.has(c),
      get value() { return [...set].join(" "); },
      [Symbol.iterator]: () => set[Symbol.iterator](),
    };
  }

  const customElements = {
    define(name, ctor) {
      if (registry.has(name)) throw new Error(`"${name}" has already been defined`);
      ctor.__tag = name;
      registry.set(name, ctor);
      whenDefined.get(name)?.forEach((resolve) => resolve(ctor));
    },
    get(name) { return registry.get(name); },
    whenDefined(name) {
      if (registry.has(name)) return Promise.resolve(registry.get(name));
      return new Promise((resolve) => { if (!whenDefined.has(name)) whenDefined.set(name, []); whenDefined.get(name).push(resolve); });
    },
    upgrade() {},
  };

  const createElement = (tag) => {
    const Ctor = registry.get(tag);
    if (Ctor) return new Ctor();
    const el = new FakeElement();
    el.__plainTag = tag;
    Object.defineProperty(el, "localName", { value: tag, configurable: true });
    return el;
  };
  const document = stub("document");
  document.createElement = createElement;
  document.createElementNS = (_ns, tag) => createElement(tag);
  document.createTextNode = (text) => ({ textContent: String(text) });
  document.createDocumentFragment = () => new FakeRoot(null);
  document.querySelector = () => null;
  document.querySelectorAll = () => [];
  document.getElementById = () => null;
  document.addEventListener = () => {};
  document.removeEventListener = () => {};
  document.hidden = false;
  document.visibilityState = "visible";
  document.body = new FakeElement();
  document.head = new FakeElement();
  document.documentElement = new FakeElement();
  document.fonts = { load: async () => [], ready: Promise.resolve() };

  const windowObj = globalThis;
  windowObj.customCards = windowObj.customCards || [];
  const listeners = [];
  const globals = {
    HTMLElement: FakeElement,
    Element: FakeElement,
    Node: FakeElement,
    customElements,
    document,
    window: globalThis,
    navigator: { userAgent: "node", language: "da-DK", languages: ["da-DK"], vibrate() {}, maxTouchPoints: 0 },
    location: { pathname: "/lovelace/0", search: "", hash: "", href: "http://localhost/lovelace/0", origin: "http://localhost" },
    history: { pushState() {}, replaceState() {}, back() {} },
    localStorage: memoryStorage(),
    sessionStorage: memoryStorage(),
    requestAnimationFrame: (fn) => setTimeout(() => fn(Date.now()), 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    requestIdleCallback: (fn) => setTimeout(() => fn({ timeRemaining: () => 10, didTimeout: false }), 0),
    cancelIdleCallback: (id) => clearTimeout(id),
    matchMedia: (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    getComputedStyle: () => styleStub(),
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } },
    MutationObserver: class { observe() {} disconnect() {} takeRecords() { return []; } },
    CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; this.bubbles = !!init.bubbles; this.composed = !!init.composed; } },
    Event: globalThis.Event ?? class Event { constructor(type) { this.type = type; } },
    CSSStyleSheet: class { replaceSync(text) { this.text = text; } replace(text) { this.text = text; return Promise.resolve(this); } },
    Image: class { set src(v) { this._src = v; } get src() { return this._src; } },
    devicePixelRatio: 1,
    innerWidth: 1280,
    innerHeight: 800,
    scrollY: 0,
    addEventListener: (type, fn) => listeners.push([type, fn]),
    removeEventListener: () => {},
    dispatchEvent: () => true,
    getSelection: () => ({ removeAllRanges() {} }),
  };
  // Node ships some of these (navigator, Event) as getter-only globals, so define instead of assign.
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true, enumerable: true });
  }
  if (now !== undefined) {
    const fixed = typeof now === "number" ? now : Date.parse(now);
    const RealDate = Date;
    globalThis.Date = class extends RealDate {
      constructor(...args) { if (args.length) super(...args); else super(fixed); }
      static now() { return fixed; }
    };
  }
  const dom = { registry, FakeElement, FakeRoot, stub, listeners };
  globalThis.__fakeDom = dom;
  return dom;
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
}

/**
 * A mock `hass`. `states` is an object of entity_id -> state string, or -> { state, attributes }.
 * Service calls are recorded in `hass.calls`; `ws` maps a websocket message type to a result (value or function).
 */
export function mockHass({ states = {}, ws = {}, language = "da", user = { name: "Example User", is_admin: true }, config = {} } = {}) {
  const now = new Date().toISOString();
  const full = {};
  for (const [id, value] of Object.entries(states)) {
    const obj = value !== null && typeof value === "object" ? value : { state: String(value) };
    full[id] = { entity_id: id, state: String(obj.state ?? "unknown"), attributes: { ...(obj.attributes || {}) }, last_changed: obj.last_changed || now, last_updated: obj.last_updated || now, context: { id: "ctx" } };
  }
  const calls = [];
  const hass = {
    states: full,
    entities: {},
    devices: {},
    areas: {},
    language,
    locale: { language, number_format: "language", time_format: "24" },
    user,
    themes: { darkMode: true, theme: "default" },
    selectedTheme: null,
    config: { latitude: 0, longitude: 0, time_zone: "UTC", unit_system: { temperature: "°C", length: "km" }, components: [], ...config },
    connection: { subscribeMessage: async () => () => {}, subscribeEvents: async () => () => {}, sendMessagePromise: async () => ({}) },
    calls,
    callService: async (domain, service, data, target) => { calls.push({ domain, service, data, target }); return {}; },
    callWS: async (msg) => {
      calls.push({ ws: msg.type, msg });
      const handler = ws[msg.type];
      if (typeof handler === "function") return handler(msg);
      if (handler !== undefined) return handler;
      return msg.type === "recorder/statistics_during_period" || msg.type === "history/history_during_period" ? {} : [];
    },
    callApi: async (method, path) => { calls.push({ api: path, method }); return []; },
    fetchWithAuth: async () => ({ ok: true, json: async () => ({}), text: async () => "" }),
    hassUrl: (path = "") => `http://localhost${path}`,
    formatEntityState: (stateObj) => `${stateObj?.state ?? ""}${stateObj?.attributes?.unit_of_measurement ? ` ${stateObj.attributes.unit_of_measurement}` : ""}`,
    formatEntityAttributeValue: (stateObj, attr) => String(stateObj?.attributes?.[attr] ?? ""),
    formatEntityAttributeName: (_s, attr) => attr,
    localize: (key) => key,
  };
  return hass;
}

/** Creates the element, applies config and hass, connects it and waits a few ticks for async renders. */
export async function renderCard(tag, config, hass, { ticks = 3 } = {}) {
  const Ctor = globalThis.customElements.get(tag);
  if (!Ctor) throw new Error(`${tag} is not registered`);
  const card = new Ctor();
  card.setConfig?.(config);
  card.isConnected = true;
  card.hass = hass;
  card.connectedCallback?.();
  card.hass = hass;
  for (let i = 0; i < ticks; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  return card;
}

/** Disconnects a card and clears timers it may have left (call at the end of a test file). */
export function disconnect(card) {
  card.isConnected = false;
  card.disconnectedCallback?.();
}
