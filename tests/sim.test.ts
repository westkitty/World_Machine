import { describe, expect, it } from 'vitest';
import { SimClock } from '../src/app/clock';
import { applyCommand, previewCommand } from '../src/sim/commands';
import { compareStrategies } from '../src/sim/compare';
import { placementBlocker } from '../src/sim/construction';
import { bestFarmCells, createBaseWorld, createReferenceWorld, seedSettlement, placeBuilding } from '../src/sim/create';
import { inTransit, storageCap, totalInventory } from '../src/sim/economy';
import { assertStateValid, step, stepMany } from '../src/sim/engine';
import { Rng, seedRng } from '../src/sim/rng';
import { SaveError, deserialize, serialize } from '../src/sim/save';
import { createScenarioWorld, getScenario } from '../src/sim/scenarios';
import { getSettlement, liveSettlements, territoryOf } from '../src/sim/settlements';
import { farmYield } from '../src/sim/systems/production';
import { planRoute } from '../src/sim/systems/trade';
import { roadIndex } from '../src/sim/pathfinding';
import { PLANET_RADIUS_KM, getTopology, nearestCell, type Vec3 } from '../src/sim/topology';
import { GOODS, type WorldState } from '../src/sim/types';
import { baseTemperature, generateWorld, DEFAULT_PARAMS } from '../src/sim/worldgen';

const topo = getTopology();

describe('planetary topology', () => {
  it('has 642 cells with 12 pentagons and stable valid coordinates', () => {
    expect(topo.count).toBe(642);
    const sizes = topo.neighbors.map((n) => n.length);
    expect(sizes.filter((s) => s === 5).length).toBe(12);
    expect(sizes.filter((s) => s === 6).length).toBe(630);
    for (let i = 0; i < topo.count; i++) {
      const c = topo.centers[i];
      expect(Math.hypot(...c)).toBeCloseTo(1, 12);
      expect(topo.lat[i]).toBeGreaterThanOrEqual(-90);
      expect(topo.lat[i]).toBeLessThanOrEqual(90);
      expect(topo.lon[i]).toBeGreaterThanOrEqual(-180);
      expect(topo.lon[i]).toBeLessThanOrEqual(180);
    }
    // Identifiers are deterministic: rebuilding gives the same centre for each id.
    const again = getTopology();
    expect(again.centers[321]).toEqual(topo.centers[321]);
  });

  it('has reciprocal neighbours and a connected graph', () => {
    for (let i = 0; i < topo.count; i++) for (const j of topo.neighbors[i]) expect(topo.neighbors[j]).toContain(i);
    const seen = new Set([0]);
    const stack = [0];
    while (stack.length) for (const v of topo.neighbors[stack.pop()!]) if (!seen.has(v)) { seen.add(v); stack.push(v); }
    expect(seen.size).toBe(topo.count);
  });

  it('cell areas sum to the sphere surface area (relative error < 1e-9)', () => {
    const total = topo.area.reduce((a, b) => a + b, 0);
    const sphere = 4 * Math.PI * PLANET_RADIUS_KM ** 2;
    expect(Math.abs(total - sphere) / sphere).toBeLessThan(1e-9);
    // Cells are unequal (pentagons are smaller) and the simulation must know it.
    const min = Math.min(...topo.area), max = Math.max(...topo.area);
    expect(max / min).toBeGreaterThan(1.05);
  });

  it('maps any surface point to its nearest cell (greedy walk equals brute force)', () => {
    const rng = new Rng(seedRng('pick'));
    for (let k = 0; k < 500; k++) {
      const z = rng.range(-1, 1), t = rng.range(0, Math.PI * 2), r = Math.sqrt(1 - z * z);
      const v: Vec3 = [r * Math.cos(t), z, r * Math.sin(t)];
      let best = 0, bd = -2;
      for (let i = 0; i < topo.count; i++) {
        const d = topo.centers[i][0] * v[0] + topo.centers[i][1] * v[1] + topo.centers[i][2] * v[2];
        if (d > bd) { bd = d; best = i; }
      }
      expect(nearestCell(topo, v, rng.int(topo.count))).toBe(best);
    }
    for (let i = 0; i < topo.count; i++) expect(nearestCell(topo, topo.centers[i])).toBe(i);
  });
});

