# Skills

This document explains how built-in skills work in Mingyi Atlas and how to add or maintain them safely.

## What A Skill Is

Skills are model-readable Markdown instructions. They are not TypeScript tools.

A skill usually does one of three things:

- provides domain operating guidance;
- routes the agent toward a method or specialist area;
- defines a workflow-style playbook for a multi-step task.

Skills are discovered through `skill_search`, activated through `skill`, and may reference supporting material that can be read later.

## Skill Locations

Built-in repository skills live under:

```text
src/skills/
```

Project-local and user-local skill directories are resolved by the workspace layer, but repository-maintained built-in skills should stay in `src/skills`.

## Required Structure

Each skill directory must contain a `SKILL.md` file.

Recommended layout:

```text
src/skills/standard/<skill-name>/SKILL.md
src/skills/standard/<skill-name>/references/*
```

Rules:

- the frontmatter `name` must match the directory name;
- skill names must be globally unique;
- keep the root `SKILL.md` concise enough for discovery and first read;
- move large examples, playbooks, or background material into `references/` when needed.

## Discovery Guidance

Skill discovery quality depends on frontmatter and naming.

Use:

- `description` for a short, concrete summary;
- `metadata.when_to_use` for search-oriented trigger phrases;
- precise directory names instead of vague buckets.

Good `when_to_use` values describe how a user or agent would naturally search:

- vulnerability names;
- protocol names;
- workflow names;
- common tooling terms;
- recognizable symptoms or artifacts.

## Workflow Skills

Workflow skills are still skills, not runtime workflows.

Use a workflow skill when you want to describe:

- when the workflow applies;
- the parent agent's responsibilities;
- phase ordering;
- delegation or handoff rules;
- evidence requirements;
- stop conditions and confirmation gates.

Recommended layout for a workflow-oriented skill:

```text
src/skills/standard/<workflow>/SKILL.md
src/skills/standard/<workflow>/<supporting-skill>/SKILL.md
```

Do not use a workflow skill as a substitute for runtime orchestration code. If the task needs persisted state, resumable execution, typed stage contracts, or workflow-owned reporting/metrics, it belongs under `src/workflow/`.

## Authoring Guidance

When writing or updating a skill:

- optimize for agent execution, not prose elegance;
- make responsibilities explicit;
- avoid ambiguous escalation rules;
- keep safety boundaries concrete;
- prefer short sections and stable headings;
- reference related skills only when the routing is actually useful.

Good skills tell the agent what to do next. Weak skills only describe a topic.

## Update Checklist

When adding a new built-in skill:

1. Create the skill directory under `src/skills`.
2. Add `SKILL.md` with valid frontmatter.
3. Ensure `name` matches the directory.
4. Add `metadata.when_to_use` when discovery matters.
5. Add `references/` only when the main file would otherwise become too large.
6. Update docs if the skill changes user-visible behavior or the recommended workflow.

## Validation

Useful checks:

```bash
pnpm vitest run src/agents/__tests__/builtin-skills.test.ts
pnpm vitest run src/agents/__tests__/build-skill-paths.test.ts
pnpm vitest run src/agents/__tests__/prompts.test.ts
```

If the change affects mode exposure or agent routing, also run the narrowest relevant prompt or tools tests.
