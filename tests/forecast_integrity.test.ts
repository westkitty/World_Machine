import { describe, expect, it } from 'vitest';
import { compareStrategies, computeStateFingerprint, runBranch, validateBranchAdoption } from '../src/sim/compare';
import { createReferenceWorld } from '../src/sim/create';
import { step } from '../src/sim/engine';
import { createScenarioWorld } from '../src/sim/scenarios';
import { invalidateForecast } from '../src/ui/panels';

describe('Forecast Ownership and Adoption Integrity (P001)', () => {
  it('computes deterministic state fingerprints sensitive to seed, tick, rules, and policy', () => {
    const s1 = createReferenceWorld('TERRA-1', {}, 'sandbox');
    const s2 = createReferenceWorld('TERRA-1', {}, 'sandbox');
    const s3 = createReferenceWorld('TERRA-2', {}, 'sandbox');

    const fp1 = computeStateFingerprint(s1);
    const fp2 = computeStateFingerprint(s2);
    const fp3 = computeStateFingerprint(s3);

    expect(fp1).toBe(fp2);
    expect(fp1).not.toBe(fp3);
    expect(fp1).toMatch(/^wm-fp-[0-9a-f]{8}$/);

    // Modifying tick changes fingerprint
    const s1Advanced = { ...s1, tick: s1.tick + 1 };
    expect(computeStateFingerprint(s1Advanced)).not.toBe(fp1);

    // Modifying policy changes fingerprint
    const s1Policy = { ...s1, policy: { ...s1.policy, extraction: 'intensive' as const } };
    expect(computeStateFingerprint(s1Policy)).not.toBe(fp1);

    // Modifying rules changes fingerprint
    const s1Rules = { ...s1, rules: { ...s1.rules, consumptionMult: 1.5 } };
    expect(computeStateFingerprint(s1Rules)).not.toBe(fp1);
  });

  it('runBranch captures origin seed, tick, fingerprint, and explicit fork semantics', () => {
    const base = createReferenceWorld('TERRA-TEST', {}, 'sandbox');
    const baseFp = computeStateFingerprint(base);

    const branch = runBranch(base, 'Strategy Test', { extraction: 'intensive' }, 12);

    expect(branch.originSeed).toBe('TERRA-TEST');
    expect(branch.originTick).toBe(0);
    expect(branch.originFingerprint).toBe(baseFp);
    expect(branch.forecastTicks).toBe(12);
    expect(branch.fork).toBeDefined();
    expect(branch.fork.originSeed).toBe('TERRA-TEST');
    expect(branch.fork.originTick).toBe(0);
    expect(branch.fork.horizonMonths).toBe(12);
    expect(branch.fork.targetTick).toBe(12);
    expect(branch.fork.originFingerprint).toBe(baseFp);
    expect(branch.fork.rulesetSummary).toContain('Cons ×');
  });

  it('rejects adoption in observer mode', () => {
    const obsState = createReferenceWorld('OBS-1', {}, 'observer');
    const branch = runBranch(obsState, 'Branch A', { extraction: 'restrained' }, 12);

    const res = validateBranchAdoption(obsState, branch);
    expect(res.canAdopt).toBe(false);
    expect(res.reason).toContain('Observer mode cannot adopt a strategy');
  });

  it('rejects adoption if the world seed does not match the forecast origin', () => {
    const worldA = createReferenceWorld('SEED-ALPHA', {}, 'sandbox');
    const worldB = createReferenceWorld('SEED-BETA', {}, 'sandbox');

    const branchA = runBranch(worldA, 'Branch A', { extraction: 'restrained' }, 12);

    const res = validateBranchAdoption(worldB, branchA);
    expect(res.canAdopt).toBe(false);
    expect(res.reason).toContain('seed mismatch');
    expect(res.reason).toContain('SEED-ALPHA');
    expect(res.reason).toContain('SEED-BETA');
  });

  it('rejects adoption if the active world has advanced past forecast origin (no time rewinding)', () => {
    const state = createReferenceWorld('SEED-TIME', {}, 'sandbox');
    const branch = runBranch(state, 'Branch A', { extraction: 'restrained' }, 12);

    // Active world advances by 1 month
    step(state);
    expect(state.tick).toBe(1);

    const res = validateBranchAdoption(state, branch);
    expect(res.canAdopt).toBe(false);
    expect(res.reason).toContain('active world has advanced past forecast origin');
    expect(res.reason).toContain('month 0');
    expect(res.reason).toContain('month 1');
  });

  it('rejects adoption if the active world state mutated since forecast was computed (fingerprint mismatch)', () => {
    const state = createReferenceWorld('SEED-MUTATE', {}, 'sandbox');
    const branch = runBranch(state, 'Branch A', { extraction: 'restrained' }, 12);

    // Player toggles rationing at tick 0 before adopting
    state.policy.rationing = true;

    const res = validateBranchAdoption(state, branch);
    expect(res.canAdopt).toBe(false);
    expect(res.reason).toContain('active world state has mutated since forecast was computed');
  });

  it('rejects adoption if the active scenario has ended or forecast scenario mismatches', () => {
    const scState = createScenarioWorld('first_footprint');
    const branch = runBranch(scState, 'Branch A', { extraction: 'restrained' }, 12);

    // End the scenario
    scState.scenario!.status = 'failure';
    scState.scenario!.message = 'Colony collapsed.';

    const res = validateBranchAdoption(scState, branch);
    expect(res.canAdopt).toBe(false);
    expect(res.reason).toContain('active scenario has already ended');

    // Mismatched scenario ID with matching seed
    const sc2State = createScenarioWorld('long_drought');
    sc2State.seed = branch.originSeed;
    const resMismatch = validateBranchAdoption(sc2State, branch);
    expect(resMismatch.canAdopt).toBe(false);
    expect(resMismatch.reason).toContain('belongs to a different scenario');
  });

  it('rejects adoption if forecast branch reaches a terminal scenario state or violates scenario policy', () => {
    const scState = createScenarioWorld('first_footprint');
    const branch = runBranch(scState, 'Branch A', { extraction: 'restrained' }, 12);

    // Manually mark branch terminal
    branch.state.scenario!.status = 'failure';
    branch.state.scenario!.message = 'Forecast settlement starved.';

    const resTerminal = validateBranchAdoption(scState, branch);
    expect(resTerminal.canAdopt).toBe(false);
    expect(resTerminal.reason).toContain('forecast branch reached a terminal state');

    // Forecast with prohibited autonomy
    const branchIllegal = runBranch(scState, 'Branch Illegal', {}, 12);
    branchIllegal.state.policy.autonomy = 'full';
    branchIllegal.state.scenario!.status = 'active';

    const resIllegal = validateBranchAdoption(scState, branchIllegal);
    expect(resIllegal.canAdopt).toBe(false);
    expect(resIllegal.reason).toContain('First Footprint requires limited autonomy');
  });

  it('allows adoption when active state and forecast origin are congruent and valid', () => {
    const state = createReferenceWorld('SEED-VALID', {}, 'sandbox');
    const [branchA, branchB] = compareStrategies(state, { extraction: 'restrained' }, { extraction: 'intensive' }, 12);

    const valA = validateBranchAdoption(state, branchA);
    expect(valA.canAdopt).toBe(true);
    expect(valA.reason).toBeUndefined();

    const valB = validateBranchAdoption(state, branchB);
    expect(valB.canAdopt).toBe(true);
    expect(valB.reason).toBeUndefined();
  });

  it('supports invalidateForecast to ensure stale forecasts do not persist across world changes', () => {
    // Invalidate should execute cleanly
    expect(() => invalidateForecast()).not.toThrow();
  });
});
