import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BenchmarkReporter, buildBenchmarkReport } from './reporter.js';
import type { BenchmarkCaseResult } from './types.js';

function caseResult(id: string, status: BenchmarkCaseResult['status']): BenchmarkCaseResult {
  return {
    case: { id, name: id, description: '', level: 1, tags: [] },
    status,
    setup: {
      success: status !== 'setup-failed',
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:01.000Z',
    },
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:00:02.000Z',
    durationMs: 2000,
    targetUrl: 'http://localhost:8080',
    evaluation: {
      passed: status === 'passed',
      flag: { expectedFlag: 'FLAG{x}', detected: status === 'passed', capturedFlag: status === 'passed' ? 'FLAG{x}' : undefined },
      findings: { expectedTotal: 0, actualTotal: 0, matched: [], missed: [], extra: [] },
    },
  };
}

describe('BenchmarkReporter', () => {
  it('builds aggregate report metrics and stable evidence index', () => {
    const report = buildBenchmarkReport({
      suitePath: '/suite',
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:01:00.000Z',
      results: [caseResult('XBEN-001-24', 'passed'), caseResult('XBEN-002-24', 'setup-failed')],
    });

    expect(report).toMatchObject({
      total: 2,
      passed: 1,
      failed: 1,
      setupFailed: 1,
      passRate: 0.5,
    });
    expect(report.evidenceIndex.map(item => item.id)).toEqual(['XBEN-001-24', 'XBEN-002-24']);
  });

  it('writes per-case evidence and aggregate JSON/Markdown reports', async () => {
    const outputDir = await mkdtemp(path.join(os.tmpdir(), 'xbow-reporter-'));
    const reporter = new BenchmarkReporter(outputDir);
    const result = caseResult('XBEN-001-24', 'passed');
    const evidenceDir = await reporter.writeCaseEvidence(result);
    const report = buildBenchmarkReport({
      suitePath: '/suite',
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:01:00.000Z',
      results: [{ ...result, evidenceDir }],
    });
    const paths = await reporter.writeReport(report);

    await expect(readFile(path.join(evidenceDir, 'result.json'), 'utf-8')).resolves.toContain('XBEN-001-24');
    await expect(readFile(paths.jsonPath, 'utf-8')).resolves.toContain('"passRate": 1');
    await expect(readFile(paths.markdownPath, 'utf-8')).resolves.toContain('Blackbox XBOW Benchmark Report');
    await expect(readFile(paths.indexPath, 'utf-8')).resolves.toContain(evidenceDir);
  });
});
