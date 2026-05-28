import type { BlackboxAuthInput } from '../../workflows/blackboxAttackSurface.js';
import type {
  PentestFindingJudge,
  PentestFindingScorer,
  PentestHarnessPhaseRunner,
  PentestWorkflowResult,
} from '../../workflows/pentest.js';
import type {
  PentestHarnessWorkerRunner,
  PentestWorkerExecutor,
} from '../../workflows/pentestWorker.js';

export type BenchmarkCaseStatus = 'passed' | 'failed' | 'setup-failed' | 'execution-failed' | 'timeout';

export interface XBowBenchmarkFilters {
  ids?: string[];
  tags?: string[];
  levels?: number[];
  rangeStart?: number;
  rangeEnd?: number;
}

export interface XBowWinCondition {
  type?: string;
  flagPattern?: string;
  location?: string;
}

export interface XBowBenchmarkCase {
  id: string;
  name: string;
  description: string;
  level: number;
  tags: string[];
  winCondition?: XBowWinCondition;
  caseDir: string;
  composeDir?: string;
  expectedResultsPath?: string;
}

export interface BenchmarkSetupResult {
  success: boolean;
  targetUrl?: string;
  composeFile?: string;
  runtimeComposeFile?: string;
  composeDir?: string;
  runtimeComposeDir?: string;
  temporaryComposeDir?: string;
  serviceName?: string;
  containerPort?: number;
  hostPort?: number;
  extraPorts?: Record<number, number>;
  startedAt: string;
  completedAt: string;
  error?: string;
}

export interface BenchmarkExecutionResult {
  success: boolean;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  artifactDir: string;
  workflow?: PentestWorkflowResult;
  error?: string;
  timedOut?: boolean;
}

export interface ExpectedFinding {
  id?: string;
  title?: string;
  name?: string;
  vulnerability?: string;
  description?: string;
  severity?: string;
  target?: string;
  tags?: string[];
}

export interface FindingComparisonResult {
  expectedTotal: number;
  actualTotal: number;
  matched: Array<{ expected: ExpectedFinding; actualId: string; actualTitle: string }>;
  missed: ExpectedFinding[];
  extra: Array<{ id: string; title: string; severity?: string }>;
}

export interface FlagEvaluationResult {
  expectedFlag?: string;
  detected: boolean;
  capturedFlag?: string;
  evidencePath?: string;
}

export interface BenchmarkEvaluationResult {
  passed: boolean;
  flag: FlagEvaluationResult;
  findings: FindingComparisonResult;
}

export interface BenchmarkCaseResult {
  case: Omit<XBowBenchmarkCase, 'caseDir' | 'composeDir' | 'expectedResultsPath'>;
  status: BenchmarkCaseStatus;
  targetUrl?: string;
  setup: BenchmarkSetupResult;
  execution?: BenchmarkExecutionResult;
  evaluation?: BenchmarkEvaluationResult;
  evidenceDir?: string;
  error?: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

export interface BenchmarkReport {
  suitePath: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  total: number;
  passed: number;
  failed: number;
  setupFailed: number;
  executionFailed: number;
  timedOut: number;
  passRate: number;
  results: BenchmarkCaseResult[];
  evidenceIndex: Array<{ id: string; status: BenchmarkCaseStatus; evidenceDir?: string; targetUrl?: string }>;
}

export interface XBowBenchmarkConfig {
  suitePath: string;
  outputDir: string;
  modelId?: string;
  filters: XBowBenchmarkFilters;
  timeoutMs: number;
  readinessTimeoutMs: number;
  cleanup: boolean;
  concurrency: number;
  continueOnFailure: boolean;
}

export interface XBowBenchmarkRunOptions {
  auth?: BlackboxAuthInput;
  runWorker?: PentestWorkerExecutor;
  harnessWorkerRunner?: PentestHarnessWorkerRunner;
  harnessPhaseRunner?: PentestHarnessPhaseRunner;
  judgeFinding?: PentestFindingJudge;
  scoreFinding?: PentestFindingScorer;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export type CommandRunner = (
  command: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number },
) => Promise<CommandResult>;
