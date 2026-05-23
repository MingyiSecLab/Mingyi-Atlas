import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { AttackSurfaceItem } from '../lib/security/attackSurface.js';
import { inferTargetObjectives } from '../lib/security/attackSurface.js';
import {
  WHITEBOX_CATALOG_SCHEMA_VERSION,
  WhiteboxCatalogStore,
  whiteboxCatalogEndpointId,
  type WhiteboxCatalog,
  type WhiteboxCatalogCandidate,
  type WhiteboxCatalogEndpoint,
} from '../lib/security/whiteboxCatalog.js';

export interface WhiteboxDiscoveredEndpoint {
  path: string;
  method?: string;
  kind?: AttackSurfaceItem['kind'];
  businessContext?: string;
  authRequired?: boolean;
  parameters?: AttackSurfaceItem['parameters'];
  evidence?: string[];
  pentestObjectives?: string[];
  sourceFile?: string;
  sourceFingerprint?: string;
  frameworkProfile?: string;
  confidence?: 'high' | 'medium' | 'low';
  stale?: boolean;
  catalogEndpointId?: string;
}

export interface WhiteboxDiscoveredApp {
  name: string;
  type?: string;
  location?: string;
  pages: WhiteboxDiscoveredEndpoint[];
  apiEndpoints: WhiteboxDiscoveredEndpoint[];
  candidates?: WhiteboxCatalogCandidate[];
}

export interface WhiteboxAttackSurfaceInput {
  target: string;
  cwd: string;
  apps?: WhiteboxDiscoveredApp[];
  maxFiles?: number;
  artifactDir?: string;
  incremental?: boolean;
}

export interface WhiteboxAttackSurfaceResult {
  source: 'whitebox';
  cwd: string;
  apps: WhiteboxDiscoveredApp[];
  catalog?: WhiteboxCatalog;
  catalogPath?: string;
}

const ROUTE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const IGNORED_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'coverage', '.turbo']);
const METHOD_NAMES = ['get', 'post', 'put', 'patch', 'delete'] as const;

function normalizeRoutePath(routePath: string): string {
  const cleaned = routePath
    .replace(/\\/g, '/')
    .replace(/\/index$/, '/')
    .replace(/\/route$/, '')
    .replace(/\/page$/, '')
    .replace(/\[(\.\.\.)?([^\]]+)\]/g, ':$2')
    .replace(/\/+/g, '/');
  const withSlash = cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
  return withSlash === '/index' ? '/' : withSlash.replace(/\/$/, '') || '/';
}

function kindFromPath(routePath: string): AttackSurfaceItem['kind'] {
  const lower = routePath.toLowerCase();
  if (lower.endsWith('.js')) return 'static-js';
  if (lower.includes('admin')) return 'admin';
  if (lower.includes('oauth') || lower.includes('callback') || lower.includes('saml') || lower.includes('sso')) return 'callback';
  if (lower.includes('login') || lower.includes('signin') || lower.includes('session')) return 'auth';
  if (lower.includes('upload') || lower.includes('avatar') || lower.includes('attachment')) return 'upload';
  if (lower.startsWith('/api/') || lower.includes('/api/')) return 'api';
  return 'page';
}

function parametersFromPath(routePath: string): AttackSurfaceItem['parameters'] {
  const params = [...routePath.matchAll(/:([a-zA-Z0-9_]+)/g)].map(match => ({
    name: match[1]!,
    location: 'path' as const,
  }));
  return params.length ? params : undefined;
}

function fingerprintSource(source: string): string {
  return createHash('sha256').update(source).digest('hex').slice(0, 16);
}

function frameworkProfileFromSourceFile(sourceFile: string): string {
  if (sourceFile.startsWith('app/')) return 'next-app-router';
  if (sourceFile.startsWith('pages/')) return 'next-pages-router';
  return 'generic-node-router';
}

async function collectSourceFiles(cwd: string, maxFiles = 1000): Promise<string[]> {
  const files: string[] = [];

  async function visit(dir: string): Promise<void> {
    if (files.length >= maxFiles) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) return;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) await visit(fullPath);
        continue;
      }
      if (entry.isFile() && ROUTE_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(fullPath);
      }
    }
  }

  await visit(cwd);
  return files;
}

function endpoint(
  routePath: string,
  sourceFile: string,
  options: {
    method?: string;
    kind?: AttackSurfaceItem['kind'];
    evidence?: string[];
    sourceFingerprint?: string;
    frameworkProfile?: string;
    confidence?: 'high' | 'medium' | 'low';
  } = {},
): WhiteboxDiscoveredEndpoint {
  const normalizedPath = normalizeRoutePath(routePath);
  const item = {
    path: normalizedPath,
    method: options.method,
    kind: options.kind ?? kindFromPath(normalizedPath),
    parameters: parametersFromPath(normalizedPath),
    evidence: options.evidence ?? [`source:${sourceFile}`],
    sourceFile,
    sourceFingerprint: options.sourceFingerprint,
    frameworkProfile: options.frameworkProfile ?? frameworkProfileFromSourceFile(sourceFile),
    confidence: options.confidence ?? 'high',
  } satisfies WhiteboxDiscoveredEndpoint;

  return {
    ...item,
    pentestObjectives: inferTargetObjectives({
      target: item.path,
      method: item.method,
      kind: item.kind,
      parameters: item.parameters,
    }),
  };
}

