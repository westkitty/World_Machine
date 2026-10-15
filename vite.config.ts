import { defineConfig } from 'vite';

// GitHub Pages serves the project at /World_Machine/. Relative base keeps the
// build portable to any static host or subpath.
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as never);
