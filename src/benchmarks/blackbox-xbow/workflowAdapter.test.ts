import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it } from 'vitest';
import { runBlackboxBenchmarkPentest } from './workflowAdapter.js';
import type { XBowBenchmarkCase } from './types.js';
import type { PentestWorkflowInput, PentestWorkflowResult } from '../../workflows/pentest.js';

const testCase: XBowBenchmarkCase = {
  id: 'XBEN-001-24',
  name: 'Login bypass',
  description: 'Bypass the login form',
  level: 1,
  tags: ['sqli', 'auth-bypass'],
  caseDir: '/private/suite/XBEN-001-24',
  composeDir: '/private/suite/XBEN-001-24',
  expectedResultsPath: '/private/suite/XBEN-001-24/expected_results.json',
};

function result(input: PentestWorkflowInput): PentestWorkflowResult {
  return {
    mode: input.cwd ? 'whitebox' : 'blackbox',
    outcomeMode: input.outcomeMode ?? 'proof',
    targets: [],
    workerResults: [],
    findings: [],
    report: { markdown: '', json: { target: input.target } as never },
  };
}

describe('runBlackboxBenchmarkPentest', () => {
  it('invokes runPentestWorkflow in blackbox mode without source or answer material', async () => {
    let captured: PentestWorkflowInput | undefined;
    const workflow = await runBlackboxBenchmarkPentest({
      testCase,
      targetUrl: 'http://localhost:8080',
      outputDir: '/tmp/bench',
      timeoutMs: 1000,
      runner: async input => {
        captured = input;
        return result(input);
      },
    });

    expect(workflow.mode).toBe('blackbox');
    expect(captured).toBeDefined();
    expect(captured).not.toHaveProperty('cwd');
    expect(JSON.stringify(captured)).not.toContain('/private/suite');
    expect(JSON.stringify(captured)).not.toContain('expected_results');
    expect(captured?.target).toBe('http://localhost:8080');
    expect(captured?.artifactDir).toBe('/tmp/bench/cases/XBEN-001-24/artifacts');
    expect(captured?.blackboxTargets?.[0]).toMatchObject({
      target: 'http://localhost:8080',
      objective: 'Bypass the login form',
    });
  });

  it('uses harness-backed worker runner when compatible context exists', async () => {
    const requestContext = new RequestContext();
    requestContext.set('harness', {
      runSubagent: async () => ({ content: 'ok' }),
    });
    let captured: PentestWorkflowInput | undefined;

    await runBlackboxBenchmarkPentest({
      testCase,
      targetUrl: 'http://localhost:8080',
      outputDir: '/tmp/bench',
      timeoutMs: 1000,
      context: { requestContext } as never,
      runner: async input => {
        captured = input;
        return result(input);
      },
    });

    expect(captured?.harnessWorkerRunner?.runSubagent).toBeTypeOf('function');
  });

  it('preserves headless fallback when no harness exists', async () => {
    let captured: PentestWorkflowInput | undefined;
    await runBlackboxBenchmarkPentest({
      testCase,
      targetUrl: 'http://localhost:8080',
      outputDir: '/tmp/bench',
      timeoutMs: 1000,
      runner: async input => {
        captured = input;
        return result(input);
      },
    });

    expect(captured?.harnessWorkerRunner).toBeUndefined();
  });
});
