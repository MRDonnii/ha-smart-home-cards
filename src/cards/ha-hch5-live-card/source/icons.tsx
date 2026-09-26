// The six lucide icons the WebUI overview uses (lucide-react 1.47, ISC),
// inlined so the card does not bundle the whole icon package.
type IconProps = { size?: number };

function icon(paths: string[]) {
  return function Icon({ size = 24 }: IconProps) {
    return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths.map(d => <path key={d} d={d}/>)}</svg>;
  };
}

export const ArrowRight = icon(["M5 12h14", "m12 5 7 7-7 7"]);
export const Flame = icon(["M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"]);
export const Gauge = icon(["m12 14 4-4", "M3.34 19a10 10 0 1 1 17.32 0"]);
export const Roof = icon(["M3 11 12 4l9 7", "M5 10v10h14V10", "M10 20v-6h4v6"]);
export const Zap = icon(["M13 2 4 14h7l-1 8 9-12h-7z"]);
export const Leaf = icon([
  "M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20",
  "M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13",
]);
export const Snowflake = icon([
  "m10 20-1.25-2.5L6 18", "M10 4 8.75 6.5 6 6", "m14 20 1.25-2.5L18 18", "m14 4 1.25 2.5L18 6",
  "m17 21-3-6h-4", "m17 3-3 6 1.5 3", "M2 12h6.5L10 9", "m20 10-1.5 2 1.5 2",
  "M22 12h-6.5L14 15", "m4 10 1.5 2L4 14", "m7 21 3-6-1.5-3", "m7 3 3 6h4",
]);
export const Wind = icon(["M12.8 19.6A2 2 0 1 0 14 16H2", "M17.5 8a2.5 2.5 0 1 1 2 4H2", "M9.8 4.4A2 2 0 1 1 11 8H2"]);
