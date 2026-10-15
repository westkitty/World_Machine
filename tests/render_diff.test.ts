import { describe, expect, it } from 'vitest';
import { diffViewOptions, type ViewOptions } from '../src/render/PlanetView';

describe('Renderer Quality Diffing & Rebuild Optimization (P005)', () => {
  const baseOptions: ViewOptions = {
    quality: 'medium',
    reducedMotion: false,
    reducedEffects: false,
    lighting: 'studio',
  };
  const baseSeed = 'TERRA-1';

  it('detects no rebuild when options and seed are identical', () => {
    const diff = diffViewOptions(baseOptions, { ...baseOptions }, baseSeed, baseSeed);
    expect(diff.rebuildPlanetMesh).toBe(false);
    expect(diff.rebuildClouds).toBe(false);
    expect(diff.rebuildSky).toBe(false);
    expect(diff.dprChanged).toBe(false);
    expect(diff.updateTwinkleOnly).toBe(false);
  });

  it('detects twinkle-only update when reducedMotion is toggled without rebuilding sky geometry or clouds', () => {
    const nextOptions: ViewOptions = { ...baseOptions, reducedMotion: true };
    const diff = diffViewOptions(baseOptions, nextOptions, baseSeed, baseSeed);

    expect(diff.rebuildPlanetMesh).toBe(false);
    expect(diff.rebuildClouds).toBe(false);
    expect(diff.rebuildSky).toBe(false);
    expect(diff.dprChanged).toBe(false);
    expect(diff.updateTwinkleOnly).toBe(true);
  });

  it('rebuilds mesh, clouds, and sky when quality increases from medium to high', () => {
    const highOptions: ViewOptions = { ...baseOptions, quality: 'high' };
    const diff = diffViewOptions(baseOptions, highOptions, baseSeed, baseSeed, 2);

    // Level changes from 5 to 6
    expect(diff.rebuildPlanetMesh).toBe(true);
    // Cloud resolution changes from 512 to 1024
    expect(diff.rebuildClouds).toBe(true);
    // Star count changes from 1800 to 3200
    expect(diff.rebuildSky).toBe(true);
    expect(diff.dprChanged).toBe(true);
  });

  it('rebuilds clouds and sky when quality drops to low, without rebuilding planet mesh', () => {
    const lowOptions: ViewOptions = { ...baseOptions, quality: 'low' };
    const diff = diffViewOptions(baseOptions, lowOptions, baseSeed, baseSeed, 2);

    // Low and Medium share mesh subdivision level 5
    expect(diff.rebuildPlanetMesh).toBe(false);
    // Clouds are disabled on low
    expect(diff.rebuildClouds).toBe(true);
    // Stars drop to 900 and sky band is disabled
    expect(diff.rebuildSky).toBe(true);
    expect(diff.dprChanged).toBe(true);
  });

  it('disables clouds and sky when reducedEffects is enabled', () => {
    const noFxOptions: ViewOptions = { ...baseOptions, reducedEffects: true };
    const diff = diffViewOptions(baseOptions, noFxOptions, baseSeed, baseSeed);

    expect(diff.rebuildPlanetMesh).toBe(false);
    expect(diff.rebuildClouds).toBe(true); // transitions to 'disabled'
    expect(diff.rebuildSky).toBe(true); // removes sky band
  });

  it('rebuilds planet mesh and clouds when world seed changes', () => {
    const diff = diffViewOptions(baseOptions, baseOptions, 'TERRA-1', 'ARID-DROUGHT-9');

    expect(diff.rebuildPlanetMesh).toBe(true);
    expect(diff.rebuildClouds).toBe(true);
    expect(diff.rebuildSky).toBe(false); // sky is independent of world seed
  });
});
