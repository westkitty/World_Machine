import type { TickContext } from '../context';
import { waterRenewal } from '../formulas';
import { getTopology } from '../topology';
import type { WorldState } from '../types';

export const BIOMASS_GROWTH = 0.035; // logistic r per month
export const FISH_GROWTH = 0.05;
export const RECOVERY_BY_POLICY = { restrained: 2, normal: 1, intensive: 0.3 } as const;

/** Carrying capacity after degradation, moisture and cold are applied. */
export function effectiveBiomassCap(c: WorldState['cells'][number]): number {
  const wet = 0.45 + 0.55 * Math.min(1, c.moisture / 0.4);
  const cold = c.temperature < -5 ? 0.7 : 1;
  return c.biomassCap * (1 - 0.7 * c.degradation) * wet * cold;
}

export function biomassGrowthRate(state: WorldState, conserved: boolean): number {
  if (!conserved) return BIOMASS_GROWTH;
  return BIOMASS_GROWTH * (state.tech.reforestation.done ? 2.4 : 1.5);
}

/** Maximum sustainable yield of a logistic stock (r·K/4), reached at half capacity. */
export function sustainableHarvest(state: WorldState, cellId: number): number {
  const c = state.cells[cellId];
  return (biomassGrowthRate(state, c.conserved) * effectiveBiomassCap(c)) / 4;
}

/**
 * Regeneration and degradation. Harvest recorded by last tick's production is
 * compared with the sustainable yield; overuse degrades land. Conservation
 * accelerates recovery. Pollution diffuses to neighbours and decays.
 */
export function ecologySystem(state: WorldState, ctx: TickContext): void {
  const topo = getTopology();
  const cells = state.cells;
  const n = topo.count;
  const reforest = state.tech.reforestation.done;
  for (let i = 0; i < n; i++) {
    const c = cells[i];
    const areaRel = topo.areaFrac[i] * n;
    if (c.land) {
      const cap = effectiveBiomassCap(c);
      const r = biomassGrowthRate(state, c.conserved);
      const growth = r * c.biomass * (1 - c.biomass / Math.max(1, cap)) + (c.conserved ? 0.006 : 0.002) * cap;
      // Overharvest stress: a stock that is harvested while held below ~55% of
      // capacity (past maximum sustainable yield) degrades the land.
      const depleted = cap > 1 ? Math.max(0, 0.55 - c.biomass / cap) : 0;
      const intensity = cap > 1 ? Math.min(1, c.harvest / (0.005 * cap)) : 0;
      c.biomass = Math.max(0, c.biomass + growth);
      let dDeg = c.pollution * 0.012 + 0.03 * depleted * intensity;
      // Unprotected land heals slowly, and only under healthy vegetation cover;
      // restrained extraction (fallowing) doubles that, intensive use nearly stops it.
      const cover = c.biomass / Math.max(1, cap);
      const fallow = RECOVERY_BY_POLICY[state.policy.extraction];
      dDeg -= c.conserved ? (reforest ? 0.016 : 0.009) : (cover > 0.5 ? 0.0015 : 0.0005) * fallow * (1 - c.pollution);
      c.degradation = clamp01(c.degradation + dDeg);
      c.soil = clamp01(c.soil + (c.conserved ? 0.004 : 0.0015) * (1 - c.degradation * 0.5));
      const renew = waterRenewal(c, c.precip, areaRel) * ctx.waterBoost[i];
      const cap2 = c.waterCap * (1 - 0.3 * c.degradation);
      c.waterStock = Math.min(cap2, c.waterStock * (1 - Math.max(0, c.temperature) * 0.002) + renew);
    } else {
      const fishCap = c.fishCap * (1 - 0.6 * c.pollution);
      c.fish = Math.max(0, c.fish + FISH_GROWTH * c.fish * (1 - c.fish / Math.max(1, fishCap)) + 0.002 * fishCap);
    }
    c.harvest = 0;
  }
  // Pollution diffusion (double-buffered so order does not matter).
  const next = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const nb = topo.neighbors[i];
    let avg = 0;
    for (const j of nb) avg += cells[j].pollution;
    avg /= nb.length;
    next[i] = clamp01(cells[i].pollution * 0.9 + avg * 0.04);
  }
  for (let i = 0; i < n; i++) cells[i].pollution = next[i] < 1e-5 ? 0 : next[i];
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
