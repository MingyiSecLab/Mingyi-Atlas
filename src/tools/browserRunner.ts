import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { getPentestFindingsPath } from '../security/pentest/findings.js';
import {
  browserSessionIdSchema,
  closeBrowserContainer,
  ensureBrowserContainer,
  execBrowserCli,
  getBrowserContainerName,
  pruneStaleBrowserContainers,
  type DockerCommandResult,
} from '../security/shared/browser-container.js';
import { validateContainerTargets } from './containerRunner.js';
import { getRecordedScopeHosts, scopeTargetsToHosts } from './httpRequest.js';
import { resolvePentestProjectContext } from './pentestTarget.js';

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_BROWSER_RUNNER_IMAGE = 'pentest-browser-runner:latest';
const DEFAULT_BROWSER_CONTAINER_TTL_MS = 6 * 60 * 60_000;
const MAX_INLINE_STDIO_BYTES = 8_000;

const outputFileSchema = z
  .string()
  .regex(/^[a-zA-Z0-9._-]+$/, 'Output files must be simple filenames under /out.');

export const browserCliInputSchema = z
  .object({
    sessionId: browserSessionIdSchema.describe('Task-scoped browser session id. Reuse it across calls in the same task.'),
    action: z
      .enum(['exec', 'close'])
      .default('exec')
      .describe('Use exec to run playwright-cli in the task browser container, close to destroy it.'),
    argv: z
      .union([z.array(z.string().min(1).max(500)).max(120), z.string().min(1).max(20_000)])
      .default([])
      .describe(
        'Argument vector passed to playwright-cli. Prefer string[]. A JSON-encoded string[] is accepted for compatibility. Do not include the playwright-cli binary name.',
      ),
    targets: z
      .array(z.string().min(1))
      .default([])
      .describe('URLs/hosts this browser command will touch. Used for scope validation and /input/targets.txt generation.'),
    scopeHosts: z
      .array(z.string().min(1))
      .default([])
      .describe('Authorized hostnames copied from the user-approved scope. Recorded pentest scope is also honored.'),
    expectedOutputs: z.array(outputFileSchema).default([]).describe('Expected files written under /out.'),
    timeoutMs: z.number().int().positive().max(MAX_TIMEOUT_MS).default(DEFAULT_TIMEOUT_MS),
    purpose: z.string().min(1).describe('Concise reason for running or closing the browser CLI session.'),
  })
  .superRefine((input, ctx) => {
    if (input.action === 'exec' && (Array.isArray(input.argv) ? input.argv.length === 0 : input.argv.trim().length === 0)) {
      ctx.addIssue({
        code: 'custom',
        path: ['argv'],
        message: 'argv is required when action is exec.',
      });
    }
  });

export type BrowserCliInput = z.input<typeof browserCliInputSchema>;

function resolveBrowserRunsDir(context: any, targets: string[]): string {
  const { projectRoot, configDir, targetSlug } = resolvePentestProjectContext(context, targets);
  return path.join(path.dirname(getPentestFindingsPath(projectRoot, configDir, targetSlug)), 'browser-runs');
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^\*\./, '');
}

function safeTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function normalizeBrowserArgv(argv: string[] | string): { argv: string[]; warning?: string } {
  if (Array.isArray(argv)) return { argv };

  try {
    const parsed = JSON.parse(argv);
    if (Array.isArray(parsed) && parsed.every(value => typeof value === 'string')) {
      return {
        argv: parsed,
        warning: 'run_browser_cli received argv as a JSON string and normalized it to string[]. Prefer passing argv as an array.',
      };
    }
  } catch {
    // Return a structured tool failure from execute instead of failing Mastra input validation.
  }

  throw new Error('run_browser_cli argv must be a string[] or a JSON-encoded string[].');
}

function getFilenameArgIndex(argv: string[]): number {
  return argv.findIndex(arg => arg === '--filename' || arg.startsWith('--filename='));
}

