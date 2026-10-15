import { applyCommand, type Command } from './commands';
import { createReferenceWorld } from './create';
import { step } from './engine';
import { createScenarioWorld } from './scenarios';
import {
  type GameMode,
  type WorldState,
} from './types';

/**
 * Automated Strategy Tournament (P074)
 *
 * Implements distinct legal AI strategies and a matched-seed tournament engine
 * evaluating multi-dimensional civilization outcomes: Resilience, Welfare,
 * Ecology, and Trade.
 *
 * Generates win/loss matrices, category rankings, and statistical distributions,
 * verifying that no single strategy dominates every planetary environment.
 */

export interface StrategyDecisionContext {
  state: WorldState;
  tick: number;
}

export interface AIStrategy {
  id: string;
  name: string;
  tagline: string;
  description: string;
  decide(ctx: StrategyDecisionContext): Command[];
}

export interface TournamentEnvironment {
  id: string;
  name: string;
  description: string;
  seed: string;
  mode: GameMode;
  scenarioId?: string;
}

export interface StrategyRunMetrics {
  strategyId: string;
  strategyName: string;
  environmentId: string;
  ticks: number;
  livingSettlements: number;
  totalPopulation: number;
  meanWellbeing: number;
  meanHealth: number;
  meanBiomass: number;
  meanDegradation: number;
  totalTradeDelivered: number;
  activeTradeRoutes: number;
  crisesExperienced: number;
  crisesResolved: number;
  minFoodReserveMonths: number;

  // Normalized scores (0-100)
  resilienceScore: number;
  welfareScore: number;
  ecologyScore: number;
  tradeScore: number;
  compositeScore: number;
}

export interface TournamentOutcome {
  environment: TournamentEnvironment;
  rankings: {
    composite: string[];
    resilience: string[];
    welfare: string[];
    ecology: string[];
    trade: string[];
  };
  metricsByStrategy: Record<string, StrategyRunMetrics>;
}

export interface TournamentReport {
  timestamp: string;
  ticksPerRun: number;
  totalEnvironments: number;
  totalStrategies: number;
  outcomes: TournamentOutcome[];
  winLossMatrix: Record<string, Record<string, number>>;
  categoryChampions: {
    resilience: string;
    welfare: string;
    ecology: string;
    trade: string;
    composite: string;
  };
  nonDominanceVerified: boolean;
}

// -----------------------------------------------------------------------------
// Legal AI Strategies
// -----------------------------------------------------------------------------

/**
 * 1. Passive / Laissez-Faire (Baseline Control)
 * Issues zero commands; allows world and communities to evolve purely autonomously.
 */
export const PassiveStrategy: AIStrategy = {
  id: 'passive',
  name: 'Laissez-Faire (Control)',
  tagline: 'Zero-intervention baseline',
  description: 'Applies no policy changes or commands. Observes natural baseline evolution.',
  decide: () => [],
};

/**
 * 2. Ecological Preservationist
 * Prioritizes conservation, restrained extraction, clean energy, and reforestation.
 */
export const PreservationistStrategy: AIStrategy = {
  id: 'preservationist',
  name: 'Ecological Preservationist',
  tagline: 'Prioritizes ecological equilibrium and low degradation',
  description: 'Maintains restrained extraction, designates nature reserves, and researches clean energy and reforestation.',
  decide({ state, tick }) {
    const cmds: Command[] = [];
    const live = state.settlements.filter((s) => s.alive);

    // Initial policy alignment
    if (tick === 0) {
      cmds.push({
        type: 'policy',
        patch: {
          extraction: 'restrained',
          growth: 'restrain',
          autonomy: 'limited',
          reserveMonths: 6,
        },
      });
    }

    // Technology research: prioritize affordable reforestation first, then clean energy
    if (live.length > 0) {
      if (!state.tech.reforestation.started && !state.tech.reforestation.done) {
        const funder = live.find((s) => (s.inventory.food ?? 0) >= 800 && (s.inventory.timber ?? 0) >= 400) ?? live[0];
        cmds.push({ type: 'research', tech: 'reforestation', fundingId: funder.id });
      } else if (!state.tech.clean_energy.started && !state.tech.clean_energy.done) {
        const funder = live.find((s) => (s.inventory.ore ?? 0) >= 2000 && (s.inventory.timber ?? 0) >= 800) ?? live[0];
        cmds.push({ type: 'research', tech: 'clean_energy', fundingId: funder.id });
      } else if (!state.tech.water_reclamation.started && !state.tech.water_reclamation.done) {
        const funder = live.find((s) => (s.inventory.ore ?? 0) >= 700 && (s.inventory.timber ?? 0) >= 500) ?? live[0];
        cmds.push({ type: 'research', tech: 'water_reclamation', fundingId: funder.id });
      }
    }

    // Designate nature reserves on unowned land
    if (tick % 6 === 0) {
      const candidateCell = state.cells.findIndex((c) => c.land && c.owner < 0 && !c.conserved && c.biomass > 0.2);
      if (candidateCell >= 0) {
        cmds.push({ type: 'conserve', cellId: candidateCell, on: true });
      }
    }

    // Build clean energy in living settlements lacking it
    for (const s of live) {
      const hasEnergy = state.buildings.some((b) => b.settlementId === s.id && b.type === 'energy');
      if (!hasEnergy && s.inventory.timber >= 200) {
        cmds.push({ type: 'build', building: 'energy', cellId: s.cellId });
      }
    }

    return cmds;
  },
};

