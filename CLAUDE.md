# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Mingyi Atlas is a TypeScript/Node.js terminal AI agent for software engineering and authorized security assessment. It is published as `@mingyilab/mingyi-atlas` and exposes the `mingyi-atlas` CLI. The package is ESM-first, built with `tsup`, tested with Vitest, and requires Node.js `>=22.13.0`.

The product has two primary entry points:

- `src/main.ts` — executable CLI entry. Starts the interactive TUI by default, routes `--prompt`/`-p` and `--help` to headless mode, handles piped stdin, theme setup, analytics, cleanup, and fatal-error reporting.
- `src/index.ts` — programmatic factory. `createMingyiAtlas()` wires Mastra Harness, storage, auth, settings, model resolution, MCP, hooks, workspace, dynamic tools, subagents, observability, signals, and mode defaults.

## Common commands

```bash
pnpm install              # install dependencies
pnpm cli                  # run the CLI from source (tsx src/main.ts)
pnpm check                # TypeScript typecheck (tsc --noEmit)
pnpm lint                 # ESLint
pnpm test                 # Vitest watch mode
pnpm test:run             # run all unit tests once
pnpm build                # build dist/ with tsup and copy built-in skills
pnpm pack:check           # dry-run npm package contents
pnpm prepublishOnly       # check + publish-sensitive tests + build
```

Run a single test file or area with Vitest directly:

```bash
pnpm vitest run src/agents/__tests__/prompts.test.ts
pnpm vitest run src/tools/__tests__/httpRequest.test.ts
pnpm vitest run src/agents/subagents/specialized
```

Useful focused test targets from the project docs:

```bash
pnpm vitest run src/agents/__tests__/tools.test.ts
pnpm vitest run src/agents/__tests__/builtin-skills.test.ts
pnpm vitest run src/agents/__tests__/build-skill-paths.test.ts
pnpm vitest run src/agents/subagents/specialized
```

For local CLI smoke checks:

```bash
pnpm cli
pnpm cli -- --prompt "Summarize this repository" --timeout 300
pnpm cli -- --prompt "Start an authorized assessment of https://example.test" --mode pentest
```

## Architecture

### Modes and prompts

Mingyi Atlas behavior is mode-driven. The supported modes are `build`, `plan`, `fast`, and `pentest`.

- Mode prompt fragments live in `src/agents/prompts/`.
- `src/agents/prompts/index.ts` builds the full system prompt by combining base instructions, current task state, discovered `CLAUDE.md`/`AGENTS.md` instruction files, model-specific guidance, tool guidance, and the selected mode prompt.
- Plan mode disables workspace write/edit tools in `src/agents/workspace.ts`.
- Pentest mode is the orchestrator for authorized security assessments and is the only mode that gets built-in pentest skills and pentest-specific dynamic tools.

### Harness assembly and state

`createMingyiAtlas()` in `src/index.ts` is the composition root. Most cross-cutting behavior should be wired there rather than directly in the TUI.

Important state types are in `src/schema.ts`. Thread state includes project metadata, selected models, thinking level, permissions, sandbox allowed paths, task list, active plan, browser settings, and pentest target fields.

Persistent user settings are managed in `src/onboarding/settings.ts`. They include onboarding completion, model packs/defaults, OM settings, preferences, storage backend, custom providers, browser automation, signal routing, LSP config, and cloud observability config.

### Workspace, tools, and permissions

Workspace-backed tools come from Mastra workspace and are configured in `src/agents/workspace.ts` with user-facing names from `src/tool-names.ts`. They cover filesystem, search, LSP, command execution, and process management. The workspace allows the project root, skill directories, temp directories, and user-approved sandbox paths.

Dynamic tools are registered in `src/agents/tools.ts`:

- Always-available dynamic tools include sandbox access requests and offline crypto/hash analysis.
- Web search is selected based on Tavily availability or provider-native tools for Anthropic/OpenAI models.
- MCP tools are merged when an MCP manager is active.
- Pentest-only tools are added only when `ctx?.modeId === 'pentest'`.
- Hook wrappers run PreToolUse/PostToolUse hooks around dynamic tool execution.
- Tools denied by config are removed before the model sees them.

