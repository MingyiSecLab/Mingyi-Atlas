import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { AttackSurfaceKind, AttackSurfaceParameter } from './attackSurface.js';
import { inferTargetObjectives } from './attackSurface.js';

export type AttackSurfaceAppType = 'web_application' | 'api' | 'full_stack' | 'database' | 'cloud_resource' | 'storage';
export type AttackSurfaceEndpointType = 'api-endpoint' | 'web-endpoint' | 'asset';
export type AttackSurfaceRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AttackSurfaceAppArtifact {
  id: string;
  appName: string;
  appType: AttackSurfaceAppType;
  description: string;
  domain?: string;
  framework?: string;
  technology?: string[];
  authentication?: string;
  notes?: string;
  discoveredAt: string;
  target?: string;
}

export interface AttackSurfaceEndpointArtifact {
  id: string;
  appName: string;
  routePath: string;
  endpointType: AttackSurfaceEndpointType;
  description: string;
  method?: string[];
  kind?: AttackSurfaceKind;
  handler?: string;
  file?: string;
  line?: number;
  authRequired?: boolean;
  authentication?: string;
  riskLevel?: AttackSurfaceRiskLevel;
  notes?: string;
  parameters?: AttackSurfaceParameter[];
  sourceEvidence?: string[];
  pentestObjectives: string[];
  discoveredAt: string;
  target?: string;
}

export interface AttackSurfaceReportTarget {
  target: string;
  objectives: string[];
  rationale: string;
  method?: string;
  kind?: AttackSurfaceKind;
  appName?: string;
  endpointId?: string;
}

export interface AttackSurfaceReportArtifact {
  summary: {
    totalAssets: number;
    totalDomains: number;
    analysisComplete: boolean;
  };
  discoveredAssets: string[];
  targets: AttackSurfaceReportTarget[];
  keyFindings: string[];
  generatedAt: string;
}

export interface DiscoveryValidationGap {
  gap: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  recommendation: string;
}

export interface DiscoveryValidationArtifact {
  complete: boolean;
  confidence: number;
  readyForReport: boolean;
  gaps: DiscoveryValidationGap[];
  summary: string;
}

export function sanitizeAttackSurfaceId(value: string): string {
  return (
    value
      .toLowerCase()
      .split(/[\\/]+/)
      .flatMap(part => part.split(/\.\.+/g))
      .map(part => part.replace(/[^a-z0-9._-]+/g, '-'))
      .filter(part => part && part !== '.')
      .join('-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100) || 'attack-surface'
  );
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 10);
}

export function createAppArtifactId(appName: string): string {
  return `app-${sanitizeAttackSurfaceId(appName)}-${digest(appName.toLowerCase())}`;
}

export function normalizeMethods(method?: string | string[]): string[] | undefined {
  if (!method) return undefined;
  const methods = Array.isArray(method) ? method : [method];
  const normalized = [...new Set(methods.map(item => item.toUpperCase()).filter(Boolean))];
  return normalized.length ? normalized : undefined;
}

export function validateRoutePath(routePath: string): { valid: true } | { valid: false; error: string } {
  if (routePath.startsWith('http://') || routePath.startsWith('https://')) {
    return {
      valid: false,
      error: `routePath "${routePath}" is a full URL. Document the base URL on the app and use a path such as "/api/users".`,
    };
  }
  if (!routePath.startsWith('/') && !routePath.startsWith('{') && !routePath.startsWith('arn:')) {
    return {
      valid: false,
      error: `routePath "${routePath}" must be a route path, access pattern, or resource identifier.`,
    };
  }
  return { valid: true };
}

export function createEndpointArtifactId(input: {
  appName: string;
  routePath: string;
  method?: string | string[];
}): string {
  const methods = normalizeMethods(input.method)?.join(',') ?? 'ANY';
  const stable = `${input.appName.toLowerCase()}|${input.routePath}|${methods}`;
  return `endpoint-${sanitizeAttackSurfaceId(input.appName)}-${sanitizeAttackSurfaceId(input.routePath)}-${digest(stable)}`;
}

export function buildEndpointObjectives(input: {
  routePath: string;
  method?: string[];
  kind?: AttackSurfaceKind;
  authRequired?: boolean;
  parameters?: AttackSurfaceParameter[];
  pentestObjectives?: string[];
  description?: string;
}): string[] {
  if (input.pentestObjectives?.length) return [...new Set(input.pentestObjectives)];
  return inferTargetObjectives({
    target: input.routePath,
    method: input.method?.[0],
    kind: input.kind,
    authRequired: input.authRequired,
    parameters: input.parameters,
    businessContext: input.description,
  });
}

