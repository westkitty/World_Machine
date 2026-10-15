# THE WORLD MACHINE — 84-PROPOSAL MASTER IMPLEMENTATION PLAN

**Planning baseline:** `westkitty/World_Machine`, `main`, `cc1eb5f0218c41ac094ed13d597492e407d3e59d`, inspected 2026-10-15. **Type:** implementation roadmap, not a completed implementation or approved deployment. **Status:** all 84 items planned; zero items implemented by this planning exercise.

**Sources:** [Repository](https://github.com/westkitty/World_Machine), `OPERATIONAL_STATE.md`, `docs/TECHNICAL.md`, `docs/KNOWN_LIMITATIONS.md`, `docs/VALIDATION.md`, `src/sim/*`, `src/app/*`, `src/ui/*`, `.github/workflows/pages.yml`; original conversation proposal series P001–P084.

## Mission and decision

Turn the existing deterministic 3D planetary stewardship game into a durable and deeply engaging civilization simulator where every player intervention is valid, causally legible, strategically meaningful and provably resilient. Preserve its existing identity: the player is a **steward, not a ruler**; the planet remains genuinely spherical, runs locally/offline, and communities retain meaningful agency.

**Interpretation of “implement each”:** every proposal receives a scheduled work packet and acceptance proof. High-risk research items are staged as falsifiable prototypes before production integration. A failed prototype is **not** silently marked implemented: record evidence, choose a redesigned bounded version or get a project decision before further irreversible investment. This preserves all 84 obligations without pretending every speculative proposal must become production code unchanged.

## Source-grounded baseline

- Simulation: deterministic monthly engine, 642 equal-topology-ID spherical regions, resource ledger, settlements, policy, research, autonomous development, migration and trade; `src/sim` is intended to be DOM/renderer free.
- Modes and content: Sandbox, Scenario, Observer and Challenge; five scenarios; two-strategy comparison; local browser save slots and JSON import/export.
- Documentation reports **54 passing Vitest tests** on 2026-10-15 and passing build checks. That report was read; tests were **not executed as part of this planning exercise**.
- Source-specific gaps: `package.json` invokes `tests/bench.test.ts` for `sim:bench`, but the checked repository tree does not contain that file; no automated browser suite; real FPS, actual mobile hardware, Safari/Firefox, audio output and WebGL loss/restore remain unverified.
- `SAVE_VERSION=1` at baseline; the `migrate()` hook exists but future migrations are not implemented. Local saves are user data and must not be sacrificed to accelerate the upgrade.

## Invariants — never regress

- **Correctness:** equal seed + engine/ruleset version + tick-stamped legal commands yield equal authoritative world state; resource and population ledgers balance; no negative or nonfinite stocks; no use of UI frame timing inside simulation outcomes.
- **Compatibility:** preserve and test original v1 saves, three manual slots, autosave, JSON export/import and mode-specific progress. Each persistent field change has a versioned migration and representative old-save fixture.
- **Playable identity:** retain the real 3D spherical world and all four original modes, five scenarios, original controls/tools, accessibility alternatives, and stewardship/community-agency premise. New mechanics must not silently overwrite that contract.
- **Delivery:** continue local-first, no mandatory network account/backend/CDN, no silent telemetry, no destructive default; protect old published builds and do not equate CI success with deployed playability.
- **Quality:** keyboard/touch/desktop journeys, audio mute, reduced motion, WebGL lifecycle and visual semantics are mandatory regression lanes. No visual, simulation, or browser success claim without appropriate run evidence.
- **Git/permission:** plan and prototypes first; production branches protected; stage/commit/push/Pages publish only when separately authorized. Each merge is independently reversible where practicable.

## Architecture contracts to build exactly once

| Contract | Producer / home | Consumers | Guarantee |
|---|---|---|---|
| World mutation API | `src/sim/commands.ts` + new lifecycle boundary | all UI, scripts, compare, automation, replays | atomic validation, mode/scenario constraints, event + ledger delta, no direct UI mutation |
| Simulation ruleset & schema | `src/sim/types.ts`, `save.ts`, `create.ts` | every new persistent mechanic | engine ruleset version distinct from file schema, migrations and v1 fixtures |
| Observation & causality API | derived selectors from `src/sim` | P009/P025/P037/P065/P068/P070 | grounded fact/derived estimate/forecast classification, event cause provenance |
| Action log & replay | new `src/sim/replay.ts` + tests | P006/P011/P072/P074/P075/P010 | deterministic tick order, canonical state hashes and divergence reporting |
| Content registry | new schema/validated data under `src/content` | P031/P056/P057/P058/P084 | no eval/user code, data-level extensibility and quality gates |
| Render-state adapter | `src/render` + shared map/atlas selectors | P013/P033/P067/P068/P076 | renderer never owns simulation truth, loss-safe rebuild, accessibility parity |
| Scenario/goal evaluator | `src/sim/scenarios.ts` evolution | P034/P048/P050/P056/P059/P060 | pure checkers, valid terminal states, bounded alternative outcomes |
| Risk/budget envelope | test fixtures, benchmark profiles, playtests | all late phases | p95 frame/tick budget from measured baseline, save size and UI complexity caps |

## Ten milestone releases (dependency order)

| Phase | Scope | Item count | Exit gate |
|---|---|---:|---|
| **F0** | Foundation: authority, preservation, and design contracts | 8 | All existing simulation tests pass, legacy v1 saves survive, illegal actions cannot mutate state, and no baseline user journey regresses. |
| **F1** | Proof factory and extensible content backbone | 8 | Every later feature has a reproducible test path, release identity, historical-save fixture, measured budget, and explicit experiment stop signal. |
| **F2** | Runtime, graphics lifecycle, and safe offline delivery | 7 | Matched visual/functional quality with proven device measurements, nonblocking UI, context restoration, and safe offline/update path. |
| **F3** | World command and understanding interfaces | 8 | Players diagnose and act quickly in the same world on desktop, touch, keyboard and non-WebGL paths. |
| **F4** | Compelling short-loop gameplay | 9 | First-session players encounter real choices in the first 24 months; each intervention has measurable consequence. |
| **F5** | Emergent communities and agreements | 9 | Distinct communities demonstrably respond differently to identical player choices, with sustainable deterministic accounting. |
| **F6** | Physical-planet economics and exploration | 10 | Every new field has units, bounded behavior, conservation/invariant tests, measured tick cost and migrated saves. |
| **F7** | Long-horizon planning and interregional life | 7 | Years 20-100 introduce decisions unlike year 1 while populations, resource flows and project commitments remain coherent. |
| **F8** | Cascading crises, memory, causality, and expression | 10 | Crises create recoverable dilemmas, recorded history matches simulation, branch comparisons are valid and visual/audio output is truthful. |
| **F9** | Scenarios, mastery modes, and civilizational payoff | 8 | Alternative victories and modes are testable, can finish cleanly and preserve the original sandbox/scenario/observer/challenge experience. |

**Execution rule:** complete each row in listed order unless independent items are explicitly split into parallel branches. Rows in the same phase may depend on preceding rows; later rows must never be allowed to bypass unfinished dependencies. Do not start more than one high-risk engine change per integration branch.

## F0 — Foundation: authority, preservation, and design contracts

**Outcome:** Lock world-model abstraction, transaction boundaries, save compatibility, and the highest-priority integrity/input defects.

**Exit:** All existing simulation tests pass, legacy v1 saves survive, illegal actions cannot mutate state, and no baseline user journey regresses.

| ID / improvement | Mode / relative effort | Prerequisites | Bounded implementation packet | Acceptance evidence |
|---|---|---|---|---|
| **P061 — Geographic scale contract** | Build · L | Baseline | Define regional-community, land-area, building, distance and visual-scale units; document the 642-cell abstraction and align formulas, inspector wording and representative visuals. | Every spatial mechanic has a named unit and representative coastal, inland and island examples agree across the simulation, UI and globe. |
| **P062 — Meaningful-intervention design audit** | Audit and revise · M | Baseline | Inventory existing actions; record choice, alternatives, cost, delayed effect and feedback; consolidate redundant actions without changing core gameplay. | For every major action document when it is preferable, when an alternative is preferable, and how the player learns the outcome. |
| **P071 — Single authoritative mutation path** | Build · L | P062 | Unify command validation, mode/scenario authority, rule-setting, forecast adoption and world replacement behind explicit transaction/lifecycle interfaces; eliminate UI direct writes. | Static audit finds no unsupported UI state mutations; invalid commands and failed loads leave state byte-identical. |
| **P082 — Versioned save compatibility** | Build · M | P071 | Strengthen nested state validation; create historical v1 fixtures and migrations with versioned rulesets; verify import/export/slots before new persistent fields. | All v1 fixtures load and continue correctly; malformed saves fail without replacing active state; future schema changes require migration tests. |
| **P002 — Save overwrite/delete protection** | Build · S | P082 | Add overwrite/delete confirmation and an undo/backup or export recovery path; keep manual slots and autosave intact. | Cancel is a no-op; overwritten or deleted save has a tested documented recovery route, and failed writes do not destroy earlier data. |
| **P003 — Scenario constraints authoritative** | Repair · S | P071 | Check scenario policy constraints at the command boundary, especially autonomy patches and completed-scenario transitions. | Prohibited scenario policies reject with actionable reasons; no UI, import or forecast adoption bypasses those constraints. |
| **P001 — Forecast ownership and adoption integrity** | Repair · M | P071, P082 | Bind each branch to seed, source-state fingerprint, tick and ruleset; reject stale or terminal-illegal adoption; show explicit fork semantics. | Loading or changing a world invalidates old forecasts; adoption never rewinds/transplants silently and scenario terminal states remain valid. |
| **P004 — Modal/time/keyboard coherence** | Repair · M | P071 | Define pause/resume and accumulated-tick semantics; fix modal focus trap, focus return, shortcut suppression and keyboard/touch parity. | Modal entry/exit preserves intended clock speed and tick count; focused controls never accidentally run world actions; keyboard journey passes. |

**F0 integration run:**

- Run existing 54 documented tests, build and executable manual save-and-mode journeys BEFORE edits; preserve logs and v1 fixture hashes.
- Run negative tests for all illegal world changes, stale branch adoption, save overwrite/cancel and modal pause/focus transitions.
- Complete an explicit repository/branch identity check before future mutations.

## F1 — Proof factory and extensible content backbone

**Outcome:** Add browser, fuzz, replay, strategy balance, human-playtest, and release-verification mechanisms before major complexity.

**Exit:** Every later feature has a reproducible test path, release identity, historical-save fixture, measured budget, and explicit experiment stop signal.

| ID / improvement | Mode / relative effort | Prerequisites | Bounded implementation packet | Acceptance evidence |
|---|---|---|---|---|
| **P007 — Automated real-browser journeys** | Build · M | P004, P002 | Add Playwright smoke paths for new game, actions, modal input, save/load/import, comparison, scenario terminal states and touch emulation. | Chrome/Firefox/WebKit emulation paths pass on CI with failure traces; hardware-specific gaps are separately declared. |
| **P008 — Performance and lifecycle budgets** | Build · M | P007 | Repair missing tests/bench.test.ts script or replace it; measure startup, p95 frame/tick, memory growth, webgl resources and device profiles. | Reproducible baseline results exist for named scenarios/devices; regression thresholds follow measured baselines instead of guesses. |
| **P073 — Seeded property-based testing** | Build · M | P082, P071 | Generate reproducible seeded worlds and legal command sequences; exercise conservation, valid ids, ranges, migration and save continuity. | Recorded seed and command sequence reproduces each failure; all new supported fields are included in invariant testing. |
| **P072 — Deterministic civilization replay engine** | Build · L | P071, P082, P073 | Record start seed, ruleset/build identity, ordered tick-stamped commands and periodic canonical state hashes; implement replay/export and divergence reporting. | Matching engine replays reproduce checkpoint hashes and post-save continuation; incompatible rulesets fail clearly instead of giving false proof. |
| **P074 — Automated strategy tournament** | Build · M | P072 | Implement distinct legal AI strategies and a matched-seed tournament scoring resilience, welfare, ecological state, trade and outcome tradeoffs. | Outputs include seeded scenarios, win/loss matrices and statistical distribution; no one strategy dominates every environment by construction. |
| **P075 — Human playtest program** | Ongoing · M | P007 | Create repeatable uncoached tasks, consent-safe optional local diagnostics and first-session/return-session feedback rubrics; re-run at every milestone. | Track task completion, confusion points, perceived causality, enjoyment and return comprehension; revisions show before/after player evidence. |
| **P083 — Verified deployed-release identity** | Build · M | P007, P082 | Embed build SHA/ruleset, configure post-deploy smoke test and prior-build rollback; distinguish CI, hosted output and end-user verification. | Public page reports expected SHA and loads key flows; deploy receipt and rollback path are inspectable before calling release complete. |
| **P084 — Safe data-driven content contracts** | Prototype then build · L | P071, P082 | Define schema-validated content for scenarios/objectives/starting state; forbid arbitrary executable data; document licenses and contributor boundaries. | A second scenario can be added as validated data without editing engine code; malformed or malicious content is rejected offline. |

**F1 integration run:**

- Run seed/property tests, replay hash comparisons, strategy tournament and three-browser Playwright journeys; record evidence without conflating emulation with hardware.
- Record human playtest results as observations, not simulation correctness; use a bounded plan for unresolved defects.
- Require post-deploy revision readback before signing off on actual published builds.

## F2 — Runtime, graphics lifecycle, and safe offline delivery

**Outcome:** Fix avoidable work and move forecasts away from the main thread; prove graphics/device, interruptions, and offline updates.

**Exit:** Matched visual/functional quality with proven device measurements, nonblocking UI, context restoration, and safe offline/update path.

| ID / improvement | Mode / relative effort | Prerequisites | Bounded implementation packet | Acceptance evidence |
|---|---|---|---|---|
| **P005 — Stop unnecessary renderer rebuilding** | Repair · M | P008 | Diff quality-related settings and rebuild only changed resources; replace repeated cloud/sky generation when unchanged. | Nonvisual setting edits do not rebuild clouds/sky; matched visual output and resource-lifecycle measurements pass. |
| **P006 — Nonblocking strategy comparison** | Build · L | P001, P072 | Move clone/forecast processing to a Web Worker with cancellation, progress, origin/fingerprint checks and deterministic message protocol. | Ten-year forecasts do not block pointer/UI responsiveness; cancel and world changes discard stale results; branch outputs match main-engine forecasts. |
| **P077 — WebGL context-loss recovery** | Build · M | P007 | Recreate GPU resources on context restoration, suspend invalid draws and verify camera/selection state; prevent resource duplication. | Repeated synthetic loss/restore cycles re-enter gameplay with zero broken shader/texture resources and unchanged authoritative simulation. |
| **P078 — Evidence-driven rendering performance** | Build · M | P005, P008 | Optimize idle updates, DPR/effects quality, heavy globe paints and costly transitions using p95 frame and memory measurements. | Measured slow-device frame-time/lifecycle results improve without losing interactive input or critical visuals. |
| **P079 — Tab and lifecycle interruption handling** | Build · M | P004, P077 | Define visibility, audio suspend/resume, focus loss, resize and frame ownership; ensure exactly-once listeners and time handling. | After repeated tab sleep/resume and resize, tick behavior is predictable, audio does not duplicate and controls remain active. |
| **P080 — Progressive startup and chunking** | Build · M | P008 | Separate first-interaction essentials from optional visual components; lazy-init secondary panels/effects and stage cold-load rendering. | Median/p95 time to first usable interaction improves on a named constrained device; no runtime CDN or missing chunk errors. |
| **P081 — Offline installable app** | Build · M | P082, P083, P080 | Introduce PWA manifest/service worker with safe update handling, offline shell and explicit saved-data protection. | Launch works after device disconnect; update cannot silently strand prior save or serve incompatible engine assets. |

**F2 integration run:**

- Repeat named device performance profiles after each renderer/build change and verify GPU object counts after repeated context restoration.
- Open installed offline app with networking disabled and exercise a v1 save through update/restart; confirm no stale shell mismatch.

## F3 — World command and understanding interfaces

**Outcome:** Rearchitect task flow and truthful information, add accessible navigation and multiple geographic perspectives.

**Exit:** Players diagnose and act quickly in the same world on desktop, touch, keyboard and non-WebGL paths.

| ID / improvement | Mode / relative effort | Prerequisites | Bounded implementation packet | Acceptance evidence |
|---|---|---|---|---|
| **P065 — Unified planetary command center** | Build · L | P062, P007 | Consolidate urgent condition, evidence and available actions in task-oriented inspector flows while retaining deep tabs for exploration. | Representative diagnose-decide-verify journeys require fewer interactions and expose the same essential facts. |
| **P066 — Return-session memory** | Build · S | P002, P065 | Persist selected region, camera, panel, overlay, unfinished task context and session recap separately from authoritative world state. | A resumed game restores both civilization and player context; state missing or stale degrades gracefully. |
| **P069 — Attention-friendly access** | Build · M | P065 | Design optional calm and focus views, readable keyboard regional navigation, robust touch targets and reduced-stimulation parity. | Core tasks pass keyboard-only and touch-only probes without removing strategy-critical information. |
| **P070 — Known vs derived vs predicted information** | Build · M | P065, P072 | Add provenance labels and horizon/assumption metadata for UI figures and forecasts; disallow fabricated confidence. | Every predicted claim identifies rule basis/time horizon and is visibly distinct from observed stock and deterministic arithmetic. |
| **P025 — Live dependency network** | Build · M | P070 | Compute derived infrastructure/resource dependence from real flows and route connectivity; highlight dependencies and failure effects in selected regions. | Removing a link in a cloned test world creates explainable effects consistent with the displayed graph; no invented causal arrows. |
| **P068 — Visual truth contract** | Build · M | P070 | Codify data-to-visual rules for settlement wealth, shipment activity, route condition, crises, conservation and night lighting. | Seeded screenshot/state fixtures detect important contradictions between map, visuals, and numerical inspectors. |
| **P067 — Synchronized globe and atlas** | Prototype then build · L | P065, P068 | Add optional projected 2D atlas sharing regional IDs, selections, overlays, navigation and build/route tools with 3D globe. | Cross-world route tasks become measurably easier; both views share one state and remain synchronized after mode and save changes. |
| **P033 — Full non-WebGL strategic interface** | Build · L | P065, P069 | Provide a first-class accessible region/settlement/route/action UI consuming authoritative commands without renderer dependence. | Representative scenario can be completed via keyboard/screen reader with WebGL disabled, including save/load and core tools. |

**F3 integration run:**

- Run timed diagnose/decide/verify journeys with desktop mouse, keyboard, touch emulation and physical devices when available.
- Compare 2D/3D/fallback representations to authoritative regional data and ensure equivalent command validation.

## F4 — Compelling short-loop gameplay

**Outcome:** Improve initial choices, placement, urgency, emergency transport, temporary labor, stockpiling and time management.

**Exit:** First-session players encounter real choices in the first 24 months; each intervention has measurable consequence.

| ID / improvement | Mode / relative effort | Prerequisites | Bounded implementation packet | Acceptance evidence |
|---|---|---|---|---|
| **P035 — Compelling first 24 months** | Build · M | P074, P075 | Offer opt-in starter situations presenting a real food, transport or resource problem with several solutions; keep free Sandbox. | Human players encounter a consequential choice early, and at least three winning openings are validated by simulation. |
| **P036 — Three consequential landing sites** | Build · S | P035, P061 | Generate or curate three viable but economically distinct initial expedition sites with readable constraints. | Matched playthroughs show distinct first-decade strategy, not merely different cosmetics, with no dead-end starts. |
| **P037 — Strategic opportunity board** | Build · S | P025, P035 | Derive a maximum of three prioritized, clickable needs/opportunities from existing stock, settlement and network data. | Every recommended action has valid target, evidence, payoff/tradeoff and a route to completion; no impossible suggestions. |
| **P038 — Construction-site comparison** | Build · M | P061, P065 | Preview several valid placements with shared farm/ore/transport formulas and environmental/maintenance costs. | A comparative site view agrees with authoritative production formulas and exposes meaningful alternatives. |
| **P032 — Advance until event** | Build · S | P004, P071 | Allow deterministic bounded tick advancement until construction, arrival, shortage, objective or cancel, with terminal scenario checks each tick. | Stops at exact first qualifying tick, never skips terminal states and is cancelable mid-run. |
| **P039 — Policy change inertia** | Prototype then build · M | P003, P071 | Introduce opt-in policy transition latency and costs for Challenge while preserving instant Sandbox policy edits. | Toggle cannot be spammed to bypass tradeoffs; challenges stay solvable, and each transition has visible consequences. |
| **P041 — One-off emergency shipments** | Build · M | P071, P025 | Add explicit sourced dispatch with sender, receiver, amount, capacity, travel delay, loss and ledger-accounted transfer. | Donor stock and in-transit amounts reconcile; cargo does not teleport, duplicate or exceed route capacity. |
| **P043 — Temporary labor mobilization** | Build · M | P071 | Introduce time-limited workforce allocation with explicit output gain and opportunity cost for other production/wellbeing. | Boost expires on schedule; consumed labor/costs reconcile and cannot be permanently stacked for free. |
| **P044 — Seasonal reserve planning** | Build · M | P043, P037 | Offer monthly seasonal reserve targets and warnings from current climate/consumption, with explicit storage and spoilage costs. | Strong planning helps under matched seasonal shortages but surplus hoarding has rational opportunity costs. |

**F4 integration run:**

- Conduct an uncoached first-five-minute and first-24-month playtest; record multiple viable opening plans.
- Test direct shipment, temporary labor, seasonal targets and clock controls with seeded conservation and terminal-state checks.

## F5 — Emergent communities and agreements

**Outcome:** Make settlement values, petitions, commitments, negotiations, promises, specialization and autonomy playable.

**Exit:** Distinct communities demonstrably respond differently to identical player choices, with sustainable deterministic accounting.

| ID / improvement | Mode / relative effort | Prerequisites | Bounded implementation packet | Acceptance evidence |
|---|---|---|---|---|
| **P046 — Condition-based petitions** | Build · M | P037, P071 | Generate settlement petitions from real needs and social values; provide fund, modify or decline decisions via commands. | Every petition is grounded in state, is satisfiable or explicitly impossible, and its consequence enters relations/events. |
| **P047 — Social values change behaviors** | Build · L | P046 | Deepen growth/conservation/trade value rules governing local construction, extraction priorities and agreements. | Matched worlds with distinct values show different legal behavior, and values change in response to lived conditions. |
| **P012 — Negotiated stewardship** | Prototype then build · L | P047, P071 | Replace unconditional unilateral intervention for selected actions with local responses, acceptance, adaptation or resistance; keep valid Sandbox variants. | Community reactions reflect needs and values; at least two negotiation outcomes cause genuinely different states without arbitrary blockers. |
| **P023 — Commons charter** | Prototype then build · L | P012 | Add voluntary joint reserves/transport/environment projects with contribution obligations, exit and renewal rules. | Shared institution creates a feasible benefit unavailable to isolated participants, accounting for all participant contributions. |
| **P024 — Unequal-prosperity metrics** | Build · S | P065 | Show population-weighted wellbeing distribution, smallest-community risk and share facing shortage, not only averages. | Two worlds with similar averages but different hardship are visibly distinguished with a useful policy response. |
| **P042 — Scheduled trade commitments** | Build · M | P041, P023 | Create bounded bilateral shipment commitments with duration, reserve safety and renegotiation/shortfall outcomes. | Commitments change real stock, trade and relations and never silently force negative inventory or false guaranteed delivery. |
| **P048 — Promise clock** | Build · M | P046, P071 | Offer opt-in measurable time-limited stewardship goals with visible progress and state-grounded consequences. | Evaluation is deterministic, deadlines exact, and invalid promises cannot be accepted or completed through trivial exploits. |
| **P049 — Local autonomy trial** | Build · M | P047, P048 | Run one selected community autonomously for a bounded period with transparent start/end and optional continuation. | Trial respects all command restrictions, records outcomes and produces no hidden player interventions. |
| **P045 — Settlement specialization paths** | Prototype then build · L | P047 | Make existing agrarian/fishing/mining/energy/trade identities into earned local options with strengths, limits and transitions. | Different regional archetypes choose different viable paths; no path is always superior under all seeds. |

**F5 integration run:**

- Execute matched-pair social simulations with distinct values and equivalent geography; inspect emergent decision divergence.
- Verify petition/charter/contract/promises never invent resources or bypass local-agency constraints.

## F6 — Physical-planet economics and exploration

**Outcome:** Build physically grounded watershed, land use, circularity, energy, ecosystem, climate, hazard, worlds and surveys behind isolated gates.

**Exit:** Every new field has units, bounded behavior, conservation/invariant tests, measured tick cost and migrated saves.

| ID / improvement | Mode / relative effort | Prerequisites | Bounded implementation packet | Acceptance evidence |
|---|---|---|---|---|
| **P015 — Watershed interdependence** | Prototype then build · XL | P061, P082 | Use generated downhill/flow topology for area-aware upstream supply, downstream withdrawals, reservoir controls and pollutant transfer with aggregate mass ledger. | Two-region diversion alters downstream outcomes predictably, no water creation/negative stocks, and runtime budget holds. |
| **P027 — Regional land-use allocation** | Prototype then build · L | P061 | Add bounded land-use fractions/capacity across cultivation, habitat, extraction and settlement functions rather than literal plots. | Land fractions never exceed availability, regional production changes with allocation, and existing buildings migrate safely. |
| **P017 — Circular material economy** | Build · L | P082, P027 | Record material embedded in structures, salvage, repair and recycling with labor/energy costs and bounded yields. | Long-run ore/timber accounting reconciles; demolition and repair cannot manufacture net finite materials. |
| **P016 — Regional energy portfolios** | Prototype then build · XL | P017, P061 | Evolve energy production to regional solar/wind/hydro/biomass with seasonal availability, storage bounds and cost/land tradeoffs. | Different climates favor different portfolios; no free energy from upgrades and existing save tech semantics migrate correctly. |
| **P018 — Functional ecosystems** | Prototype then build · XL | P015, P027 | Add small functional groups for habitat, pollination/soil and aquatic health; propagate consequences via existing production/ecology. | Restoration and degradation have delayed local plus neighbor effects; bounded system avoids agent-per-animal simulation. |
| **P019 — Climate inertia** | Prototype then build · XL | P018, P016 | Introduce documented toy-model cumulative forcing from industry/land changes, delayed climate-response fields and bounded ecological feedback. | Matched policy runs diverge over decades with stable coefficients, reversible assumptions and no unsupported real-world prediction claims. |
| **P013 — Visible ecological feedback** | Build · L | P068, P018, P019 | Map simulation changes in habitat, ecological stress and long-run climate to physically legible shaders/regions without cosmetic lies. | Seeded time checkpoints change regional visuals with data; overlays, inspector and globe agree. |
| **P030 — Disaster preparedness** | Build · M | P019, P037 | Expose rule-grounded hazard risk and fund pre-event mitigation, supplies and response readiness at real resource costs. | Prepared communities fare better on matched seeded events without removing risk or fabricating predictive certainty. |
| **P063 — Playable procedural-world profiles** | Build · M | P036, P030 | Measure seed viability, isolation, scarce resources and trade opportunities and classify generated planets; don't silently change supplied seeds. | Profile labels correlate with measurable starting characteristics and produce distinct viable runs. |
| **P028 — Survey mode** | Prototype then build · M | P063, P070 | Hide selected precise world information in an optional mode; fund surveys/expeditions to reveal deterministic existing facts. | Survey results reveal the same underlying world without changing its random state; information can alter a real decision. |

**F6 integration run:**

- Individually prototype hydrology, land allocation, energy, ecology and climate; cap each by measured tick/save-memory budgets before integrating.
- Run cross-system accounting, environmental plausibility, old-save migrations and visually faithful region checks.

## F7 — Long-horizon planning and interregional life

**Outcome:** Add demographic generations, in-transit migration, local knowledge, project queues, route choices, resilience and Great Works.

**Exit:** Years 20-100 introduce decisions unlike year 1 while populations, resource flows and project commitments remain coherent.

| ID / improvement | Mode / relative effort | Prerequisites | Bounded implementation packet | Acceptance evidence |
|---|---|---|---|---|
| **P020 — Demographic cohorts** | Prototype then build · XL | P082, P024 | Add aggregate child, working-age, elder population compartments with migration, cohort transitions, labor and mortality impacts. | Birth/death/aging/migration population conservation holds and long-tail shock effects are observable, without per-person agents. |
| **P021 — Population in transit** | Build · L | P020, P041 | Represent migrant cohorts/cargo traveling along real routes with delay and arrival capacity; account for in-transit population. | Population never teleports/doubles; endpoints and long-range routes enforce travel, housing and supply constraints. |
| **P022 — Local knowledge diffusion** | Prototype then build · XL | P020, P045 | Represent local technology discovery/adoption and diffusion through networks and movement while separating knowledge from build costs. | Research isn't instantly global; transmission routes and adoption constraints are deterministic and save compatible. |
| **P029 — Century planning queue** | Build · L | P038, P042 | Create time-ordered project prerequisites, funding escrow/commitments and reprioritization with blockers and cancellation. | Multi-year plan executes only valid funded commands and survives saves without overspending or orphaned jobs. |
| **P040 — Alternative route planning** | Prototype then build · L | P025, P029 | Expose 2-3 viable land/sea routes with travel/capacity/cost choices and clear routing recomputation rules. | At least two valid route choices produce measurable tradeoffs in suitable test seeds, with maintained route correctness. |
| **P026 — Infrastructure resilience drills** | Build · M | P029, P040 | Define redundancy/reserve metrics; use disposable clones for deterministic test outages and compare outcomes against baseline. | Resilient networks outperform cheap single-source ones under matched shocks while incurring a measurable upkeep cost. |
| **P055 — Multi-settlement Great Works** | Prototype then build · L | P023, P026 | Add selected long-horizon shared projects with multi-settlement contributions, staged dependencies and unique strategic payoff. | A Great Work introduces real new capability, tracks contributions, and remains completable without exploits/softlocks. |

**F7 integration run:**

- Verify cohorts+migration+project commitments conserve entities and resources across 100-year seeded runs.
- Demonstrate late-game distinct decision choices without an obligatory micromanagement burden.

## F8 — Cascading crises, memory, causality, and expression

**Outcome:** Enrich disasters, recovery, evidence-backed causal reading, historical snapshots, dual forecasts, audio and visual identities.

**Exit:** Crises create recoverable dilemmas, recorded history matches simulation, branch comparisons are valid and visual/audio output is truthful.

| ID / improvement | Mode / relative effort | Prerequisites | Bounded implementation packet | Acceptance evidence |
|---|---|---|---|---|
| **P050 — Three-stage crises** | Build · L | P030, P071 | Turn selected crises into containment, ongoing management and recovery with state-derived transition points and distinct interventions. | Equivalent crises with different responses diverge measurably while core scenarios remain winnable. |
| **P051 — Cascading crises** | Build · M | P050, P025 | Connect drought, labor, shortages, migration and relationships into explainable bounded escalation chains with player interrupt opportunities. | At least two causal links are reproducible and preventable; runaway unbounded cascades are prohibited. |
| **P052 — Conflicting humanitarian commitments** | Build · M | P051, P041 | Provide rare scarcity decision situations with several valid resource allocations and explicit downstream tradeoffs. | There is no scripted mandatory moral choice; two defensible resource distributions lead to distinct outcomes. |
| **P053 — Spatial wildfire containment** | Prototype then build · L | P050, P015 | Allow selecting regional fire-containment arcs/neighbor cells with labor/material cost and actual spread prevention. | Topology-aligned perimeter choices affect simulated spread proportionally to capacity/cost, not decorative lines. |
| **P054 — Post-crisis reconstruction paths** | Build · M | P050, P027 | Add reconstruct/relocate/restore decisions after severe damage with distinct infrastructure and ecology effects. | At least two post-crisis recovery paths change real resources and trajectory; no free restoration. |
| **P009 — Grounded causal lens** | Build · L | P025, P072, P051 | Introduce causal claims only where deterministic ledger/state links support them; flag correlations and unknown causes separately. | A sampled major event has exact contributions traced to authoritative factors; no invented explanatory narrative. |
| **P010 — Bounded planetary memory** | Prototype then build · XL | P009, P072 | Capture sparse event/snapshot index anchored to places and months, with bounded memory/save growth and reconstructible chronology. | Travel to an earlier dated world state or supported snapshot without changing present play; 25-year records stay within budget. |
| **P011 — Dual-world counterfactual** | Prototype then build · XL | P006, P009, P010 | Render/source-bound comparison of two identical-origin simulation branches with explicit policy deltas and matched horizons. | Branch provenance preserved, both futures deterministic, and charts/globes avoid unsupported causal certainty. |
| **P014 — Functional audiovisual identity** | Build · M | P068, P079, P050 | Define game-wide sound/visual cue vocabulary for action, loss, forecast, opportunity, danger and success with quiet accessibility alternatives. | Cues map to real states, are perceptually tested, and behave under mute/reduced-motion/tab lifecycle. |
| **P076 — Visually distinct regional civilizations** | Prototype then build · L | P045, P068, P055 | Procedurally compose region-scale silhouettes from actual settlement size, specialization, condition and infrastructure state. | Settlements with comparable populations but different identities look distinguishable without depicting nonexistent infrastructure. |

**F8 integration run:**

- Run disaster initial/action/outcome fixtures, provenance checks for explanations, time-index history integrity and independent branch forecast parity.
- Review actual sound playback and accessible visual alternatives; compare visual identity against simulation data.

## F9 — Scenarios, mastery modes, and civilizational payoff

**Outcome:** Expand viable success approaches, create short puzzles/campaign/forge and prove hands-off and sparse-intervention modes.

**Exit:** Alternative victories and modes are testable, can finish cleanly and preserve the original sandbox/scenario/observer/challenge experience.

| ID / improvement | Mode / relative effort | Prerequisites | Bounded implementation packet | Acceptance evidence |
|---|---|---|---|---|
| **P056 — Multiple victory strategies** | Build · M | P050, P074 | Expand selected scenarios with separately validated objective routes (trade, restoration, production, etc.) and comparable difficulty. | Each path is winnable via legal commands on both difficulties and produces nontrivial strategic variance. |
| **P058 — Handcrafted short strategy puzzles** | Build · M | P056, P084 | Author at least ten fixed-seed constrained puzzle states with clear wins/fails and near-immediate gameplay. | Ten distinct puzzles have validated solutions, no degenerate bypasses and replayable restarts. |
| **P057 — Optional scenario campaign** | Build · M | P056, P058 | Sequence existing scenarios with clear mastery progression and safe optional carry-forward constraints; preserve standalone versions. | Campaign can finish end-to-end; legacy rules have deterministic source and standalone missions still work. |
| **P031 — Player Scenario Forge** | Build · L | P084, P056 | Expose validated scenario settings and bounded objective templates, offline JSON export/import and solvability checks; never accept arbitrary JS. | User-created scenarios load/replay deterministically; invalid and trivial/unwinnable definitions are flagged. |
| **P034 — Relinquish Stewardship endgame** | Prototype then build · M | P026, P049, P072 | Offer a committed hands-off 100-year evaluation using real autonomous decisions and resilience/welfare metrics. | Player can relinquish control and observe unbiased unscripted outcomes; seeds/replays establish provenance. |
| **P059 — Limited Intervention Window mode** | Prototype then build · M | P034, P032 | Add mode with one bounded intervention phase every five simulated years; simulate autonomously between decision points. | Window timing, command budget and autonomy restrictions are exact; multiple viable successful plays exist. |
| **P060 — Three ages of stewardship** | Prototype then build · XL | P034, P057, P062 | Introduce coherent foundation/interdependence/maturity phases tied to meaningful new types of decisions, not arbitrary unlock inflation. | Human playtest finds different decisions in years 5, 30 and 100; all original modes still work independently. |
| **P064 — Meaningful civilizational recovery** | Build · L | P020, P054, P060 | Analyze and rebalance collapse/recovery loops; permit costly recovery from viable conditions and clearly signal truly unrecoverable states. | Matched runs show multiple recovery routes without magical stock injections or mathematically inevitable collapse for viable worlds. |

**F9 integration run:**

- Prove all new/old mode combinations, alternative wins and puzzle restarts without violating saved-state or scenario exit conditions.
- Human playtest late-game closure and replayability; do not confuse a prototype screenshot with a validated mode.

## Integration graph / nonobvious dependencies

- `P071 → P082 → P072 → P074` forms the trust/replay/balance backbone; do **not** postpone data compatibility until after simulation expansion.
- `P007 + P008 → P005/P006/P077/P078/P079/P080/P081` moves runtime claims from source intuition to verified user/device evidence.
- `P062 + P065 + P070 + P025 + P068 → P009/P010/P011` puts proof-driven causal communication ahead of storytelling polish.
- `P046/P047 → P012/P023 → P042/P055` keeps negotiation and shared institutions tied to real community needs and conserved resources.
- `P061 + P015/P027/P017/P016/P018/P019 → P013/P030/P063/P028` gives the physical-planet expansion one scale/units model; isolate climate as a documented fictional approximation.
- `P020/P021/P022 + P029/P040/P026 → P034/P059/P060/P064` supports viable hands-off evaluation, late-game agency and recovery without hardcoded outcomes.
- `P084 + P056 → P031/P058/P057` separates data-driven scenario rules from the player-facing Scenario Forge and curated content.
- `P033` is established as a real interface in F3 and must receive parity checks for **every** later command; it cannot be declared done permanently while the engine changes.

## Prototype gates for the riskiest features

| Risk class | Proposals | Smallest evidence-gathering experiment | Stop or redesign signal |
|---|---|---|---|
| Mass conservation and geometry | P015, P017, P027 | 3-10 adjacent regions with known stocks, withdrawals, costs and flows, 120 monthly ticks | Mass balance breaks, no meaningful alternative strategy or excessive tick cost |
| Cross-system simulation explosion | P016, P018, P019, P020, P021, P022 | Headless one-planet 100-year matched runs with new fields enabled individually | Non-finite/negative state, runaway positive feedback, incompatible saves, unbounded complexity |
| Community autonomy and player agency | P012, P023, P045, P047, P049 | Two culturally different communities, one shared resource issue and 2-3 legal player interventions | Outcomes are scripted/arbitrary, unplayable or indistinguishable |
| Spatial/visual scale | P061, P067, P076, P053 | Three geographically distinct cases at representative camera ranges and on mobile | Player misreads represented scale, key actions inaccessible or GPU budget fails |
| Historical replay and false certainty | P009, P010, P011, P072 | Two policies applied at same tick to shared seed, replay every 12 ticks, check state hashes | Branch mismatches, explanation invented, or memory/save costs exceed declared budget |
| Complex modes and late-game loops | P034, P059, P060, P064 | 100-year deterministic hands-off and sparse-intervention match, with human playtest | Challenge collapses to one dominant recipe, offers no agency, or produces unavoidable decline |
| Browser lifecycle and updates | P077, P081, P082, P083 | Synthetic context loss, offline launch, upgrade-from-v1 and hosted-build readback | Stale JS operates on newer save schema, recovery corrupts data or public build is unverifiable |

**Advance criterion for prototypes:** observed positive new decision/experience, invariants pass, performance/memory stay within measured budgets, and no violation of existing modes or save continuity. If not, iterate one bounded prototype revision and escalate an explicit KEEP/REVISE/REJECT decision. Do not mark as shipped.

## Universal per-item definition of done

- Implementation matches the named packet and is demonstrably accessible in the real game; experimental rows carry an explicit prototype or approved revised variant.
- Appropriate unit/invariant/property tests, deterministic seed/replay comparison and old-save continuity pass. No regression to scenario success/failure, Observer restrictions, core navigation or player data.
- UI, globe, atlas, accessibility fallback, tooltip/forecast metadata and audio alternatives remain consistent for affected systems.
- Bounded device performance, memory and startup comparisons are recorded **from an actual instrumented runtime**, not extrapolated from source code or hidden-frame GPU timing.
- Independent fresh browser walkthrough passes the changed user journey. The published product is identified separately from repository/build state.
- Changes remain scoped and reversible; a PR/change packet includes what changed, why, source touched, test report, migration/recovery steps, and any explicit unknowns.
- Update `OPERATIONAL_STATE.md`, feature ledger/status, tests and documentation after a verified implementation unit. Never convert planned or coded-only work into verified gameplay.

## Branch and release discipline

- One bounded work packet / pull request at a time, normally 1-3 closely coupled proposal IDs. Capture HEAD and dirty state immediately before mutations; protect ongoing user changes and fork from a clean known source.
- For simulation edits, first record before-state fixture hashes and old-save fixtures. Implement through authoritative commands; increment save schema for persisted shape changes and engine ruleset for behavior changes. Rebuild the replay oracle if semantics explicitly change, never rewrite historic proof silently.
- Use feature flags for major experimental systems and preserve baseline Sandbox while prototypes evolve. Reject PRs mixing large engine changes with unrelated visual rewrites.
- After each packet: typecheck + tests + fuzz subset + scenario scripts + browser smoke + visual checks as impacted + benchmark delta. Run full suite and save compatibility before any release candidate.
- Stage deployment through preview/staging where possible. Only publish when explicit authority is given; then prove the served SHA, smoke-test, and retain rollback. A successful commit/push is not deployment verification.
- If a candidate feature becomes too expensive or produces no extra meaningful decisions, freeze it as evidence-backed research. Require a project decision before replacing the 84-item contract with a downgraded scope.

## Staffing and size interpretation

Primary hats, not assumptions about the team: **simulation/economy**, **Three.js/rendering**, **UX/accessibility**, **content/design**, and **QA/release**. One person can hold several hats, but each packet needs one accountable implementer and one distinct verification role/check. Estimate effort *after* F1 benchmarks and 1-2 pilot PRs; S/M/L/XL are relative complexity classes, not invented calendar dates. This is a multi-release, substantial project, not a single change or one-sprint task.

## Immediate next approved work packet — only if implementation is explicitly requested

1. Confirm current Git HEAD, working-tree cleanliness or user changes and build/test environment; preserve any uncommitted work.
2. Read `OPERATIONAL_STATE.md`, exact `main` files and v1 save fixtures; collect pre-change smoke, test and benchmark baseline.
3. Implement **F0-A**: `P061` scope/units contract, `P062` action audit and `P071` authoritative mutation boundary **only**. Write regression tests and a narrow compatible API, without changing player-visible mechanics unless necessary to correct an invalid action path.
4. Implement **F0-B** only after F0-A proof: `P082/P002/P003/P001/P004` in individual bounded patches. Validate existing content, save migration and mode behavior after each.
5. Report changed files, tests run/omitted, performance baseline, unresolved blockers and proposal status. Stage/commit/push/deploy only with separate explicit authorization.

## Requirement reconciliation

- **Coverage:** 84 unique proposal IDs, uninterrupted `P001` through `P084`; no duplicates or omissions. Each has implementation and acceptance cells.
- **Distribution:** F0=8, F1=8, F2=7, F3=8, F4=9, F5=9, F6=10, F7=7, F8=10, F9=8.
- **Execution posture:** 60 build/audit/repair packets, 23 bounded prototype-first packets, 1 continuous playtesting program. None is silently deferred out of the plan.
- **Original user request:** build a plan to implement *each* improvement discussed in the chapter. **Plan status: complete; actual code implementation status: not started by this task.**

## Key external mechanism references (not claims of World Machine test results)

- [Factorio: Deterministic save/load](https://www.factorio.com/blog/post/fff-270) — caution on command-time replay and save continuation equivalence.
- [Playwright projects and device matrices](https://playwright.dev/docs/test-projects) — browser engine and mobile-emulation coverage; real-device tests remain separate.
- [MDN: WebGL context restoration](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextrestored_event) — invalid GPU resources must be recreated after restoration.

**Final handling:** This document is planning evidence only. It changes no repository, GitHub Pages deployment, or user game save.
