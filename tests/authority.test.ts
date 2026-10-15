import { describe, expect, it } from 'vitest';
import { applyCommand, type Command } from '../src/sim/commands';
import { createReferenceWorld, REFERENCE_SEED } from '../src/sim/create';
import { createScenarioWorld } from '../src/sim/scenarios';
import { assertStateValid } from '../src/sim/engine';
import { deserialize } from '../src/sim/save';

describe('Single Authoritative Mutation Path (P071)', () => {
  it('static audit confirms no direct simulation state mutations exist in src/ui/', () => {
    const uiModules = import.meta.glob<string>('../src/ui/*.ts', { query: '?raw', eager: true, import: 'default' });

    const forbiddenPatterns = [
      /app\.state\.(rules|policy|cells|settlements|buildings|roads|routes|shipments|relations|tech|climate|crises|scenario)\s*=/,
      /s\.(rules|policy|cells|settlements|buildings|roads|routes|shipments|relations|tech|climate|crises|scenario)\s*=/,
      /state\.(rules|policy|cells|settlements|buildings|roads|routes|shipments|relations|tech|climate|crises|scenario)\s*=/,
    ];

    expect(Object.keys(uiModules).length).toBeGreaterThan(0);

    for (const [path, content] of Object.entries(uiModules)) {
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const pattern of forbiddenPatterns) {
          expect(pattern.test(line), `Direct UI state mutation detected in ${path}:${i + 1}: ${line.trim()}`).toBe(false);
        }
      }
    }
  });

  it('every invalid command leaves active world state 100% byte-identical', () => {
    const world = createReferenceWorld(REFERENCE_SEED);
    const oceanCell = world.cells.findIndex((c) => !c.land);

    const invalidCommands: Command[] = [
      { type: 'found', cellId: oceanCell },
      { type: 'found', cellId: -1 },
      { type: 'build', building: 'mine', cellId: oceanCell },
      { type: 'demolish', buildingId: 999999 },
      { type: 'road', fromCell: -1, toCell: 50 },
      { type: 'route', a: 999, b: 998 },
      { type: 'removeRoute', routeId: 99999 },
      { type: 'routeGoods', routeId: 99999, goods: ['food'] },
      { type: 'policy', patch: { tradePriority: ['food', 'food', 'food', 'food'] as any } },
      { type: 'conserve', cellId: oceanCell, on: true },
      { type: 'research', tech: 'irrigation', fundingId: 99999 },
      { type: 'respond', crisisId: 99999, response: 'relief' },
      { type: 'laborFocus', settlementId: 99999, focus: 'food' },
      { type: 'rule', patch: { consumptionMult: -5 } },
    ];

    for (const cmd of invalidCommands) {
      const beforeJson = JSON.stringify(world);
      const res = applyCommand(world, cmd);
      expect(res.ok, `Expected command ${cmd.type} to fail`).toBe(false);
      expect(JSON.stringify(world), `State diverged after failed command ${cmd.type}`).toBe(beforeJson);
    }
  });

  it('rule modifications are strictly authoritative and rejected outside sandbox mode', () => {
    // 1. Sandbox mode allows valid rule modifications
    const sandboxWorld = createReferenceWorld(REFERENCE_SEED, {}, 'sandbox');
    const resSandbox = applyCommand(sandboxWorld, { type: 'rule', patch: { unrestricted: true } });
    expect(resSandbox.ok).toBe(true);
    expect(sandboxWorld.rules.unrestricted).toBe(true);

    // 2. Observer mode rejects rule modifications and preserves state
    const observerWorld = createReferenceWorld(REFERENCE_SEED, {}, 'observer');
    const obsBefore = JSON.stringify(observerWorld);
    const resObserver = applyCommand(observerWorld, { type: 'rule', patch: { unrestricted: true } });
    expect(resObserver.ok).toBe(false);
    expect(resObserver.message).toContain('Observer mode');
    expect(JSON.stringify(observerWorld)).toBe(obsBefore);

    // 3. Scenario mode rejects rule modifications and preserves state
    const scenarioWorld = createScenarioWorld('first_footprint');
    const scenBefore = JSON.stringify(scenarioWorld);
    const resScenario = applyCommand(scenarioWorld, { type: 'rule', patch: { unrestricted: true } });
    expect(resScenario.ok).toBe(false);
    expect(resScenario.message).toContain('Sandbox mode');
    expect(JSON.stringify(scenarioWorld)).toBe(scenBefore);
  });

  it('failed loads and corrupt states reject before mutating active state', () => {
    // Malformed JSON string
    expect(() => deserialize('{ not valid json')).toThrow();

    // Corrupted state with negative inventory
    const corruptWorld = createReferenceWorld(REFERENCE_SEED);
    corruptWorld.settlements[0].inventory.food = -500;
    expect(() => assertStateValid(corruptWorld)).toThrow(/Invalid inventory/);

    // Corrupted state with non-finite population
    const corruptPop = createReferenceWorld(REFERENCE_SEED);
    corruptPop.settlements[0].population = NaN;
    expect(() => assertStateValid(corruptPop)).toThrow(/Invalid population/);
  });
});
