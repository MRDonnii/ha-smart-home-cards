const VERSION = "0.5.0";

class HAKidTrackerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._sig = "";
    this._refreshing = false;
  }
  static getStubConfig() {
    return {
      title: "Barn",
      entity: "person.example",
      navigation_path: "/lovelace/home",
      tracker: "device_tracker.example_watch",
      image: "",
      location_name: "sensor.example_watch_location_name",
      distance: "sensor.example_proximity_distance",
      direction: "sensor.example_proximity_direction_of_travel",
      travel_time: "sensor.example_waze_travel_time",
      battery: "sensor.example_watch_battery",
      last_gps: "sensor.example_watch_last_gps_fix",
      gps_status: "sensor.example_watch_location_status",
      gps_refresh_button: "button.example_watch_request_location_update",
      steps_today: "sensor.example_watch_daily_steps",
      step_goal: "sensor.example_watch_step_goal",
      distance_today: "sensor.example_watch_daily_distance",
      calories_today: "sensor.example_watch_daily_calories",
      steps_week: "sensor.example_watch_weekly_steps",
      distance_week: "sensor.example_watch_weekly_distance",
      calories_week: "sensor.example_watch_weekly_calories",
      secondary_battery: "sensor.example_watch_battery",
      secondary_battery_label: "Ur",
      floors_up: "sensor.example_phone_floors_ascended",
      floors_down: "sensor.example_phone_floors_descended",
      activity: "sensor.example_phone_activity",
      battery_state: "sensor.example_phone_battery_state",
      connection: "sensor.example_phone_connection_type",
      ssid: "sensor.example_phone_ssid",
      last_update: "sensor.example_phone_last_update_trigger",
      app_version: "sensor.example_phone_app_version",
      storage: "sensor.example_phone_storage",
      details: [],
    };
  }
  setConfig(config) {
    if (!config?.entity) throw new Error("Kortet kræver en person-entity");
    this._config = { title: "Sporing", ...config };
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    const ids = [];
    const collect = (value) => {
      if (typeof value === "string" && /^[a-z_]+\.[a-z0-9_]+$/.test(value)) ids.push(value);
      else if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === "object") Object.values(value).forEach(collect);
    };
    collect(this._config);
    const sig = JSON.stringify(
      ids.map((id) => [id, hass?.states?.[id]?.state]),
    );
    if (sig !== this._sig) {
      this._sig = sig;
      this._render();
    }
  }
  getCardSize() {
    return 8;
  }
  getGridOptions() {
    return { columns: 12, rows: "auto", min_columns: 6 };
  }
  _e(id) {
    return id ? this._hass?.states?.[id] : undefined;
  }
  _s(id) {
    return this._e(id)?.state;
  }
  _hasData(id) {
    if (!id) return false;
    const s = this._s(id);
    return s !== undefined && !["unknown", "unavailable", ""].includes(s);
  }
  _num(id) {
    if (!this._hasData(id)) return undefined;
    const n = Number(String(this._s(id)).replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  }
  _esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  _fmt(v, digits = 0) {
    if (!Number.isFinite(v)) return "—";
    return v.toLocaleString("da-DK", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }
  _time(id) {
    if (!this._hasData(id)) return "—";
    const raw = this._s(id);
    const numeric = Number(raw);
    const d = new Date(Number.isFinite(numeric) && numeric > 1000000000 ? numeric * 1000 : raw);
    if (Number.isNaN(d.getTime())) return this._s(id);
    return d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
  }
  _distanceLabel(id) {
    const e = this._e(id);
    const d = this._num(id);
    if (!Number.isFinite(d)) return "—";
    const unit = (e?.attributes?.unit_of_measurement || "").toLowerCase();
    const km = unit === "m" || d > 100 ? d / 1000 : d;
    return km >= 1 ? `${this._fmt(km, 1)} km` : `${Math.round(km * 1000)} m`;
  }
  _directionLabel(id) {
    const raw = (this._s(id) || "").toLowerCase();
    const map = {
      towards: "På vej hjem",
      arrived: "Ankommet",
      away_from: "På vej væk",
      stationary: "Står stille",
    };
    return map[raw] || (this._hasData(id) ? this._s(id) : "");
  }
  _stat(label, value) {
    return `<div class="stat"><span>${label}</span><b>${value}</b></div>`;
  }
  _entityValue(id, format) {
    if (!this._hasData(id)) return "—";
    const entity = this._e(id);
    const raw = entity.state;
    const number = Number(String(raw).replace(",", "."));
    if (format === "time") return this._time(id);
    if (format === "percent" && Number.isFinite(number)) return `${this._fmt(number)}%`;
    if (format === "distance") return this._distanceLabel(id);
    if (format === "number" && Number.isFinite(number)) return this._fmt(number, 1);
    const unit = entity.attributes?.unit_of_measurement;
    return `${this._esc(raw)}${unit ? ` ${this._esc(unit)}` : ""}`;
  }
  _call(id, service, data = {}) {
    if (!id) return;
    const [domain] = id.split(".");
    this._hass?.callService(domain, service, { entity_id: id, ...data });
  }
  _refreshGps() {
    if (!this._config.gps_refresh_button) return;
    this._refreshing = true;
    this._render();
    this._hass?.callService("button", "press", {
      entity_id: this._config.gps_refresh_button,
    });
    setTimeout(() => {
      this._refreshing = false;
      this._render();
    }, 3000);
  }
  _render() {
    if (!this.shadowRoot) return;
    const person = this._e(this._config.entity);
    const tracker = this._e(this._config.tracker);
    const state = tracker?.state || person?.state || "unknown";
    const home = state === "home";
    const away = state === "not_home";
    const color = home
      ? "var(--dashboard-success, var(--success-color, #54d9aa))"
      : away
        ? "var(--dashboard-warning, var(--warning-color, #ffbd59))"
        : "var(--dashboard-accent, var(--primary-color, #62b5ff))";
    const statusLabel = home ? "Hjemme" : away ? "Ude" : this._hasData(this._config.tracker) ? state : "Ukendt";
    const pic =
      this._config.image ||
      person?.attributes?.entity_picture ||
      tracker?.attributes?.entity_picture ||
      "";
    const locationName = this._hasData(this._config.location_name)
      ? this._s(this._config.location_name)
      : home
        ? "Hjemme"
        : statusLabel;
    const distance = this._distanceLabel(this._config.distance);
    const direction = this._directionLabel(this._config.direction);
    const travelMin = this._num(this._config.travel_time);

    const battery = this._num(this._config.battery);
    const batteryColor =
      battery === undefined
        ? "var(--secondary-text-color,#aeb7c4)"
        : battery < 20
          ? "var(--dashboard-danger, var(--error-color, #ff667a))"
          : battery < 45
            ? "var(--dashboard-warning, var(--warning-color, #ffbd59))"
            : "var(--dashboard-success, var(--success-color, #54d9aa))";

    const hasSteps = this._hasData(this._config.steps_today);
    const steps = this._num(this._config.steps_today) || 0;
    const goal = this._num(this._config.step_goal) || 0;
    const stepsPct = goal > 0 ? Math.min(100, (steps / goal) * 100) : 0;
    const ringCircumference = 2 * Math.PI * 52;
    const ringOffset = ringCircumference * (1 - stepsPct / 100);
    const goalReached = goal > 0 && steps >= goal;
    const secondaryBattery = this._num(this._config.secondary_battery);

    const weekStats = [
      this._hasData(this._config.steps_week)
        ? this._stat("Skridt uge", this._fmt(this._num(this._config.steps_week)))
        : "",
      this._hasData(this._config.distance_week)
        ? this._stat("Distance uge", `${this._fmt(this._num(this._config.distance_week), 1)} km`)
        : "",
      this._hasData(this._config.calories_week)
        ? this._stat("Kalorier uge", `${this._fmt(this._num(this._config.calories_week))} kcal`)
        : "",
    ].filter(Boolean);

    const floorsUp = this._num(this._config.floors_up);
    const floorsDown = this._num(this._config.floors_down);
    const heroStatsHtml = [
      this._hasData(this._config.distance_today) ? this._stat("Distance i dag", this._distanceLabel(this._config.distance_today)) : "",
      this._hasData(this._config.calories_today) ? this._stat("Kalorier", `${this._fmt(this._num(this._config.calories_today))} kcal`) : "",
      Number.isFinite(floorsUp) || Number.isFinite(floorsDown) ? this._stat("Etager i dag", `↑${this._fmt(floorsUp || 0)} · ↓${this._fmt(floorsDown || 0)}`) : "",
      weekStats.join(""),
      Number.isFinite(battery) && !home ? this._stat("Batteri", `${this._fmt(battery)}%`) : "",
      Number.isFinite(secondaryBattery) ? this._stat(this._esc(this._config.secondary_battery_label || "Ur"), `${this._fmt(secondaryBattery)}%`) : "",
    ].filter(Boolean);
    const showHero = hasSteps || heroStatsHtml.length > 0;
    const deviceDetails = [
      [this._config.activity, "Aktivitet", "mdi:run", null],
      [this._config.battery_state, "Opladning", "mdi:battery-charging", null],
      [this._config.connection, "Forbindelse", "mdi:access-point-network", null],
      [this._config.ssid, "Netværk", "mdi:wifi", null],
      [this._config.last_update, "Seneste opdatering", "mdi:update", null],
      [this._config.app_version, "App-version", "mdi:cellphone-cog", null],
      [this._config.storage, "Ledig lagerplads", "mdi:database", null],
      ...(Array.isArray(this._config.details)
        ? this._config.details.map((item) => [item.entity, item.label || "Status", item.icon || "mdi:information-outline", item.format])
        : []),
    ].filter(([id]) => this._hasData(id));
    const deviceDetailsHtml = deviceDetails.map(([id, label, icon, format]) =>
      `<button class="detail" data-entity="${this._esc(id)}"><ha-icon icon="${this._esc(icon)}"></ha-icon><span>${this._esc(label)}</span><b>${this._entityValue(id, format)}</b></button>`,
    ).join("");

    this.shadowRoot.innerHTML = `<style>
      :host{display:block;--accent:${color};--good:var(--dashboard-success,var(--success-color,#54d9aa));--warn:var(--dashboard-warning,var(--warning-color,#ffbd59));--danger:var(--dashboard-danger,var(--error-color,#ff667a));--edge:var(--dashboard-border-neutral,var(--divider-color,rgba(127,145,165,.2)));--panel:var(--surface,var(--ha-card-background,var(--card-background-color,#1c1f26)));--text:var(--primary-text-color,#f5f7fb);--muted:var(--secondary-text-color,#aeb7c4);--shadow:var(--state-card-shadow,var(--ha-card-box-shadow,0 12px 30px rgba(0,0,0,.18)))}
      *{box-sizing:border-box}
      ha-card{position:relative;overflow:hidden;padding:18px;border-left:4px solid var(--accent);border-radius:20px;background:var(--panel);color:var(--text);box-shadow:var(--shadow)}
      ha-card:after{content:"";position:absolute;right:-34px;bottom:-38px;width:148px;height:148px;border-radius:50%;background:color-mix(in srgb,var(--accent) 10%,transparent);pointer-events:none}
      .head{display:flex;align-items:center;gap:13px}
      .back{flex:0 0 38px;width:38px;height:38px;display:flex;align-items:center;justify-content:center;border:1px solid color-mix(in srgb,var(--accent) 20%,var(--edge));border-radius:50%;background:color-mix(in srgb,var(--panel) 82%,transparent);color:var(--text);cursor:pointer}
      .back:hover{border-color:var(--accent);transform:translateX(-1px)}
      .back ha-icon{--mdc-icon-size:20px}
      .portrait{position:relative;flex:0 0 54px;width:54px;height:54px;border-radius:50%;background-size:cover;background-position:center;background-color:color-mix(in srgb,var(--accent) 18%,transparent)}
      .portrait i{position:absolute;right:-2px;bottom:-2px;width:14px;height:14px;border-radius:50%;background:var(--accent);border:2px solid var(--panel);box-shadow:0 0 8px var(--accent)}
      .portrait.home i{animation:pulse-dot 1.8s ease-in-out infinite}
      .head-info{min-width:0}
      .head-info strong{display:block;font-size:17px}
      .head-info .status{margin-top:2px;font-size:12px;font-weight:700;color:var(--accent)}
      .head-info .place{margin-top:1px;font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .trip{margin-left:auto;text-align:right}
      .trip strong{display:block;font-size:15px}
      .trip span{display:block;color:var(--muted);font-size:10px}
      .hero{display:grid;grid-template-columns:auto 1fr;gap:20px;align-items:center;margin-top:18px}
      .hero.no-ring{grid-template-columns:1fr}
      .ring{position:relative;width:120px;height:120px;flex:0 0 120px}
      .ring svg{transform:rotate(-90deg)}
      .ring .track{fill:none;stroke:var(--edge);stroke-width:9}
      .ring .fill{fill:none;stroke:var(--accent);stroke-width:9;stroke-linecap:round;stroke-dasharray:${ringCircumference};stroke-dashoffset:${ringOffset};transition:stroke-dashoffset 1s ease;filter:drop-shadow(0 0 5px color-mix(in srgb,var(--accent) 55%,transparent))}
      .ring.goal .fill{stroke:var(--good)}
      .ring-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
      .ring-center strong{font-size:19px;line-height:1}
      .ring-center span{margin-top:3px;font-size:9px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
      .activity-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
      .stat{padding:9px;border:1px solid color-mix(in srgb,var(--accent) 16%,transparent);border-left:3px solid var(--accent);border-radius:12px;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 7%,transparent),transparent 55%);box-shadow:0 4px 12px rgba(0,0,0,.1);text-align:center}
      .stat span{display:block;color:var(--muted);font-size:8px;text-transform:uppercase;font-weight:700}
      .stat b{display:block;margin-top:4px;font-size:13px}
      .section-title{margin:16px 0 8px;color:var(--muted);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
      .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
      .gps-row{display:flex;align-items:center;gap:12px}
      .gps-info{flex:1;min-width:0;display:flex;gap:14px}
      .gps-info div span{display:block;color:var(--muted);font-size:8px;text-transform:uppercase;font-weight:700}
      .gps-info div b{display:block;margin-top:2px;font-size:12px}
      .gps-btn{flex:0 0 auto;display:flex;align-items:center;gap:6px;padding:9px 14px;border:1px solid color-mix(in srgb,var(--accent) 20%,var(--edge));border-radius:12px;background:transparent;color:var(--text);font-size:11px;font-weight:700;cursor:pointer}
      .gps-btn:hover{border-color:var(--accent)}
      .gps-btn ha-icon{--mdc-icon-size:16px;color:var(--accent)}
      .gps-btn.spin ha-icon{animation:spin-icon 1s linear infinite}
      .battery-pill{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:10px;font-size:10px;font-weight:700;background:color-mix(in srgb,${batteryColor} 14%,transparent);color:${batteryColor}}
      .details{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;position:relative;z-index:1}
      .detail{min-width:0;display:grid;grid-template-columns:24px minmax(0,1fr);grid-template-areas:"icon label" "icon value";column-gap:8px;align-items:center;padding:10px;border:1px solid color-mix(in srgb,var(--accent) 16%,transparent);border-left:3px solid var(--accent);border-radius:12px;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 6%,transparent),transparent 55%),color-mix(in srgb,var(--panel) 84%,transparent);box-shadow:0 4px 12px rgba(0,0,0,.1);color:var(--text);text-align:left;cursor:pointer}
      .detail:hover{border-color:var(--accent);transform:translateY(-1px)}
      .detail ha-icon{grid-area:icon;--mdc-icon-size:20px;color:var(--accent)}
      .detail span{grid-area:label;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:8px;font-weight:700;text-transform:uppercase}
      .detail b{grid-area:value;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}
      @keyframes pulse-dot{50%{opacity:.4;transform:scale(1.4)}}
      @keyframes spin-icon{to{transform:rotate(360deg)}}
      @media(max-width:680px){.details{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:480px){.hero{grid-template-columns:1fr;justify-items:center;text-align:center}.stats{grid-template-columns:repeat(2,1fr)}.gps-row{flex-direction:column;align-items:stretch}.gps-info{justify-content:center}.details{grid-template-columns:1fr}}
      @media(prefers-reduced-motion:reduce){*{animation:none!important}}
    </style>
    <ha-card>
      <div class="head">
        ${this._config.navigation_path ? `<button class="back" data-back title="Tilbage"><ha-icon icon="mdi:arrow-left"></ha-icon></button>` : ""}
        <div class="portrait ${home ? "home" : ""}" style="${pic ? `background-image:url('${this._esc(pic)}')` : ""}"><i></i></div>
        <div class="head-info">
          <strong>${this._esc(this._config.title)}</strong>
          <div class="status">${this._esc(statusLabel)}</div>
          <div class="place">${this._esc(locationName)}${direction ? ` · ${this._esc(direction)}` : ""}</div>
        </div>
        ${
          !home && (distance !== "—" || Number.isFinite(travelMin))
            ? `<div class="trip"><strong>${Number.isFinite(travelMin) ? `${this._fmt(travelMin)} min` : distance}</strong><span>${Number.isFinite(travelMin) ? distance : "Hjemtur"}</span></div>`
            : `<div class="trip"><span class="battery-pill"><ha-icon icon="mdi:battery"></ha-icon>${Number.isFinite(battery) ? `${this._fmt(battery)}%` : "—"}</span></div>`
        }
      </div>
      ${
        showHero
          ? `<div class="hero ${hasSteps ? "" : "no-ring"}">
        ${
          hasSteps
            ? `<div class="ring ${goalReached ? "goal" : ""}">
          <svg viewBox="0 0 120 120"><circle class="track" cx="60" cy="60" r="52"></circle><circle class="fill" cx="60" cy="60" r="52"></circle></svg>
          <div class="ring-center"><strong>${this._fmt(steps)}</strong><span>${goal > 0 ? `af ${this._fmt(goal)} skridt` : "skridt i dag"}</span></div>
        </div>`
            : ""
        }
        <div class="activity-stats">${heroStatsHtml.join("")}</div>
      </div>`
          : ""
      }
      ${
        this._hasData(this._config.last_gps) || this._hasData(this._config.gps_status) || this._config.gps_refresh_button
          ? `<div class="section-title">GPS</div><div class="gps-row">
        <div class="gps-info">
          ${this._hasData(this._config.last_gps) ? `<div><span>Sidste fix</span><b>${this._time(this._config.last_gps)}</b></div>` : ""}
          ${this._hasData(this._config.gps_status) ? `<div><span>Status</span><b>${this._esc(this._s(this._config.gps_status))}</b></div>` : ""}
        </div>
        ${this._config.gps_refresh_button ? `<button class="gps-btn ${this._refreshing ? "spin" : ""}" data-refresh><ha-icon icon="mdi:map-marker-refresh"></ha-icon>${this._refreshing ? "Opdaterer…" : "Opdater GPS"}</button>` : ""}
      </div>`
          : ""
      }
      ${deviceDetails.length ? `<div class="section-title">Enhed og status</div><div class="details">${deviceDetailsHtml}</div>` : ""}
    </ha-card>`;
    this.shadowRoot
      .querySelector("[data-refresh]")
      ?.addEventListener("click", () => this._refreshGps());
    this.shadowRoot.querySelector("[data-back]")?.addEventListener("click", () => {
      history.pushState(null, "", this._config.navigation_path);
      window.dispatchEvent(new Event("location-changed"));
    });
    this.shadowRoot.querySelectorAll("[data-entity]").forEach((element) =>
      element.addEventListener("click", () => {
        const event = new Event("hass-more-info", { bubbles: true, composed: true });
        event.detail = { entityId: element.dataset.entity };
        this.dispatchEvent(event);
      }),
    );
  }
}

if (!customElements.get("ha-kid-tracker-card"))
  customElements.define("ha-kid-tracker-card", HAKidTrackerCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha-kid-tracker-card",
  name: "HA Kid Tracker Card",
  description: "Komplet personkort med lokation, hjemtur, aktivitet, batterier, GPS og enhedsstatus",
  preview: true,
});
console.info(
  `%c HA KID TRACKER CARD %c v${VERSION} `,
  "color:white;background:#357fc4;font-weight:700",
  "color:#69c4ff;background:#161b22",
);
