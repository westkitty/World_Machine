import { describe, expect, it } from 'vitest';
import { createReferenceWorld, REFERENCE_SEED } from '../src/sim/create';
import { getTopology } from '../src/sim/topology';
import {
  PLANETARY_SCALE,
  SPATIAL_UNITS,
  classifyCellGeography,
  computeLandmassSizeMap,
  formatAreaKm2,
  formatDistanceKm,
  formatElevationM,
  getRepresentativeScaleExamples,
} from '../src/sim/scale';

describe('Geographic Scale Contract (P061)', () => {
  it('defines named spatial units for all core simulation and presentation mechanics', () => {
    const requiredMechanics = [
      'distance',
      'landArea',
      'elevation',
      'region',
      'community',
      'infrastructure',
      'road',
      'tradeRoute',
      'precipitation',
      'temperature',
      'biomass',
      'waterStock',
      'oreDeposit',
      'visualProjection',
    ];

    for (const mechanic of requiredMechanics) {
      const def = SPATIAL_UNITS[mechanic];
      expect(def, `Missing spatial unit for ${mechanic}`).toBeDefined();
      expect(def.id).toBe(mechanic);
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.symbol.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.referenceScale.length).toBeGreaterThan(0);
    }
  });

  it('planetary constants accurately partition an Earth-sized sphere into 642 cells', () => {
    const topo = getTopology();
    expect(topo.count).toBe(PLANETARY_SCALE.totalCells);
    expect(PLANETARY_SCALE.totalCells).toBe(642);

    // Sum of cell areas should equal total planetary surface area 4πR²
    let totalCellArea = 0;
    for (let i = 0; i < topo.count; i++) {
      totalCellArea += topo.area[i];
    }

    const expectedArea = 4 * Math.PI * PLANETARY_SCALE.radiusKm * PLANETARY_SCALE.radiusKm;
    const relError = Math.abs(totalCellArea - expectedArea) / expectedArea;
    expect(relError).toBeLessThan(1e-4);

    // Mean area per cell should match ~794,493 km²
    const computedMeanArea = totalCellArea / topo.count;
    expect(Math.abs(computedMeanArea - PLANETARY_SCALE.meanCellAreaKm2) / PLANETARY_SCALE.meanCellAreaKm2).toBeLessThan(1e-4);
    expect(PLANETARY_SCALE.meanCellAreaKm2).toBeGreaterThan(790000);
    expect(PLANETARY_SCALE.meanCellAreaKm2).toBeLessThan(800000);

    // Equivalent diameter should be ~1,006 km
    expect(PLANETARY_SCALE.meanCellDiameterKm).toBeGreaterThan(1000);
    expect(PLANETARY_SCALE.meanCellDiameterKm).toBeLessThan(1015);
  });

  it('correctly classifies coastal, inland, island, shelf, and ocean cells', () => {
    const world = createReferenceWorld(REFERENCE_SEED);
    const topo = getTopology();
    const landmassMap = computeLandmassSizeMap(world.cells, topo);

    let foundInland = false;
    let foundCoastal = false;
    let foundIsland = false;
    let foundShelf = false;
    let foundOcean = false;

    for (let i = 0; i < topo.count; i++) {
      const profile = classifyCellGeography(i, world.cells, topo, landmassMap);
      expect(profile.cellId).toBe(i);
      expect(profile.areaKm2).toBe(topo.area[i]);

      if (profile.category === 'inland') {
        foundInland = true;
        expect(profile.land).toBe(true);
        expect(profile.coastal).toBe(false);
        const seaNeighbors = topo.neighbors[i].filter((nb) => !world.cells[nb].land);
        expect(seaNeighbors.length).toBe(0);
      } else if (profile.category === 'coastal') {
        foundCoastal = true;
        expect(profile.land).toBe(true);
        expect(profile.coastal).toBe(true);
        expect(profile.landmassSizeCells).toBeGreaterThan(2);
      } else if (profile.category === 'island') {
        foundIsland = true;
        expect(profile.land).toBe(true);
        expect(profile.coastal).toBe(true);
        expect(profile.landmassSizeCells).toBeLessThanOrEqual(2);
      } else if (profile.category === 'shelf') {
        foundShelf = true;
        expect(profile.land).toBe(false);
      } else if (profile.category === 'ocean') {
        foundOcean = true;
        expect(profile.land).toBe(false);
      }
    }

    expect(foundInland).toBe(true);
    expect(foundCoastal).toBe(true);
    expect(foundIsland).toBe(true);
    expect(foundShelf).toBe(true);
    expect(foundOcean).toBe(true);
  });

  it('representative scale examples agree across inland, coastal, and island topologies in TERRA-1', () => {
    const world = createReferenceWorld(REFERENCE_SEED);
    const examples = getRepresentativeScaleExamples(world);

    // Inland example
    expect(examples.inland.type).toBe('inland');
    expect(examples.inland.cellId).toBeGreaterThanOrEqual(0);
    expect(examples.inland.seaNeighbors).toBe(0);
    expect(examples.inland.areaKm2).toBeGreaterThan(500000);

    // Coastal example
    expect(examples.coastal.type).toBe('coastal');
    expect(examples.coastal.cellId).toBeGreaterThanOrEqual(0);
    expect(examples.coastal.seaNeighbors).toBeGreaterThan(0);
    expect(examples.coastal.areaKm2).toBeGreaterThan(500000);

    // Island example
    expect(examples.island.type).toBe('island');
    expect(examples.island.cellId).toBeGreaterThanOrEqual(0);
    expect(examples.island.seaNeighbors).toBeGreaterThan(0);
    expect(examples.island.areaKm2).toBeGreaterThan(500000);

    // All examples have realistic coordinate ranges
    for (const ex of [examples.inland, examples.coastal, examples.island]) {
      expect(ex.latitudeDeg).toBeGreaterThanOrEqual(-90);
      expect(ex.latitudeDeg).toBeLessThanOrEqual(90);
      expect(ex.longitudeDeg).toBeGreaterThanOrEqual(-180);
      expect(ex.longitudeDeg).toBeLessThanOrEqual(180);
      expect(ex.totalNeighbors).toBeGreaterThanOrEqual(5);
      expect(ex.totalNeighbors).toBeLessThanOrEqual(6);
    }
  });

  it('formats scale units with descriptive strings and consistent metric values', () => {
    expect(formatDistanceKm(926)).toBe('926 km');
    expect(formatDistanceKm(1250)).toBe('1.3k km (1,250 km)');
    expect(formatAreaKm2(794493)).toContain('794,493 km²');
    expect(formatAreaKm2(794493)).toContain('100% of mean region');
    expect(formatElevationM(1200)).toBe('+1,200 m');
    expect(formatElevationM(-350)).toBe('-350 m');
    expect(formatElevationM(0)).toBe('+0 m');
  });
});
