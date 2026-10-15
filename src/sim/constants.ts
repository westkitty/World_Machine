import type { BuildingType, Good, Inventory, TechId } from './types';

/**
 * Every tunable simulation constant lives here so the rules are documented in
 * one place (see docs/TECHNICAL.md → Resource accounting).
 */

/** Per-person monthly needs. Units are "person-months" of each good. */
export const NEEDS = {
  food: 1.0,
  water: 1.0,
  energy: 0.2,
  timber: 0.03, // fuel and household upkeep
  ore: 0.012, // tools and implements; shortfall lowers labour productivity
};

/** Base storage capacity per good before storage buildings. */
export const BASE_STORAGE = 12000;
export const STORAGE_PER_BUILDING = 30000;
export const FOOD_SPOILAGE = 0.02; // fraction of food stock lost per month
export const FOOD_SPOILAGE_COLD = 0.006;
export const WATER_EVAPORATION = 0.01;

export const LABOR_PARTICIPATION = 0.5;

/** Labour productivity (units per worker per month) for each source. */
export const PRODUCTIVITY = {
  farm: 9,
  forage: 2.5,
  fishing: 7,
  water: 14,
  timber: 6,
  mine: 7,
  energy: 15,
};

export const FARM_CAPACITY = 3200; // food / month at perfect conditions
export const FARM_WATER_PER_FOOD = 0.12;
export const MINE_CAPACITY = 1400; // ore / month
export const MINE_ENERGY_PER_ORE = 0.08;
export const ENERGY_CAPACITY = 3500; // energy / month
export const ENERGY_FUEL_PER_UNIT = 0.15; // timber burned per energy unit
export const PORT_FISH_SHARE = 0.06; // share of adjacent fish stock catchable per month

export interface BuildingDef {
  type: BuildingType;
  label: string;
  cost: Partial<Inventory>;
  months: number;
  maintenance: Partial<Inventory>;
  maxPerCell: number;
  description: string;
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  farm: {
    type: 'farm', label: 'Farm', cost: { timber: 400, ore: 60 }, months: 3,
    maintenance: { timber: 10 }, maxPerCell: 2,
    description: 'Grows food from fertile, moist soil. Uses labour and irrigation water; slowly exhausts soil.',
  },
  mine: {
    type: 'mine', label: 'Mine', cost: { timber: 700 }, months: 4,
    maintenance: { timber: 15 }, maxPerCell: 1,
    description: 'Extracts the finite ore deposit. Needs energy; pollutes and degrades the land.',
  },
  storage: {
    type: 'storage', label: 'Storehouse', cost: { timber: 600, ore: 150 }, months: 3,
    maintenance: { timber: 8 }, maxPerCell: 2,
    description: `Adds ${STORAGE_PER_BUILDING.toLocaleString()} capacity for every stored good.`,
  },
  energy: {
    type: 'energy', label: 'Power works', cost: { timber: 400, ore: 400 }, months: 5,
    maintenance: { ore: 15 }, maxPerCell: 2,
    description: 'Burns timber for energy (or none with Clean Energy). Pollutes unless clean.',
  },
  port: {
    type: 'port', label: 'Port', cost: { timber: 900, ore: 200 }, months: 6,
    maintenance: { timber: 20 }, maxPerCell: 1,
    description: 'Enables sea trade routes and fishing in adjacent ocean. Coastal cells only.',
  },
};

export const ROAD_COST_PER_1000KM = { timber: 160, ore: 50 };
export const ROAD_MONTHS = 2;
export const ROAD_MAINTENANCE = { timber: 3 };

export const SETTLEMENT_FOUNDING = {
  population: 400,
  food: 1600,
  water: 800,
  timber: 700,
  ore: 200,
};

export interface TechDef {
  id: TechId;
  label: string;
  cost: Partial<Inventory>;
  months: number;
  effect: string;
}

export const TECHS: Record<TechId, TechDef> = {
  irrigation: { id: 'irrigation', label: 'Irrigation', cost: { timber: 800, ore: 400 }, months: 6, effect: 'Farms lose only half as much yield to dry soil; +10% farm yield.' },
  crop_rotation: { id: 'crop_rotation', label: 'Crop Rotation', cost: { food: 1500, timber: 300 }, months: 8, effect: 'Soil exhaustion from farming reduced by 60%.' },
  masonry_roads: { id: 'masonry_roads', label: 'Masonry Roads', cost: { ore: 900, timber: 400 }, months: 8, effect: 'Road cost −40%; road capacity +50%.' },
  deep_mining: { id: 'deep_mining', label: 'Deep Mining', cost: { timber: 1200, ore: 600 }, months: 10, effect: 'Mine output +40% but mining degradation +25%.' },
  clean_energy: { id: 'clean_energy', label: 'Clean Energy', cost: { ore: 2000, timber: 800 }, months: 12, effect: 'Power works burn no timber and emit no pollution.' },
  seafaring: { id: 'seafaring', label: 'Seafaring', cost: { timber: 1500, food: 600 }, months: 8, effect: 'Sea routes +50% speed and capacity; fishing +30%.' },
  cold_storage: { id: 'cold_storage', label: 'Cold Storage', cost: { ore: 800, timber: 600 }, months: 6, effect: 'Food spoilage 2% → 0.6%/month; storage +25%.' },
  reforestation: { id: 'reforestation', label: 'Reforestation', cost: { food: 800, timber: 400 }, months: 6, effect: 'Conserved regions regrow 60% faster and heal degradation faster.' },
  water_reclamation: { id: 'water_reclamation', label: 'Water Reclamation', cost: { ore: 700, timber: 500 }, months: 8, effect: 'Water needs −25%; farm irrigation water −50%.' },
};

export const TRANSPORT = {
  land: { capacity: 700, roadCapacityBonus: 2.0, speedKm: 900, roadSpeedKm: 2400, lossPer1000: 0.03, roadLossPer1000: 0.008 },
  sea: { capacity: 2400, speedKm: 3200, lossPer1000: 0.008 },
  routeUpkeepFood: 15, // provisions per active route per month, paid by endpoint a
};

export const HISTORY_LIMIT = 400;
export const METRIC_LIMIT = 600;
export const MIGRATION_LIMIT = 60;
export const POP_HISTORY_LIMIT = 120;
export const ROUTE_HISTORY_LIMIT = 24;

export const GOOD_LABEL: Record<Good, string> = {
  food: 'Food', water: 'Water', timber: 'Timber', ore: 'Ore', energy: 'Energy',
};
