# Security Domain Layer

`src/security` is the domain logic layer for Mingyi Atlas's security assessment workflows. It owns data models, persistence helpers, deduplication logic, and report builders. It does not contain agent prompts, subagent definitions, UI components, or tool wrapper code.

## Dependency Direction

```text
Allowed:
  src/tools/*       → src/security/*    (expose domain operations as agent-callable tools)
  src/security/<w>/* → src/security/shared/*  (use shared helpers)
  src/security/*    → src/constants.ts, Node.js stdlib, zod

Not allowed:
  src/security/*    → src/tools/*
  src/security/*    → src/agents/*
  src/security/*    → prompt text, skill content, or TUI behavior
```

Agents access security domain state through tools (`src/tools/context.ts`, `src/tools/findings.ts`, `src/tools/report.ts`), not by importing `src/security` directly.

## Directory Layout

```text
src/security/
  pentest/          Penetration testing: scope, assets, endpoints, findings, retest queue, reports.
  redteam/          Placeholder: future red-team campaign state, attack paths, objectives, evidence.
  shared/           Shared primitives used across security workflows.
```

## Runtime Data

Runtime assessment data is stored under `.mingyi-atlas/`, not under `src/security`.

```text
.mingyi-atlas/pentest/targets/<target-slug>/
  context.json        Scope, assets, endpoints, and retest queue.
  findings.json       Structured findings with deduplication keys.
  http-responses/     HTTP response artifacts from tool runs.
  browser-runs/       Browser automation artifacts.
  tool-runs/          Generic tool output artifacts.
  reports/            Generated Markdown and JSON reports.
```

Future workflows follow the same shape:

```text
.mingyi-atlas/redteam/
.mingyi-atlas/easm/
.mingyi-atlas/blueteam/
```

---

## pentest Module

`src/security/pentest` provides the full data lifecycle for a penetration testing engagement.

### Paths

`src/security/pentest/paths.ts` provides path helpers:

- `getPentestTargetDir(projectRoot, configDir, targetSlug)` — resolves the target bucket directory.
- `DEFAULT_PENTEST_TARGET_SLUG` — the default target name when none is specified.

### Context (`context.ts`)

Manages scope, assets, endpoints, and the retest queue for a target.

#### Data Schema

**Scope item** — an authorized target boundary record:

```ts
{
  id: string;
  target: string;               // URL, host, CIDR, repository, or other identifier
  type: 'url' | 'host' | 'repository' | 'cidr' | 'other';
  notes?: string;
  createdAt: string;            // ISO 8601
  updatedAt: string;
}
```

**Asset** — a verified target-owned resource discovered during the assessment:

```ts
{
  id: string;
  type: 'host' | 'service' | 'url' | 'repository' | 'package' | 'cloud-resource';
  identifier: string;
  metadata?: Record<string, unknown>;
  source?: string;
  createdAt: string;
  updatedAt: string;
}
```

**Endpoint** — a verified route or API endpoint:

```ts
{
  id: string;
  method?: string;              // Normalized to uppercase, e.g. GET, POST
  path: string;
  authRequired?: boolean;
  role?: string;
  source?: string;
  assetId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
```

**Retest item** — a pending or completed retest task:

```ts
{
  id: string;
  findingId?: string;
  title: string;
  steps: string;
  status: 'pending' | 'in_progress' | 'passed' | 'failed' | 'blocked';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
```

#### Deduplication

- Scope items deduplicate on normalized `target` (trimmed, lowercased).
- Assets deduplicate on `type + normalized identifier`.
- Endpoints deduplicate on `normalized method + normalized path + normalized source`.
- Retest items deduplicate on `findingId` if present, otherwise `normalized title + normalized steps`.

#### Write Safety

All mutating operations have a `*Queued` variant that serializes concurrent writes through `withSecurityFileQueue`. Use the queued variants whenever multiple tool calls may write to the same file concurrently (e.g., during parallel subagent runs).

```ts
recordPentestScopeQueued(filePath, input)
recordPentestAssetQueued(filePath, input)
recordPentestEndpointQueued(filePath, input)
addPentestRetestItemQueued(filePath, input)
updatePentestRetestItemQueued(filePath, input)
```

#### Key Functions

| Function | Description |
| --- | --- |
| `readPentestContext(filePath)` | Read and validate context from disk; returns empty context if file does not exist |
| `writePentestContext(filePath, data)` | Atomic write via tmp-file rename |
| `recordPentestScope(filePath, input)` | Add a scope item; returns `{item, duplicate}` |
| `recordPentestAsset(filePath, input)` | Add an asset; returns `{item, duplicate}` |
| `recordPentestEndpoint(filePath, input)` | Add an endpoint; returns `{item, duplicate}` |
| `addPentestRetestItem(filePath, input)` | Add a retest item; returns `{item, duplicate}` |
| `updatePentestRetestItem(filePath, input)` | Update retest item status and notes by ID |
| `listPentestScope(filePath)` | Return all scope items |
| `listPentestAssets(filePath, {type?})` | Return assets, optionally filtered by type |
| `listPentestEndpoints(filePath, {method?, authRequired?})` | Return endpoints with optional filters |
| `listPentestRetestQueue(filePath, {status?})` | Return retest items with optional status filter |

---

### Findings (`findings.ts`)

Manages structured vulnerability findings with deduplication, validation status tracking, and atomic updates.

#### Finding Schema

