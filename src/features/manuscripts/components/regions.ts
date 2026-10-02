import type { RegionType } from "../schema";

/**
 * Overlay colours per region type. The page image looks the same in light and dark themes, so these are fixed,
 * chosen to read clearly on parchment and greyscale scans. Each type also has a dash pattern so colour is not the
 * only cue (WCAG 1.4.1).
 */
export const REGION_STYLE: Record<RegionType, { color: string; dash?: string }> = {
  main: { color: "#0a8c77" },
  margin: { color: "#6e5bff", dash: "10 6" },
  title: { color: "#c27a00", dash: "2 4" },
  rubric: { color: "#c0392b", dash: "2 4" },
  catchword: { color: "#1f6fd1", dash: "14 4 2 4" },
  colophon: { color: "#8a5a2b", dash: "6 3" },
  seal: { color: "#c2187a", dash: "1 3" },
  illustration: { color: "#5f6589", dash: "4 4" },
  other: { color: "#5f6589", dash: "4 4" },
};

export const regionStyle = (t: string) => REGION_STYLE[(t in REGION_STYLE ? t : "other") as RegionType];
