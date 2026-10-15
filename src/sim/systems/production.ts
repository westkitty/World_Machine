import {
  ENERGY_CAPACITY, ENERGY_FUEL_PER_UNIT, FARM_CAPACITY, FARM_WATER_PER_FOOD, LABOR_PARTICIPATION,
  MINE_CAPACITY, MINE_ENERGY_PER_ORE, PORT_FISH_SHARE, PRODUCTIVITY,
} from '../constants';
import type { TickContext } from '../context';
import { credit, debit, storageCap } from '../economy';
import { moistureYield, temperatureYield } from '../formulas';
import { monthlyNeeds, reserveTarget } from '../needs';
import { emptyFlows } from '../settlements';
import { getTopology } from '../topology';
import { GOODS, TRADE_GOODS, type Building, type Good, type Settlement, type WorldState } from '../types';

/**
 * Labour-driven production. Each settlement enumerates its production sources
 * (farms, foraging, fishing, wells, forestry, mines, power works), allocates
 * workers first to essential targets (water, food, then focus good, timber,
 * energy, ore) and then spare labour to stockpiling. Every unit produced draws
 * down a real stock: soil, biomass, fish, water or ore.
 */
type SourceKind = 'farm' | 'forage' | 'fishing' | 'water' | 'timber' | 'mine' | 'energy';

interface Source {
  kind: SourceKind;
  good: Good;
  perWorker: number;
  capacity: number;
  workers: number;
  cells: number[];
  building?: Building;
}

export const EXTRACTION_MULT = { restrained: 0.6, normal: 1, intensive: 2 } as const;

export function farmYield(state: WorldState, b: Building, ctx?: TickContext): number {
  const c = state.cells[b.cellId];
  if (c.conserved) return 0;
  const irr = state.tech.irrigation.done;
  const y = c.fertilityBase * c.soil * temperatureYield(c.temperature) * moistureYield(c.moisture, irr)
    * (irr ? 1.1 : 1) * b.condition * (1 - 0.5 * c.degradation);
  return y * (ctx?.farmMult.get(b.settlementId) ?? 1);
}

function buildSources(state: WorldState, s: Settlement, ctx: TickContext): Source[] {
  const topo = getTopology();
  const cells = state.cells;
  const out: Source[] = [];
  const terr = ctx.territory.get(s.id) ?? [];
  const intensity = EXTRACTION_MULT[state.policy.extraction];
  for (const b of state.buildings) {
    if (b.settlementId !== s.id || b.status !== 'active') continue;
    const cell = cells[b.cellId];
    if (b.type === 'farm') {
      const y = farmYield(state, b, ctx);
      // Extraction policy also sets farming intensity: more output, faster soil exhaustion.
      if (y > 0.001) out.push({ kind: 'farm', good: 'food', perWorker: PRODUCTIVITY.farm * Math.max(0.25, y), capacity: FARM_CAPACITY * y * Math.sqrt(intensity), workers: 0, cells: [b.cellId], building: b });
    } else if (b.type === 'mine' && !cell.conserved && cell.ore > 0) {
      const deep = state.tech.deep_mining.done ? 1.4 : 1;
      out.push({ kind: 'mine', good: 'ore', perWorker: PRODUCTIVITY.mine * deep, capacity: Math.min(cell.ore, MINE_CAPACITY * b.condition * deep * intensity), workers: 0, cells: [b.cellId], building: b });
    } else if (b.type === 'energy') {
      out.push({ kind: 'energy', good: 'energy', perWorker: PRODUCTIVITY.energy, capacity: ENERGY_CAPACITY * b.condition, workers: 0, cells: [b.cellId], building: b });
    } else if (b.type === 'port') {
      const fishCells = topo.neighbors[b.cellId].filter((j) => !cells[j].land);
      const sea = state.tech.seafaring.done ? 1.3 : 1;
      let cap = 0;
      for (const j of fishCells) cap += cells[j].fish * PORT_FISH_SHARE;
      if (cap > 1) out.push({ kind: 'fishing', good: 'food', perWorker: PRODUCTIVITY.fishing * sea, capacity: cap * b.condition * sea * intensity, workers: 0, cells: fishCells, building: b });
    }
  }
  for (const i of terr) {
    const c = cells[i];
    if (c.waterStock > 1) out.push({ kind: 'water', good: 'water', perWorker: PRODUCTIVITY.water, capacity: c.waterStock * 0.6, workers: 0, cells: [i] });
    if (c.conserved || c.biomass < 1) continue;
    const vitality = Math.sqrt(Math.min(1, c.biomass / Math.max(1, c.biomassCap)));
    out.push({ kind: 'timber', good: 'timber', perWorker: PRODUCTIVITY.timber * Math.sqrt(intensity) * Math.max(0.2, vitality), capacity: c.biomass * 0.012 * intensity, workers: 0, cells: [i] });
    out.push({ kind: 'forage', good: 'food', perWorker: PRODUCTIVITY.forage * Math.max(0.2, vitality), capacity: c.biomass * 0.004 * intensity, workers: 0, cells: [i] });
  }
  out.sort((a, b) => b.perWorker - a.perWorker);
  return out;
}