export class AttackSurfaceArtifactStore {
  readonly attackSurfaceDir: string;
  readonly appsDir: string;
  readonly endpointsDir: string;
  readonly reportPath: string;

  constructor(readonly artifactDir: string, readonly now: () => Date = () => new Date()) {
    this.attackSurfaceDir = path.join(artifactDir, 'attack-surface');
    this.appsDir = path.join(this.attackSurfaceDir, 'apps');
    this.endpointsDir = path.join(this.attackSurfaceDir, 'endpoints');
    this.reportPath = path.join(this.attackSurfaceDir, 'attack-surface-results.json');
  }

  appPath(id: string): string {
    return path.join(this.appsDir, `${sanitizeAttackSurfaceId(id)}.json`);
  }

  endpointPath(id: string): string {
    return path.join(this.endpointsDir, `${sanitizeAttackSurfaceId(id)}.json`);
  }

  async writeApp(input: Omit<AttackSurfaceAppArtifact, 'id' | 'discoveredAt'> & Partial<Pick<AttackSurfaceAppArtifact, 'id' | 'discoveredAt'>>): Promise<{
    record: AttackSurfaceAppArtifact;
    filePath?: string;
    duplicate: boolean;
  }> {
    const record: AttackSurfaceAppArtifact = {
      ...input,
      id: input.id ?? createAppArtifactId(input.appName),
      discoveredAt: input.discoveredAt ?? this.now().toISOString(),
    };
    await mkdir(this.appsDir, { recursive: true });
    const filePath = this.appPath(record.id);
    const existing = await this.readJson<AttackSurfaceAppArtifact>(filePath);
    if (existing) return { record: existing, filePath, duplicate: true };
    await writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, 'utf-8');
    return { record, filePath, duplicate: false };
  }

  async writeEndpoint(input: Omit<AttackSurfaceEndpointArtifact, 'id' | 'discoveredAt' | 'pentestObjectives'> &
    Partial<Pick<AttackSurfaceEndpointArtifact, 'id' | 'discoveredAt' | 'pentestObjectives'>>): Promise<{
    record: AttackSurfaceEndpointArtifact;
    filePath?: string;
    duplicate: boolean;
  }> {
    const method = normalizeMethods(input.method);
    const record: AttackSurfaceEndpointArtifact = {
      ...input,
      method,
      id: input.id ?? createEndpointArtifactId({ appName: input.appName, routePath: input.routePath, method }),
      pentestObjectives: buildEndpointObjectives({
        routePath: input.routePath,
        method,
        kind: input.kind,
        authRequired: input.authRequired,
        parameters: input.parameters,
        pentestObjectives: input.pentestObjectives,
        description: input.description,
      }),
      discoveredAt: input.discoveredAt ?? this.now().toISOString(),
    };
    await mkdir(this.endpointsDir, { recursive: true });
    const filePath = this.endpointPath(record.id);
    const existing = await this.readJson<AttackSurfaceEndpointArtifact>(filePath);
    if (existing) return { record: existing, filePath, duplicate: true };
    await writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, 'utf-8');
    return { record, filePath, duplicate: false };
  }

  async writeReport(input: Omit<AttackSurfaceReportArtifact, 'generatedAt'> & Partial<Pick<AttackSurfaceReportArtifact, 'generatedAt'>>): Promise<{
    record: AttackSurfaceReportArtifact;
    filePath: string;
  }> {
    await mkdir(this.attackSurfaceDir, { recursive: true });
    const record: AttackSurfaceReportArtifact = {
      ...input,
      generatedAt: input.generatedAt ?? this.now().toISOString(),
    };
    await writeFile(this.reportPath, `${JSON.stringify(record, null, 2)}\n`, 'utf-8');
    return { record, filePath: this.reportPath };
  }

  async readReport(): Promise<AttackSurfaceReportArtifact | undefined> {
    return this.readJson<AttackSurfaceReportArtifact>(this.reportPath);
  }

  async listApps(): Promise<AttackSurfaceAppArtifact[]> {
    return this.listJson<AttackSurfaceAppArtifact>(this.appsDir);
  }

  async listEndpoints(): Promise<AttackSurfaceEndpointArtifact[]> {
    return this.listJson<AttackSurfaceEndpointArtifact>(this.endpointsDir);
  }

  private async readJson<T>(filePath: string): Promise<T | undefined> {
    try {
      return JSON.parse(await readFile(filePath, 'utf-8')) as T;
    } catch {
      return undefined;
    }
  }

  private async listJson<T>(dir: string): Promise<T[]> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return [];
    }
    const records: T[] = [];
    for (const entry of entries.sort()) {
      if (!entry.endsWith('.json')) continue;
      const record = await this.readJson<T>(path.join(dir, entry));
      if (record) records.push(record);
    }
    return records;
  }
}
