import { access, readFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { execa } from 'execa';
import YAML from 'yaml';
import type { BenchmarkSetupResult, CommandRunner, XBowBenchmarkCase } from './types.js';

export interface ComposeEnvironmentOptions {
  commandRunner?: CommandRunner;
  fetch?: typeof fetch;
  tcpCheck?: (host: string, port: number, timeoutMs: number) => Promise<boolean>;
  readinessTimeoutMs?: number;
  commandTimeoutMs?: number;
  now?: () => Date;
}

interface PortInfo {
  serviceName?: string;
  containerPort: number;
  hostPort?: number;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

const defaultCommandRunner: CommandRunner = async (command, args, options) => {
  const result = await execa(command, args, {
    cwd: options.cwd,
    timeout: options.timeoutMs,
    reject: true,
  });
  return { stdout: result.stdout, stderr: result.stderr };
};

function nowIso(now: () => Date): string {
  return now().toISOString();
}

function parsePortMapping(value: unknown, serviceName: string): PortInfo | undefined {
  if (typeof value === 'number') {
    return { serviceName, containerPort: value, hostPort: value };
  }
  if (typeof value === 'string') {
    const protocolLess = value.split('/')[0] ?? value;
    const parts = protocolLess.split(':').filter(Boolean);
    const containerPort = Number(parts[parts.length - 1]);
    const hostPort = parts.length > 1 ? Number(parts[parts.length - 2]) : containerPort;
    if (Number.isInteger(containerPort) && containerPort > 0) {
      return {
        serviceName,
        containerPort,
        hostPort: Number.isInteger(hostPort) && hostPort > 0 ? hostPort : undefined,
      };
    }
  }
  if (value && typeof value === 'object') {
    const mapping = value as Record<string, unknown>;
    const target = Number(mapping.target);
    const published = Number(mapping.published);
    if (Number.isInteger(target) && target > 0) {
      return {
        serviceName,
        containerPort: target,
        hostPort: Number.isInteger(published) && published > 0 ? published : undefined,
      };
    }
  }
  return undefined;
}

export async function findComposeFile(caseDir: string): Promise<string | undefined> {
  const candidates = [
    path.join(caseDir, 'docker-compose.yml'),
    path.join(caseDir, 'docker-compose.yaml'),
    path.join(caseDir, 'src', 'docker-compose.yml'),
    path.join(caseDir, 'src', 'docker-compose.yaml'),
  ];
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return undefined;
}

export async function parseComposePrimaryPort(composeFile: string): Promise<PortInfo | undefined> {
  const doc = YAML.parse(await readFile(composeFile, 'utf-8')) as { services?: Record<string, { ports?: unknown[] }> } | undefined;
  const services = doc?.services ?? {};
  for (const [serviceName, service] of Object.entries(services)) {
    for (const port of service.ports ?? []) {
      const parsed = parsePortMapping(port, serviceName);
      if (parsed?.containerPort === 80) return parsed;
      if (parsed) return parsed;
    }
  }
  return undefined;
}

function parseComposePsPorts(stdout: string, containerPort: number): number | undefined {
  for (const line of stdout.trim().split('\n').filter(Boolean)) {
    try {
      const parsed = JSON.parse(line) as { Publishers?: Array<{ PublishedPort?: number; TargetPort?: number }> };
      for (const publisher of parsed.Publishers ?? []) {
        if (publisher.TargetPort === containerPort && publisher.PublishedPort) return publisher.PublishedPort;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

async function waitForTcp(host: string, port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise<boolean>(resolve => {
      const socket = net.createConnection({ host, port, timeout: 1000 }, () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.on('error', () => resolve(false));
    });
    if (ok) return true;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return false;
}

export class ComposeEnvironment {
  private readonly commandRunner: CommandRunner;
  private readonly fetchImpl: typeof fetch;
  private readonly tcpCheck: (host: string, port: number, timeoutMs: number) => Promise<boolean>;
  private readonly now: () => Date;

  constructor(private readonly options: ComposeEnvironmentOptions = {}) {
    this.commandRunner = options.commandRunner ?? defaultCommandRunner;
    this.fetchImpl = options.fetch ?? fetch;
    this.tcpCheck = options.tcpCheck ?? waitForTcp;
    this.now = options.now ?? (() => new Date());
  }

  async setup(testCase: XBowBenchmarkCase): Promise<BenchmarkSetupResult> {
    const startedAt = nowIso(this.now);
    const composeFile = await findComposeFile(testCase.composeDir ?? testCase.caseDir);
    if (!composeFile) {
      return { success: false, startedAt, completedAt: nowIso(this.now), error: 'No docker-compose.yml found' };
    }
    const composeDir = path.dirname(composeFile);
    try {
      const portInfo = await parseComposePrimaryPort(composeFile);
      if (!portInfo) throw new Error('No published ports found in docker-compose.yml');
      await this.commandRunner('docker', ['compose', 'up', '-d', '--build'], {
        cwd: composeDir,
        timeoutMs: this.options.commandTimeoutMs ?? 300_000,
      });
      const ps = await this.commandRunner('docker', ['compose', 'ps', '--format', 'json'], {
        cwd: composeDir,
        timeoutMs: 30_000,
      });
      const hostPort = parseComposePsPorts(ps.stdout, portInfo.containerPort) ?? portInfo.hostPort ?? portInfo.containerPort;
      const ready = await this.tcpCheck('localhost', hostPort, this.options.readinessTimeoutMs ?? 120_000);
      if (!ready) throw new Error(`TCP readiness failed for localhost:${hostPort}`);
      const targetUrl = `http://localhost:${hostPort}`;
      try {
        await this.fetchImpl(targetUrl, { redirect: 'follow' });
      } catch {
        // Some CTF targets do not return HTTP promptly even when TCP is up.
      }
      return {
        success: true,
        targetUrl,
        composeFile,
        composeDir,
        serviceName: portInfo.serviceName,
        containerPort: portInfo.containerPort,
        hostPort,
        startedAt,
        completedAt: nowIso(this.now),
      };
    } catch (error) {
      return {
        success: false,
        composeFile,
        composeDir,
        startedAt,
        completedAt: nowIso(this.now),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async teardown(setup: BenchmarkSetupResult, cleanup = true): Promise<void> {
    if (!cleanup || !setup.composeDir) return;
    await this.commandRunner('docker', ['compose', 'down', '--volumes', '--remove-orphans'], {
      cwd: setup.composeDir,
      timeoutMs: this.options.commandTimeoutMs ?? 120_000,
    });
  }
}
