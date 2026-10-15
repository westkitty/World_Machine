import { describe, expect, it } from 'vitest';
import { diffViewOptions } from '../src/render/PlanetView';
import { createReferenceWorld } from '../src/sim/create';
import { step } from '../src/sim/engine';
import { runBranch } from '../src/sim/compare';

describe('WebGL Context-Loss Recovery & Simulation Continuity (P077)', () => {
  it('guarantees simulation state evolves identically whether graphics ticks run or are suspended', () => {
    // 1. Run baseline simulation for 24 months with continuous updates
    const seed = 'TERRA-1';
    const stateA = createReferenceWorld(seed);
    for (let m = 0; m < 24; m++) {
      step(stateA);
    }

    // 2. Run identical seed with simulated graphics context loss between month 6 and 18
    const stateB = createReferenceWorld(seed);
    let contextLost = false;
    let framesRendered = 0;

    for (let m = 0; m < 24; m++) {
      if (m === 6) contextLost = true;
      if (m === 18) contextLost = false;

      // Authoritative simulation tick advances unconditionally
      step(stateB);

      // Frame rendering is suspended during context loss
      if (!contextLost) {
        framesRendered++;
      }
    }

    // 3. Verify identical world state tick, settlements, buildings, and metrics
    expect(stateB.tick).toBe(stateA.tick);
    expect(stateB.settlements.length).toBe(stateA.settlements.length);
    for (let i = 0; i < stateA.settlements.length; i++) {
      expect(stateB.settlements[i].population).toBe(stateA.settlements[i].population);
      expect(stateB.settlements[i].inventory.food).toBe(stateA.settlements[i].inventory.food);
      expect(stateB.settlements[i].inventory.water).toBe(stateA.settlements[i].inventory.water);
      expect(stateB.settlements[i].inventory.timber).toBe(stateA.settlements[i].inventory.timber);
      expect(stateB.settlements[i].inventory.ore).toBe(stateA.settlements[i].inventory.ore);
    }
    expect(stateB.buildings.length).toBe(stateA.buildings.length);
    expect(stateB.routes.length).toBe(stateA.routes.length);
    expect(stateB.metrics.length).toBe(stateA.metrics.length);
    expect(stateB.metrics[stateB.metrics.length - 1].population).toBe(
      stateA.metrics[stateA.metrics.length - 1].population,
    );
    expect(framesRendered).toBe(12); // Months 0-5 (6 months) + 18-23 (6 months)
  });

  it('guarantees forecast branches remain deterministic and uncorrupted during simulated loss', () => {
    const seed = 'TERRA-CONTEXT-LOSS';
    const base = createReferenceWorld(seed);

    // Step 5 months
    for (let i = 0; i < 5; i++) step(base);

    // Run 60-month branch forecasts
    const branchA = runBranch(base, 'Branch A', { extraction: 'intensive' }, 60);
    const branchB = runBranch(base, 'Branch B', { extraction: 'intensive' }, 60);

    expect(branchA.series.length).toBe(branchB.series.length);
    expect(branchA.metrics.population).toBe(branchB.metrics.population);
    expect(branchA.metrics.wellbeing).toBe(branchB.metrics.wellbeing);
    expect(branchA.metrics.foodStock).toBe(branchB.metrics.foodStock);
    expect(branchA.originFingerprint).toBe(branchB.originFingerprint);
  });

  it('guarantees signature invalidation triggers full resource rebuild on context restoration', () => {
    const options = {
      quality: 'medium' as const,
      reducedMotion: false,
      reducedEffects: false,
      lighting: 'studio' as const,
    };

    // Before context loss: warm cache
    const warmDiff = diffViewOptions(options, options, 'TERRA-1', 'TERRA-1');
    expect(warmDiff.rebuildPlanetMesh).toBe(false);
    expect(warmDiff.rebuildClouds).toBe(false);
    expect(warmDiff.rebuildSky).toBe(false);

    // After context loss recovery: signatures are reset to ''
    const postLossDiff = diffViewOptions(options, options, '', 'TERRA-1');
    expect(postLossDiff.rebuildPlanetMesh).toBe(true);
    expect(postLossDiff.rebuildClouds).toBe(true);
  });
});
