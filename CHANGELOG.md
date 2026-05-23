# Changelog

## 0.1.0

### Added

- Added authorized `pentest` mode for attack-surface-driven security assessments.
- Added `/pentest` configuration flow with blackbox and whitebox target support.
- Added attack surface discovery, target-specific objective planning, bounded target-scoped worker swarms, confirmed finding aggregation, and report artifact generation.
- Added pentest runtime operator contracts for intent routing, normalized runtime context, auth/session preparation, on-demand skill dispatch, and checkpoint/resume guidance.
- Added scoped pentest tools for workflow execution, HTTP/browser evidence capture, auth context handling, attack surface documentation, vulnerability documentation, and swarm execution.
- Added prompt-level skill guidance so pentest agents can search, select, read, and apply relevant skills as methodology support.
- Added resumable pentest runs with manifest-backed checkpoint summaries, `--resume`, and `--replay-target`.

### Changed

- Updated README documentation for pentest mode, `/pentest` usage, auth/session hints, whitebox `--cwd`, artifact directories, and resume/replay options.
