# The World Machine — Meaningful-Intervention Design Audit

**Proposal:** P062 · **Phase:** F0 (Foundation) · **Authority:** `src/sim/commands.ts`

## 1. Executive Summary & Design Purpose

*The World Machine* casts the player as a civilizational planetary steward rather than an omnipotent city-builder or micromanaging ruler. Every intervention must be meaningful: it represents a significant, high-leverage allocation of planetary focus and civilizational effort.

This design audit inventories all twelve authoritative player commands defined in `src/sim/commands.ts`. For each action, this audit establishes:
1. **Core Intent & Mechanics**: What the command changes in authoritative state.
2. **Cost & Prerequisites**: Direct resource debits and geographic/demographic requirements.
3. **When Preferable**: Specific civilizational conditions where this action is the optimal choice.
4. **When an Alternative is Preferable**: Specific scenarios where a different strategy is superior, naming the exact alternative.
5. **Delayed Effects**: Downstream, multi-month consequences across simulation ticks.
6. **Player Feedback Loops**: Exactly how the player learns the immediate outcome and verifies ongoing impacts.

---

## 2. Comprehensive Action Inventory & Decision Matrix

---

### Action 1: `found` (Found New Regional Settlement)

- **Mechanics:** Claims an uninhabited land region and establishes a new autonomous settlement with 500 initial settlers and a starter supply stockpile.
- **Cost & Prerequisites:**
  - Cost: 500 population, 2,500 food, 1,000 water, 1,200 timber, 600 ore from the sending settlement.
  - Prerequisites: Target cell must be land, unowned, not ice/mountain/water, and within reach of a source settlement with $> 1,250$ population. In an opening expedition (`state.expedition`), settlers land directly without an existing source settlement.
- **When Preferable:**
  - Establishing a foothold on a resource-rich frontier (e.g. rich ore deposits, high-fertility river valleys, or coastal natural harbors).
  - Relieving severe overpopulation/crowding in an established settlement whose housing is maxed out.
- **When an Alternative is Preferable:**
  - *Alternative:* Expand regional infrastructure (`build`) or adjust labor policy (`laborFocus`) in existing settlements.
  - *Rationale:* If the home settlement has fragile reserves ($< 5\text{ months}$ buffer), drawing down 500 workers and 2,500 food risks triggering immediate starvation or labor shortages at home.
- **Delayed Effects:**
  - Over months 1–12, the new settlement dynamically annexes up to 12 neighboring regions into its territory, drawing labor and local resources.
  - Establishes a permanent kinship bond (`setKinship`) that boosts bilateral trade cooperation and migration affinity.
- **Player Feedback:**
  - *Immediate:* Toast notification: `"{Name} founded with 500 settlers and supplies from {Source}"`; new 3D settlement marker on globe.
  - *Medium-term:* Settlement tab lists new community; population graph begins recording monthly births, deaths, and migration.
  - *Event Log:* Green positive event recorded in `state.events`.

---

### Action 2: `build` (Construct Regional Infrastructure Complex)

- **Mechanics:** Initiates construction of a landscape-scale complex (`farm`, `storage`, `energy`, `mine`, `port`, `hospital`) in a territory region.
- **Cost & Prerequisites:**
  - Cost: 300–600 timber, 150–350 ore; construction duration of 2 to 6 months.
  - Prerequisites: Cell must be owned by the settlement, have $< 2$ existing buildings, not be an active ecological reserve, and meet type-specific geographic constraints (e.g. `mine` requires ore deposit; `port` requires coastal; `farm` requires fertile land).
- **When Preferable:**
  - Relieving chronic structural deficits (e.g. food deficits requiring a farm; storage bottlenecks capping trade surpluses; energy needed for industrial efficiency).
- **When an Alternative is Preferable:**
  - *Alternative:* Open an inter-regional trade route (`route`) or import goods from a neighboring partner with excess production.
  - *Rationale:* Constructing a mine in a region with poor geological deposits ($< 500\text{ ore}$) yields negligible returns compared to trading with an upland mining settlement.
- **Delayed Effects:**
  - Monthly construction progress advances during `engine.step`. Upon completion, state transitions from `'construction'` to `'active'`.
  - Active complexes consume monthly maintenance resources; if neglected, condition degrades towards ruin.
- **Player Feedback:**
  - *Immediate:* Region inspector lists complex with progress counter (e.g. `Farm — building 1/3 mo`).
  - *Monthly:* Settlement production table in Ledger reflects increased output upon completion.