/**
 * 3. Industrial Expansionist
 * Prioritizes intensive extraction, mining, roads, and rapid population expansion.
 */
export const IndustrialistStrategy: AIStrategy = {
  id: 'industrialist',
  name: 'Industrial Expansionist',
  tagline: 'Aggressive extraction, mining, and growth',
  description: 'Enforces intensive extraction, rapid expansion, deep mining, and maximum construction throughput.',
  decide({ state, tick }) {
    const cmds: Command[] = [];
    const live = state.settlements.filter((s) => s.alive);

    if (tick === 0) {
      cmds.push({
        type: 'policy',
        patch: {
          extraction: 'intensive',
          growth: 'encourage',
          autonomy: 'none',
          reserveMonths: 2,
        },
      });
    }

    // Research deep mining and masonry roads
    if (live.length > 0) {
      if (!state.tech.deep_mining.started && !state.tech.deep_mining.done) {
        cmds.push({ type: 'research', tech: 'deep_mining', fundingId: live[0].id });
      } else if (!state.tech.masonry_roads.started && !state.tech.masonry_roads.done) {
        cmds.push({ type: 'research', tech: 'masonry_roads', fundingId: live[0].id });
      }
    }

    // Expand mines on ore-rich territory
    for (const s of live) {
      const ownedCells = state.cells
        .map((c, idx) => ({ c, idx }))
        .filter(({ c }) => c.owner === s.id && c.ore > 500);
      for (const { idx } of ownedCells) {
        const hasMine = state.buildings.some((b) => b.cellId === idx && b.type === 'mine');
        if (!hasMine && s.inventory.timber >= 150) {
          cmds.push({ type: 'build', building: 'mine', cellId: idx });
          break;
        }
      }
    }

    // Connect adjacent settlements with roads
    if (tick % 6 === 0 && live.length >= 2) {
      const a = live[0];
      const b = live[1];
      const roadExists = state.roads.some((rd) => (rd.a === a.cellId && rd.b === b.cellId) || (rd.a === b.cellId && rd.b === a.cellId));
      if (!roadExists) {
        cmds.push({ type: 'road', fromCell: a.cellId, toCell: b.cellId });
      }
    }

    return cmds;
  },
};

/**
 * 4. Free-Trade Mercantilist
 * Prioritizes seafaring, complete trade route networks, and high storage capacity.
 */
export const MercantilistStrategy: AIStrategy = {
  id: 'mercantilist',
  name: 'Free-Trade Mercantilist',
  tagline: 'Interconnected trade routes and commerce',
  description: 'Prioritizes trade route expansion between all settlements, seafaring, and robust storage networks.',
  decide({ state, tick }) {
    const cmds: Command[] = [];
    const live = state.settlements.filter((s) => s.alive);

    if (tick === 0) {
      cmds.push({
        type: 'policy',
        patch: {
          extraction: 'normal',
          growth: 'neutral',
          autonomy: 'full',
          reserveMonths: 4,
          tradePriority: ['food', 'water', 'timber', 'ore'],
        },
      });
    }

    // Research seafaring and cold storage
    if (live.length > 0) {
      if (!state.tech.seafaring.started && !state.tech.seafaring.done) {
        cmds.push({ type: 'research', tech: 'seafaring', fundingId: live[0].id });
      } else if (!state.tech.cold_storage.started && !state.tech.cold_storage.done) {
        cmds.push({ type: 'research', tech: 'cold_storage', fundingId: live[0].id });
      }
    }

    // Open trade routes between pairs lacking a route
    if (live.length >= 2) {
      for (let i = 0; i < live.length; i++) {
        for (let j = i + 1; j < live.length; j++) {
          const a = live[i];
          const b = live[j];
          const hasRoute = state.routes.some((r) => (r.a === a.id && r.b === b.id) || (r.a === b.id && r.b === a.id));
          if (!hasRoute && a.inventory.timber >= 150) {
            cmds.push({ type: 'route', a: a.id, b: b.id });
            break;
          }
        }
      }
    }

    // Ensure storage in each settlement
    for (const s of live) {
      const hasStorage = state.buildings.some((b) => b.settlementId === s.id && b.type === 'storage');
      if (!hasStorage && s.inventory.timber >= 100) {
        cmds.push({ type: 'build', building: 'storage', cellId: s.cellId });
      }
    }

    return cmds;
  },
};

