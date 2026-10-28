import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'fill',
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
