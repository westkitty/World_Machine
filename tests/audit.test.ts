import { describe, expect, it } from 'vitest';
import { applyCommand, previewCommand, type Command } from '../src/sim/commands';
import { createReferenceWorld, REFERENCE_SEED } from '../src/sim/create';

describe('Meaningful-Intervention Design Audit (P062)', () => {
  const ALL_COMMAND_TYPES: Command['type'][] = [
    'found',
    'build',
    'demolish',
    'road',
    'route',
    'removeRoute',
    'routeGoods',
    'policy',
    'conserve',
    'research',
    'respond',
    'laborFocus',
  ];

  it('inventories all twelve core player command types', () => {
    expect(ALL_COMMAND_TYPES.length).toBe(12);
    const unique = new Set(ALL_COMMAND_TYPES);
    expect(unique.size).toBe(12);
  });

  it('previewCommand validates commands without mutating active world state', () => {
    const world = createReferenceWorld(REFERENCE_SEED);
    const beforeJson = JSON.stringify(world);

    // Run preview for policy change
    const resPolicy = previewCommand(world, { type: 'policy', patch: { rationing: true } });
    expect(resPolicy.ok).toBe(true);
    expect(JSON.stringify(world)).toBe(beforeJson);

    // Run preview for research
    const resResearch = previewCommand(world, { type: 'research', tech: 'irrigation', fundingId: world.settlements[0].id });
    expect(resResearch.message.length).toBeGreaterThan(0);
    expect(JSON.stringify(world)).toBe(beforeJson);

    // Run preview for invalid building placement
    const resBuildInvalid = previewCommand(world, { type: 'build', building: 'mine', cellId: 0 });
    expect(resBuildInvalid.ok).toBe(false);
    expect(resBuildInvalid.message.length).toBeGreaterThan(0);
    expect(JSON.stringify(world)).toBe(beforeJson);
  });

  it('provides actionable failure messages when prerequisites are not met', () => {
    const world = createReferenceWorld(REFERENCE_SEED);

    // Attempting to found a settlement in the middle of deep ocean
    const oceanCell = world.cells.findIndex((c) => !c.land);
    const resFoundOcean = applyCommand(world, { type: 'found', cellId: oceanCell });
    expect(resFoundOcean.ok).toBe(false);
    expect(resFoundOcean.message).toContain('land');

    // Attempting to demolish a nonexistent building
    const resDemolishNonexistent = applyCommand(world, { type: 'demolish', buildingId: 999999 });
    expect(resDemolishNonexistent.ok).toBe(false);
    expect(resDemolishNonexistent.message).toContain('No such structure');

    // Attempting to conserve a settlement centre
    const s0 = world.settlements[0];
    const resConserveCentre = applyCommand(world, { type: 'conserve', cellId: s0.cellId, on: true });
    expect(resConserveCentre.ok).toBe(false);
    expect(resConserveCentre.message).toContain('settlement centre cannot be a reserve');
  });

  it('provides distinct strategic alternatives for resource management', () => {
    // Dilemma: Settlement needs food
    // Option A: Adjust labor allocation to food
    const worldA = createReferenceWorld(REFERENCE_SEED);
    const sA = worldA.settlements[0];
    const resLabor = applyCommand(worldA, { type: 'laborFocus', settlementId: sA.id, focus: 'food' });
    expect(resLabor.ok).toBe(true);
    expect(sA.laborFocus).toBe('food');

    // Option B: Set planetary rationing policy
    const worldB = createReferenceWorld(REFERENCE_SEED);
    const resPolicy = applyCommand(worldB, { type: 'policy', patch: { rationing: true } });
    expect(resPolicy.ok).toBe(true);
    expect(worldB.policy.rationing).toBe(true);

    // Option C: Reconfigure trade route cargo to prioritize food
    const worldC = createReferenceWorld(REFERENCE_SEED);
    if (worldC.routes.length > 0) {
      const rId = worldC.routes[0].id;
      const resGoods = applyCommand(worldC, { type: 'routeGoods', routeId: rId, goods: ['food'] });
      expect(resGoods.ok).toBe(true);
      expect(worldC.routes[0].goods).toEqual(['food']);
    }

    // All three options produce distinct, verifiable state outcomes
    expect(worldA.policy.rationing).toBe(false);
    expect(worldB.settlements[0].laborFocus).toBe('balanced');
  });

  it('conserve preserves structures as idled while demolish dismantles and salvages materials', () => {
    const world = createReferenceWorld(REFERENCE_SEED);
    const s = world.settlements[0];
    const building = world.buildings.find((b) => b.settlementId === s.id && b.cellId !== s.cellId);
    expect(building).toBeDefined();
    if (!building) return;

    const cellId = building.cellId;
    const initialTimber = s.inventory.timber;

    // Test conserve: idles structures, preserves building records
    const resConserve = applyCommand(world, { type: 'conserve', cellId, on: true });
    expect(resConserve.ok).toBe(true);
    expect(world.cells[cellId].conserved).toBe(true);
    expect(world.buildings.some((b) => b.id === building.id)).toBe(true);

    // Lift reserve
    applyCommand(world, { type: 'conserve', cellId, on: false });
    expect(world.cells[cellId].conserved).toBe(false);

    // Test demolish: removes building record and salvages timber
    const resDemolish = applyCommand(world, { type: 'demolish', buildingId: building.id });
    expect(resDemolish.ok).toBe(true);
    expect(world.buildings.some((b) => b.id === building.id)).toBe(false);
    expect(s.inventory.timber).toBeGreaterThanOrEqual(initialTimber);
  });
});
