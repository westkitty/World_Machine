/**
 * Safe Data-Driven Content Contracts (P084)
 *
 * Compiles validated ScenarioPackage declarations into standard ScenarioDef objects
 * for the simulation engine without requiring executable JavaScript in the package.
 */

import {
  bestFarmCells, chooseSites, placeBuilding, seedSettlement,
} from '../create';
import {
  CHALLENGE_RULES,
  foodMonths,
  largestNetwork,
  meanTerritoryBiomass,
  meanTerritoryDegradation,
  type Objective,
  type ScenarioDef,
} from '../scenarios';
import { GOODS, type BuildingType, type WorldState } from '../types';
import type { ScenarioObjectiveDef, ScenarioPackage } from './schema';

const alive = (s: WorldState) => s.settlements.filter((x) => x.alive);
const totalPop = (s: WorldState) => alive(s).reduce((a, x) => a + x.population, 0);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const n0 = (v: number) => Math.round(v).toLocaleString();

function obj(label: string, current: string, target: string, met: boolean, progress: number): Objective {
  return { label, current, target, met, progress: Math.max(0, Math.min(1, progress)) };
}

function evaluateObjective(oDef: ScenarioObjectiveDef, state: WorldState): Objective {
  switch (oDef.type) {
    case 'settlement_founded': {
      const live = alive(state);
      const met = live.length > 0;
      return obj(oDef.label, met ? live[0].name : 'expedition waiting', 'founded', met, met ? 1 : 0);
    }
    case 'min_population': {
      const pop = totalPop(state);
      const target = oDef.target ?? 1000;
      const met = pop >= target;
      return obj(oDef.label, n0(pop), `≥ ${n0(target)}`, met, target > 0 ? pop / target : 1);
    }
    case 'min_food_reserve_months': {
      const live = alive(state);
      const current = live.length ? Math.min(...live.map(foodMonths)) : 0;
      const target = oDef.targetMonths ?? 3;
      const met = current >= target;
      return obj(oDef.label, `${current.toFixed(1)} months`, `≥ ${target} months`, met, target > 0 ? current / target : 1);
    }
    case 'min_water_reserve_months': {
      const live = alive(state);
      const current = live.length
        ? Math.min(...live.map((s) => (s.population > 0 ? s.inventory.water / s.population : 0)))
        : 0;
      const target = oDef.targetMonths ?? 1.5;
      const met = current >= target;
      return obj(oDef.label, `${current.toFixed(1)} months`, `≥ ${target} months`, met, target > 0 ? current / target : 1);
    }
    case 'min_wellbeing': {
      const live = alive(state);
      const avg = live.length ? live.reduce((a, s) => a + s.wellbeing, 0) / live.length : 0;
      const target = oDef.targetRatio ?? 0.55;
      const met = avg >= target;
      return obj(oDef.label, pct(avg), `≥ ${pct(target)}`, met, target > 0 ? avg / target : 1);
    }
    case 'min_connected_settlements': {
      const count = largestNetwork(state);
      const target = oDef.target ?? 2;
      const met = count >= target;
      return obj(oDef.label, `${count} settlements`, `≥ ${target} settlements`, met, target > 0 ? count / target : 1);
    }
    case 'max_degradation': {
      const deg = meanTerritoryDegradation(state);
      const max = oDef.maxRatio ?? 0.25;
      const met = deg <= max;
      const progress = deg <= max ? 1 : Math.max(0, 1 - (deg - max) / (max || 1));
      return obj(oDef.label, pct(deg), `≤ ${pct(max)}`, met, progress);
    }
    case 'min_biomass': {
      const bio = meanTerritoryBiomass(state);
      const min = oDef.targetRatio ?? 0.6;
      const met = bio >= min;
      return obj(oDef.label, pct(bio), `≥ ${pct(min)}`, met, min > 0 ? bio / min : 1);
    }
    case 'trade_delivered': {
      const delivered = (state.scenario?.memo?.delivered as number) ?? 0;
      const target = oDef.target ?? 1000;
      const met = delivered >= target;
      return obj(oDef.label, n0(delivered), `≥ ${n0(target)}`, met, target > 0 ? delivered / target : 1);
    }
    default:
      return obj(oDef.label, 'unknown', 'unknown', false, 0);
  }
}

/**
 * Compiles a validated scenario package into an engine-compatible ScenarioDef.
 */
