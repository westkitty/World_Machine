/**
 * Planetary topology: dual cells of a subdivided icosahedron.
 *
 * A level-3 icosphere (edge frequency 8) has 10·8²+2 = 642 vertices. Each
 * vertex becomes one simulation cell; the cell's polygon is formed by the
 * (normalised) centroids of the triangles that share that vertex. 12 cells
 * (the original icosahedron vertices) are pentagons, the rest hexagons.
 *
 * Cell areas are exact spherical-polygon areas (fan of spherical triangles,
 * Van Oosterom–Strackee formula), so they partition the unit sphere: their sum
 * is 4π up to floating-point error. The topology is a pure function of the
 * subdivision level and is never saved — it is rebuilt on load.
 */
export const PLANET_RADIUS_KM = 6371;
export const SIM_SUBDIVISIONS = 3;

export type Vec3 = [number, number, number];

export interface Icosphere {
  vertices: Float64Array; // xyz triples on the unit sphere
  faces: Uint32Array; // vertex index triples
}

export interface Topology {
  count: number;
  centers: Vec3[];
  lat: Float64Array; // degrees
  lon: Float64Array; // degrees
  /** Area in km². */
  area: Float64Array;
  /** Area as fraction of the unit sphere (sums to 1). */
  areaFrac: Float64Array;
  neighbors: number[][];
  /** Great-circle centre-to-centre distance in km, parallel to neighbors. */
  edgeKm: number[][];
  /** Ordered polygon corners (unit vectors) of each cell. */
  corners: Vec3[][];
}

export function buildIcosphere(level: number): Icosphere {
  const t = (1 + Math.sqrt(5)) / 2;
  const verts: number[] = [];
  const base = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  for (const v of base) {
    const l = Math.hypot(v[0], v[1], v[2]);
    verts.push(v[0] / l, v[1] / l, v[2] / l);
  }
  let faces: number[] = [
    0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11,
    1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
    3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9,
    4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
  ];
  for (let l = 0; l < level; l++) {
    const cache = new Map<number, number>();
    const mid = (a: number, b: number): number => {
      const key = a < b ? a * 1_000_003 + b : b * 1_000_003 + a;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const x = verts[a * 3] + verts[b * 3];
      const y = verts[a * 3 + 1] + verts[b * 3 + 1];
      const z = verts[a * 3 + 2] + verts[b * 3 + 2];
      const len = Math.hypot(x, y, z);
      const idx = verts.length / 3;
      verts.push(x / len, y / len, z / len);
      cache.set(key, idx);
      return idx;
    };
    const next: number[] = [];
    for (let i = 0; i < faces.length; i += 3) {
      const a = faces[i], b = faces[i + 1], c = faces[i + 2];
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      next.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
    }
    faces = next;
  }
  return { vertices: new Float64Array(verts), faces: new Uint32Array(faces) };
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Solid angle of the spherical triangle abc (unit vectors). */
export function sphericalTriangleArea(a: Vec3, b: Vec3, c: Vec3): number {
  const num = Math.abs(dot(a, cross(b, c)));
  const den = 1 + dot(a, b) + dot(b, c) + dot(c, a);
  return 2 * Math.atan2(num, den);
}

/** Great-circle angle between unit vectors, radians. */
export function angleBetween(a: Vec3, b: Vec3): number {
  return Math.atan2(Math.hypot(...cross(a, b)), dot(a, b));
}

export function latLonOf(v: Vec3): [number, number] {
  // y is the planetary rotation axis.
  const lat = Math.asin(Math.max(-1, Math.min(1, v[1]))) * (180 / Math.PI);
  const lon = Math.atan2(v[0], v[2]) * (180 / Math.PI);
  return [lat, lon];
}

let cached: Topology | null = null;

export function getTopology(): Topology {
  if (!cached) cached = buildTopology(SIM_SUBDIVISIONS);
  return cached;
}

export function buildTopology(level: number): Topology {
  const ico = buildIcosphere(level);
  const n = ico.vertices.length / 3;
  const centers: Vec3[] = [];
  for (let i = 0; i < n; i++) centers.push([ico.vertices[i * 3], ico.vertices[i * 3 + 1], ico.vertices[i * 3 + 2]]);

  const nbSets: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  const vertFaces: number[][] = Array.from({ length: n }, () => []);
  const faceCount = ico.faces.length / 3;
  const faceCentroid: Vec3[] = [];
  for (let f = 0; f < faceCount; f++) {
    const a = ico.faces[f * 3], b = ico.faces[f * 3 + 1], c = ico.faces[f * 3 + 2];
    nbSets[a].add(b); nbSets[a].add(c);
    nbSets[b].add(a); nbSets[b].add(c);
    nbSets[c].add(a); nbSets[c].add(b);
    vertFaces[a].push(f); vertFaces[b].push(f); vertFaces[c].push(f);
    const ca = centers[a], cb = centers[b], cc = centers[c];
    faceCentroid.push(norm([ca[0] + cb[0] + cc[0], ca[1] + cb[1] + cc[1], ca[2] + cb[2] + cc[2]]));
  }

  const lat = new Float64Array(n), lon = new Float64Array(n);
  const area = new Float64Array(n), areaFrac = new Float64Array(n);
  const neighbors: number[][] = [], edgeKm: number[][] = [], corners: Vec3[][] = [];

  for (let i = 0; i < n; i++) {
    const c = centers[i];
    [lat[i], lon[i]] = latLonOf(c);
    // Tangent basis for angular ordering.
    const ref: Vec3 = Math.abs(c[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const e1 = norm(cross(ref, c));
    const e2 = cross(c, e1);
    const ang = (v: Vec3) => Math.atan2(dot(v, e2), dot(v, e1));

    const nb = [...nbSets[i]].sort((a, b) => ang(centers[a]) - ang(centers[b]));
    neighbors.push(nb);
    edgeKm.push(nb.map((j) => angleBetween(c, centers[j]) * PLANET_RADIUS_KM));

    const poly = vertFaces[i].map((f) => faceCentroid[f]).sort((a, b) => ang(a) - ang(b));
    corners.push(poly);
    let a = 0;
    for (let k = 0; k < poly.length; k++) a += sphericalTriangleArea(c, poly[k], poly[(k + 1) % poly.length]);
    areaFrac[i] = a / (4 * Math.PI);
    area[i] = a * PLANET_RADIUS_KM * PLANET_RADIUS_KM;
  }
  return { count: n, centers, lat, lon, area, areaFrac, neighbors, edgeKm, corners };
}

/** Index of the cell whose centre is nearest to unit vector v (greedy walk). */
export function nearestCell(topo: Topology, v: Vec3, start = 0): number {
  let best = start;
  let bestDot = dot(topo.centers[best], v);
  for (;;) {
    let improved = false;
    for (const j of topo.neighbors[best]) {
      const d = dot(topo.centers[j], v);
      if (d > bestDot) { bestDot = d; best = j; improved = true; }
    }
    if (!improved) return best;
  }
}

export function greatCircleKm(topo: Topology, a: number, b: number): number {
  return angleBetween(topo.centers[a], topo.centers[b]) * PLANET_RADIUS_KM;
}
