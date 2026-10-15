# The World Machine

A planetary civilisation simulator played on a real spherical world, in the browser.

You are a **steward**, not a ruler. Communities on a procedurally generated planet of
642 regions produce, consume, trade, migrate and found new settlements according to the
land, the climate and your policies. You shape the conditions — farms, mines, storehouses,
power works, ports, roads, trade routes, conservation reserves, policy and technology —
and live with the consequences.

Built with TypeScript, Three.js (0.186.1) and Vite. No backend, no API keys, no CDN at
runtime: the production build is a static site.

## Features

- **Spherical simulation topology** — dual cells of a level-3 icosphere: 642 regions
  (630 hexagons, 12 pentagons) with exact spherical-polygon areas and great-circle distances.
- **Seeded procedural worlds** — tectonic-plate-style continents, mountain belts, prevailing
  winds with rain shadows, drainage and rivers, soil fertility, 14 biomes, ore deposits and
  fisheries. Seed, ocean coverage, ruggedness, temperature and rainfall are adjustable.
- **Deterministic monthly simulation** — climate & seasons, ecology (logistic regrowth,
  overharvest stress, pollution diffusion, soil exhaustion), labour-driven production,
  infrastructure with maintenance and neglect, trade with goods in transit, consumption,
  population, migration and colony founding, emergent society and relations, crises.
- **Ledger-backed economy** — every unit of food, water, timber, ore and energy has a
  recorded source or sink; tests prove conservation every tick.
- **Four modes** — Sandbox (with an optional, clearly labelled *Unrestricted* toggle),
  Scenario, Observer (no interventions) and Challenge.
- **Five scenarios** — First Footprint, The Distance Between Us, The Long Drought,
  The Green Threshold, One Planet Many Futures — each with objectives, failure conditions,
  progress tracking and restart. Every scenario and challenge variant is proven winnable by
  a scripted player and losable by neglect in the automated tests.
- **Strategy comparison** — fork the current world, run two policy sets through the real
  engine for 1–10 years, compare outcomes, and adopt either future.
- **Three.js planet** — relief, soft coastlines, biome blending that reflects live
  degradation and frost, ocean with sun glint, atmosphere rim, clouds, night-side city lights
  driven by population and *met* energy demand, settlement markers sized by population and
  coloured by wellbeing, structures, roads, animated trade flows, moving shipments, migration
  arcs, region borders, selection/hover outlines.
- **14 map overlays** — terrain, elevation, temperature, precipitation, fertility, water,
  biomes, resources, population, infrastructure, trade, degradation, conservation, migration;
  each with a legend and a textual value for the selected region.
- **Inspectors** — Region, Settlement, Ledger, Trade, Policy & Technology, Crises,
  Objectives, History (charts + timeline), Compare.
- **Save system** — 3 manual slots + yearly autosave in local storage, JSON export/import,
  versioned schema with validation and clear errors.
- **Audio** — procedural Web Audio ambience and cues (no audio files); master/music/effects
  volume and mute, persisted; silent until your first interaction.
- **Accessibility & mobile** — keyboard control of time, tools, overlays and camera; a
  settlement/region list alternative to clicking the globe; text alongside every colour
  signal; reduced motion and reduced effects; touch rotate/pinch/tap; phone layout with a
  bottom tool rail and a collapsible inspector sheet; safe-area support.

## Install, run, test, build

Requires Node 20+ (tested with Node 26) and either bun or npm.

```bash
bun install
```

```bash
bun run dev
```

Open http://localhost:5173 (Vite prints the URL).

```bash
bun run test
```

```bash
bun run build
```

```bash
bun run preview
```

`bun run build` type-checks (`tsc --noEmit`) and writes the static site to `dist/`.
`npm install` / `npm run …` work identically.

## Controls

| Input | Action |
| --- | --- |
| Drag (mouse) / one finger | Rotate the planet |
| Wheel / pinch | Zoom |
| Click / tap | Select a region, or apply the active tool |
| Double-click | Fly to a region |
| Right-click / Esc | Back to Inspect |
| Space | Pause / resume |
| `.` | Advance exactly one month |
| `1`–`4` | Speed (0.5, 1, 3, 8 months per second) |
| `Q` `N` `R` `T` `C` | Inspect, Found, Road, Trade route, Reserve |
| `[` `]` | Previous / next overlay |
| Arrow keys, `+` `−`, `Home` | Rotate, zoom, reset camera |
| `H` or `?` | Help |
| Camera panel `1`–`4` | Fly to a bookmark; Shift-click to store the current view |

## How to play

1. From the title screen pick a mode. Sandbox and Observer let you set the seed and world
   parameters and preview a planet summary; Scenario and Challenge list the five scenarios.
2. Select regions and settlements to read their state and *why*: reserves in months of need,
   shortages, labour, output by source, relations and their reasons.
3. Use the tool rail. Hover (desktop) shows cost and validity before you commit; invalid
   actions explain themselves.
4. Set policy (extraction intensity, rationing, growth, local autonomy, reserve months,
   trade priority) and fund technology.
5. Respond to crises in the Crises tab — every response costs resources or imposes a trade-off.
6. Use **Compare** before big decisions.

## Saving

Use **Save** in the top bar: three slots, the yearly autosave, **Export** (downloads a
`.json` file) and **Import**. If browser storage is unavailable or full, the game says so and
export still works. Saves contain the complete simulation state, including the random
generator state, so a loaded game continues exactly as it would have.

## Deploying (GitHub Pages or any static host)

`vite.config.ts` uses `base: './'`, so `dist/` works from any subpath, including
`https://<user>.github.io/World_Machine/`. Verified locally by serving `dist/` under
`/World_Machine/`. To publish on GitHub Pages, build and upload `dist/` with the official
`actions/upload-pages-artifact` + `actions/deploy-pages` workflow, or push `dist/` to a
`gh-pages` branch. Nothing has been deployed by this work.

## Documentation

- [docs/TECHNICAL.md](docs/TECHNICAL.md) — architecture, topology, timestep, world
  generation, resource accounting, population, trade, saves, performance.
- [docs/VALIDATION.md](docs/VALIDATION.md) — tests executed, runtime checks, measurements.
- [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md) — simplifications and remaining gaps.
- [OPERATIONAL_STATE.md](OPERATIONAL_STATE.md) — continuation state for future sessions.
