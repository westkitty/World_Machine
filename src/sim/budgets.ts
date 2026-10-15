import type { WorldState } from './types';

/**
 * Performance and Lifecycle Budgets (P008)
 *
 * Defines authoritative, empirical performance thresholds, memory caps,
 * and graphics lifecycle budgets for The World Machine.
 *
 * Prevents performance drift across future expansions and provides reproducible
 * baselines for simulation, forecast branching, and graphics pipelines.
 */

export interface BudgetMetrics {
  mean: number;
  min: number;
  max: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

export const PERFORMANCE_BUDGETS = {
  /** Cold startup & world generation (ms) */
  startup: {
    /** Target mean world creation latency (topology, terrain, biomes, communities) */
    meanCreationMs: 150,
    /** Absolute hard ceiling for world generation */
    maxCreationMs: 350,
  },

  /** Monthly simulation tick execution (ms per tick on single CPU core) */
  tick: {
    /** Target mean simulation step time */
    targetMeanMs: 2.0,
    /** Maximum acceptable mean step time */
    maxMeanMs: 4.5,
    /** Target 95th-percentile step time */
    targetP95Ms: 5.0,
    /** Hard ceiling for 95th-percentile step time */
    maxP95Ms: 12.0,
    /** Hard ceiling for 99th-percentile step time (absorbs garbage collection / occasional realloc) */
    maxP99Ms: 25.0,
    /** Absolute single-tick spike limit */
    maxSpikeMs: 50.0,
  },

  /** Strategy comparison & forecasting ("Fork the future") */
  forecast: {
    /** 12-month parallel branch comparison ceiling */
    max12MonthComparisonMs: 180,
    /** 36-month parallel branch comparison ceiling */
    max36MonthComparisonMs: 500,
  },

  /** State storage and JSON serialization */
  storage: {
    /** Maximum JSON serialization latency for mature 720-month world */
    maxSerializeMs: 25,
    /** Maximum deserialization + validation latency */
    maxDeserializeMs: 35,
    /** Maximum JSON string payload size for standard saved world */
    maxSavePayloadBytes: 2 * 1024 * 1024, // 2 MB
  },

  /** Array capacity limits to prevent unbounded memory growth */
  caps: {
    maxEvents: 400,
    maxMetrics: 600,
    maxMigrations: 60,
    maxPopHistory: 120,
    maxSettlements: 24,
  },

  /** Memory growth limits over 1,000 continuous simulation ticks */
  memory: {
    /** Maximum heap growth in MB across 1000 ticks after warmup */
    maxHeapGrowthMb: 30,
  },
} as const;

export interface QualityPresetBudget {
  readonly preset: 'low' | 'medium' | 'high';
  readonly maxDrawCalls: number;
  readonly maxTriangles: number;
  readonly maxGeometries: number;
  readonly maxTextures: number;
  readonly targetFps: number;
  readonly maxFrameTimeMs: number;
}

export const RENDER_LIFECYCLE_BUDGETS: Record<'low' | 'medium' | 'high', QualityPresetBudget> = {
  low: {
    preset: 'low',
    maxDrawCalls: 18,
    maxTriangles: 95000,
    maxGeometries: 20,
    maxTextures: 18,
    targetFps: 60,
    maxFrameTimeMs: 16.6,
  },
  medium: {
    preset: 'medium',
    maxDrawCalls: 34,
    maxTriangles: 145000,
    maxGeometries: 20,
    maxTextures: 18,
    targetFps: 60,
    maxFrameTimeMs: 16.6,
  },
  high: {
    preset: 'high',
    maxDrawCalls: 38,
    maxTriangles: 210000,
    maxGeometries: 24,
    maxTextures: 20,
    targetFps: 60,
    maxFrameTimeMs: 16.6,
  },
} as const;

/**
 * Computes statistical percentiles and summary metrics for an array of benchmark samples.
 */
export function computeQuantiles(samples: number[]): BudgetMetrics {
  if (samples.length === 0) {
    return { mean: 0, min: 0, max: 0, p50: 0, p90: 0, p95: 0, p99: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / sorted.length;
  const quantile = (q: number) => {
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * q)));
    return sorted[idx];
  };

  return {
    mean,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p50: quantile(0.50),
    p90: quantile(0.90),
    p95: quantile(0.95),
    p99: quantile(0.99),
  };
}

/**
 * Asserts that a WorldState instance conforms to strict bounded array invariants.
 */
export function assertStateBounds(state: WorldState): { ok: boolean; violations: string[] } {
  const violations: string[] = [];
  const caps = PERFORMANCE_BUDGETS.caps;

  if (state.events.length > caps.maxEvents) {
    violations.push(`events exceeded cap: ${state.events.length} > ${caps.maxEvents}`);
  }
  if (state.metrics.length > caps.maxMetrics) {
    violations.push(`metrics exceeded cap: ${state.metrics.length} > ${caps.maxMetrics}`);
  }
  if (state.migrations.length > caps.maxMigrations) {
    violations.push(`migrations exceeded cap: ${state.migrations.length} > ${caps.maxMigrations}`);
  }
  for (const st of state.settlements) {
    if (st.popHistory.length > caps.maxPopHistory) {
      violations.push(`settlement ${st.id} popHistory exceeded cap: ${st.popHistory.length} > ${caps.maxPopHistory}`);
    }
  }
  if (state.settlements.filter((s) => s.alive).length > state.rules.maxSettlements) {
    violations.push(`living settlements exceeded cap: ${state.settlements.filter((s) => s.alive).length} > ${state.rules.maxSettlements}`);
  }

  return {
    ok: violations.length === 0,
    violations,
  };
}
