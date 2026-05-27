import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeXBowFlag, evaluateBenchmarkCase } from './evaluator.js';
import type { XBowBenchmarkCase } from './types.js';
import type { PentestWorkflowResult } from '../../workflows/pentest.js';

function testCase(extra: Partial<XBowBenchmarkCase> = {}): XBowBenchmarkCase {
  return {
    id: 'XBEN-001-24',
    name: 'Login',
    description: '',
    level: 1,
    tags: ['sqli'],
    caseDir: '/private/suite/XBEN-001-24',
    ...extra,
  };
}

function workflow(extra: Partial<PentestWorkflowResult> = {}): PentestWorkflowResult {
  return {
    mode: 'blackbox',
    outcomeMode: 'exfil',
    targets: [],
    workerResults: [],
    findings: [],
    report: { markdown: '', json: { target: 'http://localhost:8080' } as never },
    ...extra,
  };
}

describe('blackbox XBOW evaluator', () => {
  it('detects computed XBOW flags from workflow output', async () => {
    const flag = computeXBowFlag('XBEN-001-24');
    const result = await evaluateBenchmarkCase({
      testCase: testCase(),
      workflow: workflow({ report: { markdown: `captured ${flag}`, json: {} as never } }),
    });

    expect(result.flag).toMatchObject({ detected: true, capturedFlag: flag });
    expect(result.passed).toBe(true);
  });

  it('detects explicit flag patterns from artifacts', async () => {
    const artifactDir = await mkdtemp(path.join(os.tmpdir(), 'xbow-eval-artifacts-'));
    await mkdir(path.join(artifactDir, 'nested'));
    await writeFile(path.join(artifactDir, 'nested', 'result.txt'), 'FLAG{custom}', 'utf-8');

    const result = await evaluateBenchmarkCase({
      testCase: testCase({ winCondition: { flagPattern: 'FLAG{custom}' } }),
      workflow: workflow(),
      artifactDir,
    });

    expect(result.flag.detected).toBe(true);
    expect(result.flag.evidencePath).toContain('result.txt');
  });

  it('compares expected findings without exposing them to workflow input', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'xbow-eval-expected-'));
    const expectedResultsPath = path.join(root, 'expected_results.json');
    await writeFile(expectedResultsPath, JSON.stringify({
      vulnerabilities: [
        { id: 'auth-bypass', title: 'Authentication bypass' },
        { id: 'ssti', title: 'SSTI' },
      ],
    }), 'utf-8');

    const result = await evaluateBenchmarkCase({
      testCase: testCase({ expectedResultsPath }),
      workflow: workflow({
        report: { markdown: computeXBowFlag('XBEN-001-24'), json: {} as never },
        findings: [
          {
            id: 'finding-auth-bypass',
            title: 'Authentication bypass via SQL injection',
            target: 'http://localhost/login',
            severity: 'high',
            description: 'auth-bypass confirmed',
            evidence: [{ kind: 'http', description: 'login bypass' }],
            confirmed: true,
          },
        ],
      }),
    });

    expect(result.findings.expectedTotal).toBe(2);
    expect(result.findings.matched).toHaveLength(1);
    expect(result.findings.missed).toHaveLength(1);
    expect(result.passed).toBe(false);
  });

  it('does not fail finding comparison when expected findings are absent', async () => {
    const result = await evaluateBenchmarkCase({
      testCase: testCase(),
      workflow: workflow({ report: { markdown: computeXBowFlag('XBEN-001-24'), json: {} as never } }),
    });

    expect(result.findings.expectedTotal).toBe(0);
    expect(result.findings.missed).toEqual([]);
    expect(result.passed).toBe(true);
  });
});
