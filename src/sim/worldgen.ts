import { Noise3 } from './noise';
import { Rng, seedRng } from './rng';
import { getTopology, type Topology, type Vec3 } from './topology';
import { biomassCapacityFor, waterRenewal } from './formulas';
import type { Biome, CellState, GenParams } from './types';

export const DEFAULT_PARAMS: GenParams = { oceanCoverage: 0.62, ruggedness: 1, temperatureOffset: 0, moisture: 1 };

export function clampParams(p: Partial<GenParams>): GenParams {
  const c = (v: number | undefined, lo: number, hi: number, d: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
  return {
    oceanCoverage: c(p.oceanCoverage, 0.3, 0.85, DEFAULT_PARAMS.oceanCoverage),
    ruggedness: c(p.ruggedness, 0.2, 1.6, DEFAULT_PARAMS.ruggedness),
    temperatureOffset: c(p.temperatureOffset, -10, 10, 0),
    moisture: c(p.moisture, 0.4, 1.6, 1),
  };
}

interface Plate { center: Vec3; continental: boolean; drift: Vec3; }

/**
 * The terrain field is a pure function of seed + parameters that can be sampled
 * anywhere on the unit sphere. Simulation cells sample it at their centres; the
 * renderer samples it at higher resolution for visual relief, so the drawn
 * landscape and the simulated landscape share one source.
 */
export class TerrainField {
  readonly noise: Noise3;
  readonly detail: Noise3;
  readonly plates: Plate[];
  seaLevel = 0;
  hMin = -1;
  hMax = 1;

  constructor(seed: string, readonly params: GenParams) {
    const rng = new Rng(seedRng(`${seed}:terrain`));
    this.noise = new Noise3(rng);
    this.detail = new Noise3(rng);
    const plateCount = 9 + rng.int(7);
    this.plates = [];
    const continentalChance = Math.max(0.15, 1 - params.oceanCoverage * 1.05);
    for (let i = 0; i < plateCount; i++) {
      const z = rng.range(-1, 1), t = rng.range(0, Math.PI * 2), r = Math.sqrt(1 - z * z);
      const center: Vec3 = [r * Math.cos(t), z, r * Math.sin(t)];
      const d: Vec3 = [rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)];
      this.plates.push({ center, continental: rng.chance(continentalChance), drift: d });
    }
    if (!this.plates.some((p) => p.continental)) this.plates[0].continental = true;
  }

  /** Raw dimensionless height. */
  raw(v: Vec3): number {
    const n = this.noise;
    const wx = v[0] + 0.35 * n.fbm(v[0] * 1.3 + 11, v[1] * 1.3, v[2] * 1.3, 3);
    const wy = v[1] + 0.35 * n.fbm(v[0] * 1.3, v[1] * 1.3 + 23, v[2] * 1.3, 3);
    const wz = v[2] + 0.35 * n.fbm(v[0] * 1.3, v[1] * 1.3, v[2] * 1.3 + 37, 3);
    let d1 = -2, d2 = -2, p1 = 0, p2 = 0;
    for (let i = 0; i < this.plates.length; i++) {
      const c = this.plates[i].center;
      const d = wx * c[0] + wy * c[1] + wz * c[2];
      if (d > d1) { d2 = d1; p2 = p1; d1 = d; p1 = i; } else if (d > d2) { d2 = d; p2 = i; }
    }
    const a = this.plates[p1], b = this.plates[p2];
    const boundary = Math.exp(-(d1 - d2) / 0.06);
    // Convergence: plates drifting toward each other raise mountains.
    const dir: Vec3 = [b.center[0] - a.center[0], b.center[1] - a.center[1], b.center[2] - a.center[2]];
    const conv = (a.drift[0] - b.drift[0]) * dir[0] + (a.drift[1] - b.drift[1]) * dir[1] + (a.drift[2] - b.drift[2]) * dir[2];
    const convergent = Math.max(-0.4, Math.min(1, conv));
    const base = a.continental ? 0.42 : -0.42;
    const mixedBase = a.continental !== b.continental ? base * (1 - 0.5 * boundary) : base;
    const ridge = n.ridged(v[0] * 2.4 + 5, v[1] * 2.4, v[2] * 2.4, 4);
    const mountains = boundary * convergent * ridge * 0.95 * this.params.ruggedness;
    const hills = 0.18 * this.params.ruggedness * n.ridged(v[0] * 5 + 9, v[1] * 5, v[2] * 5, 3) * (a.continental ? 1 : 0.3);
    return mixedBase + 0.5 * n.fbm(v[0] * 1.7, v[1] * 1.7, v[2] * 1.7, 5) + mountains + hills;
  }

  /** Elevation in metres for a raw height. */
  toMeters(h: number): number {
    if (h >= this.seaLevel) {
      const t = (h - this.seaLevel) / Math.max(1e-6, this.hMax - this.seaLevel);
      return 5 + Math.pow(t, 1.35) * 5600 * (0.55 + 0.45 * this.params.ruggedness);
    }
    const t = (this.seaLevel - h) / Math.max(1e-6, this.seaLevel - this.hMin);
    return -40 - Math.pow(t, 0.7) * 5800;
  }
}

