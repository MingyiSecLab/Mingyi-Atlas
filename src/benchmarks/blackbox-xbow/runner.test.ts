import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseXBowBenchmarkConfig } from './config.js';
import { runBlackboxXBowBenchmark } from './runner.js';
import type { BenchmarkSetupResult, XBowBenchmarkCase } from './types.js';
import type { PentestWorkflowInput, PentestWorkflowResult } from '../../workflows/pentest.js';

const caseOne: XBowBenchmarkCase = {
  id: 'XBEN-001-24',
  name: 'One',
  description: 'Capture one',
  level: 1,
  tags: ['sqli'],
  winCondition: { flagPattern: 'FLAG{one}' },
  caseDir: '/suite/XBEN-001-24',
};

const caseTwo: XBowBenchmarkCase = {
  ...caseOne,
  id: 'XBEN-002-24',
  name: 'Two',
  winCondition: { flagPattern: 'FLAG{two}' },
};

function setup(targetUrl: string): BenchmarkSetupResult {
  return {
    success: true,
    targetUrl,
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:00:01.000Z',
  };
}

function workflow(input: PentestWorkflowInput, flag: string): PentestWorkflowResult {
  return {
    mode: input.cwd ? 'whitebox' : 'blackbox',
    outcomeMode: input.outcomeMode ?? 'proof',
    targets: [],
    workerResults: [],
    findings: [],
    report: {
      markdown: `found ${flag}`,
      json: { target: input.target } as never,
      artifacts: { manifest: path.join(input.artifactDir ?? '', 'manifest.json') },
    },
  };
}

describe('BlackboxXBowBenchmarkRunner', () => {
  it('orchestrates setup, blackbox workflow execution, evaluation, reporting, and teardown', async () => {
    const outputDir = await mkdtemp(path.join(os.tmpdir(), 'xbow-runner-'));
    const calls: string[] = [];
    const workflowInputs: PentestWorkflowInput[] = [];
    const report = await runBlackboxXBowBenchmark(
      parseXBowBenchmarkConfig({ suitePath: '/suite', outputDir }),
      {
        provider: { loadCases: async () => [caseOne] },
        environment: {
          setup: async () => {
            calls.push('setup');
            return setup('http://localhost:8080');
          },
          teardown: async () => {
            calls.push('teardown');
          },
        },
        workflowRunner: async input => {
          workflowInputs.push(input);
          return workflow(input, 'FLAG{one}');
        },
      },
    );

    expect(calls).toEqual(['setup', 'teardown']);
    expect(report).toMatchObject({ total: 1, passed: 1, failed: 0 });
    expect(workflowInputs[0]).not.toHaveProperty('cwd');
    expect(workflowInputs[0]?.target).toBe('http://localhost:8080');
    await expect(readFile(path.join(outputDir, 'benchmark-report.json'), 'utf-8')).resolves.toContain('XBEN-001-24');
  });

  it('records setup failures without invoking workflow', async () => {
    const outputDir = await mkdtemp(path.join(os.tmpdir(), 'xbow-runner-setup-fail-'));
    let workflowCalled = false;
    const report = await runBlackboxXBowBenchmark(
      parseXBowBenchmarkConfig({ suitePath: '/suite', outputDir }),
      {
        provider: { loadCases: async () => [caseOne] },
        environment: {
          setup: async () => ({
            success: false,
            startedAt: '2026-01-01T00:00:00.000Z',
            completedAt: '2026-01-01T00:00:01.000Z',
            error: 'no compose',
          }),
          teardown: async () => {},
        },
        workflowRunner: async input => {
          workflowCalled = true;
          return workflow(input, 'FLAG{one}');
        },
      },
    );

    expect(workflowCalled).toBe(false);
    expect(report.setupFailed).toBe(1);
    expect(report.results[0]?.status).toBe('setup-failed');
  });

  it('supports fail-fast behavior via continueOnFailure=false', async () => {
    const outputDir = await mkdtemp(path.join(os.tmpdir(), 'xbow-runner-fail-fast-'));
    let setups = 0;
    const report = await runBlackboxXBowBenchmark(
      parseXBowBenchmarkConfig({ suitePath: '/suite', outputDir, continueOnFailure: false }),
      {
        provider: { loadCases: async () => [caseOne, caseTwo] },
        environment: {
          setup: async () => {
            setups += 1;
            return setup(`http://localhost:${8080 + setups}`);
          },
          teardown: async () => {},
        },
        workflowRunner: async input => workflow(input, 'FLAG{wrong}'),
      },
    );

    expect(setups).toBe(1);
    expect(report.total).toBe(1);
    expect(report.failed).toBe(1);
  });

  it('throws before agent execution when no cases are found', async () => {
    await expect(
      runBlackboxXBowBenchmark(
        parseXBowBenchmarkConfig({ suitePath: '/suite' }),
        {
          provider: { loadCases: async () => [] },
          environment: { setup: async () => setup('http://localhost:8080'), teardown: async () => {} },
        },
      ),
    ).rejects.toThrow('No benchmark cases found');
  });
});
