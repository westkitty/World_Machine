import * as THREE from 'three';
import { buildIcosphere, getTopology, nearestCell, type Vec3 } from '../sim/topology';
import type { WorldState } from '../sim/types';
import { buildTerrainField } from '../sim/worldgen';
import { BIOME_COLORS, buildOverlayContext, getOverlay, hex, lerpRGB, type RGB } from './overlays';

/**
 * Render geometry for the planet. Its resolution (icosphere level 5 or 6) is
 * far finer than the 642-cell simulation, but every vertex knows which
 * simulation cell it belongs to, and all colour comes from that cell's live
 * state. Geometry is built once per world; only colour and night-light
 * attributes are rewritten as the simulation advances.
 */
export const RELIEF = 22; // vertical exaggeration
export const KM_TO_UNIT = 1 / 6371;

export interface PlanetMeshData {
  geometry: THREE.BufferGeometry;
  cellOf: Uint16Array;
  /** Per-vertex terrain detail in [-1,1] for colour variation. */
  detail: Float32Array;
  vertexLand: Uint8Array;
  /** 0 = open water … 1 = dry land; smooth across the shoreline for anti-aliased coasts. */
  coastT: Float32Array;
  vertexElevation: Float32Array;
  /** Up to 7 (cell, weight) pairs per vertex for smooth colour blending across cells. */
  blendCells: Uint16Array;
  blendWeights: Float32Array;
  /** Per-vertex: 1 if it sits on a simulation-cell boundary. */
  border: Uint8Array;
  vertexCount: number;
  radiusOfCell: Float32Array;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function elevationToRadius(m: number): number {
  return 1 + Math.max(-6000, m) * 0.001 * KM_TO_UNIT * RELIEF;
}

export function buildPlanetMesh(state: WorldState, level: number): PlanetMeshData {
  const topo = getTopology();
  const ico = buildIcosphere(level);
  const n = ico.vertices.length / 3;
  const { field } = buildTerrainField(state.seed, state.params);
  const cellOf = new Uint16Array(n);
  const detail = new Float32Array(n);
  const vertexLand = new Uint8Array(n);
  const coastT = new Float32Array(n);
  const vertexElevation = new Float32Array(n);
  const positions = new Float32Array(n * 3);
  const spacing = Math.cos((topo.edgeKm[0][0] / 6371) * 1.9);
  const blendCells = new Uint16Array(n * 7);
  const blendWeights = new Float32Array(n * 7);
  let last = 0;
  for (let v = 0; v < n; v++) {
    const p: Vec3 = [ico.vertices[v * 3], ico.vertices[v * 3 + 1], ico.vertices[v * 3 + 2]];
    const c = nearestCell(topo, p, last);
    last = c;
    cellOf[v] = c;
    // Smooth land/sea field from the cell and its neighbours, plus fine noise for natural coasts.
    let wSum = 0, land = 0, elev = 0;
    const ring = [c, ...topo.neighbors[c]];
    for (let k = 0; k < 7; k++) {
      const cell = ring[k];
      if (cell === undefined) { blendWeights[v * 7 + k] = 0; continue; }
      const ck = topo.centers[cell];
      const d = p[0] * ck[0] + p[1] * ck[1] + p[2] * ck[2];
      const w = Math.max(0, d - spacing) ** 2;
      blendCells[v * 7 + k] = cell;
      blendWeights[v * 7 + k] = w;
      wSum += w;
      land += w * (state.cells[cell].land ? 1 : -1);
      elev += w * state.cells[cell].elevation;
    }
    for (let k = 0; k < 7; k++) blendWeights[v * 7 + k] /= Math.max(1e-12, wSum);
    land /= Math.max(1e-12, wSum);
    elev /= Math.max(1e-12, wSum);
    // Coastline noise: two octave bands so shores look natural rather than hexagonal.
    const det = field.detail.fbm(p[0] * 9, p[1] * 9, p[2] * 9, 4);
    const coast = field.detail.fbm(p[0] * 3.2 + 7, p[1] * 3.2, p[2] * 3.2, 4);
    detail[v] = det;
    const L = land + coast * 0.8 + det * 0.3;
    const t = smoothstep(-0.14, 0.14, L);
    coastT[v] = t;
    vertexLand[v] = t >= 0.5 ? 1 : 0;
    const fine = field.toMeters(field.raw(p));
    const m0 = 0.55 * elev + 0.45 * fine + det * 260 * state.params.ruggedness;
    const mLand = Math.max(m0, 15 + Math.abs(det) * 80);
    const mSea = Math.min(m0, -60 - Math.abs(det) * 200);
    const m = mSea + (mLand - mSea) * t;
    vertexElevation[v] = m;
    const r = elevationToRadius(m);
    positions[v * 3] = p[0] * r; positions[v * 3 + 1] = p[1] * r; positions[v * 3 + 2] = p[2] * r;
  }
  const border = new Uint8Array(n);
  const f = ico.faces;
  for (let i = 0; i < f.length; i += 3) {
    const a = f[i], b = f[i + 1], c = f[i + 2];
    if (cellOf[a] !== cellOf[b] || cellOf[b] !== cellOf[c] || cellOf[a] !== cellOf[c]) { border[a] = 1; border[b] = 1; border[c] = 1; }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(f), 1));
  geometry.computeVertexNormals();
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geometry.setAttribute('lights', new THREE.BufferAttribute(new Float32Array(n), 1));
  geometry.setAttribute('border', new THREE.BufferAttribute(new Float32Array(border), 1));
  geometry.computeBoundingSphere();
  const radiusOfCell = new Float32Array(topo.count);
  for (let i = 0; i < topo.count; i++) radiusOfCell[i] = elevationToRadius(Math.max(0, state.cells[i].elevation));
  return { geometry, cellOf, detail, vertexLand, coastT, vertexElevation, blendCells, blendWeights, border, vertexCount: n, radiusOfCell };
}