function routeFromFile(cwd: string, filePath: string): WhiteboxDiscoveredEndpoint | undefined {
  const relative = path.relative(cwd, filePath).replace(/\\/g, '/');
  const ext = path.extname(relative);
  const withoutExt = relative.slice(0, -ext.length);

  if (withoutExt.startsWith('app/api/') && withoutExt.endsWith('/route')) {
    return endpoint(`/${withoutExt.replace(/^app\//, '')}`, relative, { kind: 'api' });
  }
  if (withoutExt.startsWith('pages/api/')) {
    return endpoint(`/${withoutExt.replace(/^pages\//, '')}`, relative, { kind: 'api' });
  }
  if (withoutExt.startsWith('app/') && withoutExt.endsWith('/page')) {
    return endpoint(`/${withoutExt.replace(/^app\//, '')}`, relative, { kind: 'page' });
  }
  if (withoutExt.startsWith('pages/')) {
    return endpoint(`/${withoutExt.replace(/^pages\//, '')}`, relative, { kind: 'page' });
  }

  return undefined;
}

function methodsFromRouteFile(source: string): string[] {
  const methods: string[] = [];
  for (const method of METHOD_NAMES) {
    const pattern = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method.toUpperCase()}\\b|export\\s+const\\s+${method.toUpperCase()}\\b`, 'g');
    if (pattern.test(source)) methods.push(method.toUpperCase());
  }
  return methods;
}

function routesFromSource(source: string, sourceFile: string): WhiteboxDiscoveredEndpoint[] {
  const endpoints: WhiteboxDiscoveredEndpoint[] = [];
  const callPattern = /\b(?:app|router|route)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
  for (const match of source.matchAll(callPattern)) {
    const method = match[1]?.toUpperCase();
    const routePath = match[2];
    if (!method || !routePath || !routePath.startsWith('/')) continue;
    endpoints.push(endpoint(routePath, sourceFile, {
      method,
      kind: kindFromPath(routePath),
      sourceFingerprint: fingerprintSource(source),
      frameworkProfile: frameworkProfileFromSourceFile(sourceFile),
      confidence: 'medium',
    }));
  }
  return endpoints;
}

function candidatesFromSource(source: string, sourceFile: string): WhiteboxCatalogCandidate[] {
  const candidates: WhiteboxCatalogCandidate[] = [];
  const routeCallPattern = /\b(?:app|router|route)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
  for (const match of source.matchAll(routeCallPattern)) {
    const routePath = match[2];
    if (!routePath || routePath.startsWith('/')) continue;
    candidates.push({
      id: `candidate-${sourceFile}-${routePath}`.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(0, 140),
      sourceFile,
      evidence: routePath,
      reason: 'Route-like call did not contain a concrete absolute path.',
      confidence: 'low',
    });
  }
  return candidates;
}

function dedupeEndpoints(endpoints: WhiteboxDiscoveredEndpoint[]): WhiteboxDiscoveredEndpoint[] {
  const seen = new Set<string>();
  const deduped: WhiteboxDiscoveredEndpoint[] = [];
  for (const endpoint of endpoints) {
    const key = `${endpoint.method ?? 'ANY'}:${endpoint.path}:${endpoint.kind ?? 'page'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(endpoint);
  }
  return deduped;
}

export async function discoverWhiteboxAttackSurface(input: WhiteboxAttackSurfaceInput): Promise<WhiteboxDiscoveredApp[]> {
  const sourceFiles = await collectSourceFiles(input.cwd, input.maxFiles);
  const pages: WhiteboxDiscoveredEndpoint[] = [];
  const apiEndpoints: WhiteboxDiscoveredEndpoint[] = [];
  const candidates: WhiteboxCatalogCandidate[] = [];

  for (const filePath of sourceFiles) {
    const relative = path.relative(input.cwd, filePath).replace(/\\/g, '/');
    const fileRoute = routeFromFile(input.cwd, filePath);
    let source = '';
    try {
      source = await readFile(filePath, 'utf-8');
    } catch {
      continue;
    }
    const sourceFingerprint = fingerprintSource(source);
    const frameworkProfile = frameworkProfileFromSourceFile(relative);

    if (fileRoute) {
      const routeMethods = fileRoute.path.startsWith('/api/') ? methodsFromRouteFile(source) : [];
      const targets = routeMethods.length
        ? routeMethods.map(method => endpoint(fileRoute.path, relative, {
            method,
            kind: fileRoute.kind,
            evidence: fileRoute.evidence,
            sourceFingerprint,
            frameworkProfile,
            confidence: 'high',
          }))
        : [
            {
              ...fileRoute,
              sourceFingerprint,
              frameworkProfile,
              confidence: 'high' as const,
            },
          ];
      for (const target of targets) {
        if (target.kind === 'api') apiEndpoints.push(target);
        else pages.push(target);
      }
    }

    for (const discovered of routesFromSource(source, relative)) {
      if (discovered.kind === 'api') apiEndpoints.push(discovered);
      else pages.push(discovered);
    }
    candidates.push(...candidatesFromSource(source, relative));
  }

  return [
    {
      name: path.basename(input.cwd) || 'app',
      type: 'source-scan',
      location: input.cwd,
      pages: dedupeEndpoints(pages),
      apiEndpoints: dedupeEndpoints(apiEndpoints),
      candidates,
    },
  ];
}

