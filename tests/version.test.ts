import { describe, it, expect } from 'vitest';
import { formatReleaseBadge, getReleaseIdentity } from '../src/app/version';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Verified Deployed-Release Identity (P083)', () => {
  it('provides complete and valid release identity attributes', () => {
    const identity = getReleaseIdentity();

    expect(typeof identity.version).toBe('string');
    expect(identity.version.length).toBeGreaterThan(0);

    expect(typeof identity.commitSha).toBe('string');
    expect(identity.commitSha.length).toBeGreaterThanOrEqual(7);

    expect(typeof identity.shortSha).toBe('string');
    expect(identity.shortSha.length).toBeGreaterThanOrEqual(7);
    expect(identity.commitSha.startsWith(identity.shortSha)).toBe(true);

    expect(identity.rulesetVersion).toBe(1);
    expect(identity.repository).toBe('westkitty/World_Machine');
    expect(['development', 'production', 'ci']).toContain(identity.environment);

    // Timestamp is valid ISO 8601
    expect(isNaN(Date.parse(identity.buildTimestamp))).toBe(false);
  });

  it('formats human-readable release badge', () => {
    const badge = formatReleaseBadge();
    expect(badge).toMatch(/^v\d+\.\d+\.\d+ \([a-zA-Z0-9_-]+, ruleset v\d+\)$/);
  });

  it('generates deploy receipt upon production build', () => {
    const receiptPath = resolve(process.cwd(), 'dist/deploy-receipt.json');
    if (existsSync(receiptPath)) {
      const content = JSON.parse(readFileSync(receiptPath, 'utf8'));
      expect(content.version).toBe('1.0.0');
      expect(typeof content.commitSha).toBe('string');
      expect(content.commitSha.length).toBeGreaterThanOrEqual(7);
      expect(content.rulesetVersion).toBe(1);
      expect(content.repository).toBe('westkitty/World_Machine');
      expect(isNaN(Date.parse(content.buildTimestamp))).toBe(false);
    }
  });
});
