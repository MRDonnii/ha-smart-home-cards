const VERSION = "0.8.63";

const PRESETS = {
  "home_energy": {
    "name": "Hus",
    "icon": "mdi:home-lightning-bolt-outline",
    "color": "var(--state-info-icon, var(--info-color, #38bdf8))",
    "entity": "sensor.home_energy_entity",
    "vehicle_power_entity": "sensor.home_energy_vehicle_power",
    "phase_entities": [
      "sensor.home_energy_phase_1",
      "sensor.home_energy_phase_2",
      "sensor.home_energy_phase_3"
    ],
    "phase_max": 5833,
    "daily_entity": "sensor.home_energy_daily",
    "navigation_path": "/energi-overblik/energy",
    "value_unit": "kW"
  },
  "ev": {
    "name": "Bil",
    "icon": "mdi:car-electric-outline",
    "color": "var(--state-on-icon, var(--success-color, #20e3a2))",
    "entity": "sensor.ev_entity",
    "power_entity": "sensor.ev_power",
    "phase_entities": [
      "sensor.ev_phase_1",
      "sensor.ev_phase_2",
      "sensor.ev_phase_3"
    ],
    "phase_max_entity": "sensor.ev_phase_max",
    "phase_max": 15.94,
    "daily_entity": "sensor.ev_daily",
    "session_energy_entity": "sensor.ev_session_energy",
    "schedule_entity": "sensor.ev_schedule",
    "charger_state_entity": "sensor.ev_charger_state",
    "cable_entity": "binary_sensor.ev_cable",
    "plug_mode_entity": "sensor.ev_plug_mode",
    "vehicle_plug_entity": "binary_sensor.ev_vehicle_plug",
    "navigation_path": "/teknik-overblik/tesla",
    "popup": {
      "name": "Bil",
      "vehicle": {
        "model": "Tesla Model 3 RWD",
        "image": "/local/tesla/dashboard/model-3-rwd-charcoal.webp"
      },
      "entities": {
        "battery": "sensor.ev_popup_entities_battery",
        "range": "sensor.ev_popup_entities_range",
        "odometer": "sensor.ev_popup_entities_odometer",
        "temperature_inside": "sensor.ev_popup_entities_temperature_inside",
        "temperature_outside": "sensor.ev_popup_entities_temperature_outside",
        "last_update": "sensor.ev_popup_entities_last_update",
        "online": "binary_sensor.ev_popup_entities_online",
        "asleep": "binary_sensor.ev_popup_entities_asleep",
        "charger": "binary_sensor.ev_popup_entities_charger",
        "charging": "binary_sensor.ev_popup_entities_charging",
        "charging_rate": "sensor.ev_popup_entities_charging_rate",
        "charging_finish_time": "sensor.ev_popup_entities_charging_finish_time",
        "charging_time_remaining": "sensor.ev_popup_entities_charging_time_remaining",
        "charging_price_estimate": "sensor.ev_popup_entities_charging_price_estimate",
        "charger_power": "sensor.ev_popup_entities_charger_power",
        "charger_mode": "sensor.ev_popup_entities_charger_mode",
        "best_charge_start": "sensor.ev_popup_entities_best_charge_start",
        "best_charge_end": "sensor.ev_popup_entities_best_charge_end",
        "best_charge_price": "sensor.ev_popup_entities_best_charge_price",
        "charge_minutes_needed": "sensor.ev_popup_entities_charge_minutes_needed",
        "missing_wall_kwh": "sensor.ev_popup_entities_missing_wall_kwh",
        "monta_state": "sensor.ev_popup_entities_monta_state",
        "monta_last_charge": "sensor.ev_popup_entities_monta_last_charge",
        "monta_charge_energy": "sensor.ev_popup_entities_monta_charge_energy",
        "monta_cable_connected": "binary_sensor.ev_popup_entities_monta_cable_connected"
      },
      "controls": {
        "start_charge": {
          "entity": "script.ev_popup_controls_start_charge_entity"
        },
        "stop_charge": {
          "entity": "script.ev_popup_controls_stop_charge_entity"
        },
        "target_soc": {
          "entity": "input_number.ev_popup_controls_target_soc_entity"
        },
        "deadline": {
          "entity": "input_datetime.tesla_ready_by_time"
        }
      },
      "layout": "charge",
      "navigation_path": "/teknik-overblik/tesla",
      "refresh_entities": [
        "sensor.ev_popup_refresh_1"
      ]
    },
    "value_unit": "%"
  },
  "electricity_price": {
    "name": "Strømpris",
    "icon": "mdi:cash-multiple",
    "color": "var(--state-on-icon, var(--success-color, #20e3a2))",
    "entity": "sensor.electricity_price_entity",
    "navigation_path": "/energi-overblik/pris-eksempler",
    "value_unit": "kr"
  },
  "pool": {
    "name": "Pool",
    "icon": "mdi:pool",
    "color": "var(--state-info-icon, var(--info-color, #38bdf8))",
    "entity": "sensor.pool_entity",
    "status_entity": "sensor.pool_status",
    "active_entity": "binary_sensor.pool_active",
    "daily_entity": "sensor.pool_daily",
    "navigation_path": "/hjem-overblik/pool",
    "value_unit": "°C"
  },
  "pet": {
    "name": "Foder",
    "icon": "mdi:dog",
    "color": "var(--state-on-icon, var(--success-color, #20e3a2))",
    "entity": "select.pet_entity",
    "error_entity": "binary_sensor.pet_error",
    "status_entities": [
      "input_select.pet_status_1",
      "input_select.pet_status_2",
      "input_select.pet_status_3"
    ],
    "navigation_path": "pet_navigation_path"
  },
  "security": {
    "name": "Sikkerhed",
    "icon": "mdi:shield-home",
    "color": "var(--state-on-icon, var(--success-color, #20e3a2))",
    "entity": "lock.security_entity",
    "lock_entities": [
      "lock.security_lock_1",
      "lock.security_lock_2",
      "lock.security_lock_3"
    ],
    "terrace_lock_entity": "binary_sensor.security_terrace_lock",
    "gate_lock_entity": "binary_sensor.security_gate_lock",
    "gate_lock_inverted": true,
    "open_count_entity": "sensor.security_open_count",
    "alarm_entity": "alarm_control_panel.security_alarm",
    "secondary_alarm_entity": "alarm_control_panel.security_secondary_alarm",
    "door_entities": [
      "binary_sensor.security_door_1",
      "binary_sensor.security_door_2",
      "binary_sensor.security_door_3",
      "binary_sensor.security_door_4",
      "binary_sensor.security_door_5",
      "binary_sensor.security_door_6",
      "binary_sensor.security_door_7"
    ],
    "navigation_path": "/hjem-overblik/sikkerhed"
  },
  "heating": {
    "name": "Varme",
    "icon": "mdi:radiator",
    "color": "var(--state-info-icon, var(--info-color, #38bdf8))",
    "entity": "sensor.heating_entity",
    "heating_entity": "sensor.heating_heating",
    "pressure_entity": "sensor.heating_pressure",
    "source_entity": "sensor.heating_source",
    "daily_entity": "sensor.heating_daily",
    "water_regulator_entity": "sensor.heating_water_regulator",
    "blocked_by_entity": "sensor.heating_blocked_by",
    "valve_entity": "sensor.heating_valve",
    "navigation_path": "/energi-overblik/varme-center"
  },
  "settings": {
    "name": "Indstillinger",
    "icon": "mdi:cog",
    "color": "var(--state-info-icon, var(--info-color, #38bdf8))",
    "entity": "input_boolean.settings_entity",
    "off_count_entity": "sensor.settings_off_count",
    "appliance_entities": [
      "binary_sensor.settings_appliance_1",
      "binary_sensor.settings_appliance_2",
      "binary_sensor.settings_appliance_3"
    ],
    "navigation_path": "/hjem-overblik/indstillinger"
  }
};

class HaHomeStatusCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._sig = "";
    this._evCycle = 0;
  }

  connectedCallback() {
    this._cycleTimer = setInterval(() => {
      const type = this.config?.preset || this.config?.type_name;
      if (type === "ev") {
        this._evCycle = (this._evCycle + 1) % 2;
        this.render();
      }
    }, 4000);
  }

  setConfig(config) {
    if (!config.preset && !config.entity)
      throw new Error("Vælg preset eller entity");
    this.config = { ...config };
    this._sig = "";
    this._rendered = false;
    this.render();
  }

  _watchedIds() {
    const type = this.config?.preset || this.config?.type_name || "entity";
    const cfg = { ...(PRESETS[type] || {}), ...this.config };
    return [
      cfg.entity,
      cfg.vehicle_power_entity,
      cfg.power_entity,
      cfg.phase_max_entity,
      cfg.daily_entity,
      cfg.session_energy_entity,
      cfg.schedule_entity,
      cfg.charger_state_entity,
      cfg.cable_entity,
      cfg.fallback_daily_entity,
      cfg.status_entity,
      cfg.active_entity,
      cfg.error_entity,
      cfg.terrace_lock_entity,
      cfg.gate_lock_entity,
      cfg.open_count_entity,
      cfg.alarm_entity,
      cfg.secondary_alarm_entity,
      cfg.heating_entity,
      cfg.pressure_entity,
      cfg.source_entity,
      cfg.water_regulator_entity,
      cfg.blocked_by_entity,
      cfg.off_count_entity,
      cfg.secondary_entity,
      ...(cfg.phase_entities || []),
      ...(cfg.status_entities || []),
      ...(cfg.lock_entities || []),
      ...(cfg.door_entities || []),
      ...(cfg.appliance_entities || []),
      "binary_sensor.pool_person_i_vandet",
      "sensor.ac_combined_state",
    ].filter(Boolean);
  }

  set hass(hass) {
    this._hass = hass;
    if (this._popupCard) this._popupCard.hass = hass;
    const ids = this._watchedIds();
    const sig = JSON.stringify(
      ids.map((id) => [id, hass?.states?.[id]?.state]),
    );
    if (sig !== this._sig) {
      this._sig = sig;
      this.render();
    }
  }

  state(id) {
    return id ? this._hass?.states?.[id] : undefined;
  }
  text(id, fallback = "—") {
    const s = this.state(id)?.state;
    return !s || ["unknown", "unavailable"].includes(s) ? fallback : s;
  }
  number(id) {
    return Number(String(this.state(id)?.state ?? "").replace(",", "."));
  }
  on(id) {
    return this.state(id)?.state === "on";
  }
  fmt(value, digits = 1) {
    return Number.isFinite(value)
      ? value.toLocaleString("da-DK", { maximumFractionDigits: digits })
      : "—";
  }

  priceColor(value) {
    const price = Number.isFinite(value) ? value : 0;
    const green = "var(--dashboard-success, var(--state-on-icon, var(--success-color, #20e3a2)))";
    const yellow = "var(--dashboard-warning, var(--warning-color, #f59e0b))";
    const orange = "var(--dashboard-orange, #f97316)";
    const red = "var(--dashboard-danger, var(--error-color, #f43f5e))";
    const darkRed = "var(--dashboard-danger-strong, var(--error-color, #991b1b))";
    const mix = (from, to, amount) => {
      const percent = Math.round(Math.max(0, Math.min(1, amount)) * 1000) / 10;
      return `color-mix(in oklab, ${from} ${100 - percent}%, ${to} ${percent}%)`;
    };
    if (price <= 1) return green;
    if (price <= 2) return mix(green, yellow, price - 1);
    if (price <= 4) return mix(yellow, orange, (price - 2) / 2);
    if (price <= 5) return mix(orange, red, price - 4);
    return mix(red, darkRed, price - 5);
  }

  view(item) {
    const type = item.type || "entity";
    const cfg = { ...(PRESETS[type] || {}), ...item };
    let value = this.text(cfg.entity);
    let label =
      cfg.name || this.state(cfg.entity)?.attributes?.friendly_name || "Status";
    let meter = 0;
    let color = cfg.color || "var(--state-info-icon, var(--info-color, #38bdf8))";
    let detail = "";
    let pricePulse = 0;

    if (type === "home_energy") {
      const watts = this.number(cfg.entity);
      const vehicleKw = this.number(cfg.vehicle_power_entity);
      const houseWatts = Math.max(
        0,
        watts - (Number.isFinite(vehicleKw) ? vehicleKw * 1000 : 0),
      );
      value =
        houseWatts < 1000
          ? `${this.fmt(houseWatts, 0)} W`
          : `${this.fmt(houseWatts / 1000, 2)} kW`;
      detail = `${this.fmt(this.number(cfg.daily_entity), 1)} kWh`;
      meter =
        houseWatts < 3500
          ? 1
          : houseWatts < 7000
            ? 2
            : houseWatts < 10500
              ? 3
              : houseWatts < 14000
                ? 4
                : 5;
    } else if (type === "ev") {
      const battery = this.number(cfg.entity);
      value = `${this.fmt(battery, 0)}%`;
      const power = this.number(cfg.power_entity);
      const scheduleState = [
        this.text(cfg.schedule_entity, ""),
        this.text(cfg.charger_state_entity, ""),
      ]
        .join(" ")
        .toLowerCase();
      const sessionEnergy = this.number(cfg.session_energy_entity);
      detail = power > 0
        ? this._evCycle % 2 === 1 && Number.isFinite(sessionEnergy) && sessionEnergy > 0
          ? `${this.fmt(sessionEnergy, 1)} kWh ladet`
          : `${this.fmt(power, 1)} kW lader`
        : scheduleState.includes("scheduled")
          ? "Planlagt"
          : `${this.fmt(this.number(cfg.daily_entity), 1)} kWh`;
      meter = Math.ceil((battery || 0) / 20);
      if (battery < 20) color = "var(--error-color, #f43f5e)";
      else if (battery < 45) color = "var(--warning-color, #f59e0b)";
    } else if (type === "electricity_price") {
      const price = this.number(cfg.entity);
      value = `${this.fmt(price, 2)} kr`;
      detail = price < 1 ? "Lav pris" : price < 5 ? "Normal pris" : "Høj pris";
      meter =
        price < 1 ? 1 : price < 2 ? 2 : price < 3 ? 3 : price < 4 ? 4 : 5;
      color = this.priceColor(price);
      pricePulse = Number.isFinite(price) && price > 6
        ? Math.min(1, (price - 6) / 6)
        : 0;
    } else if (type === "pool") {
      const temp = this.number(cfg.entity);
      value = `${this.fmt(temp, 1)}°C`;
      const active = this.on(cfg.active_entity);
      detail = active
        ? "Pumpen kører"
        : this.text(cfg.status_entity, "Pumpen står");
      if (Number.isFinite(temp)) {
        meter = Math.max(1, Math.min(5, Math.round(((temp - 10) / 20) * 5)));
        color =
          temp < 18
            ? "var(--dashboard-danger, var(--error-color, #ef4444))"
            : temp < 23
              ? "var(--dashboard-warning, var(--warning-color, #f59e0b))"
              : "var(--dashboard-success, var(--success-color, #20e3a2))";
      } else {
        meter = 0;
        color = "var(--dashboard-icon-muted, var(--disabled-text-color, #64748b))";
      }
      cfg.icon = this.on("binary_sensor.pool_person_i_vandet")
        ? "mdi:account-swim"
        : "mdi:pool";
    } else if (type === "pet") {
      const statuses = (cfg.status_entities || []).map((id) =>
        this.text(id, "").toLowerCase(),
      );
      const done = statuses.filter((s) => /givet|færdig|done/.test(s)).length;
      const error = this.on(cfg.error_entity);
      const mode = this.text(cfg.entity, "Auto");
      value = error ? "Fejl" : mode === "schedule" ? "Auto" : mode;
      detail = `${done}/${statuses.length} måltider`;
      meter = done;
      cfg.segments = statuses.length || 5;
      color = error
        ? "var(--error-color, #f43f5e)"
        : "var(--state-on-icon, var(--success-color, #20e3a2))";
      cfg.icon = error
        ? "mdi:dog-side-off"
        : mode === "manual"
          ? "mdi:dog-side"
          : "mdi:dog";
    } else if (type === "security") {
      const ERROR_RAW = ["unavailable", "unknown", "jammed", ""];
      const lockSegState = (id) => {
        const s = this.state(id)?.state;
        if (s === undefined || ERROR_RAW.includes(s)) return "error";
        return s === "locked" ? "locked" : "unlocked";
      };
      const boolSegState = (id, inverted = false) => {
        const raw = this.text(id, "");
        const low = raw.toLowerCase();
        if (!raw || ["unavailable", "unknown"].includes(low)) return "error";
        const active = ["on", "open", "true", "1"].includes(low);
        return active === inverted ? "locked" : "unlocked";
      };
      const segStates = (cfg.lock_entities || []).map((id) => lockSegState(id));
      segStates.push(boolSegState(cfg.terrace_lock_entity, !!cfg.terrace_lock_inverted));
      segStates.push(boolSegState(cfg.gate_lock_entity, !!cfg.gate_lock_inverted));
      const locked = segStates.filter((s) => s === "locked").length;
      const hasError = segStates.includes("error");
      const open = this.number(cfg.open_count_entity);
      const alarmIcon = (id) => {
        const state = this.text(id, "unknown");
        if (state === "armed_away")
          return ["mdi:shield-lock-outline", "var(--state-on-icon, var(--success-color))"];
        if (["armed_home", "armed_night"].includes(state))
          return ["mdi:shield-home-outline", "var(--state-warn-icon, var(--warning-color))"];
        if (state === "triggered")
          return ["mdi:shield-alert-outline", "var(--error-color, #ef4444)"];
        if (state === "disarmed")
          return ["mdi:shield-off-outline", "var(--state-alert-icon, var(--error-color))"];
        return ["mdi:shield-question-outline", "var(--dashboard-icon-muted, var(--disabled-text-color))"];
      };
      const [vIcon, vColor] = alarmIcon(cfg.alarm_entity);
      const [aIcon, aColor] = alarmIcon(cfg.secondary_alarm_entity);
      const triggered =
        this.text(cfg.alarm_entity) === "triggered" ||
        this.text(cfg.secondary_alarm_entity) === "triggered";
      value = triggered
        ? "Alarm"
        : hasError
          ? "Fejl"
          : locked === segStates.length
            ? "Låst"
            : "Åben";
      detail = "";
      meter = locked;
      cfg.segments = segStates.length;
      cfg.segmentStates = segStates;
      cfg.hasError = hasError && !triggered;
      color = triggered || hasError
        ? "var(--error-color, #ef4444)"
        : value === "Låst"
          ? "var(--state-on-icon, var(--success-color, #20e3a2))"
          : "var(--warning-color, #f59e0b)";
      cfg.icon = hasError
        ? "mdi:lock-alert-outline"
        : value === "Låst"
          ? "mdi:home-lock"
          : "mdi:home-lock-open";
      const doors = (cfg.door_entities || []).filter((id) =>
        this.on(id),
      ).length;
      const windows = Number.isFinite(open) ? open : 0;
      const windowColor = windows
        ? "var(--warning-color, #f59e0b)"
        : "var(--dashboard-icon-muted, var(--disabled-text-color, #64748b))";
      const doorColor = doors
        ? "var(--warning-color, #f59e0b)"
        : "var(--dashboard-icon-muted, var(--disabled-text-color, #64748b))";
      label = `<span class="security-row"><span><img src="/local/billeder/security-status/verisure-brand-icon.png"><ha-icon icon="${vIcon}" style="color:${vColor}"></ha-icon></span><span><img src="/local/billeder/security-status/ajax-brand-icon.png"><ha-icon icon="${aIcon}" style="color:${aColor}"></ha-icon></span><span><ha-icon icon="${windows ? "mdi:window-open-variant" : "mdi:window-closed-variant"}" style="color:${windowColor}"></ha-icon><b style="color:${windowColor}">${windows}</b></span><span><ha-icon icon="${doors ? "mdi:door-open" : "mdi:door-closed"}" style="color:${doorColor}"></ha-icon><b style="color:${doorColor}">${doors}</b></span></span>`;
    } else if (type === "heating") {
      const heating = /opvarm|til|heat/.test(
        this.text(cfg.heating_entity, "").toLowerCase(),
      );
      value = heating ? "Varmer" : this.text(cfg.entity, "Klar");
      const pressure = this.number(cfg.pressure_entity);
      const heatDayPrimary = this.number(cfg.daily_entity);
      const heatDayFallback = this.number(cfg.fallback_daily_entity);
      const heatDay = Number.isFinite(heatDayPrimary)
        ? heatDayPrimary
        : heatDayFallback;
      detail = Number.isFinite(heatDay)
        ? heatDay >= 100
          ? `${this.fmt(heatDay / 1000, 1)} MWh`
          : `${this.fmt(heatDay, 0)} kWh`
        : Number.isFinite(pressure)
          ? `${this.fmt(pressure, 1)} bar`
          : "Afventer";
      const cheapest = this.text(cfg.source_entity, "").toLowerCase();
      let sourceIcon = "mdi:help-circle-outline";
      let sourceText = "?";
      let sourceColor = "var(--secondary-text-color)";
      if (cheapest.includes("mix") || cheapest.includes("begge")) {
        sourceIcon = "mdi:shuffle-variant";
        sourceText = "Mix";
        sourceColor = "var(--state-on-icon, var(--success-color))";
      } else if (
        cheapest.includes("varmepumpe") ||
        cheapest.includes("ac") ||
        cheapest === "vp"
      ) {
        sourceIcon = "mdi:air-conditioner";
        sourceText = "VP";
        sourceColor = "var(--state-info-icon, var(--info-color))";
      } else if (cheapest.includes("fjernvarme") || cheapest === "fj") {
        sourceIcon = "mdi:pipe-valve";
        sourceText = "FJ";
        sourceColor = "var(--warning-color)";
      }
      const waterState = this.text(cfg.entity, "").toLowerCase();
      const regulator = this.text(cfg.water_regulator_entity, "").toLowerCase();
      const blockedBy = this.text(cfg.blocked_by_entity, "").toLowerCase();
      const bypass =
        waterState.includes("bypass") || regulator.includes("bypass");
      const water =
        waterState.includes("opvarm") ||
        waterState.includes("varmt") ||
        regulator.includes("varm");
      const blocked =
        waterState.includes("blokeret") ||
        (blockedBy &&
          !["ingen", "0", "unknown", "unavailable"].includes(blockedBy));
      const waterIcon = blocked
        ? "mdi:water-off"
        : bypass
          ? "mdi:water-sync"
          : water
            ? "mdi:water"
            : "mdi:water-outline";
      const waterColor = blocked
        ? "var(--warning-color)"
        : bypass || water
          ? "var(--state-info-icon, var(--info-color))"
          : "var(--dashboard-icon-muted, var(--disabled-text-color))";
      label = `<span class="source-row"><ha-icon icon="${sourceIcon}" style="color:${sourceColor}"></ha-icon><b>${sourceText}</b><ha-icon icon="${waterIcon}" style="color:${waterColor}"></ha-icon></span>`;
      const valvePct = this.number(cfg.valve_entity);
      meter = Number.isFinite(valvePct)
        ? Math.max(1, Math.ceil(Math.min(100, Math.max(0, valvePct)) / 20))
        : heating
          ? 4
          : 1;
      color = heating
        ? "var(--error-color, #f43f5e)"
        : "var(--state-info-icon, var(--info-color, #38bdf8))";
      cfg.icon = heating ? "mdi:radiator" : "mdi:radiator-off";
    } else if (type === "settings") {
      const editing = this.on(cfg.entity);
      const off = this.number(cfg.off_count_entity);
      const active = (cfg.appliance_entities || []).filter((id) =>
        this.on(id),
      ).length;
      value = editing ? "Edit" : "Klar";
      detail = active
        ? `${active} maskiner kører`
        : Number.isFinite(off) && off > 0
          ? `${off} autom. slukket`
          : "Indstillinger";
      meter = Math.min(5, Number.isFinite(off) ? off : 0);
      color = editing
        ? "var(--state-off-icon, var(--disabled-text-color, #f59e0b))"
        : "var(--state-info-icon, var(--info-color, #38bdf8))";
    } else {
      const numeric = this.number(cfg.entity);
      value = `${Number.isFinite(numeric) ? this.fmt(numeric, cfg.decimals ?? 1) : this.text(cfg.entity)}${cfg.unit ? ` ${cfg.unit}` : ""}`;
      detail = cfg.secondary_entity
        ? this.text(cfg.secondary_entity)
        : cfg.label || "";
      meter = cfg.meter ?? 0;
    }
    const segments = cfg.segments || 5;
    return {
      ...cfg,
      type,
      value,
      label,
      detail,
      meter: Math.min(segments, Math.max(0, meter)),
      segments,
      color,
      pricePulse,
    };
  }

  decoration(item) {
    if (item.type === "home_energy" || item.type === "ev") {
      const maxFromEntity = this.number(item.phase_max_entity);
      const maximum =
        Number.isFinite(maxFromEntity) && maxFromEntity > 0
          ? maxFromEntity
          : item.phase_max;
      const vehiclePerPhaseW =
        item.type === "home_energy"
          ? Math.max(0, (this.number(item.vehicle_power_entity) || 0) * 1000) / 3
          : 0;
      const values = (item.phase_entities || []).map((id) =>
        Math.max(0, (this.number(id) || 0) - vehiclePerPhaseW),
      );
      const colors = values.map((value) => {
        const load = Math.min(1, value / maximum);
        if (load < 0.08) return "var(--state-cool-icon, var(--info-color))";
        if (load < 0.22) return "var(--state-info-icon, var(--info-color))";
        if (load < 0.48) return "var(--state-success-icon, var(--success-color))";
        if (load < 0.72) return "var(--state-warning-icon, var(--warning-color))";
        if (load < 0.88) return "var(--state-heat-icon, var(--error-color))";
        return "var(--state-error-icon, var(--error-color))";
      });
      const paths = values.map((value, phase) => {
        const load = Math.min(1, value / maximum);
        // House consumption sits at a small fraction of the 17.5kW scale most of the
        // time (EV charging is excluded), so a front-loaded curve keeps normal, everyday
        // usage visibly present instead of flatlining until load nears the ceiling.
        const shapedLoad = item.type === "home_energy" ? Math.pow(load, 0.42) : load;
        const amplitude =
          item.type === "ev" ? 1 + Math.pow(load, 1.8) * 24.5 : 2 + shapedLoad * 23.5;
        const cycles = 1.1 + load * 1.9;
        const offset = (phase * Math.PI * 2) / 3;
        const points = [];
        for (let step = 0; step <= 120; step += 1) {
          const progress = step / 120;
          points.push(
            `${(progress * 300).toFixed(1)},${(42.5 + Math.sin(progress * Math.PI * 2 * cycles + offset) * amplitude).toFixed(1)}`,
          );
        }
        const opacity =
          item.type === "home_energy"
            ? (0.08 + shapedLoad * 0.15).toFixed(2)
            : (0.05 + load * 0.08).toFixed(2);
        const width =
          item.type === "home_energy"
            ? (0.9 + shapedLoad * 0.6).toFixed(2)
            : (0.8 + load * 0.5).toFixed(2);
        const stroke = `color-mix(in srgb, ${colors[phase]} 40%, var(--dashboard-icon-muted, var(--disabled-text-color, #64748b)) 60%)`;
        return `<polyline class="phase phase-${phase + 1}" points="${points.join(" ")}" style="stroke:${stroke};stroke-width:${width};opacity:${opacity}"/>`;
      });
      return `<svg class="phase-waves ${item.type}" viewBox="0 0 300 85" preserveAspectRatio="none"><line x1="0" y1="42.5" x2="300" y2="42.5"/>${paths.join("")}</svg>`;
    }
    if (item.type === "electricity_price") {
      return `<div class="price-bars">${[32, 46, 25, 58, 38, 65, 29].map((h, i) => `<i style="height:${h}%;animation-delay:-${i * 0.25}s"></i>`).join("")}</div>`;
    }
    if (item.type === "pool") {
      return `<svg class="pool-waves" viewBox="0 0 220 85" preserveAspectRatio="none"><path d="M0 55 Q22 40 44 55 T88 55 T132 55 T176 55 T220 55"/><path d="M0 68 Q22 53 44 68 T88 68 T132 68 T176 68 T220 68"/></svg>`;
    }
    if (item.type === "settings") {
      const icons = [
        [
          "binary_sensor.vaskemaskine_korer",
          "/local/hvidevarer/vaskemaskine2_running.png",
        ],
        [
          "binary_sensor.torretumbler_korer",
          "/local/hvidevarer/toerretumbler2_running.png",
        ],
        [
          "binary_sensor.opvaskemaskine_korer",
          "/local/hvidevarer/opvaskemaskine2_running.png",
        ],
      ].filter(([id]) => this.on(id));
      return icons.length
        ? `<div class="appliances">${icons.map(([, src]) => `<img src="${src}">`).join("")}</div>`
        : "";
    }
    if (
      item.type === "heating" &&
      /cool|heat|fan/.test(
        this.text("sensor.ac_combined_state", "").toLowerCase(),
      )
    ) {
      return `<div class="airflow"><i></i><i></i><i></i></div>`;
    }
    return "";
  }

  action(item) {
    if (item.type === "ev" && this._evPlugged(item)) {
      this._openEvPopup(item);
      return;
    }
    if (item.navigation_path) {
      history.pushState(null, "", item.navigation_path);
      window.dispatchEvent(new Event("location-changed"));
    } else if (item.entity) {
      this.dispatchEvent(
        new CustomEvent("hass-more-info", {
          bubbles: true,
          composed: true,
          detail: { entityId: item.entity },
        }),
      );
    }
  }

  _evPlugged(item) {
    return this.on(item.cable_entity) || this.on(item.vehicle_plug_entity)
      || String(this.state(item.plug_mode_entity)?.state || "").startsWith("connected_");
  }

  _openEvPopup(item) {
    if (this._popupEl) return;
    const Dashboard = item.popup ? customElements.get("th-tesla-dashboard-card") : null;
    const PopupCard = Dashboard || customElements.get("ha-tesla-charge-popup-card");
    if (!PopupCard) {
      history.pushState(null, "", item.navigation_path);
      window.dispatchEvent(new Event("location-changed"));
      return;
    }
    const backdrop = document.createElement("div");
    backdrop.style.cssText = "position:fixed;inset:0;z-index:999999;background:rgba(8,12,18,.68);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:calc(10px + env(safe-area-inset-top,0px)) 10px calc(10px + env(safe-area-inset-bottom,0px))";
    const panel = document.createElement("div");
    panel.style.cssText = "position:relative;width:100%;max-width:" + (Dashboard ? "680px" : "520px") + ";display:flex;flex-direction:column;max-height:calc(100dvh - 20px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px));overflow:visible;border-radius:20px";
    const close = document.createElement("button");
    close.textContent = "Luk ✕";
    close.setAttribute("aria-label", "Luk lade-popup");
    close.style.cssText = "align-self:flex-end;flex:none;margin:0 4px 8px 0;min-height:44px;padding:10px 18px;border:1px solid rgba(255,255,255,.16);border-radius:999px;background:rgba(8,12,18,.92);box-shadow:0 8px 20px rgba(0,0,0,.38);color:#fff;font:inherit;font-size:14px;font-weight:800;cursor:pointer";
    const card = new PopupCard();
    card.setConfig(Dashboard ? item.popup : { navigation_path: item.navigation_path });
    card.hass = this._hass;
    const scroller = document.createElement("div");
    scroller.style.cssText = "flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain;border-radius:20px;box-shadow:0 28px 70px rgba(0,0,0,.5)" + (Dashboard ? ";padding:12px;background:var(--primary-background-color,#0b0f16)" : "");
    scroller.appendChild(card);
    panel.append(close, scroller);
    backdrop.appendChild(panel);
    backdrop.addEventListener("click", (event) => { if (event.target === backdrop) this._closeEvPopup(); });
    card.addEventListener("tesla-popup-close", () => this._closeEvPopup());
    close.addEventListener("click", () => this._closeEvPopup());
    this._escHandler = (event) => { if (event.key === "Escape") this._closeEvPopup(); };
    document.addEventListener("keydown", this._escHandler);
    document.body.appendChild(backdrop);
    this._popupEl = backdrop;
    this._popupCard = card;
  }

  _closeEvPopup() {
    this._popupEl?.remove();
    this._popupEl = null;
    this._popupCard = null;
    if (this._escHandler) document.removeEventListener("keydown", this._escHandler);
    this._escHandler = null;
  }

  disconnectedCallback() {
    this._closeEvPopup();
    clearInterval(this._cycleTimer);
    this._cycleTimer = null;
  }

  render() {
    if (!this.config || !this._hass) return;
    const item = this.view({
      ...this.config,
      type: this.config.preset || this.config.type_name || "entity",
    });
    const segClass = (s) =>
      s === "locked" ? "seg-locked" : s === "unlocked" ? "seg-unlocked" : s === "error" ? "seg-error" : s === "on" ? "on" : "";
    const meterHtml = (
      item.segmentStates ||
      Array.from({ length: item.segments || 5 }, (_, i) => (i + 1 <= item.meter ? "on" : ""))
    )
      .map((s) => `<i class="seg ${segClass(s)}"></i>`)
      .join("");
    if (!this._rendered) {
      this.shadowRoot.innerHTML = `<style>
      :host{display:block}
      .item{display:block;width:100%;min-width:0;max-width:100%;height:85px;box-sizing:border-box;position:relative;overflow:hidden;padding:10px 12px;border:0;border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid color-mix(in srgb,var(--accent) 78%,transparent);border-radius:15px;background:var(--surface,var(--ha-card-background,var(--card-background-color,#172536)));box-shadow:var(--dashboard-shadow-strong, var(--ha-card-box-shadow, 0 8px 22px rgba(0,0,0,.22)));color:var(--gray800,var(--primary-text-color,#f8fafc));font:inherit;text-align:left;cursor:pointer;transition:border-left-color .9s ease,box-shadow .15s ease,transform .15s ease}/* Samme loeft-hover som resten af forsidens knapper. Rod-elementet her er <button class="item">, ikke <ha-card> - derfor kunne den tidligere ha-card-baserede regel aldrig ramme noget. */.item:hover{transform:translateY(calc(var(--dashboard-card-highlight, 1) * -2px));box-shadow:var(--dashboard-shadow-strong, var(--ha-card-box-shadow, 0 8px 22px rgba(0,0,0,.22))),0 calc(var(--dashboard-card-highlight, 1) * 12px) calc(var(--dashboard-card-highlight, 1) * 26px) rgba(0,0,0,calc(var(--dashboard-card-highlight, 1) * .26))}.item:active{transform:translateY(0)}@media(prefers-reduced-motion:reduce){.item{transition:border-left-color .9s ease,box-shadow .15s ease}.item:hover{transform:none}}
      .value{position:relative;z-index:2;font-size:18px;font-weight:750;line-height:21px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.meter{position:relative;z-index:2;display:flex;gap:4px;height:8px;margin:5px 0}.seg{width:14px;height:6px;border-radius:99px;background:color-mix(in srgb,var(--dashboard-icon-muted, var(--disabled-text-color, #64748b)) 25%,transparent);transition:background-color .9s ease,box-shadow .9s ease}.seg.on{background:var(--accent);box-shadow:0 0 7px color-mix(in srgb,var(--accent) 28%,transparent)}.seg.seg-locked{background:var(--state-on-icon, var(--success-color, #20e3a2));box-shadow:0 0 7px color-mix(in srgb,var(--state-on-icon, var(--success-color, #20e3a2)) 30%,transparent)}.seg.seg-unlocked{background:var(--warning-color,#f59e0b);box-shadow:0 0 7px color-mix(in srgb,var(--warning-color,#f59e0b) 30%,transparent)}.seg.seg-error{background:var(--error-color,#ef4444);animation:seg-error-pulse 1.8s ease-in-out infinite}@keyframes seg-error-pulse{0%,100%{opacity:.5;box-shadow:0 0 4px color-mix(in srgb,var(--error-color,#ef4444) 35%,transparent)}50%{opacity:1;box-shadow:0 0 11px color-mix(in srgb,var(--error-color,#ef4444) 75%,transparent)}}.item.has-error{animation:item-error-pulse 1.8s ease-in-out infinite}@keyframes item-error-pulse{0%,100%{box-shadow:var(--dashboard-shadow-strong, var(--ha-card-box-shadow, 0 8px 22px rgba(0,0,0,.22)))}50%{box-shadow:0 0 0 3px color-mix(in srgb,var(--error-color,#ef4444) 22%,transparent),var(--dashboard-shadow-strong, var(--ha-card-box-shadow, 0 8px 22px rgba(0,0,0,.22)))}}
      .detail{display:block;min-width:0;max-width:100%;position:relative;z-index:2;color:var(--gray600,var(--secondary-text-color,#a7b2c2));font-size:11px;line-height:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:35px;box-sizing:border-box}.label{display:block;min-width:0;max-width:100%;position:relative;z-index:2;color:var(--gray700,var(--secondary-text-color,#cbd5e1));font-size:11px;font-weight:700;line-height:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:35px;box-sizing:border-box}.source-row{display:flex;align-items:center;gap:5px;height:14px}.source-row ha-icon{position:static;width:13px;height:13px;--mdc-icon-size:13px;flex:0 0 13px}.source-row b{line-height:1}.item.ev .detail{padding-right:6px;z-index:3}.item.security .detail{display:none}.item.security .label{position:absolute;left:12px;bottom:4px;width:80px;height:38px;padding:0;overflow:visible}.security-row{display:grid;grid-template-columns:repeat(2,38px);grid-template-rows:repeat(2,18px);gap:2px 4px;width:80px;height:38px;justify-content:start;align-content:start}.security-row>span{display:flex;align-items:center;justify-content:center;gap:1px;width:38px;height:18px;padding:0 2px;box-sizing:border-box;border-radius:6px;background:color-mix(in srgb,var(--dashboard-icon-muted, var(--disabled-text-color, #64748b)) 9%,transparent);border:1px solid color-mix(in srgb,var(--dashboard-icon-muted, var(--disabled-text-color, #64748b)) 18%,transparent)}.security-row img,.security-row ha-icon{position:static;width:12px;height:12px;--mdc-icon-size:12px;object-fit:contain}.security-row b{font-size:9px;line-height:1}
      .item.security{padding:0 12px}.item.security .value{position:absolute;left:12px;top:4px;width:calc(100% - 50px);height:25px;line-height:25px;padding:1px 0 0;overflow:visible}.item.security .meter{position:absolute;left:12px;top:32px;height:8px;margin:0}.item.security .label{top:43px;bottom:auto}
      .bg-icon{position:absolute;right:-10px;bottom:-10px;width:58px;height:58px;--mdc-icon-size:58px;color:var(--accent);opacity:.12;animation:drift 5s ease-in-out infinite;z-index:1;pointer-events:none;filter:saturate(1.05) drop-shadow(0 0 10px color-mix(in srgb,var(--accent) 10%,transparent))}@keyframes drift{50%{transform:translate(-4px,-3px) scale(1.04) rotate(-4deg);opacity:.22}}
      .phase-waves,.pool-waves{position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none}.phase-waves .phase{fill:none;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke;animation:phaseBreathe 3s ease-in-out infinite}.phase-waves .phase-2{animation-delay:-1.4s}.phase-waves .phase-3{animation-delay:-2.8s}.phase-waves line{stroke:var(--secondary-text-color);stroke-width:1;stroke-dasharray:3 3;opacity:.16;vector-effect:non-scaling-stroke}@keyframes phaseBreathe{50%{filter:brightness(1.04) saturate(.85)}}.pool-waves{opacity:.2}.pool-waves path{fill:none;stroke:var(--accent);stroke-width:1.7;stroke-linecap:round;animation:linePulse 3s ease-in-out infinite}.pool-waves path+path{animation-delay:-1.4s;opacity:.65}@keyframes linePulse{50%{opacity:.35;transform:translateY(-2px)}}
      .price-bars{position:absolute;inset:10px 42px 8px 12px;display:flex;align-items:flex-end;gap:5px;opacity:.42;z-index:0}.price-bars i{display:block;width:4px;border-radius:9px 9px 0 0;background:var(--accent);transform-origin:center bottom;transition:background-color .9s ease,filter .9s ease}.item.price-alert .price-bars i,.item.price-alert .meter .seg.on{animation:priceDangerPulse var(--price-pulse-duration) ease-in-out infinite;transform-origin:center bottom}@keyframes priceDangerPulse{0%,100%{transform:scaleY(1);opacity:.86;filter:brightness(1) drop-shadow(0 0 2px var(--accent))}50%{transform:scaleY(var(--price-pulse-scale));opacity:var(--price-pulse-opacity);filter:brightness(var(--price-pulse-brightness)) drop-shadow(0 0 var(--price-pulse-glow) var(--accent))}}
      .appliances{position:absolute;right:8px;top:4px;display:flex;gap:3px;z-index:3}.appliances img{width:24px;height:24px;object-fit:contain}.airflow{position:absolute;right:10px;top:8px;z-index:3;color:var(--accent)}.airflow i{display:block;border-top:2px solid currentColor;border-radius:50%;height:4px;margin:1px 0;animation:air 1.9s ease-in-out infinite}.airflow i:nth-child(1){width:11px}.airflow i:nth-child(2){width:17px;animation-delay:-.3s}.airflow i:nth-child(3){width:23px;animation-delay:-.6s}@keyframes air{50%{transform:translateX(-3px);opacity:.45}}
      @media(min-width:1101px) and (max-height:950px){.item{height:66px;padding:5px 10px}.value{font-size:16px;line-height:18px}.meter{margin:2px 0}.detail,.label{font-size:10px;line-height:11px}.bg-icon{width:48px;height:48px;--mdc-icon-size:48px}.security-row{grid-template-columns:repeat(4,38px);grid-template-rows:repeat(1,18px);width:164px;height:18px}.item.security .label{width:164px;height:18px}}
      @media(max-width:600px){.item{padding:9px 9px}.value{font-size:16px}.detail,.label{font-size:10px}.meter{gap:3px}.seg{width:12px}}
    </style><button class="item"><span class="decoration"></span><div class="value"></div><div class="meter"></div><div class="detail"></div><div class="label"></div><ha-icon class="bg-icon"></ha-icon></button>`;
      const tile = this.shadowRoot.querySelector(".item");
      tile.addEventListener("click", () => {
        // A completed long-press already opened the popup; swallow the click that follows it.
        if (this._heldOpen) { this._heldOpen = false; return; }
        this.action(this._currentItem);
      });
      // Long-press on the car tile opens the charge popup even when no cable is detected.
      const cancelHold = () => { clearTimeout(this._holdTimer); this._holdTimer = null; };
      tile.addEventListener("pointerdown", () => {
        if (this._currentItem?.type !== "ev" || !this._currentItem.popup) return;
        cancelHold();
        this._heldOpen = false;
        this._holdTimer = setTimeout(() => { this._holdTimer = null; this._heldOpen = true; this._openEvPopup(this._currentItem); }, 550);
      });
      for (const type of ["pointerup", "pointerleave", "pointercancel"]) tile.addEventListener(type, cancelHold);
      tile.addEventListener("contextmenu", (event) => { if (this._currentItem?.type === "ev") event.preventDefault(); });
      this._rendered = true;
    }

    this._currentItem = item;
    const button = this.shadowRoot.querySelector(".item");
    const pulse = Math.max(0, Math.min(1, item.pricePulse || 0));
    button.className = `item ${item.type}${item.hasError ? " has-error" : ""}${pulse > 0 ? " price-alert" : ""}`;
    button.style.setProperty("--accent", item.color);
    button.style.setProperty("--price-pulse-duration", `${(3.2 - pulse * 2).toFixed(2)}s`);
    button.style.setProperty("--price-pulse-scale", (0.94 - pulse * 0.28).toFixed(2));
    button.style.setProperty("--price-pulse-opacity", (0.82 - pulse * 0.32).toFixed(2));
    button.style.setProperty("--price-pulse-brightness", (1.08 + pulse * 0.82).toFixed(2));
    button.style.setProperty("--price-pulse-glow", `${(4 + pulse * 14).toFixed(1)}px`);
    button.setAttribute("aria-label", item.name || item.type);
    const decoration = this.shadowRoot.querySelector(".decoration");
    if (this._decorationType !== item.type || item.type !== "electricity_price") {
      decoration.innerHTML = this.decoration(item);
      this._decorationType = item.type;
    }
    this.shadowRoot.querySelector(".value").textContent = item.value;
    const meter = this.shadowRoot.querySelector(".meter");
    const segmentStates = item.segmentStates || Array.from({ length: item.segments || 5 }, (_, i) => (i + 1 <= item.meter ? "on" : ""));
    if (meter.children.length !== segmentStates.length) meter.innerHTML = meterHtml;
    else segmentStates.forEach((state, index) => { meter.children[index].className = `seg ${segClass(state)}`; });
    this.shadowRoot.querySelector(".detail").textContent = item.detail || " ";
    this.shadowRoot.querySelector(".label").innerHTML = item.label;
    this.shadowRoot
      .querySelector(".bg-icon")
      .setAttribute("icon", item.icon || "mdi:information-outline");
  }

  getCardSize() {
    return 2;
  }
  static getConfigElement() {
    return document.createElement("ha-home-status-card-editor");
  }
  static getStubConfig() {
    return { preset: "home_energy" };
  }
}

