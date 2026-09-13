class LockedMapCard extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    this._build();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._card) this._card.hass = hass;
  }

  getCardSize() {
    return this._card?.getCardSize?.() ?? 3;
  }

  async _build() {
    const helpers = await window.loadCardHelpers();
    const mapConfig = { ...this._config, type: "map" };
    delete mapConfig.lock_pan;
    this._card = helpers.createCardElement(mapConfig);
    if (this._hass) this._card.hass = this._hass;
    this.replaceChildren(this._card);
    this._installLock();
  }

  _installLock() {
    let attempts = 0;
    const findMap = () => {
      const walk = (root) => {
        if (!root) return null;
        const direct = root.querySelector?.("ha-map");
        if (direct) return direct;
        for (const node of root.querySelectorAll?.("*") ?? []) {
          const found = walk(node.shadowRoot);
          if (found) return found;
        }
        return null;
      };

      const haMap = walk(this._card?.shadowRoot ?? this._card);
      const root = haMap?.shadowRoot;
      if (!root) {
        if (attempts++ < 100) setTimeout(findMap, 100);
        return;
      }

      const surface = root.querySelector(".leaflet-container");
      if (surface) {
        surface.style.cursor = "default";
        surface.style.touchAction = "pan-y";
      }

      const isControl = (event) => event.composedPath().some((node) =>
        node?.classList?.contains("leaflet-control") ||
        node?.closest?.(".leaflet-control")
      );
      const blockSurface = (event) => {
        if (isControl(event)) return;
        event.stopImmediatePropagation();
      };
      const blockWheel = (event) => {
        if (isControl(event)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      };

      for (const type of ["pointerdown", "mousedown", "touchstart", "dblclick"]) {
        root.addEventListener(type, blockSurface, { capture: true, passive: false });
      }
      root.addEventListener("wheel", blockWheel, { capture: true, passive: false });
    };
    findMap();
  }
}

if (!customElements.get("locked-map-card")) {
  customElements.define("locked-map-card", LockedMapCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "locked-map-card",
    name: "Locked Map Card",
    description: "Home Assistant map with fixed position and working zoom controls.",
  });
}
