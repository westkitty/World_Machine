import { describe, expect, it } from 'vitest';
import { SCENARIOS, createScenarioWorld } from '../src/sim/scenarios';
import { runScenario, strategies } from './strategies';

/**
 * Every scenario (and its Challenge variant) must be winnable through ordinary
 * player commands, and must be lost when the player does nothing.
 */
describe.each(SCENARIOS.map((d) => [d.id, d] as const))('scenario %s', (id) => {
  for (const challenge of [false, true]) {
    const label = challenge ? 'challenge' : 'scenario';
    it(`${label}: a competent strategy succeeds`, () => {
      const s = runScenario(createScenarioWorld(id, challenge), strategies[id]);
      expect(s.scenario!.status, s.scenario!.message).toBe('success');
    });
    it(`${label}: neglect fails`, () => {
      const s = runScenario(createScenarioWorld(id, challenge), null);
      expect(s.scenario!.status).toBe('failure');
      expect(s.scenario!.message.length).toBeGreaterThan(0);
    });
  }
});
