import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ControlSummary } from "./control";
import { bypassOpenShare, bypassTravel, formatRemaining, type BypassDirection } from "./bypass";

type Num = number | null;
type Point = readonly [number, number];

export interface Hch5UnitDiagramProps {
  onSensor?: (key: string) => void;
  outdoor: Num;
  extract: Num;
  exhaust: Num;
  /** T2 before the afterheat coil, only when measured by a 1-Wire sensor in the duct. */
  beforeHeater?: Num;
  afterHeater: Num;
  /** Kept for callers; the HRC2 T5 room sensor is not drawn while it is unreliable. */
  room?: Num;
  frost: Num;
  flowWater: Num;
  returnWater: Num;
  supplyRpm: Num;
  extractRpm: Num;
  supplyPercent: Num;
  extractPercent: Num;
  /** Effective controller level 1–6; changes animation speed without using noisy RPM telemetry. */
  fanLevel?: Num;
  bypassActual: boolean;
  bypassRequest: string;
  heating: boolean;
  recovery: number | null;
  /** RS485 traffic is flowing; animates data pulses along the Modbus cable. */
  busActive?: boolean;
  /** Damper status from the unit: 0 closed, 64 opening, 32 closing, 255 open. */
  bypassRaw?: number | null;
  /** From the controller: which way the damper travels and for how long so far. */
  bypassTravelDirection?: string | null;
  bypassTravelSeconds?: number | null;
  bypassTravelTotal?: number | null;
  /** HAC1 outdoor lockout: afterheat never runs at 15 C outdoor or above. */
  afterheatLockout?: boolean;
  /** Afterheater drawn after the unit: an electric element (default) or a water coil fed with flow/return water. */
  afterheatCoil?: AfterheatCoil;
  /** What currently decides the ventilation, shown bottom-right below T4. */
  control?: ControlSummary | null;
  /** Smartdash crops the bottom of the drawing; place the panel higher, without footer. */
  controlCompact?: boolean;
}
export type AfterheatCoil = "electric" | "water";

// What the exchanger shows while the damper is not at rest. "moving" is a
// damper seen part-way with no known direction.
type BypassPhase = BypassDirection | "moving" | null;
const BYPASS_PHASE_TITLE = { opening: "Åbner bypass", closing: "Lukker bypass", moving: "Bypass-spjæld" } as const;
const BYPASS_PHASE_LABEL = { opening: "Åbner…", closing: "Lukker…", moving: "Bevæger sig…" } as const;

// Direction of the last change of the damper code while it travels, as a
// fallback when the controller has not seen the start: in Auto the unit
// opens and closes the damper by itself.
function useBypassMotion(code: number, travelling: boolean): BypassDirection | null {
  const previous = useRef<number | null>(null);
  const [motion, setMotion] = useState<BypassDirection | null>(null);
  useEffect(() => {
    const last = previous.current;
    previous.current = code;
    if (!travelling) setMotion(null);
    else if (last !== null && last !== code) setMotion(code > last ? "opening" : "closing");
  }, [code, travelling]);
  return motion;
}

function fmt(value: Num, suffix = "°C") {
  if (value === null) return "—";
  return `${value.toLocaleString("da-DK", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${suffix}`;
}
function int(value: Num) { return value === null ? "—" : Math.round(value).toLocaleString("da-DK"); }

// Drawing area: from the room-side readings (T3/T2AH) on the left to where
// the outdoor-air and exhaust ducts have faded out on the right.
const VIEW = { x: -240, y: 40, width: 1446, height: 510 };
// The WebUI keeps the complete labelled SVG on mobile. The HA card follows
// the same drawing; container queries only arrange the readbacks underneath.

// The exhaust end is turned away from the viewer, so its outdoor-air (T1)
// and exhaust (T4) ducts run off backwards: each leaves the hidden end face,
// rises towards the horizon (we look down on the unit), narrows with
// distance and fades out before its open end could come into view. The air
// follows the same centre line, and T1/T4 sit where it fades out.
const REAR_FAR_X = 1120;
const REAR_FADE = { from: 990, to: 1100 };
const rearFarY = (y: number) => y - 32;
const rearDuctIn = (y: number) => `M${REAR_FAR_X} ${rearFarY(y)} C1060 ${y - 22} 1005 ${y} 950 ${y}`;
const rearDuctOut = (y: number) => `H950 C1005 ${y} 1060 ${y - 22} ${REAR_FAR_X} ${rearFarY(y)}`;
const ROOM_SIDE_X = -220;

// Oriented like the real HCH5 (see the port sticker on its core): outdoor
// air enters P1 top right and exhaust leaves P4 bottom right, where both fan
// motors sit; extract enters P3 top left and supply leaves P2 bottom left
// towards the external HAC1 coil. The core is an elongated hexagonal
// counter-flow exchanger: each stream enters one slanted end face and leaves
// the opposite one, so the two paths cross at its centre (520 262).
const NORMAL_SUPPLY = `${rearDuctIn(205)} H884 C850 205 812 210 770 212 Q715 212 660 216 L520 262 L380 308 Q342 322 322 345 Q308 365 278 365 H${ROOM_SIDE_X}`;
const NORMAL_EXTRACT = `M${ROOM_SIDE_X} 205 H322 Q352 205 380 216 L520 262 L660 308 Q720 328 800 330 C842 331 852 365 884 365 ${rearDuctOut(365)}`;
// The bypass damper sits on the lower (extract) fan motor, so in bypass the
// extract air leaves the core out and runs along the bottom channel beneath
// it, through the damper and the extract fan to exhaust. Supply always
// crosses the core.
const BYPASS_EXTRACT = `M${ROOM_SIDE_X} 205 H268 Q294 205 294 231 V364 Q294 388 318 388 H772 Q800 388 800 360 V330 C842 331 852 365 884 365 ${rearDuctOut(365)}`;
const CORE_POINTS = "420,178 620,178 700,262 620,346 420,346 340,262";
const CORE_CORNERS: Point[] = [[420, 178], [620, 178], [700, 262], [620, 346], [420, 346], [340, 262]];
const CORE_PLATES = [196, 214, 232, 250, 268, 286, 304, 322];
const BYPASS_PROGRESS = "M462 290 H578";
const EXTRACT_ROUTES = [["route-core", NORMAL_EXTRACT], ["route-bypass", BYPASS_EXTRACT]] as const;

// One oblique projection for the whole unit, depth going up-left like the
// top and the afterheat end of the cabinet: the parts inside are extruded
// along it, so the core and the filters show their depth.
const CABINET_DEPTH: Point = [-34, -30];
const CORE_DEPTH: Point = [-26, -23];
const FILTER_DEPTH: Point = [-20, -18];
const OPENING = { x: 211, y: 151, width: 692, height: 263 };