describe('world generation', () => {
  it('identical seeds reproduce identical worlds; different seeds differ', () => {
    const a = generateWorld('alpha', DEFAULT_PARAMS).cells;
    const b = generateWorld('alpha', DEFAULT_PARAMS).cells;
    const c = generateWorld('beta', DEFAULT_PARAMS).cells;
    expect(a).toEqual(b);
    const diff = a.filter((cell, i) => cell.land !== c[i].land).length;
    expect(diff).toBeGreaterThan(50);
  });

  it('respects ocean coverage and produces varied biomes', () => {
    for (const ocean of [0.4, 0.7]) {
      const cells = generateWorld('coverage', { ...DEFAULT_PARAMS, oceanCoverage: ocean }).cells;
      const oceanFrac = cells.reduce((a, c, i) => a + (c.land ? 0 : topo.areaFrac[i]), 0);
      expect(Math.abs(oceanFrac - ocean)).toBeLessThan(0.03);
      expect(new Set(cells.map((c) => c.biome)).size).toBeGreaterThan(7);
    }
  });

  it('derives climate fields from declared rules', () => {
    const cells = generateWorld('climate', DEFAULT_PARAMS).cells;
    for (let i = 0; i < topo.count; i++) {
      expect(cells[i].baseTemp).toBeCloseTo(baseTemperature(topo.lat[i], cells[i].elevation, 0), 9);
    }
    const eq = cells.filter((_, i) => Math.abs(topo.lat[i]) < 15 && !cells[i].land);
    const pole = cells.filter((_, i) => Math.abs(topo.lat[i]) > 70 && !cells[i].land);
    const mean = (xs: typeof cells) => xs.reduce((a, c) => a + c.baseTemp, 0) / xs.length;
    expect(mean(eq)).toBeGreaterThan(mean(pole) + 25);
    // Drainage flows downhill.
    for (const c of cells) if (c.land && c.downhill >= 0) expect(cells[c.downhill].elevation).toBeLessThan(c.elevation);
  });

  it('temperature and moisture parameters shift the climate', () => {
    const warm = generateWorld('p', { ...DEFAULT_PARAMS, temperatureOffset: 6 }).cells;
    const cold = generateWorld('p', { ...DEFAULT_PARAMS, temperatureOffset: -6 }).cells;
    expect(warm[100].baseTemp - cold[100].baseTemp).toBeCloseTo(12, 6);
    const wet = generateWorld('p', { ...DEFAULT_PARAMS, moisture: 1.5 }).cells;
    const dry = generateWorld('p', { ...DEFAULT_PARAMS, moisture: 0.5 }).cells;
    expect(wet[100].basePrecip).toBeGreaterThan(dry[100].basePrecip * 2.5);
  });
});

function conservation(state: WorldState) {
  const inv = totalInventory(state), tr = inTransit(state);
  const ex = state.expedition?.inventory;
  return GOODS.map((g) => inv[g] + tr[g] + (ex ? ex[g] : 0));
}

