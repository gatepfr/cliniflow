import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 15_000,
    pool: 'forks',
    singleFork: true,
    poolOptions: {
      forks: {
        env: process.env as Record<string, string>,
      },
    },
  },
});
