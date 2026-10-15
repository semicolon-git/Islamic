// Mirrors export/district.json, written by analysis/src/coolcairo/export.py (schema version 1).
// World origin = south-west corner of the block grid. +x = east, +z = north, metres.
// Block arrays are row-major with row 0 = south.

export interface BlockArrays {
  valid: number[];
  lstC: number[];
  vegFrac: number[];
  darkRoofFrac: number[];
  paleRoofFrac: number[];
  darkGroundFrac: number[];
  soilFrac: number[];
  roofFrac: number[];
  meanHeightM: number[];
  population: number[];
  builtFirst?: number[];
  builtLast?: number[];
  /** 0 still open, 1 built before, 2 built before and denser, 3 newly built. */
  growthClass?: number[];
}

export interface BuildingArrays {
  count: number;
  vertexStart: number[];
  vertexCount: number[];
  heightM: number[];
  blockIndex: number[];
  xz: number[];
}

export interface ModelCoefficients {
  intercept: number;
  vegFrac: number;
  darkRoofFrac: number;
  darkGroundFrac: number;
  soilFrac: number;
  roofFrac: number;
  meanHeightM: number;
  r2SpatialCv: number;
  maeSpatialCv: number;
  nBlocks: number;
  coolRoofDarkDeltaC: number;
  coolRoofPaleDeltaC: number;
  coolRoofMethod: string;
  coolPavementDeltaC: number;
  pocketParkDeltaC: number;
  treeMaxShare: number;
  parkMaxShare: number;
  heatReferenceC: number;
}

export interface SourceInfo {
  satellite: string;
  collection: string;
  use: string;
  sceneIds: string[];
  firstDate: string;
  lastDate: string;
}

export interface GrowthInfo {
  available: number;
  firstYear: number;
  lastYear: number;
  builtFirstKm2: number;
  builtLastKm2: number;
  newBlocks: number;
  denserBlocks: number;
  denserMin: number;
  source: string;
}

export interface District {
  schemaVersion: number;
  name: string;
  crs: string;
  originX: number;
  originY: number;
  blockSize: number;
  rows: number;
  cols: number;
  blocks: BlockArrays;
  buildings: BuildingArrays;
  model: ModelCoefficients;
  sources?: SourceInfo[];
  hyperspectral?: { available: number; acquired: string; r2Multispectral: number; r2Hyperspectral: number; attribution: string };
  growth?: GrowthInfo;
}

export function parseDistrict(raw: unknown): District {
  const d = raw as District;
  if (d.schemaVersion !== 1) throw new Error(`Unsupported district schema ${d.schemaVersion}`);
  const n = d.rows * d.cols;
  for (const [k, v] of Object.entries(d.blocks)) {
    if (Array.isArray(v) && v.length !== n) throw new Error(`blocks.${k} has ${v.length} values, expected ${n}`);
  }
  return d;
}

export function hasGrowth(d: District): boolean {
  return d.growth?.available === 1 && d.blocks.growthClass?.length === d.rows * d.cols;
}

export const blockCount = (d: District) => d.rows * d.cols;
export const rowOf = (d: District, i: number) => Math.floor(i / d.cols);
export const colOf = (d: District, i: number) => i % d.cols;
