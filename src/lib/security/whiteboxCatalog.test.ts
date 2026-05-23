import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  WHITEBOX_CATALOG_SCHEMA_VERSION,
  WhiteboxCatalogStore,
  validateWhiteboxCatalog,
  whiteboxCatalogEndpointId,
} from './whiteboxCatalog.js';

describe('whitebox catalog', () => {
  it('serializes catalog apps, endpoints, candidates, source evidence, and stale entries', async () => {
    const artifactDir = await mkdtemp(path.join(os.tmpdir(), 'mastracode-whitebox-catalog-'));
    const store = new WhiteboxCatalogStore(artifactDir);
    const endpointId = whiteboxCatalogEndpointId({
      appId: 'shop',
      path: '/api/orders/:id',
      method: 'GET',
      sourceFile: 'app/api/orders/[id]/route.ts',
    });

    await store.write({
      schemaVersion: WHITEBOX_CATALOG_SCHEMA_VERSION,
      generatedAt: '2026-05-23T00:00:00.000Z',
      rootPath: '/repo',
      apps: [
        {
          id: 'shop',
          name: 'shop',
          rootPath: '/repo',
          frameworkProfiles: ['next-app-router'],
          routeSources: ['app/api/orders/[id]/route.ts'],
          generatedTargetIds: [endpointId],
        },
      ],
      endpoints: [
        {
          id: endpointId,
          appId: 'shop',
          path: '/api/orders/:id',
          methods: ['GET'],
          kind: 'api',
          handler: { file: 'app/api/orders/[id]/route.ts' },
          frameworkProfile: 'next-app-router',
          sourceEvidence: ['source:app/api/orders/[id]/route.ts'],
          sourceFingerprint: 'abc',
          pentestObjectives: ['Test IDOR'],
          confidence: 'high',
          stale: true,
        },
      ],
      candidates: [
        {
          id: 'candidate-route',
          sourceFile: 'src/server.ts',
          evidence: 'orders',
          reason: 'Route-like call did not contain a concrete absolute path.',
          confidence: 'low',
        },
      ],
    });

    const catalog = await store.read();
    expect(catalog?.schemaVersion).toBe(WHITEBOX_CATALOG_SCHEMA_VERSION);
    expect(catalog?.endpoints[0]).toMatchObject({
      id: endpointId,
      confidence: 'high',
      stale: true,
    });
    expect(catalog?.candidates[0]?.confidence).toBe('low');
    expect(validateWhiteboxCatalog({ schemaVersion: 999 })).toBeUndefined();
  });
});
