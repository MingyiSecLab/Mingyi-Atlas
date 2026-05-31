import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { getAppDataDir } from '../utils/project.js';

const NVD_URL = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const OSV_URL = 'https://api.osv.dev/v1/query';
const EPSS_URL = 'https://api.first.org/data/v1/epss';
const KEV_URL = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESULTS = 10;
const MAX_RESULTS = 50;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const ecosystemSchema = z.enum(['npm', 'PyPI', 'Go', 'Maven', 'RubyGems', 'crates.io', 'Packagist', 'NuGet']);

export const cveSearchInputSchema = z
  .object({
    mode: z
      .enum(['ids', 'keyword', 'package'])
      .describe('Lookup mode: ids for known CVE IDs, keyword for NVD keyword search, package for OSV package@version lookup.'),
    cveIds: z.array(z.string().min(1)).default([]).describe('CVE IDs for mode=ids, e.g. ["CVE-2021-44228"].'),
    query: z.string().optional().describe('NVD keyword query for mode=keyword, e.g. "Apache Struts RCE".'),
    packageName: z.string().optional().describe('Package name for mode=package.'),
    version: z.string().optional().describe('Package version for mode=package.'),
    ecosystem: ecosystemSchema.default('npm').describe('OSV ecosystem for mode=package.'),
    includeEpss: z.boolean().default(true).describe('Enrich CVE results with FIRST EPSS probability and percentile.'),
    includeKev: z.boolean().default(true).describe('Enrich CVE results with CISA Known Exploited Vulnerabilities membership.'),
    maxResults: z.number().int().positive().max(MAX_RESULTS).default(DEFAULT_MAX_RESULTS),
    timeoutMs: z.number().int().positive().max(MAX_TIMEOUT_MS).default(DEFAULT_TIMEOUT_MS),
    purpose: z.string().min(1).describe('Concise reason for this lookup.'),
  })
  .superRefine((input, ctx) => {
    if (input.mode === 'ids' && input.cveIds.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cveIds'], message: 'mode=ids requires at least one CVE ID.' });
    }
    if (input.mode === 'keyword' && !input.query?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['query'], message: 'mode=keyword requires query.' });
    }
    if (input.mode === 'package') {
      if (!input.packageName?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['packageName'], message: 'mode=package requires packageName.' });
      }
      if (!input.version?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['version'], message: 'mode=package requires version.' });
      }
    }
  });

export type CveSearchInput = z.input<typeof cveSearchInputSchema>;
type ParsedCveSearchInput = z.infer<typeof cveSearchInputSchema>;

interface HttpCacheEntry {
  createdAt: number;
  value: unknown;
}

interface HttpCacheFile {
  entries: Record<string, HttpCacheEntry>;
}

export interface CveSearchResult {
  cveId: string;
  sourceIds: string[];
  summary: string;
  published?: string;
  lastModified?: string;
  cvss?: number;
  severity?: string;
  cvssVector?: string;
  cwes: string[];
  epss?: number;
  epssPercentile?: number;
  kev: boolean;
  references: string[];
  score: number;
  sources: string[];
}

function getCachePath(): string {
  return process.env.MINGYI_ATLAS_CVE_CACHE_PATH || path.join(getAppDataDir(), 'cve-cache.json');
}

function readCache(): HttpCacheFile {
  const cachePath = getCachePath();
  try {
    if (!existsSync(cachePath)) return { entries: {} };
    const parsed = JSON.parse(readFileSync(cachePath, 'utf-8'));
    if (parsed && typeof parsed === 'object' && parsed.entries && typeof parsed.entries === 'object') {
      return { entries: parsed.entries };
    }
  } catch {
    // Corrupt caches are ignored; the next successful fetch replaces them.
  }
  return { entries: {} };
}

