import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Hch5UnitDiagram } from "./Hch5UnitDiagram";
import { describeControl } from "./control";
import { bypassTravel, formatRemaining } from "./bypass";
import { ArrowRight, Flame, Gauge, Leaf, Roof, Snowflake, Wind, Zap } from "./icons";
import css from "./webui.css";

// The HCH5 Control WebUI overview (frontend-v2 OverviewPage) as a Home
// Assistant card. The Pi stays source of truth: every button calls the
// hch_passivelink entity that sends the same controller command as the WebUI.

type HAState = { state: string; attributes: Record<string, unknown>; last_changed: string };
type Hass = {
  states: Record<string, HAState | undefined>;
  callService: (domain: string, service: string, data: Record<string, unknown>) => Promise<unknown>;
};
// afterheat_coil: how the afterheater is drawn, "electric" (default) or "water".
type Config = { entities: Record<string, string>; afterheat_outdoor_cutoff?: number; afterheat_coil?: "electric" | "water"; variant?: "smartdash"; embedded?: boolean };
type AfterheatValue = number | "off";
type Notice = { text: string; error: boolean };

// Same pause as the WebUI: +/- only move a local draft, and one command is
// sent once the user has stopped pressing.
const AFTERHEAT_SEND_DELAY_MS = 1200;
// HA reports the new setpoint a moment after the service call returns; the
// draft stays shown until then so the value does not jump back and forth.
const AFTERHEAT_SETTLE_MS = 5000;
const BOOST_MINUTES = [15, 30, 60] as const;

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
function modeLabel(value: unknown) {
  return ({ local_auto: "Local Auto", smart_auto: "Smart Auto", manual: "Manuel" } as Record<string, string>)[String(value)] ?? text(value);
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

function SmartdashCompact({ hass, config }: { hass: Hass; config: Config }) {
  const ids = config.entities;
  const read = (key: string) => {
    const item = hass.states[ids[key]];
    return item && !["unknown", "unavailable"].includes(item.state) ? item : undefined;
  };
  const value = (key: string) => read(key)?.state ?? null;
  const num = (key: string) => number(value(key));
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
  const bypassLabel = travel ? `${travel.direction === "opening" ? "Åbner" : travel.direction === "closing" ? "Lukker" : "Bevæger sig"}${travel.percent === null ? "" : ` ${travel.percent}%`}` : bypassRaw === 255 || value("bypass") === "on" ? "Åben" : bypassRaw === 0 ? "Lukket" : "—";
  const chosenLevel = num(mode === "manual" ? "level_control" : "auto_normal");
  const levelKey = mode === "manual" ? "level_control" : "auto_normal";
  const boostRemaining = num("boost_remaining") ?? 0;
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
    <div className="hch-smartdash-head"><strong>HCH5 <span>· {modeLabel(selected("mode_control"))}</span></strong><span className="hch-smartdash-state">{config.entities.attic_temperature && <span className="hch-smartdash-attic">Loft {temp(num("attic_temperature"))} · </span>}{config.entities.power && <span className="hch-smartdash-power">{watts(num("power"))} · </span>}{value("active_master") === "pi" ? "● Live" : "● " + masterLabel(value("active_master"))}</span></div>
        {(num("supply_recovery") !== null || num("afterheat_power") !== null) && <div className="hch-smartdash-calc">{num("supply_recovery") !== null && <span>Genv. ind <b>{whole(num("supply_recovery"))}%</b></span>}{num("recovered_heat") !== null && <span>Genvundet <b>{whole(num("recovered_heat"))} W</b></span>}{num("afterheat_power") !== null && <span>Eftervarme <b>{whole(num("afterheat_power"))} W</b></span>}</div>}
    <div className="hch-smartdash-body">
      <div className="hch-smartdash-art"><Hch5UnitDiagram outdoor={outdoor} extract={extract} exhaust={exhaust} beforeHeater={num("afterheat_before") ?? num("supply_temperature")} afterHeater={supply} room={num("room_temperature")} frost={num("afterheat_frost")} flowWater={num("water_flow")} returnWater={num("water_return")} supplyRpm={num("supply_fan_rpm")} extractRpm={num("extract_fan_rpm")} supplyPercent={num("supply_fan_percent")} extractPercent={num("extract_fan_percent")} fanLevel={num("effective_level")} bypassActual={bypassRaw === 255 || value("bypass") === "on"} bypassRequest={bypassRequest} heating={value("afterheat_active") === "on"} recovery={recovery} busActive={value("rs485_healthy") === "on"} bypassRaw={bypassRaw} bypassTravelDirection={value("bypass_travel_direction")} bypassTravelSeconds={travelSeconds} bypassTravelTotal={num("bypass_travel_total")} afterheatLockout={value("afterheat_lockout") === "on"} afterheatCoil={config.afterheat_coil === "water" ? "water" : "electric"} control={value("effective_source") === null ? null : describeControl({ active_master: value("active_master"), effective_source: value("effective_source"), effective_level: num("effective_level"), effective_reason: value("effective_reason"), fireplace: fireplaceActive })} controlCompact/></div>
      <div className="hch-smartdash-controls" onClick={event => event.stopPropagation()}>
        <div className="hch-smartdash-readings"><span>Ude <b>{temp(outdoor)}</b></span><span>Ind <b>{temp(supply)}</b></span><span>Gen. <b>{recovery === null ? "—" : `${recovery}%`}</b></span><span>Bypass <b>{bypassLabel}</b></span></div>
        <div className="hch-smartdash-control-row hch-smartdash-mode"><div className="hch-smartdash-control-label"><span>Driftstilstand</span><em>{modeLabel(selected("mode_control"))}</em></div><div className="hch-smartdash-choice">{(["local_auto", "smart_auto", "manual"] as const).map(option => <button key={option} type="button" aria-pressed={selected("mode_control") === option} disabled={busy} onClick={() => void command("mode_control", "select", "select_option", { option }, option)}>{option === "local_auto" ? "Auto" : option === "smart_auto" ? "Smart" : "Manuel"}</button>)}</div></div>
        <div className="hch-smartdash-control-row hch-smartdash-level"><div className="hch-smartdash-control-label"><span>Ventilatorniveau</span><em>Aktuelt trin {num("effective_level") ?? "—"}</em></div><div className="hch-smartdash-choice">{[1,2,3,4,5,6].map(level => <button key={level} type="button" aria-pressed={(pending?.key === levelKey ? Number(pending.value) : num("effective_level")) === level} className={mode !== "manual" && Number(selected(levelKey) ?? chosenLevel) === level && (pending?.key === levelKey ? Number(pending.value) : num("effective_level")) !== level ? "is-normal" : undefined} title={mode !== "manual" && Number(selected(levelKey) ?? chosenLevel) === level ? "Normaltrin" : undefined} disabled={busy} onClick={() => void command(levelKey, mode === "manual" ? "select" : "number", mode === "manual" ? "select_option" : "set_value", mode === "manual" ? { option: String(level) } : { value: level }, String(level))}>{level}</button>)}</div></div>
        <div className="hch-smartdash-control-row hch-smartdash-bypass"><div className="hch-smartdash-control-label"><span>Bypass</span><em>{bypassLabel}</em></div><div className="hch-smartdash-choice">{["off", "on"].map(option => <button key={option} type="button" aria-pressed={selected("bypass_control") === option} disabled={busy || moving || (option === "on" && fireplaceActive)} onClick={() => void command("bypass_control", "select", "select_option", { option }, option)}>{option === "off" ? "Auto" : "Åbn"}</button>)}</div></div>
        <div className="hch-smartdash-control-row hch-smartdash-boost"><div className="hch-smartdash-control-label"><span>Hurtig boost</span><em>{boostRemaining > 0 ? `${Math.ceil(boostRemaining / 60)} min tilbage` : "Klar"}</em></div><div className="hch-smartdash-choice">{[15,30].map(minutes => <button key={minutes} type="button" aria-pressed={activeBoost === minutes} disabled={busy || fireplaceActive} onClick={() => { setBoostChoice(minutes); void command(`boost_${minutes}`, "button", "press", {}).then(ok => { if (!ok) setBoostChoice(null); }); }}>{minutes} min</button>)}<button type="button" disabled={busy || boostRemaining <= 0} onClick={() => void command("boost_stop", "button", "press", {}).then(ok => { if (ok) setBoostChoice(null); })}>Stop</button></div></div>
        <div className="hch-smartdash-control-row hch-smartdash-fireplace"><div className="hch-smartdash-control-label"><span>Pejsefunktion</span><em>{fireplaceRemaining > 0 ? `${Math.ceil(fireplaceRemaining / 60)} min tilbage` : fireplaceActive ? "Aktiv" : "Slukket"}</em></div><div className="hch-smartdash-choice">{(["Slukket", "15 min", "30 min"] as const).map(option => <button key={option} type="button" aria-pressed={fireplaceChoice === option} disabled={busy} onClick={() => void command("fireplace_control", "select", "select_option", { option }, option)}>{option === "Slukket" ? "Fra" : option}</button>)}</div></div>
        {notice && <span className="hch-smartdash-notice" role="status">{notice}</span>}
      </div>
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
  const beforeHeater = num("afterheat_before") ?? num("supply_temperature");
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
  const mode = String(value("mode_control") ?? "");
  const level = num("effective_level") ?? 3;
  const chosenLevel = num(mode === "manual" ? "level_control" : "auto_normal");
  const chosen = (key: string) => pendingChoice?.key === key ? pendingChoice.target : value(key);
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
  // HA has no readback of which boost runs. A button's state is the time it
  // was last pressed, so the running boost is the one whose press time plus
  // its length matches the end the controller reports.
  const boostEnd = Date.parse(entity("boost_remaining")?.last_changed ?? "") + boostRemaining * 1000;
  const activeBoost = quickBoostActive
    ? BOOST_MINUTES.find(minutes => Math.abs(Date.parse(value(`boost_${minutes}`) ?? "") + minutes * 60000 - boostEnd) < 45000) ?? null
    : null;
  const online = entity("active_master") !== undefined && entity("outdoor_temperature") !== undefined;

  const recovery = useMemo(() => {
    if (bypassActual || outdoor === null || extract === null || exhaust === null || Math.abs(extract - outdoor) < .5) return null;
    const result = ((extract - exhaust) / (extract - outdoor)) * 100;
    return result >= 0 && result <= 105 ? Math.round(result) : null;
  }, [bypassActual, outdoor, extract, exhaust]);

  const [afterheatDraft, setAfterheatDraft] = useState<AfterheatValue | null>(null);
  const afterheatTimer = useRef<number | null>(null);
  const settleTimer = useRef<number | null>(null);
  const afterheatPending = useRef<{ target: AfterheatValue; seq: number } | null>(null);
  const afterheatSeq = useRef(0);
  const shownAfterheat: AfterheatValue = afterheatDraft ?? actualAfterheat;

  const sendAfterheat = useCallback(async (target: AfterheatValue, seq: number) => {
    const saved = target === "off"
      ? await command("afterheat", "afterheat_climate", "climate", "set_hvac_mode", { hvac_mode: "off" }, "Eftervarmen er sat til OFF.")
      // A setpoint also switches the afterheat on again in the controller.
      : await command("afterheat", "afterheat_climate", "climate", "set_temperature", { temperature: target }, `Eftervarmen er sat til ${target} °C.`);
    // A newer press may have started another draft while this one was saving.
    if (afterheatSeq.current !== seq) return;
    if (!saved) { setAfterheatDraft(null); return; }
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => { if (afterheatSeq.current === seq) setAfterheatDraft(null); }, AFTERHEAT_SETTLE_MS);
  }, [command]);

  // The draft is dropped as soon as HA shows the value that was sent.
  useEffect(() => {
    if (afterheatDraft !== null && afterheatPending.current === null && busy !== "afterheat" && afterheatDraft === actualAfterheat) setAfterheatDraft(null);
  }, [afterheatDraft, actualAfterheat, busy]);

  const flushAfterheat = useCallback(() => {
    if (afterheatTimer.current !== null) window.clearTimeout(afterheatTimer.current);
    afterheatTimer.current = null;
    const pending = afterheatPending.current;
    afterheatPending.current = null;
    if (pending) void sendAfterheat(pending.target, pending.seq);
  }, [sendAfterheat]);

  // Leaving the dashboard must not drop a change that is still waiting to be sent.
  const flushAfterheatRef = useRef(flushAfterheat);
  flushAfterheatRef.current = flushAfterheat;
  useEffect(() => () => {
    flushAfterheatRef.current();
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
  }, []);

  // Remote-style range: OFF - 10 - 11 ... 35. Minus below 10 selects OFF.
  const stepAfterheat = (direction: 1 | -1) => {
    const next: AfterheatValue = direction > 0
      ? shownAfterheat === "off" ? 10 : Math.min(35, shownAfterheat + 1)
      : shownAfterheat === "off" || shownAfterheat <= 10 ? "off" : shownAfterheat - 1;
    const seq = ++afterheatSeq.current;
    setAfterheatDraft(next);
    afterheatPending.current = { target: next, seq };
    if (afterheatTimer.current !== null) window.clearTimeout(afterheatTimer.current);
    afterheatTimer.current = window.setTimeout(flushAfterheat, AFTERHEAT_SEND_DELAY_MS);
  };

  // Manual sets the manual level; the auto modes move their normal level,
  // exactly like the WebUI's manual_level / local_normal_level.
  const setLevel = (target: number) => mode === "manual"
    ? command(`level-${target}`, "level_control", "select", "select_option", { option: String(target) }, `Ventilation sat til trin ${target}.`, String(target))
    : command(`level-${target}`, "auto_normal", "number", "set_value", { value: target }, `Ventilation sat til trin ${target}.`, String(target));

  return (
    <section className="dashboard-overview">
      <header className="overview-heading-row">
        <div>
          <span className="eyebrow">OVERBLIK</span>
          <h1>Aktuel drift og status</h1>
          <p>Live visning af HCH5, luftveje, sensorer og den styring der er aktiv lige nu.</p>
        </div>
        <div className="overview-status-pills">
          <div><span className="status-led"/><small>Master</small><strong>{masterLabel(value("active_master"))}</strong></div>
          <div><span className={`status-led ${busHealthy ? "" : "warn"}`}/><small>Bus</small><strong>{busHealthy ? "Sund" : "Afventer"}</strong></div>
          <div><Leaf size={18}/><small>Driftstilstand</small><strong>{modeLabel(value("mode_control"))}</strong></div>
          {config.entities.power && <div className="power-pill" role="button" tabIndex={0} onClick={() => showHistory("power")} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); showHistory("power"); } }}><Zap size={18}/><small>Forbrug</small><strong>{watts(num("power"))}</strong></div>}
          {config.entities.attic_temperature && <div className="power-pill" role="button" tabIndex={0} onClick={() => showHistory("attic_temperature")} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); showHistory("attic_temperature"); } }}><Roof size={18}/><small>Loftrum</small><strong>{temp(num("attic_temperature"))}</strong></div>}
        </div>
      </header>

      <div className="dashboard-main-grid">
        <article className="surface pro-air-card">
          <div className="pro-card-head">
            <div><h2>Luftstrømme og temperaturer</h2><p>Live luftveje gennem HCH5 med aktuelle temperaturer og fysisk status.</p></div>
            <span className={`status-chip${online ? "" : " muted"}`}><span className="live-dot"/>{online ? "Live" : "Afventer"}</span>
          </div>
          <Hch5UnitDiagram
            onSensor={showHistory} outdoor={outdoor} extract={extract} exhaust={exhaust} beforeHeater={beforeHeater} afterHeater={afterHeater}
            room={room} frost={frost} flowWater={flowWater} returnWater={returnWater}
            supplyRpm={supplyRpm} extractRpm={extractRpm} supplyPercent={supplyPercent} extractPercent={extractPercent} fanLevel={num("effective_level")}
            bypassActual={bypassActual} bypassRequest={bypassRequest} heating={heating} recovery={recovery}
            busActive={busHealthy} bypassRaw={bypassRaw} afterheatLockout={afterheatLockout} afterheatCoil={config.afterheat_coil === "water" ? "water" : "electric"}
            bypassTravelDirection={bypassTravelDirection} bypassTravelSeconds={bypassTravelSeconds} bypassTravelTotal={bypassTravelTotal}
            control={!online || value("effective_source") === null ? null : describeControl({ active_master: value("active_master"), effective_source: value("effective_source"), effective_level: num("effective_level"), effective_reason: value("effective_reason"), fireplace })}
          />
        </article>

        <aside className="pro-control-column">
          <article className="surface pro-control-card">
            <div className="pro-card-head compact"><div><h2>Drift og styring</h2><p>Daglige funktioner</p></div><Gauge size={22}/></div>
            <label className="control-label">Ventilationstilstand</label>
            <div className="pro-segment three">
              {["local_auto", "smart_auto", "manual"].map(option => (
                <button key={option} className={chosen("mode_control") === option ? "active" : ""} aria-pressed={chosen("mode_control") === option} disabled={busy !== null} onClick={() => void command(`mode-${option}`, "mode_control", "select", "select_option", { option }, `${modeLabel(option)} valgt.`, option)}>{modeLabel(option)}</button>
              ))}
            </div>
            <label className="control-label">Ventilatorniveau</label>
            <div className="pro-levels">
              {[1,2,3,4,5,6].map(target => {
                // Filled: the level the unit runs at now (or a click awaiting the
                // controller). In Local/Smart Auto a dashed outline marks the normal
                // level a click changes, which the controller may raise for air quality.
                const levelChoiceKey = mode === "manual" ? "level_control" : "auto_normal";
                const shown = pendingChoice?.key === levelChoiceKey ? Number(pendingChoice.target) : level;
                const normal = mode !== "manual" && Number(chosen("auto_normal") ?? chosenLevel) === target && shown !== target;
                return <button key={target} className={shown === target ? "active" : normal ? "is-normal" : ""} aria-pressed={shown === target} title={normal ? "Normaltrin" : undefined} disabled={busy !== null} onClick={() => void setLevel(target)}>{target}</button>;
              })}
            </div>
            <div className="active-decision"><span>Aktiv beslutning</span><strong>Trin {whole(level)} · {text(value("effective_source")).replaceAll("_", " ")}</strong><small>{text(value("effective_reason"), "Afventer controllerens beslutning")}</small></div>
          </article>

          <div className="pro-control-pair">
            <article className="surface mini-control">
              <div className="mini-control-title"><Wind size={20}/><strong>Hurtig boost</strong></div>
              <div className="mini-buttons three">
                {BOOST_MINUTES.map(minutes => <button key={minutes} className={activeBoost === minutes || busy === `boost-${minutes}` ? "active" : ""} aria-pressed={activeBoost === minutes} disabled={busy !== null || fireplace} onClick={() => void command(`boost-${minutes}`, `boost_${minutes}`, "button", "press", {}, `Quick Boost ${minutes} min startet.`)}>{minutes} min</button>)}
              </div>
              {quickBoostActive && <button className="text-action" onClick={() => void command("boost-stop", "boost_stop", "button", "press", {}, "Quick Boost stoppet.")}>{remaining(boostRemaining)} · stop</button>}
            </article>

            <article className="surface mini-control">
              <div className="mini-control-title"><ArrowRight size={20}/><strong>Bypass-styring</strong></div>
              <div className="mini-buttons two">
                <button className={chosen("bypass_control") === "off" ? "active" : ""} aria-pressed={chosen("bypass_control") === "off"} disabled={busy !== null || bypassMoving} onClick={() => void command("bypass-auto", "bypass_control", "select", "select_option", { option: "off" }, "Bypass sat til Auto.", "off")}>Auto</button>
                <button className={chosen("bypass_control") === "on" ? "active" : ""} aria-pressed={chosen("bypass_control") === "on"} disabled={busy !== null || fireplace || bypassMoving} onClick={() => void command("bypass-on", "bypass_control", "select", "select_option", { option: "on" }, "Bypass ønskes åben.", "on")}>On</button>
              </div>
              <small className="control-footnote">Faktisk: {bypassActualLabel}</small>
            </article>
          </div>

          <div className="pro-control-pair">
            <article className="surface status-action-card">
              <div className="status-action-icon"><Snowflake size={24}/></div>
              <div><span>Frikøling</span><strong>{coolingLabel(coolingState)}</strong><small>{shownCoolingEnabled ? "Automatik aktiv" : "Deaktiveret"}</small></div>
              <button className={shownCoolingEnabled ? "active" : ""} aria-pressed={shownCoolingEnabled} disabled={busy !== null} aria-label={shownCoolingEnabled ? "Deaktiver frikøling" : "Aktiver frikøling"} onClick={() => void command("cooling", "cooling_control", "switch", shownCoolingEnabled ? "turn_off" : "turn_on", {}, shownCoolingEnabled ? "Frikøling deaktiveret." : "Frikøling aktiveret.", shownCoolingEnabled ? "off" : "on")}><ArrowRight size={17}/></button>
            </article>
            <article className="surface status-action-card">
              <div className="status-action-icon flame"><Flame size={24}/></div>
              <div><span>Pejsefunktion</span><strong>{fireplace ? "Aktiv" : "Ikke aktiv"}</strong><small>{fireplace ? remaining(fireplaceRemaining) : "15 eller 30 min"}</small></div>
              <div className="fireplace-actions">
                {fireplace
                  ? <button disabled={busy !== null} onClick={() => void command("fireplace-stop", "fireplace_control", "select", "select_option", { option: "Slukket" }, "Pejsefunktion stoppet.", "Slukket")}>Stop</button>
                  : <><button className={chosen("fireplace_control") === "15 min" ? "active" : ""} aria-pressed={chosen("fireplace_control") === "15 min"} disabled={busy !== null} onClick={() => void command("fireplace-15", "fireplace_control", "select", "select_option", { option: "15 min" }, "Pejsefunktion startet i 15 min.", "15 min")}>15</button><button className={chosen("fireplace_control") === "30 min" ? "active" : ""} aria-pressed={chosen("fireplace_control") === "30 min"} disabled={busy !== null} onClick={() => void command("fireplace-30", "fireplace_control", "select", "select_option", { option: "30 min" }, "Pejsefunktion startet i 30 min.", "30 min")}>30</button></>}
              </div>
            </article>
          </div>
        </aside>

        <article className="surface climate-panel">
          <div className="pro-card-head compact"><div><h2>Indeklimadata</h2><p>Aktuelle værdier</p></div></div>
          <div className="climate-metrics" onClick={e => { const key = (e.target as Element).closest("[data-sensor]")?.getAttribute("data-sensor"); if (key) showHistory(key); }}>
            <div className="climate-metric green" data-sensor="co2"><Leaf size={21}/><span>CO₂</span><strong>{whole(co2)} <small>ppm</small></strong><em>{co2 === null ? "Ukendt" : co2 < 800 ? "God" : co2 < 1200 ? "Moderat" : "Høj"}</em><i style={{ width: `${co2 === null ? 0 : Math.min(100, Math.max(5, co2 / 16))}%` }}/></div>
            <div className="climate-metric blue" data-sensor="humidity"><span className="metric-drop">●</span><span>Luftfugtighed</span><strong>{whole(humidity)} <small>%</small></strong><em>{humidity === null ? "Ukendt" : humidity < 60 ? "Normal" : "Høj"}</em><i style={{ width: `${humidity ?? 0}%` }}/></div>
            <div className="climate-metric cyan" data-sensor="filter_life"><span className="metric-filter">▧</span><span>Filter</span><strong>{whole(filterLife)} <small>%</small></strong><em>{filterLife === null ? "Ukendt" : filterLife > 40 ? "OK" : filterLife > 15 ? "Snart skift" : "Skift filter"}</em><i style={{ width: `${Math.max(0, Math.min(100, filterLife ?? 0))}%` }}/></div>
            <div className="climate-metric neutral" data-sensor="afterheat_selection"><span className="metric-heat">≋</span><span>Eftervarme setpunkt</span><strong>{shownAfterheat === "off" ? "OFF" : temp(shownAfterheat)}</strong><em>{afterheatStatus}</em><i style={{ width: `${shownAfterheat === "off" ? 0 : ((shownAfterheat - 10) / 25) * 100}%` }}/></div>
          </div>
          {/* Values the Pi computes from a measured T2 before the afterheat coil, as in the WebUI. */}
          {num("supply_recovery") !== null || num("afterheat_lift") !== null ? <>
            <div className="pro-card-head compact air-calc-head"><div><h2>Beregnet fra målt T2</h2><p>Luftmængde anslået for aktuelt trin{num("supply_airflow") === null ? "" : ` · ${whole(num("supply_airflow"))} m³/h`}</p></div></div>
            <div className="climate-metrics" onClick={e => { const key = (e.target as Element).closest("[data-sensor]")?.getAttribute("data-sensor"); if (key) showHistory(key); }}>
              <div className="climate-metric green" data-sensor="supply_recovery"><Leaf size={21}/><span>Genvinding · indblæsning</span><strong>{whole(num("supply_recovery"))} <small>%</small></strong><em>(T2 − T1) / (T3 − T1)</em><i style={{ width: `${Math.max(0, Math.min(100, num("supply_recovery") ?? 0))}%` }}/></div>
              <div className="climate-metric cyan" data-sensor="recovered_heat"><Wind size={21}/><span>Genvundet varme</span><strong>{whole(num("recovered_heat"))} <small>W</small></strong><em>Veksler → indblæsning</em><i style={{ width: `${Math.min(100, (num("recovered_heat") ?? 0) / 30)}%` }}/></div>
              <div className="climate-metric neutral" data-sensor="afterheat_lift"><span className="metric-heat">≋</span><span>Eftervarme løft</span><strong>{temp(num("afterheat_lift"))}</strong><em>T2AH − T2</em><i style={{ width: `${Math.max(0, Math.min(100, (num("afterheat_lift") ?? 0) * 10))}%` }}/></div>
              <div className="climate-metric neutral" data-sensor="afterheat_power"><Flame size={21}/><span>Eftervarme effekt</span><strong>{whole(num("afterheat_power"))} <small>W</small></strong><em>Varme tilført luften</em><i style={{ width: `${Math.min(100, (num("afterheat_power") ?? 0) / 20)}%` }}/></div>
            </div>
          </> : null}
        </article>

        <article className="surface afterheat-setpoint-card">
          <div className="afterheat-copy"><span>Eftervarme setpunkt</span>{afterheatLockout
            // The summer stop replaces the RS485 details so the card stays compact.
            ? <div className="afterheat-lockout">Spærret af HAC1: udetemperaturen er {temp(outdoor)}. Eftervarmen tænder først, når det er under {whole(afterheatCutoff)}{" "}°C ude.</div>
            : <><strong>RS485: {actualAfterheatSelection}</strong><small>Ønsket: {shownAfterheat === "off" ? "OFF" : `${whole(shownAfterheat)} °C`} · Varmekald: {afterheatStatus}. HAC1 regulerer selv varmefladen.</small></>}</div>
          <div className="setpoint-stepper">
            <button disabled={shownAfterheat === "off"} aria-label="Sænk eftervarme" onClick={() => stepAfterheat(-1)}>−</button>
            <strong>{shownAfterheat === "off" ? "OFF" : `${whole(shownAfterheat)} °C`}</strong>
            <button disabled={shownAfterheat === 35} aria-label="Hæv eftervarme" onClick={() => stepAfterheat(1)}>+</button>
          </div>
        </article>
      </div>
      {notice && <div className={`hch-notice${notice.error ? " error" : ""}`} role="status">{notice.text}</div>}
    </section>
  );
}

class Hch5LiveCard extends HTMLElement {
  private config: Config | null = null;
  private hassValue: Hass | null = null;
  private root: Root | null = null;
  private signature = "";

  static getStubConfig() { return { entities: {} }; }

  setConfig(config: Config) {
    if (!config || typeof config.entities !== "object" || config.entities === null) throw new Error("HCH5-kortet kræver en entities-konfiguration.");
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
    const signature = Object.values(this.config.entities).map(id => {
      const state = hass.states[id];
      return state ? `${state.state}|${state.last_changed}|${String(state.attributes?.temperature ?? "")}` : "-";
    }).join(";");
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

if (!customElements.get("ha-hch5-live-card")) customElements.define("ha-hch5-live-card", Hch5LiveCard);
window.customCards = window.customCards || [];
if (!window.customCards.some(card => card.type === "ha-hch5-live-card")) {
  window.customCards.push({ type: "ha-hch5-live-card", name: "HCH5 Live Control", description: "HCH5 Control WebUI-overblikket med animeret unit og HA-betjening", preview: false });
}

declare global { interface Window { customCards: Array<Record<string, unknown>> } }
