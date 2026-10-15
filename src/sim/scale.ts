import { getTopology, type Topology } from './topology';
import type { CellState, WorldState } from './types';

/**
 * Geographic Scale Contract (P061)
 *
 * Defines the formal spatial abstraction, units, and conversion relationships
 * governing the 642-cell spherical planet simulation, UI inspectors, and 3D globe.
 *
 * The planet is an Earth-sized sphere with radius R = 6,371 km partitioned into
 * 642 Voronoi/dual cells of a 3-times subdivided icosahedron (12 pentagons, 630 hexagons).
 * Each cell represents a vast geographic region (mean area ~794,493 km², mean diameter ~1,006 km).
 * A "settlement" represents a regional community of thousands of people governing a regional territory.
 * Buildings are regional infrastructure complexes (e.g. agricultural districts, mining basins).
 */

export const PLANETARY_SCALE = {
  /** Mean volumetric planetary radius in kilometers. */
  radiusKm: 6371,
  /** Total planetary surface area in square kilometers: 4πR² ≈ 510,064,472 km². */
  surfaceAreaKm2: 4 * Math.PI * 6371 * 6371,
  /** Equator circumference in kilometers: 2πR ≈ 40,030 km. */
  circumferenceKm: 2 * Math.PI * 6371,
  /** Total discrete simulation cells partitioning the globe. */
  totalCells: 642,
  /** Average surface area per cell in km² (~794,493 km²). */
  meanCellAreaKm2: (4 * Math.PI * 6371 * 6371) / 642,
  /** Equivalent circle diameter for a mean cell (~1,006 km). */
  meanCellDiameterKm: 2 * Math.sqrt((4 * Math.PI * 6371 * 6371) / 642 / Math.PI),
  /** Average great-circle center-to-center distance between adjacent neighbors (~926 km). */
  meanNeighborDistanceKm: 926,
  /** Visual 3D globe coordinate scale: 1.0 Three.js world unit = 6,371 km physical radius. */
  globeWorldUnitsPerRadius: 1.0,
  /** Conversion multiplier: 1 Three.js coordinate unit = 6,371 kilometers. */
  kmPerGlobeUnit: 6371,
  /** Visual relief vertical exaggeration on radial vertex displacement. */
  visualElevationExaggeration: 0.06,
} as const;

export interface SpatialUnitDefinition {
  readonly id: string;
  readonly name: string;
  readonly symbol: string;
  readonly category: 'distance' | 'area' | 'elevation' | 'climate' | 'resource' | 'community' | 'infrastructure' | 'presentation';
  readonly description: string;
  readonly referenceScale: string;
}

