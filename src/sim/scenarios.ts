import {
  bestFarmCells, chooseSites, createBaseWorld, placeBuilding, seedSettlement,
} from './create';
import { pushEvent } from './settlements';
import { openCrisis } from './systems/crises';
import { Rng, seedRng } from './rng';
import { GOODS, type GenParams, type Policy, type Settlement, type WorldState } from './types';

/**
 * Scenario definitions are data plus pure evaluators. `objectives` must not
 * mutate state; the engine owns the streak counter and status transitions.
 */
export interface Objective {
  label: string;
  current: string;
  target: string;
  met: boolean;
  progress: number; // 0..1
}

export interface ScenarioDef {
  id: string;
  index: number;
  title: string;
  tagline: string;
  brief: string;
  constraints: string[];
  seed: string;
  params: Partial<GenParams>;
  deadline: number;
  /** Months all objectives must hold simultaneously (0 = immediately on meeting them). */
  holdMonths: number;
  setup(state: WorldState, rng: Rng, challenge: boolean): void;
  objectives(state: WorldState): Objective[];
  failure(state: WorldState): string | null;
  risks(state: WorldState): string[];
  checkPolicyConstraint?(patch: Partial<Policy>, state: WorldState): string | null;
}

export const CHALLENGE_RULES = {
  consumptionMult: 1.15,
  constructionCostMult: 1.3,
  crisisFrequency: 2,
  startingSupplies: 0.7,
  deadlineMult: 0.9,
};

const alive = (s: WorldState) => s.settlements.filter((x) => x.alive);
const totalPop = (s: WorldState) => alive(s).reduce((a, x) => a + x.population, 0);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const n0 = (v: number) => Math.round(v).toLocaleString();

function ownedCells(state: WorldState): number[] {
  // Green Threshold judges the original heartland, so new colonies on fresh land cannot dilute it.
  const memo = state.scenario?.id === 'green_threshold' ? state.scenario.memo : null;
  const out: number[] = [];
  state.cells.forEach((c, i) => { if (memo ? memo[`h${i}`] === 1 : c.owner >= 0) out.push(i); });
  return out;
}

export function meanTerritoryDegradation(state: WorldState): number {
  const cells = ownedCells(state);
  if (!cells.length) return 0;
  return cells.reduce((a, i) => a + state.cells[i].degradation, 0) / cells.length;
}

export function meanTerritoryBiomass(state: WorldState): number {
  const cells = ownedCells(state).filter((i) => state.cells[i].biomassCap > 0);
  if (!cells.length) return 0;
  return cells.reduce((a, i) => a + Math.min(1, state.cells[i].biomass / state.cells[i].biomassCap), 0) / cells.length;
}

export function foodMonths(s: Settlement): number {
  return s.population > 0 ? s.inventory.food / s.population : 0;
}

function obj(label: string, current: string, target: string, met: boolean, progress: number): Objective {
  return { label, current, target, met, progress: Math.max(0, Math.min(1, progress)) };
}

function supplies(challenge: boolean, base: Record<string, number>): Record<string, number> {
  if (!challenge) return base;
  const out: Record<string, number> = { ...base };
  if (out.food) out.food *= CHALLENGE_RULES.startingSupplies;
  if (out.water) out.water *= CHALLENGE_RULES.startingSupplies;
  return out;
}

function standardSettlements(state: WorldState, rng: Rng, count: number, minKm: number, popRange: [number, number], challenge: boolean): Settlement[] {
  const sites = chooseSites(state, { count, minKm });
  return sites.map((c) => {
    const pop = Math.round(rng.range(popRange[0], popRange[1]));
    const s = seedSettlement(state, c, pop, supplies(challenge, { food: pop * 5, water: pop * 2, timber: 2600, ore: 1200 }), rng);
    const farms = bestFarmCells(state, s);
    for (let k = 0; k < Math.min(pop > 5000 ? 2 : 1, farms.length); k++) placeBuilding(state, s, 'farm', farms[k]);
    return s;
  });
}

