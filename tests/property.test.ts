import { describe, it, expect } from 'vitest';
import {
  checkStateInvariants,
  generateCandidateCommand,
  runPropertySimulation,
} from '../src/sim/property';
import { createReferenceWorld } from '../src/sim/create';
import { applyCommand, type Command } from '../src/sim/commands';
import { step } from '../src/sim/engine';
import { Rng, seedRng } from '../src/sim/rng';
import { serialize, deserialize } from '../src/sim/save';

describe('Seeded Property-Based Testing (P073)', () => {
  it('property simulation maintains all invariants over 120 ticks across seeds', () => {
    const seeds = ['PROP-SEED-A', 'PROP-SEED-B', 'PROP-SEED-C'];

    for (const seed of seeds) {
      const result = runPropertySimulation({
        seed,
        ticks: 120,
        commandsPerTick: 2,
        testSaveContinuity: true,
        saveIntervalTicks: 24,
      });

      expect(result.violations).toEqual([]);
      expect(result.ok).toBe(true);
      expect(result.ticksExecuted).toBe(120);
      expect(result.commandsApplied + result.commandsRejected).toBe(240);
      expect(result.finalStateSummary?.livingSettlements).toBeGreaterThan(0);
      expect(result.finalStateSummary?.totalPopulation).toBeGreaterThan(0);
    }
  });

  it('save and load continuity under active command fuzzing reproduces state exactly', () => {
    const seed = 'SAVE-CONTINUITY-FUZZ';
    const state = createReferenceWorld(seed);
    const rng = new Rng(seedRng('FUZZ-RNG'));

    // Advance 60 ticks with random commands
    for (let tick = 0; tick < 60; tick++) {
      const cmd = generateCandidateCommand(state, rng);
      applyCommand(state, cmd);
      step(state);
    }

    // Save state
    const json = serialize(state, 'Mid-run checkpoint');
    const restored = deserialize(json);

    // Both continue for 30 more ticks under identical commands
    const branchRng1 = new Rng(seedRng('BRANCH-RNG'));
    const branchRng2 = new Rng(seedRng('BRANCH-RNG'));

    for (let i = 0; i < 30; i++) {
      const cmd1 = generateCandidateCommand(state, branchRng1);
      const cmd2 = generateCandidateCommand(restored, branchRng2);

      applyCommand(state, cmd1);
      applyCommand(restored, cmd2);

      step(state);
      step(restored);

      // Verify continuous invariant preservation
      expect(checkStateInvariants(state).ok).toBe(true);
      expect(checkStateInvariants(restored).ok).toBe(true);
    }

    expect(restored.tick).toBe(state.tick);
    expect(restored.settlements.length).toBe(state.settlements.length);
    expect(JSON.stringify(restored)).toBe(JSON.stringify(state));
  });

  it('recorded command sequence deterministically reproduces exact world state', () => {
    const seed = 'DETERMINISTIC-REPLAY';
    const state1 = createReferenceWorld(seed);
    const rng = new Rng(seedRng('RECORD-RNG'));
    const recordedCommands: Command[] = [];

    // Run 36 ticks recording applied commands
    for (let i = 0; i < 36; i++) {
      const cmd = generateCandidateCommand(state1, rng);
      applyCommand(state1, cmd);
      recordedCommands.push(cmd);
      step(state1);
    }

    // Replay identical command sequence on fresh world
    const state2 = createReferenceWorld(seed);
    for (let i = 0; i < 36; i++) {
      applyCommand(state2, recordedCommands[i]);
      step(state2);
    }

    expect(state2.tick).toBe(state1.tick);
    expect(JSON.stringify(state2)).toBe(JSON.stringify(state1));
  });

  it('boundary fuzzing: illegal and corrupt commands are rejected without corrupting state', () => {
    const state = createReferenceWorld('BOUNDARY-FUZZ');
    const initialJson = JSON.stringify(state);

    const corruptCommands: Command[] = [
      { type: 'found', cellId: -99 },
      { type: 'found', cellId: 10000 },
      { type: 'build', building: 'farm', cellId: -1 },
      { type: 'demolish', buildingId: -5 },
      { type: 'road', fromCell: -1, toCell: 50 },
      { type: 'road', fromCell: 50, toCell: -1 },
      { type: 'route', a: -1, b: 0 },
      { type: 'route', a: 0, b: -1 },
      { type: 'route', a: 0, b: 0 }, // self-route
      { type: 'removeRoute', routeId: 9999 },
      { type: 'routeGoods', routeId: 9999, goods: [] },
      { type: 'policy', patch: { extraction: 'nonexistent_mode' as any } },
      { type: 'policy', patch: { tradePriority: ['food'] as any } }, // incomplete priority list
      { type: 'conserve', cellId: -10, on: true },
      { type: 'research', tech: 'nonexistent_tech' as any, fundingId: 0 },
      { type: 'respond', crisisId: 9999, response: 'invalid' },
      { type: 'laborFocus', settlementId: -1, focus: 'food' },
    ];

    for (const cmd of corruptCommands) {
      const res = applyCommand(state, cmd);
      expect(res.ok).toBe(false);
      expect(res.message.length).toBeGreaterThan(0);
      expect(checkStateInvariants(state).ok).toBe(true);
    }

    // Since none succeeded, active state matches initial state
    expect(JSON.stringify(state)).toBe(initialJson);
  });
});