describe('resource accounting', () => {
  it('every unit has a recorded source or sink (ledger balances each tick)', () => {
    const s = createReferenceWorld();
    for (let t = 0; t < 120; t++) {
      const before = conservation(s);
      step(s);
      const after = conservation(s);
      const L = s.ledger;
      GOODS.forEach((g, k) => {
        const sinks = L.consumed[g] + L.spoiled[g] + L.transportLoss[g] + L.construction[g] + L.maintenance[g] + L.overflow[g] + L.abandoned[g] + L.dissipated[g] + L.intervention[g];
        const expected = before[k] + L.produced[g] + L.seeded[g] - sinks;
        expect(Math.abs(after[k] - expected)).toBeLessThan(1e-6 * Math.max(1, Math.abs(expected)) + 1e-6);
      });
    }
  });

  it('inventories never go negative and no NaN/Infinity appears over a long run', () => {
    const s = createReferenceWorld('LONG-RUN');
    for (let t = 0; t < 600; t++) { step(s); assertStateValid(s); }
  });

  it('finite ore deposits only decrease; renewable biomass regrows when left alone', () => {
    const s = createReferenceWorld();
    const ore0 = s.cells.reduce((a, c) => a + c.ore, 0);
    stepMany(s, 60);
    const ore1 = s.cells.reduce((a, c) => a + c.ore, 0);
    expect(ore1).toBeLessThan(ore0);
    const cell = s.cells.findIndex((c) => c.land && c.owner < 0 && c.biomassCap > 10000);
    s.cells[cell].biomass = s.cells[cell].biomassCap * 0.2;
    const b0 = s.cells[cell].biomass;
    stepMany(s, 24);
    expect(s.cells[cell].biomass).toBeGreaterThan(b0 * 1.5);
  });
});

describe('population and consumption', () => {
  function lone(): [WorldState, number] {
    const s = createBaseWorld('lone');
    const site = s.cells.findIndex((c) => c.land && c.fertilityBase > 0.6 && c.biome !== 'ice');
    const st = seedSettlement(s, site, 5000, { food: 30000, water: 15000, timber: 5000, ore: 2000 }, new Rng(seedRng('x')));
    s.policy.autonomy = 'none';
    return [s, st.id];
  }

  it('settlements consume actual inventory and grow when supplied', () => {
    const [s, id] = lone();
    for (const c of bestFarmCells(s, getSettlement(s, id)!).slice(0, 2)) { placeBuilding(s, getSettlement(s, id)!, 'farm', c); placeBuilding(s, getSettlement(s, id)!, 'farm', c); }
    const before = getSettlement(s, id)!.inventory.food;
    step(s);
    const st = getSettlement(s, id)!;
    expect(st.last.consumed.food).toBeCloseTo(st.last.needed.food, 6);
    expect(st.inventory.food).toBeLessThan(before + st.last.produced.food);
    const p0 = st.population;
    stepMany(s, 12);
    expect(getSettlement(s, id)!.population).toBeGreaterThan(p0);
  });

  it('food shortage constrains growth and severe shortage causes decline', () => {
    const [s, id] = lone();
    const st = getSettlement(s, id)!;
    st.inventory.food = 0;
    // Remove every food source: no farms, and foraging land stripped bare.
    for (const c of territoryOf(s, id)) { s.cells[c].biomass = 0; s.cells[c].biomassCap = 0; }
    const p0 = st.population;
    stepMany(s, 6);
    const after = getSettlement(s, id);
    expect(after === undefined || after.population < p0 * 0.8).toBe(true);
  });
});

