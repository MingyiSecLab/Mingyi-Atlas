import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { getPentestFindingsPath } from '../security/pentest/findings.js';
import { getRecordedScopeHosts, isHostInScope, scopeTargetsToHosts } from './http-request.js';
import { resolvePentestProjectContext } from './pentest-target.js';

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_RUNNER_IMAGE = 'pentest-runner:latest';
const MAX_INLINE_STDIO_BYTES = 8_000;

export const containerToolNameSchema = z.enum([
  'nuclei',
  'wpscan',
  'sqlmap',
  'tplmap',
  'jwt_tool',
  'httpx',
  'ffuf',
  'nmap',
  'subfinder',
  'dnsx',
  'katana',
  'masscan',
  'testssl',
  'whatweb',
]);

const outputFileSchema = z
  .string()
  .regex(/^[a-zA-Z0-9._-]+$/, 'Output files must be simple filenames under /out.');

export const containerToolInputSchema = z.object({
  tool: containerToolNameSchema,
  argv: z
    .array(z.string().min(1).max(500))
    .max(120)
    .describe('Argument vector passed to the tool. Do not include the tool name.'),
  targets: z
    .array(z.string().min(1))
    .default([])
    .describe('Targets this command will touch. Used for scope validation and /input/targets.txt generation.'),
  scopeHosts: z
    .array(z.string().min(1))
    .default([])
    .describe('Authorized hosts copied from the user-approved scope. Recorded pentest scope is also honored.'),
  expectedOutputs: z.array(outputFileSchema).default([]).describe('Expected files written under /out.'),
  timeoutMs: z.number().int().positive().max(MAX_TIMEOUT_MS).default(DEFAULT_TIMEOUT_MS),
  purpose: z.string().min(1).describe('Concise reason for running the containerized tool.'),
});

export type ContainerToolInput = z.input<typeof containerToolInputSchema>;
export type ContainerToolName = z.infer<typeof containerToolNameSchema>;

interface DockerRunArgsInput {
  image: string;
  tool: ContainerToolName;
  argv: string[];
  inputDir: string;
  artifactDir: string;
}

function resolveToolRunsDir(context: any, targets: string[]): string {
  const { projectRoot, configDir, targetSlug } = resolvePentestProjectContext(context, targets);
  return path.join(path.dirname(getPentestFindingsPath(projectRoot, configDir, targetSlug)), 'tool-runs');
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^\*\./, '');
}

export function validateContainerTargets(
  targets: string[],
  scopeHosts: string[],
): { ok: true; targetHosts: string[] } | { ok: false; error: string; message: string; targetHosts: string[] } {
  const targetHosts = scopeTargetsToHosts(targets);
  if (targetHosts.length === 0) {
    return {
      ok: false,
      error: 'missing_targets',
      message: 'At least one parseable target is required for scoped container tool execution.',
      targetHosts,
    };
  }

  const normalizedScopeHosts = [...new Set(scopeHosts.map(normalizeHost))];
  const outOfScope = targetHosts.filter(host => !isHostInScope(host, normalizedScopeHosts));
  if (outOfScope.length > 0) {
    return {
      ok: false,
      error: 'scope_violation',
      message:
        normalizedScopeHosts.length === 0
          ? `Targets require recorded scope or explicit scopeHosts: ${outOfScope.join(', ')}`
          : `Targets outside recorded scope/scopeHosts: ${outOfScope.join(', ')}`,
      targetHosts,
    };
  }

  return { ok: true, targetHosts };
}

export function buildDockerRunArgs(input: DockerRunArgsInput): string[] {
  return [
    'run',
    '--rm',
    '--network',
    'bridge',
    '--cpus',
    '1',
    '--memory',
    '768m',
    '--pids-limit',
    '128',
    '--security-opt',
    'no-new-privileges',
    '--read-only',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=128m',
    '--env',
    'HOME=/tmp',
    '--env',
    'XDG_CONFIG_HOME=/tmp/.config',
    '--env',
    'XDG_CACHE_HOME=/tmp/.cache',
    '-v',
    `${input.inputDir}:/input:ro`,
    '-v',
    `${input.artifactDir}:/out`,
    '-w',
    '/workspace',
    input.image,
    input.tool,
    ...input.argv,
  ];
}

