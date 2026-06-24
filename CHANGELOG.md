# Mingyi Atlas Changelog

## 0.24.0

### Changed

- Raised the Node.js minimum version to `>=22.19.0` to match the `@earendil-works/pi-tui` upgrade.
- Switched analytics distinct IDs from hostname-derived values to anonymous persistent IDs stored in `~/.mingyi-atlas/analytics.json`.

### Fixed

- Updated the `src/agents/__tests__/tools.test.ts` harness stub to the current Session API shape.
- Added package metadata coverage for the published CLI entrypoint and engine floor.

### Tests

- `pnpm check`
- `pnpm test:publish`

## 0.22.3

### Added

- Added a new specialized pentest subagent package for attack-surface discovery, authentication, validation, and finding judgment.
- Added pentest-specific prompt guidance that treats subagents as stage-oriented workers and judges rather than generic parallel helpers.
- Added a pentest-mode-only `run_pentest_workflow` tool for starting and resuming structured pentest workflow runs.
- Added a typed `src/workflow/pentest` workflow layer with runner contracts, persisted workflow state, stage history, adapters, reporting, metrics, and focused tests.
- Added runner bridge contracts for skill search and activation, specialized subagent dispatch, pentest tool execution, and workflow persistence.
- Added additional container runner utilities for pentest workflows, including `httpx`, `dnsx`, `katana`, `masscan`, and `testssl.sh`.

### Changed

- Reworked pentest orchestration to route specialized subagents through the new `specialized` bundle and map them to the `pentest` mode.
- Expanded the pentest system prompt with clearer authorization, scope, safety, and reporting instructions.
- Updated the generic subagent guidance so pentest mode can delegate a single focused specialist when the task benefits from isolation or independent review.
- Refreshed TUI approval and banner copy to use the new branding and localized user-facing labels.
- Simplified suspension response forwarding in headless and TUI prompt handlers.
- Updated contributor and development docs to reference the specialized pentest subagent layout.
- Changed structured pentest workflow execution to fail fast when required runtime bridge capabilities are unavailable instead of returning placeholder success.
- Changed workflow methodology resolution so runner-backed workflow starts require explicit skill search and skill activation through the bridge contract.

### Removed

- Removed the legacy `src/agents/subagents/pentest/` implementation in favor of the specialized subagent layout.

### Fixed

- Fixed the release version bump to `0.22.3`.
- Fixed pentest workflow target execution defaults so unavailable runtime execution records failed or blocked outcomes rather than completed target status.

## 0.21.2-alpha.3

### Changed

- Migrated the TUI dependency from deprecated `@mariozechner/pi-tui` to `@earendil-works/pi-tui`.
- Kept the published CLI command as `mingyi-atlas`.

### Notes

- Some install warnings still come from upstream browser and Mastra dependency chains, including old WebDriver/Stagehand transitive packages and the current `zod` peer split between older AI SDK internals and newer AI SDK packages.

## 0.21.2-alpha.2

Initial Mingyi Atlas branded alpha release.

### Added

- Added `pentest` mode with security-focused prompts and specialist subagents.
- Added built-in security skill bundles for recon, analysis, exploitation methodology, reporting, cloud, AD, mobile, reverse engineering, and post-exploit workflows.
- Added scoped pentest tools:
  - `http_request`
  - `detect_auth_scheme`
  - `detect_captcha`
  - `extract_js_endpoints`
  - `cve_search`
  - `run_browser_cli`
  - `run_container_tool`
  - structured context, finding, retest, and report tools
- Added target-bucketed pentest artifact storage under `.mingyi-atlas/pentest/targets/<target-slug>/`.
- Added Docker runner definitions for browser automation and containerized security tools.
- Added XBow benchmark runner and documentation under `benchmark/xbow/`.
- Added publish-ready npm package metadata for `@mingyilab/mingyi-atlas`.

### Changed

- Rebranded the CLI, TUI, data directories, analytics labels, update checks, and public package name to Mingyi Atlas.
- Changed the global command to `mingyi-atlas`.
- Moved tests into same-directory `__tests__/` folders.
- Changed project and global config roots to `.mingyi-atlas/` and `~/.mingyi-atlas/`.
- Changed publish scripts so `prepack` builds local dist output without relying on an upstream monorepo script.
- Changed `prepublishOnly` to run type checking, publish-critical tests, and a production build.

### Fixed

- Fixed full test suite failures after the test layout and brand migration.
- Fixed update-check tests so they do not depend on an already-published npm package.
- Fixed package dry-run generation for the scoped npm package.

### Removed

- Removed the inherited upstream changelog history from the public changelog.
- Removed the obsolete standalone `VERIFICATION.md` model-pack checklist from the publish tree.

### Notes

- CAPTCHA support is detection and manual handoff only. Mingyi Atlas records provider, evidence, input selectors, form candidates, and submit controls, but does not solve or bypass CAPTCHA automatically.
- Runtime assessment artifacts are intentionally stored outside source directories under `.mingyi-atlas/`.
