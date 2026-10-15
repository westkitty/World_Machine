import { CRISIS_INFO } from '../sim/systems/crises';
import { getTopology } from '../sim/topology';
import type { Biome, CellState, WorldState } from '../sim/types';

/**
 * Map overlays. Each derives a colour for every simulation cell from live
 * state, provides a legend with consistent scaling, and reports the selected
 * region's value as text so colour is never the only channel.
 */
export type RGB = [number, number, number];

export const BIOME_COLORS: Record<Biome, RGB> = {
  deep_ocean: hex('#081a33'), ocean: hex('#0e2c52'), shelf: hex('#1b5376'),
  ice: hex('#e9eff3'), tundra: hex('#8d9a87'), taiga: hex('#30594a'), temperate_forest: hex('#41703c'),
  grassland: hex('#8ea458'), shrubland: hex('#a09a63'), desert: hex('#d6b47c'), savanna: hex('#b9a45b'),
  rainforest: hex('#1e5b2f'), wetland: hex('#3d6a55'), alpine: hex('#8b8681'),
};

export const BIOME_LABEL: Record<Biome, string> = {
  deep_ocean: 'Deep ocean', ocean: 'Ocean', shelf: 'Continental shelf', ice: 'Ice sheet', tundra: 'Tundra', taiga: 'Taiga',
  temperate_forest: 'Temperate forest', grassland: 'Grassland', shrubland: 'Shrubland', desert: 'Desert', savanna: 'Savanna',
  rainforest: 'Rainforest', wetland: 'Wetland', alpine: 'Alpine',
};

export function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function lerpRGB(a: RGB, b: RGB, t: number): RGB {
  const k = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

export function ramp(stops: RGB[], t: number): RGB {
  const k = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(k));
  return lerpRGB(stops[i], stops[i + 1], k - i);
}

export type Legend =
  | { kind: 'gradient'; stops: RGB[]; min: string; max: string; unit: string; mid?: string }
  | { kind: 'swatches'; items: { color: RGB; label: string }[] };

export interface OverlayDef {
  id: string;
  label: string;
  key: string; // keyboard shortcut
  /** Recomputed every tick (true) or only when the world changes. */
  dynamic: boolean;
  color(cell: CellState, i: number, ctx: OverlayContext): RGB | null; // null = terrain shows through
  legend(ctx: OverlayContext): Legend;
  value(cell: CellState, i: number, ctx: OverlayContext): string;
}

export interface OverlayContext {
  state: WorldState;
  maxPop: number;
  popOf: Map<number, number>;
  traffic: Float64Array;
  maxTraffic: number;
  migration: Map<number, number>;
  maxMigration: number;
  infra: Float64Array;
}

const OCEAN_DIM: RGB = hex('#0b1b30');
const SEQ_AMBER = [hex('#1b1626'), hex('#5a2e3a'), hex('#b5562f'), hex('#f0a63e'), hex('#fff1b8')];
const SEQ_GREEN = [hex('#2a2018'), hex('#5b5530'), hex('#6f8f3a'), hex('#9bd16a'), hex('#e3ffb0')];
const SEQ_TEAL = [hex('#0f1a26'), hex('#174a5c'), hex('#2a8f8c'), hex('#7fd8c0'), hex('#e8fff4')];
const DIVERGE_TEMP = [hex('#2b4c9b'), hex('#6fa3d8'), hex('#eef2f0'), hex('#f2a65e'), hex('#c4372b')];
const PRECIP = [hex('#c9a46a'), hex('#a8b45e'), hex('#4f9a6a'), hex('#2f7f9a'), hex('#24438f')];
const DEGRADE = [hex('#3f8f4e'), hex('#b9c454'), hex('#e3a03c'), hex('#c2462e'), hex('#5a1f1a')];
const ELEV_LAND = [hex('#3f7a46'), hex('#9aa65a'), hex('#b08a5a'), hex('#8a7a70'), hex('#f4f4f4')];
const ELEV_SEA = [hex('#061226'), hex('#123a6a'), hex('#3c7fb0')];
const MIGRATE = [hex('#c2462e'), hex('#e8a07a'), hex('#e9e6df'), hex('#7fb3e0'), hex('#2f63b5')];

const pct = (v: number) => `${Math.round(v * 100)}%`;
const fmt = (v: number) => Math.round(v).toLocaleString();

export function buildOverlayContext(state: WorldState): OverlayContext {
  const topo = getTopology();
  const popOf = new Map<number, number>();
  let maxPop = 1;
  for (const s of state.settlements) if (s.alive) { popOf.set(s.id, s.population); maxPop = Math.max(maxPop, s.population); }
  const traffic = new Float64Array(topo.count);
  for (const r of state.routes) {
    if (!r.active) continue;
    const flow = r.deliveredHistory.slice(-6).reduce((a, b) => a + b, 0) / 6 + r.capacity * 0.02;
    for (const c of r.path) traffic[c] += flow;
  }
  let maxTraffic = 1;
  for (const t of traffic) maxTraffic = Math.max(maxTraffic, t);
  const migration = new Map<number, number>();
  for (const m of state.migrations) {
    if (state.tick - m.tick > 36) continue;
    migration.set(m.to, (migration.get(m.to) ?? 0) + m.amount);
    migration.set(m.from, (migration.get(m.from) ?? 0) - m.amount);
  }
  let maxMigration = 1;
  for (const v of migration.values()) maxMigration = Math.max(maxMigration, Math.abs(v));
  const infra = new Float64Array(topo.count);
  for (const b of state.buildings) infra[b.cellId] += b.status === 'active' ? 1 : 0.5;
  for (const r of state.roads) { infra[r.a] += 0.25; infra[r.b] += 0.25; }
  return { state, maxPop, popOf, traffic, maxTraffic, migration, maxMigration, infra };
}

