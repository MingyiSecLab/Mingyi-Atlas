import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AttackSurfaceKind, AttackSurfaceParameter } from './attackSurface.js';

export const WHITEBOX_CATALOG_SCHEMA_VERSION = 1;

export interface WhiteboxCatalogApp {
  id: string;
  name: string;
  rootPath: string;
  frameworkProfiles: string[];
  routeSources: string[];
  generatedTargetIds: string[];
}

export interface WhiteboxCatalogEndpoint {
  id: string;
  appId: string;
  path: string;
  methods?: string[];
  kind?: AttackSurfaceKind;
  handler?: {
    file: string;
    line?: number;
  };
  frameworkProfile?: string;
  authHints?: string[];
  parameters?: AttackSurfaceParameter[];
  pentestObjectives: string[];
  sourceEvidence: string[];
  sourceFingerprint?: string;
  confidence: 'high' | 'medium' | 'low';
  stale?: boolean;
  reused?: boolean;
}

export interface WhiteboxCatalogCandidate {
  id: string;
  sourceFile: string;
  evidence: string;
  reason: string;
  confidence: 'low';
  stale?: boolean;
}

export interface WhiteboxCatalog {
  schemaVersion: typeof WHITEBOX_CATALOG_SCHEMA_VERSION;
  generatedAt: string;
  rootPath: string;
  apps: WhiteboxCatalogApp[];
  endpoints: WhiteboxCatalogEndpoint[];
  candidates: WhiteboxCatalogCandidate[];
}

export function whiteboxCatalogEndpointId(input: {
  appId: string;
  path: string;
  method?: string;
  sourceFile?: string;
}): string {
  return [
    'wb',
    input.appId,
    input.method ?? 'ANY',
    input.path,
    input.sourceFile,
  ]
    .filter(Boolean)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);
}

export function validateWhiteboxCatalog(value: unknown): WhiteboxCatalog | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== WHITEBOX_CATALOG_SCHEMA_VERSION) return undefined;
  if (typeof record.generatedAt !== 'string' || typeof record.rootPath !== 'string') return undefined;
  if (!Array.isArray(record.apps) || !Array.isArray(record.endpoints) || !Array.isArray(record.candidates)) return undefined;
  return value as WhiteboxCatalog;
}

export class WhiteboxCatalogStore {
  readonly whiteboxDir: string;
  readonly catalogPath: string;

  constructor(readonly artifactDir: string) {
    this.whiteboxDir = path.join(artifactDir, 'whitebox');
    this.catalogPath = path.join(this.whiteboxDir, 'catalog.json');
  }

  async read(): Promise<WhiteboxCatalog | undefined> {
    try {
      return validateWhiteboxCatalog(JSON.parse(await readFile(this.catalogPath, 'utf-8')) as unknown);
    } catch {
      return undefined;
    }
  }

  async write(catalog: WhiteboxCatalog): Promise<{ catalog: WhiteboxCatalog; filePath: string }> {
    await mkdir(this.whiteboxDir, { recursive: true });
    await writeFile(this.catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf-8');
    return { catalog, filePath: this.catalogPath };
  }
}