---

### Action 3: `demolish` (Demolish Infrastructure Complex)

- **Mechanics:** Dismantles an obsolete, damaged, or misplaced building, salvaging up to 25% of its timber cost based on remaining condition.
- **Cost & Prerequisites:**
  - Cost: Destruction of the building and loss of remaining invested resources.
  - Prerequisites: Structure must exist in the target region.
- **When Preferable:**
  - Freeing up one of the region's 2 complex slots for a higher-priority installation (e.g. replacing an exhausted mine with a high-capacity storehouse or hospital).
  - Removing a heavily ruined building ($< 30\%$ condition) that drains maintenance without producing significant output.
- **When an Alternative is Preferable:**
  - *Alternative:* Designate the region as an ecological reserve (`conserve`), which temporarily idles the complex without destroying it.
  - *Rationale:* If the shutdown is temporary (e.g. during a multi-year drought), demolishing destroys capital that must be expensively rebuilt later.
- **Delayed Effects:**
  - Immediately stops ongoing maintenance drains; frees complex slot for future development.
- **Player Feedback:**
  - *Immediate:* Toast notification; structure vanishes from region panel; salvaged timber credited to settlement inventory.

---

### Action 4: `road` (Construct Inter-Regional Highway)

- **Mechanics:** Engineers a durable ground transport corridor linking the centers of two adjacent land regions.
- **Cost & Prerequisites:**
  - Cost: 250 timber per 1,000 km of road length; 2 months construction time.
  - Prerequisites: Both cells must be land; at least one must belong to a settlement with sufficient timber.
- **When Preferable:**
  - Connecting two inland settlements separated by rough wilderness, significantly shortening transit times and reducing transit cargo loss.
- **When an Alternative is Preferable:**
  - *Alternative:* Open a coastal shipping route (`route`) using seafaring ports.
  - *Rationale:* For long-distance connections bordering open sea, marine shipping routes avoid overland road construction costs entirely.
- **Delayed Effects:**
  - Upgrades path segments in Dijkstra graph from rough terrain to paved highways.
  - Existing and future overland trade routes recalculate travel time and lower goods loss rates.
- **Player Feedback:**
  - *Immediate:* Status message confirming road construction began; 3D highway visual rendered between region centers.
  - *After 2 months:* Road completes and displays solid surface texture on globe and atlas.

---

### Action 5: `route` (Establish Bilateral Trade Route)

- **Mechanics:** Opens an active commercial corridor between two settlements over paved highways, wilderness trails, or sea lanes.
- **Cost & Prerequisites:**
  - Cost: $150 + \text{distanceKm} / 40$ timber paid by the initiating settlement.
  - Prerequisites: Both settlements must be alive; a valid Dijkstra path (land or sea) must exist; route must not already exist.
- **When Preferable:**
  - Connecting complementary regional economies (e.g. an agricultural valley settlement trading surplus food to a mountain mining community for ore).
  - Cultivating deep diplomatic ties (cooperation increases monthly as trade flows smoothly).
- **When an Alternative is Preferable:**
  - *Alternative:* Rebalance domestic labor focus (`laborFocus`) or build local production complexes (`build`).
  - *Rationale:* If distance exceeds $4,000\text{ km}$, high travel times ($> 4\text{ months}$) and elevated cargo loss rates make long-distance emergency relief ineffective for immediate starvation.
- **Delayed Effects:**
  - Monthly trade engine evaluates bilateral surplus/deficit reserves; dispatches physical shipment packets that travel over multiple months.
  - Bilateral cooperation metric steadily climbs toward 1.0.
- **Player Feedback:**
  - *Immediate:* Toast notification; 3D trade corridor drawn on globe with moving shipment pulses.
  - *Monthly:* Settlement Ledger displays incoming and outgoing trade volumes; trade panel graphs bilateral trade balances.

---

### Action 6: `removeRoute` (Terminate Trade Route)

- **Mechanics:** Closes an existing commercial shipping corridor.
- **Cost & Prerequisites:**
  - Cost: Loss of original opening capital; no ongoing financial penalty.
  - Prerequisites: Route must exist.
- **When Preferable:**
  - Closing a route that has become hazardous or counterproductive (e.g. exporting food during a local drought or shipping goods across a crisis-stricken region).
