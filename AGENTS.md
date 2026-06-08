# Repository Guidelines

## Project Structure & Module Organization

This is a TypeScript ESM CLI/TUI project. Main source lives in `src/`.

- `src/main.ts`, `src/index.ts`: CLI entry and harness setup.
- `src/tui/`: interactive terminal UI, commands, components, state.
- `src/agents/`: prompts, model routing, dynamic tools, workspace setup, subagents.
- `src/tools/`: model-facing tools; tests live in `src/tools/__tests__/`.
- `src/security/`: pentest context, findings, reports, and shared helpers.
- `src/skills/`: built-in skills and workflows. Skill folders must contain `SKILL.md`.
- `src/auth/`, `src/mcp/`, `src/hooks/`, `src/lsp/`: provider auth, MCP, hooks, and language server support.

Project docs include `README.md`, `README.en.md`, `CONTRIBUTING.md`, `DEVELOPMENT.md`, and `SECURITY.md`.

## Build, Test, and Development Commands

- `pnpm install`: install dependencies.
- `pnpm cli`: run the CLI from source with `tsx src/main.ts`.
- `pnpm check`: run TypeScript type checking.
- `pnpm test`: run Vitest in watch mode.
- `pnpm test:run`: run the full Vitest suite once.
- `pnpm vitest run <path>`: run focused tests, for example `pnpm vitest run src/tools/__tests__/jwt-analyze.test.ts`.
- `pnpm lint`: run ESLint.
- `pnpm build`: build with `tsup` and copy built-in skills.
- `pnpm pack:check`: dry-run npm packaging.

## Coding Style & Naming Conventions

Use TypeScript, ESM imports, and existing local patterns. Keep modules focused and avoid unrelated refactors. Tool files use kebab-case filenames such as `jwt-analyze.ts`, while tool IDs use snake_case such as `jwt_analyze`. Define tool input schemas with Zod near the tool. Prefer ASCII unless editing a file that already uses non-ASCII content.

## Testing Guidelines

Vitest is the test framework. Place tests beside the owning area in `__tests__` directories and name files `*.test.ts`. Run the narrowest relevant test during development, then broaden with `pnpm check` and `pnpm test:run` before a PR. For tools, update `src/agents/__tests__/tools.test.ts` when registration or mode exposure changes.

## Commit & Pull Request Guidelines

Recent history uses short imperative subjects, sometimes Conventional Commit prefixes: `fix: detect prerelease npm updates`, `chore: publish under mingyilab npm scope`, `feat: add pentest mode and rebrand cli`. Keep commits focused.

PRs should include what changed, why, tests run, and security implications. Update docs for user-facing behavior, public APIs, workflow changes, or contributor process changes.

## AI Coding Change Notes

本规范用于 AI 提交代码、Code Review 修复、MR/PR 描述和自动化审查记录。目标是把 AI 生成的自然语言变更描述沉淀为可审查、可追踪、可自动处理的标准记录。

Every AI-authored change note must include:

- `Summary`: 1-3 bullets describing the user-visible or maintainer-visible change.
- `Reason`: why the change was needed; reference the bug, review comment, issue, or requirement.
- `Scope`: touched areas such as `src/tui/`, `src/tools/`, `README.md`, or tests.
- `Validation`: exact commands run, for example `pnpm vitest run src/tui/components/__tests__/banner.test.ts`.
- `Risk`: compatibility, security, migration, or behavior risks; write `None identified` only after checking.

Use concise, factual language. Do not hide failed checks; record them with the failure reason. For review fixes, mention the reviewer concern and the concrete correction. For PR descriptions, keep the same field names so automation can parse them.

Example:

```md
Summary:
- Fix default banner branding for Mingyi Atlas.

Reason:
- Default app name was incorrectly routed to legacy Mastra Code art.

Scope:
- src/tui/components/banner.ts
- src/tui/components/__tests__/banner.test.ts

Validation:
- pnpm vitest run src/tui/components/__tests__/banner.test.ts
- pnpm exec tsc --noEmit --pretty false

Risk:
- None identified.
```

## Security & Configuration Tips

Do not commit secrets, API keys, private target data, screenshots from private systems, or pentest artifacts. Security tools must be safe by default: scope-gate network requests, use timeouts, bound output, and avoid destructive behavior, brute force, credential theft, persistence, and denial-of-service logic.
