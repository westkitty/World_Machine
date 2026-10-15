import { applyCommand } from './commands';
import { computeMetrics, step } from './engine';
import { checkScenarioPolicy, meanTerritoryDegradation } from './scenarios';
import { cloneState } from './save';
import { formatDate, type Policy, type WorldState } from './types';

/**
 * 32-bit FNV-1a hash formatted as hex string.
 */
function fnv1a(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function computeStateFingerprint(state: WorldState): string {
  const livePop = state.settlements.reduce((sum, s) => sum + s.population, 0);
  const core = [
    state.seed,
    state.tick,
    state.mode,
    state.scenario ? `${state.scenario.id}:${state.scenario.status}:${state.scenario.streak}` : 'none',
    state.rules.consumptionMult,
    state.rules.constructionCostMult,
    state.rules.crisisFrequency,
    state.rules.unrestricted ? 1 : 0,
    state.policy.extraction,
    state.policy.rationing ? 1 : 0,
    state.policy.growth,
    state.policy.autonomy,
    state.policy.tradePriority.join(','),
    state.policy.reserveMonths,
    state.settlements.length,
    Math.round(livePop),
    state.buildings.length,
    state.routes.length,
    state.nextBuildingId,
    state.nextSettlementId,
  ].join('|');
  return `wm-fp-${fnv1a(core)}`;
}

export interface ForkSemantics {
  originSeed: string;
  originTick: number;
  originDate: string;
  originFingerprint: string;
  targetTick: number;
  horizonMonths: number;
  mode: string;
  scenarioId?: string;
  rulesetSummary: string;
}

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
  originSeed: string;
  originTick: number;
  originFingerprint: string;
  forecastTicks: number;
  fork: ForkSemantics;
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

export interface AdoptionValidation {
  canAdopt: boolean;
  reason?: string;
}

export function validateBranchAdoption(activeState: WorldState, branch: BranchResult): AdoptionValidation {
  if (activeState.mode === 'observer') {
    return { canAdopt: false, reason: 'Observer mode cannot adopt a strategy.' };
  }
  if (activeState.scenario && activeState.scenario.status !== 'active') {
    return { canAdopt: false, reason: 'Cannot adopt forecast: active scenario has already ended.' };
  }
  if (branch.originSeed !== activeState.seed) {
    return {
      canAdopt: false,
      reason: `Cannot adopt forecast: seed mismatch (forecast belongs to world “${branch.originSeed}”, active world is “${activeState.seed}”).`,
    };
  }
  if (activeState.scenario && (!branch.state.scenario || branch.state.scenario.id !== activeState.scenario.id)) {
    return { canAdopt: false, reason: 'Cannot adopt forecast: forecast belongs to a different scenario.' };
  }
  if (activeState.tick !== branch.originTick) {
    return {
      canAdopt: false,
      reason: `Cannot adopt forecast: active world has advanced past forecast origin (forecast created at month ${branch.originTick}, world is at month ${activeState.tick}). Run a fresh comparison.`,
    };
  }
  const currentFp = computeStateFingerprint(activeState);
  if (currentFp !== branch.originFingerprint) {
    return {
      canAdopt: false,
      reason: 'Cannot adopt forecast: active world state has mutated since forecast was computed. Run a fresh comparison.',
    };
  }
  if (activeState.scenario) {
    if (branch.state.scenario && branch.state.scenario.status !== 'active') {
      return {
        canAdopt: false,
        reason: `Cannot adopt forecast: forecast branch reached a terminal state (${branch.state.scenario.status}: ${branch.state.scenario.message || 'ended'}).`,
      };
    }
    const policyViolation = checkScenarioPolicy(activeState, branch.state.policy);
    if (policyViolation) {
      return { canAdopt: false, reason: `Cannot adopt forecast: ${policyViolation}` };
    }
  }
  return { canAdopt: true };
}

export function runBranch(base: WorldState, label: string, policy: Partial<Policy>, ticks: number): BranchResult {
  const originSeed = base.seed;
  const originTick = base.tick;
  const originFingerprint = computeStateFingerprint(base);

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
  const fork: ForkSemantics = {
    originSeed,
    originTick,
    originDate: formatDate(originTick),
    originFingerprint,
    targetTick: originTick + ticks,
    horizonMonths: ticks,
    mode: base.mode,
    scenarioId: base.scenario?.id,
    rulesetSummary: `Cons ×${base.rules.consumptionMult} · Cost ×${base.rules.constructionCostMult}`,
  };

  return {
    label,
    policy,
    state,
    originSeed,
    originTick,
    originFingerprint,
    forecastTicks: ticks,
    fork,
    series,
    metrics: {
      population: m.population,
      settlements: m.settlements,
      foodStock: m.food,
      wellbeing: m.wellbeing,
      degradation: m.degradation,
      territoryDegradation: meanTerritoryDegradation(state),
      biomassFrac: m.biomassFrac,
      tradeDelivered: delivered,
      crises: state.nextCrisisId - startCrises,
    },
  };
}

export function compareStrategies(base: WorldState, a: Partial<Policy>, b: Partial<Policy>, ticks: number): [BranchResult, BranchResult] {
  return [runBranch(base, 'Strategy A', a, ticks), runBranch(base, 'Strategy B', b, ticks)];
}