export const SPATIAL_UNITS: Record<string, SpatialUnitDefinition> = {
  distance: {
    id: 'distance',
    name: 'kilometer',
    symbol: 'km',
    category: 'distance',
    description: 'Great-circle surface distance across the spherical planetary surface.',
    referenceScale: 'Planet circumference is ~40,030 km; average neighbor spacing is ~926 km.',
  },
  landArea: {
    id: 'landArea',
    name: 'square kilometer',
    symbol: 'km²',
    category: 'area',
    description: 'Exact spherical-polygon surface area on the globe measured via solid angles.',
    referenceScale: 'Average cell area is ~794,493 km² (approx. size of Turkey, Chile, or Mozambique).',
  },
  elevation: {
    id: 'elevation',
    name: 'meter',
    symbol: 'm',
    category: 'elevation',
    description: 'Vertical height above or below mean planetary sea level (datum 0 m).',
    referenceScale: 'Terrain ranges from -5,840 m ocean trenches to +5,600 m alpine peaks.',
  },
  region: {
    id: 'region',
    name: 'geographic region',
    symbol: 'reg',
    category: 'area',
    description: 'Discrete equal-topology partition cell (642 cells total across the globe).',
    referenceScale: 'Each cell spans ~790,000 km² and possesses distinct elevation, biome, and climate.',
  },
  community: {
    id: 'community',
    name: 'regional community',
    symbol: 'comm',
    category: 'community',
    description: 'Civilization population center (settlement) governing 1 to 13 regional territories.',
    referenceScale: 'Population typically 400 to 20,000+ residents; not a single town.',
  },
  infrastructure: {
    id: 'infrastructure',
    name: 'regional complex',
    symbol: 'cpx',
    category: 'infrastructure',
    description: 'Extensive regional infrastructure complex (farmland district, mining basin, port district).',
    referenceScale: 'Limited to 1–2 complexes per 790,000 km² region to reflect landscape-scale commitment.',
  },
  road: {
    id: 'road',
    name: 'inter-regional highway',
    symbol: 'road',
    category: 'infrastructure',
    description: 'Engineered ground transit link connecting adjacent region centers.',
    referenceScale: 'Length in km; cost is scaled per 1,000 km of road length.',
  },
  tradeRoute: {
    id: 'tradeRoute',
    name: 'inter-regional shipping corridor',
    symbol: 'corridor',
    category: 'infrastructure',
    description: 'Active bilateral trade connection over land highways or sea lanes.',
    referenceScale: 'Distance in km, transit delay in months, capacity in goods/month.',
  },
  precipitation: {
    id: 'precipitation',
    name: 'millimeters per month',
    symbol: 'mm/mo',
    category: 'climate',
    description: 'Liquid-water equivalent depth of rainfall and snowfall.',
    referenceScale: 'Annual baseline ranges from 60 mm/yr in polar/desert cells to >2,000 mm/yr in tropical belts.',
  },
  temperature: {
    id: 'temperature',
    name: 'degrees Celsius',
    symbol: '°C',
    category: 'climate',
    description: 'Monthly mean surface air temperature, incorporating latitude and elevation lapse rate.',
    referenceScale: 'Standard lapse rate is -6.5 °C per 1,000 m elevation above sea level.',
  },
  biomass: {
    id: 'biomass',
    name: 'biomass units',
    symbol: 'B',
    category: 'resource',
    description: 'Standing ecological vegetation and harvestable organic matter per region.',
    referenceScale: 'Scaled by regional land area fraction (areaRel = areaFrac × 642).',
  },
  waterStock: {
    id: 'waterStock',
    name: 'freshwater units',
    symbol: 'W',
    category: 'resource',
    description: 'Accessible regional surface and groundwater reserves.',
    referenceScale: 'Renewed monthly by regional precipitation and runoff flow.',
  },
  oreDeposit: {
    id: 'oreDeposit',
    name: 'ore deposit units',
    symbol: 'O',
    category: 'resource',
    description: 'Finite geological mineral resource located predominantly in upland terrain.',
    referenceScale: 'Non-renewable finite stock drawn down by mining complexes.',
  },
  visualProjection: {
    id: 'visualProjection',
    name: 'Three.js globe coordinate units',
    symbol: 'gu',
    category: 'presentation',
    description: 'Normalized 3D cartesian coordinates on the unit sphere for WebGL rendering.',
    referenceScale: 'Unit sphere radius = 1.0; 1 coordinate unit corresponds to 6,371 physical km.',
  },
};

export type GeographicCategory = 'inland' | 'coastal' | 'island' | 'shelf' | 'ocean';

export interface CellGeographicProfile {
  readonly cellId: number;
  readonly category: GeographicCategory;
  readonly categoryLabel: string;
  readonly land: boolean;
  readonly coastal: boolean;
  readonly river: boolean;
  readonly elevationM: number;
  readonly areaKm2: number;
  readonly areaRelative: number;
  readonly latitudeDeg: number;
  readonly longitudeDeg: number;
  readonly landmassSizeCells: number;
  readonly description: string;
}

