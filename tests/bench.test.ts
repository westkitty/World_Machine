import { describe, it, expect } from 'vitest';
import { createReferenceWorld } from '../src/sim/create';
import { createScenarioWorld, SCENARIOS } from '../src/sim/scenarios';
import { step } from '../src/sim/engine';
import { compareStrategies } from '../src/sim/compare';
import { serialize, deserialize } from '../src/sim/save';
import {
  PERFORMANCE_BUDGETS,
  RENDER_LIFECYCLE_BUDGETS,
  computeQuantiles,
  assertStateBounds,
} from '../src/sim/budgets';

describe('Performance and Lifecycle Budgets (P008)', () => {
  it('startup budget: world generation is fast and bounded across seeds', () => {
    const seeds = ['TERRA-1', 'AEGIS-9', 'BOREALIS-4', 'CYGNUS-7', 'ORION-3'];
    const creationTimes: number[] = [];

    for (const seed of seeds) {
      const t0 = performance.now();
      const state = createReferenceWorld(seed);
      const elapsed = performance.now() - t0;
      creationTimes.push(elapsed);

      expect(state.cells.length).toBe(642);
      expect(state.settlements.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(PERFORMANCE_BUDGETS.startup.maxCreationMs);
    }

    const q = computeQuantiles(creationTimes);
    expect(q.mean).toBeLessThan(PERFORMANCE_BUDGETS.startup.meanCreationMs);
  });

  it('simulation tick distribution: 720-tick run obeys mean and p95/p99 budget', () => {
    const state = createReferenceWorld('BENCH-720');
    const tickSamples: number[] = [];

    // Advance 720 ticks (60 simulated years), sampling every individual monthly step
    for (let i = 0; i < 720; i++) {
      const t0 = performance.now();
      step(state);
      const elapsed = performance.now() - t0;
      tickSamples.push(elapsed);
    }

    const q = computeQuantiles(tickSamples);

    // Assert that empirical measurements satisfy the established budgets
    expect(q.mean).toBeLessThan(PERFORMANCE_BUDGETS.tick.maxMeanMs);
    expect(q.p95).toBeLessThan(PERFORMANCE_BUDGETS.tick.maxP95Ms);
    expect(q.p99).toBeLessThan(PERFORMANCE_BUDGETS.tick.maxP99Ms);
    expect(q.max).toBeLessThan(PERFORMANCE_BUDGETS.tick.maxSpikeMs);

    // Validate that history arrays remain bounded after 720 ticks
    const bounds = assertStateBounds(state);
    expect(bounds.ok).toBe(true);
  });

  it('scenario execution performance: all 5 scenarios stay within tick budget', () => {
    for (const def of SCENARIOS) {
      const state = createScenarioWorld(def.id, false);
      // Warmup ticks to ensure JIT baseline
      for (let i = 0; i < 10; i++) step(state);

      const samples: number[] = [];

      for (let i = 0; i < 120; i++) {
        const t0 = performance.now();
        step(state);
        samples.push(performance.now() - t0);
      }

      const q = computeQuantiles(samples);
      expect(q.mean).toBeLessThan(PERFORMANCE_BUDGETS.tick.maxMeanMs);
      expect(q.p95).toBeLessThan(PERFORMANCE_BUDGETS.tick.maxP95Ms);
    }
  });

  it('long-run memory caps: 1,200 continuous ticks maintain strict array boundaries', () => {
    const state = createReferenceWorld('MEM-CAPS-1200');

    // Run 100 warmup ticks
    for (let i = 0; i < 100; i++) step(state);

    const getHeap = (): number => (typeof (globalThis as unknown as { process?: { memoryUsage?: () => { heapUsed: number } } }).process?.memoryUsage === 'function'
      ? (globalThis as unknown as { process: { memoryUsage: () => { heapUsed: number } } }).process.memoryUsage().heapUsed
      : 0);

    const initialHeap = getHeap();

    // Run 1,100 additional ticks to reach 1,200 total ticks (100 simulated years)
    for (let i = 0; i < 1100; i++) step(state);

    const finalHeap = getHeap();
    const growthMb = (finalHeap - initialHeap) / (1024 * 1024);

    // Invariant: History arrays must strictly respect caps
    expect(state.events.length).toBeLessThanOrEqual(PERFORMANCE_BUDGETS.caps.maxEvents);
    expect(state.metrics.length).toBeLessThanOrEqual(PERFORMANCE_BUDGETS.caps.maxMetrics);
    expect(state.migrations.length).toBeLessThanOrEqual(PERFORMANCE_BUDGETS.caps.maxMigrations);
    for (const st of state.settlements) {
      expect(st.popHistory.length).toBeLessThanOrEqual(PERFORMANCE_BUDGETS.caps.maxPopHistory);
    }

    // Invariant: Heap growth is bounded across continuous operation
    expect(growthMb).toBeLessThan(PERFORMANCE_BUDGETS.memory.maxHeapGrowthMb);
  });

  it('forecast and strategy comparison: 12-month and 36-month horizons stay within latency budgets', () => {
    const state = createReferenceWorld('FORECAST-BENCH');
    for (let i = 0; i < 24; i++) step(state);

    // 12-month forecast horizon
    const t0 = performance.now();
    const [branchA12, branchB12] = compareStrategies(
      state,
      { extraction: 'restrained' },
      { extraction: 'intensive' },
      12,
    );
    const elapsed12 = performance.now() - t0;

    expect(branchA12.forecastTicks).toBe(12);
    expect(branchB12.forecastTicks).toBe(12);
    expect(elapsed12).toBeLessThan(PERFORMANCE_BUDGETS.forecast.max12MonthComparisonMs);

    // 36-month forecast horizon
    const t1 = performance.now();
    const [branchA36, branchB36] = compareStrategies(
      state,
      { extraction: 'restrained' },
      { extraction: 'intensive' },
      36,
    );
    const elapsed36 = performance.now() - t1;

    expect(branchA36.forecastTicks).toBe(36);
    expect(branchB36.forecastTicks).toBe(36);
    expect(elapsed36).toBeLessThan(PERFORMANCE_BUDGETS.forecast.max36MonthComparisonMs);
  });

  it('storage serialization budget: serialization and deserialization remain fast with bounded payload size', () => {
    const state = createReferenceWorld('STORAGE-BENCH');
    for (let i = 0; i < 240; i++) step(state);

    // Serialization
    const t0 = performance.now();
    const json = serialize(state, 'Benchmark Save');
    const serializeMs = performance.now() - t0;

    expect(serializeMs).toBeLessThan(PERFORMANCE_BUDGETS.storage.maxSerializeMs);
    expect(json.length).toBeLessThan(PERFORMANCE_BUDGETS.storage.maxSavePayloadBytes);

    // Deserialization and validation
    const t1 = performance.now();
    const loaded = deserialize(json);
    const deserializeMs = performance.now() - t1;

    expect(deserializeMs).toBeLessThan(PERFORMANCE_BUDGETS.storage.maxDeserializeMs);
    expect(loaded.tick).toBe(state.tick);
    expect(loaded.seed).toBe(state.seed);
  });

  it('render lifecycle budgets: presets declare compliant draw call and triangle ceilings', () => {
    expect(RENDER_LIFECYCLE_BUDGETS.low.maxDrawCalls).toBeLessThanOrEqual(18);
    expect(RENDER_LIFECYCLE_BUDGETS.low.maxTriangles).toBeLessThanOrEqual(95000);

    expect(RENDER_LIFECYCLE_BUDGETS.medium.maxDrawCalls).toBeLessThanOrEqual(34);
    expect(RENDER_LIFECYCLE_BUDGETS.medium.maxTriangles).toBeLessThanOrEqual(145000);

    expect(RENDER_LIFECYCLE_BUDGETS.high.maxDrawCalls).toBeLessThanOrEqual(38);
    expect(RENDER_LIFECYCLE_BUDGETS.high.maxTriangles).toBeLessThanOrEqual(210000);

    for (const preset of ['low', 'medium', 'high'] as const) {
      const budget = RENDER_LIFECYCLE_BUDGETS[preset];
      expect(budget.targetFps).toBe(60);
      expect(budget.maxFrameTimeMs).toBeCloseTo(16.6, 1);
      expect(budget.maxGeometries).toBeGreaterThan(0);
      expect(budget.maxTextures).toBeGreaterThan(0);
    }
  });
});
