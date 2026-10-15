# THE WORLD MACHINE — 84-ITEM EXECUTION AND ACCEPTANCE LEDGER

**Version:** 2026-10-15. **Repository:** https://github.com/westkitty/World_Machine. **Planning baseline:** `cc1eb5f0218c41ac094ed13d597492e407d3e59d` (this is a *reference*, not a demand to reset newer work). **Authority:** companion to `WORLD_MACHINE_84_PROPOSAL_IMPLEMENTATION_MASTERPLAN.md`. **Status:** every item PLANNED; no implementation completion claims.

## How Anti-Gravity must operate this ledger

1. The master plan owns sequencing, architectural invariants, and full exit criteria. This ledger owns exact proposal inventory, work packets, prerequisites, statuses and acceptance checks.
2. Follow the rows in phase order F0→F9, and within each phase in the listed order. Do not sort by proposal number because the dependency order is intentionally different.
3. For each row, complete the bounded implementation described below, execute the stated acceptance check, and collect real evidence. A passing typecheck alone cannot prove browser interaction or visuals. A prototype passing its experiment is not a shipped feature until it has been integrated and tested.
4. Use statuses `PLANNED`, `IN_PROGRESS`, `PROTOTYPE_PASSED`, `IMPLEMENTED_UNVERIFIED`, `VERIFIED_LOCAL`, `VERIFIED_BROWSER`, `RELEASE_VERIFIED`, or `BLOCKED`. Record the commit/branch, test results, and rationale. Do not invent outcomes.
5. Record implementations in a separate run ledger under `docs/implementation/` in the actual repo; do not retroactively edit this frozen proposal inventory to fabricate progress. Protect and update `OPERATIONAL_STATE.md` according to actual verified changes.
6. Before working on any row, check prerequisites using the run ledger and tests; a prior row is a dependency only when a functioning interface and relevant evidence exist, not when someone said it was done.
7. A row requiring new persistent state must ship a versioned migration and old-save continuation tests. A row introducing a new user-facing command must ship authority, keyboard/touch/fallback parity tests. A row changing renderer behavior needs real graphics validation and resource lifecycle verification.
8. When a gate cannot be verified, record `BLOCKED` or `IMPLEMENTED_UNVERIFIED` and stop that dependent chain. Independent documentation work may continue, but no untested changes may be pushed.

## Canonical regression gate (applies to every item)

- Preserve the spherical, deterministic 642-region simulation; established world generation, economy conservation, trade, migration, society, Observer restrictions, four modes, five scenarios, camera, controls, procedural audio, and accessibility.
- Preserve v1 saved worlds, three manual slots, yearly autosave, JSON import/export, seeded continuity, and user data. No upgrade may silently delete or rewrite a saved civilization.
- Commands remain authoritative, provenance is explicit for forecasts and history, and presentation never mutates gameplay state.
- Run `bun run typecheck`, `bun run test`, `bun run build`; when present, browser journeys (`bun run test:e2e`) and relevant deterministic property/save/benchmark suites. Replace documented-only test counts with actual fresh results.
- Create a reversible Git checkpoint on a feature branch, stage only intended changed paths, commit only after the gate passes, push only the same tested SHA, and never force-push or reset away a user's work.
- Treat GitHub Pages verification as separate from a successful push or workflow. Pushing `main` would trigger publication and is outside the default feature-branch execution contract.

## Exact coverage and acceptance packets

### F0: 8 required proposals

#### P061 — Geographic scale contract

- **Status:** `PLANNED`
- **Route/effort:** Build · L
- **Prerequisites:** Baseline
- **Required implementation:** Define regional-community, land-area, building, distance and visual-scale units; document the 642-cell abstraction and align formulas, inspector wording and representative visuals.
- **Pass condition:** Every spatial mechanic has a named unit and representative coastal, inland and island examples agree across the simulation, UI and globe.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P062 — Meaningful-intervention design audit

- **Status:** `PLANNED`
- **Route/effort:** Audit and revise · M
- **Prerequisites:** Baseline
- **Required implementation:** Inventory existing actions; record choice, alternatives, cost, delayed effect and feedback; consolidate redundant actions without changing core gameplay.
- **Pass condition:** For every major action document when it is preferable, when an alternative is preferable, and how the player learns the outcome.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P071 — Single authoritative mutation path