/** Size of the largest group of living settlements joined by active routes. */
export function largestNetwork(state: WorldState): number {
  const live = state.settlements.filter((s) => s.alive).map((s) => s.id);
  let best = 0;
  const seen = new Set<number>();
  for (const id of live) {
    if (seen.has(id)) continue;
    let size = 0;
    const stack = [id];
    seen.add(id);
    while (stack.length) {
      const u = stack.pop()!;
      size++;
      for (const r of state.routes) {
        if (!r.active) continue;
        const v = r.a === u ? r.b : r.b === u ? r.a : -1;
        if (v >= 0 && !seen.has(v)) { seen.add(v); stack.push(v); }
      }
    }
    best = Math.max(best, size);
  }
  return best;
}

function connected(state: WorldState, ids: number[]): boolean {
  if (ids.length < 2) return true;
  const adj = new Map<number, number[]>();
  for (const r of state.routes) {
    if (!r.active) continue;
    adj.set(r.a, [...(adj.get(r.a) ?? []), r.b]);
    adj.set(r.b, [...(adj.get(r.b) ?? []), r.a]);
  }
  const seen = new Set([ids[0]]);
  const stack = [ids[0]];
  while (stack.length) for (const v of adj.get(stack.pop()!) ?? []) if (!seen.has(v)) { seen.add(v); stack.push(v); }
  return ids.every((i) => seen.has(i));
}

