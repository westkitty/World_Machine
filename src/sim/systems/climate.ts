import type { TickContext } from '../context';
import { evapDemand } from '../formulas';
import { getTopology } from '../topology';
import type { WorldState } from '../types';

/**
 * Seasonal phase for a latitude: +1 at local midsummer, −1 at midwinter.
 * Month 0 is "Thaw"; northern midsummer falls between months 5 and 6.
 */
export function seasonPhase(tick: number, latDeg: number): number {
  const month = tick % 12;
  const north = Math.cos((2 * Math.PI * (month - 5.5)) / 12);
  return latDeg >= 0 ? north : -north;
}

/** Solar declination in degrees (drives the rendered sun as well). */
export function solarDeclination(tick: number): number {
  return 23.4 * Math.cos((2 * Math.PI * ((tick % 12) - 5.5)) / 12);
}

export function climateSystem(state: WorldState, ctx: TickContext): void {
  const topo = getTopology();
  const { precipMult, tempOffset } = state.climate;
  for (let i = 0; i < topo.count; i++) {
    const c = state.cells[i];
    const lat = topo.lat[i];
    const phase = seasonPhase(state.tick, lat);
    const amp = (2 + 17 * (Math.abs(lat) / 90)) * (c.land ? (c.coastal ? 0.7 : 1) : 0.4);
    c.temperature = c.baseTemp + amp * phase + tempOffset;
    const monsoon = c.land && Math.abs(lat) < 35 ? 0.45 : 0.15;
    const p = (c.basePrecip / 12) * (1 + monsoon * phase) * precipMult * ctx.precipMult[i];
    c.precip = Math.max(0, p);
    if (!c.land) continue;
    const supply = Math.min(1, c.precip / evapDemand(c.temperature));
    c.moisture = c.moisture * 0.6 + 0.4 * supply;
    const normal = Math.max(1e-6, (c.basePrecip / 12) * (1 + monsoon * phase));
    const ratio = c.precip / normal;
    const target = Math.max(0, Math.min(1, (0.65 - ratio) / 0.65));
    c.drought = c.drought * 0.75 + 0.25 * target;
  }
}
