# The World Machine — Implementation Run Ledger

**Repository:** `westkitty/World_Machine`  
**Baseline Planning Reference:** `cc1eb5f0218c41ac094ed13d597492e407d3e59d`  
**Governing Documents:**  
- `WORLD_MACHINE_84_PROPOSAL_IMPLEMENTATION_MASTERPLAN.md` (SHA-256: `7f490764b2e556d23ae868e93d16c8b969599dec32fd4e702c9b49a2dfc6ac2e`)  
- `WORLD_MACHINE_84_ITEM_EXECUTION_COVERAGE_LEDGER.md` (SHA-256: `bbf9c871a2ee3997c15f467d80786d07199c4643377353f9c3a3b317a9cb4dd9`)  
- `ANTIGRAVITY_WORLD_MACHINE_EXECUTION_LOCAL.md` (SHA-256: `05dd71f2a55eb150b3860bdc9654d59967bd0c83e055c47f8a9eb6a49b89c5e6`)  
**Active Integration Branch:** `feat/world-machine-f0`  
**Last Updated:** 2026-10-15  

---

## 1. Non-Regression Baseline Verification

- **Environment:** macOS 15.x (Apple Silicon arm64), node `v26.11.1`, bun `1.3.13`, Vite `7.3.7`, Vitest `3.2.7`, TypeScript `5.9.3`, Three.js `0.186.1`.
- **Typecheck:** `bun run typecheck` (`tsc --noEmit`) completed with 0 errors.
- **Unit Test Suite:** `bun run test` passed 54/54 tests (34 in `tests/sim.test.ts`, 20 in `tests/scenarios.test.ts`).
- **Production Build:** `bun run build` built `dist/` cleanly without warnings.
- **Interactive Browser Proof:** Executed on preview server `http://localhost:4173/` via browser inspection. Verified title screen rendering, mode selection, WebGL 3D globe geometry and lighting, HUD tabs, inspector panels, and deterministic clock advancement (month 0 to month 1).
- **Baseline v1 Save Fixtures:** Generated and archived in `tests/fixtures/v1/`:
  - `reference-sandbox-v1.json`: Standard 5-settlement TERRA-1 sandbox start.
  - `scenario-first-footprint-v1.json`: First Footprint scenario starting state.
  - `scenario-long-drought-v1.json`: Long Drought crisis scenario starting state.
  - `challenge-mode-v1.json`: Challenge mode starting state.

---

## 2. Checkpoint Execution Log

### Checkpoint CP01 — P061: Geographic Scale Contract

- **Proposal:** P061 — Geographic scale contract
- **Phase:** F0 (Foundation)
- **Status:** `VERIFIED_LOCAL`
- **Route / Effort:** Build · L
- **Prerequisites:** Baseline established (`VERIFIED_LOCAL`)
- **Implementation Packet:**
  - Created `src/sim/scale.ts` defining:
    - Earth-sized spherical planetary parameters ($R = 6,371\text{ km}$, area $= 510,064,472\text{ km}^2$, 642 cells, mean cell area $\approx 794,493\text{ km}^2$, mean diameter $\approx 1,006\text{ km}$, neighbor distance $\approx 926\text{ km}$, 3D unit sphere conversion).
    - `SPATIAL_UNITS` dictionary establishing physical units and symbols for distance (`km`), land area (`km²`), elevation (`m`), region (`reg`), community (`comm`), infrastructure complex (`cpx`), highway (`road`), trade corridor (`corridor`), precipitation (`mm/mo`), temperature (`°C`), biomass (`B`), water (`W`), ore (`O`), and visual projection (`gu`).
    - `classifyCellGeography(...)` formalizing inland, coastal, island, continental shelf, and open ocean classifications.
    - Formatting helpers: `formatDistanceKm`, `formatAreaKm2`, `formatElevationM`.
    - `getRepresentativeScaleExamples(...)` mapping representative reference topologies in TERRA-1.
  - Updated `src/ui/panels.ts` (`regionPanel`) to display geographic classification with contextual description tooltip, spherical-polygon cell area in $\text{km}^2$ and relative $\%$ of mean planetary region, and regional complexes capacity ($X / 2$).
  - Added documentation `docs/GEOGRAPHIC_SCALE_CONTRACT.md` and updated `docs/TECHNICAL.md`.
  - Created automated test suite `tests/scale.test.ts`.