const pointList = (points: readonly Point[]) => points.map(([x, y]) => `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`).join(" ");
// Side faces of a convex prism with front face `front`, extruded `depth`
// into the picture. A side is visible when its outward normal points the
// way the depth offset goes; `top` marks the upward-facing ones for shading.
function prismSides(front: readonly Point[], depth: Point) {
  let area = 0;
  front.forEach(([x1, y1], i) => { const [x2, y2] = front[(i + 1) % front.length]; area += x1 * y2 - x2 * y1; });
  const turn = area > 0 ? 1 : -1;
  return front.flatMap((a, i) => {
    const b = front[(i + 1) % front.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = turn * (b[1] - a[1]) / length, ny = -turn * (b[0] - a[0]) / length;
    if (nx * depth[0] + ny * depth[1] < 1) return [];
    const back = (p: Point): Point => [p[0] + depth[0], p[1] + depth[1]];
    return [{ points: pointList([a, b, back(b), back(a)]), top: -ny > Math.abs(nx) }];
  });
}

// Backward-curved impeller blade, drawn once and rotated around the hub.
const FAN_BLADE = "M-3.5 -12.5C2 -20 6 -27 15 -31C16.5 -27.5 14 -20.5 5 -12Z";
const FAN_BLADE_ANGLES = [0, 51.43, 102.86, 154.29, 205.71, 257.14, 308.57];
// The fans are seen slightly from behind at an angle: the impeller disc is
// turned about its vertical axis, its drum recedes to the right and the
// motor can stands out of the hub towards the viewer. The blades spin inside
// the turned disc, so they sweep an ellipse like a real turned fan.
const FAN_TILT = "matrix(.58 -.13 0 1 0 0)";
const FAN_DRUM: Point = [10, -2];
const FAN_MOTOR: Point = [-7, 1.5];
// Top and bottom of a turned circle of radius r, where the drum sides touch it.
const tiltedEdge = (r: number): [Point, Point] => [[0.075 * r, -1.008 * r], [-0.075 * r, 1.008 * r]];
function drumSide(r: number, offset: Point) {
  const [top, bottom] = tiltedEdge(r);
  return pointList([top, [top[0] + offset[0], top[1] + offset[1]], [bottom[0] + offset[0], bottom[1] + offset[1]], bottom]);
}

function Fan({ x, y, rpm, label, labelRight = false }: { x: number; y: number; rpm: Num; label: string; labelRight?: boolean }) {
  // Keep the animation duration stable across ordinary RPM telemetry changes.
  // Changing a running CSS animation's duration shifts its current phase.
  const speed = rpm && rpm > 0 ? 1.4 : 0;
  return <g className={`hch-fan${speed ? " running" : " stopped"}`} transform={`translate(${x} ${y})`}>
    <g transform={`translate(${FAN_DRUM[0]} ${FAN_DRUM[1]})`}><g transform={FAN_TILT}><circle className="hch-fan-back" r="42"/></g></g>
    <polygon className="hch-fan-drum" points={drumSide(42, FAN_DRUM)}/>
    <g transform={FAN_TILT}>
      <circle className="hch-fan-ring" r="42"/><circle className="hch-fan-shroud" r="36"/>
      <circle className="hch-fan-blur" r="33"/>
      <g className="hch-fan-rotor" style={{ "--fan-speed": speed ? `${speed}s` : "0s" } as CSSProperties}>
        {FAN_BLADE_ANGLES.map(angle => <path key={angle} d={FAN_BLADE} transform={`rotate(${angle})`}/>)}
      </g>
      <circle className="hch-fan-hub" r="13"/>
    </g>
    <polygon className="hch-fan-motor" points={drumSide(13, FAN_MOTOR)}/>
    <g transform={`translate(${FAN_MOTOR[0]} ${FAN_MOTOR[1]})`}><g transform={FAN_TILT}><circle className="hch-fan-cap" r="13"/><circle className="hch-fan-cap-centre" r="4"/></g></g>
    {labelRight
      ? <text className="hch-part-label" x="42" y="6">{label}</text>
      : <text className="hch-part-label" x="0" y="64" textAnchor="middle">{label}</text>}
  </g>;
}
function Filter({ x, y, label, angle }: { x: number; y: number; label: string; angle: number }) {
  // The real filter cassettes stand slanted in the top corners and run the
  // full depth of the unit.
  const radians = angle * Math.PI / 180, cos = Math.cos(radians), sin = Math.sin(radians);
  const front = ([[-20, -52], [20, -52], [20, 52], [-20, 52]] as const).map(([px, py]): Point => [x + px * cos - py * sin, y + px * sin + py * cos]);
  return <g className="hch-filter">
    {prismSides(front, FILTER_DEPTH).map(face => <polygon key={face.points} className={face.top ? "filter-face-top" : "filter-face-side"} points={face.points}/>)}
    <g transform={`translate(${x} ${y}) rotate(${angle})`}><rect x="-20" y="-52" width="40" height="104" rx="2"/>{[-13,-6,1,8].map(o => <path key={o} d={`M${o-6} -43 L${o+6} 43`}/>)}</g>
    {/* "Filter · udeluft" is set on two lines to stay inside the cabinet. */}
    {label.split(" · ").map((line, i) => <text key={line} className="hch-part-label" x={x} y={y + 76 + i * 18} textAnchor="middle">{line}</text>)}
  </g>;
}
// The exchanger block runs the depth of the unit; its plates show as lines
// on the front and on the upper-left end face.
function Exchanger({ bypassed }: { bypassed: boolean }) {
  const leftEdgeX = (plate: number) => Math.round((340 + Math.abs(262 - plate) * 80 / 84) * 10) / 10;
  return <g className={`hch-exchanger${bypassed ? " bypassed" : ""}`}>
    {prismSides(CORE_CORNERS, CORE_DEPTH).map(face => <polygon key={face.points} className={face.top ? "core-face-top" : "core-face-side"} points={face.points}/>)}
    {CORE_PLATES.filter(plate => plate < 262).map(plate => <path key={plate} className="core-plate-edge" d={`M${leftEdgeX(plate)} ${plate} l${CORE_DEPTH[0]} ${CORE_DEPTH[1]}`}/>)}
    <polygon points={CORE_POINTS} fill="url(#exchangerMetal)"/>
    <g clipPath="url(#coreClip)">{CORE_PLATES.map(o=><path key={o} d={`M340 ${o}H700`}/>)}</g>
  </g>;
}
// The exchanger is drawn solid; tapping it shows the air passing through it
// for a minute, then it closes again by itself.
const CORE_OPEN_MS = 60_000;
function useCoreView(): [boolean, () => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setOpen(false), CORE_OPEN_MS);
    return () => window.clearTimeout(timer);
  }, [open]);
  return [open, () => setOpen(value => !value)];
}
// Temperature "ports": semi-transparent duct-cap plates centred on the flow
// line where the air fades out, so the reading marks the end of each duct.
function TempPort({ cx, cy, title, value, tone = "neutral", sensor, onSensor }: { cx: number; cy: number; title: string; value: string; tone?: string; sensor?: string; onSensor?: (key: string) => void }) {
  const width = 176, height = 84;
  return (
    <g className={`hch-temp-port tone-${tone}`} role={sensor && onSensor ? "button" : undefined} tabIndex={sensor && onSensor ? 0 : undefined} onClick={() => sensor && onSensor?.(sensor)} onKeyDown={e => { if (sensor && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSensor?.(sensor); } }} transform={`translate(${cx} ${cy})`}>
      <rect className="hch-temp-port-plate" x={-width / 2} y={-height / 2} width={width} height={height} rx="18" />
      <text className="hch-temp-port-title" x="0" y={-13} textAnchor="middle">{title}</text>
      <text className="hch-temp-port-value" x="0" y={23} textAnchor="middle">{value}</text>
    </g>
  );
}
function SensorPin({ x, y, label, value, width = 84, lift = 28, sensor, onSensor }: { x:number;y:number;label:string;value:string;width?:number;lift?:number;sensor?:string;onSensor?:(key:string)=>void }) {
  const top = -lift - 46;
  return <g className="hch-sensor-pin" role={sensor && onSensor ? "button" : undefined} tabIndex={sensor && onSensor ? 0 : undefined} onClick={() => sensor && onSensor?.(sensor)} onKeyDown={e => { if (sensor && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSensor?.(sensor); } }} transform={`translate(${x} ${y})`}><circle r="5"/><line x1="0" y1="0" x2="0" y2={-lift}/><rect x={-width / 2} y={top} width={width} height="46" rx="9"/><text x="0" y={top + 18} textAnchor="middle">{label}</text><text className="pin-value" x="0" y={top + 38} textAnchor="middle">{value}</text></g>;
}
// Duct stubs leave the near (afterheat) end sideways like on the real unit:
// a short horizontal pipe whose open end faces the viewer's side, seen
// edge-on as a narrow ellipse.
function DuctCollar({ x, y }: { x:number;y:number }) {
  const length = 44, radius = 36;
  return <g className="hch-duct-collar">
    <rect className="hch-duct-pipe" x={x - length} y={y - radius} width={length} height={radius * 2}/>
    <ellipse className="hch-duct-rim" cx={x - length} cy={y} rx="11" ry={radius}/>
    <ellipse className="hch-duct-inner" cx={x - length} cy={y} rx="6" ry={radius - 7}/>
  </g>;
}
// Far-end duct: narrows with distance from the unit's radius 36 to 20 while
// it rises, and is faded out by the mask before its end. The seams crowd
// together further away, like on a real duct running off into depth.
const REAR_SEAMS = [{ x: 968, r: 34 }, { x: 1012, r: 30 }, { x: 1047, r: 26 }, { x: 1074, r: 23 }];
function RearDuct({ y }: { y: number }) {
  const far = rearFarY(y);
  // Centre line height at x on the duct (matches rearDuctIn/Out closely enough for the seams).
  const centre = (x: number) => { const t = Math.min(1, Math.max(0, (x - 950) / (REAR_FAR_X - 950))); return y + (far - y) * t * t * (3 - 2 * t); };
  const body = `M918 ${y - 36} H950 C1005 ${y - 36} 1055 ${y - 50} ${REAR_FAR_X} ${far - 20} L${REAR_FAR_X} ${far + 20} C1055 ${y + 6} 1005 ${y + 36} 950 ${y + 36} H918 Z`;
  return <g className="hch-rear-duct" mask="url(#rearDuctFade)">
    <path className="hch-rear-duct-body" d={body}/>
    <path className="hch-rear-duct-shine" d={`M932 ${y - 25} H950 C1005 ${y - 25} 1055 ${y - 42} ${REAR_FAR_X} ${far - 14}`}/>
    <path className="hch-rear-duct-shade" d={`M932 ${y + 27} H950 C1005 ${y + 27} 1055 ${y} ${REAR_FAR_X} ${far + 15}`}/>
    {REAR_SEAMS.map(({ x, r }) => { const c = centre(x); return <path key={x} className="hch-rear-duct-seam" d={`M${x} ${Math.round(c - r)} q${Math.round(r * .22)} ${r} 0 ${2 * r}`}/>; })}
    <rect className="hch-rear-duct-flange" x="920" y={y - 41} width="12" height="82" rx="3"/>
  </g>;
}

