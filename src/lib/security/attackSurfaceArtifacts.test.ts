import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AttackSurfaceArtifactStore,
  createAppArtifactId,
  createEndpointArtifactId,
  validateRoutePath,
} from './attackSurfaceArtifacts.js';

describe('attack surface artifacts', () => {
  it('creates deterministic app and endpoint ids', () => {
    expect(createAppArtifactId('Main Web App')).toBe(createAppArtifactId('Main Web App'));
    expect(
      createEndpointArtifactId({
        appName: 'Main Web App',
        routePath: '/api/orders/:id',
        method: ['GET', 'POST'],
      }),
    ).toBe(
      createEndpointArtifactId({
        appName: 'Main Web App',
        routePath: '/api/orders/:id',
        method: ['GET', 'POST'],
      }),
    );
  });

  it('validates endpoint route paths', () => {
    expect(validateRoutePath('/api/orders').valid).toBe(true);
    expect(validateRoutePath('arn:aws:s3:::bucket').valid).toBe(true);
    expect(validateRoutePath('https://shop.example/api/orders')).toMatchObject({ valid: false });
    expect(validateRoutePath('api/orders')).toMatchObject({ valid: false });
  });

  it('persists apps, endpoints, and reports and detects duplicates', async () => {
    const artifactDir = await mkdtemp(path.join(os.tmpdir(), 'mastracode-attack-surface-'));
    const store = new AttackSurfaceArtifactStore(artifactDir, () => new Date('2026-05-22T00:00:00.000Z'));

    const app = await store.writeApp({
      appName: 'Main Web App',
      appType: 'web_application',
      description: 'Customer storefront',
      domain: 'https://shop.example',
    });
    const duplicateApp = await store.writeApp({
      appName: 'Main Web App',
      appType: 'web_application',
      description: 'Duplicate storefront',
    });

    expect(app.duplicate).toBe(false);
    expect(duplicateApp.duplicate).toBe(true);
    expect(duplicateApp.record.description).toBe('Customer storefront');

    const endpoint = await store.writeEndpoint({
      appName: 'Main Web App',
      routePath: '/api/orders/:id',
      endpointType: 'api-endpoint',
      description: 'Read order by id',
      method: 'GET',
      kind: 'api',
      authRequired: true,
    });
    const duplicateEndpoint = await store.writeEndpoint({
      appName: 'Main Web App',
      routePath: '/api/orders/:id',
      endpointType: 'api-endpoint',
      description: 'Duplicate',
      method: ['GET'],
    });

    expect(endpoint.duplicate).toBe(false);
    expect(endpoint.record.pentestObjectives).toContain('Test object-level authorization');
    expect(duplicateEndpoint.duplicate).toBe(true);
    expect(await store.listApps()).toHaveLength(1);
    expect(await store.listEndpoints()).toHaveLength(1);

    const report = await store.writeReport({
      summary: { totalAssets: 2, totalDomains: 1, analysisComplete: true },
      discoveredAssets: ['shop.example - Customer storefront'],
      targets: [{ target: '/api/orders/:id', objectives: ['Test IDOR'], rationale: 'Order object API' }],
      keyFindings: ['[LOW] Uses third-party auth provider'],
    });

    expect(JSON.parse(await readFile(report.filePath, 'utf-8'))).toMatchObject({
      summary: { totalAssets: 2 },
      targets: [{ target: '/api/orders/:id' }],
    });
    await expect(store.readReport()).resolves.toEqual(report.record);
  });
});
