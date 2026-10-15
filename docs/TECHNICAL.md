# Technical documentation

This describes the code as implemented. Constants live in `src/sim/constants.ts` unless noted.

## Module architecture

```
src/
  sim/                      Pure, deterministic simulation. No DOM, no Three.js, no wall clock.
    rng.ts                  sfc32 PRNG; 4-word state stored in saves
    noise.ts                seeded 3D simplex noise, fBm, ridged multifractal
    topology.ts             icosphere dual cells: centres, areas, neighbours, corners
    worldgen.ts             terrain field, climate, drainage, biomes, resources
    formulas.ts             shared environmental formulas (water renewal, crop response…)
    types.ts                all persisted state types
    economy.ts              ledger-backed credit/debit, storage capacity, costs
    needs.ts                monthly needs and reserve targets
    pathfinding.ts          Dijkstra over the cell graph (land / sea)
    construction.ts         placement rules, building and road construction
    settlements.ts          creation, territory, abandonment, events, ocean basins
    context.ts              per-tick derived lookups (never persisted)
    systems/                one file per simulation system (see tick order)
    engine.ts               tick orchestration, metrics, state validation
    commands.ts             validated player commands + side-effect-free preview
    scenarios.ts            scenario data, setup, pure objective evaluators
    compare.ts              strategy forks run through the real engine
    save.ts                 versioned serialisation, validation, migration hook
    create.ts               reference world, base world, site selection
  app/
    App.ts                  controller and sole frame-loop owner; input → commands
    clock.ts                fixed-step clock (frame-rate independent)
    storage.ts              guarded localStorage: slots, settings
  render/
    PlanetView.ts           owns every Three.js object; sync/frame/pick/dispose
    planetMesh.ts           render geometry and per-vertex colour/light painting
    overlays.ts             overlay definitions, legends, colour ramps
    shaders.ts              planet, ocean, atmosphere, cloud and flow-line GLSL
  ui/                       DOM interface (no framework)
    Hud.ts                  layout, tool rail, tabs, overlays, toasts, labels, modals
    panels.ts               inspector panels
    menus.ts                title/new-game, settings, saves, help
    charts.ts, dom.ts       canvas charts, DOM helpers
  audio/AudioEngine.ts      procedural Web Audio
```

Ownership rules: the simulation never imports from `render/`, `ui/` or `app/`. The renderer
reads state and never mutates it. The UI changes state only through `App.run(command)` or
App lifecycle methods (new game, load, adopt branch). The single exception is the Sandbox
“Unrestricted” checkbox, which toggles the `rules.unrestricted` flag directly.

## Spherical topology

`buildIcosphere(3)` subdivides an icosahedron three times by edge-midpoint projection
(10·8²+2 = **642** vertices). Each vertex is a simulation cell. A cell’s polygon is the ordered
ring of normalised centroids of the triangles sharing that vertex, giving 630 hexagons and 12
pentagons. Areas are exact spherical-polygon areas: a fan of spherical triangles from the
centre, each measured with the Van Oosterom–Strackee formula
`tan(E/2) = |a·(b×c)| / (1 + a·b + b·c + c·a)`. The polygons partition the sphere, so the
areas sum to 4πR² (R = 6371 km); the test asserts relative error < 1e-9. Cells are unequal
(max/min area > 1.05) and every area-sensitive rule (water renewal, biomass and fish capacity,
ocean coverage) scales by `areaRel = areaFrac × 642`.

Neighbours are ordered by angle in the tangent plane. Distances are great-circle
(`atan2(|a×b|, a·b) × R`). `nearestCell` does a greedy walk on the Delaunay-like graph, which
finds the true nearest centre (tested against brute force on 500 random points). y is the
rotation axis; latitude = asin(y), longitude = atan2(x, z).

The renderer uses a finer icosphere (level 5 = 10,242 vertices or level 6 = 40,962) and maps
each render vertex to its simulation cell once per world.

## Simulation timestep

One tick = one month; twelve ticks = one year. `engine.step` runs, in order:

1. scenario climate hook (opens the Long Drought crisis), then derived per-tick context
2. **climate** — seasonal temperature and precipitation, soil moisture, drought index
3. **ecology** — biomass regrowth and overharvest stress, degradation, soil recovery,
   water renewal, fish regrowth, pollution diffusion
4. **production** — labour allocation and extraction
5. **infrastructure** — construction progress, wear, maintenance, neglect, ruin
6. **trade** — route re-planning, arrivals, departures (goods in transit)
7. **consumption** — household needs, housing construction, spoilage, energy dissipation
8. **population** — births, deaths, health, wellbeing, abandonment
9. **migration** — transfers between settlements, colony founding, territory growth
10. **society** — values, specialisation, relations, autonomous building and agreements;
    then technology progress
11. **crises** — expiry, conditional generation, ongoing dynamics
12. tick counter advances, then **scenario evaluation** and **metric recording**