/**
 * Classifies a cell into its exact geographic category:
 * - inland: land cell where all direct neighbours are also land.
 * - coastal: land cell with ocean neighbours on a continental landmass (landmass size > 2).
 * - island: land cell belonging to an isolated small landmass (size <= 2) or surrounded by sea.
 * - shelf: shallow sea cell (elevation > -200 m or adjacent to land).
 * - ocean: deep open ocean cell.
 */
export function classifyCellGeography(
  cellId: number,
  cells: CellState[],
  topo: Topology,
  cachedLandmassSizes?: Map<number, number>,
): CellGeographicProfile {
  const c = cells[cellId];
  const areaKm2 = topo.area[cellId];
  const areaRelative = topo.areaFrac[cellId] * topo.count;
  const lat = topo.lat[cellId];
  const lon = topo.lon[cellId];
  const neighbors = topo.neighbors[cellId];
  const seaNeighborCount = neighbors.filter((j) => !cells[j].land).length;

  if (c.land) {
    let landmassSize = 1;
    if (cachedLandmassSizes) {
      landmassSize = cachedLandmassSizes.get(cellId) ?? 1;
    } else {
      // Small local flood fill to determine landmass extent up to continent threshold
      const visited = new Set<number>([cellId]);
      const queue = [cellId];
      while (queue.length > 0 && visited.size <= 5) {
        const cur = queue.pop()!;
        for (const nb of topo.neighbors[cur]) {
          if (cells[nb].land && !visited.has(nb)) {
            visited.add(nb);
            queue.push(nb);
          }
        }
      }
      landmassSize = visited.size;
    }

    if (!c.coastal || seaNeighborCount === 0) {
      return {
        cellId,
        category: 'inland',
        categoryLabel: 'Inland region',
        land: true,
        coastal: false,
        river: c.river,
        elevationM: c.elevation,
        areaKm2,
        areaRelative,
        latitudeDeg: lat,
        longitudeDeg: lon,
        landmassSizeCells: landmassSize,
        description: 'Continental interior region with no direct coastline access.',
      };
    }

    if (landmassSize <= 2) {
      return {
        cellId,
        category: 'island',
        categoryLabel: 'Island region',
        land: true,
        coastal: true,
        river: c.river,
        elevationM: c.elevation,
        areaKm2,
        areaRelative,
        latitudeDeg: lat,
        longitudeDeg: lon,
        landmassSizeCells: landmassSize,
        description: 'Isolated insular landmass bounded predominantly or completely by ocean.',
      };
    }

    return {
      cellId,
      category: 'coastal',
      categoryLabel: 'Coastal region',
      land: true,
      coastal: true,
      river: c.river,
      elevationM: c.elevation,
      areaKm2,
      areaRelative,
      latitudeDeg: lat,
      longitudeDeg: lon,
      landmassSizeCells: landmassSize,
      description: 'Continental maritime boundary region bordering open ocean or shelf waters.',
    };
  }

  // Marine cell
  const isShelf = c.elevation > -300 || neighbors.some((j) => cells[j].land);
  if (isShelf) {
    return {
      cellId,
      category: 'shelf',
      categoryLabel: 'Continental shelf',
      land: false,
      coastal: false,
      river: false,
      elevationM: c.elevation,
      areaKm2,
      areaRelative,
      latitudeDeg: lat,
      longitudeDeg: lon,
      landmassSizeCells: 0,
      description: 'Shallow marine waters adjacent to land, rich in marine fisheries.',
    };
  }

  return {
    cellId,
    category: 'ocean',
    categoryLabel: 'Open ocean',
    land: false,
    coastal: false,
    river: false,
    elevationM: c.elevation,
    areaKm2,
    areaRelative,
    latitudeDeg: lat,
    longitudeDeg: lon,
    landmassSizeCells: 0,
    description: 'Deep pelagic ocean basin separating planetary continental landmasses.',
  };
}

