import { BUILDINGS, ROAD_MAINTENANCE } from '../constants';
import type { TickContext } from '../context';
import { canAfford, pay, scaledCost } from '../economy';
import { getSettlement, pushEvent } from '../settlements';
import type { WorldState } from '../types';

/**
 * Construction progress, maintenance and neglect. Each active structure wears
 * by 0.5%/month. Owners pay maintenance from inventory; paid structures recover
 * condition, unpaid ones decay 4%/month and are ruined at 5% condition.
 * Settlements in distress (wellbeing < 0.3) defer maintenance to preserve
 * essentials — a documented society behaviour that lets neglect cascade.
 */
export function infrastructureSystem(state: WorldState, ctx: TickContext): void {
  const ruined: number[] = [];
  for (const b of state.buildings) {
    const s = getSettlement(state, b.settlementId);
    if (!s) { ruined.push(b.id); continue; }
    const def = BUILDINGS[b.type];
    if (b.status === 'construction') {
      b.progress += 1;
      if (b.progress >= def.months) {
        b.status = 'active';
        b.condition = 1;
        if (b.type === 'port') ctx.routesDirty = true;
        pushEvent(state, 'built', `${def.label} completed at ${s.name}.`, b.cellId, s.id, 'good');
      }
      continue;
    }
    b.condition -= 0.005;
    const cost = scaledCost(state, def.maintenance);
    const defer = s.wellbeing < 0.3;
    if (!defer && canAfford(s, cost)) {
      pay(state, s, cost, 'maintenance');
      b.condition = Math.min(1, b.condition + 0.03);
      b.neglect = 0;
    } else {
      b.neglect += 1;
      b.condition -= 0.04;
      if (b.neglect === 6) pushEvent(state, 'neglect', `${def.label} at ${s.name} is falling into disrepair.`, b.cellId, s.id, 'warn');
    }
    if (b.condition <= 0.05) {
      ruined.push(b.id);
      if (b.type === 'port') ctx.routesDirty = true;
      pushEvent(state, 'ruined', `${def.label} at ${s.name} collapsed from neglect.`, b.cellId, s.id, 'bad');
    }
  }
  if (ruined.length) state.buildings = state.buildings.filter((b) => !ruined.includes(b.id));

  const keep = [];
  for (const r of state.roads) {
    const s = getSettlement(state, r.settlementId);
    if (r.status === 'construction') {
      r.progress += 1;
      if (r.progress >= 2) { r.status = 'active'; r.condition = 1; ctx.routesDirty = true; }
      keep.push(r);
      continue;
    }
    r.condition -= 0.004;
    const cost = scaledCost(state, ROAD_MAINTENANCE);
    if (s && s.wellbeing >= 0.3 && canAfford(s, cost)) {
      pay(state, s, cost, 'maintenance');
      r.condition = Math.min(1, r.condition + 0.02);
    } else {
      r.condition -= 0.02;
    }
    if (r.condition > 0.05) keep.push(r);
    else ctx.routesDirty = true;
  }
  state.roads = keep;
}