// Air colours are relative: the coldest air in the drawing right now is blue,
// the warmest red, and everything else sits between them. So the warm side of
// the exchanger is always redder than the cold side, also in summer when all
// temperatures are close. The palette avoids a grey middle band.
const AIR_PALETTE: readonly (readonly [number, number, number, number])[] = [[0, 70, 125, 255], [.25, 110, 195, 255], [.45, 225, 236, 240], [.58, 255, 220, 150], [.78, 255, 150, 70], [1, 255, 72, 56]];
// Differences smaller than this are spread over it, so sensor noise and a
// near-even summer day do not turn into full blue and red.
const AIR_MIN_SPAN = 5;
const AIR_UNKNOWN_SUPPLY = "rgb(110 195 255)", AIR_UNKNOWN_EXTRACT = "rgb(255 150 70)";
export type AirRange = { lo: number; hi: number };
export function airRange(temperatures: readonly Num[]): AirRange {
  const known = temperatures.filter((t): t is number => t !== null && Number.isFinite(t));
  if (!known.length) return { lo: -5, hi: 38 };
  let lo = Math.min(...known), hi = Math.max(...known);
  if (hi - lo < AIR_MIN_SPAN) { const mid = (lo + hi) / 2; lo = mid - AIR_MIN_SPAN / 2; hi = mid + AIR_MIN_SPAN / 2; }
  return { lo, hi };
}
export function airColour(t: Num, fallback: string, range: AirRange = { lo: -5, hi: 38 }) {
  if (t === null || !Number.isFinite(t)) return fallback;
  const share = Math.min(1, Math.max(0, (t - range.lo) / (range.hi - range.lo)));
  const i = AIR_PALETTE.findIndex(([at]) => share <= at);
  if (i <= 0) return `rgb(${AIR_PALETTE[0].slice(1).join(" ")})`;
  const [p0, ...a] = AIR_PALETTE[i - 1], [p1, ...b] = AIR_PALETTE[i], k = (share - p0) / (p1 - p0);
  return `rgb(${a.map((c, j) => Math.round(c + (b[j] - c) * k)).join(" ")})`;
}
/** Lighter tone of an air colour for the moving wisps. */
function airLight(colour: string) {
  const [r, g, b] = colour.match(/\d+/g)!.map(Number);
  return `rgb(${[r, g, b].map(c => Math.round(c + (255 - c) * .45)).join(" ")})`;
}
// Heat moves between the streams across the core, and the afterheat coil
// sits between these x positions on the supply duct.
const CORE_X = { from: 380, to: 660 };
const COIL_X = { from: 9, to: 105 };
const AIR_SPAN = { outdoor: REAR_FAR_X, room: ROOM_SIDE_X };
/** Temperature of the supply air leaving the core: outdoor air warmed by the
 *  recovery share of the extract-outdoor difference, or unchanged in bypass. */
export function supplyAfterCore(outdoor: Num, extract: Num, recovery: number | null, bypassOpen: boolean): Num {
  if (outdoor === null) return null;
  if (bypassOpen || extract === null || recovery === null) return outdoor;
  return outdoor + Math.min(100, Math.max(0, recovery)) / 100 * (extract - outdoor);
}
type Stop = readonly [number, string];
// A fade between two temperatures across a part of the duct, sampled so the
// colours follow the air scale instead of mixing straight through grey.
function fade(from: Num, to: Num, fallback: string, range: AirRange, at: (x: number) => number, x0: number, x1: number, steps = 6): Stop[] {
  if (from === null || to === null) return [[at(x0), airColour(from ?? to, fallback, range)], [at(x1), airColour(to ?? from, fallback, range)]];
  return Array.from({ length: steps + 1 }, (_, i) => [at(x0 + (x1 - x0) * i / steps), airColour(from + (to - from) * i / steps, fallback, range)] as Stop);
}
function airStops(outdoor: Num, extract: Num, exhaust: Num, afterHeater: Num, beforeHeater: Num, heating: boolean, recovery: number | null, bypassOpen: boolean) {
  const span = AIR_SPAN.outdoor - AIR_SPAN.room;
  const fromOutdoor = (x: number) => Math.round((AIR_SPAN.outdoor - x) / span * 1000) / 1000;
  const fromRoom = (x: number) => Math.round((x - AIR_SPAN.room) / span * 1000) / 1000;
  // Supply between the core and the coil: with the afterheat off, T2AH is that
  // same air; with it on, the unit's own T2 before the coil. The estimate from
  // T1, T3 and the recovery share is only a fallback.
  const estimate = supplyAfterCore(outdoor, extract, recovery, bypassOpen);
  const core = heating ? beforeHeater ?? estimate : afterHeater ?? beforeHeater ?? estimate;
  const heated = afterHeater ?? core;
  const exhausted = exhaust ?? extract;
  const range = airRange([outdoor, core, heated, extract, exhausted]);
  const supply: Stop[] = [
    [0, airColour(outdoor, AIR_UNKNOWN_SUPPLY, range)],
    ...fade(outdoor, core, AIR_UNKNOWN_SUPPLY, range, fromOutdoor, CORE_X.to, CORE_X.from),
    ...fade(core, heated, AIR_UNKNOWN_SUPPLY, range, fromOutdoor, COIL_X.to, COIL_X.from),
    [1, airColour(heated, AIR_UNKNOWN_SUPPLY, range)],
  ];
  const extractStops: Stop[] = [
    [0, airColour(extract, AIR_UNKNOWN_EXTRACT, range)],
    ...fade(extract, exhausted, AIR_UNKNOWN_EXTRACT, range, fromRoom, CORE_X.from, CORE_X.to),
    [1, airColour(exhausted, AIR_UNKNOWN_EXTRACT, range)],
  ];
  return { supply, extract: extractStops };
}
function AirGradient({ id, stops, from, to, light = false }: { id: string; stops: readonly Stop[]; from: number; to: number; light?: boolean }) {
  return <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={from} y1="0" x2={to} y2="0">{stops.map(([offset, colour], i) => <stop key={i} offset={offset} stopColor={light ? airLight(colour) : colour}/>)}</linearGradient>;
}

