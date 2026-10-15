import { NEEDS } from './constants';
import type { TickContext } from './context';
import { storageCap } from './economy';
import type { Good, Inventory, Settlement, WorldState } from './types';

export function waterNeedMult(state: WorldState, s: Settlement, ctx?: TickContext): number {
  let m = state.tech.water_reclamation.done ? 0.75 : 1;
  if (ctx?.rationedWater.has(s.id)) m *= 0.7;
  return m;
}

/** What a settlement's population needs this month. */
export function monthlyNeeds(state: WorldState, s: Settlement, ctx?: TickContext): Inventory {
  const mult = state.rules.consumptionMult * (state.policy.rationing ? 0.8 : 1);
  const p = s.population;
  return {
    food: p * NEEDS.food * mult,
    water: p * NEEDS.water * mult * waterNeedMult(state, s, ctx),
    energy: p * NEEDS.energy,
    timber: p * NEEDS.timber,
    ore: p * NEEDS.ore,
  };
}

/** Stock a settlement tries to hold before it is willing to export. */
export function reserveTarget(state: WorldState, s: Settlement, good: Good, needs?: Inventory): number {
  const n = needs ?? monthlyNeeds(state, s);
  const months = state.policy.reserveMonths;
  let t = 0;
  switch (good) {
    case 'food': t = n.food * months; break;
    case 'water': t = n.water * Math.max(1.5, months / 2); break;
    case 'timber': t = n.timber * 6 + 1500; break;
    case 'ore': t = n.ore * 6 + 900; break;
    case 'energy': t = 0; break;
  }
  return Math.min(t, storageCap(state, s, good) * 0.9);
}