- **Status:** `PLANNED`
- **Route/effort:** Build · L
- **Prerequisites:** P062
- **Required implementation:** Unify command validation, mode/scenario authority, rule-setting, forecast adoption and world replacement behind explicit transaction/lifecycle interfaces; eliminate UI direct writes.
- **Pass condition:** Static audit finds no unsupported UI state mutations; invalid commands and failed loads leave state byte-identical.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P082 — Versioned save compatibility

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P071
- **Required implementation:** Strengthen nested state validation; create historical v1 fixtures and migrations with versioned rulesets; verify import/export/slots before new persistent fields.
- **Pass condition:** All v1 fixtures load and continue correctly; malformed saves fail without replacing active state; future schema changes require migration tests.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P002 — Save overwrite/delete protection

- **Status:** `PLANNED`
- **Route/effort:** Build · S
- **Prerequisites:** P082
- **Required implementation:** Add overwrite/delete confirmation and an undo/backup or export recovery path; keep manual slots and autosave intact.
- **Pass condition:** Cancel is a no-op; overwritten or deleted save has a tested documented recovery route, and failed writes do not destroy earlier data.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P003 — Scenario constraints authoritative

- **Status:** `PLANNED`
- **Route/effort:** Repair · S
- **Prerequisites:** P071
- **Required implementation:** Check scenario policy constraints at the command boundary, especially autonomy patches and completed-scenario transitions.
- **Pass condition:** Prohibited scenario policies reject with actionable reasons; no UI, import or forecast adoption bypasses those constraints.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P001 — Forecast ownership and adoption integrity

- **Status:** `PLANNED`
- **Route/effort:** Repair · M
- **Prerequisites:** P071, P082
- **Required implementation:** Bind each branch to seed, source-state fingerprint, tick and ruleset; reject stale or terminal-illegal adoption; show explicit fork semantics.
- **Pass condition:** Loading or changing a world invalidates old forecasts; adoption never rewinds/transplants silently and scenario terminal states remain valid.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P004 — Modal/time/keyboard coherence

- **Status:** `PLANNED`
- **Route/effort:** Repair · M
- **Prerequisites:** P071
- **Required implementation:** Define pause/resume and accumulated-tick semantics; fix modal focus trap, focus return, shortcut suppression and keyboard/touch parity.
- **Pass condition:** Modal entry/exit preserves intended clock speed and tick count; focused controls never accidentally run world actions; keyboard journey passes.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

### F1: 8 required proposals

#### P007 — Automated real-browser journeys

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P004, P002
- **Required implementation:** Add Playwright smoke paths for new game, actions, modal input, save/load/import, comparison, scenario terminal states and touch emulation.
- **Pass condition:** Chrome/Firefox/WebKit emulation paths pass on CI with failure traces; hardware-specific gaps are separately declared.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P008 — Performance and lifecycle budgets

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P007
- **Required implementation:** Repair missing tests/bench.test.ts script or replace it; measure startup, p95 frame/tick, memory growth, webgl resources and device profiles.
- **Pass condition:** Reproducible baseline results exist for named scenarios/devices; regression thresholds follow measured baselines instead of guesses.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P073 — Seeded property-based testing

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P082, P071
- **Required implementation:** Generate reproducible seeded worlds and legal command sequences; exercise conservation, valid ids, ranges, migration and save continuity.
- **Pass condition:** Recorded seed and command sequence reproduces each failure; all new supported fields are included in invariant testing.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P072 — Deterministic civilization replay engine

- **Status:** `PLANNED`
- **Route/effort:** Build · L
- **Prerequisites:** P071, P082, P073
- **Required implementation:** Record start seed, ruleset/build identity, ordered tick-stamped commands and periodic canonical state hashes; implement replay/export and divergence reporting.
- **Pass condition:** Matching engine replays reproduce checkpoint hashes and post-save continuation; incompatible rulesets fail clearly instead of giving false proof.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P074 — Automated strategy tournament

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P072
- **Required implementation:** Implement distinct legal AI strategies and a matched-seed tournament scoring resilience, welfare, ecological state, trade and outcome tradeoffs.
- **Pass condition:** Outputs include seeded scenarios, win/loss matrices and statistical distribution; no one strategy dominates every environment by construction.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P075 — Human playtest program

