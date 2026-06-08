# Repository Guidelines

## Project Structure & Module Organization

This is a TypeScript ESM CLI/TUI project. Main source lives in `src/`.

- `src/main.ts`, `src/index.ts`: CLI entry and harness setup.
- `src/tui/`: interactive terminal UI, commands, components, state.
- `src/agents/`: prompts, model routing, dynamic tools, workspace setup, subagents.
- `src/tools/`: model-facing tools; tests live in `src/tools/__tests__/`.
- `src/security/`: pentest context, findings, reports, and shared helpers.
- `src/skills/`: built-in skills and workflows. Skill folders must contain `SKILL.md`.
- `src/auth/`, `src/mcp/`, `src/hooks/`, `src/lsp/`: provider auth, MCP, hooks, and language server support.

Project docs include `README.md`, `README.en.md`, `CONTRIBUTING.md`, `DEVELOPMENT.md`, and `SECURITY.md`.

## Build, Test, and Development Commands

- `pnpm install`: install dependencies.
- `pnpm cli`: run the CLI from source with `tsx src/main.ts`.
- `pnpm check`: run TypeScript type checking.
- `pnpm test`: run Vitest in watch mode.
- `pnpm test:run`: run the full Vitest suite once.
- `pnpm vitest run <path>`: run focused tests, for example `pnpm vitest run src/tools/__tests__/jwt-analyze.test.ts`.
- `pnpm lint`: run ESLint.
- `pnpm build`: build with `tsup` and copy built-in skills.
- `pnpm pack:check`: dry-run npm packaging.

## Coding Style & Naming Conventions

Use TypeScript, ESM imports, and existing local patterns. Keep modules focused and avoid unrelated refactors. Tool files use kebab-case filenames such as `jwt-analyze.ts`, while tool IDs use snake_case such as `jwt_analyze`. Define tool input schemas with Zod near the tool. Prefer ASCII unless editing a file that already uses non-ASCII content.

## Testing Guidelines

Vitest is the test framework. Place tests beside the owning area in `__tests__` directories and name files `*.test.ts`. Run the narrowest relevant test during development, then broaden with `pnpm check` and `pnpm test:run` before a PR. For tools, update `src/agents/__tests__/tools.test.ts` when registration or mode exposure changes.

## Commit & Pull Request Guidelines

Recent history uses short imperative subjects, sometimes Conventional Commit prefixes: `fix: detect prerelease npm updates`, `chore: publish under mingyilab npm scope`, `feat: add pentest mode and rebrand cli`. Keep commits focused.

PRs should include what changed, why, tests run, and security implications. Update docs for user-facing behavior, public APIs, workflow changes, or contributor process changes.

## AI Coding 变更说明规范

本规范用于 AI 提交代码、Code Review 修复、MR/PR 描述和自动化审查记录。目标是把 AI 生成的自然语言变更描述沉淀为可审查、可追踪、可自动处理的标准记录。

### 适用范围

- AI 直接生成或修改代码后的提交说明。
- AI 根据 Code Review 意见进行修复后的回复记录。
- MR/PR 描述中的变更摘要、影响面和验证结果。
- 自动化审查工具输出的结构化审查记录。

### 核心原则

1. 可审查：每条记录必须说明变更意图、影响范围、风险和验证方式。
2. 可追踪：每条记录必须关联需求、缺陷、审查意见、任务或上下文来源。
3. 可处理：字段名称、枚举值和列表结构应稳定，便于脚本、CI、审查机器人解析。
4. 可复核：AI 不能把未执行的验证写成已通过；不确定结论必须显式标记。
5. 最小充分：描述围绕本次变更，不混入无关重构、泛化说明或无法验证的价值判断。

### 记录格式

标准记录由 YAML 元信息块和 Markdown 说明块组成。YAML 用于机器解析，Markdown 用于人工审查。

```markdown
---
record_type: change
source: ai
change_id: AI-CHANGE-YYYYMMDD-001
related_refs:
  - type: issue
    id: CINSIGHT-123
title: 修复状态监测任务重试计数异常
summary: 修复 NATS 状态监测任务在重试后重复累计失败次数的问题。
scope:
  modules:
    - internal/worker/status
  files:
    - internal/worker/status/processor.go
change_type:
  - bugfix
risk_level: medium
compatibility: backward-compatible
data_impact: none
security_impact: none
tests:
  - command: go test ./internal/worker/status
    result: passed
review_status: ready
created_by: ai
created_at: 2026-06-08T10:00:00+08:00
---

## 变更背景

...

## 变更内容

...

## 影响范围

...

## 验证结果

...

## 风险与回滚

...
```

### 字段定义

