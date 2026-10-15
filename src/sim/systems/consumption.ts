import { FOOD_SPOILAGE, FOOD_SPOILAGE_COLD, WATER_EVAPORATION } from '../constants';
import type { TickContext } from '../context';
import { debit } from '../economy';
import { monthlyNeeds, reserveTarget } from '../needs';
import type { WorldState } from '../types';

/**
 * Households consume food, water, energy and timber from real inventory.
 * Satisfaction ratios feed the population system. Spare timber above reserve
 * is turned into housing. Food spoils, stored water evaporates, and unused
 * energy dissipates at the end of the month (energy is never stored).
 */
export function consumptionSystem(state: WorldState, ctx: TickContext): void {
  const spoil = state.tech.cold_storage.done ? FOOD_SPOILAGE_COLD : FOOD_SPOILAGE;
  for (const s of state.settlements) {
    if (!s.alive) continue;
    const need = monthlyNeeds(state, s, ctx);
    const got = {
      food: debit(state, s, 'food', need.food, 'consumed'),
      water: debit(state, s, 'water', need.water, 'consumed'),
      energy: debit(state, s, 'energy', need.energy, 'consumed'),
      timber: debit(state, s, 'timber', need.timber, 'consumed'),
      ore: debit(state, s, 'ore', need.ore, 'consumed'),
    };
    s.last.consumed.food += got.food;
    s.last.consumed.water += got.water;
    s.last.consumed.energy += got.energy;
    s.last.consumed.timber += got.timber;
    s.last.consumed.ore += got.ore;
    const sat = {
      food: need.food > 0 ? got.food / need.food : 1,
      water: need.water > 0 ? got.water / need.water : 1,
      energy: need.energy > 0 ? got.energy / need.energy : 1,
      timber: need.timber > 0 ? got.timber / need.timber : 1,
      ore: need.ore > 0 ? got.ore / need.ore : 1,
    };
    ctx.sats.set(s.id, sat);
    s.last.shortage = (['food', 'water', 'energy', 'timber', 'ore'] as const).filter((g) => sat[g] < 0.98);

    // Housing: build with spare timber (1 timber → 3 housing), decays 0.25%/month.
    s.housing *= 0.9975;
    const desired = s.population * 1.5 - s.housing;
    const spare = s.inventory.timber - reserveTarget(state, s, 'timber');
    if (desired > 0 && spare > 0) {
      const spend = debit(state, s, 'timber', Math.min(spare * 0.5, desired / 3), 'construction');
      s.housing += spend * 3;
    }

    debit(state, s, 'food', s.inventory.food * spoil, 'spoiled');
    debit(state, s, 'water', s.inventory.water * WATER_EVAPORATION, 'spoiled');
    debit(state, s, 'energy', s.inventory.energy, 'dissipated');
  }
}