export function ensureBrowserOutputFilename(argv: string[]): { argv: string[]; expectedOutput?: string; warning?: string } {
  const command = argv[0];
  const extensionByCommand: Record<string, string> = {
    screenshot: 'png',
    snapshot: 'yml',
    pdf: 'pdf',
  };
  const extension = extensionByCommand[command ?? ''];
  if (!extension) return { argv };

  const filenameIndex = getFilenameArgIndex(argv);
  if (filenameIndex >= 0) {
    const filename =
      argv[filenameIndex] === '--filename' ? argv[filenameIndex + 1] : argv[filenameIndex]!.slice('--filename='.length);
    if (filename && !filename.startsWith('/out/')) {
      return {
        argv,
        warning: 'run_browser_cli output file is outside /out; evidence is easiest to collect when files stay under /out.',
      };
    }
    return { argv, expectedOutput: filename?.startsWith('/out/') ? path.basename(filename) : undefined };
  }

  const filename = `${safeTimestamp()}-${command}.${extension}`;
  return {
    argv: [...argv, `--filename=/out/${filename}`],
    expectedOutput: filename,
    warning: `run_browser_cli added missing --filename=/out/${filename} so evidence is stored with this run.`,
  };
}

function hasBrowserOption(argv: string[]): boolean {
  return argv.some(arg => arg === '--browser' || arg.startsWith('--browser='));
}

export function ensureOpenBrowserChannel(argv: string[]): { argv: string[]; warning?: string } {
  if (argv[0] !== 'open' || hasBrowserOption(argv)) return { argv };

  return {
    argv: [...argv, '--browser=chromium'],
    warning: 'run_browser_cli added --browser=chromium for open because the browser-runner image ships chrome-for-testing/bundled Chromium, not system Chrome.',
  };
}

export function validateBrowserTargets(
  targets: string[],
  scopeHosts: string[],
): ReturnType<typeof validateContainerTargets> {
  return validateContainerTargets(targets, scopeHosts);
}

function truncateUtf8(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, 'utf-8') <= maxBytes) return text;
  let bytes = 0;
  let out = '';
  for (const char of text) {
    const charBytes = Buffer.byteLength(char, 'utf-8');
    if (bytes + charBytes > maxBytes) break;
    out += char;
    bytes += charBytes;
  }
  return `${out}\n[truncated]`;
}