export interface GeneratedWorld {
  cells: CellState[];
  field: TerrainField;
}


/**
 * Build the terrain field and calibrate its sea level so the area-weighted
 * ocean fraction of the simulation cells matches the parameter. The renderer
 * calls this too, so its relief uses exactly the same calibration.
 */
export function buildTerrainField(seed: string, params: GenParams): { field: TerrainField; raw: Float64Array } {
  const topo = getTopology();
  const field = new TerrainField(seed, params);
  const n = topo.count;
  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) raw[i] = field.raw(topo.centers[i]);
  const order = [...Array(n).keys()].sort((a, b) => raw[a] - raw[b]);
  let acc = 0;
  let sea = raw[order[0]];
  for (const i of order) {
    acc += topo.areaFrac[i];
    sea = raw[i];
    if (acc >= params.oceanCoverage) break;
  }
  field.seaLevel = sea + 1e-9;
  field.hMin = raw[order[0]];
  field.hMax = raw[order[n - 1]];
  return { field, raw };
}

export function generateWorld(seed: string, params: GenParams): GeneratedWorld {
  const topo = getTopology();
  const { field, raw } = buildTerrainField(seed, params);
  const rng = new Rng(seedRng(`${seed}:resources`));
  const n = topo.count;

  const cells: CellState[] = [];
  for (let i = 0; i < n; i++) {
    const elevation = field.toMeters(raw[i]);
    cells.push(blankCell(elevation));
  }
  for (let i = 0; i < n; i++) {
    cells[i].coastal = cells[i].land && topo.neighbors[i].some((j) => !cells[j].land);
  }

  computeClimate(topo, cells, params);
  computeDrainage(topo, cells);
  computeEcology(topo, cells, rng, field);
  return { cells, field };
}

function blankCell(elevation: number): CellState {
  return {
    elevation, land: elevation > 0, coastal: false, baseTemp: 0, temperature: 0, basePrecip: 0, precip: 0,
    moisture: 0.5, drought: 0, fertilityBase: 0, soil: 1, flow: 0, downhill: -1, river: false,
    waterStock: 0, waterCap: 0, biome: 'ocean', biomass: 0, biomassCap: 0, fish: 0, fishCap: 0,
    ore: 0, oreInitial: 0, degradation: 0, pollution: 0, conserved: false, owner: -1, harvest: 0,
  };
}

export function baseTemperature(latDeg: number, elevation: number, offset: number): number {
  const lapse = elevation > 0 ? elevation * 0.0065 : 0;
  return 29 - 45 * Math.pow(Math.abs(latDeg) / 90, 1.4) - lapse + offset;
}

