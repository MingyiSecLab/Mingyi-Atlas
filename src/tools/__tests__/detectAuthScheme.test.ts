import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

import { analyzeAuthScheme, detectAuthSchemeTool } from '../detectAuthScheme.js';

let servers: http.Server[] = [];

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
});

describe('analyzeAuthScheme', () => {
  it('detects Basic authentication from WWW-Authenticate', () => {
    const result = analyzeAuthScheme({
      url: 'https://app.example.com/admin',
      status: 401,
      headers: { 'www-authenticate': 'Basic realm="admin"' },
      body: '',
    });

    expect(result.scheme).toMatchObject({ method: 'basic' });
    expect(result.evidence).toContain('WWW-Authenticate: Basic realm="admin"');
  });

  it('detects login redirects', () => {
    const result = analyzeAuthScheme({
      url: 'https://app.example.com/dashboard',
      status: 302,
      headers: { location: '/login' },
      body: '',
    });

    expect(result.scheme).toMatchObject({ method: 'form', endpoint: '/login', browserRequired: true });
  });

  it('detects password forms, CSRF fields, and CAPTCHA barriers', () => {
    const result = analyzeAuthScheme({
      url: 'https://app.example.com/login',
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: `
        <form>
          <input name="email">
          <input type="password" name="password">
          <input name="_csrf" value="token">
          <div class="g-recaptcha"></div>
        </form>
      `,
    });

    expect(result.scheme).toMatchObject({
      method: 'form',
      fields: { usernameField: 'email', passwordField: 'password', csrfField: '_csrf' },
      csrfRequired: true,
    });
    expect(result.barriers).toEqual([expect.objectContaining({ type: 'captcha' })]);
  });
});

describe('detect_auth_scheme tool', () => {
  it('runs a scoped localhost auth scheme check', async () => {
    const { url } = await startServer((_req, res) => {
      res.writeHead(401, { 'WWW-Authenticate': 'Bearer realm="api"' });
      res.end('Unauthorized');
    });

    const result = await detectAuthSchemeTool.execute(
      {
        url,
      },
      {} as any,
    );

    expect(result).toMatchObject({
      success: true,
      status: 401,
      scheme: { method: 'bearer' },
    });
  });

  it('blocks out-of-scope external targets', async () => {
    const result = await detectAuthSchemeTool.execute(
      {
        url: 'https://out-of-scope.example/login',
      },
      {} as any,
    );

    expect(result).toMatchObject({
      success: false,
      error: 'scope_violation',
    });
  });
});
