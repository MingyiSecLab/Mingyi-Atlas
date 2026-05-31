import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  BROWSER_CONTAINER_CREATED_AT_LABEL,
  BROWSER_CONTAINER_KIND_LABEL,
  BROWSER_CONTAINER_SESSION_LABEL,
  buildBrowserDockerCloseArgs,
  buildBrowserDockerExecArgs,
  buildBrowserDockerInspectArgs,
  buildBrowserDockerListArgs,
  buildBrowserDockerRunArgs,
  getBrowserContainerName,
  parseBrowserContainerInspectOutput,
} from '../browser-container.js';

describe('browser container helpers', () => {
  it('builds docker argv to start a persistent browser runner container', () => {
    const args = buildBrowserDockerRunArgs({
      image: 'pentest-browser-runner:test',
      containerName: 'mingyi-atlas-browser-task1',
      sessionId: 'task1',
      inputDir: path.join('/tmp', 'input'),
      artifactDir: path.join('/tmp', 'artifacts'),
      createdAtMs: 12345,
    });

    expect(args.slice(0, 2)).toEqual(['run', '-d']);
    expect(args).toContain('--name');
    expect(args).toContain('mingyi-atlas-browser-task1');
    expect(args).toContain(BROWSER_CONTAINER_KIND_LABEL);
    expect(args).toContain(`${BROWSER_CONTAINER_SESSION_LABEL}=task1`);
    expect(args).toContain(`${BROWSER_CONTAINER_CREATED_AT_LABEL}=12345`);
    expect(args).toContain('pentest-browser-runner:test');
    expect(args.slice(-2)).toEqual(['pentest-browser-runner:test', 'infinity']);
    expect(args).toContain('--entrypoint');
    expect(args).toContain('sleep');
    expect(args).toContain('--shm-size');
    expect(args).not.toContain('--rm');
    expect(args).not.toContain('sh');
    expect(args).not.toContain('-c');
  });

  it('builds docker exec and close argv for a task browser session', () => {
    expect(getBrowserContainerName('task.alpha-1')).toBe('mingyi-atlas-browser-task.alpha-1');

    expect(
      buildBrowserDockerExecArgs({
        containerName: 'mingyi-atlas-browser-task1',
        argv: ['open', 'https://app.example.com'],
      }),
    ).toEqual(['exec', '-w', '/workspace', 'mingyi-atlas-browser-task1', 'playwright-cli', 'open', 'https://app.example.com']);

    expect(buildBrowserDockerCloseArgs('mingyi-atlas-browser-task1')).toEqual(['rm', '-f', 'mingyi-atlas-browser-task1']);
  });

  it('builds docker list and inspect argv for stale container pruning', () => {
    expect(buildBrowserDockerListArgs()).toEqual(['ps', '-aq', '--filter', 'label=mingyi-atlas.kind=browser-runner']);
    expect(buildBrowserDockerInspectArgs(['abc', 'def'])).toEqual(['inspect', 'abc', 'def']);
  });

  it('parses browser container inspect output', () => {
    expect(
      parseBrowserContainerInspectOutput(
        JSON.stringify([
          {
            Id: 'abc123',
            Name: '/mingyi-atlas-browser-task1',
            Config: {
              Labels: {
                [BROWSER_CONTAINER_KIND_LABEL.split('=')[0]!]: 'browser-runner',
                [BROWSER_CONTAINER_SESSION_LABEL]: 'task1',
                [BROWSER_CONTAINER_CREATED_AT_LABEL]: '12345',
              },
            },
          },
        ]),
      ),
    ).toEqual([
      {
        id: 'abc123',
        name: 'mingyi-atlas-browser-task1',
        sessionId: 'task1',
        createdAtMs: 12345,
      },
    ]);
  });
});
