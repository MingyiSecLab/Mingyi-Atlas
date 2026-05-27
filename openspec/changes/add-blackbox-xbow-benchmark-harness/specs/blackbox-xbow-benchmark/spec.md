## ADDED Requirements

### Requirement: Load XBOW benchmark cases
The system SHALL load XBOW-style benchmark cases from a local benchmark suite without exposing suite source paths or expected-result files to the agent execution phase.

#### Scenario: Load cases from benchmark metadata
- **WHEN** the benchmark runner is given a local XBOW-style suite path containing case metadata
- **THEN** the system produces benchmark cases with id, name, description, level, tags, win condition metadata, and environment location for harness use

#### Scenario: Filter benchmark cases
- **WHEN** the user supplies benchmark filters for ids, tags, levels, or index ranges
- **THEN** the system runs only matching benchmark cases in a stable order

#### Scenario: Missing benchmark suite
- **WHEN** the configured benchmark suite path does not exist or contains no loadable cases
- **THEN** the system reports a configuration failure without invoking Atlas agents

### Requirement: Run benchmark targets through Docker Compose
The system SHALL start each selected benchmark case as an isolated Docker Compose target, resolve the blackbox target URL, verify readiness, and clean up target resources after the case run.

#### Scenario: Start compose target
- **WHEN** a benchmark case has a Docker Compose environment
- **THEN** the system starts the environment, resolves the exposed target URL, and provides that URL to the agent execution phase

#### Scenario: Target readiness failure
- **WHEN** the target ports or HTTP endpoint do not become ready within the configured readiness budget
- **THEN** the system marks the case as a setup failure and does not invoke Atlas agents for that case

#### Scenario: Cleanup after success or failure
- **WHEN** a benchmark case finishes, fails setup, times out, or raises an execution error
- **THEN** the system tears down the case environment and removes benchmark-created containers, networks, and volumes according to the configured cleanup policy

### Requirement: Execute Atlas pentest workflow in blackbox mode
The system SHALL execute benchmark cases by reusing the existing Atlas agent, skills, and `runPentestWorkflow` in blackbox mode only.

#### Scenario: Invoke workflow without source context
- **WHEN** the benchmark runner invokes `runPentestWorkflow` for a case
- **THEN** the invocation includes the case target URL and benchmark artifact directory but does not include `cwd`, source paths, expected results, or benchmark answer material

#### Scenario: Reuse existing pentest capabilities
- **WHEN** a benchmark case is executed
- **THEN** the system uses the existing Atlas pentest workflow, pentest subagent execution path, skills, PoC/spray discovery, artifact capture, finding judge, scorer, and report generation paths where available

#### Scenario: Mastra harness is available
- **WHEN** the benchmark run has access to a compatible Mastra harness context
- **THEN** the system may inject harness-backed worker or phase runners while preserving the blackbox-only workflow input boundary

#### Scenario: Headless execution
- **WHEN** the benchmark run executes in CI or another headless context without a compatible Mastra harness
- **THEN** the system executes through injected or fallback workflow runners without requiring interactive harness behavior

### Requirement: Isolate benchmark answers from agents
The system SHALL prevent agent prompts, tool contexts, and workspaces from receiving benchmark source directories, expected-result data, or flag answers.

#### Scenario: Agent receives scoped benchmark context
- **WHEN** the benchmark runner prepares the agent execution context
- **THEN** the agent-visible context contains only target URL, challenge id/name, tags, mission brief, flag format, and scoped artifact/output locations

#### Scenario: Expected results remain evaluator-only
- **WHEN** expected-result files are available for a benchmark case
- **THEN** only the evaluator reads those files after agent execution, and the expected-result contents are not included in prompts or workflow input

#### Scenario: Source path is not mounted into agent workspace
- **WHEN** the benchmark suite is located on disk
- **THEN** the agent workspace excludes the suite source path unless a future explicit whitebox benchmark capability changes this contract

### Requirement: Evaluate benchmark outcomes
The system SHALL evaluate each benchmark case using captured artifacts, workflow output, findings, and expected benchmark criteria.

#### Scenario: Expected flag captured
- **WHEN** the workflow output or artifacts contain the expected flag for a case
- **THEN** the system marks flag capture as passed for that case and records the evidence location

#### Scenario: Expected flag missing
- **WHEN** the expected flag is not found in workflow output or artifacts
- **THEN** the system marks flag capture as failed and records available agent output, findings, and errors for diagnosis

#### Scenario: Expected findings compared
- **WHEN** expected findings are available for a case
- **THEN** the system compares actual findings, including PoC and spray discoveries that became workflow findings or artifacts, against expected findings and records matched, missed, and extra findings

#### Scenario: No expected findings available
- **WHEN** a case has no expected-finding data
- **THEN** the system still evaluates flag capture and records actual findings without failing solely because expected-finding data is absent

### Requirement: Report benchmark results
The system SHALL write per-case evidence and aggregate benchmark reports in machine-readable and human-readable formats.

#### Scenario: Per-case evidence written
- **WHEN** a benchmark case completes with any status
- **THEN** the system writes a per-case evidence record containing status, target URL, timing, setup result, workflow summary, flag result, finding comparison, artifact paths, and errors

#### Scenario: Aggregate report written
- **WHEN** a benchmark run completes
- **THEN** the system writes aggregate JSON and Markdown reports with total cases, pass rates, setup failures, timeouts, finding metrics, durations, and evidence index paths

#### Scenario: Exit status reflects failures
- **WHEN** the benchmark run has setup failures, execution failures, timeouts, or failed expected criteria
- **THEN** the benchmark command exits non-zero unless configured otherwise