function ocean(cell: CellState): RGB | null {
  return cell.land ? null : OCEAN_DIM;
}

export const OVERLAYS: OverlayDef[] = [
  {
    id: 'terrain', label: 'Terrain', key: '0', dynamic: false,
    color: () => null,
    legend: () => ({ kind: 'gradient', stops: [...ELEV_SEA, ...ELEV_LAND], min: '−6 km', max: '+6 km', unit: 'elevation (natural colour shown)' }),
    value: (c) => `${Math.round(c.elevation).toLocaleString()} m`,
  },
  {
    id: 'elevation', label: 'Elevation', key: 'E', dynamic: false,
    color: (c) => (c.land ? ramp(ELEV_LAND, c.elevation / 5500) : ramp(ELEV_SEA, 1 + c.elevation / 6000)),
    legend: () => ({ kind: 'gradient', stops: [...ELEV_SEA, ...ELEV_LAND], min: '−6,000 m', mid: 'sea level', max: '+5,500 m', unit: 'metres' }),
    value: (c) => `${Math.round(c.elevation).toLocaleString()} m`,
  },
  {
    id: 'temperature', label: 'Temperature', key: 'M', dynamic: true,
    color: (c) => ramp(DIVERGE_TEMP, (c.temperature + 30) / 70),
    legend: () => ({ kind: 'gradient', stops: DIVERGE_TEMP, min: '−30 °C', mid: '5 °C', max: '40 °C', unit: 'this month' }),
    value: (c) => `${c.temperature.toFixed(1)} °C (annual mean ${c.baseTemp.toFixed(1)} °C)`,
  },
  {
    id: 'precipitation', label: 'Precipitation', key: 'P', dynamic: true,
    color: (c) => ramp(PRECIP, (c.precip * 12) / 3000),
    legend: () => ({ kind: 'gradient', stops: PRECIP, min: '0', max: '3,000 mm/yr', unit: 'current month, annualised' }),
    value: (c) => `${Math.round(c.precip)} mm this month (normal ${Math.round(c.basePrecip)} mm/yr)${c.drought > 0.2 ? `, drought ${pct(c.drought)}` : ''}`,
  },
  {
    id: 'fertility', label: 'Fertility', key: 'F', dynamic: true,
    color: (c) => (c.land ? ramp(SEQ_GREEN, c.fertilityBase * c.soil * (1 - 0.5 * c.degradation)) : OCEAN_DIM),
    legend: () => ({ kind: 'gradient', stops: SEQ_GREEN, min: '0%', max: '100%', unit: 'effective soil fertility' }),
    value: (c) => (c.land ? `${pct(c.fertilityBase * c.soil * (1 - 0.5 * c.degradation))} (base ${pct(c.fertilityBase)}, soil health ${pct(c.soil)})` : 'Ocean'),
  },
  {
    id: 'water', label: 'Water', key: 'W', dynamic: true,
    color: (c) => (c.land ? ramp(SEQ_TEAL, c.waterStock / Math.max(1, c.waterCap)) : OCEAN_DIM),
    legend: () => ({ kind: 'gradient', stops: SEQ_TEAL, min: 'dry', max: 'full', unit: 'renewable water stock vs. capacity' }),
    value: (c) => (c.land ? `${fmt(c.waterStock)} / ${fmt(c.waterCap)} units${c.river ? ', river' : ''}` : 'Ocean'),
  },
  {
    id: 'biomes', label: 'Biomes', key: 'B', dynamic: false,
    color: (c) => BIOME_COLORS[c.biome],
    legend: () => ({ kind: 'swatches', items: (Object.keys(BIOME_COLORS) as Biome[]).map((b) => ({ color: BIOME_COLORS[b], label: BIOME_LABEL[b] })) }),
    value: (c) => BIOME_LABEL[c.biome],
  },
  {
    id: 'resources', label: 'Resources', key: 'R', dynamic: true,
    color: (c) => (c.land ? (c.ore > 0 ? ramp([hex('#2a2320'), hex('#7a4a2a'), hex('#d9843a'), hex('#ffd59a')], c.ore / 120000) : hex('#2a2a2e'))
      : ramp([hex('#07101e'), hex('#14466a'), hex('#4fb3d9')], c.fish / 35000)),
    legend: () => ({ kind: 'swatches', items: [
      { color: hex('#2a2a2e'), label: 'No ore' }, { color: hex('#7a4a2a'), label: 'Ore deposit' }, { color: hex('#ffd59a'), label: 'Rich ore (120k+)' },
      { color: hex('#14466a'), label: 'Fish stock' }, { color: hex('#4fb3d9'), label: 'Rich fishery' },
    ] }),
    value: (c) => (c.land ? `Ore ${fmt(c.ore)}${c.oreInitial ? ` of ${fmt(c.oreInitial)}` : ''} · biomass ${fmt(c.biomass)} / ${fmt(c.biomassCap)}` : `Fish ${fmt(c.fish)} / ${fmt(c.fishCap)}`),
  },
  {
    id: 'population', label: 'Population', key: 'O', dynamic: true,
    color: (c, _i, ctx) => (c.owner >= 0 ? ramp(SEQ_AMBER, Math.sqrt((ctx.popOf.get(c.owner) ?? 0) / ctx.maxPop)) : ocean(c) ?? hex('#1d1d24')),
    legend: (ctx) => ({ kind: 'gradient', stops: SEQ_AMBER, min: '0', max: fmt(ctx.maxPop), unit: 'settlement population (territory)' }),
    value: (c, _i, ctx) => (c.owner >= 0 ? `Territory of a settlement of ${fmt(ctx.popOf.get(c.owner) ?? 0)}` : 'Unclaimed'),
  },
  {
    id: 'infrastructure', label: 'Infrastructure', key: 'I', dynamic: true,
    color: (c, i, ctx) => (ctx.infra[i] > 0 ? ramp(SEQ_TEAL, 0.25 + ctx.infra[i] / 5) : c.land ? hex('#1d1d24') : OCEAN_DIM),
    legend: () => ({ kind: 'gradient', stops: SEQ_TEAL, min: 'none', max: '4+ structures', unit: 'structures and road links' }),
    value: (_c, i, ctx) => `${ctx.state.buildings.filter((b) => b.cellId === i).length} structure(s), ${ctx.state.roads.filter((r) => r.a === i || r.b === i).length} road link(s)`,
  },
  {
    id: 'trade', label: 'Trade', key: 'T', dynamic: true,
    color: (c, i, ctx) => (ctx.traffic[i] > 0 ? ramp(SEQ_TEAL, 0.2 + 0.8 * Math.sqrt(ctx.traffic[i] / ctx.maxTraffic)) : c.land ? hex('#1d1d24') : OCEAN_DIM),
    legend: (ctx) => ({ kind: 'gradient', stops: SEQ_TEAL, min: '0', max: `${fmt(ctx.maxTraffic)}/mo`, unit: 'average goods moving through region' }),
    value: (_c, i, ctx) => `${fmt(ctx.traffic[i])} units/month of route traffic`,
  },
  {
    id: 'degradation', label: 'Degradation', key: 'D', dynamic: true,
    color: (c) => (c.land ? ramp(DEGRADE, c.degradation) : ramp([OCEAN_DIM, hex('#5a3a2a')], c.pollution)),
    legend: () => ({ kind: 'gradient', stops: DEGRADE, min: 'healthy', max: 'collapsed', unit: 'land degradation (sea: pollution)' }),
    value: (c) => `Degradation ${pct(c.degradation)} · pollution ${pct(c.pollution)}${c.land ? ` · soil health ${pct(c.soil)}` : ''}`,
  },
  {
    id: 'conservation', label: 'Conservation', key: 'C', dynamic: true,
    color: (c) => (c.conserved ? hex('#3fd18a') : c.owner >= 0 ? hex('#b08a4a') : c.land ? hex('#3a3a40') : OCEAN_DIM),
    legend: () => ({ kind: 'swatches', items: [{ color: hex('#3fd18a'), label: 'Reserve' }, { color: hex('#b08a4a'), label: 'Settled territory' }, { color: hex('#3a3a40'), label: 'Wild land' }] }),
    value: (c) => (c.conserved ? 'Conservation reserve (no extraction)' : c.owner >= 0 ? 'Settled territory' : c.land ? 'Wild, unprotected' : 'Ocean'),
  },
  {
    id: 'migration', label: 'Migration', key: 'G', dynamic: true,
    color: (c, _i, ctx) => {
      if (c.owner < 0) return c.land ? hex('#1d1d24') : OCEAN_DIM;
      const v = ctx.migration.get(c.owner) ?? 0;
      return ramp(MIGRATE, 0.5 + 0.5 * (v / ctx.maxMigration));
    },
    legend: (ctx) => ({ kind: 'gradient', stops: MIGRATE, min: `−${fmt(ctx.maxMigration)}`, mid: '0', max: `+${fmt(ctx.maxMigration)}`, unit: 'net migrants, last 3 years' }),
    value: (c, _i, ctx) => (c.owner >= 0 ? `Net migration ${fmt(ctx.migration.get(c.owner) ?? 0)} (3 years)` : 'Unsettled'),
  },
];

export function getOverlay(id: string): OverlayDef {
  return OVERLAYS.find((o) => o.id === id) ?? OVERLAYS[0];
}

export function crisisLabel(type: keyof typeof CRISIS_INFO): string {
  return CRISIS_INFO[type].label;
}
