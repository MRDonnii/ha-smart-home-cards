const VERSION = "0.3.1";

class HAAlarmCenterCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._sig = "";
    this._filterSig = "";
    this._filterMatches = {};
    this._snoozeDialog = null;
  }
  static getStubConfig() {
    return {
      title: "Alarmer & fejl",
      snooze_entity: "input_text.dashboard_alarm_snooze",
      alerts: [],
    };
  }
  setConfig(config) {
    this._config = {
      title: "Alarmer & fejl",
      snooze_entity: "input_text.dashboard_alarm_snooze",
      ...config,
    };
    this._render();
  }
  connectedCallback() {
    if (!this._filterTimer)
      this._filterTimer = setInterval(() => this._scanFilters(), 15000);
    this._scanFilters();
  }
  disconnectedCallback() {
    clearInterval(this._filterTimer);
    this._filterTimer = null;
    this._closeSnoozeDialog();
  }
  _e(id) {
    return id ? this._hass?.states?.[id] : undefined;
  }
  _s(id) {
    return this._e(id)?.state;
  }
  _scanFilters() {
    if (!this._hass) return;
    const rules = (this._config.alerts || []).filter((a) => a.entity_filter);
    if (!rules.length) return;
    const matches = {};
    for (const a of rules) {
      try {
        const p = String(a.entity_filter)
          .replace(/^\//, "")
          .replace(/\/[gimyus]*$/, "");
        const re = new RegExp(p);
        matches[a.entity_filter] = Object.keys(this._hass.states).filter((id) =>
          re.test(id),
        );
      } catch {
        matches[a.entity_filter] = [];
      }
    }
    const sig = JSON.stringify(
      Object.entries(matches).map(([k, ids]) => [
        k,
        ids.map((id) => [id, this._hass.states[id]?.state]),
      ]),
    );
    if (sig === this._filterSig) return;
    this._filterSig = sig;
    this._filterMatches = matches;
    this._render();
  }
  _match(a, e) {
    if (!e) return false;
    const left = e.state,
      right = String(a.state ?? "on"),
      op = a.operator || "=";
    if (op === "=") return left === right;
    if (op === "!=") return left !== right;
    const l = Number(left),
      r = Number(right);
    if (!Number.isFinite(l) || !Number.isFinite(r)) return false;
    return op === "<" ? l < r : op === "<=" ? l <= r : op === ">" ? l > r : op === ">=" ? l >= r : false;
  }
  _computeAll() {
    const result = [];
    for (const a of this._config.alerts || []) {
      const checks = (a.conditions || []).map((c) => this._match(c, this._e(c.entity)));
      const conditionsOk =
        !checks.length || (a.conditions_logic === "or" ? checks.some(Boolean) : checks.every(Boolean));
      if (!conditionsOk) continue;
      let entities = [];
      if (a.entity) entities = [this._e(a.entity)].filter(Boolean);
      else if (a.entity_filter)
        entities = (this._filterMatches[a.entity_filter] || []).map((id) => this._e(id)).filter(Boolean);
      for (const e of entities)
        if (this._match(a, e))
          result.push({
            ...a,
            entity: e.entity_id,
            name: String(a.name || a.message || "Alarm").replace(
              "{name}",
              e.attributes?.friendly_name || e.entity_id,
            ),
            priority: Number(a.priority) || 0,
          });
    }
    return result.sort((a, b) => b.priority - a.priority);
  }
  _snoozeEntries() {
    const state = this._s(this._config.snooze_entity);
    const raw = ["unknown", "unavailable"].includes(state) ? "" : state || "";
    const now = Date.now();
    const entries = new Map();
    for (const token of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
      const at = token.lastIndexOf("@");
      if (at < 1) { entries.set(token, new Date(now + 12 * 60 * 60 * 1000).getTime()); continue; }
      const entity = token.slice(0, at);
      if (["unknown", "unavailable"].includes(entity)) continue;
      const until = Number(token.slice(at + 1));
      if (entity && Number.isFinite(until) && until > now) entries.set(entity, until);
    }
    return entries;
  }
  _watchedIds() {
    const direct = (this._config.alerts || []).map((a) => a.entity).filter(Boolean);
    const filtered = Object.values(this._filterMatches).flat();
    return [...direct, ...filtered, this._config.snooze_entity].filter(Boolean);
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
  _writeSnooze(entries) {
    let values = [...entries.entries()].sort((a, b) => a[1] - b[1]).map(([id, until]) => `${id}@${until}`);
    let joined = values.join(",");
    while (joined.length > 250 && values.length > 1) { values.shift(); joined = values.join(","); }
    return this._hass?.callService("input_text", "set_value", { entity_id: this._config.snooze_entity, value: joined });
  }
  _snoozeUntil(entityId, kind) {
    const now = new Date();
    let until;
    if (kind === "tomorrow") { until = new Date(now); until.setDate(until.getDate() + 1); until.setHours(7, 0, 0, 0); }
    else until = new Date(now.getTime() + (kind === "week" ? 7 * 24 : 12) * 60 * 60 * 1000);
    const entries = this._snoozeEntries(); entries.set(entityId, until.getTime());
    this._writeSnooze(entries); this._closeSnoozeDialog();
  }
  _unsnooze(entityId) { const entries = this._snoozeEntries(); entries.delete(entityId); this._writeSnooze(entries); }
  _openSnoozeDialog(alert) {
    this._closeSnoozeDialog();
    const wrap = document.createElement("div");
    wrap.style.cssText = "position:fixed;inset:0;z-index:1000002;display:grid;place-items:center;padding:18px;background:rgba(4,10,18,.66);backdrop-filter:blur(5px)";
    wrap.innerHTML = `<div style="width:min(420px,100%);padding:22px;border:1px solid var(--dashboard-border-neutral, var(--divider-color, rgba(255,255,255,.14)));border-radius:22px;background:var(--ha-card-background,var(--card-background-color,#111d2b));color:var(--primary-text-color,#fff);box-shadow:0 24px 70px rgba(0,0,0,.5)"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px"><div><div style="color:var(--dashboard-accent, var(--primary-color, #62b5ff));font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase">Skjul alarm</div><h3 style="margin:6px 0 4px;font-size:20px">${this._esc(alert.name)}</h3><p style="margin:0;color:var(--secondary-text-color);font-size:12px">Alarmen vises automatisk igen, når tiden er udløbet.</p></div><button data-close style="border:0;background:transparent;color:inherit;font-size:22px;cursor:pointer">✕</button></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:20px"><button data-duration="12h" class="duration"><b>12</b><span>timer</span></button><button data-duration="tomorrow" class="duration"><ha-icon icon="mdi:weather-sunset-up"></ha-icon><span>Til i morgen</span></button><button data-duration="week" class="duration"><b>7</b><span>dage</span></button></div><style>.duration{min-height:82px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:1px solid var(--dashboard-border-neutral, var(--divider-color, rgba(255,255,255,.14)));border-radius:15px;background:color-mix(in srgb,var(--dashboard-accent, var(--primary-color, #62b5ff)) 8%,transparent);color:inherit;cursor:pointer}.duration:hover{border-color:var(--dashboard-accent, var(--primary-color, #62b5ff));background:color-mix(in srgb,var(--dashboard-accent, var(--primary-color, #62b5ff)) 16%,transparent)}.duration b{font-size:22px}.duration span{font-size:11px;font-weight:750}.duration ha-icon{--mdc-icon-size:25px;color:var(--dashboard-accent, var(--primary-color, #62b5ff))}@media(max-width:380px){.duration{min-height:72px}.duration span{font-size:9px}}</style></div>`;
    wrap.addEventListener("click", (e) => { if (e.target === wrap || e.target.closest("[data-close]")) this._closeSnoozeDialog(); const button = e.target.closest("[data-duration]"); if (button) this._snoozeUntil(alert.entity, button.dataset.duration); });
    document.body.appendChild(wrap); this._snoozeDialog = wrap;
  }
  _closeSnoozeDialog() { this._snoozeDialog?.remove(); this._snoozeDialog = null;
  }
  _runAction(action, entityId) {
    if (!action) return;
    if (action.action === "navigate" && action.navigation_path) return this._navigate(action.navigation_path);
    if (action.action === "toggle" && (action.entity || entityId)) {
      const id = action.entity || entityId;
      const [domain] = id.split(".");
      return this._hass?.callService(domain, "toggle", { entity_id: id });
    }
    if (["call-service", "perform-action"].includes(action.action) && action.service) {
      const [domain, service] = action.service.split(".", 2);
      if (!domain || !service) return;
      return this._hass?.callService(domain, service, action.data || {}, action.target || {});
    }
    this._more(action.entity || entityId);
  }
  _navigate(path) {
    if (!path) return;
    history.pushState(null, "", path);
    window.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true }));
  }
  _more(entityId) {
    if (!entityId) return;
    this.dispatchEvent(
      new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }),
    );
  }
  _rowTap(a) {
    if (a.tap_action) return this._runAction(a.tap_action, a.entity);
    if (a.path) return this._navigate(a.path);
    this._more(a.entity);
  }
  _esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  _row(a, snoozed, until) {
    const icon = a.icon?.startsWith("mdi:") ? a.icon : null;
    const emoji = !icon ? a.icon || "⚠️" : null;
    return `<div class="row priority-${a.priority} ${snoozed ? "snoozed" : ""}" data-entity="${this._esc(a.entity)}">
      <button class="row-main" data-tap>
        <span class="row-icon">${icon ? `<ha-icon icon="${this._esc(icon)}"></ha-icon>` : this._esc(emoji)}</span>
        <span class="row-text">
          <strong>${this._esc(a.name)}</strong>
          ${a.secondary_text ? `<span class="sub">${this._esc(a.secondary_text)}</span>` : ""}
          <span class="entity-id">${this._esc(a.entity)}</span>
        </span>
      </button>
      <button class="snooze-btn ${snoozed ? "active" : ""}" data-snooze="${this._esc(a.entity)}" title="${snoozed ? "Vis alarmen igen" : "Skjul alarmen midlertidigt"}">
        <ha-icon icon="${snoozed ? "mdi:bell" : "mdi:bell-off-outline"}"></ha-icon>
        <span>${snoozed ? `Skjult til ${new Date(until).toLocaleString("da-DK", { weekday: "short", hour: "2-digit", minute: "2-digit" })}` : "Skjul"}</span>
      </button>
      ${a.acknowledge_action && !snoozed ? `<button class="ack-btn" data-ack="${this._esc(a.entity)}" title="Godkend og ryd advarslen"><ha-icon icon="mdi:check-circle-outline"></ha-icon><span>Godkend</span></button>` : ""}
    </div>`;
  }
  _render() {
    if (!this.shadowRoot) return;
    const all = this._computeAll();
    const snoozeEntries = this._snoozeEntries();
    const snoozedIds = new Set(snoozeEntries.keys());
    const active = all.filter((a) => !snoozedIds.has(a.entity));
    const snoozed = all.filter((a) => snoozedIds.has(a.entity));

    this.shadowRoot.innerHTML = `<style>
      :host{display:block;--good:var(--dashboard-success, var(--success-color, #54d9aa));--warn:var(--dashboard-warning, var(--warning-color, #ffbd59));--danger:var(--dashboard-danger, var(--error-color, #ff667a));--edge:var(--dashboard-border-neutral, var(--divider-color, rgba(127,145,165,.2)))}
      *{box-sizing:border-box}
      ha-card{padding:18px;border-radius:20px;background:var(--ha-card-background,var(--card-background-color));color:var(--primary-text-color);box-shadow:var(--ha-card-box-shadow)}
      .head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
      .head strong{font-size:18px}
      .count{padding:3px 10px;border-radius:999px;font-size:11px;font-weight:800;background:color-mix(in srgb,var(--danger) 16%,transparent);color:var(--danger)}
      .count.zero{background:color-mix(in srgb,var(--good) 16%,transparent);color:var(--good)}
      .section-title{margin:18px 0 8px;color:var(--secondary-text-color);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
      .section-title:first-of-type{margin-top:0}
      .empty{padding:22px 10px;text-align:center;color:var(--secondary-text-color);font-size:13px}
      .rows{display:flex;flex-direction:column;gap:8px}
      .row{--tone:var(--edge);display:flex;align-items:center;gap:8px;border:1px solid color-mix(in srgb,var(--tone) 22%,var(--edge));border-radius:14px;padding:6px;border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--tone);background:linear-gradient(145deg,color-mix(in srgb,var(--tone) 6%,transparent),transparent 55%);box-shadow:0 4px 12px rgba(0,0,0,.08)}
      .row.priority-1{--tone:var(--warn)}
      .row.priority-2,.row.priority-3{--tone:var(--danger)}
      .row.snoozed{opacity:.6}
      .row-main{flex:1;min-width:0;display:flex;align-items:center;gap:10px;padding:6px;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;border-radius:10px}
      .row-main:hover{background:color-mix(in srgb,var(--primary-text-color) 5%,transparent)}
      .row-icon{flex:0 0 28px;display:grid;place-items:center;font-size:18px}
      .row-icon ha-icon{--mdc-icon-size:22px}
      .row-text{min-width:0;display:flex;flex-direction:column}
      .row-text strong{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .row-text .sub{font-size:11px;color:var(--secondary-text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .row-text .entity-id{margin-top:2px;font-size:9px;color:var(--secondary-text-color);opacity:.6;font-family:monospace}
      .snooze-btn{flex:0 0 auto;display:flex;align-items:center;gap:5px;padding:8px 10px;border:1px solid color-mix(in srgb,var(--tone) 26%,var(--edge));border-radius:11px;background:transparent;color:var(--secondary-text-color);font-size:10px;font-weight:700;cursor:pointer}
      .snooze-btn ha-icon{--mdc-icon-size:16px}
      .snooze-btn:hover{border-color:var(--primary-text-color);color:var(--primary-text-color)}
      .snooze-btn.active{border-color:var(--accent,#62b5ff);color:var(--accent,#62b5ff)}
      .ack-btn{flex:0 0 auto;display:flex;align-items:center;gap:5px;padding:8px 10px;border:1px solid color-mix(in srgb,var(--good) 42%,var(--edge));border-radius:11px;background:color-mix(in srgb,var(--good) 10%,transparent);color:var(--good);font-size:10px;font-weight:800;cursor:pointer}
      .ack-btn ha-icon{--mdc-icon-size:16px}.ack-btn:hover{background:color-mix(in srgb,var(--good) 18%,transparent)}
      @media(max-width:480px){.row-text .entity-id{display:none}.snooze-btn span,.ack-btn span{display:none}}
    </style>
    <ha-card>
      <div class="head">
        <strong>${this._esc(this._config.title)}</strong>
        <span class="count ${active.length ? "" : "zero"}">${active.length ? `${active.length} aktiv${active.length === 1 ? "" : "e"}` : "Alt i orden"}</span>
      </div>
      ${
        !active.length && !snoozed.length
          ? `<div class="empty">Ingen aktive alarmer eller fejl lige nu.</div>`
          : ""
      }
      ${
        active.length
          ? `<div class="section-title">Aktive</div><div class="rows">${active.map((a) => this._row(a, false)).join("")}</div>`
          : ""
      }
      ${
        snoozed.length
          ? `<div class="section-title">Midlertidigt skjult</div><div class="rows">${snoozed.map((a) => this._row(a, true, snoozeEntries.get(a.entity))).join("")}</div>`
          : ""
      }
    </ha-card>`;

    this.shadowRoot.querySelectorAll("[data-snooze]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const alert = [...active, ...snoozed].find((a) => a.entity === btn.dataset.snooze);
        if (snoozedIds.has(btn.dataset.snooze)) this._unsnooze(btn.dataset.snooze);
        else if (alert) this._openSnoozeDialog(alert);
      });
    });
    this.shadowRoot.querySelectorAll("[data-tap]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const entity = btn.closest(".row")?.dataset.entity;
        const alert = [...active, ...snoozed].find((a) => a.entity === entity);
        if (alert) this._rowTap(alert);
      });
    });
    this.shadowRoot.querySelectorAll("[data-ack]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const alert = active.find((a) => a.entity === btn.dataset.ack);
        if (alert?.acknowledge_action) this._runAction(alert.acknowledge_action, alert.entity);
      });
    });
  }
  getCardSize() {
    return 6;
  }
}

if (!customElements.get("ha-alarm-center-card"))
  customElements.define("ha-alarm-center-card", HAAlarmCenterCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha-alarm-center-card",
  name: "HA Alarm Center Card",
  description: "Liste over aktive husalarmer/fejl med mulighed for at slå dem fra til næste dag",
  preview: true,
});
console.info(
  `%c HA ALARM CENTER CARD %c v${VERSION} `,
  "color:white;background:#d9534f;font-weight:700",
  "color:#ff9d9d;background:#161b22",
);