| 字段 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `record_type` | 是 | enum | 记录类型，见枚举定义。 |
| `source` | 是 | enum | 记录来源，AI 生成固定为 `ai`。 |
| `change_id` | 是 | string | 本次记录唯一标识。提交前未知可用 `pending`，合并前必须替换。 |
| `related_refs` | 是 | list | 关联需求、缺陷、审查意见、PR、提交或外部上下文。无明确来源时写 `type: context`。 |
| `title` | 是 | string | 一句话说明本次变更，不超过 80 个中文字符。 |
| `summary` | 是 | string | 概述变更目的和结果，不超过 200 个中文字符。 |
| `scope.modules` | 是 | list | 受影响模块或目录。 |
| `scope.files` | 是 | list | 关键文件列表，不要求列出生成文件和锁文件。 |
| `change_type` | 是 | list | 变更类型，见枚举定义。 |
| `risk_level` | 是 | enum | 风险等级，见枚举定义。 |
| `compatibility` | 是 | enum | 兼容性影响。 |
| `data_impact` | 是 | enum | 数据影响。 |
| `security_impact` | 是 | enum | 安全影响。 |
| `tests` | 是 | list | 已执行、未执行或不可执行的验证记录。 |
| `review_status` | 是 | enum | 当前审查状态。 |
| `created_by` | 是 | string | 记录创建者，AI 生成固定为 `ai` 或具体 AI 工具名。 |
| `created_at` | 是 | datetime | ISO 8601 时间，包含时区。 |

### 枚举定义

`record_type`：

- `change`：普通代码变更记录。
- `review-fix`：Code Review 修复记录。
- `merge-request`：MR/PR 描述记录。
- `auto-review`：自动化审查记录。

`change_type`：

- `feature`：新增能力。
- `bugfix`：缺陷修复。
- `refactor`：不改变外部行为的重构。
- `test`：测试补充或调整。
- `docs`：文档变更。
- `chore`：构建、脚本、配置等工程事务。
- `security`：安全相关变更。
- `migration`：数据库、数据或状态迁移。
- `api-change`：API 合同或接口行为变化。

`risk_level`：

- `low`：局部变更，回滚简单，无数据或兼容性影响。
- `medium`：影响核心流程、异步任务、外部接口或配置行为。
- `high`：涉及权限、安全、数据迁移、批量任务、不可逆操作或跨模块行为。

`compatibility`：

- `backward-compatible`：向后兼容。
- `breaking-change`：存在破坏性变更。
- `not-applicable`：不适用。
- `unknown`：无法确认，必须在 Markdown 中说明原因。

`data_impact`：

- `none`：无数据影响。
- `read-only`：只读访问变化。
- `schema-change`：表结构或索引变化。
- `data-migration`：存量数据迁移。
- `data-delete`：删除或清理数据。
- `unknown`：无法确认。

`security_impact`：

- `none`：无安全影响。
- `auth`：认证或会话相关。
- `authorization`：权限、租户隔离或访问控制相关。
- `secret`：密钥、凭证、Token、证书相关。
- `network`：外部请求、回调、Webhook 或网络边界相关。
- `privacy`：个人信息、敏感信息或日志脱敏相关。
- `unknown`：无法确认。

`review_status`：

- `draft`：草稿，尚未准备好审查。
- `ready`：可审查。
- `changes-requested`：需要继续修改。
- `approved`：已通过审查。
- `merged`：已合并。
- `blocked`：存在阻塞。

`tests.result`：

- `passed`：已执行且通过。
- `failed`：已执行但失败。
- `not-run`：未执行。
- `not-applicable`：不适用。

### Markdown 说明块

#### 变更背景

说明为什么要改，至少包含一个可追踪来源：

- 需求、缺陷、Review 评论、线上问题、运维记录或用户请求。
- 原行为或问题表现。
- 本次变更要达成的明确结果。

#### 变更内容

按行为变化描述，不按代码 diff 逐行复述：

- 新增、修改、删除了什么行为。
- 涉及哪些关键模块。
- 是否有配置、接口、数据结构、任务调度或部署行为变化。

#### 影响范围

必须覆盖：

- 用户可见行为。
- API、Worker、调度器、数据库、缓存、对象存储、消息队列等系统边界。
- 对现有数据、权限、安全策略、监控告警和回滚的影响。

#### 验证结果

必须如实记录：

- 执行过的命令和结果。
- 未执行验证的原因。
- 已知失败、残留风险和需要人工复核的点。

#### 风险与回滚

至少说明：

- 主要风险是什么。
- 如何发现异常。
- 如何回滚代码、配置、迁移或运行时状态。

### 场景模板

#### AI 提交代码

```markdown
---
record_type: change
source: ai
change_id: pending
related_refs:
  - type: context
    id: user-request
title: <一句话标题>
summary: <本次变更摘要>
scope:
  modules:
    - <module>
  files:
    - <path>
change_type:
  - <feature|bugfix|refactor|test|docs|chore|security|migration|api-change>
risk_level: <low|medium|high>
compatibility: <backward-compatible|breaking-change|not-applicable|unknown>
data_impact: <none|read-only|schema-change|data-migration|data-delete|unknown>
security_impact: <none|auth|authorization|secret|network|privacy|unknown>
tests:
  - command: <command or manual-check>
    result: <passed|failed|not-run|not-applicable>
    notes: <简要说明>
review_status: ready
created_by: ai
created_at: <ISO-8601>
---

## 变更背景

## 变更内容

## 影响范围

## 验证结果

## 风险与回滚
```

