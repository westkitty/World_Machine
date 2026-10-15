import { POP_HISTORY_LIMIT } from './constants';
import { emptyLedger } from './economy';
import { settlementSuitability } from './formulas';
import { makeName } from './names';
import { Rng } from './rng';
import { getTopology, greatCircleKm } from './topology';
import { GOODS, emptyInventory, type Good, type Inventory, type Settlement, type SettlementFlows, type WorldState } from './types';

interface Basins { comp: Int32Array; sizes: number[] }
const oceanCache = new WeakMap<object, Basins>();

/** Connected ocean basins (component id per ocean cell, −1 for land). */
export function oceanBasins(state: WorldState): Basins {
  const hit = oceanCache.get(state.cells);
  if (hit) return hit;
  const topo = getTopology();
  const comp = new Int32Array(topo.count).fill(-1);
  const sizes: number[] = [];
  for (let i = 0; i < topo.count; i++) {
    if (state.cells[i].land || comp[i] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [i];
    comp[i] = id;
    while (stack.length) {
      const u = stack.pop()!;
      size++;
      for (const v of topo.neighbors[u]) if (!state.cells[v].land && comp[v] < 0) { comp[v] = id; stack.push(v); }
    }
    sizes.push(size);
  }
  const out = { comp, sizes };
  oceanCache.set(state.cells, out);
  return out;
}

export const NAVIGABLE_BASIN = 12;

/** A land cell touching an ocean basin large enough for shipping (optionally a specific basin). */
export function hasOpenSea(state: WorldState, cellId: number, basin = -1): boolean {
  const { comp, sizes } = oceanBasins(state);
  return getTopology().neighbors[cellId].some((j) => comp[j] >= 0 && sizes[comp[j]] >= NAVIGABLE_BASIN && (basin < 0 || comp[j] === basin));
}

export function largestBasin(state: WorldState): number {
  const { sizes } = oceanBasins(state);
  let best = 0;
  sizes.forEach((v, i) => { if (v > sizes[best]) best = i; });
  return best;
}

export function emptyFlows(): SettlementFlows {
  const z = () => emptyInventory();
  const labor = {} as Record<Good, number>;
  for (const g of GOODS) labor[g] = 0;
  return {
    produced: z(), consumed: z(), needed: z(), imported: z(), exported: z(),
    births: 0, deaths: 0, migrantsIn: 0, migrantsOut: 0, labor: 0, laborUsed: labor, bySource: {}, specialty: null, shortage: [],
  };
}

export function withRng<T>(state: WorldState, fn: (rng: Rng) => T): T {
  const rng = new Rng(state.rng);
  const out = fn(rng);
  state.rng = rng.state;
  return out;
}

export function liveSettlements(state: WorldState): Settlement[] {
  return state.settlements.filter((s) => s.alive);
}

export function getSettlement(state: WorldState, id: number): Settlement | undefined {
  const s = state.settlements.find((x) => x.id === id);
  return s && s.alive ? s : undefined;
}

export function territoryOf(state: WorldState, id: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < state.cells.length; i++) if (state.cells[i].owner === id) out.push(i);
  return out;
}

/** Why a cell can or cannot host a new settlement. Returns null when valid. */
export function foundingBlocker(state: WorldState, cellId: number): string | null {
  const cell = state.cells[cellId];
  if (!cell) return 'No such region.';
  if (!cell.land) return 'Settlements must be founded on land.';
  if (cell.biome === 'ice') return 'Ice sheets cannot support a settlement.';
  if (cell.owner >= 0) return 'This region already belongs to a settlement.';
  if (cell.conserved) return 'This region is a conservation reserve.';
  if (liveSettlements(state).length >= state.rules.maxSettlements) return `The planet supports at most ${state.rules.maxSettlements} settlements in this mode.`;
  const topo = getTopology();
  for (const j of topo.neighbors[cellId]) {
    const o = state.cells[j].owner;
    if (o >= 0 && state.cells[j].owner >= 0) {
      const s = getSettlement(state, o);
      if (s && s.cellId === j) return 'Too close to an existing settlement centre.';
    }
  }
  return null;
}

export function createSettlement(
  state: WorldState, cellId: number, population: number, inventory: Partial<Inventory>, rng: Rng,
): Settlement {
  const s: Settlement = {
    id: state.nextSettlementId++,
    name: makeName(rng, state.usedNames),
    cellId,
    founded: state.tick,
    population,
    housing: population * 1.4 + 300,
    inventory: { ...emptyInventory(), ...inventory },
    wellbeing: 0.65,
    health: 0.8,
    laborFocus: 'balanced',
    values: { growth: rng.range(0.3, 0.7), conservation: rng.range(0.2, 0.6), trade: rng.range(0.3, 0.7) },
    specialization: 'Frontier',
    outputAvg: {},
    migrationPressure: 0,
    importedTotal: 0,
    alive: true,
    last: emptyFlows(),
    popHistory: [population],
  };
  state.settlements.push(s);
  claimTerritory(state, s, 7);
  return s;
}

/** Claim the centre plus up to `target` total best adjacent unowned land cells. */
export function claimTerritory(state: WorldState, s: Settlement, target: number): void {
  const topo = getTopology();
  const cells = state.cells;
  if (cells[s.cellId].owner < 0) cells[s.cellId].owner = s.id;
  let owned = territoryOf(state, s.id);
  while (owned.length < target) {
    let best = -1, bestScore = -1;
    for (const c of owned) {
      for (const j of topo.neighbors[c]) {
        const cell = cells[j];
        if (!cell.land || cell.owner >= 0 || cell.biome === 'ice') continue;
        const d = greatCircleKm(topo, s.cellId, j);
        if (d > 2600) continue;
        const score = settlementSuitability(cell) + 0.2 - d / 10000;
        if (score > bestScore) { bestScore = score; best = j; }
      }
    }
    if (best < 0) break;
    cells[best].owner = s.id;
    owned = territoryOf(state, s.id);
  }
}

export function territoryTarget(pop: number): number {
  return Math.min(13, 7 + Math.floor(pop / 18000));
}

/** Remove a settlement: inventory is lost (recorded), territory and buildings released. */
export function abandonSettlement(state: WorldState, s: Settlement, reason: string): void {
  s.alive = false;
  for (const g of GOODS) {
    state.ledger.abandoned[g] += s.inventory[g];
    s.inventory[g] = 0;
  }
  s.population = 0;
  for (const c of state.cells) if (c.owner === s.id) c.owner = -1;
  state.buildings = state.buildings.filter((b) => b.settlementId !== s.id);
  for (const r of state.routes) {
    if (r.a === s.id || r.b === s.id) { r.active = false; r.blockedReason = `${s.name} was abandoned.`; }
  }
  // Shipments heading to a dead settlement are lost in transit.
  state.shipments = state.shipments.filter((sh) => {
    if (sh.to === s.id) { state.ledger.abandoned[sh.good] += sh.amount; return false; }
    return true;
  });
  pushEvent(state, 'abandoned', `${s.name} was abandoned: ${reason}`, s.cellId, s.id, 'bad');
}

export function recordPop(s: Settlement): void {
  s.popHistory.push(Math.round(s.population));
  if (s.popHistory.length > POP_HISTORY_LIMIT) s.popHistory.shift();
}

export function pushEvent(
  state: WorldState, kind: string, text: string, cellId = -1, settlementId = -1,
  severity: 'info' | 'good' | 'warn' | 'bad' = 'info',
): void {
  state.events.push({ tick: state.tick, kind, text, cellId, settlementId, severity });
  if (state.events.length > 400) state.events.splice(0, state.events.length - 400);
}

export { emptyLedger };