const SNOW: RGB = hex('#f2f4f6');
const ROCK: RGB = hex('#6e665e');
const ERODED: RGB = hex('#8a6a48');
const SAND: RGB = hex('#cdbb8c');
const SEA_SHALLOW: RGB = hex('#2d6f8f');
const SEA_DEEP: RGB = hex('#061428');

/** Natural-colour terrain for one vertex, reflecting live degradation and season. */
function terrainColor(state: WorldState, data: PlanetMeshData, v: number): RGB {
  const topo = getTopology();
  let c = data.cellOf[v];
  const cell0 = state.cells[c];
  const m = data.vertexElevation[v];
  const t = data.coastT[v];
  const sea = lerpRGB(SEA_SHALLOW, SEA_DEEP, Math.min(1, Math.max(0, -m) / 4500));
  if (t <= 0.001) return sea;
  // A land vertex whose nearest cell is ocean borrows the nearest land neighbour's biome.
  if (!cell0.land) {
    const nb = topo.neighbors[c].find((k) => state.cells[k].land);
    if (nb !== undefined) c = nb;
  }
  const cell = state.cells[c];
  // Blend biome colours of nearby land cells so biomes grade into each other.
  let r = 0, g = 0, b = 0, w = 0;
  for (let k = 0; k < 7; k++) {
    const wk = data.blendWeights[v * 7 + k];
    if (wk <= 0) continue;
    const ck = state.cells[data.blendCells[v * 7 + k]];
    if (!ck.land) continue;
    const bc = BIOME_COLORS[ck.biome];
    const dc = lerpRGB(bc, ERODED, ck.degradation * 0.75);
    r += dc[0] * wk; g += dc[1] * wk; b += dc[2] * wk; w += wk;
  }
  let col: RGB = w > 0 ? [r / w, g / w, b / w] : BIOME_COLORS[cell.land ? cell.biome : 'desert'];
  const d = data.detail[v];
  col = lerpRGB(col, d > 0 ? lerpRGB(col, [col[0] * 1.25, col[1] * 1.2, col[2] * 1.1], 1) : [col[0] * 0.78, col[1] * 0.8, col[2] * 0.8], Math.abs(d) * 0.9);
  if (t < 0.85 && cell.biome !== 'ice') col = lerpRGB(col, SAND, (0.85 - t) * 0.6);
  if (m > 2600) col = lerpRGB(col, ROCK, Math.min(1, (m - 2600) / 1400));
  const snowLine = 4200 - Math.max(0, cell.temperature) * 60;
  if (m > snowLine || cell.temperature < -12) col = lerpRGB(col, SNOW, m > snowLine ? Math.min(1, (m - snowLine) / 600) : 0.6);
  // Live ecology: degradation browns land (blended above); seasonal cold frosts it.
  if (cell.temperature < -2) col = lerpRGB(col, SNOW, Math.min(0.5, (-2 - cell.temperature) / 25));
  return t >= 0.999 ? col : lerpRGB(sea, col, t);
}

