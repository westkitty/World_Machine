import { applyCommand } from '../src/sim/commands';
import { bestFarmCells, chooseSites } from '../src/sim/create';
import { placementBlocker } from '../src/sim/construction';
import { step } from '../src/sim/engine';
import { hasOpenSea, largestBasin, liveSettlements, territoryOf } from '../src/sim/settlements';
import { bestFoundingSite } from '../src/sim/systems/migration';
import type { WorldState } from '../src/sim/types';

/**
 * Scripted "competent player" strategies used to prove each scenario's success
 * condition is reachable through ordinary player commands. They use only the
 * public command interface, exactly like the UI.
 */
export type Strategy = (state: WorldState) => void;

export function runScenario(state: WorldState, strategy: Strategy | null, maxTicks = 400): WorldState {
  while (state.scenario?.status === 'active' && state.tick < maxTicks) {
    strategy?.(state);
    step(state);
  }
  return state;
}

function buildWhereValid(state: WorldState, type: 'farm' | 'mine' | 'storage' | 'energy' | 'port', cells: number[]): boolean {
  for (const c of cells) {
    if (placementBlocker(state, type, c)) continue;
    return applyCommand(state, { type: 'build', building: type, cellId: c }).ok;
  }
  return false;
}

function count(state: WorldState, sid: number, type: string): number {
  return state.buildings.filter((b) => b.settlementId === sid && b.type === type).length;
}

/** Shared good-steward routine: keep farms ahead of need, add storage, keep ore flowing. */
function steward(state: WorldState, opts: { maxFarms?: number; storage?: number } = {}): void {
  for (const s of liveSettlements(state)) {
    if (state.tick % 3 !== s.id % 3) continue;
    const pending = state.buildings.some((b) => b.settlementId === s.id && b.status === 'construction');
    if (pending) continue;
    const supply = s.last.produced.food + s.last.imported.food;
    if ((supply < s.last.needed.food * 1.3 || s.inventory.food < s.population * 3) && count(state, s.id, 'farm') < (opts.maxFarms ?? 8)) {
      if (buildWhereValid(state, 'farm', bestFarmCells(state, s))) continue;
    }
    const terr = territoryOf(state, s.id);
    if (count(state, s.id, 'storage') < (opts.storage ?? 1) && buildWhereValid(state, 'storage', terr)) continue;
    if (count(state, s.id, 'energy') < 1 && s.population > 2000 && s.inventory.ore > 450 && buildWhereValid(state, 'energy', terr)) continue;
    if (s.inventory.ore < 900 && count(state, s.id, 'mine') < 1) {
      const ore = terr.filter((c) => state.cells[c].ore > 500).sort((a, b) => state.cells[b].ore - state.cells[a].ore);
      if (buildWhereValid(state, 'mine', ore)) continue;
    }
  }
}