- **When an Alternative is Preferable:**
  - *Alternative:* Restrict specific cargo types via `routeGoods`.
  - *Rationale:* Restricting goods prevents food or timber drainage while maintaining the route infrastructure for other commodities and preserving diplomatic relations.
- **Delayed Effects:**
  - No new shipments will depart along this corridor; existing in-transit shipments complete their voyages normally.
- **Player Feedback:**
  - *Immediate:* Toast message: `"Route closed. Cargo already under way will still arrive."`; corridor removed from globe.

---

### Action 7: `routeGoods` (Filter Permitted Trade Goods)

- **Mechanics:** Restricts the set of goods permitted to travel along an active route (`food`, `water`, `timber`, `ore`).
- **Cost & Prerequisites:**
  - Cost: Free.
  - Prerequisites: Route must be active.
- **When Preferable:**
  - Preventing critical local resources (e.g. food or freshwater) from being exported during shortages while continuing to export industrial surpluses (ore, timber).
- **When an Alternative is Preferable:**
  - *Alternative:* Increase the planetary reserve threshold (`policy` with `reserveMonths: 6+`).
  - *Rationale:* If the shortage affects all settlements globally, setting a higher planetary reserve target protects every community automatically without micromanaging individual routes.
- **Delayed Effects:**
  - From the following month onward, trade engine checks the route's allowed goods list before scheduling shipments.
- **Player Feedback:**
  - *Immediate:* Checkboxes update in Trade inspector; toast message confirms active cargo categories.

---

### Action 8: `policy` (Stewardship Policy Directives)

- **Mechanics:** Directs planet-wide civilizational parameters: extraction intensity (`conserve`, `normal`, `intensive`), rationing (`true`/`false`), population growth stance (`curb`, `neutral`, `encourage`), autonomy level (`full`, `delegated`, `guided`, `directed`), trade priority ordering, and reserve storage months ($1\text{ to }12$).
- **Cost & Prerequisites:**
  - Cost: Systemic tradeoffs across civilizational wellbeing, ecological degradation, and production output.
  - Prerequisites: Scenario constraints must allow policy modification (e.g. certain scenarios enforce strict ecological or autonomy rules).
- **When Preferable:**
  - Setting macro-level strategy: enacting rationing during planetary droughts; restricting extraction to allow ecological recovery; prioritizing food and water in trade during famines.
- **When an Alternative is Preferable:**
  - *Alternative:* Local targeted interventions (e.g. designating a specific regional reserve via `conserve` or adjusting local `laborFocus`).
  - *Rationale:* Enacting planetary rationing drops wellbeing across *all* settlements, even thriving ones that do not need emergency conservation.
- **Delayed Effects:**
  - Affects production, consumption, health, and wellbeing formulas globally across all future monthly simulation steps.
- **Player Feedback:**
  - *Immediate:* Policy panel controls update instantly; confirm toast appears.
  - *Monthly:* Global ledger metrics (wellbeing, health, reserve stocks) reflect policy impacts over subsequent years.

---

### Action 9: `conserve` (Designate Ecological Reserve)

- **Mechanics:** Declares a land region as a protected ecological reserve, forbidding foraging, farming, forestry, and mining, and idling non-storage complexes.
- **Cost & Prerequisites:**
  - Cost: Complete cessation of resource extraction and idled production in that region.
  - Prerequisites: Must be a land region; settlement centers cannot be designated reserves.
- **When Preferable:**
  - Reversing acute ecological collapse: when regional degradation exceeds $50\%$ or vegetation biomass has been overharvested near zero.
- **When an Alternative is Preferable:**
  - *Alternative:* Adopt global conservation extraction policy (`policy` with `extraction: 'conserve'`) or research reforestation (`research: 'reforestation'`).
  - *Rationale:* If degradation is moderate and widespread across an entire continent, a global conservation policy protects all regions without shutting down critical local infrastructure completely.
- **Delayed Effects:**
  - Accelerated monthly soil recovery ($+2\times$) and vegetation regrowth; zero new degradation or industrial pollution generated.
- **Player Feedback:**
  - *Immediate:* Region header receives a green `Reserve` badge; toast confirms idled complexes.
  - *Monthly:* Region ecology meters (soil, vegetation, degradation) show upward recovery trends.

---

### Action 10: `research` (Fund Technology Discovery)

