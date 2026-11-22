import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Flame, Power, Snowflake } from "./icons";
import { AFTERHEAT_LEVEL_MAX, levelLabel, levelPercent, wantedLabel, type AfterheatLevel } from "./afterheatlevel";
import { AFTERHEAT_MAX as MAX, AFTERHEAT_MIN as MIN, FROST_LOCK_NOTE, NO_FROST_LOCK, allowedWhileLocked, canStepDown, clampSetpoint, frostRefusal, stepDown, stepUp, type AfterheatValue, type FrostLock } from "./frostlock";

// Thermostat-style control for the HAC1 afterheat setpoint. The value is only
// a local draft here; nothing is sent until the user confirms the change.
export type { AfterheatValue } from "./frostlock";

const START = 135; // degrees, 0 = right, clockwise; the scale opens at the bottom
const SWEEP = 270;
const CX = 100, CY = 100, R = 78;

function point(angle: number, radius = R) {
  const rad = (angle * Math.PI) / 180;
  return [CX + radius * Math.cos(rad), CY + radius * Math.sin(rad)] as const;
}
function arc(from: number, to: number, radius = R) {
  const [x1, y1] = point(from, radius);
  const [x2, y2] = point(to, radius);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${radius} ${radius} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}
const angleOf = (value: number) => START + ((value - MIN) / (MAX - MIN)) * SWEEP;

function fmt(value: number | null, digits = 1) {
  return value === null ? "—" : `${value.toLocaleString("da-DK", { minimumFractionDigits: digits, maximumFractionDigits: digits })} °C`;
}

export interface AfterheatThermostatProps {
  value: AfterheatValue;
  onChange: (value: AfterheatValue) => void;
  heating: boolean;
  lockout: boolean;
  cutoff: number;
  outdoor: number | null;
  airBefore: number | null;
  airAfter: number | null;
  /** What HAC1 reports back, e.g. "20 °C" or "OFF". */
  registered: string;
  /** The last value switched off from, restored by the power button. */
  lastOn?: number;
  /** The saved setpoint; a different value is an unconfirmed draft. */
  current: AfterheatValue;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  /** Readings without an entity behind them are left out: T2 before the coil (and so the lift) and HAC1's readback. */
  showBefore?: boolean;
  showRegistered?: boolean;
  /** Frost lock from the Pi: no "off" and nothing below `floor` while it freezes. */
  frostLock?: FrostLock;
  /** HAC1 output level and the Pi controller's reason; left out with older integrations. */
  level?: AfterheatLevel | null;
}

/** "Trin N/10" with a bar, the controller's wanted level as a marker, and its reason. */
export function AfterheatLevelBar({ info }: { info: AfterheatLevel }) {
  const wanted = wantedLabel(info);
  return <div className="thermostat-level">
    {/* A stale level is null: the controller has fallen back, so its wanted level means nothing either. */}
    {info.level !== null && <>
      <div className="thermostat-level-head"><strong>{levelLabel(info)}</strong>{wanted && <em>{wanted}</em>}</div>
      <div className="thermostat-level-bar" role="meter" aria-label="HAC1-trin" aria-valuemin={0} aria-valuemax={AFTERHEAT_LEVEL_MAX}
        aria-valuenow={info.level} aria-valuetext={wanted ? `${levelLabel(info)}, ${wanted}` : levelLabel(info)}>
        {Array.from({ length: AFTERHEAT_LEVEL_MAX }, (_, i) => <i key={i} className={info.level !== null && i < info.level ? "lit" : undefined}/>)}
        {info.wanted !== null && <b className="thermostat-level-marker" style={{ left: `${levelPercent(info.wanted)}%` }}/>}
      </div>
    </>}
    {info.reason && <p className="thermostat-level-reason">{info.reason}</p>}
  </div>;
}