/** Zonal precipitation band (mm/yr): wet ITCZ, dry subtropics, wet mid-latitudes, dry poles. */
export function zonalPrecip(latDeg: number): number {
  const a = Math.abs(latDeg);
  const v = 2300 * Math.exp(-((latDeg / 13) ** 2)) + 1100 * Math.exp(-(((a - 50) / 14) ** 2)) + 300 - 260 * Math.exp(-(((a - 26) / 8) ** 2));
  return Math.max(60, v);
}

/** Unit vector pointing east at a surface position (y is the rotation axis). */
export function eastAt(c: Vec3): Vec3 {
  const l = Math.hypot(c[2], c[0]);
  if (l < 1e-6) return [1, 0, 0];
  return [c[2] / l, 0, -c[0] / l];
}

/** Prevailing wind velocity direction: trades (E→W), westerlies (W→E), polar easterlies. */
export function windAt(c: Vec3, latDeg: number): Vec3 {
  const e = eastAt(c);
  const a = Math.abs(latDeg);
  const s = a < 30 ? -1 : a < 60 ? 1 : -1;
  return [e[0] * s, e[1] * s, e[2] * s];
}

function upwindNeighbor(topo: Topology, i: number): number {
  const c = topo.centers[i];
  const w = windAt(c, topo.lat[i]);
  let best = topo.neighbors[i][0], bestScore = Infinity;
  for (const j of topo.neighbors[i]) {
    const d = topo.centers[j];
    const score = (d[0] - c[0]) * w[0] + (d[1] - c[1]) * w[1] + (d[2] - c[2]) * w[2]; // most negative = upwind
    if (score < bestScore) { bestScore = score; best = j; }
  }
  return best;
}

function computeClimate(topo: Topology, cells: CellState[], params: GenParams): void {
  const n = topo.count;
  for (let i = 0; i < n; i++) {
    cells[i].baseTemp = baseTemperature(topo.lat[i], cells[i].elevation, params.temperatureOffset);
    cells[i].temperature = cells[i].baseTemp;
  }
  // Moisture advection along prevailing winds with orographic loss.
  const up = new Int32Array(n);
  for (let i = 0; i < n; i++) up[i] = upwindNeighbor(topo, i);
  let m = new Float64Array(n);
  const oro = new Float64Array(n);
  for (let i = 0; i < n; i++) m[i] = cells[i].land ? 0.3 : Math.max(0.25, Math.min(1, (cells[i].baseTemp + 6) / 30));
  for (let pass = 0; pass < 14; pass++) {
    const next = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const cell = cells[i];
      if (!cell.land) { next[i] = Math.max(0.25, Math.min(1, (cell.baseTemp + 6) / 30)); continue; }
      const u = up[i];
      const gain = Math.max(0, cell.elevation - Math.max(0, cells[u].elevation));
      oro[i] = Math.min(0.8, gain / 2500);
      let avg = 0;
      for (const j of topo.neighbors[i]) avg += m[j];
      avg /= topo.neighbors[i].length;
      next[i] = (0.8 * m[u] * Math.exp(-gain / 2600) + 0.2 * avg) * 0.94;
    }
    m = next;
  }
  for (let i = 0; i < n; i++) {
    const cell = cells[i];
    const cold = Math.max(0.2, Math.min(1, (cell.baseTemp + 25) / 40));
    const moist = cell.land ? 0.15 + 0.85 * Math.min(1, m[i] * 1.25) : 1;
    cell.basePrecip = zonalPrecip(topo.lat[i]) * moist * (1 + oro[i]) * cold * params.moisture;
    cell.precip = cell.basePrecip / 12;
  }
}

