import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CvssScore } from './cvss.js';
import type { Severity } from './severity.js';

export interface SecurityFindingEvidence {
  kind: 'http' | 'browser' | 'command' | 'code' | 'note';
  description: string;
  location?: string;
}

export interface SecurityFinding {
  id: string;
  title: string;
  target: string;
  severity: Severity;
  description: string;
  evidence: SecurityFindingEvidence[];
  evidenceIds?: string[];
  reproduction?: string;
  remediation?: string;
  cvss?: CvssScore;
  rootCauseGroup?: string;
  confirmed: boolean;
}

export function isConfirmedFinding(finding: SecurityFinding): boolean {
  return finding.confirmed && finding.evidence.length > 0;
}

export function sanitizeFindingId(id: string): string {
  const sanitized = id
    .toLowerCase()
    .split(/[\\/]+/)
    .flatMap(part => part.split(/\.\.+/g))
    .map(part => part.replace(/[^a-z0-9._-]+/g, '-'))
    .filter(part => part && part !== '.')
    .join('-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return sanitized || 'finding';
}

export class FindingsRegistry {
  readonly findingsDir: string;

  constructor(readonly artifactDir: string) {
    this.findingsDir = path.join(artifactDir, 'findings');
  }

  async record(finding: SecurityFinding): Promise<string | undefined> {
    if (!isConfirmedFinding(finding)) return undefined;
    await mkdir(this.findingsDir, { recursive: true });
    const safeId = sanitizeFindingId(finding.id);
    const filePath = path.join(this.findingsDir, `${safeId}.json`);
    await writeFile(filePath, `${JSON.stringify({ ...finding, id: safeId }, null, 2)}\n`, 'utf-8');
    return filePath;
  }

  async recordMany(findings: SecurityFinding[]): Promise<string[]> {
    const paths: string[] = [];
    for (const finding of findings) {
      const filePath = await this.record(finding);
      if (filePath) paths.push(filePath);
    }
    return paths;
  }

  async list(): Promise<SecurityFinding[]> {
    let entries: string[];
    try {
      entries = await readdir(this.findingsDir);
    } catch {
      return [];
    }

    const findings: SecurityFinding[] = [];
    for (const entry of entries.sort()) {
      if (!entry.endsWith('.json')) continue;
      const fullPath = path.join(this.findingsDir, entry);
      const parsed = JSON.parse(await readFile(fullPath, 'utf-8')) as SecurityFinding;
      if (isConfirmedFinding(parsed)) findings.push(parsed);
    }
    return findings;
  }
}