Tool implementations live under `src/tools/`; `src/tools/index.ts` exports them. Add one file per tool, export it from `src/tools/index.ts`, register it in `src/agents/tools.ts`, and add tests under `src/tools/__tests__/`.

### TUI and headless execution

The interactive UI is under `src/tui/` and centers on `src/tui/mastra-tui.ts`, which connects Harness events to pi-tui components, slash commands, overlays, onboarding, login/model selectors, goal mode, status line, update checks, shell passthrough, and message rendering.

Headless execution is implemented in `src/headless.ts`. It parses `mingyi-atlas --prompt` options, supports thread continuation/selection, JSON and stream-json output formats, mode/model/thinking overrides, timeout handling, and automation-friendly tool suspension handling.

### Models, auth, storage, and integrations

Model resolution lives in `src/agents/model.ts`. It supports Anthropic, OpenAI/Codex OAuth remapping, GitHub Copilot, Mastra gateway/model router, custom OpenAI-compatible providers, and selected provider-specific behavior. Auth storage is in `src/auth/` and is initialized by `createAuthStorage()`.

Storage and project/resource detection utilities live in `src/utils/`. Settings can select LibSQL or PostgreSQL storage. MCP support is in `src/mcp/`, hooks are in `src/hooks/`, LSP support is in `src/lsp/`, and observability is wired from `src/index.ts`.

### Skills and workflows

Skills are Markdown instructions, not TypeScript tools. Skill paths are built in `src/agents/workspace.ts` and can include project-local `.mingyi-atlas/skills`, `.claude/skills`, `.agents/skills`, global equivalents, and built-in `src/skills` entries. Built-in skills are included only in pentest mode.

Built-in skill directory rules:

- Every skill directory must contain `SKILL.md`.
- `SKILL.md` frontmatter `name` must match the directory name.
- Skill names must be globally unique.
- Use `description` and `metadata.when_to_use` for reliable discovery.
- Put lengthy supporting material in `references/`.

When changing skill discovery/routing, run:

```bash
pnpm vitest run src/agents/__tests__/builtin-skills.test.ts
pnpm vitest run src/agents/__tests__/build-skill-paths.test.ts
pnpm vitest run src/agents/__tests__/prompts.test.ts
```

### Pentest mode and security data

Pentest mode is for authorized testing only. Its prompt lives in `src/agents/prompts/pentest.ts`; persistent pentest state and report helpers live under `src/security/pentest/`; shared security helpers live under `src/security/shared/`.

Pentest runtime data is stored per target under:

```text
.mingyi-atlas/pentest/targets/<target-slug>/
  context.json
  findings.json
  http-responses/
  browser-runs/
  tool-runs/
  reports/
```

Do not commit pentest runtime artifacts unless they are sanitized fixtures.

Specialized pentest subagents live in `src/agents/subagents/specialized/` and are exported from `src/agents/subagents/specialized/index.ts`. Tool profiles live in `src/agents/subagents/specialized/shared/toolProfiles.ts`. The pentest prompt remains the orchestrator; specialists should receive only the tools required for their role. Report and remediation specialists should not receive active probe tools by default.

For new pentest tools or subagent tool changes, update:

```text
src/agents/prompts/pentest.ts
src/agents/subagents/specialized/shared/toolProfiles.ts
src/agents/subagents/specialized/<specialist>/index.ts
src/agents/subagents/specialized/<specialist>/prompt.ts
src/agents/subagents/specialized/__tests__/index.test.ts
src/agents/__tests__/tools.test.ts
```

Security-sensitive and network-capable tools should be scope-gated, bounded by timeouts/output limits, and safe by default. This project explicitly excludes destructive security behavior, brute force, credential theft, persistence, malware behavior, DoS logic, and unauthenticated exploitation flows.

## Build and package notes

`pnpm build` runs `tsup --config tsup.config.ts` and then `scripts/copy-builtin-skills.mjs`. The build emits ESM and CJS entries for `index`, `cli`, and `tui`, generates declarations, injects `MINGYI_ATLAS_VERSION` from `package.json`, and copies built-in skills into `dist/skills`.

Vitest is configured in `vitest.config.ts` to run `src/**/*.test.ts` in a Node environment with file parallelism disabled and `maxConcurrency: 1`. TypeScript includes `src/**/*` and `tsup.config.ts` but excludes `**/*.test.ts` from `pnpm check`.