export function normalizeContainerArgv(
  tool: ContainerToolName,
  argv: string[],
): { argv: string[]; warning?: string } {
  if (tool !== 'wpscan') return { argv };

  const hasUpdateFlag = argv.some(arg => arg === '--no-update' || arg === '--update');
  if (hasUpdateFlag) return { argv };

  return {
    argv: [...argv, '--no-update'],
    warning: 'run_container_tool added --no-update for wpscan to avoid slow network database updates inside benchmark runs.',
  };
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

async function runDocker(
  dockerArgs: string[],
  timeoutMs: number,
): Promise<{ exitCode: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; timedOut: boolean }> {
  return await new Promise(resolve => {
    const child = spawn('docker', dockerArgs, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;

    let forceKillTimeout: NodeJS.Timeout | undefined;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      forceKillTimeout = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      }, 2_000).unref();
    }, timeoutMs);

    child.stdout?.on('data', chunk => stdoutChunks.push(Buffer.from(chunk)));
    child.stderr?.on('data', chunk => stderrChunks.push(Buffer.from(chunk)));

    child.on('error', error => {
      clearTimeout(timeout);
      if (forceKillTimeout) clearTimeout(forceKillTimeout);
      resolve({
        exitCode: null,
        signal: null,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        timedOut,
      });
    });

    child.on('close', (exitCode, signal) => {
      clearTimeout(timeout);
      if (forceKillTimeout) clearTimeout(forceKillTimeout);
      resolve({
        exitCode,
        signal,
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
        timedOut,
      });
    });
  });
}

export const runContainerTool = createTool({
  id: 'run_container_tool',
  description: `Run an allowlisted pentest CLI tool inside the configured Docker runner image.

Use this for scoped recon and validation tools such as nuclei, httpx, ffuf, nmap, wpscan, sqlmap, tplmap, jwt_tool, subfinder, dnsx, katana, masscan, testssl, and whatweb.

Safety rules:
- tool must be allowlisted by schema.
- argv is an argument array, not a shell string. Do not include the tool name.
- targets must be in recorded scope or explicit scopeHosts.
- outputs must be simple filenames under /out.
- raw stdout/stderr and expected outputs are saved under .mingyi-atlas/pentest/targets/<target>/tool-runs.`,
  inputSchema: containerToolInputSchema,
  execute: async (input, context) => {
    const parsed = containerToolInputSchema.parse(input);
    const recordedScopeHosts = getRecordedScopeHosts(context, parsed.targets);
    const effectiveScopeHosts = [...new Set([...recordedScopeHosts, ...parsed.scopeHosts.map(normalizeHost)])];
    const scopeCheck = validateContainerTargets(parsed.targets, effectiveScopeHosts);

    if (!scopeCheck.ok) {
      return {
        success: false,
        error: scopeCheck.error,
        message: scopeCheck.message,
        targets: parsed.targets,
        targetHosts: scopeCheck.targetHosts,
        scopeHosts: effectiveScopeHosts,
      };
    }

    const toolRunsDir = resolveToolRunsDir(context, parsed.targets);
    const runId = `toolrun-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
    const runDir = path.join(toolRunsDir, runId);
    const inputDir = path.join(runDir, 'input');
    const artifactDir = path.join(runDir, 'artifacts');
    mkdirSync(inputDir, { recursive: true });
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(path.join(inputDir, 'targets.txt'), `${parsed.targets.join('\n')}\n`, 'utf-8');

    const normalizedArgv = normalizeContainerArgv(parsed.tool, parsed.argv);
    const image = process.env.RUNNER_IMAGE || DEFAULT_RUNNER_IMAGE;
    const dockerArgs = buildDockerRunArgs({
      image,
      tool: parsed.tool,
      argv: normalizedArgv.argv,
      inputDir,
      artifactDir,
    });

    const start = performance.now();
    const result = await runDocker(dockerArgs, parsed.timeoutMs);
    const elapsedMs = Math.round(performance.now() - start);

    const stdoutFile = path.join(artifactDir, 'stdout.txt');
    const stderrFile = path.join(artifactDir, 'stderr.txt');
    writeFileSync(stdoutFile, result.stdout, 'utf-8');
    writeFileSync(stderrFile, result.stderr, 'utf-8');

    const outputFiles = parsed.expectedOutputs
      .map(file => path.join(artifactDir, file))
      .filter(file => existsSync(file));
    const outputMissing = parsed.expectedOutputs.filter(file => !existsSync(path.join(artifactDir, file)));

    const meta = {
      runId,
      tool: parsed.tool,
      argv: normalizedArgv.argv,
      warning: normalizedArgv.warning,
      targets: parsed.targets,
      targetHosts: scopeCheck.targetHosts,
      scopeHosts: effectiveScopeHosts,
      expectedOutputs: parsed.expectedOutputs,
      outputFiles,
      outputMissing,
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: result.timedOut,
      elapsedMs,
      image,
      purpose: parsed.purpose,
      createdAt: new Date().toISOString(),
    };
    const metaFile = path.join(artifactDir, 'meta.json');
    writeFileSync(metaFile, `${JSON.stringify(meta, null, 2)}\n`, 'utf-8');

    return {
      success: result.exitCode === 0 && !result.timedOut,
      runId,
      tool: parsed.tool,
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
