import { buildingCost, costBlocker, placementBlocker, startBuilding } from '../construction';
import type { TickContext } from '../context';
import { debit } from '../economy';
import { reserveTarget } from '../needs';
import { getSettlement, pushEvent, territoryOf } from '../settlements';
import { getTopology, greatCircleKm } from '../topology';
import { TRADE_GOODS, type BuildingType, type Relation, type Settlement, type WorldState } from '../types';
import { farmYield } from './production';
import { planRoute, relationKey } from './trade';

/**
 * Emergent society: settlement values drift with lived conditions, relations
 * form from trade and competition, and (subject to the autonomy policy)
 * communities build for themselves and sign trade agreements. No political
 * sequence is scripted; behaviour comes from conditions.
 */
export function societySystem(state: WorldState, ctx: TickContext): void {
  const alive = state.settlements.filter((s) => s.alive);
  for (const s of alive) {
    evolveValues(state, s, ctx);
    for (const [k, v] of Object.entries(s.last.bySource)) s.outputAvg[k] = (s.outputAvg[k] ?? v) * 0.9 + v * 0.1;
    for (const k of Object.keys(s.outputAvg)) if (k !== 'trade' && !(k in s.last.bySource)) s.outputAvg[k] *= 0.9;
    const traded = TRADE_GOODS.reduce((a, g) => a + s.last.imported[g] + s.last.exported[g], 0);
    s.outputAvg.trade = (s.outputAvg.trade ?? traded) * 0.9 + traded * 0.1;
    s.specialization = specializationOf(s);
  }
  updateRelations(state, alive);
  if (state.policy.autonomy !== 'none') {
    for (const s of alive) {
      const period = state.policy.autonomy === 'full' ? 4 : 8;
      if (state.tick % period === s.id % period) autonomousDevelopment(state, s, ctx);
    }
    if (state.policy.autonomy === 'full' && state.tick % 6 === 3) autonomousAgreements(state, alive, ctx);
  }
}

function evolveValues(state: WorldState, s: Settlement, ctx: TickContext): void {
  const sat = ctx.sats.get(s.id);
  const v = s.values;
  const terr = territoryOf(state, s.id);
  const deg = terr.length ? terr.reduce((a, i) => a + state.cells[i].degradation, 0) / terr.length : 0;
  const traded = TRADE_GOODS.reduce((a, g) => a + s.last.imported[g] + s.last.exported[g], 0);
  if (sat && sat.food < 0.9) v.growth += 0.01;
  if (deg > 0.35) v.conservation += 0.01 * deg;
  if (traded > 100) v.trade += 0.006;
  // Drift back toward moderation.
  v.growth += (0.5 - v.growth) * 0.01;
  v.conservation += (0.4 - v.conservation) * 0.01;
  v.trade += (0.45 - v.trade) * 0.01;
  v.growth = clamp01(v.growth); v.conservation = clamp01(v.conservation); v.trade = clamp01(v.trade);
}

export function specializationOf(s: Settlement): string {
  const src = s.outputAvg;
  const total = Object.entries(src).reduce((a, [k, v]) => (k === 'trade' ? a : a + v), 0);
  if (total <= 0) return 'Subsistence';
  // Food is everyone's baseline, so it is weighted down; extraction stands out.
  const scores: Record<string, number> = {
    'Trade hub': (src.trade ?? 0) > total * 0.3 ? (src.trade ?? 0) : 0,
    Agrarian: (src.farm ?? 0) * 0.35 + (src.forage ?? 0) * 0.2,
    Fishing: (src.fishing ?? 0) * 0.9,
    Forestry: (src.timber ?? 0) * 1.2,
    Mining: (src.mine ?? 0) * 2.5,
    Energy: (src.energy ?? 0) * 0.6,
  };
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  // Hysteresis: keep an established identity unless another clearly overtakes it.
  const current = scores[s.specialization];
  if (current !== undefined && current > 0 && ranked[0][1] < current * 1.2) return s.specialization;
  return ranked[0][1] > ranked[1][1] * 1.15 ? ranked[0][0] : 'Mixed economy';
}

