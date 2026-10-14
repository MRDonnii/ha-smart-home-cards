import { luxCss, LUX_ACCENT, LUX_KEYFRAMES } from "../../shared/lux.js";
import { isNewLook, lookEditorHtml, wireLookEditor } from "../../shared/look.js";

const AC_MODES = { off: ["Fra", "mdi:power"], heat: ["Varme", "mdi:heat-pump-outline"], cool: ["Køl", "mdi:snowflake"], heat_cool: ["Auto", "mdi:sun-snowflake-variant"], auto: ["Auto", "mdi:thermostat-auto"], dry: ["Tør", "mdi:water-percent"], fan_only: ["Blæs", "mdi:fan"] };
const AC_FANS = { auto: "Auto", low: "Lav", medium: "Mellem", high: "Høj", silent: "Stille", turbo: "Turbo", quiet: "Stille" };
const VERSION = "1.3.1";

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
    "smart_charge": "select.ev_charge_mode",
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

const MARQUEE_CSS = `.marquee{text-overflow:clip!important}.marquee-track{display:inline-block;max-width:none;vertical-align:top;white-space:nowrap}.marquee>.marquee-track{animation:marquee var(--marquee-duration,8s) ease-in-out infinite alternate;will-change:transform}@keyframes marquee{0%,18%{transform:translateX(0)}82%,100%{transform:translateX(calc(-1 * var(--marquee-distance,0px)))}}@media(prefers-reduced-motion:reduce){.marquee>.marquee-track{animation:none}}`;

// Wraps long text in a track that scrolls back and forth when it does not fit.
function setMarqueeContent(el, html) {
  if (!el || el._marqueeHtml === html) return;
  el._marqueeHtml = html;
  el.innerHTML = `<span class="marquee-track">${html}</span>`;
}

function updateMarquees(root, selector) {
  root.querySelectorAll(selector).forEach((el) => {
    // A selector can also match the track spans themselves; wrapping those again nests forever.
    if (el.classList.contains("marquee-track")) return;
    let track = el.firstElementChild;
    if (!track?.classList.contains("marquee-track") || el.childNodes.length !== 1) {
      const html = el.innerHTML;
      el._marqueeHtml = undefined;
      setMarqueeContent(el, html);
      track = el.firstElementChild;
    }
    const style = getComputedStyle(el);
    const available = el.clientWidth - parseFloat(style.paddingLeft || 0) - parseFloat(style.paddingRight || 0);
    const distance = Math.ceil(track.scrollWidth - available);
    const scroll = available > 0 && distance > 1;
    el.classList.toggle("marquee", scroll);
    if (scroll) {
      el.style.setProperty("--marquee-distance", `${distance}px`);
      el.style.setProperty("--marquee-duration", `${Math.max(6, 4 + distance / 20).toFixed(1)}s`);
    }
  });
}

