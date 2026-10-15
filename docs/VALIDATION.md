# Validation report

> Updated after the visual finishing pass (see “Visual pass” at the end).

Date: 2026-10-15. Environment: macOS (Apple Silicon), Node 26.11.1, bun 1.3.13, Vite 7.3.7,
Vitest 3.2.7, TypeScript 5.9.3, Three.js 0.186.1. Browser checks used the Claude desktop
app's built-in Chromium browser pane.

## Automated tests — `bun run test` (Vitest)

**54 tests, 54 passed, 0 failed** (2 files, ≈ 2 s).

### `tests/sim.test.ts` (34 tests)

| Area | Test | Directive item |
| --- | --- | --- |
| Topology | 642 cells, 12 pentagons, unit-length centres, valid lat/lon, stable ids | 2 |
| Topology | neighbours reciprocal; graph connected | 3 |
| Topology | cell areas sum to 4πR² (relative error < 1e-9); cells unequal | 4 |
| Topology | ray/point → cell: greedy walk equals brute force on 500 random points; every centre maps to itself | 22 |
| World gen | same seed → identical cells; different seed → > 50 land/sea differences | 1 |
| World gen | ocean coverage within 3% of parameter at 40% and 70%; > 7 biomes | — |
| World gen | base temperature equals the declared formula for all 642 cells; equator ≫ poles; drainage flows downhill | 5 |
| World gen | temperature offset shifts temperature exactly; moisture scales precipitation | — |
| Accounting | ledger balances every tick for 120 ticks (inventory + in transit + expedition) | 6 |
| Accounting | 600-tick run: no negative inventory, NaN or Infinity anywhere (`assertStateValid` each tick) | 7, 26 |
| Accounting | ore deposits only decrease; stripped biomass regrows > 1.5× in 24 months | — |
| Population | consumption equals need when stocked; supplied settlement grows | 8, 9 |
| Population | settlement with no food sources declines > 20% in 6 months (or is abandoned) | 9 |
| Trade | shipments leave from and arrive at the real endpoints; loss recorded; receiver's imports rise | 10 |
| Trade | paved route: lower loss, higher capacity, ≤ transit time; loss = distance × documented rate | 11 |
| Trade | nonexistent endpoint, duplicate and self routes rejected; state unchanged | 21 |
| Construction | ocean / unowned placement rejected with reasons; valid build deducts exact cost; unaffordable build rejected | 12, 21 |
| Environment | degradation 0.8 cuts farm yield by > 30% | 13 |
| Environment | reserve recovers degradation > 0.1 faster over 24 months than its unprotected twin | — |
| Time | paused clock runs 0 ticks over 600 frames | 14 |
| Time | 30 fps and 144 fps produce the same tick count (±1) | 6 (frame-rate independence) |
| Time | single step advances exactly one tick | 15 |
| Determinism | identical action sequence → byte-identical saves | 6 |
| Saves | save/load round-trips the complete state; loaded and original continue identically for 30 ticks | 16, 17 |
| Saves | invalid JSON, foreign file, newer version, negative inventory, wrong cell count rejected with clear errors | — |
| Modes | Observer rejects policy, build and conserve commands | 20 |
| Modes | Sandbox unrestricted skips costs; normal charges them | 20 |
| Modes | Challenge has higher crisis frequency and construction cost and less starting food than Scenario | 20 |
| Commands | preview validates without mutating state | — |
| Technology | research is paid and completes after its months | — |
| Crises | drought response costs the stated ore; second response refused | — |
| Compare | branches run 36 real ticks, leave the source untouched, differ by policy, and are reproducible | — |
| Scenarios | First Footprint objectives change with real founding and food stock | 18 |
| Long run | 720 ticks: events ≤ 400, metrics ≤ 600, migrations ≤ 60, settlements ≤ cap, < 40 ms/tick | 27 |

### `tests/scenarios.test.ts` (20 tests) — item 19

For each of the five scenarios, in both Scenario and Challenge variants: a scripted
competent strategy (`tests/strategies.ts`, using only the public command interface) reaches
**success**, and doing nothing reaches **failure** with a message. Results at the time of writing:

| Scenario | Strategy: normal / challenge | Neglect: normal / challenge |
| --- | --- | --- |
| First Footprint | success month 62 / 62 | failure month 12 / 12 (expedition never settled) |
| The Distance Between Us | success month 13 / 13 | deadline failure month 96 / 86 |
| The Long Drought | success month 72 / 72 | population below floor, month 35 / 31 |
| The Green Threshold | success month 80 / 76 | deadline month 180 / population collapse month 80 |
| One Planet, Many Futures | success month 121 / 121 | deadline failure month 300 / 270 |

## Type check and build

- `tsc --noEmit`: passes with `strict`, `noUnusedLocals`, `noUnusedParameters`.
- `bun run build`: succeeds. Output: `index.html` 1.2 kB, CSS 22 kB (5.5 kB gzip),
  JS 739 kB (204 kB gzip; mostly Three.js). Vite warns only about chunk size (raised limit).
- The built `dist/` was served under `/World_Machine/` (simulating GitHub Pages):
  page loaded, app started, **zero failed requests**, no external hosts contacted.

## Browser runtime checks (manual, built-in Chromium pane)

Executed and observed:

