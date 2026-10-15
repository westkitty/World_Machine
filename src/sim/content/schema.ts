/**
 * Safe Data-Driven Content Contracts (P084)
 *
 * Defines the strict, serializable schema for data-driven scenario packages.
 * Forbids arbitrary executable code, eval, prototype manipulation, or unchecked inputs.
 */

export const ALLOWED_LICENSES = [
  'MIT',
  'Apache-2.0',
  'CC0-1.0',
  'CC-BY-4.0',
  'CC-BY-SA-4.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Unlicense',
] as const;

export type ContentLicense = typeof ALLOWED_LICENSES[number];

export interface ScenarioMetadata {
  id: string; // ^[a-z0-9_]{3,32}$
  title: string; // 1..64 chars
  tagline: string; // 1..128 chars
  brief: string; // 1..1024 chars
  author: string; // 1..64 chars
  license: ContentLicense;
  version: number; // integer >= 1
  schemaVersion: 1; // strict literal 1
}

export interface ScenarioWorldgenParams {
  seed: string; // 1..32 chars
  oceanCoverage?: number; // 0.3..0.85
  ruggedness?: number; // 0.2..1.6
  temperatureOffset?: number; // -10..10
  moisture?: number; // 0.4..1.6
  tempShift?: number; // alias for temperatureOffset (-10..10)
  rainfallMult?: number; // alias for moisture (0.4..1.6)
}

export interface ScenarioPolicyConstraints {
  allowedAutonomy?: ('none' | 'limited' | 'full')[];
  rationale?: string;
}

export interface ScenarioExpeditionSetup {
  population: number; // 50..50000
  inventory: {
    food: number;
    water: number;
    timber: number;
    ore: number;
  };
  foundingDeadlineMonths?: number; // 1..120
}

export interface ScenarioSettlementSetup {
  name?: string;
  population: number; // 50..50000
  supplies: {
    food: number;
    water: number;
    timber: number;
    ore: number;
  };
  siteCriteria?: {
    minDistanceKm?: number;
    requireCoastal?: boolean;
    preferDistinctLandmasses?: boolean;
  };
  initialBuildings?: Array<{
    type: 'farm' | 'well' | 'mine' | 'lumber_camp' | 'port' | 'depot' | 'storage';
    count: number;
  }>;
}

export interface ScenarioSetupConfig {
  mode: 'expedition' | 'settlements';
  expedition?: ScenarioExpeditionSetup;
  settlements?: ScenarioSettlementSetup[];
  initialPolicy?: {
    autonomy?: 'none' | 'limited' | 'full';
    rationing?: boolean;
  };
}

export type ScenarioObjectiveKind =
  | 'settlement_founded'
  | 'min_population'
  | 'min_food_reserve_months'
  | 'min_water_reserve_months'
  | 'min_wellbeing'
  | 'min_connected_settlements'
  | 'max_degradation'
  | 'min_biomass'
  | 'trade_delivered';

export interface ScenarioObjectiveDef {
  id: string;
  label: string;
  type: ScenarioObjectiveKind;
  target?: number;
  targetMonths?: number;
  targetRatio?: number;
  maxRatio?: number;
}

export interface ScenarioFailureConfig {
  expeditionDeadlineMonths?: number;
  requireLivingSettlements?: boolean;
  minTotalPopulation?: number;
  maxTerritoryDegradation?: number;
  customMessages?: {
    expeditionFailed?: string;
    allDied?: string;
    depopulated?: string;
    ecologicalCollapse?: string;
  };
}

export interface ScenarioRisksConfig {
  trackExpeditionDeadline?: boolean;
  trackShortages?: boolean;
  trackFoodReserveMonths?: number;
  trackWaterReserveMonths?: number;
}

