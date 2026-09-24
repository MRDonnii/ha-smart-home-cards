class CalefaNumberControlCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
    this._backendValue = null;
    this._optimisticValue = null;
    this._pendingUntil = 0;
    this._pendingTimer = null;
    this._lastSignature = "";
    this.shadowRoot.addEventListener("click", (event) => {
      const control = event
        .composedPath()
        .find((element) => element?.dataset?.action);
      if (!control || control.disabled) return;
      if (control.dataset.action === "decrease") this._change(-1);
      if (control.dataset.action === "increase") this._change(1);
      if (control.dataset.action === "more-info") this._moreInfo();
    });
    this.shadowRoot.addEventListener("keydown", (event) => {
      const control = event
        .composedPath()
        .find((element) => element?.dataset?.action);
      if (!control || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      control.click();
    });
  }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("calefa-number-control-card requires an entity");
    }
    this._config = {
      name: config.name || config.entity,
      description: config.description || "",
      icon: config.icon || "mdi:tune-variant",
      accent: config.accent || "var(--dashboard-accent)",
      entity: config.entity,
    };
    this._lastSignature = "";
    this._syncState();
  }

  set hass(hass) {
    this._hass = hass;
    this._syncState();
  }

  getCardSize() {
    return 3;
  }

  _syncState() {
    if (!this._config || !this._hass) return;
    const stateObj = this._hass.states[this._config.entity];
    if (!stateObj) {
      this._backendValue = null;
      this._render(true);
      return;
    }

    const nextBackend = Number(stateObj.state);
    this._backendValue = Number.isFinite(nextBackend) ? nextBackend : null;

    if (this._optimisticValue !== null) {
      if (this._sameValue(this._backendValue, this._optimisticValue)) {
        this._clearPending();
      } else if (Date.now() >= this._pendingUntil) {
        this._clearPending();
        this._notify("Calefa bekræftede ikke ændringen. Værdien er genindlæst.");
      }
    }
    this._render();
  }

  _sameValue(left, right) {
    if (left === null || right === null) return false;
    return Math.abs(left - right) < 0.000001;
  }

  _clearPending() {
    this._optimisticValue = null;
    this._pendingUntil = 0;
    if (this._pendingTimer) window.clearTimeout(this._pendingTimer);
    this._pendingTimer = null;
  }

  _stateDetails() {
    const stateObj = this._hass?.states[this._config.entity];
    const attributes = stateObj?.attributes || {};
    const value = this._optimisticValue ?? this._backendValue;
    const step = Number(attributes.step || 1);
    const minimum = Number.isFinite(Number(attributes.min)) ? Number(attributes.min) : -Infinity;
    const maximum = Number.isFinite(Number(attributes.max)) ? Number(attributes.max) : Infinity;
    return {
      available: value !== null && stateObj?.state !== "unavailable" && stateObj?.state !== "unknown",
      maximum,
      minimum,
      pending: this._optimisticValue !== null,
      step,
      unit: attributes.unit_of_measurement || "",
      value,
    };
  }

  _formatValue(value, step, unit) {
    if (value === null) return "–";
    const stepText = String(step);
    const decimals = stepText.includes(".") ? Math.min(3, stepText.split(".")[1].length) : 0;
    const language = this._hass?.locale?.language || navigator.language || "da-DK";
    const number = new Intl.NumberFormat(language, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
    return unit ? `${number} ${unit}` : number;
  }

  _round(value, step) {
    const stepText = String(step);
    const decimals = stepText.includes(".") ? Math.min(6, stepText.split(".")[1].length) : 0;
    return Number(value.toFixed(decimals));
  }

  async _change(direction) {
    if (!this._hass || !this._config) return;
    const details = this._stateDetails();
    if (!details.available) return;

    const next = this._round(
      Math.min(details.maximum, Math.max(details.minimum, details.value + direction * details.step)),
      details.step,
    );
    if (this._sameValue(next, details.value)) return;

    this._optimisticValue = next;
    this._pendingUntil = Date.now() + 20000;
    if (this._pendingTimer) window.clearTimeout(this._pendingTimer);
    this._pendingTimer = window.setTimeout(() => this._syncState(), 20100);
    this._lastSignature = "";
    this._render(true);

    const domain = this._config.entity.split(".")[0];
    try {
      await this._hass.callService(domain, "set_value", {
        entity_id: this._config.entity,
        value: next,
      });
    } catch (error) {
      this._clearPending();
      this._lastSignature = "";
      this._render(true);
      this._notify("Ændringen kunne ikke sendes til Home Assistant.");
    }
  }

  _moreInfo() {
    this.dispatchEvent(
      new CustomEvent("hass-more-info", {
        bubbles: true,
        composed: true,
        detail: { entityId: this._config.entity },
      }),
    );
  }

  _notify(message) {
    this.dispatchEvent(
      new CustomEvent("hass-notification", {
        bubbles: true,
        composed: true,
        detail: { message },
      }),
    );
  }

  _escape(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  _render(force = false) {
    if (!this._config || !this._hass) return;
    const details = this._stateDetails();
    const displayValue = this._formatValue(details.value, details.step, details.unit);
    const atMinimum = details.available && details.value <= details.minimum;
    const atMaximum = details.available && details.value >= details.maximum;
    const signature = JSON.stringify([
      displayValue,
      details.available,
      details.pending,
      atMinimum,
      atMaximum,
      this._config.name,
      this._config.description,
    ]);
    if (!force && signature === this._lastSignature) return;
    this._lastSignature = signature;

    const accent = this._escape(this._config.accent);
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; min-width: 0; }
        ha-card {
          --control-accent: ${accent};
          overflow: hidden;
          border: 0;
          border-left: calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--control-accent);
          border-radius: 17px;
          background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(0,0,0,.025)), var(--surface, var(--card-background-color));
          box-shadow: var(--dashboard-shadow-soft, var(--ha-card-box-shadow));
        }
        .header {
          display: grid;
          grid-template-columns: 48px minmax(0, 1fr);
          grid-template-areas: "icon name" "icon description";
          column-gap: 12px;
          min-height: 82px;
          padding: 16px 16px 12px;
          box-sizing: border-box;
          cursor: pointer;
        }
        .icon-box {
          grid-area: icon;
          width: 44px;
          height: 44px;
          display: grid;
          place-items: center;
          align-self: center;
          border-radius: 14px;
          color: var(--control-accent);
          background: color-mix(in srgb, var(--control-accent) 13%, transparent);
        }
        .icon-box ha-icon { --mdc-icon-size: 25px; }
        .name {
          grid-area: name;
          align-self: end;
          min-width: 0;
          color: var(--primary-text-color);
          font-size: 15px;
          font-weight: 800;
          line-height: 1.2;
        }
        .description {
          grid-area: description;
          align-self: start;
          min-width: 0;
          margin-top: 2px;
          color: var(--secondary-text-color);
          font-size: 11px;
          line-height: 1.3;
        }
        .controls {
          display: grid;
          grid-template-columns: minmax(68px, 1fr) minmax(112px, 1.15fr) minmax(68px, 1fr);
          gap: 7px;
          padding: 0 14px 15px;
        }
        button {
          height: 60px;
          border: 1px solid rgba(255,255,255,.055);
          border-radius: 17px;
          outline: none;
          color: var(--control-accent);
          background: color-mix(in srgb, var(--control-accent) 14%, var(--surface, var(--card-background-color)));
          cursor: pointer;
          touch-action: manipulation;
          transition: transform .12s ease, background .16s ease, opacity .16s ease;
          -webkit-tap-highlight-color: transparent;
        }
        button:active:not(:disabled) {
          transform: scale(.94);
          background: color-mix(in srgb, var(--control-accent) 24%, var(--surface, var(--card-background-color)));
        }
        button:disabled { opacity: .28; cursor: default; }
        button ha-icon { --mdc-icon-size: 28px; }
        .value {
          position: relative;
          display: grid;
          place-items: center;
          min-width: 0;
          height: 60px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.045);
          border-radius: 17px;
          color: var(--primary-text-color);
          background: rgba(255,255,255,.035);
          font-size: 27px;
          font-weight: 850;
          line-height: 1;
          white-space: nowrap;
          cursor: pointer;
          box-sizing: border-box;
        }
        .value.pending::after {
          content: "";
          position: absolute;
          right: 9px;
          top: 9px;
          width: 9px;
          height: 9px;
          border: 2px solid color-mix(in srgb, var(--control-accent) 30%, transparent);
          border-top-color: var(--control-accent);
          border-radius: 50%;
          animation: spin .75s linear infinite;
        }
        .unavailable { opacity: .55; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 420px) {
          .controls { grid-template-columns: 72px minmax(112px, 1fr) 72px; }
          .value { font-size: 26px; }
        }
      </style>
      <ha-card class="${details.available ? "" : "unavailable"}">
        <div class="header" data-action="more-info" role="button" tabindex="0" aria-label="Vis ${this._escape(this._config.name)}">
          <div class="icon-box"><ha-icon icon="${this._escape(this._config.icon)}"></ha-icon></div>
          <div class="name">${this._escape(this._config.name)}</div>
          <div class="description">${this._escape(this._config.description)}</div>
        </div>
        <div class="controls">
          <button class="decrease" data-action="decrease" aria-label="Sænk ${this._escape(this._config.name)}" ${!details.available || atMinimum ? "disabled" : ""}>
            <ha-icon icon="mdi:minus"></ha-icon>
          </button>
          <div class="value ${details.pending ? "pending" : ""}" data-action="more-info" role="button" tabindex="0" aria-label="${this._escape(this._config.name)}: ${this._escape(displayValue)}">${this._escape(displayValue)}</div>
          <button class="increase" data-action="increase" aria-label="Hæv ${this._escape(this._config.name)}" ${!details.available || atMaximum ? "disabled" : ""}>
            <ha-icon icon="mdi:plus"></ha-icon>
          </button>
        </div>
      </ha-card>
    `;

  }
}

if (!customElements.get("calefa-number-control-card")) {
  customElements.define("calefa-number-control-card", CalefaNumberControlCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "calefa-number-control-card")) {
  window.customCards.push({
    type: "calefa-number-control-card",
    name: "Calefa Number Control Card",
    description: "Optimistic number control for Calefa and Home Assistant helpers",
    preview: false,
  });
}
