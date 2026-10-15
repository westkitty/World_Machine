# ANTI-GRAVITY — WORLD MACHINE 84-PROPOSAL EXECUTION CONTRACT

**EXECUTOR:** Google Anti-Gravity IDE coding agent, on Andrew's MacBook Air, with explicit access to the real local Git worktree and standard build/test tools.

**MISSION:** Implement, validate and incrementally push all 84 accepted improvement obligations P001–P084 for the EXISTING World_Machine browser game, in the exact sequence fixed by the two accompanying source documents. This is a multi-session, multi-release undertaking. Never claim full completion from partial execution. Continue across resumable checkpoints without resetting work.

## PRIMARY SOURCE ROUTE — GOOGLE DRIVE MACBOOK

Use this variant when the local working documents are unavailable but Google Drive is connected. Open the REAL Google Drive folder https://drive.google.com/drive/folders/1RSaSsHG2SWwnQv5AlWSr5OLPfrIvurS7 (Google Drive `macbook/World_Machine`), fetch the two exact Markdown source files and verify hashes. Mirror each to `/Users/andrew/World_Machine/` ONLY if there is no conflicting local file; do not overwrite divergent local user data. If Drive cannot be read, use byte-verified files already in `/Users/andrew/World_Machine`. The Git worktree and build commands must run LOCAL on the MacBook, never inside a Drive folder.

## Authoritative project identities

- Local existing Git worktree: `/Users/andrew/World_Machine` (verified October 15, 2026); it is already a Git repo, not a place to clone over.
- Repository remote: `git@github.com:westkitty/World_Machine.git`, web identity `https://github.com/westkitty/World_Machine`.
- Initial planning commit only (NOT an automatic reset target): `cc1eb5f0218c41ac094ed13d597492e407d3e59d`.
- Starting local branch at plan time: `feat/initial-world-machine`. Inspect live branch/HEAD first; they may have legitimately changed.
- Existing stack: Vite 7.3.7, TypeScript 5.9.3, Three.js 0.186.1, Vitest 3.2.7, bun; browser-rendered spherical 642-region deterministic simulation. Do NOT change renderer, framework, package manager, topology or authoritative simulation owner without an independently justified and explicitly authorized migration.
- Source documents: `WORLD_MACHINE_84_PROPOSAL_IMPLEMENTATION_MASTERPLAN.md` and `WORLD_MACHINE_84_ITEM_EXECUTION_COVERAGE_LEDGER.md`.
- Repo controls: `OPERATIONAL_STATE.md`, `docs/TECHNICAL.md`, `docs/VALIDATION.md`, `docs/KNOWN_LIMITATIONS.md`, `README.md`, `.github/workflows/pages.yml`.


## Canonical SHA-256 of governing documents

- `WORLD_MACHINE_84_PROPOSAL_IMPLEMENTATION_MASTERPLAN.md`: `7f490764b2e556d23ae868e93d16c8b969599dec32fd4e702c9b49a2dfc6ac2e`
- `WORLD_MACHINE_84_ITEM_EXECUTION_COVERAGE_LEDGER.md`: `bbf9c871a2ee3997c15f467d80786d07199c4643377353f9c3a3b317a9cb4dd9`

Only the ORIGINAL plan and coverage ledger use these hashes. This execution prompt has its own independent hash and may be updated with user approval. If the original plan/ledger source docs have an explicitly owner-approved newer version, record its distinct SHA and provenance before replacing this contract's baseline; never overwrite automatically.

## Source verification BEFORE ANY EDIT

1. Open the exact two source documents, read them entirely, and verify they are substantive and not stub files. Compute SHA-256 of each available copy, and compare to the canonical hashes listed below.
2. If source locations differ, prefer byte-identical copies. If both differ from the canonical hashes and the user did not supply an explicit newer approval, **STOP** and report which content differs. Never silently reconcile two conflicting specifications.
3. Read the local `OPERATIONAL_STATE.md`, technical/limitations/validation docs, `package.json`, lockfile, entry point, engine/timing, `src/sim/commands.ts`, `src/sim/save.ts`, compare, app, renderer, UI, audio, and tests. Inspect additional files only when affected by the next packet.
4. Inspect `git status --porcelain=v1`, `git branch --show-current`, `git rev-parse HEAD`, `git remote -v`, `git log -5 --oneline`, `git fetch origin`, `git ls-remote --heads origin main`, and `git rev-parse origin/main`. Verify correct machine, repo, user and remote. On any dirty files, preserve them, list their paths, never reset/clean/stash/overwrite; if unrelated user edits would collide with a packet, mark that packet BLOCKED and continue only independent safe work.
5. Establish a baseline with `bun --version`, `node --version`, `bun run typecheck`, `bun run test`, `bun run build`. Capture command outputs, test counts, and a baseline browser journey before modifying simulation or UI. If expected prerequisites are missing, install only the declared project dependencies in the existing package manager and keep lockfile changes scoped and reviewed. Do not install Docker.
6. Export and archive representative v1 save fixtures BEFORE schema mutations, including RNG, 3 manual slots/autosave behavior, scenario and challenge state where representable; use local test data and never copy personal saves into the public repository.
7. Record baseline screenshots/visually inspect the actual globe, controls, menu, scenarios and graphics with a real browser; browser-open alone does not prove interaction. If no browser tool is available, log the gap and block any UI-relevant production push.