// Soft moving highlights run from the first point of each air path to its
// last. Both path definitions begin at their real upstream end, so one CSS
// dash direction works for intake and extract, including the bypass branch.
function AirWisps({ path, kind, speed }: { path: string; kind: "supply" | "extract"; speed: number }) {
  const style = { "--flow-speed": speed ? `${speed}s` : "0s" } as CSSProperties;
  return <g className={`hch-air-wisps hch-fog-${kind}`}>
    <path className="hch-air-wisp hch-air-wisp-wide" d={path} style={style}/>
    <path className="hch-air-wisp hch-air-wisp-fine" d={path} style={style}/>
  </g>;
}

// The afterheat coil hangs on the supply duct outside the unit.
const COIL_AT: Point = [57, 365];
// HAC1 is a loose box on the RS485 line between the unit and the Pi, set
// apart from the coil so the water pipes have room beneath it.
const HAC1_BOX = { x: 108, y: 470, width: 140, height: 52 };
// The water pipes end at the Fremløb and Retur lines of the water readings;
// HAC1's water valve sits on the return.
const WATER_SUPPLY_TO: Point = [-70, 459];
const WATER_RETURN_TO: Point = [-70, 479];
const WATER_VALVE_AT: Point = [5, 479];

// Wiring view: the unit's control board, the HAC1 afterheat controller and
// the Raspberry Pi share one RS485/Modbus RTU cable (unit = slave 1, HAC1 =
// slave 0x40, Pi = gateway). HAC1 wires its own T2AH and frost sensors and
// the water valve actuator; with the water coil the T2AH lead is left out
// because it would have to cross the water pipes.
function Rs485Wiring({ active, compact = false, water = false }: { active: boolean; compact?: boolean; water?: boolean }) {
  const { x, y, width, height } = HAC1_BOX, cx = x + width / 2;
  const valve: Point = water ? [WATER_VALVE_AT[0], WATER_VALVE_AT[1] + 14] : [23, 446];
  const bus = `M254 410 V496 M${x + width} 496 H600`;
  return <g className={`hch-wiring${active ? " active" : ""}`}>
    {!water && <path className="hch-signal-wire" d={`M${x} ${y + 20} H2 V420 H-28 V371`}/>}
    <path className="hch-signal-wire" d={`M${x + 8} ${y} V292 H63`}/>
    <path className="hch-signal-wire" d={`M${x} ${y + 36} H${valve[0]} V${valve[1]}`}/>
    <path className="hch-bus-cable" d={bus}/><path className="hch-bus-core" d={bus}/>
    <rect className="hch-cable-gland" x="246" y="428" width="16" height="12" rx="3"/>
    <circle className="hch-bus-joint" cx="254" cy="496" r="4"/>
    <text className="hch-bus-label" x="425" y="486" textAnchor="middle">RS485 · Modbus RTU</text>
    <g className="hch-device hch-hac1-box"><rect className="device-body" x={x} y={y} width={width} height={height} rx="10"/><text x={cx} y={y + 22} textAnchor="middle">HAC1 styring</text><text className="device-sub" x={cx} y={y + 41} textAnchor="middle">Modbus-slave 0x40</text>{compact&&<text className="device-compact" x={cx} y={y + 38} textAnchor="middle">HAC1</text>}</g>
    <g className="hch-device hch-pi">
      <rect className="pi-board" x="600" y="468" width="180" height="72" rx="8"/>
      {[0,1,2,3,4,5,6,7,8,9].map(i => <rect key={i} className="pi-gpio" x={628 + i * 14} y="473" width="6" height="6" rx="1"/>)}
      <rect className="pi-chip" x="612" y="490" width="28" height="28" rx="3"/>
      <text x="710" y="506" textAnchor="middle">Raspberry Pi</text><text className="device-sub" x="710" y="525" textAnchor="middle">Gateway · RS485</text>{compact&&<text className="device-compact" x="712" y="517" textAnchor="middle">Pi</text>}
    </g>
  </g>;
}

// "Styring nu": source, level and reason of the controller's current decision,
// placed in the free corner right of the Raspberry Pi and below T4.
// Smartdash stretches the drawing vertically and crops its bottom edge, so the
// compact panel sits higher and leaves out the footer the Smartdash head shows.
const CONTROL_BOX = { x: 930, y: 420, width: 272, height: 126 };
const CONTROL_BOX_COMPACT = { x: 930, y: 386, width: 272, height: 104 };
function ControlPanel({ control, compact = false }: { control: ControlSummary; compact?: boolean }) {
  const { x, y, width, height } = compact ? CONTROL_BOX_COMPACT : CONTROL_BOX;
  return <g className={`hch-control-panel tone-${control.tone}`} aria-label={`Styring nu: ${control.title}${control.level ? `, trin ${control.level}` : ""}. ${control.reason}`}>
    <rect className="control-body" x={x} y={y} width={width} height={height} rx="12"/>
    <foreignObject x={x + 12} y={y + 8} width={width - 24} height={height - 16}>
      <div className="hch-control-text">
        <span className="hch-control-eyebrow">Styring nu</span>
        <strong className="hch-control-title">{control.title}{control.level ? <em>Trin {control.level}</em> : null}</strong>
        <span className="hch-control-reason">{control.reason}</span>
        {!compact && <span className="hch-control-footer">{control.footer}</span>}
      </div>
    </foreignObject>
  </g>;
}

function LockoutBadge() {
  return <g className="hch-lockout-badge"><rect x="-58" y="-25" width="116" height="50" rx="10"/><text x="0" y="-4" textAnchor="middle">Sommerstop</text><text x="0" y="15" textAnchor="middle">ude ≥ 15 °C</text></g>;
}

// Electric afterheater: heating elements across the duct that glow while it heats.
function ElectricCoil({ heating, lockout }: { heating: boolean; lockout: boolean }) {
  return <g className={`hch-external-coil${heating?" active":""}`} transform={`translate(${COIL_AT[0]} ${COIL_AT[1]})`}><rect className="coil-case" x="-48" y="-68" width="96" height="136" rx="12"/><rect className="coil-duct" x="-61" y="-48" width="122" height="96" rx="20"/>{[-27,-14,-1,12,25].map(o=><path key={o} className="coil-pipe" d={`M${o} -42 C${o-12} -24 ${o+12} -8 ${o} 10 C${o-12} 27 ${o+12} 36 ${o} 43`}/>) }<circle className="water-port" cx="34" cy="-75" r="5"/><circle className="water-port" cx="-34" cy="75" r="5"/><text className="hch-part-label" x="0" y="93" textAnchor="middle">Ekstern eftervarme · HAC1</text>{lockout&&<LockoutBadge/>}</g>;
}