export interface ScenarioPackage {
  meta: ScenarioMetadata;
  worldgen: ScenarioWorldgenParams;
  rules: {
    deadline: number;
    holdMonths: number;
    constraints: string[];
    policyConstraints?: ScenarioPolicyConstraints;
  };
  setup: ScenarioSetupConfig;
  objectives: ScenarioObjectiveDef[];
  failure?: ScenarioFailureConfig;
  risks?: ScenarioRisksConfig;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

const ID_REGEX = /^[a-z0-9_]{3,32}$/;
const SCRIPT_REGEX = /<\s*script|<\s*\/\s*script|javascript:|vbscript:|data:text\/html/i;

function checkNoPrototypePollution(val: unknown, path = ''): string | null {
  if (!val || typeof val !== 'object') return null;
  const protoKeys = ['__proto__', 'prototype', 'constructor'];
  for (const k of Object.getOwnPropertyNames(val)) {
    if (protoKeys.includes(k)) {
      return `Forbidden prototype pollution key "${k}" detected at ${path || 'root'}`;
    }
    const propVal = (val as Record<string, unknown>)[k];
    const subCheck = checkNoPrototypePollution(propVal, path ? `${path}.${k}` : k);
    if (subCheck) return subCheck;
  }
  return null;
}

function checkNoExecutableStrings(val: unknown, path = ''): string | null {
  if (typeof val === 'string') {
    if (SCRIPT_REGEX.test(val)) {
      return `Potential script/executable content detected in string at ${path}`;
    }
  } else if (val && typeof val === 'object') {
    for (const [k, v] of Object.entries(val)) {
      const subCheck = checkNoExecutableStrings(v, path ? `${path}.${k}` : k);
      if (subCheck) return subCheck;
    }
  }
  return null;
}

function checkAllowedKeys(obj: Record<string, unknown>, allowed: string[], context: string, errors: string[]): void {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) {
      errors.push(`Unknown field "${k}" in ${context}`);
    }
  }
}

/**
 * Validates a candidate scenario package strictly offline against the contract schema.
 * Returns either `{ ok: true, value: ScenarioPackage }` or `{ ok: false, errors: string[] }`.
 */
