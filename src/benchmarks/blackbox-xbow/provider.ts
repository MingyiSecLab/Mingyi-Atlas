import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { XBowBenchmarkCase, XBowBenchmarkFilters, XBowWinCondition } from './types.js';

interface RawBenchmarkMetadata {
  id?: string;
  name?: string;
  description?: string;
  level?: number | string;
  difficulty?: number | string;
  tags?: string[];
  win_condition?: string | { type?: string; flag_pattern?: string; flagPattern?: string; location?: string };
  winCondition?: { type?: string; flagPattern?: string; flag_pattern?: string; location?: string };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeWinCondition(raw: RawBenchmarkMetadata): XBowWinCondition | undefined {
  const source = raw.winCondition ?? raw.win_condition;
  if (!source) return undefined;
  if (typeof source === 'string') return { type: source };
  return {
    type: source.type,
    flagPattern: source.flagPattern ?? source.flag_pattern,
    location: source.location,
  };
}

function normalizeTags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string' && !!tag.trim()) : [];
}

export class XBowProvider {
  constructor(readonly suitePath: string) {}

  async loadCases(filters: XBowBenchmarkFilters = {}): Promise<XBowBenchmarkCase[]> {
    const caseDirs = await this.findCaseDirs();
    const cases: XBowBenchmarkCase[] = [];
    for (const caseDir of caseDirs) {
      const benchmarkFile = path.join(caseDir, 'benchmark.json');
      if (!(await exists(benchmarkFile))) continue;
      const data = JSON.parse(await readFile(benchmarkFile, 'utf-8')) as RawBenchmarkMetadata;
      const id = data.id ?? path.basename(caseDir);
      const level = Number(data.level ?? data.difficulty ?? 0);
      cases.push({
        id,
        name: data.name ?? id,
        description: data.description ?? '',
        level: Number.isFinite(level) ? level : 0,
        tags: normalizeTags(data.tags),
        winCondition: normalizeWinCondition(data),
        caseDir,
        composeDir: caseDir,
        expectedResultsPath: await this.findExpectedResults(caseDir),
      });
    }
    return this.applyFilters(cases.sort((a, b) => a.id.localeCompare(b.id)), filters);
  }

  private async findCaseDirs(): Promise<string[]> {
    const roots = [
      this.suitePath,
      path.join(this.suitePath, 'benchmarks'),
      path.join(this.suitePath, 'src'),
    ];
    const dirs: string[] = [];
    for (const root of roots) {
      if (!(await exists(root))) continue;
      if (await exists(path.join(root, 'benchmark.json'))) dirs.push(root);
      let entries;
      try {
        entries = await readdir(root, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const candidate = path.join(root, entry.name);
        if (await exists(path.join(candidate, 'benchmark.json'))) dirs.push(candidate);
      }
    }
    return Array.from(new Set(dirs));
  }

  private async findExpectedResults(caseDir: string): Promise<string | undefined> {
    const candidates = [
      path.join(caseDir, 'expected_results.json'),
      path.join(caseDir, 'expected_results', 'expected_results.json'),
      path.join(caseDir, 'expected_results', 'results.json'),
    ];
    for (const candidate of candidates) {
      if (await exists(candidate)) return candidate;
    }
    return undefined;
  }

  private applyFilters(cases: XBowBenchmarkCase[], filters: XBowBenchmarkFilters): XBowBenchmarkCase[] {
    let selected = cases;
    if (filters.ids?.length) {
      const wanted = new Set(filters.ids);
      selected = selected.filter(testCase => wanted.has(testCase.id));
    }
    if (filters.tags?.length) {
      const wanted = new Set(filters.tags.map(tag => tag.toLowerCase()));
      selected = selected.filter(testCase => testCase.tags.some(tag => wanted.has(tag.toLowerCase())));
    }
    if (filters.levels?.length) {
      const wanted = new Set(filters.levels);
      selected = selected.filter(testCase => wanted.has(testCase.level));
    }
    if (filters.rangeStart !== undefined || filters.rangeEnd !== undefined) {
      const start = filters.rangeStart !== undefined ? filters.rangeStart - 1 : undefined;
      selected = selected.slice(start, filters.rangeEnd);
    }
    return selected;
  }
}
