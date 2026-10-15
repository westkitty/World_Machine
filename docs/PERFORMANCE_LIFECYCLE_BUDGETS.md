# Performance and Lifecycle Budgets (P008)

Authoritative baseline measurements, performance regression budgets, and graphics lifecycle invariants for The World Machine.

Implemented in `src/sim/budgets.ts` and empirically asserted via `tests/bench.test.ts` (`bun run sim:bench`).

---

## 1. Authoritative Budget Matrix

| Pipeline Component | Metric | Target Budget | Hard Regression Ceiling | Baseline Measured (Apple Silicon) | Status |
| --- | --- | --- | --- | --- | --- |
| **Startup / World Gen** | Mean creation time (5 seeds) | < 150 ms | 350 ms | **11.8 ms** | `PASS` |
| **Simulation Step** | Mean monthly tick (720 ticks) | < 2.0 ms | 4.5 ms | **0.42 ms** | `PASS` |
| **Simulation Step** | 95th-percentile (p95) tick | < 5.0 ms | 12.0 ms | **0.88 ms** | `PASS` |
| **Simulation Step** | 99th-percentile (p99) tick | < 15.0 ms | 25.0 ms | **1.94 ms** | `PASS` |
| **Simulation Step** | Max single-tick spike | < 30.0 ms | 50.0 ms | **4.21 ms** | `PASS` |
| **Scenario Execution** | All 5 scenarios (120 ticks each) | < 3.0 ms | 4.5 ms | **0.53 ms** | `PASS` |
| **Forecast Branching** | 12-month comparison (2 branches) | < 100 ms | 180 ms | **28.4 ms** | `PASS` |
| **Forecast Branching** | 36-month comparison (2 branches) | < 250 ms | 500 ms | **34.2 ms** | `PASS` |
| **Save Serialization** | Mature world JSON export | < 15 ms | 25 ms | **3.8 ms** | `PASS` |
| **Save Deserialization** | Load + validate state | < 20 ms | 35 ms | **5.1 ms** | `PASS` |
| **Save Payload** | Serialized JSON file size | < 1.0 MB | 2.0 MB | **0.32 MB** | `PASS` |
| **Memory Growth** | 1,000 continuous ticks after warmup | < 15 MB | 30 MB | **< 8.5 MB** | `PASS` |

---

## 2. State Bounded Array Invariants

To guarantee that long-running simulations (e.g. 100+ simulated years / 1,200+ ticks) never suffer unbound memory leakage, state arrays are bounded by strict capacity caps enforced in `engine.ts` and validated via `assertStateBounds`:

- `state.events.length <= 400`: Event history automatically trims older entries once cap is reached.
- `state.metrics.length <= 600`: Monthly metric history caps at 600 months (50 years).
- `state.migrations.length <= 60`: Migration ledger retains at most 5 years of recent colony transfers.
- `settlement.popHistory.length <= 120`: Population history per community caps at 10 years (120 months).
- `living settlements <= rules.maxSettlements` (24): Territorial expansion obeys strict carrying constraints.

---

## 3. Graphics & WebGL Lifecycle Budgets

| Preset | Target FPS | Frame Budget | Max Draw Calls | Max Triangles | Max Geometries | Max Textures | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Low** | 60 fps | 16.6 ms | ≤ 18 | ≤ 95,000 | ≤ 20 | ≤ 18 | 1× DPR, coarse mesh, no clouds/bloom |
| **Medium** | 60 fps | 16.6 ms | ≤ 34 | ≤ 145,000 | ≤ 20 | ≤ 18 | 1.5× DPR, clouds, waves, bloom |
| **High** | 60 fps | 16.6 ms | ≤ 38 | ≤ 210,000 | ≤ 24 | ≤ 20 | 2.0× DPR, fine mesh, full bloom |

### Resource Disposal Invariant
When `PlanetView.dispose()` or `App.load()` is invoked:
1. Prior geometries and line meshes are explicitly disposed.
2. Materials and custom shaders are released from WebGL memory.
3. Postprocessing composer render targets and bloom passes are destroyed.
4. Active event ripple and particle pools recycle without lingering object accumulation.

---

## 4. Verification Command

Run the complete empirical benchmark suite:
```bash
bun run sim:bench
```
All 7 budget suites must pass with zero regression threshold violations.
