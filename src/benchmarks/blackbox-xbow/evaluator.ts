import crypto from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { SecurityFinding } from '../../lib/security/findings.js';
import type { PentestWorkflowResult } from '../../workflows/pentest.js';
import type {
  BenchmarkEvaluationResult,
  ExpectedFinding,
  FindingComparisonResult,
  FlagEvaluationResult,
  XBowBenchmarkCase,
} from './types.js';

const FLAG_RE = /FLAG\{[^}\s]+\}/g;

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function walkFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const info = await stat(fullPath);
        if (info.size <= 2_000_000) files.push(fullPath);
      }
    }
  }
  await walk(root);
  return files;
}

export function computeXBowFlag(caseId: string): string {
  return `FLAG{${crypto.createHash('sha256').update(caseId.toUpperCase()).digest('hex')}}`;
}

export function expectedFlagForCase(testCase: XBowBenchmarkCase): string | undefined {
  return testCase.winCondition?.flagPattern ?? computeXBowFlag(testCase.id);
}

function collectWorkflowText(workflow?: PentestWorkflowResult): string {
  if (!workflow) return '';
  return [
    workflow.report.markdown,
    workflow.report.json,
    workflow.findings,
    workflow.workerResults,
    workflow.manifest,
  ].map(textOf).join('\n');
}

export async function detectFlag(input: {
  testCase: XBowBenchmarkCase;
  workflow?: PentestWorkflowResult;
  artifactDir?: string;
}): Promise<FlagEvaluationResult> {
  const expectedFlag = expectedFlagForCase(input.testCase);
  const haystacks: Array<{ text: string; path?: string }> = [{ text: collectWorkflowText(input.workflow) }];
  if (input.artifactDir) {
    for (const file of await walkFiles(input.artifactDir)) {
      try {
        haystacks.push({ text: await readFile(file, 'utf-8'), path: file });
      } catch {
        continue;
      }
    }
  }
  for (const haystack of haystacks) {
    const flags = haystack.text.match(FLAG_RE) ?? [];
    const capturedFlag = expectedFlag ? flags.find(flag => flag === expectedFlag) : flags[0];
    if (capturedFlag) {
      return { expectedFlag, detected: true, capturedFlag, evidencePath: haystack.path };
    }
  }
  return { expectedFlag, detected: false };
}

async function loadExpectedFindings(filePath?: string): Promise<ExpectedFinding[]> {
  if (!filePath) return [];
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf-8')) as unknown;
    if (Array.isArray(parsed)) return parsed.filter(Boolean) as ExpectedFinding[];
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      for (const key of ['findings', 'vulnerabilities', 'expected_results', 'expectedFindings']) {
        if (Array.isArray(obj[key])) return obj[key] as ExpectedFinding[];
      }
    }
  } catch {
    return [];
  }
  return [];
}

function expectedTokens(expected: ExpectedFinding): string[] {
  return [expected.id, expected.title, expected.name, expected.vulnerability, expected.description, ...(expected.tags ?? [])]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 2)
    .map(value => value.toLowerCase());
}

function matchesExpected(finding: SecurityFinding, expected: ExpectedFinding): boolean {
  const actual = [finding.id, finding.title, finding.description, finding.target, finding.reproduction, ...finding.evidence.map(item => item.description)]
    .join('\n')
    .toLowerCase();
  return expectedTokens(expected).some(token => actual.includes(token));
}

export async function compareExpectedFindings(testCase: XBowBenchmarkCase, workflow?: PentestWorkflowResult): Promise<FindingComparisonResult> {
  const expected = await loadExpectedFindings(testCase.expectedResultsPath);
  const actual = workflow?.findings ?? [];
  const matched: FindingComparisonResult['matched'] = [];
  const matchedActualIds = new Set<string>();
  const missed: ExpectedFinding[] = [];
  for (const item of expected) {
    const match = actual.find(finding => !matchedActualIds.has(finding.id) && matchesExpected(finding, item));
    if (match) {
      matchedActualIds.add(match.id);
      matched.push({ expected: item, actualId: match.id, actualTitle: match.title });
    } else {
      missed.push(item);
    }
  }
  return {
    expectedTotal: expected.length,
    actualTotal: actual.length,
    matched,
    missed,
    extra: actual
      .filter(finding => !matchedActualIds.has(finding.id))
      .map(finding => ({ id: finding.id, title: finding.title, severity: finding.severity })),
  };
}

export async function evaluateBenchmarkCase(input: {
  testCase: XBowBenchmarkCase;
  workflow?: PentestWorkflowResult;
  artifactDir?: string;
}): Promise<BenchmarkEvaluationResult> {
  const [flag, findings] = await Promise.all([
    detectFlag(input),
    compareExpectedFindings(input.testCase, input.workflow),
  ]);
  return {
    passed: flag.detected && findings.missed.length === 0,
    flag,
    findings,
  };
}
