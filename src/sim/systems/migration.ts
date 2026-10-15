import { MIGRATION_LIMIT, SETTLEMENT_FOUNDING } from '../constants';
import type { TickContext } from '../context';
import { credit, debit } from '../economy';
import { settlementSuitability } from '../formulas';
import {
  claimTerritory, createSettlement, foundingBlocker, pushEvent, territoryOf, territoryTarget, withRng,
} from '../settlements';
import { getTopology, greatCircleKm } from '../topology';
import type { Settlement, WorldState } from '../types';
import { bestFarmCells } from '../create';
import { startBuilding } from '../construction';
import { activePortCell } from './trade';

export const MIGRATION_RANGE_KM = 4200;

/** How attractive a settlement looks to migrants, 0..~1.2. */
export function attractiveness(s: Settlement): number {
  const vacancy = Math.max(-0.5, Math.min(0.4, 1 - s.population / Math.max(1, s.housing)));
  return s.wellbeing + vacancy * 0.5;
}

/**
 * Migration moves real population between settlements. Pressure grows with low
 * wellbeing and crowding. Migrants prefer the most attractive reachable
 * settlement (trade partners count as reachable at any distance). When no
 * destination is better and the group is large enough, migrants with spare
 * supplies found a new settlement on the best free land nearby.
 */
export function migrationSystem(state: WorldState, ctx: TickContext): void {
  const topo = getTopology();
  const alive = state.settlements.filter((s) => s.alive);
  for (const s of alive) {
    const crowding = s.population / Math.max(1, s.housing);
    const pressure = Math.max(0, (1 - s.wellbeing) - 0.35) + Math.max(0, crowding - 0.95) * 1.5;
    s.migrationPressure = pressure;
    if (tryColony(state, s, crowding)) continue;
    if (pressure <= 0.02 || s.population < 300) continue;
    const migrants = s.population * Math.min(0.04, pressure * 0.025);
    if (migrants < 20) continue;
    const here = attractiveness(s);
    const partners = new Set<number>();
    for (const r of state.routes) {
      if (!r.active) continue;
      if (r.a === s.id) partners.add(r.b);
      if (r.b === s.id) partners.add(r.a);
    }
    let best: Settlement | null = null, bestScore = here + 0.1;
    for (const o of alive) {
      if (o.id === s.id) continue;
      const d = greatCircleKm(topo, s.cellId, o.cellId);
      if (d > MIGRATION_RANGE_KM && !partners.has(o.id)) continue;
      const score = attractiveness(o) - d / 20000;
      if (score > bestScore) { bestScore = score; best = o; }
    }
    if (best) {
      s.population -= migrants;
      best.population += migrants;
      s.last.migrantsOut += migrants;
      best.last.migrantsIn += migrants;
      recordMigration(state, s, best, migrants, false);
    }
  }
  // Territory grows with population once a year.
  if (state.tick % 12 === 6) {
    for (const s of alive) {
      if (!s.alive) continue;
      const target = territoryTarget(s.population);
      if (territoryOf(state, s.id).length < target) claimTerritory(state, s, territoryOf(state, s.id).length + 1);
    }
    ctx.territory.clear();
  }
}

/**
 * Colonies form when a community is crowded out, or when a prosperous,
 * growth-minded community can equip settlers (checked every three years).
 */
function tryColony(state: WorldState, s: Settlement, crowding: number): boolean {
  const canEquip = s.inventory.food > SETTLEMENT_FOUNDING.food * 1.5 && s.inventory.timber > SETTLEMENT_FOUNDING.timber * 1.2 && s.inventory.water > SETTLEMENT_FOUNDING.water;
  const allowed = state.policy.autonomy !== 'none' && state.policy.growth !== 'restrain';
  const crowdedOut = crowding > 1 && s.population > 2500 && state.tick % 6 === s.id % 6;
  const prosperous = s.population > 5000 && s.wellbeing > 0.75 && s.values.growth > 0.4 && state.tick % 36 === (s.id * 7) % 36;
  if (!allowed || !canEquip || !(crowdedOut || prosperous)) return false;
  const site = bestFoundingSite(state, s);
  if (site < 0) return false;
  foundColony(state, s, site);
  return true;
}

export function bestFoundingSite(state: WorldState, from: Settlement): number {
  const topo = getTopology();
  // Colonists walk unless their home has a port to carry them overseas.
  const reach = activePortCell(state, from) >= 0 ? null : landReach(state, from.cellId);
  let best = -1, bestScore = 0.35;
  for (let i = 0; i < topo.count; i++) {
    const d = greatCircleKm(topo, from.cellId, i);
    if (d < 1200 || d > 3200) continue;
    if (reach && !reach.has(i)) continue;
    if (foundingBlocker(state, i)) continue;
    const score = settlementSuitability(state.cells[i]) - d / 30000;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}

function landReach(state: WorldState, start: number): Set<number> {
  const topo = getTopology();
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) for (const v of topo.neighbors[stack.pop()!]) if (state.cells[v].land && !seen.has(v)) { seen.add(v); stack.push(v); }
  return seen;
}

export function foundColony(state: WorldState, parent: Settlement, cellId: number): Settlement {
  const pop = Math.min(SETTLEMENT_FOUNDING.population * 1.5, parent.population * 0.12);
  parent.population -= pop;
  const s = withRng(state, (rng) => createSettlement(state, cellId, pop, {}, rng));
  for (const g of ['food', 'water', 'timber', 'ore'] as const) {
    const amount = debit(state, parent, g, SETTLEMENT_FOUNDING[g], 'transfer');
    credit(state, s, g, amount, 'transfer');
  }
  parent.last.migrantsOut += pop;
  setKinship(state, parent.id, s.id);
  recordMigration(state, parent, s, pop, true);
  pushEvent(state, 'founded', `Settlers from ${parent.name} founded ${s.name}.`, cellId, s.id, 'good');
  // Colonists break ground on a farm with the supplies they carried.
  for (const c of bestFarmCells(state, s)) if (startBuilding(state, 'farm', c).ok) break;
  return s;
}

/** Colonies begin with strong ties to the community that founded them. */
export function setKinship(state: WorldState, a: number, b: number): void {
  const key = a < b ? `${a}:${b}` : `${b}:${a}`;
  state.relations[key] = { cooperation: 0.5, tradeVolume: 0, competition: 0, reasons: ['Founded as a colony: kinship ties'] };
}

function recordMigration(state: WorldState, from: Settlement, to: Settlement, amount: number, founding: boolean): void {
  state.migrations.push({ tick: state.tick, from: from.id, to: to.id, fromCell: from.cellId, toCell: to.cellId, amount, founding });
  if (state.migrations.length > MIGRATION_LIMIT) state.migrations.splice(0, state.migrations.length - MIGRATION_LIMIT);
}