- **Status:** `PLANNED`
- **Route/effort:** Ongoing · M
- **Prerequisites:** P007
- **Required implementation:** Create repeatable uncoached tasks, consent-safe optional local diagnostics and first-session/return-session feedback rubrics; re-run at every milestone.
- **Pass condition:** Track task completion, confusion points, perceived causality, enjoyment and return comprehension; revisions show before/after player evidence.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P083 — Verified deployed-release identity

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P007, P082
- **Required implementation:** Embed build SHA/ruleset, configure post-deploy smoke test and prior-build rollback; distinguish CI, hosted output and end-user verification.
- **Pass condition:** Public page reports expected SHA and loads key flows; deploy receipt and rollback path are inspectable before calling release complete.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P084 — Safe data-driven content contracts

- **Status:** `PLANNED`
- **Route/effort:** Prototype then build · L
- **Prerequisites:** P071, P082
- **Required implementation:** Define schema-validated content for scenarios/objectives/starting state; forbid arbitrary executable data; document licenses and contributor boundaries.
- **Pass condition:** A second scenario can be added as validated data without editing engine code; malformed or malicious content is rejected offline.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

### F2: 7 required proposals

#### P005 — Stop unnecessary renderer rebuilding

- **Status:** `PLANNED`
- **Route/effort:** Repair · M
- **Prerequisites:** P008
- **Required implementation:** Diff quality-related settings and rebuild only changed resources; replace repeated cloud/sky generation when unchanged.
- **Pass condition:** Nonvisual setting edits do not rebuild clouds/sky; matched visual output and resource-lifecycle measurements pass.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P006 — Nonblocking strategy comparison

- **Status:** `PLANNED`
- **Route/effort:** Build · L
- **Prerequisites:** P001, P072
- **Required implementation:** Move clone/forecast processing to a Web Worker with cancellation, progress, origin/fingerprint checks and deterministic message protocol.
- **Pass condition:** Ten-year forecasts do not block pointer/UI responsiveness; cancel and world changes discard stale results; branch outputs match main-engine forecasts.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P077 — WebGL context-loss recovery

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P007
- **Required implementation:** Recreate GPU resources on context restoration, suspend invalid draws and verify camera/selection state; prevent resource duplication.
- **Pass condition:** Repeated synthetic loss/restore cycles re-enter gameplay with zero broken shader/texture resources and unchanged authoritative simulation.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P078 — Evidence-driven rendering performance

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P005, P008
- **Required implementation:** Optimize idle updates, DPR/effects quality, heavy globe paints and costly transitions using p95 frame and memory measurements.
- **Pass condition:** Measured slow-device frame-time/lifecycle results improve without losing interactive input or critical visuals.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P079 — Tab and lifecycle interruption handling

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P004, P077
- **Required implementation:** Define visibility, audio suspend/resume, focus loss, resize and frame ownership; ensure exactly-once listeners and time handling.
- **Pass condition:** After repeated tab sleep/resume and resize, tick behavior is predictable, audio does not duplicate and controls remain active.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P080 — Progressive startup and chunking

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P008
- **Required implementation:** Separate first-interaction essentials from optional visual components; lazy-init secondary panels/effects and stage cold-load rendering.
- **Pass condition:** Median/p95 time to first usable interaction improves on a named constrained device; no runtime CDN or missing chunk errors.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P081 — Offline installable app

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P082, P083, P080
- **Required implementation:** Introduce PWA manifest/service worker with safe update handling, offline shell and explicit saved-data protection.
- **Pass condition:** Launch works after device disconnect; update cannot silently strand prior save or serve incompatible engine assets.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

### F3: 8 required proposals

#### P065 — Unified planetary command center

- **Status:** `PLANNED`
- **Route/effort:** Build · L
- **Prerequisites:** P062, P007
- **Required implementation:** Consolidate urgent condition, evidence and available actions in task-oriented inspector flows while retaining deep tabs for exploration.
- **Pass condition:** Representative diagnose-decide-verify journeys require fewer interactions and expose the same essential facts.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P066 — Return-session memory

