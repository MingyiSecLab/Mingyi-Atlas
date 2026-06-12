import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildDockerRunArgs,
  containerToolInputSchema,
  normalizeContainerArgv,
  validateContainerTargets,
} from '../containerRunner.js';

describe('run_container_tool helpers', () => {
  it('builds docker argv without using a shell command string', () => {
    const args = buildDockerRunArgs({
      image: 'pentest-runner:test',
      tool: 'nuclei',
      argv: ['-l', '/input/targets.txt', '-jsonl', '-o', '/out/nuclei.jsonl'],
      inputDir: path.join('/tmp', 'input'),
      artifactDir: path.join('/tmp', 'artifacts'),
    });

    expect(args.slice(0, 2)).toEqual(['run', '--rm']);
    expect(args).toContain('pentest-runner:test');
    expect(args).toContain('--read-only');
    expect(args).toContain('/tmp:rw,noexec,nosuid,size=128m');
    expect(args).toContain('HOME=/tmp');
    expect(args).toContain('XDG_CONFIG_HOME=/tmp/.config');
    expect(args).toContain('XDG_CACHE_HOME=/tmp/.cache');
    expect(args.slice(-6)).toEqual(['nuclei', '-l', '/input/targets.txt', '-jsonl', '-o', '/out/nuclei.jsonl']);
    expect(args).not.toContain('sh');
    expect(args).not.toContain('-c');
  });

  it('requires targets to be inside scope', () => {
    expect(validateContainerTargets(['https://app.example.com'], ['example.com'])).toMatchObject({
      ok: true,
      targetHosts: ['app.example.com'],
    });

    expect(validateContainerTargets(['https://evil.test'], ['example.com'])).toMatchObject({
      ok: false,
      error: 'scope_violation',
      targetHosts: ['evil.test'],
    });
  });

  it('rejects unsupported tools and path-like output filenames', () => {
    expect(containerToolInputSchema.parse({
      tool: 'tplmap',
      argv: ['-u', 'https://app.example.com/?name=test'],
      targets: ['https://app.example.com'],
      purpose: 'validate SSTI',
    }).tool).toBe('tplmap');

    expect(containerToolInputSchema.parse({
      tool: 'jwt_tool',
      argv: ['ey.fake.token'],
      targets: ['https://app.example.com'],
      purpose: 'inspect JWT',
    }).tool).toBe('jwt_tool');

    expect(() =>
      containerToolInputSchema.parse({
        tool: 'bash',
        argv: ['-lc', 'id'],
        targets: ['https://app.example.com'],
        purpose: 'invalid tool',
      }),
    ).toThrow();

    expect(() =>
      containerToolInputSchema.parse({
        tool: 'nuclei',
        argv: ['-o', '/out/nuclei.jsonl'],
        targets: ['https://app.example.com'],
        expectedOutputs: ['../nuclei.jsonl'],
        purpose: 'invalid output',
      }),
    ).toThrow();
  });

  it('adds --no-update to wpscan unless an update flag is explicit', () => {
    expect(normalizeContainerArgv('wpscan', ['--url', 'https://example.com']).argv).toEqual([
      '--url',
      'https://example.com',
      '--no-update',
    ]);

    expect(normalizeContainerArgv('wpscan', ['--url', 'https://example.com', '--no-update']).argv).toEqual([
      '--url',
      'https://example.com',
      '--no-update',
    ]);

    expect(normalizeContainerArgv('wpscan', ['--url', 'https://example.com', '--update']).argv).toEqual([
      '--url',
      'https://example.com',
      '--update',
    ]);

    expect(normalizeContainerArgv('nuclei', ['-u', 'https://example.com']).argv).toEqual(['-u', 'https://example.com']);
  });
});