describe('trade and transport', () => {
  function pair(): [WorldState, number, number] {
    const s = createReferenceWorld();
    const r = s.routes[0];
    return [s, r.a, r.b];
  }

  it('transfers goods between real endpoints with explicit losses', () => {
    const [s, a, b] = pair();
    const A = getSettlement(s, a)!, B = getSettlement(s, b)!;
    s.policy.autonomy = 'none';
    A.inventory.food = storageCap(s, A, 'food'); B.inventory.food = 0;
    const route = s.routes[0];
    route.goods = ['food'];
    step(s);
    const sent = s.shipments.filter((sh) => sh.routeId === route.id && sh.good === 'food');
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((sh) => sh.from === a && sh.to === b && sh.arriveTick === s.tick - 1 + route.travelMonths)).toBe(true);
    expect(s.ledger.transportLoss.food).toBeGreaterThan(0);
    const before = B.importedTotal;
    stepMany(s, route.travelMonths + 1);
    expect(getSettlement(s, b)!.importedTotal).toBeGreaterThan(before);
  });

  it('transport cost reflects distance and roads', () => {
    const [s, a, b] = pair();
    const A = getSettlement(s, a)!, B = getSettlement(s, b)!;
    const plain = planRoute(s, A, B, new Set());
    expect(typeof plain).not.toBe('string');
    if (typeof plain === 'string') return;
    // Pave the whole path.
    for (let i = 1; i < plain.path.length; i++) s.roads.push({ a: Math.min(plain.path[i - 1], plain.path[i]), b: Math.max(plain.path[i - 1], plain.path[i]), settlementId: a, condition: 1, status: 'active', progress: 2 });
    const paved = planRoute(s, A, B, roadIndex(s.roads));
    if (typeof paved === 'string') throw new Error(paved);
    expect(paved.roadFraction).toBeGreaterThan(0.9);
    expect(paved.lossRate).toBeLessThan(plain.lossRate);
    expect(paved.capacity).toBeGreaterThan(plain.capacity);
    expect(paved.travelMonths).toBeLessThanOrEqual(plain.travelMonths);
    expect(plain.lossRate).toBeCloseTo((plain.distanceKm / 1000) * 0.03, 6);
  });

  it('rejects routes with nonexistent endpoints and duplicate routes', () => {
    const [s, a, b] = pair();
    const before = serialize(s);
    expect(applyCommand(s, { type: 'route', a, b: 9999 }).ok).toBe(false);
    expect(applyCommand(s, { type: 'route', a, b }).ok).toBe(false);
    expect(applyCommand(s, { type: 'route', a, b: a }).ok).toBe(false);
    expect(JSON.parse(serialize(s)).state).toEqual(JSON.parse(before).state);
  });
});

describe('construction and environment', () => {
  it('validates placement and consumes resources', () => {
    const s = createReferenceWorld();
    const st = liveSettlements(s)[0];
    const ocean = s.cells.findIndex((c) => !c.land);
    expect(applyCommand(s, { type: 'build', building: 'farm', cellId: ocean }).ok).toBe(false);
    const unowned = s.cells.findIndex((c) => c.land && c.owner < 0);
    expect(applyCommand(s, { type: 'build', building: 'storage', cellId: unowned }).message).toMatch(/territory/);
    const cell = territoryOf(s, st.id).find((c) => !placementBlocker(s, 'storage', c))!;
    const timber = st.inventory.timber;
    const r = applyCommand(s, { type: 'build', building: 'storage', cellId: cell });
    expect(r.ok).toBe(true);
    expect(st.inventory.timber).toBeCloseTo(timber - 600, 6);
    expect(s.buildings.some((b) => b.cellId === cell && b.status === 'construction')).toBe(true);
    st.inventory.timber = 0;
    const other = territoryOf(s, st.id).find((c) => !placementBlocker(s, 'storage', c))!;
    const r2 = applyCommand(s, { type: 'build', building: 'storage', cellId: other });
    expect(r2.ok).toBe(false);
    expect(r2.message).toMatch(/lacks/);
  });

  it('environmental degradation lowers subsequent productivity', () => {
    const s = createReferenceWorld();
    const farm = s.buildings.find((b) => b.type === 'farm')!;
    const y0 = farmYield(s, farm);
    s.cells[farm.cellId].degradation = 0.8;
    expect(farmYield(s, farm)).toBeLessThan(y0 * 0.7);
  });

  it('conservation idles extraction and speeds recovery', () => {
    const s = createReferenceWorld();
    const st = liveSettlements(s)[0];
    const cell = territoryOf(s, st.id).find((c) => c !== st.cellId)!;
    s.cells[cell].degradation = 0.5;
    const twin = structuredClone(s);
    expect(applyCommand(s, { type: 'conserve', cellId: cell, on: true }).ok).toBe(true);
    stepMany(s, 24); stepMany(twin, 24);
    expect(s.cells[cell].degradation).toBeLessThan(twin.cells[cell].degradation - 0.1);
  });
});

