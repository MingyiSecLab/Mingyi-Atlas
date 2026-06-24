# Architecture Overview

Mingyi Atlas is a terminal AI agent built on top of Mastra's `Agent`, `Harness`, and `Workspace` primitives. The project combines an interactive TUI, a headless runner, dynamic prompts, dynamic tools, skill loading, runtime workflows, persistent state, and a pentest-oriented security domain layer.

This document focuses on three questions:

1. What lives where in the repository.
2. How the app is assembled at startup.
3. How one user request moves through prompts, models, tools, and UI.

## Top-Level Runtime Map

```mermaid
flowchart TD
  User["User"] --> CLI["CLI entry<br/>src/main.ts"]
  CLI -->|interactive| TUI["TUI runtime<br/>src/tui/mastra-tui.ts"]
  CLI -->|--prompt / -p| Headless["Headless runner<br/>src/headless.ts"]
  CLI --> App["App assembly<br/>createMingyiAtlas()<br/>src/index.ts"]

  App --> Harness["Mastra Harness"]
  App --> Agent["Code Agent"]
  App --> Workspace["Dynamic Workspace<br/>src/agents/workspace.ts"]
  App --> Workflows["Runtime workflows<br/>src/workflow/*"]
  App --> Memory["Storage + Memory + Vector Store"]
  App --> Auth["Auth + Settings"]
  App --> MCP["MCP Manager"]
  App --> Hooks["Hook Manager"]
  App --> Modes["Modes"]
  App --> Subagents["Subagents"]

  Agent --> Prompts["Dynamic prompt builder<br/>src/agents/instructions.ts<br/>src/agents/prompts/*"]
  Agent --> Models["Dynamic model resolver<br/>src/agents/model.ts"]
  Agent --> Tools["Dynamic tools<br/>src/agents/tools.ts"]

  Tools --> WorkspaceTools["Workspace tools<br/>view/search/edit/exec/LSP"]
  Tools --> ModelTools["Custom tools<br/>src/tools/*"]
  Tools --> WorkflowTools["Workflow-backed tools<br/>run_pentest_workflow"]
  Tools --> McpTools["MCP tools"]

  TUI --> Harness
  Headless --> Harness
```

## Source Layout

```mermaid
flowchart LR
  SRC["src/"] --> Entry["main.ts<br/>headless.ts<br/>index.ts"]
  SRC --> TUI["tui/<br/>interactive UI, slash commands,<br/>event handlers, components"]
  SRC --> Agents["agents/<br/>prompts, model routing,<br/>workspace, subagents, processors"]
  SRC --> Tools["tools/<br/>model-callable tools"]
  SRC --> Security["security/<br/>pentest context, findings,<br/>reports, shared helpers"]
  SRC --> Workflow["workflow/<br/>typed runtime workflows and registries"]
  SRC --> Skills["skills/<br/>built-in skills and workflows"]
  SRC --> Auth["auth/<br/>OAuth/API key storage"]
  SRC --> MCP["mcp/<br/>server config and manager"]
  SRC --> Hooks["hooks/<br/>pre/post tool hooks"]
  SRC --> LSP["lsp/<br/>language server integration"]
  SRC --> Utils["utils/<br/>project, storage, locks,<br/>update checks, misc helpers"]
```

## Directory Responsibilities

```text
src/
  main.ts                 CLI entry for interactive mode
  headless.ts             CLI entry for non-interactive runs
  index.ts                createMingyiAtlas() composition root
  schema.ts               Harness state schema

  tui/                    Terminal UI, slash commands, event rendering
  agents/                 Prompt assembly, model routing, workspace, subagents
  tools/                  Agent-callable tool implementations
  security/               Pentest domain logic and runtime artifact helpers
  workflow/               Typed runtime workflows and registries
  skills/                 Built-in Markdown skills and workflows
  auth/                   Credential storage and provider auth helpers
  mcp/                    MCP config loading and tool exposure
  hooks/                  PreToolUse/PostToolUse hook system
  lsp/                    LSP support for workspace tools
  utils/                  Shared project/runtime utilities
```

## Startup and Assembly Flow

The composition root is `createMingyiAtlas()` in `src/index.ts`. Both the TUI path and the headless path use it.

```mermaid
flowchart TD
  Start["Process start"] --> Main["src/main.ts"]
  Main --> Flag{"Has --prompt?"}
  Flag -->|yes| Headless["src/headless.ts"]
  Flag -->|no| TuiBoot["TUI bootstrap"]

  Headless --> Create["createMingyiAtlas()"]
  TuiBoot --> Create

  Create --> Env["Load .env and global settings"]
  Env --> Project["Detect project and resource ID"]
  Project --> Storage["Create storage, vector store,<br/>observability"]
  Storage --> Auth["Create AuthStorage and provider access"]
  Auth --> McpHooks["Create MCP manager and Hook manager"]
  McpHooks --> AgentSetup["Create Agent"]
  AgentSetup --> Modes["Register modes:<br/>build / plan / fast / pentest"]
  Modes --> Subagents["Register subagents"]
  Subagents --> Harness["Create Harness with workspace,<br/>memory, tools, auth checks"]
  Harness --> Runtime{"Runtime path"}
  Runtime -->|interactive| TUI["MastraTUI.run()"]
  Runtime -->|headless| Runner["Headless event loop"]
```

## Request Execution Flow