/**
 * 5. Agrarian Steward (Balanced Food & Welfare)
 * Focuses on food security, irrigation, crop rotation, and balanced labor.
 */
export const AgrarianStrategy: AIStrategy = {
  id: 'agrarian',
  name: 'Agrarian Steward',
  tagline: 'Focuses on food abundance and famine resilience',
  description: 'Prioritizes irrigation, crop rotation, farm placement on high-fertility land, and crisis food relief.',
  decide({ state, tick }) {
    const cmds: Command[] = [];
    const live = state.settlements.filter((s) => s.alive);

    if (tick === 0) {
      cmds.push({
        type: 'policy',
        patch: {
          extraction: 'normal',
          growth: 'neutral',
          autonomy: 'limited',
          reserveMonths: 5,
        },
      });
    }

    // Research irrigation and crop rotation
    if (live.length > 0) {
      if (!state.tech.irrigation.started && !state.tech.irrigation.done) {
        cmds.push({ type: 'research', tech: 'irrigation', fundingId: live[0].id });
      } else if (!state.tech.crop_rotation.started && !state.tech.crop_rotation.done) {
        cmds.push({ type: 'research', tech: 'crop_rotation', fundingId: live[0].id });
      }
    }

    // Construct farms if food reserves are low
    for (const s of live) {
      const monthlyFood = s.population * 0.15;
      const foodMonths = s.inventory.food / Math.max(1, monthlyFood);
      if (foodMonths < 5 && s.inventory.timber >= 120) {
        const candidateCells = state.cells
          .map((c, idx) => ({ c, idx }))
          .filter(({ c }) => c.owner === s.id && c.land && c.fertilityBase > 0.4);
        for (const { idx } of candidateCells) {
          const hasFarm = state.buildings.some((b) => b.cellId === idx && b.type === 'farm');
          if (!hasFarm) {
            cmds.push({ type: 'build', building: 'farm', cellId: idx });
            break;
          }
        }
      }
    }

    return cmds;
  },
};

export const STANDARD_STRATEGIES: AIStrategy[] = [
  PassiveStrategy,
  PreservationistStrategy,
  IndustrialistStrategy,
  MercantilistStrategy,
  AgrarianStrategy,
];

// -----------------------------------------------------------------------------
// Standard Tournament Environments
// -----------------------------------------------------------------------------

export const STANDARD_ENVIRONMENTS: TournamentEnvironment[] = [
  {
    id: 'terra-balanced',
    name: 'Terra Balanced (Continental)',
    description: 'Standard continental reference world with diverse biomes and moderate climate.',
    seed: 'TERRA-1',
    mode: 'sandbox',
  },
  {
    id: 'fragile-arid',
    name: 'Fragile Arid (Drought Prone)',
    description: 'High temperature, low moisture planetary seed where over-extraction triggers desertification.',
    seed: 'ARID-DROUGHT-9',
    mode: 'sandbox',
  },
  {
    id: 'verdant-fertile',
    name: 'Verdant Basin (Resource Rich)',
    description: 'High fertility and mineral abundance favoring rapid development and expansion.',
    seed: 'VERDANT-BASIN-4',
    mode: 'sandbox',
  },
  {
    id: 'maritime-archipelago',
    name: 'Maritime Archipelago (Trade Dependent)',
    description: 'Island clusters requiring seafaring and naval trade connections for survival.',
    seed: 'ISLES-ARCHIPELAGO-7',
    mode: 'sandbox',
  },
];

// -----------------------------------------------------------------------------
// Scoring Model
// -----------------------------------------------------------------------------

