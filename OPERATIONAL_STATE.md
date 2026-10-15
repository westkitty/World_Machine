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

## Verified (with evidence in docs/VALIDATION.md)

- 54/54 Vitest tests: topology, generation, accounting conservation, no NaN/negatives over
  600 ticks, population response, trade transfers and costs, construction validation,
  degradation effects, pause/step/frame-rate independence, determinism, save/load continuity
  and corruption handling, mode behaviour, previews, research, crisis responses, comparison,
  scenario evaluation, bounded long runs, and success + failure for all 5 scenarios × 2
  variants.
- Type check and production build pass; build runs from a `/World_Machine/` subpath.
- Manual browser checks of the main journeys on desktop and phone-sized emulation.

## Unverified / known gaps

See `docs/KNOWN_LIMITATIONS.md`. Chiefly: real FPS, real mobile hardware, audio output,
file-dialog export/import, WebGL context restore, Firefox/Safari, automated browser tests.

## Repository

`origin` = `github.com/westkitty/World_Machine`; default branch `main` (also
`feat/initial-world-machine`). GitHub Pages deploys from `main` via
`.github/workflows/pages.yml` (tests must pass first). Live at
https://westkitty.github.io/World_Machine/.

## Safest next step

Add a Playwright suite covering the critical journeys (mode start, found/build/route by
clicking, save → load, touch on a mobile profile) and sample frame rates with the browser
visible; then tune quality presets from the measurements.