- **Status:** `PLANNED`
- **Route/effort:** Build · S
- **Prerequisites:** P002, P065
- **Required implementation:** Persist selected region, camera, panel, overlay, unfinished task context and session recap separately from authoritative world state.
- **Pass condition:** A resumed game restores both civilization and player context; state missing or stale degrades gracefully.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P069 — Attention-friendly access

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P065
- **Required implementation:** Design optional calm and focus views, readable keyboard regional navigation, robust touch targets and reduced-stimulation parity.
- **Pass condition:** Core tasks pass keyboard-only and touch-only probes without removing strategy-critical information.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P070 — Known vs derived vs predicted information

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P065, P072
- **Required implementation:** Add provenance labels and horizon/assumption metadata for UI figures and forecasts; disallow fabricated confidence.
- **Pass condition:** Every predicted claim identifies rule basis/time horizon and is visibly distinct from observed stock and deterministic arithmetic.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P025 — Live dependency network

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P070
- **Required implementation:** Compute derived infrastructure/resource dependence from real flows and route connectivity; highlight dependencies and failure effects in selected regions.
- **Pass condition:** Removing a link in a cloned test world creates explainable effects consistent with the displayed graph; no invented causal arrows.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P068 — Visual truth contract

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P070
- **Required implementation:** Codify data-to-visual rules for settlement wealth, shipment activity, route condition, crises, conservation and night lighting.
- **Pass condition:** Seeded screenshot/state fixtures detect important contradictions between map, visuals, and numerical inspectors.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P067 — Synchronized globe and atlas

- **Status:** `PLANNED`
- **Route/effort:** Prototype then build · L
- **Prerequisites:** P065, P068
- **Required implementation:** Add optional projected 2D atlas sharing regional IDs, selections, overlays, navigation and build/route tools with 3D globe.
- **Pass condition:** Cross-world route tasks become measurably easier; both views share one state and remain synchronized after mode and save changes.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P033 — Full non-WebGL strategic interface

- **Status:** `PLANNED`
- **Route/effort:** Build · L
- **Prerequisites:** P065, P069
- **Required implementation:** Provide a first-class accessible region/settlement/route/action UI consuming authoritative commands without renderer dependence.
- **Pass condition:** Representative scenario can be completed via keyboard/screen reader with WebGL disabled, including save/load and core tools.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

### F4: 9 required proposals

#### P035 — Compelling first 24 months

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P074, P075
- **Required implementation:** Offer opt-in starter situations presenting a real food, transport or resource problem with several solutions; keep free Sandbox.
- **Pass condition:** Human players encounter a consequential choice early, and at least three winning openings are validated by simulation.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P036 — Three consequential landing sites

- **Status:** `PLANNED`
- **Route/effort:** Build · S
- **Prerequisites:** P035, P061
- **Required implementation:** Generate or curate three viable but economically distinct initial expedition sites with readable constraints.
- **Pass condition:** Matched playthroughs show distinct first-decade strategy, not merely different cosmetics, with no dead-end starts.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P037 — Strategic opportunity board

- **Status:** `PLANNED`
- **Route/effort:** Build · S
- **Prerequisites:** P025, P035
- **Required implementation:** Derive a maximum of three prioritized, clickable needs/opportunities from existing stock, settlement and network data.
- **Pass condition:** Every recommended action has valid target, evidence, payoff/tradeoff and a route to completion; no impossible suggestions.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P038 — Construction-site comparison

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P061, P065
- **Required implementation:** Preview several valid placements with shared farm/ore/transport formulas and environmental/maintenance costs.
- **Pass condition:** A comparative site view agrees with authoritative production formulas and exposes meaningful alternatives.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P032 — Advance until event

- **Status:** `PLANNED`
- **Route/effort:** Build · S
- **Prerequisites:** P004, P071
- **Required implementation:** Allow deterministic bounded tick advancement until construction, arrival, shortage, objective or cancel, with terminal scenario checks each tick.
- **Pass condition:** Stops at exact first qualifying tick, never skips terminal states and is cancelable mid-run.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P039 — Policy change inertia

- **Status:** `PLANNED`
- **Route/effort:** Prototype then build · M
- **Prerequisites:** P003, P071
- **Required implementation:** Introduce opt-in policy transition latency and costs for Challenge while preserving instant Sandbox policy edits.
- **Pass condition:** Toggle cannot be spammed to bypass tradeoffs; challenges stay solvable, and each transition has visible consequences.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P041 — One-off emergency shipments

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P071, P025
- **Required implementation:** Add explicit sourced dispatch with sender, receiver, amount, capacity, travel delay, loss and ledger-accounted transfer.
- **Pass condition:** Donor stock and in-transit amounts reconcile; cargo does not teleport, duplicate or exceed route capacity.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P043 — Temporary labor mobilization

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P071
- **Required implementation:** Introduce time-limited workforce allocation with explicit output gain and opportunity cost for other production/wellbeing.
- **Pass condition:** Boost expires on schedule; consumed labor/costs reconcile and cannot be permanently stacked for free.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P044 — Seasonal reserve planning

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P043, P037
- **Required implementation:** Offer monthly seasonal reserve targets and warnings from current climate/consumption, with explicit storage and spoilage costs.
- **Pass condition:** Strong planning helps under matched seasonal shortages but surplus hoarding has rational opportunity costs.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

