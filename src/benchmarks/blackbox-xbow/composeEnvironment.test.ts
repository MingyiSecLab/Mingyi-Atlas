import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ComposeEnvironment, findComposeFile, parseComposePrimaryPort } from './composeEnvironment.js';
import type { CommandRunner, XBowBenchmarkCase } from './types.js';

async function writeCompose(dir: string, content = 'services:\n  web:\n    ports:\n      - "8080:80"\n') {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, 'docker-compose.yml');
  await writeFile(file, content, 'utf-8');
  return file;
}

function testCase(caseDir: string): XBowBenchmarkCase {
  return {
    id: 'XBEN-001-24',
    name: 'Test',
    description: '',
    level: 1,
    tags: [],
    caseDir,
    composeDir: caseDir,
  };
}

describe('ComposeEnvironment', () => {
  it('discovers compose files in common locations and parses primary ports', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'xbow-compose-'));
    const src = path.join(root, 'src');
    const composeFile = await writeCompose(src, 'services:\n  app:\n    ports:\n      - target: 3000\n        published: 33000\n');

    await expect(findComposeFile(root)).resolves.toBe(composeFile);
    await expect(parseComposePrimaryPort(composeFile)).resolves.toEqual({
      serviceName: 'app',
      containerPort: 3000,
      hostPort: 33000,
    });
  });

  it('starts compose, resolves actual published port, and tears down', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'xbow-compose-start-'));
    await writeCompose(root);
    const calls: Array<{ command: string; args: string[]; cwd?: string }> = [];
    const runner: CommandRunner = async (command, args, options) => {
      calls.push({ command, args, cwd: options.cwd });
      if (args.join(' ') === 'compose ps --format json') {
        return { stdout: '{"Publishers":[{"TargetPort":80,"PublishedPort":45678}]}\n', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    };
    const env = new ComposeEnvironment({
      commandRunner: runner,
      readinessTimeoutMs: 1000,
      tcpCheck: async () => true,
      fetch: async () => new Response('ok'),
    });
    const setup = await env.setup(testCase(root));
    expect(setup).toMatchObject({ success: true, targetUrl: 'http://localhost:45678', hostPort: 45678 });

    await env.teardown(setup);
    expect(calls.map(call => call.args.join(' '))).toEqual([
      'compose up -d --build',
      'compose ps --format json',
      'compose down --volumes --remove-orphans',
    ]);
  });

  it('reports setup failures without throwing', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'xbow-compose-fail-'));
    await writeCompose(root);
    const env = new ComposeEnvironment({
      commandRunner: async () => {
        throw new Error('docker unavailable');
      },
    });

    await expect(env.setup(testCase(root))).resolves.toMatchObject({
      success: false,
      error: 'docker unavailable',
    });
  });

  it('reports readiness timeout and skips teardown when cleanup is disabled', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'xbow-compose-timeout-'));
    await writeCompose(root);
    const calls: string[] = [];
    const env = new ComposeEnvironment({
      readinessTimeoutMs: 25,
      tcpCheck: async () => false,
      commandRunner: async (_command, args) => {
        calls.push(args.join(' '));
        if (args.join(' ') === 'compose ps --format json') {
          return { stdout: '{"Publishers":[{"TargetPort":80,"PublishedPort":45999}]}\n', stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
    });

    const setup = await env.setup(testCase(root));
    expect(setup.success).toBe(false);
    expect(setup.error).toContain('TCP readiness failed');

    await env.teardown(setup, false);
    expect(calls).not.toContain('compose down --volumes --remove-orphans');
  });
});
