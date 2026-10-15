import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

function getGitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync('git rev-parse HEAD').toString().trim();
  } catch {
    return 'development';
  }
}

const commitSha = getGitSha();
const buildTimestamp = new Date().toISOString();

function deployReceiptPlugin(): Plugin {
  return {
    name: 'deploy-receipt-plugin',
    closeBundle() {
      try {
        const distDir = resolve(process.cwd(), 'dist');
        mkdirSync(distDir, { recursive: true });
        const receipt = {
          version: '1.0.0',
          commitSha,
          shortSha: commitSha.length >= 7 ? commitSha.substring(0, 7) : commitSha,
          buildTimestamp,
          rulesetVersion: 1,
          repository: 'westkitty/World_Machine',
          environment: process.env.CI ? 'ci' : 'production',
        };
        writeFileSync(resolve(distDir, 'deploy-receipt.json'), JSON.stringify(receipt, null, 2));
      } catch (err) {
        console.warn('Failed to write deploy-receipt.json:', err);
      }
    },
  };
}

// GitHub Pages serves the project at /World_Machine/. Relative base keeps the
// build portable to any static host or subpath.
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  define: {
    __BUILD_COMMIT_SHA__: JSON.stringify(commitSha),
    __BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp),
    __BUILD_VERSION__: JSON.stringify('1.0.0'),
    __RULESET_VERSION__: 1,
  },
  plugins: [deployReceiptPlugin()],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as never);