/** The tradeable good this settlement produces most efficiently relative to the norm. */
export function comparativeAdvantage(sources: { good: Good; perWorker: number; capacity: number }[]): Good | null {
  const norm: Partial<Record<Good, number>> = { food: PRODUCTIVITY.farm, timber: PRODUCTIVITY.timber, ore: PRODUCTIVITY.mine };
  let best: Good | null = null, bestRatio = 0.6;
  for (const src of sources) {
    const n = norm[src.good];
    if (!n || src.capacity < 300) continue;
    const ratio = src.perWorker / n;
    if (ratio > bestRatio) { bestRatio = ratio; best = src.good; }
  }
  return best;
}

export function productionSystem(state: WorldState, ctx: TickContext): void {
  for (const s of state.settlements) {
    if (!s.alive) continue;
    produceFor(state, s, ctx);
  }
}

function produceFor(state: WorldState, s: Settlement, ctx: TickContext): void {
  // Tools: last month's ore satisfaction scales labour productivity (85%–100%).
  const toolSat = s.last.needed.ore > 0 ? Math.min(1, s.last.consumed.ore / s.last.needed.ore) : 1;
  const prevImported = s.last.imported;
  const flows = emptyFlows();
  s.last = flows;
  const sources = buildSources(state, s, ctx);
  const tools = 0.85 + 0.15 * toolSat;
  for (const src of sources) src.perWorker *= tools;
  const labor = s.population * LABOR_PARTICIPATION * (0.6 + 0.4 * s.health);
  flows.labor = labor;
  let free = labor;
  const planned: Record<Good, number> = { food: 0, water: 0, timber: 0, ore: 0, energy: 0 };

  const allocate = (good: Good, amount: number, maxWorkers = Infinity): void => {
    let remaining = amount;
    let budget = Math.min(free, maxWorkers);
    for (const src of sources) {
      if (src.good !== good || remaining <= 0 || budget <= 0) continue;
      const room = src.capacity - src.workers * src.perWorker;
      if (room <= 0) continue;
      const w = Math.min(budget, Math.min(room, remaining) / src.perWorker);
      src.workers += w; budget -= w; free -= w;
      remaining -= w * src.perWorker;
      planned[good] += w * src.perWorker;
    }
  };

  const needs = monthlyNeeds(state, s, ctx);
  flows.needed = { ...needs };
  const refill = (g: Good) => Math.max(0, reserveTarget(state, s, g, needs) - s.inventory[g]) / 4;
  // Reliable imports substitute for local effort (comparative advantage).
  const local = (g: Good, amount: number) => Math.max(amount * 0.25, amount - 0.9 * prevImported[g]);
  const maintenanceTimber = 40 + state.buildings.filter((b) => b.settlementId === s.id).length * 15;
  const housingTimber = Math.max(0, s.population * 1.5 - s.housing) / 3 / 6;
  const target: Record<Good, number> = {
    food: needs.food + refill('food'),
    water: 0,
    timber: needs.timber + maintenanceTimber + housingTimber + refill('timber'),
    ore: needs.ore + refill('ore') + 20,
    energy: 0,
  };
  const waterPerFood = FARM_WATER_PER_FOOD * (state.tech.water_reclamation.done ? 0.5 : 1);
  target.water = needs.water + refill('water') + target.food * waterPerFood;
  target.energy = needs.energy + target.ore * MINE_ENERGY_PER_ORE;
  if (!state.tech.clean_energy.done) target.timber += target.energy * ENERGY_FUEL_PER_UNIT;

  const focus = s.laborFocus;
  const order: Good[] = ['water', 'food'];
  if (focus !== 'balanced' && !order.includes(focus)) order.push(focus);
  for (const g of ['energy', 'timber', 'ore'] as Good[]) if (!order.includes(g)) order.push(g);
  for (const g of TRADE_GOODS) target[g] = local(g, target[g]);
  for (const g of order) allocate(g, target[g]);

  // Spare labour: the specialty (labour focus, or the settlement's comparative
  // advantage) is produced up to storage capacity for export; other goods are
  // only stocked to a modest buffer above reserve.
  if (free > 1) {
    const specialty = focus !== 'balanced' && focus !== 'energy' ? focus : comparativeAdvantage(sources);
    const room = (g: Good) => Math.max(0, storageCap(state, s, g) - s.inventory[g] - planned[g]);
    const buffer = (g: Good) => Math.max(0, reserveTarget(state, s, g, needs) * 1.25 - s.inventory[g] - planned[g]);
    if (specialty) allocate(specialty, room(specialty), free * 0.7);
    const others = TRADE_GOODS.filter((g) => g !== specialty);
    const share = free / others.length;
    for (const g of others) allocate(g, buffer(g), share);
    flows.specialty = specialty ?? null;
  } else if (focus !== 'balanced' && focus !== 'energy') {
    flows.specialty = focus;
  }

  // Execute production in dependency order.
  const cells = state.cells;
  const exec = (kind: SourceKind, fn: (src: Source, amount: number) => number) => {
    for (const src of sources) {
      if (src.kind !== kind || src.workers <= 0) continue;
      const amount = Math.min(src.capacity, src.workers * src.perWorker);
      const made = fn(src, amount);
      if (made > 0) {
        credit(state, s, src.good, made, 'produced');
        flows.produced[src.good] += made;
        flows.laborUsed[src.good] += src.workers * (made / Math.max(1e-9, amount));
        flows.bySource[kind] = (flows.bySource[kind] ?? 0) + made;
      }
    }
  };
  exec('water', (src, a) => { const c = cells[src.cells[0]]; const t = Math.min(a, c.waterStock); c.waterStock -= t; return t; });
  const exhaustion = (state.tech.crop_rotation.done ? 0.4 : 1) * EXTRACTION_MULT[state.policy.extraction];
  exec('farm', (src, a) => {
    const waterNeed = a * waterPerFood;
    const got = debit(state, s, 'water', waterNeed, 'consumed');
    flows.consumed.water += got;
    const out = waterNeed > 0 ? a * (got / waterNeed) : a;
    const c = cells[src.cells[0]];
    c.soil = Math.max(0, c.soil - 0.0025 * (out / FARM_CAPACITY) * exhaustion);
    return out;
  });
  exec('forage', (src, a) => { const c = cells[src.cells[0]]; const draw = Math.min(c.biomass, a * 0.6); c.biomass -= draw; c.harvest += draw; return draw / 0.6; });
  exec('fishing', (src, a) => {
    let total = 0;
    for (const j of src.cells) total += cells[j].fish;
    if (total <= 0) return 0;
    const take = Math.min(a, total);
    for (const j of src.cells) cells[j].fish -= take * (cells[j].fish / total);
    return take;
  });
  exec('timber', (src, a) => { const c = cells[src.cells[0]]; const t = Math.min(a, c.biomass); c.biomass -= t; c.harvest += t; return t; });
  const clean = state.tech.clean_energy.done;
  exec('energy', (src, a) => {
    let out = a;
    if (!clean) {
      const fuelNeed = a * ENERGY_FUEL_PER_UNIT;
      const got = debit(state, s, 'timber', fuelNeed, 'consumed');
      flows.consumed.timber += got;
      out = fuelNeed > 0 ? a * (got / fuelNeed) : a;
      const c = cells[src.cells[0]];
      c.pollution = Math.min(1, c.pollution + 0.03 * (out / ENERGY_CAPACITY));
    }
    return out;
  });
  const deepDeg = state.tech.deep_mining.done ? 1.25 : 1;
  exec('mine', (src, a) => {
    const c = cells[src.cells[0]];
    const energyNeed = a * MINE_ENERGY_PER_ORE;
    const got = debit(state, s, 'energy', energyNeed, 'consumed');
    flows.consumed.energy += got;
    // Without power a mine still works by hand at 40% of its output.
    const powered = energyNeed > 0 ? got / energyNeed : 1;
    const out = Math.min(c.ore, a * (0.4 + 0.6 * powered));
    c.ore = Math.max(0, c.ore - out);
    const k = out / MINE_CAPACITY;
    c.pollution = Math.min(1, c.pollution + 0.04 * k);
    c.degradation = Math.min(1, c.degradation + 0.004 * k * deepDeg);
    return out;
  });
  for (const g of GOODS) if (!Number.isFinite(flows.produced[g])) flows.produced[g] = 0;
}