class HaHomeStatusCardEditor extends HTMLElement {
  setConfig(config) {
    this.config = structuredClone(config);
    this.render();
  }
  set hass(hass) {
    this._hass = hass;
  }
  render() {
    const options = Object.keys(PRESETS)
      .map(
        (key) =>
          `<option value="${key}" ${this.config?.preset === key ? "selected" : ""}>${PRESETS[key].name}</option>`,
      )
      .join("");
    const inversion = this.config?.preset === "security"
      ? `<label class="check"><input id="gate-lock-inverted" type="checkbox" ${this.config.gate_lock_inverted !== false ? "checked" : ""}>Portkontakt er omvendt (åben = låst)</label>`
      : "";
    this.innerHTML = `<style>select{box-sizing:border-box;width:100%;padding:10px}label{display:block;margin:8px 0 4px}.check{display:flex;align-items:center;gap:8px}.check input{width:18px;height:18px}</style><label>Kortfunktion</label><select>${options}</select>${inversion}`;
    this.querySelector("select").addEventListener("change", (event) =>
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          bubbles: true,
          composed: true,
          detail: { config: { ...this.config, preset: event.target.value } },
        }),
      ),
    );
    this.querySelector("#gate-lock-inverted")?.addEventListener("change", (event) =>
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          bubbles: true,
          composed: true,
          detail: { config: { ...this.config, gate_lock_inverted: event.target.checked } },
        }),
      ),
    );
  }
}

