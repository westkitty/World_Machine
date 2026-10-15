import { applyCommand, type Command } from './commands';
import { createReferenceWorld } from './create';
import { step } from './engine';
import { deserialize, serialize } from './save';
import { createScenarioWorld } from './scenarios';
import {
  GOODS,
  type GameMode,
  type Policy,
  type Rules,
  type WorldState,
} from './types';

/**
 * Deterministic Civilization Replay Engine (P072)
 *
 * Records start seed, ruleset and engine build identity, ordered tick-stamped
 * commands, and periodic canonical state hashes. Provides faithful replay
 * execution, checkpoint validation, post-save continuation, and deep
 * divergence reporting when rulesets or versions diverge.
 */

export const REPLAY_FORMAT_VERSION = 1;
export const RULESET_VERSION = 1;
export const ENGINE_BUILD_ID = 'world-machine-v1.0.0';

export interface ReplayCommand {
  tick: number;
  command: Command;
}

export interface ReplayCheckpointSummary {
  population: number;
  livingSettlements: number;
  totalBuildings: number;
  activeCrises: number;
  totalRoutes: number;
}

export interface ReplayCheckpoint {
  tick: number;
  hash: string;
  summary: ReplayCheckpointSummary;
}

export interface ReplaySession {
  formatVersion: number;
  buildId: string;
  rulesetVersion: number;
  recordedAt: string;
  seed: string;
  mode: GameMode;
  scenarioId?: string;
  initialRules: Rules;
  initialPolicy: Policy;
  totalTicks: number;
  checkpoints: ReplayCheckpoint[];
  commands: ReplayCommand[];
  /** Optional starting snapshot if replay was initiated from a mid-game save */
  initialSaveJson?: string;
  startTick?: number;
  metadata?: Record<string, unknown>;
}

export interface DivergenceReport {
  tick: number;
  expectedHash: string;
  actualHash: string;
  differences: string[];
}

export interface ReplayOptions {
  stopOnDivergence?: boolean;
  maxTicks?: number;
  onProgress?: (tick: number, total: number) => void;
}

export interface ReplayResult {
  ok: boolean;
  finalTick: number;
  finalHash: string;
  checkpointsChecked: number;
  checkpointsPassed: number;
  divergedAtTick: number | null;
  divergenceReport?: DivergenceReport;
  state: WorldState;
  error?: string;
}

/**
 * Deterministic dual 32-bit FNV-1a hash producing a 16-character hexadecimal digest.
 */
