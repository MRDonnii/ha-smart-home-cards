import { useEffect, useRef, useState, type CSSProperties } from "react";
import { bypassOpenShare, bypassTravel, formatRemaining, type BypassDirection } from "./bypass";

type Num = number | null;
type Point = readonly [number, number];

export interface Hch5UnitDiagramProps {
  outdoor: Num;
  extract: Num;
  exhaust: Num;
  beforeHeater: Num;
  afterHeater: Num;
  room: Num;
  frost: Num;
  flowWater: Num;
  returnWater: Num;
  supplyRpm: Num;
  extractRpm: Num;
  supplyPercent: Num;
  extractPercent: Num;
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
}

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
// Temperature "ports": semi-transparent duct-cap plates centred on the flow
// line where the air fades out, so the reading marks the end of each duct.
function TempPort({ cx, cy, title, value, tone = "neutral" }: { cx: number; cy: number; title: string; value: string; tone?: string }) {
  const width = 176, height = 84;
  return (
    <g className={`hch-temp-port tone-${tone}`} transform={`translate(${cx} ${cy})`}>
      <rect className="hch-temp-port-plate" x={-width / 2} y={-height / 2} width={width} height={height} rx="18" />
      <text className="hch-temp-port-title" x="0" y={-13} textAnchor="middle">{title}</text>
      <text className="hch-temp-port-value" x="0" y={23} textAnchor="middle">{value}</text>
    </g>
  );
}
function SensorPin({ x, y, label, value, width = 84, lift = 28 }: { x:number;y:number;label:string;value:string;width?:number;lift?:number }) {
  const top = -lift - 46;
  return <g className="hch-sensor-pin" transform={`translate(${x} ${y})`}><circle r="5"/><line x1="0" y1="0" x2="0" y2={-lift}/><rect x={-width / 2} y={top} width={width} height="46" rx="9"/><text x="0" y={top + 18} textAnchor="middle">{label}</text><text className="pin-value" x="0" y={top + 38} textAnchor="middle">{value}</text></g>;
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

// Wiring view: the unit's control board, the HAC1 afterheat controller and
// the Raspberry Pi share one RS485/Modbus RTU cable (unit = slave 1, HAC1 =
// slave 0x40, Pi = gateway). HAC1 wires its own T2AH and frost sensors and
// the water valve actuator.
function Rs485Wiring({ active, compact = false }: { active: boolean; compact?: boolean }) {
  const bus = "M254 410 V496 M142 496 H600";
  return <g className={`hch-wiring${active ? " active" : ""}`}>
    <path className="hch-signal-wire" d="M2 474 V420 H-28 V371"/>
    <path className="hch-signal-wire" d="M112 474 V292 H63"/>
    <path className="hch-signal-wire" d="M23 474 V446"/>
    <path className="hch-bus-cable" d={bus}/><path className="hch-bus-core" d={bus}/>
    <rect className="hch-cable-gland" x="246" y="428" width="16" height="12" rx="3"/>
    <circle className="hch-bus-joint" cx="254" cy="496" r="4"/>
    <text className="hch-bus-label" x="425" y="486" textAnchor="middle">RS485 · Modbus RTU</text>
    <g className="hch-device hch-hac1-box"><rect className="device-body" x="-28" y="474" width="170" height="52" rx="10"/><text x="57" y="496" textAnchor="middle">HAC1 styring</text><text className="device-sub" x="57" y="515" textAnchor="middle">Modbus-slave 0x40</text>{compact&&<text className="device-compact" x="57" y="512" textAnchor="middle">HAC1</text>}</g>
    <g className="hch-device hch-pi">
      <rect className="pi-board" x="600" y="468" width="180" height="72" rx="8"/>
      {[0,1,2,3,4,5,6,7,8,9].map(i => <rect key={i} className="pi-gpio" x={628 + i * 14} y="473" width="6" height="6" rx="1"/>)}
      <rect className="pi-chip" x="612" y="490" width="28" height="28" rx="3"/>
      <text x="710" y="506" textAnchor="middle">Raspberry Pi</text><text className="device-sub" x="710" y="525" textAnchor="middle">Gateway · RS485</text>{compact&&<text className="device-compact" x="712" y="517" textAnchor="middle">Pi</text>}
    </g>
  </g>;
}

export function Hch5UnitDiagram(props:Hch5UnitDiagramProps) {
  const {outdoor,extract,exhaust,beforeHeater,afterHeater,room,frost,flowWater,returnWater,supplyRpm,extractRpm,supplyPercent,extractPercent,bypassActual,bypassRequest,heating,recovery,busActive=false,bypassRaw=null,bypassTravelDirection=null,bypassTravelSeconds=null,bypassTravelTotal=null,afterheatLockout=false}=props;
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
  // Fog fades in at the room-side readings and out where the far ducts end.
  const fadeSpan=REAR_FADE.to-VIEW.x; const fadeAt=(x:number)=>Math.round((x-VIEW.x)/fadeSpan*1000)/1000;
  // Back edges of the cabinet's floor and right-hand wall, one cabinet depth in.
  const {x:ox,y:oy,width:ow,height:oh}=OPENING;
  const backX=ox+ow+CABINET_DEPTH[0], backY=oy+oh+CABINET_DEPTH[1];
  const view=VIEW;
  return <div className={`hch5-visual${bypassOpen?" is-bypass":" is-recovery"}`}>
    <svg viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} role="img" aria-label="HCH5 luftstrøm med intern bypass og ekstern eftervarme">
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
        <linearGradient id="supplyFlow" x1="1" x2="0"><stop offset="0" stopColor="#4abfff"/><stop offset=".55" stopColor="#6bd2bc"/><stop offset="1" stopColor="#59dfa1"/></linearGradient>
        <linearGradient id="extractFlow" x1="0" x2="1"><stop offset="0" stopColor="#ff7171"/><stop offset=".5" stopColor="#ffae5a"/><stop offset="1" stopColor="#ff9345"/></linearGradient>
        <filter id="fogBlur" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="11"/></filter>
        <filter id="unitShadow" x="-30%" y="-40%" width="170%" height="190%"><feDropShadow dx="0" dy="18" stdDeviation="18" floodColor="#000" floodOpacity=".42"/></filter>
        <pattern id="filterMesh" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#1a2d37"/><path d="M0 8L8 0M-2 2L2-2M6 10L10 6" stroke="#aab9c1" strokeWidth="1" opacity=".6"/></pattern>
        <linearGradient id="fogFadeGradient" gradientUnits="userSpaceOnUse" x1={VIEW.x} x2={REAR_FADE.to}><stop offset="0" stopColor="#fff" stopOpacity="0"/><stop offset={fadeAt(ROOM_SIDE_X+30)} stopColor="#fff" stopOpacity="1"/><stop offset={fadeAt(REAR_FADE.from)} stopColor="#fff" stopOpacity="1"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></linearGradient>
        {/* userSpaceOnUse: the default mask region is only 120% of the fog
            group's geometric height, which cut the wide blurred bands off
            flat at the top and bottom. */}
        <mask id="fogFadeMask" maskUnits="userSpaceOnUse" x={VIEW.x} y={VIEW.y} width={VIEW.width} height={VIEW.height}><rect x={VIEW.x} y={VIEW.y} width={VIEW.width} height={VIEW.height} fill="url(#fogFadeGradient)"/></mask>
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
            : <><text className="hch-exchanger-title" x="520" y="255" textAnchor="middle">Varmeveksler</text><text className="hch-recovery" x="520" y="293" textAnchor="middle">{bypassOpen?"BYPASS":recovery===null?"—":`${recovery}%`}</text></>}
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
      <g className={`hch-external-coil${heating?" active":""}`} transform="translate(57 365)"><rect className="coil-case" x="-48" y="-68" width="96" height="136" rx="12"/><rect className="coil-duct" x="-61" y="-48" width="122" height="96" rx="20"/>{[-27,-14,-1,12,25].map(o=><path key={o} className="coil-pipe" d={`M${o} -42 C${o-12} -24 ${o+12} -8 ${o} 10 C${o-12} 27 ${o+12} 36 ${o} 43`}/>) }<circle className="water-port" cx="34" cy="-75" r="5"/><circle className="water-port" cx="-34" cy="75" r="5"/><text className="hch-part-label" x="0" y="93" textAnchor="middle">Ekstern eftervarme · HAC1</text>{afterheatLockout&&<g className="hch-lockout-badge"><rect x="-58" y="-25" width="116" height="50" rx="10"/><text x="0" y="-4" textAnchor="middle">Sommerstop</text><text x="0" y="15" textAnchor="middle">ude ≥ 15 °C</text></g>}</g>
      <Rs485Wiring active={busActive}/>
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
      {/* Keep the physical readbacks on the unit at mobile sizes, as in WebUI. */}
      <TempPort cx={1112} cy={rearFarY(205)} title="Udeluft · T1" value={fmt(outdoor)} tone="cold"/>
      <TempPort cx={1112} cy={rearFarY(365)} title="Afkast · T4" value={fmt(exhaust)} tone="warm"/>
      <TempPort cx={-150} cy={205} title="Udsugning · T3" value={fmt(extract)} tone="warm"/>
      <TempPort cx={-150} cy={365} title="Indblæsning · T2AH" value={fmt(afterHeater)} tone="green"/>
      <SensorPin x={144} y={365} label="T2 før flade" value={fmt(beforeHeater,"°")} width={112} lift={50}/><SensorPin x={-28} y={365} label="T2AH" value={fmt(afterHeater,"°")} width={74} lift={50}/><SensorPin x={57} y={292} label="Frost" value={fmt(frost,"°")}/><SensorPin x={502} y={126} label="T5 rum" value={fmt(room,"°")} width={90}/>
      <g className="hch-water-callout" transform="translate(-236 424)"><rect width="166" height="80" rx="12"/><text x="14" y="22">Eftervarmevand</text><text className="water-value" x="14" y="46">Fremløb {fmt(flowWater)}</text><text className="water-value" x="14" y="68">Retur {fmt(returnWater)}</text></g>
      <g className="hch-bypass-callout" transform="translate(806 448)"><rect width="240" height="62" rx="12"/><text x="120" y="23" textAnchor="middle">Bypass-spjæld · ønske {bypassWanted?"On":"Auto"}</text><text className="bypass-state" x="120" y="48" textAnchor="middle">{bypassLabel}{bypassRemaining===null?"":` · ${formatRemaining(bypassRemaining)}`}</text></g>
    </svg>
    <div className="hch-mobile-flow" role="img" aria-label="HCH5 luftstrømme og temperaturer">
      <div className="hch-mobile-flow-head"><span>LUFTVEJE</span><strong>HCH5</strong><span className={busActive ? "connected" : ""}>{busActive ? "Bus aktiv" : "Afventer bus"}</span></div>
      <div className="hch-mobile-lane supply">
        <div className="hch-mobile-reading"><small>Udeluft · T1</small><strong>{fmt(outdoor)}</strong></div>
        <div className="hch-mobile-route"><span>→</span><i/><span>→</span></div>
        <div className="hch-mobile-reading"><small>Tilluft · T2</small><strong>{fmt(afterHeater)}</strong></div>
      </div>
      <div className="hch-mobile-core"><span>VARMEGENVINDING</span><strong>{recovery === null ? "—" : `${recovery}%`}</strong><span className={bypassOpen ? "bypass-open" : ""}>{bypassPhase ? bypassLabel : bypassOpen ? "Bypass åben" : "Bypass lukket"}</span></div>
      <div className="hch-mobile-lane extract">
        <div className="hch-mobile-reading"><small>Fraluft · T3</small><strong>{fmt(extract)}</strong></div>
        <div className="hch-mobile-route"><span>→</span><i/><span>→</span></div>
        <div className="hch-mobile-reading"><small>Afkast · T4</small><strong>{fmt(exhaust)}</strong></div>
      </div>
      <div className="hch-mobile-subreadings"><span>Før eftervarme <strong>{fmt(beforeHeater)}</strong></span><span>Vand frem/retur <strong>{fmt(flowWater)} / {fmt(returnWater)}</strong></span><span>T5 rum <strong>{fmt(room)}</strong></span><span>Frost <strong>{fmt(frost)}</strong></span></div>
    </div>
    <div className="unit-readback-row"><div className="unit-readback"><span className="readback-icon fan"/><div><small>Tilluft ventilator</small><strong>{int(supplyRpm)} RPM</strong><em>{int(supplyPercent)}%</em></div></div><div className="unit-readback"><span className="readback-icon fan"/><div><small>Fraluft ventilator</small><strong>{int(extractRpm)} RPM</strong><em>{int(extractPercent)}%</em></div></div><div className="unit-readback"><span className={`readback-icon damper ${bypassOpen?"active":""}`}/><div><small>Bypass-spjæld</small><strong>{bypassPhase?bypassLabel:bypassOpen?"Åbent":"Lukket"}</strong><em>{bypassAwaitingEnd?"Afventer endestilling":bypassRemaining===null?`Ønske: ${bypassWanted?"On":"Auto"}`:`ca. ${formatRemaining(bypassRemaining)} tilbage`}</em></div></div><div className="unit-readback"><span className={`readback-icon heater ${heating?"active":""}`}/><div><small>Ekstern eftervarme</small><strong>{heating?"Aktiv":afterheatLockout?"Spærret":"Ikke aktiv"}</strong><em>{afterheatLockout?"Sommerstop: ude ≥ 15 °C":"Kun setpunkt styres"}</em></div></div></div>
  </div>;
}
