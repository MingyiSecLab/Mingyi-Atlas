import { spawn } from 'node:child_process';
import { z } from 'zod';

export const browserSessionIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, 'sessionId must be a simple container-safe identifier.');

export const BROWSER_CONTAINER_KIND_LABEL = 'mingyi-atlas.kind=browser-runner';
export const BROWSER_CONTAINER_SESSION_LABEL = 'mingyi-atlas.session';
export const BROWSER_CONTAINER_CREATED_AT_LABEL = 'mingyi-atlas.createdAtMs';

export interface BrowserDockerRunArgsInput {
  image: string;
  containerName: string;
  sessionId: string;
  inputDir: string;
  artifactDir: string;
  createdAtMs?: number;
}

export interface BrowserDockerExecArgsInput {
  containerName: string;
  argv: string[];
}

export interface DockerCommandResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface BrowserContainerInfo {
  id?: string;
  name: string;
  sessionId?: string;
  createdAtMs?: number;
}

export interface BrowserContainerPruneResult {
  checked: number;
  removed: string[];
  errors: Array<{ container: string; error: string }>;
}

export function getBrowserContainerName(sessionId: string): string {
  const parsed = browserSessionIdSchema.parse(sessionId);
  return `mingyi-atlas-browser-${parsed}`;
}

export function buildBrowserDockerRunArgs(input: BrowserDockerRunArgsInput): string[] {
  const sessionId = browserSessionIdSchema.parse(input.sessionId);
  const createdAtMs = String(input.createdAtMs ?? Date.now());
  return [
    'run',
    '-d',
    '--name',
    input.containerName,
    '--label',
    BROWSER_CONTAINER_KIND_LABEL,
    '--label',
    `${BROWSER_CONTAINER_SESSION_LABEL}=${sessionId}`,
    '--label',
    `${BROWSER_CONTAINER_CREATED_AT_LABEL}=${createdAtMs}`,
    '--network',
    'bridge',
    '--cpus',
    '1',
    '--memory',
    '1g',
    '--pids-limit',
    '256',
    '--security-opt',
    'no-new-privileges',
    '--shm-size',
    '1g',
    '--tmpfs',
    '/tmp:rw,nosuid,size=512m',
    '-v',
    `${input.inputDir}:/input:ro`,
    '-v',
    `${input.artifactDir}:/out`,
    '-w',
    '/workspace',
    '--entrypoint',
    'sleep',
    input.image,
    'infinity',
  ];
}

export function buildBrowserDockerExecArgs(input: BrowserDockerExecArgsInput): string[] {
  return ['exec', '-w', '/workspace', input.containerName, 'playwright-cli', ...input.argv];
}

export function buildBrowserDockerCloseArgs(containerName: string): string[] {
  return ['rm', '-f', containerName];
}

export function buildBrowserDockerListArgs(): string[] {
  return ['ps', '-aq', '--filter', `label=${BROWSER_CONTAINER_KIND_LABEL}`];
}

export function buildBrowserDockerInspectArgs(containerNames: string[]): string[] {
  return ['inspect', ...containerNames];
}

export async function runDockerCommand(dockerArgs: string[], timeoutMs: number): Promise<DockerCommandResult> {
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

export async function browserContainerExists(containerName: string): Promise<boolean> {
  const result = await runDockerCommand(['inspect', containerName], 10_000);
  return result.exitCode === 0;
}

export async function ensureBrowserContainer(
  input: BrowserDockerRunArgsInput,
  timeoutMs: number,
): Promise<{ started: boolean; error?: string }> {
  if (await browserContainerExists(input.containerName)) return { started: false };

  const result = await runDockerCommand(buildBrowserDockerRunArgs(input), timeoutMs);
  if (result.exitCode !== 0 || result.timedOut) {
    return {
      started: false,
      error: result.stderr || result.stdout || `Failed to start browser container ${input.containerName}`,
    };
  }
  return { started: true };
}

export function parseBrowserContainerInspectOutput(stdout: string): BrowserContainerInfo[] {
  const raw = JSON.parse(stdout || '[]') as Array<{
    Id?: string;
    Name?: string;
    Config?: { Labels?: Record<string, string> };
  }>;

  return raw.map(item => {
    const labels = item.Config?.Labels ?? {};
    const createdAt = Number(labels[BROWSER_CONTAINER_CREATED_AT_LABEL]);
    return {
      id: item.Id,
      name: item.Name?.replace(/^\//, '') || item.Id || '',
      sessionId: labels[BROWSER_CONTAINER_SESSION_LABEL],
      createdAtMs: Number.isFinite(createdAt) ? createdAt : undefined,
    };
  });
}

export async function listBrowserContainers(timeoutMs: number = 10_000): Promise<BrowserContainerInfo[]> {
  const list = await runDockerCommand(buildBrowserDockerListArgs(), timeoutMs);
  if (list.exitCode !== 0 || list.timedOut) return [];

  const containerNames = list.stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  if (containerNames.length === 0) return [];

  const inspect = await runDockerCommand(buildBrowserDockerInspectArgs(containerNames), timeoutMs);
  if (inspect.exitCode !== 0 || inspect.timedOut) return [];
  return parseBrowserContainerInspectOutput(inspect.stdout);
}

export async function pruneStaleBrowserContainers(
  ttlMs: number,
  nowMs: number = Date.now(),
  timeoutMs: number = 30_000,
  excludeContainerNames: string[] = [],
): Promise<BrowserContainerPruneResult> {
  const containers = await listBrowserContainers(timeoutMs);
  const exclude = new Set(excludeContainerNames);
  const stale = containers.filter(
    container => !exclude.has(container.name) && container.createdAtMs !== undefined && nowMs - container.createdAtMs > ttlMs,
  );
  const result: BrowserContainerPruneResult = { checked: containers.length, removed: [], errors: [] };

  for (const container of stale) {
    const remove = await runDockerCommand(buildBrowserDockerCloseArgs(container.name), timeoutMs);
    if (remove.exitCode === 0 && !remove.timedOut) {
      result.removed.push(container.name);
      continue;
    }
    result.errors.push({
      container: container.name,
      error: remove.stderr || remove.stdout || `Failed to remove stale browser container ${container.name}`,
    });
  }

  return result;
}

export function execBrowserCli(containerName: string, argv: string[], timeoutMs: number): Promise<DockerCommandResult> {
  return runDockerCommand(buildBrowserDockerExecArgs({ containerName, argv }), timeoutMs);
}

export function closeBrowserContainer(containerName: string, timeoutMs: number): Promise<DockerCommandResult> {
  return runDockerCommand(buildBrowserDockerCloseArgs(containerName), timeoutMs);
}