#### Code Review 修复

```markdown
---
record_type: review-fix
source: ai
change_id: pending
related_refs:
  - type: review-comment
    id: <comment-id-or-url>
title: <修复标题>
summary: <说明处理了哪些 Review 意见>
scope:
  modules:
    - <module>
  files:
    - <path>
change_type:
  - bugfix
risk_level: <low|medium|high>
compatibility: <backward-compatible|breaking-change|not-applicable|unknown>
data_impact: <none|read-only|schema-change|data-migration|data-delete|unknown>
security_impact: <none|auth|authorization|secret|network|privacy|unknown>
tests:
  - command: <command>
    result: <passed|failed|not-run|not-applicable>
review_status: ready
created_by: ai
created_at: <ISO-8601>
---

## Review 意见

- <原始意见摘要>

## 修复方式

- <对应修复说明>

## 验证结果

## 未处理项

- <无或列出原因>
```

#### MR/PR 描述

````markdown
## Summary

<用 2-4 条说明本次 MR/PR 的业务目标和主要变更。>

## AI Change Record

```yaml
record_type: merge-request
source: ai
change_id: <pr-or-mr-id>
related_refs:
  - type: issue
    id: <issue-id>
change_type:
  - <type>
risk_level: <low|medium|high>
compatibility: <backward-compatible|breaking-change|not-applicable|unknown>
data_impact: <none|read-only|schema-change|data-migration|data-delete|unknown>
security_impact: <none|auth|authorization|secret|network|privacy|unknown>
review_status: ready
```

## Scope

- Modules: `<module>`
- Key files: `<path>`

## Verification

- `<command>`: `<passed|failed|not-run|not-applicable>`

## Risk And Rollback

- Risk: <主要风险>
- Rollback: <回滚方式>
````

#### 自动化审查记录

```markdown
---
record_type: auto-review
source: ai
change_id: <commit-or-pr-id>
related_refs:
  - type: merge-request
    id: <pr-or-mr-id>
title: 自动化审查记录
summary: <审查结论摘要>
scope:
  modules:
    - <module>
  files:
    - <path>
change_type:
  - <type>
risk_level: <low|medium|high>
compatibility: <backward-compatible|breaking-change|not-applicable|unknown>
data_impact: <none|read-only|schema-change|data-migration|data-delete|unknown>
security_impact: <none|auth|authorization|secret|network|privacy|unknown>
tests:
  - command: automated-review
    result: <passed|failed>
review_status: <approved|changes-requested|blocked>
created_by: ai-reviewer
created_at: <ISO-8601>
---

## 审查结论

## 发现问题

| 严重级别 | 文件 | 行号 | 问题 | 建议 |
| --- | --- | --- | --- | --- |

## 通过项

## 需要人工确认
```

### 提交说明约定

Git commit message 仍保持简洁，详细结构化记录放在提交正文或 PR 描述中。

推荐格式：

```text
<type>(<scope>): <summary>

AI-Change-Record: <change_id>
Risk-Level: <low|medium|high>
Verification: <command>=<passed|failed|not-run>
```

示例：

```text
fix(status-worker): avoid duplicate retry failure count

AI-Change-Record: AI-CHANGE-20260608-001
Risk-Level: medium
Verification: go test ./internal/worker/status=passed
```

### 审查清单

提交前必须确认：

- `record_type`、`change_type`、`risk_level` 等枚举值合法。
- `related_refs` 至少有一项，不能只写“按要求修改”。
- `scope.files` 覆盖关键文件。
- 测试结果与实际执行一致，未执行必须写明原因。
- 破坏性变更、数据变更、安全变更不能标为 `none` 或 `low`。
- Markdown 说明包含背景、内容、影响、验证、风险与回滚。
- 自动化审查发现的问题必须能定位到文件和行号；无法定位时必须说明证据来源。

### 自动化处理建议

后续可在 CI 或审查机器人中实现以下校验：

- 解析 YAML 元信息块，校验必填字段和枚举值。
- 当 `risk_level=high` 时要求至少一条人工审批记录。
- 当 `data_impact` 为 `schema-change`、`data-migration` 或 `data-delete` 时要求迁移与回滚说明。
- 当 `security_impact` 不为 `none` 时要求安全审查标签。
- 当存在 `tests.result=failed` 或 `not-run` 时阻止自动合并，除非有显式豁免。
- 将 `change_id`、`related_refs`、`scope.files` 写入审查索引，用于后续追踪和统计。

## Security & Configuration Tips

Do not commit secrets, API keys, private target data, screenshots from private systems, or pentest artifacts. Security tools must be safe by default: scope-gate network requests, use timeouts, bound output, and avoid destructive behavior, brute force, credential theft, persistence, and denial-of-service logic.