export const runBrowserCliTool = createTool({
  id: 'run_browser_cli',
  description: `Run playwright-cli inside a task-scoped browser runner container.

Use this for scoped browser actions such as opening a URL, taking snapshots, clicking, filling, inspecting a page, or capturing browser evidence.

Safety rules:
- sessionId identifies the task browser container. Reuse the same sessionId for all browser steps in one task.
- action=exec starts the container if needed, then runs one playwright-cli command with docker exec.
- action=close destroys the task browser container. Call this when the task ends.
- argv is an argument array, not a shell string. Do not include the playwright-cli binary name.
- targets must be in recorded scope or explicit scopeHosts for exec calls.
- outputs must be simple filenames under /out.
- raw stdout/stderr and expected outputs are saved under .mingyi-atlas/pentest/targets/<target>/browser-runs.`,
  inputSchema: browserCliInputSchema,
  execute: async (input, context) => {
    const parsed = browserCliInputSchema.parse(input);
    let normalizedArgv: string[] = [];
    let warning: string | undefined;
    let expectedOutputs = parsed.expectedOutputs;

    if (parsed.action === 'exec') {
      try {
        const normalized = normalizeBrowserArgv(parsed.argv);
        const browserNormalized = ensureOpenBrowserChannel(normalized.argv);
        const outputNormalized = ensureBrowserOutputFilename(browserNormalized.argv);
        normalizedArgv = outputNormalized.argv;
        warning = [normalized.warning, browserNormalized.warning, outputNormalized.warning].filter(Boolean).join(' ') || undefined;
        if (outputNormalized.expectedOutput && !expectedOutputs.includes(outputNormalized.expectedOutput)) {
          expectedOutputs = [...expectedOutputs, outputNormalized.expectedOutput];
        }
      } catch (error) {
        return {
          success: false,
          error: 'invalid_argv',
          message: error instanceof Error ? error.message : String(error),
          sessionId: parsed.sessionId,
        };
      }
    }

    const browserRunsDir = resolveBrowserRunsDir(context, parsed.targets);
    const sessionDir = path.join(browserRunsDir, parsed.sessionId);
    const inputDir = path.join(sessionDir, 'input');
    const artifactDir = path.join(sessionDir, 'out');
    const runId = `browserrun-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
    const runDir = path.join(sessionDir, 'runs', runId);
    mkdirSync(inputDir, { recursive: true });
    mkdirSync(artifactDir, { recursive: true });
    mkdirSync(runDir, { recursive: true });
    writeFileSync(path.join(inputDir, 'targets.txt'), `${parsed.targets.join('\n')}\n`, 'utf-8');

    const containerName = getBrowserContainerName(parsed.sessionId);
    const image = process.env.BROWSER_RUNNER_IMAGE || DEFAULT_BROWSER_RUNNER_IMAGE;
    const start = performance.now();
    let started = false;
    let result: DockerCommandResult;

    if (parsed.action === 'close') {
      result = await closeBrowserContainer(containerName, parsed.timeoutMs);
    } else {
      const recordedScopeHosts = getRecordedScopeHosts(context, parsed.targets);
      const effectiveScopeHosts = [...new Set([...recordedScopeHosts, ...parsed.scopeHosts.map(normalizeHost)])];
      const scopeCheck = validateBrowserTargets(parsed.targets, effectiveScopeHosts);

      if (!scopeCheck.ok) {
        return {
          success: false,
          error: scopeCheck.error,
          message: scopeCheck.message,
          targets: parsed.targets,
          targetHosts: scopeTargetsToHosts(parsed.targets),
          scopeHosts: effectiveScopeHosts,
        };
      }

      await pruneStaleBrowserContainers(DEFAULT_BROWSER_CONTAINER_TTL_MS, Date.now(), 30_000, [containerName]).catch(
        () => undefined,
      );
      const ensure = await ensureBrowserContainer(
        { image, containerName, sessionId: parsed.sessionId, inputDir, artifactDir },
        parsed.timeoutMs,
      );
      started = ensure.started;
      if (ensure.error) {
        result = {
          exitCode: 1,
          signal: null,
          stdout: '',
          stderr: ensure.error,
          timedOut: false,
        };
      } else {
        result = await execBrowserCli(containerName, normalizedArgv, parsed.timeoutMs);
      }
    }

    const elapsedMs = Math.round(performance.now() - start);
    const stdoutFile = path.join(runDir, 'stdout.txt');
    const stderrFile = path.join(runDir, 'stderr.txt');
    writeFileSync(stdoutFile, result.stdout, 'utf-8');
    writeFileSync(stderrFile, result.stderr, 'utf-8');

    const outputFiles = expectedOutputs
      .map(file => path.join(artifactDir, file))
      .filter(file => existsSync(file));
    const outputMissing = expectedOutputs.filter(file => !existsSync(path.join(artifactDir, file)));

    const meta = {
      runId,
      sessionId: parsed.sessionId,
      containerName,
      action: parsed.action,
      argv: normalizedArgv,
      targets: parsed.targets,
      expectedOutputs,
      outputFiles,
      outputMissing,
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: result.timedOut,
      elapsedMs,
      image,
      started,
      warning,
      purpose: parsed.purpose,
      createdAt: new Date().toISOString(),
    };
    const metaFile = path.join(runDir, 'meta.json');
    writeFileSync(metaFile, `${JSON.stringify(meta, null, 2)}\n`, 'utf-8');

    return {
      success: result.exitCode === 0 && !result.timedOut,
      runId,
      sessionId: parsed.sessionId,
      containerName,
      action: parsed.action,
      started,
      warning,
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: result.timedOut,
      elapsedMs,
      runDir,
      artifactsDir: artifactDir,
      stdoutFile,
      stderrFile,
      metaFile,
      outputFiles,
      outputMissing,
      stdout: truncateUtf8(result.stdout, MAX_INLINE_STDIO_BYTES),
      stderr: truncateUtf8(result.stderr, MAX_INLINE_STDIO_BYTES),
    };
  },
});
