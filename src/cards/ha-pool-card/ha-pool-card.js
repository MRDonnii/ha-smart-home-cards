const VERSION = "0.3.0";

const HISTORY_REFRESH_MS = 10 * 60 * 1000;
const TICK_MS = 30 * 1000;

class HAPoolCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._sig = "";
    this._historyDays = [];
    this._historyFetching = false;
    this._historyFetchedAt = 0;
    this._tab = "drift";
    this._renderedTab = undefined;
    this._liveCameraEntity = undefined;
    this._liveCameraCard = undefined;
    this._cameraGeneration = 0;
    this.shadowRoot.addEventListener("click", (event) => this._handleClick(event));
  }

  static getStubConfig() {
    return {
      title: "Pool",
      subtitle: "Sandfilter, service og vandtemperatur",
      camera_entity: "camera.pool_area",
      person_in_water_entity: "binary_sensor.pool_person_i_vandet",
      person_terrace_entity: "binary_sensor.pool_area_person_detected",
      pump_switch_entity: "switch.pool_pumpe_styring",
      pump_running_entity: "binary_sensor.poolpumpe_korer",
      pump_status_entity: "sensor.poolpumpe_driftstatus",
      override_select_entity: "input_select.pool_pumpe_manuel_override_varighed",
      power_entity: "sensor.pool_power",
      energy_today_entity: "sensor.poolpumpe_forbrug_i_dag",
      cost_today_entity: "sensor.poolpumpe_pris_i_dag",
      runtime_today_entity: "sensor.poolpumpe_koeretid_i_dag",
      normal_goal_entity: "input_number.pool_pumpe_normal_timer_pr_dag",
      interval_minutes_entity: "input_number.pool_pumpe_interval_minutter",
      interval_pause_minutes_entity: "input_number.pool_pumpe_interval_pause_minutter",
      automation_active_entity: "input_boolean.pool_automation_aktiv",
      forced_pause_active_entity: "input_boolean.pool_pumpe_tvangspause_aktiv",
      manual_override_timer_entity: "timer.pool_pumpe_manuel_override",
      after_swim_timer_entity: "timer.pool_pumpe_efterbad",
      backwash_status_entity: "input_select.pool_backwash_status",
      backwash_timer_entity: "timer.pool_backwash",
      rinse_timer_entity: "timer.pool_rinse",
      water_temp_entity: "sensor.pool_vandtemperatur",
      temp_rise_today_entity: "sensor.pool_temperaturstigning_i_dag",
      filter_progress_entity: "sensor.pool_filterfremdrift",
      status_warning_entity: "sensor.pool_statusadvarsel",
      next_action_entity: "sensor.pool_naeste_handling",
      best_swim_time_entity: "sensor.pool_bedste_badetid",
      temp_low_today_entity: "sensor.pool_laveste_vandtemperatur_i_dag",
      temp_high_today_entity: "sensor.pool_hojeste_vandtemperatur_i_dag",
      cover_status_entity: "sensor.poolcover_ollama_status",
      forecast_accuracy_entity: "sensor.pool_forecast_nojagtighed",
      maintenance_entity: "sensor.pool_vedligeholdelsesstatus",
      forecast_entity: "sensor.pool_forventet_vandtemperatur",
      swim_ready_temp_entity: "input_number.pool_badeklar_temperatur",
      scripts: {
        pause_1h: "script.pool_pumpe_tvangspause_1_time",
        pause_2h: "script.pool_pumpe_tvangspause_2_timer",
        backwash_prepare: "script.pool_backwash_forbered",
        backwash_start: "script.pool_backwash_start",
        backwash_abort: "script.pool_backwash_afbryd",
        rinse_start: "script.pool_rinse_start",
        backwash_finish: "script.pool_backwash_afslut",
      },
      settings_path: "/hjem-overblik/pool-indstillinger",
      history_days: 7,
    };
  }

  setConfig(config) {
    const stub = HAPoolCard.getStubConfig();
    const nextConfig = { ...stub, ...config, scripts: { ...stub.scripts, ...(config?.scripts || {}) } };
    const signature = JSON.stringify(nextConfig);
    this._config = nextConfig;
    if (signature === this._configSignature) return;
    this._configSignature = signature;
    this._sig = "";
    this._render(true);
  }

  connectedCallback() {
    this._fetchHistory();
    if (!this._historyTimer) this._historyTimer = setInterval(() => this._fetchHistory(), HISTORY_REFRESH_MS);
    if (!this._tickTimer) this._tickTimer = setInterval(() => this._render(), TICK_MS);
  }
  disconnectedCallback() {
    clearInterval(this._historyTimer);
    clearInterval(this._tickTimer);
    this._historyTimer = undefined;
    this._tickTimer = undefined;
  }

  _watchedIds() {
    const c = this._config;
    return [
      c.camera_entity, c.person_in_water_entity, c.person_terrace_entity, c.pump_switch_entity,
      c.pump_running_entity, c.pump_status_entity, c.override_select_entity, c.power_entity,
      c.energy_today_entity, c.cost_today_entity, c.runtime_today_entity, c.normal_goal_entity,
      c.automation_active_entity, c.forced_pause_active_entity, c.manual_override_timer_entity,
      c.after_swim_timer_entity, c.backwash_status_entity, c.backwash_timer_entity, c.rinse_timer_entity,
      c.water_temp_entity, c.temp_rise_today_entity, c.filter_progress_entity, c.status_warning_entity,
      c.next_action_entity, c.best_swim_time_entity, c.temp_low_today_entity, c.temp_high_today_entity,
      c.cover_status_entity, c.forecast_accuracy_entity, c.maintenance_entity, c.forecast_entity,
    ].filter(Boolean);
  }

  set hass(hass) {
    this._hass = hass;
    if (this._liveCameraCard) this._liveCameraCard.hass = hass;
    const ids = this._watchedIds();
    const sig = JSON.stringify(ids.map((id) => {
      const state = hass?.states?.[id];
      return [id, state?.state, state?.last_changed, state?.attributes?.entity_picture];
    }));
    if (sig !== this._sig) {
      this._sig = sig;
      this._render();
    }
  }

  async _fetchHistory() {
    const c = this._config;
    const ids = [c.water_temp_entity, c.runtime_today_entity].filter(Boolean);
    if (!ids.length || !this._hass?.callApi || this._historyFetching) return;
    this._historyFetching = true;
    try {
      const days = Math.max(2, Number(c.history_days) || 7);
      const start = new Date(Date.now() - (days - 1) * 86400000);
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      const path = `history/period/${encodeURIComponent(start.toISOString())}?end_time=${encodeURIComponent(end.toISOString())}&filter_entity_id=${encodeURIComponent(ids.join(","))}&minimal_response`;
      const history = await this._hass.callApi("GET", path);
      this._historyDays = this._buildDays(history || [], start, end);
      this._historyFetchedAt = Date.now();
      this._render();
    } catch (error) {
      console.warn("HA Pool Card: history could not be loaded", error);
    } finally {
      this._historyFetching = false;
    }
  }

  _buildDays(history, start, end) {
    const c = this._config;
    const byEntity = new Map();
    for (const series of history) {
      const id = series?.[0]?.entity_id;
      if (id) byEntity.set(id, series);
    }
    const tempSeries = byEntity.get(c.water_temp_entity) || [];
    const pumpSeries = byEntity.get(c.runtime_today_entity) || [];
    const days = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const dayStart = new Date(cursor);
      const dayEnd = new Date(cursor);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const tempValues = this._valuesInRange(tempSeries, dayStart, dayEnd);
      const pumpValues = this._valuesInRange(pumpSeries, dayStart, dayEnd);
      days.push({
        label: `${cursor.getDate()}/${cursor.getMonth() + 1}`,
        high: tempValues.length ? Math.max(...tempValues) : null,
        low: tempValues.length ? Math.min(...tempValues) : null,
        pump: pumpValues.length ? Math.max(...pumpValues) : null,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return days.filter((day) => day.high !== null || day.low !== null || day.pump !== null);
  }

  _valuesInRange(series, start, end) {
    const startMs = start.getTime();
    const endMs = end.getTime();
    const values = [];
    for (const row of series) {
      const ts = Date.parse(row.last_changed || row.last_updated || "");
      const value = Number(row.state);
      if (!Number.isFinite(ts) || !Number.isFinite(value)) continue;
      if (ts >= startMs && ts < endMs) values.push(value);
    }
    return values;
  }

  _s(id) {
    return id ? this._hass?.states?.[id] : undefined;
  }
  _text(id, fallback = "—") {
    const s = this._s(id)?.state;
    return !s || ["unknown", "unavailable"].includes(s) ? fallback : s;
  }
  _num(id, fallback) {
    const n = Number(this._s(id)?.state);
    return Number.isFinite(n) ? n : fallback;
  }
  _on(id) {
    return this._s(id)?.state === "on";
  }
  _esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  _fmt(v, digits = 1) {
    return Number.isFinite(v) ? v.toLocaleString("da-DK", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "—";
  }
  _more(id) {
    if (!id) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: id }, bubbles: true, composed: true }));
  }
  _call(service, entityId, data) {
    if (!this._hass || !entityId) return;
    const [domain, svc] = service.split(".");
    this._hass.callService(domain, svc, { entity_id: entityId, ...(data || {}) });
  }
  _confirmed(text) {
    return !text || window.confirm(text);
  }

  _timerSeconds(entity) {
    if (!entity || entity.state !== "active") return null;
    const finish = entity.attributes?.finishes_at || entity.attributes?.finish_at;
    if (finish) return (new Date(finish).getTime() - Date.now()) / 1000;
    const value = entity.attributes?.remaining || entity.attributes?.duration;
    if (typeof value === "string") {
      const parts = value.split(":").map(Number);
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return null;
  }
  _fmtSeconds(seconds) {
    const s = Math.max(0, Math.ceil(Number(seconds) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.ceil((s % 3600) / 60);
    return h > 0 ? `${h} t ${m} min` : `${m} min`;
  }

  _modeTimer() {
    const c = this._config;
    const forced = this._on(c.forced_pause_active_entity);
    const auto = this._on(c.automation_active_entity);
    const commanded = this._on(c.pump_switch_entity);
    const running = this._on(c.pump_running_entity);
    const after = this._s(c.after_swim_timer_entity);
    const manual = this._s(c.manual_override_timer_entity);
    const option = this._text(c.override_select_entity, "Automatik");
    let title = "Automatik";
    let remaining = null;
    let icon = "mdi:timer-outline";
    let cls = "auto";
    if (forced) {
      title = "Tvangssluk";
      remaining = this._timerSeconds(manual);
      icon = "mdi:pump-off";
      cls = "blocked";
    } else if (after?.state === "active") {
      title = "Efterbad";
      remaining = this._timerSeconds(after);
      icon = "mdi:pool";
      cls = "after";
    } else if (!auto) {
      title = option === "Fra (til jeg tænder)" ? "Slukket" : option !== "Automatik" ? `Manuel ${running ? "tændt" : "drift"}` : "Automatik fra";
      remaining = this._timerSeconds(manual);
      icon = option === "Fra (til jeg tænder)" ? "mdi:pump-off" : "mdi:hand-back-right";
      cls = option === "Fra (til jeg tænder)" ? "off" : "manual";
    } else if (commanded && !running) {
      title = "Startet uden drift";
      remaining = null;
      icon = "mdi:alert-circle";
      cls = "blocked";
    } else {
      const changed = this._s(c.pump_switch_entity)?.last_changed;
      const elapsed = changed ? Math.max(0, (Date.now() - new Date(changed).getTime()) / 1000) : 0;
      if (running) {
        title = "Auto kører";
        remaining = this._num(c.interval_minutes_entity, 45) * 60 - elapsed;
        icon = "mdi:pump";
        cls = "running";
      } else {
        title = "Auto pause";
        remaining = this._num(c.interval_pause_minutes_entity, 90) * 60 - elapsed;
        icon = "mdi:timer-pause";
        cls = "paused";
      }
    }
    const big = remaining === null ? "--" : remaining <= 0 ? "NU" : this._fmtSeconds(remaining);
    return { title, icon, cls, big };
  }

  _pumpHeaderHtml() {
    const c = this._config;
    const running = this._on(c.pump_running_entity);
    const commanded = this._on(c.pump_switch_entity);
    const status = this._text(c.pump_status_entity, "Afventer");
    const option = this._text(c.override_select_entity, "Automatik");
    const power = this._num(c.power_entity);
    const mode = option === "Automatik" ? "Automatik" : `Manuel ${option.toLowerCase()}`;
    const action = running || commanded ? "tryk for at slukke" : "tryk for at starte 1 time";
    const label = `${status} · ${mode} · ${Number.isFinite(power) ? power.toFixed(0) : "--"} W · ${action}`;

    const stateCls = running ? "running" : commanded ? "warn" : "stopped";
    const stateText = running ? "KØRER" : commanded ? "0 W" : "FRA";
    const autoCls = option === "Automatik" ? "auto" : option === "Fra (til jeg tænder)" ? "off" : "manual";
    const autoText = option === "Automatik" ? "AUTO" : option === "Til jeg slukker" ? "KONSTANT" : option === "Fra (til jeg tænder)" ? "FRA" : option.toUpperCase();

    const runtime = this._num(c.runtime_today_entity);
    const goal = this._s(c.pump_status_entity)?.attributes?.dagsmaal_timer ?? this._num(c.normal_goal_entity);
    const left = Number.isFinite(runtime) && Number.isFinite(goal) ? Math.max(goal - runtime, 0) : null;
    const kwh = this._num(c.energy_today_entity);
    const cost = this._num(c.cost_today_entity);
    const pct = Number.isFinite(runtime) && Number.isFinite(goal) && goal > 0 ? Math.min(100, Math.max(0, (runtime / goal) * 100)) : 0;

    const iconboxIcon = running ? "mdi:pump" : commanded ? "mdi:alert-circle" : "mdi:pump-off";
    const iconboxCls = running ? "running" : commanded ? "warn" : "stopped";

    const mt = this._modeTimer();

    const stat = (icon, value, lbl) => `<div class="pump-stat"><ha-icon icon="${icon}"></ha-icon><div><b>${value}</b><small>${lbl}</small></div></div>`;

    return `<div class="pump-card" data-toggle-pump="1">
      <div class="pump-top">
        <div class="pump-iconbox ${iconboxCls}"><ha-icon icon="${iconboxIcon}"></ha-icon></div>
        <div class="pump-name">
          <strong>Sandfilterstyring</strong>
          <span>${this._esc(label)}</span>
        </div>
        <div class="pump-badges">
          <div class="pump-badge ${stateCls}">${stateText}</div>
          <div class="pump-mode-badge ${autoCls}">${autoText}</div>
        </div>
      </div>
      <div class="pump-stats">
        ${stat("mdi:timer-check", Number.isFinite(runtime) ? `${runtime.toFixed(1)} / ${Number.isFinite(goal) ? goal.toFixed(1) : "--"} t` : "-- t", "kørt / mål")}
        ${stat("mdi:timer-sand", Number.isFinite(left) ? `${left.toFixed(1)} t` : "-- t", "mangler i dag")}
        ${stat("mdi:flash", Number.isFinite(power) ? `${power.toFixed(0)} W` : "-- W", "effekt nu")}
        ${stat("mdi:cash", `${Number.isFinite(kwh) ? kwh.toFixed(2) : "--"} kWh`, `${Number.isFinite(cost) ? cost.toFixed(2) : "--"} kr`)}
      </div>
      <div class="pump-progress"><div style="width:${pct}%"></div></div>
      <div class="pump-mode-timer ${mt.cls}"><ha-icon icon="${mt.icon}"></ha-icon><span><b>${mt.big}</b><small>${this._esc(mt.title)}</small></span></div>
    </div>`;
  }

  _modeButton(value, label, icon) {
    const c = this._config;
    const active = this._text(c.override_select_entity) === value;
    return `<button class="mode-btn ${active ? "active" : ""}" data-select-option="${this._esc(value)}"><ha-icon icon="${icon}"></ha-icon><span>${this._esc(label)}</span></button>`;
  }

  _controlPanelHtml() {
    const c = this._config;
    const backwash = this._text(c.backwash_status_entity, "Inaktiv");

    if (backwash === "Inaktiv") {
      return `<div class="mode-row">
          ${this._modeButton("Automatik", "Auto", "mdi:auto-mode")}
          ${this._modeButton("1 time", "1 time", "mdi:timer-outline")}
          ${this._modeButton("2 timer", "2 timer", "mdi:timer-outline")}
          ${this._modeButton("4 timer", "4 timer", "mdi:timer-outline")}
          ${this._modeButton("Til jeg slukker", "Konstant", "mdi:infinity")}
        </div>
        <div class="action-row">
          <button class="action-btn" data-script="pause_1h"><ha-icon icon="mdi:pump-off"></ha-icon><span>Sluk 1 time</span></button>
          <button class="action-btn" data-script="pause_2h"><ha-icon icon="mdi:pump-off"></ha-icon><span>Sluk 2 timer</span></button>
          <button class="action-btn" data-script="backwash_prepare" data-confirm="Pumpen stoppes først. Start det guidede returskyl?"><ha-icon icon="mdi:filter-sync"></ha-icon><span>Returskyl</span></button>
        </div>
        <button class="off-btn" data-select-option="Fra (til jeg tænder)" data-confirm="Sluk poolpumpen helt og hold den slukket, indtil du selv vælger Automatik igen?">
          <ha-icon icon="mdi:power-plug-off"></ha-icon>
          <div><b>Sluk helt — forbliv slukket</b><small>Automatikken rører intet, indtil du selv vælger Automatik igen</small></div>
        </button>`;
    }

    const step = (tone, icon, title, text) =>
      `<div class="wizard-note ${tone}"><ha-icon icon="${icon}"></ha-icon><div><b>${this._esc(title)}</b><small>${this._esc(text)}</small></div></div>`;
    const timerChip = (entity) => {
      const s = this._s(entity);
      return `<div class="wizard-timer"><ha-icon icon="mdi:timer-sand"></ha-icon><span>${this._esc(s?.state === "active" ? s.state : "idle")}</span></div>`;
    };
    const wizardBtn = (icon, label, script, confirmText, cls) =>
      `<button class="wizard-btn ${cls}" data-script="${script}" ${confirmText ? `data-confirm="${this._esc(confirmText)}"` : ""}><ha-icon icon="${icon}"></ha-icon><span>${this._esc(label)}</span></button>`;

    if (backwash === "Klar til BACKWASH") {
      return step("amber", "mdi:valve", "Pumpen er stoppet", "Sæt multiventilen på BACKWASH. Bekræft først, når ventilen står korrekt.") +
        wizardBtn("mdi:check-bold", "Start backwash", "backwash_start", "Bekræft: Pumpen er stoppet, og ventilen står på BACKWASH.", "amber");
    }
    if (backwash === "BACKWASH kører") {
      return step("cyan", "mdi:filter-sync", "Backwash kører", "Rør ikke multiventilen, mens pumpen kører. Vent på automatisk stop.") +
        timerChip(c.backwash_timer_entity) +
        wizardBtn("mdi:stop-circle", "Afbryd", "backwash_abort", null, "danger");
    }
    if (backwash === "Klar til RINSE") {
      return step("amber", "mdi:valve", "Pumpen er stoppet", "Sæt multiventilen på RINSE. Bekræft først, når ventilen står korrekt.") +
        wizardBtn("mdi:check-bold", "Start rinse", "rinse_start", "Bekræft: Pumpen er stoppet, og ventilen står på RINSE.", "amber");
    }
    if (backwash === "RINSE kører") {
      return step("cyan", "mdi:water-sync", "Rinse kører", "Rør ikke multiventilen, mens pumpen kører. Vent på automatisk stop.") +
        timerChip(c.rinse_timer_entity) +
        wizardBtn("mdi:stop-circle", "Afbryd", "backwash_abort", null, "danger");
    }
    if (backwash === "Sæt på FILTER") {
      return step("green", "mdi:valve", "Pumpen er stoppet", "Sæt multiventilen tilbage på FILTER, og afslut derefter serviceforløbet.") +
        wizardBtn("mdi:check-bold", "Afslut", "backwash_finish", "Bekræft: Pumpen er stoppet, og ventilen står på FILTER.", "green");
    }
    return "";
  }

  _cameraHtml() {
    const c = this._config;
    const cam = this._s(c.camera_entity);
    const url = cam?.attributes?.entity_picture;
    const personInWater = this._on(c.person_in_water_entity);
    const personTerrace = this._on(c.person_terrace_entity);
    return `<div class="camera" data-more="${this._esc(c.camera_entity)}">
      <div class="camera-media" data-camera-media>${url ? "" : `<div class="camera-empty"><ha-icon icon="mdi:cctv-off"></ha-icon><span>Intet kamerabillede</span></div>`}</div>
      <div class="camera-badges">
        ${personInWater ? `<span class="camera-badge on"><ha-icon icon="mdi:account-swim"></ha-icon>Person i vandet</span>` : ""}
        ${personTerrace ? `<span class="camera-badge on"><ha-icon icon="mdi:account-eye"></ha-icon>Person på terrassen</span>` : ""}
      </div>
    </div>`;
  }

  _row(icon, label, value, entity) {
    return `<div class="row" data-more="${this._esc(entity)}"><ha-icon icon="${icon}"></ha-icon><span class="row-label">${this._esc(label)}</span><span class="row-value">${value}</span></div>`;
  }

  _statsGridHtml() {
    const c = this._config;
    const running = this._on(c.pump_running_entity);
    return `<div class="row-list">
      ${this._row("mdi:thermometer-water", "Vandtemperatur", `${this._text(c.water_temp_entity)}°`, c.water_temp_entity)}
      ${this._row("mdi:pump", "Sandfilter", running ? "Kører" : "Stoppet", c.pump_running_entity)}
      ${this._row("mdi:thermometer-chevron-up", "Steget i dag", `${this._text(c.temp_rise_today_entity)}°`, c.temp_rise_today_entity)}
      ${this._row("mdi:cash", "Pumpepris i dag", `${this._text(c.cost_today_entity)} kr`, c.cost_today_entity)}
      ${this._row("mdi:progress-clock", "Filtreret / mål", this._s(c.filter_progress_entity)?.attributes?.tekst || `${this._text(c.filter_progress_entity)}%`, c.filter_progress_entity)}
      ${this._row("mdi:list-status", "Driftstatus", this._text(c.pump_status_entity), c.pump_status_entity)}
    </div>`;
  }

  _warningHtml() {
    const c = this._config;
    const s = this._s(c.status_warning_entity);
    const severity = s?.attributes?.severity || "ok";
    if (severity === "ok") return "";
    const cls = severity === "warning" ? "warn" : "danger";
    return `<div class="warning-banner ${cls}" data-more="${this._esc(c.status_warning_entity)}"><ha-icon icon="${s?.attributes?.icon || "mdi:alert-circle-outline"}"></ha-icon><span>${this._esc(s?.state || "Poolen kræver opmærksomhed")}</span></div>`;
  }

  _assistantHtml() {
    const c = this._config;
    const low = this._num(c.temp_low_today_entity);
    const high = this._num(c.temp_high_today_entity);
    const cover = this._s(c.cover_status_entity);
    const coverState = cover?.state || "Usikker";
    const coverText = coverState === "Usikker"
      ? `Cover: ${cover?.attributes?.applied_state || "--"} (senest kendt)`
      : `Coveret er ${coverState.toLowerCase()}`;
    return `<div class="row-list">
      ${this._row("mdi:robot-outline", "Næste handling", this._esc(this._text(c.next_action_entity, "Afventer data")), c.next_action_entity)}
      ${this._row("mdi:account-swim", "Bedste badetid", this._esc(this._text(c.best_swim_time_entity, "Afventer prognose")), c.best_swim_time_entity)}
      ${this._row("mdi:thermometer", "Døgnets temperatur", `Lav ${Number.isFinite(low) ? low.toFixed(1) : "--"}° · Høj ${Number.isFinite(high) ? high.toFixed(1) : "--"}°`, c.water_temp_entity)}
      ${this._row("mdi:shield-sun", "Poolcover", this._esc(coverText), c.cover_status_entity)}
      ${this._row("mdi:bullseye-arrow", "Forecast-nøjagtighed", this._esc(this._text(c.forecast_accuracy_entity, "Afventer målinger")), c.forecast_accuracy_entity)}
      ${this._row("mdi:tools", "Vedligeholdelse", this._esc(this._text(c.maintenance_entity, "Afventer registrering")), c.maintenance_entity)}
    </div>`;
  }

  _historyChartHtml() {
    const days = this._historyDays;
    if (!days.length) return `<div class="chart-empty">Henter historik…</div>`;
    const tempValues = days.flatMap((d) => [d.high, d.low]).filter(Number.isFinite);
    const pumpValues = days.map((d) => d.pump).filter(Number.isFinite);
    const minTemp = tempValues.length ? Math.min(...tempValues) : 0;
    const maxTemp = tempValues.length ? Math.max(...tempValues) : 1;
    const yMin = Math.floor(Math.max(0, minTemp - 1));
    const yMax = Math.ceil(maxTemp + 1);
    const pumpMax = Math.max(1, ...pumpValues);
    const left = 34, right = 12, top = 14, bottom = 26, width = 620, height = 190;
    const plotW = width - left - right, plotH = height - top - bottom;
    const count = Math.max(1, days.length - 1);
    const x = (i) => Math.round((left + (plotW * i) / count) * 10) / 10;
    const y = (v) => Math.round((top + (1 - (v - yMin) / Math.max(1, yMax - yMin)) * plotH) * 10) / 10;
    const path = (key) => {
      const pts = days.map((d, i) => ({ d, i })).filter(({ d }) => Number.isFinite(d[key]));
      if (!pts.length) return "";
      return pts.map(({ d, i }, part) => `${part ? "L" : "M"} ${x(i)} ${y(d[key])}`).join(" ");
    };
    const highPath = path("high");
    const lowPath = path("low");
    const bandPts = days.map((d, i) => ({ d, i })).filter(({ d }) => Number.isFinite(d.high) && Number.isFinite(d.low));
    const bandPath = bandPts.length > 1
      ? `${bandPts.map(({ d, i }, p) => `${p ? "L" : "M"} ${x(i)} ${y(d.high)}`).join(" ")} ${bandPts.slice().reverse().map(({ d, i }) => `L ${x(i)} ${y(d.low)}`).join(" ")} Z`
      : "";
    const bars = days.map((d, i) => {
      if (!Number.isFinite(d.pump)) return "";
      const h = Math.max(3, (d.pump / pumpMax) * 28);
      return `<rect class="pump-bar" x="${x(i) - 7}" y="${height - bottom - h}" width="14" height="${h}" rx="4"><title>${d.label}: ${this._fmt(d.pump)} t sandfilter</title></rect>`;
    }).join("");
    const labels = days.map((d, i) => `<text class="axis-label" x="${x(i)}" y="${height - 8}" text-anchor="middle">${d.label}</text>`).join("");
    const dots = days.map((d, i) => {
      const items = [];
      if (Number.isFinite(d.high)) items.push(`<circle class="dot high" cx="${x(i)}" cy="${y(d.high)}" r="3.5"><title>${d.label}: høj ${this._fmt(d.high)}°</title></circle>`);
      if (Number.isFinite(d.low)) items.push(`<circle class="dot low" cx="${x(i)}" cy="${y(d.low)}" r="3"><title>${d.label}: lav ${this._fmt(d.low)}°</title></circle>`);
      return items.join("");
    }).join("");
    return `<svg class="chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
      <line class="grid-line" x1="${left}" x2="${width - right}" y1="${top}" y2="${top}"/>
      <line class="grid-line" x1="${left}" x2="${width - right}" y1="${height - bottom}" y2="${height - bottom}"/>
      <text class="axis-label" x="4" y="${top + 4}">${yMax}°</text>
      <text class="axis-label" x="4" y="${height - bottom + 4}">${yMin}°</text>
      ${bandPath ? `<path class="range-band" d="${bandPath}"/>` : ""}
      ${bars}
      ${lowPath ? `<path class="low-line" d="${lowPath}"/>` : ""}
      ${highPath ? `<path class="high-line" d="${highPath}"/>` : ""}
      ${dots}${labels}
    </svg>`;
  }

  _forecastChartHtml() {
    const c = this._config;
    const raw = this._s(c.forecast_entity)?.attributes?.forecast_points;
    const target = this._num(c.swim_ready_temp_entity);
    if (!Array.isArray(raw) || !raw.length) return `<div class="chart-empty">Ingen forecast tilgængelig endnu</div>`;
    const points = raw.map((p, i) => ({
      label: new Date(p.datetime).toLocaleDateString("da-DK", { weekday: "short" }),
      temp: Number(p.temp),
      uncertainty: Math.min(1.8, 0.35 + i * 0.28),
    })).filter((p) => Number.isFinite(p.temp));
    if (!points.length) return `<div class="chart-empty">Ingen forecast tilgængelig endnu</div>`;
    const values = points.flatMap((p) => [p.temp + p.uncertainty, p.temp - p.uncertainty]);
    if (Number.isFinite(target)) values.push(target);
    const minV = Math.min(...values), maxV = Math.max(...values);
    const yMin = Math.floor(minV - 0.5), yMax = Math.ceil(maxV + 0.5);
    const left = 34, right = 12, top = 14, bottom = 26, width = 620, height = 190;
    const plotW = width - left - right, plotH = height - top - bottom;
    const count = Math.max(1, points.length - 1);
    const x = (i) => Math.round((left + (plotW * i) / count) * 10) / 10;
    const y = (v) => Math.round((top + (1 - (v - yMin) / Math.max(1, yMax - yMin)) * plotH) * 10) / 10;
    const linePath = points.map((p, i) => `${i ? "L" : "M"} ${x(i)} ${y(p.temp)}`).join(" ");
    const bandPath = `${points.map((p, i) => `${i ? "L" : "M"} ${x(i)} ${y(p.temp + p.uncertainty)}`).join(" ")} ${points.slice().reverse().map((p, ri) => `L ${x(points.length - 1 - ri)} ${y(p.temp - p.uncertainty)}`).join(" ")} Z`;
    const dots = points.map((p, i) => `<circle class="dot estimate" cx="${x(i)}" cy="${y(p.temp)}" r="3.5"><title>${p.label}: ${this._fmt(p.temp)} ± ${this._fmt(p.uncertainty)}°</title></circle>`).join("");
    const labels = points.map((p, i) => `<text class="axis-label" x="${x(i)}" y="${height - 8}" text-anchor="middle">${p.label}</text>`).join("");
    const targetLine = Number.isFinite(target)
      ? `<line class="target-line" x1="${left}" x2="${width - right}" y1="${y(target)}" y2="${y(target)}"/><text class="axis-label target-label" x="${width - right}" y="${y(target) - 5}" text-anchor="end">Badeklar ${this._fmt(target, 0)}°</text>`
      : "";
    return `<svg class="chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
      <line class="grid-line" x1="${left}" x2="${width - right}" y1="${top}" y2="${top}"/>
      <line class="grid-line" x1="${left}" x2="${width - right}" y1="${height - bottom}" y2="${height - bottom}"/>
      <text class="axis-label" x="4" y="${top + 4}">${yMax}°</text>
      <text class="axis-label" x="4" y="${height - bottom + 4}">${yMin}°</text>
      <path class="uncertainty-band" d="${bandPath}"/>
      ${targetLine}
      <path class="estimate-line" d="${linePath}"/>
      ${dots}${labels}
    </svg>`;
  }

  _render(forceStructure = false) {
    if (!this.shadowRoot) return;
    const c = this._config;

    const tabs = [
      ["drift", "Drift", "mdi:pump"],
      ["historik", "Historik", "mdi:chart-line"],
      ["overblik", "Overblik", "mdi:view-list"],
    ];
    let tabHtml = "";
    if (this._tab === "drift") {
      tabHtml = `${this._cameraHtml()}${this._warningHtml()}${this._pumpHeaderHtml()}${this._controlPanelHtml()}`;
    } else if (this._tab === "historik") {
      tabHtml = `${this._sectionHeading("mdi:chart-line", "Pooltemperatur og sandfilter · 7 døgn")}
        <div class="chart-wrap">${this._historyChartHtml()}</div>
        ${this._sectionHeading("mdi:thermometer-lines", "Vejrbaseret forecast")}
        <div class="chart-wrap">${this._forecastChartHtml()}</div>`;
    } else {
      tabHtml = `${this._sectionHeading("mdi:pool", "Poolområdet")}
        ${this._statsGridHtml()}
        ${this._sectionHeading("mdi:robot-outline", "Poolassistent")}
        ${this._assistantHtml()}`;
    }

    const markup = `<style>
      :host{display:block;--good:var(--dashboard-success, var(--success-color, #20e3a2));--warn:var(--dashboard-warning, var(--warning-color, #f59e0b));--danger:var(--dashboard-danger, var(--error-color, #ef4444));--accent:#0891b2;--teal:#14b8a6;--edge:var(--dashboard-border-neutral, var(--divider-color, rgba(127,145,165,.2)));--muted:var(--dashboard-icon-muted, var(--disabled-text-color, #64748b));--card-surface:var(--dashboard-card-bg,var(--ha-card-background,var(--card-background-color,#111820)));--card-solid:var(--card-background-color,#111820)}
      *{box-sizing:border-box}
      ha-card{padding:20px;border-radius:22px;background:var(--card-surface);border:var(--ha-card-border-width,1px) solid var(--ha-card-border-color,var(--edge));color:var(--primary-text-color);box-shadow:var(--ha-card-box-shadow)}
      .head{display:flex;align-items:center;gap:12px;margin-bottom:16px}
      .head ha-icon{--mdc-icon-size:24px;color:var(--accent)}
      .head strong{display:block;font-size:16px}
      .head span{display:block;color:var(--secondary-text-color);font-size:12px;margin-top:2px}
      .tabs{display:flex;gap:6px;margin-bottom:16px}
      .tab{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:9px 8px;border-radius:11px;border:1px solid var(--edge);background:transparent;color:var(--secondary-text-color);font-size:12px;font-weight:800;cursor:pointer}
      .tab ha-icon{--mdc-icon-size:16px}
      .tab.active{color:#fff;background:var(--accent);border-color:var(--accent)}
      .section-heading{display:flex;align-items:center;gap:8px;margin:20px 0 10px;color:var(--secondary-text-color);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}
      .section-heading:first-of-type{margin-top:0}
      .section-heading ha-icon{--mdc-icon-size:16px;color:var(--accent)}

      .row-list{display:flex;flex-direction:column;gap:8px}
      .row{position:relative;display:flex;align-items:center;gap:10px;padding:11px 13px;border:1px solid color-mix(in srgb,var(--accent) 16%,transparent);border-left:3px solid var(--accent);border-radius:12px;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 6%,transparent),transparent 60%),var(--card-surface);box-shadow:0 4px 12px rgba(0,0,0,.1);cursor:pointer}
      .row ha-icon{--mdc-icon-size:17px;color:var(--accent);flex:0 0 auto}
      .row-label{flex:1;font-size:12.5px;color:var(--secondary-text-color);min-width:0}
      .row-value{font-size:12.5px;font-weight:800;text-align:right;max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

      .camera{position:relative;width:100%;border-radius:16px;overflow:hidden;border:1px solid var(--edge);aspect-ratio:16/9;background:#0b141d;cursor:pointer;margin-bottom:16px}
      .camera-media{position:absolute;inset:0;overflow:hidden;background:#0b141d;contain:layout paint}
      .camera-media>*{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;min-width:0!important;min-height:0!important;display:block;overflow:hidden}
      .camera-snapshot{z-index:2;object-fit:cover;opacity:1;transition:opacity .28s ease;background:#0b141d;pointer-events:none}
      .camera-live-card{z-index:1;opacity:0;transition:opacity .28s ease;pointer-events:none}
      .camera-media.ready .camera-snapshot{opacity:0}
      .camera-media.ready .camera-live-card{opacity:1}
      .camera-empty{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:var(--secondary-text-color);font-size:12px}
      .camera-badges{position:absolute;left:10px;bottom:10px;display:flex;gap:6px;flex-wrap:wrap}
      .camera-badge{display:flex;align-items:center;gap:5px;padding:5px 10px;border-radius:999px;font-size:11px;font-weight:800;background:color-mix(in srgb,var(--warn) 85%,black 5%);color:#1a1200}
      .camera-badge ha-icon{--mdc-icon-size:14px}

      .pump-card{border:1px solid color-mix(in srgb,var(--accent) 18%,transparent);border-left:4px solid var(--accent);border-radius:18px;padding:16px 16px 14px;cursor:pointer;position:relative;z-index:1;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 7%,transparent),transparent 55%),var(--card-surface);box-shadow:0 6px 18px rgba(0,0,0,.12)}
      .pump-top{display:flex;align-items:flex-start;gap:12px}
      .pump-iconbox{width:48px;height:48px;border-radius:15px;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
      .pump-iconbox.running{background:color-mix(in srgb,var(--teal) 20%,transparent);color:var(--teal)}
      .pump-iconbox.warn{background:color-mix(in srgb,var(--warn) 20%,transparent);color:var(--warn)}
      .pump-iconbox.stopped{background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent)}
      .pump-iconbox ha-icon{--mdc-icon-size:24px}
      .pump-name{min-width:0;flex:1}
      .pump-name strong{display:block;font-size:19px;font-weight:900;line-height:1.1}
      .pump-name span{display:block;margin-top:3px;font-size:12px;color:var(--secondary-text-color);line-height:1.35}
      .pump-badges{display:flex;flex-direction:column;gap:5px;align-items:flex-end}
      .pump-badge,.pump-mode-badge{display:inline-flex;align-items:center;justify-content:center;min-width:60px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:900;letter-spacing:.05em}
      .pump-badge.running{background:var(--teal);color:#fff}
      .pump-badge.warn{background:color-mix(in srgb,var(--warn) 22%,transparent);color:var(--warn)}
      .pump-badge.stopped{background:color-mix(in srgb,var(--secondary-text-color) 18%,transparent);color:var(--primary-text-color)}
      .pump-mode-badge.auto{background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--accent)}
      .pump-mode-badge.manual{background:color-mix(in srgb,var(--warn) 20%,transparent);color:var(--warn)}
      .pump-mode-badge.off{background:color-mix(in srgb,var(--danger) 16%,transparent);color:var(--danger)}
      .pump-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:12px}
      .pump-stat{display:grid;grid-template-columns:22px minmax(0,1fr);gap:6px;align-items:center;padding:8px;border-radius:12px;background:color-mix(in srgb,var(--secondary-text-color) 7%,transparent)}
      .pump-stat ha-icon{--mdc-icon-size:18px;color:var(--accent)}
      .pump-stat b{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .pump-stat small{display:block;font-size:9px;color:var(--secondary-text-color);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .pump-progress{height:6px;border-radius:999px;overflow:hidden;background:color-mix(in srgb,var(--secondary-text-color) 18%,transparent);margin-top:10px}
      .pump-progress>div{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--accent),var(--teal));transition:width .35s ease}
      .pump-mode-timer{display:inline-flex;align-items:center;gap:7px;margin-top:10px;padding:6px 11px;border-radius:999px;background:color-mix(in srgb,var(--accent) 10%,transparent)}
      .pump-mode-timer ha-icon{--mdc-icon-size:16px;color:var(--accent)}
      .pump-mode-timer b{font-size:12px}
      .pump-mode-timer small{display:block;font-size:9px;color:var(--secondary-text-color)}
      .pump-mode-timer.blocked{background:color-mix(in srgb,var(--danger) 13%,transparent)}
      .pump-mode-timer.blocked ha-icon{color:var(--danger)}
      .pump-mode-timer.manual ha-icon,.pump-mode-timer.after ha-icon{color:var(--warn)}
      .pump-mode-timer.off ha-icon{color:var(--danger)}

      .mode-row{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:14px}
      .mode-btn{display:flex;flex-direction:column;align-items:center;gap:4px;height:58px;border-radius:13px;border:1px solid var(--edge);background:color-mix(in srgb,var(--secondary-text-color) 6%,transparent);color:var(--secondary-text-color);font-size:10.5px;font-weight:800;cursor:pointer}
      .mode-btn ha-icon{--mdc-icon-size:19px}
      .mode-btn.active{border-color:var(--teal);background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 24%,var(--card-solid)),color-mix(in srgb,var(--teal) 14%,var(--card-solid)));color:var(--primary-text-color)}
      .mode-btn.active ha-icon{color:var(--teal)}
      .action-row{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px}
      .action-btn{display:flex;flex-direction:column;align-items:center;gap:4px;height:58px;border-radius:13px;border:1px solid var(--edge);background:color-mix(in srgb,var(--secondary-text-color) 6%,transparent);color:var(--primary-text-color);font-size:10.5px;font-weight:800;cursor:pointer}
      .action-btn ha-icon{--mdc-icon-size:19px;color:var(--accent)}
      .off-btn{display:flex;align-items:center;gap:10px;width:100%;margin-top:8px;padding:12px 14px;border-radius:14px;border:1px solid color-mix(in srgb,var(--danger) 35%,var(--edge));background:color-mix(in srgb,var(--danger) 8%,transparent);color:var(--primary-text-color);cursor:pointer;text-align:left}
      .off-btn ha-icon{--mdc-icon-size:20px;color:var(--danger);flex:0 0 auto}
      .off-btn b{display:block;font-size:12.5px}
      .off-btn small{display:block;margin-top:2px;font-size:10.5px;color:var(--secondary-text-color)}

      .wizard-note{display:flex;gap:10px;align-items:flex-start;margin-top:14px;padding:13px;border-radius:15px}
      .wizard-note ha-icon{--mdc-icon-size:22px;flex:0 0 auto}
      .wizard-note b{display:block;font-size:13.5px;font-weight:900}
      .wizard-note small{display:block;margin-top:3px;font-size:11px;line-height:1.35;color:var(--primary-text-color)}
      .wizard-note.amber{background:linear-gradient(135deg,color-mix(in srgb,var(--warn) 19%,var(--card-solid)),color-mix(in srgb,var(--warn) 7%,var(--card-solid)));border:1px solid color-mix(in srgb,var(--warn) 45%,transparent)}
      .wizard-note.amber ha-icon,.wizard-note.amber b{color:var(--warn)}
      .wizard-note.cyan{background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 19%,var(--card-solid)),color-mix(in srgb,var(--accent) 7%,var(--card-solid)));border:1px solid color-mix(in srgb,var(--accent) 45%,transparent)}
      .wizard-note.cyan ha-icon,.wizard-note.cyan b{color:var(--accent)}
      .wizard-note.green{background:linear-gradient(135deg,color-mix(in srgb,var(--good) 19%,var(--card-solid)),color-mix(in srgb,var(--good) 7%,var(--card-solid)));border:1px solid color-mix(in srgb,var(--good) 45%,transparent)}
      .wizard-note.green ha-icon,.wizard-note.green b{color:var(--good)}
      .wizard-timer{display:flex;align-items:center;gap:8px;margin-top:8px;padding:10px 12px;border-radius:13px;border:1px solid var(--edge);font-size:12px;font-weight:800}
      .wizard-timer ha-icon{--mdc-icon-size:17px;color:var(--accent)}
      .wizard-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:56px;margin-top:8px;border-radius:14px;border:1px solid var(--edge);font-size:13px;font-weight:800;cursor:pointer;background:transparent;color:var(--primary-text-color)}
      .wizard-btn ha-icon{--mdc-icon-size:19px}
      .wizard-btn.amber{border-color:color-mix(in srgb,var(--warn) 40%,transparent);background:color-mix(in srgb,var(--warn) 12%,transparent);color:var(--warn)}
      .wizard-btn.green{border-color:color-mix(in srgb,var(--good) 40%,transparent);background:color-mix(in srgb,var(--good) 12%,transparent);color:var(--good)}
      .wizard-btn.danger{border-color:color-mix(in srgb,var(--danger) 40%,transparent);background:color-mix(in srgb,var(--danger) 12%,transparent);color:var(--danger)}

      .warning-banner{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:14px;margin-bottom:14px;cursor:pointer;font-size:13px;font-weight:700}
      .warning-banner.warn{background:color-mix(in srgb,var(--warn) 14%,transparent);border:1px solid color-mix(in srgb,var(--warn) 40%,transparent);color:var(--warn)}
      .warning-banner.danger{background:color-mix(in srgb,var(--danger) 14%,transparent);border:1px solid color-mix(in srgb,var(--danger) 40%,transparent);color:var(--danger)}
      .warning-banner ha-icon{--mdc-icon-size:20px}

      .chart-wrap{position:relative;z-index:1}
      .chart{width:100%;height:auto;aspect-ratio:620/190;display:block}
      .chart-empty{padding:30px;text-align:center;color:var(--secondary-text-color);font-size:12px}
      .grid-line{stroke:color-mix(in srgb,var(--secondary-text-color) 18%,transparent);stroke-width:1}
      .axis-label{fill:var(--secondary-text-color);font-size:11px;font-weight:700}
      .target-label{fill:var(--warn)}
      .range-band{fill:color-mix(in srgb,#3b82f6 13%,transparent)}
      .high-line{fill:none;stroke:#ef4444;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
      .low-line{fill:none;stroke:#3b82f6;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}
      .pump-bar{fill:color-mix(in srgb,var(--teal) 60%,transparent)}
      .dot.high{fill:#ef4444}
      .dot.low{fill:#3b82f6}
      .uncertainty-band{fill:color-mix(in srgb,var(--accent) 16%,transparent)}
      .estimate-line{fill:none;stroke:#fbbf24;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
      .target-line{stroke:var(--warn);stroke-width:1.4;stroke-dasharray:5 4}
      .dot.estimate{fill:#fbbf24}

      .settings-btn{display:flex;align-items:center;gap:10px;width:100%;margin-top:20px;padding:13px 14px;border-radius:15px;border:1px solid var(--edge);background:transparent;color:var(--primary-text-color);cursor:pointer;text-align:left;position:relative;z-index:1}
      .settings-btn ha-icon{--mdc-icon-size:20px;color:var(--accent)}
      .settings-btn small{display:block;color:var(--secondary-text-color);font-size:11px;margin-top:2px}
      @media(max-width:560px){.pump-stats{grid-template-columns:repeat(2,1fr)}.mode-row{grid-template-columns:repeat(3,1fr)}.action-row{grid-template-columns:1fr 1fr}}
    </style>
    <ha-card>
      <div class="head">
        <ha-icon icon="mdi:pool"></ha-icon>
        <div><strong>${this._esc(c.title)}</strong><span>${this._esc(c.subtitle)}</span></div>
      </div>
      <div class="tabs">${tabs
        .map((t) => `<button class="tab ${this._tab === t[0] ? "active" : ""}" data-tab="${t[0]}"><ha-icon icon="${t[2]}"></ha-icon>${t[1]}</button>`)
        .join("")}</div>

      ${tabHtml}

      <button class="settings-btn" data-nav="${this._esc(c.settings_path)}">
        <ha-icon icon="mdi:tune-variant"></ha-icon>
        <div><b>Pool-indstillinger</b><small>Tider, automatik, kameraanalyse og driftssignaler</small></div>
      </button>
    </ha-card>`;

    const currentCard = this.shadowRoot.querySelector("ha-card");
    const structureChanged = forceStructure || !currentCard || this._renderedTab !== this._tab;
    if (structureChanged) {
      this._cameraGeneration += 1;
      this._liveCameraEntity = undefined;
      this._liveCameraCard = undefined;
      this.shadowRoot.innerHTML = markup;
      this._renderedTab = this._tab;
    } else {
      const template = document.createElement("template");
      template.innerHTML = markup;
      this._morphNode(currentCard, template.content.querySelector("ha-card"));
    }
    this._ensureLiveCamera();
  }

  _morphNode(current, next) {
    if (!current || !next) return;
    if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName) {
      current.replaceWith(next.cloneNode(true));
      return;
    }
    if (current.nodeType === Node.TEXT_NODE) {
      if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
      return;
    }
    if (current.nodeType !== Node.ELEMENT_NODE) return;
    if (current.matches?.("[data-camera-media]")) return;
    for (const attribute of Array.from(current.attributes)) {
      if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
    }
    for (const attribute of Array.from(next.attributes)) {
      if (current.getAttribute(attribute.name) !== attribute.value) current.setAttribute(attribute.name, attribute.value);
    }
    const currentChildren = Array.from(current.childNodes);
    const nextChildren = Array.from(next.childNodes);
    const count = Math.max(currentChildren.length, nextChildren.length);
    for (let index = count - 1; index >= 0; index -= 1) {
      if (!nextChildren[index]) currentChildren[index]?.remove();
    }
    for (let index = 0; index < nextChildren.length; index += 1) {
      const existing = current.childNodes[index];
      if (!existing) current.appendChild(nextChildren[index].cloneNode(true));
      else this._morphNode(existing, nextChildren[index]);
    }
  }

  _handleClick(event) {
    const target = event.target?.closest?.("[data-tab],[data-toggle-pump],[data-select-option],[data-script],[data-nav],[data-more]");
    if (!target) return;
    if (target.dataset.tab) {
      if (target.dataset.tab === this._tab) return;
      this._tab = target.dataset.tab;
      this._render(true);
      return;
    }
    if (target.hasAttribute("data-toggle-pump")) {
      const running = this._on(this._config.pump_running_entity);
      const commanded = this._on(this._config.pump_switch_entity);
      const option = running || commanded ? "Fra (til jeg tænder)" : "1 time";
      this._call("input_select.select_option", this._config.override_select_entity, { option });
      return;
    }
    if (target.dataset.selectOption) {
      if (this._confirmed(target.dataset.confirm)) {
        this._call("input_select.select_option", this._config.override_select_entity, { option: target.dataset.selectOption });
      }
      return;
    }
    if (target.dataset.script) {
      if (this._confirmed(target.dataset.confirm)) this._call("script.turn_on", this._config.scripts[target.dataset.script]);
      return;
    }
    if (target.dataset.nav) {
      history.pushState(null, "", target.dataset.nav);
      window.dispatchEvent(new Event("location-changed"));
      return;
    }
    if (target.dataset.more) this._more(target.dataset.more);
  }

  async _ensureLiveCamera() {
    const entity = this._config.camera_entity;
    const media = this.shadowRoot.querySelector("[data-camera-media]");
    if (!media || !this._hass || !entity) return;
    if (this._liveCameraEntity === entity && this._liveCameraCard?.isConnected) {
      this._liveCameraCard.hass = this._hass;
      return;
    }
    const state = this._s(entity);
    if (!state) return;
    const generation = ++this._cameraGeneration;
    this._liveCameraEntity = entity;
    this._liveCameraCard = undefined;
    media.classList.remove("ready");
    const snapshot = document.createElement("img");
    snapshot.className = "camera-snapshot";
    snapshot.alt = "Poolkamera";
    snapshot.decoding = "async";
    const entityPicture = state.attributes?.entity_picture;
    if (entityPicture) snapshot.src = this._hass.hassUrl(entityPicture);
    else if (state.attributes?.access_token) snapshot.src = this._hass.hassUrl(`/api/camera_proxy/${entity}?token=${state.attributes.access_token}`);
    media.replaceChildren(snapshot);
    try {
      const helpers = await window.loadCardHelpers();
      if (generation !== this._cameraGeneration || !media.isConnected || this._config.camera_entity !== entity) return;
      const card = await helpers.createCardElement({
        type: "picture-elements",
        camera_image: entity,
        camera_view: "live",
        elements: [],
        aspect_ratio: "16:9",
        fit_mode: "cover",
        tap_action: { action: "none" },
      });
      card.classList.add("camera-live-card");
      card.hass = this._hass;
      media.appendChild(card);
      this._liveCameraCard = card;
      this._revealCameraWhenReady(media, card, generation, entity);
    } catch (error) {
      console.error("HA Pool Card: live stream could not be loaded", error);
    }
  }

  _mediaReady(node) {
    if (!node) return false;
    if (typeof HTMLVideoElement !== "undefined" && node instanceof HTMLVideoElement && node.readyState >= 2) return true;
    if (typeof HTMLImageElement !== "undefined" && node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0) return true;
    if (node.shadowRoot && this._mediaReady(node.shadowRoot)) return true;
    return Array.from(node.children || []).some((child) => this._mediaReady(child));
  }

  _revealCameraWhenReady(media, card, generation, entity, attempt = 0) {
    if (generation !== this._cameraGeneration || this._liveCameraEntity !== entity || !card.isConnected) return;
    if ((attempt >= 4 && this._mediaReady(card)) || attempt >= 80) {
      media.classList.add("ready");
      setTimeout(() => media.querySelector(".camera-snapshot")?.remove(), 320);
      return;
    }
    setTimeout(() => this._revealCameraWhenReady(media, card, generation, entity, attempt + 1), 100);
  }

  _sectionHeading(icon, title) {
    return `<div class="section-heading"><ha-icon icon="${icon}"></ha-icon><span>${this._esc(title)}</span></div>`;
  }

  getCardSize() {
    return 40;
  }
}

if (!customElements.get("ha-pool-card")) customElements.define("ha-pool-card", HAPoolCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha-pool-card",
  name: "HA Pool Card",
  description: "Samlet poolkort: pumpestyring, guidet backwash/rinse, kamera, statistik, statusadvarsel, 7-dages historik og vejrbaseret forecast",
  preview: true,
});
console.info(
  `%c HA POOL CARD %c v${VERSION} `,
  "color:#fff;background:#0891b2;font-weight:700",
  "color:#0891b2;background:#161b22",
);
