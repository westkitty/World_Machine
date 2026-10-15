import { roadIndex } from './pathfinding';
import { getTopology, greatCircleKm } from './topology';
import type { WorldState } from './types';

/**
 * Derived, non-persisted lookups rebuilt at the start of every tick. Nothing in
 * here is authoritative; it can always be recomputed from WorldState.
 */
export interface TickContext {
  territory: Map<number, number[]>;
  roads: Set<string>;
  /** Per-cell precipitation multiplier from active droughts. */
  precipMult: Float64Array;
  /** Per-cell water renewal multiplier (emergency wells). */
  waterBoost: Float64Array;
  /** Per-settlement farm output multiplier (blight). */
  farmMult: Map<number, number>;
  /** Extra monthly death rate from epidemics. */
  epidemicDeath: Map<number, number>;
  quarantined: Set<number>;
  rationedWater: Set<number>;
  routesDirty: boolean;
  sats: Map<number, { food: number; water: number; energy: number; timber: number; ore: number }>;
}

export function buildContext(state: WorldState): TickContext {
  const topo = getTopology();
  const territory = new Map<number, number[]>();
  for (const s of state.settlements) if (s.alive) territory.set(s.id, []);
  state.cells.forEach((c, i) => {
    if (c.owner >= 0) territory.get(c.owner)?.push(i);
  });
  const ctx: TickContext = {
    territory,
    roads: roadIndex(state.roads),
    precipMult: new Float64Array(topo.count).fill(1),
    waterBoost: new Float64Array(topo.count).fill(1),
    farmMult: new Map(),
    epidemicDeath: new Map(),
    quarantined: new Set(),
    rationedWater: new Set(),
    routesDirty: false,
    sats: new Map(),
  };
  for (const cr of state.crises) {
    if (cr.resolved) continue;
    if (cr.type === 'drought') {
      for (let i = 0; i < topo.count; i++) {
        const d = greatCircleKm(topo, cr.cellId, i);
        if (d <= cr.radiusKm) {
          const falloff = cr.radiusKm >= 20000 ? 1 : 1 - 0.4 * (d / cr.radiusKm);
          ctx.precipMult[i] *= 1 - cr.severity * 0.85 * falloff;
          if (cr.responded === 'wells') ctx.waterBoost[i] = Math.max(ctx.waterBoost[i], 1.7);
        }
      }
      if (cr.responded === 'ration') {
        for (const s of state.settlements) {
          if (s.alive && greatCircleKm(topo, cr.cellId, s.cellId) <= cr.radiusKm) ctx.rationedWater.add(s.id);
        }
      }
    } else if (cr.type === 'blight') {
      const mult = cr.responded === 'burn' ? (state.tick - cr.startTick < 2 ? 0 : 1) : cr.responded === 'fungicide' ? 1 - cr.severity * 0.25 : 1 - cr.severity * 0.6;
      ctx.farmMult.set(cr.settlementId, Math.min(ctx.farmMult.get(cr.settlementId) ?? 1, mult));
    } else if (cr.type === 'epidemic') {
      const rate = 0.012 * cr.severity * (cr.responded === 'medicine' ? 0.35 : cr.responded === 'quarantine' ? 0.5 : 1);
      ctx.epidemicDeath.set(cr.settlementId, (ctx.epidemicDeath.get(cr.settlementId) ?? 0) + rate);
      if (cr.responded === 'quarantine') ctx.quarantined.add(cr.settlementId);
    }
  }
  return ctx;
}