A re-entrancy guard rejects nested steps. The `SimClock` turns real elapsed time into whole
ticks (0.5/1/3/8 per second), capped at 4 per frame and 0.25 s of catch-up; a test confirms
30 fps and 144 fps produce the same tick count (±1 from float accumulation). Rendering
interpolates shipments between ticks with the clock phase but never affects results.

Determinism: all randomness comes from the saved `rng` state (`withRng` reads and writes it
back); iteration orders are array orders; no `Math.random` or `Date` in `sim/`. Tests replay
identical action sequences to byte-identical saves and continue loaded saves identically.

## World generation

`TerrainField.raw(v)` (pure function of seed + params): domain-warped point → nearest two of
9–15 random “plates” (continental with probability ≈ 1 − ocean coverage); base height ±0.42,
ridged noise mountains along convergent boundaries scaled by ruggedness, hills on continental
plates, plus 5-octave fBm. Sea level is the area-weighted quantile matching `oceanCoverage`.
Heights map to metres (land up to ≈ 5,600 m × ruggedness factor, sea down to −5,840 m).

- **Temperature**: `29 − 45·(|lat|/90)^1.4 − 6.5 °C/km × elevation + offset`.
- **Moisture & precipitation**: prevailing winds (easterly trades < 30°, westerlies 30–60°,
  polar easterlies) carry moisture 14 passes across land from oceans (warm oceans evaporate
  more); climbing terrain removes moisture (`exp(−gain/2600 m)`) and adds orographic rain.
  Precipitation = zonal band (wet ITCZ, dry ~26° subtropics, wet ~50° storm belt, dry poles)
  × moisture × cold-air factor × rainfall parameter.
- **Drainage**: each land cell drains to its lowest lower neighbour; runoff accumulates
  downhill (cells processed high → low); flow > 3 marks a river.
- **Biomes**: Whittaker-style thresholds on annual temperature and precipitation, with
  alpine above 3,300 m, wetlands on wet lowland rivers, three ocean depth classes.
- **Fertility**: temperature and precipitation optima, altitude penalty, river bonus, noise;
  deserts and ice ×0.35.
- **Resources**: ore deposits more likely and richer in uplands; fish richest on shelves and
  in cold water; biomass capacity by biome × area.

## Resource accounting

Goods: food, water, timber, ore (stored, tradeable) and energy (a local grid flow — produced
and consumed in the same month, remainder recorded as `dissipated`). Every mutation goes
through `economy.credit/debit`, which update the per-tick ledger:

| Sources | Sinks |
| --- | --- |
| `produced` (all extraction; demolition salvage) | `consumed` (households, farm irrigation, plant fuel, mine power, tools) |
| `seeded` (scenario/world setup stockpiles) | `spoiled` (food 2%/mo, 0.6% with Cold Storage; water 1%/mo evaporation) |
| | `transportLoss` (charged at departure; shipments to vanished settlements) |
| | `construction` (buildings, roads, routes, housing) |
| | `maintenance` (building/road upkeep, caravan provisioning 15 food/route/month) |
| | `intervention` (research, crisis responses) |
| | `overflow` (credit above storage capacity) |
| | `abandoned` (inventory of abandoned settlements) |
| | `dissipated` (unused energy) |

Transfers (trade, founding supplies, expedition landing) move goods between holders without
touching the ledger. The conservation test checks, every tick for 120 ticks,
`Σinventory + Σin-transit + expedition = previous + produced + seeded − Σsinks`.
`debit` never takes more than is held, so inventories cannot go negative.

Storage: 12,000 per good + 30,000 per active storehouse (× condition), +25% with Cold Storage.

### Production (per settlement, per month)

Labour = population × 0.5 × (0.6 + 0.4·health), scaled 85–100% by last month’s tool (ore)
supply. Sources and their real stocks:

| Source | Output per worker | Capacity | Draws down |
| --- | --- | --- | --- |
| Farm | 9 × max(0.25, yield) | 3,200 × yield × √intensity | soil health; 0.12 water per food |
| Foraging | 2.5 × vitality | 0.4% of biomass × intensity | biomass (0.6 per food) |
| Fishing (port) | 7 (×1.3 Seafaring) | 6% of adjacent fish stock | fish |
| Water | 14 | 60% of cell water stock | water stock |
| Forestry | 6 × √intensity × vitality | 1.2% of biomass × intensity | biomass |
| Mine | 7 (×1.4 Deep Mining) | 1,400 × condition, ≤ deposit | ore deposit; 0.08 energy/ore (40% output unpowered) |
| Power works | 15 | 3,500 × condition | 0.15 timber/energy (none with Clean Energy) |

Farm yield = fertility × soil × temperature response × moisture response × condition ×
(1 − 0.5·degradation) × blight. Workers go first to essential targets — water, food, focus
good, energy, timber, ore (need + reserve refill/4, minus 90% of last month’s imports) — then
spare labour produces the settlement’s specialty (labour focus or comparative advantage) up to
storage capacity and other goods only to 1.25× reserve. Extraction intensity is 0.6 / 1 / 2.

### Ecology

