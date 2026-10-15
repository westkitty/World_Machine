/**
 * Verified Deployed-Release Identity (P083)
 *
 * Embeds build commit SHA, build timestamp, release version, and ruleset version.
 * Enables end-users, CI pipelines, and automated smoke tests to verify exact
 * deployed build identity and inspectability.
 */

declare const __BUILD_COMMIT_SHA__: string | undefined;
declare const __BUILD_TIMESTAMP__: string | undefined;
declare const __BUILD_VERSION__: string | undefined;
declare const __RULESET_VERSION__: number | undefined;

export interface ReleaseIdentity {
  version: string;
  commitSha: string;
  shortSha: string;
  buildTimestamp: string;
  rulesetVersion: number;
  environment: 'development' | 'production' | 'ci';
  repository: string;
}

export function getReleaseIdentity(): ReleaseIdentity {
  const version = typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : '1.0.0';
  const commitSha = typeof __BUILD_COMMIT_SHA__ !== 'undefined' ? __BUILD_COMMIT_SHA__ : 'dev-local';
  const buildTimestamp = typeof __BUILD_TIMESTAMP__ !== 'undefined' ? __BUILD_TIMESTAMP__ : new Date().toISOString();
  const rulesetVersion = typeof __RULESET_VERSION__ !== 'undefined' ? __RULESET_VERSION__ : 1;
  const shortSha = commitSha.length >= 7 ? commitSha.substring(0, 7) : commitSha;

  let environment: ReleaseIdentity['environment'] = 'production';
  if (typeof process !== 'undefined' && process.env?.CI) {
    environment = 'ci';
  } else if (commitSha === 'dev-local' || commitSha === 'development') {
    environment = 'development';
  }

  return {
    version,
    commitSha,
    shortSha,
    buildTimestamp,
    rulesetVersion,
    environment,
    repository: 'westkitty/World_Machine',
  };
}

export function formatReleaseBadge(identity: ReleaseIdentity = getReleaseIdentity()): string {
  return `v${identity.version} (${identity.shortSha}, ruleset v${identity.rulesetVersion})`;
}
