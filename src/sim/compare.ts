import { applyCommand } from './commands';
import { computeMetrics, step } from './engine';
import { meanTerritoryDegradation } from './scenarios';
import { cloneState } from './save';
import type { Policy, WorldState } from './types';

/**
 * Strategy comparison: fork the current world twice, apply a different policy
 * set to each branch and advance both the same number of ticks with the real
 * engine. Because the simulation is deterministic, differences in outcome are
 * caused by the policies alone.
 */
export interface BranchResult {
  label: string;
  policy: Partial<Policy>;
  state: WorldState;
  metrics: {
    population: number;
    settlements: number;
    foodStock: number;
    wellbeing: number;
    degradation: number;
    territoryDegradation: number;
    biomassFrac: number;
    tradeDelivered: number;
    crises: number;
  };
  series: number[];
}

export function runBranch(base: WorldState, label: string, policy: Partial<Policy>, ticks: number): BranchResult {
  const state = cloneState(base);
  const prevMode = state.mode;
  if (state.mode === 'observer') state.mode = 'sandbox';
  applyCommand(state, { type: 'policy', patch: policy });
  state.mode = prevMode;
  const series: number[] = [];
  let delivered = 0;
  const startCrises = state.nextCrisisId;
  for (let i = 0; i < ticks; i++) {
    step(state);
    delivered += state.routes.reduce((a, r) => a + r.movedLastTick, 0);
    series.push(computeMetrics(state).population);
  }
  const m = computeMetrics(state);
  return {
    label, policy, state, series,
    metrics: {
      population: m.population, settlements: m.settlements, foodStock: m.food, wellbeing: m.wellbeing,
      degradation: m.degradation, territoryDegradation: meanTerritoryDegradation(state), biomassFrac: m.biomassFrac,
      tradeDelivered: delivered, crises: state.nextCrisisId - startCrises,
    },
  };
}

export function compareStrategies(base: WorldState, a: Partial<Policy>, b: Partial<Policy>, ticks: number): [BranchResult, BranchResult] {
  return [runBranch(base, 'Strategy A', a, ticks), runBranch(base, 'Strategy B', b, ticks)];
}
