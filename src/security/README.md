# Security Domain Layer

`src/security` contains domain logic for security assessment workflows.

This layer owns data models, persistence helpers, report builders, and shared security-assessment primitives. It should not contain agent prompts, subagent definitions, UI components, or tool wrapper code.

## Layout

```text
src/security/
  pentest/    Penetration testing context, findings, retest queue, reports.
  redteam/    Future red-team campaign state, attack paths, objectives, evidence.
  easm/       Future external attack surface inventory, exposure records, risk history.
  blueteam/   Future detection, alert, response, control validation, and rule evidence.
  shared/     Future shared helpers used by multiple security workflows.
```

## Dependency Direction

Allowed:

- `src/tools/*` may depend on `src/security/*` to expose domain operations as agent-callable tools.
- `src/security/<workflow>/*` may depend on `src/security/shared/*`.
- `src/security/*` may depend on generic project utilities such as constants and standard library modules.

Avoid:

- `src/security/*` must not depend on `src/tools/*`.
- `src/security/*` must not depend on `src/agents/*`.
- `src/agents/*` should not directly depend on `src/security/*`; agents should go through tools unless there is a deliberate architecture change.
- `src/security/*` should not contain prompt text, skill content, or UI-specific behavior.

## Runtime Data

Runtime assessment data is stored under `.mingyi-atlas/<workflow>/`, not under `src/security`.

Examples:

```text
.mingyi-atlas/pentest/targets/<target>/context.json
.mingyi-atlas/pentest/targets/<target>/findings.json
.mingyi-atlas/pentest/targets/<target>/http-responses/
.mingyi-atlas/pentest/targets/<target>/browser-runs/
.mingyi-atlas/pentest/targets/<target>/tool-runs/
.mingyi-atlas/pentest/targets/<target>/reports/
```

Future workflows should follow the same runtime shape:

```text
.mingyi-atlas/redteam/
.mingyi-atlas/easm/
.mingyi-atlas/blueteam/
```

## Pentest Module

`src/security/pentest` currently provides:

- `context.ts` for scope, assets, endpoints, and retest queue records.
- `findings.ts` for structured findings, deduplication, validation status, and updates.
- `report.ts` for Markdown and JSON report generation.

## Shared Module

`src/security/shared` currently provides:

- `file-lock.ts` for queued writes to workflow JSON files.
- `browser-container.ts` for task-scoped browser runner container lifecycle helpers and stale-container cleanup.

If another workflow needs shared state helpers, place them under `src/security/shared/` instead of duplicating workflow-specific copies.
