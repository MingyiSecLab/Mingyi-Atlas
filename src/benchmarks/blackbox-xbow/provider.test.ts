import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { XBowProvider } from './provider.js';

async function writeCase(root: string, id: string, data: Record<string, unknown>) {
  const dir = path.join(root, id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'benchmark.json'), `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
  return dir;
}

describe('XBowProvider', () => {
  it('loads benchmark cases in stable order from a benchmarks directory', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'xbow-provider-'));
    const benchmarks = path.join(root, 'benchmarks');
    await writeCase(benchmarks, 'XBEN-002-24', {
      name: 'Second',
      description: 'Second challenge',
      level: '2',
      tags: ['sqli', 'auth'],
      win_condition: { flag_pattern: 'FLAG{second}' },
    });
    await writeCase(benchmarks, 'XBEN-001-24', {
      name: 'First',
      description: 'First challenge',
      difficulty: 1,
      tags: ['xss'],
      winCondition: { flagPattern: 'FLAG{first}' },
    });

    const cases = await new XBowProvider(root).loadCases();

    expect(cases.map(testCase => testCase.id)).toEqual(['XBEN-001-24', 'XBEN-002-24']);
    expect(cases[0]).toMatchObject({
      name: 'First',
      description: 'First challenge',
      level: 1,
      tags: ['xss'],
      winCondition: { flagPattern: 'FLAG{first}' },
    });
    expect(cases[0]?.caseDir).toContain('XBEN-001-24');
  });

  it('filters by ids, tags, levels, and ranges', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'xbow-provider-filter-'));
    const benchmarks = path.join(root, 'benchmarks');
    await writeCase(benchmarks, 'XBEN-001-24', { level: 1, tags: ['xss'] });
    await writeCase(benchmarks, 'XBEN-002-24', { level: 2, tags: ['sqli'] });
    await writeCase(benchmarks, 'XBEN-003-24', { level: 2, tags: ['sqli', 'auth'] });

    const provider = new XBowProvider(root);

    await expect(provider.loadCases({ ids: ['XBEN-002-24'] })).resolves.toMatchObject([{ id: 'XBEN-002-24' }]);
    await expect(provider.loadCases({ tags: ['auth'] })).resolves.toMatchObject([{ id: 'XBEN-003-24' }]);
    await expect(provider.loadCases({ levels: [2], rangeStart: 1, rangeEnd: 1 })).resolves.toMatchObject([{ id: 'XBEN-002-24' }]);
  });

  it('keeps expected results as evaluator-only metadata', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'xbow-provider-expected-'));
    const dir = await writeCase(root, 'XBEN-001-24', { level: 1, tags: [] });
    await writeFile(path.join(dir, 'expected_results.json'), '{"vulnerabilities":[]}', 'utf-8');

    const [testCase] = await new XBowProvider(root).loadCases();

    expect(testCase?.expectedResultsPath).toBe(path.join(dir, 'expected_results.json'));
    expect(JSON.stringify({
      id: testCase?.id,
      name: testCase?.name,
      description: testCase?.description,
      tags: testCase?.tags,
    })).not.toContain('expected_results');
  });

  it('returns an empty list for missing or empty suites', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'xbow-provider-empty-'));
    await expect(new XBowProvider(path.join(root, 'missing')).loadCases()).resolves.toEqual([]);
    await expect(new XBowProvider(root).loadCases()).resolves.toEqual([]);
  });
});
