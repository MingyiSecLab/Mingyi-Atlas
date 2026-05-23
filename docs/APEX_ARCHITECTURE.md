# Apex Architecture

本文档只描述 `backend-agent/tests/apex` 的架构、执行流程和核心设计，不包含主项目对比内容。

## 1. 项目定位

Pensar Apex 是一个面向渗透测试的 AI agent 产品内核，偏向本地 TUI / CLI 场景。

它的核心目标不是固定漏洞分类流水线，而是：

- 先发现攻击面
- 再按攻击面拆分任务
- 最后让多个专门 worker 并发测试

这就是 attack-surface-driven swarm。

---

## 2. 核心目录

```text
tests/apex/src/core/
  workflows/
    pentest.ts
    whiteboxAttackSurface.ts
    threatModel.ts
  agents/
    offSecAgent/
      offensiveSecurityAgent.ts
      tools/
      prompt.ts
      trace.ts
      types.ts
    specialized/
      pentest/agent.ts
      attackSurface/blackboxAgent.ts
  skills/
    registry.ts
    scanner.ts
    parser.ts
    builtins/
  findings/
    registry.ts
  session/
    index.ts
    persistence.ts
    loader.ts
    execution-metrics.ts
  operator/
    approvalGate.ts
    types.ts
  report/
    builder.ts
    renderers/
  ai/
    ai.ts
```

---

## 3. 总体架构图

```mermaid
flowchart TB
  User[TUI / CLI User] --> Session[Session Manager]
  Session --> PentestWorkflow[runPentestWorkflow]

  PentestWorkflow --> Discovery[Attack Surface Discovery]
  Discovery --> Blackbox[BlackboxAttackSurfaceAgent]
  Discovery --> Whitebox[WhiteboxAttackSurfaceWorkflow]

  PentestWorkflow --> Targets[Swarm Targets]
  Targets --> Swarm[runPentestSwarm]

  Swarm --> Worker1[TargetedPentestAgent 1]
  Swarm --> Worker2[TargetedPentestAgent 2]
  Swarm --> WorkerN[TargetedPentestAgent N]

  Worker1 --> Harness[OffensiveSecurityAgent Harness]
  Worker2 --> Harness
  WorkerN --> Harness

  Harness --> Tools[Toolset]
  Harness --> Skills[SkillsRegistry]
  Harness --> Gate[ApprovalGate]
  Harness --> Trace[trace.jsonl]
  Harness --> Messages[messages.json]

  Tools --> Shell[PersistentShell]
  Tools --> Browser[Playwright MCP]
  Tools --> HTTP[HTTP Request]
  Tools --> FindingsTool[document_vulnerability]
  Tools --> PlanTools[Plan / Task Tools]
  Tools --> SpawnTools[spawn_pentest_agent / swarm]

  FindingsTool --> Findings[FindingsRegistry]
  Findings --> Report[Report Builder]
  Report --> Markdown[report.md]
  Report --> JSON[report.json]
```

---

## 4. 主流程

### 4.1 Pentest Workflow

`tests/apex/src/core/workflows/pentest.ts` 是 Apex 的主调度入口。

```mermaid
flowchart TD
  Start([Start Session]) --> Mode{cwd provided?}

  Mode -->|yes| Whitebox[Whitebox Attack Surface Workflow]
  Mode -->|no| Blackbox[Blackbox Attack Surface Agent]

  Whitebox --> Apps[Apps / Pages / API Endpoints]
  Blackbox --> TargetsA[Discovered Targets]

  Apps --> Flatten[Flatten to Swarm Targets]
  TargetsA --> Flatten

  Flatten --> Empty{Targets empty?}
  Empty -->|yes| EmptyReport[Generate Empty Report]
  Empty -->|no| Swarm[Run Pentest Swarm]

  Swarm --> Group[Findings Root-Cause Grouping]
  Group --> Report[Build Report]
  Report --> Metrics[Write Execution Metrics]
  Metrics --> End([Done])
  EmptyReport --> End
```

### 4.2 关键步骤

