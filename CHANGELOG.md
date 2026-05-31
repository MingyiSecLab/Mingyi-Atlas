# Mingyi Atlas Changelog

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