if (!customElements.get("ha-home-status-card"))
  customElements.define("ha-home-status-card", HaHomeStatusCard);
if (!customElements.get("ha-home-status-card-editor"))
  customElements.define("ha-home-status-card-editor", HaHomeStatusCardEditor);

const SUMMARY_DEFAULTS = {
  "title": "Husets overblik",
  "monthly_energy_entity": "sensor.summary_monthly_energy",
  "electricity_price_entity": "sensor.summary_electricity_price",
  "electric_month_cost_entity": "",
  "water_month_entity": "sensor.summary_water_month",
  "water_month_cost_entity": "sensor.summary_water_month_cost",
  "heat_month_entity": "sensor.summary_heat_month",
  "heat_month_cost_entity": "sensor.summary_heat_month_cost",
  "electricity_path": "/energi-overblik/energy",
  "water_path": "/energi-overblik/vand",
  "heat_path": "/energi-overblik/varme-center",
  "co2_entity": "sensor.summary_co2",
  "air_quality_entity": "sensor.summary_air_quality",
  "water_flow_entity": "sensor.summary_water_flow",
  "storage_entity": "sensor.summary_storage",
  "event_days": 14,
  "max_events": 40,
  "robots": [],
  "hdd_entities": [
    "binary_sensor.summary_hdd_1",
    "binary_sensor.summary_hdd_2"
  ],
  "rooms": [],
  "calendars": []
};

class HaHomeSummaryCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._sig = "";
    this._events = [];
    this._eventsSig = "";
    this._robotSig = "";
    this._robotNodes = new Map();
  }
  setConfig(config) {
    this.config = { ...SUMMARY_DEFAULTS, ...config };
    this._sig = "";
    this._rendered = false;
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    const ids = [this.config?.monthly_energy_entity, this.config?.electricity_price_entity,
      this.config?.electric_month_cost_entity, this.config?.water_month_entity,
      this.config?.water_month_cost_entity, this.config?.heat_month_entity,
      this.config?.heat_month_cost_entity,
      this.config?.co2_entity, this.config?.air_quality_entity, this.config?.water_flow_entity,
      this.config?.storage_entity, ...(this.config?.hdd_entities || []),
      ...(this.config?.rooms || []).flatMap((room) => [room.temperature, room.humidity, room.climate, room.presence]),
      ...(this.config?.calendars || []).map((x) => x.entity)].filter(Boolean);
    const robotIds = (this.config?.robots || []).flatMap((robot) => [robot.entity, robot.room_entity]).filter(Boolean);
    const sig = JSON.stringify(ids.map((id) => [id, hass.states?.[id]?.state,
      hass.states?.[id]?.last_changed, hass.states?.[id]?.attributes?.message,
      hass.states?.[id]?.attributes?.start_time]));
    if (sig !== this._sig) {
      this._sig = sig;
      this._render();
      this._loadEvents();
    }
    const robotSig = JSON.stringify(robotIds.map((id) => [id, hass.states?.[id]?.state, hass.states?.[id]?.last_changed]));
    if (robotSig !== this._robotSig) {
      this._robotSig = robotSig;
      this._updateRobots();
    }
  }
  _state(id) { return id ? this._hass?.states?.[id] : undefined; }
  _num(id) {
    const raw = this._state(id)?.state;
    if (raw == null || raw === "" || ["unknown", "unavailable"].includes(raw)) return Number.NaN;
    const value = Number(String(raw).replace(",", "."));
    return Number.isFinite(value) ? value : Number.NaN;
  }
  _fmt(value, digits = 1) { return Number.isFinite(value) ? value.toLocaleString("da-DK", { maximumFractionDigits: digits }) : "—"; }
  _esc(value) { return String(value ?? "").replace(/[&<>"']/g, (m) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[m]); }
  _label(value) { return String(value || "—").replaceAll("_", " ").replace(/\b\w/g, (x) => x.toUpperCase()); }
  _roomKey(value) { return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLocaleLowerCase("da-DK"); }
  _robotActive(robot) {
    const state = String(this._state(robot.entity)?.state || "").toLowerCase();
    const states = Array.isArray(robot.active_states) && robot.active_states.length ? robot.active_states
      : (String(robot.entity || "").startsWith("lawn_mower.") ? ["mowing", "edgecut", "starting", "leaving"]
        : ["cleaning", "segment_cleaning", "zoned_cleaning", "spot_cleaning", "mopping"]);
    return states.map((value) => String(value).toLowerCase()).includes(state);
  }
  _robotRoom(robot) {
    const raw = robot.room_entity ? this._state(robot.room_entity)?.state : robot.room;
    if (!raw || ["unknown", "unavailable"].includes(String(raw).toLowerCase())) return "";
    return this._roomKey(robot.room_map?.[raw] ?? robot.room_map?.[this._roomKey(raw)] ?? raw);
  }
  _updateRobots() {
    const rooms = this.shadowRoot?.querySelector(".rooms"), panel = this.shadowRoot?.querySelector(".temperature-panel");
    if (!rooms || !panel) return;
    const configured = Array.isArray(this.config?.robots) ? this.config.robots : [], liveKeys = new Set();
    configured.forEach((robot, index) => {
      const key = String(robot.id || robot.name || robot.entity || index); liveKeys.add(key);
      let node = this._robotNodes.get(key);
      if (!node || !node.isConnected) { node = document.createElement("ha-icon"); node.className = "room-robot"; node.dataset.robot = key; this._robotNodes.set(key, node); }
      node.setAttribute("icon", robot.icon || (String(robot.entity || "").startsWith("lawn_mower.") ? "mdi:robot-mower" : "mdi:robot-vacuum"));
      node.title = robot.name || this._state(robot.entity)?.attributes?.friendly_name || "Robot";
      node.style.setProperty("--robot-speed", `${Math.max(7, Math.min(90, Number(robot.speed_seconds) || 16))}s`);
      node.style.setProperty("--robot-speed-y", `${Math.max(6, Math.min(75, (Number(robot.speed_seconds) || 16) * .72))}s`);
      node.hidden = !this._robotActive(robot);
      if (node.hidden) { if (!node.isConnected) panel.append(node); return; }
      if (robot.outdoors) { node.classList.add("outdoors"); panel.append(node); return; }
      node.classList.remove("outdoors");
      const room = rooms.querySelector(`[data-room-key="${CSS.escape(this._robotRoom(robot))}"]`);
      if (room) room.append(node); else node.hidden = true;
    });
    for (const [key, node] of this._robotNodes) if (!liveKeys.has(key)) { node.remove(); this._robotNodes.delete(key); }
  }
  async _loadEvents() {
    if (!this._hass?.callApi || this._loadingEvents) return;
    const calendars = this.config.calendars || [];
    const key = JSON.stringify([calendars.map((x) => x.entity),this.config.event_days,this.config.max_events]);
    if (key === this._eventsKey && Date.now() - (this._eventsAt || 0) < 300000) return;
    this._loadingEvents = true;
    try {
      const start = new Date(); const days = Math.min(31, Math.max(1, Number(this.config.event_days) || 14));
      const end = new Date(start.getTime() + days * 86400000);
      const events = [];
      const lists = await Promise.all(calendars.map((cal) => this._hass.callApi("GET", `calendars/${encodeURIComponent(cal.entity)}?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`)));
      calendars.forEach((cal, index) => (lists[index] || []).forEach((event) => events.push({ ...event, calendar: cal })));
      const limit = Math.min(100, Math.max(1, Number(this.config.max_events) || 40));
      this._events = events.sort((a,b) => new Date(a.start?.dateTime || a.start?.date) - new Date(b.start?.dateTime || b.start?.date)).slice(0, limit);
      this._eventsKey = key; this._eventsAt = Date.now(); this._renderEvents();
    } catch (_) { this._events = this._fallbackEvents(); this._renderEvents(); }
    finally { this._loadingEvents = false; }
  }
  _fallbackEvents() {
    return (this.config.calendars || []).map((calendar) => {
      const a = this._state(calendar.entity)?.attributes || {};
      return a.message && a.start_time ? { summary: a.message, start: { dateTime: a.start_time }, calendar } : null;
    }).filter(Boolean).sort((a,b) => new Date(a.start.dateTime) - new Date(b.start.dateTime)).slice(0,Math.min(100,Math.max(1,Number(this.config.max_events)||40)));
  }
  _eventTime(event) {
    const raw = event.start?.dateTime || event.start?.date;
    if (!raw) return "";
    const date = new Date(raw); const allDay = Boolean(event.start?.date && !event.start?.dateTime);
    const day = date.toLocaleDateString("da-DK", { weekday: "short", day: "numeric", month: "short" });
    return allDay ? day : `${day} · ${date.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}`;
  }
  _renderEvents() {
    const host = this.shadowRoot?.querySelector(".events"); if (!host) return;
    const events = this._events.length ? this._events : this._fallbackEvents();
    const sig = JSON.stringify(events.map((e) => [e.summary, e.start, e.calendar?.entity]));
    if (sig === this._eventsSig) return; this._eventsSig = sig;
    host.innerHTML = events.length ? events.map((event) => {
      const raw=event.start?.dateTime||event.start?.date, date=raw?new Date(raw):new Date();
      const day=date.toLocaleDateString("da-DK",{weekday:"short"}).replace(".","");
      const number=date.toLocaleDateString("da-DK",{day:"numeric"});
      return `<div class="event" style="--event:${this._esc(event.calendar?.color || 'var(--dashboard-accent,#38bdf8)')}"><div class="date"><span>${this._esc(day)}</span><b>${this._esc(number)}</b></div><i></i><div class="event-copy"><b>${this._esc(event.summary || "Aftale")}</b><span>${this._esc(this._eventTime(event))} · ${this._esc(event.calendar?.name || "Kalender")}</span></div></div>`;
    }).join("") : `<div class="empty">Ingen aftaler de næste 7 dage</div>`;
  }
  _render() {
    if (!this.config) return;
    if (!this._rendered) {
      this.shadowRoot.innerHTML = `<style>
        :host{display:block;height:100%}.card{--summary-status:var(--success-color,#20e3a2);box-sizing:border-box;display:flex;flex-direction:column;height:100%;position:relative;overflow:hidden;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none;color:var(--primary-text-color,#fff)}
        header{display:flex;align-items:center;justify-content:space-between;margin:0 2px 14px}h2{font-size:20px;margin:0;display:flex;align-items:center;gap:9px}h2 ha-icon{color:var(--dashboard-accent,#38bdf8)}.health{font-size:12px;font-weight:800;padding:6px 10px;border-radius:99px;background:color-mix(in srgb,var(--success-color,#20e3a2) 14%,transparent);color:var(--success-color,#20e3a2)}
        .utilities{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:13px}.utility{--accent:var(--success-color,#20e3a2);position:relative;isolation:isolate;min-width:0;padding:13px 13px 12px 15px;border:0;border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--accent);border-radius:16px;background:var(--surface,var(--ha-card-background,var(--card-background-color,#171b22)));box-shadow:var(--dashboard-shadow-strong,var(--ha-card-box-shadow,0 8px 22px rgba(0,0,0,.18)));overflow:hidden;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease}.utility:hover{transform:translateY(calc(var(--dashboard-card-highlight, 1) * -2px));box-shadow:var(--dashboard-shadow-strong,var(--ha-card-box-shadow,none)),0 calc(var(--dashboard-card-highlight, 1) * 12px) calc(var(--dashboard-card-highlight, 1) * 26px) rgba(0,0,0,calc(var(--dashboard-card-highlight, 1) * .26))}.utility:active{transform:translateY(0)}.utility>*:not(.utility-bg){position:relative;z-index:1}.utility-head{display:flex;align-items:center;gap:7px;color:var(--secondary-text-color,#a7b2c2);font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.utility-head ha-icon{width:17px;height:17px;--mdc-icon-size:17px;color:var(--accent)}.utility-bg{position:absolute;right:-13px;bottom:-17px;z-index:0;width:76px;height:76px;--mdc-icon-size:76px;color:var(--accent);opacity:.12;transform:rotate(-7deg);animation:summaryIconDrift 5s ease-in-out infinite;pointer-events:none}.use{display:flex;align-items:baseline;gap:4px;margin-top:7px}.use b{font-size:22px;line-height:1}.use span{font-size:10px;color:var(--secondary-text-color,#a7b2c2)}.cost{margin-top:7px;padding-top:7px;border-top:1px solid color-mix(in srgb,var(--primary-text-color,#fff) 9%,transparent);font-size:11px;color:var(--secondary-text-color,#a7b2c2)}.cost b{float:right;color:var(--primary-text-color,#fff);font-size:13px}.cost small{font-size:9px}
        .body{display:grid;grid-template-columns:minmax(0,1.42fr) minmax(205px,.58fr);flex:1;min-height:0;gap:12px}.panel{--accent:var(--dashboard-accent,var(--primary-color,#38bdf8));position:relative;isolation:isolate;padding:13px 13px 13px 15px;border-radius:16px;border:0;border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--accent);background:var(--surface,var(--ha-card-background,var(--card-background-color,#171b22)));box-shadow:var(--dashboard-shadow-strong,var(--ha-card-box-shadow,0 8px 22px rgba(0,0,0,.18)));overflow:hidden}a.panel{color:inherit;text-decoration:none;cursor:pointer;transition:border-color .18s ease,background .18s ease,transform .18s ease}a.panel:focus-visible{border-color:color-mix(in srgb,var(--dashboard-accent,#38bdf8) 48%,transparent);outline:none}a.panel:hover,a.panel:focus-visible{transform:translateY(calc(var(--dashboard-card-highlight, 1) * -2px));box-shadow:var(--dashboard-shadow-strong,var(--ha-card-box-shadow,none)),0 calc(var(--dashboard-card-highlight, 1) * 12px) calc(var(--dashboard-card-highlight, 1) * 26px) rgba(0,0,0,calc(var(--dashboard-card-highlight, 1) * .26))}a.panel:active{transform:translateY(0)}@media(prefers-reduced-motion:reduce){a.panel:hover,a.panel:focus-visible{transform:none}}a.panel:active{transform:scale(.995)}.temperature-panel{position:relative}.panel h3{font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin:0 0 10px;color:var(--secondary-text-color,#a7b2c2)}
        .rooms{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));grid-auto-rows:minmax(64px,1fr);gap:7px;height:calc(100% - 22px)}.room{--room-accent:var(--success-color,#20e3a2);position:relative;isolation:isolate;display:flex;flex-direction:column;justify-content:space-between;gap:5px;min-width:0;padding:9px 10px;border:0;border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--room-accent);border-radius:12px;background:var(--surface,var(--ha-card-background,var(--card-background-color,#171b22)));box-shadow:var(--dashboard-shadow-strong,var(--ha-card-box-shadow,0 6px 16px rgba(0,0,0,.15)));overflow:hidden}.room>*{position:relative;z-index:1}.room.warm{--room-accent:var(--orange,#fb923c)}.room.cold{--room-accent:var(--info-color,#38bdf8)}.room.unavailable{--room-accent:var(--error-color,#ef4444)}.room-bg{position:absolute;right:-8px;bottom:-8px;z-index:0;width:58px;height:58px;--mdc-icon-size:58px;color:var(--room-accent);opacity:.12;transform:rotate(-7deg);animation:summaryIconDrift 5s ease-in-out infinite;pointer-events:none}.room-head{display:flex;align-items:center;justify-content:space-between;gap:6px;min-width:0}.room-name{min-width:0;font-size:11px;font-weight:800;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.room-badges{display:flex;align-items:center;gap:4px;flex:0 0 auto}.room-status{display:none;flex:0 0 auto;align-items:center;color:#fb923c}.room-status.heating,.room-status.presence{display:flex;animation:roomHeatPulse 1.8s ease-in-out infinite}.room-status.presence{color:var(--dashboard-accent,var(--info-color,#38bdf8))}.room-status ha-icon{--mdc-icon-size:14px}.room-body{display:flex;align-items:flex-end;justify-content:space-between;gap:6px;min-width:0}.room-temp{flex:0 0 auto;margin-left:auto;font-size:20px;font-weight:900;line-height:1}.room-target{min-width:0;font-size:10px;line-height:1.25;color:var(--secondary-text-color,#a7b2c2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.room-target:empty{display:none}.room-target b{color:var(--room-accent);font-size:11px}@keyframes roomHeatPulse{0%,100%{opacity:.55;transform:scale(1)}50%{opacity:1;transform:scale(1.12)}}
        .room-robot{position:absolute!important;z-index:3!important;left:8%;top:24%;width:22px;height:22px;--mdc-icon-size:22px;color:var(--dashboard-accent,var(--info-color,#38bdf8));opacity:.72;filter:drop-shadow(0 0 7px currentColor);pointer-events:none;animation:roomRobotX var(--robot-speed,16s) linear infinite alternate,roomRobotY var(--robot-speed-y,12s) linear infinite alternate}.room-robot.outdoors{z-index:4!important;left:12px;top:12px;color:var(--success-color,#20e3a2);offset-path:inset(8px round 13px);offset-distance:0;animation:outdoorRobotLap 25s linear infinite}.room-robot[hidden]{display:none}@keyframes roomRobotX{from{left:8%}to{left:calc(100% - 30px)}}@keyframes roomRobotY{from{top:24%}to{top:calc(100% - 29px)}}@keyframes outdoorRobotLap{to{offset-distance:100%}}
        @keyframes summaryIconDrift{50%{transform:translate(-4px,-3px) scale(1.04) rotate(-11deg);opacity:.22}}
        @media(prefers-reduced-motion:reduce){.utility-bg,.room-bg,.room-robot{animation:none}}
        .agenda-panel{display:flex;flex-direction:column;min-height:0;overflow:hidden}.events{display:grid;flex:1 1 0;height:0;gap:3px;align-content:start;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding-right:5px;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--dashboard-accent,#38bdf8) 55%,transparent) transparent}.events::-webkit-scrollbar{width:5px}.events::-webkit-scrollbar-thumb{border-radius:8px;background:color-mix(in srgb,var(--dashboard-accent,#38bdf8) 55%,transparent)}.event{display:grid;grid-template-columns:34px 3px minmax(0,1fr);gap:7px;align-items:center;min-width:0;padding:3px 0}.event>.date{display:grid;place-items:center;align-content:center;height:33px;border-radius:9px;background:color-mix(in srgb,var(--event) 13%,transparent);border:1px solid color-mix(in srgb,var(--event) 30%,transparent)}.date span{font-size:7px!important;text-transform:uppercase;color:var(--event)!important;font-weight:900}.date b{font-size:14px!important;line-height:14px}.event>i{display:block;align-self:stretch;border-radius:5px;background:var(--event)}.event-copy{min-width:0}.event-copy b,.event-copy span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.event-copy b{font-size:11px}.event-copy span,.empty{font-size:9px;color:var(--secondary-text-color,#a7b2c2);margin-top:1px}
        .card.portrait{min-height:570px}.card.portrait .body{grid-template-columns:minmax(0,1.15fr) minmax(420px,.85fr);min-height:390px}.card.portrait .rooms{grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:minmax(100px,1fr)}.card.portrait .events{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:14px;grid-auto-rows:min-content}.card.portrait .event{padding:5px 0}
        @media(min-width:1101px) and (max-height:950px){header{margin-bottom:9px}.utilities{margin-bottom:9px;gap:8px}.utility{padding-top:10px;padding-bottom:9px}.use{margin-top:5px}.cost{margin-top:5px;padding-top:5px}.body{grid-template-columns:minmax(0,1.25fr) minmax(230px,.75fr);gap:9px}.panel{padding:10px}.panel h3{margin-bottom:7px}.rooms{grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:minmax(42px,1fr);gap:5px;height:calc(100% - 19px)}.room{padding:5px 7px}.event{padding:2px 0}.card.portrait{min-height:570px}.card.portrait .body{grid-template-columns:minmax(0,1.15fr) minmax(420px,.85fr);min-height:390px}.card.portrait .rooms{grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:minmax(100px,1fr)}.card.portrait .events{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:14px}.card.portrait .event{padding:5px 0}}
        @media(max-width:700px){.utilities{grid-template-columns:1fr}.body{grid-template-columns:1fr}.card{padding:14px}}
      </style><ha-card class="card${this.config.portrait_layout?" portrait":""}"><header><h2><ha-icon icon="mdi:home-analytics"></ha-icon><span class="title"></span></h2><span class="health"></span></header><div class="utilities"><section class="utility electricity"></section><section class="utility water"></section><section class="utility heat"></section></div><div class="body"><a class="panel temperature-panel" href="${this._esc(this.config.rooms_navigation_path||'/hjem-overblik/cards')}"><h3>Temperaturer og setpunkter</h3><div class="rooms"></div></a><a class="panel agenda-panel" href="${this._esc(this.config.calendar_navigation_path||'/hjem-overblik/kalender')}"><h3>Næste i kalenderen</h3><div class="events"></div></a></div></ha-card>`;
      const navigate=(path)=>{if(!path)return;history.pushState(null,"",path);window.dispatchEvent(new Event("location-changed"));};
      this.shadowRoot.querySelector(".utility.electricity").onclick=()=>navigate(this.config.electricity_path);
      this.shadowRoot.querySelector(".utility.water").onclick=()=>navigate(this.config.water_path);
      this.shadowRoot.querySelector(".utility.heat").onclick=()=>navigate(this.config.heat_path);
      this._rendered = true;
    }
    if (!this._hass) return;
    const c=this.config, monthly=this._num(c.monthly_energy_entity);
    const electricCost=this._num(c.electric_month_cost_entity);
    const water=this._num(c.water_month_entity), waterCost=this._num(c.water_month_cost_entity);
    const heat=this._num(c.heat_month_entity), heatCost=this._num(c.heat_month_cost_entity);
    const co2=this._num(c.co2_entity);
    const diskProblem=(c.hdd_entities||[]).some((id)=>this._state(id)?.state==="on");
    const healthy=!diskProblem && (!Number.isFinite(co2)||co2<1000);
    this.shadowRoot.querySelector(".title").textContent=c.title;
    const card=this.shadowRoot.querySelector(".card"); card.style.setProperty("--summary-status",healthy?"var(--success-color,#20e3a2)":"var(--warning-color,#fb923c)");
    const health=this.shadowRoot.querySelector(".health"); health.textContent=healthy?"Alt ser normalt ud":"Kræver opmærksomhed"; health.style.color=healthy?"var(--success-color,#20e3a2)":"var(--warning-color,#fb923c)";
    const utility=(sel,icon,label,value,unit,cost,valid)=>{const tile=this.shadowRoot.querySelector(sel);tile.style.setProperty("--accent",valid?"var(--success-color,#20e3a2)":"var(--error-color,#ef4444)");tile.innerHTML=`<ha-icon class="utility-bg" icon="${icon}"></ha-icon><div class="utility-head">${label}</div><div class="use"><b>${value}</b><span>${unit}</span></div><div class="cost">Månedspris<b>${cost} kr</b></div>`;};
    utility(".electricity","mdi:lightning-bolt","Strøm",this._fmt(monthly,0),"kWh",this._fmt(electricCost,0),Number.isFinite(monthly)&&Number.isFinite(electricCost));
    utility(".water","mdi:water","Vand",this._fmt(water,3),"m³",this._fmt(waterCost,0),Number.isFinite(water)&&Number.isFinite(waterCost));
    utility(".heat","mdi:radiator","Fjernvarme",this._fmt(heat,1),"kWh",this._fmt(heatCost,0),Number.isFinite(heat)&&Number.isFinite(heatCost));
    this.shadowRoot.querySelector(".rooms").innerHTML=(c.rooms||[]).map((room)=>{
      const temp=this._num(room.temperature), humidity=this._num(room.humidity), target=Number(this._state(room.climate)?.attributes?.temperature);
      const delta=Number.isFinite(temp)&&Number.isFinite(target)?temp-target:Number.NaN;
      const tone=!Number.isFinite(temp)?"unavailable":delta>0.7?"warm":delta<-.7?"cold":"";
      const icon=this._esc(room.icon||'mdi:thermometer');
      const targetText=Number.isFinite(target)?`Mål <b>${this._fmt(target,1)}°</b>`:"";
      const humidityText=Number.isFinite(humidity)?`<span class="room-humidity">${targetText?"· ":""}${this._fmt(humidity,0)}%</span>`:"";
      const hvacAction=room.climate?this._state(room.climate)?.attributes?.hvac_action:undefined;
      const heating=hvacAction==="heating";
      const present=room.presence?this._state(room.presence)?.state==="on":false;
      const heatBadge=heating?`<span class="room-status heating" title="Kalder på varme"><ha-icon icon="mdi:fire"></ha-icon></span>`:"";
      const presenceBadge=present?`<span class="room-status presence" title="Der er nogen i rummet"><ha-icon icon="mdi:motion-sensor"></ha-icon></span>`:"";
      return `<div class="room ${tone}" data-room-key="${this._esc(this._roomKey(room.name))}"><ha-icon class="room-bg" icon="${icon}"></ha-icon><div class="room-head"><span class="room-name">${this._esc(room.name)}</span><div class="room-badges">${presenceBadge}${heatBadge}</div></div><div class="room-body"><span class="room-target">${targetText}${humidityText}</span><strong class="room-temp">${this._fmt(temp,1)}°</strong></div></div>`;
    }).join("");
    this._robotNodes.clear();
    this._updateRobots();
    this._renderEvents();
  }
  getCardSize(){return 6;}
  static getConfigElement(){return document.createElement("ha-home-summary-card-editor");}
  static getStubConfig(){return {title:"Husets overblik"};}
}

class HaHomeSummaryCardEditor extends HTMLElement {
  setConfig(config){this.config=structuredClone(config);this.render();}
  set hass(hass){this._hass=hass;}
  render(){
    const fields=[["title","Titel"],["event_days","Kalenderdage"],["max_events","Maks. hændelser"],["rooms_navigation_path","Navigation til rum"],["calendar_navigation_path","Navigation til kalender"],["monthly_energy_entity","Strøm denne måned"],["electric_month_cost_entity","Akkumuleret strømpris denne måned"],["water_month_entity","Vand denne måned"],["water_month_cost_entity","Vandpris denne måned"],["heat_month_entity","Fjernvarme denne måned"],["heat_month_cost_entity","Fjernvarmepris denne måned"],["co2_entity","CO₂"],["air_quality_entity","Luftkvalitet"],["water_flow_entity","Vandflow"],["storage_entity","Protect lager"]];
    const robots=JSON.stringify(this.config?.robots||[],null,2);
    this.innerHTML=`<style>label{display:block;margin:10px 0 4px;font-weight:600}input,textarea{box-sizing:border-box;width:100%;padding:10px;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color,var(--card-background-color));color:inherit}textarea{min-height:170px;font:12px/1.4 monospace;resize:vertical}.hint{margin-top:5px;color:var(--secondary-text-color);font-size:11px}.error{color:var(--error-color);font-size:11px}</style>${fields.map(([key,label])=>`<label>${label}</label><input data-key="${key}" value="${this.config?.[key]||SUMMARY_DEFAULTS[key]||''}">`).join('')}<label>Robotter</label><textarea data-robots>${robots}</textarea><div class="hint">Entity, navn, ikon og enten rum-entity, fast rum eller udendørs. Rumkortet følger live-status uden genindlæsning.</div><div class="error"></div>`;
    this.querySelectorAll("input").forEach((input)=>input.addEventListener("change",()=>this.dispatchEvent(new CustomEvent("config-changed",{bubbles:true,composed:true,detail:{config:{...this.config,[input.dataset.key]:input.value}}}))));
    this.querySelector("[data-robots]").addEventListener("change",(event)=>{try{const robots=JSON.parse(event.target.value);if(!Array.isArray(robots))throw new Error("Robotter skal være en liste");this.querySelector(".error").textContent="";this.dispatchEvent(new CustomEvent("config-changed",{bubbles:true,composed:true,detail:{config:{...this.config,robots}}}));}catch(error){this.querySelector(".error").textContent=`Ugyldig robotopsætning: ${error.message}`;}});
  }
}

class HaHomeDesktopLayoutCard extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});this._children=[];this._headerChildren=[];this._desktopChildren=[];this._mobileChildren=[];this._verticalChildren=[];this._mqList=[];this._resize=()=>requestAnimationFrame(()=>this._fitViewport());this._onBreakpoint=()=>this._flushActive();this._slots={header_cards:[],left_cards:[],right_cards:[],mobile_cards:[],vertical_cards:[]};this._slotSig={header_cards:[],left_cards:[],right_cards:[],mobile_cards:[],vertical_cards:[]};}
  connectedCallback(){window.addEventListener("resize",this._resize);window.visualViewport?.addEventListener("resize",this._resize);this._resize();this._flushActive();}
  disconnectedCallback(){window.removeEventListener("resize",this._resize);window.visualViewport?.removeEventListener("resize",this._resize);this._unbindBreakpoints();}
  // This card builds all three layouts up front (desktop columns, the mobile
  // column, and the vertical-only extras) and lets CSS show one set. Without the
  // split below, `set hass` fed every state tick to all ~29 card instances, so
  // roughly half of them re-rendered continuously while permanently invisible --
  // including a camera card. Only the set the current breakpoint actually shows
  // receives updates now; the others are refreshed by _flushActive() the moment
  // a breakpoint change makes them visible.
  _activeChildren(){
    const mb=this._mobileBreakpoint||1100,pb=this._phoneBreakpoint||700;
    // This runs on every `set hass` tick, so reuse the MediaQueryList objects
    // _bindBreakpoints() already created for the exact same two queries instead
    // of parsing a fresh media query twice per tick. Fallback covers the window
    // between connectedCallback() and the async _build() that binds them.
    const desktopMq=this._mqList[0]||window.matchMedia(`(min-width:${mb+1}px)`);
    const tabletMq=this._mqList[1]||window.matchMedia(`(min-width:${pb+1}px)`);
    // .header is never display:none -- it stays visible at every breakpoint, so
    // its cards are always part of the active set. Only .layout (the desktop
    // columns) and .mobile swap.
    if(desktopMq.matches)return this._headerChildren.concat(this._desktopChildren);
    if(tabletMq.matches)return this._headerChildren.concat(this._mobileChildren,this._verticalChildren);
    return this._headerChildren.concat(this._mobileChildren);
  }
  _flushActive(){if(this._hass)this._activeChildren().forEach((card)=>{card.hass=this._hass;});}
  _unbindBreakpoints(){this._mqList.forEach((mq)=>mq.removeEventListener?.("change",this._onBreakpoint));this._mqList=[];}
  _bindBreakpoints(mobileBreakpoint,phoneBreakpoint){
    this._unbindBreakpoints();
    this._mqList=[window.matchMedia(`(min-width:${mobileBreakpoint+1}px)`),window.matchMedia(`(min-width:${phoneBreakpoint+1}px)`)];
    this._mqList.forEach((mq)=>mq.addEventListener?.("change",this._onBreakpoint));
  }
  setConfig(config){
    if(!Array.isArray(config.left_cards)||!Array.isArray(config.right_cards)) throw new Error("Angiv left_cards og right_cards");
    const next=structuredClone(config);
    next.header_cards=Array.isArray(config.header_cards)?structuredClone(config.header_cards):[];
    next.mobile_cards=Array.isArray(config.mobile_cards)?structuredClone(config.mobile_cards):[];
    next.vertical_cards=Array.isArray(config.vertical_cards)?structuredClone(config.vertical_cards):[];
    const newKey=this._structureKey(next);
    const oldKey=this.config?this._structureKey(this.config):null;
    this.config=next;
    if(oldKey!==null&&oldKey===newKey){this._applyLayoutVars();this._updateExistingCards();return;}
    this._build();
  }
  // Kun kort-TYPERNE pr. side + de to breakpoints (som begge er bagt ind i
  // <style>-strengen i _build()) taeller som "strukturel". Aendrer denne
  // noegle sig IKKE, er det kun indhold i EKSISTERENDE kort eller rene
  // CSS-variable (kolonner/afstand/bottom_gap) der er aendret - saa opdateres
  // det billigt i stedet for at bygge alle ~20-29 kort (inkl. kameraer)
  // forfra igen. Foer kaldte setConfig() ALTID _build() ubetinget, saa hvert
  // eneste tastatur/pil-tryk i wrapperens egen editor genopbyggede HELE
  // forsidens kortsaet asynkront fra bunden - flere overlappende genopbygninger
  // i rap kunne let overbelaste fanen nok til at hele siden frøs/crashede.
  _structureKey(config){
    const sides=["header_cards","left_cards","right_cards","mobile_cards","vertical_cards"];
    return JSON.stringify([sides.map((side)=>(config[side]||[]).map((c)=>c?.type||"")),Number(config.mobile_breakpoint)||1100,Number(config.phone_breakpoint)||700]);
  }
  _applyLayoutVars(){const layout=this.shadowRoot?.querySelector(".layout");if(!layout)return;layout.style.setProperty("--desktop-columns",this.config.columns||"minmax(0,.9fr) minmax(440px,1.1fr)");layout.style.setProperty("--desktop-gap",this.config.gap||"clamp(10px,.75vw,18px)");this._fitViewport();}
  _updateExistingCards(){
    // KRITISK: uden aendrings-tjek her kaldte dette setConfig() paa ALLE ~20-29
    // kort (inkl. de 3 kamera-feeds) hver eneste gang ÉT ENESTE kort aendrede
    // sig - fx sky-fart inde i header-kortet. Kamera-strom-kort genopretter
    // typisk deres video-forbindelse ved hvert setConfig()-kald, saa gentagne
    // pile-klik/tastatur-slag kunne laekke streams indtil fanen loeb toer for
    // hukommelse og crashede (Chrome-fejlkode 5 = out of memory). Nu kaldes
    // setConfig() KUN paa det/de kort hvis config rent faktisk aendrede sig.
    ["header_cards","left_cards","right_cards","mobile_cards","vertical_cards"].forEach((side)=>{
      const cfgs=this.config[side]||[],slots=this._slots[side]||[],sigs=this._slotSig[side];
      cfgs.forEach((cfg,i)=>{
        if(!slots[i])return;
        const sig=JSON.stringify(cfg);
        if(sigs[i]===sig)return;
        sigs[i]=sig;
        slots[i].setConfig(cfg);
      });
    });
  }
  set hass(hass){this._hass=hass;this._activeChildren().forEach((card)=>{card.hass=hass;});}
  async _build(){
    const token={};this._buildToken=token;
    const helpers=await window.loadCardHelpers();if(this._buildToken!==token)return;
    const mobileBreakpoint=Math.min(2400,Math.max(600,Number(this.config.mobile_breakpoint)||1100));
    const phoneBreakpoint=Math.min(mobileBreakpoint-1,Math.max(360,Number(this.config.phone_breakpoint)||700));
    this._mobileBreakpoint=mobileBreakpoint;this._phoneBreakpoint=phoneBreakpoint;this._bindBreakpoints(mobileBreakpoint,phoneBreakpoint);
    this.shadowRoot.innerHTML=`<style>:host{display:block}.header,.mobile{display:flex;flex-direction:column;min-width:0;gap:var(--desktop-gap,clamp(10px,.75vw,18px))}.header:not(:empty){margin-bottom:var(--desktop-gap,clamp(10px,.75vw,18px))}.layout{display:grid;grid-template-columns:var(--desktop-columns,minmax(0,.9fr) minmax(440px,1.1fr));align-items:stretch;height:var(--desktop-height,auto);min-height:0;overflow:hidden;gap:var(--desktop-gap,clamp(10px,.75vw,18px))}.column{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden;gap:var(--desktop-gap,clamp(10px,.75vw,18px))}.slot{min-width:0;flex:0 0 auto}.slot.grow{display:flex;flex:1 1 0;min-height:0;overflow:hidden}.slot.grow>*{flex:1;min-width:0;min-height:0}.mobile,.vertical-only{display:none}@media(max-width:1399px) and (min-width:${mobileBreakpoint+1}px){.layout{grid-template-columns:minmax(0,1fr) minmax(420px,1fr)}}@media(max-width:${mobileBreakpoint}px){.header:not(:empty){margin-bottom:8px}.layout{display:none}.mobile{display:flex;gap:8px}}@media(min-width:${phoneBreakpoint+1}px) and (max-width:${mobileBreakpoint}px){.vertical-only{display:block}}</style><div class="header"></div><div class="layout"><div class="column left"></div><div class="column right"></div></div><div class="mobile"></div>`;
    const make=(cfg,parent,index,total,growLast=false,extraClass="",sideKey)=>{const card=helpers.createCardElement(cfg);const slot=document.createElement("div");slot.className=`slot${growLast&&index===total-1?" grow":""}${extraClass?` ${extraClass}`:""}`;slot.append(card);parent.append(slot);this._children.push(card);(extraClass==="vertical-only"?this._verticalChildren:parent===header?this._headerChildren:parent===mobile?this._mobileChildren:this._desktopChildren).push(card);if(sideKey){this._slots[sideKey].push(card);this._slotSig[sideKey].push(JSON.stringify(cfg));}};
    this._children=[];this._headerChildren=[];this._desktopChildren=[];this._mobileChildren=[];this._verticalChildren=[];this._slots={header_cards:[],left_cards:[],right_cards:[],mobile_cards:[],vertical_cards:[]};this._slotSig={header_cards:[],left_cards:[],right_cards:[],mobile_cards:[],vertical_cards:[]};const header=this.shadowRoot.querySelector(".header"),left=this.shadowRoot.querySelector(".left"),right=this.shadowRoot.querySelector(".right"),mobile=this.shadowRoot.querySelector(".mobile");
    this.config.header_cards.forEach((cfg,i)=>make(cfg,header,i,this.config.header_cards.length,false,"","header_cards"));
    this.config.left_cards.forEach((cfg,i)=>make(cfg,left,i,this.config.left_cards.length,true,"","left_cards"));
    this.config.right_cards.forEach((cfg,i)=>make(cfg,right,i,this.config.right_cards.length,true,"","right_cards"));
    this.config.mobile_cards.forEach((cfg,i)=>{if(i===this.config.mobile_cards.length-1)this.config.vertical_cards.forEach((verticalCfg,j)=>make(verticalCfg,mobile,j,this.config.vertical_cards.length,false,"vertical-only","vertical_cards"));make(cfg,mobile,i,this.config.mobile_cards.length,false,"","mobile_cards");});
    if(!this.config.mobile_cards.length)this.config.vertical_cards.forEach((cfg,i)=>make(cfg,mobile,i,this.config.vertical_cards.length,false,"vertical-only","vertical_cards"));
    this._applyLayoutVars();this._flushActive();this._fitViewport();
  }
  _fitViewport(){const layout=this.shadowRoot?.querySelector(".layout");if(!layout||!window.matchMedia(`(min-width:${(this._mobileBreakpoint||1100)+1}px)`).matches)return;const top=layout.getBoundingClientRect().top;const viewportHeight=window.visualViewport?.height||window.innerHeight;const bottomGap=Math.max(90,Number(this.config?.bottom_gap)||110);layout.style.setProperty("--desktop-height",`${Math.max(0,viewportHeight-top-bottomGap)}px`);}
  getCardSize(){return 12;}
  static getConfigElement(){return document.createElement("ha-home-desktop-layout-card-editor");}
  static getStubConfig(){return{columns:"minmax(0,.9fr) minmax(440px,1.1fr)",gap:"clamp(10px,.75vw,18px)",bottom_gap:110,mobile_breakpoint:1100,phone_breakpoint:700,header_cards:[],left_cards:[],right_cards:[],mobile_cards:[],vertical_cards:[]};}
}
class HaHomeDesktopLayoutCardEditor extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});this._nestedEditors=new Set();this._configSig="";this._listKey="";}
  // HA's vaert normaliserer/geninstantierer configen paa vejen tilbage (websocket-
  // roundtrip), saa noegle-raekkefoelgen kan skifte selv naar INGEN vaerdi rent
  // faktisk er aendret. Almindelig JSON.stringify er raekkefoelge-foelsom og
  // ville derfor fejlagtigt opfatte det som en aegte aendring hver gang -
  // hvilket udloeser render() og lukker den indlejrede kort-editor igen (den
  // "blinker og kan ikke redigeres"-fejl). _sig() sorterer noegler paa alle
  // niveauer foerst, saa signaturen kun aendrer sig ved en AEGTE vaerdi-aendring.
  _sig(value){if(Array.isArray(value))return `[${value.map((item)=>this._sig(item)).join(",")}]`;if(value&&typeof value==="object")return `{${Object.keys(value).sort().map((key)=>`${JSON.stringify(key)}:${this._sig(value[key])}`).join(",")}}`;return JSON.stringify(value);}
  // HA's dashboard-editor sender configen tilbage igen (config-changed-roundtrip)
  // hver gang et NESTED kort-editor (fx header-kortets egne felter) aendrer noget.
  // Foer kaldte det ubetinget render() her, som tomte .nested-beholderen og lukkede
  // den aabne under-editor efter hver eneste tastatur-aendring. Er configen uaendret
  // siden vi selv sendte den (aekko), springes genopbygningen over.
  setConfig(config){const sig=this._sig(config);this.config=structuredClone(config);if(sig===this._configSig)return;this._configSig=sig;const listKey=this._computeListKey();if(this._listKey&&listKey===this._listKey){this._syncSettings();return;}this.render();}
  set hass(hass){this._hass=hass;this._nestedEditors.forEach((item)=>item.hass=hass);}
  set lovelace(lovelace){this._lovelace=lovelace;this._nestedEditors.forEach((item)=>item.lovelace=lovelace);}
  _escape(value){return String(value??"").replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);}
  _emit(config){this.config=structuredClone(config);this._configSig=this._sig(this.config);this.dispatchEvent(new CustomEvent("config-changed",{bubbles:true,composed:true,detail:{config:this.config}}));}
  _cards(side){return Array.isArray(this.config?.[side])?this.config[side]:[];}
  _title(config,index){const type=String(config?.type||"Kort").replace(/^custom:/,"");return `${index+1}. ${type}`;}
  _changeSetting(input){this._emit({...this.config,[input.dataset.key]:input.type==="number"?Number(input.value):input.value});}
  _move(side,index,direction){const cards=structuredClone(this._cards(side));const target=index+direction;if(target<0||target>=cards.length)return;[cards[index],cards[target]]=[cards[target],cards[index]];this._emit({...this.config,[side]:cards});}
  _remove(side,index){const cards=structuredClone(this._cards(side));cards.splice(index,1);this._emit({...this.config,[side]:cards});}
  _toggleEditor(side,index,row){const host=row.querySelector(".nested");const button=row.querySelector(".edit");if(host.childElementCount){host.replaceChildren();button.classList.remove("active");return;}const editor=document.createElement("hui-card-element-editor");editor.hass=this._hass;editor.lovelace=this._lovelace;editor.value=structuredClone(this._cards(side)[index]);editor.addEventListener("config-changed",(event)=>{event.stopPropagation();if(!event.detail?.config)return;const cards=structuredClone(this._cards(side));cards[index]=structuredClone(event.detail.config);this._emit({...this.config,[side]:cards});});this._nestedEditors.add(editor);host.append(editor);button.classList.add("active");}
  _showPicker(side){const host=this.shadowRoot.querySelector(`.picker[data-side="${side}"]`);if(host.childElementCount){host.replaceChildren();return;}const picker=document.createElement("hui-card-picker");picker.hass=this._hass;picker.lovelace=this._lovelace;let handled=false;const accept=(event)=>{event.stopPropagation();const picked=event.detail?.config||event.detail?.cardConfig;if(handled||!picked)return;handled=true;const cards=[...structuredClone(this._cards(side)),structuredClone(picked)];this._emit({...this.config,[side]:cards});};picker.addEventListener("config-changed",accept);picker.addEventListener("card-picked",accept);this._nestedEditors.add(picker);host.append(picker);}
  _column(side,label){const cards=this._cards(side);return `<section><div class="section-head"><div><h3>${label}</h3><small>${cards.length} kort</small></div><button class="add" data-add="${side}" type="button"><ha-icon icon="mdi:plus"></ha-icon> Tilføj kort</button></div><div class="list">${cards.map((config,index)=>`<article class="row" data-side="${side}" data-index="${index}"><div class="row-head"><strong>${this._escape(this._title(config,index))}</strong><div class="actions"><button data-move="-1" title="Flyt op" ${index===0?"disabled":""}><ha-icon icon="mdi:arrow-up"></ha-icon></button><button data-move="1" title="Flyt ned" ${index===cards.length-1?"disabled":""}><ha-icon icon="mdi:arrow-down"></ha-icon></button><button class="edit" title="Rediger kort"><ha-icon icon="mdi:pencil"></ha-icon><span>Rediger</span></button><button class="delete" title="Fjern kort"><ha-icon icon="mdi:delete-outline"></ha-icon></button></div></div><div class="nested"></div></article>`).join("")}</div><div class="picker" data-side="${side}"></div></section>`;}
  render(){if(!this.config)return;this._nestedEditors.clear();this.shadowRoot.innerHTML=`<style>*{box-sizing:border-box}:host{display:block;color:var(--primary-text-color)}.settings,section{margin-bottom:14px;padding:14px;border:1px solid var(--divider-color);border-radius:14px;background:var(--card-background-color)}.settings{display:grid;grid-template-columns:2fr 1.3fr 1fr 1fr 1fr;gap:10px}.field span{display:block;margin-bottom:5px;color:var(--secondary-text-color);font-size:12px;font-weight:600}.field input{width:100%;padding:10px;border:1px solid var(--divider-color);border-radius:9px;background:var(--secondary-background-color,var(--card-background-color));color:inherit}.section-head,.row-head,.actions{display:flex;align-items:center}.section-head,.row-head{justify-content:space-between;gap:10px}.section-head{margin-bottom:10px}.section-head h3{margin:0;font-size:16px}.section-head small{color:var(--secondary-text-color)}.list{display:grid;gap:8px}.row{overflow:hidden;border:1px solid var(--divider-color);border-radius:11px;background:var(--secondary-background-color,var(--card-background-color))}.row-head{min-height:48px;padding:7px 9px 7px 12px}.row-head strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.actions{gap:5px}button{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:34px;padding:6px 9px;border:1px solid var(--divider-color);border-radius:9px;background:var(--card-background-color);color:inherit;cursor:pointer}button:hover,.edit.active{border-color:var(--primary-color);color:var(--primary-color)}button:disabled{cursor:default;opacity:.3}.delete:hover{border-color:var(--error-color);color:var(--error-color)}ha-icon{width:18px;height:18px;--mdc-icon-size:18px}.nested:not(:empty),.picker:not(:empty){padding:12px;border-top:1px solid var(--divider-color)}.picker:empty{display:none}.add{color:var(--primary-color)}@media(max-width:650px){.settings{grid-template-columns:1fr}.edit span{display:none}.actions{gap:3px}button{padding:6px}}</style><div class="settings"><label class="field"><span>PC-kolonner</span><input data-key="columns" value="${this._escape(this.config.columns||"")}"></label><label class="field"><span>Responsiv afstand</span><input data-key="gap" value="${this._escape(this.config.gap||"")}"></label><label class="field"><span>Skift til mobil ved (px)</span><input data-key="mobile_breakpoint" type="number" min="600" max="2400" step="10" value="${Number(this.config.mobile_breakpoint)||1100}"></label><label class="field"><span>Telefonvisning til (px)</span><input data-key="phone_breakpoint" type="number" min="360" max="1400" step="10" value="${Number(this.config.phone_breakpoint)||700}"></label><label class="field"><span>Afstand over navbar (px)</span><input data-key="bottom_gap" type="number" min="90" max="180" value="${Number(this.config.bottom_gap)||110}"></label></div>${this._column("header_cards","Top i fuld bredde")}${this._column("left_cards","Venstre PC-kolonne")}${this._column("right_cards","Højre PC-kolonne")}${this._column("mobile_cards","Mobilkort")}${this._column("vertical_cards","Ekstra kort på lodret skærm")}`;this.shadowRoot.querySelectorAll(".settings input").forEach((input)=>input.addEventListener("change",()=>this._changeSetting(input)));this.shadowRoot.querySelectorAll(".row").forEach((row)=>{const side=row.dataset.side,index=Number(row.dataset.index);row.querySelectorAll("[data-move]").forEach((button)=>button.addEventListener("click",()=>this._move(side,index,Number(button.dataset.move))));row.querySelector(".edit").addEventListener("click",()=>this._toggleEditor(side,index,row));row.querySelector(".delete").addEventListener("click",()=>this._remove(side,index));});this.shadowRoot.querySelectorAll("[data-add]").forEach((button)=>button.addEventListener("click",()=>this._showPicker(button.dataset.add)));this._listKey=this._computeListKey();}
  _computeListKey(){return JSON.stringify(["header_cards","left_cards","right_cards","mobile_cards","vertical_cards"].map((side)=>this._cards(side).map((c)=>c?.type||"")));}
  // Opdaterer kun de 5 rod-indstillingsfelter (kolonner/afstand/breakpoints) uden
  // at roere resten af DOM'en - saa et aabent "Rediger"-panel for et kort forbliver
  // aabent. Springer et felt over mens man rent faktisk sidder og skriver i det.
  _syncSettings(){const map={columns:this.config.columns||"",gap:this.config.gap||"",mobile_breakpoint:Number(this.config.mobile_breakpoint)||1100,phone_breakpoint:Number(this.config.phone_breakpoint)||700,bottom_gap:Number(this.config.bottom_gap)||110};this.shadowRoot.querySelectorAll(".settings input").forEach((input)=>{if(this.shadowRoot.activeElement===input)return;const key=input.dataset.key;if(key in map)input.value=map[key];});}
}
if (!customElements.get("ha-home-summary-card")) customElements.define("ha-home-summary-card", HaHomeSummaryCard);
if (!customElements.get("ha-home-summary-card-editor")) customElements.define("ha-home-summary-card-editor", HaHomeSummaryCardEditor);
if (!customElements.get("ha-home-desktop-layout-card")) customElements.define("ha-home-desktop-layout-card", HaHomeDesktopLayoutCard);
if (!customElements.get("ha-home-desktop-layout-card-editor")) customElements.define("ha-home-desktop-layout-card-editor", HaHomeDesktopLayoutCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha-home-status-card",
  name: "HA Home Status Card",
  description: "Knapkort med valgfri specialfunktion",
  preview: true,
});
window.customCards.push({ type:"ha-home-summary-card", name:"HA Home Summary Card", description:"Samlet husstatus, forbrug, kalender og kameraoverblik", preview:true });
window.customCards.push({ type:"ha-home-desktop-layout-card", name:"HA Home Desktop Layout", description:"Balancerede responsive kolonner til PC-forsiden", preview:false });
console.info(
  `%c HA-HOME-STATUS-GRID-CARD %c ${VERSION} `,
  "color:#fff;background:#38bdf8;font-weight:700",
  "color:#38bdf8;background:#102030",
);