export function buildWhiteboxCatalog(input: {
  cwd: string;
  apps: WhiteboxDiscoveredApp[];
  previous?: WhiteboxCatalog;
  candidates?: WhiteboxCatalogCandidate[];
  now?: () => Date;
}): WhiteboxCatalog {
  const appId = path.basename(input.cwd) || 'app';
  const previousById = new Map(input.previous?.endpoints.map(endpoint => [endpoint.id, endpoint]) ?? []);
  const endpoints: WhiteboxCatalogEndpoint[] = [];
  const routeSources = new Set<string>();
  const frameworkProfiles = new Set<string>();

  for (const app of input.apps) {
    for (const endpoint of [...app.pages, ...app.apiEndpoints]) {
      const id = whiteboxCatalogEndpointId({
        appId,
        path: endpoint.path,
        method: endpoint.method,
        sourceFile: endpoint.sourceFile,
      });
      if (endpoint.sourceFile) routeSources.add(endpoint.sourceFile);
      if (endpoint.frameworkProfile) frameworkProfiles.add(endpoint.frameworkProfile);
      const previous = previousById.get(id);
      endpoints.push({
        id,
        appId,
        path: endpoint.path,
        methods: endpoint.method ? [endpoint.method] : undefined,
        kind: endpoint.kind,
        handler: endpoint.sourceFile ? { file: endpoint.sourceFile } : undefined,
        frameworkProfile: endpoint.frameworkProfile,
        authHints: endpoint.authRequired ? ['auth-required'] : undefined,
        parameters: endpoint.parameters,
        pentestObjectives: endpoint.pentestObjectives ?? inferTargetObjectives({
          target: endpoint.path,
          method: endpoint.method,
          kind: endpoint.kind,
          businessContext: endpoint.businessContext,
          authRequired: endpoint.authRequired,
          parameters: endpoint.parameters,
        }),
        sourceEvidence: endpoint.evidence ?? [],
        sourceFingerprint: endpoint.sourceFingerprint,
        confidence: endpoint.confidence ?? 'medium',
        reused: Boolean(previous && previous.sourceFingerprint === endpoint.sourceFingerprint),
      });
      endpoint.catalogEndpointId = id;
    }
  }

  const currentIds = new Set(endpoints.map(endpoint => endpoint.id));
  for (const previous of input.previous?.endpoints ?? []) {
    if (currentIds.has(previous.id)) continue;
    endpoints.push({ ...previous, stale: true, reused: false });
  }

  const generatedTargetIds = endpoints.filter(endpoint => !endpoint.stale && endpoint.confidence !== 'low').map(endpoint => endpoint.id);
  return {
    schemaVersion: WHITEBOX_CATALOG_SCHEMA_VERSION,
    generatedAt: (input.now ?? (() => new Date()))().toISOString(),
    rootPath: input.cwd,
    apps: [
      {
        id: appId,
        name: input.apps[0]?.name ?? appId,
        rootPath: input.cwd,
        frameworkProfiles: [...frameworkProfiles],
        routeSources: [...routeSources],
        generatedTargetIds,
      },
    ],
    endpoints,
    candidates: input.candidates ?? input.apps.flatMap(app => app.candidates ?? []),
  };
}

export async function runWhiteboxAttackSurfaceWorkflow(
  input: WhiteboxAttackSurfaceInput,
): Promise<WhiteboxAttackSurfaceResult> {
  const apps = input.apps ?? (await discoverWhiteboxAttackSurface(input));
  let catalog: WhiteboxCatalog | undefined;
  let catalogPath: string | undefined;
  if (input.artifactDir) {
    const store = new WhiteboxCatalogStore(input.artifactDir);
    const previous = input.incremental ? await store.read() : undefined;
    catalog = buildWhiteboxCatalog({
      cwd: input.cwd,
      apps,
      previous,
    });
    catalogPath = (await store.write(catalog)).filePath;
  }
  return {
    source: 'whitebox',
    cwd: input.cwd,
    apps,
    catalog,
    catalogPath,
  };
}