// Water afterheat coil: a copper serpentine through aluminium fins. Flow water
// enters the left pass and leaves the right one, so the tube is tinted from
// the flow to the return temperature; the pipes run to those readings, and
// the water only moves while the afterheat is active.
const WATER_TUBE = "M-30 68 V-52 A6 6 0 0 1 -18 -52 V52 A6 6 0 0 0 -6 52 V-52 A6 6 0 0 1 6 -52 V52 A6 6 0 0 0 18 52 V-52 A6 6 0 0 1 30 -52 V68";
const WATER_FINS = [-42, -34, -26, -18, -10, -2, 6, 14, 22, 30, 38];
// Water-heating colours: blue when cold, orange when warm, red when hot.
const WATER_SCALE: readonly (readonly [number, number, number, number])[] = [[15, 74, 163, 255], [28, 255, 154, 61], [45, 255, 78, 58]];
const WATER_HOT = "rgb(255 78 58)", WATER_WARM = "rgb(255 154 61)", WATER_COLD = "rgb(74 163 255)", WATER_UNKNOWN = "rgb(111 135 150)";
// Below this flow/return difference the water is drawn as one temperature.
const WATER_SPLIT_DELTA = 0.3;
export function waterColour(t: Num) {
  if (t === null || !Number.isFinite(t)) return WATER_UNKNOWN;
  const i = WATER_SCALE.findIndex(([at]) => t <= at);
  if (i === 0 || i < 0) return `rgb(${WATER_SCALE[i === 0 ? 0 : WATER_SCALE.length - 1].slice(1).join(" ")})`;
  const [t0, ...a] = WATER_SCALE[i - 1], [t1, ...b] = WATER_SCALE[i], k = (t - t0) / (t1 - t0);
  return `rgb(${a.map((c, j) => Math.round(c + (b[j] - c) * k)).join(" ")})`;
}
/** Colours at the flow end, through the coil and at the return end. When
 *  flow and return differ, the hotter end is red and the water fades through
 *  orange to blue at the colder end; otherwise it is one colour. */
export function waterPath(flow: Num, ret: Num): { flow: string; mid: string; ret: string } {
  const known = (t: Num): t is number => t !== null && Number.isFinite(t);
  if (!known(flow) && !known(ret)) return { flow: WATER_UNKNOWN, mid: WATER_UNKNOWN, ret: WATER_UNKNOWN };
  if (!known(flow) || !known(ret) || Math.abs(flow - ret) < WATER_SPLIT_DELTA) {
    const one = waterColour(known(flow) && known(ret) ? (flow + ret) / 2 : known(flow) ? flow : ret);
    return { flow: one, mid: one, ret: one };
  }
  return flow > ret ? { flow: WATER_HOT, mid: WATER_WARM, ret: WATER_COLD } : { flow: WATER_COLD, mid: WATER_WARM, ret: WATER_HOT };
}
// Water moving inside a pipe: light bands and small bubbles slide along the
// path in the flow direction. They are only drawn moving while the afterheat
// is active; otherwise the water stands still.
function WaterCurrent({ d }: { d: string }) {
  return <g className="water-flow"><path className="water-current" d={d}/><path className="water-bubbles" d={d}/></g>;
}
function WaterCoil({ heating, lockout, flowWater, returnWater }: { heating: boolean; lockout: boolean; flowWater: Num; returnWater: Num }) {
  const local = ([x, y]: Point): Point => [x - COIL_AT[0], y - COIL_AT[1]];
  const [sx, sy] = local(WATER_SUPPLY_TO), [rx, ry] = local(WATER_RETURN_TO), [vx, vy] = local(WATER_VALVE_AT);
  const colours = waterPath(flowWater, returnWater);
  const pipes = [
    ["supply", `M${sx} ${sy} H-38 Q-30 ${sy} -30 ${sy - 8} V68`, colours.flow],
    ["return", `M30 68 V${ry - 8} Q30 ${ry} 22 ${ry} H${rx}`, colours.ret],
  ] as const;
  // The flow enters the left pass and leaves the right one, so the coil
  // fades left to right from the flow colour through the middle to the return.
  return <g className={`hch-external-coil hch-water-coil${heating ? " active" : ""}`} transform={`translate(${COIL_AT[0]} ${COIL_AT[1]})`}>
    <defs>
      <linearGradient id="waterCoilTint" gradientUnits="userSpaceOnUse" x1="-30" y1="0" x2="30" y2="0"><stop offset="0" stopColor={colours.flow}/><stop offset=".5" stopColor={colours.mid}/><stop offset="1" stopColor={colours.ret}/></linearGradient>
    </defs>
    {pipes.map(([kind, d, colour]) => <g key={kind} className={`water-pipe ${kind}`}><path className="water-pipe-shell" d={d}/><path className="water-pipe-core" d={d} style={{ stroke: colour }}/><WaterCurrent d={d}/></g>)}
    <g className="water-valve" transform={`translate(${vx} ${vy})`}><path className="valve-body" d="M-8 -6 L8 6 V-6 L-8 6 Z"/><rect className="valve-actuator" x="-5" y="7" width="10" height="7" rx="2"/></g>
    <rect className="coil-case" x="-48" y="-68" width="96" height="136" rx="12"/><rect className="coil-duct" x="-61" y="-48" width="122" height="96" rx="20"/>
    {WATER_FINS.map(y => <path key={y} className="coil-fin" d={`M-44 ${y} H44`}/>)}
    <path className="water-tube-shell" d={WATER_TUBE}/><path className="water-tube-core" d={WATER_TUBE} stroke="url(#waterCoilTint)"/><WaterCurrent d={WATER_TUBE}/>
    {lockout && <LockoutBadge/>}
  </g>;
}

