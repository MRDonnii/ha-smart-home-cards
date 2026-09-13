const VERSION = "0.3.0";

class HAControlCenterCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._sig = "";
  }
  static getStubConfig() {
    return {
      title: "Husets kontrolcenter",
      status_items: [
        { entity: "sensor.example_problem_count", name: "Stille hus", icon: "mdi:home-alert-outline", detail_attribute: "problemer" },
      ],
      waste_entity: "sensor.example_waste_next",
      waste_path: "/hjem-overblik/affald",
      ambient_light_entity: "input_boolean.example_ambient_light",
      backup_entity: "sensor.backup_state",
    };
  }
  setConfig(config) {
    this._config = { title: "Husets kontrolcenter", status_items: [], ...config };
    this._render();
  }
  _watchedIds() {
    return [
      ...(this._config.status_items || []).map((i) => i.entity),
      this._config.waste_entity,
      this._config.ambient_light_entity,
      this._config.backup_entity,
    ].filter(Boolean);
  }
  set hass(hass) {
    this._hass = hass;
    const ids = this._watchedIds();
    const sig = JSON.stringify(ids.map((id) => [id, hass?.states?.[id]?.state]));
    if (sig !== this._sig) {
      this._sig = sig;
      this._render();
    }
  }
  _e(id) {
    return id ? this._hass?.states?.[id] : undefined;
  }
  _s(id) {
    return this._e(id)?.state;
  }
  _esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  _more(entityId) {
    if (!entityId) return;
    this.dispatchEvent(
      new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }),
    );
  }
  _navigate(path) {
    if (!path) return;
    history.pushState(null, "", path);
    window.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true }));
  }
  _statusEval(item) {
    const e = this._e(item.entity);
    if (!e) return { ok: true, count: 0, detail: "" };
    if (item.binary) {
      const on = e.state === "on";
      return { ok: !on, count: on ? 1 : 0, detail: on ? item.on_text || "Registreret" : "" };
    }
    const n = Number(e.state);
    const count = Number.isFinite(n) ? n : 0;
    const raw = item.detail_attribute ? e.attributes?.[item.detail_attribute] : "";
    const detail = raw && raw !== "Ingen" ? raw : "";
    return { ok: count === 0, count, detail };
  }
  _tile(item) {
    const s = this._statusEval(item);
    return `<button class="tile ${s.ok ? "ok" : "issue"}" data-entity="${this._esc(item.entity)}">
      <span class="tile-icon"><ha-icon icon="${this._esc(item.icon || "mdi:information-outline")}"></ha-icon></span>
      <span class="tile-name">${this._esc(item.name)}</span>
      <span class="tile-badge">${s.ok ? `<ha-icon icon="mdi:check"></ha-icon>` : this._esc(s.count) || "!"}</span>
      ${s.detail ? `<span class="tile-detail">${this._esc(s.detail)}</span>` : ""}
    </button>`;
  }
  _toggleAmbient() {
    const id = this._config.ambient_light_entity;
    if (!id) return;
    this._hass?.callService("input_boolean", "toggle", { entity_id: id });
  }
  _wasteInfo() {
    const e = this._e(this._config.waste_entity);
    if (!e) return null;
    const days = Number(e.state);
    return {
      days: Number.isFinite(days) ? days : undefined,
      date: e.attributes?.dato_kort || "",
      types: e.attributes?.typer || "",
    };
  }
  _backupInfo() {
    const e = this._e(this._config.backup_entity);
    if (!e) return null;
    const okStates = ["backed_up", "backed up", "idle"];
    const ok = okStates.includes((e.state || "").toLowerCase());
    const last = e.attributes?.last_backup;
    let lastLabel = "—";
    if (last) {
      const d = new Date(last);
      if (!Number.isNaN(d.getTime()))
        lastLabel = d.toLocaleDateString("da-DK", { day: "2-digit", month: "short" });
    }
    return { ok, state: e.state, lastLabel, size: e.attributes?.size_in_home_assistant };
  }
  _render() {
    if (!this.shadowRoot) return;
    const items = this._config.status_items || [];
    const evals = items.map((i) => this._statusEval(i));
    const openCount = evals.reduce((sum, s) => sum + (s.ok ? 0 : 1), 0);
    const waste = this._wasteInfo();
    const backup = this._backupInfo();
    const ambientOn = this._s(this._config.ambient_light_entity) === "on";

    this.shadowRoot.innerHTML = `<style>
      :host{display:block;--accent:var(--dashboard-accent, var(--primary-color, #62b5ff));--good:var(--dashboard-success, var(--success-color, #54d9aa));--warn:var(--dashboard-warning, var(--warning-color, #ffbd59));--danger:var(--dashboard-danger, var(--error-color, #ff667a));--edge:var(--dashboard-border-neutral, var(--divider-color, rgba(127,145,165,.2)))}
      *{box-sizing:border-box}
      ha-card{position:relative;overflow:hidden;padding:18px;border-left:4px solid ${openCount ? "var(--danger)" : "var(--good)"};border-radius:20px;background:var(--ha-card-background,var(--card-background-color));color:var(--primary-text-color);box-shadow:var(--ha-card-box-shadow)}
      .head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
      .head strong{font-size:18px}
      .pill{padding:4px 11px;border-radius:999px;font-size:11px;font-weight:800;background:color-mix(in srgb,${openCount ? "var(--danger)" : "var(--good)"} 16%,transparent);color:${openCount ? "var(--danger)" : "var(--good)"}}
      .grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
      .tile{--tone:var(--accent);display:flex;flex-direction:column;align-items:center;gap:5px;padding:12px 6px;border:1px solid color-mix(in srgb,var(--tone) 16%,var(--edge));border-left:3px solid var(--tone);border-radius:14px;background:linear-gradient(145deg,color-mix(in srgb,var(--tone) 6%,transparent),transparent 55%);box-shadow:0 4px 12px rgba(0,0,0,.08);color:var(--primary-text-color);cursor:pointer;text-align:center;position:relative}
      .tile:hover{border-color:var(--primary-text-color)}
      .tile.issue{--tone:var(--danger)}
      .tile-icon{--mdc-icon-size:22px;color:var(--secondary-text-color)}
      .tile.issue .tile-icon{color:var(--danger)}
      .tile-name{font-size:10px;font-weight:700;line-height:1.15}
      .tile-badge{position:absolute;top:6px;right:6px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;background:color-mix(in srgb,var(--good) 18%,transparent);color:var(--good)}
      .tile.issue .tile-badge{background:color-mix(in srgb,var(--danger) 20%,transparent);color:var(--danger)}
      .tile-badge ha-icon{--mdc-icon-size:11px}
      .tile-detail{display:none}
      .row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
      .card2{display:flex;align-items:center;gap:10px;padding:11px 12px;border:1px solid color-mix(in srgb,var(--accent) 14%,var(--edge));border-left:3px solid var(--accent);border-radius:14px;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 5%,transparent),transparent 55%);box-shadow:0 4px 12px rgba(0,0,0,.08)}
      .card2 ha-icon{--mdc-icon-size:20px;color:var(--secondary-text-color);flex:0 0 auto}
      .card2 .c2-text{min-width:0;display:flex;flex-direction:column}
      .card2 .c2-text b{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .card2 .c2-text span{font-size:10px;color:var(--secondary-text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .card2.tap{cursor:pointer}
      .card2.tap:hover{border-color:var(--primary-text-color)}
      .switch-tile{justify-content:space-between}
      .switch{position:relative;flex:0 0 auto;width:38px;height:22px;border-radius:999px;background:var(--edge);cursor:pointer;transition:background .2s}
      .switch.on{background:var(--good)}
      .switch i{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .2s}
      .switch.on i{transform:translateX(16px)}
      @media(max-width:520px){.grid{grid-template-columns:repeat(3,1fr)}.row{grid-template-columns:1fr}}
    </style>
    <ha-card>
      <div class="head">
        <strong>${this._esc(this._config.title)}</strong>
        <span class="pill">${openCount ? `${openCount} ting at tjekke` : "Alt roligt"}</span>
      </div>
      <div class="grid">${items.map((i) => this._tile(i)).join("")}</div>
      <div class="row">
        ${
          waste
            ? `<div class="card2 tap" data-nav="${this._esc(this._config.waste_path || "")}">
          <ha-icon icon="mdi:trash-can-clock-outline"></ha-icon>
          <span class="c2-text"><b>${Number.isFinite(waste.days) ? (waste.days === 0 ? "I dag" : waste.days === 1 ? "I morgen" : `Om ${waste.days} dage`) : "—"}</b><span>${this._esc(waste.types || waste.date)}</span></span>
        </div>`
            : ""
        }
        ${
          backup
            ? `<div class="card2 tap" data-entity="${this._esc(this._config.backup_entity)}">
          <ha-icon icon="${backup.ok ? "mdi:cloud-check-outline" : "mdi:cloud-alert-outline"}" style="color:${backup.ok ? "var(--good)" : "var(--danger)"}"></ha-icon>
          <span class="c2-text"><b>${backup.ok ? "Sikkerhedskopieret" : this._esc(backup.state)}</b><span>${this._esc(backup.lastLabel)} · ${this._esc(backup.size || "")}</span></span>
        </div>`
            : ""
        }
        ${
          this._config.ambient_light_entity
            ? `<div class="card2 switch-tile">
          <ha-icon icon="mdi:lightbulb-night-outline" style="color:${ambientOn ? "var(--good)" : "var(--secondary-text-color)"}"></ha-icon>
          <span class="c2-text"><b>Ambientlys</b><span>${ambientOn ? "Aktivt" : "Slukket"}</span></span>
          <div class="switch ${ambientOn ? "on" : ""}" data-switch><i></i></div>
        </div>`
            : ""
        }
      </div>
    </ha-card>`;

    this.shadowRoot.querySelectorAll(".tile[data-entity]").forEach((el) => {
      el.addEventListener("click", () => this._more(el.dataset.entity));
    });
    this.shadowRoot.querySelectorAll("[data-nav]").forEach((el) => {
      el.addEventListener("click", () => {
        if (el.dataset.nav) this._navigate(el.dataset.nav);
      });
    });
    this.shadowRoot.querySelectorAll(".card2[data-entity]").forEach((el) => {
      el.addEventListener("click", () => this._more(el.dataset.entity));
    });
    this.shadowRoot.querySelector("[data-switch]")?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this._toggleAmbient();
    });
  }
  getCardSize() {
    return 5;
  }
}

if (!customElements.get("ha-control-center-card"))
  customElements.define("ha-control-center-card", HAControlCenterCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha-control-center-card",
  name: "HA Control Center Card",
  description: "Samlet statusoverblik for husets sikkerheds- og driftskategorier med hurtige kontroller",
  preview: true,
});
console.info(
  `%c HA CONTROL CENTER CARD %c v${VERSION} `,
  "color:white;background:#3f7fbf;font-weight:700",
  "color:#9dc8ff;background:#161b22",
);
