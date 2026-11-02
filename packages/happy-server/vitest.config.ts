import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: { HAPPY_PRIVATE_SITE: 'false' },
    include: ['**/*.test.ts', '**/*.spec.ts'],
  },
  plugins: [tsconfigPaths()]
});