- Title screen: four mode tabs; seed, random seed, four generation sliders and a live planet
  summary; scenario cards with constraints and deadlines.
- Sandbox world starts; region and settlement selection by clicking the globe and by labels;
  camera flies to the selection; Settlement dashboard shows live reserves, flows, labour,
  relations.
- Farm tool: hover/click on an unowned region → "Region is outside every settlement's
  territory"; click inside a territory → farm under construction, cost deducted, toast.
- Route tool: first click arms the origin, second click opened a 7,268 km land route with
  transit time, loss and capacity reported.
- First Footprint via the UI: Found tool + globe click landed the expedition; objectives panel
  and banner updated.
- 24–380 months advanced via Step; trade overlay, routes, shipments, night lights,
  settlement growth and autonomous colonies (5 → 16 settlements) visible.
- Strategy comparison ran from the UI and showed divergent outcomes.
- Saves dialog: saved to Slot 1, advanced 10 months, loaded → exact month and population
  restored; "Game loaded. Paused" toast.
- Observer mode: banner shown; selecting a tool refused with an explanation.
- Keyboard (production build): `.` steps one month, Space pauses/resumes, `3` sets speed,
  `T`/Esc switch tools, `]`/`[` cycle overlays.
- Graphics presets Low/Medium/High switch mesh resolution (10,242 / 10,242 / 40,962 vertices),
  clouds and pixel-ratio cap without errors; Reduced effects removes clouds and dims the
  atmosphere.
- Phone layout (375 × 812 emulation): compact clock, bottom tool rail, inspector bottom sheet,
  overlay bar and camera controls; synthetic touch pointer events: a tap selected the correct
  settlement cell, a drag did not select, a two-finger gesture did not select.
- Console: no application errors during these flows. (The only logged errors were from an
  early build since fixed, and from the synthetic pointer events, which have no real pointer
  for OrbitControls to capture.)

## Performance observations

Measured in the browser pane (Chromium, Apple Silicon, 1440 × 900, High quality, DPR 1):

| Measurement | Value |
| --- | --- |
| Simulation tick (reference world, Node, 720-tick run) | ≈ 0.5 ms average |
| Simulation tick incl. UI bookkeeping (browser, 16 settlements) | ≈ 1.8 ms |
| World build (planet mesh, level 6) | ≈ 280 ms |
| Planet repaint after a tick (terrain colouring, 40,962 vertices) | ≈ 7 ms; overlays ≈ 1 ms |
| Draw calls | 15–17 |
| Triangles | ≈ 68 k (Low) – 156 k (High) |
| GPU resources after 240 extra ticks and overlay switches | unchanged (18 geometries, 1 texture) |
| JS heap after 380 simulated months | ≈ 33 MB |

**Not measured:** real frame rates. The browser pane was hidden during testing, which pauses
`requestAnimationFrame`, so frames were rendered manually; average / low-percentile FPS, GPU
time and mobile-device performance are **unverified**. The 60 fps desktop / 30 fps mobile
targets remain design targets.

## Not verified

- Audio output (code paths run without errors; nothing was listened to).
- Real touch hardware (iOS / Android), pinch-zoom feel, fullscreen on mobile, safe areas on
  notched devices.
- JSON export/import through the browser file dialogs (the underlying serialise/deserialise
  path is unit-tested; Export was not clicked).
- WebGL context loss and restore.
- Firefox and Safari.
- Playwright: not installed in this environment, so there is no automated browser test suite;
  the browser checks above are manual.

## Visual pass (rendering & UI overhaul)

Re-validated after the overhaul:

- `bun run test`: **54/54 passed** (simulation unchanged by the visual work).
- `tsc --noEmit` and `bun run build`: pass. JS 816 kB (224 kB gzip, +21 kB for bloom and
  pixel-width lines), CSS 29 kB (7 kB gzip).
- Production build served under `/World_Machine/`: app started, **0 console errors,
  0 failed requests**.
- Inspected in the browser pane: desktop 1440×900 terrain view (studio light), close-up of
  routes/shipments/structures, event ripples and particles (founding, crisis), fertility
  overlay, orbital night side with city lights, title screen over the drifting globe,
  scenario-success modal, Low quality, phone 375×812.
- Defects found and fixed during the pass: over-dense clouds; blown-out sun glint and halo
  under bloom; glows ballooning at close range and at the limb; land/sea confusion in
  overlays; city lights reading as glowing tiles; migration ripples re-firing on every
  repaint; planet too close on portrait screens; toasts covering the globe on phones;
  draw-call stats only counting the last composer pass.

Renderer measurements (browser pane, 1440×900, DPR 1, frames forced synchronously with
`gl.finish`; the pane was hidden, so these are not real FPS):

| Preset | Frame (CPU + GPU sync) | Draw calls | Triangles |
| --- | --- | --- | --- |
| High | ≈ 1.1 ms | 31 | ≈ 180 k |
| Medium | ≈ 0.3 ms | 30 | ≈ 119 k |
| Low | ≈ 0.2 ms | 14 | ≈ 83 k |

Lifecycle: across 600 simulated months with repeated effects and overlay switches,
geometries stayed at 17–18 and textures at 16; JS heap ≈ 43 MB.

Still unverified: real frame rates (desktop and mobile), the adaptive-quality trigger on a
genuinely slow device, and the look on non-Chromium browsers.
