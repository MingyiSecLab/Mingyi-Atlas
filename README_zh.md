# Mingyi Atlas

Mingyi Atlas 是一个基于 Mastra runtime 构建的智能安全评估工作台，结合了交互式终端 agent、本地项目上下文、workspace skills，以及面向授权渗透测试的 attack-surface-driven 工作流。

当前重点是实用型渗透测试编排：先发现真实攻击面，再将每个攻击面转换为目标化测试任务，并发运行 scoped worker agent，保留证据，最后生成可追溯到具体目标的报告。

## 功能亮点

- **渗透测试模式**：提供一等公民级别的 `pentest` 模式，用于授权安全评估。
- **攻击面驱动 swarm**：先做攻击面发现，再按 `/login`、`/api/orders/:id`、`/upload`、`/search` 等具体目标拆分 worker。
- **黑盒与白盒支持**：可直接测试线上目标，也可通过 `--cwd` 提供源码目录进行白盒发现。
- **目标感知测试目标**：根据 endpoint 语义生成 IDOR、越权、租户隔离、上传绕过、SSTI、XSS、注入、业务逻辑等目标化检查。
- **作用域受限证据工具**：在指定 scope 内采集 HTTP、浏览器、认证上下文、应用、endpoint 和漏洞证据。
- **认证与会话提示**：支持传入 header、cookie、bearer token、登录 URL、用户名和认证说明，生成 prompt 时会隐藏敏感值。
- **按需技能调用**：Pentest agent 会按目标生成 skill 搜索建议，并将读取到的 skill 作为方法论辅助。
- **检查点与恢复**：基于 artifact manifest 支持 `--resume` 续跑和 `--replay-target` 指定 worker 重跑。
- **报告与发现**：已确认漏洞会带 evidence id 持久化，并汇总到报告 artifact。

## 安装

安装依赖：

```bash
pnpm install
```

以开发模式启动 TUI：

```bash
pnpm cli
```

构建与类型检查：

```bash
pnpm check
pnpm build:lib
```

当前 package binary 仍暴露为 `mastracode`，产品品牌为 Mingyi Atlas / Mingyi Atlas。

## 渗透测试用法

启动交互式 pentest 配置流程：

```text
/pentest https://example.test/login XBEN-023-24 blind SSTI
```

跳过确认向导并直接运行：

```text
/pentest --yes https://example.test --artifact-dir artifacts/example-pentest
```

使用本地源码目录启用白盒发现：

```text
/pentest https://example.test --cwd /path/to/source
```

恢复之前的运行：

```text
/pentest https://example.test --artifact-dir artifacts/example-pentest --resume
```

重跑指定 target worker：

```text
/pentest https://example.test --artifact-dir artifacts/example-pentest --resume --replay-target orders
```

## 渗透测试参数

| 参数 | 用途 |
| --- | --- |
| `--yes` | 立即提交生成的 pentest 请求。 |
| `--cwd <path>` | 启用基于源码的白盒发现。 |
| `--artifact-dir <path>` | 指定攻击面、证据、manifest、finding 和报告的输出目录。 |
| `--header Name=value` | 添加认证或会话 header 提示。 |
| `--cookie Name=value` | 添加认证或会话 cookie 提示。 |
| `--bearer-token <token>` | 添加 bearer token 认证上下文；prompt 只显示存在状态，不输出原始 token。 |
| `--username <name>` | 为认证流程添加用户名上下文。 |
| `--password <value>` | 添加密码上下文；prompt 只显示存在状态，不输出原始密码。 |
| `--login-url <url>` | 指定认证准备使用的登录 URL。 |
| `--login-path <path>` | 指定 workflow auth context 使用的登录路径。 |
| `--auth-instructions <text>` | 提供认证流程说明。 |
| `--resume` | 从 artifact 目录中的已有 manifest 恢复运行。 |
| `--replay-target <target-id>` | 重跑指定 target worker；可重复传入。 |

## 工作流

```text
/pentest
  -> runtime 意图与上下文标准化
  -> 认证/会话准备
  -> 攻击面发现
  -> target/objective 规划
  -> 有并发上限的 target-scoped swarm
  -> finding 判断与评分
  -> 带 evidence 链接的报告 artifact
  -> checkpoint/resume manifest
```

## Artifact 目录结构

配置后的 artifact 目录可能包含：

- `manifest.json`：运行检查点、阶段、worker、artifact 和恢复元数据。
- `attack-surface/`：已发现应用、endpoint 和攻击面报告。
- `evidence/`：作用域内的 HTTP、浏览器、认证和源码证据。
- `findings/`：已确认漏洞 finding。
- `phases/`：workflow 阶段数据。
- `workers/`：每个 target worker 的结果。
- `report.md` 和 `report.json`：最终报告输出。

## 开发

常用命令：

```bash
pnpm cli
pnpm test
pnpm check
pnpm lint
pnpm build:lib
```

Pentest 相关定向测试：

```bash
pnpm vitest run src/agents/pentest/runtime/runtime.test.ts
pnpm vitest run src/tui/commands/pentest.test.ts src/tools/pentest/index.test.ts
pnpm vitest run src/agents/pentest/specialized/pentest/prompts.test.ts
```

## 负责任使用

Mingyi Atlas 仅用于授权安全工作。只评估你拥有或明确获准测试的系统，并始终遵守操作者提供的 target、scope、credential 和约束。

## 许可证

Apache-2.0