function observeMarquees(host, root, selector) {
  const run = () => {
    cancelAnimationFrame(host._marqueeFrame);
    host._marqueeFrame = requestAnimationFrame(() => updateMarquees(root, selector));
  };
  if (!host._marqueeObserver && typeof ResizeObserver !== "undefined") {
    host._marqueeObserver = new ResizeObserver(run);
    host._marqueeObserver.observe(host);
  }
  run();
}

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
      ...Object.values(this.smartIds(cfg.smart_charge) || {}),
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
    const ids = [...this._watchedIds(), this.config?.style_entity].filter(Boolean);
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
  // Smart charging (EV Ledger's charge plan select): its sensors share the select's name (English entity ids).
  smartIds(mode) {
    const match = /^select\.(.+)_charge_mode$/.exec(String(mode || ""));
    if (!match) return null;
    const p = match[1];
    return { mode, status: `sensor.${p}_charge_status`, start: `sensor.${p}_next_charge_start`, end: `sensor.${p}_next_charge_end`,
      cost: `sensor.${p}_planned_charge_cost`, energy: `sensor.${p}_planned_charge_energy`, target: `sensor.${p}_plan_target_soc` };
  }
  // One line for the car's tile: the plan's time, price and what is missing to the target, or what the charging does
  // now. It scrolls when it is longer than the tile.
  evPlanText(ids, battery, power, session) {
    if (!ids) return "";
    const status = this.text(ids.status, "");
    const clock = (id) => {
      const date = new Date(this.text(id, ""));
      return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
    };
    const start = clock(ids.start);
    const end = clock(ids.end);
    const cost = this.number(ids.cost);
    const energy = this.number(ids.energy);
    const target = this.number(ids.target);
    const missing = Number.isFinite(target) && Number.isFinite(battery) ? target - battery : NaN;
    const price = Number.isFinite(cost) && cost > 0 ? `${cost.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr` : "";
    const need = missing >= 1 ? `mangler ${this.fmt(missing, 0)} %${Number.isFinite(energy) && energy > 0 ? ` (${this.fmt(energy, 1)} kWh)` : ""} til ${this.fmt(target, 0)} %` : "";
    if (power > 0) {
      return [`${this.fmt(power, 1)} kW`, Number.isFinite(session) && session > 0 ? `${this.fmt(session, 1)} kWh ladet` : "",
        end ? `færdig ${end}` : "", need, price ? `${price} i alt` : ""].filter(Boolean).join(" · ");
    }
    const fixed = { done: "Mål nået", paused: "På pause", awaiting_confirmation: "Venter på bekræftelse",
      stopped_externally: "Stoppet af bil/app", not_responding: "Laderen svarer ikke", other_car: "Anden bil i laderen" };
    if (fixed[status]) return [fixed[status], status === "done" ? "" : need].filter(Boolean).join(" · ");
    if (["waiting", "starting"].includes(status) && start) {
      return [`Lader ${start}${end ? `–${end}` : ""}`, price, need].filter(Boolean).join(" · ");
    }
    return "";
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
      const plan = this.evPlanText(this.smartIds(cfg.smart_charge), battery, power, sessionEnergy);
      detail = plan ? plan : power > 0
        ? this._evCycle % 2 === 1 && Number.isFinite(sessionEnergy) && sessionEnergy > 0
          ? `${this.fmt(sessionEnergy, 1)} kWh ladet`
          : `${this.fmt(power, 1)} kW lader`
        // "scheduled" from Monta, "waiting" from EV Smart Charge's charge status.
        : scheduleState.includes("scheduled") || scheduleState.split(" ").includes("waiting")
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
      // v2 draws its own rows from this (Claude AI, 2026-10-13; user: "åbne døre og alarm delen det er ikke så godt").
      const alarmName = (id) => { const st = this.text(id, "unknown"); return { armed_away: "Tilkoblet", armed_home: "Hjemme", armed_night: "Nat", disarmed: "Fra", triggered: "ALARM", arming: "Tilkobler", pending: "Venter" }[st] || "Ukendt"; };
      cfg.secV2 = { locked, total: segStates.length, hasError, windows, doors, triggered,
        alarms: [["/local/billeder/security-status/verisure-brand-icon.png", vIcon, vColor, alarmName(cfg.alarm_entity), "Verisure"], ["/local/billeder/security-status/ajax-brand-icon.png", aIcon, aColor, alarmName(cfg.secondary_alarm_entity), "Ajax"]] };
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
    close.style.cssText = "align-self:flex-end;flex:none;margin:0 4px 8px 0;min-height:44px;padding:10px 18px;border:1px solid var(--divider-color,rgba(255,255,255,.14));border-radius:999px;background:var(--card-background-color,rgba(8,12,18,.92));box-shadow:0 8px 20px rgba(0,0,0,.25);color:var(--primary-text-color,#fff);font:inherit;font-size:14px;font-weight:800;cursor:pointer";
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
      ${MARQUEE_CSS}.label .source-row{display:inline-flex}
      /* v2 (Claude AI, 2026-10-13; user: "byg noget helt nyt til disse kort med samme mulighed for at skifte tilbage"):
         the same data in a new tile: a glowing icon chip, the value large beside it, a ring for the meter, the label
         along the bottom and a soft accent glow; the decorations (phase waves, price bars) stay faint behind. */
      .chip,.ring{display:none}
      :host([v2]) .item{height:88px;padding:11px 12px 9px;border-left:0;border-radius:18px;
        background:radial-gradient(120% 140% at 0% 0%,color-mix(in srgb,var(--accent) 16%,transparent),transparent 58%),var(--surface,var(--ha-card-background,var(--card-background-color,#172536)));
        box-shadow:var(--dashboard-shadow-strong,var(--ha-card-box-shadow,0 8px 22px rgba(0,0,0,.18))),inset 0 0 0 1px color-mix(in srgb,var(--accent) 16%,transparent);
        display:grid;grid-template-columns:34px minmax(0,1fr) 36px;grid-template-rows:auto auto 1fr;column-gap:10px;align-content:start;text-align:left}
      :host([v2]) .item:hover{transform:none;box-shadow:var(--dashboard-shadow-strong,var(--ha-card-box-shadow,none)),inset 0 0 0 1px color-mix(in srgb,var(--accent) 40%,transparent),0 0 24px -10px var(--accent)}
      :host([v2]) .bg-icon{display:none}
      :host([v2]) .chip{display:grid;grid-row:1/3;grid-column:1;place-items:center;width:34px;height:34px;border-radius:11px;color:var(--accent);
        background:linear-gradient(160deg,color-mix(in srgb,var(--accent) 30%,transparent),color-mix(in srgb,var(--accent) 10%,transparent));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 38%,transparent),0 6px 16px -8px var(--accent);position:relative;z-index:2}
      :host([v2]) .chip ha-icon{--mdc-icon-size:19px;filter:drop-shadow(0 0 6px color-mix(in srgb,var(--accent) 55%,transparent));animation:chipFloat 4.5s ease-in-out infinite}
      @keyframes chipFloat{50%{transform:translateY(-1.5px) scale(1.05)}}
      :host([v2]) .value{grid-column:2;grid-row:1;font-size:19px;line-height:21px;font-weight:800;letter-spacing:-.01em}
      :host([v2]) .detail{grid-column:2;grid-row:2;padding-right:0;font-size:11px;line-height:14px;margin-top:1px}
      :host([v2]) .label{grid-column:1/-1;grid-row:3;align-self:end;margin-top:6px;padding-top:5px;border-top:1px solid color-mix(in srgb,var(--primary-text-color,#fff) 7%,transparent);font-size:10.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--secondary-text-color,#a7b2c2)}
      :host([v2]) .meter{display:none}
      :host([v2]) .ring{display:block;grid-column:3;grid-row:1/3;width:36px;height:36px;position:relative;z-index:2;transform:rotate(-90deg)}
      :host([v2]) .ring circle{fill:none;stroke-width:4;stroke-linecap:round}
      :host([v2]) .ring .tr{stroke:color-mix(in srgb,var(--primary-text-color,#fff) 9%,transparent)}
      :host([v2]) .ring .pr{stroke:var(--accent);filter:drop-shadow(0 0 3px color-mix(in srgb,var(--accent) 70%,transparent));transition:stroke-dasharray .9s cubic-bezier(.16,1,.3,1)}
      :host([v2]) .item.has-error .ring .pr{stroke:var(--error-color,#ef4444)}
      :host([v2]) .item.security{padding:11px 12px 9px}:host([v2]) .item.security .value{position:static;width:auto;height:auto;line-height:21px;padding:0}
      :host([v2]) .item.security .meter{display:none}
      :host([v2]) .item.security .detail{display:block;position:static}
      :host([v2]) .item.security .label{position:static;width:auto;height:auto;text-transform:none;letter-spacing:0;overflow:visible}
      :host([v2]) .sec2{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:4px;width:100%}
      :host([v2]) .sec2 .sp{display:flex;align-items:center;justify-content:center;gap:3px;min-width:0;height:20px;padding:0 4px;border-radius:7px;color:var(--c);background:color-mix(in srgb,var(--c) 12%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 30%,transparent)}
      :host([v2]) .sec2 .sp.on{background:color-mix(in srgb,var(--c) 22%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 60%,transparent),0 0 10px -3px var(--c);animation:secWarn 2s ease-in-out infinite}
      @keyframes secWarn{50%{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 30%,transparent)}}
      :host([v2]) .sec2 img{width:12px;height:12px;object-fit:contain;flex:none}:host([v2]) .sec2 ha-icon{--mdc-icon-size:13px;width:13px;height:13px;flex:none}
      :host([v2]) .sec2 b{font-size:9.5px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
      :host([v2]) .sec2 .alarm b{display:none}
      :host([v2]) .decoration{opacity:.45}
      :host([v2]) .appliances{top:auto;bottom:6px}
      @media(min-width:1101px) and (max-height:950px){:host([v2]) .item{height:70px;padding:7px 10px 6px;grid-template-columns:28px minmax(0,1fr) 30px}:host([v2]) .chip{width:28px;height:28px;border-radius:9px}:host([v2]) .ring{width:30px;height:30px}:host([v2]) .value{font-size:16px;line-height:18px}:host([v2]) .label{margin-top:3px;padding-top:3px;font-size:9.5px}}
      /* Phones: four tiles a row leave ~100 px – chip and ring on top, the value and detail under them. */
      /* Tiles in one row line up: the host and tile take the row's height (the security tile is a little taller). */
      :host([v2]){height:100%}
      @media(max-width:600px){:host([v2]) .item{height:100%;min-height:96px;padding:8px 8px 7px;grid-template-columns:26px minmax(0,1fr) 26px;grid-template-rows:26px auto auto 1fr;column-gap:6px;border-radius:15px}
        :host([v2]) .chip{grid-row:1;width:26px;height:26px;border-radius:8px}:host([v2]) .chip ha-icon{--mdc-icon-size:15px}
        :host([v2]) .ring{grid-row:1;grid-column:3;width:26px;height:26px}
        :host([v2]) .value{grid-column:1/-1;grid-row:2;margin-top:6px;font-size:15px;line-height:17px}
        :host([v2]) .detail{grid-column:1/-1;grid-row:3;font-size:10px;line-height:12px}
        :host([v2]) .label{grid-row:4;margin-top:4px;padding-top:4px;font-size:9px}
        :host([v2]) .item.security .value{grid-row:2}:host([v2]) .item.security .label{grid-row:4}:host([v2]) .sec2{gap:3px}:host([v2]) .sec2 .sp{padding:0 2px;gap:1px}:host([v2]) .sec2 img{display:none}:host([v2]) .sec2 b{overflow:visible;font-size:9px}:host([v2]) .sec2 ha-icon{--mdc-icon-size:12px;width:12px;height:12px}}
      /* compact: a low tile (user, 2026-10-13: "hund, alarm og indstillinger lidt mindre") – chip, value and ring on one line,
         the detail under the value; only the security tile keeps its pill row. */
      :host([v2][compact]) .item{height:100%;min-height:62px;align-content:center;padding:8px 10px;grid-template-columns:30px minmax(0,1fr) 30px;grid-template-rows:auto auto;row-gap:0}
      :host([v2][compact]) .chip{width:30px;height:30px;border-radius:10px}:host([v2][compact]) .chip ha-icon{--mdc-icon-size:17px}
      :host([v2][compact]) .ring{width:30px;height:30px}
      :host([v2][compact]) .value{grid-column:2;grid-row:1;margin-top:0;font-size:16px;line-height:18px}
      :host([v2][compact]) .detail{grid-column:2;grid-row:2;font-size:10.5px}
      :host([v2][compact]) .item:not(.security) .label{grid-column:1/-1;grid-row:3;margin-top:5px;padding-top:4px}
      :host([v2][compact]) .item.security .label{grid-row:3;margin-top:5px;padding-top:4px}
      :host([v2][compact]) .item.security .value{grid-row:1}
      @media(max-width:600px){:host([v2][compact]) .item{min-height:58px;padding:7px 7px;grid-template-columns:24px minmax(0,1fr) 24px;grid-template-rows:auto auto;column-gap:6px}
        :host([v2][compact]) .chip{grid-row:1/3;width:24px;height:24px;border-radius:8px}:host([v2][compact]) .chip ha-icon{--mdc-icon-size:14px}
        :host([v2][compact]) .ring{grid-row:1/3;grid-column:3;width:24px;height:24px}
        :host([v2][compact]) .value{grid-column:2;grid-row:1;margin-top:0;font-size:13.5px;line-height:16px}
        :host([v2][compact]) .detail{grid-column:2;grid-row:2;font-size:9.5px}
        :host([v2][compact]) .item .label{grid-column:1/-1;grid-row:3;margin-top:4px;padding-top:3px;font-size:9px}}
      @media(prefers-reduced-motion:reduce){:host([v2]) .chip ha-icon{animation:none}}
    </style><button class="item"><span class="decoration"></span><span class="chip"><ha-icon></ha-icon></span><div class="value"></div><div class="meter"></div><div class="detail"></div><svg class="ring" viewBox="0 0 36 36" aria-hidden="true"><circle class="tr" cx="18" cy="18" r="15"></circle><circle class="pr" cx="18" cy="18" r="15" stroke-dasharray="0 100"></circle></svg><div class="label"></div><ha-icon class="bg-icon"></ha-icon></button>`;
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
    const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
    const marquee = item.type !== "security";
    const setText = (selector, html) => {
      const el = this.shadowRoot.querySelector(selector);
      if (marquee) { setMarqueeContent(el, html); return; }
      el._marqueeHtml = undefined; el.classList.remove("marquee"); el.innerHTML = html;
    };
    setText(".value", esc(item.value));
    const meter = this.shadowRoot.querySelector(".meter");
    const segmentStates = item.segmentStates || Array.from({ length: item.segments || 5 }, (_, i) => (i + 1 <= item.meter ? "on" : ""));
    if (meter.children.length !== segmentStates.length) meter.innerHTML = meterHtml;
    else segmentStates.forEach((state, index) => { meter.children[index].className = `seg ${segClass(state)}`; });
    setText(".detail", esc(item.detail || " "));
    setText(".label", item.label);
    observeMarquees(this, this.shadowRoot, ".item:not(.security) :is(.value,.detail,.label)");
    this.shadowRoot
      .querySelector(".bg-icon")
      .setAttribute("icon", item.icon || "mdi:information-outline");
    // v2 follows `style_entity` (an input_boolean, on = new look) or `style: v2`.
    const v2 = isNewLook(this._hass, this.config);
    this.toggleAttribute("v2", v2); this.toggleAttribute("compact", this.config.compact === true);
    if (v2 && item.type === "security" && item.secV2) {
      const q = item.secV2; const open = q.windows + q.doors;
      const det = q.triggered ? "Alarmen er udløst" : q.hasError ? "En lås svarer ikke" : `${q.locked} af ${q.total} låst${open ? ` · ${open} åben${open > 1 ? "e" : ""}` : ""}`;
      const pill = (cls, c, inner, title) => `<span class="sp ${cls}" style="--c:${c}" title="${esc(title)}">${inner}</span>`;
      const warn = "var(--warning-color,#f59e0b)"; const mute = "var(--dashboard-icon-muted,var(--disabled-text-color,#64748b))";
      // Only the main alarm (user: "Du behøver ikke vise Ajax alarmen i det kort"); `show_secondary_alarm: true` adds it back.
      const rows = q.alarms.slice(0, this.config.show_secondary_alarm ? 2 : 1).map(([img, ic, col, name, brand]) => pill("alarm", col, `<img src="${img}" alt=""><ha-icon icon="${ic}"></ha-icon><b>${esc(name)}</b>`, `${brand}: ${name}`)).join("")
        + pill(q.windows ? "on" : "", q.windows ? warn : mute, `<ha-icon icon="${q.windows ? "mdi:window-open-variant" : "mdi:window-closed-variant"}"></ha-icon><b>${q.windows}</b>`, `${q.windows} vinduer åbne`)
        + pill(q.doors ? "on" : "", q.doors ? warn : mute, `<ha-icon icon="${q.doors ? "mdi:door-open" : "mdi:door-closed"}"></ha-icon><b>${q.doors}</b>`, `${q.doors} døre åbne`);
      const d = this.shadowRoot.querySelector(".detail"); d._marqueeHtml = undefined; d.classList.remove("marquee"); d.textContent = det;
      const l = this.shadowRoot.querySelector(".label"); l._marqueeHtml = undefined; l.classList.remove("marquee"); l.innerHTML = `<span class="sec2">${rows}</span>`;
    }
    if (v2) {
      this.shadowRoot.querySelector(".chip ha-icon").setAttribute("icon", item.icon || "mdi:information-outline");
      const on = segmentStates.filter((x) => x === "on" || x === "locked").length; const frac = segmentStates.length ? on / segmentStates.length : 0;
      const C = 2 * Math.PI * 15; this.shadowRoot.querySelector(".ring .pr").setAttribute("stroke-dasharray", `${(frac * C).toFixed(1)} ${C.toFixed(1)}`);
    }
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
    this.insertAdjacentHTML("beforeend", lookEditorHtml(this.config));
    wireLookEditor(this, this, () => this.config);
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
      ...(this.config?.rooms || []).flatMap((room) => [room.temperature, room.humidity, room.climate, room.presence, room.ac]),
      ...(this.config?.calendars || []).map((x) => x.entity)].filter(Boolean);
    const robotIds = (this.config?.robots || []).flatMap((robot) => [robot.entity, robot.room_entity]).filter(Boolean);
    const sig = JSON.stringify(ids.map((id) => [id, hass.states?.[id]?.state,
      hass.states?.[id]?.last_changed, hass.states?.[id]?.attributes?.message,
      hass.states?.[id]?.attributes?.start_time, ...(id.startsWith("climate.") ? [hass.states?.[id]?.attributes?.temperature, hass.states?.[id]?.attributes?.hvac_action, hass.states?.[id]?.attributes?.window_open, hass.states?.[id]?.attributes?.door_open, hass.states?.[id]?.attributes?.batteries, hass.states?.[id]?.attributes?.fan_mode, hass.states?.[id]?.attributes?.preset_mode, hass.states?.[id]?.attributes?.opening_pause_active] : [])]));
    this._roomStats();
    if (this._roomHost) this._roomSheetPaint();
    if (this._radCard) this._radCard.hass = hass;
    // Fetch Varme Center's room card once ahead, so the first tap on a room opens its popup at once.
    else if (this.config?.room_popup_dashboard && !this._radPreload) { this._radPreload = true; setTimeout(() => this._radiatorCard().catch(() => {}), 1500); }
    if (this.config?.rooms_style_entity && hass.states?.[this.config.rooms_style_entity]?.state !== this._vcState) { this._vcState = hass.states?.[this.config.rooms_style_entity]?.state; this._sig = ""; this._render(); }
    // room_tiles_entity: a switch for the new (on) or classic (off) room tiles, like the other cards' style switches.
    if (this.config?.room_tiles_entity && hass.states?.[this.config.room_tiles_entity]?.state !== this._rtState) { this._rtState = hass.states?.[this.config.room_tiles_entity]?.state; this._sig = ""; this._render(); }
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
  disconnectedCallback() { this._closeRoom(); this._radCard?._closeRoomPopup?.(); }
  // ---------- rooms (Claude AI, 2026-10-13) ----------
  // Everything a room tile and the room panel show: the room sensor first, the thermostat (Better Thermostat or any
  // climate) for the setpoint, heating, window/door, valves and batteries; the last 24 h from the recorder.
  // ---------- room tiles, rebuilt (Claude AI, 2026-10-13; user: "Rum-kortene skal redesignes totalt fra bunden") ----------
  // The compact sibling of Varme Center's Room Climate tiles: a tile tinted in the room's state colour, a glass icon chip,
  // name with an upper-case status, the temperature large with humidity under it, small glowing activity icons, and the
  // 24 h curve across the whole bottom with the setpoint dashed and a glowing dot at "now". `room_tiles: classic` = old.
  _roomTileV2(room, i) {
    const r = this._roomInfo(room); const f = (v, d = 1) => this._fmt(v, d);
    const st = !Number.isFinite(r.temp) ? "na" : room.outdoor ? "out" : r.window ? "open" : r.heating ? "heat" : r.ac?.running ? (r.ac.mode === "cool" ? "cool" : "heat") : r.delta > 0.7 ? "warm" : r.delta < -0.7 ? "cold" : Number.isFinite(r.delta) ? "ok" : "plain";
    const status = { na: "Ingen data", out: "Ude nu", open: "Vindue åbent", heat: r.ac?.running ? "Varmer via AC" : "Varmer nu", cool: "Køler via AC", warm: `Over mål +${f(r.delta)}°`, cold: `Under mål ${f(r.delta)}°`, ok: "På mål", plain: "Måling" }[st];
    const icons = [];
    if (r.present) icons.push(["pres", "mdi:account", "Der er nogen i rummet"]);
    if (r.heating) icons.push(["heat", "mdi:fire", "Kalder på varme"]);
    if (r.ac && r.ac.mode !== "off") icons.push([r.ac.running ? "ac on" : "ac", r.ac.mode === "cool" ? "mdi:snowflake" : "mdi:heat-pump-outline", `AC: ${r.ac.running ? "kører" : "venter"}`]);
    if (r.window) icons.push(["open", "mdi:window-open-variant", "Vindue eller dør er åben"]);
    if (r.lowBattery) icons.push(["bat", "mdi:battery-alert-variant-outline", `Lavt batteri (${r.battery} %)`]);
    // the curve: hourly means + now, scaled to include the setpoint
    const pts = [...r.series.map((p) => p.v), ...(Number.isFinite(r.temp) ? [r.temp] : [])];
    let curve = "";
    if (pts.length > 2) {
      const goal = Number.isFinite(r.target) ? r.target : room.outdoor ? NaN : Number(room.target ?? this.config.default_target ?? 22);
      const all = pts.concat(Number.isFinite(goal) ? [goal] : []); const lo = Math.min(...all) - 0.3; const hi = Math.max(...all) + 0.3; const Y = (v) => 38 - ((v - lo) / (hi - lo)) * 34;
      const line = pts.map((v, k) => `${k ? "L" : "M"}${((k / (pts.length - 1)) * 100).toFixed(2)} ${Y(v).toFixed(2)}`).join("");
      curve = `<div class="rt-cw"><svg class="rt-curve" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><path class="a" d="${line}L100 40L0 40Z"/><path class="l" d="${line}"/>${Number.isFinite(goal) ? `<line class="g" x1="0" x2="100" y1="${Y(goal).toFixed(2)}" y2="${Y(goal).toFixed(2)}"/>` : ""}</svg><i class="rt-dot" style="top:${((Y(pts[pts.length - 1]) / 40) * 100).toFixed(1)}%"></i></div>`;
    }
    const trend = r.trend > 0.15 ? '<ha-icon class="rt-tr up" icon="mdi:arrow-up-right"></ha-icon>' : r.trend < -0.15 ? '<ha-icon class="rt-tr dn" icon="mdi:arrow-down-right"></ha-icon>' : "";
    const sub = [Number.isFinite(r.humidity) ? `${f(r.humidity, 0)} %` : "", Number.isFinite(r.target) ? `${r.acTarget ? "AC" : "mål"} ${f(r.target)}°` : ""].filter(Boolean).join(" · ");
    // No icon and no curve (user: "drop ikon og graf så der er plads til det der skal"): name and temperature on top,
    // status with the activity icons and humidity/target under.
    const act = icons.map(([cls, ic, t]) => `<span class="${cls}" title="${this._esc(t)}"><ha-icon icon="${ic}"></ha-icon></span>`).join("");
    return `<div class="rt s-${st}${r.present ? " is-present" : ""}" data-room="${i}" data-room-key="${this._esc(this._roomKey(room.name))}" role="button" tabindex="0" title="${this._esc(room.name)}"><i class="sheen"></i>
      ${(() => { const acHeat = r.ac?.running && r.ac.mode !== "cool"; const cool = r.ac?.running && r.ac.mode === "cool"; const ic = cool ? "mdi:snowflake" : acHeat ? "mdi:heat-pump-outline" : r.heating ? "mdi:fire" : (room.icon || "mdi:thermometer"); return `<ha-icon class="rt-bg ${cool ? "cool" : acHeat || r.heating ? "hot" : ""}" icon="${this._esc(ic)}"></ha-icon>`; })()}
      <div class="rt-r1"><b class="rt-n">${this._esc(room.name)}</b><em><i></i><span class="rt-st">${this._esc(status)}</span></em></div>
      <div class="rt-r2"><span class="rt-lft">${act ? `<span class="rt-act">${act}</span>` : ""}<small class="rt-sub">${this._esc(sub)}</small></span><b class="rt-v">${f(r.temp)}<small>°</small>${trend}</b></div></div>`;
  }
  _roomInfo(room) {
    const cl = this._state(room.climate); const a = cl?.attributes || {};
    const temp = Number.isFinite(this._num(room.temperature)) ? this._num(room.temperature) : Number(a.current_temperature);
    const humidity = Number.isFinite(this._num(room.humidity)) ? this._num(room.humidity) : Number(a.current_humidity);
    const target = cl && cl.state !== "off" ? Number(a.temperature) : Number.NaN;
    const json = (v) => { if (v && typeof v === "object") return v; try { return JSON.parse(v); } catch { return null; } };
    const bats = Object.values(json(a.batteries) || {}).map((b) => Number(b?.battery)).filter(Number.isFinite);
    const battery = bats.length ? Math.min(...bats) : Number.NaN;
    const valves = Object.values(json(a.calibration_balance) || {}).map((v) => Number(v?.["valve%"])).filter(Number.isFinite);
    const series = this._roomSeries?.get(room.temperature) || [];
    const prev = series.length ? series[series.length - 1].v : Number.NaN;
    // While the AC is on, its setpoint is the room's target (user, 2026-10-13: "når AC kører skal det være setpoint fra den").
    const ac = this._acInfo(room.acEntity || room.ac); const acOn = ac && ac.mode !== "off" && Number.isFinite(Number(ac.a.temperature));
    const goal = acOn ? Number(ac.a.temperature) : target;
    return { cl, a, temp, humidity, target: goal, btTarget: target, acTarget: acOn, delta: Number.isFinite(temp) && Number.isFinite(goal) ? temp - goal : Number.NaN,
      heating: a.hvac_action === "heating", present: room.presence ? this._state(room.presence)?.state === "on" : false,
      window: a.window_open === true || a.door_open === true, battery, lowBattery: Number.isFinite(battery) && battery < 20,
      valve: valves.length ? valves.reduce((x, y) => x + y, 0) / valves.length : Number.NaN,
      trend: Number.isFinite(temp) && Number.isFinite(prev) ? temp - prev : Number.NaN, series, ac };
  }
  // The room's AC / heat pump (`ac`, e.g. Heat Pump Thermostat's wrapper): its mode, whether it runs, fan and control.
  _acInfo(id) {
    const st = this._state(id); if (!st) return null; const a = st.attributes || {};
    const mode = st.state; const action = a.hvac_action || (mode === "off" ? "off" : mode);
    const running = !["off", "idle", "unavailable", "unknown"].includes(String(action)) && mode !== "off";
    return { id, st, a, mode, running, paused: a.opening_pause_active === true, action };
  }
  // The faint curve behind a tile: the last 24 hourly means and the reading now.
  _spark(series) {
    if (!series || series.length < 3) return "";
    const v = series.map((p) => p.v); const lo = Math.min(...v); const hi = Math.max(...v); const span = Math.max(hi - lo, 0.6);
    const pts = v.map((y, i) => [(i / (v.length - 1)) * 100, 30 - ((y - lo) / span) * 26 - 2]);
    const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("");
    return `<svg class="room-spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true"><path class="a" d="${line}L100 32L0 32Z"/><path class="l" d="${line}"/></svg>`;
  }
  // Hourly means for every room sensor, one recorder call every 15 minutes.
  async _roomStats() {
    const ids = [...new Set((this.config?.rooms || []).map((r) => r.temperature).filter(Boolean))];
    if (!ids.length || !this._hass?.callWS || this._roomStatsBusy || Date.now() - (this._roomStatsAt || 0) < 15 * 60000) return;
    this._roomStatsBusy = true; this._roomStatsAt = Date.now();
    try {
      const end = new Date(); const start = new Date(+end - 24 * 3600000);
      const res = await this._hass.callWS({ type: "recorder/statistics_during_period", start_time: start.toISOString(), end_time: end.toISOString(), statistic_ids: ids, period: "hour", types: ["mean"] });
      const m = new Map();
      ids.forEach((id) => m.set(id, (res?.[id] || []).map((r) => ({ t: typeof r.start === "number" ? r.start : Date.parse(r.start), v: Number(r.mean) })).filter((p) => Number.isFinite(p.v))));
      this._roomSeries = m; this._sig = ""; this._render(); if (this._roomHost) this._roomSheetPaint(true);
    } catch { this._roomStatsAt = Date.now() - 10 * 60000; } finally { this._roomStatsBusy = false; }
  }

  // The room panel: on the page itself (document.body), like the calendar's detail sheet.
  // Varme Center's own room popup (user, 2026-10-13: "den samme popup menu til rumkort som er i varmecenter"): with
  // `room_popup_dashboard` the tiles open ha-radiator-overview-card-v2's popup with that dashboard's room config, from a
  // hidden copy of the card kept in this card. A room it doesn't know falls back to the panel below.
  async _radiatorCard() {
    const url = this.config?.room_popup_dashboard; if (!url || !this._hass?.callWS) return null;
    if (this._radCard) return this._radCard;
    if (!this._radCfgP) this._radCfgP = this._hass.callWS({ type: "lovelace/config", url_path: url === "lovelace" ? null : url }).then((lc) => {
      // Varme Center's rooms: the room climate card (its new look, same config) or the radiator card it is built on.
      let found = null; const walk = (o) => { if (found || !o || typeof o !== "object") return; if (["custom:ha-room-climate-card", "custom:ha-radiator-overview-card-v2"].includes(o.type) && Array.isArray(o.rooms)) { found = o; return; } Object.values(o).forEach(walk); }; walk(lc); return found;
    }).catch(() => null);
    const cfg = await this._radCfgP; if (!cfg) { this._radCfgP = null; if (!this._radMissing) { this._radMissing = true; this._sig = ""; this._render(); } return null; }
    this._radMissing = false;
    const tag = cfg.type.replace("custom:", "");
    await customElements.whenDefined(tag);
    const el = document.createElement(tag); el.style.display = "none"; el.setAttribute("aria-hidden", "true");
    el.setConfig(this.config?.room_controls_dashboard ? { ...cfg, room_controls_dashboard: this.config.room_controls_dashboard } : cfg); this.shadowRoot.appendChild(el); el.hass = this._hass; this._radCard = el; return el;
  }
  // Each heating room also gets its controls (light, actions, scene) from the "Alle rum" card (ha-home-room-overview-card-v3)
  // on `room_controls_dashboard`, so the popup's Styring tab has them (user, 2026-10-13: "popup med alt styring").
  async _withControls(cfg) {
    const url = this.config?.room_controls_dashboard; if (!url) return cfg;
    try {
      const lc = await this._hass.callWS({ type: "lovelace/config", url_path: url === "lovelace" ? null : url });
      // The room's whole Bubble pop-up from the rooms page (user, 2026-10-13: "tag hele popup siden og byg ind som styring").
      let v3 = null; const pops = {}; const walk = (o) => { if (!o || typeof o !== "object") return; if (o.type === "custom:ha-home-room-overview-card-v3" && Array.isArray(o.rooms) && !v3) v3 = o.rooms; if (o.type === "custom:bubble-card" && o.card_type === "pop-up" && o.hash && Array.isArray(o.cards)) pops[o.hash] = o; Object.values(o).forEach(walk); }; walk(lc);
      if (!v3) return cfg;
      const n = (v) => this._roomKey(v).replace(/(en|et)$/, "");
      const rooms = cfg.rooms.map((r) => {
        const m = v3.find((x) => (r.climate && x.climate === r.climate) || (r.temperature && x.temperature === r.temperature) || n(x.name) === n(r.name));
        const pop = m?.popup ? pops[m.popup] : Object.values(pops).find((x) => n(x.name) === n(r.name));
        if (pop) return { ...r, controls: { cards: structuredClone(pop.cards) } };
        return m && (m.light || m.actions?.length || m.alert) ? { ...r, controls: { light: m.light, actions: m.actions, alert: m.alert } } : r;
      });
      return { ...cfg, rooms };
    } catch { return cfg; }
  }
  _radiatorIndex(card, room) {
    const rooms = card?._config?.rooms || []; const n = (v) => this._roomKey(v).replace(/(en|et)$/, "");
    let i = room.climate ? rooms.findIndex((r) => r.climate === room.climate) : -1;
    if (i < 0 && room.temperature) i = rooms.findIndex((r) => r.temperature === room.temperature);
    if (i < 0) i = rooms.findIndex((r) => n(r.name) === n(room.name));
    return i;
  }
  async _openRoom(i) {
    const room = this.config?.rooms?.[i]; if (!room) return;
    const rad = await this._radiatorCard().catch(() => null);
    if (rad) {
      // The same popup as Varme Center's, with all its tabs: wait for the room controls (Styring) before opening.
      if (rad._config?.room_controls_dashboard && !rad._ctlSource && typeof rad._loadControls === "function") await rad._loadControls().catch(() => {});
      const k = this._radiatorIndex(rad, room); if (k >= 0) { rad.hass = this._hass; rad._openRoomPopup(k); return; }
    }
    this._closeRoom(); this._roomIdx = i; this._pending = {};
    const host = document.createElement("div"); host.className = "ha-home-room-sheet"; const root = host.attachShadow({ mode: "open" });
    const a = LUX_ACCENT;
    root.innerHTML = `<style>
:host{--a:${a};--ink:var(--primary-text-color,#eef3f8);--mut:var(--secondary-text-color,#8d9baa);--soft:color-mix(in srgb,var(--ink) 6%,transparent);color:var(--ink);font-family:var(--primary-font-family,inherit)}
*{box-sizing:border-box}button{font:inherit;color:inherit}
.sheet{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:16px;background:rgba(0,0,0,.45);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);animation:fade .2s ease-out}@keyframes fade{from{opacity:0}}
.box{--c:#20e3a2;width:min(480px,100%);max-height:100%;overflow:auto;padding:20px 22px 18px;border-radius:24px;background:var(--ha-card-background,var(--card-background-color,#161a21));box-shadow:0 30px 80px -20px rgba(0,0,0,.8),inset 0 0 0 1px color-mix(in srgb,var(--c) 35%,transparent);animation:luxGum .5s ease-out}
.box.warm{--c:#fb923c}.box.cold{--c:#38bdf8}.box.na{--c:#ef4444}
.hd{display:flex;align-items:center;gap:12px}.hd .ic{width:46px;height:46px;flex:none;border-radius:15px;display:grid;place-items:center;color:var(--c);background:color-mix(in srgb,var(--c) 15%,transparent)}
.hd h4{margin:0;font-size:20px}.hd small{display:block;color:var(--mut);font-size:12.5px;margin-top:2px}
.x{margin-left:auto;width:38px;height:38px;flex:none;border:0;border-radius:50%;background:var(--soft);cursor:pointer;display:grid;place-items:center}
.hero{display:flex;align-items:flex-end;gap:18px;margin:18px 0 6px}
.now b{display:block;font-size:52px;font-weight:300;letter-spacing:-.04em;line-height:.95}.now span{font-size:12px;color:var(--mut)}
.side{display:flex;flex-direction:column;gap:5px;margin-left:auto;text-align:right;font-size:13px;color:var(--mut)}.side b{color:var(--ink)}
.chart{position:relative;height:120px;margin:14px 0 22px}.chart svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.chart .ar{fill:color-mix(in srgb,var(--c) 18%,transparent)}.chart .ln{fill:none;stroke:var(--c);stroke-width:2;vector-effect:non-scaling-stroke;stroke-linejoin:round}
.chart .tg{stroke:rgba(255,255,255,.55);stroke-width:1.2;stroke-dasharray:4 4;vector-effect:non-scaling-stroke}
.chart .lb{position:absolute;font-size:10.5px;color:var(--mut)}.chart .nd{position:absolute;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:#fff;box-shadow:0 0 0 2px var(--c),0 0 10px var(--c)}
.empty{display:grid;place-items:center;height:100%;color:var(--mut);font-size:13px}
.ctl{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;margin-top:14px;padding:12px;border-radius:18px;background:var(--soft)}
.step{width:52px;height:52px;border:0;border-radius:16px;font-size:26px;font-weight:300;cursor:pointer;background:color-mix(in srgb,var(--ink) 7%,transparent);transition:transform .2s cubic-bezier(.2,1.4,.4,1)}.step:active{transform:scale(.88)}.step:disabled{opacity:.3}
.tgt{text-align:center}.tgt b{display:block;font-size:30px;font-weight:700}.tgt span{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)}.tgt.pend b{color:color-mix(in srgb,var(--a) 75%,#fff)}
.modes{display:flex;gap:6px;margin-top:10px}.modes button{flex:1;display:flex;align-items:center;justify-content:center;gap:7px;padding:10px;border:0;border-radius:13px;background:var(--soft);font-weight:800;font-size:13px;cursor:pointer;color:var(--mut)}.modes ha-icon{--mdc-icon-size:18px}
.rows{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:14px}
h5{display:flex;align-items:center;gap:8px;margin:18px 0 0;font-size:12px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)}h5 ha-icon{--mdc-icon-size:18px}h5 span{margin-left:auto;letter-spacing:0;text-transform:none;font-weight:700;font-size:12.5px}
h5.ach.run ha-icon{animation:pulse 1.6s ease-in-out infinite}h5.ach.run.m-heat{color:#fb923c}h5.ach.run.m-cool{color:#38bdf8}h5.ach.run.m-fan_only ha-icon{animation:spin 1.6s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.modes{flex-wrap:wrap}.modes button{min-width:0}.modes.fans button{flex:1 1 calc(33% - 6px);padding:8px}.ctl.sm{padding:9px}.ctl.sm .step{width:44px;height:44px;font-size:22px}.ctl.sm .tgt b{font-size:24px}
.row{display:flex;align-items:center;gap:9px;padding:9px 11px;border-radius:13px;background:var(--soft);font-size:12.5px;min-width:0}.row ha-icon{--mdc-icon-size:18px;color:var(--mut);flex:none}.row b{display:block;font-size:13.5px}.row span{color:var(--mut);font-size:11px}
.row.hot ha-icon{color:#fb923c;animation:pulse 1.6s ease-in-out infinite}.row.warn ha-icon{color:#38bdf8}.row.bad ha-icon{color:#ef4444}@keyframes pulse{50%{opacity:.4}}
.close{margin-top:16px;width:100%;padding:12px;border:0;border-radius:14px;font-weight:800;cursor:pointer;background:var(--soft)}
${luxCss({ base: ".modes button", active: ".modes button.on" })}
${LUX_KEYFRAMES}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style><div class="sheet"><div class="box"></div></div>`;
    document.body.appendChild(host); this._roomHost = host;
    const sheet = root.querySelector(".sheet");
    sheet.addEventListener("click", (e) => {
      if (e.target === sheet || e.target.closest("[data-close]")) { this._closeRoom(); return; }
      const st = e.target.closest("[data-step]"); if (st) { this._stepTarget(Number(st.dataset.step), st.dataset.ent); return; }
      const md = e.target.closest("[data-mode]"); if (md) { this._hass.callService("climate", "set_hvac_mode", { entity_id: md.dataset.ent, hvac_mode: md.dataset.mode }); return; }
      const fn = e.target.closest("[data-fan]"); if (fn) { this._hass.callService("climate", "set_fan_mode", { entity_id: fn.dataset.ent, fan_mode: fn.dataset.fan }); return; }
      const pr = e.target.closest("[data-preset]"); if (pr) { this._hass.callService("climate", "set_preset_mode", { entity_id: pr.dataset.ent, preset_mode: pr.dataset.preset }); return; }
      const mi = e.target.closest("[data-more]"); if (mi) this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: mi.dataset.more }, bubbles: true, composed: true }));
    });
    this._roomKeyH = this._roomKeyH || ((e) => { if (e.key === "Escape") this._closeRoom(); });
    document.addEventListener("keydown", this._roomKeyH);
    this._roomSheetPaint(true);
  }
  _closeRoom() { this._roomHost?.remove(); this._roomHost = null; Object.values(this._targetTimers || {}).forEach(clearTimeout); if (this._roomKeyH) document.removeEventListener("keydown", this._roomKeyH); }
  // Setpoint: steps add up while tapping and are sent 0.8 s after the last tap.
  _stepTarget(dir, ent) {
    const room = this.config.rooms[this._roomIdx]; const id = ent || room.climate; const st = this._state(id); if (!st) return;
    const a = st.attributes || {}; const step = Number(a.target_temp_step) || 0.5; const lo = Number(a.min_temp) || 5; const hi = Number(a.max_temp) || 30;
    this._pending = this._pending || {};
    const base = Number.isFinite(this._pending[id]) ? this._pending[id] : Number(a.temperature);
    if (!Number.isFinite(base)) return;
    const next = Math.min(hi, Math.max(lo, Math.round((base + dir * step) / step) * step)); this._pending[id] = next;
    this._roomSheetPaint(true);
    clearTimeout(this._targetTimers?.[id]); this._targetTimers = this._targetTimers || {};
    this._targetTimers[id] = setTimeout(() => { const t = this._pending[id]; this._hass.callService("climate", "set_temperature", { entity_id: id, temperature: t }).finally(() => { setTimeout(() => { if (this._pending[id] === t) { delete this._pending[id]; this._roomSheetPaint(true); } }, 1500); }); }, 800);
  }
  // The AC part of the room panel: what it does now, its modes, its own setpoint (whole degrees on the Qlimas), fan and
  // whether it runs by itself (Heat Pump Thermostat's preset auto) or by hand.
  _acSection(ac, pend) {
    if (!ac) return "";
    const a = ac.a; const off = ac.mode === "off"; const f = (v, d = 1) => this._fmt(v, d);
    const target = Number.isFinite(pend[ac.id]) ? pend[ac.id] : Number(a.temperature);
    const modes = (a.hvac_modes || []).filter((m) => AC_MODES[m]);
    const fans = a.fan_modes || []; const presets = (a.preset_modes || []).filter((p) => ["auto", "manual"].includes(p));
    const status = ac.paused ? "Pause · dør eller vindue står åbent" : off ? "Slukket" : ac.running ? `Kører · ${AC_MODES[ac.mode]?.[0] || ac.mode}` : `Venter · ${AC_MODES[ac.mode]?.[0] || ac.mode}`;
    return `<h5 class="ach ${ac.running ? `run m-${ac.mode}` : ""}"><ha-icon icon="${off ? "mdi:air-conditioner" : AC_MODES[ac.mode]?.[1] || "mdi:air-conditioner"}"></ha-icon>AC<span>${this._esc(status)}</span></h5>
      <div class="modes">${modes.map((m) => `<button type="button" data-mode="${m}" data-ent="${ac.id}" class="${ac.mode === m ? "on" : ""}"><ha-icon icon="${AC_MODES[m][1]}"></ha-icon>${AC_MODES[m][0]}</button>`).join("")}</div>
      ${off ? "" : `<div class="ctl sm"><button type="button" class="step" data-step="-1" data-ent="${ac.id}" aria-label="Sænk AC">−</button><div class="tgt ${Number.isFinite(pend[ac.id]) ? "pend" : ""}"><span>AC setpunkt</span><b>${Number.isFinite(target) ? `${f(target)}°` : "–"}</b></div><button type="button" class="step" data-step="1" data-ent="${ac.id}" aria-label="Hæv AC">+</button></div>
      ${fans.length ? `<div class="modes fans">${fans.map((m) => `<button type="button" data-fan="${this._esc(m)}" data-ent="${ac.id}" class="${a.fan_mode === m ? "on" : ""}">${this._esc(AC_FANS[String(m).toLowerCase()] || m)}</button>`).join("")}</div>` : ""}`}
      ${presets.length === 2 ? `<div class="modes"><button type="button" data-preset="auto" data-ent="${ac.id}" class="${a.preset_mode === "auto" ? "on" : ""}"><ha-icon icon="mdi:robot-outline"></ha-icon>Automatisk</button><button type="button" data-preset="manual" data-ent="${ac.id}" class="${a.preset_mode === "manual" ? "on" : ""}"><ha-icon icon="mdi:hand-back-right-outline"></ha-icon>Manuel</button></div>` : ""}`;
  }
  _roomSheetPaint(force = false) {
    const box = this._roomHost?.shadowRoot?.querySelector(".box"); const room = this.config?.rooms?.[this._roomIdx]; if (!box || !room) return;
    const r = this._roomInfo(room); const f = (v, d = 1) => this._fmt(v, d);
    const key = JSON.stringify([r.temp, r.humidity, r.target, r.heating, r.window, r.battery, r.valve, r.present, r.cl?.state, JSON.stringify(this._pending || {}), r.series.length, r.ac && [r.ac.mode, r.ac.running, r.ac.a.temperature, r.ac.a.fan_mode, r.ac.a.preset_mode, r.ac.paused]]);
    if (!force && key === this._roomSheetKey) return; this._roomSheetKey = key;
    box.className = `box ${!Number.isFinite(r.temp) ? "na" : r.delta > 0.7 ? "warm" : r.delta < -0.7 ? "cold" : ""}`;
    // chart: hourly means + now, the setpoint dashed
    const pts = [...r.series.map((p) => ({ t: p.t + 1800000, v: p.v })), ...(Number.isFinite(r.temp) ? [{ t: Date.now(), v: r.temp }] : [])];
    let chart = '<div class="empty">Ingen historik endnu</div>';
    if (pts.length > 2) {
      const t0 = Date.now() - 24 * 3600000; const t1 = Date.now(); const vs = pts.map((p) => p.v).concat(Number.isFinite(r.target) ? [r.target] : []);
      const lo = Math.floor(Math.min(...vs) - 0.3); const hi = Math.ceil(Math.max(...vs) + 0.3);
      const X = (t) => Math.max(0, ((t - t0) / (t1 - t0)) * 100); const Y = (v) => 100 - ((v - lo) / (hi - lo)) * 100;
      const line = pts.map((p, i) => `${i ? "L" : "M"}${X(p.t).toFixed(2)} ${Y(p.v).toFixed(2)}`).join("");
      const last = pts[pts.length - 1];
      chart = `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><path class="ar" d="${line}L${X(last.t)} 100L${X(pts[0].t)} 100Z"/><path class="ln" d="${line}"/>${Number.isFinite(r.target) ? `<line class="tg" x1="0" x2="100" y1="${Y(r.target)}" y2="${Y(r.target)}"/>` : ""}</svg>
        <span class="lb" style="left:4px;top:2px">${f(hi, 0)}°</span><span class="lb" style="left:4px;bottom:3px">${f(lo, 0)}°</span><span class="lb" style="left:0;bottom:-16px">for 24 t</span><span class="lb" style="left:50%;bottom:-16px;transform:translateX(-50%)">for 12 t</span><span class="lb" style="right:0;bottom:-16px">nu</span>
        <i class="nd" style="left:${X(last.t)}%;top:${Y(last.v)}%"></i>`;
    }
    const mins = r.series.length ? r.series.map((p) => p.v) : [];
    const range = mins.length ? `${f(Math.min(...mins))}–${f(Math.max(...mins))}° i døgnet` : "";
    const trend = !Number.isFinite(r.trend) ? "" : Math.abs(r.trend) < 0.05 ? "uændret siden sidste time" : `${r.trend > 0 ? "+" : "−"}${f(Math.abs(r.trend))}° siden sidste time`;
    const pend = this._pending || {}; const target = Number.isFinite(pend[room.climate]) ? pend[room.climate] : Number(r.a.temperature);
    const modes = (r.a.hvac_modes || []).filter((m) => ["heat", "off", "auto", "cool", "heat_cool"].includes(m));
    const MODE = { heat: ["Varme", "mdi:fire"], off: ["Fra", "mdi:power"], auto: ["Auto", "mdi:thermostat-auto"], cool: ["Køl", "mdi:snowflake"], heat_cool: ["Varme/køl", "mdi:sun-snowflake-variant"] };
    const rows = [];
    if (r.cl) rows.push(r.heating ? ["hot", "mdi:fire", "Varmer nu", "kalder på varme"] : ["", "mdi:fire-off", "Hviler", r.cl.state === "off" ? "termostaten er slukket" : "målet er nået"]);
    if (r.window) rows.push(["warn", "mdi:window-open-variant", "Vindue åbent", "varmen holder pause"]);
    if (Number.isFinite(r.valve)) rows.push(["", "mdi:valve", `${f(r.valve, 0)} %`, "ventilåbning"]);
    if (Number.isFinite(r.battery)) rows.push([r.lowBattery ? "bad" : "", r.lowBattery ? "mdi:battery-alert-variant-outline" : "mdi:battery-high", `${f(r.battery, 0)} %`, "laveste batteri"]);
    if (room.presence) rows.push([r.present ? "warn" : "", r.present ? "mdi:motion-sensor" : "mdi:motion-sensor-off", r.present ? "Nogen er her" : "Tomt", "tilstedeværelse"]);
    box.innerHTML = `<div class="hd"><span class="ic"><ha-icon icon="${this._esc(room.icon || "mdi:thermometer")}"></ha-icon></span><div><h4>${this._esc(room.name)}</h4><small>${Number.isFinite(r.target) ? `${r.acTarget ? "AC-mål" : "Mål"} ${f(r.target)}°` : "Ingen termostat"}${Number.isFinite(r.delta) ? ` · ${r.delta > 0 ? "+" : ""}${f(r.delta)}° fra målet` : ""}</small></div><button type="button" class="x" data-close aria-label="Luk"><ha-icon icon="mdi:close"></ha-icon></button></div>
      <div class="hero"><div class="now"><b>${f(r.temp)}°</b><span>${this._esc(trend)}</span></div><div class="side">${Number.isFinite(r.humidity) ? `<span><b>${f(r.humidity, 0)} %</b> fugt</span>` : ""}${range ? `<span>${range}</span>` : ""}</div></div>
      <div class="chart">${chart}</div>
      ${r.cl ? `${r.ac ? '<h5><ha-icon icon="mdi:radiator"></ha-icon>Radiatorer</h5>' : ""}<div class="ctl"><button type="button" class="step" data-step="-1" data-ent="${room.climate}" aria-label="Sænk" ${r.cl.state === "off" ? "disabled" : ""}>−</button><div class="tgt ${Number.isFinite(pend[room.climate]) ? "pend" : ""}"><span>Setpunkt</span><b>${r.cl.state === "off" ? "Fra" : `${f(target)}°`}</b></div><button type="button" class="step" data-step="1" data-ent="${room.climate}" aria-label="Hæv" ${r.cl.state === "off" ? "disabled" : ""}>+</button></div>
        ${modes.length > 1 ? `<div class="modes">${modes.map((m) => `<button type="button" data-mode="${m}" data-ent="${room.climate}" class="${r.cl.state === m ? "on" : ""}"><ha-icon icon="${MODE[m][1]}"></ha-icon>${MODE[m][0]}</button>`).join("")}</div>` : ""}` : ""}
      ${this._acSection(r.ac, pend)}
      ${rows.length ? `<div class="rows">${rows.map(([cls, ic, b, sub]) => `<div class="row ${cls}"><ha-icon icon="${ic}"></ha-icon><div><b>${b}</b><span>${sub}</span></div></div>`).join("")}</div>` : ""}
      <button type="button" class="close" data-close>Luk</button>`;
  }
  // ---------- month tiles (Claude AI, 2026-10-13; user: "Hvad med mine måneds forbrug kort") ----------
  // Daily end-of-day states of the month meters from the recorder (this month and last), every 30 minutes.
  async _utilStats() {
    const c = this.config || {}; const ids = [c.monthly_energy_entity, c.water_month_entity, c.heat_month_entity].filter(Boolean);
    if (!ids.length || !this._hass?.callWS || this._utilBusy || Date.now() - (this._utilAt || 0) < 30 * 60000) return;
    this._utilBusy = true; this._utilAt = Date.now();
    try {
      const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const res = await this._hass.callWS({ type: "recorder/statistics_during_period", start_time: start.toISOString(), statistic_ids: ids, period: "day", types: ["state"] });
      this._utilDays = new Map(ids.map((id) => [id, (res?.[id] || []).map((r) => ({ t: typeof r.start === "number" ? r.start : Date.parse(r.start), v: Number(r.state) })).filter((p) => Number.isFinite(p.v))]));
      this._sig = ""; this._render();
    } catch { this._utilAt = Date.now() - 25 * 60000; } finally { this._utilBusy = false; }
  }
  // Per tile: use per day this month (bars), today's use, the change against last month at the same day, and what the
  // whole month will cost at this pace. The meters count from the 1st, so a day's use is its state minus the day before;
  // a negative or absurd step (a meter glitch) counts as unknown.
  _utilMonth(id, costId, unit) {
    const empty = { chip: "", bars: "", foot: "" }; const days = this._utilDays?.get(id); const now = new Date();
    const cur = this._num(id); const cost = this._num(costId); if (!days?.length || !Number.isFinite(cur)) return empty;
    const m0 = new Date(now.getFullYear(), now.getMonth(), 1); const p0 = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(); const today = now.getDate();
    const thisM = days.filter((d) => d.t >= +m0); const lastM = days.filter((d) => d.t >= +p0 && d.t < +m0);
    const byDay = new Map(thisM.map((d) => [new Date(d.t).getDate(), d.v]));
    const uses = []; let prev = 0;
    for (let d = 1; d <= dim; d++) {
      if (d > today) { uses.push(null); continue; }
      const v = d === today ? cur : byDay.get(d); if (!Number.isFinite(v)) { uses.push(null); continue; }
      const u = v - prev; prev = v; uses.push(u >= 0 ? u : null);
    }
    const known = uses.filter((u) => Number.isFinite(u)).sort((a, b) => a - b); const med = known.length ? known[Math.floor(known.length / 2)] : 0;
    const clean = uses.map((u) => (Number.isFinite(u) && med > 0 && u > med * 12 ? null : u));
    const max = Math.max(...clean.filter(Number.isFinite), 0.0001);
    const bars = `<span class="ubars" aria-hidden="true">${clean.map((u, i) => `<i class="${i + 1 === today ? "now" : i + 1 > today ? "fut" : ""}" style="height:${Number.isFinite(u) ? Math.max(8, (u / max) * 100).toFixed(0) : 8}%"></i>`).join("")}</span>`;
    // last month at the same point: its end-of-day state on yesterday's date, against ours yesterday
    let chip = "";
    const yDay = today - 1; const ours = yDay >= 1 ? byDay.get(yDay) : undefined;
    const theirs = lastM.find((d) => new Date(d.t).getDate() === yDay)?.v;
    if (Number.isFinite(ours) && Number.isFinite(theirs) && theirs > 0) {
      const pct = ((ours - theirs) / theirs) * 100;
      if (Math.abs(pct) < 3) chip = `<span class="uchip same" title="Som sidste måned på samme tid">≈ sidste md.</span>`;
      else chip = `<span class="uchip ${pct > 0 ? "up" : "down"}" title="Mod sidste måned på samme tid">${pct > 0 ? "▲" : "▼"} ${this._fmt(Math.abs(pct), 0)} %</span>`;
    }
    const todayUse = clean[today - 1];
    const elapsed = (now - m0) / 864e5; const proj = Number.isFinite(cost) && elapsed > 1.5 ? (cost / elapsed) * dim : Number.NaN;
    const digits = unit === "m³" ? 3 : 1;
    const foot = `<div class="ufoot">${Number.isFinite(todayUse) ? `I dag <b>${this._fmt(unit === "m³" ? todayUse * 1000 : todayUse, unit === "m³" ? 0 : 1)} ${unit === "m³" ? "l" : unit}</b>` : ""}${Number.isFinite(proj) ? `<span title="Hvad hele måneden ender på i samme tempo">Forventet ≈ <b>${this._fmt(proj, 0)} kr</b></span>` : ""}</div>`;
    return { chip, bars, foot: Number.isFinite(todayUse) || Number.isFinite(proj) ? foot : "", digits };
  }
  async _vcRooms(host) {
    if (host._vc) { host._vc.hass = this._hass; return; }
    if (this._vcBusy) return; this._vcBusy = true;
    try {
      const src = await this._radiatorCard(); if (!src) return;
      // Compact rooms come from the radiator card (the room climate card has no compact layout); same config.
      await customElements.whenDefined("ha-radiator-overview-card-v2");
      const el = document.createElement("ha-radiator-overview-card-v2"); el.setConfig({ ...src._config, type: "custom:ha-radiator-overview-card-v2", compact: true });
      host.innerHTML = ""; host._html = ""; host.appendChild(el); host._vc = el; el.hass = this._hass;
    } finally { this._vcBusy = false; }
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
      // The robot moves by transforms on two nested wrappers (vertical outside, horizontal inside), not by left/top, so a
      // running robot costs no layout or repaint per frame (Claude AI).
      if (!node || !node.isConnected) {
        node = document.createElement("span"); node.className = "room-robot"; node.dataset.robot = key;
        node.innerHTML = '<span class="room-robot-x"><ha-icon class="room-robot-icon"></ha-icon></span>';
        this._robotNodes.set(key, node);
      }
      node.querySelector(".room-robot-icon").setAttribute("icon", robot.icon || (String(robot.entity || "").startsWith("lawn_mower.") ? "mdi:robot-mower" : "mdi:robot-vacuum"));
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
    this._observeMarquees();
  }
  _observeMarquees() { observeMarquees(this, this.shadowRoot, ".room-name, .room-target, .event-copy > b, .event-copy > span, .rt-n, .rt-st, .rt-sub"); }
  _render() {
    if (!this.config) return;
    if (!this._rendered) {
      this.shadowRoot.innerHTML = `<style>
        :host{display:block;height:100%}.card{--summary-status:var(--success-color,#20e3a2);box-sizing:border-box;display:flex;flex-direction:column;height:100%;position:relative;overflow:hidden;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none;color:var(--primary-text-color,#fff)}
        header{display:flex;align-items:center;justify-content:space-between;margin:0 2px 14px}h2{font-size:20px;margin:0;display:flex;align-items:center;gap:9px}h2 ha-icon{color:var(--dashboard-accent,#38bdf8)}.health{font-size:12px;font-weight:800;padding:6px 10px;border-radius:99px;background:color-mix(in srgb,var(--success-color,#20e3a2) 14%,transparent);color:var(--success-color,#20e3a2)}
        .utilities{display:grid;grid-template-columns:repeat(var(--utility-count,3),minmax(0,1fr));gap:10px;margin-bottom:13px}.utility[hidden]{display:none!important}.utility{--accent:var(--success-color,#20e3a2);position:relative;isolation:isolate;min-width:0;padding:13px 13px 12px 15px;border:0;border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--accent);border-radius:16px;background:var(--surface,var(--ha-card-background,var(--card-background-color,#171b22)));box-shadow:var(--dashboard-shadow-strong,var(--ha-card-box-shadow,0 8px 22px rgba(0,0,0,.18)));overflow:hidden;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease}.utility:hover{transform:translateY(calc(var(--dashboard-card-highlight, 1) * -2px));box-shadow:var(--dashboard-shadow-strong,var(--ha-card-box-shadow,none)),0 calc(var(--dashboard-card-highlight, 1) * 12px) calc(var(--dashboard-card-highlight, 1) * 26px) rgba(0,0,0,calc(var(--dashboard-card-highlight, 1) * .26))}.utility:active{transform:translateY(0)}.utility>*:not(.utility-bg){position:relative;z-index:1}.utility-head{display:flex;align-items:center;gap:7px;color:var(--secondary-text-color,#a7b2c2);font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.utility-head ha-icon{width:17px;height:17px;--mdc-icon-size:17px;color:var(--accent)}.utility-bg{position:absolute;right:-13px;bottom:-17px;z-index:0;width:76px;height:76px;--mdc-icon-size:76px;color:var(--accent);opacity:.12;transform:rotate(-7deg);animation:summaryIconDrift 5s ease-in-out infinite;pointer-events:none}.use{display:flex;align-items:baseline;gap:4px;margin-top:7px}.use b{font-size:22px;line-height:1}.use span{font-size:10px;color:var(--secondary-text-color,#a7b2c2)}.cost{margin-top:7px;padding-top:7px;border-top:1px solid color-mix(in srgb,var(--primary-text-color,#fff) 9%,transparent);font-size:11px;color:var(--secondary-text-color,#a7b2c2)}.cost b{float:right;color:var(--primary-text-color,#fff);font-size:13px}.cost small{font-size:9px}
        .body{display:grid;grid-template-columns:minmax(0,1.42fr) minmax(205px,.58fr);flex:1;min-height:0;gap:12px}.panel{--accent:var(--dashboard-accent,var(--primary-color,#38bdf8));position:relative;isolation:isolate;padding:13px 13px 13px 15px;border-radius:16px;border:0;border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--accent);background:var(--surface,var(--ha-card-background,var(--card-background-color,#171b22)));box-shadow:var(--dashboard-shadow-strong,var(--ha-card-box-shadow,0 8px 22px rgba(0,0,0,.18)));overflow:hidden}a.panel{color:inherit;text-decoration:none;cursor:pointer;transition:border-color .18s ease,background .18s ease,transform .18s ease}a.panel:focus-visible{border-color:color-mix(in srgb,var(--dashboard-accent,#38bdf8) 48%,transparent);outline:none}a.panel:hover,a.panel:focus-visible{transform:translateY(calc(var(--dashboard-card-highlight, 1) * -2px));box-shadow:var(--dashboard-shadow-strong,var(--ha-card-box-shadow,none)),0 calc(var(--dashboard-card-highlight, 1) * 12px) calc(var(--dashboard-card-highlight, 1) * 26px) rgba(0,0,0,calc(var(--dashboard-card-highlight, 1) * .26))}a.panel:active{transform:translateY(0)}@media(prefers-reduced-motion:reduce){a.panel:hover,a.panel:focus-visible{transform:none}}a.panel:active{transform:scale(.995)}.temperature-panel{position:relative}.panel.temperature-panel,.panel.agenda-panel{padding:0;border-left:0;border-radius:0;background:none;box-shadow:none;overflow:visible}.panel.temperature-panel h3,.panel.agenda-panel h3{padding-left:2px}a.panel.temperature-panel:hover,a.panel.temperature-panel:focus-visible,a.panel.temperature-panel:active,a.panel.agenda-panel:hover,a.panel.agenda-panel:focus-visible,a.panel.agenda-panel:active{transform:none;box-shadow:none}.panel.agenda-panel{overflow:hidden;min-height:0}.card .panel.agenda-panel .events{gap:7px;padding:0 5px 4px 0;contain:size}.card.portrait .panel.agenda-panel .events{column-gap:7px}.card .panel.agenda-panel .event{grid-template-columns:34px minmax(0,1fr);gap:9px;padding:7px 9px;border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--event);border-radius:12px;background:var(--surface,var(--ha-card-background,var(--card-background-color,#171b22)));box-shadow:var(--dashboard-shadow-strong,var(--ha-card-box-shadow,0 6px 16px rgba(0,0,0,.15)));transition:transform .18s ease,box-shadow .18s ease}.card .panel.agenda-panel .event>i{display:none}a.agenda-panel:hover .event:hover{transform:translateY(calc(var(--dashboard-card-highlight, 1) * -2px))}.temperature-panel .room{transition:transform .18s ease,box-shadow .18s ease}a.temperature-panel:hover .room:hover{transform:translateY(calc(var(--dashboard-card-highlight, 1) * -2px));box-shadow:var(--dashboard-shadow-strong,var(--ha-card-box-shadow,none)),0 calc(var(--dashboard-card-highlight, 1) * 10px) calc(var(--dashboard-card-highlight, 1) * 22px) rgba(0,0,0,calc(var(--dashboard-card-highlight, 1) * .26))}.panel h3{font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin:0 0 10px;color:var(--secondary-text-color,#a7b2c2)}
        /* Classic tiles: always 3 side by side (user, 2026-10-14); on a low tile the temperature and icon shrink so nothing is cut. */
        .rooms.old{grid-template-columns:repeat(3,minmax(0,1fr))!important}
        .ro{--room-accent:var(--success-color,#20e3a2);container-type:size;min-height:0;position:relative;isolation:isolate;display:flex;flex-direction:column;justify-content:space-between;gap:5px;min-width:0;padding:9px 10px;border:0;border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--room-accent);border-radius:12px;background:var(--surface,var(--ha-card-background,var(--card-background-color,#171b22)));box-shadow:var(--dashboard-shadow-strong,var(--ha-card-box-shadow,0 6px 16px rgba(0,0,0,.15)));overflow:hidden;cursor:pointer}
        .ro>*{position:relative;z-index:1}.ro.warm{--room-accent:var(--orange,#fb923c)}.ro.cold{--room-accent:var(--info-color,#38bdf8)}.ro.unavailable{--room-accent:var(--error-color,#ef4444)}
        .ro-bg{position:absolute;right:-8px;bottom:-8px;z-index:0;width:58px;height:58px;--mdc-icon-size:58px;color:var(--room-accent);opacity:.12;transform:rotate(-7deg);animation:summaryIconDrift 5s ease-in-out infinite;pointer-events:none}
        .ro-head{display:flex;align-items:center;justify-content:space-between;gap:6px;min-width:0}
        .ro-name{min-width:0;font-size:11px;font-weight:800;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .ro-badges{display:flex;align-items:center;gap:4px;flex:0 0 auto}
        .ro-status{display:none;flex:0 0 auto;align-items:center;color:#fb923c}.ro-status.heating,.ro-status.presence{display:flex;animation:roomHeatPulse 1.8s ease-in-out infinite}
        .ro-status.presence{color:var(--dashboard-accent,var(--info-color,#38bdf8))}.ro-status ha-icon{--mdc-icon-size:14px}
        .ro-body{display:flex;align-items:flex-end;justify-content:space-between;gap:6px;min-width:0}
        .ro-temp{flex:0 0 auto;margin-left:auto;font-size:20px;font-weight:900;line-height:1}
        .ro-target{min-width:0;font-size:10px;line-height:1.25;color:var(--secondary-text-color,#a7b2c2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .ro-target:empty{display:none}.ro-target b{color:var(--room-accent);font-size:11px}
        @media(prefers-reduced-motion:reduce){.ro-bg,.ro-status{animation:none}}
        @media(min-width:1101px) and (max-height:950px){.ro{padding:5px 7px}}
        @container (max-height:58px){.ro-temp{font-size:16px}.ro-name{font-size:10.5px}.ro-bg{width:40px;height:40px;--mdc-icon-size:40px}.ro-status ha-icon{--mdc-icon-size:12px}}
        @container (max-height:44px){.ro-target{display:none}.ro-temp{font-size:14px}}
                .rooms{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));grid-auto-rows:minmax(64px,1fr);gap:7px;height:calc(100% - 22px)}.room{--room-accent:var(--success-color,#20e3a2);position:relative;isolation:isolate;display:flex;flex-direction:column;justify-content:space-between;gap:5px;min-width:0;padding:9px 10px;border:0;border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--room-accent);border-radius:12px;background:var(--surface,var(--ha-card-background,var(--card-background-color,#171b22)));box-shadow:var(--dashboard-shadow-strong,var(--ha-card-box-shadow,0 6px 16px rgba(0,0,0,.15)));overflow:hidden}.room>*{position:relative;z-index:1}.room.warm{--room-accent:var(--orange,#fb923c)}.room.cold{--room-accent:var(--info-color,#38bdf8)}.room.unavailable{--room-accent:var(--error-color,#ef4444)}.room-bg{position:absolute;right:-8px;bottom:-8px;z-index:0;width:58px;height:58px;--mdc-icon-size:58px;color:var(--room-accent);opacity:.12;transform:rotate(-7deg);animation:summaryIconDrift 5s ease-in-out infinite;pointer-events:none}.room-head{display:flex;align-items:center;justify-content:space-between;gap:6px;min-width:0}.room-name{min-width:0;font-size:11px;font-weight:800;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.room-badges{display:flex;align-items:center;gap:4px;flex:0 0 auto}.room-status{display:none;flex:0 0 auto;align-items:center;color:#fb923c}.room-status.heating,.room-status.presence{display:flex;animation:roomHeatPulse 1.8s ease-in-out infinite}.room-status.presence{color:var(--dashboard-accent,var(--info-color,#38bdf8))}.room-status ha-icon{--mdc-icon-size:14px}.room-body{display:flex;align-items:flex-end;justify-content:space-between;gap:6px;min-width:0}.room-temp{flex:0 0 auto;margin-left:auto;font-size:20px;font-weight:900;line-height:1}.room-target{min-width:0;font-size:10px;line-height:1.25;color:var(--secondary-text-color,#a7b2c2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.room-target:empty,.room-target:has(>.marquee-track:empty){display:none}.room-target b{color:var(--room-accent);font-size:11px}@keyframes roomHeatPulse{0%,100%{opacity:.55;transform:scale(1)}50%{opacity:1;transform:scale(1.12)}}
        .room-robot{position:absolute!important;z-index:3!important;left:0;top:24%;width:100%;height:calc(76% - 29px);pointer-events:none;animation:roomRobotY var(--robot-speed-y,12s) linear infinite alternate}.room-robot-x{position:absolute;left:8%;top:0;width:calc(92% - 30px);height:0;animation:roomRobotX var(--robot-speed,16s) linear infinite alternate}.room-robot-icon{position:absolute;left:0;top:0;width:22px;height:22px;--mdc-icon-size:22px;color:var(--dashboard-accent,var(--info-color,#38bdf8));opacity:.72;filter:drop-shadow(0 0 7px currentColor)}.room-robot.outdoors{z-index:4!important;left:12px;top:12px;width:22px;height:22px;offset-path:inset(8px round 13px);offset-distance:0;animation:outdoorRobotLap 25s linear infinite}.room-robot.outdoors .room-robot-x{left:0;width:22px;animation:none}.room-robot.outdoors .room-robot-icon{color:var(--success-color,#20e3a2)}.room-robot[hidden]{display:none}@keyframes roomRobotX{from{transform:translateX(0)}to{transform:translateX(100%)}}@keyframes roomRobotY{from{transform:translateY(0)}to{transform:translateY(100%)}}@keyframes outdoorRobotLap{to{offset-distance:100%}}
        @keyframes summaryIconDrift{50%{transform:translate(-4px,-3px) scale(1.04) rotate(-11deg);opacity:.22}}
        .utility-head{justify-content:flex-start}.uchip{margin-left:auto;padding:2px 7px;border-radius:999px;font-size:9.5px;font-weight:900;letter-spacing:.02em;text-transform:none;white-space:nowrap}
        .uchip.up{color:#fb923c;background:color-mix(in srgb,#fb923c 15%,transparent)}.uchip.down{color:#20e3a2;background:color-mix(in srgb,#20e3a2 15%,transparent)}.uchip.same{color:var(--secondary-text-color,#a7b2c2);background:color-mix(in srgb,var(--primary-text-color,#fff) 7%,transparent)}
        .use{align-items:flex-end}.ubars{display:flex;align-items:flex-end;gap:1.5px;flex:1;height:26px;margin-left:10px;min-width:0}
        .ubars i{flex:1;min-width:1px;border-radius:2px 2px 0 0;background:color-mix(in srgb,var(--accent) 55%,transparent);transition:height .5s ease}
        .ubars i.now{background:var(--accent);box-shadow:0 0 8px var(--accent);animation:uNow 2.4s ease-in-out infinite}.ubars i.fut{background:color-mix(in srgb,var(--primary-text-color,#fff) 7%,transparent)}
        @keyframes uNow{50%{opacity:.55}}
        .ufoot{display:flex;justify-content:space-between;gap:8px;margin-top:4px;font-size:10px;color:var(--secondary-text-color,#a7b2c2);white-space:nowrap;overflow:hidden}.ufoot b{color:var(--primary-text-color,#fff);font-weight:800}
        /* The rooms fill exactly what is left under the heading (the last row was cut 7 px) and stay low (Claude AI). */
        .temperature-panel{display:flex;flex-direction:column;min-height:0}.temperature-panel.vc .rooms{display:block;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}.temperature-panel .rooms{flex:1;height:auto!important;min-height:0;grid-auto-rows:minmax(46px,1fr)!important}
        .rooms .rt{--sc:#20e3a2;container-type:inline-size;position:relative;isolation:isolate;overflow:hidden;display:flex;flex-direction:column;min-width:0;padding:8px 10px 8px;border-radius:16px;cursor:pointer;--ch:.5;
          background:radial-gradient(130% 120% at 0% 0%,color-mix(in srgb,var(--sc) 16%,transparent),transparent 60%),var(--surface,var(--ha-card-background,var(--card-background-color,#171b22)));
          box-shadow:var(--dashboard-shadow-strong,var(--ha-card-box-shadow,0 6px 16px rgba(0,0,0,.15))),inset 0 0 0 1px color-mix(in srgb,var(--sc) 20%,transparent);transition:transform .25s cubic-bezier(.2,1.4,.4,1),box-shadow .25s}
        /* Same edge light as Varme Center's Room Climate tiles: it runs around the tile while someone is in the room (Claude AI). */
        .rt .sheen{position:absolute;inset:0;z-index:2;border-radius:inherit;padding:1.6px;overflow:hidden;opacity:0;pointer-events:none;transition:opacity .4s ease;
          -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}
        .rt .sheen::before{content:"";position:absolute;left:50%;top:50%;width:160%;aspect-ratio:1;translate:-50% -50%;background:conic-gradient(from 0deg,transparent 0 62%,color-mix(in srgb,var(--sc) 40%,transparent) 76%,var(--sc) 88%,#fff 91%,var(--sc) 94%,transparent 100%);animation:rtOrbit 4.5s linear infinite}
        .rt.is-present .sheen{opacity:1}@keyframes rtOrbit{to{rotate:360deg}}
        .rooms .rt:hover{box-shadow:var(--dashboard-shadow-strong,none),inset 0 0 0 1px color-mix(in srgb,var(--sc) 45%,transparent),0 0 22px -8px var(--sc)}.rooms .rt:active{transform:scale(.97)}
        .rt.s-ok{--sc:#20e3a2}.rt.s-warm{--sc:#f2c14e}.rt.s-cold,.rt.s-cool{--sc:#4fb3ff}.rt.s-heat{--sc:#ff8a3d}.rt.s-open{--sc:#a78bfa}.rt.s-out{--sc:#38bdf8}.rt.s-plain{--sc:#7fd4b0}.rt.s-na{--sc:#ef4444}
        .rt.s-heat{animation:rtHeat 2.6s ease-in-out infinite}@keyframes rtHeat{50%{box-shadow:var(--dashboard-shadow-strong,none),inset 0 0 0 1px color-mix(in srgb,var(--sc) 55%,transparent),0 0 26px -6px var(--sc)}}
        .rt-top{position:relative;z-index:1;display:flex;align-items:flex-start;gap:8px;min-width:0}
        .rt-ic{flex:none;display:grid;place-items:center;width:30px;height:30px;border-radius:10px;color:var(--sc);background:linear-gradient(160deg,color-mix(in srgb,var(--sc) 28%,transparent),color-mix(in srgb,var(--sc) 8%,transparent));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--sc) 35%,transparent)}
        .rt-ic ha-icon{--mdc-icon-size:17px;filter:drop-shadow(0 0 5px color-mix(in srgb,var(--sc) 55%,transparent))}
        .rt-nm{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}.rt-nm b{font-size:12.5px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .rt-nm em{display:flex;align-items:center;gap:4px;font-style:normal;font-size:8.5px;line-height:1.45;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--sc);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .rt-nm em i{flex:none;width:5px;height:5px;border-radius:50%;background:var(--sc);box-shadow:0 0 6px var(--sc)}
        .rt-mid{position:relative;z-index:1;display:flex;align-items:baseline;gap:7px;margin-top:4px;min-width:0}.rt-sub{font-size:9.5px;font-weight:700;color:var(--secondary-text-color,#a7b2c2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rt-t{flex:none;display:flex;flex-direction:column;align-items:flex-end;line-height:1;gap:2px}.rt-t b{display:flex;align-items:flex-start;font-size:22px;text-shadow:0 1px 6px rgba(0,0,0,.4);font-weight:850;letter-spacing:-.02em}.rt-t b small{font-size:12px;margin-top:1px;color:var(--secondary-text-color,#a7b2c2)}
        .rt-t>small{margin-top:3px;font-size:9.5px;font-weight:700;color:var(--secondary-text-color,#a7b2c2);white-space:nowrap}
        .rt-tr{--mdc-icon-size:13px;margin-left:1px}.rt-tr.up{color:#ff8a3d}.rt-tr.dn{color:#4fb3ff}
        .rt-act{position:absolute;z-index:2;left:48px;bottom:5px;display:flex;gap:3px}.rt-act span{display:grid;place-items:center;width:20px;height:20px;border-radius:7px;background:rgba(10,12,18,.45);backdrop-filter:blur(4px);color:var(--secondary-text-color,#a7b2c2)}.rt-act ha-icon{--mdc-icon-size:13px}
        .rt-act .pres{color:#20e3a2}.rt-act .heat{color:#ff8a3d;animation:roomHeatPulse 1.6s ease-in-out infinite}.rt-act .ac.on{color:#4fb3ff;animation:roomHeatPulse 1.8s ease-in-out infinite}.rt-act .open{color:#a78bfa}.rt-act .bat{color:#ef4444}
        .rt-cw{position:relative;flex:1 1 0;min-height:0;margin:5px -10px -8px;border-top:1px solid color-mix(in srgb,var(--sc) 10%,transparent)}.rt-curve{position:absolute;inset:3px 0 0 0;width:100%;height:calc(100% - 3px);pointer-events:none}
        .rt-curve .a{fill:color-mix(in srgb,var(--sc) 18%,transparent)}.rt-curve .l{fill:none;stroke:var(--sc);stroke-width:1.8;vector-effect:non-scaling-stroke;stroke-linejoin:round;filter:drop-shadow(0 0 3px color-mix(in srgb,var(--sc) 60%,transparent))}
        .rt-curve .g{stroke:rgba(255,255,255,.4);stroke-width:1;stroke-dasharray:3 3;vector-effect:non-scaling-stroke}
        .rt-dot{position:absolute;right:3px;z-index:1;width:8px;height:8px;margin-top:-4px;border-radius:50%;background:#fff;box-shadow:0 0 0 2px var(--sc),0 0 10px var(--sc);pointer-events:none}
        
        .rooms .rt{justify-content:space-between;gap:4px;padding:8px 11px 7px}
        .rt-r1{position:relative;z-index:1;display:flex;flex-direction:column;gap:1px;min-width:0}.rt-n{font-size:13px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .rt-r1 em{display:flex;align-items:center;gap:4px;min-width:0;font-style:normal;font-size:9px;line-height:1.45;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--sc);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .rt-r1 em i{flex:none;width:5px;height:5px;border-radius:50%;background:var(--sc);box-shadow:0 0 6px var(--sc)}
        .rt-r2{position:static;display:flex;align-items:flex-end;gap:6px;min-width:0}.rt-lft{position:relative;z-index:1}
        .rt-lft{flex:1;min-width:0;display:flex;align-items:center;gap:6px}.rt-lft .rt-act{position:static;display:flex;gap:3px;flex:none}
        .rt-lft .rt-sub{min-width:0;font-size:10px;font-weight:700;color:var(--secondary-text-color,#a7b2c2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .rt-v{flex:none;display:flex;align-items:flex-start;font-size:25px;font-weight:850;line-height:.9;letter-spacing:-.02em;text-shadow:0 2px 8px rgba(0,0,0,.35)}.rt-v small{font-size:12px;margin-top:1px;color:var(--secondary-text-color,#a7b2c2)}
        .rt-bg{position:absolute;z-index:0;right:-8px;top:50%;width:76px;height:76px;--mdc-icon-size:76px;transform:translateY(-50%) rotate(-8deg);color:var(--sc);opacity:.09;pointer-events:none}
        .rt-bg.hot{color:#ff8a3d;opacity:.2;animation:rtBgHot 2.6s ease-in-out infinite;filter:drop-shadow(0 0 10px rgba(255,138,61,.5))}
        .rt-bg.cool{color:#4fb3ff;opacity:.2;animation:rtBgCool 6s linear infinite;filter:drop-shadow(0 0 10px rgba(79,179,255,.5))}
        @keyframes rtBgHot{50%{opacity:.3;transform:translateY(-52%) rotate(-8deg) scale(1.05)}}@keyframes rtBgCool{to{transform:translateY(-50%) rotate(352deg)}}
        
        /* Temperature pinned bottom-right; the text left of it scrolls when it does not fit (user, 2026-10-13). */
        .rooms .rt{container-type:size}
        .rt .rt-v{position:absolute;z-index:1;right:11px;bottom:7px}
        .rt-r1{padding-right:4px}.rt-n,.rt-st,.rt-lft .rt-sub{display:block;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:clip}
        .rt-r1 em .rt-st{flex:1}
        .rt-r2{padding-right:78px;min-height:16px}
        @container (max-height:66px){.rt-lft{display:none}.rt .rt-v{font-size:21px}.rt-r1{padding-right:70px}.rt .rt-v{bottom:auto;top:50%;transform:translateY(-50%)}}
        @media(prefers-reduced-motion:reduce){.rt-bg,.rt .sheen::before,.rt.s-heat,.rt-act span{animation:none!important}}
        .room{cursor:pointer;transition:transform .25s cubic-bezier(.2,1.4,.4,1),filter .2s}.room:hover{filter:brightness(1.08)}.room:active{transform:scale(.96)}
        .room-spark{position:absolute!important;z-index:0!important;left:0;right:0;bottom:0;width:100%;height:58%;pointer-events:none;opacity:.6}
        .room-spark .a{fill:color-mix(in srgb,var(--room-accent) 15%,transparent)}.room-spark .l{fill:none;stroke:color-mix(in srgb,var(--room-accent) 65%,transparent);stroke-width:1.4;vector-effect:non-scaling-stroke}
        .room-temp{display:flex;align-items:center;gap:1px}
        .room-arc{width:26px;height:26px;margin-right:4px;flex:none}.room-arc path{fill:none;stroke-width:4.5;stroke-linecap:round}.room-arc .t{stroke:color-mix(in srgb,var(--room-accent) 18%,rgba(255,255,255,.08))}.room-arc .v{stroke:var(--room-accent);filter:drop-shadow(0 0 3px color-mix(in srgb,var(--room-accent) 60%,transparent));transition:stroke-dasharray .6s ease}
        .room.is-heating .room-arc .v{animation:roomHeatPulse 1.8s ease-in-out infinite}
        .room-name em.room-st{display:flex;align-items:center;gap:4px;margin-top:1px;line-height:1.45;padding-top:1px;font-style:normal;font-size:8.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:color-mix(in srgb,var(--room-accent) 75%,var(--secondary-text-color,#a7b2c2));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .room-name em.room-st i{flex:none;width:5px;height:5px;border-radius:50%;background:var(--room-accent);box-shadow:0 0 6px var(--room-accent)}
        .room.is-heating{--room-accent:var(--orange,#fb923c)}.room-trend{--mdc-icon-size:14px;opacity:.9}.room-trend.up{color:var(--orange,#fb923c)}.room-trend.down{color:var(--info-color,#38bdf8)}
        .room-bar{position:relative;height:4px;margin-top:1px;border-radius:4px;background:linear-gradient(90deg,#38bdf8 0%,#20e3a2 38%,#20e3a2 62%,#fb923c 100%);opacity:.85}
        .room-bar.soft{opacity:.6}.room-bar .mid{position:absolute;left:50%;top:-2px;bottom:-2px;width:2px;margin-left:-1px;border-radius:2px;background:rgba(255,255,255,.75)}
        .room-bar .dot{position:absolute;top:50%;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;border-radius:50%;background:#fff;box-shadow:0 0 0 2px var(--room-accent),0 0 8px var(--room-accent);transition:left .6s ease}
        .room-status.window,.room-status.battery{display:flex}.room-status.window{color:var(--info-color,#38bdf8);animation:roomHeatPulse 1.8s ease-in-out infinite}.room-status.battery{color:var(--error-color,#ef4444)}
        .room.is-heating .room-bg{color:var(--orange,#fb923c);opacity:.2}
        .room-status.ac{display:flex;color:var(--secondary-text-color,#a7b2c2)}.room-status.ac.run{animation:roomHeatPulse 1.8s ease-in-out infinite}.room-status.ac.run.m-heat{color:#fb923c}.room-status.ac.run.m-cool{color:#38bdf8}.room-status.ac.run.m-dry{color:#5ad1e6}.room-status.ac.run.m-fan_only ha-icon{animation:acSpin 1.6s linear infinite}.room-status.ac.run.m-heat_cool{color:#a78bfa}@keyframes acSpin{to{transform:rotate(360deg)}}

        @media(prefers-reduced-motion:reduce){.utility-bg,.room-bg,.room-robot,.room-robot-x{animation:none}}
        .agenda-panel{display:flex;flex-direction:column;min-height:0;overflow:hidden}.events{display:grid;flex:1 1 0;height:0;gap:3px;align-content:start;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding-right:5px;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--dashboard-accent,#38bdf8) 55%,transparent) transparent}.events::-webkit-scrollbar{width:5px}.events::-webkit-scrollbar-thumb{border-radius:8px;background:color-mix(in srgb,var(--dashboard-accent,#38bdf8) 55%,transparent)}.event{display:grid;grid-template-columns:34px 3px minmax(0,1fr);gap:7px;align-items:center;min-width:0;padding:3px 0}.event>.date{display:grid;place-items:center;align-content:center;height:33px;border-radius:9px;background:color-mix(in srgb,var(--event) 13%,transparent);border:1px solid color-mix(in srgb,var(--event) 30%,transparent)}.date span{font-size:7px!important;text-transform:uppercase;color:var(--event)!important;font-weight:900}.date b{font-size:14px!important;line-height:14px}.event>i{display:block;align-self:stretch;border-radius:5px;background:var(--event)}.event-copy{min-width:0}.event-copy b,.event-copy span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.event-copy b{font-size:11px}.event-copy span,.empty{font-size:9px;color:var(--secondary-text-color,#a7b2c2);margin-top:1px}
        .card.portrait{min-height:570px}.card.portrait .body{grid-template-columns:minmax(0,1.15fr) minmax(420px,.85fr);min-height:390px}.card.portrait .rooms{grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:minmax(100px,1fr)}.card.portrait .events{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:14px;grid-auto-rows:min-content}.card.portrait .event{padding:5px 0}
        @media(min-width:1101px) and (max-height:950px){header{margin-bottom:9px}.utilities{margin-bottom:9px;gap:8px}.utility{padding-top:10px;padding-bottom:9px}.use{margin-top:5px}.cost{margin-top:5px;padding-top:5px}.body{grid-template-columns:minmax(0,1.25fr) minmax(230px,.75fr);gap:9px}.panel{padding:10px}.panel h3{margin-bottom:7px}.rooms{grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:minmax(42px,1fr);gap:5px;height:calc(100% - 19px)}.room{padding:5px 7px}.event{padding:2px 0}.card.portrait{min-height:570px}.card.portrait .body{grid-template-columns:minmax(0,1.15fr) minmax(420px,.85fr);min-height:390px}.card.portrait .rooms{grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:minmax(100px,1fr)}.card.portrait .events{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:14px}.card.portrait .event{padding:5px 0}}
        @media(max-width:700px){.utilities{grid-template-columns:1fr}.body{grid-template-columns:1fr}.card{padding:14px}}
        ${MARQUEE_CSS}
      </style><ha-card class="card${this.config.portrait_layout?" portrait":""}">${this.config.show_header===false?"":`<header><h2><ha-icon icon="mdi:home-analytics"></ha-icon><span class="title"></span></h2><span class="health"></span></header>`}<div class="utilities"><section class="utility electricity"></section><section class="utility water"></section><section class="utility heat"></section></div><div class="body"><a class="panel temperature-panel" href="${this._esc(this.config.rooms_navigation_path||'/hjem-overblik/cards')}"><h3>Temperaturer og setpunkter</h3><div class="rooms"></div></a><a class="panel agenda-panel" href="${this._esc(this.config.calendar_navigation_path||'/hjem-overblik/kalender')}"><h3>Næste i kalenderen</h3><div class="events"></div></a></div></ha-card>`;
      const navigate=(path)=>{if(!path)return;history.pushState(null,"",path);window.dispatchEvent(new Event("location-changed"));};
      this.shadowRoot.querySelector(".utility.electricity").onclick=()=>navigate(this.config.electricity_path);
      this.shadowRoot.querySelector(".utility.water").onclick=()=>navigate(this.config.water_path);
      this.shadowRoot.querySelector(".utility.heat").onclick=()=>navigate(this.config.heat_path);
      const roomsEl=this.shadowRoot.querySelector(".rooms");
      // Varme Center rooms open their own heating popup; the panel link to the rooms page must not fire (user, 2026-10-13).
      const openRoom=(e)=>{if(roomsEl._vc){e.preventDefault();return;}const t=e.target.closest(".room[data-room],.rt[data-room],.ro[data-room]");if(!t)return;e.preventDefault();e.stopPropagation();this._openRoom(Number(t.dataset.room));};
      roomsEl.addEventListener("click",openRoom);
      roomsEl.addEventListener("keydown",(e)=>{if(e.key==="Enter"||e.key===" ")openRoom(e);});
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
    const ttl=this.shadowRoot.querySelector(".title");if(ttl)ttl.textContent=c.title;
    const card=this.shadowRoot.querySelector(".card"); card.style.setProperty("--summary-status",healthy?"var(--success-color,#20e3a2)":"var(--warning-color,#fb923c)");
    const health=this.shadowRoot.querySelector(".health")||document.createElement("span"); health.textContent=healthy?"Alt ser normalt ud":"Kræver opmærksomhed"; health.style.color=healthy?"var(--success-color,#20e3a2)":"var(--warning-color,#fb923c)";
    const utilityKeys={".electricity":"monthly_energy_entity",".water":"water_month_entity",".heat":"heat_month_entity"};const shown=Object.values(utilityKeys).filter((k)=>c[k]!=="").length;this.shadowRoot.querySelector(".utilities")?.style.setProperty("--utility-count",String(Math.max(shown,1)));const utility=(sel,icon,label,value,unit,cost,valid)=>{const tile=this.shadowRoot.querySelector(sel);tile.hidden=c[utilityKeys[sel]]==="";if(tile.hidden)return;tile.style.setProperty("--accent",valid?"var(--success-color,#20e3a2)":"var(--error-color,#ef4444)");const x=this._utilMonth(c[utilityKeys[sel]],c[{".electricity":"electric_month_cost_entity",".water":"water_month_cost_entity",".heat":"heat_month_cost_entity"}[sel]],unit);tile.innerHTML=`<ha-icon class="utility-bg" icon="${icon}"></ha-icon><div class="utility-head">${label}${x.chip}</div><div class="use"><b>${value}</b><span>${unit}</span>${x.bars}</div><div class="cost">${x.foot ? "Indtil nu" : "Månedspris"}<b>${cost} kr</b></div>${x.foot}`;};
    this._utilStats();
    utility(".electricity","mdi:lightning-bolt","Strøm",this._fmt(monthly,0),"kWh",this._fmt(electricCost,0),Number.isFinite(monthly)&&Number.isFinite(electricCost));
    utility(".water","mdi:water","Vand",this._fmt(water,3),"m³",this._fmt(waterCost,0),Number.isFinite(water)&&Number.isFinite(waterCost));
    utility(".heat","mdi:radiator","Fjernvarme",this._fmt(heat,1),"kWh",this._fmt(heatCost,0),Number.isFinite(heat)&&Number.isFinite(heatCost));
    // Room tiles (Claude AI, 2026-10-13; user: "mere grafisk pænt op med flere funktioner"): a faint 24 h curve behind,
    // a comfort bar (temperature against the setpoint), a trend arrow, badges for heating, presence, an open window and
    // a low battery. A tap opens the room panel (_openRoom) instead of the rooms page; the heading still goes there.
    const classicTiles=!isNewLook(this._hass,c,{entity:"room_tiles_entity",key:"room_tiles",fallback:true});
    // Classic = the room tiles as they were before the rebuild (0.8.72, 2026-10-11; user 2026-10-14: "du skal længere
    // tilbage"), with their own ro- classes so the newer tile styles never reach them. A tap still opens the room.
    const roomsHtml=!classicTiles?(c.rooms||[]).map((room,i)=>this._roomTileV2(room,i)).join(""):(c.rooms||[]).map((room,i)=>{
      const temp=this._num(room.temperature), humidity=this._num(room.humidity), target=Number(this._state(room.climate)?.attributes?.temperature);
      const delta=Number.isFinite(temp)&&Number.isFinite(target)?temp-target:Number.NaN;
      const tone=!Number.isFinite(temp)?"unavailable":delta>0.7?"warm":delta<-.7?"cold":"";
      const icon=this._esc(room.icon||'mdi:thermometer');
      const targetText=Number.isFinite(target)?`Mål <b>${this._fmt(target,1)}°</b>`:"";
      const humidityText=Number.isFinite(humidity)?`<span class="ro-humidity">${targetText?"· ":""}${this._fmt(humidity,0)}%</span>`:"";
      const heating=room.climate?this._state(room.climate)?.attributes?.hvac_action==="heating":false;
      const present=room.presence?this._state(room.presence)?.state==="on":false;
      const heatBadge=heating?`<span class="ro-status heating" title="Kalder på varme"><ha-icon icon="mdi:fire"></ha-icon></span>`:"";
      const presenceBadge=present?`<span class="ro-status presence" title="Der er nogen i rummet"><ha-icon icon="mdi:motion-sensor"></ha-icon></span>`:"";
      return `<div class="ro ${tone}" data-room="${i}" data-room-key="${this._esc(this._roomKey(room.name))}" role="button" tabindex="0"><ha-icon class="ro-bg" icon="${icon}"></ha-icon><div class="ro-head"><span class="ro-name">${this._esc(room.name)}</span><div class="ro-badges">${presenceBadge}${heatBadge}</div></div><div class="ro-body"><span class="ro-target">${targetText}${humidityText}</span><strong class="ro-temp">${this._fmt(temp,1)}°</strong></div></div>`;
    }).join("");

    const rooms=this.shadowRoot.querySelector(".rooms");
    // Varme Center's rooms, compact, in place of the tiles (rooms_style_entity on, user 2026-10-13); a test next to the tiles.
    // No Varme Center rooms to show (none found on room_popup_dashboard): keep the tiles rather than an empty panel.
    const vc=c.rooms_style_entity&&this._hass?.states?.[c.rooms_style_entity]?.state==="on"&&c.room_popup_dashboard&&!this._radMissing;
    this.shadowRoot.querySelector(".temperature-panel")?.classList.toggle("vc",!!vc);
    if(vc){this._vcRooms(rooms);this._updateRobots();this._renderEvents();this._observeMarquees();return;}
    if(rooms._vc){rooms._vc.remove();rooms._vc=null;rooms._html="";}
    rooms.classList.toggle("old",classicTiles);
    if(rooms._html!==roomsHtml){rooms._html=roomsHtml;for(const node of this._robotNodes.values())node.remove();this._robotNodes.clear();rooms.innerHTML=roomsHtml;}
    this._updateRobots();
    this._renderEvents();
    this._observeMarquees();
  }
  getCardSize(){return 6;}
  static getConfigElement(){return document.createElement("ha-home-summary-card-editor");}
  static getStubConfig(){return {title:"Husets overblik"};}
}

class HaHomeSummaryCardEditor extends HTMLElement {
  setConfig(config){this.config=structuredClone(config);this.render();}
  set hass(hass){this._hass=hass;}
  render(){
    const fields=[["title","Titel"],["event_days","Kalenderdage"],["max_events","Maks. hændelser"],["rooms_navigation_path","Navigation til rum"],["rooms_style_entity","Kontakt: Varme Center-rum i stedet for fliser (valgfri)"],["default_target","Standard-setpunkt for rum uden termostat (°)"],["room_popup_dashboard","Rum-popup fra dashboard (Varme Center)"],["room_controls_dashboard","Styring til rum-popup fra dashboard"],["calendar_navigation_path","Navigation til kalender"],["monthly_energy_entity","Strøm denne måned"],["electric_month_cost_entity","Akkumuleret strømpris denne måned"],["water_month_entity","Vand denne måned"],["water_month_cost_entity","Vandpris denne måned"],["heat_month_entity","Fjernvarme denne måned"],["heat_month_cost_entity","Fjernvarmepris denne måned"],["co2_entity","CO₂"],["air_quality_entity","Luftkvalitet"],["water_flow_entity","Vandflow"],["storage_entity","Protect lager"]];
    const robots=JSON.stringify(this.config?.robots||[],null,2);
    this.innerHTML=`<style>label{display:block;margin:10px 0 4px;font-weight:600}input,textarea{box-sizing:border-box;width:100%;padding:10px;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color,var(--card-background-color));color:inherit}textarea{min-height:170px;font:12px/1.4 monospace;resize:vertical}.hint{margin-top:5px;color:var(--secondary-text-color);font-size:11px}.error{color:var(--error-color);font-size:11px}</style>${fields.map(([key,label])=>`<label>${label}</label><input data-key="${key}" value="${this.config?.[key]||SUMMARY_DEFAULTS[key]||''}">`).join('')}<label>Robotter</label><textarea data-robots>${robots}</textarea><div class="hint">Entity, navn, ikon og enten rum-entity, fast rum eller udendørs. Rumkortet følger live-status uden genindlæsning.</div><div class="error"></div>`;
    this.insertAdjacentHTML("beforeend",lookEditorHtml(this.config,{entity:"room_tiles_entity",key:"room_tiles",fallback:true,label:"Rumfliser"}));
    wireLookEditor(this,this,()=>this.config);
    this.querySelectorAll("input[data-key]").forEach((input)=>input.addEventListener("change",()=>this.dispatchEvent(new CustomEvent("config-changed",{bubbles:true,composed:true,detail:{config:{...this.config,[input.dataset.key]:input.value}}}))));
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
    this.shadowRoot.innerHTML=`<style>:host{display:block}.slot:has(> [hidden]),.slot:empty{display:none!important}.header,.mobile{display:flex;flex-direction:column;min-width:0;gap:var(--desktop-gap,clamp(10px,.75vw,18px))}.header:not(:empty){margin-bottom:var(--desktop-gap,clamp(10px,.75vw,18px))}.layout{display:grid;grid-template-columns:var(--desktop-columns,minmax(0,.9fr) minmax(440px,1.1fr));align-items:stretch;height:var(--desktop-height,auto);min-height:0;overflow:hidden;gap:var(--desktop-gap,clamp(10px,.75vw,18px))}.column{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden;gap:var(--desktop-gap,clamp(10px,.75vw,18px))}.slot{min-width:0;flex:0 0 auto}.slot.grow{display:flex;flex:1 1 0;min-height:0;overflow:hidden}.slot.grow>*{flex:1;min-width:0;min-height:0}.mobile,.vertical-only{display:none}@media(max-width:1399px) and (min-width:${mobileBreakpoint+1}px){.layout{grid-template-columns:minmax(0,1fr) minmax(420px,1fr)}}@media(max-width:${mobileBreakpoint}px){.header:not(:empty){margin-bottom:8px}.layout{display:none}.mobile{display:flex;gap:8px}}@media(min-width:${phoneBreakpoint+1}px) and (max-width:${mobileBreakpoint}px){.vertical-only{display:block}}</style><div class="header"></div><div class="layout"><div class="column left"></div><div class="column right"></div></div><div class="mobile"></div>`;
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
