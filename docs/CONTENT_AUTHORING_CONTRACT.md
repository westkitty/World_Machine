# Content Authoring Contract (P084)

**The World Machine — Safe Data-Driven Content Contracts**  
**Phase:** F1 (Proof factory and extensible content backbone)  
**Status:** Canonical Design & Runtime Specification

---

## 1. Overview and Core Invariants

The World Machine allows community authors and scenario designers to create new scenarios, objectives, and world setups without modifying core simulation engine code. To protect the integrity, stability, and security of the client runtime, all external and user-authored scenarios must adhere to the **Safe Data-Driven Content Contract**.

### Core Invariants:
1. **Zero Executable Code**: Scenarios are defined strictly as serializable data (JSON). No JavaScript, TypeScript, WebAssembly, `eval()`, `new Function()`, or dynamic scripting is permitted.
2. **Strict Offline Validation**: Every candidate scenario package is validated offline prior to compilation or simulation entry. Unrecognized properties, out-of-range numerical parameters, or malformed trees are rejected with detailed diagnostics.
3. **Prototype Pollution & Injection Immunity**: Scenario payloads are recursively audited against prototype manipulation keys (`__proto__`, `constructor`, `prototype`) and script tag injections (`<script>`, `javascript:` URIs).
4. **Engine Independence**: A new or second scenario can be created, validated, registered, simulated, and won/lost purely through data without modifying a single line of engine code.
5. **Open Licensing & Attribution**: Every scenario package must declare an approved open-source SPDX license and attribution metadata.

---

## 2. Package Schema (`ScenarioPackage`)

A scenario package is a JSON object with `schemaVersion: 1` consisting of six required sections and two optional sections:

```typescript
interface ScenarioPackage {
  meta: ScenarioMetadata;
  worldgen: ScenarioWorldgenParams;
  rules: ScenarioRulesConfig;
  setup: ScenarioSetupConfig;
  objectives: ScenarioObjectiveDef[];
  failure?: ScenarioFailureConfig;
  risks?: ScenarioRisksConfig;
}
```

### 2.1 Metadata (`meta`)
| Field | Type | Description | Constraints |
|---|---|---|---|
| `id` | `string` | Unique identifier | `^[a-z0-9_]{3,32}$` |
| `title` | `string` | Human-readable title | 1–64 characters |
| `tagline` | `string` | Short subtitle | 1–128 characters |
| `brief` | `string` | Narrative and strategic context | 1–1024 characters |
| `author` | `string` | Author name or group | 1–64 characters |
| `license` | `string` | Open SPDX identifier | Allowed: `MIT`, `Apache-2.0`, `CC0-1.0`, `CC-BY-4.0`, `CC-BY-SA-4.0`, `BSD-2-Clause`, `BSD-3-Clause`, `Unlicense` |
| `version` | `number` | Integer version counter | `>= 1` |
| `schemaVersion` | `1` | Contract schema format | Literal `1` |

### 2.2 World Generation (`worldgen`)
| Field | Type | Description | Constraints |
|---|---|---|---|
| `seed` | `string` | Planetary generation seed | 1–32 characters |
| `oceanCoverage` | `number?` | Ocean proportion | `0.10 .. 0.95` |
| `seaLevel` | `number?` | Sea level offset | `-50 .. +50` |
| `tempShift` | `number?` | Global temperature shift (°C) | `-20 .. +20` |
| `rainfallMult` | `number?` | Global precipitation multiplier | `0.2 .. 5.0` |

### 2.3 Rules and Constraints (`rules`)
| Field | Type | Description | Constraints |
|---|---|---|---|
| `deadline` | `number` | Maximum simulated months | `12 .. 2400` |
| `holdMonths` | `number` | Consecutive months objectives must hold | `0 .. 120` |
| `constraints` | `string[]` | Narrative constraints displayed in UI | 0–10 items, 1–128 chars each |
| `policyConstraints` | `object?` | Optional policy limits (e.g. `allowedAutonomy`, `rationale`) | Allowed autonomy values: `none`, `limited`, `full` |

### 2.4 Setup Configuration (`setup`)
- **Mode**: `"expedition"` or `"settlements"`.
- **Expedition Setup**:
  - `population`: 50 to 50,000.
  - `inventory`: `{ food, water, timber, ore }` (each 0 to 1,000,000).
  - `foundingDeadlineMonths`: 1 to 120 (defaults to 12).
- **Settlement Setup**:
  - Array of 1 to 10 settlement definitions.
  - Each with `population`, `supplies` (`food`, `water`, `timber`, `ore`), optional `name`.
  - Optional `siteCriteria`: `minDistanceKm`, `requireCoastal`, `preferDistinctLandmasses`.
  - Optional `initialBuildings`: array of `{ type, count }` (`farm`, `well`, `mine`, `lumber_camp`, `port`, `depot`, `storage`).

### 2.5 Declarative Objectives (`objectives`)
Each objective is evaluated purely by the engine each monthly tick:
- `settlement_founded`: Expedition has founded its initial settlement.
- `min_population`: Civilization population `>= target`.
- `min_food_reserve_months`: Minimum food reserve across all communities `>= targetMonths`.
- `min_water_reserve_months`: Minimum water reserve across all communities `>= targetMonths`.
- `min_wellbeing`: Mean civilizational wellbeing `>= targetRatio`.
- `min_connected_settlements`: Largest connected trade network size `>= target`.
- `max_degradation`: Mean territory ecological degradation `<= maxRatio`.
- `min_biomass`: Mean territory biomass ratio `>= targetRatio`.
- `trade_delivered`: Total cumulative trade deliveries `>= target`.

---

## 3. Security & Contributor Boundaries

### 3.1 Strict Security Defenses
- **No Script Execution**: All conditions are evaluated by compiled declarative functions in `src/sim/content/compiler.ts`. No string is ever parsed as code.
- **Deep Key Inspection**: Packages containing `__proto__`, `constructor`, or `prototype` fail validation immediately.
- **HTML/URI Neutralization**: String values containing `<script>`, `javascript:`, or `data:text/html` trigger immediate validation rejection.
- **Unknown Property Rejection**: Any property not explicitly declared in the schema triggers a validation error (`checkAllowedKeys`), preventing data leakage or spoofing.

### 3.2 Contributor Boundaries and Privacy
- **Zero PII**: Scenario packages must contain no personally identifiable information, tracking pixels, or network endpoints.
- **Offline Self-Sufficiency**: Scenarios must run completely offline without remote network dependencies.
- **SPDX Licensing**: All submitted content packages must be freely redistributable under permissive or Creative Commons licenses.

---

## 4. Compilation and Runtime Activation

Data scenarios are compiled and activated through the Content Registry (`src/sim/content/registry.ts`):
```typescript
import { registerDataScenario } from './sim/content';
import archipelagoPackage from './sim/content/fixtures/archipelago_exchange.json';

// Validates, compiles, and registers into the active engine:
const scenarioDef = registerDataScenario(archipelagoPackage);

// Automatically accessible via standard scenario APIs:
const state = createScenarioWorld('archipelago_exchange');
```