function bordering(state: WorldState, a: number, b: number): boolean {
  const topo = getTopology();
  for (const i of territoryOf(state, a)) for (const j of topo.neighbors[i]) if (state.cells[j].owner === b) return true;
  return false;
}

function updateRelations(state: WorldState, alive: Settlement[]): void {
  const topo = getTopology();
  const pairVolume = new Map<string, number>();
  for (const r of state.routes) pairVolume.set(relationKey(r.a, r.b), (pairVolume.get(relationKey(r.a, r.b)) ?? 0) + r.movedLastTick);
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i], b = alive[j];
      const key = relationKey(a.id, b.id);
      const vol = pairVolume.get(key) ?? 0;
      const near = greatCircleKm(topo, a.cellId, b.cellId) < 5000;
      if (!near && !pairVolume.has(key) && !state.relations[key]) continue;
      const rel: Relation = state.relations[key] ?? (state.relations[key] = { cooperation: 0, tradeVolume: 0, competition: 0, reasons: [] });
      rel.tradeVolume = rel.tradeVolume * 0.8 + vol * 0.2;
      const border = bordering(state, a.id, b.id);
      // Only tradeable goods create competition; energy is a local grid.
      const sharedShortage = a.last.shortage.filter((g) => g !== 'energy' && b.last.shortage.includes(g));
      const compTarget = border ? Math.min(1, 0.1 + 0.3 * sharedShortage.length) : sharedShortage.length && near ? 0.1 : 0;
      rel.competition += (compTarget - rel.competition) * 0.2;
      const openness = (a.values.trade + b.values.trade) / 2 - 0.5;
      rel.cooperation += 0.03 * Math.min(1, rel.tradeVolume / 300) - 0.03 * rel.competition + 0.004 * openness;
      rel.cooperation += (0 - rel.cooperation) * 0.03; // memory fades: equilibrium ≈ trade − competition
      rel.cooperation = Math.max(-1, Math.min(1, rel.cooperation));
      const reasons: string[] = [];
      if (rel.tradeVolume > 20) reasons.push(`Trade partners moving ~${Math.round(rel.tradeVolume)} units/month`);
      if (border) reasons.push('Share a territorial border');
      if (sharedShortage.length) reasons.push(`Both short of ${sharedShortage.join(', ')}`);
      if (rel.competition > 0.3) reasons.push('Competing for scarce resources');
      if (openness > 0.1) reasons.push('Both value open exchange');
      if (openness < -0.1) reasons.push('Both are inward-looking');
      if (rel.cooperation < -0.3) reasons.push(rel.cooperation < -0.6 ? 'Hostile: trade embargoed' : 'Tense: trade friction');
      rel.reasons = reasons;
    }
  }
}