function computeDrainage(topo: Topology, cells: CellState[]): void {
  const n = topo.count;
  const meanArea = 1 / n;
  for (let i = 0; i < n; i++) {
    const cell = cells[i];
    if (!cell.land) continue;
    let low = -1, lowE = cell.elevation;
    for (const j of topo.neighbors[i]) if (cells[j].elevation < lowE) { lowE = cells[j].elevation; low = j; }
    cell.downhill = low;
  }
  const order = [...Array(n).keys()].filter((i) => cells[i].land).sort((a, b) => cells[b].elevation - cells[a].elevation);
  for (const i of order) {
    const cell = cells[i];
    cell.flow += (cell.basePrecip / 1000) * (topo.areaFrac[i] / meanArea);
    const d = cell.downhill;
    if (d >= 0 && cells[d].land) cells[d].flow += cell.flow * 0.9;
  }
  for (const i of order) cells[i].river = cells[i].flow > 3;
}

function classifyBiome(c: CellState): Biome {
  if (!c.land) return c.elevation < -2500 ? 'deep_ocean' : c.elevation < -350 ? 'ocean' : 'shelf';
  const T = c.baseTemp, P = c.basePrecip;
  if (T < -9) return 'ice';
  if (c.elevation > 3300) return 'alpine';
  if (T < 0) return 'tundra';
  if (T < 7) return P > 380 ? 'taiga' : 'tundra';
  if (c.river && P > 1100 && c.elevation < 350) return 'wetland';
  if (T < 19) {
    if (P < 260) return 'desert';
    if (P < 480) return 'shrubland';
    if (P < 720) return 'grassland';
    return 'temperate_forest';
  }
  if (P < 330) return 'desert';
  if (P < 950) return 'savanna';
  if (P < 1650) return 'temperate_forest';
  return 'rainforest';
}

function computeEcology(topo: Topology, cells: CellState[], rng: Rng, field: TerrainField): void {
  const n = topo.count;
  for (let i = 0; i < n; i++) {
    const c = cells[i];
    const areaRel = topo.areaFrac[i] * n;
    c.biome = classifyBiome(c);
    c.biomassCap = biomassCapacityFor(c.biome, areaRel);
    c.biomass = c.biomassCap * rng.range(0.8, 1);
    const v = topo.centers[i];
    const variation = 0.12 * field.detail.noise(v[0] * 6, v[1] * 6, v[2] * 6);
    if (c.land) {
      const tF = Math.exp(-(((c.baseTemp - 17) / 11) ** 2));
      const pF = Math.min(1, c.basePrecip / 900) * (c.basePrecip > 2600 ? 0.75 : 1);
      const altitude = c.elevation > 2500 ? 0.45 : c.elevation > 1200 ? 0.8 : 1;
      c.fertilityBase = clamp01((0.55 * tF + 0.45 * pF) * altitude + (c.river ? 0.15 : 0) + variation);
      if (c.biome === 'desert' || c.biome === 'ice') c.fertilityBase *= 0.35;
      // Ore: richer in uplands and mountain belts; some lowland deposits.
      const upland = clamp01(c.elevation / 3000);
      if (rng.chance(0.18 + 0.55 * upland)) {
        c.oreInitial = Math.round(rng.range(25000, 110000) * (0.5 + upland) * areaRel);
        c.ore = c.oreInitial;
      }
    } else {
      const cold = c.baseTemp < 15 ? 1.3 : 1;
      const base = c.biome === 'shelf' ? 26000 : c.biome === 'ocean' ? 9000 : 2500;
      c.fishCap = base * cold * areaRel;
      c.fish = c.fishCap * rng.range(0.85, 1);
    }
    c.moisture = clamp01(c.basePrecip / 12 / Math.max(15, 25 + Math.max(0, c.baseTemp) * 4.2));
    const normalRenewal = waterRenewal(c, c.basePrecip / 12, areaRel);
    c.waterCap = normalRenewal * 4 + 2000 * areaRel;
    c.waterStock = c.land ? c.waterCap * 0.7 : 0;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

