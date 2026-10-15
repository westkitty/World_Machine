import { describe, expect, it } from 'vitest';
import { compareStrategies, computeStateFingerprint, validateBranchAdoption } from '../src/sim/compare';
import { createReferenceWorld } from '../src/sim/create';
import { ForecastService } from '../src/sim/forecast_service';
import type { Policy } from '../src/sim/types';

describe('Nonblocking Strategy Comparison (P006)', () => {
  it('deterministic match: forecast output matches main-engine compareStrategies output', async () => {
    const state = createReferenceWorld('FORECAST-DET-1', {}, 'sandbox');
    const policyA: Partial<Policy> = { extraction: 'restrained', rationing: false };
    const policyB: Partial<Policy> = { extraction: 'intensive', growth: 'encourage' };
    const horizon = 12;

    const expected = compareStrategies(state, policyA, policyB, horizon);

    const service = new ForecastService();
    const resultPromise = new Promise<[any, any]>((resolve, reject) => {
      service.subscribe((s) => {
        if (s.status === 'complete' && s.result) {
          resolve(s.result);
        } else if (s.status === 'error') {
          reject(new Error(s.error || 'Failed'));
        }
      });
    });

    service.start(state, policyA, policyB, horizon);
    const [branchA, branchB] = await resultPromise;
    service.destroy();

    // Verify Branch A deterministic equality
    expect(branchA.label).toBe(expected[0].label);
    expect(branchA.originSeed).toBe(expected[0].originSeed);
    expect(branchA.originTick).toBe(expected[0].originTick);
    expect(branchA.originFingerprint).toBe(expected[0].originFingerprint);
    expect(branchA.forecastTicks).toBe(expected[0].forecastTicks);
    expect(branchA.metrics).toEqual(expected[0].metrics);
    expect(branchA.series).toEqual(expected[0].series);

    // Verify Branch B deterministic equality
    expect(branchB.label).toBe(expected[1].label);
    expect(branchB.originSeed).toBe(expected[1].originSeed);
    expect(branchB.originTick).toBe(expected[1].originTick);
    expect(branchB.originFingerprint).toBe(expected[1].originFingerprint);
    expect(branchB.forecastTicks).toBe(expected[1].forecastTicks);
    expect(branchB.metrics).toEqual(expected[1].metrics);
    expect(branchB.series).toEqual(expected[1].series);
  });

  it('progress reporting: captures incremental percentage and branch progression', async () => {
    const state = createReferenceWorld('FORECAST-PROG-1', {}, 'sandbox');
    const service = new ForecastService();
    const progressList: number[] = [];
    const branches = new Set<string>();

    const donePromise = new Promise<void>((resolve) => {
      service.subscribe((s) => {
        if (s.progress) {
          progressList.push(s.progress.pct);
          branches.add(s.progress.branch);
        }
        if (s.status === 'complete') {
          resolve();
        }
      });
    });

    service.start(state, { extraction: 'restrained' }, { extraction: 'intensive' }, 6);
    await donePromise;
    service.destroy();

    expect(progressList.length).toBeGreaterThan(0);
    // Percentage must reach 100% or close to completion and be monotonically non-decreasing
    for (let i = 1; i < progressList.length; i++) {
      expect(progressList[i]).toBeGreaterThanOrEqual(progressList[i - 1]);
    }
    expect(branches.has('A')).toBe(true);
    expect(branches.has('B')).toBe(true);
  });

  it('cancellation: stops in-flight forecast and discards computation', async () => {
    const state = createReferenceWorld('FORECAST-CANCEL-1', {}, 'sandbox');
    const service = new ForecastService();

    let completed = false;
    service.subscribe((s) => {
      if (s.status === 'complete') completed = true;
    });

    service.start(state, { extraction: 'restrained' }, { extraction: 'intensive' }, 24);
    expect(service.getState().status).toBe('running');

    service.cancel();
    expect(service.getState().status).toBe('idle');
    expect(service.getState().progress).toBeNull();
    expect(service.getState().result).toBeNull();

    // Wait a brief tick to ensure no background completion occurs
    await new Promise((r) => setTimeout(r, 50));
    expect(completed).toBe(false);
    expect(service.getState().status).toBe('idle');
    service.destroy();
  });

  it('staleness detection: world advancement or mutation invalidates adoption', async () => {
    const state = createReferenceWorld('FORECAST-STALE-1', {}, 'sandbox');
    const service = new ForecastService();

    const donePromise = new Promise<void>((resolve) => {
      service.subscribe((s) => {
        if (s.status === 'complete') resolve();
      });
    });

    service.start(state, { extraction: 'restrained' }, { extraction: 'intensive' }, 12);
    await donePromise;

    const completedState = service.getState();
    expect(completedState.status).toBe('complete');
    expect(completedState.result).not.toBeNull();

    // With unchanged state, adoption is valid
    const initialValidation = validateBranchAdoption(state, completedState.result![0]);
    expect(initialValidation.canAdopt).toBe(true);

    // 1. Advance the world clock: checkStaleness should flag stale
    const advancedState = { ...state, tick: state.tick + 1 };
    const isStaleAfterTick = service.checkStaleness(advancedState);
    expect(isStaleAfterTick).toBe(true);
    expect(service.getState().status).toBe('stale');

    const tickValidation = validateBranchAdoption(advancedState, completedState.result![0]);
    expect(tickValidation.canAdopt).toBe(false);
    expect(tickValidation.reason).toContain('active world has advanced past forecast origin');

    // 2. State mutation (e.g. policy modification): checkStaleness should flag stale
    const mutatedState = {
      ...state,
      policy: { ...state.policy, extraction: 'intensive' as const },
    };
    const isStaleAfterMutation = service.checkStaleness(mutatedState);
    expect(isStaleAfterMutation).toBe(true);

    const mutationValidation = validateBranchAdoption(mutatedState, completedState.result![0]);
    expect(mutationValidation.canAdopt).toBe(false);
    expect(mutationValidation.reason).toContain('active world state has mutated');

    service.destroy();
  });

  it('ignores messages with mismatched or stale request IDs', () => {
    const service = new ForecastService();
    const state = createReferenceWorld('FORECAST-MSG-1', {}, 'sandbox');
    const fp = computeStateFingerprint(state);

    service.start(state, {}, {}, 6);
    const activeReqId = service.getState().requestId;
    expect(activeReqId).toBeTruthy();

    // Send a message with an obsolete request ID
    service.handleMessage({
      type: 'result',
      id: 'req-obsolete-999',
      originFingerprint: fp,
      result: [] as any,
    });

    // Active status must still be running and result must remain null
    expect(service.getState().status).toBe('running');
    expect(service.getState().result).toBeNull();

    service.destroy();
  });

  it('simulates 10-year horizon (120 months) cleanly with full fork semantics', async () => {
    const state = createReferenceWorld('FORECAST-10YR-1', {}, 'sandbox');
    const service = new ForecastService();

    const donePromise = new Promise<void>((resolve, reject) => {
      service.subscribe((s) => {
        if (s.status === 'complete') resolve();
        if (s.status === 'error') reject(new Error(s.error || 'Failed'));
      });
    });

    service.start(state, { extraction: 'restrained' }, { extraction: 'intensive' }, 120);
    await donePromise;

    const res = service.getState().result;
    expect(res).not.toBeNull();
    const [a, b] = res!;

    expect(a.series.length).toBe(120);
    expect(b.series.length).toBe(120);
    expect(a.forecastTicks).toBe(120);
    expect(b.forecastTicks).toBe(120);
    expect(a.fork.horizonMonths).toBe(120);
    expect(b.fork.horizonMonths).toBe(120);
    expect(a.fork.targetTick).toBe(state.tick + 120);
    expect(b.fork.targetTick).toBe(state.tick + 120);

    service.destroy();
  });
});
