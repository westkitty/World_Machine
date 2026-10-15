import { BUILDINGS, SETTLEMENT_FOUNDING, TECHS } from './constants';
import { buildingCost, costBlocker, placementBlocker, planRoad, startBuilding, startRoad } from './construction';
import { credit, debit, formatCost, pay, scaledCost } from './economy';
import { roadIndex } from './pathfinding';
import { createSettlement, foundingBlocker, getSettlement, pushEvent, withRng } from './settlements';
import { CRISIS_INFO } from './systems/crises';
import { setKinship } from './systems/migration';
import { applyPlan, planRoute, relationKey, sendShipment } from './systems/trade';
import { getTopology, greatCircleKm } from './topology';
import {
  GOODS, TRADE_GOODS, type BuildingType, type Good, type Inventory, type LaborFocus, type Policy, type Rules, type Settlement,
  type TechId, type WorldState,
} from './types';

/**
 * Player commands. Every command validates prerequisites, explains costs, and
 * mutates simulation state only through the same rules the simulation uses.
 * `previewCommand` performs validation without mutation so the UI can show
 * costs and disabled reasons before the player commits.
 */
export type Command =
  | { type: 'found'; cellId: number; sourceId?: number }
  | { type: 'build'; building: BuildingType; cellId: number }
  | { type: 'demolish'; buildingId: number }
  | { type: 'road'; fromCell: number; toCell: number }
  | { type: 'route'; a: number; b: number }
  | { type: 'removeRoute'; routeId: number }
  | { type: 'routeGoods'; routeId: number; goods: Good[] }
  | { type: 'policy'; patch: Partial<Policy> }
  | { type: 'conserve'; cellId: number; on: boolean }
  | { type: 'research'; tech: TechId; fundingId: number }
  | { type: 'respond'; crisisId: number; response: string; fundingId?: number }
  | { type: 'laborFocus'; settlementId: number; focus: LaborFocus }
  | { type: 'rule'; patch: Partial<Rules> };

export interface CommandResult {
  ok: boolean;
  message: string;
  cost?: Partial<Inventory>;
}

const fail = (message: string): CommandResult => ({ ok: false, message });

export function modeBlocker(state: WorldState): string | null {
  if (state.mode === 'observer') return 'Observer mode: the planet evolves without intervention.';
  if (state.scenario && state.scenario.status !== 'active') return 'The scenario has ended. Restart or choose another to continue playing.';
  return null;
}

export function previewCommand(state: WorldState, cmd: Command): CommandResult {
  const clone = structuredClone(state);
  return applyCommand(clone, cmd);
}

export function applyCommand(state: WorldState, cmd: Command): CommandResult {
  const mb = modeBlocker(state);
  if (mb) return fail(mb);
  return executeCommand(state, cmd);
}

