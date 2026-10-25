import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Hch5UnitDiagram, type DiagramParts } from "./Hch5UnitDiagram";
import { AfterheatThermostat } from "./AfterheatThermostat";
import { describeControl } from "./control";
import { bypassTravel, formatRemaining } from "./bypass";
import { ArrowRight, CloudFog, Flame, Gauge, Leaf, Roof, Snowflake, Wind, Zap } from "./icons";
import css from "./webui.css";

// The HCH5 Control WebUI overview (frontend-v2 OverviewPage) as a Home
// Assistant card. The Pi stays source of truth: every button calls the
// hch_passivelink entity that sends the same controller command as the WebUI.

type HAState = { state: string; attributes: Record<string, unknown>; last_changed: string };
type Hass = {
  states: Record<string, HAState | undefined>;
  callService: (domain: string, service: string, data: Record<string, unknown>) => Promise<unknown>;
  entities?: Record<string, { device_id?: string | null } | undefined>;
  devices?: Record<string, { model?: string | null; manufacturer?: string | null } | undefined>;
};
// afterheat_coil: how the afterheater is drawn, "electric" (default) or "water".
// unit_name: what the texts call the unit; by default the model of its Home Assistant device.
type Config = { entities: Record<string, string>; unit_name?: string; afterheat_outdoor_cutoff?: number; afterheat_coil?: "electric" | "water"; variant?: "smartdash"; embedded?: boolean; controls?: boolean };
type AfterheatValue = number | "off";
type Notice = { text: string; error: boolean };

// HA reports the new setpoint a moment after the service call returns; the
// draft stays shown until then so the value does not jump back and forth.
const AFTERHEAT_SETTLE_MS = 5000;
const BOOST_MINUTES = [15, 30, 60] as const;

