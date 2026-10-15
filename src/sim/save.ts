import { SAVE_VERSION } from './create';
import { getTopology } from './topology';
import { GOODS, type WorldState } from './types';

/**
 * Save format: { format, version, savedAt, state }. The state is plain data
 * only (no Three.js objects, no derived topology). Topology is regenerated
 * from the fixed subdivision level, so a save is valid only for a matching
 * cell count; that is checked on load.
 */
export const SAVE_FORMAT = 'world-machine-save';

export interface SaveFile {
  format: string;
  version: number;
  savedAt: string;
  label: string;
  state: WorldState;
}

export function serialize(state: WorldState, label = ''): string {
  const file: SaveFile = { format: SAVE_FORMAT, version: SAVE_VERSION, savedAt: new Date().toISOString(), label, state };
  return JSON.stringify(file);
}

export class SaveError extends Error {}

/** Parse and validate a save, migrating older versions where supported. */
export function deserialize(json: string): WorldState {
  let file: SaveFile;
  try {
    file = JSON.parse(json);
  } catch {
    throw new SaveError('The save file is not valid JSON (it may be truncated or corrupted).');
  }
  if (!file || typeof file !== 'object' || file.format !== SAVE_FORMAT) throw new SaveError('This file is not a World Machine save.');
  if (typeof file.version !== 'number') throw new SaveError('Save has no schema version.');
  if (file.version > SAVE_VERSION) throw new SaveError(`Save version ${file.version} is newer than this game supports (${SAVE_VERSION}).`);
  const state = migrate(file.state, file.version);
  validateState(state);
  return state;
}

function migrate(state: WorldState, version: number): WorldState {
  // Version 1 is the first released schema; future migrations chain here.
  if (version < 1) throw new SaveError(`Save version ${version} is no longer supported.`);
  return state;
}

export function validateState(state: WorldState): void {
  const fail = (m: string) => { throw new SaveError(`Save validation failed: ${m}.`); };
  if (!state || typeof state !== 'object') fail('missing state');
  if (typeof state.seed !== 'string') fail('missing seed');
  if (!Array.isArray(state.rng) || state.rng.length !== 4 || state.rng.some((v) => !Number.isInteger(v))) fail('bad random-generator state');
  if (!Number.isInteger(state.tick) || state.tick < 0) fail('bad tick');
  if (!['sandbox', 'scenario', 'observer', 'challenge'].includes(state.mode)) fail('unknown mode');
  if (!Array.isArray(state.cells) || state.cells.length !== getTopology().count) fail(`expected ${getTopology().count} cells`);
  for (const c of state.cells) {
    if (typeof c.elevation !== 'number' || typeof c.biomass !== 'number' || !Number.isFinite(c.biomass)) fail('corrupt cell');
  }
  if (!Array.isArray(state.settlements)) fail('missing settlements');
  for (const s of state.settlements) {
    if (!s.inventory) fail(`settlement ${s.id} has no inventory`);
    for (const g of GOODS) if (!Number.isFinite(s.inventory[g]) || s.inventory[g] < 0) fail(`settlement ${s.name} has invalid ${g}`);
    if (!Number.isFinite(s.population) || s.population < 0) fail(`settlement ${s.name} has invalid population`);
    if (s.cellId < 0 || s.cellId >= state.cells.length) fail(`settlement ${s.name} is off-planet`);
  }
  const ids = new Set(state.settlements.map((s) => s.id));
  for (const r of state.routes ?? []) if (!ids.has(r.a) || !ids.has(r.b)) fail(`route ${r.id} has a nonexistent endpoint`);
  for (const k of ['buildings', 'roads', 'routes', 'shipments', 'crises', 'events', 'metrics', 'migrations'] as const) {
    if (!Array.isArray(state[k])) fail(`missing ${k}`);
  }
  if (!state.policy || !state.tech || !state.rules || !state.ledger) fail('missing policy, technology, rules or ledger');
}

/** Deep copy via the save path, guaranteeing what is copied is exactly what persists. */
export function cloneState(state: WorldState): WorldState {
  return deserialize(serialize(state));
}