## Permission and Git integrity fence

The user explicitly authorizes work **on this repository**, with repeatable staging, commits, and pushes to NEW FEATURE BRANCHES after passing the gates. This is NOT permission for force-push, user-data deletion, repository history rewrite, replacing unrelated branches, changing remotes, deleting files/assets, pushing to `main`, merging to `main`, changing access or credentials, publishing to Pages, or shipping silent schema breakage. GitHub Pages auto-deploys from main; do not cross that deployment boundary by accident.

Never run `git reset --hard`, `git clean -fd`, `git push --force`, `git rebase` of shared history, destructive stashing, broad delete/recreate of source tree, or commands intended to erase local edits. Avoid unreviewed `git add .` and `git add -A`; instead list exact changed paths and stage only tested files.

Do not make untested changes just to create a commit. One failed test stops the current checkpoint. Repair the direct failure once; rerun failed and regression checks. If still failing, log BLOCKED, preserve the candidate branch with local uncommitted work, and DO NOT commit or push it. Do not claim 'COMPLETE' or 'VERIFIED' from source inspection or passing TypeScript alone.

## Required invariants, all phases

A. **Game identity:** The user is a steward, not a ruler. Preserve real spherical 3D planet, existing styles/controls, all original gameplay functionality, four original modes (Sandbox/Scenario/Observer/Challenge), all five scenarios and challenge variants; do not replace this with a new project or a simplified mockup.
B. **Engine:** `src/sim` remains pure deterministic monthly logic with single authoritative simulation state, reproducible seeded sfc32 RNG and ledger accounting. Simulation should not import Three.js/DOM. Render/UI always derive from simulation state, not the reverse.
C. **Economy and people:** No negative or nonfinite stocks, duplicated shipments, lost/created population or exploitably free materials. Every addition must expose conservation rules, units, costs, failure handling and reproducible test seeds.
D. **Persistence:** Preserve v1 saves, 3 manual slots, autosave, import/export, world seed, RNG and scenario outcomes; migration on every persistent field/semantic schema change, with an immutable historical fixture. Never touch browser user data through test cleanup.
E. **User journeys:** Title/start mode, sphere rotate/zoom/inspect/found/road/route/reserve, policy/research, scenario objective/terminal, compare/adopt, pause/step/speed, save/load/import/export, desktop/keyboard/touch, audio/mute and reduced-motion pathways remain functional. Test all affected paths after each checkpoint.
F. **Visual:** Preserve legibility and coherent aesthetic; no fabricated visual causal claims, missing assets or blank view. Three.js context-loss, resize/DPR, resource disposal, audio/visibility/focus handling must remain correct.
G. **Operational:** No mandatory service/CDN/network accounts for normal gameplay; test new offline/PWA versions before describing them as working. Avoid unnecessary dependencies, global state, telemetry and engine rewrites.

## The exact completion model

The master plan is the source of truth for phase goals, dependencies, implementation packets, and acceptance checks. The coverage ledger contains EVERY P001–P084 row and is the binding item-by-item contract. For each row use this sequence, without improvising scope:

1. Select the next unfinished row by listed F0→F9 order (NOT ascending P number), verify prerequisite rows are `VERIFIED_LOCAL` or stronger according to the required type of evidence, and validate whether it is `Build`, `Repair`, `Audit`, `Prototype then build`, or ongoing human playtesting.
2. Write a bounded implementation test FIRST: fixture + positive expected behavior + negative/regression case derived from that row's acceptance text. Prefer exact existing source modules and current project conventions; no speculative new engine/renderer/dependencies.
3. Implement the minimum complete change to make the new behavioral test pass. Where a phase introduces a new persisted field, update version/migration/validators/fixtures. Where it introduces a new action, update authoritative commands and UI parity. Where it adds a visual, use data-backed mapping and inspect actual output.
4. For prototype-gated items, use a separate opt-in feature flag or isolated test harness, run the experiment defined in the master plan, and apply its stop signal. A proven prototype must still be integrated and re-verified before calling the row implemented. If the signal fails, try one bounded revision, then mark BLOCKED and leave baseline gameplay unchanged; do NOT silently reduce scope or choose a substitute.
5. Run validation exactly as specified below and record real evidence. Check all prior high-risk invariants and the closest three already-passing user journeys; any failure is a regression veto.
6. Update `docs/implementation/WORLD_MACHINE_RUN_LEDGER.md` with row ID, stage, status, branch/commit, tests, proof paths, fixtures, migrations, known limitations, and next task. Update `OPERATIONAL_STATE.md` only after meaningful verified changes, while retaining known unresolved problems.
7. Only after success of the entire predeclared Git checkpoint group, stage precisely reviewed paths, create one semantic commit, push this same verified SHA to the active feature branch, and verify remote SHA. Proceed to next checkpoint; do not defer hundreds of uncommitted changes.

