import { cpSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const source = resolve('src/skills');
const target = resolve('dist/skills');

if (!existsSync(source)) {
  process.exit(0);
}

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
