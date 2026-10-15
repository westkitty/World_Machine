import { ROUTE_HISTORY_LIMIT, TRANSPORT } from '../constants';
import type { TickContext } from '../context';
import { credit, debit } from '../economy';
import { reserveTarget } from '../needs';
import { findPath, type PathResult } from '../pathfinding';
import { getSettlement } from '../settlements';
import type { Good, Settlement, TradeRoute, TransportMode, WorldState } from '../types';

export interface RoutePlan {
  mode: TransportMode;
  path: number[];
  distanceKm: number;
  roadFraction: number;
  capacity: number;
  travelMonths: number;
  lossRate: number;
}

export const MAX_ROUTE_KM = 9000;
/** Sea lanes may span up to half the planet's circumference. */
export const MAX_SEA_KM = 20000;

export function activePortCell(state: WorldState, s: Settlement): number {
  const p = state.buildings.find((b) => b.settlementId === s.id && b.type === 'port' && b.status === 'active');
  return p ? p.cellId : -1;
}

function landPlan(state: WorldState, p: PathResult): RoutePlan {
  const rf = p.roadFraction;
  const masonry = state.tech.masonry_roads.done ? 1 + 0.5 * rf : 1;
  const speed = TRANSPORT.land.speedKm + (TRANSPORT.land.roadSpeedKm - TRANSPORT.land.speedKm) * rf;
  const lossPer = TRANSPORT.land.lossPer1000 + (TRANSPORT.land.roadLossPer1000 - TRANSPORT.land.lossPer1000) * rf;
  return {
    mode: 'land', path: p.path, distanceKm: p.distanceKm, roadFraction: rf,
    capacity: TRANSPORT.land.capacity * (1 + TRANSPORT.land.roadCapacityBonus * rf) * masonry,
    travelMonths: Math.max(1, Math.ceil(p.distanceKm / speed)),
    lossRate: Math.min(0.6, (p.distanceKm / 1000) * lossPer),
  };
}

function seaPlan(state: WorldState, p: PathResult): RoutePlan {
  const sea = state.tech.seafaring.done ? 1.5 : 1;
  return {
    mode: 'sea', path: p.path, distanceKm: p.distanceKm, roadFraction: 0,
    capacity: TRANSPORT.sea.capacity * sea,
    travelMonths: Math.max(1, Math.ceil(p.distanceKm / (TRANSPORT.sea.speedKm * sea))),
    lossRate: Math.min(0.6, (p.distanceKm / 1000) * TRANSPORT.sea.lossPer1000),
  };
}

/** Best viable plan between two settlements, or an explanation of why none exists. */
export function planRoute(state: WorldState, a: Settlement, b: Settlement, roads: Set<string>): RoutePlan | string {
  if (a.id === b.id) return 'A route needs two different settlements.';
  const plans: RoutePlan[] = [];
  const land = findPath(state.cells, a.cellId, b.cellId, 'land', roads);
  if (land && land.distanceKm <= MAX_ROUTE_KM) plans.push(landPlan(state, land));
  const pa = activePortCell(state, a), pb = activePortCell(state, b);
  if (pa >= 0 && pb >= 0) {
    const sea = findPath(state.cells, pa, pb, 'sea', roads);
    if (sea && sea.distanceKm <= MAX_SEA_KM) plans.push(seaPlan(state, sea));
  }
  if (!plans.length) {
    if (!land && (pa < 0 || pb < 0)) return 'No land connection. Both settlements need an active port for a sea route.';
    if (!land) return 'No navigable sea path between the ports.';
    return `Too far: overland distance ${Math.round(land.distanceKm)} km exceeds ${MAX_ROUTE_KM} km.`;
  }
  const score = (p: RoutePlan) => p.lossRate * 4 + p.travelMonths * 0.08 - p.capacity / 20000;
  plans.sort((x, y) => score(x) - score(y));
  return plans[0];
}

export function applyPlan(route: TradeRoute, plan: RoutePlan): void {
  route.mode = plan.mode;
  route.path = plan.path;
  route.distanceKm = plan.distanceKm;
  route.roadFraction = plan.roadFraction;
  route.capacity = plan.capacity;
  route.travelMonths = plan.travelMonths;
  route.lossRate = plan.lossRate;
}

