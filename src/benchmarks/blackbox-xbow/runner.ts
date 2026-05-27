import path from 'node:path';
import { evaluateBenchmarkCase } from './evaluator.js';
import { ComposeEnvironment } from './composeEnvironment.js';
import { XBowProvider } from './provider.js';
import { BenchmarkReporter, buildBenchmarkReport } from './reporter.js';
import { runBlackboxBenchmarkPentest, type PentestWorkflowRunner } from './workflowAdapter.js';
import type {
  BenchmarkCaseResult,
  BenchmarkReport,
  BenchmarkSetupResult,
  XBowBenchmarkCase,
  XBowBenchmarkConfig,
  XBowBenchmarkRunOptions,
} from './types.js';

export interface RunBlackboxXBowBenchmarkOptions extends XBowBenchmarkRunOptions {
  provider?: Pick<XBowProvider, 'loadCases'>;
  environment?: Pick<ComposeEnvironment, 'setup' | 'teardown'>;
  reporter?: BenchmarkReporter;
  workflowRunner?: PentestWorkflowRunner;
  now?: () => Date;
}

function nowIso(now: () => Date): string {
  return now().toISOString();
}

function publicCase(testCase: XBowBenchmarkCase): BenchmarkCaseResult['case'] {
  return {
    id: testCase.id,
    name: testCase.name,
    description: testCase.description,
    level: testCase.level,
    tags: testCase.tags,
    winCondition: testCase.winCondition ? { type: testCase.winCondition.type, flagPattern: testCase.winCondition.flagPattern ? 'configured' : undefined } : undefined,
  };
}

function durationMs(startedAt: string, completedAt: string): number {
  return Math.max(0, Date.parse(completedAt) - Date.parse(startedAt));
}

function failedSetupResult(testCase: XBowBenchmarkCase, setup: BenchmarkSetupResult, startedAt: string, completedAt: string): BenchmarkCaseResult {
  return {
    case: publicCase(testCase),
    status: 'setup-failed',
    setup,
    startedAt,
    completedAt,
    durationMs: durationMs(startedAt, completedAt),
    error: setup.error,
  };
}

export class BlackboxXBowBenchmarkRunner {
  private readonly provider: Pick<XBowProvider, 'loadCases'>;
  private readonly environment: Pick<ComposeEnvironment, 'setup' | 'teardown'>;
  private readonly reporter: BenchmarkReporter;
  private readonly now: () => Date;

  constructor(private readonly config: XBowBenchmarkConfig, private readonly options: RunBlackboxXBowBenchmarkOptions = {}) {
    this.provider = options.provider ?? new XBowProvider(config.suitePath);
    this.environment = options.environment ?? new ComposeEnvironment({ readinessTimeoutMs: config.readinessTimeoutMs });
    this.reporter = options.reporter ?? new BenchmarkReporter(config.outputDir);
    this.now = options.now ?? (() => new Date());
  }

  async run(): Promise<BenchmarkReport> {
    const startedAt = nowIso(this.now);
    const cases = await this.provider.loadCases(this.config.filters);
    if (!cases.length) throw new Error(`No benchmark cases found for suite: ${this.config.suitePath}`);
    const results: BenchmarkCaseResult[] = [];
    for (const testCase of cases) {
      const result = await this.runCase(testCase);
      result.evidenceDir = await this.reporter.writeCaseEvidence(result);
      results.push(result);
      if (!this.config.continueOnFailure && result.status !== 'passed') break;
    }
    const completedAt = nowIso(this.now);
    const report = buildBenchmarkReport({ suitePath: this.config.suitePath, startedAt, completedAt, results });
    await this.reporter.writeReport(report);
    return report;
  }

  private async runCase(testCase: XBowBenchmarkCase): Promise<BenchmarkCaseResult> {
    const startedAt = nowIso(this.now);
    const setup = await this.environment.setup(testCase);
    if (!setup.success || !setup.targetUrl) {
      return failedSetupResult(testCase, setup, startedAt, nowIso(this.now));
    }
    try {
      const workflow = await runBlackboxBenchmarkPentest({
        testCase,
        targetUrl: setup.targetUrl,
        outputDir: this.config.outputDir,
        timeoutMs: this.config.timeoutMs,
        options: this.options,
        runner: this.options.workflowRunner,
      });
      const artifactDir = workflow.report.artifacts?.manifest
        ? path.dirname(workflow.report.artifacts.manifest)
        : path.join(this.config.outputDir, 'cases', testCase.id, 'artifacts');
      const evaluation = await evaluateBenchmarkCase({ testCase, workflow, artifactDir });
      const completedAt = nowIso(this.now);
      return {
        case: publicCase(testCase),
        status: evaluation.passed ? 'passed' : 'failed',
        targetUrl: setup.targetUrl,
        setup,
        execution: {
          success: true,
          startedAt,
          completedAt,
          durationMs: durationMs(startedAt, completedAt),
          artifactDir,
          workflow,
        },
        evaluation,
        startedAt,
        completedAt,
        durationMs: durationMs(startedAt, completedAt),
      };
    } catch (error) {
      const completedAt = nowIso(this.now);
      return {
        case: publicCase(testCase),
        status: error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'execution-failed',
        targetUrl: setup.targetUrl,
        setup,
        execution: {
          success: false,
          startedAt,
          completedAt,
          durationMs: durationMs(startedAt, completedAt),
          artifactDir: path.join(this.config.outputDir, 'cases', testCase.id, 'artifacts'),
          error: error instanceof Error ? error.message : String(error),
          timedOut: error instanceof DOMException && error.name === 'AbortError',
        },
        startedAt,
        completedAt,
        durationMs: durationMs(startedAt, completedAt),
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await this.environment.teardown(setup, this.config.cleanup);
    }
  }
}

export async function runBlackboxXBowBenchmark(
  config: XBowBenchmarkConfig,
  options?: RunBlackboxXBowBenchmarkOptions,
): Promise<BenchmarkReport> {
  return await new BlackboxXBowBenchmarkRunner(config, options).run();
}
