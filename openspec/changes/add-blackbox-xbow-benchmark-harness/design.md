## Context

Atlas already has an attack-surface-driven pentest workflow with blackbox and whitebox modes. `runPentestWorkflow` selects whitebox mode when `cwd` is supplied and blackbox mode when only a target is supplied. A completed OpenSpec change, `connect-pentest-workflow-to-harness-subagent-swarm`, connected `run_pentest_workflow` to real harness-backed `pentest` subagents when a Mastra harness context is available.

XBOW-style benchmark suites are containerized CTF targets. The benchmark harness needs access to benchmark metadata, Docker Compose files, and expected results so it can start targets and grade runs. The Atlas agent must not receive source code, expected results, or answer material during the run. The benchmark must therefore separate "harness reads the suite" from "agent attacks the exposed target URL".

The two reference implementations point to the same blackbox shape:

- Apex starts a benchmark container, passes `targetUrl` into its pentest workflow, then compares artifacts with expected results.
- Decepticon loads XBOW challenge metadata, starts each challenge container, injects target URL/tags/flag format, and scores captured flags.

## Goals / Non-Goals

**Goals:**

- Add a blackbox-only XBOW benchmark harness for Atlas.
- Reuse existing Atlas agent, skills, pentest subagent swarm, PoC/spray evidence capture, finding judge/scorer, and `runPentestWorkflow`.
- Support local XBOW-style benchmark suites with case filtering by id, tag, level, and range.
- Start each benchmark target through Docker Compose, resolve the exposed target URL, health-check it, and clean it up after evaluation.
- Evaluate benchmark results using captured flags, artifacts, findings, and expected findings where available.
- Write per-case evidence and aggregate JSON/Markdown reports.
- Preserve compatibility with both Mastra harness-backed execution and headless/CI execution.

**Non-Goals:**

- No whitebox benchmark mode in this change.
- No source-code analysis as part of benchmark execution.
- No exposure of benchmark repository paths, expected results, or answer data to the agent.
- No automatic modification of benchmark source repositories.
- No training, reinforcement learning, or benchmark-driven prompt mutation loop.
- No attempt to support every benchmark provider in v1; XBOW-style Docker Compose suites are the first target.

## Decisions

### Decision 1: Implement a dedicated benchmark runner outside `runPentestWorkflow`

The benchmark runner owns case loading, environment lifecycle, evaluation, and reporting. It calls `runPentestWorkflow` only for the agent execution phase.

Alternative considered: embed benchmark lifecycle directly inside `runPentestWorkflow`. That would mix product workflow execution with benchmark-specific setup, grading, and cleanup. Keeping the runner separate preserves the workflow as a reusable pentest primitive.

### Decision 2: Enforce blackbox mode by construction

The runner MUST call `runPentestWorkflow` without `cwd`. It may pass `target`, `outcomeMode`, `artifactDir`, auth context, injected worker runners, and precomputed blackbox targets, but it MUST NOT pass benchmark repo paths or source directories.

Alternative considered: allow an option to run whitebox when source is available. That would make benchmark scores incomparable with XBOW blackbox references and weaken source/answer isolation. Whitebox benchmarks can be proposed separately later.

### Decision 3: Keep benchmark suite data on the harness side

Provider and evaluator code may read benchmark metadata, Docker Compose files, expected results, and flag rules. The agent workspace receives only scoped runtime context: target URL, challenge id/name, tags, mission brief, flag format, and artifact directory.

Alternative considered: mount or pass the benchmark repo to the agent for convenience. That risks answer leakage and accidentally triggers whitebox behavior, so the benchmark runner must treat the suite as private grading material.

### Decision 4: Use provider and environment boundaries

The first provider should be an `XBowProvider` that loads cases from an XBOW-style suite. A `ComposeEnvironment` should handle Docker Compose operations, including compose file discovery, `up`, port resolution, readiness checks, and `down`.

This mirrors the useful separation from Decepticon while reusing Apex's direct Docker Compose target-starting model.

### Decision 5: Reuse Atlas pentest execution through an adapter

The runner should call `runPentestWorkflow` through a small adapter that constructs blackbox inputs and optionally injects `harnessWorkerRunner` / `harnessPhaseRunner` / custom workers when available. In Mastra CLI contexts, this can reuse the current harness-backed subagent path; in CI/headless runs, it can use injected or default workflow execution.

Alternative considered: create a benchmark-specific pentest agent. That would duplicate skills, toolsets, model routing, worker parsing, and report behavior already present in Atlas.

### Decision 6: Score flags first, findings second

XBOW-style benchmark pass/fail should primarily be driven by expected flag capture when the flag rule exists. Expected finding comparison can enrich the report with vulnerability detection metrics, including PoC and spray discoveries, but it should not require source access by the agent.

For multi-vulnerability suites, the evaluator should support per-expected-finding match summaries in addition to binary flag capture.

## Risks / Trade-offs

- Source or answer leakage through paths, prompts, or mounted workspaces -> keep benchmark repo paths out of workflow inputs and create benchmark artifact directories separate from suite directories.
- Accidental whitebox execution through `cwd` -> add tests proving benchmark workflow calls do not pass `cwd` and result mode is blackbox.
- Docker Compose behavior varies across suites -> isolate compose parsing/startup logic in `ComposeEnvironment` with unit tests and clear setup errors.
- Target readiness checks can be flaky -> use bounded TCP/HTTP checks and report setup failures distinctly from agent failures.
- Long-running agent executions can leave containers active -> use timeout handling and teardown in `finally`-style control flow.
- Finding comparison can be subjective -> start with deterministic flag detection and structured expected-finding comparison, then add model-assisted comparison only behind a clearly identified evaluator path.

## Migration Plan

1. Add the new benchmark capability without changing existing `/pentest` behavior.
2. Implement provider/environment/evaluator/reporter modules behind a new CLI/script entry point.
3. Add unit and integration-style tests with mocked Docker/workflow adapters before running real benchmark targets.
4. Validate against a small local XBOW-style case selection.
5. Rollback by removing the new benchmark entry point and modules; existing pentest workflow remains unaffected.
