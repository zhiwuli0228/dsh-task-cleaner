import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tools/governance/**/*.test.ts'],
    environment: 'node',
  },
});
