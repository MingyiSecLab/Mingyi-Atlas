# Contributing to Mingyi Atlas

Thanks for contributing. This project is a coding and authorized security-assessment agent, so changes must be practical, testable, and careful about safety boundaries.

## Before You Start

- Open an issue for large features, behavior changes, new security tools, or workflow changes.
- Keep pull requests focused. Avoid mixing refactors, formatting churn, and feature work.
- Do not commit secrets, API keys, real customer data, target data, screenshots from private systems, or pentest artifacts.
- Do not add destructive security behavior, brute force, credential theft, persistence, malware behavior, denial-of-service logic, or unauthenticated exploitation flows.

## Development Setup

```bash
pnpm install
pnpm cli
```

Run checks before opening a PR:

```bash
pnpm check
pnpm vitest run <changed-area-tests>
```

For publish-sensitive changes, also run:

```bash
pnpm build
pnpm pack:check
```

## Pull Request Requirements

Every PR should include:

- A concise description of what changed and why.
- Tests for new behavior or a clear note explaining why tests are not applicable.
- Any security implications, especially for pentest mode, tools, browser/container execution, MCP, permissions, or authentication.
- Documentation updates when user-facing behavior, contributor workflow, or public APIs change.

## Code Style

- Follow existing local patterns before introducing new abstractions.
- Use TypeScript and Zod schemas for tool inputs.
- Keep files ASCII unless the existing file already uses non-ASCII content.
- Prefer small, focused modules over large catch-all files.
- Avoid unrelated metadata churn.

## Tool Contributions

Tools live in `src/tools`.

- Use one file per tool, for example `src/tools/jwt-analyze.ts`.
- Use snake_case tool IDs, for example `jwt_analyze`.
- Shared implementation details belong in focused helper files such as `src/tools/api-validation-utils.ts`.
- Export tools from `src/tools/index.ts`.
- Register dynamic tools in `src/agents/tools.ts`.
- Add tests under `src/tools/__tests__/`.

Security-sensitive tools must be safe by default:

- Scope-gate network requests.
- Set bounded timeouts.
- Limit output size.
- Prefer passive or read-only checks.
- Do not perform brute force, data dumping, persistence, credential theft, denial of service, or destructive state changes.

## Pentest Contributions

Pentest mode is for authorized testing only.

- New active validation tools should only be exposed in `modeId === 'pentest'`.
- Update `src/agents/prompts/pentest.ts` with usage rules and safety boundaries.
- Update specialized subagent tool groups in `src/agents/subagents/specialized/shared/toolProfiles.ts`.
- Give tools only to the subagents that need them. Attack-surface and analysis specialists should not receive active probe tools unless there is a clear reason.
- Add or update `src/agents/subagents/specialized/__tests__/index.test.ts` and `src/agents/__tests__/tools.test.ts`.

## Skill and Workflow Contributions

Built-in skills live under `src/skills`.

- Skill directories must contain `SKILL.md` to be indexed.
- Use globally unique skill names that match their directory names.
- Workflow skills should include clear `when_to_use` metadata.
- Supporting skills should not assume they are always loaded.
- Update tests when skill metadata, routing, or built-in skill discovery changes.

Useful tests:

```bash
pnpm vitest run src/agents/__tests__/builtin-skills.test.ts
pnpm vitest run src/agents/__tests__/build-skill-paths.test.ts
pnpm vitest run src/agents/__tests__/prompts.test.ts
```

## Reporting Security Issues

Do not open public issues for vulnerabilities in Mingyi Atlas or its dependencies when disclosure could put users at risk. Follow `SECURITY.md`.
