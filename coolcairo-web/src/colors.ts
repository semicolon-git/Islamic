// Colour scales for the map. Data colours are fixed across light and dark themes so a block's
// colour always means the same thing; only the UI chrome follows the theme.

export type RGB = [number, number, number];
export type View = "heat" | "risk" | "materials" | "effect" | "growth";
export type HeatPalette = "report" | "inferno" | "warm";

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

export function ramp(stops: [string, number][]) {
  const s = stops.map(([c, t]) => [hex(c), t] as const);
  return (t: number): RGB => {
    const x = Math.min(1, Math.max(0, t));
    for (let k = 1; k < s.length; k++) {
      if (x <= s[k][1]) {
        const [c0, t0] = s[k - 1], [c1, t1] = s[k];
        const f = (x - t0) / (t1 - t0 || 1);
        return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
      }
    }
    return s[s.length - 1][0] as RGB;
  };
}

// Methodology report colours: diverging, neutral light grey on the typical urban block.
export const HEAT_RAMPS: Record<HeatPalette, (t: number) => RGB> = {
  report: ramp([["#174A8B", 0], ["#2A78D6", 0.25], ["#F0EFEC", 0.5], ["#EB6834", 0.75], ["#9C3A14", 1]]),
  inferno: ramp([["#000004", 0], ["#420A68", 0.2], ["#932667", 0.45], ["#DD513A", 0.7], ["#FCA50A", 0.88], ["#FCFFA4", 1]]),
  warm: ramp([["#FFFFB2", 0], ["#FECC5C", 0.25], ["#FD8D3C", 0.5], ["#F03B20", 0.75], ["#BD0026", 1]]),
};

// Heat exposure: peach → orange → crimson → deep purple. Zero risk is not on the ramp.
export const RISK_RAMP = ramp([["#FDD99E", 0], ["#FA9942", 0.35], ["#CC334D", 0.7], ["#541266", 1]]);
export const NO_EXCESS_HEAT = hex("#6B7A93");
export const NO_RESIDENTS = hex("#454A57");

// Plan effect (ΔLST): untouched blocks stay neutral; deeper cyan-blue = more cooling.
export const EFFECT_RAMP = ramp([["#5C6470", 0], ["#7FD3E8", 0.12], ["#2C9BD4", 0.45], ["#1B4F9C", 0.8], ["#160F5E", 1]]);

export const MATERIAL = {
  pale: hex("#DBD4C2"),
  dark: hex("#38383D"),
  veg: hex("#548C45"),
  sand: hex("#D6B37D"),
  coolRoof: hex("#A8EEFF"),
  coolPavement: hex("#409ED9"),
  wall: hex("#B8B0A3"),
};

export const GROWTH: Record<number, RGB> = {
  3: hex("#EB6834"), // newly built
  2: hex("#F2C14E"), // denser
  1: hex("#737A8A"), // built before, little change
  0: hex("#A08F6C"), // still open
};

export const NO_DATA = hex("#7F7F7F");

/** Treatment ring colours, one per measure (also the tool swatches). */
export const MEASURE_COLOR = {
  roof: "#A8EEFF",
  trees: "#4CD08A",
  pavement: "#409ED9",
  park: "#C8E64A",
} as const;

export const css = (c: RGB) => `rgb(${Math.round(c[0] * 255)} ${Math.round(c[1] * 255)} ${Math.round(c[2] * 255)})`;

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function gradientCss(f: (t: number) => RGB, steps = 12) {
  const parts: string[] = [];
  for (let k = 0; k <= steps; k++) parts.push(`${css(f(k / steps))} ${((100 * k) / steps).toFixed(1)}%`);
  return `linear-gradient(90deg, ${parts.join(", ")})`;
}