function autonomousDevelopment(state: WorldState, s: Settlement, ctx: TickContext): void {
  const f = s.last;
  const sat = ctx.sats.get(s.id) ?? { food: 1, water: 1, energy: 1, timber: 1, ore: 1 };
  const foodSupply = f.produced.food + f.imported.food;
  const foodShort = foodSupply < f.needed.food * 1.08 || s.inventory.food < reserveTarget(state, s, 'food') * 0.4;
  const terr = territoryOf(state, s.id);
  const owned = (type: BuildingType) => state.buildings.filter((b) => b.settlementId === s.id && b.type === type).length;
  const cap: Record<BuildingType, number> = {
    farm: 4 + Math.floor(s.population / 4000), mine: 2, storage: 3, energy: 1 + Math.floor(s.population / 9000), port: 1,
  };
  const tryBuild = (type: BuildingType, cells: number[]): boolean => {
    if (owned(type) >= cap[type]) return false;
    const cost = buildingCost(state, type);
    if (costBlocker(state, s, cost)) return false;
    // Prudence: never spend into the reserve needed for upkeep and households.
    for (const g of Object.keys(cost) as (keyof typeof cost)[]) {
      if (s.inventory[g] - (cost[g] ?? 0) < reserveTarget(state, s, g) * 0.3) return false;
    }
    for (const c of cells) {
      if (placementBlocker(state, type, c)) continue;
      return startBuilding(state, type, c).ok;
    }
    return false;
  };
  const byFertility = [...terr].sort((x, y) => scoreFarm(state, y) - scoreFarm(state, x));
  const pending = state.buildings.some((b) => b.settlementId === s.id && b.status === 'construction');
  if (pending) return;
  const oreCells = terr.filter((c) => state.cells[c].ore > 500).sort((x, y) => state.cells[y].ore - state.cells[x].ore);
  if (foodShort) {
    if (tryBuild('farm', byFertility)) return;
    // Farms need ore; open a mine when ore is what blocks food.
    if (s.inventory.ore < buildingCost(state, 'farm').ore! + 200 && tryBuild('mine', oreCells)) return;
    if (s.values.trade > 0.4 && tryBuild('port', terr)) return;
  }
  if (state.policy.autonomy !== 'full') return;
  if (sat.energy < 0.85 && s.population > 2500 && tryBuild('energy', terr)) return;
  const nearlyFull = (['food', 'water', 'timber', 'ore'] as const).some((g) => s.inventory[g] > 10000 && s.inventory[g] > reserveTarget(state, s, g) * 1.4);
  const storages = state.buildings.filter((b) => b.settlementId === s.id && b.type === 'storage').length;
  if (nearlyFull && storages < 3 && tryBuild('storage', terr)) return;
  const mines = state.buildings.filter((b) => b.settlementId === s.id && b.type === 'mine').length;
  if (s.inventory.ore < 600 && mines < 2 && s.values.growth >= s.values.conservation) {
    if (tryBuild('mine', oreCells)) return;
  }
  if (s.population > 7000 && s.values.trade > 0.45 && tryBuild('port', terr)) return;
  if (s.population > 9000 && sat.food > 0.98 && s.values.growth > 0.5) tryBuild('farm', byFertility);
}

function scoreFarm(state: WorldState, cellId: number): number {
  const c = state.cells[cellId];
  return farmYield(state, { id: -1, type: 'farm', cellId, settlementId: c.owner, condition: 1, status: 'active', progress: 0, builtTick: 0, neglect: 0 });
}

function autonomousAgreements(state: WorldState, alive: Settlement[], ctx: TickContext): void {
  const topo = getTopology();
  const count = (id: number) => state.routes.filter((r) => r.autonomous && (r.a === id || r.b === id)).length;
  for (const a of alive) {
    if (count(a.id) >= 2 || a.values.trade < 0.4) continue;
    const surplus = TRADE_GOODS.filter((g) => a.inventory[g] > reserveTarget(state, a, g) * 1.3);
    if (!surplus.length) continue;
    let best: Settlement | null = null, bestD = Infinity;
    for (const b of alive) {
      if (b.id === a.id || count(b.id) >= 2) continue;
      if (state.routes.some((r) => (r.a === a.id && r.b === b.id) || (r.a === b.id && r.b === a.id))) continue;
      const rel = state.relations[relationKey(a.id, b.id)];
      if (rel && rel.cooperation < -0.1) continue;
      const wants = surplus.some((g) => b.inventory[g] < reserveTarget(state, b, g) * 0.7);
      if (!wants) continue;
      const d = greatCircleKm(topo, a.cellId, b.cellId);
      if (d < bestD && d < 4500) { bestD = d; best = b; }
    }
    if (!best || a.inventory.timber < 300) continue;
    const plan = planRoute(state, a, best, ctx.roads);
    if (typeof plan === 'string' || plan.lossRate > 0.2) continue;
    debit(state, a, 'timber', 150, 'construction');
    state.routes.push({
      id: state.nextRouteId++, a: a.id, b: best.id, ...plan, active: true, blockedReason: '',
      goods: [...TRADE_GOODS], autonomous: true, createdTick: state.tick, movedLastTick: 0, deliveredTotal: 0, deliveredHistory: [],
    });
    pushEvent(state, 'agreement', `${a.name} and ${best.name} signed a trade agreement (${plan.mode}, ${Math.round(plan.distanceKm)} km).`, a.cellId, a.id, 'good');
    const b = getSettlement(state, best.id);
    if (b) b.values.trade = clamp01(b.values.trade + 0.05);
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
