// scroll-stack-card: stacks cards vertically and scrolls the content when it does not fit the height it is given (e.g. a
// column in ha-home-desktop-layout-card-front). On mobile, where the height is "auto", the stack simply grows.
//
//   type: custom:scroll-stack-card
//   gap: 12px                 # space between cards
//   padding: 0 6px 24px 0     # inner padding (e.g. room for a navbar on mobile)
//   mobile_padding: 0 10px    # padding below mobile_breakpoint (default 1100px)
//   mobile_breakpoint: 1100
//   scroll: false             # no own scrolling (the page scrolls instead)
//   css:                      # extra CSS put into a card's shadow root; the key is the card's element name, and cards
//     ha-toggle-grid-card: |  # inside e.g. grid or stack cards are found too
//       .tile-name{font-size:15px}
//   cards: [...]
const SCROLL_STACK_VERSION = "7";

class ScrollStackCard extends HTMLElement {
  setConfig(config) {
    if (!Array.isArray(config?.cards)) throw new Error("scroll-stack-card kræver cards");
    this._config = config;
    this._cards = [];
    this._observers?.forEach((o) => o.disconnect());
    this._observers = [];
    this._styled = new WeakSet();
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const gap = config.gap || "12px";
    const padding = config.padding || "0 6px 24px 0";
    const scroll = config.scroll !== false;
    const bp = Number(config.mobile_breakpoint) || 1100;
    // Below the breakpoint the whole page scrolls; the stack must never catch scrolling there.
    const mobile = `@media (max-width:${bp}px){.wrap{height:auto;max-height:none;overflow:visible${config.mobile_padding ? `;padding:${config.mobile_padding}` : ""}}}`;
    this.shadowRoot.innerHTML = `<style>
      :host{display:block;height:100%;min-height:0}
      .wrap{box-sizing:border-box;height:100%;max-height:100%;overflow-y:${scroll ? "auto" : "visible"};overflow-x:${scroll ? "hidden" : "visible"};
        -webkit-overflow-scrolling:touch;display:flex;flex-direction:column;gap:${gap};padding:${padding};
        scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--secondary-text-color,#888) 45%,transparent) transparent}
      .wrap>*{flex:0 0 auto;min-width:0;height:auto;min-height:0}
      ${mobile}
    </style><div class="wrap"></div>`;
    this._gen = (this._gen || 0) + 1;
    this._build(this._gen);
  }

  async _build(gen) {
    const helpers = await window.loadCardHelpers();
    if (gen !== this._gen) return;
    this._helpers = helpers;
    // Cards such as the chart cards need hass before their first update; wait for it.
    if (!this._hass) { this._pending = gen; return; }
    this._mount();
  }

  _mount() {
    this._pending = null;
    const wrap = this.shadowRoot.querySelector(".wrap");
    this._cards = this._config.cards.map((cfg) => {
      const el = this._create(cfg);
      wrap.appendChild(el);
      return el;
    });
    [0, 400, 1500, 4000].forEach((ms) => setTimeout(() => this._scan(), ms));
  }

  // Finds cards with extra CSS anywhere below the stack, also inside other cards.
  _scan() {
    if (!this._config?.css) return;
    this._lastScan = Date.now();
    const visit = (root) => {
      root.querySelectorAll("*").forEach((el) => {
        if (this._config.css[el.localName] && !this._styled.has(el)) this._style(el);
        if (el.shadowRoot) visit(el.shadowRoot);
      });
    };
    visit(this.shadowRoot);
  }

  _create(cfg) {
    const el = this._helpers.createCardElement(cfg);
    if (this._hass) el.hass = this._hass;
    // A card that was not registered yet asks to be rebuilt.
    el.addEventListener("ll-rebuild", (ev) => {
      ev.stopPropagation();
      const fresh = this._create(cfg);
      el.replaceWith(fresh);
      this._cards = this._cards.map((c) => (c === el ? fresh : c));
    }, { once: true });
    this._style(el);
    return el;
  }

  _style(el) {
    const css = this._config.css?.[el.localName];
    if (!css || this._styled.has(el)) return;
    this._styled.add(el);
    let tries = 0;
    const apply = () => {
      const root = el.shadowRoot;
      if (!root) { if (tries++ < 120) requestAnimationFrame(apply); return; }
      const ensure = () => {
        if ([...root.children].some((c) => c.dataset?.ssc)) return;
        const s = document.createElement("style");
        s.dataset.ssc = "1";
        s.textContent = css;
        root.appendChild(s);
      };
      ensure();
      // Some cards rewrite their whole shadow root; put the style back.
      const obs = new MutationObserver(ensure);
      obs.observe(root, { childList: true });
      this._observers.push(obs);
    };
    apply();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._pending && this._pending === this._gen && this._helpers) this._mount();
    this._cards.forEach((el) => { el.hass = hass; });
    if (this._config?.css && Date.now() - (this._lastScan || 0) > 5000) this._scan();
  }

  getCardSize() { return 12; }
}
if (!customElements.get("scroll-stack-card")) customElements.define("scroll-stack-card", ScrollStackCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "scroll-stack-card"))
  window.customCards.push({ type: "scroll-stack-card", name: "Scroll stack", description: `Lodret stak der kan scrolles (v${SCROLL_STACK_VERSION})` });
