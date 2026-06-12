import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cveSearchInputSchema, executeCveSearch } from '../cveSearch.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function nvdPayload(cveId: string, baseScore: number, cwe = 'CWE-79') {
  return {
    vulnerabilities: [
      {
        cve: {
          id: cveId,
          published: '2024-01-01T00:00:00.000',
          lastModified: '2024-01-02T00:00:00.000',
          descriptions: [{ lang: 'en', value: `${cveId} summary` }],
          metrics: {
            cvssMetricV31: [
              {
                baseSeverity: baseScore >= 9 ? 'CRITICAL' : 'HIGH',
                cvssData: {
                  baseScore,
                  vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
                },
              },
            ],
          },
          weaknesses: [{ description: [{ lang: 'en', value: cwe }] }],
          references: { references: [{ url: `https://example.test/${cveId}` }] },
        },
      },
    ],
  };
}

describe('cve_search tool', () => {
  let tmpDir: string;
  const originalCache = process.env.MINGYI_ATLAS_CVE_CACHE_PATH;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'mingyi-atlas-cve-search-'));
    process.env.MINGYI_ATLAS_CVE_CACHE_PATH = path.join(tmpDir, 'cache.json');
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalCache === undefined) delete process.env.MINGYI_ATLAS_CVE_CACHE_PATH;
    else process.env.MINGYI_ATLAS_CVE_CACHE_PATH = originalCache;
    vi.unstubAllGlobals();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('validates mode-specific input requirements', () => {
    expect(() =>
      cveSearchInputSchema.parse({
        mode: 'ids',
        cveIds: [],
        purpose: 'test validation',
      }),
    ).toThrow(/requires at least one CVE/);

    expect(() =>
      cveSearchInputSchema.parse({
        mode: 'package',
        packageName: 'lodash',
        purpose: 'test validation',
      }),
    ).toThrow(/requires version/);
  });

  it('looks up CVE IDs and enriches with EPSS and KEV', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href.includes('services.nvd.nist.gov')) return jsonResponse(nvdPayload('CVE-2021-44228', 10, 'CWE-502'));
      if (href.includes('api.first.org')) {
        return jsonResponse({ data: [{ cve: 'CVE-2021-44228', epss: '0.95', percentile: '0.99' }] });
      }
      if (href.includes('known_exploited_vulnerabilities.json')) {
        return jsonResponse({ vulnerabilities: [{ cveID: 'CVE-2021-44228' }] });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeCveSearch({
      mode: 'ids',
      cveIds: ['cve-2021-44228'],
      purpose: 'triage log4shell',
    });

    expect(result.count).toBe(1);
    expect(result.results[0]).toMatchObject({
      cveId: 'CVE-2021-44228',
      cvss: 10,
      cwes: ['CWE-502'],
      epss: 0.95,
      epssPercentile: 0.99,
      kev: true,
      score: 10,
    });
    expect(result.results[0]?.sources).toEqual(expect.arrayContaining(['nvd', 'epss', 'kev']));
  });

  it('uses OSV package lookup then enriches returned CVEs', async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      if (href.includes('api.osv.dev')) {
        expect(init?.method).toBe('POST');
        return jsonResponse({
          vulns: [
            {
              id: 'GHSA-test',
              aliases: ['CVE-2024-12345'],
            },
          ],
        });
      }
      if (href.includes('services.nvd.nist.gov')) return jsonResponse(nvdPayload('CVE-2024-12345', 8.8, 'CWE-89'));
      if (href.includes('api.first.org')) {
        return jsonResponse({ data: [{ cve: 'CVE-2024-12345', epss: '0.5', percentile: '0.8' }] });
      }
      if (href.includes('known_exploited_vulnerabilities.json')) {
        return jsonResponse({ vulnerabilities: [] });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeCveSearch({
      mode: 'package',
      packageName: 'demo-package',
      version: '1.0.0',
      ecosystem: 'npm',
      purpose: 'dependency triage',
    });

    expect(result.sourceIds).toEqual(expect.arrayContaining(['GHSA-test', 'CVE-2024-12345']));
    expect(result.results[0]).toMatchObject({
      cveId: 'CVE-2024-12345',
      cwes: ['CWE-89'],
      kev: false,
    });
    expect(result.results[0]?.sources).toEqual(expect.arrayContaining(['nvd', 'osv', 'epss']));
  });

  it('searches NVD by keyword', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href.includes('services.nvd.nist.gov')) {
        expect(href).toContain('keywordSearch=apache');
        return jsonResponse(nvdPayload('CVE-2024-9999', 9.1, 'CWE-78'));
      }
      if (href.includes('api.first.org')) return jsonResponse({ data: [] });
      if (href.includes('known_exploited_vulnerabilities.json')) return jsonResponse({ vulnerabilities: [] });
      return jsonResponse({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeCveSearch({
      mode: 'keyword',
      query: 'apache',
      purpose: 'service version triage',
    });

    expect(result.count).toBe(1);
    expect(result.sourceIds).toEqual(['CVE-2024-9999']);
    expect(result.results[0]).toMatchObject({ cveId: 'CVE-2024-9999', cwes: ['CWE-78'] });
  });

  it('uses cached responses when the network fails later', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href.includes('services.nvd.nist.gov')) return jsonResponse(nvdPayload('CVE-2022-0001', 7.5));
      if (href.includes('api.first.org')) return jsonResponse({ data: [] });
      if (href.includes('known_exploited_vulnerabilities.json')) return jsonResponse({ vulnerabilities: [] });
      return jsonResponse({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    await executeCveSearch({
      mode: 'ids',
      cveIds: ['CVE-2022-0001'],
      purpose: 'prime cache',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );

    const cached = await executeCveSearch({
      mode: 'ids',
      cveIds: ['CVE-2022-0001'],
      purpose: 'offline cache read',
    });

    expect(cached.count).toBe(1);
    expect(cached.results[0]?.cveId).toBe('CVE-2022-0001');
    expect(cached.errors).toEqual([]);
  });
});
