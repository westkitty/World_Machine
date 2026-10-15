import { BUILDINGS, TECHS } from './constants';
import { SAVE_VERSION } from './create';
import { getTopology } from './topology';
import { GOODS, TRADE_GOODS, type WorldState } from './types';

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

export type MigrationFn = (state: any) => any;

/**
 * Registry of sequential schema migrations.
 * Each entry migrations[N] transforms a save from version N to N + 1.
 */
export const MIGRATIONS: Record<number, MigrationFn> = {
  // Version 1 is the baseline schema. Future versions (e.g. 1 -> 2) chain here.
};

export function migrate(state: any, version: number): WorldState {
  if (version < 1) throw new SaveError(`Save version ${version} is no longer supported.`);
  let current = state;
  for (let v = version; v < SAVE_VERSION; v++) {
    const migrator = MIGRATIONS[v];
    if (!migrator) {
      throw new SaveError(`No migration path from save version ${v} to ${v + 1}.`);
    }
    current = migrator(current);
    current.version = v + 1;
  }
  return current as WorldState;
}

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

export function validateState(state: WorldState): void {
  const fail = (m: string): never => { throw new SaveError(`Save validation failed: ${m}.`); };
  if (!state || typeof state !== 'object') fail('missing state');
  if (typeof state.seed !== 'string') fail('missing seed');
  if (!Array.isArray(state.rng) || state.rng.length !== 4 || state.rng.some((v) => !Number.isInteger(v))) fail('bad random-generator state');
  if (!Number.isInteger(state.tick) || state.tick < 0) fail('bad tick');
  if (!['sandbox', 'scenario', 'observer', 'challenge'].includes(state.mode)) fail('unknown mode');

  const topoCount = getTopology().count;
  if (!Array.isArray(state.cells) || state.cells.length !== topoCount) fail(`expected ${topoCount} cells`);
  for (let i = 0; i < state.cells.length; i++) {
    const c = state.cells[i];
    if (typeof c.elevation !== 'number' || typeof c.biomass !== 'number' || !Number.isFinite(c.biomass)) fail(`corrupt cell ${i}`);
  }

  // Nested validation: rules
  if (!state.rules || typeof state.rules !== 'object') fail('missing rules');
  const r = state.rules;
  if (!Number.isFinite(r.consumptionMult) || r.consumptionMult <= 0) fail('rules.consumptionMult must be positive finite');
  if (!Number.isFinite(r.constructionCostMult) || r.constructionCostMult <= 0) fail('rules.constructionCostMult must be positive finite');
  if (!Number.isFinite(r.crisisFrequency) || r.crisisFrequency < 0) fail('rules.crisisFrequency must be non-negative');
  if (typeof r.unrestricted !== 'boolean') fail('rules.unrestricted must be boolean');
  if (!Number.isInteger(r.maxSettlements) || r.maxSettlements < 1) fail('rules.maxSettlements must be integer >= 1');

  // Nested validation: policy
  if (!state.policy || typeof state.policy !== 'object') fail('missing policy');
  const p = state.policy;
  if (!['conserve', 'normal', 'intensive'].includes(p.extraction)) fail('invalid policy.extraction');
  if (typeof p.rationing !== 'boolean') fail('policy.rationing must be boolean');
  if (!['curb', 'neutral', 'encourage'].includes(p.growth)) fail('invalid policy.growth');
  if (!['none', 'limited', 'full'].includes(p.autonomy)) fail('invalid policy.autonomy');
  if (
    !Array.isArray(p.tradePriority) ||
    p.tradePriority.length !== TRADE_GOODS.length ||
    new Set(p.tradePriority).size !== TRADE_GOODS.length ||
    !p.tradePriority.every((g) => TRADE_GOODS.includes(g))
  ) {
    fail('invalid policy.tradePriority');
  }
  if (!Number.isInteger(p.reserveMonths) || p.reserveMonths < 1 || p.reserveMonths > 12) fail('policy.reserveMonths must be integer between 1 and 12');

  // Nested validation: settlements
  if (!Array.isArray(state.settlements)) fail('missing settlements');
  for (const s of state.settlements) {
    if (!s.inventory || typeof s.inventory !== 'object') fail(`settlement ${s.id} has no inventory`);
    for (const g of GOODS) if (!Number.isFinite(s.inventory[g]) || s.inventory[g] < 0) fail(`settlement ${s.name} has invalid ${g}`);
    if (!Number.isFinite(s.population) || s.population < 0) fail(`settlement ${s.name} has invalid population`);
    if (s.cellId < 0 || s.cellId >= topoCount) fail(`settlement ${s.name} is off-planet`);
  }
  const settlementIds = new Set(state.settlements.map((s) => s.id));

  // Nested validation: buildings
  if (!Array.isArray(state.buildings)) fail('missing buildings');
  for (const b of state.buildings) {
    if (typeof b.id !== 'number' || !(b.type in BUILDINGS)) fail(`invalid building ${b.id}`);
    if (b.cellId < 0 || b.cellId >= topoCount) fail(`building ${b.id} cellId off-planet`);
    if (!settlementIds.has(b.settlementId)) fail(`building ${b.id} belongs to nonexistent settlement ${b.settlementId}`);
    if (!Number.isFinite(b.condition) || b.condition < 0 || b.condition > 1) fail(`building ${b.id} condition out of range`);
    if (!['construction', 'active'].includes(b.status)) fail(`building ${b.id} invalid status`);
  }

  // Nested validation: roads
  if (!Array.isArray(state.roads)) fail('missing roads');
  for (const road of state.roads) {
    if (road.a < 0 || road.a >= topoCount || road.b < 0 || road.b >= topoCount) fail('road endpoint off-planet');
  }

  // Nested validation: routes
  if (!Array.isArray(state.routes)) fail('missing routes');
  for (const route of state.routes) {
    if (!settlementIds.has(route.a) || !settlementIds.has(route.b)) fail(`route ${route.id} has a nonexistent endpoint`);
  }

  // Nested validation: shipments
  if (!Array.isArray(state.shipments)) fail('missing shipments');
  for (const sh of state.shipments) {
    if (!Number.isFinite(sh.amount) || sh.amount < 0) fail('shipment has invalid amount');
    if (!GOODS.includes(sh.good)) fail(`shipment has unknown good ${sh.good}`);
  }

  // Nested validation: tech
  if (!state.tech || typeof state.tech !== 'object') fail('missing tech');
  for (const id of Object.keys(TECHS)) {
    const t = state.tech[id as keyof typeof state.tech];
    if (!t || typeof t !== 'object') fail(`missing tech entry ${id}`);
    if (!Number.isFinite(t.progress) || t.progress < 0) fail(`tech ${id} invalid progress`);
    if (typeof t.started !== 'boolean' || typeof t.done !== 'boolean') fail(`tech ${id} invalid started/done flags`);
  }

  // Arrays
  for (const k of ['crises', 'events', 'metrics', 'migrations'] as const) {
    if (!Array.isArray(state[k])) fail(`missing ${k}`);
  }
  if (!state.ledger || typeof state.ledger !== 'object') fail('missing ledger');

  // Nested validation: scenario
  if (state.scenario !== null && state.scenario !== undefined) {
    const sc = state.scenario;
    if (typeof sc.id !== 'string') fail('invalid scenario id');
    if (!['active', 'success', 'failure'].includes(sc.status)) fail('invalid scenario status');
    if (typeof sc.challenge !== 'boolean') fail('invalid scenario challenge');
    if (!Number.isInteger(sc.startTick) || sc.startTick < 0) fail('invalid scenario startTick');
    if (!Number.isInteger(sc.deadline) || sc.deadline < 0) fail('invalid scenario deadline');
  }
}

/** Deep copy via the save path, guaranteeing what is copied is exactly what persists. */
export function cloneState(state: WorldState): WorldState {
  return deserialize(serialize(state));
}
