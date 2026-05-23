import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEvidenceId, EvidenceStore, type EvidenceArtifact } from './evidence.js';

function requestEvidence(overrides: Partial<EvidenceArtifact> = {}): EvidenceArtifact {
  return {
    kind: 'http-request',
    targetId: 'orders',
    target: 'https://shop.example/api/orders/:id',
    findingId: 'order-idor',
    redacted: true,
    request: {
      method: 'GET',
      url: 'https://shop.example/api/orders/2',
      headers: { authorization: '[REDACTED]' },
    },
    ...overrides,
  } as EvidenceArtifact;
}

describe('evidence artifacts', () => {
  it('creates stable ids from evidence content without using timestamps', () => {
    const first = createEvidenceId(requestEvidence());
    const second = createEvidenceId(requestEvidence({ createdAt: '2026-01-01T00:00:00.000Z' }));

    expect(first).toBe(second);
    expect(first).toMatch(/^ev-orders-http-request-[a-f0-9]{12}$/);
  });

  it('persists, reloads, and lists evidence artifacts with target metadata', async () => {
    const artifactDir = await mkdtemp(path.join(os.tmpdir(), 'mastracode-evidence-'));
    const store = new EvidenceStore(artifactDir, {
      now: () => new Date('2026-05-22T00:00:00.000Z'),
    });

    const { evidence, filePath } = await store.write(requestEvidence());

    expect(evidence.id).toBeDefined();
    expect(evidence.createdAt).toBe('2026-05-22T00:00:00.000Z');
    expect(evidence.targetId).toBe('orders');
    expect(evidence.findingId).toBe('order-idor');

    const stored = JSON.parse(await readFile(filePath, 'utf-8')) as EvidenceArtifact;
    expect(stored).toEqual(evidence);
    await expect(store.read(evidence.id!)).resolves.toEqual(evidence);
    await expect(store.list()).resolves.toEqual([evidence]);
  });

  it('supports all evidence kinds without a worker runtime dependency', async () => {
    const artifactDir = await mkdtemp(path.join(os.tmpdir(), 'mastracode-evidence-kinds-'));
    const store = new EvidenceStore(artifactDir);
    const base = { targetId: 'login', target: '/login' };
    const evidence: EvidenceArtifact[] = [
      { ...base, kind: 'http-request', request: { method: 'GET', url: '/login' } },
      { ...base, kind: 'http-response', response: { status: 200, bodySnippet: '<form>' } },
      { ...base, kind: 'browser-screenshot', screenshot: { path: 'evidence/login.png', mimeType: 'image/png' } },
      { ...base, kind: 'browser-dom', dom: { url: '/login', forms: [{ action: '/login', method: 'POST', fields: ['email'] }] } },
      { ...base, kind: 'code-reference', code: { file: 'app/login/page.tsx', startLine: 1 } },
      { ...base, kind: 'command', command: { command: 'curl /login', exitCode: 0 } },
      { ...base, kind: 'note', note: { text: 'Login responds with a CSRF token.' } },
    ];

    for (const item of evidence) {
      await store.write(item);
    }

    expect((await store.list()).map(item => item.kind).sort()).toEqual([
      'browser-dom',
      'browser-screenshot',
      'code-reference',
      'command',
      'http-request',
      'http-response',
      'note',
    ]);
  });
});
