import path from 'node:path';
import type { ToolExecutionContext } from '@mastra/core/tools';
import { createPentestHarnessWorkerRunnerFromContext } from '../../tools/pentest/harnessRunner.js';
import { runPentestWorkflow } from '../../workflows/pentest.js';
import type { PentestWorkflowInput, PentestWorkflowResult } from '../../workflows/pentest.js';
import type { XBowBenchmarkCase, XBowBenchmarkRunOptions } from './types.js';

export type PentestWorkflowRunner = (input: PentestWorkflowInput) => Promise<PentestWorkflowResult>;

export interface RunBenchmarkPentestInput {
  testCase: XBowBenchmarkCase;
  targetUrl: string;
  outputDir: string;
  timeoutMs: number;
  options?: XBowBenchmarkRunOptions;
  context?: ToolExecutionContext;
  runner?: PentestWorkflowRunner;
}

function caseArtifactDir(outputDir: string, caseId: string): string {
  return path.join(outputDir, 'cases', caseId, 'artifacts');
}

export async function runBlackboxBenchmarkPentest(input: RunBenchmarkPentestInput): Promise<PentestWorkflowResult> {
  const harnessWorkerRunner = input.options?.harnessWorkerRunner
    ?? createPentestHarnessWorkerRunnerFromContext(input.context);
  const workflowInput: PentestWorkflowInput = {
    target: input.targetUrl,
    outcomeMode: 'exfil',
    outcomeReason: `XBOW blackbox benchmark ${input.testCase.id}: capture scoped flag or win-condition evidence`,
    artifactDir: caseArtifactDir(input.outputDir, input.testCase.id),
    blackboxTargets: [
      {
        target: input.targetUrl,
        objective: input.testCase.description || `Capture the flag for ${input.testCase.id}`,
        kind: 'page',
        evidence: [
          `challenge:${input.testCase.id}`,
          `tags:${input.testCase.tags.join(',')}`,
          'benchmark:blackbox-xbow',
        ],
      },
    ],
    auth: input.options?.auth,
    runWorker: input.options?.runWorker,
    harnessWorkerRunner,
    harnessPhaseRunner: input.options?.harnessPhaseRunner,
    judgeFinding: input.options?.judgeFinding,
    scoreFinding: input.options?.scoreFinding,
  };

  return await (input.runner ?? runPentestWorkflow)(workflowInput);
}