- **Pass Condition & Evidence:**
  - `bun run test tests/scale.test.ts` passed 5/5 tests:
    - `defines named spatial units for all core simulation and presentation mechanics`
    - `planetary constants accurately partition an Earth-sized sphere into 642 cells` (error $< 10^{-4}$)
    - `correctly classifies coastal, inland, island, shelf, and ocean cells`
    - `representative scale examples agree across inland, coastal, and island topologies in TERRA-1`
    - `formats scale units with descriptive strings and consistent metric values`
  - Total automated test suite expanded from 54 to 59 tests passing (`59 passed (59)`).
  - Checkpoint commit: `ce6804fd5cd05b1ed70584973c8dc0e8ab50c6bd` (pushed to `origin/feat/world-machine-f0`, verified remote SHA equality).
- **Next Task:** Checkpoint CP02 — P062: Meaningful-intervention design audit.

---

### Checkpoint CP02 — P062: Meaningful-Intervention Design Audit

- **Proposal:** P062 — Meaningful-intervention design audit
- **Phase:** F0 (Foundation)
- **Status:** `VERIFIED_LOCAL`
- **Route / Effort:** Audit and revise · M
- **Prerequisites:** Baseline established (`VERIFIED_LOCAL`), CP01 completed
- **Implementation Packet:**
  - Created `docs/MEANINGFUL_INTERVENTION_DESIGN_AUDIT.md`:
    - Full inventory and audit matrix of all 12 player commands: `found`, `build`, `demolish`, `road`, `route`, `removeRoute`, `routeGoods`, `policy`, `conserve`, `research`, `respond`, `laborFocus`.
    - Detailed for every action: core intent, costs and prerequisites, when preferable, when an alternative is preferable (with explicit named alternative), multi-month delayed simulation effects, and player feedback loops.
    - Consolidation analysis confirming zero redundancy in the 12-action architecture.
  - Created test suite `tests/audit.test.ts`:
    - Verifies complete 12-command inventory.
    - Asserts `previewCommand` is non-mutating (state left byte-identical).
    - Asserts invalid prerequisites return actionable failure messages.
    - Asserts actionable alternatives for resource dilemmas (`laborFocus` vs `policy` vs `routeGoods`).
    - Asserts `conserve` (idling structures) vs `demolish` (salvaging materials) distinction.
  - Updated `docs/TECHNICAL.md` with "Player commands and meaningful interventions" section referencing the audit.
- **Pass Condition & Evidence:**
  - `bun run test tests/audit.test.ts` passed 5/5 tests.
  - Checkpoint commit: `964e9443ba8a3e382e612696ce9ccae370d84ea3` (pushed to `origin/feat/world-machine-f0`, verified remote SHA equality).
- **Next Task:** Checkpoint CP03 — P071: Single authoritative mutation path.

---

### Checkpoint CP03 — P071: Single Authoritative Mutation Path

- **Proposal:** P071 — Single authoritative mutation path
- **Phase:** F0 (Foundation)
- **Status:** `VERIFIED_LOCAL`
- **Route / Effort:** Build · L
- **Prerequisites:** Baseline established (`VERIFIED_LOCAL`), CP01 & CP02 completed
- **Implementation Packet:**
  - Added `{ type: 'rule'; patch: Partial<Rules> }` to `Command` in `src/sim/commands.ts`.
  - Enforced strict sandbox-only validation and range bounds on all rule modifications.
  - Made `applyCommand` transactional: commands execute on an isolated clone first; active state is mutated only if validation and execution completely succeed. Any invalid arguments, rejected actions, or errors leave the input state 100% byte-identical.
  - Replaced the direct UI write in `src/ui/panels.ts` (`s.rules.unrestricted = ...`) with `app.run({ type: 'rule', patch: { unrestricted: checked } }, 'click')`, eliminating the single UI write exception across the entire application.
  - Added `adoptBranch(branch: BranchResult): boolean` to `src/app/App.ts` enforcing mode and scenario validation before adopting futures.
  - Added `assertStateValid(state)` in `App.load` to guarantee failed/corrupt loads reject before modifying active game state.
  - Updated `docs/TECHNICAL.md` to document the zero direct UI writes architecture.
  - Created test suite `tests/authority.test.ts`.
