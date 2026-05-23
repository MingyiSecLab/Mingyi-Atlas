import { describe, expect, it } from 'vitest';
import {
  extractBlackboxTargetsFromHtml,
  extractJavaScriptEndpointCandidates,
  inferAuthSchemeFromHtml,
  isAuthSurfacePath,
  normalizeJavaScriptCandidates,
  runBlackboxAttackSurfaceDiscovery,
} from './blackboxAttackSurface.js';

describe('blackbox attack surface discovery', () => {
  it('extracts same-origin links, forms, scripts, and parameters from HTML', () => {
    const discovery = extractBlackboxTargetsFromHtml(
      `
        <a href="/login">Login</a>
        <a href="https://shop.example/search?q=shoes">Search</a>
        <a href="https://other.example/admin">External</a>
        <script src="/static/js/app.js"></script>
        <form action="/api/orders/123" method="post">
          <input name="coupon">
          <textarea name="notes"></textarea>
        </form>
      `,
      'https://shop.example',
    );

    expect(discovery.scripts).toEqual(['/static/js/app.js']);
    expect(discovery.targets.map(target => `${target.method ?? 'GET'} ${target.target}`)).toEqual([
      'GET /login',
      'GET /search?q=shoes',
      'GET /static/js/app.js',
      'POST /api/orders/123',
    ]);
    expect(discovery.targets.find(target => target.target === '/search?q=shoes')?.parameters).toEqual([
      { name: 'q', location: 'query', example: 'shoes' },
    ]);
    expect(discovery.targets.find(target => target.target === '/api/orders/123')?.parameters).toEqual([
      { name: 'coupon', location: 'body' },
      { name: 'notes', location: 'body' },
    ]);
  });

  it('extracts route and API-looking strings from JavaScript', () => {
    const candidates = extractJavaScriptEndpointCandidates(`
      const orders = "/api/orders/:id";
      const upload = '/upload-avatar';
      const ignored = "not/a/path";
      fetch("https://shop.example/oauth/callback");
    `);

    expect(candidates).toEqual(['/api/orders/:id', '/upload-avatar', 'https://shop.example/oauth/callback']);
  });

  it('normalizes JavaScript candidates to same-origin targets', () => {
    const targets = normalizeJavaScriptCandidates(
      ['/api/orders/:id', 'https://shop.example/admin/users', 'https://other.example/api/private'],
      'https://shop.example',
    );

    expect(targets.map(target => [target.target, target.kind])).toEqual([
      ['/api/orders/:id', 'api'],
      ['/admin/users', 'admin'],
    ]);
  });

  it('fetches HTML and same-origin JavaScript assets for discovery', async () => {
    const responses = new Map([
      [
        'https://shop.example/',
        `
          <a href="/login">Login</a>
          <script src="/assets/app.js"></script>
        `,
      ],
      ['https://shop.example/assets/app.js', `fetch("/api/orders/:id"); const avatar = "/upload-avatar";`],
    ]);

    const result = await runBlackboxAttackSurfaceDiscovery({
      target: 'https://shop.example/',
      fetch: (async url => {
        const body = responses.get(url.toString());
        return new Response(body ?? '', { status: body ? 200 : 404 });
      }) as typeof fetch,
    });

    expect(result.targets.map(target => target.target)).toEqual([
      '/login',
      '/assets/app.js',
      '/api/orders/:id',
      '/upload-avatar',
    ]);
    expect(result.targets.find(target => target.target === '/upload-avatar')?.kind).toBe('upload');
  });

  it('detects authentication routes and auth scheme metadata', () => {
    expect(isAuthSurfacePath('/password-reset')).toBe(true);
    expect(isAuthSurfacePath('/oauth/callback')).toBe(true);
    expect(isAuthSurfacePath('/products')).toBe(false);
    expect(inferAuthSchemeFromHtml('<form><input type="password" name="password"></form>')).toBe('form-login');
    expect(inferAuthSchemeFromHtml('', { bearerToken: 'token' })).toBe('bearer-token');
    expect(inferAuthSchemeFromHtml('', { cookies: { sid: 'secret' } })).toBe('cookie-session');
  });

  it('performs scoped authenticated discovery and records coverage metadata', async () => {
    const responses = new Map([
      ['https://shop.example/', '<a href="/login">Login</a>'],
      [
        'https://shop.example/::auth',
        `
          <a href="/profile">Profile</a>
          <form action="/api/orders/123" method="post"><input name="ownerId"></form>
        `,
      ],
    ]);

    const result = await runBlackboxAttackSurfaceDiscovery({
      target: 'https://shop.example/',
      auth: { cookies: { sid: 'secret-session' } },
      fetch: (async (url, init) => {
        const key = init?.headers ? `${url.toString()}::auth` : url.toString();
        const body = responses.get(key);
        return new Response(body ?? '', { status: body ? 200 : 404 });
      }) as typeof fetch,
    });

    expect(result.authCoverage).toMatchObject({
      attempted: true,
      authenticated: true,
      scheme: 'cookie-session',
      loginTargets: ['/login'],
      protectedTargets: ['/profile', '/api/orders/123'],
    });
    expect(result.targets.find(target => target.target === '/profile')).toMatchObject({
      authRequired: true,
      authScheme: 'cookie-session',
    });
    expect(result.targets.find(target => target.target === '/api/orders/123')?.parameters).toEqual([
      { name: 'ownerId', location: 'body' },
    ]);
  });

  it('falls back safely when authenticated discovery fails', async () => {
    const result = await runBlackboxAttackSurfaceDiscovery({
      target: 'https://shop.example/',
      auth: { bearerToken: 'token' },
      fetch: (async (url, init) =>
        new Response(init?.headers ? '' : '<a href="/login">Login</a>', { status: init?.headers ? 401 : 200 })) as typeof fetch,
    });

    expect(result.targets.map(target => target.target)).toEqual(['/login']);
    expect(result.authCoverage).toMatchObject({
      attempted: true,
      authenticated: false,
      scheme: 'bearer-token',
    });
    expect(result.authCoverage?.limitations[0]).toContain('Authenticated request did not return');
  });

  it('bounds authenticated discovery targets by maxAuthenticatedPages', async () => {
    const result = await runBlackboxAttackSurfaceDiscovery({
      target: 'https://shop.example/',
      auth: { cookies: { sid: 'secret-session' } },
      maxAuthenticatedPages: 1,
      fetch: (async (_url, init) =>
        new Response(init?.headers ? '<a href="/profile">Profile</a><a href="/billing">Billing</a>' : '<a href="/login">Login</a>', {
          status: 200,
        })) as typeof fetch,
    });

    expect(result.authCoverage?.protectedTargets).toEqual(['/profile']);
  });
});