export function validateScenarioPackage(raw: unknown): ValidationResult<ScenarioPackage> {
  const errors: string[] = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['Scenario package must be a non-null object'] };
  }

  // Check prototype pollution and executable strings globally
  const protoErr = checkNoPrototypePollution(raw);
  if (protoErr) errors.push(protoErr);

  const execErr = checkNoExecutableStrings(raw);
  if (execErr) errors.push(execErr);

  const pkg = raw as Record<string, unknown>;
  checkAllowedKeys(pkg, ['meta', 'worldgen', 'rules', 'setup', 'objectives', 'failure', 'risks'], 'root', errors);

  // Validate meta
  if (!pkg.meta || typeof pkg.meta !== 'object' || Array.isArray(pkg.meta)) {
    errors.push('Missing or invalid "meta" block');
  } else {
    const meta = pkg.meta as Record<string, unknown>;
    checkAllowedKeys(meta, ['id', 'title', 'tagline', 'brief', 'author', 'license', 'version', 'schemaVersion'], 'meta', errors);

    if (meta.schemaVersion !== 1) {
      errors.push('meta.schemaVersion must be literal 1');
    }
    if (typeof meta.id !== 'string' || !ID_REGEX.test(meta.id)) {
      errors.push(`meta.id must be 3-32 lowercase alphanumeric or underscore characters (got "${meta.id}")`);
    }
    if (typeof meta.title !== 'string' || meta.title.length < 1 || meta.title.length > 64) {
      errors.push('meta.title must be a string between 1 and 64 characters');
    }
    if (typeof meta.tagline !== 'string' || meta.tagline.length < 1 || meta.tagline.length > 128) {
      errors.push('meta.tagline must be a string between 1 and 128 characters');
    }
    if (typeof meta.brief !== 'string' || meta.brief.length < 1 || meta.brief.length > 1024) {
      errors.push('meta.brief must be a string between 1 and 1024 characters');
    }
    if (typeof meta.author !== 'string' || meta.author.length < 1 || meta.author.length > 64) {
      errors.push('meta.author must be a string between 1 and 64 characters');
    }
    if (typeof meta.license !== 'string' || !ALLOWED_LICENSES.includes(meta.license as ContentLicense)) {
      errors.push(`meta.license must be one of allowed SPDX licenses: ${ALLOWED_LICENSES.join(', ')}`);
    }
    if (typeof meta.version !== 'number' || !Number.isInteger(meta.version) || meta.version < 1) {
      errors.push('meta.version must be an integer >= 1');
    }
  }

  // Validate worldgen
  if (!pkg.worldgen || typeof pkg.worldgen !== 'object' || Array.isArray(pkg.worldgen)) {
    errors.push('Missing or invalid "worldgen" block');
  } else {
    const wg = pkg.worldgen as Record<string, unknown>;
    checkAllowedKeys(wg, ['seed', 'oceanCoverage', 'ruggedness', 'temperatureOffset', 'moisture', 'tempShift', 'rainfallMult'], 'worldgen', errors);

    if (typeof wg.seed !== 'string' || wg.seed.length < 1 || wg.seed.length > 32) {
      errors.push('worldgen.seed must be a string between 1 and 32 characters');
    }
    if (wg.oceanCoverage !== undefined) {
      if (typeof wg.oceanCoverage !== 'number' || Number.isNaN(wg.oceanCoverage) || wg.oceanCoverage < 0.3 || wg.oceanCoverage > 0.85) {
        errors.push('worldgen.oceanCoverage must be a number between 0.3 and 0.85');
      }
    }
    if (wg.ruggedness !== undefined) {
      if (typeof wg.ruggedness !== 'number' || Number.isNaN(wg.ruggedness) || wg.ruggedness < 0.2 || wg.ruggedness > 1.6) {
        errors.push('worldgen.ruggedness must be a number between 0.2 and 1.6');
      }
    }
    const temp = wg.temperatureOffset ?? wg.tempShift;
    if (temp !== undefined) {
      if (typeof temp !== 'number' || Number.isNaN(temp) || temp < -10 || temp > 10) {
        errors.push('worldgen temperatureOffset/tempShift must be a number between -10 and 10');
      }
    }
    const moist = wg.moisture ?? wg.rainfallMult;
    if (moist !== undefined) {
      if (typeof moist !== 'number' || Number.isNaN(moist) || moist < 0.4 || moist > 1.6) {
        errors.push('worldgen moisture/rainfallMult must be a number between 0.4 and 1.6');
      }
    }
  }

  // Validate rules
  if (!pkg.rules || typeof pkg.rules !== 'object' || Array.isArray(pkg.rules)) {
    errors.push('Missing or invalid "rules" block');
  } else {
    const r = pkg.rules as Record<string, unknown>;
    checkAllowedKeys(r, ['deadline', 'holdMonths', 'constraints', 'policyConstraints'], 'rules', errors);

    if (typeof r.deadline !== 'number' || !Number.isInteger(r.deadline) || r.deadline < 12 || r.deadline > 2400) {
      errors.push('rules.deadline must be an integer between 12 and 2400 months');
    }
    if (typeof r.holdMonths !== 'number' || !Number.isInteger(r.holdMonths) || r.holdMonths < 0 || r.holdMonths > 120) {
      errors.push('rules.holdMonths must be an integer between 0 and 120 months');
    }
    if (!Array.isArray(r.constraints)) {
      errors.push('rules.constraints must be an array of strings');
    } else {
      if (r.constraints.length > 10) errors.push('rules.constraints cannot exceed 10 entries');
      for (let i = 0; i < r.constraints.length; i++) {
        if (typeof r.constraints[i] !== 'string' || r.constraints[i].length < 1 || r.constraints[i].length > 128) {
          errors.push(`rules.constraints[${i}] must be a string between 1 and 128 characters`);
        }
      }
    }

    if (r.policyConstraints !== undefined) {
      if (typeof r.policyConstraints !== 'object' || Array.isArray(r.policyConstraints)) {
        errors.push('rules.policyConstraints must be an object');
      } else {
        const pc = r.policyConstraints as Record<string, unknown>;
        checkAllowedKeys(pc, ['allowedAutonomy', 'rationale'], 'rules.policyConstraints', errors);
        if (pc.allowedAutonomy !== undefined) {
          if (!Array.isArray(pc.allowedAutonomy)) {
            errors.push('rules.policyConstraints.allowedAutonomy must be an array');
          } else {
            const valid = ['none', 'limited', 'full'];
            for (const a of pc.allowedAutonomy) {
              if (!valid.includes(String(a))) {
                errors.push(`rules.policyConstraints.allowedAutonomy contains invalid autonomy "${a}"`);
              }
            }
          }
        }
        if (pc.rationale !== undefined && (typeof pc.rationale !== 'string' || pc.rationale.length > 256)) {
          errors.push('rules.policyConstraints.rationale must be a string up to 256 characters');
        }
      }
    }
  }

  // Validate setup
  if (!pkg.setup || typeof pkg.setup !== 'object' || Array.isArray(pkg.setup)) {
    errors.push('Missing or invalid "setup" block');
  } else {
    const s = pkg.setup as Record<string, unknown>;
    checkAllowedKeys(s, ['mode', 'expedition', 'settlements', 'initialPolicy'], 'setup', errors);

    if (s.mode !== 'expedition' && s.mode !== 'settlements') {
      errors.push('setup.mode must be either "expedition" or "settlements"');
    }

    if (s.mode === 'expedition') {
      if (!s.expedition || typeof s.expedition !== 'object' || Array.isArray(s.expedition)) {
        errors.push('setup.expedition is required when setup.mode is "expedition"');
      } else {
        const exp = s.expedition as Record<string, unknown>;
        checkAllowedKeys(exp, ['population', 'inventory', 'foundingDeadlineMonths'], 'setup.expedition', errors);
        if (typeof exp.population !== 'number' || !Number.isInteger(exp.population) || exp.population < 50 || exp.population > 50000) {
          errors.push('setup.expedition.population must be an integer between 50 and 50000');
        }
        if (!exp.inventory || typeof exp.inventory !== 'object') {
          errors.push('setup.expedition.inventory is required');
        } else {
          const inv = exp.inventory as Record<string, unknown>;
          for (const g of ['food', 'water', 'timber', 'ore']) {
            if (typeof inv[g] !== 'number' || Number.isNaN(inv[g]) || (inv[g] as number) < 0 || (inv[g] as number) > 1000000) {
              errors.push(`setup.expedition.inventory.${g} must be a number between 0 and 1,000,000`);
            }
          }
        }
      }
    }

    if (s.mode === 'settlements') {
      if (!Array.isArray(s.settlements) || s.settlements.length === 0 || s.settlements.length > 10) {
        errors.push('setup.settlements must be an array of 1 to 10 settlement definitions');
      } else {
        for (let i = 0; i < s.settlements.length; i++) {
          const st = s.settlements[i];
          if (!st || typeof st !== 'object') {
            errors.push(`setup.settlements[${i}] must be an object`);
            continue;
          }
          checkAllowedKeys(st, ['name', 'population', 'supplies', 'siteCriteria', 'initialBuildings'], `setup.settlements[${i}]`, errors);
          if (typeof st.population !== 'number' || !Number.isInteger(st.population) || st.population < 50 || st.population > 50000) {
            errors.push(`setup.settlements[${i}].population must be an integer between 50 and 50000`);
          }
          if (!st.supplies || typeof st.supplies !== 'object') {
            errors.push(`setup.settlements[${i}].supplies is required`);
          } else {
            for (const g of ['food', 'water', 'timber', 'ore']) {
              if (typeof st.supplies[g] !== 'number' || Number.isNaN(st.supplies[g]) || st.supplies[g] < 0 || st.supplies[g] > 1000000) {
                errors.push(`setup.settlements[${i}].supplies.${g} must be a number between 0 and 1,000,000`);
              }
            }
          }
          if (st.initialBuildings !== undefined) {
            if (!Array.isArray(st.initialBuildings)) {
              errors.push(`setup.settlements[${i}].initialBuildings must be an array`);
            } else {
              const allowedBld = ['farm', 'well', 'mine', 'lumber_camp', 'port', 'depot', 'storage'];
              for (const b of st.initialBuildings) {
                if (!b || typeof b !== 'object' || !allowedBld.includes(b.type) || typeof b.count !== 'number' || b.count < 1 || b.count > 10) {
                  errors.push(`setup.settlements[${i}].initialBuildings has invalid building spec`);
                }
              }
            }
          }
        }
      }
    }

    if (s.initialPolicy !== undefined) {
      if (typeof s.initialPolicy !== 'object' || Array.isArray(s.initialPolicy)) {
        errors.push('setup.initialPolicy must be an object');
      } else {
        const ip = s.initialPolicy as Record<string, unknown>;
        checkAllowedKeys(ip, ['autonomy', 'rationing'], 'setup.initialPolicy', errors);
        if (ip.autonomy !== undefined && !['none', 'limited', 'full'].includes(String(ip.autonomy))) {
          errors.push('setup.initialPolicy.autonomy must be "none", "limited", or "full"');
        }
        if (ip.rationing !== undefined && typeof ip.rationing !== 'boolean') {
          errors.push('setup.initialPolicy.rationing must be a boolean');
        }
      }
    }
  }

  // Validate objectives
  if (!Array.isArray(pkg.objectives) || pkg.objectives.length === 0 || pkg.objectives.length > 8) {
    errors.push('objectives must be an array of 1 to 8 objective items');
  } else {
    const validTypes: ScenarioObjectiveKind[] = [
      'settlement_founded',
      'min_population',
      'min_food_reserve_months',
      'min_water_reserve_months',
      'min_wellbeing',
      'min_connected_settlements',
      'max_degradation',
      'min_biomass',
      'trade_delivered',
    ];

    for (let i = 0; i < pkg.objectives.length; i++) {
      const o = pkg.objectives[i];
      if (!o || typeof o !== 'object') {
        errors.push(`objectives[${i}] must be an object`);
        continue;
      }
      checkAllowedKeys(o, ['id', 'label', 'type', 'target', 'targetMonths', 'targetRatio', 'maxRatio'], `objectives[${i}]`, errors);

      if (typeof o.id !== 'string' || o.id.length < 1 || o.id.length > 32) {
        errors.push(`objectives[${i}].id must be a string between 1 and 32 characters`);
      }
      if (typeof o.label !== 'string' || o.label.length < 1 || o.label.length > 64) {
        errors.push(`objectives[${i}].label must be a string between 1 and 64 characters`);
      }
      if (!validTypes.includes(o.type)) {
        errors.push(`objectives[${i}].type must be one of: ${validTypes.join(', ')}`);
      }

      if (o.type === 'min_population' || o.type === 'min_connected_settlements' || o.type === 'trade_delivered') {
        if (typeof o.target !== 'number' || Number.isNaN(o.target) || o.target < 1) {
          errors.push(`objectives[${i}] (${o.type}) requires numeric "target" >= 1`);
        }
      }
      if (o.type === 'min_food_reserve_months' || o.type === 'min_water_reserve_months') {
        if (typeof o.targetMonths !== 'number' || Number.isNaN(o.targetMonths) || o.targetMonths <= 0) {
          errors.push(`objectives[${i}] (${o.type}) requires numeric "targetMonths" > 0`);
        }
      }
      if (o.type === 'min_wellbeing' || o.type === 'min_biomass') {
        if (typeof o.targetRatio !== 'number' || Number.isNaN(o.targetRatio) || o.targetRatio < 0 || o.targetRatio > 1) {
          errors.push(`objectives[${i}] (${o.type}) requires numeric "targetRatio" between 0 and 1`);
        }
      }
      if (o.type === 'max_degradation') {
        if (typeof o.maxRatio !== 'number' || Number.isNaN(o.maxRatio) || o.maxRatio < 0 || o.maxRatio > 1) {
          errors.push(`objectives[${i}] (max_degradation) requires numeric "maxRatio" between 0 and 1`);
        }
      }
    }
  }

  // Validate failure block (optional)
  if (pkg.failure !== undefined) {
    if (typeof pkg.failure !== 'object' || Array.isArray(pkg.failure)) {
      errors.push('failure block must be an object');
    } else {
      const f = pkg.failure as Record<string, unknown>;
      checkAllowedKeys(f, ['expeditionDeadlineMonths', 'requireLivingSettlements', 'minTotalPopulation', 'maxTerritoryDegradation', 'customMessages'], 'failure', errors);
      if (f.customMessages !== undefined) {
        if (typeof f.customMessages !== 'object' || Array.isArray(f.customMessages)) {
          errors.push('failure.customMessages must be an object');
        } else {
          checkAllowedKeys(f.customMessages as Record<string, unknown>, ['expeditionFailed', 'allDied', 'depopulated', 'ecologicalCollapse'], 'failure.customMessages', errors);
        }
      }
    }
  }

  // Validate risks block (optional)
  if (pkg.risks !== undefined) {
    if (typeof pkg.risks !== 'object' || Array.isArray(pkg.risks)) {
      errors.push('risks block must be an object');
    } else {
      const rk = pkg.risks as Record<string, unknown>;
      checkAllowedKeys(rk, ['trackExpeditionDeadline', 'trackShortages', 'trackFoodReserveMonths', 'trackWaterReserveMonths'], 'risks', errors);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value: raw as ScenarioPackage };
}