### F5: 9 required proposals

#### P046 — Condition-based petitions

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P037, P071
- **Required implementation:** Generate settlement petitions from real needs and social values; provide fund, modify or decline decisions via commands.
- **Pass condition:** Every petition is grounded in state, is satisfiable or explicitly impossible, and its consequence enters relations/events.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P047 — Social values change behaviors

- **Status:** `PLANNED`
- **Route/effort:** Build · L
- **Prerequisites:** P046
- **Required implementation:** Deepen growth/conservation/trade value rules governing local construction, extraction priorities and agreements.
- **Pass condition:** Matched worlds with distinct values show different legal behavior, and values change in response to lived conditions.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P012 — Negotiated stewardship

- **Status:** `PLANNED`
- **Route/effort:** Prototype then build · L
- **Prerequisites:** P047, P071
- **Required implementation:** Replace unconditional unilateral intervention for selected actions with local responses, acceptance, adaptation or resistance; keep valid Sandbox variants.
- **Pass condition:** Community reactions reflect needs and values; at least two negotiation outcomes cause genuinely different states without arbitrary blockers.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P023 — Commons charter

- **Status:** `PLANNED`
- **Route/effort:** Prototype then build · L
- **Prerequisites:** P012
- **Required implementation:** Add voluntary joint reserves/transport/environment projects with contribution obligations, exit and renewal rules.
- **Pass condition:** Shared institution creates a feasible benefit unavailable to isolated participants, accounting for all participant contributions.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P024 — Unequal-prosperity metrics

- **Status:** `PLANNED`
- **Route/effort:** Build · S
- **Prerequisites:** P065
- **Required implementation:** Show population-weighted wellbeing distribution, smallest-community risk and share facing shortage, not only averages.
- **Pass condition:** Two worlds with similar averages but different hardship are visibly distinguished with a useful policy response.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P042 — Scheduled trade commitments

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P041, P023
- **Required implementation:** Create bounded bilateral shipment commitments with duration, reserve safety and renegotiation/shortfall outcomes.
- **Pass condition:** Commitments change real stock, trade and relations and never silently force negative inventory or false guaranteed delivery.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P048 — Promise clock

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P046, P071
- **Required implementation:** Offer opt-in measurable time-limited stewardship goals with visible progress and state-grounded consequences.
- **Pass condition:** Evaluation is deterministic, deadlines exact, and invalid promises cannot be accepted or completed through trivial exploits.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P049 — Local autonomy trial

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P047, P048
- **Required implementation:** Run one selected community autonomously for a bounded period with transparent start/end and optional continuation.
- **Pass condition:** Trial respects all command restrictions, records outcomes and produces no hidden player interventions.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P045 — Settlement specialization paths

- **Status:** `PLANNED`
- **Route/effort:** Prototype then build · L
- **Prerequisites:** P047
- **Required implementation:** Make existing agrarian/fishing/mining/energy/trade identities into earned local options with strengths, limits and transitions.
- **Pass condition:** Different regional archetypes choose different viable paths; no path is always superior under all seeds.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

### F6: 10 required proposals

#### P015 — Watershed interdependence

- **Status:** `PLANNED`
- **Route/effort:** Prototype then build · XL
- **Prerequisites:** P061, P082
- **Required implementation:** Use generated downhill/flow topology for area-aware upstream supply, downstream withdrawals, reservoir controls and pollutant transfer with aggregate mass ledger.
- **Pass condition:** Two-region diversion alters downstream outcomes predictably, no water creation/negative stocks, and runtime budget holds.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P027 — Regional land-use allocation

- **Status:** `PLANNED`
- **Route/effort:** Prototype then build · L
- **Prerequisites:** P061
- **Required implementation:** Add bounded land-use fractions/capacity across cultivation, habitat, extraction and settlement functions rather than literal plots.
- **Pass condition:** Land fractions never exceed availability, regional production changes with allocation, and existing buildings migrate safely.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P017 — Circular material economy

