import { emptyLedger, storageCap } from './economy';
import { settlementSuitability } from './formulas';
import { roadIndex } from './pathfinding';
import { Rng, seedRng } from './rng';
import { createSettlement, hasOpenSea, largestBasin, pushEvent } from './settlements';
import { farmYield } from './systems/production';
import { applyPlan, planRoute } from './systems/trade';
import { getTopology, greatCircleKm } from './topology';
import {
  TRADE_GOODS, type BuildingType, type GameMode, type GenParams, type Inventory, type Policy, type Rules,
  type Settlement, type TechId, type WorldState,
} from './types';
import { DEFAULT_PARAMS, clampParams, generateWorld } from './worldgen';

export const SAVE_VERSION = 1;
export const REFERENCE_SEED = 'TERRA-1';

export const DEFAULT_RULES: Rules = {
  consumptionMult: 1, constructionCostMult: 1, crisisFrequency: 1, unrestricted: false, maxSettlements: 40,
};

export const DEFAULT_POLICY: Policy = {
  extraction: 'normal', rationing: false, growth: 'neutral', autonomy: 'full',
  tradePriority: ['food', 'water', 'timber', 'ore'], reserveMonths: 4,
};

const TECH_IDS: TechId[] = ['irrigation', 'crop_rotation', 'masonry_roads', 'deep_mining', 'clean_energy', 'seafaring', 'cold_storage', 'reforestation', 'water_reclamation'];

/** A bare world: terrain, climate and ecology, no people. */
export function createBaseWorld(seed: string, params: Partial<GenParams> = {}, mode: GameMode = 'sandbox'): WorldState {
  const p = clampParams({ ...DEFAULT_PARAMS, ...params });
  const { cells } = generateWorld(seed, p);
  const tech = {} as WorldState['tech'];
  for (const id of TECH_IDS) tech[id] = { progress: 0, started: false, done: false };
  return {
    version: SAVE_VERSION, seed, params: p, rules: { ...DEFAULT_RULES }, rng: seedRng(`${seed}:sim`), tick: 0, mode,
    cells, settlements: [], nextSettlementId: 1, buildings: [], nextBuildingId: 1, roads: [], routes: [], nextRouteId: 1,
    shipments: [], relations: {}, policy: { ...DEFAULT_POLICY, tradePriority: [...DEFAULT_POLICY.tradePriority] },
    tech, climate: { precipMult: 1, tempOffset: 0 }, crises: [], nextCrisisId: 1, scenario: null, expedition: null,
    events: [], metrics: [], migrations: [], ledger: emptyLedger(), usedNames: [],
  };
}

export interface SiteOptions {
  count: number;
  minKm: number;
  requireCoastal?: boolean;
  preferDistinctLandmasses?: boolean;
  /** Penalise repeating a biome so starting communities differ. */
  diverse?: boolean;
  exclude?: number[];
}

/** Connected components of land cells. */
export function landmasses(state: WorldState): Int32Array {
  const topo = getTopology();
  const comp = new Int32Array(topo.count).fill(-1);
  let id = 0;
  for (let i = 0; i < topo.count; i++) {
    if (!state.cells[i].land || comp[i] >= 0) continue;
    const stack = [i];
    comp[i] = id;
    while (stack.length) {
      const u = stack.pop()!;
      for (const v of topo.neighbors[u]) if (state.cells[v].land && comp[v] < 0) { comp[v] = id; stack.push(v); }
    }
    id++;
  }
  return comp;
}

/** Deterministic greedy choice of well-spaced, suitable settlement sites. */
export function chooseSites(state: WorldState, opt: SiteOptions): number[] {
  const topo = getTopology();
  const comp = landmasses(state);
  const mainBasin = largestBasin(state);
  const candidates = [...Array(topo.count).keys()]
    .filter((i) => state.cells[i].land && state.cells[i].biome !== 'ice' && (!opt.requireCoastal || (state.cells[i].coastal && hasOpenSea(state, i, mainBasin))) && !(opt.exclude ?? []).includes(i))
    .sort((a, b) => settlementSuitability(state.cells[b]) - settlementSuitability(state.cells[a]) || a - b);
  const chosen: number[] = [];
  const usedComp = new Set<number>();
  const biomeCount = new Map<string, number>();
  const ordered = () => opt.diverse
    ? [...candidates].sort((a, b) => score(b) - score(a) || a - b)
    : candidates;
  const score = (i: number) => settlementSuitability(state.cells[i]) * Math.pow(0.75, biomeCount.get(state.cells[i].biome) ?? 0);
  const pass = (distinct: boolean, minKm: number) => {
    for (const c of ordered()) {
      if (chosen.length >= opt.count) return;
      if (chosen.includes(c)) continue;
      if (distinct && usedComp.has(comp[c])) continue;
      if (chosen.some((o) => greatCircleKm(topo, o, c) < minKm)) continue;
      // Avoid tiny islets that cannot hold a territory.
      if (topo.neighbors[c].filter((j) => state.cells[j].land).length < 2) continue;
      chosen.push(c);
      usedComp.add(comp[c]);
      biomeCount.set(state.cells[c].biome, (biomeCount.get(state.cells[c].biome) ?? 0) + 1);
      if (opt.diverse) return pass(distinct, minKm);
    }
  };
  if (opt.preferDistinctLandmasses) pass(true, opt.minKm);
  pass(false, opt.minKm);
  pass(false, opt.minKm * 0.6);
  pass(false, 0);
  return chosen;
}

