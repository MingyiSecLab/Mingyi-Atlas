import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FindingsRegistry, isConfirmedFinding, sanitizeFindingId } from './findings.js';

function baseFinding(overrides: Partial<Parameters<typeof buildFinding>[0]> = {}) {
  return buildFinding({
    id: 'Finding 1',
    title: 'IDOR on order lookup',
    target: '/api/orders/:id',
    severity: 'high',
    description: 'User A can read User B orders.',
    evidence: [{ kind: 'http', description: 'GET /api/orders/2 returned another user order' }],
    confirmed: true,
    ...overrides,
  });
}

function buildFinding(finding: {
  id: string;
  title: string;
  target: string;
  severity: 'informational' | 'low' | 'medium' | 'high' | 'critical';
  description: string;
  evidence: Array<{ kind: 'http' | 'browser' | 'command' | 'code' | 'note'; description: string }>;
  confirmed: boolean;
}) {
  return finding;
}

describe('findings registry', () => {
  it('sanitizes finding ids for filenames', () => {
    expect(sanitizeFindingId('Finding 1 / ../../evil')).toBe('finding-1-evil');
  });

  it('recognizes confirmed findings only when evidence is present', () => {
    expect(isConfirmedFinding(baseFinding())).toBe(true);
    expect(isConfirmedFinding(baseFinding({ confirmed: false }))).toBe(false);
    expect(isConfirmedFinding(baseFinding({ evidence: [] }))).toBe(false);
  });

  it('persists only confirmed findings and reloads them', async () => {
    const artifactDir = await mkdtemp(path.join(os.tmpdir(), 'mastracode-findings-'));
    const registry = new FindingsRegistry(artifactDir);
    const confirmed = baseFinding();
    const unconfirmed = buildFinding({
      ...confirmed,
      id: 'unconfirmed',
      confirmed: false,
    });

    const paths = await registry.recordMany([confirmed, unconfirmed]);
    expect(paths).toHaveLength(1);
    expect(paths[0]).toContain('finding-1.json');

    const stored = JSON.parse(await readFile(paths[0]!, 'utf-8')) as { id: string; confirmed: boolean };
    expect(stored.id).toBe('finding-1');
    expect(stored.confirmed).toBe(true);
    expect(await registry.list()).toHaveLength(1);
  });
});
