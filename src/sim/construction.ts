import { BUILDINGS, ROAD_COST_PER_1000KM } from './constants';
import { canAfford, formatCost, missingFor, pay, scaledCost } from './economy';
import { findPath, roadIndex, roadKey } from './pathfinding';
import { getSettlement, hasOpenSea, pushEvent } from './settlements';
import { getTopology } from './topology';
import type { BuildingType, Inventory, Settlement, WorldState } from './types';

export function buildingCost(state: WorldState, type: BuildingType): Partial<Inventory> {
  return scaledCost(state, BUILDINGS[type].cost);
}

/** Placement rules. Returns null when valid, else a player-readable reason. */
export function placementBlocker(state: WorldState, type: BuildingType, cellId: number): string | null {
  const cell = state.cells[cellId];
  if (!cell) return 'No region selected.';
  if (!cell.land) return 'Structures must be built on land.';
  if (cell.owner < 0) return 'Region is outside every settlement’s territory.';
  if (cell.conserved && type !== 'storage') return 'Conservation reserves forbid this structure.';
  const def = BUILDINGS[type];
  const here = state.buildings.filter((b) => b.cellId === cellId);
  if (here.length >= 4) return 'Region already holds four structures.';
  if (here.filter((b) => b.type === type).length >= def.maxPerCell) return `At most ${def.maxPerCell} ${def.label.toLowerCase()}(s) per region.`;
  switch (type) {
    case 'farm':
      if (cell.fertilityBase * cell.soil < 0.12) return 'Soil here is too poor to farm.';
      if (cell.biome === 'alpine' || cell.biome === 'ice' || cell.biome === 'tundra') return 'Climate too harsh for farming.';
      break;
    case 'mine':
      if (cell.ore < 500) return 'No workable ore deposit in this region.';
      break;
    case 'port':
      if (!cell.coastal) return 'Ports require a coastal region.';
      if (!hasOpenSea(state, cellId)) return 'This shore faces only an enclosed inland sea; ships could not reach open ocean.';
      if (state.buildings.some((b) => b.type === 'port' && b.settlementId === cell.owner)) return 'Settlement already has a port.';
      break;
  }
  return null;
}

export function costBlocker(state: WorldState, s: Settlement, cost: Partial<Inventory>): string | null {
  if (state.rules.unrestricted) return null;
  if (canAfford(s, cost)) return null;
  return `${s.name} lacks ${formatCost(missingFor(s, cost))}.`;
}

export function startBuilding(state: WorldState, type: BuildingType, cellId: number): { ok: true; id: number } | { ok: false; reason: string } {
  const blocker = placementBlocker(state, type, cellId);
  if (blocker) return { ok: false, reason: blocker };
  const s = getSettlement(state, state.cells[cellId].owner);
  if (!s) return { ok: false, reason: 'Owning settlement not found.' };
  const cost = buildingCost(state, type);
  const cb = costBlocker(state, s, cost);
  if (cb) return { ok: false, reason: cb };
  if (!state.rules.unrestricted) pay(state, s, cost, 'construction');
  const id = state.nextBuildingId++;
  state.buildings.push({ id, type, cellId, settlementId: s.id, condition: 1, status: 'construction', progress: 0, builtTick: state.tick, neglect: 0 });
  pushEvent(state, 'construction', `${s.name} began a ${BUILDINGS[type].label.toLowerCase()}.`, cellId, s.id, 'info');
  return { ok: true, id };
}

export interface RoadPlan {
  edges: [number, number][];
  newKm: number;
  cost: Partial<Inventory>;
  payer: Settlement;
}

/** Road along the cheapest land path between two cells; only missing edges are paid for. */
export function planRoad(state: WorldState, fromCell: number, toCell: number): RoadPlan | string {
  const a = state.cells[fromCell], b = state.cells[toCell];
  if (!a || !b) return 'Choose two regions.';
  if (fromCell === toCell) return 'Choose two different regions.';
  if (!a.land || !b.land) return 'Roads can only join land regions.';
  const payer = getSettlement(state, a.owner) ?? getSettlement(state, b.owner);
  if (!payer) return 'At least one end must lie in a settlement’s territory (that settlement pays).';
  const path = findPath(state.cells, fromCell, toCell, 'land', new Set());
  if (!path) return 'No overland connection exists between these regions.';
  if (path.path.length > 12) return 'Road too long: build it in segments of at most 11 regions.';
  const topo = getTopology();
  const existing = new Set(state.roads.map((r) => roadKey(r.a, r.b)));
  const edges: [number, number][] = [];
  let km = 0;
  for (let i = 1; i < path.path.length; i++) {
    const u = path.path[i - 1], v = path.path[i];
    if (existing.has(roadKey(u, v))) continue;
    if (state.cells[v].conserved && state.cells[u].conserved) return 'Road would cross a conservation reserve.';
    edges.push([u, v]);
    km += topo.edgeKm[u][topo.neighbors[u].indexOf(v)];
  }
  if (!edges.length) return 'A road already connects these regions.';
  const mult = state.tech.masonry_roads.done ? 0.6 : 1;
  const cost = scaledCost(state, { timber: (ROAD_COST_PER_1000KM.timber * km) / 1000, ore: (ROAD_COST_PER_1000KM.ore * km) / 1000 }, mult);
  return { edges, newKm: km, cost, payer };
}

export function startRoad(state: WorldState, plan: RoadPlan): void {
  if (!state.rules.unrestricted) pay(state, plan.payer, plan.cost, 'construction');
  for (const [u, v] of plan.edges) {
    state.roads.push({ a: Math.min(u, v), b: Math.max(u, v), settlementId: plan.payer.id, condition: 1, status: 'construction', progress: 0 });
  }
  pushEvent(state, 'construction', `${plan.payer.name} began ${Math.round(plan.newKm)} km of road.`, plan.edges[0][0], plan.payer.id, 'info');
}

export { roadIndex };