- **Pass Condition & Evidence:**
  - `bun run test tests/authority.test.ts` passed 4/4 tests:
    - Static audit scanning all `src/ui/*.ts` lines verified 0 direct simulation state mutations.
    - Automated byte-identical assertions passed across all 14 invalid command permutations.
    - Rule modification validated in sandbox and strictly rejected in observer and scenario modes.
    - Failed loads and corrupted state structures rejected before modifying active state.
  - Total automated test suite expanded to 68 tests passing across 5 files (`tests/sim.test.ts`, `tests/scenarios.test.ts`, `tests/scale.test.ts`, `tests/audit.test.ts`, `tests/authority.test.ts`).
  - Checkpoint commit: `42cda9fd55e2f81a08cb759e95751b57ae648c15` (pushed to `origin/feat/world-machine-f0`, verified remote SHA equality).
- **Next Task:** Checkpoint CP04 — P082: Versioned save compatibility.

---

### Checkpoint CP04 — P082: Versioned Save Compatibility

- **Proposal:** P082 — Versioned save compatibility
- **Phase:** F0 (Foundation)
- **Status:** `VERIFIED_LOCAL`
- **Route / Effort:** Build · M
- **Prerequisites:** Baseline established (`VERIFIED_LOCAL`), CP01, CP02, CP03 completed
- **Implementation Packet:**
  - Strengthened nested state validation in `validateState` (`src/sim/save.ts`):
    - Enforced strict structural constraints on `rules` (positive finite consumption/construction multipliers, non-negative crisis frequency, boolean unrestricted flag, integer maxSettlements ≥ 1).
    - Enforced strict invariants on `policy` (valid extraction enum, boolean rationing, growth enum, autonomy enum, bijection tradePriority, integer reserveMonths 1–12).
    - Enforced structural invariants on `settlements`, `buildings` (types in `BUILDINGS`, living owners, condition in [0, 1], valid status), `roads`, `routes`, `shipments`, `tech`, and `scenario`.
  - Formalized sequential migration pipeline in `migrate` with `MIGRATIONS` registry and clear rejection for future or pre-v1 schemas.
  - Verified historical v1 fixtures (`reference-sandbox-v1`, `scenario-first-footprint-v1`, `scenario-long-drought-v1`, `challenge-mode-v1`).
  - Created test suite `tests/save_compatibility.test.ts`.
  - Updated `docs/TECHNICAL.md` with Save schema and versioned migration documentation.
- **Pass Condition & Evidence:**
  - `bun run test tests/save_compatibility.test.ts` passed 7/7 tests:
    - All 4 historical v1 save fixtures deserialize, pass validation, and advance 12 months without regression.
    - Corrupt rules, policies, buildings, and shipments reject with actionable `SaveError` messages.
    - Future versions (`> 1`) and pre-v1 schemas (`< 1`) cleanly reject.
    - Serialization and deserialization roundtrip maintains exact data fidelity.
  - Total automated test suite expanded to 75 tests passing across 6 files (`tests/sim.test.ts`, `tests/scenarios.test.ts`, `tests/scale.test.ts`, `tests/audit.test.ts`, `tests/authority.test.ts`, `tests/save_compatibility.test.ts`).
  - `bun run typecheck` passed with 0 errors.
  - `bun run build` built cleanly.
  - Checkpoint commit: `c034840667af47ec8b70d4a50d264e8cb731e218` (pushed to `origin/feat/world-machine-f0`, verified remote SHA equality).
- **Next Task:** Checkpoint CP05 — P002: Save overwrite/delete protection.

---

### Checkpoint CP05 — P002: Save Overwrite/Delete Protection

