import { METRIC_LIMIT, TECHS } from './constants';
import { buildContext } from './context';
import { emptyLedger } from './economy';
import { scenarioClimate, scenarioSystem } from './scenarios';
import { pushEvent } from './settlements';
import { climateSystem } from './systems/climate';
import { consumptionSystem } from './systems/consumption';
import { crisisSystem } from './systems/crises';
import { ecologySystem } from './systems/ecology';
import { infrastructureSystem } from './systems/infrastructure';
import { migrationSystem } from './systems/migration';
import { populationSystem } from './systems/population';
import { productionSystem } from './systems/production';
import { societySystem } from './systems/society';
import { tradeSystem } from './systems/trade';
import { GOODS, type MetricSample, type TechId, type WorldState } from './types';

/**
 * One tick = one month. Systems run in this fixed, documented order:
 *  1 seasonal climate  2 ecology  3 production  4 infrastructure
 *  5 transport & trade 6 consumption 7 population 8 migration & founding
 *  9 society, policy & technology 10 crises 11 scenario evaluation
 * 12 history recording.
 * The engine depends on nothing but WorldState and its seeded RNG.
 */
let stepping = false;

export function step(state: WorldState): void {
  if (stepping) throw new Error('Re-entrant simulation step');
  stepping = true;
  try {
    state.ledger = emptyLedger();
    scenarioClimate(state);
    const ctx = buildContext(state);
    climateSystem(state, ctx);
    ecologySystem(state, ctx);
    productionSystem(state, ctx);
    infrastructureSystem(state, ctx);
    if (ctx.routesDirty) ctx.roads = buildContext(state).roads;
    tradeSystem(state, ctx);
    consumptionSystem(state, ctx);
    populationSystem(state, ctx);
    migrationSystem(state, ctx);
    societySystem(state, ctx);
    technologySystem(state);
    crisisSystem(state, ctx);
    // The month is complete: evaluation and history see the elapsed-month count.
    state.tick += 1;
    scenarioSystem(state);
    recordMetrics(state);
  } finally {
    stepping = false;
  }
}

export function stepMany(state: WorldState, ticks: number): void {
  for (let i = 0; i < ticks; i++) step(state);
}

function technologySystem(state: WorldState): void {
  for (const id of Object.keys(state.tech) as TechId[]) {
    const t = state.tech[id];
    if (!t.started || t.done) continue;
    t.progress += 1;
    if (t.progress >= TECHS[id].months) {
      t.done = true;
      pushEvent(state, 'tech', `Discovery: ${TECHS[id].label}. ${TECHS[id].effect}`, -1, -1, 'good');
    }
  }
}

export function computeMetrics(state: WorldState): MetricSample {
  const live = state.settlements.filter((s) => s.alive);
  const sum = (f: (s: (typeof live)[number]) => number) => live.reduce((a, s) => a + f(s), 0);
  const pop = sum((s) => s.population);
  let deg = 0, bio = 0, nLand = 0, nBio = 0;
  for (const c of state.cells) {
    if (!c.land) continue;
    deg += c.degradation; nLand++;
    if (c.biomassCap > 0) { bio += Math.min(1, c.biomass / c.biomassCap); nBio++; }
  }
  const delivered = state.routes.reduce((a, r) => a + r.movedLastTick, 0);
  return {
    tick: state.tick,
    population: pop,
    settlements: live.length,
    food: sum((s) => s.inventory.food),
    water: sum((s) => s.inventory.water),
    timber: sum((s) => s.inventory.timber),
    ore: sum((s) => s.inventory.ore),
    foodProduced: sum((s) => s.last.produced.food),
    degradation: nLand ? deg / nLand : 0,
    biomassFrac: nBio ? bio / nBio : 0,
    tradeDelivered: delivered,
    wellbeing: pop > 0 ? sum((s) => s.wellbeing * s.population) / pop : 0,
  };
}

function recordMetrics(state: WorldState): void {
  state.metrics.push(computeMetrics(state));
  if (state.metrics.length > METRIC_LIMIT) {
    // Keep history bounded: thin the oldest half to every other sample.
    const half = Math.floor(state.metrics.length / 2);
    const old = state.metrics.slice(0, half).filter((_, i) => i % 2 === 0);
    state.metrics = [...old, ...state.metrics.slice(half)];
  }
}

/** Throws if any numeric state is NaN/Infinity or any inventory is negative. */
export function assertStateValid(state: WorldState): void {
  const bad = (v: number) => !Number.isFinite(v);
  for (const s of state.settlements) {
    for (const g of GOODS) {
      if (bad(s.inventory[g]) || s.inventory[g] < 0) throw new Error(`Invalid inventory ${s.name}.${g}=${s.inventory[g]}`);
    }
    if (bad(s.population) || s.population < 0) throw new Error(`Invalid population ${s.name}=${s.population}`);
    if (bad(s.wellbeing) || bad(s.health) || bad(s.housing)) throw new Error(`Invalid wellbeing/health/housing at ${s.name}`);
  }
  state.cells.forEach((c, i) => {
    for (const k of ['biomass', 'fish', 'ore', 'waterStock', 'degradation', 'pollution', 'soil', 'temperature', 'precip', 'moisture'] as const) {
      if (bad(c[k]) || (k !== 'temperature' && c[k] < 0)) throw new Error(`Invalid cell ${i}.${k}=${c[k]}`);
    }
  });
  for (const sh of state.shipments) if (bad(sh.amount) || sh.amount < 0) throw new Error('Invalid shipment');
}
