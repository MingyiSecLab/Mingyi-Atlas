# Development Guide

This document describes how to work on Mingyi Atlas locally.

## Requirements

- Node.js `>=22.13.0`
- pnpm
- Docker, optional for browser/container-backed pentest tooling
- `fd` or `fdfind`, optional for fast file autocomplete

## Setup

```bash
pnpm install
```

Run the CLI from source:

```bash
pnpm cli
```

Run one-off checks:

```bash
pnpm check
pnpm test:run
pnpm build
```

## Project Layout

```text
src/
  agents/          Agent prompts, dynamic tools, workspace setup, subagents
  auth/            Provider auth and local credential storage
  hooks/           PreToolUse/PostToolUse hook support
  lsp/             Language server integration
  mcp/             MCP configuration and manager
  security/        Pentest context, findings, reports, shared security helpers
  skills/          Built-in skills and workflows
  tools/           Dynamic tools exposed to the model
  tui/             Interactive terminal UI
```

## Modes

Mingyi Atlas supports `fast`, `plan`, `build`, and `pentest` modes.

- Mode prompts live in `src/agents/prompts/`.
- Workspace tools are configured in `src/tool-names.ts` and `src/agents/workspace.ts`.
- Dynamic tools are configured in `src/agents/tools.ts`.
- Built-in pentest skills are only added to skill paths in pentest mode.

## Adding a Tool

1. Create one file per tool in `src/tools`, for example:

   ```text
   src/tools/example-tool.ts
   ```

2. Use `createTool` from `@mastra/core/tools`.

3. Define a Zod input schema near the tool.

4. Export the tool from `src/tools/index.ts`.

5. Register it in `src/agents/tools.ts`.

6. Add tests under `src/tools/__tests__/`.

7. If the tool is user-facing, update README or docs.

For network-capable tools:

- Check scope before requests.
- Use explicit timeouts.
- Return structured errors.
- Keep response bodies bounded.
- Avoid redirects unless the behavior is intentional and documented.

For pentest-only tools:

- Expose the tool only when `ctx?.modeId === 'pentest'`.
- Add prompt guidance in `src/agents/prompts/pentest.ts`.
- Add subagent permissions in `src/agents/subagents/pentest/skill-tools.ts` when a specialist should use it.

Useful tests:

```bash
pnpm vitest run src/tools/__tests__/<tool-test>.test.ts
pnpm vitest run src/agents/__tests__/tools.test.ts
```

## Adding a Pentest Subagent Tool

Pentest subagent routing is intentionally narrower than the main pentest agent.

- Offline/API/auth helpers belong in `PENTEST_API_AUTH_TOOLS`.
- Active bounded validation helpers belong in `PENTEST_VULN_VALIDATION_TOOLS`.
- Report and remediation subagents should not receive active probe tools by default.

Update:

```text
src/agents/subagents/pentest/skill-tools.ts
src/agents/subagents/pentest/<subagent>.ts
src/agents/subagents/pentest/__tests__/index.test.ts
```

## Adding a Skill or Workflow

Built-in skills live under `src/skills`.

Rules:

- A skill directory must contain `SKILL.md`.
- The frontmatter `name` must match the directory name.
- Skill names must be globally unique.
- Use `metadata.when_to_use` for workflow and routing skills.
- Put supporting material in `references/` when it is too detailed for the main `SKILL.md`.

For a workflow skill:

```text
src/skills/standard/<workflow>/SKILL.md
src/skills/standard/<workflow>/<supporting-skill>/SKILL.md
```

Run:

```bash
pnpm vitest run src/agents/__tests__/builtin-skills.test.ts
pnpm vitest run src/agents/__tests__/build-skill-paths.test.ts
```

## Atlas Workflow

The Atlas workflow is a built-in pentest workflow under:

```text
src/skills/standard/atlas/
```

The root entry is `SKILL.md`, so `skill_search` can discover it. Supporting skills cover startup, lifecycle, orchestration, kill-chain analysis, and final reporting.

Pentest mode does not hard-code Atlas for every task. The agent chooses workflow skills based on the user goal and search results.

## Testing Guidance

Run the narrowest relevant tests while developing, then broaden before a PR.

Common test targets:

```bash
pnpm vitest run src/agents/__tests__/prompts.test.ts
pnpm vitest run src/agents/__tests__/tools.test.ts
pnpm vitest run src/agents/subagents/pentest/__tests__/index.test.ts
pnpm vitest run src/tools/__tests__/api-validation.test.ts
pnpm vitest run src/tools/__tests__/hash-crypto.test.ts
pnpm check
```

## Build and Package

```bash
pnpm build
pnpm pack:check
```

`pnpm build` runs `tsup` and copies built-in skills from `src/skills` to `dist/skills`.
