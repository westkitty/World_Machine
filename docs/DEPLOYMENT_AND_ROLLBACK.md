# Deployment, Release Identity, and Rollback Procedures (P083)

Defines the release pipeline, public receipt verification, post-deploy smoke tests, and non-destructive rollback procedures for *The World Machine*.

---

## 1. Release Architecture & Verification Tiers

Release verification is split into three distinct, non-conflated tiers:

| Tier | Boundary | Artifact / Surface | Verification Gate |
| --- | --- | --- | --- |
| **Tier 1: CI Verification** | Isolated runner (GitHub Actions / local) | `tsc --noEmit`, `vitest run`, `vite build` | 100% exit code 0; zero compile, test, or bundle errors. |
| **Tier 2: Hosted Output** | GitHub Pages CDN distribution (`/World_Machine/`) | Static `dist/` bundle + `dist/deploy-receipt.json` | Public HTTP 200 on `deploy-receipt.json` with matching commit SHA. |
| **Tier 3: End-User Runtime** | Real browser WebGL2 client session | Three.js canvas, HUD, `window.__WORLD_MACHINE_RELEASE__` | WebGL2 context initializes; Title modal displays release badge; zero console exceptions. |

---

## 2. Deploy Receipt Contract

Every production build automatically outputs `dist/deploy-receipt.json` via Vite's `deployReceiptPlugin` (`vite.config.ts`):

```json
{
  "version": "1.0.0",
  "commitSha": "17be84d0f03f5968f8d0c369b5e31c13c6dc20ba",
  "shortSha": "17be84d",
  "buildTimestamp": "2026-10-15T11:38:00.000Z",
  "rulesetVersion": 1,
  "repository": "westkitty/World_Machine",
  "environment": "production"
}
```

### Inspecting the Live Receipt
Anyone can verify the exact commit deployed to production by querying:
```bash
curl -s https://westkitty.github.io/World_Machine/deploy-receipt.json
```

---

## 3. Client-Side Runtime Release Badge

Inside the browser, the release identity is exposed at two levels:
1. **DOM / UI**: The Title screen footer and Settings modal display:
   ```
   v1.0.0 (17be84d, ruleset v1)
   ```
2. **Global Object**: The immutable release metadata is attached to:
   ```javascript
   window.__WORLD_MACHINE_RELEASE__
   ```

---

## 4. Post-Deploy Smoke Test

Following each production deployment, the smoke test verifies that the live site is operational and matches the deployed commit:

```bash
# Verify receipt matches expected commit
LIVE_SHA=$(curl -s https://westkitty.github.io/World_Machine/deploy-receipt.json | jq -r .commitSha)
EXPECTED_SHA=$(git rev-parse HEAD)

if [ "$LIVE_SHA" = "$EXPECTED_SHA" ]; then
  echo "Deploy verified: Live SHA matches HEAD ($LIVE_SHA)"
else
  echo "Deploy mismatch: Live SHA ($LIVE_SHA) != HEAD ($EXPECTED_SHA)"
fi
```

Headless browser smoke test:
```bash
bun run test:e2e
```

---

## 5. Prior-Build Rollback Procedure

In accordance with Antigravity Core Doctrine, **force-pushing or rewriting Git history on `main` is strictly forbidden**. All rollbacks must be forward-moving, auditable, and deterministic.

If a critical regression is discovered in a deployed release:

### Step 1: Identify the Known-Good Target Commit
Find the SHA of the last verified working release:
```bash
git log -5 --oneline
```

### Step 2: Create a Forward-Reverting Commit
Revert the faulty commit cleanly:
```bash
# Revert single faulty commit
git revert <faulty_commit_sha> --no-edit

# Or if reverting a range back to target SHA:
git revert --no-commit <faulty_commit_sha>..HEAD
git commit -m "revert: rollback release to <target_known_good_sha>"
```

### Step 3: Run Full Local Verification Pipeline
Verify that tests pass, build succeeds, and receipt updates:
```bash
bun run typecheck && bun run test && bun run build && bun run sim:bench
```

### Step 4: Push Rollback to Main
```bash
git push origin main
```

### Step 5: Verify Post-Rollback Receipt
Wait for GitHub Actions Pages deployment to finish, then verify:
```bash
curl -s https://westkitty.github.io/World_Machine/deploy-receipt.json
```
Verify that `commitSha` matches the rollback commit.
