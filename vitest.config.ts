import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      // Coverage is a release gate, not a dashboard-only number. The limits
      // preserve the current near-complete executable coverage while allowing
      // explicit defensive invariants that JavaScript cannot construct through
      // ordinary public inputs.
      thresholds: {
        statements: 99,
        branches: 97,
        functions: 100,
        lines: 99,
      },
    },
  },
});
