import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

import { recordPentestScope } from '../../security/pentest/context.js';
import { getPentestContextPath } from '../../security/pentest/context.js';
import { getRecordedScopeHosts, httpRequestTool, isHostInScope, scopeTargetsToHosts } from '../httpRequest.js';

let tempDirs: string[] = [];
let servers: http.Server[] = [];

function createContext(projectPath: string) {
  return {
    requestContext: {
      get(key: string) {
        if (key !== 'harness') return undefined;
        return {
          getState: () => ({ projectPath, configDir: '.mingyi-atlas' }),
        };
      },
    },
  };
}

async function startServer(handler: http.RequestListener): Promise<{ url: string }> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unexpected server address');
  return { url: `http://127.0.0.1:${address.port}` };
}

afterEach(async () => {
  await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  servers = [];
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe('http_request', () => {
  it('allows localhost requests without explicit scopeHosts', async () => {
    const { url } = await startServer((_req, res) => {
      res.setHeader('x-test-header', 'ok');
      res.end('hello');
    });

    const result = await httpRequestTool.execute(
      {
        url,
        purpose: 'baseline local response',
      },
      createContext(process.cwd()) as any,
    );

    expect(result).toMatchObject({
      success: true,
      status: 200,
      body: 'hello',
    });
    expect(result.headers['x-test-header']).toBe('ok');
  });

  it('blocks external hosts unless they are in scopeHosts', async () => {
    const blocked = await httpRequestTool.execute(
      {
        url: 'https://out-of-scope.example/path',
        purpose: 'scope guard check',
      },
      createContext(process.cwd()) as any,
    );

    expect(blocked).toMatchObject({
      success: false,
      error: 'scope_violation',
    });
    expect(isHostInScope('api.example.com', ['example.com'])).toBe(true);
    expect(isHostInScope('evil.test', ['example.com'])).toBe(false);
  });

  it('derives scope hosts from recorded pentest context', () => {
    const projectPath = mkdtempSync(path.join(tmpdir(), 'mingyi-atlas-http-scope-'));
    tempDirs.push(projectPath);
    recordPentestScope(getPentestContextPath(projectPath, '.mingyi-atlas'), {
      target: 'https://app.example.com',
      type: 'url',
    });

    expect(scopeTargetsToHosts(['https://api.example.com/a', 'example.org'])).toEqual(['api.example.com', 'example.org']);
    expect(getRecordedScopeHosts(createContext(projectPath))).toEqual(['app.example.com']);
  });

  it('persists large response bodies under the pentest log directory', async () => {
    const projectPath = mkdtempSync(path.join(tmpdir(), 'mingyi-atlas-http-tool-'));
    tempDirs.push(projectPath);
    const largeBody = 'a'.repeat(200);
    const { url } = await startServer((_req, res) => {
      res.end(largeBody);
    });

    const result = await httpRequestTool.execute(
      {
        url,
        purpose: 'large body check',
        maxBodyBytes: 20,
      },
      createContext(projectPath) as any,
    );

    expect(result.success).toBe(true);
    expect(result.bodyTruncated).toBe(true);
    expect(result.bodyFile).toContain(path.join('.mingyi-atlas', 'pentest', 'targets'));
    expect(result.bodyFile).toContain(path.join('http-responses'));
    expect(existsSync(result.bodyFile)).toBe(true);
    expect(readFileSync(result.bodyFile, 'utf-8')).toBe(largeBody);
  });
});