- **Status:** `PLANNED`
- **Route/effort:** Build · L
- **Prerequisites:** P082, P027
- **Required implementation:** Record material embedded in structures, salvage, repair and recycling with labor/energy costs and bounded yields.
- **Pass condition:** Long-run ore/timber accounting reconciles; demolition and repair cannot manufacture net finite materials.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P016 — Regional energy portfolios

- **Status:** `PLANNED`
- **Route/effort:** Prototype then build · XL
- **Prerequisites:** P017, P061
- **Required implementation:** Evolve energy production to regional solar/wind/hydro/biomass with seasonal availability, storage bounds and cost/land tradeoffs.
- **Pass condition:** Different climates favor different portfolios; no free energy from upgrades and existing save tech semantics migrate correctly.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P018 — Functional ecosystems

- **Status:** `PLANNED`
- **Route/effort:** Prototype then build · XL
- **Prerequisites:** P015, P027
- **Required implementation:** Add small functional groups for habitat, pollination/soil and aquatic health; propagate consequences via existing production/ecology.
- **Pass condition:** Restoration and degradation have delayed local plus neighbor effects; bounded system avoids agent-per-animal simulation.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P019 — Climate inertia

- **Status:** `PLANNED`
- **Route/effort:** Prototype then build · XL
- **Prerequisites:** P018, P016
- **Required implementation:** Introduce documented toy-model cumulative forcing from industry/land changes, delayed climate-response fields and bounded ecological feedback.
- **Pass condition:** Matched policy runs diverge over decades with stable coefficients, reversible assumptions and no unsupported real-world prediction claims.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P013 — Visible ecological feedback

- **Status:** `PLANNED`
- **Route/effort:** Build · L
- **Prerequisites:** P068, P018, P019
- **Required implementation:** Map simulation changes in habitat, ecological stress and long-run climate to physically legible shaders/regions without cosmetic lies.
- **Pass condition:** Seeded time checkpoints change regional visuals with data; overlays, inspector and globe agree.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P030 — Disaster preparedness

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P019, P037
- **Required implementation:** Expose rule-grounded hazard risk and fund pre-event mitigation, supplies and response readiness at real resource costs.
- **Pass condition:** Prepared communities fare better on matched seeded events without removing risk or fabricating predictive certainty.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P063 — Playable procedural-world profiles

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P036, P030
- **Required implementation:** Measure seed viability, isolation, scarce resources and trade opportunities and classify generated planets; don't silently change supplied seeds.
- **Pass condition:** Profile labels correlate with measurable starting characteristics and produce distinct viable runs.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P028 — Survey mode

- **Status:** `PLANNED`
- **Route/effort:** Prototype then build · M
- **Prerequisites:** P063, P070
- **Required implementation:** Hide selected precise world information in an optional mode; fund surveys/expeditions to reveal deterministic existing facts.
- **Pass condition:** Survey results reveal the same underlying world without changing its random state; information can alter a real decision.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

### F7: 7 required proposals

#### P020 — Demographic cohorts

- **Status:** `PLANNED`
- **Route/effort:** Prototype then build · XL
- **Prerequisites:** P082, P024
- **Required implementation:** Add aggregate child, working-age, elder population compartments with migration, cohort transitions, labor and mortality impacts.
- **Pass condition:** Birth/death/aging/migration population conservation holds and long-tail shock effects are observable, without per-person agents.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P021 — Population in transit

- **Status:** `PLANNED`
- **Route/effort:** Build · L
- **Prerequisites:** P020, P041
- **Required implementation:** Represent migrant cohorts/cargo traveling along real routes with delay and arrival capacity; account for in-transit population.
- **Pass condition:** Population never teleports/doubles; endpoints and long-range routes enforce travel, housing and supply constraints.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P022 — Local knowledge diffusion

- **Status:** `PLANNED`
- **Route/effort:** Prototype then build · XL
- **Prerequisites:** P020, P045
- **Required implementation:** Represent local technology discovery/adoption and diffusion through networks and movement while separating knowledge from build costs.
- **Pass condition:** Research isn't instantly global; transmission routes and adoption constraints are deterministic and save compatible.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P029 — Century planning queue