export interface ColorOptions {
  overlay: string;
  showBorders: boolean;
  selected: number;
}

/** Rewrite the per-vertex colour attribute from simulation state. */
export function paintPlanet(state: WorldState, data: PlanetMeshData, opts: ColorOptions): void {
  const colors = data.geometry.getAttribute('color') as THREE.BufferAttribute;
  const arr = colors.array as Float32Array;
  const def = getOverlay(opts.overlay);
  const ctx = buildOverlayContext(state);
  const topo = getTopology();
  const cellColor: (RGB | null)[] = new Array(topo.count);
  for (let i = 0; i < topo.count; i++) cellColor[i] = def.color(state.cells[i], i, ctx);
  for (let v = 0; v < data.vertexCount; v++) {
    const c = data.cellOf[v];
    let col = cellColor[c];
    if (col) {
      // Overlay: flat cell colour with a little relief shading so geography stays legible.
      const shade = data.vertexLand[v] ? 0.92 + data.detail[v] * 0.08 : 1;
      col = [col[0] * shade, col[1] * shade, col[2] * shade];
      if (opts.showBorders && data.border[v]) col = [col[0] * 0.55, col[1] * 0.55, col[2] * 0.55];
    } else {
      col = terrainColor(state, data, v);
      if (state.cells[c].conserved && data.border[v]) col = lerpRGB(col, hex('#3fd18a'), 0.8);
      else if (state.cells[c].owner >= 0 && data.border[v]) col = lerpRGB(col, hex('#d9b56a'), 0.18);
    }
    arr[v * 3] = col[0]; arr[v * 3 + 1] = col[1]; arr[v * 3 + 2] = col[2];
  }
  colors.needsUpdate = true;
}

/**
 * Night lights from real settlements: a city core around each settlement
 * centre that thins into scattered towns across its territory. Brightness
 * grows with population and is scaled by how much energy demand was met.
 */
export function paintLights(state: WorldState, data: PlanetMeshData): void {
  const topo = getTopology();
  const lightsAttr = data.geometry.getAttribute('lights') as THREE.BufferAttribute;
  const arr = lightsAttr.array as Float32Array;
  const pos = data.geometry.getAttribute('position') as THREE.BufferAttribute;
  const bySettlement = new Map<number, { c: Vec3; glow: number; sigma: number }>();
  for (const s of state.settlements) {
    if (!s.alive) continue;
    const energy = s.last.needed.energy > 0 ? Math.min(1, s.last.consumed.energy / s.last.needed.energy) : 0;
    const base = Math.min(1, Math.sqrt(s.population / 20000));
    bySettlement.set(s.id, { c: topo.centers[s.cellId], glow: base * (0.2 + 0.8 * energy), sigma: 0.05 + 0.07 * base });
  }
  for (let v = 0; v < data.vertexCount; v++) {
    arr[v] = 0;
    if (!data.vertexLand[v]) continue;
    const owner = state.cells[data.cellOf[v]].owner;
    const st = owner >= 0 ? bySettlement.get(owner) : undefined;
    if (!st) continue;
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
    const len = Math.hypot(x, y, z);
    const ang = Math.acos(Math.min(1, (x * st.c[0] + y * st.c[1] + z * st.c[2]) / len));
    // Smooth extent: bright core, wider suburban halo. Town speckle is added per pixel in the shader.
    const core = Math.exp(-((ang / st.sigma) ** 2));
    const halo = Math.exp(-((ang / (st.sigma * 3)) ** 2));
    arr[v] = st.glow * Math.min(1.2, core * 1.1 + halo * 0.22);
  }
  lightsAttr.needsUpdate = true;
}
