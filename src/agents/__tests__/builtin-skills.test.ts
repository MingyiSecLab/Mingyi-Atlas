import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

function collectSkillMetadata(root: string) {
  const skills: Array<{ name: string; dirName: string; file: string }> = [];

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
        continue;
      }

      if (entry.name !== 'SKILL.md') continue;

      const text = fs.readFileSync(p, 'utf8');
      const match = text.match(/^---\n([\s\S]*?)\n---/);
      const frontmatter = match ? (parse(match[1]) ?? {}) : {};
      skills.push({
        name: String(frontmatter.name ?? ''),
        dirName: path.basename(path.dirname(p)),
        file: p,
      });
    }
  }

  walk(root);
  return skills;
}

describe('built-in skills', () => {
  it('use globally unique names that match their directory names', () => {
    const skills = collectSkillMetadata(path.resolve('src/skills'));
    const byName = new Map<string, string[]>();

    for (const skill of skills) {
      expect(skill.name, skill.file).toBe(skill.dirName);
      byName.set(skill.name, [...(byName.get(skill.name) ?? []), skill.file]);
    }

    const duplicates = [...byName.entries()].filter(([, files]) => files.length > 1);
    expect(duplicates).toEqual([]);
  });
});
