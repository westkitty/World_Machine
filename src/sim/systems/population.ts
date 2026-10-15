import type { TickContext } from '../context';
import { abandonSettlement, recordPop, territoryOf } from '../settlements';
import type { Settlement, WorldState } from '../types';

export const BASE_BIRTH = 0.0045; // per month at full wellbeing (~5.4%/yr gross)
export const BASE_DEATH = 0.0013; // per month (~1.6%/yr)
export const ABANDON_POPULATION = 40;

/**
 * Births are limited by food, water, wellbeing and free housing; deaths rise
 * steeply with food and water shortfall, poor health and epidemics. Health and
 * wellbeing are smoothed state so shocks have lingering consequences.
 */
export function populationSystem(state: WorldState, ctx: TickContext): void {
  const growthPolicy = state.policy.growth === 'encourage' ? 1.3 : state.policy.growth === 'restrain' ? 0.6 : 1;
  for (const s of state.settlements) {
    if (!s.alive) continue;
    const sat = ctx.sats.get(s.id) ?? { food: 1, water: 1, energy: 1, timber: 1, ore: 1 };
    const crowding = Math.max(0, Math.min(1.5, s.population / Math.max(1, s.housing)));
    const room = Math.max(0, 1 - crowding);
    const env = environmentQuality(state, s);
    const employment = s.last.labor > 0 ? Object.values(s.last.laborUsed).reduce((a, b) => a + b, 0) / s.last.labor : 1;

    const healthTarget = Math.min(1, 0.25 + 0.4 * sat.food + 0.3 * sat.water + 0.15 * env - (crowding > 1 ? 0.2 * (crowding - 1) : 0));
    s.health += (healthTarget - s.health) * 0.15;
    const rationPenalty = state.policy.rationing ? 0.08 : 0;
    const wbTarget = 0.32 * sat.food + 0.24 * sat.water + 0.14 * sat.energy + 0.12 * env + 0.1 * Math.min(1, room * 4) + 0.08 * Math.min(1, employment + 0.3) - rationPenalty;
    s.wellbeing += (Math.max(0, Math.min(1, wbTarget)) - s.wellbeing) * 0.2;

    const births = s.population * BASE_BIRTH * sat.food ** 2 * sat.water * (0.4 + 0.6 * s.wellbeing) * growthPolicy * Math.min(1, room * 3);
    const shortage = 0.07 * Math.pow(1 - sat.food, 1.5) + 0.14 * Math.pow(1 - sat.water, 1.5);
    const epidemic = ctx.epidemicDeath.get(s.id) ?? 0;
    const deathRate = (BASE_DEATH + shortage + epidemic) * (1.6 - 0.6 * s.health) + (crowding > 1.2 ? 0.002 : 0);
    const deaths = s.population * Math.min(0.5, deathRate);
    s.population = Math.max(0, s.population + births - deaths);
    s.last.births = births;
    s.last.deaths = deaths;
    recordPop(s);
    if (s.population < ABANDON_POPULATION) {
      abandonSettlement(state, s, sat.food < 0.5 ? 'starvation' : sat.water < 0.5 ? 'lack of water' : 'population collapse');
    }
  }
}

/** 0..1 average environmental health of a settlement's territory. */
export function environmentQuality(state: WorldState, s: Settlement): number {
  const terr = territoryOf(state, s.id);
  if (!terr.length) return 0.5;
  let q = 0;
  for (const i of terr) q += 1 - (0.7 * state.cells[i].degradation + 0.3 * state.cells[i].pollution);
  return q / terr.length;
}