1. 先做攻击面发现。
2. 将发现结果扁平化为 swarm targets。
3. 按 target 并发启动 worker agent。
4. 聚合 findings，做去重和根因分组。
5. 输出报告与执行指标。

---

## 5. Attack-Surface-Driven Swarm

这是 Apex 的核心设计。

它不是按漏洞类型拆 agent，而是按攻击面目标拆 agent。

例如：

```text
/login
/search
/api/orders/:id
/upload
/admin/users
```

每个目标对应一个 worker agent，并携带目标专属 objectives。

```mermaid
flowchart TB
  Start([Start Pentest]) --> Discovery

  subgraph DiscoveryPhase[Phase 1: Attack Surface Discovery]
    Discovery[Discover pages, APIs, auth flows, forms, JS endpoints]
    Discovery --> SurfaceStore[(Attack Surface Store)]
    SurfaceStore --> Planner[Target Planner]
  end

  subgraph TargetPlanning[Phase 2: Build Swarm Targets]
    Planner --> T1["Target: /login\nObjectives: auth bypass, user enum, rate limit"]
    Planner --> T2["Target: /search\nObjectives: reflected XSS, SQLi, SSTI"]
    Planner --> T3["Target: /api/orders/:id\nObjectives: IDOR, authz, tenant isolation"]
    Planner --> T4["Target: /upload\nObjectives: file upload bypass, stored XSS, path traversal"]
    Planner --> T5["Target: /admin/users\nObjectives: access control, privilege escalation"]
  end

  subgraph Swarm[Phase 3: Bounded-Concurrency Swarm]
    Queue[Swarm Queue\nconcurrency = N]
    W1[Worker Agent 1]
    W2[Worker Agent 2]
    W3[Worker Agent 3]
    W4[Worker Agent 4]
    W5[Worker Agent 5]

    Queue --> W1
    Queue --> W2
    Queue --> W3
    Queue --> W4
    Queue --> W5
  end

  T1 --> Queue
  T2 --> Queue
  T3 --> Queue
  T4 --> Queue
  T5 --> Queue

  subgraph WorkerRuntime[Each Worker Runtime]
    Tools[Tools\nbrowser, http, shell, grep, skills]
    Evidence[Evidence\nscreenshots, responses, traces, PoCs]
    StructuredFinding[document_vulnerability / response tool]
  end

  W1 --> Tools
  W2 --> Tools
  W3 --> Tools
  W4 --> Tools
  W5 --> Tools
  Tools --> Evidence
  Evidence --> StructuredFinding

  subgraph Aggregation[Phase 4: Aggregate]
    Findings[(Findings Registry)]
    Dedup[Dedup + Root Cause Grouping]
    Report[Final Report]
  end

  StructuredFinding --> Findings
  Findings --> Dedup
  Dedup --> Report
  Report --> End([Done])
```

---

## 6. OffensiveSecurityAgent Harness

`tests/apex/src/core/agents/offSecAgent/offensiveSecurityAgent.ts` 是 Apex 的通用 agent runtime。

它负责：

- 构建 toolset
- 过滤 active tools
- 维护 persistent shell
- 管理 Playwright MCP browser session
- 写 trace.jsonl
- 持久化 messages.json
- 支持 approval gate
- 支持 structured response tool

### 6.1 执行时序图

```mermaid
sequenceDiagram
  participant Caller as Workflow / TUI
  participant Agent as OffensiveSecurityAgent
  participant Session as Session
  participant Tools as Toolset
  participant AI as AI SDK streamResponse
  participant Trace as Trace Writer
  participant Store as Message Persistence

  Caller->>Agent: new OffensiveSecurityAgent(input)
  Agent->>Session: resolve session / working directory
  Agent->>Tools: createAllTools(ctx)
  Agent->>Tools: filter activeTools
  Agent->>Trace: write init event
  Agent->>AI: streamResponse(prompt, system, tools, activeTools)

  loop each step
    AI-->>Agent: response messages / usage
    Agent->>Store: schedule messages.json persistence
    Agent->>Trace: record step
    Agent-->>Caller: eventBus step-finish
  end

  AI-->>Agent: final response
  Agent->>Store: flush messages.json
  Agent-->>Caller: consume() result
```

