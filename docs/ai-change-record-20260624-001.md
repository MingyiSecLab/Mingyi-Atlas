---
record_type: change
source: ai
change_id: AI-CHANGE-20260624-001
related_refs:
  - type: context
    id: user-request
  - type: upstream-pr
    id: mastra#17695
  - type: upstream-pr
    id: mastra#17974
title: 追平 MastraCode 0.24.0 关键运行时与测试改动
summary: 对齐 Session API、模型选择、计划提交流程、analytics 匿名标识和 Node.js 运行时门槛，并补齐发布前测试与文档记录。
scope:
  modules:
    - src/agents
    - src/tui
    - src/analytics
    - src/onboarding
    - docs
    - package metadata
  files:
    - src/analytics.ts
    - src/__tests__/analytics.test.ts
    - src/__tests__/package-metadata.test.ts
    - src/agents/__tests__/tools.test.ts
    - src/agents/model.ts
    - src/agents/prompts/plan.ts
    - src/index.ts
    - src/onboarding/settings.ts
    - src/providers/claude-max.ts
    - src/tui/commands/new.ts
    - src/tui/goal-manager.ts
    - src/tui/session-access.ts
    - package.json
    - README.md
    - README.en.md
    - DEVELOPMENT.md
    - CHANGELOG.md
change_type:
  - feature
  - bugfix
  - test
  - docs
  - chore
risk_level: medium
compatibility: breaking-change
data_impact: none
security_impact: privacy
tests:
  - command: pnpm check
    result: passed
    notes: TypeScript 类型检查通过。
  - command: pnpm test:publish
    result: passed
    notes: 发布前关键测试 49 项通过。
review_status: ready
created_by: ai
created_at: 2026-06-24T09:10:00+08:00
---

## 变更背景

本次变更基于用户要求，对比 `tests/mastra/mastracode` 与当前项目，追平 `0.22.3 -> 0.24.0` 范围内仍未落地或未完全收口的关键改动，并将相关文档与发布前校验同步到当前仓。

重点来源包括：

- `mastra#17695`：analytics distinct ID 从主机名派生改为匿名持久化标识。
- `mastra#17974`：`@earendil-works/pi-tui` 迁移后的 Node.js 最低版本要求提升到 `22.19.0`。
- Session API / displayState 迁移、plan submit prompt 修复、goal judge tool 适配、claude-max header merge、`/new` 线程解绑等上游行为对齐。

## 变更内容

- 将 analytics distinct ID 改为匿名、持久化、本机全局存储：
  - 写入 `~/.mingyi-atlas/analytics.json`
  - 自动迁移旧的 `mastra-${hostname}` 格式
  - 对损坏或非法配置自动重建
- 将 Node.js 最低版本要求提升到 `>=22.19.0`，并在 package metadata 测试中固化约束。
- 增加 `src/__tests__/package-metadata.test.ts`，校验发布 entrypoint、exports 与 engine floor。
- 修复 `src/agents/__tests__/tools.test.ts` 的 harness stub，使其与当前 Session API 的 `session.modeId` 结构一致。
- 对齐并收口一批 0.24.0 范围内的运行时与 TUI 改动，包括：
  - plan 模式 `submit_plan` 提交流程
  - Session API / `displayState` 访问路径
  - goal/judge 工具与 UI 状态同步
  - 模型选择与模型包配置更新
  - claude-max 请求头合并
  - `/new` 线程解绑与状态清理
- 更新 `README.md`、`README.en.md`、`DEVELOPMENT.md`、`CHANGELOG.md` 以及 `docs/skills.md`、`docs/workflows.md` 等文档。

## 影响范围

- 用户可见行为：
  - 新环境要求 Node.js `22.19.0+`
  - 首次运行或迁移后会生成 `~/.mingyi-atlas/analytics.json`
  - TUI 线程、计划审批、模型选择和 goal UI 行为与上游 `0.24.0` 更一致
- 系统边界：
  - 仅新增本机全局 analytics 配置文件写入
  - 不涉及数据库 schema 变更或外部 API 合同变更
- 安全与隐私：
  - telemetry 不再直接使用主机名作为 distinct ID，降低设备可识别性

## 验证结果

- `pnpm check`：通过
- `pnpm test:publish`：通过
- 过程中额外定位并修复了 `src/agents/__tests__/tools.test.ts` 因旧 harness stub 形状导致的失败

## 风险与回滚

主要风险：

- Node.js 版本门槛提升属于破坏性兼容变更，低于 `22.19.0` 的环境会在安装或运行阶段失败
- analytics ID 迁移会改写本机 `analytics.json`，后续若再调整格式需要保留兼容迁移逻辑

异常发现方式：

- 安装失败、CLI 启动失败
- `pnpm check` 或 `pnpm test:publish` 失败
- `~/.mingyi-atlas/analytics.json` 未生成或仍保留旧主机名派生格式

回滚方式：

- 代码层面回滚本次 commit
- 如需撤销本机 analytics 迁移，可删除 `~/.mingyi-atlas/analytics.json` 后回退到旧版本逻辑