export const strategies: Record<string, Strategy> = {
  first_footprint(state) {
    if (state.expedition) {
      const site = chooseSites(state, { count: 1, minKm: 0 })[0];
      applyCommand(state, { type: 'found', cellId: site });
      return;
    }
    steward(state, { maxFarms: 3 });
  },

  distance_between_us(state) {
    const m = state.scenario!.memo;
    // Hold deeper reserves so every community keeps importing what it lacks.
    if (state.tick === 0) applyCommand(state, { type: 'policy', patch: { reserveMonths: 8 } });
    const ids = [m.a, m.b, m.c];
    for (const id of ids) {
      const s = state.settlements.find((x) => x.id === id)!;
      if (!s.alive) continue;
      if (!count(state, id, 'port')) buildWhereValid(state, 'port', territoryOf(state, id).filter((c) => hasOpenSea(state, c, largestBasin(state))));
    }
    if (state.tick % 2 === 0) {
      for (const [a, b] of [[m.a, m.b], [m.b, m.c], [m.a, m.c]]) {
        if (!state.routes.some((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a))) applyCommand(state, { type: 'route', a, b });
      }
    }
    steward(state, { maxFarms: 4 });
  },

  long_drought(state) {
    if (state.tick === 0) applyCommand(state, { type: 'policy', patch: { rationing: true, reserveMonths: 3 } });
    const drought = state.crises.find((c) => !c.resolved && c.type === 'drought' && !c.responded);
    if (drought) {
      const funder = [...liveSettlements(state)].sort((a, b) => b.inventory.ore - a.inventory.ore)[0];
      applyCommand(state, { type: 'respond', crisisId: drought.id, response: 'wells', fundingId: funder?.id });
    }
    for (const c of state.crises) if (!c.resolved && !c.responded && c.type === 'famine') applyCommand(state, { type: 'respond', crisisId: c.id, response: 'relief' });
    if (state.tick === 54) applyCommand(state, { type: 'policy', patch: { rationing: false } });
    steward(state, { maxFarms: 6, storage: 2 });
  },

  green_threshold(state) {
    if (state.tick === 0) {
      applyCommand(state, { type: 'policy', patch: { extraction: 'restrained' } });
      const funders = [...liveSettlements(state)].sort((a, b) => b.inventory.timber - a.inventory.timber);
      applyCommand(state, { type: 'research', tech: 'reforestation', fundingId: funders[0].id });
      applyCommand(state, { type: 'research', tech: 'crop_rotation', fundingId: funders[1].id });
      // Polluting timber-burning power works are shut down while the land heals.
      for (const b of [...state.buildings]) if (b.type === 'energy') applyCommand(state, { type: 'demolish', buildingId: b.id });
      for (const s of liveSettlements(state)) {
        // Reserve every territory region that holds no farm and is not the centre.
        for (const c of territoryOf(state, s.id)) {
          const hasFarm = state.buildings.some((b) => b.cellId === c && b.type === 'farm');
          if (!hasFarm && c !== s.cellId) applyCommand(state, { type: 'conserve', cellId: c, on: true });
        }
      }
    }
    if (state.scenario!.challenge) {
      // Harsher rules: ration early and answer famines while the land heals.
      if (state.tick === 0) applyCommand(state, { type: 'policy', patch: { rationing: true } });
      for (const c of state.crises) if (!c.resolved && !c.responded && c.type === 'famine') applyCommand(state, { type: 'respond', crisisId: c.id, response: 'relief' });
    }
    steward(state, { maxFarms: 6 });
  },

  many_futures(state) {
    if (state.tick === 0) applyCommand(state, { type: 'policy', patch: { autonomy: 'full' } });
    const live = liveSettlements(state);
    if (live.length < 7 && state.tick % 8 === 0) {
      const parent = [...live].sort((a, b) => b.population - a.population)[0];
      if (parent && parent.population > 2500) {
        const site = bestFoundingSite(state, parent);
        if (site >= 0) applyCommand(state, { type: 'found', cellId: site, sourceId: parent.id });
      }
    }
    if (state.tick % 6 === 0) {
      for (const s of live) {
        const partners = state.routes.filter((r) => r.a === s.id || r.b === s.id).length;
        if (partners >= 2) continue;
        const others = live.filter((o) => o.id !== s.id && !state.routes.some((r) => (r.a === s.id && r.b === o.id) || (r.a === o.id && r.b === s.id)));
        // The richer partner pays to open the route.
        for (const o of others) {
          const [payer, other] = o.inventory.timber > s.inventory.timber ? [o, s] : [s, o];
          if (applyCommand(state, { type: 'route', a: payer.id, b: other.id }).ok) break;
        }
      }
    }
    for (const c of state.crises) if (!c.resolved && !c.responded && c.type === 'famine') applyCommand(state, { type: 'respond', crisisId: c.id, response: 'relief' });
    // Bridge continents: the largest communities build ports and link by sea.
    if (state.tick % 12 === 0) {
      const top = [...live].sort((a, b) => b.population - a.population).slice(0, 4);
      for (const t of top) {
        if (!count(state, t.id, 'port')) buildWhereValid(state, 'port', territoryOf(state, t.id).filter((c) => hasOpenSea(state, c)));
      }
      for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
        const [a, b] = [top[i], top[j]];
        if (!state.routes.some((r) => (r.a === a.id && r.b === b.id) || (r.a === b.id && r.b === a.id))) applyCommand(state, { type: 'route', a: a.id, b: b.id });
      }
    }
    // Deliberate specialisation: dedicate mature communities to food, mining and forestry.
    if (state.tick === 60) {
      const big = [...liveSettlements(state)].sort((a, b) => b.population - a.population);
      if (big[0]) applyCommand(state, { type: 'laborFocus', settlementId: big[0].id, focus: 'food' });
      if (big[1]) applyCommand(state, { type: 'laborFocus', settlementId: big[1].id, focus: 'ore' });
      if (big[2]) applyCommand(state, { type: 'laborFocus', settlementId: big[2].id, focus: 'timber' });
    }
    steward(state, { maxFarms: 8, storage: 2 });
  },
};