This is the core flow for one interactive message or one headless prompt.

```mermaid
sequenceDiagram
  participant U as User
  participant T as TUI or Headless
  participant H as Harness
  participant A as Agent
  participant P as Prompt Builder
  participant M as Model Resolver
  participant W as Workspace
  participant X as Dynamic Tools

  U->>T: input message or --prompt
  T->>H: send message
  H->>A: start agent run
  A->>P: build dynamic instructions
  P-->>A: base prompt + mode prompt + AGENTS/CLAUDE instructions + task state
  A->>M: resolve current model
  M-->>A: provider-backed language model
  A->>X: expose tools for current mode and permissions
  X-->>A: workspace tools + custom tools + MCP tools
  A->>H: emit events
  H-->>T: message_start / tool_start / tool_end / message_end
  A->>W: read/search/edit/execute when workspace tools are chosen
  A->>X: call custom tools when needed
  T-->>U: stream text, tool progress, approvals, final output
```

## Prompt, Mode, and Tool Interaction

Modes change three things together:

- Prompt behavior in `src/agents/prompts/*`
- Default model selection in `src/index.ts`
- Tool exposure in `src/agents/tools.ts`

Current modes:

- `build`: default software engineering mode
- `plan`: planning-oriented mode with write tools disabled at the workspace layer
- `fast`: lightweight and cheaper/faster mode
- `pentest`: security-assessment mode with pentest prompt, pentest tools, and built-in pentest skills

The prompt builder in `src/agents/prompts/index.ts` combines:

- Base prompt from `src/agents/prompts/base.ts`
- Mode-specific prompt
- Model-specific prompt overrides
- Current task list from harness state
- Instructions loaded from project or global `AGENTS.md` and `CLAUDE.md`

## Workspace and Tool Layers

There are two tool layers in the system.

1. Workspace tools from Mastra:
   `view`, `find_files`, `search_content`, `write_file`, `string_replace_lsp`, `execute_command`, and related LSP/process tools.
2. Custom dynamic tools in `src/tools/`:
   security analysis, browser/container helpers, reporting, scope recording, and similar domain-specific operations.

Some custom tools are thin wrappers over runtime workflows. `run_pentest_workflow` is the current example: it exposes a workflow-backed execution path through the pentest tool surface.

The workspace is built in `src/agents/workspace.ts` and controls:

- project root
- additional allowed paths
- sandbox environment
- skill directories
- LSP configuration
- plan-mode tool restrictions

Dynamic tool registration in `src/agents/tools.ts` controls:

- always-on tools
- mode-specific tools
- MCP-injected tools
- disabled tools from config
- per-tool deny rules from thread state
- hook wrapping for pre/post tool use

## Skills, Workflows, and Subagents

Skills are Markdown operating instructions, not TypeScript tools. Runtime workflows are TypeScript graphs and state machines.

- Skills describe how to think and what order to follow.
- Runtime workflows describe what executes and what state is persisted.
- A workflow skill may guide a multi-step process without being executable code.
- A runtime workflow may be executable code without being the primary orchestration prompt.

- Skill path resolution lives in `src/agents/workspace.ts`
- Built-in skills live in `src/skills`
- Pentest built-in skills are only added to skill paths in `pentest` mode

Default subagents include:

- `explore`
- `plan`
- `execute`
- `attack-surface`
- `auth`
- `validation`
- `finding-judge`

The parent agent remains the orchestrator. Subagents are focused workers, not the final source of truth.

## Pentest Overlay

The pentest path adds domain-specific state, tools, prompts, and runtime artifacts on top of the normal agent runtime.
Today, the interactive pentest prompt remains the primary orchestrator; the runtime pentest workflow is an optional structured execution path.

```mermaid
flowchart TD
  PentestMode["pentest mode"] --> PentestPrompt["src/agents/prompts/pentest.ts"]
  PentestMode --> PentestTools["src/tools/* pentest tools"]
  PentestMode --> PentestSkills["src/skills/standard/* pentest skills"]
  PentestMode --> PentestSubagents["specialized pentest subagents"]
  PentestMode --> PentestWorkflow["src/workflow/pentest/*"]
  PentestTools --> SecurityDomain["src/security/pentest/*"]
  PentestWorkflow --> SecurityDomain
  SecurityDomain --> RuntimeData[".mingyi-atlas/pentest/targets/<target-slug>/"]
```

Runtime pentest data is stored under:

```text
.mingyi-atlas/pentest/targets/<target-slug>/
  context.json
  findings.json
  workflow-runs/
  http-responses/
  browser-runs/
  tool-runs/
  reports/
```

This data should not be committed unless it is a sanitized fixture.

## Practical Entry Points for Contributors

If you want to understand or change a specific area, start here:

- Startup and composition: `src/main.ts`, `src/headless.ts`, `src/index.ts`
- Prompt behavior: `src/agents/instructions.ts`, `src/agents/prompts/*`
- Model routing: `src/agents/model.ts`
- Workspace behavior: `src/agents/workspace.ts`
- Tool exposure: `src/agents/tools.ts`
- Tool implementation: `src/tools/*`
- Runtime workflows: `src/workflow/pentest/*`
- TUI event flow: `src/tui/mastra-tui.ts`, `src/tui/event-dispatch.ts`, `src/tui/command-dispatch.ts`
- Pentest domain state: `src/security/pentest/*`
