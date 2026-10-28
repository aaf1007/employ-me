import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/*',
      { test: { name: 'tools', environment: 'node', include: ['tools/**/*.test.ts'] } },
    ],
  },
});