- **Proposal:** P002 — Save overwrite/delete protection
- **Phase:** F0 (Foundation)
- **Status:** `VERIFIED_LOCAL`
- **Route / Effort:** Build · S
- **Prerequisites:** Baseline established (`VERIFIED_LOCAL`), CP01–CP04 completed
- **Implementation Packet:**
  - Enhanced `src/app/storage.ts`:
    - Implemented atomic write with rollback: `saveToSlot` reads existing data before writing; if `setItem` throws (e.g. `QuotaExceededError`), the slot and metadata are restored intact, guaranteeing failed writes never destroy or truncate earlier data.
    - Added displacement backup store (`wm:backup:<slot>` and `wm:backup:last`) archiving displaced saves on overwrite, deletion, or yearly autosaves with `BackupRecord`.
    - Added `restoreBackup(slot)` with reversible swap semantics, `getBackup(slot)`, `clearBackup(slot)`, `hasBackup(slot)`.
  - Enhanced UI in `src/ui/menus.ts` (`savesScreen`):
    - Added confirmation prompts when saving to occupied slots (`Confirm Overwrite` / `Cancel`) and deleting slots (`Confirm Delete` / `Cancel`).
    - Verified cancel is strictly a no-op that leaves active slots and backups unmutated.
    - Added backup recovery rows with `Restore Backup` and `Export Backup` buttons.
  - Enhanced `App.ts`:
    - Added `deleteSlot(slot)`, `restoreSlotBackup(slot)`, `exportSlotBackup(slot)`.
  - Added CSS in `src/styles.css` for `.confirm-box`, `.backup-item`, and `.btn.bad`.
  - Created test suite `tests/save_protection.test.ts`:
    - `cancel is a no-op: aborted save/delete actions do not mutate slots or backups`
    - `atomic rollback: failed writes do not destroy or truncate earlier save data`
    - `overwritten save has a tested recovery route via backup and restore`
    - `deleted save has a tested recovery route via backup and restore`
    - `autosave archives prior year in backup`
    - `corrupt backup data fails cleanly without destroying current slot`
    - `clearBackup removes backup from storage`
  - Updated `docs/TECHNICAL.md` with Save overwrite/delete protection and recovery documentation.
- **Pass Condition & Evidence:**
  - `bun run test tests/save_protection.test.ts` passed 7/7 tests.
  - Total automated test suite expanded to 82 tests passing across 7 files (`tests/sim.test.ts`, `tests/scenarios.test.ts`, `tests/scale.test.ts`, `tests/audit.test.ts`, `tests/authority.test.ts`, `tests/save_compatibility.test.ts`, `tests/save_protection.test.ts`).
  - `bun run typecheck` passed with 0 errors.
  - `bun run build` built cleanly.
  - Checkpoint commit: `d1bfae46839961ec0bde357931304a948eb69ffb` (pushed to `origin/feat/world-machine-f0`, verified remote SHA equality).
- **Next Task:** Checkpoint CP06 — P003: Scenario constraints authoritative.

---

### Checkpoint CP06 — P003: Scenario Constraints Authoritative

- **Proposal:** P003 — Scenario constraints authoritative
- **Phase:** F0 (Foundation)
- **Status:** `VERIFIED_LOCAL`
- **Route / Effort:** Repair · S
- **Prerequisites:** Baseline established (`VERIFIED_LOCAL`), CP01–CP05 completed
- **Implementation Packet:**
  - Extended `src/sim/scenarios.ts`:
    - Added `checkPolicyConstraint?(patch: Partial<Policy>, state: WorldState): string | null` to `ScenarioDef`.
    - Implemented specific policy constraint checkers for all 5 scenarios:
      - `first_footprint`: autonomy strictly locked to `limited` (directing construction).
      - `distance_between_us`: prohibits `full` autonomy (communities cannot sign independent trade agreements).
      - `long_drought`: prohibits `full` autonomy (centralized drought emergency coordination required).
      - `green_threshold`: prohibits `full` autonomy (uncontrolled autonomous expansion causes rapid ecological collapse).
      - `many_futures`: prohibits `full` autonomy (expansion must be coordinated with resource reserves).
    - Exported `checkScenarioPolicy(state, patch)`.
  - Updated `src/sim/commands.ts`:
    - Enforced `checkScenarioPolicy` in `case 'policy'`: returns actionable explanation upon constraint violation without mutating state.
    - Updated `modeBlocker` to ensure completed scenarios strictly reject incoming commands.
  - Updated `src/sim/save.ts`:
    - Enhanced `validateState` to reject imported saves violating scenario policy constraints (`SaveError`).
    - Enforced non-empty message on terminal scenario states (`success` or `failure`).
  - Updated `src/app/App.ts`:
    - Enhanced `adoptBranch`: verifies scenario identity, blocks adoption into or from terminal scenario states, and validates `checkScenarioPolicy` before allowing branch adoption.
    - Enhanced `runTicks`: stops clock and skips execution if scenario is in a terminal state.
  - Updated `src/ui/panels.ts`:
    - Disabled prohibited policy radio buttons in `policyPanel` with explicit constraint explanations in `title` tooltips.
    - Enforced scenario constraints and disabled comparisons on completed scenarios in `comparePanel`.
  - Created test suite `tests/scenario_constraints.test.ts`:
    - `rejects prohibited autonomy in first_footprint with actionable reason at command boundary`
    - `rejects full autonomy in distance_between_us where communities cannot sign independent agreements`
    - `rejects full autonomy in long_drought, green_threshold, and many_futures`
    - `allows all autonomy settings in unconstrained sandbox worlds`
    - `completed-scenario transitions are authoritative: terminal scenarios reject all commands`
    - `save validation and import reject scenario policy constraint violations`
    - `save validation enforces message on completed scenario states`
    - `checkScenarioPolicy returns null for compliant policy and actionable string for violation`
    - `forecast adoption boundary rejects branches that violate scenario policy constraints`
  - Updated `docs/TECHNICAL.md` with Authoritative scenario constraints section.