export function placeBuilding(state: WorldState, s: Settlement, type: BuildingType, cellId: number): void {
  state.buildings.push({ id: state.nextBuildingId++, type, cellId, settlementId: s.id, condition: 1, status: 'active', progress: 0, builtTick: state.tick, neglect: 0 });
}

export function bestFarmCells(state: WorldState, s: Settlement): number[] {
  const terr = state.cells.map((c, i) => (c.owner === s.id ? i : -1)).filter((i) => i >= 0);
  return terr
    .filter((i) => state.cells[i].fertilityBase > 0.12 && !['alpine', 'ice', 'tundra'].includes(state.cells[i].biome))
    .sort((a, b) => scoreFarm(state, b) - scoreFarm(state, a) || a - b);
}

function scoreFarm(state: WorldState, cellId: number): number {
  return farmYield(state, { id: -1, type: 'farm', cellId, settlementId: -1, condition: 1, status: 'active', progress: 0, builtTick: 0, neglect: 0 });
}

export function seedSettlement(state: WorldState, cellId: number, population: number, inv: Partial<Inventory>, rng: Rng): Settlement {
  const s = createSettlement(state, cellId, population, {}, rng);
  for (const g of Object.keys(inv) as (keyof Inventory)[]) {
    s.inventory[g] = inv[g] ?? 0;
    state.ledger.seeded[g] += inv[g] ?? 0;
  }
  s.founded = 0;
  // Pre-existing stockpiles come with the storehouses that hold them.
  const largest = Math.max(inv.food ?? 0, inv.water ?? 0, inv.timber ?? 0, inv.ore ?? 0);
  const terr = state.cells.map((c, i) => (c.owner === s.id ? i : -1)).filter((i) => i >= 0);
  let k = 0;
  while (storageCap(state, s, 'food') < largest && k < terr.length * 2) {
    placeBuilding(state, s, 'storage', terr[Math.floor(k / 2)]);
    k++;
  }
  return s;
}

export function addRoute(state: WorldState, a: Settlement, b: Settlement, autonomous = false): boolean {
  const plan = planRoute(state, a, b, roadIndex(state.roads));
  if (typeof plan === 'string') return false;
  const route = {
    id: state.nextRouteId++, a: a.id, b: b.id, mode: plan.mode, path: [], distanceKm: 0, roadFraction: 0, capacity: 0,
    travelMonths: 1, lossRate: 0, active: true, blockedReason: '', goods: [...TRADE_GOODS], autonomous,
    createdTick: state.tick, movedLastTick: 0, deliveredTotal: 0, deliveredHistory: [],
  };
  applyPlan(route, plan);
  state.routes.push(route);
  return true;
}

/**
 * The reference starting world: five settlements with farms, at least one
 * mine, power works and port where geography allows, and one working trade
 * route between the closest land-connected pair.
 */
export function createReferenceWorld(seed = REFERENCE_SEED, params: Partial<GenParams> = {}, mode: GameMode = 'sandbox'): WorldState {
  const state = createBaseWorld(seed, params, mode);
  const rng = new Rng(seedRng(`${seed}:setup`));
  const sites = chooseSites(state, { count: 5, minKm: 2400, diverse: true });
  const settlements = sites.map((c) => {
    const pop = Math.round(rng.range(3000, 8000));
    return seedSettlement(state, c, pop, { food: pop * 5, water: pop * 2, timber: 2500, ore: 1200 }, rng);
  });
  settlements.forEach((s, idx) => {
    const farms = bestFarmCells(state, s);
    const farmCount = s.population > 5500 ? 2 : 1;
    for (let k = 0; k < farmCount && k < farms.length; k++) placeBuilding(state, s, 'farm', farms[k]);
    if (idx < 3) {
      const terr = state.cells.map((c, i) => (c.owner === s.id ? i : -1)).filter((i) => i >= 0);
      placeBuilding(state, s, 'energy', s.cellId);
      const ore = terr.filter((i) => state.cells[i].ore > 500).sort((a, b) => state.cells[b].ore - state.cells[a].ore);
      if (ore.length) placeBuilding(state, s, 'mine', ore[0]);
      const coast = terr.find((i) => state.cells[i].coastal);
      if (coast !== undefined && idx === 0) placeBuilding(state, s, 'port', coast);
    }
  });
  connectClosestPair(state, settlements);
  pushEvent(state, 'genesis', `The World Machine awakens: ${settlements.length} communities on world “${seed}”.`, settlements[0]?.cellId ?? -1, -1, 'info');
  return state;
}

export function connectClosestPair(state: WorldState, settlements: Settlement[]): boolean {
  const topo = getTopology();
  const pairs: [Settlement, Settlement, number][] = [];
  for (let i = 0; i < settlements.length; i++) for (let j = i + 1; j < settlements.length; j++) {
    pairs.push([settlements[i], settlements[j], greatCircleKm(topo, settlements[i].cellId, settlements[j].cellId)]);
  }
  pairs.sort((x, y) => x[2] - y[2]);
  for (const [a, b] of pairs) if (addRoute(state, a, b)) return true;
  return false;
}