- **Status:** `PLANNED`
- **Route/effort:** Build · L
- **Prerequisites:** P038, P042
- **Required implementation:** Create time-ordered project prerequisites, funding escrow/commitments and reprioritization with blockers and cancellation.
- **Pass condition:** Multi-year plan executes only valid funded commands and survives saves without overspending or orphaned jobs.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P040 — Alternative route planning

- **Status:** `PLANNED`
- **Route/effort:** Prototype then build · L
- **Prerequisites:** P025, P029
- **Required implementation:** Expose 2-3 viable land/sea routes with travel/capacity/cost choices and clear routing recomputation rules.
- **Pass condition:** At least two valid route choices produce measurable tradeoffs in suitable test seeds, with maintained route correctness.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P026 — Infrastructure resilience drills

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P029, P040
- **Required implementation:** Define redundancy/reserve metrics; use disposable clones for deterministic test outages and compare outcomes against baseline.
- **Pass condition:** Resilient networks outperform cheap single-source ones under matched shocks while incurring a measurable upkeep cost.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P055 — Multi-settlement Great Works

- **Status:** `PLANNED`
- **Route/effort:** Prototype then build · L
- **Prerequisites:** P023, P026
- **Required implementation:** Add selected long-horizon shared projects with multi-settlement contributions, staged dependencies and unique strategic payoff.
- **Pass condition:** A Great Work introduces real new capability, tracks contributions, and remains completable without exploits/softlocks.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

### F8: 10 required proposals

#### P050 — Three-stage crises

- **Status:** `PLANNED`
- **Route/effort:** Build · L
- **Prerequisites:** P030, P071
- **Required implementation:** Turn selected crises into containment, ongoing management and recovery with state-derived transition points and distinct interventions.
- **Pass condition:** Equivalent crises with different responses diverge measurably while core scenarios remain winnable.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P051 — Cascading crises

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P050, P025
- **Required implementation:** Connect drought, labor, shortages, migration and relationships into explainable bounded escalation chains with player interrupt opportunities.
- **Pass condition:** At least two causal links are reproducible and preventable; runaway unbounded cascades are prohibited.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P052 — Conflicting humanitarian commitments

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P051, P041
- **Required implementation:** Provide rare scarcity decision situations with several valid resource allocations and explicit downstream tradeoffs.
- **Pass condition:** There is no scripted mandatory moral choice; two defensible resource distributions lead to distinct outcomes.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P053 — Spatial wildfire containment

- **Status:** `PLANNED`
- **Route/effort:** Prototype then build · L
- **Prerequisites:** P050, P015
- **Required implementation:** Allow selecting regional fire-containment arcs/neighbor cells with labor/material cost and actual spread prevention.
- **Pass condition:** Topology-aligned perimeter choices affect simulated spread proportionally to capacity/cost, not decorative lines.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P054 — Post-crisis reconstruction paths

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P050, P027
- **Required implementation:** Add reconstruct/relocate/restore decisions after severe damage with distinct infrastructure and ecology effects.
- **Pass condition:** At least two post-crisis recovery paths change real resources and trajectory; no free restoration.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P009 — Grounded causal lens

- **Status:** `PLANNED`
- **Route/effort:** Build · L
- **Prerequisites:** P025, P072, P051
- **Required implementation:** Introduce causal claims only where deterministic ledger/state links support them; flag correlations and unknown causes separately.
- **Pass condition:** A sampled major event has exact contributions traced to authoritative factors; no invented explanatory narrative.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P010 — Bounded planetary memory

- **Status:** `PLANNED`
- **Route/effort:** Prototype then build · XL
- **Prerequisites:** P009, P072
- **Required implementation:** Capture sparse event/snapshot index anchored to places and months, with bounded memory/save growth and reconstructible chronology.
- **Pass condition:** Travel to an earlier dated world state or supported snapshot without changing present play; 25-year records stay within budget.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P011 — Dual-world counterfactual

- **Status:** `PLANNED`
- **Route/effort:** Prototype then build · XL
- **Prerequisites:** P006, P009, P010
- **Required implementation:** Render/source-bound comparison of two identical-origin simulation branches with explicit policy deltas and matched horizons.
- **Pass condition:** Branch provenance preserved, both futures deterministic, and charts/globes avoid unsupported causal certainty.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P014 — Functional audiovisual identity

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P068, P079, P050
- **Required implementation:** Define game-wide sound/visual cue vocabulary for action, loss, forecast, opportunity, danger and success with quiet accessibility alternatives.
- **Pass condition:** Cues map to real states, are perceptually tested, and behave under mute/reduced-motion/tab lifecycle.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P076 — Visually distinct regional civilizations