export const SCENARIOS: ScenarioDef[] = [
  {
    id: 'first_footprint', index: 1, title: 'First Footprint',
    tagline: 'Establish and maintain a sustainable settlement.',
    brief: 'An expedition of 900 settlers waits in orbit with limited supplies. Choose a site with the Found tool, then secure food and water and keep the community stable for two consecutive years.',
    constraints: ['Found the settlement within 12 months', 'Local autonomy is limited: you direct construction', 'Supplies cannot be replenished from elsewhere'],
    seed: 'FIRST-FOOTPRINT', params: { oceanCoverage: 0.55 }, deadline: 120, holdMonths: 24,
    setup(state, _rng, challenge) {
      state.policy.autonomy = 'limited';
      const inv = supplies(challenge, { food: 4500, water: 1800, timber: 2600, ore: 900 });
      state.expedition = { population: 900, inventory: { food: inv.food, water: inv.water, timber: inv.timber, ore: inv.ore, energy: 0 } };
      for (const g of GOODS) state.ledger.seeded[g] += state.expedition.inventory[g];
      state.scenario!.baselinePopulation = 900;
    },
    objectives(state) {
      const s = alive(state)[0];
      if (!s) return [obj('Found your settlement', 'expedition waiting', 'founded', false, 0)];
      const water = s.population > 0 ? s.inventory.water / s.population : 0;
      return [
        obj('Found your settlement', s.name, 'founded', true, 1),
        obj('Food reserve', `${foodMonths(s).toFixed(1)} months`, '≥ 3 months', foodMonths(s) >= 3, foodMonths(s) / 3),
        obj('Water reserve', `${water.toFixed(1)} months`, '≥ 1.5 months', water >= 1.5, water / 1.5),
        obj('Population', n0(s.population), '≥ 1,000', s.population >= 1000, s.population / 1000),
        obj('Wellbeing', pct(s.wellbeing), '≥ 55%', s.wellbeing >= 0.55, s.wellbeing / 0.55),
      ];
    },
    failure(state) {
      if (state.expedition && state.tick >= 12) return 'The expedition never settled and its supplies ran out.';
      if (!state.expedition && !alive(state).length) return 'The settlement collapsed.';
      if (!state.expedition && totalPop(state) < 150) return 'Population collapsed below 150.';
      return null;
    },
    risks(state) {
      const s = alive(state)[0];
      const r: string[] = [];
      if (state.expedition) r.push(`${12 - state.tick} months left to found the settlement.`);
      if (s && s.last.shortage.length) r.push(`Shortages: ${s.last.shortage.join(', ')}.`);
      return r;
    },
    checkPolicyConstraint(patch) {
      if (patch.autonomy && patch.autonomy !== 'limited') {
        return 'First Footprint requires limited autonomy: you direct construction while settlements manage internal affairs.';
      }
      return null;
    },
  },
  {
    id: 'distance_between_us', index: 2, title: 'The Distance Between Us',
    tagline: 'Connect isolated regions through functional trade networks.',
    brief: 'Three communities on distant shores each lack what another has: only one holds ore, and its soils are thin. Build ports or roads, open routes, and deliver real goods until every community has received 1,500 units through one connected network.',
    constraints: ['Communities do not sign agreements on their own', 'Drawing a route is not enough: goods must arrive', 'Lose any community and the network fails'],
    seed: 'DISTANCE', params: { oceanCoverage: 0.72 }, deadline: 96, holdMonths: 0,
    setup(state, rng, challenge) {
      state.policy.autonomy = 'limited';
      const sites = chooseSites(state, { count: 3, minKm: 3800, requireCoastal: true, preferDistinctLandmasses: true });
      const kits = [
        { food: 14000, water: 5000, timber: 2600, ore: 320 },
        { food: 5000, water: 4000, timber: 2400, ore: 4500 },
        { food: 6000, water: 4000, timber: 5200, ore: 600 },
      ];
      const ids: number[] = [];
      sites.forEach((c, k) => {
        const pop = Math.round(rng.range(2600, 3400));
        const s = seedSettlement(state, c, pop, supplies(challenge, kits[k]), rng);
        // Complementary geography: only the second community has ore; it has thin soils.
        for (const i of state.cells.keys()) {
          const cell = state.cells[i];
          if (cell.owner !== s.id) continue;
          if (k !== 1) { cell.ore = 0; cell.oreInitial = 0; } else cell.fertilityBase *= 0.35;
        }
        if (k === 0) for (const f of bestFarmCells(state, s).slice(0, 2)) placeBuilding(state, s, 'farm', f);
        if (k === 1) {
          const ore = state.cells.map((x, i) => (x.owner === s.id && x.ore > 500 ? i : -1)).filter((i) => i >= 0);
          if (ore.length) placeBuilding(state, s, 'mine', ore[0]);
          placeBuilding(state, s, 'energy', s.cellId);
        }
        ids.push(s.id);
      });
      state.scenario!.memo.a = ids[0]; state.scenario!.memo.b = ids[1]; state.scenario!.memo.c = ids[2];
    },
    objectives(state) {
      const m = state.scenario!.memo;
      const ids = [m.a, m.b, m.c];
      const ss = ids.map((id) => state.settlements.find((s) => s.id === id)!);
      const net = connected(state, ids);
      const out = [obj('One connected trade network', net ? 'connected' : 'separated', 'all three linked by active routes', net, net ? 1 : 0)];
      for (const s of ss) out.push(obj(`Goods received by ${s.name}`, n0(s.importedTotal), '≥ 1,500', s.importedTotal >= 1500, s.importedTotal / 1500));
      return out;
    },
    failure(state) {
      const m = state.scenario!.memo;
      for (const id of [m.a, m.b, m.c]) {
        const s = state.settlements.find((x) => x.id === id);
        if (!s || !s.alive || s.population < 300) return `${s?.name ?? 'A community'} was lost; the network cannot be completed.`;
      }
      return null;
    },
    risks(state) {
      const r: string[] = [];
      const m = state.scenario!.memo;
      for (const id of [m.a, m.b, m.c]) {
        const s = state.settlements.find((x) => x.id === id);
        if (s?.alive && s.last.shortage.length) r.push(`${s.name} short of ${s.last.shortage.join(', ')}.`);
      }
      for (const route of state.routes) if (!route.active && route.blockedReason) r.push(`Route blocked: ${route.blockedReason}`);
      return r;
    },
    checkPolicyConstraint(patch) {
      if (patch.autonomy === 'full') {
        return 'The Distance Between Us prohibits full autonomy: communities cannot sign independent trade agreements.';
      }
      return null;
    },
  },
  {
    id: 'long_drought', index: 3, title: 'The Long Drought',
    tagline: 'Survive prolonged precipitation failure.',
    brief: 'From month 6 the rains fail planet-wide for four years. Water renewal, soil moisture and harvests collapse. Preserve at least 85% of the population (65% in Challenge) and three of four communities until the rains return and recovery is under way (month 72).',
    constraints: ['Precipitation falls to roughly a third of normal between months 6 and 54', 'Respond through the drought crisis panel, policy and trade', 'Two lost communities means failure'],
    seed: 'LONG-DROUGHT', params: { moisture: 0.9, oceanCoverage: 0.6 }, deadline: 72, holdMonths: 0,
    setup(state, rng, challenge) {
      state.policy.autonomy = 'limited';
      const ss = standardSettlements(state, rng, 4, 2200, [4000, 6000], challenge);
      if (ss[0]) placeBuilding(state, ss[0], 'storage', ss[0].cellId);
      state.scenario!.memo.severity = challenge ? 0.9 : 0.8;
      // Population floor: challenge accepts heavier losses under a harsher drought.
      state.scenario!.memo.floor = challenge ? 0.65 : 0.85;
    },
    objectives(state) {
      const base = state.scenario!.baselinePopulation;
      const p = totalPop(state) / Math.max(1, base);
      const floor = state.scenario!.memo.floor ?? 0.85;
      const n = alive(state).length;
      return [
        obj('Endure until the rains return', state.tick >= 54 ? 'rains returned' : `month ${state.tick} of 54`, 'month 54', state.tick >= 54, state.tick / 54),
        obj('Hold through recovery', `month ${state.tick}`, 'month 72', state.tick >= 72, state.tick / 72),
        obj('Population preserved', pct(p), `≥ ${pct(floor)} of start`, p >= floor, p / floor),
        obj('Communities surviving', `${n} of 4`, '≥ 3', n >= 3, n / 3),
      ];
    },
    failure(state) {
      const p = totalPop(state) / Math.max(1, state.scenario!.baselinePopulation);
      const floor = state.scenario!.memo.floor ?? 0.85;
      if (p < floor) return `Population fell to ${pct(p)} of its starting size (minimum ${pct(floor)}).`;
      if (alive(state).length < 3) return 'Two communities have been lost to the drought.';
      return null;
    },
    risks(state) {
      const r: string[] = [];
      for (const s of alive(state)) {
        const months = s.inventory.water / Math.max(1, s.population);
        if (months < 0.5) r.push(`${s.name}: water reserve ${months.toFixed(1)} months.`);
      }
      return r;
    },
    checkPolicyConstraint(patch) {
      if (patch.autonomy === 'full') {
        return 'The Long Drought prohibits full autonomy: emergency resource coordination cannot be delegated.';
      }
      return null;
    },
  },
  {
    id: 'green_threshold', index: 4, title: 'The Green Threshold',
    tagline: 'Prevent cascading ecological collapse.',
    brief: 'Generations of intensive extraction have degraded every territory. Rebalance extraction, conservation and food so that land recovers — mean degradation at most 30% and vegetation at least 55% of capacity, held for two years — without losing more than 30% of the population.',
    constraints: ['Starts with intensive extraction and heavy degradation', 'Collapse at 80% mean degradation', 'Population must stay above 70% to win, 50% to survive'],
    seed: 'GREEN-THRESHOLD', params: { oceanCoverage: 0.6 }, deadline: 180, holdMonths: 24,
    setup(state, rng, challenge) {
      state.policy.extraction = 'intensive';
      state.policy.autonomy = 'limited';
      const ss = standardSettlements(state, rng, 5, 2300, [5000, 8000], challenge);
      for (const s of ss) {
        // Generations of intensive agriculture: every good field is already farmed.
        for (const f of bestFarmCells(state, s).slice(2, 4)) placeBuilding(state, s, 'farm', f);
        const terr = state.cells.map((x, i) => (x.owner === s.id ? i : -1)).filter((i) => i >= 0);
        const ore = terr.filter((i) => state.cells[i].ore > 500);
        if (ore.length) placeBuilding(state, s, 'mine', ore[0]);
        placeBuilding(state, s, 'energy', s.cellId);
        for (const i of terr) {
          const c = state.cells[i];
          state.scenario!.memo[`h${i}`] = 1;
          c.degradation = rng.range(0.48, 0.62);
          c.biomass = c.biomassCap * rng.range(0.25, 0.4);
          c.soil = rng.range(0.55, 0.7);
          c.pollution = rng.range(0.15, 0.3);
        }
      }
    },
    objectives(state) {
      const d = meanTerritoryDegradation(state);
      const b = meanTerritoryBiomass(state);
      const p = totalPop(state) / Math.max(1, state.scenario!.baselinePopulation);
      return [
        obj('Mean heartland degradation', pct(d), '≤ 30%', d <= 0.3, d <= 0.3 ? 1 : (0.8 - d) / 0.5),
        obj('Heartland vegetation', pct(b), '≥ 55% of capacity', b >= 0.55, b / 0.55),
        obj('Population retained', pct(p), '≥ 70% of start', p >= 0.7, p / 0.7),
      ];
    },
    failure(state) {
      const d = meanTerritoryDegradation(state);
      if (d >= 0.8) return `Ecological collapse: mean degradation reached ${pct(d)}.`;
      const p = totalPop(state) / Math.max(1, state.scenario!.baselinePopulation);
      if (p < 0.5) return `Population fell to ${pct(p)} of its starting size.`;
      return null;
    },
    risks(state) {
      const d = meanTerritoryDegradation(state);
      const r: string[] = [];
      if (d > 0.6) r.push(`Degradation ${pct(d)} is approaching collapse (80%).`);
      if (state.policy.extraction === 'intensive') r.push('Extraction is intensive: harvests exceed regrowth.');
      return r;
    },
    checkPolicyConstraint(patch) {
      if (patch.autonomy === 'full') {
        return 'The Green Threshold prohibits full autonomy: uncontrolled autonomous expansion causes rapid ecological collapse.';
      }
      return null;
    },
  },
  {
    id: 'many_futures', index: 5, title: 'One Planet, Many Futures',
    tagline: 'Develop a resilient planetary network.',
    brief: 'Grow three founding communities into a resilient civilization: six or more settlements linked on one trade network that is moving goods, at least four active routes, three distinct export specialties with every good produced, healthy land and food reserves everywhere — held together for two years.',
    constraints: ['Expansion alone is not rewarded: every settlement must hold reserves', 'Degradation must stay at or below 40%', 'Lose half the population and the future closes'],
    seed: 'MANY-FUTURES', params: { oceanCoverage: 0.58 }, deadline: 300, holdMonths: 24,
    setup(state, rng, challenge) {
      state.policy.autonomy = 'limited';
      const ss = standardSettlements(state, rng, 3, 2600, [5000, 7000], challenge);
      if (ss[0]) placeBuilding(state, ss[0], 'energy', ss[0].cellId);
    },
    objectives(state) {
      const live = alive(state);
      const activeRoutes = state.routes.filter((r) => r.active).length;
      const flowed = state.routes.reduce((a, r) => a + r.deliveredHistory.slice(-24).reduce((x, y) => x + y, 0), 0);
      const network = largestNetwork(state);
      // Export specialties: the good each settlement devotes spare labour to.
      const specs = new Set(live.map((s) => s.last.specialty).filter((x) => x));
      const produced = (['food', 'timber', 'ore', 'energy'] as const).every((g) => live.some((s) => s.last.produced[g] > 50));
      const d = meanTerritoryDegradation(state);
      const minFood = live.length ? Math.min(...live.map(foodMonths)) : 0;
      return [
        obj('Living settlements', `${live.length}`, '≥ 6', live.length >= 6, live.length / 6),
        obj('Active trade routes', `${activeRoutes}`, '≥ 4', activeRoutes >= 4, activeRoutes / 4),
        obj('Largest connected trade network', `${network} settlements, ${n0(flowed)} units / 24 mo`, '≥ 6 linked, goods moving', network >= 6 && flowed > 0, Math.min(1, network / 6) * (flowed > 0 ? 1 : 0.7)),
        obj('Diversified production', `${specs.size} export specialties${produced ? ', all goods made' : ''}`, '≥ 3 specialties + every good', specs.size >= 3 && produced, (Math.min(3, specs.size) / 3) * (produced ? 1 : 0.7)),
        obj('Mean degradation', pct(d), '≤ 40%', d <= 0.4, d <= 0.4 ? 1 : 0.4 / d),
        obj('Lowest food reserve', `${minFood.toFixed(1)} months`, '≥ 2 months everywhere', minFood >= 2, minFood / 2),
      ];
    },
    failure(state) {
      const p = totalPop(state) / Math.max(1, state.scenario!.baselinePopulation);
      if (p < 0.5) return `Planetary population fell to ${pct(p)} of its starting size.`;
      return null;
    },
    risks(state) {
      return alive(state).filter((s) => foodMonths(s) < 2).map((s) => `${s.name} holds only ${foodMonths(s).toFixed(1)} months of food.`);
    },
    checkPolicyConstraint(patch) {
      if (patch.autonomy === 'full') {
        return 'One Planet, Many Futures prohibits full autonomy: expansion must be coordinated with resource reserves.';
      }
      return null;
    },
  },
];

