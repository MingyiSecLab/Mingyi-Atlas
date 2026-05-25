---
name: shared-docker-runner
description: Use temporary Docker runner containers for scoped CLI tools and artifact collection.
version: 0.1.0
tags:
  - shared
  - docker
  - runner
  - cli
  - artifacts
metadata:
  domain: shared
  category: docker-runner
---

# Shared Docker Runner

## Use When
- A task should run CLI security tools in a disposable container and persist outputs locally.

## Workflow
1. Mount the active session workspace into `/workspace`.
2. Run bounded commands with explicit timeout expectations.
3. Persist stdout, stderr, exit code, command metadata, and generated files.
4. Destroy one-shot containers after completion unless browser session state is required.

## Outputs
- Runner command records and artifacts.

