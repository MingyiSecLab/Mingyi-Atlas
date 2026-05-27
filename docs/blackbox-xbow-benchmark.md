# Blackbox XBOW Benchmark Harness

Atlas blackbox XBOW benchmarks run containerized CTF-style targets and score Atlas against the exposed target URL. The benchmark harness owns suite loading, Docker Compose lifecycle, evaluation, and reporting. Atlas agents own only the blackbox pentest attempt.

## Blackbox Contract

The benchmark runner calls `runPentestWorkflow` without `cwd`, so the workflow remains in blackbox mode. Agents receive scoped runtime context only:

- target URL
- challenge id/name
- tags
- mission brief
- flag format
- artifact/output locations

Agents do not receive benchmark source paths, expected results, or answer material. The benchmark suite is read only by provider/evaluator code.

## Supported Suite Layout

The provider loads cases from:

- `<suite>/<case>/benchmark.json`
- `<suite>/benchmarks/<case>/benchmark.json`
- `<suite>/src/benchmark.json`

The environment discovers Compose files at:

- `<case>/docker-compose.yml`
- `<case>/docker-compose.yaml`
- `<case>/src/docker-compose.yml`
- `<case>/src/docker-compose.yaml`

Expected findings are evaluator-only and may be stored as:

- `<case>/expected_results.json`
- `<case>/expected_results/expected_results.json`
- `<case>/expected_results/results.json`

## Example

Initialize the benchmark submodules first:

```bash
git submodule update --init --recursive benchmark/xbow-validation-benchmarks benchmark/MHBench
```

Run against the default XBOW submodule:

```bash
pnpm tsx src/benchmarks/blackbox-xbow/cli.ts \
  --ids XBEN-001-24 \
  --output ./artifacts/benchmarks/xbow-smoke
```

Or pass the suite explicitly:

```bash
pnpm tsx src/benchmarks/blackbox-xbow/cli.ts \
  --suite benchmark/xbow-validation-benchmarks \
  --ids XBEN-001-24 \
  --output artifacts/benchmarks/xbow-smoke
```

Useful filters:

```bash
--ids XBEN-001-24,XBEN-002-24
--tags sqli,auth-bypass
--levels 1,2
--range-start 1 --range-end 10
```

## Execution Modes

In a Mastra harness-backed context, the benchmark adapter can reuse harness-backed pentest subagent execution. In CI/headless contexts, callers can inject workflow runners or use fallback workflow execution. Both paths preserve the same blackbox input boundary.

## Reports

The harness writes:

- per-case `result.json` and `result.md`
- aggregate `benchmark-report.json`
- aggregate `benchmark-report.md`
- `evidence-index.json`

The command exits non-zero when any case fails, times out, or cannot be set up.
