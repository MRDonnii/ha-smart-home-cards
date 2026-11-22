//#region src/hrv-card.ts
var _hrvRebuiltCardKeys = /* @__PURE__ */ new Set();
var HRVCard = class extends HTMLElement {
	static getStubConfig(_hass, entities = []) {
		const entityIds = Array.isArray(entities) ? entities.map((entity) => typeof entity === "string" ? entity : entity?.entity_id).filter(Boolean) : [];
		const findEntity = (patterns, fallback) => entityIds.find((entityId) => patterns.some((pattern) => entityId.includes(pattern))) || fallback;
		return {
			entities: {
				outdoor_temperature: findEntity([
					"outdoor",
					"outside",
					"ude",
					"udeluft"
				], "sensor.outdoor_temperature"),
				room_temperature: findEntity([
					"room_temperature",
					"stuetemperatur",
					"indetemperatur",
					"hustemperatur",
					"room"
				], void 0),
				supply_temperature: findEntity([
					"supply",
					"indblaes",
					"indblæs",
					"tilluft"
				], "sensor.supply_temperature"),
				extract_temperature: findEntity([
					"extract",
					"udsug",
					"fraluft"
				], "sensor.extract_temperature"),
				exhaust_temperature: findEntity([
					"exhaust",
					"afkast",
					"afkastluft",
					"udblaes",
					"udblæs"
				], "sensor.exhaust_temperature"),
				heat_recovery: findEntity([
					"heat_recovery",
					"recovery",
					"genvinding",
					"effektivitet"
				], "sensor.heat_recovery_efficiency"),
				humidity: findEntity([
					"humidity",
					"fugt",
					"luftfugtighed"
				], "sensor.humidity"),
				bypass: findEntity(["bypass_damper", "bypass"], "cover.dantherm_bypass_damper"),
				mode: findEntity([
					"operation_selection",
					"operation_mode",
					"op_mode",
					"mode"
				], "select.dantherm_operation_selection"),
				level: findEntity([
					"fan_level_selection",
					"fan_level",
					"ventilator_trin",
					"op_mode",
					"level"
				], "select.dantherm_fan_level_selection"),
				fan1_rpm: findEntity([
					"ventilator_hastighed_tilluft",
					"fan2_speed",
					"fan2_rpm",
					"fan_2_rpm"
				], "sensor.dantherm_fan2_speed"),
				fan2_rpm: findEntity([
					"ventilator_hastighed_fraluft",
					"fan1_speed",
					"fan1_rpm",
					"fan_1_rpm"
				], "sensor.dantherm_fan1_speed"),
				co2: findEntity([
					"co2_sensor",
					"co2",
					"carbon_dioxide"
				], void 0),
				filter_days: findEntity([
					"dage_til_filter_skift",
					"filterrestlevetid",
					"filter_days",
					"filter"
				], void 0),
				alarm: findEntity([
					"aktiv_alarm_liste",
					"aktiv_alarm_antal",
					"alarm"
				], void 0),
				afterheat_after: findEntity([
					"air_after_heating_coil",
					"afterheat_after",
					"luft_efter"
				], void 0),
				afterheat_active: findEntity(["eftervarme_aktiv", "afterheat_active"], void 0),
				water_flow: findEntity([
					"flow_temperature",
					"fremloeb",
					"water_flow"
				], void 0),
				water_return: findEntity([
					"return_temperature",
					"retur",
					"water_return"
				], void 0),
				water_delta: findEntity([
					"water_delta_t",
					"vand_delta",
					"water_delta"
				], void 0),
				air_quality: findEntity(["air_quality", "luftkvalitet"], void 0),
				power: findEntity([
					"_power",
					"power_consumption",
					"stroemforbrug"
				], void 0),
				heat_transfer: findEntity(["heat_transfer", "varmeoverfoersel"], void 0)
			},
			appearance: {
				animation: true,
				fan_animation: true,
				pipe_animation: true,
				show_labels: true,
				show_badges: true,
				show_temperatures: true,
				invert_heat_recovery: false,
				compact: false,
				afterheat_coil_opacity: 60,
				hide_afterheat_on_bypass: false
			},
			temperature_thresholds: {
				white: -10,
				blue: 5,
				green: 16,
				yellow: 22,
				orange: 27,
				red: 32
			}
		};
	}
	static async getConfigElement() {
		return document.createElement("hrv-card-editor");
	}
	constructor() {
		super();
		this.attachShadow({ mode: "open" });
		this._config = {};
		this._hass = void 0;
		this._id = `hrv-${Math.random().toString(36).slice(2, 10)}`;
		this._lastRenderSignature = "";
		this._animEpoch = Date.now();
		this._resizeObserver = void 0;
	}
	connectedCallback() {
		if (!this._resizeObserver && typeof ResizeObserver !== "undefined") {
			this._resizeObserver = new ResizeObserver(() => this._requestRebuildIfNeeded());
			this._resizeObserver.observe(this);
		}
	}
	disconnectedCallback() {
		this._resizeObserver?.disconnect();
		this._resizeObserver = void 0;
	}
	_cardIdentityKey() {
		try {
			return JSON.stringify(this._config?.entities || {});
		} catch {
			return "";
		}
	}
	_requestRebuildIfNeeded() {
		const key = this._cardIdentityKey();
		if (!key || _hrvRebuiltCardKeys.has(key)) return;
		_hrvRebuiltCardKeys.add(key);
		this.dispatchEvent(new CustomEvent("ll-rebuild", {
			bubbles: true,
			composed: true
		}));
	}
	_phaseDelay(durationSeconds, offsetSeconds = 0) {
		if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return "0s";
		return `${(-((((Date.now() - this._animEpoch) / 1e3 + offsetSeconds) % durationSeconds + durationSeconds) % durationSeconds)).toFixed(3)}s`;
	}
	setConfig(config) {
		if (!config) throw new Error("Invalid configuration");
		this._normalizeGridRows(config);
		this._config = {
			...config,
			entities: { ...config.entities || {} },
			labels: { ...config.labels || {} },
			temperature_thresholds: {
				white: -10,
				blue: 5,
				green: 16,
				yellow: 22,
				orange: 27,
				red: 32,
				...config.temperature_thresholds || {}
			},
			appearance: {
				animation: true,
				fan_animation: true,
				pipe_animation: true,
				show_labels: true,
				show_badges: true,
				show_temperatures: true,
				invert_heat_recovery: false,
				compact: false,
				afterheat_coil_opacity: 60,
				hide_afterheat_on_bypass: false,
				...config.appearance || {}
			}
		};
		this._lastRenderSignature = "";
		this._render();
	}
	set hass(hass) {
		this._hass = hass;
		if (this._renderSignature() === this._lastRenderSignature) return;
		this._render();
	}
	getCardSize() {
		const measuredHeight = (this.shadowRoot?.querySelector("ha-card"))?.getBoundingClientRect?.().height;
		const height = Number.isFinite(measuredHeight) && measuredHeight > 0 ? measuredHeight : this._cardHeightForWidth(this._currentCardWidth());
		return Math.max(1, Math.ceil((height + 12) / 50));
	}
	getGridOptions() {
		return {
			rows: "auto",
			columns: 12,
			min_columns: 6
		};
	}
	_normalizeGridRows(config) {
		try {
			if (config.grid_options?.rows !== void 0 && config.grid_options.rows !== "auto") config.grid_options = {
				...config.grid_options,
				rows: "auto"
			};
			if (config.layout_options?.grid_rows !== void 0 && config.layout_options.grid_rows !== "auto") config.layout_options = {
				...config.layout_options,
				grid_rows: "auto"
			};
		} catch {}
	}
	_currentCardWidth() {
		const card = this.shadowRoot?.querySelector("ha-card");
		return this.getBoundingClientRect?.().width || card?.getBoundingClientRect?.().width || this.parentElement?.getBoundingClientRect?.().width || 0;
	}
	_diagramHeight() {
		return 332;
	}
	_cardHeightForWidth(width) {
		const compact = this._config?.appearance?.compact === true;
		return (compact ? 10 : 18) + Math.max(0, (Number.isFinite(width) && width > 0 ? width : compact ? 360 : 500) - (compact ? 6 : 10)) * (this._diagramHeight() / 620);
	}
	_renderSignature() {
		const entityKeys = [
			"outdoor_temperature",
			"room_temperature",
			"supply_temperature",
			"extract_temperature",
			"exhaust_temperature",
			"heat_recovery",
			"humidity",
			"bypass",
			"mode",
			"level",
			"fan1_rpm",
			"fan2_rpm",
			"co2",
			"filter_days",
			"alarm",
			"afterheat_after",
			"afterheat_active",
			"water_flow",
			"water_return",
			"water_delta",
			"air_quality",
			"power",
			"heat_transfer"
		];
		const appearance = this._config?.appearance || {};
		const entities = this._config?.entities || {};
		const labels = this._config?.labels || {};
		const temperatureThresholds = this._config?.temperature_thresholds || {};
		const rpmBucketKeys = /* @__PURE__ */ new Set(["fan1_rpm", "fan2_rpm"]);
		const stateParts = entityKeys.map((key) => {
			const entityId = entities[key] || "";
			const entity = entityId && this._hass ? this._hass.states[entityId] : void 0;
			let stateValue = entity?.state ?? "";
			if (rpmBucketKeys.has(key)) {
				const numeric = Number.parseFloat(stateValue);
				if (Number.isFinite(numeric)) stateValue = String(Math.round(numeric / 20) * 20);
			}
			return [
				key,
				entityId,
				stateValue,
				entity?.attributes?.unit_of_measurement ?? "",
				Array.isArray(entity?.attributes?.options) ? entity.attributes.options.join("|") : ""
			].join(":");
		});
		return JSON.stringify({
			appearance,
			labels,
			language: this._language(),
			temperatureThresholds,
			states: stateParts
		});
	}
	_entityId(key) {
		return this._config?.entities?.[key];
	}
	_entity(key) {
		const entityId = this._entityId(key);
		return entityId && this._hass ? this._hass.states[entityId] : void 0;
	}
	_domain(key) {
		return this._entityId(key)?.split(".")[0];
	}
	_state(key) {
		const entity = this._entity(key);
		if (!entity || entity.state === "unknown" || entity.state === "unavailable") return;
		return entity.state;
	}
	_number(key) {
		const value = Number.parseFloat(this._state(key));
		return Number.isFinite(value) ? value : void 0;
	}
	_unit(key, fallback = "") {
		return this._entity(key)?.attributes?.unit_of_measurement || fallback;
	}
	_formatTemp(key) {
		const value = this._number(key);
		if (value === void 0) return "—";
		return `${value.toFixed(1)}${this._unit(key, "°C")}`;
	}
	_temperatureLabel(key, fallbackKey) {
		const configuredLabel = this._config?.labels?.[key];
		const label = typeof configuredLabel === "string" ? configuredLabel.trim() : "";
		return this._escapeHtml(label || this._t(fallbackKey));
	}
	_formatState(key, suffix = "") {
		const value = this._state(key);
		if (value === void 0) return "—";
		return `${value}${suffix}`;
	}
	_compactModeLabel(rawState) {
		const compactModeLabels = {
			en: {
				auto_or_scheduled: "Auto",
				auto_or_boost: "Auto+Boost",
				manual_1: "Manual 1",
				manual_2: "Manual 2",
				manual_3: "Manual 3",
				fireplace: "Fireplace",
				standby: "Standby"
			},
			da: {
				auto_or_scheduled: "Auto",
				auto_or_boost: "Auto+Boost",
				manual_1: "Manuel 1",
				manual_2: "Manuel 2",
				manual_3: "Manuel 3",
				fireplace: "Pejs",
				standby: "Standby"
			}
		};
		const normalized = rawState?.toString().trim().toLowerCase().replace(/[\s-]+/g, "_") || "";
		return compactModeLabels[this._language()]?.[normalized];
	}
	_formatDisplayState(key, suffix = "") {
		const entity = this._entity(key);
		if (!entity || entity.state === "unknown" || entity.state === "unavailable") return "—";
		if (key === "mode") {
			const compact = this._compactModeLabel(entity.state);
			if (compact) return `${compact}${suffix}`;
		}
		let formatted;
		if (typeof this._hass?.formatEntityState === "function") try {
			formatted = this._hass.formatEntityState(entity);
		} catch (_error) {
			formatted = void 0;
		}
		return `${formatted && formatted !== entity.state ? formatted : this._fallbackDisplayState(key, entity.state)}${suffix}`;
	}
	_fallbackDisplayState(key, value) {
		const raw = value?.toString() || "";
		const normalized = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
		const modeLabels = {
			en: {
				standby: "Standby",
				automatic: "Automatic",
				auto: "Automatic",
				manual: "Manual",
				week_program: "Week Program",
				away: "Away Mode",
				away_mode: "Away Mode",
				travel: "Away Mode",
				travel_mode: "Away Mode",
				summer: "Summer Mode",
				summer_mode: "Summer Mode",
				fireplace: "Fireplace Mode",
				fireplace_mode: "Fireplace Mode",
				night: "Night Mode",
				night_mode: "Night Mode"
			},
			da: {
				standby: "Standby",
				automatic: "Automatisk",
				auto: "Automatisk",
				manual: "Manuel",
				week_program: "Ugeprogram",
				away: "Rejsetilstand",
				away_mode: "Rejsetilstand",
				travel: "Rejsetilstand",
				travel_mode: "Rejsetilstand",
				summer: "Sommertilstand",
				summer_mode: "Sommertilstand",
				fireplace: "Brændeovnstilstand",
				fireplace_mode: "Brændeovnstilstand",
				night: "Nattilstand",
				night_mode: "Nattilstand"
			}
		};
		if (key === "mode" && modeLabels[this._language()]?.[normalized]) return modeLabels[this._language()][normalized];
		const bypassLabels = {
			en: {
				open: "Open",
				opening: "Opening",
				closed: "Closed",
				closing: "Closing",
				on: "Open",
				off: "Closed",
				true: "Open",
				false: "Closed",
				yes: "Open",
				no: "Closed",
				"1": "Open",
				"0": "Closed",
				"255": "Open"
			},
			da: {
				open: "Åben",
				aaben: "Åben",
				"åben": "Åben",
				opening: "Åbner",
				closed: "Lukket",
				close: "Lukket",
				lukket: "Lukket",
				closing: "Lukker",
				on: "Åben",
				off: "Lukket",
				true: "Åben",
				false: "Lukket",
				yes: "Åben",
				ja: "Åben",
				no: "Lukket",
				nej: "Lukket",
				"1": "Åben",
				"0": "Lukket",
				"255": "Åben"
			}
		};
		if (key === "bypass" && bypassLabels[this._language()]?.[normalized]) return bypassLabels[this._language()][normalized];
		const options = this._entity(key)?.attributes?.options;
		const matchedOption = Array.isArray(options) ? options.find((option) => option.toString().toLowerCase() === raw.toLowerCase()) : void 0;
		return this._humanizeState(matchedOption || raw);
	}
	_humanizeState(value) {
		const text = value?.toString().trim();
		if (!text) return "—";
		if (/^-?\d+(\.\d+)?$/.test(text)) return text;
		return text.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase(this._language() === "da" ? "da-DK" : "en-US"));
	}
	_formatSelectState(key) {
		return this._formatDisplayState(key);
	}
	_escapeHtml(value) {
		return value?.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;") || "";
	}
	_formatNumber(key, decimals = 0, suffix = "") {
		const value = this._number(key);
		if (value === void 0) return "—";
		return `${value.toFixed(decimals)}${suffix}`;
	}
	_heatRecoveryValue() {
		const value = this._number("heat_recovery");
		if (value === void 0) return void 0;
		return this._config?.appearance?.invert_heat_recovery === true ? 100 - value : value;
	}
	_formatHeatRecovery() {
		const value = this._heatRecoveryValue();
		if (value === void 0) return "—";
		return `${Math.max(0, Math.min(100, value)).toFixed(0)}%`;
	}
	_isCoolingRecovery() {
		const outdoor = this._number("outdoor_temperature");
		const supply = this._number("supply_temperature");
		const extract = this._number("extract_temperature");
		return Number.isFinite(outdoor) && Number.isFinite(supply) && Number.isFinite(extract) && outdoor > extract && supply < outdoor;
	}
	_formatRpm(key) {
		const value = this._number(key);
		if (value === void 0) return "—";
		return `${value.toFixed(0)} ${this._unit(key, "rpm")}`;
	}
	_fanAnimationEnabled() {
		const appearance = this._config?.appearance || {};
		return (appearance.fan_animation ?? appearance.animation) !== false;
	}
	_pipeAnimationEnabled() {
		const appearance = this._config?.appearance || {};
		return (appearance.pipe_animation ?? appearance.animation) !== false;
	}
	_fanBadgeSvg(key, x, y, iconScale = 1.6) {
		if (!this._entityId(key)) return "";
		const value = this._number(key);
		const spinning = this._fanAnimationEnabled() && Number.isFinite(value) && value > 0;
		const durationSeconds = 2.6 - (Number.isFinite(value) ? Math.max(0, Math.min(1, value / 100)) : 0) * 2.15;
		const duration = durationSeconds.toFixed(2);
		return `
            <g ${this._svgEntityAttrs(key)} tabindex="0" transform="translate(${x} ${y})">
              <rect x="-24" y="-27" width="48" height="54" rx="9" class="fan-badge-box"></rect>
              <g transform="translate(0 -9) scale(${iconScale})">
                <g class="fan-icon" style="animation-duration: ${duration}s; animation-delay: ${this._phaseDelay(durationSeconds)}; animation-play-state: ${spinning ? "running" : "paused"};">
                  <path class="fan-blade" d="M0 0 Q3.2 -3.4 0 -7.4 Q-3.2 -3.4 0 0 Z"></path>
                  <path class="fan-blade" d="M0 0 Q3.2 -3.4 0 -7.4 Q-3.2 -3.4 0 0 Z" transform="rotate(120)"></path>
                  <path class="fan-blade" d="M0 0 Q3.2 -3.4 0 -7.4 Q-3.2 -3.4 0 0 Z" transform="rotate(240)"></path>
                  <circle class="fan-hub" r="1.6"></circle>
                </g>
              </g>
              <text x="0" y="19" text-anchor="middle" class="inline-afterheat-value" style="font-size:9px;">${this._formatRpm(key)}</text>
            </g>
    `;
	}
	_formatCo2() {
		const value = this._number("co2");
		if (value === void 0) return "—";
		return `${value.toFixed(0)} ${this._unit("co2", "ppm")}`;
	}
	_formatPower() {
		const value = this._number("power");
		if (value === void 0) return "—";
		return `${value.toFixed(0)} ${this._unit("power", "W")}`;
	}
	_formatAirQuality() {
		const state = this._state("air_quality");
		if (state === void 0) return "—";
		const key = {
			good: "air_quality_good",
			moderate: "air_quality_moderate",
			poor: "air_quality_poor"
		}[state.toString().trim().toLowerCase()];
		return key ? this._t(key) : this._humanizeState(state);
	}
	_formatHeatTransfer() {
		const state = this._state("heat_transfer");
		if (state === void 0) return "—";
		const key = {
			inactive: "heat_transfer_inactive",
			low: "heat_transfer_low",
			normal: "heat_transfer_normal",
			high: "heat_transfer_high"
		}[state.toString().trim().toLowerCase()];
		return key ? this._t(key) : this._humanizeState(state);
	}
	_formatDeltaT(key) {
		const value = this._number(key);
		if (value === void 0) return "—";
		return `${Math.abs(value).toFixed(1)}${this._unit(key, "°C")}`;
	}
	_isAfterheatActive() {
		const state = this._state("afterheat_active");
		if (state !== void 0) {
			const normalized = state.toString().trim().toLowerCase();
			return normalized === "on" || normalized === "true" || normalized === "active" || normalized === "16";
		}
		const waterDelta = this._number("water_delta");
		return Number.isFinite(waterDelta) && Math.abs(waterDelta) > .8;
	}
	_formatFilterDays() {
		const value = this._number("filter_days");
		if (value === void 0) return "—";
		return `${value.toFixed(0)} ${this._unit("filter_days", this._t("days_short"))}`;
	}
	_isFilterDue() {
		const value = this._number("filter_days");
		return value !== void 0 && value <= 0;
	}
	_airQualityRing() {
		const state = this._state("air_quality");
		if (state === void 0) return void 0;
		const normalized = state.toString().trim().toLowerCase();
		if (normalized === "good") return {
			progress: 100,
			colorClass: ""
		};
		if (normalized === "moderate") return {
			progress: 100,
			colorClass: "warn"
		};
		if (normalized === "poor") return {
			progress: 100,
			colorClass: "danger"
		};
	}
	_filterRing() {
		if (!this._entityId("filter_days")) return void 0;
		return this._isFilterDue() ? {
			progress: 20,
			colorClass: "danger"
		} : {
			progress: 100,
			colorClass: ""
		};
	}
	_overallStatusRing() {
		const alarm = this._entityId("alarm") && this._isAlarmActive();
		const filterDue = this._entityId("filter_days") && this._isFilterDue();
		return {
			progress: 100,
			colorClass: alarm || filterDue ? "danger" : ""
		};
	}
	_levelRing() {
		if (!this._entityId("level")) return void 0;
		const state = this._state("level");
		if (state === void 0) return void 0;
		const progress = {
			off: 8,
			level_1: 25,
			level_2: 50,
			level_3: 75,
			boost: 100
		}[state.toString().trim().toLowerCase()];
		return progress === void 0 ? void 0 : {
			progress,
			colorClass: "info"
		};
	}
	_powerRing() {
		if (!this._entityId("power")) return void 0;
		const value = this._number("power");
		if (!Number.isFinite(value)) return void 0;
		return {
			progress: Math.max(4, Math.min(100, value / 120 * 100)),
			colorClass: "info"
		};
	}
	_isAlarmActive() {
		const value = this._state("alarm");
		if (value === void 0) return false;
		const normalized = value.toString().trim().toLowerCase();
		const numeric = Number.parseFloat(normalized);
		if (Number.isFinite(numeric)) return numeric > 0;
		return normalized !== "no alarm" && normalized !== "no_alarm" && normalized !== "ingen" && normalized !== "none" && normalized !== "ok" && normalized !== "clear" && normalized !== "off" && normalized !== "0";
	}
	_language() {
		return (this._hass?.locale?.language || this._hass?.language || "en").toString().toLowerCase().startsWith("da") ? "da" : "en";
	}
	_t(key) {
		const translations = {
			en: {
				airflow_diagram: "HRV airflow diagram",
				outdoor: "Outdoor",
				room: "Room",
				supply: "Supply",
				extract: "Extract",
				exhaust: "Exhaust",
				bypass: "Bypass",
				mode: "Mode",
				level: "Level",
				humidity: "Humidity",
				co2: "CO2",
				filter_days: "Filter",
				alarm: "Alarm",
				days_short: "d",
				temperatures: "Temperatures",
				optional_entities: "Optional entities",
				appearance: "Appearance",
				outdoor_temperature: "Outdoor temperature",
				room_temperature: "Room temperature",
				supply_temperature: "Supply temperature",
				extract_temperature: "Extract temperature",
				exhaust_temperature: "Exhaust temperature",
				heat_recovery: "Heat recovery",
				invert_heat_recovery: "Invert heat recovery",
				fan1_rpm: "Fan 1 speed",
				fan2_rpm: "Fan 2 speed",
				animation: "Animation",
				fan_animation: "Fan animation",
				pipe_animation: "Pipe animation",
				show_labels: "Show labels",
				show_badges: "Show badges",
				show_temperatures: "Show temperatures",
				compact: "Compact",
				state_open: "Open",
				state_closed: "Closed",
				afterheat: "Afterheat",
				afterheat_short: "Heat",
				afterheat_active: "ON",
				afterheat_inactive: "OFF",
				recovery_short: "Exchanger",
				afterheat_after: "After coil",
				valve: "Valve",
				water_flow: "Flow",
				water_return: "Return",
				water_delta: "Water ΔT",
				air_quality: "Air quality",
				power: "Power",
				power_short: "Power",
				air_quality_good: "Good",
				air_quality_moderate: "Moderate",
				air_quality_poor: "Poor",
				heat_transfer: "Heat transfer",
				heat_transfer_inactive: "None",
				heat_transfer_low: "Low",
				heat_transfer_normal: "Normal",
				heat_transfer_high: "High"
			},
			da: {
				airflow_diagram: "HRV luftstrømsdiagram",
				outdoor: "Ude",
				room: "Hus",
				supply: "Indblæsning",
				extract: "Udsugning",
				exhaust: "Udblæs",
				bypass: "Bypass",
				mode: "Drift",
				level: "Ventilationstrin",
				humidity: "Fugt",
				co2: "CO2",
				filter_days: "Filter",
				alarm: "Alarm",
				days_short: "d",
				temperatures: "Temperaturer",
				optional_entities: "Valgfri enheder",
				appearance: "Udseende",
				outdoor_temperature: "Udetemperatur",
				room_temperature: "Hustemperatur",
				supply_temperature: "Indblæsningstemperatur",
				extract_temperature: "Udsugningstemperatur",
				exhaust_temperature: "Udblæsningstemperatur",
				heat_recovery: "Varmegenvinding",
				invert_heat_recovery: "Omvend varmegenvinding",
				fan1_rpm: "Ventilator 2 hastighed",
				fan2_rpm: "Ventilator 1 hastighed",
				animation: "Animation",
				fan_animation: "Blæser-animation",
				pipe_animation: "Rør-animation",
				show_labels: "Vis labels",
				show_badges: "Vis badges",
				show_temperatures: "Vis temperaturer",
				compact: "Kompakt",
				state_open: "Åben",
				state_closed: "Lukket",
				afterheat: "Eftervarme",
				afterheat_short: "Varme",
				afterheat_active: "ON",
				afterheat_inactive: "OFF",
				recovery_short: "Veksler",
				afterheat_after: "Luft efter",
				valve: "Ventil",
				water_flow: "Fremløb",
				water_return: "Retur",
				water_delta: "ΔT vand",
				air_quality: "Luftkvalitet",
				power: "Strømforbrug",
				power_short: "Strøm",
				air_quality_good: "God",
				air_quality_moderate: "Moderat",
				air_quality_poor: "Dårlig",
				heat_transfer: "Varmeoverførsel",
				heat_transfer_inactive: "Ingen",
				heat_transfer_low: "Lav",
				heat_transfer_normal: "Normal",
				heat_transfer_high: "Høj"
			}
		};
		return translations[this._language()]?.[key] || translations.en[key] || key;
	}
	_normalizedBypassState() {
		const state = this._state("bypass");
		return state ? state.toString().trim().toLowerCase() : "";
	}
	_isBypassOpen() {
		return [
			"open",
			"åben",
			"aaben",
			"on",
			"true",
			"1",
			"yes",
			"ja",
			"255"
		].includes(this._normalizedBypassState());
	}
	_isSummerMode() {
		const mode = this._state("mode");
		const normalized = mode ? mode.toString().trim().toLowerCase() : "";
		return normalized.includes("summer") || normalized.includes("sommer");
	}
	_formatBypassState() {
		return this._formatDisplayState("bypass");
	}
	_temperatureChannels(value) {
		if (!Number.isFinite(value)) return [
			136,
			144,
			153
		];
		const thresholds = this._temperatureThresholds();
		const stops = [
			{
				value: thresholds.white,
				color: [
					248,
					252,
					255
				]
			},
			{
				value: thresholds.blue,
				color: [
					47,
					128,
					237
				]
			},
			{
				value: thresholds.green,
				color: [
					67,
					160,
					71
				]
			},
			{
				value: thresholds.yellow,
				color: [
					244,
					208,
					63
				]
			},
			{
				value: thresholds.orange,
				color: [
					242,
					153,
					74
				]
			},
			{
				value: thresholds.red,
				color: [
					219,
					68,
					55
				]
			}
		].sort((a, b) => a.value - b.value);
		if (value <= stops[0].value) return stops[0].color;
		if (value >= stops[stops.length - 1].value) return stops[stops.length - 1].color;
		for (let index = 0; index < stops.length - 1; index += 1) {
			const from = stops[index];
			const to = stops[index + 1];
			if (value >= from.value && value <= to.value) {
				const span = Math.max(.1, to.value - from.value);
				const ratio = (value - from.value) / span;
				return from.color.map((channel, channelIndex) => Math.round(channel + (to.color[channelIndex] - channel) * ratio));
			}
		}
		return stops[2].color;
	}
	_temperatureColor(value) {
		if (!Number.isFinite(value)) return "var(--secondary-text-color, currentColor)";
		return this._rgb(this._temperatureChannels(value));
	}
	_contrastTextColor(value) {
		const [r, g, b] = this._temperatureChannels(value);
		return (.299 * r + .587 * g + .114 * b) / 255 > .6 ? "#14171c" : "#f5f7fa";
	}
	_temperatureThresholds() {
		const configured = this._config?.temperature_thresholds || {};
		return Object.fromEntries(Object.entries({
			white: -10,
			blue: 5,
			green: 16,
			yellow: 22,
			orange: 27,
			red: 32
		}).map(([key, fallback]) => {
			const value = Number.parseFloat(configured[key]);
			return [key, Number.isFinite(value) ? value : fallback];
		}));
	}
	_rgb(channels) {
		return `rgb(${channels.join(", ")})`;
	}
	_fanLevel() {
		const rawLevel = this._state("level");
		if (rawLevel === void 0) return void 0;
		const numericLevel = Number.parseFloat(rawLevel);
		if (Number.isFinite(numericLevel)) return Math.max(0, Math.min(4, numericLevel));
		const normalized = rawLevel.toString().trim().toLowerCase();
		const embeddedLevel = normalized.match(/\b[0-4]\b/);
		if (embeddedLevel) return Number.parseInt(embeddedLevel[0], 10);
		return {
			off: 0,
			fra: 0,
			low: 1,
			lav: 1,
			medium: 2,
			middel: 2,
			normal: 2,
			high: 4,
			høj: 4,
			hoej: 4,
			max: 4
		}[normalized];
	}
	_flowDuration() {
		if (!this._pipeAnimationEnabled()) return "0s";
		const level = this._fanLevel();
		if (level === void 0) return "3.2s";
		if (level <= 0) return "0s";
		return `${5.1 - Math.max(1, Math.min(4, level)) / 4 * 3.5}s`;
	}
	_gradient(id, from, to, x1 = "0%", y1 = "0%", x2 = "100%", y2 = "0%", gradientUnits = "") {
		const fromValue = Number.isFinite(Number(from)) ? Number(from) : Number(to);
		const toValue = Number.isFinite(Number(to)) ? Number(to) : Number(from);
		const midValue = Number.isFinite(fromValue) && Number.isFinite(toValue) ? (fromValue + toValue) / 2 : void 0;
		return `
      <linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${gradientUnits ? ` gradientUnits="${gradientUnits}"` : ""}>
        <stop offset="0%" stop-color="${this._temperatureColor(fromValue)}"></stop>
        <stop offset="52%" stop-color="${this._temperatureColor(midValue)}"></stop>
        <stop offset="100%" stop-color="${this._temperatureColor(toValue)}"></stop>
      </linearGradient>
    `;
	}
	_airLines(path, duration, stopped, reverse = false) {
		const variants = [
			{
				offset: -12,
				width: 2.8,
				alpha: .84,
				dash: 30,
				gap: 104,
				flowDelay: -.2,
				waveDelay: -.7,
				wave: 3.2
			},
			{
				offset: 0,
				width: 2.2,
				alpha: .72,
				dash: 18,
				gap: 78,
				flowDelay: -1.35,
				waveDelay: -2.2,
				wave: 3.8
			},
			{
				offset: 12,
				width: 2.4,
				alpha: .78,
				dash: 24,
				gap: 120,
				flowDelay: -2.1,
				waveDelay: -1.4,
				wave: 3.4
			}
		];
		const durationSeconds = Number.parseFloat(duration);
		return variants.map((variant) => `
              <g
                class="air-band ${stopped ? "stopped" : ""}"
                style="--air-wave:${variant.wave}px; animation-delay:${this._phaseDelay(10.8, variant.waveDelay)};"
              >
                <path
                  class="air-line ${stopped ? "stopped" : ""}"
                style="--flow-duration:${duration}; --air-alpha:${variant.alpha}; --air-flow-delay:${this._phaseDelay(durationSeconds, variant.flowDelay)}; --air-flow-direction:${reverse ? 260 : -260};"
                stroke-width="${variant.width}"
                stroke-dasharray="${variant.dash} ${variant.gap}"
                transform="translate(0 ${variant.offset})"
                d="${path}"
              ></path>
            </g>`).join("");
	}
	_particles(path, duration, stopped, reverse = false) {
		const variants = [{
			offset: -6,
			width: 3.8,
			gap: 42,
			alpha: .82,
			flowDelay: 0,
			waveDelay: -.8,
			wave: 2.2
		}, {
			offset: 8,
			width: 4.2,
			gap: 54,
			alpha: .72,
			flowDelay: -1.7,
			waveDelay: -1.6,
			wave: 2.6
		}];
		const durationSeconds = Number.parseFloat(duration);
		return variants.map((variant) => `
          <g
            class="air-band ${stopped ? "stopped" : ""}"
            style="--air-wave:${variant.wave}px; animation-delay:${this._phaseDelay(10.8, variant.waveDelay)};"
          >
            <path
              class="flow-particles ${stopped ? "stopped" : ""}"
              style="--flow-duration:${duration}; --particle-alpha:${variant.alpha}; --air-flow-delay:${this._phaseDelay(durationSeconds, variant.flowDelay)}; --air-flow-direction:${reverse ? 260 : -260};"
              stroke-width="${variant.width}"
              stroke-dasharray="1 ${variant.gap}"
              transform="translate(0 ${variant.offset})"
              d="${path}"
            ></path>
          </g>`).join("");
	}
	_badge(label, value, entityKey) {
		const entityId = this._entityId(entityKey);
		return `
      <button class="badge" ${entityId ? `data-entity="${entityId}"` : ""}>
        <span>${this._escapeHtml(label)}</span>
        <strong>${this._escapeHtml(value)}</strong>
      </button>
    `;
	}
	_selectControl(label, entityKey) {
		const entity = this._entity(entityKey);
		const entityId = this._entityId(entityKey);
		const options = Array.isArray(entity?.attributes?.options) ? entity.attributes.options : [];
		if (!entityId || this._domain(entityKey) !== "select" || options.length === 0) return this._badge(label, this._formatState(entityKey), entityKey);
		return `
      <label class="select-control">
        <span>${this._escapeHtml(label)}</span>
        <select data-select-entity="${this._escapeHtml(entityId)}">
          ${options.map((option) => `
            <option value="${this._escapeHtml(option)}" ${option === entity.state ? "selected" : ""}>${this._escapeHtml(option)}</option>
          `).join("")}
        </select>
      </label>
    `;
	}
	_setSelectOption(entityId, option) {
		this._hass?.callService("select", "select_option", {
			entity_id: entityId,
			option
		});
	}
	_svgEntityAttrs(entityKey, extraClass = "") {
		const entityId = this._entityId(entityKey);
		const className = ["entity-hit", extraClass].filter(Boolean).join(" ");
		return entityId ? `class="${className}" data-entity="${entityId}"` : extraClass ? `class="${extraClass}"` : "";
	}
	_statusCircle(entityKey, label, value, x, y = 286, valueClass = "", extraKey = void 0, extraValue = void 0, large = false, ring = void 0, valueFontSizeOverride = void 0) {
		if (!this._entityId(entityKey)) return "";
		const textClass = ["status-value", valueClass].filter(Boolean).join(" ");
		const hasExtra = Boolean(extraKey && this._entityId(extraKey) && extraValue);
		const w = (large ? 40 : 32) * 2;
		const half = w / 2;
		const rx = large ? 16 : 13;
		const ringW = w - 6;
		const ringHalf = ringW / 2;
		const ringRx = Math.max(rx - 3, 0);
		const boxClass = large ? "status-circle status-circle-large" : "status-circle";
		const rimClass = large ? "status-circle-rim status-circle-rim-large" : "status-circle-rim";
		const glossCx = large ? -16 : -13;
		const glossCy = large ? -22 : -18;
		const glossRx = large ? 25 : 20;
		const glossRy = large ? 13 : 11;
		const labelY = large ? hasExtra ? -19 : -12 : hasExtra ? -15 : -10;
		const valueY = large ? hasExtra ? 5 : 14 : hasExtra ? 6 : 12;
		const valueFontSize = valueFontSizeOverride || (large ? "17px" : "15px");
		const extraY = large ? 25 : 23;
		return `
            <g ${this._svgEntityAttrs(entityKey)} tabindex="0" transform="translate(${x} ${y})">
              <rect class="${boxClass}" x="${-half}" y="${-half}" width="${w}" height="${w}" rx="${rx}"></rect>
              <ellipse class="status-circle-gloss" cx="${glossCx}" cy="${glossCy}" rx="${glossRx}" ry="${glossRy}"></ellipse>
              ${ring ? `
                <rect class="status-ring-bg" x="${-ringHalf}" y="${-ringHalf}" width="${ringW}" height="${ringW}" rx="${ringRx}" pathLength="100"></rect>
                <rect class="status-ring ${ring.colorClass || ""}" x="${-ringHalf}" y="${-ringHalf}" width="${ringW}" height="${ringW}" rx="${ringRx}" pathLength="100" stroke-dasharray="${ring.progress} 100"></rect>
              ` : ""}
              <rect class="${rimClass}" x="${-half}" y="${-half}" width="${w}" height="${w}" rx="${rx}"></rect>
              <text x="0" y="${labelY}" text-anchor="middle" class="status-label">${this._escapeHtml(label)}</text>
              <text x="0" y="${valueY}" text-anchor="middle" class="${textClass}" style="font-size:${valueFontSize};">${this._escapeHtml(value)}</text>
              ${hasExtra ? `
                <g ${this._svgEntityAttrs(extraKey)} tabindex="0">
                  <text x="0" y="${extraY}" text-anchor="middle" class="status-value" style="font-size:10px;">${this._escapeHtml(extraValue)}</text>
                </g>
              ` : ""}
            </g>
    `;
	}
	_afterheatCircle(x, y = 46) {
		const active = this._isAfterheatActive();
		const statusText = active ? this._t("afterheat_active") : this._t("afterheat_inactive");
		return `
            <g tabindex="0" transform="translate(${x} ${y})">
              <rect class="status-circle" x="-32" y="-32" width="64" height="64" rx="13"></rect>
              <ellipse class="status-circle-gloss" cx="-13" cy="-18" rx="20" ry="11"></ellipse>
              <rect class="afterheat-ring ${active ? "active" : "inactive"}" x="-29" y="-29" width="58" height="58" rx="10"></rect>
              <rect class="status-circle-rim" x="-32" y="-32" width="64" height="64" rx="13"></rect>
              <text x="0" y="-10" text-anchor="middle" class="status-label">${this._t("afterheat_short")}</text>
              <g ${this._svgEntityAttrs("afterheat_active")} tabindex="0">
                <text x="0" y="12" text-anchor="middle" class="status-value">${statusText}</text>
              </g>
            </g>
    `;
	}
	_bypassStatusCircle(x, y = 286) {
		const open = this._isBypassOpen();
		return `
            <g ${this._svgEntityAttrs("bypass")} tabindex="0" transform="translate(${x} ${y})">
              <rect class="status-circle status-circle-large" x="-40" y="-40" width="80" height="80" rx="16"></rect>
              <ellipse class="status-circle-gloss" cx="-16" cy="-22" rx="25" ry="13"></ellipse>
              <rect class="status-ring-bg" x="-37" y="-37" width="74" height="74" rx="13" pathLength="100"></rect>
              <rect class="status-ring ${open ? "info" : ""}" x="-37" y="-37" width="74" height="74" rx="13" pathLength="100" stroke-dasharray="100 100"></rect>
              <rect class="status-circle-rim status-circle-rim-large" x="-40" y="-40" width="80" height="80" rx="16"></rect>
              <text x="0" y="-12" text-anchor="middle" class="status-label">${this._t("bypass")}</text>
              <text x="0" y="14" text-anchor="middle" class="status-value" style="font-size:15px;">${this._formatBypassState()}</text>
            </g>
    `;
	}
	_driftLevelCircle(x, y = 286) {
		if (!this._entityId("mode") && !this._entityId("level")) return "";
		const ring = this._levelRing();
		return `
            <g tabindex="0" transform="translate(${x} ${y})">
              <rect class="status-circle status-circle-large" x="-40" y="-40" width="80" height="80" rx="16"></rect>
              <ellipse class="status-circle-gloss" cx="-16" cy="-22" rx="25" ry="13"></ellipse>
              ${ring ? `
                <rect class="status-ring-bg" x="-37" y="-37" width="74" height="74" rx="13" pathLength="100"></rect>
                <rect class="status-ring ${ring.colorClass}" x="-37" y="-37" width="74" height="74" rx="13" pathLength="100" stroke-dasharray="${ring.progress} 100"></rect>
              ` : ""}
              <rect class="status-circle-rim status-circle-rim-large" x="-40" y="-40" width="80" height="80" rx="16"></rect>
              ${this._entityId("mode") ? `
                <g ${this._svgEntityAttrs("mode")} tabindex="0">
                  <text x="0" y="-14" text-anchor="middle" class="status-label">${this._t("mode")}</text>
                  <text x="0" y="5" text-anchor="middle" class="status-value" style="font-size:12px;">${this._formatSelectState("mode")}</text>
                </g>
              ` : ""}
              ${this._entityId("level") ? `
                <g ${this._svgEntityAttrs("level")} tabindex="0">
                  <text x="0" y="25" text-anchor="middle" class="status-value" style="font-size:11px;">${this._formatSelectState("level")}</text>
                </g>
              ` : ""}
            </g>
    `;
	}
	_auxStatusCircles(x, y = 286) {
		return `
            ${this._entityId("power") ? this._statusCircle("power", this._t("power_short"), this._formatPower(), x - 168, y, "", void 0, void 0, false, this._powerRing(), "12px") : ""}
            ${this._driftLevelCircle(x - 88, y)}
            ${this._bypassStatusCircle(x, y)}
            ${this._entityId("filter_days") ? this._statusCircle("filter_days", this._t("filter_days"), this._formatFilterDays(), x + 80, y, this._isFilterDue() ? "danger blink-fade" : "", void 0, void 0, false, this._filterRing()) : ""}
    `;
	}
	_alarmIndicator() {
		if (!this._entityId("alarm") || !this._isAlarmActive()) return "";
		return `
            <g ${this._svgEntityAttrs("alarm", "blink-fade")} tabindex="0" transform="translate(478 286)">
              <path class="alarm-triangle" d="M0 -18 L20 17 H-20 Z"></path>
              <text x="0" y="10" text-anchor="middle" class="alarm-mark">!</text>
            </g>
    `;
	}
	_fireMoreInfo(entityId) {
		this.dispatchEvent(new CustomEvent("hass-more-info", {
			detail: { entityId },
			bubbles: true,
			composed: true
		}));
	}
	_hasAfterheat() {
		return Boolean(this._entityId("afterheat_after") || this._entityId("water_flow") || this._entityId("water_return"));
	}
	_inlineAfterheatSvg(x, y) {
		if (!this._hasAfterheat()) return "";
		const active = this._isAfterheatActive();
		const hasFlow = Boolean(this._entityId("water_flow"));
		const hasReturn = Boolean(this._entityId("water_return"));
		const hasDelta = Boolean(this._entityId("water_delta"));
		return `
      <g class="inline-afterheat" transform="translate(${x} ${y})">
        <rect x="-48" y="-33" width="96" height="66" rx="12" class="afterheat-coil-glow ${active ? "active" : ""}"></rect>
        <rect x="-42" y="-27" width="84" height="54" rx="9" fill="#808080" class="afterheat-coil ${active ? "active" : ""}"></rect>
        ${hasFlow || hasReturn ? `
          <rect x="-38" y="-23" width="36" height="46" rx="5" class="afterheat-warm-side"></rect>
          <rect x="2" y="-23" width="36" height="46" rx="5" class="afterheat-cool-side"></rect>
          ${hasFlow ? `
            <g ${this._svgEntityAttrs("water_flow")} tabindex="0">
              <text x="-20" y="8" text-anchor="middle" class="inline-afterheat-value" style="font-size:9.5px;">${this._formatTemp("water_flow")}</text>
            </g>
          ` : ""}
          ${hasReturn ? `
            <g ${this._svgEntityAttrs("water_return")} tabindex="0">
              <text x="20" y="8" text-anchor="middle" class="inline-afterheat-value" style="font-size:9.5px;">${this._formatTemp("water_return")}</text>
            </g>
          ` : ""}
          ${hasDelta ? `
            <g ${this._svgEntityAttrs("water_delta")} tabindex="0">
              <text x="0" y="-13" text-anchor="middle" class="inline-afterheat-delta">ΔT ${this._formatDeltaT("water_delta")}</text>
            </g>
          ` : ""}
        ` : `
          <g class="afterheat-coil-lines ${active ? "active" : ""}">
            <line x1="-25" y1="-18" x2="-25" y2="5"></line><line x1="-14" y1="-18" x2="-14" y2="5"></line>
            <line x1="-3" y1="-18" x2="-3" y2="5"></line><line x1="8" y1="-18" x2="8" y2="5"></line>
            <line x1="19" y1="-18" x2="19" y2="5"></line><line x1="29" y1="-18" x2="29" y2="5"></line>
          </g>
        `}
      </g>
    `;
	}
	_render() {
		if (!this.shadowRoot || !this._config) return;
		this._lastRenderSignature = this._renderSignature();
		const outdoor = this._number("outdoor_temperature");
		const supply = this._number("supply_temperature");
		const extract = this._number("extract_temperature");
		const exhaust = this._number("exhaust_temperature");
		const bypassOpen = this._isBypassOpen();
		const summerMode = this._isSummerMode();
		const recoveryBypassed = bypassOpen || summerMode;
		const heatRecovery = this._heatRecoveryValue();
		const recoveryProgress = recoveryBypassed ? 0 : Number.isFinite(heatRecovery) ? Math.max(0, Math.min(100, heatRecovery)) : 0;
		const recoveryValueText = recoveryBypassed ? "0%" : this._formatHeatRecovery();
		const coolingRecovery = this._isCoolingRecovery();
		const flowDuration = this._flowDuration();
		const animationOff = !this._pipeAnimationEnabled();
		const hasLabels = this._config.appearance.show_labels !== false;
		const hasTemps = this._config.appearance.show_temperatures !== false;
		const compact = this._config.appearance.compact === true;
		const afterheatCoilOpacity = Math.max(0, Math.min(100, Number(this._config?.appearance?.afterheat_coil_opacity ?? 60))) / 100;
		const houseX = 350;
		const gOutdoorSupply = `${this._id}-outdoor-supply`;
		const gExtractExhaust = `${this._id}-extract-exhaust`;
		const gOutdoorSupplyBypass = `${this._id}-outdoor-supply-bypass`;
		const gExtractExhaustBypass = `${this._id}-extract-exhaust-bypass`;
		const gFlowFade = `${this._id}-flow-fade`;
		const flowMask = `${this._id}-flow-mask`;
		const statusCircleY = summerMode ? 256 : 286;
		const outdoorSupplyPath = summerMode ? "" : bypassOpen ? "M34 120 H586" : "M34 120 H172 C238 120 252 166 310 166 C368 166 382 212 448 212 H586";
		const extractExhaustPath = summerMode ? "M586 146 H34" : bypassOpen ? "M586 208 H34" : "M586 120 H448 C382 120 368 166 310 166 C252 166 238 212 172 212 H34";
		const rightTopKey = bypassOpen ? "supply_temperature" : "extract_temperature";
		const rightTopLabel = this._temperatureLabel(rightTopKey, bypassOpen ? "supply" : "extract");
		const rightBottomKey = bypassOpen ? "extract_temperature" : "supply_temperature";
		const rightBottomLabel = this._temperatureLabel(rightBottomKey, bypassOpen ? "extract" : "supply");
		const extractGradient = summerMode || bypassOpen ? gExtractExhaustBypass : gExtractExhaust;
		const inlineAfterheat = this._config?.appearance?.hide_afterheat_on_bypass === true && bypassOpen ? "" : this._inlineAfterheatSvg(468, summerMode ? 146 : bypassOpen ? 120 : 212);
		const supplyFlowMarkup = summerMode ? "" : `
              <path class="duct-bg" d="${outdoorSupplyPath}"></path>
              <path class="flow-glow" stroke="url(#${bypassOpen ? gOutdoorSupplyBypass : gOutdoorSupply})" d="${outdoorSupplyPath}"></path>
              <path class="flow" stroke="url(#${bypassOpen ? gOutdoorSupplyBypass : gOutdoorSupply})" d="${outdoorSupplyPath}"></path>
              ${this._airLines(outdoorSupplyPath, flowDuration, flowDuration === "0s")}
              ${this._particles(outdoorSupplyPath, flowDuration, flowDuration === "0s")}
    `;
		const extractFlowMarkup = `
              <path class="duct-bg" d="${extractExhaustPath}"></path>
              <path class="flow-glow" stroke="url(#${extractGradient})" d="${extractExhaustPath}"></path>
              <path class="flow" stroke="url(#${extractGradient})" d="${extractExhaustPath}"></path>
              ${this._airLines(extractExhaustPath, flowDuration, flowDuration === "0s")}
              ${this._particles(extractExhaustPath, flowDuration, flowDuration === "0s")}
    `;
		const arrowsMarkup = summerMode ? `
              <path d="M565 140 H542 V133 L527 146 L542 159 V152 H565 Z"></path>
              <path d="M93 140 H70 V133 L55 146 L70 159 V152 H93 Z"></path>
    ` : `
              <path d="M49 114 H72 V107 L87 120 L72 133 V126 H49 Z"></path>
              <path d="${bypassOpen ? "M533 114 H556 V107 L571 120 L556 133 V126 H533 Z" : "M571 114 H548 V107 L533 120 L548 133 V126 H571 Z"}"></path>
              <path d="${bypassOpen ? "M571 202 H548 V195 L533 208 L548 221 V214 H571 Z" : "M87 206 H64 V199 L49 212 L64 225 V218 H87 Z"}"></path>
              <path d="${bypassOpen ? "M87 202 H64 V195 L49 208 L64 221 V214 H87 Z" : "M533 206 H556 V199 L571 212 L556 225 V218 H533 Z"}"></path>
    `;
		const fan1RpmMarkup = this._fanBadgeSvg("fan1_rpm", 128, summerMode ? 48 : 120);
		const fan2RpmMarkup = this._fanBadgeSvg("fan2_rpm", 128, summerMode ? 146 : bypassOpen ? 208 : 212);
		const temperatureMarkup = summerMode ? `
            <g ${this._svgEntityAttrs("exhaust_temperature")} tabindex="0">
              <rect x="18" y="42" width="118" height="62" rx="10" fill="transparent"></rect>
              ${hasLabels ? `<text x="74" y="64" text-anchor="middle" class="label">${this._temperatureLabel("exhaust_temperature", "exhaust")}</text>` : ""}
              ${hasTemps ? `<text x="74" y="96" text-anchor="middle" class="temperature">${this._formatTemp("exhaust_temperature")}</text>` : ""}
            </g>
            <g ${this._svgEntityAttrs("extract_temperature")} tabindex="0">
              <rect x="484" y="42" width="118" height="62" rx="10" fill="transparent"></rect>
              ${hasLabels ? `<text x="546" y="64" text-anchor="middle" class="label">${this._temperatureLabel("extract_temperature", "extract")}</text>` : ""}
              ${hasTemps ? `<text x="546" y="96" text-anchor="middle" class="temperature">${this._formatTemp("extract_temperature")}</text>` : ""}
            </g>
    ` : `
            <g ${this._svgEntityAttrs("outdoor_temperature")} tabindex="0">
              <rect x="18" y="18" width="100" height="56" rx="10" fill="transparent"></rect>
              ${hasLabels ? `<text x="68" y="38" text-anchor="middle" class="label">${this._temperatureLabel("outdoor_temperature", "outdoor")}</text>` : ""}
              ${hasTemps ? `<text x="68" y="68" text-anchor="middle" class="temperature">${this._formatTemp("outdoor_temperature")}</text>` : ""}
            </g>
            <g ${this._svgEntityAttrs(rightTopKey)} tabindex="0">
              <rect x="502" y="18" width="100" height="56" rx="10" fill="transparent"></rect>
              ${hasLabels ? `<text x="552" y="38" text-anchor="middle" class="label">${rightTopLabel}</text>` : ""}
              ${hasTemps ? `<text x="552" y="68" text-anchor="middle" class="temperature">${this._formatTemp(rightTopKey)}</text>` : ""}
            </g>
            <g ${this._svgEntityAttrs(rightBottomKey)} tabindex="0">
              <rect x="502" y="260" width="100" height="52" rx="10" fill="transparent"></rect>
              ${hasLabels ? `<text x="552" y="280" text-anchor="middle" class="label">${rightBottomLabel}</text>` : ""}
              ${hasTemps ? `<text x="552" y="306" text-anchor="middle" class="temperature">${this._formatTemp(rightBottomKey)}</text>` : ""}
            </g>
            <g ${this._svgEntityAttrs("exhaust_temperature")} tabindex="0">
              <rect x="18" y="260" width="100" height="52" rx="10" fill="transparent"></rect>
              ${hasLabels ? `<text x="68" y="280" text-anchor="middle" class="label">${this._temperatureLabel("exhaust_temperature", "exhaust")}</text>` : ""}
              ${hasTemps ? `<text x="68" y="306" text-anchor="middle" class="temperature">${this._formatTemp("exhaust_temperature")}</text>` : ""}
            </g>
    `;
		this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          box-sizing: border-box;
          --hrv-flow-width: 46;
          --hrv-background: var(--hrv-card-background, var(--ha-card-background, var(--card-background-color, var(--paper-card-background-color, var(--primary-background-color, #1c1c1c)))));
          --hrv-text: var(--hrv-card-text-color, var(--primary-text-color, var(--text-primary-color, currentColor)));
          --hrv-muted: var(--hrv-card-secondary-text-color, var(--secondary-text-color, var(--hrv-text)));
          --hrv-flow-detail: var(--hrv-card-flow-detail-color, rgba(255, 255, 255, .96));
        }

        ha-card {
          display: block;
          box-sizing: border-box;
          width: 100%;
          overflow: hidden;
          position: relative;
        }

        .card {
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          padding: ${compact ? "4px 3px 6px" : "8px 5px 10px"};
          color: var(--hrv-text) !important;
        }

        svg {
          width: 100%;
          height: auto;
          aspect-ratio: 620 / ${this._diagramHeight()};
          display: block;
          overflow: visible;
          color: var(--hrv-text) !important;
        }

        svg text {
          fill: var(--hrv-text) !important;
          color: var(--hrv-text) !important;
        }

        .duct-bg {
          fill: none;
          stroke: color-mix(in srgb, var(--hrv-text) 8%, transparent);
          stroke-width: calc(var(--hrv-flow-width) + 10px);
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .flow {
          fill: none;
          stroke-width: var(--hrv-flow-width);
          stroke-linecap: round;
          stroke-linejoin: round;
          opacity: .7;
        }

        .flow-glow {
          fill: none;
          stroke-width: calc(var(--hrv-flow-width) + 14px);
          stroke-linecap: round;
          stroke-linejoin: round;
          opacity: .12;
        }

        .air-band {
          animation: air-wave 5.4s ease-in-out infinite alternate;
          transform-box: fill-box;
          transform-origin: center;
        }

        .air-band.stopped {
          animation: none;
          opacity: .18;
        }

        .air-line {
          fill: none;
          stroke: var(--hrv-flow-detail);
          stroke-linecap: round;
          opacity: var(--air-alpha, .72);
          animation: airflow var(--flow-duration, 3.6s) linear infinite;
          animation-delay: var(--air-flow-delay, 0s);
        }

        .air-line.stopped {
          animation: none;
          opacity: .16;
        }

        .flow-particles {
          fill: none;
          stroke: var(--hrv-flow-detail);
          stroke-linecap: round;
          opacity: var(--particle-alpha, .72);
          animation: airflow var(--flow-duration, 3.6s) linear infinite;
          animation-delay: var(--air-flow-delay, 0s);
        }

        .flow-particles.reverse {
          animation-direction: reverse;
        }

        .no-animation .flow-particles {
          animation: none;
        }

        .flow-particles.stopped {
          animation: none;
          opacity: .18;
        }

        @keyframes airflow {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: var(--air-flow-direction, -260); }
        }

        @keyframes air-wave {
          from { transform: translateY(calc(var(--air-wave, 2px) * -1)); }
          to { transform: translateY(var(--air-wave, 2px)); }
        }

        .label {
          font-size: 14px;
          fill: var(--hrv-muted) !important;
          color: var(--hrv-muted) !important;
        }

        .temperature {
          font-size: 22px;
          font-weight: 600;
          fill: var(--hrv-text) !important;
          color: var(--hrv-text) !important;
        }

        .side-value {
          font-size: 11px;
          font-weight: 500;
          fill: var(--hrv-text);
        }

        .fan-icon {
          transform-origin: 0px 0px;
          animation-name: fan-spin;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }

        @keyframes fan-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .fan-blade {
          fill: var(--hrv-text);
          paint-order: stroke;
          stroke: color-mix(in srgb, var(--hrv-background) 85%, transparent);
          stroke-width: 2.5px;
          stroke-linejoin: round;
        }

        .fan-hub {
          fill: var(--hrv-text);
          paint-order: stroke;
          stroke: color-mix(in srgb, var(--hrv-background) 85%, transparent);
          stroke-width: 2px;
        }

        .recovery-circle {
          fill: color-mix(in srgb, var(--hrv-background) 88%, var(--hrv-text) 4%);
          stroke: none;
          filter: drop-shadow(0 3px 7px rgba(0, 0, 0, .3));
        }

        .recovery-ring-bg {
          fill: none;
          stroke: color-mix(in srgb, var(--hrv-text) 18%, transparent);
          stroke-width: 3;
        }

        .recovery-ring {
          fill: none;
          stroke: color-mix(in srgb, var(--success-color, #43e683) 82%, var(--hrv-text) 18%);
          stroke-width: 3;
          stroke-linecap: round;
        }

        .recovery-ring.cooling {
          stroke: color-mix(in srgb, var(--info-color, #4aa3ff) 82%, var(--hrv-text) 18%);
        }

        .afterheat-ring {
          fill: none;
          stroke-width: 3;
          stroke-linecap: round;
        }

        .afterheat-ring.active {
          stroke: color-mix(in srgb, var(--warning-color, #f2994a) 82%, var(--hrv-text) 18%);
        }

        .afterheat-ring.inactive {
          stroke: color-mix(in srgb, var(--hrv-text) 38%, transparent);
        }

        .status-ring-bg {
          fill: none;
          stroke: color-mix(in srgb, var(--hrv-text) 18%, transparent);
          stroke-width: 3;
        }

        .status-ring {
          fill: none;
          stroke: color-mix(in srgb, var(--success-color, #43e683) 82%, var(--hrv-text) 18%);
          stroke-width: 3;
          stroke-linecap: round;
          transition: stroke .4s ease;
        }

        .status-ring.warn {
          stroke: color-mix(in srgb, var(--warning-color, #f2994a) 82%, var(--hrv-text) 18%);
        }

        .status-ring.danger {
          stroke: color-mix(in srgb, var(--error-color, #db4437) 82%, var(--hrv-text) 18%);
        }

        .status-ring.info {
          stroke: color-mix(in srgb, var(--info-color, #4aa3ff) 82%, var(--hrv-text) 18%);
        }

        .recovery-value {
          font-size: 17px;
          font-weight: 700;
          fill: var(--hrv-text) !important;
          color: var(--hrv-text) !important;
        }

        .status-circle {
          fill: color-mix(in srgb, var(--hrv-background) 88%, var(--hrv-text) 4%);
          stroke: none;
          filter: drop-shadow(0 3px 7px rgba(0, 0, 0, .3));
        }

        .status-circle-rim {
          fill: none;
          stroke: color-mix(in srgb, var(--hrv-text) 24%, transparent);
          stroke-width: 1.5;
        }

        .status-circle-rim-large {
          stroke-width: 2;
        }

        .status-circle-gloss {
          fill: white;
          opacity: .1;
          mix-blend-mode: overlay;
          pointer-events: none;
        }

        .status-label {
          font-size: 9.5px;
          letter-spacing: .3px;
          text-transform: uppercase;
          fill: var(--hrv-muted) !important;
          color: var(--hrv-muted) !important;
        }

        .status-value {
          font-size: 15px;
          font-weight: 700;
          fill: var(--hrv-text) !important;
          color: var(--hrv-text) !important;
        }

        .status-value.danger {
          fill: var(--error-color, #db4437) !important;
          color: var(--error-color, #db4437) !important;
        }

        .blink-fade {
          animation: fade-blink 2s ease-in-out infinite;
        }

        .alarm-triangle {
          fill: var(--error-color, #db4437);
          stroke: color-mix(in srgb, var(--hrv-background) 55%, transparent);
          stroke-width: 1;
        }

        .afterheat-coil {
          fill-opacity: ${afterheatCoilOpacity};
          stroke: color-mix(in srgb, var(--hrv-text) 35%, transparent);
          stroke-width: 1.5;
          transition: stroke .4s ease;
        }

        .afterheat-coil.active {
          fill-opacity: ${afterheatCoilOpacity};
          stroke: color-mix(in srgb, var(--error-color, #db4437) 80%, var(--hrv-text) 20%);
          stroke-width: 2.5;
        }

        .fan-badge-box {
          fill: #808080;
          fill-opacity: ${afterheatCoilOpacity};
          stroke: color-mix(in srgb, var(--hrv-text) 35%, transparent);
          stroke-width: 1.5;
        }

        .afterheat-warm-side {
          fill: color-mix(in srgb, var(--error-color, #db4437) 45%, transparent);
        }

        .afterheat-cool-side {
          fill: color-mix(in srgb, var(--info-color, #4aa3ff) 45%, transparent);
        }

        .afterheat-coil-glow {
          fill: color-mix(in srgb, var(--error-color, #db4437) 35%, transparent);
          opacity: 0;
          transition: opacity .4s ease;
        }

        .afterheat-coil-glow.active {
          opacity: .5;
          animation: coil-pulse 2.4s ease-in-out infinite;
        }

        @keyframes coil-pulse {
          0%, 100% { opacity: .26; }
          50% { opacity: .6; }
        }

        .afterheat-coil-lines line {
          stroke: color-mix(in srgb, var(--hrv-text) 35%, transparent);
          stroke-width: 3;
          stroke-linecap: round;
          transition: stroke .4s ease;
        }

        .afterheat-coil-lines.active line {
          stroke: color-mix(in srgb, var(--error-color, #db4437) 70%, white 30%);
        }

        .afterheat-coil.active + .afterheat-coil-lines line,
        .afterheat-coil-glow.active ~ .afterheat-coil-lines line {
          stroke: color-mix(in srgb, var(--warning-color, #f2994a) 65%, var(--hrv-text) 35%);
        }

        .inline-afterheat-value {
          font-size: 12px;
          font-weight: 750;
          paint-order: stroke;
          stroke: color-mix(in srgb, var(--hrv-background) 85%, transparent);
          stroke-width: 3px;
        }

        .inline-afterheat-delta {
          font-size: 10px;
          font-weight: 700;
          fill: #ffffff !important;
          paint-order: stroke;
          stroke: rgba(0, 0, 0, .55);
          stroke-width: 3px;
        }

        .alarm-mark {
          fill: #fff !important;
          color: #fff !important;
          font-size: 20px;
          font-weight: 900;
        }

        @keyframes fade-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: .25; }
        }

        .badges {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          flex: 0 0 auto;
          margin-top: 10px;
        }

        .badge {
          appearance: none;
          border: 0;
          border-radius: 10px;
          background: color-mix(in srgb, var(--hrv-background) 82%, transparent);
          color: var(--hrv-text) !important;
          padding: 8px 10px;
          text-align: center;
          min-width: 0;
          cursor: pointer;
          font: inherit;
          box-shadow: none;
        }

        .badge:not([data-entity]) {
          cursor: default;
        }

        .entity-hit {
          cursor: pointer;
        }

        .entity-hit:focus-visible {
          outline: 2px solid var(--hrv-text);
          outline-offset: 3px;
        }

        .badge span {
          display: block;
          color: var(--hrv-muted) !important;
          font-size: 12px;
          line-height: 1.25;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .badge strong {
          display: block;
          margin-top: 4px;
          font-size: 17px;
          font-weight: 700;
          line-height: 1.2;
          color: var(--hrv-text) !important;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .select-control {
          display: block;
          min-width: 0;
          border-radius: 8px;
          background: color-mix(in srgb, var(--hrv-background) 82%, transparent);
          color: var(--hrv-text) !important;
          padding: 6px 8px;
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--hrv-text) 10%, transparent);
        }

        .select-control span {
          display: block;
          color: var(--hrv-muted) !important;
          font-size: 10px;
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .select-control select {
          width: 100%;
          margin-top: 2px;
          border: 0;
          border-radius: 6px;
          background: color-mix(in srgb, var(--hrv-background) 94%, var(--hrv-text) 6%);
          color: var(--hrv-text) !important;
          font: inherit;
          font-size: 12px;
          font-weight: 700;
          line-height: 1.2;
          min-height: 22px;
          padding: 2px 4px;
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--hrv-text) 12%, transparent);
        }

        .select-control select option {
          background: var(--hrv-background);
          color: var(--hrv-text);
        }
      </style>

      <ha-card>
        <div class="card ${animationOff ? "no-animation" : ""}">
          <svg viewBox="0 0 620 ${this._diagramHeight()}" role="img" aria-label="${this._t("airflow_diagram")}">
            <defs>
              ${this._gradient(gOutdoorSupply, outdoor, supply)}
              ${this._gradient(gExtractExhaust, exhaust, extract)}
              ${this._gradient(gOutdoorSupplyBypass, outdoor, supply, "34", "100", "586", "100", "userSpaceOnUse")}
              ${this._gradient(gExtractExhaustBypass, exhaust, extract, "34", summerMode ? "146" : "184", "586", summerMode ? "146" : "184", "userSpaceOnUse")}
              <linearGradient id="${gFlowFade}" x1="18" y1="0" x2="602" y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="black"></stop>
                <stop offset="4%" stop-color="white"></stop>
                <stop offset="96%" stop-color="white"></stop>
                <stop offset="100%" stop-color="black"></stop>
              </linearGradient>
              <mask id="${flowMask}" maskUnits="userSpaceOnUse" x="18" y="40" width="584" height="280">
                <rect x="18" y="40" width="584" height="280" fill="url(#${gFlowFade})"></rect>
              </mask>
            </defs>

            <g mask="url(#${flowMask})">
              ${supplyFlowMarkup}
              ${extractFlowMarkup}
            </g>

            <g fill="var(--hrv-text)" opacity=".92">
              ${arrowsMarkup}
            </g>

            ${fan1RpmMarkup}
            ${fan2RpmMarkup}

            ${inlineAfterheat}

            ${temperatureMarkup}

            <g ${this._svgEntityAttrs("heat_recovery")} tabindex="0" transform="translate(182 46)">
              <rect class="recovery-circle" x="-32" y="-32" width="64" height="64" rx="13"></rect>
              <ellipse class="status-circle-gloss" cx="-13" cy="-18" rx="20" ry="11"></ellipse>
              <rect class="recovery-ring-bg" x="-29" y="-29" width="58" height="58" rx="10" pathLength="100"></rect>
              <rect class="recovery-ring ${coolingRecovery ? "cooling" : ""}" x="-29" y="-29" width="58" height="58" rx="10" pathLength="100" stroke-dasharray="${recoveryProgress} 100"></rect>
              <rect class="status-circle-rim" x="-32" y="-32" width="64" height="64" rx="13"></rect>
              <text x="0" y="-10" text-anchor="middle" class="status-label">${this._t("recovery_short")}</text>
              <text x="0" y="13" text-anchor="middle" class="recovery-value" style="font-size:15px;">${recoveryValueText}</text>
            </g>

            ${this._statusCircle("co2", this._t("co2"), this._formatNumber("co2", 0), 262, 46, "", "air_quality", this._formatAirQuality(), true, this._airQualityRing())}
            ${this._statusCircle("room_temperature", this._t("room"), this._formatTemp("room_temperature"), houseX, 46, "", "humidity", this._formatNumber("humidity", 0, "%"), true, this._overallStatusRing())}
            ${this._afterheatCircle(430, 46)}

            ${this._auxStatusCircles(houseX, statusCircleY)}
            ${this._alarmIndicator()}
          </svg>

        </div>
      </ha-card>
    `;
		this.shadowRoot.querySelectorAll("[data-entity]").forEach((element) => {
			element.addEventListener("click", () => this._fireMoreInfo(element.dataset.entity));
			element.addEventListener("keydown", (event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					this._fireMoreInfo(element.dataset.entity);
				}
			});
		});
		this.shadowRoot.querySelectorAll("[data-select-entity]").forEach((element) => {
			element.addEventListener("change", (event) => {
				this._setSelectOption(element.dataset.selectEntity, event.target.value);
			});
		});
	}
};
var HRVCardEditor = class extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({ mode: "open" });
		this._config = {};
		this._schemaCache = void 0;
	}
	setConfig(config) {
		this._config = config || {};
		this._render();
	}
	set hass(hass) {
		this._hass = hass;
		this._render();
	}
	_formData() {
		const entities = this._config?.entities || {};
		const labels = this._config?.labels || {};
		const appearance = this._config?.appearance || {};
		const thresholds = this._config?.temperature_thresholds || {};
		return {
			outdoor_temperature: entities.outdoor_temperature,
			room_temperature: entities.room_temperature,
			supply_temperature: entities.supply_temperature,
			extract_temperature: entities.extract_temperature,
			exhaust_temperature: entities.exhaust_temperature,
			label_outdoor_temperature: labels.outdoor_temperature,
			label_room_temperature: labels.room_temperature,
			label_supply_temperature: labels.supply_temperature,
			label_extract_temperature: labels.extract_temperature,
			label_exhaust_temperature: labels.exhaust_temperature,
			heat_recovery: entities.heat_recovery,
			humidity: entities.humidity,
			bypass: entities.bypass,
			mode: entities.mode,
			level: entities.level,
			co2: entities.co2,
			filter_days: entities.filter_days,
			alarm: entities.alarm,
			fan1_rpm: entities.fan1_rpm,
			fan2_rpm: entities.fan2_rpm,
			afterheat_after: entities.afterheat_after,
			afterheat_active: entities.afterheat_active,
			water_flow: entities.water_flow,
			water_return: entities.water_return,
			water_delta: entities.water_delta,
			air_quality: entities.air_quality,
			power: entities.power,
			heat_transfer: entities.heat_transfer,
			animation: appearance.animation !== false,
			fan_animation: (appearance.fan_animation ?? appearance.animation) !== false,
			pipe_animation: (appearance.pipe_animation ?? appearance.animation) !== false,
			show_labels: appearance.show_labels !== false,
			show_badges: appearance.show_badges !== false,
			show_temperatures: appearance.show_temperatures !== false,
			invert_heat_recovery: appearance.invert_heat_recovery === true,
			compact: appearance.compact === true,
			afterheat_coil_opacity: appearance.afterheat_coil_opacity ?? 60,
			hide_afterheat_on_bypass: appearance.hide_afterheat_on_bypass === true,
			threshold_white: thresholds.white ?? -10,
			threshold_blue: thresholds.blue ?? 5,
			threshold_green: thresholds.green ?? 16,
			threshold_yellow: thresholds.yellow ?? 22,
			threshold_orange: thresholds.orange ?? 27,
			threshold_red: thresholds.red ?? 32
		};
	}
	_language() {
		return (this._hass?.locale?.language || this._hass?.language || "en").toString().toLowerCase().startsWith("da") ? "da" : "en";
	}
	_t(key) {
		const translations = {
			en: {
				temperatures: "Temperatures",
				temperature_labels: "Temperature labels",
				temperature_colors: "Temperature colors",
				optional_entities: "Optional entities",
				appearance: "Appearance",
				outdoor_temperature: "Outdoor temperature",
				room_temperature: "Room temperature",
				supply_temperature: "Supply temperature",
				extract_temperature: "Extract temperature",
				exhaust_temperature: "Exhaust temperature",
				label_outdoor_temperature: "Outdoor label",
				label_room_temperature: "Room label",
				label_supply_temperature: "Supply label",
				label_extract_temperature: "Extract label",
				label_exhaust_temperature: "Exhaust label",
				threshold_white: "White from",
				threshold_blue: "Blue from",
				threshold_green: "Green from",
				threshold_yellow: "Yellow from",
				threshold_orange: "Orange from",
				threshold_red: "Red from",
				heat_recovery: "Heat recovery",
				invert_heat_recovery: "Invert heat recovery",
				humidity: "Humidity",
				co2: "CO2 level",
				filter_days: "Filter remaining days",
				alarm: "Alarm",
				bypass: "Bypass",
				mode: "Mode",
				level: "Level",
				fan1_rpm: "Fan 1 speed",
				fan2_rpm: "Fan 2 speed",
				afterheat: "Afterheat coil",
				afterheat_after: "Air after coil",
				afterheat_active: "Afterheat status",
				water_flow: "Water flow temperature",
				water_return: "Water return temperature",
				water_delta: "Water ΔT",
				air_quality: "Air quality",
				power: "Power consumption",
				heat_transfer: "Water heat transfer",
				animation: "Animation",
				fan_animation: "Fan animation",
				pipe_animation: "Pipe animation",
				show_labels: "Show labels",
				show_badges: "Show badges",
				show_temperatures: "Show temperatures",
				compact: "Compact",
				afterheat_coil_opacity: "Afterheat coil opacity",
				hide_afterheat_on_bypass: "Hide inline afterheat temperatures when bypass is open"
			},
			da: {
				temperatures: "Temperaturer",
				temperature_labels: "Temperaturlabels",
				temperature_colors: "Temperaturfarver",
				optional_entities: "Valgfri enheder",
				appearance: "Udseende",
				outdoor_temperature: "Udetemperatur",
				room_temperature: "Hustemperatur",
				supply_temperature: "Indblæsningstemperatur",
				extract_temperature: "Udsugningstemperatur",
				exhaust_temperature: "Udblæsningstemperatur",
				label_outdoor_temperature: "Ude label",
				label_room_temperature: "Hus label",
				label_supply_temperature: "Indblæsning label",
				label_extract_temperature: "Udsugning label",
				label_exhaust_temperature: "Udblæs label",
				threshold_white: "Hvid fra",
				threshold_blue: "Blå fra",
				threshold_green: "Grøn fra",
				threshold_yellow: "Gul fra",
				threshold_orange: "Orange fra",
				threshold_red: "Rød fra",
				heat_recovery: "Varmegenvinding",
				invert_heat_recovery: "Omvend varmegenvinding",
				humidity: "Fugt",
				co2: "CO2 niveau",
				filter_days: "Resterende filter i dage",
				alarm: "Alarm",
				bypass: "Bypass",
				mode: "Drift",
				level: "Ventilationstrin",
				fan1_rpm: "Ventilator 2 hastighed",
				fan2_rpm: "Ventilator 1 hastighed",
				afterheat: "Eftervarmeflade",
				afterheat_after: "Luft efter varmefladen",
				afterheat_active: "Eftervarme aktiv",
				water_flow: "Fremløbstemperatur",
				water_return: "Returtemperatur",
				water_delta: "Vand ΔT",
				air_quality: "Luftkvalitet",
				power: "Strømforbrug",
				heat_transfer: "Vandets varmeoverførsel",
				animation: "Animation",
				fan_animation: "Blæser-animation",
				pipe_animation: "Rør-animation",
				show_labels: "Vis labels",
				show_badges: "Vis badges",
				show_temperatures: "Vis temperaturer",
				compact: "Kompakt",
				afterheat_coil_opacity: "Eftervarme-spolens gennemsigtighed",
				hide_afterheat_on_bypass: "Skjul varmefladens frem/retur/ΔT under bypass"
			}
		};
		return translations[this._language()]?.[key] || translations.en[key] || key;
	}
	_schema() {
		return [
			{
				type: "expandable",
				name: "temperatures",
				title: this._t("temperatures"),
				flatten: true,
				icon: "mdi:thermometer",
				schema: [
					{
						name: "outdoor_temperature",
						selector: { entity: { domain: "sensor" } }
					},
					{
						name: "room_temperature",
						selector: { entity: { domain: "sensor" } }
					},
					{
						name: "supply_temperature",
						selector: { entity: { domain: "sensor" } }
					},
					{
						name: "extract_temperature",
						selector: { entity: { domain: "sensor" } }
					},
					{
						name: "exhaust_temperature",
						selector: { entity: { domain: "sensor" } }
					}
				]
			},
			{
				type: "expandable",
				name: "temperature_labels",
				title: this._t("temperature_labels"),
				flatten: true,
				icon: "mdi:label-outline",
				schema: [
					{
						name: "label_outdoor_temperature",
						selector: { text: {} }
					},
					{
						name: "label_room_temperature",
						selector: { text: {} }
					},
					{
						name: "label_supply_temperature",
						selector: { text: {} }
					},
					{
						name: "label_extract_temperature",
						selector: { text: {} }
					},
					{
						name: "label_exhaust_temperature",
						selector: { text: {} }
					}
				]
			},
			{
				type: "expandable",
				name: "temperature_colors",
				title: this._t("temperature_colors"),
				flatten: true,
				icon: "mdi:palette-outline",
				schema: [
					{
						name: "threshold_white",
						selector: { number: {
							min: -40,
							max: 60,
							step: .5,
							mode: "box",
							unit_of_measurement: "°C"
						} }
					},
					{
						name: "threshold_blue",
						selector: { number: {
							min: -40,
							max: 60,
							step: .5,
							mode: "box",
							unit_of_measurement: "°C"
						} }
					},
					{
						name: "threshold_green",
						selector: { number: {
							min: -40,
							max: 60,
							step: .5,
							mode: "box",
							unit_of_measurement: "°C"
						} }
					},
					{
						name: "threshold_yellow",
						selector: { number: {
							min: -40,
							max: 60,
							step: .5,
							mode: "box",
							unit_of_measurement: "°C"
						} }
					},
					{
						name: "threshold_orange",
						selector: { number: {
							min: -40,
							max: 60,
							step: .5,
							mode: "box",
							unit_of_measurement: "°C"
						} }
					},
					{
						name: "threshold_red",
						selector: { number: {
							min: -40,
							max: 60,
							step: .5,
							mode: "box",
							unit_of_measurement: "°C"
						} }
					}
				]
			},
			{
				type: "expandable",
				name: "optional_entities",
				title: this._t("optional_entities"),
				flatten: true,
				icon: "mdi:tune-variant",
				schema: [
					{
						name: "heat_recovery",
						selector: { entity: { domain: "sensor" } }
					},
					{
						name: "humidity",
						selector: { entity: { domain: "sensor" } }
					},
					{
						name: "bypass",
						selector: { entity: {} }
					},
					{
						name: "mode",
						selector: { entity: {} }
					},
					{
						name: "level",
						selector: { entity: {} }
					},
					{
						name: "co2",
						selector: { entity: { domain: "sensor" } }
					},
					{
						name: "filter_days",
						selector: { entity: {} }
					},
					{
						name: "alarm",
						selector: { entity: { domain: ["sensor", "binary_sensor"] } }
					},
					{
						name: "fan1_rpm",
						selector: { entity: { domain: "sensor" } }
					},
					{
						name: "fan2_rpm",
						selector: { entity: { domain: "sensor" } }
					},
					{
						name: "air_quality",
						selector: { entity: { domain: "sensor" } }
					},
					{
						name: "power",
						selector: { entity: { domain: "sensor" } }
					}
				]
			},
			{
				type: "expandable",
				name: "afterheat",
				title: this._t("afterheat"),
				flatten: true,
				icon: "mdi:radiator",
				schema: [
					{
						name: "afterheat_after",
						selector: { entity: { domain: "sensor" } }
					},
					{
						name: "afterheat_active",
						selector: { entity: { domain: "binary_sensor" } }
					},
					{
						name: "water_flow",
						selector: { entity: { domain: "sensor" } }
					},
					{
						name: "water_return",
						selector: { entity: { domain: "sensor" } }
					},
					{
						name: "water_delta",
						selector: { entity: { domain: "sensor" } }
					},
					{
						name: "heat_transfer",
						selector: { entity: { domain: "sensor" } }
					}
				]
			},
			{
				type: "expandable",
				name: "appearance",
				title: this._t("appearance"),
				flatten: true,
				icon: "mdi:palette",
				schema: [
					{
						name: "fan_animation",
						selector: { boolean: {} }
					},
					{
						name: "pipe_animation",
						selector: { boolean: {} }
					},
					{
						name: "show_labels",
						selector: { boolean: {} }
					},
					{
						name: "show_badges",
						selector: { boolean: {} }
					},
					{
						name: "show_temperatures",
						selector: { boolean: {} }
					},
					{
						name: "invert_heat_recovery",
						selector: { boolean: {} }
					},
					{
						name: "compact",
						selector: { boolean: {} }
					},
					{
						name: "afterheat_coil_opacity",
						selector: { number: {
							min: 0,
							max: 100,
							step: 5,
							mode: "slider",
							unit_of_measurement: "%"
						} }
					},
					{
						name: "hide_afterheat_on_bypass",
						selector: { boolean: {} }
					}
				]
			}
		];
	}
	_computeLabel(schema) {
		return this._t(schema.name) || schema.title || schema.name;
	}
	_valueChanged(event) {
		event.stopPropagation();
		const value = event.detail.value || {};
		const thresholdValue = (key, fallback) => {
			const parsed = Number.parseFloat(value[key]);
			return Number.isFinite(parsed) ? parsed : fallback;
		};
		const next = structuredClone(this._config || {});
		next.entities = {
			...next.entities || {},
			outdoor_temperature: value.outdoor_temperature || void 0,
			room_temperature: value.room_temperature || void 0,
			supply_temperature: value.supply_temperature || void 0,
			extract_temperature: value.extract_temperature || void 0,
			exhaust_temperature: value.exhaust_temperature || void 0,
			heat_recovery: value.heat_recovery || void 0,
			humidity: value.humidity || void 0,
			bypass: value.bypass || void 0,
			mode: value.mode || void 0,
			level: value.level || void 0,
			co2: value.co2 || void 0,
			filter_days: value.filter_days || void 0,
			alarm: value.alarm || void 0,
			fan1_rpm: value.fan1_rpm || void 0,
			fan2_rpm: value.fan2_rpm || void 0,
			afterheat_after: value.afterheat_after || void 0,
			afterheat_active: value.afterheat_active || void 0,
			water_flow: value.water_flow || void 0,
			water_return: value.water_return || void 0,
			water_delta: value.water_delta || void 0,
			air_quality: value.air_quality || void 0,
			power: value.power || void 0,
			heat_transfer: value.heat_transfer || void 0
		};
		next.labels = {
			...next.labels || {},
			outdoor_temperature: value.label_outdoor_temperature?.trim() || void 0,
			room_temperature: value.label_room_temperature?.trim() || void 0,
			supply_temperature: value.label_supply_temperature?.trim() || void 0,
			extract_temperature: value.label_extract_temperature?.trim() || void 0,
			exhaust_temperature: value.label_exhaust_temperature?.trim() || void 0
		};
		next.temperature_thresholds = {
			...next.temperature_thresholds || {},
			white: thresholdValue("threshold_white", -10),
			blue: thresholdValue("threshold_blue", 5),
			green: thresholdValue("threshold_green", 16),
			yellow: thresholdValue("threshold_yellow", 22),
			orange: thresholdValue("threshold_orange", 27),
			red: thresholdValue("threshold_red", 32)
		};
		next.appearance = {
			...next.appearance || {},
			fan_animation: value.fan_animation !== false,
			pipe_animation: value.pipe_animation !== false,
			show_labels: value.show_labels !== false,
			show_badges: value.show_badges !== false,
			show_temperatures: value.show_temperatures !== false,
			invert_heat_recovery: value.invert_heat_recovery === true,
			compact: value.compact === true,
			afterheat_coil_opacity: Number.isFinite(Number(value.afterheat_coil_opacity)) ? Number(value.afterheat_coil_opacity) : 60,
			hide_afterheat_on_bypass: value.hide_afterheat_on_bypass === true
		};
		Object.keys(next.entities).forEach((key) => {
			if (next.entities[key] === void 0) delete next.entities[key];
		});
		Object.keys(next.labels).forEach((key) => {
			if (next.labels[key] === void 0) delete next.labels[key];
		});
		if (Object.keys(next.labels).length === 0) delete next.labels;
		Object.keys(next.appearance).forEach((key) => {
			if (next.appearance[key] === void 0) delete next.appearance[key];
		});
		this.dispatchEvent(new CustomEvent("config-changed", {
			detail: { config: next },
			bubbles: true,
			composed: true
		}));
	}
	_render() {
		if (!this.shadowRoot) return;
		let form = this.shadowRoot.querySelector("ha-form");
		if (!form) {
			this.shadowRoot.innerHTML = `
        <style>
          ha-form {
            display: block;
          }
        </style>
        <ha-form></ha-form>
      `;
			form = this.shadowRoot.querySelector("ha-form");
			form.computeLabel = (schema) => this._computeLabel(schema);
			form.addEventListener("value-changed", (event) => this._valueChanged(event));
		}
		const schemaCacheKey = `${this._language()}:2.13.4-afterheat-status-layout`;
		if (!this._schemaCache || this._schemaCacheKey !== schemaCacheKey) {
			this._schemaCache = this._schema();
			this._schemaCacheKey = schemaCacheKey;
		}
		form.schema = this._schemaCache;
		form.hass = this._hass;
		form.data = this._formData();
	}
};
if (!customElements.get("hrv-card")) customElements.define("hrv-card", HRVCard);
if (!customElements.get("hrv-card-editor")) customElements.define("hrv-card-editor", HRVCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({
	type: "hrv-card",
	name: "HRV Card",
	description: "Animated heat recovery ventilation card with temperature gradients",
	preview: true
});
window.__HRV_CARD_VERSION__ = "2.13.4-afterheat-status-layout";
console.info("%c HRV Card %c loaded v2.12.1 ", "color: white; background: #1976d2; font-weight: 700; padding: 2px 4px; border-radius: 3px 0 0 3px;", "color: white; background: #43a047; font-weight: 700; padding: 2px 4px; border-radius: 0 3px 3px 0;");
//#endregion