/** Fan steps offered by the level select: 1-4 with Dantherm steps (HCH5 Control 1.4.0), else 1-6. */
function fanLevels(hass: Hass, entityId: string | undefined): number[] {
  const options = entityId ? (hass.states[entityId]?.attributes as { options?: unknown } | undefined)?.options : undefined;
  const levels = Array.isArray(options) ? options.map(Number).filter(level => Number.isInteger(level) && level > 0) : [];
  return levels.length ? levels : [1, 2, 3, 4, 5, 6];
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function text(value: unknown, fallback = "—") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}
function temp(value: number | null) {
  // Non-breaking space keeps the value and its unit on one line.
  return value === null ? "—" : `${value.toLocaleString("da-DK", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} °C`;
}
function whole(value: number | null) {
  return value === null ? "—" : Math.round(value).toLocaleString("da-DK");
}
// Electrical draw of the unit from an optional power meter (entities.power).
function watts(value: number | null) {
  return value === null ? "—" : `${Math.round(value).toLocaleString("da-DK")}\u00a0W`;
}
function kwh(value: number | null) {
  return value === null ? "—" : value.toLocaleString("da-DK", { maximumFractionDigits: 2 });
}
// Options of the integration's "Bål i haven" select, with the button labels.
const BONFIRE_CHOICES: [string, string][] = [["30 min", "30 min"], ["1 time", "1 t"], ["2 timer", "2 t"], ["3 timer", "3 t"]];
// Options of the integration's "Sluk anlæg" select, as in the WebUI's OFF popup.
const COOL_CHOICES: [string, string][] = [["cool_30", "30 min"], ["cool_60", "1 time"], ["cool_120", "2 timer"]];
const STANDBY_CHOICES: [string, string, string][] = [
  ["1 time", "1 time", "Tænder selv om en time"],
  ["4 timer", "4 timer", "Tænder selv om fire timer"],
  ["8 timer", "8 timer", "Tænder selv om otte timer"],
  ["Til i morgen kl. 07", "Til i morgen", "Tænder selv kl. 07:00"],
  ["Permanent", "Permanent", "Slukket, til du tænder igen"],
];
function cost(energyKwh: number | null, price: number | null) {
  return energyKwh === null || price === null ? "—" : `${(energyKwh * price).toLocaleString("da-DK", { maximumFractionDigits: 2 })} kr`;
}
function modeLabel(value: unknown) {
  // The last ones are an MKII's operation modes when it is connected directly.
  return ({ local_auto: "Local Auto", smart_auto: "Smart Auto", manual: "Manuel", automatic: "Automatik", week_program: "Ugeprogram", away: "Ferie", summer: "Sommer", fireplace: "Pejs", standby: "Standby" } as Record<string, string>)[String(value)] ?? text(value);
}
function outdoorAirLabel(value: unknown) {
  return ({ excellent_air_quality: "Fremragende", good_air_quality: "God", fair_air_quality: "Rimelig", moderate_air_quality: "Moderat", poor_air_quality: "Dårlig", very_poor_air_quality: "Meget dårlig" } as Record<string, string>)[String(value)] ?? text(value);
}
function masterLabel(value: unknown) {
  if (value === "pi") return "Raspberry Pi";
  if (value === "hcp4") return "HCP4";
  return "Afventer";
}
function coolingLabel(value: unknown) {
  const labels: Record<string, string> = {
    disabled: "Standby", standby: "Standby", qualifying: "Kvalificerer", opening: "Åbner bypass",
    active: "Aktiv", minimum_on_hold: "Minimum køretid", minimum_off_hold: "Minimum pause",
    outdoor_too_cold: "Ude for kold", not_cooler_outside: "Ude ikke koldere", room_below_start: "Rum under start",
    room_satisfied: "Rumtemperatur nået", sensor_missing: "Mangler sensor", manual_mode: "Manuel mode", vacation: "Ferie",
  };
  return labels[String(value)] ?? text(value).replaceAll("_", " ");
}
function remaining(value: unknown) {
  const seconds = number(value);
  if (seconds === null || seconds <= 0) return "Ikke aktiv";
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} min tilbage`;
}
// Fan step as a number; an MKII connected directly reports it as "level_3".
function stepNumber(value: unknown): number | null {
  const match = typeof value === "string" ? /^level_(\d+)$/.exec(value) : null;
  return match ? Number(match[1]) : number(value);
}
const PI_MODES = ["local_auto", "smart_auto", "manual"];
/** HCH5 Control's own modes; an MKII connected directly offers the unit's operation modes instead. */
function modeOptions(hass: Hass, entityId: string | undefined): string[] {
  const options = entityId ? (hass.states[entityId]?.attributes as { options?: unknown } | undefined)?.options : undefined;
  return Array.isArray(options) && options.length && !options.includes("local_auto") ? options.map(String) : PI_MODES;
}
// Alarm codes of an MKII connected directly.
const UNIT_ALARMS: Record<string, string> = {
  exhaust_air_fan: "Udsugningsventilator", supply_air_fan: "Indblæsningsventilator", bypass_damper: "Bypass-spjæld",
  outdoor_air_sensor: "Udeluftføler", supply_air_sensor: "Indblæsningsføler", extract_air_sensor: "Udsugningsføler",
  exhaust_air_sensor: "Afkastføler", room_air_sensor: "Rumføler", humidity_sensor: "Fugtføler", outdoor_temperature: "Udetemperatur",
  supply_temperature: "Indblæsningstemperatur", overtemperature: "Overtemperatur", communication_error: "Kommunikationsfejl",
  fire: "Brand", high_water_level: "Højt vandniveau", fire_protection: "Brandbeskyttelse",
};
// Without an alarm text sensor the status sensor's own value is the alarm (an MKII reports "none" or a code).
function alarmOf(status: string | null, alarmText: string | null, hasText: boolean) {
  const active = status !== null && status !== "ok" && status !== "none";
  return { active, text: !active ? null : hasText ? alarmText : UNIT_ALARMS[status] ?? status.replaceAll("_", " ") };
}

/** The card only shows what has a data source: an entity that is configured and that Home Assistant knows.
 *  One that is unavailable still counts, so a real outage shows "—"; a missing one leaves its part out. */
function presence(hass: Hass, ids: Record<string, string>) {
  const has = (...keys: string[]) => keys.some(key => Boolean(ids[key]) && hass.states[ids[key]] !== undefined);
  const parts: DiagramParts = {
    // Any afterheat or water entity means an external afterheater with HAC1.
    afterheat: Object.keys(ids).some(key => (key.startsWith("afterheat_") || key.startsWith("water_")) && has(key)),
    water: has("water_flow", "water_return"),
    frost: has("afterheat_frost"),
    // The Raspberry Pi controller reports the active master and its decisions.
    pi: has("active_master", "effective_source", "effective_reason"),
    bus: has("rs485_healthy"),
    outdoor: has("outdoor_temperature"),
    extract: has("extract_temperature"),
    exhaust: has("exhaust_temperature"),
    supply: has("afterheat_after", "supply_temperature"),
    supplyFan: has("supply_fan_rpm"),
    extractFan: has("extract_fan_rpm"),
    supplyFanPercent: has("supply_fan_percent"),
    extractFanPercent: has("extract_fan_percent"),
    bypass: has("bypass", "bypass_raw"),
  };
  return { has, parts, supplySensor: has("afterheat_after") ? "afterheat_after" : "supply_temperature", bypassSensor: has("bypass_raw") ? "bypass_raw" : "bypass" };
}
// The unit's own readings come first: the controller, the indoor climate sensor or a power plug are other devices.
const UNIT_KEYS = ["outdoor_temperature", "extract_temperature", "exhaust_temperature", "supply_temperature", "supply_fan_rpm", "extract_fan_rpm", "bypass", "mode_control", "level_control"];
/** What the texts call the unit: `unit_name`, else the model of the unit's Home Assistant device ("Dantherm RCV320 P2"
 *  in sentences, "RCV320 P2" in short labels). Null when neither is known; the texts then say "anlægget". */
function unitNames(hass: Hass, config: Config): { full: string | null; short: string | null } {
  const custom = typeof config.unit_name === "string" ? config.unit_name.trim() : "";
  if (custom) return { full: custom, short: custom };
  const ids = config.entities;
  const keys = [...UNIT_KEYS, ...Object.keys(ids).filter(key => !UNIT_KEYS.includes(key))];
  for (const key of keys) {
    const deviceId = ids[key] ? hass.entities?.[ids[key]]?.device_id : undefined;
    const device = deviceId ? hass.devices?.[deviceId] : undefined;
    const model = device?.model?.trim();
    // Other keys only count on a Dantherm device, so a power plug never names the unit.
    if (!model || (!UNIT_KEYS.includes(key) && !/dantherm/i.test(`${device?.manufacturer ?? ""} ${model}`))) continue;
    return { full: /dantherm/i.test(model) ? model : `Dantherm ${model}`, short: model };
  }
  return { full: null, short: null };
}

/** The bypass control is the controller's select, or the MKII's "Bypass (manuel)" switch. */
function bypassService(entityId: string | undefined, option: string): [string, string, Record<string, unknown>] {
  return entityId?.startsWith("switch.") ? ["switch", option === "on" ? "turn_on" : "turn_off", {}] : ["select", "select_option", { option }];
}
/** Grid class for a row of tiles: four per row is the default, others get their own column count. */
function metricsClass(count: number) {
  return count === 4 ? "" : ` metrics-${count}`;
}

function SmartdashCompact({ hass, config }: { hass: Hass; config: Config }) {
  const ids = config.entities;
  const read = (key: string) => {
    const item = hass.states[ids[key]];
    return item && !["unknown", "unavailable"].includes(item.state) ? item : undefined;
  };
  const value = (key: string) => read(key)?.state ?? null;
  const num = (key: string) => number(value(key));
  const { has, parts, supplySensor, bypassSensor } = presence(hass, ids);
  const step = stepNumber(value("effective_level"));
  const unit = unitNames(hass, config);
  const mode = String(value("mode_control") ?? "");
  const bypassRaw = num("bypass_raw");
  const moving = bypassRaw !== null && bypassRaw > 0 && bypassRaw < 255;
  const [now, setNow] = useState(Date.now);
  const [pending, setPending] = useState<{ key: string; value: string } | null>(null);
  const [boostChoice, setBoostChoice] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!moving) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [moving]);
  useEffect(() => {
    if (!pending) return;
    if (String(value(pending.key)).toLowerCase() === pending.value.toLowerCase()) { setPending(null); return; }
    const timer = window.setTimeout(() => setPending(null), 8000);
    return () => window.clearTimeout(timer);
  }, [hass, pending]);
  const selected = (key: string) => pending?.key === key ? pending.value : value(key);
  const command = async (key: string, domain: string, service: string, data: Record<string, unknown>, target?: string) => {
    const entity_id = ids[key];
    if (!entity_id || !hass.states[entity_id] || hass.states[entity_id]?.state === "unavailable") { setNotice("Styring ikke tilgængelig"); return false; }
    setBusy(true);
    if (target !== undefined) setPending({ key, value: target });
    try { await hass.callService(domain, service, { entity_id, ...data }); setNotice(""); return true; }
    catch (error) { setPending(null); setNotice(`Kunne ikke gemme: ${errorText(error)}`); return false; }
    finally { setBusy(false); }
  };
  const outdoor = num("outdoor_temperature"), extract = num("extract_temperature"), exhaust = num("exhaust_temperature");
  const supply = num("afterheat_after") ?? num("supply_temperature");
  const recovery = outdoor !== null && extract !== null && exhaust !== null && Math.abs(extract-outdoor) >= .5 && bypassRaw !== 255
    ? Math.max(0, Math.min(100, Math.round((extract-exhaust)/(extract-outdoor)*100))) : null;
  const elapsed = num("bypass_travel_seconds");
  const changed = Date.parse(read("bypass_travel_seconds")?.last_changed ?? read("bypass_raw")?.last_changed ?? "");
  const travelSeconds = moving && Number.isFinite(changed) ? (elapsed ?? 0) + Math.max(0, (now-changed)/1000) : elapsed;
  const bypassRequest = String(value("bypass_request") ?? value("bypass_control") ?? "off");
  const travel = bypassTravel({ raw: bypassRaw, requestOn: bypassRequest === "on", direction: value("bypass_travel_direction"), seconds: travelSeconds, total: num("bypass_travel_total") });
  const bypassLabel = travel ? `${travel.direction === "opening" ? "Åbner" : travel.direction === "closing" ? "Lukker" : "Bevæger sig"}${travel.percent === null ? "" : ` ${travel.percent}%`}` : bypassRaw === 255 || value("bypass") === "on" ? "Åben" : bypassRaw === 0 || (!has("bypass_raw") && value("bypass") === "off") ? "Lukket" : "—";
  // In the auto modes a level moves the controller's normal level; without one it sets the level select.
  const levelKey = mode === "manual" || !has("auto_normal") ? "level_control" : "auto_normal";
  const chosenLevel = num(levelKey);
  const normalLevel = levelKey === "auto_normal";
  const boostRemaining = num("boost_remaining") ?? 0;
  const boosts = ([15, 30] as const).filter(minutes => has(`boost_${minutes}`));
  const alarm = alarmOf(value("diagnostics_status"), value("diagnostics_alarm_text"), has("diagnostics_alarm_text"));
  const online = read("outdoor_temperature") !== undefined;
  const fireplaceRemaining = num("fireplace_remaining") ?? 0;
  const fireplaceChoice = String(selected("fireplace_control") ?? "Slukket");
  const fireplaceActive = fireplaceRemaining > 0 || fireplaceChoice !== "Slukket";
  const boostEnd = Date.parse(read("boost_remaining")?.last_changed ?? "") + boostRemaining * 1000;
  const activeBoost = boostRemaining > 0
    ? [15, 30].find(minutes => Math.abs(Date.parse(read(`boost_${minutes}`)?.state ?? "") + minutes * 60000 - boostEnd) < 45000) ?? boostChoice
    : boostChoice;
  useEffect(() => {
    if (boostRemaining > 0 || boostChoice === null) return;
    const timer = window.setTimeout(() => setBoostChoice(null), 8000);
    return () => window.clearTimeout(timer);
  }, [boostRemaining, boostChoice]);
  return <div className="hch-smartdash">
    <div className="hch-smartdash-head"><strong>{unit.short ?? "Ventilation"} <span>· {modeLabel(selected("mode_control"))}</span></strong><span className="hch-smartdash-state">{has("attic_temperature") && <span className="hch-smartdash-attic">Loft {temp(num("attic_temperature"))} · </span>}{has("power") && <span className="hch-smartdash-power">{watts(num("power"))} · </span>}{!has("active_master") ? (online ? "● Live" : "● Afventer") : value("active_master") === "pi" ? "● Live" : "● " + masterLabel(value("active_master"))}</span></div>
        {(num("supply_recovery") !== null || num("afterheat_power") !== null || alarm.active) && <div className="hch-smartdash-calc">{alarm.active && <span className={`hch-smartdash-alarm ${value("diagnostics_status")}`} title={text(alarm.text)}>⚠ <b>{text(alarm.text)}</b></span>}{num("supply_recovery") !== null && <span>Genv. ind <b>{whole(num("supply_recovery"))}%</b></span>}{num("recovered_heat") !== null && <span>Genvundet <b>{whole(num("recovered_heat"))} W</b></span>}{num("afterheat_power") !== null && <span>Eftervarme <b>{whole(num("afterheat_power"))} W</b></span>}</div>}
    <div className="hch-smartdash-body">
      <div className="hch-smartdash-art"><Hch5UnitDiagram outdoor={outdoor} extract={extract} exhaust={exhaust} beforeHeater={num("afterheat_before")} afterHeater={supply} room={num("room_temperature")} frost={num("afterheat_frost")} flowWater={num("water_flow")} returnWater={num("water_return")} supplyRpm={num("supply_fan_rpm")} extractRpm={num("extract_fan_rpm")} supplyPercent={num("supply_fan_percent")} extractPercent={num("extract_fan_percent")} fanLevel={step} bypassActual={bypassRaw === 255 || value("bypass") === "on"} bypassRequest={bypassRequest} heating={value("afterheat_active") === "on"} recovery={recovery} busActive={value("rs485_healthy") === "on"} bypassRaw={bypassRaw} bypassTravelDirection={value("bypass_travel_direction")} bypassTravelSeconds={travelSeconds} bypassTravelTotal={num("bypass_travel_total")} afterheatLockout={value("afterheat_lockout") === "on"} afterheatCoil={config.afterheat_coil === "water" ? "water" : "electric"} control={value("effective_source") === null ? null : describeControl({ active_master: value("active_master"), effective_source: value("effective_source"), effective_level: step, effective_reason: value("effective_reason"), fireplace: fireplaceActive })} controlCompact parts={parts} supplySensor={supplySensor} bypassSensor={bypassSensor} unitName={unit.full} unitLabel={unit.short}/></div>
      {config.controls !== false && <div className="hch-smartdash-controls" onClick={event => event.stopPropagation()}>
        <div className="hch-smartdash-readings"><span>Ude <b>{temp(outdoor)}</b></span><span>Ind <b>{temp(supply)}</b></span><span>Gen. <b>{recovery === null ? "—" : `${recovery}%`}</b></span>{parts.bypass && <span>Bypass <b>{bypassLabel}</b></span>}</div>
        {has("mode_control") && <div className={`hch-smartdash-control-row hch-smartdash-mode${modeOptions(hass, ids.mode_control).length > 3 ? " many" : ""}`}><div className="hch-smartdash-control-label"><span>Driftstilstand</span><em>{modeLabel(selected("mode_control"))}</em></div><div className="hch-smartdash-choice">{modeOptions(hass, ids.mode_control).map(option => <button key={option} type="button" aria-pressed={selected("mode_control") === option} disabled={busy} onClick={() => void command("mode_control", "select", "select_option", { option }, option)}>{option === "local_auto" ? "Auto" : option === "smart_auto" ? "Smart" : modeLabel(option)}</button>)}</div></div>}
        {has("level_control", "auto_normal") && <div className="hch-smartdash-control-row hch-smartdash-level"><div className="hch-smartdash-control-label"><span>Ventilatorniveau</span><em>Aktuelt trin {step ?? "—"}</em></div><div className="hch-smartdash-choice">{fanLevels(hass, ids.level_control).map(level => <button key={level} type="button" aria-pressed={(pending?.key === levelKey ? Number(pending.value) : step) === level} className={normalLevel && Number(selected(levelKey) ?? chosenLevel) === level && (pending?.key === levelKey ? Number(pending.value) : step) !== level ? "is-normal" : undefined} title={normalLevel && Number(selected(levelKey) ?? chosenLevel) === level ? "Normaltrin" : undefined} disabled={busy} onClick={() => void command(levelKey, normalLevel ? "number" : "select", normalLevel ? "set_value" : "select_option", normalLevel ? { value: level } : { option: String(level) }, String(level))}>{level}</button>)}</div></div>}
        {has("bypass_control") && <div className="hch-smartdash-control-row hch-smartdash-bypass"><div className="hch-smartdash-control-label"><span>Bypass</span><em>{bypassLabel}</em></div><div className="hch-smartdash-choice">{["off", "on"].map(option => <button key={option} type="button" aria-pressed={selected("bypass_control") === option} disabled={busy || moving || (option === "on" && fireplaceActive)} onClick={() => void command("bypass_control", ...bypassService(ids.bypass_control, option), option)}>{option === "off" ? "Auto" : "Åbn"}</button>)}</div></div>}
        {boosts.length > 0 && <div className="hch-smartdash-control-row hch-smartdash-boost"><div className="hch-smartdash-control-label"><span>Hurtig boost</span><em>{boostRemaining > 0 ? `${Math.ceil(boostRemaining / 60)} min tilbage` : "Klar"}</em></div><div className="hch-smartdash-choice">{boosts.map(minutes => <button key={minutes} type="button" aria-pressed={activeBoost === minutes} disabled={busy || fireplaceActive} onClick={() => { setBoostChoice(minutes); void command(`boost_${minutes}`, "button", "press", {}).then(ok => { if (!ok) setBoostChoice(null); }); }}>{minutes} min</button>)}{has("boost_stop") && <button type="button" disabled={busy || boostRemaining <= 0} onClick={() => void command("boost_stop", "button", "press", {}).then(ok => { if (ok) setBoostChoice(null); })}>Stop</button>}</div></div>}
        {has("fireplace_control") && <div className="hch-smartdash-control-row hch-smartdash-fireplace"><div className="hch-smartdash-control-label"><span>Pejsefunktion</span><em>{fireplaceRemaining > 0 ? `${Math.ceil(fireplaceRemaining / 60)} min tilbage` : fireplaceActive ? "Aktiv" : "Slukket"}</em></div><div className="hch-smartdash-choice">{(["Slukket", "15 min", "30 min"] as const).map(option => <button key={option} type="button" aria-pressed={fireplaceChoice === option} disabled={busy} onClick={() => void command("fireplace_control", "select", "select_option", { option }, option)}>{option === "Slukket" ? "Fra" : option}</button>)}</div></div>}
        {notice && <span className="hch-smartdash-notice" role="status">{notice}</span>}
      </div>}
    </div>
  </div>;
}
function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return "ukendt fejl";
}

function Overview({ hass, config, host }: { hass: Hass; config: Config; host: HTMLElement }) {
  const ids = config.entities;
  const hassRef = useRef(hass);
  hassRef.current = hass;
  // Unavailable and unknown count as missing, like a failed WebUI request.
  const entity = (key: string) => {
    const state = ids[key] ? hass.states[ids[key]] : undefined;
    return state && state.state !== "unavailable" && state.state !== "unknown" ? state : undefined;
  };
  const value = (key: string) => entity(key)?.state ?? null;
  const num = (key: string) => number(value(key));
  const isOn = (key: string) => {
    const state = value(key)?.toLowerCase();
    return state === "on" || state === "true";
  };
  const { has, parts, supplySensor, bypassSensor } = presence(hass, ids);
  const step = stepNumber(value("effective_level"));
  const unit = unitNames(hass, config);

  const [busy, setBusy] = useState<string | null>(null);
  const [pendingChoice, setPendingChoice] = useState<{ key: string; target: string } | null>(null);
  const pendingTimer = useRef<number | null>(null);
  const [notice, setNoticeState] = useState<Notice | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const setNotice = useCallback((message: string, error = false) => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    setNoticeState({ text: message, error });
    noticeTimer.current = window.setTimeout(() => setNoticeState(null), error ? 9000 : 4500);
  }, []);
  useEffect(() => () => { if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current); }, []);

  const command = useCallback(async (name: string, key: string, domain: string, service: string, data: Record<string, unknown>, success: string, target?: string) => {
    const current = hassRef.current;
    const entity_id = ids[key];
    if (!entity_id || !current.states[entity_id] || current.states[entity_id]?.state === "unavailable") {
      setNotice("Betjeningen er ikke tilgængelig i Home Assistant lige nu.", true);
      return false;
    }
    setBusy(name);
    if (target !== undefined) {
      if (pendingTimer.current !== null) window.clearTimeout(pendingTimer.current);
      setPendingChoice({ key, target });
      pendingTimer.current = window.setTimeout(() => setPendingChoice(null), 8000);
    }
    setNotice("Gemmer…");
    try {
      await current.callService(domain, service, { entity_id, ...data });
      setNotice(success);
      return true;
    } catch (error) {
      if (target !== undefined) {
        if (pendingTimer.current !== null) window.clearTimeout(pendingTimer.current);
        setPendingChoice(null);
      }
      setNotice(`Kunne ikke gemme: ${errorText(error)}`, true);
      return false;
    } finally {
      setBusy(null);
    }
  }, [ids, setNotice]);
  useEffect(() => () => { if (pendingTimer.current !== null) window.clearTimeout(pendingTimer.current); }, []);
  useEffect(() => {
    if (pendingChoice && hass.states[ids[pendingChoice.key]]?.state.toLowerCase() === pendingChoice.target.toLowerCase()) {
      if (pendingTimer.current !== null) window.clearTimeout(pendingTimer.current);
      setPendingChoice(null);
    }
  }, [pendingChoice, hass, ids]);

  // Timestamps from HA are compared with a clock that only ticks while
  // something counts down, so idle renders stay cheap.
  const [now, setNow] = useState(() => Date.now());
  const bypassRaw = num("bypass_raw");
  const bypassMoving = bypassRaw !== null && bypassRaw !== 0 && bypassRaw !== 255;
  useEffect(() => {
    if (!bypassMoving) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [bypassMoving]);
  const secondsSince = (key: string) => {
    const changed = Date.parse(entity(key)?.last_changed ?? "");
    return Number.isFinite(changed) ? Math.max(0, (now - changed) / 1000) : null;
  };

  const showHistory = (key: string) => {
    const entityId = ids[key];
    if (entityId) host.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
  };
  const outdoor = num("outdoor_temperature");
  const extract = num("extract_temperature");
  const exhaust = num("exhaust_temperature");
  // Only a measured T2 (1-Wire before the coil); the unit register repeats T2AH.
  const beforeHeater = num("afterheat_before");
  const afterHeater = num("afterheat_after") ?? num("supply_temperature");
  const room = num("room_temperature");
  const frost = num("afterheat_frost");
  const flowWater = num("water_flow");
  const returnWater = num("water_return");
  const supplyRpm = num("supply_fan_rpm");
  const extractRpm = num("extract_fan_rpm");
  const supplyPercent = num("supply_fan_percent");
  const extractPercent = num("extract_fan_percent");
  const humidity = num("humidity");
  const co2 = num("co2");
  const filterLife = num("filter_life");
  const bypassActual = isOn("bypass");
  const bypassRequest = String(value("bypass_request") ?? value("bypass_control") ?? "off");
  // The damper takes about three minutes: say which way it runs, how far
  // along it is and how long is left. HA gets the controller's travel time on
  // each poll, so it is counted on between polls to run as smoothly as in the
  // WebUI; without it, the time since the damper code changed is the estimate.
  const bypassTravelDirection = value("bypass_travel_direction");
  const reportedTravel = num("bypass_travel_seconds");
  const bypassTravelSeconds = !bypassMoving ? reportedTravel
    : reportedTravel !== null ? reportedTravel + (secondsSince("bypass_travel_seconds") ?? 0)
    : secondsSince("bypass_raw");
  const bypassTravelTotal = num("bypass_travel_total");
  const bypassRun = bypassTravel({ raw: bypassRaw, requestOn: bypassRequest.toLowerCase() === "on", direction: bypassTravelDirection, seconds: bypassTravelSeconds, total: bypassTravelTotal });
  const bypassActualLabel = bypassRun
    ? [
        bypassRun.direction === "opening" ? "åbner" : bypassRun.direction === "closing" ? "lukker" : "bevæger sig",
        bypassRun.percent === null ? null : `${bypassRun.percent} %`,
        bypassRun.awaitingEnd ? "afventer endestilling" : null,
        bypassRun.remainingSeconds === null ? null : `${formatRemaining(bypassRun.remainingSeconds)} tilbage`,
      ].filter(Boolean).join(" · ")
    : bypassActual ? "åben" : "lukket";
  const heating = isOn("afterheat_active");
  // HAC1 never heats at 15 C outdoor or above; say so instead of just "Inaktiv".
  const afterheatLockout = isOn("afterheat_lockout");
  const afterheatCutoff = number(config.afterheat_outdoor_cutoff) ?? 15;
  const afterheatStatus = heating ? "Aktiv" : afterheatLockout ? "Spærret af sommerstop" : "Inaktiv";
  const fireplaceRemaining = num("fireplace_remaining");
  const fireplace = (fireplaceRemaining ?? 0) > 0 || isOn("fireplace_active");
  const fireplaceAuto = entity("fireplace_auto_signal");
  const fireplaceAutoEnabled = fireplaceAuto?.attributes?.automatik_aktiveret === true;
  const fireplaceAutoActive = fireplaceAuto?.attributes?.automatik_aktiv === true;
  const mode = String(value("mode_control") ?? "");
  const level = step ?? 3;
  // In the auto modes a level moves the controller's normal level; without one it sets the level select.
  const levelKey = mode === "manual" || !has("auto_normal") ? "level_control" : "auto_normal";
  const normalLevel = levelKey === "auto_normal";
  const chosenLevel = num(levelKey);
  const chosen = (key: string) => pendingChoice?.key === key ? pendingChoice.target : value(key);
  const bonfireRemaining = num("bonfire_remaining");
  const bonfire = (bonfireRemaining ?? 0) > 0 || (chosen("bonfire_control") ?? "Slukket") !== "Slukket";
  const standbyChoice = chosen("standby_control");
  const standbyActive = standbyChoice !== null && standbyChoice !== "Tændt" && standbyChoice !== "unavailable" && standbyChoice !== "unknown";
  const standbyRemaining = num("standby_remaining");
  const [standbyDialog, setStandbyDialog] = useState(false);
  const [coolDialog, setCoolDialog] = useState(false);
  const climate = entity("afterheat_climate");
  const afterheatSetpoint = number(climate?.attributes?.temperature) ?? 20;
  const afterheatEnabled = climate ? climate.state !== "off" : true;
  const actualAfterheat: AfterheatValue = afterheatEnabled ? afterheatSetpoint : "off";
  const selection = value("afterheat_selection");
  const selectionNumber = number(selection);
  const actualAfterheatSelection = selection?.toLowerCase() === "off"
    ? "OFF"
    : selectionNumber !== null
      ? `${whole(selectionNumber)} °C`
      : "Afventer";
  const busHealthy = isOn("rs485_healthy");
  const coolingState = value("cooling_state");
  // Without the switch entity the controller's cooling state still tells
  // whether the automation is enabled.
  const coolingEnabled = value("cooling_control") !== null ? isOn("cooling_control") : coolingState !== null && coolingState !== "disabled";
  const shownCoolingEnabled = pendingChoice?.key === "cooling_control" ? pendingChoice.target === "on" : coolingEnabled;
  const boostRemaining = num("boost_remaining") ?? 0;
  const quickBoostActive = boostRemaining > 0;
  // Køl (HCH5 Control 1.5.0+): bypass open, top step and afterheat held down for a while.
  const coolAvailable = has("cool_30");
  const coolRemaining = num("cool_remaining") ?? 0;
  const coolActive = coolRemaining > 0;
  // HA has no readback of which boost runs. A button's state is the time it
  // was last pressed, so the running boost is the one whose press time plus
  // its length matches the end the controller reports.
  const boostEnd = Date.parse(entity("boost_remaining")?.last_changed ?? "") + boostRemaining * 1000;
  const activeBoost = quickBoostActive
    ? BOOST_MINUTES.find(minutes => Math.abs(Date.parse(value(`boost_${minutes}`) ?? "") + minutes * 60000 - boostEnd) < 45000) ?? null
    : null;
  // Without the Pi controller there is no master to wait for.
  const online = (!has("active_master") || entity("active_master") !== undefined) && entity("outdoor_temperature") !== undefined;
  const alarm = alarmOf(value("diagnostics_status"), value("diagnostics_alarm_text"), has("diagnostics_alarm_text"));

  const recovery = useMemo(() => {
    if (bypassActual || outdoor === null || extract === null || exhaust === null || Math.abs(extract - outdoor) < .5) return null;
    const result = ((extract - exhaust) / (extract - outdoor)) * 100;
    return result >= 0 && result <= 105 ? Math.round(result) : null;
  }, [bypassActual, outdoor, extract, exhaust]);

  const [afterheatDraft, setAfterheatDraft] = useState<AfterheatValue | null>(null);
  // A confirmed value shown until HA reports it; not a draft needing confirmation.
  const [afterheatSent, setAfterheatSent] = useState<AfterheatValue | null>(null);
  const settleTimer = useRef<number | null>(null);
  const afterheatSeq = useRef(0);
  const committedAfterheat: AfterheatValue = afterheatSent ?? actualAfterheat;
  const shownAfterheat: AfterheatValue = afterheatDraft ?? committedAfterheat;

  const sendAfterheat = useCallback(async (target: AfterheatValue, seq: number) => {
    const saved = target === "off"
      ? await command("afterheat", "afterheat_climate", "climate", "set_hvac_mode", { hvac_mode: "off" }, "Eftervarmen er sat til OFF.")
      // A setpoint also switches the afterheat on again in the controller.
      : await command("afterheat", "afterheat_climate", "climate", "set_temperature", { temperature: target }, `Eftervarmen er sat til ${target} °C.`);
    if (afterheatSeq.current !== seq) return;
    if (!saved) { setAfterheatSent(null); return; }
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => { if (afterheatSeq.current === seq) setAfterheatSent(null); }, AFTERHEAT_SETTLE_MS);
  }, [command]);

  // The sent value is dropped as soon as HA shows it.
  useEffect(() => {
    if (afterheatSent !== null && busy !== "afterheat" && afterheatSent === actualAfterheat) setAfterheatSent(null);
  }, [afterheatSent, actualAfterheat, busy]);
  useEffect(() => () => { if (settleTimer.current !== null) window.clearTimeout(settleTimer.current); }, []);

  // +/-, the dial and the power button only move a draft; nothing is sent
  // before the user confirms, so a slip cannot change the afterheat.
  const setAfterheatTarget = (next: AfterheatValue) => setAfterheatDraft(next === committedAfterheat ? null : next);
  const confirmAfterheat = () => {
    if (afterheatDraft === null) return;
    const seq = ++afterheatSeq.current;
    setAfterheatSent(afterheatDraft);
    setAfterheatDraft(null);
    void sendAfterheat(afterheatDraft, seq);
  };

  // Manual sets the manual level; the auto modes move their normal level,
  // exactly like the WebUI's manual_level / local_normal_level.
  const setLevel = async (target: number) => {
    // A level switches the unit on again, as in the WebUI.
    if (standbyActive && !await command("standby-stop", "standby_control", "select", "select_option", { option: "Tændt" }, `Anlægget er tændt på trin ${target}.`, "Tændt")) return false;
    return setLevelOnly(target);
  };
  const setLevelOnly = (target: number) => !normalLevel
    ? command(`level-${target}`, "level_control", "select", "select_option", { option: String(target) }, `Ventilation sat til trin ${target}.`, String(target))
    : command(`level-${target}`, "auto_normal", "number", "set_value", { value: target }, `Ventilation sat til trin ${target}.`, String(target));
  const setBypass = (option: "off" | "on", success: string) => command(`bypass-${option === "on" ? "on" : "auto"}`, "bypass_control", ...bypassService(ids.bypass_control, option), success, option);

  // Mode, fan level and the other controls. On a phone they are shown inside the unit card,
  // straight under the animated drawing and above Frost; elsewhere in their own column.
  // Each function is only shown when its entities are there; a card left alone in a pair
  // takes the whole row.
  const modes = modeOptions(hass, ids.mode_control);
  const boosts = BOOST_MINUTES.filter(minutes => has(`boost_${minutes}`));
  const showDecision = standbyActive || has("effective_source", "effective_reason");
  const fireplaceNote = fireplaceAutoActive ? `${remaining(fireplaceRemaining)} · automatisk` : fireplaceAutoEnabled ? "Autopejs klar"
    : fireplace ? (has("fireplace_remaining") ? remaining(fireplaceRemaining) : null) : has("fireplace_control") ? "15 eller 30 min" : null;
  const controlCard = (has("mode_control", "level_control", "auto_normal") || showDecision) &&
          <article className="surface pro-control-card">
            <div className="pro-card-head compact"><div><h2>Drift og styring</h2><p>Daglige funktioner</p></div><Gauge size={22}/></div>
            {has("mode_control") && <>
            <label className="control-label">Ventilationstilstand</label>
            <div className={`pro-segment ${modes.length === 3 ? "three" : "many"}`}>
              {modes.map(option => (
                <button key={option} className={chosen("mode_control") === option ? "active" : ""} aria-pressed={chosen("mode_control") === option} disabled={busy !== null} onClick={() => void command(`mode-${option}`, "mode_control", "select", "select_option", { option }, `${modeLabel(option)} valgt.`, option)}>{modeLabel(option)}</button>
              ))}
            </div>
            </>}
            {has("level_control", "auto_normal") && <>
            <label className="control-label">Ventilatorniveau</label>
            <div className={`pro-levels${has("standby_control") ? " with-off" : ""}`} style={{ "--levels": fanLevels(hass, ids.level_control).length } as CSSProperties}>
              {fanLevels(hass, ids.level_control).map(target => {
                // Filled: the level the unit runs at now (or a click awaiting the
                // controller). In Local/Smart Auto a dashed outline marks the normal
                // level a click changes, which the controller may raise for air quality.
                const shown = standbyActive ? null : pendingChoice?.key === levelKey ? Number(pendingChoice.target) : level;
                const normal = normalLevel && Number(chosen("auto_normal") ?? chosenLevel) === target && shown !== target;
                return <button key={target} className={shown === target ? "active" : normal ? "is-normal" : ""} aria-pressed={shown === target} title={normal ? "Normaltrin" : undefined} disabled={busy !== null} onClick={() => void setLevel(target)}>{target}</button>;
              })}
              {has("standby_control") && <button className={`level-off${standbyActive ? " active" : ""}`} aria-haspopup="dialog" aria-pressed={standbyActive} disabled={busy !== null} onClick={() => setStandbyDialog(true)}>OFF</button>}
            </div>
            </>}
            {showDecision && <div className="active-decision"><span>Aktiv beslutning</span><strong>{standbyActive ? "OFF · anlæg slukket" : <>Trin {whole(level)} · {text(value("effective_source")).replaceAll("_", " ")}</>}</strong><small>{text(value("effective_reason"), "Afventer controllerens beslutning")}</small></div>}
          </article>;

  const boostCard = boosts.length > 0 &&
            <article className="surface mini-control">
              <div className="mini-control-title"><Wind size={20}/><strong>Hurtig boost</strong></div>
              <div className={`mini-buttons ${boosts.length === 3 ? "three" : boosts.length === 2 ? "two" : "one"}`}>
                {boosts.map(minutes => <button key={minutes} className={activeBoost === minutes || busy === `boost-${minutes}` ? "active" : ""} aria-pressed={activeBoost === minutes} disabled={busy !== null || fireplace} onClick={() => void command(`boost-${minutes}`, `boost_${minutes}`, "button", "press", {}, `Quick Boost ${minutes} min startet.`)}>{minutes} min</button>)}
              </div>
              {quickBoostActive && (has("boost_stop")
                ? <button className="text-action" onClick={() => void command("boost-stop", "boost_stop", "button", "press", {}, "Quick Boost stoppet.")}>{remaining(boostRemaining)} · stop</button>
                : <small className="control-footnote">{remaining(boostRemaining)}</small>)}
            </article>;

  const bypassCard = has("bypass_control") &&
            <article className="surface mini-control">
              <div className="mini-control-title"><ArrowRight size={20}/><strong>Bypass-styring</strong></div>
              <div className="mini-buttons two">
                <button className={chosen("bypass_control") === "off" ? "active" : ""} aria-pressed={chosen("bypass_control") === "off"} disabled={busy !== null || bypassMoving} onClick={() => void setBypass("off", "Bypass sat til Auto.")}>Auto</button>
                <button className={chosen("bypass_control") === "on" ? "active" : ""} aria-pressed={chosen("bypass_control") === "on"} disabled={busy !== null || fireplace || bypassMoving} onClick={() => void setBypass("on", "Bypass ønskes åben.")}>On</button>
              </div>
              {parts.bypass && <small className="control-footnote">Faktisk: {bypassActualLabel}</small>}
            </article>;

  const bonfireCard = has("bonfire_control") &&
            <article className={`surface status-action-card bonfire-card${bonfire ? " active" : ""}`}>
              <div className="status-action-icon smoke"><CloudFog size={24}/></div>
              <div><span>Bål i haven</span><strong>{bonfire ? "Aktiv · anlæg slukket" : "Ikke aktiv"}</strong><small>{bonfire ? `${remaining(bonfireRemaining)} · stopper selv` : fireplace ? "Ikke under pejsefunktion" : standbyActive ? "Ikke mens anlægget er slukket" : "Slukker anlægget, tænder selv igen"}</small></div>
              <div className="fireplace-actions bonfire-actions">
                {bonfire
                  ? <button disabled={busy !== null} onClick={() => void command("bonfire-stop", "bonfire_control", "select", "select_option", { option: "Slukket" }, "Bål-tilstand stoppet.", "Slukket")}>Stop</button>
                  : BONFIRE_CHOICES.map(([option, label]) => <button key={option} disabled={busy !== null || fireplace || standbyActive} onClick={() => void command(`bonfire-${option}`, "bonfire_control", "select", "select_option", { option }, `Bål-tilstand startet i ${label}.`, option)}>{label}</button>)}
              </div>
            </article>;

  // Without the select the fireplace card only tells whether the unit runs it.
  const fireplaceCard = has("fireplace_control", "fireplace_active", "fireplace_remaining", "fireplace_auto_signal") &&
            <article className="surface status-action-card">
              <div className={`status-action-icon flame${fireplaceAutoActive ? " auto-active" : ""}`} aria-label={fireplaceAutoActive ? "Autopejs aktiv" : undefined}><Flame size={24}/></div>
              <div><span>Pejsefunktion</span><strong>{fireplaceAutoActive ? "Autopejs aktiv" : fireplace ? "Aktiv" : "Ikke aktiv"}</strong>{fireplaceNote !== null && <small>{fireplaceNote}</small>}</div>
              {has("fireplace_control") && <div className="fireplace-actions">
                {fireplace
                  ? <button disabled={busy !== null} onClick={() => void command("fireplace-stop", "fireplace_control", "select", "select_option", { option: "Slukket" }, "Pejsefunktion stoppet.", "Slukket")}>Stop</button>
                  : <><button className={chosen("fireplace_control") === "15 min" ? "active" : ""} aria-pressed={chosen("fireplace_control") === "15 min"} disabled={busy !== null} onClick={() => void command("fireplace-15", "fireplace_control", "select", "select_option", { option: "15 min" }, "Pejsefunktion startet i 15 min.", "15 min")}>15</button><button className={chosen("fireplace_control") === "30 min" ? "active" : ""} aria-pressed={chosen("fireplace_control") === "30 min"} disabled={busy !== null} onClick={() => void command("fireplace-30", "fireplace_control", "select", "select_option", { option: "30 min" }, "Pejsefunktion startet i 30 min.", "30 min")}>30</button></>}
              </div>}
            </article>;

  const coolingAutomation = has("cooling_state", "cooling_control");
  const coolingCard = (coolingAutomation || has("cool_30", "cool_60", "cool_120")) &&
          <article className={`surface status-action-card cooling-card${coolActive || shownCoolingEnabled ? " active" : ""}`}>
            <div className="status-action-icon"><Snowflake size={24}/></div>
            <div><span>Frikøling</span><strong>{coolActive ? "Køl aktiv" : has("cooling_state") ? coolingLabel(coolingState) : "Ikke aktiv"}</strong><small>{coolActive ? `${remaining(coolRemaining)} · bypass åben og boost` : !coolingAutomation ? "Bypass åben og boost" : shownCoolingEnabled ? "Automatik aktiv" : "Automatik slået fra"}</small></div>
            <div className="fireplace-actions cooling-actions">
              {coolAvailable && <button className={coolActive ? "active" : ""} aria-haspopup="dialog" disabled={busy !== null || fireplace || standbyActive} title={fireplace ? "Ikke under pejsefunktion" : "Åbn bypass og kør boost i en periode"} onClick={() => setCoolDialog(true)}>Køl</button>}
              {coolAvailable && coolActive && has("cool_stop") && <button className="stop" disabled={busy !== null} onClick={() => void command("cool-stop", "cool_stop", "button", "press", {}, "Køl stoppet.")}>Stop</button>}
              {has("cooling_control") && <button className={shownCoolingEnabled ? "active" : ""} aria-pressed={shownCoolingEnabled} disabled={busy !== null} onClick={() => !shownCoolingEnabled && void command("cooling", "cooling_control", "switch", "turn_on", {}, "Frikøling aktiveret.", "on")}>Til</button>}
              {has("cooling_control") && <button className={!shownCoolingEnabled ? "active" : ""} aria-pressed={!shownCoolingEnabled} disabled={busy !== null} onClick={() => shownCoolingEnabled && void command("cooling", "cooling_control", "switch", "turn_off", {}, "Frikøling deaktiveret.", "off")}>Fra</button>}
            </div>
          </article>;

  const controlColumn = <>
          {controlCard}
          {(boostCard || bypassCard) && <div className="pro-control-pair">{boostCard}{bypassCard}</div>}
          {(bonfireCard || fireplaceCard) && <div className="pro-control-pair">{bonfireCard}{fireplaceCard}</div>}
          {coolingCard}
  </>;

  const openTile = (e: { target: EventTarget }) => { const key = (e.target as Element).closest("[data-sensor]")?.getAttribute("data-sensor"); if (key) showHistory(key); };
  const climateMetrics = [
    has("co2") && <div key="co2" className="climate-metric green" data-sensor="co2"><Leaf size={21}/><span>CO₂</span><strong>{whole(co2)} <small>ppm</small></strong><em>{co2 === null ? "Ukendt" : co2 < 800 ? "God" : co2 < 1200 ? "Moderat" : "Høj"}</em><i style={{ width: `${co2 === null ? 0 : Math.min(100, Math.max(5, co2 / 16))}%` }}/></div>,
    has("humidity") && <div key="humidity" className="climate-metric blue" data-sensor="humidity"><span className="metric-drop">●</span><span>Luftfugtighed</span><strong>{whole(humidity)} <small>%</small></strong><em>{humidity === null ? "Ukendt" : humidity < 60 ? "Normal" : "Høj"}</em><i style={{ width: `${humidity ?? 0}%` }}/></div>,
    has("filter_life") && <div key="filter" className="climate-metric cyan" data-sensor="filter_life"><span className="metric-filter">▧</span><span>Filter</span><strong>{whole(filterLife)} <small>%</small></strong><em>{filterLife === null ? "Ukendt" : filterLife > 40 ? "OK" : filterLife > 15 ? "Snart skift" : "Skift filter"}</em><i style={{ width: `${Math.max(0, Math.min(100, filterLife ?? 0))}%` }}/></div>,
    has("afterheat_climate") && <div key="afterheat" className="climate-metric neutral" data-sensor="afterheat_selection"><span className="metric-heat">≋</span><span>Eftervarme setpunkt</span><strong>{shownAfterheat === "off" ? "OFF" : temp(shownAfterheat)}</strong><em>{afterheatStatus}</em><i style={{ width: `${shownAfterheat === "off" ? 0 : ((shownAfterheat - 10) / 25) * 100}%` }}/></div>,
  ].filter(Boolean);
  // Cost lines need the matching price entity.
  const diagnoseMetrics = [
    has("frost_state") && <div key="frost" className="climate-metric cyan" data-sensor="frost_state"><Snowflake size={21}/><span>Frost i veksler</span><strong>{({ ok: "OK", watch: "Hold øje", risk: "Risiko" } as Record<string, string>)[String(value("frost_state"))] ?? "—"}</strong><em>Afkast T4 {temp(num("exhaust_temperature"))}</em><i style={{ width: value("frost_state") === "risk" ? "100%" : value("frost_state") === "watch" ? "50%" : "5%" }}/></div>,
    has("filter_power", "sfp") && <div key="filter-power" className="climate-metric neutral" data-sensor="filter_power"><Gauge size={21}/><span>Filter · strøm</span><strong>{num("filter_power") === null ? "—" : `${Math.round((num("filter_power")! - 1) * 100)} %`}</strong><em>{num("sfp") === null ? "Lærer rent filter" : `SFP ${whole(num("sfp"))} W/(m³/s)`}</em><i style={{ width: `${Math.min(100, Math.max(0, ((num("filter_power") ?? 1) - 1) * 400))}%` }}/></div>,
    has("recovered_today") && <div key="recovered" className="climate-metric green" data-sensor="recovered_today"><Leaf size={21}/><span>Genvundet i dag · anslået</span><strong>{kwh(num("recovered_today"))} <small>kWh</small></strong>{has("heat_price") && <em>Teoretisk varmeværdi ca. {cost(num("recovered_today"), num("heat_price"))}</em>}<i style={{ width: `${Math.min(100, (num("recovered_today") ?? 0) * 5)}%` }}/></div>,
    has("unit_energy_today", "measured_energy_today") && <div key="energy" className="climate-metric neutral" data-sensor={has("measured_energy_today") && !has("unit_energy_today") ? "measured_energy_today" : "unit_energy_today"}><Zap size={21}/><span>Strøm i dag{num("measured_energy_today") !== null ? " · målt" : " · anslået"}</span><strong>{kwh(num("measured_energy_today") ?? num("unit_energy_today"))} <small>kWh</small></strong>{has("electricity_price") && <em>Ca. {cost(num("measured_energy_today") ?? num("unit_energy_today"), num("electricity_price"))} ved aktuel elpris</em>}<i style={{ width: `${Math.min(100, (num("measured_energy_today") ?? num("unit_energy_today") ?? 0) * 50)}%` }}/></div>,
    has("afterheat_today") && <div key="afterheat-today" className="climate-metric neutral" data-sensor="afterheat_today"><Flame size={21}/><span>Eftervarme i dag · anslået</span><strong>{kwh(num("afterheat_today"))} <small>kWh</small></strong>{has("heat_price") && <em>Ca. {cost(num("afterheat_today"), num("heat_price"))} ved aktuel varmepris</em>}<i style={{ width: `${Math.min(100, (num("afterheat_today") ?? 0) * 50)}%` }}/></div>,
  ].filter(Boolean);
  const showClimate = climateMetrics.length > 0 || diagnoseMetrics.length > 0;
  // Values the Pi computes from a measured T2 before the afterheat coil, as in the WebUI.
  const t2Metrics = [
    has("supply_recovery") && <div key="supply-recovery" className="climate-metric green" data-sensor="supply_recovery"><Leaf size={21}/><span>Genvinding · indblæsning</span><strong>{whole(num("supply_recovery"))} <small>%</small></strong><em>(T2 − T1) / (T3 − T1)</em><i style={{ width: `${Math.max(0, Math.min(100, num("supply_recovery") ?? 0))}%` }}/></div>,
    has("recovered_heat") && <div key="recovered-heat" className="climate-metric cyan" data-sensor="recovered_heat"><Wind size={21}/><span>Genvundet varme</span><strong>{whole(num("recovered_heat"))} <small>W</small></strong><em>Veksler → indblæsning</em><i style={{ width: `${Math.min(100, (num("recovered_heat") ?? 0) / 30)}%` }}/></div>,
    has("afterheat_lift") && <div key="lift" className="climate-metric neutral" data-sensor="afterheat_lift"><span className="metric-heat">≋</span><span>Eftervarme løft</span><strong>{temp(num("afterheat_lift"))}</strong><em>T2AH − T2</em><i style={{ width: `${Math.max(0, Math.min(100, (num("afterheat_lift") ?? 0) * 10))}%` }}/></div>,
    has("afterheat_power") && <div key="afterheat-power" className="climate-metric neutral" data-sensor="afterheat_power"><Flame size={21}/><span>Eftervarme effekt</span><strong>{whole(num("afterheat_power"))} <small>W</small></strong><em>Varme tilført luften</em><i style={{ width: `${Math.min(100, (num("afterheat_power") ?? 0) / 20)}%` }}/></div>,
  ].filter(Boolean);
  const showT2 = (num("supply_recovery") !== null || num("afterheat_lift") !== null) && t2Metrics.length > 0;
  // The thermostat is the afterheat control; without its climate entity there is nothing to set.
  const showThermostat = has("afterheat_climate");
  const showAfterheatCard = showThermostat || showT2;

  return (
    <section className="dashboard-overview">
      <header className="overview-heading-row">
        <div>
          <span className="eyebrow">OVERBLIK</span>
          <h1>Aktuel drift og status</h1>
          <p>{`Live visning af ${unit.full ?? "anlægget"}, luftveje, sensorer og den styring der er aktiv lige nu.`}</p>
        </div>
        <div className="overview-status-pills">
          {has("active_master") && <div><span className="status-led"/><small>Master</small><strong>{masterLabel(value("active_master"))}</strong></div>}
          {has("rs485_healthy") && <div><span className={`status-led ${busHealthy ? "" : "warn"}`}/><small>Bus</small><strong>{busHealthy ? "Sund" : "Afventer"}</strong></div>}
          {has("mode_control") && <div><Leaf size={18}/><small>Driftstilstand</small><strong>{modeLabel(value("mode_control"))}</strong></div>}
          {has("power") && <div className="power-pill" role="button" tabIndex={0} onClick={() => showHistory("power")} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); showHistory("power"); } }}><Zap size={18}/><small>Forbrug</small><strong>{watts(num("power"))}</strong></div>}
          {has("attic_temperature") && <div className="power-pill" role="button" tabIndex={0} onClick={() => showHistory("attic_temperature")} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); showHistory("attic_temperature"); } }}><Roof size={18}/><small>Loftrum</small><strong>{temp(num("attic_temperature"))}</strong></div>}
          {has("outdoor_air_quality") && <div className="power-pill" role="button" tabIndex={0} onClick={() => showHistory("outdoor_air_quality")} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); showHistory("outdoor_air_quality"); } }} title={num("outdoor_pm25") === null ? "Google Air Quality · udendørs modeldata" : `Google Air Quality · PM2.5 ${num("outdoor_pm25")!.toLocaleString("da-DK")} µg/m³`}><Leaf size={18}/><small>Udeluft · Google</small><strong>{outdoorAirLabel(value("outdoor_air_quality"))}</strong></div>}
        </div>
      </header>

      {alarm.active && alarm.text && <div className={`diagnostics-alarm ${value("diagnostics_status")}`} role="alert" data-sensor={has("diagnostics_alarm_text") ? "diagnostics_alarm_text" : "diagnostics_status"} onClick={() => showHistory(has("diagnostics_alarm_text") ? "diagnostics_alarm_text" : "diagnostics_status")}><strong>{value("diagnostics_status") === "critical" ? "Fejl" : value("diagnostics_status") === "warning" ? "Advarsel" : "Bemærk"}</strong><span>{alarm.text}</span></div>}

      <div className={`dashboard-main-grid${showClimate ? "" : " without-climate"}${showAfterheatCard ? "" : " without-afterheat"}`}>
        <article className="surface pro-air-card">
          <div className="pro-card-head">
            <div><h2>Luftstrømme og temperaturer</h2><p>{`Live luftveje gennem ${unit.full ?? "anlægget"} med aktuelle temperaturer og fysisk status.`}</p></div>
            <span className={`status-chip${online ? "" : " muted"}`}><span className="live-dot"/>{online ? "Live" : "Afventer"}</span>
          </div>
          <Hch5UnitDiagram
            onSensor={showHistory} outdoor={outdoor} extract={extract} exhaust={exhaust} beforeHeater={beforeHeater} afterHeater={afterHeater}
            room={room} frost={frost} flowWater={flowWater} returnWater={returnWater}
            supplyRpm={supplyRpm} extractRpm={extractRpm} supplyPercent={supplyPercent} extractPercent={extractPercent} fanLevel={step}
            bypassActual={bypassActual} bypassRequest={bypassRequest} heating={heating} recovery={recovery}
            busActive={busHealthy} bypassRaw={bypassRaw} afterheatLockout={afterheatLockout} afterheatCoil={config.afterheat_coil === "water" ? "water" : "electric"}
            bypassTravelDirection={bypassTravelDirection} bypassTravelSeconds={bypassTravelSeconds} bypassTravelTotal={bypassTravelTotal}
            inlineControls={controlColumn} parts={parts} supplySensor={supplySensor} bypassSensor={bypassSensor} unitName={unit.full} unitLabel={unit.short}
            control={!online || value("effective_source") === null ? null : describeControl({ active_master: value("active_master"), effective_source: value("effective_source"), effective_level: step, effective_reason: value("effective_reason"), fireplace })}
          />
        </article>

        <aside className="pro-control-column">{controlColumn}</aside>

        {showClimate && <article className="surface climate-panel">
          {climateMetrics.length > 0 && <>
            <div className="pro-card-head compact"><div><h2>Indeklimadata</h2><p>Aktuelle værdier</p></div></div>
            <div className={`climate-metrics${metricsClass(climateMetrics.length)}`} onClick={openTile}>{climateMetrics}</div>
          </>}
          {diagnoseMetrics.length > 0 && <>
            <div className={`pro-card-head compact${climateMetrics.length > 0 ? " air-calc-head" : ""}`}><div><h2>Diagnose og energi i dag</h2><p>{!has("diagnostics_status") ? "Aktuelle værdier" : !alarm.active ? "Ingen advarsler" : text(alarm.text)}</p></div></div>
            <div className={`climate-metrics${metricsClass(diagnoseMetrics.length)}`} onClick={openTile}>{diagnoseMetrics}</div>
          </>}
        </article>}

        {showAfterheatCard && <article className="surface afterheat-setpoint-card">
          {showThermostat && <AfterheatThermostat value={shownAfterheat} onChange={setAfterheatTarget} heating={heating} lockout={afterheatLockout}
            cutoff={afterheatCutoff} outdoor={outdoor} airBefore={beforeHeater} airAfter={afterHeater}
            registered={actualAfterheatSelection} lastOn={afterheatSetpoint}
            current={committedAfterheat} onConfirm={confirmAfterheat} onCancel={() => setAfterheatDraft(null)} busy={busy !== null}
            showBefore={has("afterheat_before")} showRegistered={has("afterheat_selection")}/>}
          {showT2 ? <>
            <div className="pro-card-head compact air-calc-head"><div><h2>Beregnet fra målt T2</h2><p>Luftmængde anslået for aktuelt trin{num("supply_airflow") === null ? "" : ` · ${whole(num("supply_airflow"))} m³/h`}</p></div></div>
            <div className={`climate-metrics ${t2Metrics.length === 1 ? "metrics-1" : "metrics-2"}`} onClick={openTile}>{t2Metrics}</div>
          </> : null}
        </article>}
      </div>
      {standbyDialog && <div className="standby-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setStandbyDialog(false); }}>
        <section className="standby-dialog surface" role="dialog" aria-modal="true" aria-label={standbyActive ? "Anlægget er slukket" : "Sluk anlægget"}>
          <div className="standby-dialog-heading"><div><span className="eyebrow">VENTILATION</span><h2>{standbyActive ? "Anlægget er slukket" : "Sluk anlægget"}</h2></div><button type="button" aria-label="Luk" onClick={() => setStandbyDialog(false)}>×</button></div>
          <p className="standby-dialog-lead">{standbyActive
            ? (standbyRemaining === null ? "Begge ventilatorer står stille, til du tænder igen." : `Begge ventilatorer står stille · ${remaining(standbyRemaining)}.`)
            : "Begge ventilatorer stopper. Pejs, bål og boost kan ikke startes, mens anlægget er slukket."}</p>
          <div className="standby-choices">
            {STANDBY_CHOICES.map(([option, label, hint]) => <button key={option} type="button" className={standbyChoice === option ? "active" : ""} disabled={busy !== null} onClick={() => { setStandbyDialog(false); void command(`standby-${option}`, "standby_control", "select", "select_option", { option }, option === "Permanent" ? "Anlægget er slukket, til du tænder igen." : option === "Til i morgen kl. 07" ? "Anlægget er slukket til i morgen kl. 07:00." : `Anlægget er slukket i ${label}.`, option); }}><strong>{label}</strong><small>{hint}</small></button>)}
          </div>
          {standbyActive && <button type="button" className="standby-on-action" disabled={busy !== null} onClick={() => { setStandbyDialog(false); void command("standby-stop", "standby_control", "select", "select_option", { option: "Tændt" }, "Anlægget er tændt igen.", "Tændt"); }}>Tænd anlægget igen</button>}
        </section>
      </div>}
      {coolDialog && <div className="standby-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setCoolDialog(false); }}>
        <section className="standby-dialog surface" role="dialog" aria-modal="true" aria-label={coolActive ? "Køl kører" : "Køl huset"}>
          <div className="standby-dialog-heading"><div><span className="eyebrow">FRIKØLING</span><h2>{coolActive ? "Køl kører" : "Køl huset"}</h2></div><button type="button" aria-label="Luk" onClick={() => setCoolDialog(false)}>×</button></div>
          <p className="standby-dialog-lead">{coolActive
            ? `Bypass er åben og anlægget kører boost · ${remaining(coolRemaining)}. Derefter går det tilbage til normal drift.`
            : `Bypass åbnes, anlægget kører boost, og eftervarmen holdes nede. Bagefter går det selv tilbage til normal drift.${outdoor === null ? "" : ` Udeluft lige nu ${temp(outdoor)}.`}`}</p>
          <div className="standby-choices">
            {COOL_CHOICES.map(([key, label]) => <button key={key} type="button" disabled={busy !== null || !has(key)} onClick={() => { setCoolDialog(false); void command(key, key, "button", "press", {}, `Køl startet i ${label}.`); }}><strong>{label}</strong><small>Bypass åben og boost</small></button>)}
          </div>
          {coolActive && <button type="button" className="standby-on-action" disabled={busy !== null} onClick={() => { setCoolDialog(false); void command("cool-stop", "cool_stop", "button", "press", {}, "Køl stoppet."); }}>Stop køl</button>}
        </section>
      </div>}
      {notice && <div className={`hch-notice${notice.error ? " error" : ""}`} role="status">{notice.text}</div>}
    </section>
  );
}

class DanthermLiveCard extends HTMLElement {
  private config: Config | null = null;
  private hassValue: Hass | null = null;
  private root: Root | null = null;
  private signature = "";

  static getStubConfig() { return { entities: {} }; }

  setConfig(config: Config) {
    if (!config || typeof config.entities !== "object" || config.entities === null) throw new Error("Dantherm-kortet kræver en entities-konfiguration.");
    this.toggleAttribute("embedded", config.embedded === true && config.variant !== "smartdash");
    this.config = config;
    this.signature = "";
    this.renderCard();
  }

  set hass(hass: Hass) {
    this.hassValue = hass;
    // The drawing has a light palette; follow HA's light/dark mode before the
    // entity signature check so a theme switch shows at once.
    this.toggleAttribute("light", (hass as { themes?: { darkMode?: boolean } }).themes?.darkMode === false);
    if (!this.config) return;
    // HA sets hass on every state change in the house; only re-render when
    // one of this card's own entities changed.
    const signature = Object.entries(this.config.entities).map(([key, id]) => {
      const state = hass.states[id];
      return state ? `${state.state}|${state.last_changed}|${String(state.attributes?.temperature ?? "")}${key === "fireplace_auto_signal" ? `|${String(state.attributes?.automatik_aktiveret)}|${String(state.attributes?.automatik_aktiv)}` : ""}` : "-";
    }).join(";") + `;${unitNames(hass, this.config).full ?? ""}`;
    if (signature === this.signature) return;
    this.signature = signature;
    this.renderCard();
  }

  connectedCallback() {
    if (!this.root) {
      const shadow = this.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = css;
      const card = document.createElement("ha-card");
      card.className = "hch-card";
      shadow.append(style, card);
      this.root = createRoot(card);
    }
    this.renderCard();
  }

  // The React tree is kept while HA hides the tab, so the animations and a
  // pending afterheat change survive switching between Temperatur/Luft/Fjernvarme.
  getCardSize() { return 14; }

  private renderCard() {
    if (this.root && this.hassValue && this.config) this.root.render(this.config.variant === "smartdash" ? <SmartdashCompact hass={this.hassValue} config={this.config}/> : <Overview hass={this.hassValue} config={this.config} host={this}/>);
  }
}

// "ha-dantherm-live-card" is the card's name; "ha-hch5-live-card" stays as an alias so existing dashboards keep
// working. A custom element class can only be defined once, so the alias is a subclass.
class Hch5LiveCardAlias extends DanthermLiveCard {}
if (!customElements.get("ha-dantherm-live-card")) customElements.define("ha-dantherm-live-card", DanthermLiveCard);
if (!customElements.get("ha-hch5-live-card")) customElements.define("ha-hch5-live-card", Hch5LiveCardAlias);
// Only the new name in the card picker; the alias renders the same card.
window.customCards = window.customCards || [];
if (!window.customCards.some(card => card.type === "ha-dantherm-live-card")) {
  window.customCards.push({ type: "ha-dantherm-live-card", name: "Dantherm Live Card", description: "Animeret Dantherm-ventilationsanlæg med live målinger og HA-betjening: HCH5 MK1 via HAC1/Pi og MKII/RCV/HCV over Modbus", preview: false });
}

declare global { interface Window { customCards: Array<Record<string, unknown>> } }
