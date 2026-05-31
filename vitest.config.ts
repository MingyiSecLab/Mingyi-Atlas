import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit:mingyi-atlas',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/dist/**'],
          maxConcurrency: 1,
          fileParallelism: false,
          isolate: true,
        },
      },
    ],
  },
});
