import { getTopology } from './topology';
import type { CellState, Road, TransportMode } from './types';

/**
 * Dijkstra over the planetary cell graph. Land travel uses land cells only and
 * is cheaper along roads and on flat ground; sea travel uses ocean cells and
 * may only start/end at the coastal endpoint cells.
 */
export interface PathResult {
  path: number[];
  distanceKm: number;
  cost: number;
  roadFraction: number;
}

export const ROAD_COST_FACTOR = 0.35;

export function roadKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

export function roadIndex(roads: Road[]): Set<string> {
  const s = new Set<string>();
  for (const r of roads) if (r.status === 'active' && r.condition > 0.05) s.add(roadKey(r.a, r.b));
  return s;
}

function terrainFactor(a: CellState, b: CellState): number {
  const slope = Math.abs(b.elevation - a.elevation) / 1000;
  let f = 1 + slope * 0.8;
  if (b.biome === 'rainforest' || b.biome === 'wetland') f *= 1.4;
  if (b.biome === 'alpine' || b.biome === 'ice') f *= 1.8;
  if (b.biome === 'desert') f *= 1.2;
  return f;
}

class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];
  get size() { return this.items.length; }
  push(item: number, p: number) {
    this.items.push(item); this.prio.push(p);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent] <= this.prio[i]) break;
      this.swap(i, parent); i = parent;
    }
  }
  pop(): number {
    const top = this.items[0];
    const lastI = this.items.pop()!, lastP = this.prio.pop()!;
    if (this.items.length) {
      this.items[0] = lastI; this.prio[0] = lastP;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.items.length && this.prio[l] < this.prio[m]) m = l;
        if (r < this.items.length && this.prio[r] < this.prio[m]) m = r;
        if (m === i) break;
        this.swap(i, m); i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.prio[a], this.prio[b]] = [this.prio[b], this.prio[a]];
  }
}

export function findPath(
  cells: CellState[], from: number, to: number, mode: TransportMode, roads: Set<string>,
): PathResult | null {
  const topo = getTopology();
  const n = topo.count;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const passable = (i: number) =>
    mode === 'land' ? cells[i].land : (!cells[i].land || i === from || i === to);
  if (!passable(from) || !passable(to)) return null;
  dist[from] = 0;
  const heap = new MinHeap();
  heap.push(from, 0);
  while (heap.size) {
    const u = heap.pop();
    if (u === to) break;
    const du = dist[u];
    const nb = topo.neighbors[u], km = topo.edgeKm[u];
    for (let k = 0; k < nb.length; k++) {
      const v = nb[k];
      if (!passable(v)) continue;
      // Sea paths may not cut across a land endpoint's interior to another land cell.
      if (mode === 'sea' && cells[u].land && cells[v].land) continue;
      let w = km[k];
      if (mode === 'land') {
        w *= terrainFactor(cells[u], cells[v]);
        if (roads.has(roadKey(u, v))) w *= ROAD_COST_FACTOR;
      }
      const nd = du + w;
      if (nd < dist[v]) { dist[v] = nd; prev[v] = u; heap.push(v, nd); }
    }
  }
  if (!Number.isFinite(dist[to])) return null;
  const path: number[] = [];
  for (let c = to; c !== -1; c = prev[c]) path.push(c);
  path.reverse();
  let km = 0, roadKm = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const k = topo.neighbors[a].indexOf(b);
    const e = topo.edgeKm[a][k];
    km += e;
    if (roads.has(roadKey(a, b))) roadKm += e;
  }
  return { path, distanceKm: km, cost: dist[to], roadFraction: km > 0 ? roadKm / km : 0 };
}