function doubleFnv1a(str: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x2127599;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c;
    h2 = Math.imul(h2, 0x059a4b87);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Computes a canonical, deterministic state hash across all core simulation systems.
 * Ignores non-simulation runtime properties (e.g. wall clock timestamps).
 */
export function computeCanonicalStateHash(state: WorldState): string {
  const parts: string[] = [];

  // Core metadata
  parts.push(`tick:${state.tick}`);
  parts.push(`seed:${state.seed}`);
  parts.push(`mode:${state.mode}`);
  if (state.scenario) {
    parts.push(`scenario:${state.scenario.id}:${state.scenario.status}:${state.scenario.streak}`);
  }

  // Rules
  const r = state.rules;
  parts.push(`rules:${r.consumptionMult}:${r.constructionCostMult}:${r.crisisFrequency}:${r.unrestricted ? 1 : 0}:${r.maxSettlements}`);

  // Policy
  const p = state.policy;
  parts.push(`policy:${p.extraction}:${p.rationing ? 1 : 0}:${p.growth}:${p.autonomy}:${p.reserveMonths}:${p.tradePriority.join(',')}`);

  // Settlements (sorted by id)
  const sortedSettlements = [...state.settlements].sort((a, b) => a.id - b.id);
  for (const s of sortedSettlements) {
    const invParts = GOODS.map((g) => `${g}=${(s.inventory[g] ?? 0).toFixed(1)}`).join(',');
    parts.push(`s:${s.id}:${s.alive ? 1 : 0}:${s.cellId}:${s.population.toFixed(1)}:${s.wellbeing.toFixed(3)}:${s.health.toFixed(3)}:[${invParts}]`);
  }

  // Buildings (sorted by id)
  const sortedBuildings = [...state.buildings].sort((a, b) => a.id - b.id);
  for (const b of sortedBuildings) {
    parts.push(`b:${b.id}:${b.type}:${b.cellId}:${b.settlementId}:${b.condition.toFixed(2)}:${b.status}`);
  }

  // Roads (sorted by endpoints)
  const sortedRoads = [...state.roads].sort((a, b) => a.a - b.a || a.b - b.b);
  for (const rd of sortedRoads) {
    parts.push(`rd:${rd.a}-${rd.b}:${rd.status}`);
  }

  // Routes (sorted by id)
  const sortedRoutes = [...state.routes].sort((a, b) => a.id - b.id);
  for (const rt of sortedRoutes) {
    parts.push(`rt:${rt.id}:${rt.a}-${rt.b}:${rt.active ? 1 : 0}:${rt.mode}:${rt.goods.join(',')}`);
  }

  // Tech state
  const techKeys = Object.keys(state.tech).sort();
  for (const k of techKeys) {
    const t = state.tech[k as keyof WorldState['tech']];
    parts.push(`tech:${k}:${t.started ? 1 : 0}:${t.progress}:${t.done ? 1 : 0}`);
  }

  // Crises (active)
  const activeCrises = state.crises.filter((c) => !c.resolved).sort((a, b) => a.id - b.id);
  for (const cr of activeCrises) {
    parts.push(`cr:${cr.id}:${cr.type}:${cr.cellId}:${cr.settlementId}:${cr.severity.toFixed(2)}`);
  }

  // 642 cells digest: sample cells and summary statistics
  let totalBiomass = 0;
  let totalDegradation = 0;
  let conservedCount = 0;
  let ownedCount = 0;
  for (let i = 0; i < state.cells.length; i++) {
    const c = state.cells[i];
    totalBiomass += c.biomass;
    totalDegradation += c.degradation;
    if (c.conserved) conservedCount++;
    if (c.owner >= 0) ownedCount++;
  }
  parts.push(`cells:${state.cells.length}:${totalBiomass.toFixed(1)}:${totalDegradation.toFixed(2)}:${conservedCount}:${ownedCount}`);

  return doubleFnv1a(parts.join(';'));
}

/**
 * Creates high-level summary metrics for a checkpoint.
 */
export function createCheckpointSummary(state: WorldState): ReplayCheckpointSummary {
  return {
    population: Math.round(state.settlements.filter((s) => s.alive).reduce((sum, s) => sum + s.population, 0)),
    livingSettlements: state.settlements.filter((s) => s.alive).length,
    totalBuildings: state.buildings.length,
    activeCrises: state.crises.filter((c) => !c.resolved).length,
    totalRoutes: state.routes.filter((r) => r.active).length,
  };
}

/**
 * Compares two world states and generates a human-readable list of divergences.
 */
export function compareWorldStates(expected: WorldState, actual: WorldState): string[] {
  const diffs: string[] = [];

  if (expected.tick !== actual.tick) {
    diffs.push(`Tick mismatch: expected ${expected.tick}, actual ${actual.tick}`);
  }
  if (expected.mode !== actual.mode) {
    diffs.push(`Mode mismatch: expected ${expected.mode}, actual ${actual.mode}`);
  }
  if (expected.scenario?.status !== actual.scenario?.status) {
    diffs.push(`Scenario status: expected ${expected.scenario?.status}, actual ${actual.scenario?.status}`);
  }

  // Settlements
  const expLive = expected.settlements.filter((s) => s.alive);
  const actLive = actual.settlements.filter((s) => s.alive);
  if (expLive.length !== actLive.length) {
    diffs.push(`Living settlement count: expected ${expLive.length}, actual ${actLive.length}`);
  }

  for (const s1 of expLive) {
    const s2 = actLive.find((x) => x.id === s1.id);
    if (!s2) {
      diffs.push(`Settlement "${s1.name}" (id ${s1.id}) missing in actual state`);
      continue;
    }
    const popDiff = Math.abs(s1.population - s2.population);
    if (popDiff > 0.1) {
      diffs.push(`Settlement "${s1.name}" population differs: expected ${s1.population.toFixed(1)}, actual ${s2.population.toFixed(1)}`);
    }
    for (const g of GOODS) {
      const invDiff = Math.abs((s1.inventory[g] ?? 0) - (s2.inventory[g] ?? 0));
      if (invDiff > 0.5) {
        diffs.push(`Settlement "${s1.name}" ${g} inventory differs: expected ${s1.inventory[g].toFixed(1)}, actual ${s2.inventory[g].toFixed(1)}`);
      }
    }
  }

  // Buildings
  if (expected.buildings.length !== actual.buildings.length) {
    diffs.push(`Building count differs: expected ${expected.buildings.length}, actual ${actual.buildings.length}`);
  }

  // Routes
  if (expected.routes.length !== actual.routes.length) {
    diffs.push(`Route count differs: expected ${expected.routes.length}, actual ${actual.routes.length}`);
  }

  return diffs;
}

/**
 * Replays a recorded civilization session from start to finish, asserting checkpoints
 * and reporting divergences if rulesets or execution deviate.
 */
export function replaySession(session: ReplaySession, options: ReplayOptions = {}): ReplayResult {
  // 1. Ruleset & Version Compatibility Verification
  if (session.rulesetVersion > RULESET_VERSION) {
    const emptyState = createReferenceWorld(session.seed);
    return {
      ok: false,
      finalTick: 0,
      finalHash: '',
      checkpointsChecked: 0,
      checkpointsPassed: 0,
      divergedAtTick: 0,
      state: emptyState,
      error: `Incompatible ruleset version: session requires ruleset v${session.rulesetVersion}, current engine is v${RULESET_VERSION}`,
    };
  }

  if (session.formatVersion !== REPLAY_FORMAT_VERSION) {
    const emptyState = createReferenceWorld(session.seed);
    return {
      ok: false,
      finalTick: 0,
      finalHash: '',
      checkpointsChecked: 0,
      checkpointsPassed: 0,
      divergedAtTick: 0,
      state: emptyState,
      error: `Unsupported replay format version: v${session.formatVersion}`,
    };
  }

  // 2. Initialize World State
  let state: WorldState;
  let currentTick: number;

  if (session.initialSaveJson) {
    state = deserialize(session.initialSaveJson);
    currentTick = session.startTick ?? state.tick;
  } else if (session.scenarioId) {
    state = createScenarioWorld(session.scenarioId, session.mode === 'challenge');
    currentTick = 0;
  } else {
    state = createReferenceWorld(session.seed, {}, session.mode);
    currentTick = 0;
  }

  // Apply initial rules and policy if provided
  if (session.initialRules) {
    state.rules = { ...session.initialRules };
  }
  if (session.initialPolicy) {
    state.policy = { ...session.initialPolicy, tradePriority: [...session.initialPolicy.tradePriority] };
  }

  // Group commands by tick
  const commandsByTick = new Map<number, Command[]>();
  for (const c of session.commands) {
    const list = commandsByTick.get(c.tick) ?? [];
    list.push(c.command);
    commandsByTick.set(c.tick, list);
  }

  // Index checkpoints by tick
  const checkpointsByTick = new Map<number, ReplayCheckpoint>();
  for (const cp of session.checkpoints) {
    checkpointsByTick.set(cp.tick, cp);
  }

  let checkpointsChecked = 0;
  let checkpointsPassed = 0;
  let divergedAtTick: number | null = null;
  let divergenceReport: DivergenceReport | undefined;

  // Check initial checkpoint (tick 0 or start tick)
  const initialCp = checkpointsByTick.get(currentTick);
  if (initialCp) {
    checkpointsChecked++;
    const initialHash = computeCanonicalStateHash(state);
    if (initialHash === initialCp.hash) {
      checkpointsPassed++;
    } else {
      divergedAtTick = currentTick;
      divergenceReport = {
        tick: currentTick,
        expectedHash: initialCp.hash,
        actualHash: initialHash,
        differences: [`Initial state hash mismatch at start tick ${currentTick}`],
      };
      if (options.stopOnDivergence) {
        return {
          ok: false,
          finalTick: currentTick,
          finalHash: initialHash,
          checkpointsChecked,
          checkpointsPassed,
          divergedAtTick,
          divergenceReport,
          state,
        };
      }
    }
  }

  const targetTicks = options.maxTicks !== undefined
    ? Math.min(session.totalTicks, currentTick + options.maxTicks)
    : session.totalTicks;

  // 3. Step Through Time
  while (currentTick < targetTicks) {
    // A. Apply any commands queued for current tick before stepping
    const cmds = commandsByTick.get(currentTick);
    if (cmds) {
      for (const cmd of cmds) {
        applyCommand(state, cmd);
      }
    }

    // B. Advance simulation by 1 month
    step(state);
    currentTick = state.tick;

    if (options.onProgress) {
      options.onProgress(currentTick, targetTicks);
    }

    // C. Checkpoint validation
    const cp = checkpointsByTick.get(currentTick);
    if (cp) {
      checkpointsChecked++;
      const actualHash = computeCanonicalStateHash(state);

      if (actualHash === cp.hash) {
        checkpointsPassed++;
      } else {
        divergedAtTick = currentTick;
        divergenceReport = {
          tick: currentTick,
          expectedHash: cp.hash,
          actualHash,
          differences: [`Hash mismatch at tick ${currentTick} (expected ${cp.hash}, got ${actualHash})`],
        };

        if (options.stopOnDivergence) {
          return {
            ok: false,
            finalTick: currentTick,
            finalHash: actualHash,
            checkpointsChecked,
            checkpointsPassed,
            divergedAtTick,
            divergenceReport,
            state,
          };
        }
      }
    }
  }

  const finalHash = computeCanonicalStateHash(state);
  return {
    ok: divergedAtTick === null,
    finalTick: currentTick,
    finalHash,
    checkpointsChecked,
    checkpointsPassed,
    divergedAtTick,
    divergenceReport,
    state,
  };
}

/**
 * Active in-flight replay recorder tracking applied player commands and periodic checkpoints.
 */
export class ReplayRecorder {
  private session: ReplaySession;
  private checkpointInterval: number;

  constructor(state: WorldState, checkpointInterval = 12, metadata?: Record<string, unknown>) {
    this.checkpointInterval = checkpointInterval;
    this.session = {
      formatVersion: REPLAY_FORMAT_VERSION,
      buildId: ENGINE_BUILD_ID,
      rulesetVersion: RULESET_VERSION,
      recordedAt: new Date().toISOString(),
      seed: state.seed,
      mode: state.mode,
      scenarioId: state.scenario?.id,
      initialRules: { ...state.rules },
      initialPolicy: { ...state.policy, tradePriority: [...state.policy.tradePriority] },
      totalTicks: state.tick,
      checkpoints: [
        {
          tick: state.tick,
          hash: computeCanonicalStateHash(state),
          summary: createCheckpointSummary(state),
        },
      ],
      commands: [],
      metadata,
    };
  }

  /**
   * Initializes a recorder from a mid-game save snapshot for post-save continuation.
   */
  static fromSave(state: WorldState, checkpointInterval = 12, metadata?: Record<string, unknown>): ReplayRecorder {
    const recorder = new ReplayRecorder(state, checkpointInterval, metadata);
    recorder.session.initialSaveJson = serialize(state, 'Replay Origin Snapshot');
    recorder.session.startTick = state.tick;
    return recorder;
  }

  recordCommand(tick: number, command: Command): void {
    this.session.commands.push({ tick, command: structuredClone(command) });
  }

  onTick(state: WorldState): void {
    this.session.totalTicks = state.tick;
    if (state.tick % this.checkpointInterval === 0) {
      this.session.checkpoints.push({
        tick: state.tick,
        hash: computeCanonicalStateHash(state),
        summary: createCheckpointSummary(state),
      });
    }
  }

  getSession(): ReplaySession {
    return structuredClone(this.session);
  }

  exportJson(indent = 2): string {
    return JSON.stringify(this.session, null, indent);
  }
}

/**
 * Serializes a replay session to JSON with format verification.
 */
export function exportReplay(session: ReplaySession, indent = 2): string {
  return JSON.stringify(session, null, indent);
}

/**
 * Parses and strictly validates a replay session from JSON.
 */
export function importReplay(jsonString: string): ReplaySession {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    throw new Error(`Failed to parse replay JSON: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid replay: root payload must be an object');
  }

  const s = parsed as Partial<ReplaySession>;
  if (typeof s.formatVersion !== 'number') throw new Error('Invalid replay: missing formatVersion');
  if (typeof s.buildId !== 'string') throw new Error('Invalid replay: missing buildId');
  if (typeof s.rulesetVersion !== 'number') throw new Error('Invalid replay: missing rulesetVersion');
  if (typeof s.seed !== 'string') throw new Error('Invalid replay: missing seed');
  if (!s.mode || typeof s.mode !== 'string') throw new Error('Invalid replay: missing mode');
  if (typeof s.totalTicks !== 'number') throw new Error('Invalid replay: missing totalTicks');
  if (!Array.isArray(s.checkpoints)) throw new Error('Invalid replay: checkpoints must be an array');
  if (!Array.isArray(s.commands)) throw new Error('Invalid replay: commands must be an array');

  return s as ReplaySession;
}