- **Mechanics:** Directs a settlement to fund long-term civilizational technology research across 9 domains (e.g. `irrigation`, `crop_rotation`, `masonry_roads`, `deep_mining`, `clean_energy`, `seafaring`, `cold_storage`, `reforestation`, `water_reclamation`).
- **Cost & Prerequisites:**
  - Cost: Upfront settlement goods (e.g. 500–1,500 timber/ore); research duration of 12 to 36 months.
  - Prerequisites: Tech must not already be researched or currently in progress; funding settlement must possess required resources.
- **When Preferable:**
  - During periods of civilizational stability and surplus when communities have adequate stockpiles to invest in permanent, global productivity bonuses.
- **When an Alternative is Preferable:**
  - *Alternative:* Spend materials on immediate physical infrastructure (`build` farms, storage, or roads).
  - *Rationale:* If a settlement is facing imminent food or water shortages within the next 3 months, locking up 800 timber in a 24-month research project accelerates immediate collapse.
- **Delayed Effects:**
  - Advances monthly until completion; upon finishing, unlocks permanent planetary multipliers (e.g. $+25\%$ crop yields, $-30\%$ road costs, or $+40\%$ storage capacity).
- **Player Feedback:**
  - *Immediate:* Tech tree item displays active progress bar; event logged.
  - *Upon Completion:* Toast notification, event log announcement, and permanent formula adjustments across the entire planet.

---

### Action 11: `respond` (Mobilize Crisis Response)

- **Mechanics:** Executes an emergency intervention against an active planetary crisis (`epidemic`, `blight`, `drought`, `mine_collapse`, `famine`).
- **Cost & Prerequisites:**
  - Cost: Emergency resource expenditure (e.g. medical supplies, relief shipments, emergency equipment) paid by an able settlement.
  - Prerequisites: Crisis must be active and not already responded to; a settlement within range must have sufficient resources.
- **When Preferable:**
  - Preventing catastrophic loss of life or collapse of critical infrastructure when a crisis strikes a vulnerable community.
- **When an Alternative is Preferable:**
  - *Alternative:* Allow the crisis to resolve naturally while mitigating downstream impacts via trade routes and stockpiles.
  - *Rationale:* If the donor settlement's own food/water reserves are barely above subsistence thresholds, sending relief can trigger a secondary famine at home.
- **Delayed Effects:**
  - Shortens crisis duration, restores health metrics, prevents structural collapse, or transfers emergency food supplies.
- **Player Feedback:**
  - *Immediate:* Crisis card displays `Responded` status with outcome summary; event logged; toast notification confirms relief dispatch.

---

### Action 12: `laborFocus` (Direct Settlement Labor Focus)

- **Mechanics:** Focuses a community's labor force on a specific economic sector (`balanced`, `food`, `water`, `timber`, `ore`, `energy`).
- **Cost & Prerequisites:**
  - Cost: Reallocates labor away from other sectors, potentially creating secondary shortages.
  - Prerequisites: Settlement must be alive.
- **When Preferable:**
  - Overcoming a severe single-resource bottleneck (e.g. acute water shortage during dry season) where maximum extraction is urgently required.
- **When an Alternative is Preferable:**
  - *Alternative:* Keep `balanced` labor focus and import the deficient good via trade route (`route`).
  - *Rationale:* `balanced` optimizes extraction based on comparative regional advantage; forcing a desert settlement to focus on food produces dismal yields compared to trading for food from a fertile neighbor.
- **Delayed Effects:**
  - Takes effect on the very next monthly simulation tick; shifts labor allocation counters and production rates across all goods.
- **Player Feedback:**
  - *Immediate:* Dropdown in Settlement panel updates; labor chips display redistributed worker counts.

---

## 3. Consolidation Analysis

An evaluation of all twelve commands indicates:
1. **Zero Redundancy in Core Actions:** Each of the 12 commands addresses a distinct level of planetary stewardship—from macro planetary policy directives (`policy`) to regional infrastructure investments (`build`, `demolish`, `road`, `conserve`), inter-community networks (`route`, `removeRoute`, `routeGoods`, `found`), and emergency or strategic interventions (`research`, `respond`, `laborFocus`).
2. **Clear Boundaries:** Macro policy changes do not obsolete local decisions; local infrastructure cannot replace inter-regional trade; emergency responses do not duplicate routine economic production.
3. **Conclusion:** All existing actions serve non-overlapping strategic purposes. No actions should be deleted or merged; the current 12-action architecture is cohesive, expressive, and robust.
