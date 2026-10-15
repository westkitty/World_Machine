import type { RngState } from './rng';

export const GOODS = ['food', 'water', 'timber', 'ore', 'energy'] as const;
export type Good = (typeof GOODS)[number];
/** Energy is a local grid flow: produced and consumed within a tick, never stored or traded. */
export const TRADE_GOODS: Good[] = ['food', 'water', 'timber', 'ore'];
export type Inventory = Record<Good, number>;

export const emptyInventory = (): Inventory => ({ food: 0, water: 0, timber: 0, ore: 0, energy: 0 });

export type Biome =
  | 'deep_ocean' | 'ocean' | 'shelf' | 'ice' | 'tundra' | 'taiga' | 'temperate_forest'
  | 'grassland' | 'shrubland' | 'desert' | 'savanna' | 'rainforest' | 'wetland' | 'alpine';

export type GameMode = 'sandbox' | 'scenario' | 'observer' | 'challenge';

export interface GenParams {
  /** Target ocean fraction of surface area, 0.3–0.85. */
  oceanCoverage: number;
  /** Mountain height and frequency multiplier, 0.2–1.6. */
  ruggedness: number;
  /** Global temperature offset, °C, −10…+10. */
  temperatureOffset: number;
  /** Precipitation multiplier, 0.4–1.6. */
  moisture: number;
}

export interface Rules {
  consumptionMult: number;
  constructionCostMult: number;
  crisisFrequency: number;
  /** Sandbox-only labelled override: actions skip resource costs. */
  unrestricted: boolean;
  maxSettlements: number;
}

export interface CellState {
  elevation: number; // metres; < 0 means below sea level
  land: boolean;
  coastal: boolean; // land cell adjacent to ocean
  baseTemp: number; // annual mean °C
  temperature: number; // current month °C
  basePrecip: number; // mm / year
  precip: number; // current month mm
  moisture: number; // 0..1 soil moisture
  drought: number; // 0..1 drought severity
  fertilityBase: number; // 0..1 geological/climatic fertility
  soil: number; // 0..1 soil health (exhaustion multiplier)
  flow: number; // drainage accumulation (normalised upstream runoff)
  downhill: number; // drainage target cell or -1
  river: boolean;
  waterStock: number; // renewable water units
  waterCap: number;
  biome: Biome;
  biomass: number; // renewable vegetation stock (units)
  biomassCap: number; // climate carrying capacity
  fish: number;
  fishCap: number;
  ore: number; // finite deposit remaining
  oreInitial: number;
  degradation: number; // 0..1
  pollution: number; // 0..1
  conserved: boolean;
  owner: number; // settlement id or -1
  /** Harvest drawn from biomass this tick (for degradation accounting). */
  harvest: number;
}

export type BuildingType = 'farm' | 'mine' | 'storage' | 'energy' | 'port';

export interface Building {
  id: number;
  type: BuildingType;
  cellId: number;
  settlementId: number;
  condition: number; // 0..1, output multiplier
  status: 'construction' | 'active';
  progress: number; // months of construction completed
  builtTick: number;
  /** Months maintenance went unpaid in a row. */
  neglect: number;
}

export interface Road {
  a: number; // cell id (a < b)
  b: number;
  settlementId: number;
  condition: number;
  status: 'construction' | 'active';
  progress: number;
}

export type LaborFocus = 'balanced' | 'food' | 'water' | 'timber' | 'ore' | 'energy';

export interface SocialValues {
  growth: number; // 0..1 preference for expansion/extraction
  conservation: number; // 0..1
  trade: number; // 0..1 openness
}

export interface Settlement {
  id: number;
  name: string;
  cellId: number;
  founded: number;
  population: number;
  housing: number;
  inventory: Inventory;
  wellbeing: number; // 0..1
  health: number; // 0..1
  laborFocus: LaborFocus;
  values: SocialValues;
  specialization: string;
  /** Exponential moving average of output by source kind (12-month memory). */
  outputAvg: Record<string, number>;
  migrationPressure: number;
  /** Cumulative goods received through trade. */
  importedTotal: number;
  alive: boolean;
  /** Last tick's flows, for inspectors (not used by the simulation itself). */
  last: SettlementFlows;
  popHistory: number[]; // bounded, one sample per month
}

export interface SettlementFlows {
  produced: Inventory;
  consumed: Inventory;
  needed: Inventory;
  imported: Inventory;
  exported: Inventory;
  births: number;
  deaths: number;
  migrantsIn: number;
  migrantsOut: number;
  labor: number;
  laborUsed: Record<Good, number>;
  /** Output by source kind (farm, fishing, forage, water, timber, mine, energy). */
  bySource: Record<string, number>;
  /** Good that received spare labour for export this month. */
  specialty: Good | null;
  shortage: Good[];
}

