# Human Playtest Program Protocol (P075)

Standardized, uncoached human playtest methodology, feedback rubrics, and privacy-safe local diagnostics for *The World Machine*.

---

## 1. Core Operating Philosophy

The World Machine is a planetary civilization simulation designed to reward long-range stewardship over short-term exploitation. Playtests must establish whether human players:
1. Experience authentic stewardship agency (steward rather than ruler).
2. Perceive transparent, deterministic causality behind crises, prosperity, and ecological decay.
3. Can resume play after saving without cognitive disorientation.
4. Uncover mechanics naturally without intrusive tutorial coaching.

---

## 2. Uncoached Protocol Rules

To prevent observer bias or leading questions, facilitators must adhere strictly to these rules:
- **No Prompting or Leading**: Facilitators never suggest which button to click, which policy to set, or how to resolve a crisis.
- **Silent Observation**: Questions from the player ("What does reserve months do?") should be mirrored back: *"What does that label indicate to you based on the screen?"*
- **Confusion is Data**: Any pause exceeding 15 seconds, repeated clicking on inactive elements, or expressed confusion is recorded as an actionable friction point, not a player failure.
- **Milestone Verification**: The facilitator observes completion of standardized tasks A through F.

---

## 3. Standardized Playtest Tasks

| Task | Title | Time Target | Success Criteria | Observed Friction Points |
| --- | --- | --- | --- | --- |
| **Task A** | **First Orientation & Inspection** | ≤ 3 min | Rotates globe, zooms in/out, opens drawer, inspects at least 3 distinct regions (land, coastal, settlement). | Globe grab sensitivity, drawer toggle discoverability. |
| **Task B** | **Stewardship & Intervention** | ≤ 7 min | Issues at least one building construction command (farm/mine/energy), adjusts policy (extraction/reserve), designates one nature reserve. | Cost comprehension, policy impact transparency. |
| **Task C** | **Commerce & Connection** | ≤ 12 min | Inspects trade routes in the Trade tab, identifies moving shipments, successfully links two settlements via a trade route. | Trade route cost/distance feedback, transit time understanding. |
| **Task D** | **Crisis Navigation** | ≤ 20 min | Encounters an active crisis (drought, famine, blight), opens crisis response modal, selects a legal response, observes resolution. | Crisis cause clarity, relief shipment logistics. |
| **Task E** | **Future Forecasting** | ≤ 25 min | Uses the "Fork the Future" tool in the Compare tab, runs 12-month projection, understands the comparative table, adopts a branch. | Fork semantics comprehension, adoption irreversibility. |
| **Task F** | **Continuity & Return** | Day 2 / Reload | Saves game to slot, reloads, correctly identifies current year/season, living settlement status, and ongoing research. | Save metadata legibility, state orientation after load. |

---

## 4. Standardized Feedback Rubric

Facilitators present this rubric immediately following the session. Scores use a 1–5 Likert scale:

### 1. Perceived Causality (1–5)
> *"When your settlements thrived or suffered shortages, how clear was the underlying cause?"*
- `1` — Completely opaque / felt arbitrary or random.
- `3` — Moderately clear after checking ledgers.
- `5` — Crystal clear; every outcome directly mapped to geographic, economic, or policy factors.

### 2. Steward Agency (1–5)
> *"Did you feel like a patient planetary steward guiding autonomous communities, rather than an omnipotent city-builder ruler?"*
- `1` — Felt powerless or disconnected.
- `3` — Felt like an indirect governor.
- `5` — Authentic steward relationship; communities acted on their own while respecting policies and infrastructure.

### 3. Enjoyment & Engagement (1–5)
> *"How compelling was the simulation pacing, visual presentation, and planetary atmosphere?"*

### 4. Return-Session Comprehension (1–5)
> *"When resuming your saved world, how quickly did you re-establish your mental model of the planet's state?"*

---

## 5. Consent-Safe Local Diagnostics Charter

Diagnostics in *The World Machine* obey strict privacy invariants:
- **100% Local**: All diagnostic event logs (`src/app/playtest.ts`) are stored in memory or local storage. Zero network telemetry requests are ever transmitted.
- **Strictly Opt-In**: Disabled by default (`PLAYTEST_STORAGE_KEY = 'wm:playtest:opt_in'`). No data is recorded without explicit participant opt-in.
- **Zero PII**: No IP addresses, device identifiers, or personal data are collected. Session IDs are random ephemeral hashes.
- **Exportable & Inspectable**: Players can inspect and export their complete raw diagnostic report via `window.worldMachine.playtest.exportJson()` or the in-game diagnostics menu.