describe('time control', () => {
  it('pause prevents any tick advancement', () => {
    const clock = new SimClock();
    clock.setSpeed(4);
    clock.togglePause();
    let ticks = 0;
    for (let f = 0; f < 600; f++) ticks += clock.advance(1 / 60);
    expect(ticks).toBe(0);
  });

  it('frame rate does not change how many ticks run per second', () => {
    const run = (fps: number) => { const c = new SimClock(); c.setSpeed(3); let t = 0; for (let f = 0; f < fps * 10; f++) t += c.advance(1 / fps); return t; };
    // Equal up to one tick of floating-point accumulation.
    expect(Math.abs(run(30) - run(144))).toBeLessThanOrEqual(1);
    expect(run(60)).toBeGreaterThanOrEqual(29);
  });

  it('single step advances exactly one tick', () => {
    const s = createReferenceWorld();
    const t0 = s.tick;
    step(s);
    expect(s.tick).toBe(t0 + 1);
  });

  it('identical actions replay identically (determinism)', () => {
    const run = () => {
      const s = createReferenceWorld();
      stepMany(s, 30);
      applyCommand(s, { type: 'policy', patch: { extraction: 'intensive' } });
      stepMany(s, 30);
      return serialize(s).replace(/"savedAt":"[^"]+"/, '');
    };
    expect(run()).toBe(run());
  });
});

describe('save and load', () => {
  it('round-trips the complete state and continues deterministically', () => {
    const a = createReferenceWorld();
    stepMany(a, 25);
    const loaded = deserialize(serialize(a));
    expect(loaded).toEqual(JSON.parse(JSON.stringify(a)));
    stepMany(a, 30);
    stepMany(loaded, 30);
    expect(JSON.stringify(loaded)).toBe(JSON.stringify(a));
  });

  it('rejects corrupt, foreign and future saves with clear errors', () => {
    expect(() => deserialize('{not json')).toThrow(SaveError);
    expect(() => deserialize(JSON.stringify({ format: 'other' }))).toThrow(/not a World Machine save/);
    const s = createReferenceWorld();
    const file = JSON.parse(serialize(s));
    file.version = 99;
    expect(() => deserialize(JSON.stringify(file))).toThrow(/newer/);
    const bad = JSON.parse(serialize(s));
    bad.state.settlements[0].inventory.food = -5;
    expect(() => deserialize(JSON.stringify(bad))).toThrow(/invalid food/);
    const short = JSON.parse(serialize(s));
    short.state.cells.pop();
    expect(() => deserialize(JSON.stringify(short))).toThrow(/642 cells/);
  });
});

