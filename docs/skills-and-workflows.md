# Skills and Workflows

Mingyi Atlas uses skills as model-readable operating guidance. Skills are not TypeScript tools. They are Markdown instructions that the agent can discover, activate, and read when they match the task.

## Skill Locations

Skill paths are built in `src/agents/workspace.ts`.

Supported locations include:

- Project-local `.mingyi-atlas/skills`
- Project-local `.claude/skills`
- Project-local `.agents/skills`
- Global `~/.mingyi-atlas/skills`
- Global `~/.claude/skills`
- Global `~/.agents/skills`
- Built-in `src/skills`, only included for pentest mode

## Skill Directory Rules

Built-in skill directories must contain `SKILL.md`.

```text
src/skills/standard/example/SKILL.md
```

Rules:

- `SKILL.md` frontmatter `name` must match the directory name.
- Skill names must be globally unique.
- Use `description` and `metadata.when_to_use` to make discovery reliable.
- Put long supporting material in `references/`.
- Avoid hard-coded local-machine paths.

Run:

```bash
pnpm vitest run src/agents/__tests__/builtin-skills.test.ts
```

## Workflow Skills

Workflow skills guide multi-step behavior. They should explain:

- When to use the workflow.
- The role and responsibilities of the agent.
- Required startup checks.
- Phase ordering.
- Delegation or subagent handoff rules.
- Evidence and reporting requirements.
- Stop conditions and user-confirmation gates.

Workflow skills should not assume they are always active. The model chooses them through `skill_search` and `skill`.

## Atlas Workflow

The Atlas workflow lives under:

```text
src/skills/standard/atlas/
```

The root entry is:

```text
src/skills/standard/atlas/SKILL.md
```

Supporting skills include engagement startup, lifecycle, orchestration, kill-chain analysis, and final reporting.

Pentest mode can select Atlas for Atlas-style red-team engagements. It does not force Atlas for every security task. Benchmark, CTF, and flag-capture tasks prioritize the benchmark workflow; ordinary scoped assessments select the workflow or methodology skill that matches the stage.

## Skill Search Gate

Pentest mode requires `skill_search` before direct skill activation. This avoids guessing skill names without checking available guidance.

The gate is implemented in:

```text
src/agents/processors/pentest-skill-search-gate.ts
```

## Adding a Built-In Skill

1. Create a directory under `src/skills`.
2. Add `SKILL.md` with frontmatter.
3. Ensure the `name` matches the directory name.
4. Add references only when needed.
5. Run built-in skill tests.
6. Update README or docs when the skill changes user-facing behavior.

Useful tests:

```bash
pnpm vitest run src/agents/__tests__/builtin-skills.test.ts
pnpm vitest run src/agents/__tests__/build-skill-paths.test.ts
pnpm vitest run src/agents/__tests__/prompts.test.ts
```