function writeCache(cache: HttpCacheFile): void {
  const cachePath = getCachePath();
  const dir = path.dirname(cachePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf-8');
}

function cacheKey(method: string, url: string, body?: unknown): string {
  return JSON.stringify({ method, url, body: body ?? null });
}

async function fetchJsonCached(
  url: string,
  input: { method?: 'GET' | 'POST'; body?: unknown; timeoutMs: number },
): Promise<{ value?: any; error?: string; cached: boolean }> {
  const method = input.method ?? 'GET';
  const key = cacheKey(method, url, input.body);
  const cache = readCache();
  const entry = cache.entries[key];
  if (entry && Date.now() - entry.createdAt < CACHE_TTL_MS) {
    return { value: entry.value, cached: true };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs).unref();
  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: input.body ? { 'content-type': 'application/json' } : undefined,
      body: input.body ? JSON.stringify(input.body) : undefined,
    });
    if (!response.ok) {
      return { error: `${response.status} ${response.statusText}`, cached: false };
    }
    const value = await response.json();
    cache.entries[key] = { createdAt: Date.now(), value };
    writeCache(cache);
    return { value, cached: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (entry) return { value: entry.value, error: message, cached: true };
    return { error: message, cached: false };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeCveId(value: string): string | undefined {
  const upper = value.trim().toUpperCase();
  return /^CVE-\d{4}-\d{4,}$/.test(upper) ? upper : undefined;
}

function cveIdsFromOsv(data: any): { cveIds: string[]; sourceIds: string[] } {
  const cveIds = new Set<string>();
  const sourceIds = new Set<string>();
  for (const vuln of data?.vulns ?? []) {
    if (typeof vuln?.id === 'string') {
      sourceIds.add(vuln.id);
      const cve = normalizeCveId(vuln.id);
      if (cve) cveIds.add(cve);
    }
    for (const alias of vuln?.aliases ?? []) {
      if (typeof alias !== 'string') continue;
      sourceIds.add(alias);
      const cve = normalizeCveId(alias);
      if (cve) cveIds.add(cve);
    }
  }
  return { cveIds: [...cveIds], sourceIds: [...sourceIds] };
}

function bestCvss(metrics: any): { cvss?: number; severity?: string; vector?: string } {
  for (const key of ['cvssMetricV31', 'cvssMetricV30', 'cvssMetricV2']) {
    const item = metrics?.[key]?.[0];
    const data = item?.cvssData;
    if (data?.baseScore !== undefined) {
      return {
        cvss: Number(data.baseScore),
        severity: item.baseSeverity || data.baseSeverity,
        vector: data.vectorString,
      };
    }
  }
  return {};
}

function parseNvdResults(data: any): CveSearchResult[] {
  const results: CveSearchResult[] = [];
  for (const item of data?.vulnerabilities ?? []) {
    const cve = item?.cve;
    if (!cve?.id) continue;
    const description =
      cve.descriptions?.find((d: any) => d?.lang === 'en')?.value ??
      cve.descriptions?.find((d: any) => typeof d?.value === 'string')?.value ??
      '';
    const cvss = bestCvss(cve.metrics);
    const cwes = new Set<string>();
    for (const weakness of cve.weaknesses ?? []) {
      for (const desc of weakness.description ?? []) {
        if (typeof desc?.value === 'string' && desc.value.startsWith('CWE-')) cwes.add(desc.value);
      }
    }
    results.push({
      cveId: cve.id,
      sourceIds: [cve.id],
      summary: description,
      published: cve.published,
      lastModified: cve.lastModified,
      cvss: cvss.cvss,
      severity: cvss.severity,
      cvssVector: cvss.vector,
      cwes: [...cwes],
      kev: false,
      references: (cve.references?.references ?? []).map((r: any) => r?.url).filter((url: any): url is string => typeof url === 'string'),
      score: 0,
      sources: ['nvd'],
    });
  }
  return results;
}

function parseEpss(data: any): Map<string, { epss?: number; epssPercentile?: number }> {
  const out = new Map<string, { epss?: number; epssPercentile?: number }>();
  for (const item of data?.data ?? []) {
    if (typeof item?.cve !== 'string') continue;
    out.set(item.cve.toUpperCase(), {
      epss: item.epss !== undefined ? Number(item.epss) : undefined,
      epssPercentile: item.percentile !== undefined ? Number(item.percentile) : undefined,
    });
  }
  return out;
}

function parseKev(data: any): Set<string> {
  const out = new Set<string>();
  for (const item of data?.vulnerabilities ?? []) {
    if (typeof item?.cveID === 'string') out.add(item.cveID.toUpperCase());
  }
  return out;
}

function rankScore(result: CveSearchResult): number {
  const cvss = result.cvss ?? 0;
  const epssLift = result.epssPercentile !== undefined ? Math.min(2, Math.max(0, result.epssPercentile * 2)) : 0;
  const kevLift = result.kev ? 2 : 0;
  return Math.round(Math.min(10, cvss + epssLift + kevLift) * 100) / 100;
}

async function lookupNvdByIds(cveIds: string[], input: ParsedCveSearchInput): Promise<{ results: CveSearchResult[]; errors: string[] }> {
  const results: CveSearchResult[] = [];
  const errors: string[] = [];
  for (const cveId of cveIds.slice(0, input.maxResults)) {
    const url = new URL(NVD_URL);
    url.searchParams.set('cveId', cveId);
    const response = await fetchJsonCached(url.toString(), { timeoutMs: input.timeoutMs });
    if (response.error && !response.value) {
      errors.push(`NVD ${cveId}: ${response.error}`);
      continue;
    }
    results.push(...parseNvdResults(response.value));
  }
  return { results, errors };
}

async function lookupNvdByKeyword(input: ParsedCveSearchInput): Promise<{ results: CveSearchResult[]; errors: string[] }> {
  const url = new URL(NVD_URL);
  url.searchParams.set('keywordSearch', input.query!.trim());
  url.searchParams.set('resultsPerPage', String(input.maxResults));
  const response = await fetchJsonCached(url.toString(), { timeoutMs: input.timeoutMs });
  if (response.error && !response.value) return { results: [], errors: [`NVD keyword: ${response.error}`] };
  return { results: parseNvdResults(response.value).slice(0, input.maxResults), errors: [] };
}

async function enrich(results: CveSearchResult[], input: ParsedCveSearchInput): Promise<{ results: CveSearchResult[]; errors: string[] }> {
  const errors: string[] = [];
  const ids = results.map(r => r.cveId);

  if (input.includeEpss && ids.length > 0) {
    const url = new URL(EPSS_URL);
    url.searchParams.set('cve', ids.join(','));
    const response = await fetchJsonCached(url.toString(), { timeoutMs: input.timeoutMs });
    if (response.error && !response.value) {
      errors.push(`EPSS: ${response.error}`);
    } else {
      const epss = parseEpss(response.value);
      for (const result of results) {
        const e = epss.get(result.cveId);
        if (e) {
          result.epss = e.epss;
          result.epssPercentile = e.epssPercentile;
          result.sources.push('epss');
        }
      }
    }
  }

  if (input.includeKev) {
    const response = await fetchJsonCached(KEV_URL, { timeoutMs: input.timeoutMs });
    if (response.error && !response.value) {
      errors.push(`KEV: ${response.error}`);
    } else {
      const kev = parseKev(response.value);
      for (const result of results) {
        result.kev = kev.has(result.cveId);
        if (result.kev) result.sources.push('kev');
      }
    }
  }

  for (const result of results) result.score = rankScore(result);
  results.sort((a, b) => b.score - a.score || (b.epssPercentile ?? 0) - (a.epssPercentile ?? 0) || b.cveId.localeCompare(a.cveId));
  return { results, errors };
}

export async function executeCveSearch(rawInput: unknown) {
  const input = cveSearchInputSchema.parse(rawInput);
  const errors: string[] = [];
  let sourceIds: string[] = [];
  let results: CveSearchResult[] = [];

  if (input.mode === 'ids') {
    const ids = [...new Set(input.cveIds.map(id => normalizeCveId(id)).filter((id): id is string => !!id))];
    sourceIds = ids;
    const nvd = await lookupNvdByIds(ids, input);
    results = nvd.results;
    errors.push(...nvd.errors);
  } else if (input.mode === 'keyword') {
    const nvd = await lookupNvdByKeyword(input);
    results = nvd.results;
    sourceIds = results.map(r => r.cveId);
    errors.push(...nvd.errors);
  } else {
    const body = {
      version: input.version,
      package: { name: input.packageName, ecosystem: input.ecosystem },
    };
    const osv = await fetchJsonCached(OSV_URL, { method: 'POST', body, timeoutMs: input.timeoutMs });
    if (osv.error && !osv.value) {
      errors.push(`OSV: ${osv.error}`);
    } else {
      const parsed = cveIdsFromOsv(osv.value);
      sourceIds = parsed.sourceIds;
      const nvd = await lookupNvdByIds(parsed.cveIds, input);
      results = nvd.results;
      for (const result of results) {
        result.sourceIds = [...new Set([...result.sourceIds, ...parsed.sourceIds])];
        result.sources.push('osv');
      }
      errors.push(...nvd.errors);
    }
  }

  const enriched = await enrich(results, input);
  errors.push(...enriched.errors);

  return {
    mode: input.mode,
    purpose: input.purpose,
    count: enriched.results.length,
    sourceIds,
    results: enriched.results.slice(0, input.maxResults),
    errors,
  };
}

export const cveSearchTool = createTool({
  id: 'cve_search',
  description: `Search and enrich CVE intelligence using structured vulnerability sources.

Use this during authorized pentests when you need known-vulnerability intelligence for CVE IDs, software keywords, or package/version dependencies.

Sources:
- NVD for CVE descriptions, CVSS, CWE, publication dates, and references.
- OSV for package@version vulnerability matching.
- FIRST EPSS for real-world exploit probability.
- CISA KEV for known exploited-in-the-wild status.

Prefer cve_search over generic web_search for structured CVE triage. Use web_search only afterward for vendor advisories, exploit writeups, or missing details.`,
  inputSchema: cveSearchInputSchema,
  execute: executeCveSearch,
});
