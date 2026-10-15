import type { TickContext } from '../context';
import { getSettlement, pushEvent, withRng } from '../settlements';
import { getTopology } from '../topology';
import type { Crisis, CrisisType, Inventory, WorldState } from '../types';

export interface CrisisResponseDef {
  id: string;
  label: string;
  cost: Partial<Inventory>;
  effect: string;
}

export const CRISIS_INFO: Record<CrisisType, { label: string; description: string; responses: CrisisResponseDef[] }> = {
  drought: {
    label: 'Drought',
    description: 'Precipitation collapses across the region, drying soils, wells and farms.',
    responses: [
      { id: 'ration', label: 'Water rationing', cost: {}, effect: 'Water needs −30% for settlements in the region; wellbeing suffers.' },
      { id: 'wells', label: 'Emergency wells', cost: { ore: 600, timber: 400 }, effect: 'Water renewal ×1.7 in the region until the drought ends.' },
    ],
  },
  blight: {
    label: 'Crop blight',
    description: 'A fungal blight cuts farm yields.',
    responses: [
      { id: 'burn', label: 'Burn the fields', cost: {}, effect: 'No farm output for 2 months, then the blight ends.' },
      { id: 'fungicide', label: 'Mineral fungicide', cost: { ore: 400, timber: 150 }, effect: 'Yield loss cut from 60% to 25% of severity.' },
    ],
  },
  epidemic: {
    label: 'Epidemic',
    description: 'Disease spreads through crowded, unhealthy settlements and along trade routes.',
    responses: [
      { id: 'quarantine', label: 'Quarantine', cost: {}, effect: 'Halves deaths and stops spread, but suspends the settlement’s trade routes.' },
      { id: 'medicine', label: 'Medical aid', cost: { food: 800, ore: 300 }, effect: 'Deaths −65% and the outbreak ends 40% sooner.' },
    ],
  },
  wildfire: {
    label: 'Wildfire',
    description: 'Fire sweeps a dry, hot forest, burning biomass and degrading land; it spreads each month.',
    responses: [
      { id: 'firebreak', label: 'Cut firebreaks', cost: { timber: 250, food: 150 }, effect: 'Stops the fire spreading to neighbouring regions.' },
    ],
  },
  mine_collapse: {
    label: 'Mine collapse',
    description: 'A neglected or overworked mine collapses, killing miners and halting extraction.',
    responses: [
      { id: 'shore', label: 'Shore up the shafts', cost: { timber: 400, food: 200 }, effect: 'Mine restored to 60% condition.' },
    ],
  },
  famine: {
    label: 'Famine',
    description: 'Food supply has fallen far below need for consecutive months.',
    responses: [
      { id: 'relief', label: 'Emergency relief', cost: {}, effect: 'Richest settlement within 4,500 km sends up to 2,000 food (25% lost en route); relations improve.' },
    ],
  },
};

export function crisisAt(state: WorldState, type: CrisisType, settlementId: number): Crisis | undefined {
  return state.crises.find((c) => !c.resolved && c.type === type && c.settlementId === settlementId);
}

export function openCrisis(state: WorldState, type: CrisisType, cellId: number, settlementId: number, severity: number, months: number, radiusKm = 0): Crisis {
  const c: Crisis = {
    id: state.nextCrisisId++, type, cellId, settlementId, radiusKm, severity,
    startTick: state.tick, endTick: state.tick + months, responded: null, resolved: false,
  };
  state.crises.push(c);
  const s = getSettlement(state, settlementId);
  pushEvent(state, `crisis:${type}`, `${CRISIS_INFO[type].label}${s ? ` at ${s.name}` : ''} (severity ${Math.round(severity * 100)}%).`, cellId, settlementId, 'bad');
  return c;
}

/**
 * Crisis generation is seeded and conditional: probabilities depend on real
 * state (dry heat for fires, crowding and poor health for disease, exhausted
 * soil for blight, neglect for mine collapses, sustained shortage for famine).
 */