export type TransportMode = 'land' | 'sea';

export interface TradeRoute {
  id: number;
  a: number; // settlement ids
  b: number;
  mode: TransportMode;
  path: number[]; // cell ids
  distanceKm: number;
  roadFraction: number;
  capacity: number; // units / month / direction
  travelMonths: number;
  lossRate: number; // fraction lost in transit
  active: boolean;
  blockedReason: string;
  goods: Good[];
  autonomous: boolean;
  createdTick: number;
  movedLastTick: number;
  deliveredTotal: number;
  deliveredHistory: number[]; // bounded per-month deliveries
}

export interface Shipment {
  routeId: number;
  from: number;
  to: number;
  good: Good;
  amount: number;
  departTick: number;
  arriveTick: number;
}

export interface Relation {
  cooperation: number; // −1..1
  tradeVolume: number; // smoothed units/month
  competition: number; // 0..1 smoothed
  reasons: string[];
}

export interface Policy {
  extraction: 'restrained' | 'normal' | 'intensive';
  rationing: boolean;
  growth: 'restrain' | 'neutral' | 'encourage';
  autonomy: 'none' | 'limited' | 'full';
  tradePriority: Good[];
  /** Months of consumption each settlement tries to hold before exporting. */
  reserveMonths: number;
}

export type TechId =
  | 'irrigation' | 'crop_rotation' | 'masonry_roads' | 'deep_mining'
  | 'clean_energy' | 'seafaring' | 'cold_storage' | 'reforestation' | 'water_reclamation';

export interface TechState {
  progress: number; // months researched
  started: boolean;
  done: boolean;
}

export type CrisisType = 'drought' | 'blight' | 'epidemic' | 'wildfire' | 'mine_collapse' | 'famine';

export interface Crisis {
  id: number;
  type: CrisisType;
  cellId: number;
  settlementId: number; // −1 for regional
  radiusKm: number;
  severity: number; // 0..1
  startTick: number;
  endTick: number;
  responded: string | null;
  resolved: boolean;
}

export interface ClimateMods {
  precipMult: number;
  tempOffset: number;
}

export interface HistoryEvent {
  tick: number;
  kind: string;
  text: string;
  cellId: number;
  settlementId: number;
  severity: 'info' | 'good' | 'warn' | 'bad';
}

export interface MetricSample {
  tick: number;
  population: number;
  settlements: number;
  food: number;
  water: number;
  timber: number;
  ore: number;
  foodProduced: number;
  degradation: number;
  biomassFrac: number;
  tradeDelivered: number;
  wellbeing: number;
}

export interface MigrationFlow {
  tick: number;
  from: number; // settlement id
  to: number; // settlement id
  fromCell: number;
  toCell: number;
  amount: number;
  founding: boolean;
}

export interface LedgerTotals {
  produced: Inventory;
  consumed: Inventory;
  spoiled: Inventory;
  transportLoss: Inventory;
  construction: Inventory;
  maintenance: Inventory;
  overflow: Inventory;
  abandoned: Inventory;
  dissipated: Inventory;
  intervention: Inventory;
  seeded: Inventory; // goods introduced by scenario setup or founding expeditions
}

export interface ScenarioState {
  id: string;
  challenge: boolean;
  status: 'active' | 'success' | 'failure';
  startTick: number;
  deadline: number;
  streak: number;
  baselinePopulation: number;
  message: string;
  memo: Record<string, number>;
}

export interface Expedition {
  population: number;
  inventory: Inventory;
}

export interface WorldState {
  version: number;
  seed: string;
  params: GenParams;
  rules: Rules;
  rng: RngState;
  tick: number;
  mode: GameMode;
  cells: CellState[];
  settlements: Settlement[];
  nextSettlementId: number;
  buildings: Building[];
  nextBuildingId: number;
  roads: Road[];
  routes: TradeRoute[];
  nextRouteId: number;
  shipments: Shipment[];
  relations: Record<string, Relation>;
  policy: Policy;
  tech: Record<TechId, TechState>;
  climate: ClimateMods;
  crises: Crisis[];
  nextCrisisId: number;
  scenario: ScenarioState | null;
  expedition: Expedition | null;
  events: HistoryEvent[];
  metrics: MetricSample[];
  migrations: MigrationFlow[];
  ledger: LedgerTotals; // this tick
  usedNames: string[];
}

export const MONTH_NAMES = ['Thaw', 'Seedfall', 'Bloom', 'Highsun', 'Longlight', 'Zenith', 'Ember', 'Harvest', 'Fade', 'Frost', 'Deepnight', 'Turning'];

export function formatDate(tick: number): string {
  const year = Math.floor(tick / 12) + 1;
  return `Year ${year}, ${MONTH_NAMES[tick % 12]}`;
}
