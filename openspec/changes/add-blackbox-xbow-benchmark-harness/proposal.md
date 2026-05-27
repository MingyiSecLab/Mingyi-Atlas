## Why

Mingyi Atlas has reusable pentest agents, skills, and `runPentestWorkflow`, but it does not yet have a repeatable blackbox benchmark harness for XBOW-style validation suites. Adding this harness lets us measure Atlas against containerized CTF targets without changing the existing pentest workflow into a benchmark-specific system.

## What Changes

- Add a blackbox-only XBOW benchmark capability that loads benchmark cases, starts each target container, runs Atlas against the exposed URL, evaluates results, and writes reports.
- Reuse the current Atlas agent, skills, pentest subagent swarm, PoC/spray finding capture, judging, scoring, and `runPentestWorkflow`.
- Keep benchmark orchestration separate from agent execution: the benchmark runner owns case loading, Docker lifecycle, scoring, and reporting; Atlas agents only receive scoped target context.
- Enforce blackbox execution by calling `runPentestWorkflow` without `cwd` or source-path inputs.
- Prevent benchmark source, expected results, and answer material from being exposed to the agent workspace.
- Produce per-case evidence plus aggregate JSON and Markdown benchmark reports.

## Capabilities

### New Capabilities

- `blackbox-xbow-benchmark`: Run XBOW-style container benchmarks as blackbox tests using Atlas pentest agents and workflows.

### Modified Capabilities

- None.

## Impact

- New benchmark runner/provider/evaluator/reporting code for XBOW-style suites.
- Integration with existing `runPentestWorkflow`, pentest subagents, artifact output, findings, and report data.
- Docker Compose lifecycle handling for benchmark targets.
- New CLI or script entry point for running selected benchmark cases.
- Tests for case loading, blackbox-only workflow invocation, source isolation, compose lifecycle abstraction, flag/finding evaluation, and report generation.
