import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BenchmarkCaseResult, BenchmarkReport } from './types.js';

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function buildBenchmarkReport(input: {
  suitePath: string;
  startedAt: string;
  completedAt: string;
  results: BenchmarkCaseResult[];
}): BenchmarkReport {
  const total = input.results.length;
  const passed = input.results.filter(result => result.status === 'passed').length;
  const setupFailed = input.results.filter(result => result.status === 'setup-failed').length;
  const executionFailed = input.results.filter(result => result.status === 'execution-failed').length;
  const timedOut = input.results.filter(result => result.status === 'timeout').length;
  const failed = total - passed;
  return {
    suitePath: input.suitePath,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    durationMs: Date.parse(input.completedAt) - Date.parse(input.startedAt),
    total,
    passed,
    failed,
    setupFailed,
    executionFailed,
    timedOut,
    passRate: total ? passed / total : 0,
    results: input.results,
    evidenceIndex: input.results.map(result => ({
      id: result.case.id,
      status: result.status,
      evidenceDir: result.evidenceDir,
      targetUrl: result.targetUrl,
    })),
  };
}

function caseMarkdown(result: BenchmarkCaseResult): string {
  return [
    `# ${result.case.id}: ${result.case.name}`,
    '',
    `**Status:** ${result.status}`,
    `**Target URL:** ${result.targetUrl ?? 'n/a'}`,
    `**Duration:** ${result.durationMs}ms`,
    `**Setup:** ${result.setup.success ? 'success' : 'failed'}`,
    result.setup.error ? `**Setup error:** ${result.setup.error}` : undefined,
    result.error ? `**Error:** ${result.error}` : undefined,
    result.evaluation ? `**Flag:** ${result.evaluation.flag.detected ? 'captured' : 'missing'}` : undefined,
    result.evaluation?.flag.capturedFlag ? `**Captured flag:** \`${result.evaluation.flag.capturedFlag}\`` : undefined,
    result.evaluation ? `**Findings:** ${result.evaluation.findings.matched.length}/${result.evaluation.findings.expectedTotal} expected matched` : undefined,
    '',
  ].filter((line): line is string => line !== undefined).join('\n');
}

function reportMarkdown(report: BenchmarkReport): string {
  const lines = [
    '# Blackbox XBOW Benchmark Report',
    '',
    '## Summary',
    '',
    '| Metric | Value |',
    '|---|---:|',
    `| Total | ${report.total} |`,
    `| Passed | ${report.passed} |`,
    `| Failed | ${report.failed} |`,
    `| Setup failed | ${report.setupFailed} |`,
    `| Execution failed | ${report.executionFailed} |`,
    `| Timed out | ${report.timedOut} |`,
    `| Pass rate | ${pct(report.passRate)} |`,
    '',
    '## Cases',
    '',
    '| ID | Name | Status | Flag | Findings | Target | Evidence |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const result of report.results) {
    const flag = result.evaluation?.flag.detected ? 'captured' : 'missing';
    const findings = result.evaluation ? `${result.evaluation.findings.matched.length}/${result.evaluation.findings.expectedTotal}` : 'n/a';
    lines.push(`| ${result.case.id} | ${result.case.name} | ${result.status} | ${flag} | ${findings} | ${result.targetUrl ?? ''} | ${result.evidenceDir ?? ''} |`);
  }
  lines.push('');
  return lines.join('\n');
}

export class BenchmarkReporter {
  constructor(readonly outputDir: string) {}

  async writeCaseEvidence(result: BenchmarkCaseResult): Promise<string> {
    const evidenceDir = path.join(this.outputDir, 'cases', result.case.id, 'evidence');
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(path.join(evidenceDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf-8');
    await writeFile(path.join(evidenceDir, 'result.md'), caseMarkdown(result), 'utf-8');
    return evidenceDir;
  }

  async writeReport(report: BenchmarkReport): Promise<{ jsonPath: string; markdownPath: string; indexPath: string }> {
    await mkdir(this.outputDir, { recursive: true });
    const jsonPath = path.join(this.outputDir, 'benchmark-report.json');
    const markdownPath = path.join(this.outputDir, 'benchmark-report.md');
    const indexPath = path.join(this.outputDir, 'evidence-index.json');
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
    await writeFile(markdownPath, reportMarkdown(report), 'utf-8');
    await writeFile(indexPath, `${JSON.stringify(report.evidenceIndex, null, 2)}\n`, 'utf-8');
    return { jsonPath, markdownPath, indexPath };
  }
}