describe('modes and commands', () => {
  it('observer mode rejects every intervention', () => {
    const s = createReferenceWorld(undefined, {}, 'observer');
    const st = liveSettlements(s)[0];
    for (const cmd of [
      { type: 'policy', patch: { rationing: true } },
      { type: 'build', building: 'farm', cellId: st.cellId },
      { type: 'conserve', cellId: st.cellId, on: true },
    ] as const) expect(applyCommand(s, cmd).message).toMatch(/Observer/);
  });

  it('sandbox unrestricted tools skip costs; normal sandbox charges them', () => {
    const s = createReferenceWorld();
    s.rules.unrestricted = true;
    const st = liveSettlements(s)[0];
    st.inventory.timber = 0; st.inventory.ore = 0;
    const cell = territoryOf(s, st.id).find((c) => !placementBlocker(s, 'storage', c))!;
    expect(applyCommand(s, { type: 'build', building: 'storage', cellId: cell }).ok).toBe(true);
    s.rules.unrestricted = false;
    expect(applyCommand(s, { type: 'build', building: 'storage', cellId: cell }).ok).toBe(false);
  });

  it('challenge mode applies stricter rules than scenario mode', () => {
    const normal = createScenarioWorld('long_drought');
    const hard = createScenarioWorld('long_drought', true);
    expect(normal.mode).toBe('scenario');
    expect(hard.mode).toBe('challenge');
    expect(hard.rules.crisisFrequency).toBeGreaterThan(normal.rules.crisisFrequency);
    expect(hard.rules.constructionCostMult).toBeGreaterThan(1);
    expect(totalInventory(hard).food).toBeLessThan(totalInventory(normal).food);
  });

  it('preview validates without mutating state', () => {
    const s = createReferenceWorld();
    const st = liveSettlements(s)[0];
    const before = JSON.stringify(s);
    const cell = territoryOf(s, st.id).find((c) => !placementBlocker(s, 'storage', c))!;
    expect(previewCommand(s, { type: 'build', building: 'storage', cellId: cell }).ok).toBe(true);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('technology research costs resources and changes mechanics', () => {
    const s = createReferenceWorld();
    const st = liveSettlements(s)[0];
    st.inventory.food = 5000; st.inventory.timber = 5000;
    const r = applyCommand(s, { type: 'research', tech: 'cold_storage', fundingId: st.id });
    st.inventory.ore = 5000;
    const r2 = applyCommand(s, { type: 'research', tech: 'cold_storage', fundingId: st.id });
    expect(r.ok || r2.ok).toBe(true);
    stepMany(s, 6);
    expect(s.tech.cold_storage.done).toBe(true);
  });

  it('crisis responses consume resources and alter effects', () => {
    const s = createScenarioWorld('long_drought');
    stepMany(s, 7);
    const drought = s.crises.find((c) => c.type === 'drought' && !c.resolved)!;
    expect(drought).toBeTruthy();
    const funder = liveSettlements(s)[0];
    funder.inventory.ore = 2000; funder.inventory.timber = 2000;
    expect(applyCommand(s, { type: 'respond', crisisId: drought.id, response: 'wells', fundingId: funder.id }).ok).toBe(true);
    expect(funder.inventory.ore).toBeCloseTo(1400, 6);
    expect(applyCommand(s, { type: 'respond', crisisId: drought.id, response: 'ration' }).ok).toBe(false);
  });

  it('strategy comparison runs real alternative futures from one snapshot', () => {
    const s = createReferenceWorld();
    stepMany(s, 12);
    const snapshot = JSON.stringify(s);
    const [a, b] = compareStrategies(s, { extraction: 'restrained' }, { extraction: 'intensive', growth: 'encourage' }, 36);
    expect(JSON.stringify(s)).toBe(snapshot);
    expect(a.state.tick).toBe(s.tick + 36);
    expect(a.metrics.population).not.toBe(b.metrics.population);
    const again = compareStrategies(s, { extraction: 'restrained' }, { extraction: 'intensive', growth: 'encourage' }, 36);
    expect(again[0].metrics).toEqual(a.metrics);
  });
});

describe('scenario evaluation', () => {
  it('objectives read live simulation state', () => {
    const s = createScenarioWorld('first_footprint');
    const def = getScenario('first_footprint')!;
    expect(def.objectives(s)[0].met).toBe(false);
    const site = s.cells.findIndex((c) => c.land && c.fertilityBase > 0.6 && c.owner < 0 && c.biome !== 'ice');
    expect(applyCommand(s, { type: 'found', cellId: site }).ok).toBe(true);
    expect(def.objectives(s)[0].met).toBe(true);
    const st = liveSettlements(s)[0];
    st.inventory.food = st.population * 5;
    expect(def.objectives(s)[1].met).toBe(true);
    st.inventory.food = 0;
    expect(def.objectives(s)[1].met).toBe(false);
  });

  it('long-run simulation stays bounded', () => {
    const s = createReferenceWorld('BOUNDED');
    const t0 = performance.now();
    stepMany(s, 720);
    const ms = (performance.now() - t0) / 720;
    expect(s.events.length).toBeLessThanOrEqual(400);
    expect(s.metrics.length).toBeLessThanOrEqual(600);
    expect(s.migrations.length).toBeLessThanOrEqual(60);
    expect(s.settlements.filter((x) => x.alive).length).toBeLessThanOrEqual(s.rules.maxSettlements);
    for (const st of s.settlements) expect(st.popHistory.length).toBeLessThanOrEqual(120);
    expect(ms).toBeLessThan(40);
  });
});