export function getScenario(id: string): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

/**
 * Validates a policy patch against active scenario constraints.
 * Returns an actionable explanation if the policy violates the scenario, or null if legal.
 */
export function checkScenarioPolicy(state: WorldState, patch: Partial<Policy>): string | null {
  if (!state.scenario) return null;
  const def = getScenario(state.scenario.id);
  if (!def) return null;
  if (def.checkPolicyConstraint) {
    return def.checkPolicyConstraint(patch, state);
  }
  if (patch.autonomy === 'full') {
    return `Scenario constraint: ${def.title} prohibits full autonomy.`;
  }
  return null;
}

export function createScenarioWorld(id: string, challenge = false): WorldState {
  const def = getScenario(id);
  if (!def) throw new Error(`Unknown scenario ${id}`);
  const state = createBaseWorld(def.seed, def.params, challenge ? 'challenge' : 'scenario');
  const deadline = Math.round(def.deadline * (challenge && def.id !== 'long_drought' ? CHALLENGE_RULES.deadlineMult : 1));
  state.scenario = { id, challenge, status: 'active', startTick: 0, deadline, streak: 0, baselinePopulation: 0, message: '', memo: {} };
  if (challenge) {
    state.rules.consumptionMult = CHALLENGE_RULES.consumptionMult;
    state.rules.constructionCostMult = CHALLENGE_RULES.constructionCostMult;
    state.rules.crisisFrequency = CHALLENGE_RULES.crisisFrequency;
  }
  def.setup(state, new Rng(seedRng(`${def.seed}:scenario`)), challenge);
  if (!state.scenario.baselinePopulation) state.scenario.baselinePopulation = totalPop(state);
  pushEvent(state, 'scenario', `${challenge ? 'Challenge' : 'Scenario'} ${def.index}: ${def.title} — ${def.tagline}`, -1, -1, 'info');
  return state;
}