- **Pass Condition & Evidence:**
  - `bun run test tests/scenario_constraints.test.ts` passed 9/9 tests.
  - Total automated test suite expanded to 91 tests passing across 8 files (`tests/sim.test.ts`, `tests/scenarios.test.ts`, `tests/scale.test.ts`, `tests/audit.test.ts`, `tests/authority.test.ts`, `tests/save_compatibility.test.ts`, `tests/save_protection.test.ts`, `tests/scenario_constraints.test.ts`).
  - `bun run typecheck` passed with 0 errors.
  - `bun run build` built cleanly.
  - Checkpoint commit: `feat(world-machine): CP06 P003 scenario constraints authoritative` (pushed to `origin/feat/world-machine-f0`, verified remote SHA equality).
- **Next Task:** Checkpoint CP07 — P001: Forecast ownership and adoption integrity.

---

### Checkpoint CP07 — P001: Forecast Ownership and Adoption Integrity

- **Proposal:** P001 — Forecast ownership and adoption integrity
- **Phase:** F0 (Foundation)
- **Status:** `VERIFIED_LOCAL`
- **Route / Effort:** Repair · M
- **Prerequisites:** Baseline established (`VERIFIED_LOCAL`), CP03 (P071) & CP04 (P082) completed
- **Implementation Packet:**
  - Extended `src/sim/compare.ts`:
    - Implemented `computeStateFingerprint(state: WorldState): string` using deterministic 32-bit FNV-1a hashing over seed, tick, mode, scenario status, rules, policy, settlement count, total living population, building count, route count, and ID counters.
    - Defined `ForkSemantics` interface tracking origin seed, origin tick, origin date, origin fingerprint, target tick, horizon months, mode, scenario ID, and ruleset summary.
    - Updated `runBranch` to capture `originSeed`, `originTick`, `originFingerprint`, `forecastTicks`, and `fork: ForkSemantics`.
    - Implemented `validateBranchAdoption(activeState: WorldState, branch: BranchResult): AdoptionValidation`:
      - Rejects observer mode.
      - Rejects active scenario ended/terminal states.
      - Rejects seed mismatch between active world and branch origin.
      - Rejects scenario ID mismatch.
      - Rejects tick progression (active world has moved past forecast origin tick, preventing silent time rewinds).
      - Rejects fingerprint mutation (active world state changed since forecast was calculated).
      - Rejects forecast branches that reached terminal failure/success states.
      - Rejects scenario policy violations in forecast.
  - Updated `src/ui/panels.ts`:
    - Exported `invalidateForecast(): void` resetting `compareResult = null` and `compareTick = -1`.
    - Updated `compareTable` to render an explicit fork semantics callout box displaying origin seed, origin date, horizon, and origin fingerprint.
    - Connected `validateBranchAdoption` to `Adopt A` and `Adopt B` buttons, disabling them with actionable reasons in tooltips and `aria-disabled` when invalid.
    - Called `invalidateForecast()` upon adopting a branch.
  - Updated `src/app/App.ts`:
    - Called `invalidateForecast()` in `App.load` to guarantee loading a save slot, restarting, starting a new game, or importing a save purges any stale forecast comparisons.
    - Updated `App.adoptBranch(branch)` to enforce `validateBranchAdoption`, toasting actionable rejection messages and playing `'invalid'` sound upon rejection.
  - Created test suite `tests/forecast_integrity.test.ts`:
    - `computes deterministic state fingerprints sensitive to seed, tick, rules, and policy`
    - `runBranch captures origin seed, tick, fingerprint, and explicit fork semantics`
    - `rejects adoption in observer mode`
    - `rejects adoption if the world seed does not match the forecast origin`
    - `rejects adoption if the active world has advanced past forecast origin (no time rewinding)`
    - `rejects adoption if the active world state mutated since forecast was computed (fingerprint mismatch)`
    - `rejects adoption if the active scenario has ended or forecast scenario mismatches`
    - `rejects adoption if forecast branch reaches a terminal scenario state or violates scenario policy`
    - `allows adoption when active state and forecast origin are congruent and valid`
    - `supports invalidateForecast to ensure stale forecasts do not persist across world changes`
  - Updated `docs/TECHNICAL.md` with Forecast ownership and adoption integrity section.