/** Precomputes landmass component sizes for all cells in a world. */
export function computeLandmassSizeMap(cells: CellState[], topo: Topology): Map<number, number> {
  const comp = new Int32Array(topo.count).fill(-1);
  const sizes: number[] = [];
  let id = 0;

  for (let i = 0; i < topo.count; i++) {
    if (!cells[i].land || comp[i] >= 0) continue;
    const q = [i];
    comp[i] = id;
    let size = 0;
    const members: number[] = [];
    while (q.length > 0) {
      const cur = q.pop()!;
      size++;
      members.push(cur);
      for (const nb of topo.neighbors[cur]) {
        if (cells[nb].land && comp[nb] < 0) {
          comp[nb] = id;
          q.push(nb);
        }
      }
    }
    sizes.push(size);
    id++;
  }

  const map = new Map<number, number>();
  for (let i = 0; i < topo.count; i++) {
    if (comp[i] >= 0) {
      map.set(i, sizes[comp[i]]);
    }
  }
  return map;
}

/** Formats a distance in kilometers with units. */
export function formatDistanceKm(km: number): string {
  if (km >= 1000) {
    return `${(km / 1000).toFixed(1)}k km (${Math.round(km).toLocaleString()} km)`;
  }
  return `${Math.round(km).toLocaleString()} km`;
}

/** Formats an area in km² with units and relative scale. */
export function formatAreaKm2(km2: number): string {
  const rel = (km2 / PLANETARY_SCALE.meanCellAreaKm2) * 100;
  return `${Math.round(km2).toLocaleString()} km² (${Math.round(rel)}% of mean region)`;
}

/** Formats elevation in meters with sign. */
export function formatElevationM(meters: number): string {
  const rounded = Math.round(meters);
  return `${rounded >= 0 ? '+' : ''}${rounded.toLocaleString()} m`;
}

/** Representative scale reference cell examples in TERRA-1. */
export interface RepresentativeScaleExample {
  readonly cellId: number;
  readonly type: 'inland' | 'coastal' | 'island';
  readonly name: string;
  readonly elevationM: number;
  readonly areaKm2: number;
  readonly areaRel: number;
  readonly latitudeDeg: number;
  readonly longitudeDeg: number;
  readonly seaNeighbors: number;
  readonly totalNeighbors: number;
}

export function getRepresentativeScaleExamples(world: WorldState): {
  inland: RepresentativeScaleExample;
  coastal: RepresentativeScaleExample;
  island: RepresentativeScaleExample;
} {
  const topo = getTopology();
  const landmassMap = computeLandmassSizeMap(world.cells, topo);

  let inlandId = -1;
  let coastalId = -1;
  let islandId = -1;

  for (let i = 0; i < topo.count; i++) {
    const c = world.cells[i];
    if (!c.land) continue;
    const size = landmassMap.get(i) ?? 1;

    if (size <= 2 && islandId < 0) {
      islandId = i;
    } else if (!c.coastal && size > 5 && inlandId < 0) {
      inlandId = i;
    } else if (c.coastal && size > 5 && coastalId < 0) {
      coastalId = i;
    }
  }

  const makeEx = (id: number, type: 'inland' | 'coastal' | 'island', name: string): RepresentativeScaleExample => {
    const c = world.cells[id];
    return {
      cellId: id,
      type,
      name,
      elevationM: Math.round(c.elevation),
      areaKm2: Math.round(topo.area[id]),
      areaRel: Number((topo.areaFrac[id] * topo.count).toFixed(3)),
      latitudeDeg: Number(topo.lat[id].toFixed(1)),
      longitudeDeg: Number(topo.lon[id].toFixed(1)),
      seaNeighbors: topo.neighbors[id].filter((j) => !world.cells[j].land).length,
      totalNeighbors: topo.neighbors[id].length,
    };
  };

  return {
    inland: makeEx(inlandId, 'inland', `Inland reference (region ${inlandId})`),
    coastal: makeEx(coastalId, 'coastal', `Coastal reference (region ${coastalId})`),
    island: makeEx(islandId, 'island', `Island reference (region ${islandId})`),
  };
}
