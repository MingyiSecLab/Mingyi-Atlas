import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { allowedSkillPaths, skillPaths } from '../workspace.js';

describe('workspace skill path definitions', () => {
  const cwd = process.cwd();
  const home = os.homedir();

  const expectedSkillPaths = [
    path.join(cwd, '.mastracode', 'skills'),
    path.join(cwd, '.claude', 'skills'),
    path.join(cwd, '.agents', 'skills'),
    path.join(home, '.mastracode', 'skills'),
    path.join(home, '.claude', 'skills'),
    path.join(home, '.agents', 'skills'),
    path.join(cwd, 'packages', 'skills', 'skills', 'pentest'),
    path.join(cwd, 'packages', 'skills', 'skills', 'shared'),
  ];

  it('uses the base and built-in skill directories for workspace discovery', () => {
    expect(skillPaths).toEqual(expectedSkillPaths);
  });

  it('uses the same skill directories for allowed paths', () => {
    expect(allowedSkillPaths).toBe(skillPaths);
  });

  it('wires the skill directories into workspace discovery and allowed paths', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(path.join(cwd, 'src/agents/workspace.ts'), 'utf-8');

    expect(source).toMatch(/const allowedPaths = \[\s*\.\.\.allowedSkillPaths/);
    expect(source).toContain('...(skillPaths.length > 0 ? { skills: skillPaths } : {}),');
  });

  it('exposes well-formed absolute skill paths', () => {
    for (const p of skillPaths) {
      expect(path.isAbsolute(p)).toBe(true);
      expect(p).toMatch(/(skills|pentest|shared)$/);
    }
  });
});