- **Pass Condition & Evidence:**
  - `bun run test tests/forecast_integrity.test.ts` passed 10/10 tests.
  - Total automated test suite expanded to 101 tests passing across 9 files (`tests/sim.test.ts`, `tests/scenarios.test.ts`, `tests/scale.test.ts`, `tests/audit.test.ts`, `tests/authority.test.ts`, `tests/save_compatibility.test.ts`, `tests/save_protection.test.ts`, `tests/scenario_constraints.test.ts`, `tests/forecast_integrity.test.ts`).
  - `bun run typecheck` passed with 0 errors.
  - `bun run build` built cleanly.
  - Checkpoint commit: `feat(world-machine): CP07 P001 forecast ownership and adoption integrity`
- **Next Task:** Checkpoint CP08 — P004: Modal/time/keyboard coherence (final checkpoint of Phase F0).

---

### Checkpoint CP08 — P004: Modal/Time/Keyboard Coherence

- **Proposal:** P004 — Modal/time/keyboard coherence
- **Phase:** F0 (Foundation) — **PHASE F0 COMPLETION GATE**
- **Status:** `VERIFIED_LOCAL`
- **Route / Effort:** Repair · M
- **Prerequisites:** Baseline established (`VERIFIED_LOCAL`), CP03 (P071) completed
- **Implementation Packet:**
  - Extended `src/app/clock.ts` (`SimClock`):
    - Added `pause()`, `resume()`, and `reset()` methods.
    - Updated `setSpeed(index, resetAccumulator = false)` and `togglePause()` to preserve fractional tick progress (`accumulator`), ensuring pausing and unpausing never discards accumulated month time.
    - Provided `accumulated` getter.
    - Added floating-point epsilon (`+ 1e-9`) to `advance(dt)` to prevent IEEE-754 precision drift around tick thresholds.
  - Extended `src/ui/Hud.ts`:
    - Updated `openModal(content)`:
      - Saves previous running speed (`this.resumeSpeed = this.app.clock.speed`).
      - Saves currently focused element (`this.previouslyFocused = document.activeElement`).
      - Automatically pauses simulation progression via `this.app.clock.pause()`.
      - Shifts keyboard focus immediately to first interactive control inside modal or `.modal-close`.
    - Implemented `trapFocus(e: KeyboardEvent)`:
      - Traps Tab and Shift+Tab navigation strictly inside open modals, cycling between first and last focusable elements.
    - Updated `closeModal()`:
      - Restores original simulation speed (`this.app.clock.setSpeed(this.resumeSpeed)`).
      - Returns keyboard focus to `this.previouslyFocused`.
    - Added keyboard shortcut suppression: bookmark hotkeys (`Shift+!@#$`) are suppressed during text input or when a modal is open.
  - Extended `src/app/App.ts`:
    - Made `onKey(e: KeyboardEvent)` public and hardened shortcut dispatch:
      - Suppresses all world shortcuts when modal is open (only Escape closes modal).
      - When interactive buttons or links (`BUTTON`, `A`, `role="button"`, `role="tab"`) have focus, pressing Space or Enter is delegated to the control natively, preventing accidental world pause or tool triggers.
      - Escape key provides coherent hierarchical cancellation: closes open modal if open, cancels active non-inspect tool back to `inspect` if a tool is armed, or deselects active region if inspecting.
    - Added `this.clock.reset()` in `App.load` to guarantee new worlds and loaded saves start with a clean tick phase.
  - Created test suite `tests/modal_time_keyboard.test.ts` (16 tests):
    - `initializes with default speed 1, paused false, and 0 accumulated ticks`
    - `accumulates fractional time toward the next tick without loss`
    - `pause() freezes accumulator and advance() returns 0 without time drift`
    - `togglePause() preserves accumulator across rapid pause/unpause cycles`
    - `reset() resets accumulator to 0 on world transitions`
    - `caps catch-up work at MAX_TICKS_PER_FRAME to prevent tab sleep bursts`
    - `simulates modal lifecycle preserving speed and accumulated time`
    - `modal opened while game was already paused remains paused on exit`
    - `traps focus between first and last focusable elements on Tab and Shift+Tab`
    - `restores focus to previously focused element when modal closes`
    - `suppresses world pause and actions when focused control is a button or link`
    - `suppresses all world shortcuts when modal is open except Escape`
    - `Escape cancels active tool back to inspect or deselects cell`
    - `verifies Hud.ts has trapFocus, modalOpen pause/resume, and focus return`
    - `verifies App.ts suppresses world shortcuts for focused interactive controls and modalOpen`
    - `verifies clock.ts defines pause(), resume(), and preserves accumulator on setSpeed`
  - Updated `docs/TECHNICAL.md` with Modal, time, and keyboard coherence section.
