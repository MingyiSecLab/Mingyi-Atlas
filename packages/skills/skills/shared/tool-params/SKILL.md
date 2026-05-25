---
name: tool-params
description: Select safe, scoped CLI parameters for common pentest tools such as nmap, ffuf, nuclei, sqlmap, whatweb, and curl.
version: 0.1.0
tags:
  - pentest
  - tools
  - cli
  - nmap
  - ffuf
  - nuclei
  - sqlmap
  - whatweb
metadata:
  domain: pentest
  category: tool-params
  tools:
    - nmap
    - ffuf
    - nuclei
    - sqlmap
    - whatweb
    - curl
---

# Pentest Tool Params

## Use When
- A worker needs to choose CLI tool parameters for scoped recon or validation.

## Workflow
1. Match tool choice to the current target and objective.
2. Prefer low-noise defaults and bounded runtime.
3. Record exact command, stdout, stderr, exit code, and output artifacts.
4. Avoid broad or destructive profiles unless the user explicitly asks.

## Outputs
- Tool command guidance and artifact expectations.