If validation is blocked by machine/browser resources, preserve a resumable checkpoint: exact last successful row, current branch and HEAD, dirty file list, known failing test, output paths, environment limitation, and next single command. Never invent success.

## Deterministic phase order (do not reorder)

**F0:** P061, P062, P071, P082, P002, P003, P001, P004.
**F1:** P007, P008, P073, P072, P074, P075, P083, P084.
**F2:** P005, P006, P077, P078, P079, P080, P081.
**F3:** P065, P066, P069, P070, P025, P068, P067, P033.
**F4:** P035, P036, P037, P038, P032, P039, P041, P043, P044.
**F5:** P046, P047, P012, P023, P024, P042, P048, P049, P045.
**F6:** P015, P027, P017, P016, P018, P019, P013, P030, P063, P028.
**F7:** P020, P021, P022, P029, P040, P026, P055.
**F8:** P050, P051, P052, P053, P054, P009, P010, P011, P014, P076.
**F9:** P056, P058, P057, P031, P034, P059, P060, P064.

The predefined Git checkpoint groups, in exact chronological order, are:

**F0 — 8 commits / pushes:** `CP01=P061`, `CP02=P062`, `CP03=P071`, `CP04=P082`, `CP05=P002`, `CP06=P003`, `CP07=P001`, `CP08=P004`.

**F1 — 8 commits / pushes:** `CP09=P007`, `CP10=P008`, `CP11=P073`, `CP12=P072`, `CP13=P074`, `CP14=P075`, `CP15=P083`, `CP16=P084`.

**F2 — 6 commits / pushes:** `CP17=P005`, `CP18=P006`, `CP19=P077`, `CP20=P078+P079`, `CP21=P080`, `CP22=P081`.

**F3 — 6 commits / pushes:** `CP23=P065`, `CP24=P066+P069`, `CP25=P070+P025`, `CP26=P068`, `CP27=P067`, `CP28=P033`.

**F4 — 6 commits / pushes:** `CP29=P035+P036`, `CP30=P037+P038`, `CP31=P032`, `CP32=P039`, `CP33=P041+P043`, `CP34=P044`.

**F5 — 7 commits / pushes:** `CP35=P046`, `CP36=P047`, `CP37=P012`, `CP38=P023`, `CP39=P024+P042`, `CP40=P048+P049`, `CP41=P045`.

**F6 — 9 commits / pushes:** `CP42=P015`, `CP43=P027`, `CP44=P017`, `CP45=P016`, `CP46=P018`, `CP47=P019`, `CP48=P013`, `CP49=P030+P063`, `CP50=P028`.

**F7 — 7 commits / pushes:** `CP51=P020`, `CP52=P021`, `CP53=P022`, `CP54=P029`, `CP55=P040`, `CP56=P026`, `CP57=P055`.

**F8 — 9 commits / pushes:** `CP58=P050`, `CP59=P051+P052`, `CP60=P053`, `CP61=P054`, `CP62=P009`, `CP63=P010`, `CP64=P011`, `CP65=P014`, `CP66=P076`.

**F9 — 7 commits / pushes:** `CP67=P056+P058`, `CP68=P057`, `CP69=P031`, `CP70=P034`, `CP71=P059`, `CP72=P060`, `CP73=P064`.

**Checkpoint rule:** Complete all IDs in the named checkpoint group before staging/committing/pushing it. Every group is limited to one or two tightly adjacent items; high-impact schema or architecture work is isolated. Never combine multiple checkpoint groups into one opaque commit. If one member fails, do not push the group. After each phase, publish an evidence-only phase receipt on the same feature branch if its exit gate is met.

