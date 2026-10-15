import type { CellState } from './types';

/**
 * Shared environmental formulas. Kept pure so world generation, systems and
 * the inspector UI all derive values from the same rules.
 */

/** Monthly renewable water (units) from precipitation and upstream drainage. */
export function waterRenewal(cell: CellState, precipMonthMm: number, areaRel: number): number {
  const rain = (precipMonthMm / 80) * areaRel * 2600;
  const river = Math.min(cell.flow, 25) * 260 * (precipMonthMm / Math.max(1, cell.basePrecip / 12)) ** 0.5;
  const evapLoss = Math.max(0, cell.temperature - 20) * 0.015;
  return Math.max(0, (rain + river) * (1 - Math.min(0.5, evapLoss)));
}

/** Potential evapotranspiration proxy, mm/month. */
export function evapDemand(tempC: number): number {
  return Math.max(15, 25 + Math.max(0, tempC) * 4.2);
}

/** Crop/foraging response to soil moisture, 0..1. */
export function moistureYield(moisture: number, irrigation: boolean): number {
  const m = Math.max(0, Math.min(1, moisture));
  const base = Math.min(1, m / 0.55);
  return irrigation ? 0.5 + 0.5 * base : base;
}

/** Temperature response for crops, 0..1 (optimal ~ 18 °C, frost kills growth). */
export function temperatureYield(tempC: number): number {
  if (tempC < 2) return 0.05;
  return Math.max(0.05, Math.exp(-(((tempC - 19) / 12) ** 2)));
}

export function biomassCapacityFor(biome: CellState['biome'], areaRel: number): number {
  const base: Record<CellState['biome'], number> = {
    deep_ocean: 0, ocean: 0, shelf: 0, ice: 0,
    rainforest: 60000, temperate_forest: 46000, taiga: 34000, wetland: 30000,
    savanna: 20000, grassland: 15000, shrubland: 9000, tundra: 4500, alpine: 3500, desert: 1500,
  };
  return base[biome] * areaRel;
}

/** How attractive a land cell is for a settlement, 0..1. Explained in the region inspector. */
export function settlementSuitability(cell: CellState): number {
  if (!cell.land || cell.biome === 'ice') return 0;
  const temp = Math.exp(-(((cell.baseTemp - 16) / 14) ** 2));
  const water = Math.min(1, cell.basePrecip / 1000) * 0.6 + (cell.river ? 0.4 : 0);
  const fert = cell.fertilityBase * cell.soil;
  const coast = cell.coastal ? 0.12 : 0;
  const altitude = cell.elevation > 2500 ? 0.4 : 1;
  const damage = 1 - 0.6 * cell.degradation;
  return Math.max(0, Math.min(1, (0.35 * fert + 0.3 * water + 0.25 * temp + coast) * altitude * damage));
}
