import { describe, it, expect } from 'vitest';
import {
  computeCanonicalStateHash,
  createCheckpointSummary,
  exportReplay,
  importReplay,
  replaySession,
  ReplayRecorder,
  type ReplaySession,
} from '../src/sim/replay';
import { createReferenceWorld } from '../src/sim/create';
import { applyCommand, type Command } from '../src/sim/commands';
import { step } from '../src/sim/engine';
import { serialize, deserialize } from '../src/sim/save';
import { createScenarioWorld } from '../src/sim/scenarios';

describe('Deterministic Civilization Replay Engine (P072)', () => {
  it('records and faithfully reproduces simulation checkpoints and final state', () => {
    const seed = 'REPLAY-TEST-FAITHFUL';
    const state = createReferenceWorld(seed);
    const recorder = new ReplayRecorder(state, 12, { title: '4-year historical chronicle' });

    const commandsToApply: { tick: number; cmd: Command }[] = [
      { tick: 2, cmd: { type: 'policy', patch: { extraction: 'intensive' } } },
      { tick: 6, cmd: { type: 'laborFocus', settlementId: state.settlements[0].id, focus: 'food' } },
      { tick: 15, cmd: { type: 'policy', patch: { reserveMonths: 6 } } },
      { tick: 22, cmd: { type: 'conserve', cellId: state.cells.findIndex((c) => c.land && c.owner < 0), on: true } },
    ];

    for (let tick = 0; tick < 48; tick++) {
      const match = commandsToApply.filter((c) => c.tick === tick);
      for (const m of match) {
        applyCommand(state, m.cmd);
        recorder.recordCommand(tick, m.cmd);
      }
      step(state);
      recorder.onTick(state);
    }

    const session = recorder.getSession();
    expect(session.seed).toBe(seed);
    expect(session.totalTicks).toBe(48);
    expect(session.commands.length).toBe(4);
    // Checkpoints at ticks 0, 12, 24, 36, 48
    expect(session.checkpoints.length).toBe(5);
    expect(session.checkpoints.map((c) => c.tick)).toEqual([0, 12, 24, 36, 48]);

    // Replay session
    const result = replaySession(session);
    expect(result.ok).toBe(true);
    expect(result.divergedAtTick).toBeNull();
    expect(result.checkpointsChecked).toBe(5);
    expect(result.checkpointsPassed).toBe(5);
    expect(result.finalTick).toBe(48);
    expect(result.finalHash).toBe(session.checkpoints[4].hash);

    // Deep equality: the replayed world state is identical to the recorded state
    expect(JSON.stringify(result.state)).toBe(JSON.stringify(state));
  });

  it('records and replays scenario worlds with objective tracking', () => {
    const scenarioId = 'first_footprint';
    const state = createScenarioWorld(scenarioId, false);
    const recorder = new ReplayRecorder(state, 6);

    for (let tick = 0; tick < 24; tick++) {
      step(state);
      recorder.onTick(state);
    }

    const session = recorder.getSession();
    expect(session.scenarioId).toBe(scenarioId);
    expect(session.mode).toBe('scenario');

    const result = replaySession(session);
    expect(result.ok).toBe(true);
    expect(result.checkpointsPassed).toBe(5); // 0, 6, 12, 18, 24
    expect(result.state.scenario?.id).toBe(scenarioId);
    expect(result.state.scenario?.status).toBe(state.scenario?.status);
    expect(JSON.stringify(result.state)).toBe(JSON.stringify(state));
  });

  it('post-save continuation: resumes replay from mid-game save snapshot', () => {
    const seed = 'POST-SAVE-CONTINUATION';
    const state = createReferenceWorld(seed);

    // Advance 24 ticks
    for (let tick = 0; tick < 24; tick++) {
      step(state);
    }

    // Save and initialize recorder from save snapshot
    const savedJson = serialize(state, 'Year 2 Save Point');
    const restored = deserialize(savedJson);

    const recorder = ReplayRecorder.fromSave(restored, 12);
    expect(recorder.getSession().startTick).toBe(24);
    expect(recorder.getSession().initialSaveJson).toBeDefined();

    // Advance another 24 ticks (to tick 48) with player command
    const cmd: Command = { type: 'policy', patch: { growth: 'encourage' } };
    applyCommand(restored, cmd);
    recorder.recordCommand(24, cmd);

    for (let i = 0; i < 24; i++) {
      step(restored);
      recorder.onTick(restored);
    }

    const session = recorder.getSession();
    expect(session.totalTicks).toBe(48);
    expect(session.checkpoints.map((c) => c.tick)).toEqual([24, 36, 48]);

    // Replay session from save snapshot
    const result = replaySession(session);
    expect(result.ok).toBe(true);
    expect(result.checkpointsPassed).toBe(3);
    expect(result.finalTick).toBe(48);
    expect(JSON.stringify(result.state)).toBe(JSON.stringify(restored));
  });

  it('divergence reporting: detects and pinpoints exact tick of state mutation or drift', () => {
    const seed = 'DIVERGENCE-DETECTION';
    const state = createReferenceWorld(seed);
    const recorder = new ReplayRecorder(state, 12);

    for (let tick = 0; tick < 36; tick++) {
      step(state);
      recorder.onTick(state);
    }

    const session = recorder.getSession();
    expect(session.checkpoints.length).toBe(4); // 0, 12, 24, 36

    // Inject an artificial divergence at tick 24 in checkpoint hash
    const corruptedSession: ReplaySession = structuredClone(session);
    corruptedSession.checkpoints[2].hash = 'tampered_hash_0000';

    const result = replaySession(corruptedSession, { stopOnDivergence: true });
    expect(result.ok).toBe(false);
    expect(result.divergedAtTick).toBe(24);
    expect(result.divergenceReport).toBeDefined();
    expect(result.divergenceReport?.tick).toBe(24);
    expect(result.divergenceReport?.expectedHash).toBe('tampered_hash_0000');
    expect(result.checkpointsPassed).toBe(2); // 0 and 12 passed
  });

  it('incompatible ruleset or format version fails clearly without false proof', () => {
    const state = createReferenceWorld('RULESET-CHECK');
    const recorder = new ReplayRecorder(state, 12);
    const session = recorder.getSession();

    // Future ruleset version
    const futureRuleset: ReplaySession = { ...session, rulesetVersion: 99 };
    const resFuture = replaySession(futureRuleset);
    expect(resFuture.ok).toBe(false);
    expect(resFuture.error).toContain('Incompatible ruleset version');

    // Future format version
    const futureFormat: ReplaySession = { ...session, formatVersion: 99 };
    const resFormat = replaySession(futureFormat);
    expect(resFormat.ok).toBe(false);
    expect(resFormat.error).toContain('Unsupported replay format version');
  });

  it('export and import replay JSON roundtrips with strict schema validation', () => {
    const state = createReferenceWorld('EXPORT-IMPORT-CHECK');
    const recorder = new ReplayRecorder(state, 12, { author: 'Automated Suite' });
    const session = recorder.getSession();

    const json = exportReplay(session);
    expect(typeof json).toBe('string');

    const imported = importReplay(json);
    expect(imported.seed).toBe(session.seed);
    expect(imported.formatVersion).toBe(session.formatVersion);
    expect(imported.rulesetVersion).toBe(session.rulesetVersion);
    expect(imported.checkpoints.length).toBe(session.checkpoints.length);

    // Corrupt inputs
    expect(() => importReplay('not json')).toThrow('Failed to parse replay JSON');
    expect(() => importReplay('{"formatVersion": 1}')).toThrow('missing buildId');
    expect(() => importReplay(JSON.stringify({ ...session, checkpoints: 'not-an-array' }))).toThrow('checkpoints must be an array');
  });

  it('canonical state hash is sensitive to population, goods, and policy shifts', () => {
    const state1 = createReferenceWorld('HASH-SENSITIVITY');
    const hash1 = computeCanonicalStateHash(state1);

    // Minor policy shift
    const state2 = structuredClone(state1);
    state2.policy.reserveMonths = 9;
    const hash2 = computeCanonicalStateHash(state2);
    expect(hash2).not.toBe(hash1);

    // Minor population shift
    const state3 = structuredClone(state1);
    state3.settlements[0].population += 10;
    const hash3 = computeCanonicalStateHash(state3);
    expect(hash3).not.toBe(hash1);

    // Minor inventory shift
    const state4 = structuredClone(state1);
    state4.settlements[0].inventory.food += 1;
    const hash4 = computeCanonicalStateHash(state4);
    expect(hash4).not.toBe(hash1);

    // Checkpoint summary captures core totals
    const summary = createCheckpointSummary(state1);
    expect(summary.livingSettlements).toBe(state1.settlements.length);
    expect(summary.population).toBeGreaterThan(0);
  });
});