Biomass: logistic regrowth r = 3.5%/mo (×1.5 reserve, ×2.4 with Reforestation) toward capacity
× (1 − 0.7·degradation) × moisture × cold factor. Degradation rises by
`0.03 × max(0, 0.55 − biomass/capacity) × harvest-intensity` (overharvest below maximum
sustainable yield) plus 1.2% × pollution, and falls by 0.9%/mo in reserves (1.6% with
Reforestation) or 0.15%/mo elsewhere under healthy cover (×2 restrained, ×0.3 intensive).
Farms exhaust soil (0.25%/mo at full output × intensity, ×0.4 with Crop Rotation); soil
recovers 0.15%/mo (0.4% in reserves). Pollution comes from mines and power works, decays 10%/mo
and diffuses 4% to neighbours.

## Population model

Needs per person per month: food 1, water 1 (×0.75 Water Reclamation, ×0.7 under drought
rationing), energy 0.2, timber 0.03, ore 0.012; all ×0.8 under rationing and × the mode’s
consumption multiplier. Births = pop × 0.45% × food² × water × (0.4 + 0.6·wellbeing) × growth
policy × free-housing factor. Deaths = pop × (0.13% + 7%·(1−food)^1.5 + 14%·(1−water)^1.5 +
epidemic) × (1.6 − 0.6·health). Health and wellbeing move 15–20% per month toward targets built
from food, water, energy, environment, crowding and employment. Housing is built from spare
timber (1 timber → 3 places) up to 1.5 × population and decays 0.25%/mo. Below 40 people a
settlement is abandoned.

Migration: pressure = low wellbeing + crowding; up to 4%/month leave for the most attractive
settlement within 4,200 km or any active trade partner. Colonies are founded by crowded
settlements, or every three years by prosperous growth-minded ones, on the best unclaimed site
1,200–3,200 km away that the colonists can reach (overland, or anywhere with an active port);
they carry 400–600 people and supplies and break ground on a farm.

## Trade routing

Routes connect two settlements. Land paths: Dijkstra over land cells, edge cost = great-circle
km × terrain factor (slope, rainforest/wetland, alpine/ice, desert) × 0.35 on roads. Sea paths:
port cell → ocean cells → port cell; both settlements need an active port on a navigable basin
(≥ 12 ocean cells). The cheaper of the viable plans is used and re-planned when roads or ports
change (and yearly).

| | Land | Sea |
| --- | --- | --- |
| Capacity / month / direction | 700 × (1 + 2·paved fraction) (×1.5 paved with Masonry Roads) | 2,400 (×1.5 Seafaring) |
| Speed | 900 → 2,400 km/month paved | 3,200 km/month (×1.5 Seafaring) |
| Loss | 3%/1,000 km → 0.8% paved | 0.8%/1,000 km |
| Limit | 9,000 km | 20,000 km |

Each month, arrivals are credited first; then for each direction and each good in the trade
priority order, the sender ships `min(stock − own reserve, receiver’s 1.5× reserve − stock −
in-transit, remaining capacity)`. Loss is deducted at departure; cargo arrives
`ceil(distance / speed)` months later. Routes are suspended when an endpoint dies, a sea route
loses a port, a quarantine applies, relations are hostile (< −0.6, embargo), or the origin cannot
pay 15 food of provisions; relations below −0.3 reduce capacity.

Relations: cooperation moves toward (trade volume − competition) with memory fade; competition
comes from shared borders and shared shortages of tradeable goods.

## Save schema

`{ format: "world-machine-save", version: 1, savedAt, label, state: WorldState }`. `WorldState`
(see `src/sim/types.ts`) holds seed, generation parameters, rules, RNG state, tick, mode, all 642
cells’ static and dynamic fields, settlements (inventories, flows, values, history), buildings,
roads, routes (paths, history), shipments in transit, relations, policy, technology, climate
modifiers, crises, scenario progress, expedition, events (≤ 400), metrics (≤ 600, older half
thinned), migrations (≤ 60) and the last tick’s ledger. Topology and all Three.js objects are
rebuilt, never saved. `deserialize` rejects non-JSON, foreign formats, newer versions and invalid
contents (cell count, negative or non-finite inventories, bad RNG state, dangling route
endpoints) with specific messages; `migrate()` is the hook for future versions.

## Rendering and performance

- One `WebGLRenderer`; one frame loop (`App.loop`); pixel ratio capped by quality preset
  (1 / 1.5 / 2). Quality also selects mesh level (5/5/6) and clouds (off/on/on).
- Planet: one indexed mesh with custom shader; per-vertex colour, night-light and border
  attributes rewritten from simulation state (≤ 5×/s, ≈ 7 ms for 40,962 vertices). Geometry is
  built once per world/quality.
- Settlements, structures and shipments are `InstancedMesh`es (fixed capacity); roads, routes
  and migration arcs are single `LineSegments` rebuilt on change with the old geometry
  disposed. 15–17 draw calls in total.
- Picking intersects the camera ray with a sphere and walks to the nearest cell (no mesh
  raycast).
- `PlanetView.dispose()` releases geometries, materials, the cloud texture, controls and the
  renderer.