export function evaluateStrategyRun(
  state: WorldState,
  initialState: WorldState,
  strategy: AIStrategy,
  env: TournamentEnvironment,
  ticks: number
): StrategyRunMetrics {
  const live = state.settlements.filter((s) => s.alive);
  const initialLiveCount = Math.max(1, initialState.settlements.filter((s) => s.alive).length);
  const initialPop = Math.max(1, initialState.settlements.filter((s) => s.alive).reduce((a, b) => a + b.population, 0));

  const totalPop = live.reduce((a, b) => a + b.population, 0);
  const meanWellbeing = live.length > 0 ? live.reduce((a, b) => a + b.wellbeing, 0) / live.length : 0;
  const meanHealth = live.length > 0 ? live.reduce((a, b) => a + b.health, 0) / live.length : 0;

  let totalBiomass = 0;
  let totalDegradation = 0;
  for (const c of state.cells) {
    totalBiomass += c.biomass;
    totalDegradation += c.degradation;
  }
  const meanBiomass = totalBiomass / state.cells.length;
  const meanDegradation = totalDegradation / state.cells.length;

  let totalTrade = 0;
  for (const r of state.routes) {
    totalTrade += r.deliveredTotal;
  }
  const activeRoutes = state.routes.filter((r) => r.active).length;

  // Minimum food reserve months across settlements
  let minFoodReserveMonths = Infinity;
  for (const s of live) {
    const monthlyUsage = s.population * 0.15;
    const months = (s.inventory.food ?? 0) / Math.max(1, monthlyUsage);
    if (months < minFoodReserveMonths) minFoodReserveMonths = months;
  }
  if (!isFinite(minFoodReserveMonths)) minFoodReserveMonths = 0;

  const crisesExp = state.crises.length;
  const crisesResolved = state.crises.filter((c) => c.resolved).length;

  // 1. Resilience (Survival + Food buffer + Crisis recovery)
  const survivalFrac = live.length / initialLiveCount;
  const foodFrac = Math.min(1, minFoodReserveMonths / 4);
  const crisisFrac = crisesExp > 0 ? crisesResolved / crisesExp : 1;
  const resilienceScore = Math.max(0, Math.min(100, Math.round(survivalFrac * 50 + foodFrac * 30 + crisisFrac * 20)));

  // 2. Welfare (Wellbeing + Health + Pop stability)
  const popFrac = Math.min(1.5, totalPop / initialPop);
  const welfareScore = Math.max(0, Math.min(100, Math.round(meanWellbeing * 40 + meanHealth * 35 + (popFrac / 1.5) * 25)));

  // 3. Ecology (Low degradation + High biomass + Conserved reserves + Clean tech)
  const healthLandFrac = Math.max(0, 1 - meanDegradation);
  const biomassFrac = Math.min(1, meanBiomass / 0.5);
  const conservedCount = state.cells.filter((c) => c.conserved).length;
  const conservedFrac = Math.min(1, conservedCount / 4);
  const cleanTechFrac = (state.tech.clean_energy.done || state.tech.clean_energy.started ? 0.5 : 0) +
                        (state.tech.reforestation.done || state.tech.reforestation.started ? 0.5 : 0);
  const ecologyScore = Math.max(0, Math.min(100, Math.round(
    healthLandFrac * 40 +
    biomassFrac * 25 +
    conservedFrac * 20 +
    cleanTechFrac * 15
  )));

  // 4. Trade (Active routes + Delivered goods volume)
  const routesFrac = Math.min(1, activeRoutes / 4);
  const volumeFrac = Math.min(1, totalTrade / 5000);
  const tradeScore = Math.max(0, Math.min(100, Math.round(routesFrac * 45 + volumeFrac * 55)));

  // Composite Score
  const compositeScore = Math.round(
    resilienceScore * 0.30 +
    welfareScore * 0.30 +
    ecologyScore * 0.25 +
    tradeScore * 0.15
  );

  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    environmentId: env.id,
    ticks,
    livingSettlements: live.length,
    totalPopulation: Math.round(totalPop),
    meanWellbeing,
    meanHealth,
    meanBiomass,
    meanDegradation,
    totalTradeDelivered: Math.round(totalTrade),
    activeTradeRoutes: activeRoutes,
    crisesExperienced: crisesExp,
    crisesResolved,
    minFoodReserveMonths: Math.round(minFoodReserveMonths * 10) / 10,
    resilienceScore,
    welfareScore,
    ecologyScore,
    tradeScore,
    compositeScore,
  };
}

// -----------------------------------------------------------------------------
// Tournament Execution Engine
// -----------------------------------------------------------------------------

