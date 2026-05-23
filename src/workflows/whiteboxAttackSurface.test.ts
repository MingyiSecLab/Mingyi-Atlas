import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildWhiteboxCatalog, discoverWhiteboxAttackSurface, runWhiteboxAttackSurfaceWorkflow } from './whiteboxAttackSurface.js';

async function fixtureDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'mastracode-whitebox-'));
}

async function writeFixture(root: string, filePath: string, contents: string): Promise<void> {
  const fullPath = path.join(root, filePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, contents);
}

describe('whitebox attack surface discovery', () => {
  it('discovers Next app/pages routes and API methods from files', async () => {
    const root = await fixtureDir();
    await writeFixture(root, 'app/login/page.tsx', 'export default function Page() { return null; }');
    await writeFixture(root, 'pages/search.tsx', 'export default function Search() { return null; }');
    await writeFixture(root, 'app/api/orders/[id]/route.ts', 'export async function GET() {}\nexport async function PATCH() {}');
    await writeFixture(root, 'pages/api/users/[id].ts', 'export default function handler() {}');

    const [app] = await discoverWhiteboxAttackSurface({ target: 'https://shop.example', cwd: root });

    expect(app?.pages.map(page => page.path).sort()).toEqual(['/login', '/search']);
    expect(app?.apiEndpoints.map(endpoint => `${endpoint.method ?? 'ANY'} ${endpoint.path}`).sort()).toEqual([
      'ANY /api/users/:id',
      'GET /api/orders/:id',
      'PATCH /api/orders/:id',
    ]);
    expect(app?.apiEndpoints.find(endpoint => endpoint.path === '/api/orders/:id')?.parameters).toEqual([
      { name: 'id', location: 'path' },
    ]);
  });

  it('discovers Express/router style route calls from source files', async () => {
    const root = await fixtureDir();
    await writeFixture(
      root,
      'src/server.ts',
      `
        app.get('/admin/users', handler);
        router.post('/upload-avatar', uploadHandler);
        route.put('/api/orders/:id', updateOrder);
      `,
    );

    const [app] = await discoverWhiteboxAttackSurface({ target: 'https://shop.example', cwd: root });

    expect(app?.pages.map(page => `${page.method} ${page.path} ${page.kind}`).sort()).toEqual([
      'GET /admin/users admin',
      'POST /upload-avatar upload',
    ]);
    expect(app?.apiEndpoints.map(endpoint => `${endpoint.method} ${endpoint.path}`)).toEqual(['PUT /api/orders/:id']);
  });

  it('generates pentest objectives for discovered whitebox targets', async () => {
    const root = await fixtureDir();
    await writeFixture(root, 'app/api/orders/[id]/route.ts', 'export async function PUT() {}');

    const result = await runWhiteboxAttackSurfaceWorkflow({ target: 'https://shop.example', cwd: root });
    const endpoint = result.apps[0]?.apiEndpoints[0];

    expect(endpoint?.pentestObjectives).toContain('Test IDOR on business objects');
    expect(endpoint?.pentestObjectives).toContain('Test mass assignment of owner, tenant, status, or price fields');
  });

  it('writes a source-backed catalog and preserves low-confidence candidates', async () => {
    const root = await fixtureDir();
    const artifactDir = await fixtureDir();
    await writeFixture(root, 'app/api/orders/[id]/route.ts', 'export async function GET() {}');
    await writeFixture(root, 'src/server.ts', "router.get('relative-orders', handler);");

    const result = await runWhiteboxAttackSurfaceWorkflow({
      target: 'https://shop.example',
      cwd: root,
      artifactDir,
    });

    expect(result.catalogPath).toBe(path.join(artifactDir, 'whitebox', 'catalog.json'));
    expect(result.catalog?.apps[0]?.frameworkProfiles).toContain('next-app-router');
    expect(result.catalog?.endpoints[0]).toMatchObject({
      path: '/api/orders/:id',
      confidence: 'high',
      handler: { file: 'app/api/orders/[id]/route.ts' },
    });
    expect(result.catalog?.candidates[0]).toMatchObject({
      confidence: 'low',
      evidence: 'relative-orders',
    });
    expect(JSON.parse(await readFile(result.catalogPath!, 'utf-8')).endpoints[0].sourceFingerprint).toBeTruthy();
  });

  it('marks unchanged catalog entries reused and missing entries stale during incremental scans', async () => {
    const root = await fixtureDir();
    const artifactDir = await fixtureDir();
    await writeFixture(root, 'app/api/orders/[id]/route.ts', 'export async function GET() {}');
    const first = await runWhiteboxAttackSurfaceWorkflow({ target: 'https://shop.example', cwd: root, artifactDir });

    const second = await runWhiteboxAttackSurfaceWorkflow({
      target: 'https://shop.example',
      cwd: root,
      artifactDir,
      incremental: true,
    });

    expect(second.catalog?.endpoints[0]?.reused).toBe(true);

    await writeFixture(root, 'app/api/orders/[id]/route.ts', 'export async function GET() {}\nexport async function PATCH() {}');
    const changed = await runWhiteboxAttackSurfaceWorkflow({
      target: 'https://shop.example',
      cwd: root,
      artifactDir,
      incremental: true,
    });

    expect(changed.catalog?.endpoints.some(endpoint => endpoint.path === '/api/orders/:id' && endpoint.reused === false)).toBe(true);

    const syntheticPrevious = buildWhiteboxCatalog({
      cwd: root,
      apps: [
        {
          name: 'shop',
          pages: [],
          apiEndpoints: [
            {
              path: '/api/old',
              kind: 'api',
              pentestObjectives: ['Test old route'],
              evidence: ['source:old.ts'],
              sourceFile: 'old.ts',
              sourceFingerprint: 'old',
            },
          ],
        },
      ],
    });
    const third = buildWhiteboxCatalog({
      cwd: root,
      apps: first.apps,
      previous: syntheticPrevious,
    });

    expect(third.endpoints.find(endpoint => endpoint.path === '/api/old')?.stale).toBe(true);
  });
});
