import { readFileSync } from 'node:fs';

import { defineConfig } from 'tsup';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/main.ts',
    tui: 'src/tui/index.ts',
  },
  format: ['esm', 'cjs'],
  clean: true,
  dts: true,
  splitting: true,
  treeshake: {
    preset: 'smallest',
  },
  define: {
    MINGYI_ATLAS_VERSION: JSON.stringify(pkg.version),
  },
  sourcemap: true,
});
