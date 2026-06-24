# Workflows

Mingyi Atlas uses `workflow` in two different ways:

- **Workflow skills** are Markdown instructions discovered through `skill_search` and `skill`.
- **Runtime workflows** are typed execution graphs under `src/workflow/`.

They are related, but not the same thing.

## Workflow Skills

Workflow skills guide how the agent should behave across multiple steps:

- when to use the workflow;
- which phase comes next;
- when to delegate;
- what evidence to collect;
- when to stop or ask for confirmation.

They are advisory and model-driven. The agent still chooses them.

Skill authoring and repository conventions are documented in [skills.md](skills.md).

## Runtime Workflows

Runtime workflows are code-driven orchestration paths for repeatable execution.

Current pentest workflow code lives under:

```text
src/workflow/pentest/
```

The workflow exposes:

- typed input, state, and output schemas;
- persisted resume state;
- stage history;
- report and metrics writing;
- adapter boundaries for discovery, swarm execution, and reporting.

The model-facing entry point is:

```text
run_pentest_workflow
```

## Current State

The project currently has a dual orchestration model:

- the interactive pentest prompt still owns the live agent workflow;
- the runtime pentest workflow exists as a structured execution layer;
- the tool path is pentest-mode only and currently fails closed when bridge capabilities are missing.

That makes the workflow useful, but not yet a full replacement for agent-led pentest sessions.

## Benefits

- deterministic phase ordering;
- resumable workflow state;
- clearer reporting and metrics boundaries;
- easier testing and replay;
- better fit for batch runs, benchmark tasks, and future API/CI execution.

## Trade-offs

- orchestration logic is split across prompt, skills, and workflow code;
- a blocked or placeholder workflow can create user-facing dead ends;
- prompt/workflow drift is easy if stage definitions diverge;
- more state and schema code increases maintenance overhead.

## When To Use

Use runtime workflows when you want:

- a structured pentest pipeline;
- resumable execution;
- explicit stage history;
- predictable report generation.

Prefer the interactive pentest agent when you need:

- open-ended exploration;
- flexible target reasoning;
- ad hoc tool choice;
- human-in-the-loop steering.
