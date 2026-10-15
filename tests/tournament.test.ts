import { describe, it, expect } from 'vitest';
import {
  evaluateStrategyRun,
  PassiveStrategy,
  runTournament,
  STANDARD_ENVIRONMENTS,
  STANDARD_STRATEGIES,
  type TournamentEnvironment,
} from '../src/sim/tournament';
import { createReferenceWorld } from '../src/sim/create';
import { checkStateInvariants } from '../src/sim/property';
import { applyCommand } from '../src/sim/commands';
import { step } from '../src/sim/engine';

describe('Automated Strategy Tournament (P074)', () => {
  it('all legal AI strategies issue valid commands that preserve simulation invariants', () => {
    const seed = 'STRAT-LEGAL-VALIDATION';

    for (const strat of STANDARD_STRATEGIES) {
      const state = createReferenceWorld(seed);

      for (let tick = 0; tick < 24; tick++) {
        const decisions = strat.decide({ state, tick });
        expect(Array.isArray(decisions)).toBe(true);

        for (const cmd of decisions) {
          const res = applyCommand(state, cmd);
          // Decisions should be legal or safely handled by the command pipeline
          expect(typeof res.ok).toBe('boolean');
          expect(checkStateInvariants(state).ok).toBe(true);
        }
        step(state);
        expect(checkStateInvariants(state).ok).toBe(true);
      }

      expect(state.settlements.some((s) => s.alive)).toBe(true);
    }
  });

  it('runs matched-seed tournament across distinct environments and generates complete scorecards', () => {
    // Run 24-tick tournament across standard environments
    const report = runTournament(STANDARD_STRATEGIES, STANDARD_ENVIRONMENTS, 24);

    expect(report.totalEnvironments).toBe(STANDARD_ENVIRONMENTS.length);
    expect(report.totalStrategies).toBe(STANDARD_STRATEGIES.length);
    expect(report.outcomes.length).toBe(STANDARD_ENVIRONMENTS.length);

    // Verify scorecard completeness for each outcome
    for (const outcome of report.outcomes) {
      expect(outcome.environment).toBeDefined();
      expect(outcome.rankings.composite.length).toBe(STANDARD_STRATEGIES.length);
      expect(outcome.rankings.resilience.length).toBe(STANDARD_STRATEGIES.length);
      expect(outcome.rankings.welfare.length).toBe(STANDARD_STRATEGIES.length);
      expect(outcome.rankings.ecology.length).toBe(STANDARD_STRATEGIES.length);
      expect(outcome.rankings.trade.length).toBe(STANDARD_STRATEGIES.length);

      for (const strat of STANDARD_STRATEGIES) {
        const m = outcome.metricsByStrategy[strat.id];
        expect(m).toBeDefined();
        expect(m.compositeScore).toBeGreaterThanOrEqual(0);
        expect(m.compositeScore).toBeLessThanOrEqual(100);
        expect(m.resilienceScore).toBeGreaterThanOrEqual(0);
        expect(m.resilienceScore).toBeLessThanOrEqual(100);
        expect(m.welfareScore).toBeGreaterThanOrEqual(0);
        expect(m.welfareScore).toBeLessThanOrEqual(100);
        expect(m.ecologyScore).toBeGreaterThanOrEqual(0);
        expect(m.ecologyScore).toBeLessThanOrEqual(100);
        expect(m.tradeScore).toBeGreaterThanOrEqual(0);
        expect(m.tradeScore).toBeLessThanOrEqual(100);
      }
    }

    // Verify win/loss matrix dimensions
    for (const s1 of STANDARD_STRATEGIES) {
      for (const s2 of STANDARD_STRATEGIES) {
        if (s1.id !== s2.id) {
          expect(typeof report.winLossMatrix[s1.id][s2.id]).toBe('number');
        }
      }
    }
  });

  it('verifies multi-dimensional trade-offs: no single strategy dominates every environment or category', () => {
    const report = runTournament(STANDARD_STRATEGIES, STANDARD_ENVIRONMENTS, 36);

    // Assert that non-dominance invariant holds
    expect(report.nonDominanceVerified).toBe(true);

    // Preservationist should lead in ecology points
    expect(report.categoryChampions.ecology).toBe('preservationist');

    // Different strategies excel in different domains (e.g. Ecology champion != Trade champion)
    expect(report.categoryChampions.ecology).not.toBe(report.categoryChampions.trade);
  });

  it('evaluates custom pluggable strategy within tournament engine', () => {
    const customEnvironment: TournamentEnvironment = {
      id: 'custom-island',
      name: 'Custom Island',
      description: 'Test environment for custom strategy evaluation',
      seed: 'CUSTOM-ISLAND-TEST',
      mode: 'sandbox',
    };

    const initial = createReferenceWorld(customEnvironment.seed);
    const state = structuredClone(initial);

    // Run 12 ticks
    for (let i = 0; i < 12; i++) {
      step(state);
    }

    const metrics = evaluateStrategyRun(state, initial, PassiveStrategy, customEnvironment, 12);
    expect(metrics.strategyId).toBe('passive');
    expect(metrics.ticks).toBe(12);
    expect(metrics.compositeScore).toBeGreaterThan(0);
  });
});