export function crisisSystem(state: WorldState, _ctx: TickContext): void {
  const topo = getTopology();
  const freq = state.rules.crisisFrequency;
  // Resolve expired crises.
  for (const c of state.crises) {
    if (c.resolved) continue;
    if (state.tick >= c.endTick) {
      c.resolved = true;
      pushEvent(state, 'crisis:end', `${CRISIS_INFO[c.type].label} ended.`, c.cellId, c.settlementId, 'info');
    }
  }
  if (state.crises.length > 80) state.crises = state.crises.filter((c) => !c.resolved || state.tick - c.endTick < 24);

  withRng(state, (rng) => {
    if (freq > 0) {
      // Regional drought.
      if (rng.chance(0.008 * freq) && !state.crises.some((c) => !c.resolved && c.type === 'drought')) {
        const land = state.settlements.filter((s) => s.alive);
        const center = land.length && rng.chance(0.7) ? rng.pick(land).cellId : rng.int(topo.count);
        if (state.cells[center].land) openCrisis(state, 'drought', center, -1, rng.range(0.45, 0.8), 6 + rng.int(12), rng.range(1500, 3000));
      }
      for (const s of state.settlements) {
        if (!s.alive) continue;
        const farms = state.buildings.filter((b) => b.settlementId === s.id && b.type === 'farm' && b.status === 'active');
        if (farms.length && !crisisAt(state, 'blight', s.id)) {
          const poorSoil = farms.some((b) => state.cells[b.cellId].soil < 0.6);
          if (rng.chance(0.003 * freq * (poorSoil ? 2.5 : 1))) openCrisis(state, 'blight', farms[0].cellId, s.id, rng.range(0.4, 0.9), 4 + rng.int(5));
        }
        const crowd = s.population / Math.max(1, s.housing);
        const pollution = state.cells[s.cellId].pollution;
        const pEpi = 0.0015 * freq * (crowd > 1 ? 3 : 1) * (1 + 2 * pollution) * (s.health < 0.5 ? 2.5 : 1) * Math.min(2, s.population / 8000);
        if (!crisisAt(state, 'epidemic', s.id) && rng.chance(pEpi)) openCrisis(state, 'epidemic', s.cellId, s.id, rng.range(0.4, 1), 5 + rng.int(4));
        for (const b of state.buildings) {
          if (b.settlementId !== s.id || b.type !== 'mine' || b.status !== 'active') continue;
          if (rng.chance(0.0015 * freq * (1 + b.neglect) * (state.policy.extraction === 'intensive' ? 2 : 1))) {
            b.condition = 0.1;
            const dead = Math.min(s.population * 0.01, 120);
            s.population -= dead;
            openCrisis(state, 'mine_collapse', b.cellId, s.id, 0.6, 3);
          }
        }
        // Famine is emergent, not random: sustained deep shortage.
        const sat = s.last.needed.food > 0 ? s.last.consumed.food / s.last.needed.food : 1;
        if (sat < 0.6 && s.popHistory.length > 2 && !crisisAt(state, 'famine', s.id)) {
          openCrisis(state, 'famine', s.cellId, s.id, 1 - sat, 4);
        }
      }
      // Wildfires in hot, drought-stricken forest.
      for (let i = 0; i < topo.count; i++) {
        const c = state.cells[i];
        if (!c.land || c.drought < 0.35 || c.temperature < 20 || c.biomass < c.biomassCap * 0.3) continue;
        if (rng.chance(0.004 * freq * c.drought)) openCrisis(state, 'wildfire', i, c.owner, rng.range(0.4, 0.8), 3);
      }
    }
    // Ongoing crisis dynamics.
    for (const cr of [...state.crises]) {
      if (cr.resolved || cr.startTick === state.tick) continue;
      if (cr.type === 'wildfire') {
        const c = state.cells[cr.cellId];
        const burn = c.biomass * 0.35 * cr.severity;
        c.biomass -= burn;
        c.degradation = Math.min(1, c.degradation + 0.03 * cr.severity);
        if (cr.responded !== 'firebreak' && rng.chance(0.25)) {
          const nb = topo.neighbors[cr.cellId].filter((j) => state.cells[j].land && state.cells[j].biomass > state.cells[j].biomassCap * 0.3 && !state.crises.some((x) => !x.resolved && x.type === 'wildfire' && x.cellId === j));
          if (nb.length) openCrisis(state, 'wildfire', rng.pick(nb), state.cells[cr.cellId].owner, cr.severity * 0.8, 2);
        }
      } else if (cr.type === 'epidemic' && cr.responded !== 'quarantine') {
        for (const r of state.routes) {
          if (!r.active || (r.a !== cr.settlementId && r.b !== cr.settlementId)) continue;
          const other = r.a === cr.settlementId ? r.b : r.a;
          if (!crisisAt(state, 'epidemic', other) && rng.chance(0.06 * cr.severity)) {
            const o = getSettlement(state, other);
            if (o) openCrisis(state, 'epidemic', o.cellId, o.id, cr.severity * 0.7, 4);
          }
        }
      }
    }
  });
}