export function Hch5UnitDiagram(props:Hch5UnitDiagramProps) {
  const {onSensor,outdoor,extract,exhaust,afterHeater,beforeHeater=null,frost,flowWater,returnWater,supplyRpm,extractRpm,supplyPercent,extractPercent,fanLevel=null,bypassActual,bypassRequest,heating,recovery,busActive=false,bypassRaw=null,bypassTravelDirection=null,bypassTravelSeconds=null,bypassTravelTotal=null,afterheatLockout=false,afterheatCoil="electric",control=null,controlCompact=false}=props;
  const water = afterheatCoil === "water";
  // Afkøl: how much the water cools across the coil, as in the WebUI.
  const waterDelta = flowWater === null || returnWater === null ? null : flowWater - returnWater;
  // The unit reports only closed/opening/closing/open and needs about three
  // minutes, so progress is the time since the damper left its end position;
  // the blade and the fog follow that estimate, and On counts as opening from
  // the moment it is read back.
  const bypassCode=typeof bypassRaw==="number"&&Number.isFinite(bypassRaw)?Math.min(255,Math.max(0,bypassRaw)):null;
  const settledOpen=bypassCode===null?bypassActual:bypassCode>=255;
  const bypassWanted=bypassRequest.toLowerCase()==="on";
  const observedMotion=useBypassMotion(bypassCode??(settledOpen?255:0),bypassCode!==null&&bypassCode>0&&bypassCode<255);
  const travel=bypassTravel({raw:bypassCode,requestOn:bypassWanted,direction:bypassTravelDirection,seconds:bypassTravelSeconds,total:bypassTravelTotal,observed:observedMotion});
  const bypassPhase:BypassPhase=travel?travel.direction??"moving":null;
  const bypassPosition=bypassOpenShare(travel,settledOpen);
  const bypassOpen=bypassPosition>=.5;
  // The card's afterheat_before entity carries the unit's T2, which is T2AH
  // relayed to the unit, so it is not a before-coil measurement for colours.
  const air=airStops(outdoor,extract,exhaust,afterHeater,beforeHeater,heating,recovery,bypassOpen);
  const [coreOpen,toggleCore]=useCoreView();
  const bypassPercent=travel?.percent??null;
  const bypassRemaining=travel?.remainingSeconds??null;
  const bypassAwaitingEnd=travel?.awaitingEnd??false;
  const bypassLabel=bypassPhase?`${BYPASS_PHASE_LABEL[bypassPhase]}${bypassPercent===null?"":` ${bypassPercent} %`}`:bypassOpen?"Åben":"Lukket";
  // Extract is drawn on both routes; the damper position cross-fades the fog
  // from the core to the bottom channel as it opens, and back as it closes.
  const coreRoute={opacity:1-bypassPosition} as CSSProperties; const bypassRoute={opacity:bypassPosition} as CSSProperties;
  const bladeAngle=Math.round(90*(1-bypassPosition)*10)/10;
  // A stable period prevents airflow from jumping whenever the fan reports
  // a slightly different RPM. The numeric RPM readback remains live.
  const supplySpeed=supplyRpm&&supplyRpm>0?12:0; const extractSpeed=extractRpm&&extractRpm>0?12:0;
  const svgRef=useRef<SVGSVGElement>(null);
  useEffect(() => {
    const level=fanLevel===null?4:Math.max(1,Math.min(6,Math.round(fanLevel)));
    const rate=[0.65,0.8,0.95,1.1,1.25,1.4][level-1];
    // Web Animations changes the playback rate without resetting currentTime.
    // Small RPM changes never touch the animation clock.
    svgRef.current?.querySelectorAll('.hch-fan-rotor, .hch-air-wisp, .hch-airflow-guide').forEach(node => {
      node.getAnimations().forEach(animation => animation.updatePlaybackRate(rate));
    });
  }, [fanLevel,supplySpeed,extractSpeed]);
  // Fog fades in at the room-side readings and out where the far ducts end.
  const fadeSpan=REAR_FADE.to-VIEW.x; const fadeAt=(x:number)=>Math.round((x-VIEW.x)/fadeSpan*1000)/1000;
  // Back edges of the cabinet's floor and right-hand wall, one cabinet depth in.
  const {x:ox,y:oy,width:ow,height:oh}=OPENING;
  const backX=ox+ow+CABINET_DEPTH[0], backY=oy+oh+CABINET_DEPTH[1];
  const view=VIEW;
  return <div className={`hch5-visual${bypassOpen?" is-bypass":" is-recovery"}`}>
    <svg ref={svgRef} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} role="img" aria-label="HCH5 luftstrøm med intern bypass og ekstern eftervarme">
      <defs>
        <linearGradient id="metalFace" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#596b76"/><stop offset=".4" stopColor="#263843"/><stop offset="1" stopColor="#14242e"/></linearGradient>
        <linearGradient id="metalTop" x1="0" x2="1"><stop offset="0" stopColor="#7b8991"/><stop offset=".48" stopColor="#40515b"/><stop offset="1" stopColor="#263640"/></linearGradient>
        <linearGradient id="metalSide" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#6b7d88"/><stop offset=".55" stopColor="#3a4c57"/><stop offset="1" stopColor="#223440"/></linearGradient>
        <linearGradient id="exchangerMetal" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#8e9aa1"/><stop offset=".55" stopColor="#455760"/><stop offset="1" stopColor="#25353e"/></linearGradient>
        <linearGradient id="cavityFloor" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#0a1a24"/><stop offset="1" stopColor="#173041"/></linearGradient>
        <linearGradient id="cavityWall" x1="0" x2="1"><stop offset="0" stopColor="#0b1a23"/><stop offset="1" stopColor="#1b3445"/></linearGradient>
        <linearGradient id="rearDuctMetal" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#8a99a2"/><stop offset=".42" stopColor="#4a5d68"/><stop offset="1" stopColor="#15242d"/></linearGradient>
        <linearGradient id="fanDrum" x1="0" x2="1"><stop offset="0" stopColor="#2c4452"/><stop offset="1" stopColor="#0c1a22"/></linearGradient>
        {/* Supply runs right to left (outdoor blue to supply green), extract left to right. */}
        <AirGradient id="supplyFlow" stops={air.supply} from={AIR_SPAN.outdoor} to={AIR_SPAN.room}/>
        <AirGradient id="extractFlow" stops={air.extract} from={AIR_SPAN.room} to={AIR_SPAN.outdoor}/>
        <AirGradient id="supplyWisp" stops={air.supply} from={AIR_SPAN.outdoor} to={AIR_SPAN.room} light/>
        <AirGradient id="extractWisp" stops={air.extract} from={AIR_SPAN.room} to={AIR_SPAN.outdoor} light/>
        <filter id="fogBlur" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="11"/></filter>
        <filter id="unitShadow" x="-30%" y="-40%" width="170%" height="190%"><feDropShadow dx="0" dy="18" stdDeviation="18" floodColor="#000" floodOpacity=".42"/></filter>
        <pattern id="filterMesh" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#1a2d37"/><path d="M0 8L8 0M-2 2L2-2M6 10L10 6" stroke="#aab9c1" strokeWidth="1" opacity=".6"/></pattern>
        <linearGradient id="fogFadeGradient" gradientUnits="userSpaceOnUse" x1={VIEW.x} x2={REAR_FADE.to}><stop offset="0" stopColor="#fff" stopOpacity="0"/><stop offset={fadeAt(ROOM_SIDE_X+30)} stopColor="#fff" stopOpacity="1"/><stop offset={fadeAt(REAR_FADE.from)} stopColor="#fff" stopOpacity="1"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></linearGradient>
        {/* userSpaceOnUse: the default mask region is only 120% of the fog
            group's geometric height, which cut the wide blurred bands off
            flat at the top and bottom. */}
        <mask id="fogFadeMask" maskUnits="userSpaceOnUse" x={VIEW.x} y={VIEW.y} width={VIEW.width} height={VIEW.height}><rect x={VIEW.x} y={VIEW.y} width={VIEW.width} height={VIEW.height} fill="url(#fogFadeGradient)"/></mask>
        <mask id="coreSolidMask" maskUnits="userSpaceOnUse" x={VIEW.x} y={VIEW.y} width={VIEW.width} height={VIEW.height}><rect x={VIEW.x} y={VIEW.y} width={VIEW.width} height={VIEW.height} fill="#fff"/><g filter="url(#coreMaskEdge)">{prismSides(CORE_CORNERS, CORE_DEPTH).map(face => <polygon key={face.points} points={face.points} fill="#000"/>)}<polygon points={CORE_POINTS} fill="#000"/></g></mask>
        <filter id="coreMaskEdge" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="5"/></filter>
        <linearGradient id="rearDuctFadeGradient" gradientUnits="userSpaceOnUse" x1={REAR_FADE.from} x2={REAR_FADE.to}><stop offset="0" stopColor="#fff" stopOpacity="1"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></linearGradient>
        <linearGradient id="rearDuctFadeGradient" gradientUnits="userSpaceOnUse" x1={REAR_FADE.from} x2={REAR_FADE.to}><stop offset="0" stopColor="#fff" stopOpacity="1"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></linearGradient>
        <mask id="rearDuctFade" maskUnits="userSpaceOnUse" x="900" y={VIEW.y} width="320" height={VIEW.height}><rect x="900" y={VIEW.y} width="320" height={VIEW.height} fill="url(#rearDuctFadeGradient)"/></mask>
        <clipPath id="coreClip"><polygon points={CORE_POINTS}/></clipPath>
        {/* Everything inside the cabinet is seen through its open front. */}
        <clipPath id="cabinetOpening"><rect x={ox} y={oy} width={ow} height={oh} rx="5"/></clipPath>
        <linearGradient id="ductPipe" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#7b8991"/><stop offset=".45" stopColor="#40515b"/><stop offset="1" stopColor="#1a2a33"/></linearGradient>
        <radialGradient id="fanHub" cx=".38" cy=".35" r=".75"><stop offset="0" stopColor="#c9d8e0"/><stop offset=".5" stopColor="#5f7a8a"/><stop offset="1" stopColor="#1d303b"/></radialGradient>
        <radialGradient id="fanBlur"><stop offset=".3" stopColor="#68bcf0" stopOpacity="0"/><stop offset=".78" stopColor="#68bcf0" stopOpacity=".32"/><stop offset="1" stopColor="#a8ddff" stopOpacity=".08"/></radialGradient>
      </defs>
      <ellipse className="hch-floor-shadow" cx="560" cy="483" rx="380" ry="32"/>
      {/* The far-end ducts start behind the cabinet's front edge. */}
      <RearDuct y={205}/><RearDuct y={365}/>
      <g filter="url(#unitShadow)">
        {/* One consistent oblique projection, depth going up-left: the top and
            the afterheat end (left) are seen as closed faces, the exhaust end
            recedes out of view. */}
        <polygon className="hch-top-panel" points="188,132 154,102 890,102 924,132" fill="url(#metalTop)"/>
        <path className="hch-top-fold" d="M172 113 H884 L907 132 H188"/>
        <rect className="hch-cabinet" x="188" y="132" width="736" height="302" rx="8" fill="url(#metalFace)"/>
        <polygon className="hch-side-panel" points="188,132 154,102 154,404 188,434" fill="url(#metalSide)"/>
        <polygon className="hch-side-inset" points="182,146 160,127 160,398 182,420"/>
        <path className="hch-side-seam" d="M166 140 V388 M175 149 V406"/>
        <rect className="hch-inner" x={ox} y={oy} width={ow} height={oh} rx="5"/>
        <rect className="hch-opening-gasket" x={ox-8} y={oy-8} width={ow+16} height={oh+16} rx="9"/>
        {[[199,144],[916,144],[199,423],[916,423]].map(([x,y])=><g key={`${x}-${y}`} className="hch-cabinet-fastener" transform={`translate(${x} ${y})`}><circle r="4"/><path d="M-2 0 H2"/></g>)}
        <g clipPath="url(#cabinetOpening)">
          {/* Looking in through the open front, the floor and the right-hand
              wall of the cabinet recede along the same depth as its top. */}
          <polygon className="hch-cavity-floor" points={pointList([[ox,backY],[backX,backY],[ox+ow,oy+oh],[ox,oy+oh]])}/>
          <polygon className="hch-cavity-wall" points={pointList([[backX,oy],[ox+ow,oy],[ox+ow,oy+oh],[backX,backY]])}/>
          <path className="hch-cavity-edge" d={`M${ox} ${backY} H${backX} V${oy}`}/>
          <path className="hch-cavity-rail" d="M225 407 H858 M225 157 H855"/>
          <Filter x={262} y={206} angle={24} label="Filter · udsugning"/><Filter x={866} y={204} angle={-24} label="Filter · udeluft"/>
          <rect className="hch-bypass-channel" x="300" y="371" width="482" height="34" rx="12"/><rect className="hch-bypass-channel-glow" x="300" y="371" width="482" height="34" rx="12" style={bypassRoute}/>
          <text className="hch-channel-label" x="541" y="393" textAnchor="middle">Bypass-kanal</text>
          <Exchanger bypassed={bypassOpen}/>
          {/* While the damper travels, the core says which way and how far open
              its estimated time based progress, with a bar that follows it. */}
          {bypassPhase
            ? <g className={`hch-bypass-progress ${bypassPhase}`}>
                <text className="hch-exchanger-title" x="520" y="242" textAnchor="middle">{BYPASS_PHASE_TITLE[bypassPhase]}</text>
                <text className="hch-recovery" x="520" y="276" textAnchor="middle">{bypassPercent===null?"Kører…":`${bypassPercent} %`}</text>
                <path className="bypass-progress-track" d={BYPASS_PROGRESS} pathLength={100}/>
                {bypassPercent===null
                  ? <path className="bypass-progress-fill indeterminate" d={BYPASS_PROGRESS} pathLength={100}/>
                  : <path className="bypass-progress-fill" d={BYPASS_PROGRESS} pathLength={100} style={{strokeDasharray:`${bypassPercent} 100`}}/>}
                <text className="hch-bypass-countdown" x="520" y="315" textAnchor="middle">{bypassAwaitingEnd?"Afventer endestilling":bypassRemaining===null?"Spjældet kører ca. 3 min":`ca. ${formatRemaining(bypassRemaining)} tilbage`}</text>
              </g>
            : <><text className="hch-exchanger-title" x="520" y="255" textAnchor="middle">Varmeveksler</text></>}
          {[["P3",438,204],["P1",602,204],["P2",438,334],["P4",602,334]].map(([port,x,y])=><text key={port} className="hch-core-port" x={x} y={y} textAnchor="middle">{port}</text>)}
          <Fan x={770} y={212} rpm={supplyRpm} label="Tilluft"/><Fan x={800} y={330} rpm={extractRpm} label="Fraluft" labelRight/>
          {/* Bypass damper sits on the lower (extract) fan motor, orange actuator at the bottom. */}
          <g className={`hch-bypass ${bypassOpen?"open":"closed"}${bypassPhase?" moving":""}`} transform="translate(800 386)">
            <rect className="damper-frame" x="-17" y="-12" width="34" height="24" rx="5"/>
            <rect className="bypass-blade" x="-12" y="-3" width="24" height="6" rx="3" style={{transform:`rotate(${bladeAngle}deg)`}}/>
            <rect className="bypass-actuator" x="-15" y="13" width="30" height="11" rx="4"/>
          </g>
          <rect className="hch-service-box" x="214" y="374" width="80" height="36" rx="8"/><text className="hch-part-label" x="254" y="397" textAnchor="middle">Styring</text>
        </g>
      </g>
      <DuctCollar x={164} y={205}/><DuctCollar x={164} y={365}/>
      {water ? <WaterCoil heating={heating} lockout={afterheatLockout} flowWater={flowWater} returnWater={returnWater}/> : <ElectricCoil heating={heating} lockout={afterheatLockout}/>}
      <Rs485Wiring active={busActive} water={water}/>
      {/* The core looks solid unless the user has opened it: the air layers are
          masked out where they pass through it, with a soft edge. */}
      <g className="hch-air-layer" mask={coreOpen ? undefined : "url(#coreSolidMask)"}>
        <g className="hch-fog-group" filter="url(#fogBlur)" mask="url(#fogFadeMask)">
          <path className="hch-fog hch-fog-supply hch-fog-a" d={NORMAL_SUPPLY} style={{"--flow-speed":supplySpeed?`${supplySpeed}s`:"0s"} as CSSProperties}/><path className="hch-fog hch-fog-supply hch-fog-b" d={NORMAL_SUPPLY} style={{"--flow-speed":supplySpeed?`${supplySpeed*1.35}s`:"0s"} as CSSProperties}/>
          {([["route-core",NORMAL_EXTRACT,coreRoute],["route-bypass",BYPASS_EXTRACT,bypassRoute]] as const).map(([route,path,style])=><g key={route} className={`hch-fog-route ${route}`} style={style}><path className="hch-fog hch-fog-extract hch-fog-a" d={path} style={{"--flow-speed":extractSpeed?`${extractSpeed}s`:"0s"} as CSSProperties}/><path className="hch-fog hch-fog-extract hch-fog-b" d={path} style={{"--flow-speed":extractSpeed?`${extractSpeed*1.35}s`:"0s"} as CSSProperties}/></g>)}
        </g>
        <g className="hch-wisp-group" mask="url(#fogFadeMask)">
          <AirWisps path={NORMAL_SUPPLY} kind="supply" speed={supplySpeed}/>
          {EXTRACT_ROUTES.map(([route,path])=><g key={route} className={`hch-fog-route ${route}`} style={route==="route-core"?coreRoute:bypassRoute}><AirWisps path={path} kind="extract" speed={extractSpeed}/></g>)}
        </g>
        <g className="hch-airflow-guides" mask="url(#fogFadeMask)">
          <path className="hch-airflow-guide hch-supply-flow" d={NORMAL_SUPPLY} style={{"--flow-speed":supplySpeed?`${supplySpeed}s`:"0s"} as CSSProperties}/>
          {([["route-core",NORMAL_EXTRACT,coreRoute],["route-bypass",BYPASS_EXTRACT,bypassRoute]] as const).map(([route,path,style])=><g key={route} className={`hch-fog-route ${route}`} style={style}><path className="hch-airflow-guide hch-extract-flow" d={path} style={{"--flow-speed":extractSpeed?`${extractSpeed}s`:"0s"} as CSSProperties}/></g>)}
        </g>
      </g>
      <polygon className={`hch-core-toggle${coreOpen ? " open" : ""}`} points={CORE_POINTS} role="button" tabIndex={0} aria-pressed={coreOpen} aria-label={coreOpen ? "Vis veksleren massiv" : "Vis luften gennem veksleren"} onClick={toggleCore} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggleCore(); } }}><title>{coreOpen ? "Tryk for at gøre veksleren massiv igen" : "Tryk for at se luften gennem veksleren (1 min)"}</title></polygon>
      {/* The recovery value sits above the core toggle and opens its own history. */}
      {!bypassPhase && <g className="hch-recovery-hit" role="button" tabIndex={0} aria-label={`Varmegenvinding ${recovery===null?"ukendt":`${recovery} %`}, vis historik`} onClick={() => onSensor?.("heat_recovery")} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSensor?.("heat_recovery"); } }}>
        <rect x="462" y="264" width="116" height="40" rx="10"/>
        <text className="hch-recovery" x="520" y="293" textAnchor="middle">{bypassOpen?"BYPASS":recovery===null?"—":`${recovery}%`}</text>
      </g>}
      {/* Keep the physical readbacks on the unit at mobile sizes, as in WebUI. */}
      <TempPort cx={1112} cy={rearFarY(205)} title="Udeluft · T1" sensor="outdoor_temperature" onSensor={onSensor} value={fmt(outdoor)} tone="cold"/>
      <TempPort cx={1112} cy={rearFarY(365)} title="Afkast · T4" sensor="exhaust_temperature" onSensor={onSensor} value={fmt(exhaust)} tone="warm"/>
      <TempPort cx={-150} cy={205} title="Udsugning · T3" sensor="extract_temperature" onSensor={onSensor} value={fmt(extract)} tone="warm"/>
      <TempPort cx={-150} cy={365} title="Indblæsning · T2AH" sensor="afterheat_after" onSensor={onSensor} value={fmt(afterHeater)} tone="green"/>
      <SensorPin x={57} y={292} label="Frost" sensor="afterheat_frost" onSensor={onSensor} value={fmt(frost,"°")}/>
      {/* Measured T2 on the supply duct between the unit and the afterheat coil, as in the WebUI. */}
      {beforeHeater !== null && <SensorPin x={150} y={331} lift={38} width={92} label="T2 · målt" sensor="afterheat_before" onSensor={onSensor} value={fmt(beforeHeater,"°")}/>}
      {control && <ControlPanel control={control} compact={controlCompact}/>}
      <g className="hch-water-callout" transform="translate(-236 424)"><rect width="166" height="90" rx="12"/><text x="14" y="20">{water ? "Vandvarmeflade" : "Eftervarmevand"}</text><text className="water-value" x="14" y="40" role={onSensor ? "button" : undefined} tabIndex={onSensor ? 0 : undefined} onClick={() => onSensor?.("water_flow")} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSensor?.("water_flow"); } }}>Fremløb {fmt(flowWater)}</text><text className="water-value" x="14" y="60" role={onSensor ? "button" : undefined} tabIndex={onSensor ? 0 : undefined} onClick={() => onSensor?.("water_return")} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSensor?.("water_return"); } }}>Retur {fmt(returnWater)}</text><text className="water-value water-delta" x="14" y="80">Afkøl {fmt(waterDelta)}</text></g>
    </svg>
    <div className="hch-mobile-flow" aria-label="HCH5 luftstrømme og temperaturer">
      <div className="hch-mobile-flow-head"><span>LUFTVEJE</span><strong>HCH5</strong><span className={busActive ? "connected" : ""}>{busActive ? "Bus aktiv" : "Afventer bus"}</span></div>
      <div className="hch-mobile-lane supply">
        <button type="button" className="hch-mobile-reading" onClick={() => onSensor?.("outdoor_temperature")} aria-label="Vis historik for udeluft T1"><small>Udeluft · T1</small><strong>{fmt(outdoor)}</strong></button>
        <div className="hch-mobile-route"><span>→</span><i/><span>→</span></div>
        <button type="button" className="hch-mobile-reading" onClick={() => onSensor?.("afterheat_after")} aria-label="Vis historik for indblæsning T2AH"><small>Ind · T2AH</small><strong>{fmt(afterHeater)}</strong></button>
      </div>
      <div className="hch-mobile-core"><span>VARMEGENVINDING</span><strong>{recovery === null ? "—" : `${recovery}%`}</strong><span className={bypassOpen ? "bypass-open" : ""}>{bypassPhase ? bypassLabel : bypassOpen ? "Bypass åben" : "Bypass lukket"}</span></div>
      <div className="hch-mobile-lane extract">
        <button type="button" className="hch-mobile-reading" onClick={() => onSensor?.("extract_temperature")} aria-label="Vis historik for fraluft T3"><small>Fraluft · T3</small><strong>{fmt(extract)}</strong></button>
        <div className="hch-mobile-route"><span>→</span><i/><span>→</span></div>
        <button type="button" className="hch-mobile-reading" onClick={() => onSensor?.("exhaust_temperature")} aria-label="Vis historik for afkast T4"><small>Afkast · T4</small><strong>{fmt(exhaust)}</strong></button>
      </div>
      <div className="hch-mobile-subreadings">
        <div className="hch-mobile-water"><span>Vand frem / retur</span><strong><button type="button" aria-label="Vis historik for vand fremløb" onClick={() => onSensor?.("water_flow")}>{fmt(flowWater)}</button><span> / </span><button type="button" aria-label="Vis historik for vand retur" onClick={() => onSensor?.("water_return")}>{fmt(returnWater)}</button></strong></div>
        <button type="button" onClick={() => onSensor?.("afterheat_frost")}>Frost <strong>{fmt(frost)}</strong></button>
        <div className="hch-mobile-water hch-mobile-water-delta"><span>Afkøl</span><strong>{fmt(waterDelta)}</strong></div>
      </div>
      <div className="hch-mobile-water-badge"><small>Vand frem/retur</small><strong><button type="button" aria-label="Vis historik for vand fremløb" onClick={() => onSensor?.("water_flow")}>{fmt(flowWater).replace("°C", "")}</button><span>/</span><button type="button" aria-label="Vis historik for vand retur" onClick={() => onSensor?.("water_return")}>{fmt(returnWater)}</button></strong><small>Afkøl <b>{fmt(waterDelta)}</b></small></div>
    </div>
    <div className="unit-readback-row" onClick={e => { const key = (e.target as Element).closest("[data-sensor]")?.getAttribute("data-sensor"); if (key) onSensor?.(key); }}><div className="unit-readback" data-sensor="supply_fan_rpm"><span className="readback-icon fan"/><div><small>Tilluft ventilator</small><strong>{int(supplyRpm)} RPM</strong><em data-sensor="supply_fan_percent">{int(supplyPercent)}%</em></div></div><div className="unit-readback" data-sensor="extract_fan_rpm"><span className="readback-icon fan"/><div><small>Fraluft ventilator</small><strong>{int(extractRpm)} RPM</strong><em data-sensor="extract_fan_percent">{int(extractPercent)}%</em></div></div><div className="unit-readback" data-sensor="bypass_raw"><span className={`readback-icon damper ${bypassOpen?"active":""}`}/><div><small>Bypass-spjæld</small><strong>{bypassPhase?bypassLabel:bypassOpen?"Åbent":"Lukket"}</strong><em>{bypassAwaitingEnd?"Afventer endestilling":bypassRemaining===null?`Ønske: ${bypassWanted?"On":"Auto"}`:`ca. ${formatRemaining(bypassRemaining)} tilbage`}</em></div></div><div className="unit-readback" data-sensor="afterheat_active"><span className={`readback-icon heater ${heating?"active":""}`}/><div><small>Ekstern eftervarme</small><strong>{heating?"Aktiv":afterheatLockout?"Spærret":"Ikke aktiv"}</strong><em>{afterheatLockout?"Sommerstop: ude ≥ 15 °C":"Kun setpunkt styres"}</em></div></div></div>
  </div>;
}
