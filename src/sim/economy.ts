import { BASE_STORAGE, STORAGE_PER_BUILDING } from './constants';
import { GOODS, emptyInventory, type Good, type Inventory, type LedgerTotals, type Settlement, type WorldState } from './types';

/**
 * All inventory mutations go through credit/debit so every unit has a recorded
 * source or sink. The tick ledger lets tests prove conservation:
 *   Σinventory(after) + Σin-transit(after) =
 *   Σinventory(before) + Σin-transit(before) + produced + seeded − Σsinks
 */
export type SourceKind = 'produced' | 'seeded';
export type SinkKind = Exclude<keyof LedgerTotals, 'produced' | 'seeded'>;

export function emptyLedger(): LedgerTotals {
  return {
    produced: emptyInventory(), consumed: emptyInventory(), spoiled: emptyInventory(),
    transportLoss: emptyInventory(), construction: emptyInventory(), maintenance: emptyInventory(),
    overflow: emptyInventory(), abandoned: emptyInventory(), dissipated: emptyInventory(),
    intervention: emptyInventory(), seeded: emptyInventory(),
  };
}

export function storageCap(state: WorldState, s: Settlement, good: Good): number {
  if (good === 'energy') return Infinity; // flow within a tick; dissipated at tick end
  let storages = 0;
  for (const b of state.buildings) {
    if (b.settlementId === s.id && b.type === 'storage' && b.status === 'active') storages += b.condition;
  }
  const cold = state.tech.cold_storage.done ? 1.25 : 1;
  return (BASE_STORAGE + storages * STORAGE_PER_BUILDING) * cold;
}

/** Add goods from a source; anything above storage capacity is recorded as overflow loss. */
export function credit(state: WorldState, s: Settlement, good: Good, amount: number, kind: SourceKind | 'transfer'): number {
  if (!(amount > 0)) return 0;
  if (kind !== 'transfer') state.ledger[kind][good] += amount;
  const cap = storageCap(state, s, good);
  const room = Math.max(0, cap - s.inventory[good]);
  const added = Math.min(room, amount);
  s.inventory[good] += added;
  if (amount > added) state.ledger.overflow[good] += amount - added;
  return added;
}

/** Remove up to `amount`; returns what was actually taken. Never makes inventory negative. */
export function debit(state: WorldState, s: Settlement, good: Good, amount: number, kind: SinkKind | 'transfer'): number {
  if (!(amount > 0)) return 0;
  const taken = Math.min(Math.max(0, s.inventory[good]), amount);
  s.inventory[good] -= taken;
  if (s.inventory[good] < 1e-9) s.inventory[good] = 0;
  if (kind !== 'transfer') state.ledger[kind][good] += taken;
  return taken;
}

export function scaledCost(state: WorldState, cost: Partial<Inventory>, extraMult = 1): Partial<Inventory> {
  const m = state.rules.constructionCostMult * extraMult;
  const out: Partial<Inventory> = {};
  for (const g of GOODS) if (cost[g]) out[g] = Math.round((cost[g] as number) * m);
  return out;
}

export function missingFor(s: Settlement, cost: Partial<Inventory>): Partial<Inventory> {
  const miss: Partial<Inventory> = {};
  for (const g of GOODS) {
    const need = cost[g] ?? 0;
    if (need > s.inventory[g] + 1e-9) miss[g] = need - s.inventory[g];
  }
  return miss;
}

export function canAfford(s: Settlement, cost: Partial<Inventory>): boolean {
  return Object.keys(missingFor(s, cost)).length === 0;
}

export function pay(state: WorldState, s: Settlement, cost: Partial<Inventory>, kind: SinkKind): void {
  for (const g of GOODS) if (cost[g]) debit(state, s, g, cost[g] as number, kind);
}

export function formatCost(cost: Partial<Inventory>): string {
  const parts = GOODS.filter((g) => cost[g]).map((g) => `${Math.round(cost[g] as number).toLocaleString()} ${g}`);
  return parts.length ? parts.join(', ') : 'free';
}

export function totalInventory(state: WorldState): Inventory {
  const t = emptyInventory();
  for (const s of state.settlements) if (s.alive) for (const g of GOODS) t[g] += s.inventory[g];
  return t;
}

export function inTransit(state: WorldState): Inventory {
  const t = emptyInventory();
  for (const sh of state.shipments) t[sh.good] += sh.amount;
  return t;
}
