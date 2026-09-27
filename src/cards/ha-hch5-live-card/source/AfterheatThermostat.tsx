import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Flame, Power, Snowflake } from "./icons";

// Thermostat-style control for the HAC1 afterheat setpoint. The value is only
// a local draft here; nothing is sent until the user confirms the change.
export type AfterheatValue = number | "off";

const MIN = 10;
const MAX = 35;
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
}

export function AfterheatThermostat({ value, onChange, heating, lockout, cutoff, outdoor, airBefore, airAfter, registered, lastOn = 20, current, onConfirm, onCancel, busy = false }: AfterheatThermostatProps) {
  const pending = value !== current;
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
    return Math.round(MIN + (offset / SWEEP) * (MAX - MIN));
  };
  const pick = (event: ReactPointerEvent) => {
    const next = valueFromPointer(event);
    if (next !== null && next !== value) onChange(next);
  };

  const ticks = Array.from({ length: MAX - MIN + 1 }, (_, i) => MIN + i);
  const knob = off ? null : point(angleOf(value));

  return <div className={`afterheat-thermostat tone-${tone}`}>
    <div className="thermostat-dial">
      <svg ref={svgRef} viewBox="0 0 200 200" role="slider" aria-label="Eftervarme setpunkt" aria-valuemin={MIN} aria-valuemax={MAX}
        aria-valuenow={off ? undefined : value} aria-valuetext={off ? "Slukket" : `${value} grader`} tabIndex={0}
        onKeyDown={event => {
          if (event.key === "ArrowUp" || event.key === "ArrowRight") { event.preventDefault(); onChange(off ? MIN : Math.min(MAX, value + 1)); }
          if (event.key === "ArrowDown" || event.key === "ArrowLeft") { event.preventDefault(); onChange(off || value <= MIN ? "off" : value - 1); }
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
        <div><small>Før flade</small><strong>{fmt(airBefore)}</strong></div>
        <div><small>Efter flade</small><strong>{fmt(airAfter)}</strong></div>
        <div><small>Løft</small><strong>{airBefore === null || airAfter === null ? "—" : fmt(airAfter - airBefore)}</strong></div>
        <div><small>I HAC1</small><strong>{registered}</strong></div>
      </div>
      {lockout && !off && <p className="thermostat-note">Sommerstop: udetemperaturen er {fmt(outdoor)}. HAC1 varmer først under {cutoff}{" "}°C ude.</p>}
      <div className="thermostat-actions">
        <button type="button" aria-label="Sænk eftervarme" disabled={off} onClick={() => onChange(off || value <= MIN ? "off" : value - 1)}>−</button>
        <button type="button" className={`thermostat-power${off ? "" : " on"}`} aria-pressed={!off} onClick={() => onChange(off ? lastOn : "off")}><Power size={15}/>{off ? "Tænd" : "Sluk"}</button>
        <button type="button" aria-label="Hæv eftervarme" disabled={!off && value >= MAX} onClick={() => onChange(off ? MIN : Math.min(MAX, value + 1))}>+</button>
      </div>
    </div>
    {pending && <div className="thermostat-confirm" role="alertdialog" aria-modal="true" aria-label="Bekræft ændring af eftervarme">
      <div className="thermostat-confirm-box">
        <span className="thermostat-confirm-title">Eftervarme</span>
        <div className="thermostat-confirm-values"><span>{label(current)}</span><em>→</em><strong>{label(value)}</strong></div>
        <div className="thermostat-confirm-adjust">
          <button type="button" aria-label="Sænk eftervarme" disabled={busy || off} onClick={() => onChange(off || value <= MIN ? "off" : value - 1)}>−</button>
          <button type="button" aria-label="Hæv eftervarme" disabled={busy || (!off && value >= MAX)} onClick={() => onChange(off ? MIN : Math.min(MAX, value + 1))}>+</button>
        </div>
        <div className="thermostat-confirm-actions">
          <button type="button" className="thermostat-cancel" disabled={busy} onClick={onCancel}>Fortryd</button>
          <button type="button" className="thermostat-ok" disabled={busy} onClick={onConfirm}>Bekræft</button>
        </div>
      </div>
    </div>}
  </div>;
}
