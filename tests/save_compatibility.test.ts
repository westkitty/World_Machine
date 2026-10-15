import { describe, expect, it } from 'vitest';
import { step } from '../src/sim/engine';
import {
  deserialize,
  migrate,
  SaveError,
  serialize,
  validateState,
} from '../src/sim/save';

import refSandboxJson from './fixtures/v1/reference-sandbox-v1.json';
import scenFirstFootprintJson from './fixtures/v1/scenario-first-footprint-v1.json';
import scenLongDroughtJson from './fixtures/v1/scenario-long-drought-v1.json';
import challengeModeJson from './fixtures/v1/challenge-mode-v1.json';

describe('Versioned Save Compatibility (P082)', () => {
  const FIXTURES = [
    { name: 'reference-sandbox-v1', json: refSandboxJson },
    { name: 'scenario-first-footprint-v1', json: scenFirstFootprintJson },
    { name: 'scenario-long-drought-v1', json: scenLongDroughtJson },
    { name: 'challenge-mode-v1', json: challengeModeJson },
  ];

  for (const { name, json } of FIXTURES) {
    it(`loads historical v1 fixture “${name}” and continues simulation for 12 months without regression`, () => {
      const jsonStr = JSON.stringify(json);
      const state = deserialize(jsonStr);

      expect(state).toBeDefined();
      expect(state.cells.length).toBe(642);
      expect(state.tick).toBeGreaterThanOrEqual(0);

      // Validate state structure immediately upon load
      expect(() => validateState(state)).not.toThrow();

      const initialPop = state.settlements.reduce((sum, s) => sum + s.population, 0) + (state.expedition?.population ?? 0);
      expect(initialPop).toBeGreaterThan(0);

      // Advance simulation by 12 months (one full calendar year)
      for (let m = 0; m < 12; m++) {
        step(state);
      }

      // Assert state remains fully valid after 12 months of simulation
      expect(() => validateState(state)).not.toThrow();

      // Ensure inventories and populations remain finite and non-negative
      for (const s of state.settlements) {
        expect(Number.isFinite(s.population)).toBe(true);
        expect(s.population).toBeGreaterThanOrEqual(0);
        for (const [good, amount] of Object.entries(s.inventory)) {
          expect(Number.isFinite(amount), `Settlement ${s.name} ${good} is not finite`).toBe(true);
          expect(amount, `Settlement ${s.name} ${good} went negative`).toBeGreaterThanOrEqual(0);
        }
      }
    });
  }

  it('strengthened validation rejects corrupt rules, policies, and structures', () => {
    const valid = deserialize(JSON.stringify(refSandboxJson));

    // Corrupt rules: negative multiplier
    const badRules = structuredClone(valid);
    badRules.rules.consumptionMult = -1;
    expect(() => validateState(badRules)).toThrow(SaveError);
    expect(() => validateState(badRules)).toThrow(/consumptionMult/);

    // Corrupt policy: illegal extraction enum
    const badPolicy = structuredClone(valid);
    (badPolicy.policy as any).extraction = 'strip_mining_unlimited';
    expect(() => validateState(badPolicy)).toThrow(SaveError);
    expect(() => validateState(badPolicy)).toThrow(/policy\.extraction/);

    // Corrupt buildings: condition > 1
    const badBuilding = structuredClone(valid);
    if (badBuilding.buildings.length > 0) {
      badBuilding.buildings[0].condition = 2.5;
      expect(() => validateState(badBuilding)).toThrow(SaveError);
      expect(() => validateState(badBuilding)).toThrow(/condition out of range/);
    }

    // Corrupt shipments: negative cargo amount
    const badShipment = structuredClone(valid);
    badShipment.shipments.push({
      routeId: 1,
      from: 1,
      to: 2,
      good: 'food',
      amount: -100,
      departTick: 0,
      arriveTick: 2,
    });
    expect(() => validateState(badShipment)).toThrow(SaveError);
    expect(() => validateState(badShipment)).toThrow(/invalid amount/);
  });

  it('migration pipeline rejects future versions and outdated pre-v1 versions', () => {
    // Version > current version
    const futureSave = {
      format: 'world-machine-save',
      version: 999,
      savedAt: new Date().toISOString(),
      label: 'future save',
      state: refSandboxJson.state,
    };
    expect(() => deserialize(JSON.stringify(futureSave))).toThrow(/newer than this game supports/);

    // Version < 1
    expect(() => migrate(refSandboxJson.state, 0)).toThrow(/no longer supported/);
  });

  it('serialization and deserialization roundtrip leaves world state identical', () => {
    const original = deserialize(JSON.stringify(refSandboxJson));
    const serialized = serialize(original, 'roundtrip test');
    const restored = deserialize(serialized);

    expect(restored.seed).toBe(original.seed);
    expect(restored.tick).toBe(original.tick);
    expect(restored.mode).toBe(original.mode);
    expect(restored.settlements.length).toBe(original.settlements.length);
    expect(restored.buildings.length).toBe(original.buildings.length);
    expect(restored.roads.length).toBe(original.roads.length);
    expect(restored.routes.length).toBe(original.routes.length);
  });
});
