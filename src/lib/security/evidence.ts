import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

export type EvidenceKind =
  | 'http-request'
  | 'http-response'
  | 'browser-screenshot'
  | 'browser-dom'
  | 'code-reference'
  | 'command'
  | 'note';

export interface EvidenceBase {
  id?: string;
  kind: EvidenceKind;
  targetId: string;
  target: string;
  findingId?: string;
  title?: string;
  description?: string;
  createdAt?: string;
  redacted?: boolean;
  metadata?: Record<string, unknown>;
}

export interface HttpRequestEvidence extends EvidenceBase {
  kind: 'http-request';
  request: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    bodySnippet?: string;
  };
}

export interface HttpResponseEvidence extends EvidenceBase {
  kind: 'http-response';
  response: {
    status: number;
    statusText?: string;
    headers?: Record<string, string>;
    bodySnippet?: string;
    elapsedMs?: number;
  };
}

export interface BrowserScreenshotEvidence extends EvidenceBase {
  kind: 'browser-screenshot';
  screenshot: {
    path?: string;
    mimeType?: string;
    width?: number;
    height?: number;
  };
}

export interface BrowserDomEvidence extends EvidenceBase {
  kind: 'browser-dom';
  dom: {
    url: string;
    title?: string;
    snippet?: string;
    links?: string[];
    forms?: Array<{
      action?: string;
      method?: string;
      fields?: string[];
    }>;
  };
}

export interface CodeReferenceEvidence extends EvidenceBase {
  kind: 'code-reference';
  code: {
    file: string;
    startLine?: number;
    endLine?: number;
    snippet?: string;
  };
}

export interface CommandEvidence extends EvidenceBase {
  kind: 'command';
  command: {
    command: string;
    exitCode?: number;
    stdoutSnippet?: string;
    stderrSnippet?: string;
  };
}

export interface NoteEvidence extends EvidenceBase {
  kind: 'note';
  note: {
    text: string;
  };
}

export type EvidenceArtifact =
  | HttpRequestEvidence
  | HttpResponseEvidence
  | BrowserScreenshotEvidence
  | BrowserDomEvidence
  | CodeReferenceEvidence
  | CommandEvidence
  | NoteEvidence;

export interface EvidenceStoreOptions {
  now?: () => Date;
}

export function sanitizeEvidenceIdPart(value: string): string {
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
      .slice(0, 80) || 'evidence'
  );
}

export function createEvidenceId(evidence: EvidenceArtifact): string {
  const stablePayload = JSON.stringify({
    kind: evidence.kind,
    targetId: evidence.targetId,
    target: evidence.target,
    findingId: evidence.findingId,
    title: evidence.title,
    description: evidence.description,
    payload:
      evidence.kind === 'http-request'
        ? evidence.request
        : evidence.kind === 'http-response'
          ? evidence.response
          : evidence.kind === 'browser-screenshot'
            ? evidence.screenshot
            : evidence.kind === 'browser-dom'
              ? evidence.dom
              : evidence.kind === 'code-reference'
                ? evidence.code
                : evidence.kind === 'command'
                  ? evidence.command
                  : evidence.note,
  });
  const digest = createHash('sha256').update(stablePayload).digest('hex').slice(0, 12);
  return `ev-${sanitizeEvidenceIdPart(evidence.targetId)}-${sanitizeEvidenceIdPart(evidence.kind)}-${digest}`;
}

export function evidenceFileName(id: string): string {
  return `${sanitizeEvidenceIdPart(id)}.json`;
}

export class EvidenceStore {
  readonly evidenceDir: string;
  private readonly now: () => Date;

  constructor(readonly artifactDir: string, options: EvidenceStoreOptions = {}) {
    this.evidenceDir = path.join(artifactDir, 'evidence');
    this.now = options.now ?? (() => new Date());
  }

  async write(evidence: EvidenceArtifact): Promise<{ evidence: EvidenceArtifact; filePath: string }> {
    await mkdir(this.evidenceDir, { recursive: true });
    const completeEvidence: EvidenceArtifact = {
      ...evidence,
      id: evidence.id ?? createEvidenceId(evidence),
      createdAt: evidence.createdAt ?? this.now().toISOString(),
    } as EvidenceArtifact;
    const filePath = path.join(this.evidenceDir, evidenceFileName(completeEvidence.id!));
    await writeFile(filePath, `${JSON.stringify(completeEvidence, null, 2)}\n`, 'utf-8');
    return { evidence: completeEvidence, filePath };
  }

  async read(id: string): Promise<EvidenceArtifact | undefined> {
    try {
      return JSON.parse(await readFile(path.join(this.evidenceDir, evidenceFileName(id)), 'utf-8')) as EvidenceArtifact;
    } catch {
      return undefined;
    }
  }

  async list(): Promise<EvidenceArtifact[]> {
    let entries: string[];
    try {
      entries = await readdir(this.evidenceDir);
    } catch {
      return [];
    }

    const evidence: EvidenceArtifact[] = [];
    for (const entry of entries.sort()) {
      if (!entry.endsWith('.json')) continue;
      evidence.push(JSON.parse(await readFile(path.join(this.evidenceDir, entry), 'utf-8')) as EvidenceArtifact);
    }
    return evidence;
  }
}