function executeCommand(state: WorldState, cmd: Command): CommandResult {
  switch (cmd.type) {
    case 'found': return found(state, cmd.cellId, cmd.sourceId);
    case 'build': {
      const blocker = placementBlocker(state, cmd.building, cmd.cellId);
      if (blocker) return fail(blocker);
      const cost = buildingCost(state, cmd.building);
      const r = startBuilding(state, cmd.building, cmd.cellId);
      if (!r.ok) return { ok: false, message: r.reason, cost };
      return { ok: true, message: `${BUILDINGS[cmd.building].label} under construction (${BUILDINGS[cmd.building].months} months).`, cost };
    }
    case 'demolish': {
      const b = state.buildings.find((x) => x.id === cmd.buildingId);
      if (!b) return fail('No such structure.');
      // Salvage half the timber cost back (documented source: salvage counts as produced).
      const s = getSettlement(state, b.settlementId);
      state.buildings = state.buildings.filter((x) => x.id !== b.id);
      if (s && b.status === 'active') credit(state, s, 'timber', (BUILDINGS[b.type].cost.timber ?? 0) * 0.25 * b.condition, 'produced');
      return { ok: true, message: `${BUILDINGS[b.type].label} demolished; some timber salvaged.` };
    }
    case 'road': {
      const plan = planRoad(state, cmd.fromCell, cmd.toCell);
      if (typeof plan === 'string') return fail(plan);
      const cb = costBlocker(state, plan.payer, plan.cost);
      if (cb) return { ok: false, message: cb, cost: plan.cost };
      startRoad(state, plan);
      return { ok: true, message: `${Math.round(plan.newKm)} km of road started by ${plan.payer.name} (2 months).`, cost: plan.cost };
    }
    case 'route': return createRoute(state, cmd.a, cmd.b);
    case 'removeRoute': {
      const r = state.routes.find((x) => x.id === cmd.routeId);
      if (!r) return fail('No such route.');
      state.routes = state.routes.filter((x) => x.id !== r.id);
      // Cargo already in transit still arrives (shipments keep their own endpoints).
      for (const sh of state.shipments) if (sh.routeId === r.id) sh.routeId = -1;
      return { ok: true, message: 'Route closed. Cargo already under way will still arrive.' };
    }
    case 'routeGoods': {
      const r = state.routes.find((x) => x.id === cmd.routeId);
      if (!r) return fail('No such route.');
      r.goods = cmd.goods.filter((g) => TRADE_GOODS.includes(g));
      return { ok: true, message: r.goods.length ? `Route now carries ${r.goods.join(', ')}.` : 'Route carries nothing until goods are selected.' };
    }
    case 'policy': {
      const p = { ...state.policy, ...cmd.patch };
      if (cmd.patch.tradePriority) {
        const tp = cmd.patch.tradePriority.filter((g) => TRADE_GOODS.includes(g));
        if (tp.length !== TRADE_GOODS.length || new Set(tp).size !== tp.length) return fail('Trade priority must list each tradeable good once.');
        p.tradePriority = tp;
      }
      if (cmd.patch.reserveMonths !== undefined) p.reserveMonths = Math.max(1, Math.min(12, Math.round(cmd.patch.reserveMonths)));
      state.policy = p;
      return { ok: true, message: 'Policy updated.' };
    }
    case 'conserve': {
      const c = state.cells[cmd.cellId];
      if (!c) return fail('No such region.');
      if (!c.land) return fail('Only land regions can be designated reserves.');
      if (cmd.on && c.owner >= 0) {
        const s = getSettlement(state, c.owner);
        if (s && s.cellId === cmd.cellId) return fail('A settlement centre cannot be a reserve.');
      }
      c.conserved = cmd.on;
      const idle = state.buildings.filter((b) => b.cellId === cmd.cellId && b.type !== 'storage').length;
      return { ok: true, message: cmd.on ? `Reserve designated: no foraging, forestry, farming or mining here${idle ? ` (${idle} structure(s) idled)` : ''}. Land recovers faster.` : 'Reserve lifted.' };
    }
    case 'research': return research(state, cmd.tech, cmd.fundingId);
    case 'respond': return respond(state, cmd.crisisId, cmd.response, cmd.fundingId);
    case 'laborFocus': {
      const s = getSettlement(state, cmd.settlementId);
      if (!s) return fail('No such settlement.');
      s.laborFocus = cmd.focus;
      return { ok: true, message: `${s.name} labour focus: ${cmd.focus}.` };
    }
    case 'rule': {
      if (state.mode !== 'sandbox') return fail('Rules can only be modified in Sandbox mode.');
      const r = { ...state.rules, ...cmd.patch };
      if (cmd.patch.consumptionMult !== undefined) {
        if (!Number.isFinite(cmd.patch.consumptionMult) || cmd.patch.consumptionMult <= 0) return fail('Consumption multiplier must be a positive number.');
        r.consumptionMult = Math.max(0.1, Math.min(5, cmd.patch.consumptionMult));
      }
      if (cmd.patch.constructionCostMult !== undefined) {
        if (!Number.isFinite(cmd.patch.constructionCostMult) || cmd.patch.constructionCostMult <= 0) return fail('Construction cost multiplier must be a positive number.');
        r.constructionCostMult = Math.max(0.1, Math.min(5, cmd.patch.constructionCostMult));
      }
      if (cmd.patch.crisisFrequency !== undefined) {
        if (!Number.isFinite(cmd.patch.crisisFrequency) || cmd.patch.crisisFrequency < 0) return fail('Crisis frequency cannot be negative.');
        r.crisisFrequency = Math.max(0, Math.min(5, cmd.patch.crisisFrequency));
      }
      if (cmd.patch.maxSettlements !== undefined) {
        if (!Number.isInteger(cmd.patch.maxSettlements) || cmd.patch.maxSettlements < 1) return fail('Maximum settlements must be an integer >= 1.');
        r.maxSettlements = Math.max(1, Math.min(100, cmd.patch.maxSettlements));
      }
      state.rules = r;
      return {
        ok: true,
        message: cmd.patch.unrestricted !== undefined
          ? (r.unrestricted ? 'UNRESTRICTED: construction, founding, research and responses are free.' : 'Costs restored.')
          : 'Rules updated.',
      };
    }
  }
}