```ts
{
  id: string;
  dedupeKey: string;              // Computed; used to prevent duplicates
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  category?: string;
  cweId?: string;                 // e.g. "CWE-89"
  file?: string;                  // Source file path for whitebox findings
  lineStart?: number;
  lineEnd?: number;
  endpoint?: string;              // URL path or API route
  attackVector?: 'path_parameter' | 'query_param' | 'request_body' | 'header' | 'cookie' | 'file' | 'config' | 'other';
  evidence: string;               // Required; must be actual observed output
  stepsToReproduce?: string;
  businessImpact?: string;
  recommendation: string;
  validationStatus: 'candidate' | 'validated' | 'needs-review' | 'false-positive';
  status: 'open' | 'fixed' | 'ignored';
  createdAt: string;
  updatedAt: string;
}
```

#### Deduplication Key (`dedupeKey`)

The deduplication key is computed from the finding input using a priority chain:

1. `endpoint:<endpoint>:<attackVector>` — when both endpoint and attack vector are present.
2. `file:<file>:<lineStart>:<category>` — when file, lineStart, and category are all present.
3. `evidence:<asset>:<category>:<sha256(evidence)[0:16]>` — fallback using a hash of the evidence.

If an `update_finding` call would produce a `dedupeKey` collision with a different existing finding, the update is rejected with an error.

#### Key Functions

| Function | Description |
| --- | --- |
| `readPentestFindings(filePath)` | Read and validate findings file; returns empty file if not found |
| `writePentestFindings(filePath, data)` | Atomic write via tmp-file rename |
| `reportPentestFinding(filePath, input)` | Add a finding; returns `{finding, duplicate}` |
| `reportPentestFindingQueued(filePath, input)` | Queued variant for concurrent subagent writes |
| `listPentestFindings(filePath, {severity?, validationStatus?, status?})` | Filtered finding list |
| `getPentestFinding(filePath, id)` | Get a single finding by ID |
| `updatePentestFinding(filePath, input)` | Partial update by ID; recomputes dedupeKey |
| `updatePentestFindingQueued(filePath, input)` | Queued variant |
| `getPentestFindingDedupeKey(input)` | Compute the deduplication key for an input |

---

### Report (`report.ts`)

Builds and writes final assessment reports from persisted context and findings.

#### Report Structure

```ts
{
  version: 1;
  title: string;
  generatedAt: string;          // ISO 8601
  summary: {
    scopeCount: number;
    assetCount: number;
    endpointCount: number;
    retestItemCount: number;
    findingCount: number;
    validatedFindingCount: number;
    candidateFindingCount: number;
    openFindingCount: number;
    severityCounts: { critical, high, medium, low, info };
  };
  scope: ScopeItem[];
  assets: Asset[];
  endpoints: Endpoint[];
  retestQueue: RetestItem[];
  findings: Finding[];          // Sorted by severity then validation status then title
}
```

#### Severity and Validation Sort Order

Findings in reports are sorted:

1. Severity: `critical → high → medium → low → info`
2. Validation: `validated → candidate → needs-review → false-positive`
3. Title: alphabetical

#### Output Formats

| Format | Extension | Notes |
| --- | --- | --- |
| `markdown` | `.md` | Human-readable with executive summary, tables, and per-finding sections |
| `json` | `.json` | Machine-readable structured data |
| `both` | `.md` + `.json` | Both formats in the same report run |

#### Output Location

Reports are written to:

```text
.mingyi-atlas/pentest/targets/<target-slug>/reports/<outputBaseName>.<ext>
```

`outputBaseName` defaults to `pentest-report-<timestamp>` and may only contain letters, numbers, dots, underscores, and dashes.

#### Key Functions

| Function | Description |
| --- | --- |
| `buildPentestReport(input)` | Build the in-memory report object from context and findings |
| `renderPentestReportMarkdown(report)` | Render the Markdown string |
| `renderPentestReportJson(report)` | Render the JSON string |
| `writePentestReport(options)` | Build and write the report to disk; returns paths |
| `getPentestReportsDir(projectRoot, configDir, targetSlug)` | Resolve the reports directory path |

---

## shared Module

`src/security/shared` provides primitives shared across security workflows.

### File Lock (`file-lock.ts`)

`withSecurityFileQueue(filePath, fn)` serializes concurrent async writes to a shared JSON file using an in-process queue keyed by absolute file path. It prevents write-write races when multiple subagents report findings or update context simultaneously.

Usage:

```ts
import { withSecurityFileQueue } from '../shared/file-lock.js';

const result = await withSecurityFileQueue(filePath, () => someWriteOperation(filePath));
```

The queue is in-process only. If multiple processes write to the same file concurrently, the atomic tmp-file rename in `write*` functions provides last-writer-wins safety, but the queue itself will not coordinate across process boundaries.

### Browser Container (`browser-container.ts`)

Provides task-scoped browser runner container lifecycle helpers and stale-container cleanup for use by `run_browser_cli` and related tools.

---

## Adding a New Security Workflow

If a new workflow area (e.g., `easm`, `blueteam`, `redteam`) needs persistent state:

1. Create `src/security/<workflow>/` with `context.ts`, `findings.ts`, and `paths.ts` following the pentest module pattern.
2. Place shared helpers in `src/security/shared/` rather than duplicating them per workflow.
3. Expose workflow operations as tool factories in `src/tools/`.
4. Register tools in `src/agents/tools.ts` under the appropriate mode guard.
5. Store runtime data under `.mingyi-atlas/<workflow>/` not under `src/security/`.
6. Add tests under `src/tools/__tests__/` and `src/security/<workflow>/__tests__/`.