/** Applied before the climate step each tick: the Long Drought is a planet-wide drought crisis. */
export function scenarioClimate(state: WorldState): void {
  if (state.scenario?.id !== 'long_drought' || state.scenario.status !== 'active') return;
  if (state.tick === 6) {
    const sev = state.scenario.memo.severity ?? 0.8;
    const center = alive(state)[0]?.cellId ?? 0;
    const c = openCrisis(state, 'drought', center, -1, sev, 48, 25000);
    c.endTick = 54;
    pushEvent(state, 'crisis:drought', 'The Long Drought begins: the rains have failed across the planet.', -1, -1, 'bad');
  }
}

/** Engine step 11: update streak and status from the pure evaluators. */
export function scenarioSystem(state: WorldState): void {
  const sc = state.scenario;
  if (!sc || sc.status !== 'active') return;
  const def = getScenario(sc.id);
  if (!def) return;
  const fail = def.failure(state);
  if (fail) return finish(state, 'failure', fail);
  const objs = def.objectives(state);
  if (objs.every((o) => o.met)) sc.streak += 1;
  else sc.streak = 0;
  if (sc.streak > 0 && sc.streak >= Math.max(1, def.holdMonths)) return finish(state, 'success', `${def.title} complete in ${state.tick} months.`);
  if (state.tick >= sc.deadline) finish(state, 'failure', 'The deadline passed before the objectives were achieved.');
}

function finish(state: WorldState, status: 'success' | 'failure', message: string): void {
  const sc = state.scenario!;
  sc.status = status;
  sc.message = message;
  pushEvent(state, `scenario:${status}`, message, -1, -1, status === 'success' ? 'good' : 'bad');
}