export function AfterheatThermostat({ value, onChange, heating, lockout, cutoff, outdoor, airBefore, airAfter, registered, lastOn = 20, current, onConfirm, onCancel, busy = false, showBefore = true, showRegistered = true, frostLock = NO_FROST_LOCK, level = null }: AfterheatThermostatProps) {
  const locked = frostLock.locked;
  const floor = locked ? frostLock.floor : MIN;
  const pending = value !== current;
  // A draft made before the lock engaged cannot be confirmed while it freezes.
  const confirmable = allowedWhileLocked(value, frostLock);
  const label = (v: AfterheatValue) => v === "off" ? "OFF" : `${v} °C`;
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const off = value === "off";
  const tone = off ? "off" : lockout ? "lockout" : heating ? "heating" : "idle";
  const status = off ? "Slukket" : lockout ? "Sommerstop" : heating ? "Varmer" : "Klar";

  const valueFromPointer = (event: ReactPointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const box = svg.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * 200 - CX;
    const y = ((event.clientY - box.top) / box.height) * 200 - CY;
    let angle = (Math.atan2(y, x) * 180) / Math.PI;
    if (angle < 0) angle += 360;
    let offset = angle - START;
    if (offset < 0) offset += 360;
    // The gap at the bottom snaps to the nearest end.
    if (offset > SWEEP) offset = offset - SWEEP < (360 - SWEEP) / 2 ? SWEEP : 0;
    return clampSetpoint(Math.round(MIN + (offset / SWEEP) * (MAX - MIN)), frostLock);
  };
  const pick = (event: ReactPointerEvent) => {
    const next = valueFromPointer(event);
    if (next !== null && next !== value) onChange(next);
  };

  const ticks = Array.from({ length: MAX - MIN + 1 }, (_, i) => MIN + i);
  const knob = off ? null : point(angleOf(value));

  return <div className={`afterheat-thermostat tone-${tone}${level ? " has-level" : ""}`}>
    <div className="thermostat-dial">
      <svg ref={svgRef} viewBox="0 0 200 200" role="slider" aria-label="Eftervarme setpunkt" aria-valuemin={floor} aria-valuemax={MAX}
        aria-valuenow={off ? undefined : value} aria-valuetext={off ? "Slukket" : `${value} grader`} tabIndex={0}
        onKeyDown={event => {
          if (event.key === "ArrowUp" || event.key === "ArrowRight") { event.preventDefault(); onChange(stepUp(value, frostLock)); }
          if (event.key === "ArrowDown" || event.key === "ArrowLeft") { event.preventDefault(); if (canStepDown(value, frostLock)) onChange(stepDown(value, frostLock)); }
        }}
        onPointerDown={event => { dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); pick(event); }}
        onPointerMove={event => { if (dragging.current) pick(event); }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}>
        <defs>
          <linearGradient id="thermostatHeat" x1="0" x2="1" y1="1" y2="0"><stop offset="0" stopColor="#ffb057"/><stop offset="1" stopColor="#ff6a3d"/></linearGradient>
          <linearGradient id="thermostatIdle" x1="0" x2="1" y1="1" y2="0"><stop offset="0" stopColor="#58b9ff"/><stop offset="1" stopColor="#7de0c4"/></linearGradient>
          <filter id="thermostatGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
        </defs>
        {ticks.map(tick => {
          const angle = angleOf(tick);
          const major = tick % 5 === 0;
          const [x1, y1] = point(angle, R + 11);
          const [x2, y2] = point(angle, R + (major ? 18 : 15));
          return <line key={tick} className={`thermostat-tick${major ? " major" : ""}${!off && tick <= value ? " lit" : ""}`} x1={x1} y1={y1} x2={x2} y2={y2}/>;
        })}
        {[10, 20, 30].map(label => { const [x, y] = point(angleOf(label), R + 27); return <text key={label} className="thermostat-scale" x={x} y={y + 3} textAnchor="middle">{label}</text>; })}
        <path className="thermostat-track" d={arc(START, START + SWEEP)}/>
        {!off && <>
          {tone === "heating" && <path className="thermostat-glow" d={arc(START, angleOf(value))} filter="url(#thermostatGlow)"/>}
          <path className="thermostat-value" d={arc(START, Math.max(START + 0.5, angleOf(value)))} stroke={tone === "heating" ? "url(#thermostatHeat)" : tone === "lockout" ? "#b88a52" : "url(#thermostatIdle)"}/>
        </>}
        {knob && <circle className="thermostat-knob" cx={knob[0]} cy={knob[1]} r="9"/>}
      </svg>
      <div className="thermostat-center" aria-hidden="true">
        <span className="thermostat-state">{tone === "heating" ? <Flame size={13}/> : tone === "lockout" ? <Snowflake size={13}/> : null}{status}</span>
        <strong>{off ? "OFF" : <>{value}<small>°C</small></>}</strong>
        <span className="thermostat-sub">Luft ind {fmt(airAfter)}</span>
      </div>
    </div>
    <div className="thermostat-side">
      <div className="thermostat-head"><span>Eftervarme</span><em>HAC1 · vandflade</em></div>
      <div className="thermostat-readings">
        {showBefore && <div><small>Før flade</small><strong>{fmt(airBefore)}</strong></div>}
        <div><small>Efter flade</small><strong>{fmt(airAfter)}</strong></div>
        {showBefore && <div><small>Løft</small><strong>{airBefore === null || airAfter === null ? "—" : fmt(airAfter - airBefore)}</strong></div>}
        {showRegistered && <div><small>I HAC1</small><strong>{registered}</strong></div>}
      </div>
      {locked && <p className="thermostat-note frost-lock-note" role="note"><Snowflake size={12}/> {FROST_LOCK_NOTE}{floor > MIN ? ` (mindst ${floor} °C)` : ""}.</p>}
      {lockout && !off && <p className="thermostat-note">Sommerstop: udetemperaturen er {fmt(outdoor)}. HAC1 varmer først under {cutoff}{" "}°C ude.</p>}
      <div className="thermostat-actions">
        <button type="button" aria-label="Sænk eftervarme" disabled={!canStepDown(value, frostLock)} onClick={() => onChange(stepDown(value, frostLock))}>−</button>
        <button type="button" className={`thermostat-power${off ? "" : " on"}`} aria-pressed={!off} disabled={locked && !off} title={locked && !off ? FROST_LOCK_NOTE : undefined}
          onClick={() => onChange(off ? clampSetpoint(lastOn, frostLock) : locked ? value : "off")}><Power size={15}/>{off ? "Tænd" : "Sluk"}</button>
        <button type="button" aria-label="Hæv eftervarme" disabled={!off && value >= MAX} onClick={() => onChange(stepUp(value, frostLock))}>+</button>
      </div>
    </div>
    {level && <AfterheatLevelBar info={level}/>}
    {pending && <div className="thermostat-confirm" role="alertdialog" aria-modal="true" aria-label="Bekræft ændring af eftervarme">
      <div className="thermostat-confirm-box">
        <span className="thermostat-confirm-title">Eftervarme</span>
        <div className="thermostat-confirm-values"><span>{label(current)}</span><em>→</em><strong>{label(value)}</strong></div>
        <div className="thermostat-confirm-adjust">
          <button type="button" aria-label="Sænk eftervarme" disabled={busy || !canStepDown(value, frostLock)} onClick={() => onChange(stepDown(value, frostLock))}>−</button>
          <button type="button" aria-label="Hæv eftervarme" disabled={busy || (!off && value >= MAX)} onClick={() => onChange(stepUp(value, frostLock))}>+</button>
        </div>
        {!confirmable && <p className="thermostat-note frost-lock-note" role="note">{frostRefusal(value, frostLock)}</p>}
        <div className="thermostat-confirm-actions">
          <button type="button" className="thermostat-cancel" disabled={busy} onClick={onCancel}>Fortryd</button>
          <button type="button" className="thermostat-ok" disabled={busy || !confirmable} onClick={onConfirm}>Bekræft</button>
        </div>
      </div>
    </div>}
  </div>;
}
