## 1. Benchmark Domain Model

- [x] 1.1 Define benchmark case, filter, setup result, execution result, evaluation result, and report types for blackbox XBOW runs.
- [x] 1.2 Add configuration parsing for suite path, case filters, timeout/readiness budgets, output directory, cleanup policy, and optional workflow runner adapters.
- [x] 1.3 Add tests for config defaults and validation failures.

## 2. XBOW Provider

- [x] 2.1 Implement an XBOW-style provider that loads cases from local benchmark metadata in stable order.
- [x] 2.2 Implement filtering by ids, tags, levels, and index ranges.
- [x] 2.3 Keep benchmark source paths and expected-result data private to provider/evaluator structures, not agent-facing inputs.
- [x] 2.4 Add provider unit tests for loading, filtering, missing metadata, and empty suite behavior.

## 3. Docker Compose Environment

- [x] 3.1 Implement compose file discovery for case directories using common XBOW/Apex-style locations.
- [x] 3.2 Implement Docker Compose startup, port resolution, TCP/HTTP readiness checks, and setup failure reporting.
- [x] 3.3 Implement teardown with volume/orphan cleanup according to the cleanup policy.
- [x] 3.4 Add tests with mocked command execution for success, readiness timeout, startup failure, and cleanup-on-error paths.

## 4. Atlas Pentest Workflow Adapter

- [x] 4.1 Implement a benchmark adapter that invokes `runPentestWorkflow` with target URL, exfil outcome mode, artifact directory, auth context when provided, and optional injected runners.
- [x] 4.2 Ensure the adapter never passes `cwd`, source paths, expected results, or benchmark answer data to `runPentestWorkflow`.
- [x] 4.3 Reuse existing harness-backed worker runner injection when a compatible Mastra harness context is available.
- [x] 4.4 Add tests proving benchmark execution invokes `runPentestWorkflow` in blackbox mode and preserves headless fallback behavior.

## 5. Evaluation

- [x] 5.1 Implement flag detection across workflow output, report data, findings, manifest, and artifact files.
- [x] 5.2 Implement expected flag derivation/reading for XBOW-style cases without exposing expected flags to the agent.
- [x] 5.3 Implement expected-finding comparison for available expected results, including PoC and spray discoveries that appear as findings or artifacts.
- [x] 5.4 Add tests for flag pass/fail, missing expected findings, matched/missed/extra findings, and evaluator-only answer access.

## 6. Reporting

- [x] 6.1 Implement per-case evidence output with status, setup details, target URL, timing, workflow summary, flag result, finding comparison, artifacts, and errors.
- [x] 6.2 Implement aggregate JSON and Markdown reports with pass rates, setup failures, timeouts, finding metrics, durations, and evidence index paths.
- [x] 6.3 Add tests for report shape and stable evidence paths.

## 7. Runner and CLI Entry Point

- [x] 7.1 Implement the benchmark runner orchestration loop: load, filter, setup, execute, evaluate, report, teardown.
- [x] 7.2 Add a CLI/script entry point for running blackbox XBOW benchmarks with filters and output options.
- [x] 7.3 Ensure non-zero exit behavior for failed criteria, setup failures, execution failures, and timeouts unless explicitly configured otherwise.
- [x] 7.4 Add end-to-end tests using mocked provider/environment/workflow components.

## 8. Documentation and Validation

- [x] 8.1 Document the blackbox-only contract, source/answer isolation boundary, supported suite layout, and example commands.
- [x] 8.2 Document how Mastra harness-backed execution differs from headless/CI execution.
- [x] 8.3 Run typecheck and relevant test suites.
- [x] 8.4 Run `openspec validate add-blackbox-xbow-benchmark-harness --strict` and fix any proposal/spec/task issues.