export function foundingSource(state: WorldState, cellId: number, sourceId?: number): Settlement | 'expedition' | null {
  if (state.expedition) return 'expedition';
  if (sourceId !== undefined) return getSettlement(state, sourceId) ?? null;
  const topo = getTopology();
  let best: Settlement | null = null, bestD = Infinity;
  for (const s of state.settlements) {
    if (!s.alive || s.population < SETTLEMENT_FOUNDING.population * 2.5) continue;
    const d = greatCircleKm(topo, s.cellId, cellId);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

export function foundingCost(state: WorldState): Partial<Inventory> {
  return scaledCost(state, { food: SETTLEMENT_FOUNDING.food, water: SETTLEMENT_FOUNDING.water, timber: SETTLEMENT_FOUNDING.timber, ore: SETTLEMENT_FOUNDING.ore });
}

function found(state: WorldState, cellId: number, sourceId?: number): CommandResult {
  const blocker = foundingBlocker(state, cellId);
  if (blocker) return fail(blocker);
  const source = foundingSource(state, cellId, sourceId);
  if (!source) return fail(`No settlement has the ${SETTLEMENT_FOUNDING.population * 2.5}+ people needed to send settlers.`);
  if (source === 'expedition') {
    const ex = state.expedition!;
    const s = withRng(state, (rng) => createSettlement(state, cellId, ex.population, {}, rng));
    for (const g of GOODS) s.inventory[g] = ex.inventory[g];
    state.expedition = null;
    pushEvent(state, 'founded', `The expedition landed and founded ${s.name}.`, cellId, s.id, 'good');
    return { ok: true, message: `${s.name} founded with ${ex.population} settlers.` };
  }
  const cost = foundingCost(state);
  const cb = costBlocker(state, source, cost);
  if (cb) return { ok: false, message: cb, cost };
  const pop = SETTLEMENT_FOUNDING.population;
  source.population -= pop;
  const s = withRng(state, (rng) => createSettlement(state, cellId, pop, {}, rng));
  for (const g of GOODS) {
    if (!cost[g]) continue;
    if (state.rules.unrestricted) credit(state, s, g, cost[g]!, 'seeded');
    else credit(state, s, g, debit(state, source, g, cost[g]!, 'transfer'), 'transfer');
  }
  state.migrations.push({ tick: state.tick, from: source.id, to: s.id, fromCell: source.cellId, toCell: cellId, amount: pop, founding: true });
  setKinship(state, source.id, s.id);
  pushEvent(state, 'founded', `${s.name} founded by ${pop} settlers from ${source.name}.`, cellId, s.id, 'good');
  return { ok: true, message: `${s.name} founded with ${pop} settlers and supplies from ${source.name}.`, cost };
}

function createRoute(state: WorldState, aId: number, bId: number): CommandResult {
  const a = getSettlement(state, aId), b = getSettlement(state, bId);
  if (!a || !b) return fail('Both endpoints must be living settlements.');
  if (state.routes.some((r) => (r.a === aId && r.b === bId) || (r.a === bId && r.b === aId))) return fail('These settlements are already connected.');
  const plan = planRoute(state, a, b, roadIndex(state.roads));
  if (typeof plan === 'string') return fail(plan);
  const cost = scaledCost(state, { timber: 150 + Math.round(plan.distanceKm / 40) });
  const cb = costBlocker(state, a, cost);
  if (cb) return { ok: false, message: cb, cost };
  if (!state.rules.unrestricted) pay(state, a, cost, 'construction');
  const route = {
    id: state.nextRouteId++, a: a.id, b: b.id, mode: plan.mode, path: [] as number[], distanceKm: 0, roadFraction: 0, capacity: 0,
    travelMonths: 1, lossRate: 0, active: true, blockedReason: '', goods: [...TRADE_GOODS], autonomous: false,
    createdTick: state.tick, movedLastTick: 0, deliveredTotal: 0, deliveredHistory: [] as number[],
  };
  applyPlan(route, plan);
  state.routes.push(route);
  pushEvent(state, 'route', `Trade route opened: ${a.name} ⇄ ${b.name} (${plan.mode}, ${Math.round(plan.distanceKm)} km, ${plan.travelMonths} mo).`, a.cellId, a.id, 'good');
  return { ok: true, message: `Route opened: ${plan.mode}, ${Math.round(plan.distanceKm)} km, ${plan.travelMonths} month(s) transit, ${Math.round(plan.lossRate * 100)}% loss, capacity ${Math.round(plan.capacity)}/month.`, cost };
}

function research(state: WorldState, tech: TechId, fundingId: number): CommandResult {
  const def = TECHS[tech];
  if (!def) return fail('Unknown technology.');
  const t = state.tech[tech];
  if (t.done) return fail(`${def.label} is already known.`);
  if (t.started) return fail(`${def.label} is already being researched.`);
  const s = getSettlement(state, fundingId);
  if (!s) return fail('Choose a settlement to fund the research.');
  const cost = scaledCost(state, def.cost);
  const cb = costBlocker(state, s, cost);
  if (cb) return { ok: false, message: cb, cost };
  if (!state.rules.unrestricted) pay(state, s, cost, 'intervention');
  t.started = true;
  pushEvent(state, 'research', `${s.name} funded research into ${def.label}.`, s.cellId, s.id, 'info');
  return { ok: true, message: `${def.label} research begun: ${def.months} months.`, cost };
}

function respond(state: WorldState, crisisId: number, responseId: string, fundingId?: number): CommandResult {
  const cr = state.crises.find((c) => c.id === crisisId && !c.resolved);
  if (!cr) return fail('That crisis is no longer active.');
  if (cr.responded) return fail('A response is already under way.');
  const resp = CRISIS_INFO[cr.type].responses.find((r) => r.id === responseId);
  if (!resp) return fail('Unknown response.');
  const funder = getSettlement(state, fundingId ?? cr.settlementId) ?? nearestLive(state, cr.cellId);
  const cost = scaledCost(state, resp.cost);
  if (Object.keys(cost).length) {
    if (!funder) return fail('No settlement can fund this response.');
    const cb = costBlocker(state, funder, cost);
    if (cb) return { ok: false, message: cb, cost };
    if (!state.rules.unrestricted) pay(state, funder, cost, 'intervention');
  }
  cr.responded = responseId;
  if (cr.type === 'epidemic' && responseId === 'medicine') {
    cr.endTick = state.tick + Math.max(1, Math.round((cr.endTick - state.tick) * 0.6));
    const s = getSettlement(state, cr.settlementId);
    if (s) s.health = Math.min(1, s.health + 0.1);
  }
  if (cr.type === 'blight' && responseId === 'burn') cr.endTick = state.tick + 2;
  if (cr.type === 'mine_collapse') {
    const b = state.buildings.find((x) => x.cellId === cr.cellId && x.type === 'mine');
    if (b) b.condition = 0.6;
    cr.endTick = state.tick + 1;
  }
  if (cr.type === 'famine') {
    const target = getSettlement(state, cr.settlementId);
    if (!target) return fail('The settlement no longer exists.');
    const donor = richestDonor(state, target);
    if (!donor) { cr.responded = null; return fail('No settlement within 4,500 km has food to spare.'); }
    const amount = Math.min(2000, donor.inventory.food - donor.population * 2);
    const route = { id: -1, lossRate: 0.25, travelMonths: 1 } as unknown as Parameters<typeof sendShipment>[1];
    sendShipment(state, route, donor, target, 'food', amount);
    const rel = state.relations[relationKey(donor.id, target.id)];
    if (rel) rel.cooperation = Math.min(1, rel.cooperation + 0.2);
    pushEvent(state, 'relief', `${donor.name} sent ${Math.round(amount)} food to famine-struck ${target.name}.`, target.cellId, target.id, 'good');
    return { ok: true, message: `${donor.name} dispatched ${Math.round(amount)} food (25% will be lost en route).` };
  }
  pushEvent(state, 'response', `Response to ${CRISIS_INFO[cr.type].label.toLowerCase()}: ${resp.label}.`, cr.cellId, cr.settlementId, 'info');
  return { ok: true, message: `${resp.label}: ${resp.effect}${Object.keys(cost).length ? ` Cost: ${formatCost(cost)}.` : ''}`, cost };
}

function nearestLive(state: WorldState, cellId: number): Settlement | undefined {
  const topo = getTopology();
  let best: Settlement | undefined, d = Infinity;
  for (const s of state.settlements) {
    if (!s.alive) continue;
    const k = greatCircleKm(topo, s.cellId, cellId);
    if (k < d) { d = k; best = s; }
  }
  return best;
}

function richestDonor(state: WorldState, target: Settlement): Settlement | undefined {
  const topo = getTopology();
  let best: Settlement | undefined, bestSpare = 300;
  for (const s of state.settlements) {
    if (!s.alive || s.id === target.id) continue;
    if (greatCircleKm(topo, s.cellId, target.cellId) > 4500) continue;
    const spare = s.inventory.food - s.population * 2;
    if (spare > bestSpare) { bestSpare = spare; best = s; }
  }
  return best;
}