### 6.2 关键能力

```text
streaming
persistent shell
browser session
approval gate
skills catalog
tool filtering
trace logging
message persistence
structured response
cache metrics
```

---

## 7. 工具体系

`createAllTools(ctx)` 提供完整工具集。

### 7.1 工具分类

```text
Browser
  - createBrowserToolset
  - Playwright MCP session

Core pentest
  - execute_command
  - http_request
  - document_vulnerability

Filesystem/search
  - read_file
  - list_files
  - grep
  - create_file
  - update_file

Attack surface
  - document_app
  - document_endpoint
  - extract_js_endpoints
  - crawl_authenticated_area
  - test_endpoint_variations
  - validate_discovery_completeness
  - create_attack_surface_report

Authentication
  - authenticate_session
  - delegate_to_auth_subagent
  - complete_authentication
  - detect_auth_scheme
  - probe_auth_endpoints

Planning/tasks
  - write_plan
  - submit_plan
  - create_task
  - update_task
  - list_tasks

Skills/memory
  - read_skill
  - add_memory
  - get_memory
  - list_memories

Orchestration
  - spawn_pentest_agent
  - spawn_pentest_swarm
  - run_pentest_workflow
  - run_attack_surface

Observability
  - checkpoint_state
```

### 7.2 工具面优势

- 工具覆盖比固定 shell/browser 更广。
- 更贴近真实渗透测试工作流。
- 允许计划、任务、证据、发现、回溯一体化。

---

## 8. Skills 体系

`tests/apex/src/core/skills/registry.ts` 提供显式 SkillsRegistry。

```mermaid
flowchart TB
  Scan[scanSkillRoots] --> Registry[SkillsRegistry]
  Builtins[Built-in Skills] --> Registry
  Filesystem[Filesystem Skills] --> Registry

  Registry --> Catalog[buildCatalog]
  Registry --> ReadSkill[readSkillContent]
  Catalog --> Prompt[System Prompt]
  ReadSkill --> Agent[Agent Runtime]
```

### 8.1 特点

- built-in skills 和 filesystem skills 统一管理
- 支持 catalog 构建
- 支持按需加载完整技能内容
- 比“仅在 prompt 中提示有 skills”更可靠

---

## 9. Findings 流程

`tests/apex/src/core/findings/registry.ts` 管理结果去重和归类。

### 9.1 核心职责

- vulnerability class 提取
- endpoint normalization
- exact dedup
- application-wide dedup
- semantic dedup
- root-cause grouping

### 9.2 流程图

```mermaid
flowchart TB
  Finding[New Finding] --> Classify[Classify Vulnerability Class]
  Classify --> Fingerprint[Build Fingerprint]
  Fingerprint --> Exact{Exact Duplicate?}
  Exact -->|yes| Skip[Skip / Merge]
  Exact -->|no| Semantic{Semantic Duplicate?}
  Semantic -->|yes| Merge[Merge / Attach Related Finding]
  Semantic -->|no| Store[Store as New Finding]
  Store --> Group[Root Cause Grouping]
  Merge --> Group
  Group --> Report[Final Report]
```

---

## 10. 适用场景

### 10.1 Apex 更适合

- 本地 TUI / CLI 渗透测试交互
- 需要强 agent 自主能力
- 需要 plan / execute 分离
- 需要多 worker swarm
- 需要显式 skills / findings / operator gate

### 10.2 Apex 的限制

- 更偏本地 session 模式
- 不像主项目那样天然服务化
- 与 Postgres/S3/Dashboard 的集成弱一些
- 架构复杂度更高

---

## 11. 一句话总结

Apex 本质上是：

```text
一个以攻击面为中心、以 worker swarm 为执行模型、以 skills/approval/findings 为支撑的渗透测试 agent 产品内核。
```

它比固定漏洞 pipeline 更适合真实渗透测试场景，但也更复杂。