**Naming policy:** Use one feature branch per phase, `feat/world-machine-f0` through `feat/world-machine-f9`, created from the latest verified local/remote *feature integration tip* that does not discard newer user work. For first phase, start from a verified `origin/main` or same-SHA checked-out baseline, AFTER checking dirtiness. Later phases branch from the preceding phase's verified pushed tip, not an unrelated outdated main. Do not rebase/reset an existing branch; if a same-named branch exists, inspect and reuse only when it is the verified continuation, otherwise stop for target conflict. Build should not assume main has caught up with earlier feature branches.

**Exact commands** (run from `/Users/andrew/World_Machine`, and only if `bun`, `git`, and the expected scripts are present):

```bash
pwd
git status --porcelain=v1
git branch --show-current
git rev-parse HEAD
git remote -v
git fetch origin
bun run typecheck
bun run test
bun run build
```

Before a stage/push, inspect `git diff --check`, `git diff --stat`, `git diff -- <exact affected files>`, plus new-file contents (untracked files do not appear in ordinary `git diff`). Confirm no secret material, removed existing features, unrelated formatting/rewrite, new runtime dependency without review, or misplaced generated files. Stage with `git add -- <each exact authorized file>`; verify `git diff --cached --check` and `git diff --cached --stat`. Commit message format: `feat(world-machine): CPnn Pxxx[+Pyyy] — <accurate outcome>` (use `fix`, `test`, or `docs` when appropriate). Run `git show --stat --oneline HEAD`; push with `git push -u origin <exact verified feature branch>` and immediately verify remote branch SHA via `git ls-remote --heads origin <branch>`.

**Tests per checkpoint:**

1. Affected Vitest unit/property/invariant tests (using current scripts or direct `bunx vitest run <verified existing test path>`); all active deterministic fixtures, negative conditions and appropriate old-save tests.
2. `bun run typecheck`, `bun run test`, `bun run build` *before every commit/push*, not once per phase. If a script name changed, inspect package.json first, then use its real replacement; never guess a test passed.
3. As soon as P007 installs a real browser harness, run relevant browser journeys against the built candidate on desktop Chromium and Firefox/WebKit where installed, including simulated touch. Separate physical-device results from emulation, and block mobile-specific release claims without device evidence.
4. As soon as P008 establishes benchmarks, run the representative p95 frame/tick and memory comparisons on a named hardware/browser/profile, report deltas and blocked metrics. Do not automatically fail an unrelated docs change for an unavailable graphics benchmark, but never mark a claimed visual/performance improvement verified without its measurements.
5. At phase exits, run EVERY scenario and mode, import a saved v1 fixture, run compare/adopt, browser and graphics lifecycle tests, final build and current CI. If any regression is unverified, the phase is `BLOCKED`, not releasable.
6. For P075, uncoached human playtesting cannot be automated away. Build the consent-safe test scripts/observation protocol, report `HUMAN_VALIDATION_PENDING` until humans actually test it. Dependent claims of improved comprehension or fun cannot be asserted from synthetic feedback.

**Finish definition:** Each of 84 records has a working feature or explicitly user-approved revised scope AND the stated acceptance evidence; all old journeys pass; historical save migration and production build are demonstrated; per-phase feature branches were pushed and their SHA verified; the game is demonstrably playable on the tested targets. Otherwise the overall result is `PARTIAL` with exact remaining IDs and next command. `main` merge/Pages publication remains a separate, explicit production gate.

## Nonnegotiable bounded failure behavior

- If a proposed system would destroy working features, stop and make a smaller compatible implementation; do not rewrite the engine under an 'upgrade' rationale.
- If the plan is internally inconsistent or physically impossible as written, record exact contradictory proposal IDs, affected invariant, reproduction/proof, and nearest safe option. Seek owner decision only for a genuine blocking tradeoff; do not invent it.
- If the network/GitHub is unreachable, complete only local verified units, do not claim pushed; record a push-pending receipt with branch/SHA.
- If Drive source is unreachable but the two verified local documents exist, use local copies. If both are absent or mismatched, STOP instead of using paraphrases from memory.
- No merge of `main`, no Pages publish, no force-push, no deletion of unowned data, no security regression, no hidden test suppression.
- Stop automatically at the end of the current Anti-Gravity session/context/runtime budget, with a durable run-ledger checkpoint. On later runs, continue from the first unverified stage, never regenerate all completed work.

## Compact per-checkpoint report (mandatory)

`Checkpoint CPnn | P IDs | actual paths changed | tests/fixtures/browser/device evidence | migration status | no-regression verdict | local commit SHA | verified remote SHA or PUSH_PENDING | next checkpoint or blocker`

Do not output lengthy exploration diaries or imagined performance numbers. SHOW the user the actual updated playable game and progress whenever the current run can verify it, not merely a source-code diff or a screenshot.