export function runTournament(
  strategies: AIStrategy[] = STANDARD_STRATEGIES,
  environments: TournamentEnvironment[] = STANDARD_ENVIRONMENTS,
  ticksPerRun = 48
): TournamentReport {
  const outcomes: TournamentOutcome[] = [];

  // Track head-to-head wins for win/loss matrix
  const winLossMatrix: Record<string, Record<string, number>> = {};
  for (const s1 of strategies) {
    winLossMatrix[s1.id] = {};
    for (const s2 of strategies) {
      winLossMatrix[s1.id][s2.id] = 0;
    }
  }

  // Cumulative category points
  const categoryPoints: Record<'resilience' | 'welfare' | 'ecology' | 'trade' | 'composite', Record<string, number>> = {
    resilience: {},
    welfare: {},
    ecology: {},
    trade: {},
    composite: {},
  };
  for (const s of strategies) {
    categoryPoints.resilience[s.id] = 0;
    categoryPoints.welfare[s.id] = 0;
    categoryPoints.ecology[s.id] = 0;
    categoryPoints.trade[s.id] = 0;
    categoryPoints.composite[s.id] = 0;
  }

  // Track composite winners across environments
  const environmentWinners = new Set<string>();

  for (const env of environments) {
    const metricsByStrategy: Record<string, StrategyRunMetrics> = {};

    for (const strat of strategies) {
      // 1. Initialize fresh matched world for this environment
      const state = env.scenarioId
        ? createScenarioWorld(env.scenarioId, env.mode === 'challenge')
        : createReferenceWorld(env.seed, {}, env.mode);

      const initialState = structuredClone(state);

      // 2. Run simulation applying strategy decisions
      for (let tick = 0; tick < ticksPerRun; tick++) {
        const decisions = strat.decide({ state, tick });
        for (const cmd of decisions) {
          applyCommand(state, cmd);
        }
        step(state);
      }

      // 3. Evaluate multi-dimensional metrics
      const metrics = evaluateStrategyRun(state, initialState, strat, env, ticksPerRun);
      metricsByStrategy[strat.id] = metrics;
    }

    // Rank strategies in this environment
    const rankBy = (key: keyof Pick<StrategyRunMetrics, 'compositeScore' | 'resilienceScore' | 'welfareScore' | 'ecologyScore' | 'tradeScore'>) =>
      [...strategies].sort((a, b) => metricsByStrategy[b.id][key] - metricsByStrategy[a.id][key]).map((s) => s.id);

    const compRank = rankBy('compositeScore');
    const resRank = rankBy('resilienceScore');
    const welRank = rankBy('welfareScore');
    const ecoRank = rankBy('ecologyScore');
    const trdRank = rankBy('tradeScore');

    environmentWinners.add(compRank[0]);

    // Head-to-head tracking
    for (let i = 0; i < strategies.length; i++) {
      for (let j = 0; j < strategies.length; j++) {
        if (i === j) continue;
        const idA = strategies[i].id;
        const idB = strategies[j].id;
        if (metricsByStrategy[idA].compositeScore > metricsByStrategy[idB].compositeScore) {
          winLossMatrix[idA][idB]++;
        }
      }
    }

    // Aggregate category points
    for (const s of strategies) {
      const m = metricsByStrategy[s.id];
      categoryPoints.composite[s.id] += m.compositeScore;
      categoryPoints.resilience[s.id] += m.resilienceScore;
      categoryPoints.welfare[s.id] += m.welfareScore;
      categoryPoints.ecology[s.id] += m.ecologyScore;
      categoryPoints.trade[s.id] += m.tradeScore;
    }

    outcomes.push({
      environment: env,
      rankings: {
        composite: compRank,
        resilience: resRank,
        welfare: welRank,
        ecology: ecoRank,
        trade: trdRank,
      },
      metricsByStrategy,
    });
  }

  const getBest = (cat: 'resilience' | 'welfare' | 'ecology' | 'trade' | 'composite') =>
    Object.entries(categoryPoints[cat]).sort((a, b) => b[1] - a[1])[0][0];

  // Invariant check: No one strategy dominates every environment by construction
  // (At least 2 distinct strategies must win or lead across different environments/categories)
  const nonDominanceVerified = environmentWinners.size >= 2 ||
    (getBest('ecology') !== getBest('trade') && getBest('resilience') !== getBest('composite'));

  return {
    timestamp: new Date().toISOString(),
    ticksPerRun,
    totalEnvironments: environments.length,
    totalStrategies: strategies.length,
    outcomes,
    winLossMatrix,
    categoryChampions: {
      resilience: getBest('resilience'),
      welfare: getBest('welfare'),
      ecology: getBest('ecology'),
      trade: getBest('trade'),
      composite: getBest('composite'),
    },
    nonDominanceVerified,
  };
}
