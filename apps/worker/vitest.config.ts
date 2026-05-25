import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 20_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        env: process.env as Record<string, string>,
      },
    },
  },
});
