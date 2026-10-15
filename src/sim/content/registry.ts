/**
 * Safe Data-Driven Content Contracts (P084)
 *
 * Content registry for validating, compiling, and activating data-driven scenarios.
 */

import type { ScenarioDef } from '../scenarios';
import { compileDataScenario } from './compiler';
import { validateScenarioPackage } from './schema';

const customScenarios = new Map<string, ScenarioDef>();
let nextScenarioIndex = 100;

/**
 * Validates, compiles, and registers a custom data-driven scenario package.
 * Throws an Error if the package fails strict schema validation.
 */
export function registerDataScenario(pkg: unknown): ScenarioDef {
  const result = validateScenarioPackage(pkg);
  if (!result.ok) {
    throw new Error(`Invalid scenario package: ${result.errors.join('; ')}`);
  }

  const def = compileDataScenario(result.value, nextScenarioIndex++);
  customScenarios.set(def.id, def);
  return def;
}

/**
 * Removes a registered data scenario by id.
 */
export function unregisterDataScenario(id: string): boolean {
  return customScenarios.delete(id);
}

/**
 * Retrieves a registered data scenario definition by id.
 */
export function getRegisteredDataScenario(id: string): ScenarioDef | undefined {
  return customScenarios.get(id);
}

/**
 * Lists all registered data scenario definitions.
 */
export function getAllRegisteredDataScenarios(): ScenarioDef[] {
  return Array.from(customScenarios.values());
}

/**
 * Resets the custom scenario registry (primarily for isolated test fixtures).
 */
export function clearRegisteredDataScenarios(): void {
  customScenarios.clear();
  nextScenarioIndex = 100;
}
