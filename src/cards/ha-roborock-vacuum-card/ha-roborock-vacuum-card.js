const VERSION = "0.4.0";

class HARoborockVacuumCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._sig = "";
    this._selectedRooms = new Set();
  }
  static getStubConfig() {
    return {
      title: "Robotstøvsuger",
      vacuum: "vacuum.robot_vacuum",
      map_image: "image.robot_vacuum_map",
      battery: "sensor.robot_vacuum_battery",
      status_text: "sensor.robot_vacuum_status_2",
      vacuum_error: "sensor.robot_vacuum_vacuum_error",
      cleaning_area: "sensor.robot_vacuum_cleaning_area",
      cleaning_time: "sensor.robot_vacuum_cleaning_time",
      cleaning_progress: "sensor.robot_vacuum_cleaning_progress",
      current_room: "sensor.robot_vacuum_nuvaerende_rum",
      last_clean_start: "sensor.robot_vacuum_sidste_rengoringsstart",
      last_clean_end: "sensor.robot_vacuum_sidste_rengoringsafslutning",
      total_area: "sensor.robot_vacuum_total_cleaning_area",
      total_count: "sensor.robot_vacuum_total_cleaning_count",
      total_time: "sensor.robot_vacuum_total_cleaning_time",
      dock_error: "sensor.robot_vacuum_dock_dock_error",
      dock_mop_drying: "sensor.robot_vacuum_dock_mop_drying_remaining_time",
      filter_left: "sensor.robot_vacuum_filter_time_left",
      main_brush_left: "sensor.robot_vacuum_main_brush_time_left",
      side_brush_left: "sensor.robot_vacuum_side_brush_time_left",
      sensor_left: "sensor.robot_vacuum_sensor_time_left",
      dock_maintenance_brush: "sensor.robot_vacuum_dock_maintenance_brush_time_left",
      dock_strainer: "sensor.robot_vacuum_dock_strainer_time_left",
      mop_attached: "binary_sensor.robot_vacuum_mop_attached",
      water_box_attached: "binary_sensor.robot_vacuum_water_box_attached",
      water_shortage: "binary_sensor.robot_vacuum_water_shortage",
      mop_mode: "select.robot_vacuum_mop_mode",
      mop_intensity: "select.robot_vacuum_mop_intensity",
      dock_empty_mode: "select.robot_vacuum_dock_empty_mode",
      cleaning_mode: "select.robot_vacuum_cleaning_mode",
      volume: "number.robot_vacuum_volume",
      child_lock: "switch.robot_vacuum_child_lock",
      dnd_switch: "switch.robot_vacuum_dnd_switch",
      dock_light: "switch.robot_vacuum_dock_status_indicator_light",
      dock_dust_emptying: "switch.robot_vacuum_dock_dust_emptying",
      dnd_begin: "time.robot_vacuum_do_not_disturb_begin",
      dnd_end: "time.robot_vacuum_do_not_disturb_end",
      quick_clean: [
        { entity: "button.robot_vacuum_full_cleaning", name: "Hele huset" },
        { entity: "button.robot_vacuum_kokken_stuer", name: "Køkken & stuer" },
        { entity: "button.robot_vacuum_bedrooms", name: "Værelser" },
      ],
      rooms: [],
    };
  }
  setConfig(config) {
    if (!config?.vacuum) throw new Error("Kortet kræver en vacuum-entity");
    this._config = { title: "Robotstøvsuger", rooms: [], quick_clean: [], ...config };
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    const ids = [
      this._config.vacuum,
      this._config.map_image,
      this._config.battery,
      this._config.status_text,
      this._config.vacuum_error,
      this._config.cleaning_area,
      this._config.cleaning_time,
      this._config.cleaning_progress,
      this._config.current_room,
      this._config.last_clean_start,
      this._config.last_clean_end,
      this._config.total_area,
      this._config.total_count,
      this._config.total_time,
      this._config.dock_error,
      this._config.dock_mop_drying,
      this._config.filter_left,
      this._config.main_brush_left,
      this._config.side_brush_left,
      this._config.sensor_left,
      this._config.dock_maintenance_brush,
      this._config.dock_strainer,
      this._config.mop_attached,
      this._config.water_box_attached,
      this._config.water_shortage,
      this._config.mop_mode,
      this._config.mop_intensity,
      this._config.dock_empty_mode,
      this._config.cleaning_mode,
      this._config.volume,
      this._config.child_lock,
      this._config.dnd_switch,
      this._config.dock_light,
      this._config.dock_dust_emptying,
      this._config.dnd_begin,
      this._config.dnd_end,
      ...(this._config.quick_clean || []).map((q) => q.entity),
    ].filter(Boolean);
    const sig = JSON.stringify(
      ids.map((id) => [id, hass?.states?.[id]?.state]),
    );
    if (sig !== this._sig) {
      this._sig = sig;
      this._render();
    }
  }
  getCardSize() {
    return 19;
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
  _num(id) {
    const n = Number(this._s(id));
    return Number.isFinite(n) ? n : undefined;
  }
  _on(id) {
    return this._s(id) === "on";
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
    const s = this._s(id);
    if (!s) return "—";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("da-DK", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  _statusLabel(state) {
    const map = {
      cleaning: "Rengør",
      docked: "Ladestation",
      idle: "Klar",
      paused: "Pause",
      returning: "På vej hjem",
      error: "Fejl",
      cleaning_spot: "Pletrengøring",
      emptying_the_bin: "Tømmer beholder",
      washing_the_mop: "Vasker moppe",
      drying_the_mop: "Tørrer moppe",
    };
    return map[state] || state || "Ukendt";
  }
  _room(areaId) {
    const area = this._hass?.areas?.[areaId];
    return { id: areaId, name: area?.name || areaId, picture: area?.picture };
  }
  _consumable(label, hoursLeft) {
    const warn = Number.isFinite(hoursLeft) && hoursLeft <= 0;
    const pct = Number.isFinite(hoursLeft)
      ? Math.max(0, Math.min(100, (hoursLeft / 300) * 100))
      : 0;
    return `<div class="consumable ${warn ? "warn" : ""}">
      <div class="consumable-head"><span>${label}</span><b>${Number.isFinite(hoursLeft) ? `${this._fmt(hoursLeft)} t` : "—"}</b></div>
      <div class="track"><i style="width:${pct}%"></i></div>
    </div>`;
  }
  _switchChip(id, label, icon) {
    if (!id) return "";
    const on = this._on(id);
    return `<button class="chip switch ${on ? "" : "off"}" data-switch="${this._esc(id)}"><ha-icon icon="${icon}"></ha-icon>${label} ${on ? "til" : "fra"}</button>`;
  }
  _call(service, data = {}) {
    if (!this._config.vacuum) return;
    const [domain] = this._config.vacuum.split(".");
    this._hass?.callService(domain, service, {
      entity_id: this._config.vacuum,
      ...data,
    });
  }
  _toggleRoom(id) {
    if (this._selectedRooms.has(id)) this._selectedRooms.delete(id);
    else this._selectedRooms.add(id);
    this._render();
  }
  _cleanSelected() {
    if (!this._selectedRooms.size) return;
    this._hass?.callService("vacuum", "clean_area", {
      entity_id: this._config.vacuum,
      area_id: [...this._selectedRooms],
    });
  }
  _render() {
    if (!this.shadowRoot) return;
    const vacuum = this._e(this._config.vacuum);
    const state = vacuum?.state || "unknown";
    const fanSpeed = vacuum?.attributes?.fan_speed;
    const fanSpeedList = (vacuum?.attributes?.fan_speed_list || []).filter(
      (f) => f !== "off" && f !== "custom",
    );
    const battery = this._num(this._config.battery);
    const mapUrl = this._e(this._config.map_image)?.attributes
      ?.entity_picture;
    const active = ["cleaning", "returning", "cleaning_spot"].includes(state);
    const rooms = (this._config.rooms || []).map((r) =>
      this._room(typeof r === "string" ? r : r.area_id),
    );
    const vacuumError = this._config.vacuum_error
      ? this._s(this._config.vacuum_error)
      : undefined;
    const dockError = this._s(this._config.dock_error);
    const hasError =
      (vacuumError && !["none", "ok"].includes(vacuumError)) ||
      (dockError && dockError !== "ok");
    const quickClean = this._config.quick_clean || [];
    this.shadowRoot.innerHTML = `<style>
      :host{display:block;--accent:var(--dashboard-accent, var(--primary-color, #62b5ff));--good:var(--dashboard-success, var(--success-color, #54d9aa));--warn:var(--dashboard-warning, var(--warning-color, #ffbd59));--danger:var(--dashboard-danger, var(--error-color, #ff667a));--edge:var(--dashboard-border-neutral, var(--divider-color, rgba(127,145,165,.2)))}
      *{box-sizing:border-box}
      ha-card{position:relative;overflow:hidden;padding:16px;border:var(--ha-card-border-width,1px) solid var(--ha-card-border-color,var(--edge));border-radius:20px;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 5%,transparent),transparent 38%),var(--ha-card-background,var(--card-background-color));color:var(--primary-text-color);box-shadow:none}
      ha-card.has-error{border-left-color:var(--danger);animation:pulse-danger 1.8s ease-in-out infinite}
      @keyframes pulse-danger{0%,100%{box-shadow:var(--ha-card-box-shadow)}50%{box-shadow:0 0 0 6px color-mix(in srgb,var(--danger) 22%,transparent),var(--ha-card-box-shadow)}}
      @media(prefers-reduced-motion:reduce){ha-card.has-error{animation:none}}
      .head{display:flex;align-items:center;justify-content:space-between;gap:12px}
      .identity{display:flex;align-items:center;gap:10px;min-width:0}
      .icon{display:grid;place-items:center;width:40px;height:40px;flex:0 0 40px;border-radius:12px;background:color-mix(in srgb,var(--accent) 15%,transparent);color:var(--accent)}
      .icon ha-icon{--mdc-icon-size:24px}
      .identity div{min-width:0}
      .identity strong{display:block;font-size:16px}
      .status{display:flex;align-items:center;gap:6px;color:var(--secondary-text-color);font-size:11px;font-weight:700}
      .status i{width:7px;height:7px;border-radius:50%;background:${active ? "var(--good)" : state === "error" || hasError ? "var(--danger)" : "var(--secondary-text-color)"};box-shadow:0 0 8px currentColor}
      .battery{text-align:right}
      .battery strong{font-size:20px}
      .battery span{display:block;color:var(--secondary-text-color);font-size:10px}
      .map{margin-top:12px;border-radius:14px;overflow:hidden;background:rgba(0,0,0,.15);height:350px;display:flex;align-items:center;justify-content:center}
      .map img{display:block;width:100%;height:100%;object-fit:contain;object-position:center;transform:scale(1.12)}
      .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}
      .stat{padding:8px;border:1px solid color-mix(in srgb,var(--accent) 16%,transparent);border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--accent);border-radius:10px;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 6%,transparent),transparent 55%);box-shadow:0 4px 12px rgba(0,0,0,.08);text-align:center}
      .stat span{display:block;color:var(--secondary-text-color);font-size:8px;text-transform:uppercase;font-weight:700}
      .stat b{display:block;margin-top:3px;font-size:13px}
      .last-clean{margin-top:8px;display:flex;justify-content:space-between;gap:8px;color:var(--secondary-text-color);font-size:9px}
      .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
      .chip{display:flex;align-items:center;gap:5px;padding:5px 10px;border-radius:10px;font-size:10px;font-weight:700;background:color-mix(in srgb,var(--good) 12%,transparent);color:var(--good);border:0;cursor:default;font-family:inherit}
      .chip.off{background:color-mix(in srgb,var(--secondary-text-color) 10%,transparent);color:var(--secondary-text-color)}
      .chip.warn{background:color-mix(in srgb,var(--warn) 16%,transparent);color:var(--warn)}
      .chip.switch{cursor:pointer}
      .chip ha-icon{--mdc-icon-size:14px}
      .section-title{margin:14px 0 8px;color:var(--secondary-text-color);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
      .consumables{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
      .consumable-head{display:flex;justify-content:space-between;font-size:10px;color:var(--secondary-text-color)}
      .consumable.warn .consumable-head b{color:var(--danger)}
      .track{height:5px;margin-top:4px;border-radius:6px;overflow:hidden;background:rgba(127,145,165,.18)}
      .track i{display:block;height:100%;background:linear-gradient(90deg,var(--good),var(--accent))}
      .consumable.warn .track i{background:var(--danger)}
      .fan-row{display:flex;gap:6px;flex-wrap:wrap}
      .fan-row button{flex:1;min-width:60px;padding:8px 4px;border:1px solid color-mix(in srgb,var(--accent) 16%,var(--edge));border-radius:10px;background:linear-gradient(155deg,rgba(255,255,255,.09),rgba(255,255,255,.018) 58%,rgba(0,0,0,.16));color:var(--secondary-text-color);font-size:10px;font-weight:700;text-transform:capitalize;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.10),0 5px 12px rgba(0,0,0,.16);transition:.2s ease}
      .fan-row button.active{border-color:var(--accent);background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 32%,transparent),color-mix(in srgb,var(--accent) 10%,transparent));color:var(--primary-text-color);box-shadow:inset 0 1px 0 color-mix(in srgb,var(--accent) 35%,white),0 7px 18px color-mix(in srgb,var(--accent) 22%,transparent);transform:translateY(-1px)}
      .selects{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
      .selects label{display:block;color:var(--secondary-text-color);font-size:9px;font-weight:700;margin-bottom:4px;text-transform:uppercase}
      .selects select{width:100%;padding:7px;border:1px solid color-mix(in srgb,var(--accent) 16%,var(--edge));border-radius:8px;background:transparent;color:var(--primary-text-color)}
      .dnd-row{display:flex;align-items:center;gap:10px}
      .dnd-row label{color:var(--secondary-text-color);font-size:9px;font-weight:700;text-transform:uppercase}
      .dnd-row input{padding:6px;border:1px solid color-mix(in srgb,var(--accent) 16%,var(--edge));border-radius:8px;background:transparent;color:var(--primary-text-color)}
      .quick-row{display:flex;flex-wrap:wrap;gap:6px}
      .quick-row button{flex:1;min-width:100px;padding:9px 6px;border:1px solid color-mix(in srgb,var(--accent) 16%,var(--edge));border-radius:10px;background:linear-gradient(155deg,rgba(255,255,255,.09),rgba(255,255,255,.018) 58%,rgba(0,0,0,.16));color:var(--primary-text-color);font-size:10px;font-weight:700;cursor:pointer;display:flex;box-shadow:inset 0 1px 0 rgba(255,255,255,.10),0 6px 14px rgba(0,0,0,.18);transition:.2s ease;align-items:center;justify-content:center;gap:6px}
      .quick-row button:hover{border-color:var(--accent)}
      .quick-row ha-icon{--mdc-icon-size:15px;color:var(--accent)}
      .rooms{display:grid;grid-template-columns:repeat(auto-fit,minmax(105px,1fr));gap:8px}.rooms+.clean-selected{position:sticky;bottom:92px;z-index:4;box-shadow:0 10px 28px rgba(0,0,0,.35)}
      .room{position:relative;overflow:hidden;height:64px;border:2px solid var(--edge);border-radius:12px;background-size:cover;background-position:center;cursor:pointer;display:flex;align-items:flex-end;padding:6px;color:#fff;font-size:10px;font-weight:700;text-shadow:0 1px 3px rgba(0,0,0,.6)}
      .room:before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 40%,rgba(0,0,0,.55));z-index:0}
      .room span{position:relative;z-index:1}
      .room.selected{border-color:var(--accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 55%,transparent)}
      .room.no-pic{background:radial-gradient(circle at 82% 18%,color-mix(in srgb,var(--accent) 24%,transparent),transparent 36%),color-mix(in srgb,var(--accent) 8%,transparent);color:var(--primary-text-color);text-shadow:none}
      .clean-selected{width:100%;margin-top:10px;padding:10px;border:0;border-radius:12px;background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 72%,white),var(--accent) 48%,color-mix(in srgb,var(--accent) 72%,black));color:#fff;font-weight:800;font-size:12px;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 10px 24px color-mix(in srgb,var(--accent) 32%,transparent);text-shadow:0 1px 2px rgba(0,0,0,.25);transition:.2s ease}
      .clean-selected:not(:disabled):hover{transform:translateY(-2px);box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 14px 28px color-mix(in srgb,var(--accent) 38%,transparent)}.clean-selected:not(:disabled):active{transform:translateY(1px)}.clean-selected:disabled{opacity:.38;cursor:default;box-shadow:inset 0 1px 0 rgba(255,255,255,.12)}
      .controls{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:14px}
      .controls button{display:flex;flex-direction:column;align-items:center;gap:4px;padding:9px 2px;border:1px solid color-mix(in srgb,var(--accent) 16%,var(--edge));border-radius:10px;background:linear-gradient(155deg,rgba(255,255,255,.085),rgba(255,255,255,.015) 60%,rgba(0,0,0,.18));color:var(--secondary-text-color);font-size:9px;font-weight:700;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.10),0 5px 12px rgba(0,0,0,.17);transition:.2s ease}.controls button:hover{transform:translateY(-2px);box-shadow:inset 0 1px 0 rgba(255,255,255,.15),0 9px 18px rgba(0,0,0,.25)}.controls button:active{transform:translateY(1px)
      .controls button:hover{border-color:var(--accent);color:var(--primary-text-color)}
      .controls button.primary{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--primary-text-color)}
      .controls ha-icon{--mdc-icon-size:18px}
      .volume-row{display:flex;align-items:center;gap:10px;margin-top:12px}
      .volume-row ha-icon{--mdc-icon-size:18px;color:var(--secondary-text-color)}
      .volume-row input{flex:1}
      @media(max-width:700px){.map{height:270px}.stats{grid-template-columns:repeat(2,1fr)}.selects{grid-template-columns:1fr}}
    </style>
    <ha-card class="${hasError ? "has-error" : ""}">
      <div class="head">
        <div class="identity">
          <span class="icon"><ha-icon icon="mdi:robot-vacuum"></ha-icon></span>
          <div>
            <strong>${this._esc(this._config.title)}</strong>
            <span class="status"><i></i>${this._esc(this._config.status_text ? this._s(this._config.status_text) || this._statusLabel(state) : this._statusLabel(state))}</span>
          </div>
        </div>
        <div class="battery"><strong>${this._fmt(battery)}%</strong><span>Batteri</span></div>
      </div>
      ${mapUrl ? `<div class="map"><img src="${this._esc(mapUrl)}" alt="Kort"></div>` : ""}
      <div class="stats">
        <div class="stat"><span>Areal</span><b>${this._fmt(this._num(this._config.cleaning_area), 1)} m²</b></div>
        <div class="stat"><span>Tid</span><b>${this._fmt(this._num(this._config.cleaning_time))} min</b></div>
        <div class="stat"><span>Fremgang</span><b>${this._fmt(this._num(this._config.cleaning_progress))}%</b></div>
        <div class="stat"><span>Rum nu</span><b>${this._esc(this._s(this._config.current_room) || "—")}</b></div>
      </div>
      ${
        rooms.length
          ? `<div class="section-title">Vælg rum</div><div class="rooms">${rooms
              .map(
                (r) =>
                  `<button class="room ${this._selectedRooms.has(r.id) ? "selected" : ""} ${r.picture ? "" : "no-pic"}" data-room="${this._esc(r.id)}" style="${r.picture ? `background-image:url('${this._esc(r.picture)}')` : ""}"><span>${this._esc(r.name)}</span></button>`,
              )
              .join(
                "",
              )}</div><button class="clean-selected" ${this._selectedRooms.size ? "" : "disabled"} data-clean-selected>Rengør ${this._selectedRooms.size ? `${this._selectedRooms.size} valgte rum` : "valgte rum"}</button>`
          : ""
      }
      ${
        this._config.last_clean_start || this._config.last_clean_end
          ? `<div class="last-clean"><span>Start: ${this._time(this._config.last_clean_start)}</span><span>Slut: ${this._time(this._config.last_clean_end)}</span></div>`
          : ""
      }
      ${
        this._config.total_area
          ? `<div class="section-title">Livstid</div><div class="stats">
        <div class="stat"><span>Total areal</span><b>${this._fmt(this._num(this._config.total_area), 0)} m²</b></div>
        <div class="stat"><span>Antal gange</span><b>${this._fmt(this._num(this._config.total_count))}</b></div>
        <div class="stat"><span>Total tid</span><b>${this._fmt((this._num(this._config.total_time) || 0) / 60, 1)} t</b></div>
        <div class="stat"><span>Moppe tørrer</span><b>${this._num(this._config.dock_mop_drying) !== undefined ? `${this._fmt(this._num(this._config.dock_mop_drying))} min` : "—"}</b></div>
      </div>`
          : ""
      }
      <div class="chips">
        <span class="chip ${this._on(this._config.mop_attached) ? "" : "off"}"><ha-icon icon="mdi:squeegee"></ha-icon>Moppe ${this._on(this._config.mop_attached) ? "på" : "af"}</span>
        <span class="chip ${this._on(this._config.water_box_attached) ? "" : "off"}"><ha-icon icon="mdi:water"></ha-icon>Vandtank ${this._on(this._config.water_box_attached) ? "på" : "af"}</span>
        ${this._on(this._config.water_shortage) ? `<span class="chip warn"><ha-icon icon="mdi:water-alert"></ha-icon>Lav vandstand</span>` : ""}
        ${hasError ? `<span class="chip warn"><ha-icon icon="mdi:robot-vacuum-alert"></ha-icon>${this._esc(vacuumError)}</span>` : ""}
        ${this._s(this._config.dock_error) && this._s(this._config.dock_error) !== "ok" ? `<span class="chip warn"><ha-icon icon="mdi:alert"></ha-icon>${this._esc(this._s(this._config.dock_error))}</span>` : ""}
        ${this._switchChip(this._config.child_lock, "Børnelås", "mdi:lock")}
        ${this._switchChip(this._config.dnd_switch, "Forstyr ikke", "mdi:sleep")}
        ${this._switchChip(this._config.dock_light, "Statuslys", "mdi:led-outline")}
        ${this._switchChip(this._config.dock_dust_emptying, "Auto-tømning", "mdi:delete-empty")}
      </div>
      ${
        this._config.dnd_begin && this._config.dnd_end
          ? `<div class="section-title">Forstyr ikke-periode</div><div class="dnd-row">
        <label>Fra</label><input type="time" data-time="${this._esc(this._config.dnd_begin)}" value="${this._esc(this._s(this._config.dnd_begin) || "")}">
        <label>Til</label><input type="time" data-time="${this._esc(this._config.dnd_end)}" value="${this._esc(this._s(this._config.dnd_end) || "")}">
      </div>`
          : ""
      }
      ${
        fanSpeedList.length
          ? `<div class="section-title">Sugestyrke</div><div class="fan-row">${fanSpeedList
              .map(
                (f) =>
                  `<button data-fan="${this._esc(f)}" class="${f === fanSpeed ? "active" : ""}">${this._esc(f.replace("_", " "))}</button>`,
              )
              .join("")}</div>`
          : ""
      }
      ${
        this._config.mop_mode || this._config.mop_intensity || this._config.cleaning_mode
          ? `<div class="section-title">Rengøring</div><div class="selects">
        ${this._config.cleaning_mode ? `<div><label>Type</label><select data-select="${this._esc(this._config.cleaning_mode)}">${(this._e(this._config.cleaning_mode)?.attributes?.options || []).map((o) => `<option value="${this._esc(o)}" ${o === this._s(this._config.cleaning_mode) ? "selected" : ""}>${this._esc(o)}</option>`).join("")}</select></div>` : ""}
        ${this._config.mop_mode ? `<div><label>Moppe mode</label><select data-select="${this._esc(this._config.mop_mode)}">${(this._e(this._config.mop_mode)?.attributes?.options || []).map((o) => `<option value="${this._esc(o)}" ${o === this._s(this._config.mop_mode) ? "selected" : ""}>${this._esc(o)}</option>`).join("")}</select></div>` : ""}
        ${this._config.mop_intensity ? `<div><label>Moppe intensitet</label><select data-select="${this._esc(this._config.mop_intensity)}">${(this._e(this._config.mop_intensity)?.attributes?.options || []).map((o) => `<option value="${this._esc(o)}" ${o === this._s(this._config.mop_intensity) ? "selected" : ""}>${this._esc(o)}</option>`).join("")}</select></div>` : ""}
        ${this._config.dock_empty_mode ? `<div><label>Auto-tømning mode</label><select data-select="${this._esc(this._config.dock_empty_mode)}">${(this._e(this._config.dock_empty_mode)?.attributes?.options || []).map((o) => `<option value="${this._esc(o)}" ${o === this._s(this._config.dock_empty_mode) ? "selected" : ""}>${this._esc(o)}</option>`).join("")}</select></div>` : ""}
      </div>`
          : ""
      }
      ${
        this._config.filter_left
          ? `<div class="section-title">Vedligehold</div><div class="consumables">
        ${this._consumable("Filter", this._num(this._config.filter_left))}
        ${this._consumable("Hovedbørste", this._num(this._config.main_brush_left))}
        ${this._consumable("Sidebørste", this._num(this._config.side_brush_left))}
        ${this._consumable("Sensor", this._num(this._config.sensor_left))}
        ${this._config.dock_maintenance_brush ? this._consumable("Dock børste", this._num(this._config.dock_maintenance_brush)) : ""}
        ${this._config.dock_strainer ? this._consumable("Dock si", this._num(this._config.dock_strainer)) : ""}
      </div>`
          : ""
      }
      ${
        quickClean.length
          ? `<div class="section-title">Hurtig rengøring</div><div class="quick-row">${quickClean
              .map(
                (q) =>
                  `<button data-quick="${this._esc(q.entity)}"><ha-icon icon="mdi:broom"></ha-icon>${this._esc(q.name)}</button>`,
              )
              .join("")}</div>`
          : ""
      }
      ${
        this._config.volume
          ? `<div class="volume-row"><ha-icon icon="mdi:volume-high"></ha-icon><input type="range" min="0" max="100" value="${this._num(this._config.volume) ?? 50}" data-volume></div>`
          : ""
      }
      <div class="controls">
        <button data-action="start"><ha-icon icon="mdi:play"></ha-icon>Start</button>
        <button data-action="pause"><ha-icon icon="mdi:pause"></ha-icon>Pause</button>
        <button data-action="stop"><ha-icon icon="mdi:stop"></ha-icon>Stop</button>
        <button class="primary" data-action="return_to_base"><ha-icon icon="mdi:home-import-outline"></ha-icon>Hjem</button>
        <button data-action="locate"><ha-icon icon="mdi:map-marker-radius"></ha-icon>Find</button>
      </div>
    </ha-card>`;
    this.shadowRoot.querySelectorAll("[data-action]").forEach((btn) =>
      btn.addEventListener("click", () => this._call(btn.dataset.action)),
    );
    this.shadowRoot.querySelectorAll("[data-fan]").forEach((btn) =>
      btn.addEventListener("click", () =>
        this._call("set_fan_speed", { fan_speed: btn.dataset.fan }),
      ),
    );
    this.shadowRoot.querySelectorAll("[data-select]").forEach((sel) =>
      sel.addEventListener("change", () =>
        this._hass?.callService("select", "select_option", {
          entity_id: sel.dataset.select,
          option: sel.value,
        }),
      ),
    );
    this.shadowRoot.querySelectorAll("[data-switch]").forEach((btn) =>
      btn.addEventListener("click", () =>
        this._hass?.callService("switch", "toggle", {
          entity_id: btn.dataset.switch,
        }),
      ),
    );
    this.shadowRoot.querySelectorAll("[data-time]").forEach((input) =>
      input.addEventListener("change", () =>
        this._hass?.callService("time", "set_value", {
          entity_id: input.dataset.time,
          time: input.value,
        }),
      ),
    );
    this.shadowRoot.querySelectorAll("[data-quick]").forEach((btn) =>
      btn.addEventListener("click", () =>
        this._hass?.callService("button", "press", {
          entity_id: btn.dataset.quick,
        }),
      ),
    );
    const volumeInput = this.shadowRoot.querySelector("[data-volume]");
    volumeInput?.addEventListener("change", () =>
      this._hass?.callService("number", "set_value", {
        entity_id: this._config.volume,
        value: volumeInput.value,
      }),
    );
    this.shadowRoot.querySelectorAll("[data-room]").forEach((btn) =>
      btn.addEventListener("click", () => this._toggleRoom(btn.dataset.room)),
    );
    this.shadowRoot
      .querySelector("[data-clean-selected]")
      ?.addEventListener("click", () => this._cleanSelected());
  }
}

if (!customElements.get("ha-roborock-vacuum-card"))
  customElements.define("ha-roborock-vacuum-card", HARoborockVacuumCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha-roborock-vacuum-card",
  name: "HA Roborock Vacuum Card",
  description: "Fuldt Roborock-kort med kort, forbrugsdele og rum-valg",
  preview: true,
});
console.info(
  `%c HA ROBOROCK VACUUM CARD %c v${VERSION} `,
  "color:white;background:#357fc4;font-weight:700",
  "color:#69c4ff;background:#161b22",
);
