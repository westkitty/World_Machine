import { describe, expect, it } from 'vitest';
import { applyCommand, previewCommand } from '../src/sim/commands';
import { createReferenceWorld } from '../src/sim/create';
import { deserialize, serialize, validateState, SaveError } from '../src/sim/save';
import { checkScenarioPolicy, createScenarioWorld, scenarioSystem } from '../src/sim/scenarios';
import { runBranch } from '../src/sim/compare';

describe('Authoritative Scenario Constraints (P003)', () => {
  it('rejects prohibited autonomy in first_footprint with actionable reason at command boundary', () => {
    const state = createScenarioWorld('first_footprint');
    expect(state.policy.autonomy).toBe('limited');

    // Attempting full autonomy must be rejected with actionable explanation
    const resFull = applyCommand(state, { type: 'policy', patch: { autonomy: 'full' } });
    expect(resFull.ok).toBe(false);
    expect(resFull.message).toContain('First Footprint requires limited autonomy');
    expect(state.policy.autonomy).toBe('limited'); // State untouched

    // Attempting directed (none) autonomy must also be rejected
    const resNone = applyCommand(state, { type: 'policy', patch: { autonomy: 'none' } });
    expect(resNone.ok).toBe(false);
    expect(resNone.message).toContain('First Footprint requires limited autonomy');
    expect(state.policy.autonomy).toBe('limited');

    // Confirming limited autonomy succeeds
    const resLimited = applyCommand(state, { type: 'policy', patch: { autonomy: 'limited' } });
    expect(resLimited.ok).toBe(true);
    expect(state.policy.autonomy).toBe('limited');

    // previewCommand returns the exact same rejection without state mutation
    const preview = previewCommand(state, { type: 'policy', patch: { autonomy: 'full' } });
    expect(preview.ok).toBe(false);
    expect(preview.message).toBe(resFull.message);
  });

  it('rejects full autonomy in distance_between_us where communities cannot sign independent agreements', () => {
    const state = createScenarioWorld('distance_between_us');
    expect(state.policy.autonomy).toBe('limited');

    const res = applyCommand(state, { type: 'policy', patch: { autonomy: 'full' } });
    expect(res.ok).toBe(false);
    expect(res.message).toContain('The Distance Between Us prohibits full autonomy');
    expect(res.message).toContain('trade agreements');
    expect(state.policy.autonomy).toBe('limited');

    // Setting none or limited is allowed
    const resNone = applyCommand(state, { type: 'policy', patch: { autonomy: 'none' } });
    expect(resNone.ok).toBe(true);
    expect(state.policy.autonomy).toBe('none');
  });

  it('rejects full autonomy in long_drought, green_threshold, and many_futures', () => {
    for (const id of ['long_drought', 'green_threshold', 'many_futures']) {
      const state = createScenarioWorld(id);
      const res = applyCommand(state, { type: 'policy', patch: { autonomy: 'full' } });
      expect(res.ok).toBe(false);
      expect(res.message).toMatch(/prohibits full autonomy/i);
      expect(state.policy.autonomy).toBe('limited');
    }
  });

  it('allows all autonomy settings in unconstrained sandbox worlds', () => {
    const state = createReferenceWorld();
    expect(state.scenario).toBeNull();

    for (const auto of ['none', 'limited', 'full'] as const) {
      const res = applyCommand(state, { type: 'policy', patch: { autonomy: auto } });
      expect(res.ok).toBe(true);
      expect(state.policy.autonomy).toBe(auto);
    }
  });

  it('completed-scenario transitions are authoritative: terminal scenarios reject all commands', () => {
    const state = createScenarioWorld('first_footprint');
    state.scenario!.status = 'failure';
    state.scenario!.message = 'The settlement collapsed.';

    // Any command must reject because scenario has ended
    const resPolicy = applyCommand(state, { type: 'policy', patch: { rationing: true } });
    expect(resPolicy.ok).toBe(false);
    expect(resPolicy.message).toContain('scenario has ended');

    const resBuild = applyCommand(state, { type: 'found', cellId: 100 });
    expect(resBuild.ok).toBe(false);
    expect(resBuild.message).toContain('scenario has ended');

    // Once in terminal status, scenarioSystem never mutates status or message
    scenarioSystem(state);
    expect(state.scenario!.status).toBe('failure');
    expect(state.scenario!.message).toBe('The settlement collapsed.');
  });

  it('save validation and import reject scenario policy constraint violations', () => {
    const valid = createScenarioWorld('first_footprint');
    expect(() => validateState(valid)).not.toThrow();

    // Illegally mutate policy to full autonomy
    valid.policy.autonomy = 'full';
    expect(() => validateState(valid)).toThrow(SaveError);
    expect(() => validateState(valid)).toThrow(/Scenario constraint violated/);

    // Serialization and deserialization fails on corrupt save
    const json = serialize(valid, 'test-illegal');
    expect(() => deserialize(json)).toThrow(SaveError);
  });

  it('save validation enforces message on completed scenario states', () => {
    const state = createScenarioWorld('long_drought');
    state.scenario!.status = 'failure';
    state.scenario!.message = ''; // Missing terminal explanation

    expect(() => validateState(state)).toThrow(SaveError);
    expect(() => validateState(state)).toThrow(/completed scenario requires message/);

    state.scenario!.message = 'Two communities lost to drought.';
    expect(() => validateState(state)).not.toThrow();
  });

  it('checkScenarioPolicy returns null for compliant policy and actionable string for violation', () => {
    const state = createScenarioWorld('first_footprint');
    expect(checkScenarioPolicy(state, { rationing: true })).toBeNull();
    expect(checkScenarioPolicy(state, { extraction: 'intensive' })).toBeNull();
    expect(checkScenarioPolicy(state, { autonomy: 'limited' })).toBeNull();

    const violation = checkScenarioPolicy(state, { autonomy: 'full' });
    expect(violation).not.toBeNull();
    expect(typeof violation).toBe('string');
    expect(violation!.length).toBeGreaterThan(10);
  });

  it('forecast adoption boundary rejects branches that violate scenario policy constraints', () => {
    const base = createScenarioWorld('first_footprint');
    const branch = runBranch(base, 'Strategy B (Illegal)', {}, 12);
    branch.state.policy.autonomy = 'full'; // Illegally mutated branch state

    const violation = checkScenarioPolicy(base, branch.state.policy);
    expect(violation).not.toBeNull();
    expect(violation).toContain('First Footprint requires limited autonomy');
  });
});