- **Status:** `PLANNED`
- **Route/effort:** Prototype then build · L
- **Prerequisites:** P045, P068, P055
- **Required implementation:** Procedurally compose region-scale silhouettes from actual settlement size, specialization, condition and infrastructure state.
- **Pass condition:** Settlements with comparable populations but different identities look distinguishable without depicting nonexistent infrastructure.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

### F9: 8 required proposals

#### P056 — Multiple victory strategies

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P050, P074
- **Required implementation:** Expand selected scenarios with separately validated objective routes (trade, restoration, production, etc.) and comparable difficulty.
- **Pass condition:** Each path is winnable via legal commands on both difficulties and produces nontrivial strategic variance.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P058 — Handcrafted short strategy puzzles

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P056, P084
- **Required implementation:** Author at least ten fixed-seed constrained puzzle states with clear wins/fails and near-immediate gameplay.
- **Pass condition:** Ten distinct puzzles have validated solutions, no degenerate bypasses and replayable restarts.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P057 — Optional scenario campaign

- **Status:** `PLANNED`
- **Route/effort:** Build · M
- **Prerequisites:** P056, P058
- **Required implementation:** Sequence existing scenarios with clear mastery progression and safe optional carry-forward constraints; preserve standalone versions.
- **Pass condition:** Campaign can finish end-to-end; legacy rules have deterministic source and standalone missions still work.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P031 — Player Scenario Forge

- **Status:** `PLANNED`
- **Route/effort:** Build · L
- **Prerequisites:** P084, P056
- **Required implementation:** Expose validated scenario settings and bounded objective templates, offline JSON export/import and solvability checks; never accept arbitrary JS.
- **Pass condition:** User-created scenarios load/replay deterministically; invalid and trivial/unwinnable definitions are flagged.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P034 — Relinquish Stewardship endgame

- **Status:** `PLANNED`
- **Route/effort:** Prototype then build · M
- **Prerequisites:** P026, P049, P072
- **Required implementation:** Offer a committed hands-off 100-year evaluation using real autonomous decisions and resilience/welfare metrics.
- **Pass condition:** Player can relinquish control and observe unbiased unscripted outcomes; seeds/replays establish provenance.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P059 — Limited Intervention Window mode

- **Status:** `PLANNED`
- **Route/effort:** Prototype then build · M
- **Prerequisites:** P034, P032
- **Required implementation:** Add mode with one bounded intervention phase every five simulated years; simulate autonomously between decision points.
- **Pass condition:** Window timing, command budget and autonomy restrictions are exact; multiple viable successful plays exist.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P060 — Three ages of stewardship

- **Status:** `PLANNED`
- **Route/effort:** Prototype then build · XL
- **Prerequisites:** P034, P057, P062
- **Required implementation:** Introduce coherent foundation/interdependence/maturity phases tied to meaningful new types of decisions, not arbitrary unlock inflation.
- **Pass condition:** Human playtest finds different decisions in years 5, 30 and 100; all original modes still work independently.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

#### P064 — Meaningful civilizational recovery

- **Status:** `PLANNED`
- **Route/effort:** Build · L
- **Prerequisites:** P020, P054, P060
- **Required implementation:** Analyze and rebalance collapse/recovery loops; permit costly recovery from viable conditions and clearly signal truly unrecoverable states.
- **Pass condition:** Matched runs show multiple recovery routes without magical stock injections or mathematically inevitable collapse for viable worlds.
- **Evidence at closure:** exact test name(s), fixture/seed, linked commit SHA, browser/device case when relevant, before/after behavior or metric, and an entry in the current run ledger. If a proof is unavailable, mark `UNVERIFIED` and keep the dependent branch blocked.

## Closure audit

The phase counts must be exactly F0=8, F1=8, F2=7, F3=8, F4=9, F5=9, F6=10, F7=7, F8=10, F9=8 (84 total), with every ID P001–P084 represented exactly once. Do not claim the complete program has shipped until all 84 obligations are verified, or record an explicit user-authorized rejection/substitution with supporting research evidence. Any feature that is merely behind a flag or in a prototype remains pending release validation.
