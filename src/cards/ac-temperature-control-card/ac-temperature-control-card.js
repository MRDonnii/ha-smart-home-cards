class AcTemperatureControlCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = null;
    this._backendValue = null;
    this._optimisticValue = null;
    this._dirty = false;
    this._repeatDelay = null;
    this._repeatTimer = null;
    this._confirmTimer = null;
    this._activeButton = null;

    this.shadowRoot.addEventListener("pointerdown", (event) => {
      const button = event.composedPath().find((item) => item?.dataset?.direction);
      if (!button || button.disabled) return;
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      this._startChange(Number(button.dataset.direction), button);
    });
    for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
      this.shadowRoot.addEventListener(eventName, () => this._finishChange());
    }
    this.shadowRoot.addEventListener("keydown", (event) => {
      const button = event.composedPath().find((item) => item?.dataset?.direction);
      if (!button || button.disabled || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      if (!event.repeat) this._activeButton = button;
      this._change(Number(button.dataset.direction));
    });
    this.shadowRoot.addEventListener("keyup", (event) => {
      if (["Enter", " "].includes(event.key)) this._finishChange();
    });
    this.shadowRoot.addEventListener("click", (event) => {
      const value = event.composedPath().find((item) => item?.dataset?.action === "more-info");
      if (value) this._moreInfo();
    });
  }

  setConfig(config) {
    if (!config?.entity) throw new Error("ac-temperature-control-card requires an entity");
    this._config = { entity: config.entity };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const state = hass?.states?.[this._config?.entity];
    const backend = Number(state?.attributes?.temperature);
    this._backendValue = Number.isFinite(backend) ? backend : null;
    if (!this._dirty && this._optimisticValue !== null && this._same(this._backendValue, this._optimisticValue)) {
      this._clearOptimistic();
    }
    this._render();
  }

  getCardSize() { return 1; }

  disconnectedCallback() {
    this._stopRepeat();
    if (this._confirmTimer) window.clearTimeout(this._confirmTimer);
  }

  _details() {
    const state = this._hass?.states?.[this._config?.entity];
    const attributes = state?.attributes || {};
    const step = Number(attributes.target_temp_step) || 1;
    const minimum = Number.isFinite(Number(attributes.min_temp)) ? Number(attributes.min_temp) : 16;
    const maximum = Number.isFinite(Number(attributes.max_temp)) ? Number(attributes.max_temp) : 30;
    return {
      available: Boolean(state) && !["unknown", "unavailable"].includes(state.state),
      maximum,
      minimum,
      step,
      value: this._optimisticValue ?? this._backendValue,
    };
  }

  _same(left, right) {
    return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) < 0.001;
  }

  _round(value, step) {
    const decimals = String(step).includes(".") ? Math.min(3, String(step).split(".")[1].length) : 0;
    return Number(value.toFixed(decimals));
  }

  _startChange(direction, button) {
    if (this._activeButton) return;
    this._activeButton = button;
    this._change(direction);
    this._repeatDelay = window.setTimeout(() => {
      this._repeatTimer = window.setInterval(() => this._change(direction), 120);
    }, 360);
  }

  _change(direction) {
    const details = this._details();
    if (!details.available || !Number.isFinite(details.value)) return;
    const next = this._round(
      Math.min(details.maximum, Math.max(details.minimum, details.value + direction * details.step)),
      details.step,
    );
    if (this._same(next, details.value)) return;
    this._optimisticValue = next;
    this._dirty = true;
    this._render();
  }

  _stopRepeat() {
    if (this._repeatDelay) window.clearTimeout(this._repeatDelay);
    if (this._repeatTimer) window.clearInterval(this._repeatTimer);
    this._repeatDelay = null;
    this._repeatTimer = null;
    this._activeButton = null;
  }

  _finishChange() {
    if (!this._activeButton && !this._dirty) return;
    this._stopRepeat();
    if (this._dirty) this._send();
  }

  async _send() {
    const temperature = this._optimisticValue;
    if (!this._hass || !Number.isFinite(temperature)) return;
    this._dirty = false;
    if (this._confirmTimer) window.clearTimeout(this._confirmTimer);
    this._confirmTimer = window.setTimeout(() => {
      this._clearOptimistic();
      this._render();
    }, 15000);
    try {
      await this._hass.callService("climate", "set_temperature", {
        entity_id: this._config.entity,
        temperature,
      });
    } catch (error) {
      this._clearOptimistic();
      this._render();
      this.dispatchEvent(new CustomEvent("hass-notification", {
        bubbles: true,
        composed: true,
        detail: { message: "Temperaturen kunne ikke sendes til Home Assistant." },
      }));
    }
  }

  _clearOptimistic() {
    this._optimisticValue = null;
    this._dirty = false;
    if (this._confirmTimer) window.clearTimeout(this._confirmTimer);
    this._confirmTimer = null;
  }

  _moreInfo() {
    this.dispatchEvent(new CustomEvent("hass-more-info", {
      bubbles: true,
      composed: true,
      detail: { entityId: this._config.entity },
    }));
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;
    const details = this._details();
    const display = Number.isFinite(details.value) ? `${details.value.toFixed(1)}\u00b0` : "--";
    const atMaximum = details.available && details.value >= details.maximum;
    const atMinimum = details.available && details.value <= details.minimum;
    const existingValue = this.shadowRoot.querySelector(".value");
    if (existingValue) {
      existingValue.textContent = display;
      existingValue.classList.toggle("pending", this._optimisticValue !== null);
      const increase = this.shadowRoot.querySelector('[data-direction="1"]');
      const decrease = this.shadowRoot.querySelector('[data-direction="-1"]');
      if (increase) increase.disabled = !details.available || atMaximum;
      if (decrease) decrease.disabled = !details.available || atMinimum;
      return;
    }
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block}
        .controls{display:flex;flex-direction:column;gap:9px;padding:6px;border-radius:20px;background:linear-gradient(180deg,color-mix(in srgb,var(--surface) 82%,white 4%) 0%,color-mix(in srgb,var(--surface) 78%,black 5%) 100%);border:1px solid color-mix(in srgb,var(--primary-text-color) 12%,transparent);box-shadow:inset 0 1px 0 color-mix(in srgb,white 10%,transparent),0 10px 22px rgba(0,0,0,.13);backdrop-filter:blur(10px)}
        button,.value{box-sizing:border-box;width:50px;height:44px;border-radius:18px;display:flex;align-items:center;justify-content:center;padding:0;margin:0;min-width:0;line-height:1;color:var(--primary-text-color);-webkit-tap-highlight-color:transparent}
        button{border:1px solid color-mix(in srgb,var(--primary-text-color) 12%,transparent);background:color-mix(in srgb,var(--primary-text-color) 7%,transparent);box-shadow:inset 0 1px 0 color-mix(in srgb,white 9%,transparent);touch-action:none;cursor:pointer}
        button:active{transform:scale(.94);background:color-mix(in srgb,var(--primary-text-color) 15%,transparent)}
        button:disabled{opacity:.35;cursor:default}
        button ha-icon{width:20px;height:20px;--mdc-icon-size:20px}
        .value{position:relative;border:1px solid color-mix(in srgb,var(--state-info-icon) 34%,transparent);background:linear-gradient(180deg,color-mix(in srgb,var(--state-info-icon) 22%,transparent),color-mix(in srgb,var(--state-info-icon) 12%,transparent));box-shadow:inset 0 1px 0 color-mix(in srgb,white 12%,transparent),0 5px 12px rgba(0,0,0,.10);font-size:13px;font-weight:850;white-space:nowrap;cursor:pointer}
        .value.pending::after{content:"";position:absolute;right:4px;top:4px;width:5px;height:5px;border-radius:50%;background:var(--state-info-icon);box-shadow:0 0 6px var(--state-info-icon)}
      </style>
      <div class="controls">
        <button data-direction="1" aria-label="H\u00e6v temperatur" ${!details.available || atMaximum ? "disabled" : ""}><ha-icon icon="mdi:chevron-up"></ha-icon></button>
        <div class="value ${this._optimisticValue !== null ? "pending" : ""}" data-action="more-info" role="button" tabindex="0">${display}</div>
        <button data-direction="-1" aria-label="S\u00e6nk temperatur" ${!details.available || atMinimum ? "disabled" : ""}><ha-icon icon="mdi:chevron-down"></ha-icon></button>
      </div>`;
  }
}

if (!customElements.get("ac-temperature-control-card")) {
  customElements.define("ac-temperature-control-card", AcTemperatureControlCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "ac-temperature-control-card")) {
  window.customCards.push({
    type: "ac-temperature-control-card",
    name: "AC Temperature Control Card",
    description: "Optimistic AC temperature control that sends on release.",
    preview: false,
  });
}
