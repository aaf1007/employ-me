import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'helper',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
