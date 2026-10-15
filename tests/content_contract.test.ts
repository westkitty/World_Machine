import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearRegisteredDataScenarios,
  getAllRegisteredDataScenarios,
  getRegisteredDataScenario,
  registerDataScenario,
  unregisterDataScenario,
  validateScenarioPackage,
} from '../src/sim/content';
import archipelagoExchangeJson from '../src/sim/content/fixtures/archipelago_exchange.json';
import highlandSanctuaryJson from '../src/sim/content/fixtures/highland_sanctuary.json';
import { createScenarioWorld, getScenario, SCENARIOS } from '../src/sim/scenarios';
import { step } from '../src/sim/engine';

describe('Safe Data-Driven Content Contracts (P084)', () => {
  beforeEach(() => {
    clearRegisteredDataScenarios();
  });

  afterEach(() => {
    clearRegisteredDataScenarios();
  });

  describe('Schema Validation & Strict Offline Rejection', () => {
    it('validates canonical scenario package fixtures', () => {
      const res1 = validateScenarioPackage(highlandSanctuaryJson);
      expect(res1.ok).toBe(true);

      const res2 = validateScenarioPackage(archipelagoExchangeJson);
      expect(res2.ok).toBe(true);
    });

    it('rejects non-object or null payloads', () => {
      expect(validateScenarioPackage(null).ok).toBe(false);
      expect(validateScenarioPackage(undefined).ok).toBe(false);
      expect(validateScenarioPackage('string').ok).toBe(false);
      expect(validateScenarioPackage([1, 2, 3]).ok).toBe(false);
    });

    it('rejects prototype pollution attempts', () => {
      const malicious = JSON.parse(JSON.stringify(highlandSanctuaryJson));
      // Inject prototype pollution key
      malicious.__proto__ = { polluted: true };
      malicious.meta.__proto__ = { polluted: true };

      // Also test explicit JSON with "__proto__" key
      const evilJson = '{"meta": {"id": "evil"}, "__proto__": {"admin": true}}';
      const parsed = JSON.parse(evilJson);
      const res = validateScenarioPackage(parsed);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.errors.some((e) => e.includes('prototype pollution') || e.includes('Unknown field'))).toBe(true);
      }
    });

    it('rejects potential executable script tags and javascript URIs in string fields', () => {
      const pkg = JSON.parse(JSON.stringify(highlandSanctuaryJson));
      pkg.meta.brief = 'Normal text <script>fetch("evil.com")</script>';
      const res = validateScenarioPackage(pkg);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.errors.some((e) => e.includes('Potential script/executable'))).toBe(true);
      }

      const pkg2 = JSON.parse(JSON.stringify(highlandSanctuaryJson));
      pkg2.meta.title = 'javascript:alert(1)';
      const res2 = validateScenarioPackage(pkg2);
      expect(res2.ok).toBe(false);
    });

    it('rejects unknown and unauthorized extra keys (strict schema enforcement)', () => {
      const pkg = JSON.parse(JSON.stringify(highlandSanctuaryJson));
      pkg.unauthorizedRootField = 'malicious';
      const res = validateScenarioPackage(pkg);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.errors.some((e) => e.includes('Unknown field "unauthorizedRootField"'))).toBe(true);
      }

      const pkg2 = JSON.parse(JSON.stringify(highlandSanctuaryJson));
      pkg2.meta.extraMetaField = 123;
      const res2 = validateScenarioPackage(pkg2);
      expect(res2.ok).toBe(false);
    });

    it('rejects invalid scenario IDs (uppercase, special characters, too short)', () => {
      const invalidIds = ['UPPERCASE', 'no-dashes', 'ab', 'too_long_scenario_name_exceeding_32_characters_limit'];
      for (const id of invalidIds) {
        const pkg = JSON.parse(JSON.stringify(highlandSanctuaryJson));
        pkg.meta.id = id;
        const res = validateScenarioPackage(pkg);
        expect(res.ok).toBe(false);
      }
    });

    it('rejects unapproved or proprietary licenses', () => {
      const pkg = JSON.parse(JSON.stringify(highlandSanctuaryJson));
      pkg.meta.license = 'PROPRIETARY-COMMERCIAL';
      const res = validateScenarioPackage(pkg);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.errors.some((e) => e.includes('meta.license must be one of allowed SPDX licenses'))).toBe(true);
      }
    });

    it('rejects invalid numbers, NaN, and out-of-bounds parameters', () => {
      const pkg = JSON.parse(JSON.stringify(highlandSanctuaryJson));
      pkg.worldgen.oceanCoverage = 1.8; // max is 0.95
      const res = validateScenarioPackage(pkg);
      expect(res.ok).toBe(false);

      const pkg2 = JSON.parse(JSON.stringify(highlandSanctuaryJson));
      pkg2.setup.expedition.population = -500;
      const res2 = validateScenarioPackage(pkg2);
      expect(res2.ok).toBe(false);

      const pkg3 = JSON.parse(JSON.stringify(highlandSanctuaryJson));
      pkg3.rules.deadline = 5; // min is 12
      const res3 = validateScenarioPackage(pkg3);
      expect(res3.ok).toBe(false);
    });
  });

  describe('Dynamic Compilation & Content Registry', () => {
    it('compiles and registers data-driven scenarios successfully', () => {
      const def = registerDataScenario(highlandSanctuaryJson);
      expect(def.id).toBe('highland_sanctuary');
      expect(def.title).toBe('Highland Sanctuary');
      expect(getRegisteredDataScenario('highland_sanctuary')).toBeDefined();
      expect(getAllRegisteredDataScenarios().length).toBe(1);

      const removed = unregisterDataScenario('highland_sanctuary');
      expect(removed).toBe(true);
      expect(getRegisteredDataScenario('highland_sanctuary')).toBeUndefined();
    });

    it('integrates seamlessly with getScenario lookup without modifying SCENARIOS array', () => {
      expect(SCENARIOS.length).toBe(5);
      expect(getScenario('archipelago_exchange')).toBeUndefined();

      registerDataScenario(archipelagoExchangeJson);
      const found = getScenario('archipelago_exchange');
      expect(found).toBeDefined();
      expect(found?.title).toBe('Archipelago Exchange');

      // The 5 built-in canonical scenarios are untouched
      expect(SCENARIOS.length).toBe(5);
      expect(getScenario('first_footprint')?.title).toBe('First Footprint');
    });
  });

  describe('Engine Independence Proof: Second Scenario Added Purely as Validated Data', () => {
    it('instantiates and executes the second scenario (Archipelago Exchange) purely from data', () => {
      registerDataScenario(archipelagoExchangeJson);

      const state = createScenarioWorld('archipelago_exchange', false);
      expect(state.scenario).toBeDefined();
      expect(state.scenario?.id).toBe('archipelago_exchange');
      expect(state.scenario?.status).toBe('active');

      // Check that three settlements were seeded as defined in the data contract
      expect(state.settlements.length).toBe(3);
      expect(state.settlements.every((s) => s.alive)).toBe(true);

      // Verify names and supplies as declared
      const names = state.settlements.map((s) => s.name);
      expect(names).toContain('Coral Haven');
      expect(names).toContain('Isle of Forge');
      expect(names).toContain('Timber Shoals');

      // Verify declarative initial buildings
      expect(state.buildings.some((b) => b.type === 'port')).toBe(true);
      expect(state.buildings.some((b) => b.type === 'mine')).toBe(true);
      expect(state.buildings.some((b) => b.type === 'farm')).toBe(true);

      // Verify declarative objectives evaluation
      const def = getScenario('archipelago_exchange')!;
      const objs = def.objectives(state);
      expect(objs.length).toBe(4);
      expect(objs.some((o) => o.label === 'Connected Archipelago')).toBe(true);
      expect(objs.some((o) => o.label === 'Total Population')).toBe(true);
      expect(objs.some((o) => o.label === 'Food Reserves')).toBe(true);
      expect(objs.some((o) => o.label === 'Civilizational Wellbeing')).toBe(true);

      // Run multiple ticks and verify pure evaluation without crash or NaN
      for (let t = 0; t < 12; t++) {
        step(state);
      }
      expect(state.tick).toBe(12);
      expect(state.scenario?.status).toBe('active');
    });

    it('enforces declarative policy constraints defined in data package', () => {
      registerDataScenario(highlandSanctuaryJson);
      const def = getScenario('highland_sanctuary')!;
      const state = createScenarioWorld('highland_sanctuary', false);

      // Highland Sanctuary data contract only allows ['none', 'limited']
      const legalPatch = { autonomy: 'limited' as const };
      expect(def.checkPolicyConstraint?.(legalPatch, state)).toBeNull();

      const illegalPatch = { autonomy: 'full' as const };
      const rejection = def.checkPolicyConstraint?.(illegalPatch, state);
      expect(rejection).not.toBeNull();
      expect(rejection).toContain('Highland Sanctuary requires close stewardship');
    });

    it('applies challenge multiplier scaling to data-driven scenarios', () => {
      registerDataScenario(highlandSanctuaryJson);
      const standardState = createScenarioWorld('highland_sanctuary', false);
      const challengeState = createScenarioWorld('highland_sanctuary', true);

      // Challenge starting supplies must be 70% of standard
      expect(challengeState.expedition?.inventory.food).toBeCloseTo(
        standardState.expedition!.inventory.food * 0.7,
        1,
      );
      expect(challengeState.scenario?.deadline).toBeLessThan(standardState.scenario!.deadline);
    });

    it('triggers declarative failure conditions when settlements are lost', () => {
      registerDataScenario(archipelagoExchangeJson);
      const def = getScenario('archipelago_exchange')!;
      const state = createScenarioWorld('archipelago_exchange', false);

      // Kill all settlements
      for (const s of state.settlements) s.alive = false;

      const failure = def.failure(state);
      expect(failure).toBe('All archipelago settlements collapsed.');
    });
  });
});