- **Pass Condition & Evidence:**
  - `bun run test tests/modal_time_keyboard.test.ts` passed 16/16 tests.
  - Total automated test suite expanded to 117 tests passing across 10 files (`tests/sim.test.ts`, `tests/scenarios.test.ts`, `tests/scale.test.ts`, `tests/audit.test.ts`, `tests/authority.test.ts`, `tests/save_compatibility.test.ts`, `tests/save_protection.test.ts`, `tests/scenario_constraints.test.ts`, `tests/forecast_integrity.test.ts`, `tests/modal_time_keyboard.test.ts`).
  - `bun run typecheck` passed with 0 errors.
  - `bun run build` built cleanly.
  - Checkpoint commit: `feat(world-machine): CP08 P004 modal time keyboard coherence`
- **Phase F0 Status:** **COMPLETE**. All 8 proposals in Phase F0 (P061, P062, P071, P082, P002, P003, P001, P004) across Checkpoints CP01–CP08 are fully implemented, tested, verified, and committed.
- **Next Task:** Phase F1 — Proof factory and extensible content backbone (CP09: P007 Automated real-browser journeys).

---

### Checkpoint CP09 — P007: Automated Real-Browser Journeys

- **Proposal:** P007 — Automated real-browser journeys
- **Phase:** F1 (Proof factory and extensible content backbone)
- **Status:** `VERIFIED_LOCAL`
- **Route / Effort:** Build · L
- **Prerequisites:** Phase F0 complete (CP01–CP08 verified), `feat/world-machine-f1` active
- **Implementation Packet:**
  - Installed `@playwright/test@1.64.1` into devDependencies and configured browser binaries (`playwright install chromium`).
  - Added `"test:e2e": "playwright test"` to `package.json`.
  - Configured `playwright.config.ts` targeting Vite dev server with two test execution projects:
    - Desktop `chromium` (1280x720)
    - Mobile touch emulation `mobile-touch` (`Pixel 7`, `hasTouch: true`)
  - Created comprehensive browser test suite `tests/e2e/journeys.spec.ts` exercising 7 end-to-end player journeys:
    - **Journey 1: Boot, title modal, and start steward game**: Tests boot modal presentation, game mode parameters, starting steward world, modal teardown, and world name attachment.
    - **Journey 2: Inspect regions, open drawer, and navigate tabs**: Tests interactive cell selection, inspector opening, and navigation across all 9 inspector tabs (`Region`, `Settlement`, `Ledger`, `Trade`, `Policy`, `Crises`, `Objectives`, `History`, `Compare`).
    - **Journey 3: Policy modification and clock control**: Tests policy modifications (extraction intensity), blurs active controls, and exercises play/pause state transitions.
    - **Journey 4: Strategy comparison ("Fork the future") with fork semantics**: Tests 1-year horizon simulation, comparison metrics table, fork semantics metadata callout, and branch adoption buttons.
    - **Journey 5: Save slots, overwrite protection confirmation, and backup recovery**: Tests saving to slot 1, save toast confirmation, displacement overwrite protection confirmation modal, and cancel flow.
    - **Journey 6: Scenario constraints and terminal boundaries**: Tests scenario initialization (`first_footprint`), scenario objective banner, and authoritative UI disabling of constrained policies (e.g., full autonomy).
    - **Journey 7: Mobile touch drawer collapse and tool parity**: Tests drawer toggle z-index, dynamic viewport initial open/closed state handling, and tool rail activation across mobile and desktop viewports.
  - Hardened mobile UI CSS in `src/styles.css`: added `z-index: 10` to `.drawer-toggle` to guarantee interactive hit-testing above `.tabs` in mobile viewports.
  - Added `playwright-report` to `.gitignore`.
  - Updated `docs/TECHNICAL.md`, `docs/KNOWN_LIMITATIONS.md`, and `OPERATIONAL_STATE.md`.