export function compileDataScenario(pkg: ScenarioPackage, scenarioIndex = 100): ScenarioDef {
  return {
    id: pkg.meta.id,
    index: scenarioIndex,
    title: pkg.meta.title,
    tagline: pkg.meta.tagline,
    brief: pkg.meta.brief,
    constraints: [...pkg.rules.constraints],
    seed: pkg.worldgen.seed,
    params: {
      oceanCoverage: pkg.worldgen.oceanCoverage,
      temperatureOffset: pkg.worldgen.temperatureOffset ?? pkg.worldgen.tempShift,
      moisture: pkg.worldgen.moisture ?? pkg.worldgen.rainfallMult,
      ruggedness: pkg.worldgen.ruggedness,
    },
    deadline: pkg.rules.deadline,
    holdMonths: pkg.rules.holdMonths,

    setup(state, rng, challenge) {
      if (pkg.setup.initialPolicy?.autonomy) {
        state.policy.autonomy = pkg.setup.initialPolicy.autonomy;
      } else {
        state.policy.autonomy = 'limited';
      }
      if (pkg.setup.initialPolicy?.rationing !== undefined) {
        state.policy.rationing = pkg.setup.initialPolicy.rationing;
      }

      const suppliesMult = challenge ? CHALLENGE_RULES.startingSupplies : 1;

      if (pkg.setup.mode === 'expedition' && pkg.setup.expedition) {
        const exp = pkg.setup.expedition;
        state.expedition = {
          population: exp.population,
          inventory: {
            food: exp.inventory.food * suppliesMult,
            water: exp.inventory.water * suppliesMult,
            timber: exp.inventory.timber * suppliesMult,
            ore: exp.inventory.ore * suppliesMult,
            energy: 0,
          },
        };
        for (const g of GOODS) {
          state.ledger.seeded[g] += state.expedition.inventory[g];
        }
        state.scenario!.baselinePopulation = exp.population;
      } else if (pkg.setup.mode === 'settlements' && pkg.setup.settlements) {
        const defs = pkg.setup.settlements;
        const count = defs.length;
        const minKm = Math.max(...defs.map((d) => d.siteCriteria?.minDistanceKm ?? 2500));
        const requireCoastal = defs.some((d) => d.siteCriteria?.requireCoastal);
        const preferDistinctLandmasses = defs.some((d) => d.siteCriteria?.preferDistinctLandmasses);

        const sites = chooseSites(state, {
          count,
          minKm,
          requireCoastal,
          preferDistinctLandmasses,
        });

        const targetIds: number[] = [];
        defs.forEach((sDef, idx) => {
          const cell = sites[idx % sites.length];
          const pop = sDef.population;
          const inv = {
            food: sDef.supplies.food * suppliesMult,
            water: sDef.supplies.water * suppliesMult,
            timber: sDef.supplies.timber * suppliesMult,
            ore: sDef.supplies.ore * suppliesMult,
          };
          const s = seedSettlement(state, cell, pop, inv, rng);
          if (sDef.name) s.name = sDef.name;
          targetIds.push(s.id);

          if (sDef.initialBuildings) {
            for (const bld of sDef.initialBuildings) {
              for (let k = 0; k < bld.count; k++) {
                if (bld.type === 'farm') {
                  const farms = bestFarmCells(state, s);
                  if (farms[k]) placeBuilding(state, s, 'farm', farms[k]);
                } else {
                  const terr = state.cells.map((c, i) => (c.owner === s.id ? i : -1)).filter((i) => i >= 0);
                  if (terr.length) {
                    placeBuilding(state, s, bld.type as BuildingType, terr[k % terr.length]);
                  }
                }
              }
            }
          }
        });

        const memo: Record<string, number> = { delivered: 0 };
        targetIds.forEach((id, tIdx) => { memo[`target_${tIdx}`] = id; });
        state.scenario!.memo = memo;
        state.scenario!.baselinePopulation = totalPop(state);
      }
    },

    objectives(state) {
      return pkg.objectives.map((o) => evaluateObjective(o, state));
    },

    failure(state) {
      const f = pkg.failure;
      const expDeadline = f?.expeditionDeadlineMonths ?? 12;
      if (state.expedition && state.tick >= expDeadline) {
        return f?.customMessages?.expeditionFailed ?? 'The expedition never settled and its supplies ran out.';
      }
      if (!state.expedition && alive(state).length === 0) {
        return f?.customMessages?.allDied ?? 'All settlements collapsed.';
      }
      if (!state.expedition && f?.minTotalPopulation && totalPop(state) < f.minTotalPopulation) {
        return f?.customMessages?.depopulated ?? `Population collapsed below ${n0(f.minTotalPopulation)}.`;
      }
      if (f?.maxTerritoryDegradation && meanTerritoryDegradation(state) >= f.maxTerritoryDegradation) {
        return f?.customMessages?.ecologicalCollapse ?? 'Territory degradation exceeded critical survival limits.';
      }
      return null;
    },

    risks(state) {
      const r: string[] = [];
      const expDeadline = pkg.failure?.expeditionDeadlineMonths ?? 12;
      if (pkg.risks?.trackExpeditionDeadline && state.expedition) {
        const rem = expDeadline - state.tick;
        if (rem > 0) r.push(`${rem} months left to found the settlement.`);
      }
      if (pkg.risks?.trackShortages) {
        for (const s of alive(state)) {
          if (s.last?.shortage?.length) {
            r.push(`${s.name} shortages: ${s.last.shortage.join(', ')}.`);
          }
        }
      }
      return r;
    },

    checkPolicyConstraint(patch, _state) {
      const allowed = pkg.rules.policyConstraints?.allowedAutonomy;
      if (allowed && patch.autonomy && !allowed.includes(patch.autonomy)) {
        return (
          pkg.rules.policyConstraints?.rationale ??
          `Scenario constraint: ${pkg.meta.title} only permits ${allowed.join(', ')} autonomy.`
        );
      }
      return null;
    },
  };
}