export function relationKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function tradeSystem(state: WorldState, ctx: TickContext): void {
  // 1. Re-plan routes when the network changed (roads/ports built or ruined).
  if (ctx.routesDirty || state.tick % 12 === 0) {
    for (const r of state.routes) {
      const a = getSettlement(state, r.a), b = getSettlement(state, r.b);
      if (!a || !b) continue;
      const plan = planRoute(state, a, b, ctx.roads);
      if (typeof plan !== 'string') applyPlan(r, plan);
    }
  }
  // 2. Arrivals.
  for (const r of state.routes) r.movedLastTick = 0;
  const remaining = [];
  for (const sh of state.shipments) {
    if (sh.arriveTick > state.tick) { remaining.push(sh); continue; }
    const dest = getSettlement(state, sh.to);
    const route = state.routes.find((r) => r.id === sh.routeId);
    if (!dest) { state.ledger.transportLoss[sh.good] += sh.amount; continue; }
    credit(state, dest, sh.good, sh.amount, 'transfer');
    dest.last.imported[sh.good] += sh.amount;
    dest.importedTotal += sh.amount;
    if (route) { route.deliveredTotal += sh.amount; route.movedLastTick += sh.amount; }
  }
  state.shipments = remaining;
  for (const r of state.routes) {
    r.deliveredHistory.push(r.movedLastTick);
    if (r.deliveredHistory.length > ROUTE_HISTORY_LIMIT) r.deliveredHistory.shift();
  }

  // 3. Departures.
  const incoming = new Map<string, number>();
  for (const sh of state.shipments) incoming.set(`${sh.to}:${sh.good}`, (incoming.get(`${sh.to}:${sh.good}`) ?? 0) + sh.amount);
  const priority = state.policy.tradePriority;
  for (const r of state.routes) {
    const a = getSettlement(state, r.a), b = getSettlement(state, r.b);
    if (!a || !b) { r.active = false; r.blockedReason = 'An endpoint settlement no longer exists.'; continue; }
    if (r.mode === 'sea' && (activePortCell(state, a) < 0 || activePortCell(state, b) < 0)) {
      r.active = false; r.blockedReason = 'Sea route needs an active port at both ends.'; continue;
    }
    if (ctx.quarantined.has(a.id) || ctx.quarantined.has(b.id)) {
      r.active = false; r.blockedReason = 'Suspended by epidemic quarantine.'; continue;
    }
    const rel = state.relations[relationKey(a.id, b.id)];
    const coop = rel ? rel.cooperation : 0;
    if (coop < -0.6) { r.active = false; r.blockedReason = 'Embargo: relations between the two communities are hostile.'; continue; }
    const upkeep = TRANSPORT.routeUpkeepFood;
    if (a.inventory.food < upkeep) { r.active = false; r.blockedReason = `${a.name} cannot provision caravans (needs ${upkeep} food/month).`; continue; }
    debit(state, a, 'food', upkeep, 'maintenance');
    r.active = true;
    r.blockedReason = coop < -0.3 ? 'Trade friction is reducing throughput.' : '';
    const friction = coop < -0.3 ? 1 + coop : 1;
    for (const [from, to] of [[a, b], [b, a]] as const) {
      let capLeft = r.capacity * friction;
      for (const g of priority) {
        if (!r.goods.includes(g) || capLeft <= 1) continue;
        const exportable = from.inventory[g] - reserveTarget(state, from, g);
        const key = `${to.id}:${g}`;
        // Receivers accept goods up to 1.5× their reserve; senders keep their full reserve.
        const demand = reserveTarget(state, to, g) * 1.5 - to.inventory[g] - (incoming.get(key) ?? 0);
        const amount = Math.min(exportable, demand / Math.max(0.4, 1 - r.lossRate), capLeft);
        if (amount < 5) continue;
        sendShipment(state, r, from, to, g, amount);
        incoming.set(key, (incoming.get(key) ?? 0) + amount * (1 - r.lossRate));
        capLeft -= amount;
      }
    }
  }
}

export function sendShipment(state: WorldState, r: TradeRoute, from: Settlement, to: Settlement, g: Good, amount: number): void {
  const taken = debit(state, from, g, amount, 'transfer');
  if (taken <= 0) return;
  const loss = taken * r.lossRate;
  state.ledger.transportLoss[g] += loss;
  from.last.exported[g] += taken;
  state.shipments.push({ routeId: r.id, from: from.id, to: to.id, good: g, amount: taken - loss, departTick: state.tick, arriveTick: state.tick + r.travelMonths });
}