- **Pass Condition & Evidence:**
  - `bun run test:e2e` passed all 14/14 automated journeys (7 on Desktop Chromium + 7 on Mobile Touch emulation) in 3.1m.
  - `bun run typecheck` passed with 0 errors.
  - `bun run test` passed 117/117 Vitest tests across 10 suites.
  - `bun run build` built production bundle cleanly in 1.88s.
  - Checkpoint commit: `37de3cf0d9ebc9e949895e653ef73e4343b5f904` (pushed to `origin/feat/world-machine-f1`, verified remote SHA equality).
- **Next Task:** Checkpoint CP10 — P008: Performance and lifecycle budgets.

---

### Checkpoint CP10 — P008: Performance and Lifecycle Budgets

- **Proposal:** P008 — Performance and lifecycle budgets
- **Phase:** F1 (Proof factory and extensible content backbone)
- **Status:** `VERIFIED_LOCAL`
- **Route / Effort:** Build · M
- **Prerequisites:** CP09 (P007) completed, `feat/world-machine-f1` active
- **Implementation Packet:**
  - Created `src/sim/budgets.ts` defining formal performance contracts, quantiles calculation (`computeQuantiles`), state array boundary validation (`assertStateBounds`), and graphics lifecycle budgets (`PERFORMANCE_BUDGETS`, `RENDER_LIFECYCLE_BUDGETS`).
  - Created comprehensive benchmark suite `tests/bench.test.ts` (`bun run sim:bench`) exercising 7 benchmark areas:
    - **Startup budget**: World generation verified across 5 seeds (`TERRA-1`, `AEGIS-9`, `BOREALIS-4`, `CYGNUS-7`, `ORION-3`), completing in ~11.8ms average (budget < 150ms).
    - **Tick distribution**: 720-tick (60-year) continuous run sampling each individual month; mean 0.42ms (< 4.5ms budget), p95 0.88ms (< 12.0ms budget), p99 1.94ms (< 25.0ms budget), max spike 4.21ms (< 50.0ms budget).
    - **Scenario execution**: All 5 scenarios verified over 120 ticks each (mean ~0.53ms/tick).
    - **Memory caps**: 1,200 continuous ticks (100 simulated years) verified against strict array caps (`events <= 400`, `metrics <= 600`, `migrations <= 60`, `popHistory <= 120`) and bounded heap growth (< 8.5MB growth vs 30MB limit).
    - **Forecast branching**: 12-month comparison measured at 28.4ms (< 180ms budget); 36-month comparison at 34.2ms (< 500ms budget).
    - **Storage serialization**: Mature world save serialization measured at 3.8ms (< 25ms budget) with 0.32MB payload (< 2MB limit); deserialization measured at 5.1ms (< 35ms budget).
    - **Render lifecycle budgets**: Low, Medium, and High presets validated against strict draw-call, triangle, geometry, and texture limits.
  - Added defensive check in `src/sim/commands.ts` ensuring `cmd.patch` is a valid object.
  - Created documentation `docs/PERFORMANCE_LIFECYCLE_BUDGETS.md` with complete authoritative budget matrices and verified baseline numbers.
  - Updated `OPERATIONAL_STATE.md` and `docs/TECHNICAL.md`.
- **Pass Condition & Evidence:**
  - `bun run sim:bench` passed all 7/7 benchmark suites in 1.92s.
  - `bun run test` passed 124/124 Vitest tests across 11 suites in 3.8s.
  - `bun run typecheck` passed with 0 errors.
  - `bun run build` built production bundle cleanly in 1.03s.
- **Next Task:** Checkpoint CP11 — P073: Seeded property-based testing.

