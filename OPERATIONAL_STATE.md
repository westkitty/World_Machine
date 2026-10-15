# Operational state

Last updated: 2026-10-15 (initial implementation session).

## Baseline

- Vite 7.3.7 + TypeScript 5.9.3 + Three.js 0.186.1 (vanilla, no UI framework), Vitest 3.2.7.
- Single frame-loop owner: `src/app/App.ts` (`loop`). Fixed-step monthly simulation via
  `SimClock`. Simulation (`src/sim`) is pure and deterministic; renderer (`src/render`) and UI
  (`src/ui`) read state; changes go through `applyCommand`.
- Save schema version **1** (`src/sim/save.ts`). Any change to `WorldState` shape needs a
  migration in `migrate()` and a version bump (`SAVE_VERSION` in `src/sim/create.ts`).
- Debug handle in the browser: `window.worldMachine` (the App instance).

## Commands

```bash
bun install
```

```bash
bun run dev
```

```bash
bun run test
```

```bash
bun run build
```

## Verified (with evidence in docs/VALIDATION.md and docs/implementation/WORLD_MACHINE_RUN_LEDGER.md)

- **Phase F0 (Foundation) Complete (CP01–CP08)**:
  - CP01 (P061): Geographic scale contract ($R=6,371\text{ km}$, 642 cells, classified topologies, named units).
  - CP02 (P062): Meaningful-intervention design audit (all 12 actions inventoried, non-redundant, alternative pathways).
  - CP03 (P071): Single authoritative mutation path (transactional commands, zero UI direct writes, invalid commands leave state byte-identical).
  - CP04 (P082): Versioned save compatibility (v1 migration fixtures validated, strict nested schema checks).
  - CP05 (P002): Save overwrite/delete protection (atomic rollback, displacement backups, recovery UI).
  - CP06 (P003): Scenario constraints authoritative (command-boundary policy enforcement, locked terminal scenarios).
  - CP07 (P001): Forecast ownership and adoption integrity (FNV-1a state fingerprinting, fork semantics, anti-transplantation/anti-rewind checks).
  - CP08 (P004): Modal/time/keyboard coherence (accumulator preservation across pause/resume, modal focus trapping/return, focused button suppression).
- **Phase F1 (Proof Factory) In Progress (CP09–CP16)**:
  - CP09 (P007): Automated real-browser journeys verified via Playwright (`tests/e2e/journeys.spec.ts`). 14/14 journeys pass across Desktop Chrome and mobile touch emulation (Pixel 7).
  - CP10 (P008): Performance and lifecycle budgets established and verified via `tests/bench.test.ts` (`bun run sim:bench`) and `src/sim/budgets.ts`. All 7 performance budget suites pass.
  - CP11 (P073): Seeded property-based testing verified via `src/sim/property.ts` and `tests/property.test.ts`. Long-run invariant fuzzing (120 ticks, 3 seeds, 240 commands), save/load fuzz continuity, deterministic command replay, and boundary fuzzing pass cleanly.
  - CP12 (P072): Deterministic civilization replay engine verified via `src/sim/replay.ts` and `tests/replay.test.ts`. Canonical dual FNV-1a state hashing, in-flight command recording, periodic checkpoint validation, post-save continuation, divergence reporting, and strict ruleset/format compatibility guards pass cleanly.
  - CP13 (P074): Automated strategy tournament verified via `src/sim/tournament.ts` and `tests/tournament.test.ts`. 5 distinct legal AI strategies, matched-seed environment evaluations (4 seeds), multi-dimensional scorecards (Resilience, Welfare, Ecology, Trade, Composite), win/loss matrices, and proven non-dominance pass cleanly.
  - CP14 (P075): Human playtest program protocol verified via `docs/HUMAN_PLAYTEST_PROGRAM.md`, `src/app/playtest.ts`, and `tests/playtest.test.ts`. Formalized 6 uncoached tasks (A–F), standardized 1–5 Likert feedback rubric, strict opt-in invariant (`PLAYTEST_STORAGE_KEY`), bounded event capacity (500 max), immediate opt-out memory purge, and zero-PII schema report export pass cleanly.
- **145/145 automated Vitest tests** passing across 15 suites.
- **14/14 automated Playwright E2E browser tests** passing across 2 projects (`chromium` and `mobile-touch`).
- Typecheck (`bun run typecheck`) and production build (`bun run build`) pass cleanly with 0 errors.

## Unverified / known gaps

See `docs/KNOWN_LIMITATIONS.md`. Chiefly: real FPS, real mobile hardware, audio output,
file-dialog export/import, WebGL context restore, Firefox/Safari.

## Repository

`origin` = `github.com/westkitty/World_Machine`; active branch `feat/world-machine-f1` (tracking `origin/feat/world-machine-f1`).
GitHub Pages deploys from `main` via `.github/workflows/pages.yml`. Live at https://westkitty.github.io/World_Machine/.

## Safest next step

Proceed with **Checkpoint CP15 (P083: Verified deployed-release identity)**: embed build SHA/ruleset, configure post-deploy smoke test and prior-build rollback, distinguishing CI, hosted output, and end-user verification.
