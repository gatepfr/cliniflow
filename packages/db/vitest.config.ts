import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 30_000,
    pool: 'forks',
    singleFork: true,
    // Vitest 4.x fork workers don't automatically inherit process.env.
    // Explicitly pass connection vars so createAdapter() sees DATABASE_URL.
    poolOptions: {
      forks: {
        env: process.env as Record<string, string>,
      },
    },
  },
});
