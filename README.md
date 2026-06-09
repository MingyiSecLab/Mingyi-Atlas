# Mingyi Atlas

中文 | [English](README.en.md)

![Mingyi Atlas](assets/logo_banner.png)

Mingyi Atlas 是一个面向软件工程和授权安全评估的终端 AI Agent。它提供交互式 TUI、无头自动化、持久化项目上下文、内置技能、浏览器/容器辅助能力，以及专用的渗透测试模式。

本项目发布为 `@mingyilab/mingyi-atlas`，并提供 `mingyi-atlas` 命令。

## 安装

```bash
npm install -g @mingyilab/mingyi-atlas
mingyi-atlas
```

也可以不全局安装，直接运行：

```bash
npx @mingyilab/mingyi-atlas
```

运行要求：

- Node.js `>=22.13.0`
- `fd` 或 `fdfind` 可选，但建议安装，用于更快的 `@file` 自动补全
- Docker 可选，但使用容器支持的渗透测试浏览器/工具运行器时需要 Docker

支持的运行环境包括 macOS、Linux，以及现代 x64 或 arm64 Node.js 构建上的 Windows。原生可选依赖会由包管理器按当前平台解析。

## 快速开始

启动交互式 TUI：

```bash
mingyi-atlas
```

运行一次无头任务：

```bash
mingyi-atlas --prompt "Review the auth module and summarize risks"
```

在无头自动化中使用渗透测试模式：

```bash
mingyi-atlas --mode pentest --prompt "Start an authorized assessment of https://example.test"
```

## 界面预览

![Mingyi Atlas 测试结果预览](assets/cli-0.png)

![Mingyi Atlas 模式与工具](assets/cli-1.png)

![Mingyi Atlas 渗透测试工作流](assets/cli-2.png)

![Mingyi Atlas 任务执行结果](assets/cli-3.png)

## 核心特性

- 交互式终端 UI，支持持久线程和项目级状态。
- 支持 build、plan、fast 和 pentest 模式。
- 通过模型包配置支持多模型提供商。
- 支持 OAuth 和 API Key 认证。
- 项目与全局配置分别存放在 `.mingyi-atlas/` 和 `~/.mingyi-atlas/`。
- 内置技能加载机制，支持显式搜索和读取技能。
- Goal 模式用于较长周期的持续目标。
- 通过 `/browser` 配置浏览器自动化。
- 为渗透测试工作流提供结构化安全上下文、发现、报告和工具产物。

## 认证

可以使用 `/login` 登录支持 OAuth 的提供商，也可以在启动 CLI 前通过环境变量设置提供商 API Key。

常用 API Key 环境变量：

```bash
export ANTHROPIC_API_KEY=...
export OPENAI_API_KEY=...
export GOOGLE_GENERATIVE_AI_API_KEY=...
```

凭据会保存在本机的 `~/.mingyi-atlas/auth.json`。

## 渗透测试模式

渗透测试模式仅用于授权测试。它会为 Agent 提供面向安全任务的提示词、专用子 Agent、持久化目标上下文和受范围约束的工具。

渗透测试模式使用技能作为工作流指导。对于 benchmark、CTF 和夺旗类任务，它会优先使用 benchmark 工作流。对于 Atlas 风格的红队评估，它可以搜索并激活内置 Atlas 工作流技能，用于协调评估接收、OPPLAN 风格目标、专家委派、验证和报告。普通范围内评估会根据当前阶段选择最匹配的工作流或方法论技能。

系统提供监督、侦察、漏洞分析、验证、报告和修复等专用子 Agent。侦察和漏洞分析子 Agent 可以使用离线/API/认证辅助工具进行发现和证据审查。验证子 Agent 可以使用有边界、非破坏性的探测工具进行范围内检查。报告和修复子 Agent 默认不会获得主动探测工具。

安全工具包：

| 类别 | 工具 | 用途 | 安全边界 |
| --- | --- | --- | --- |
| HTTP 验证 | `http_request` | 范围内 HTTP 请求验证 | 仅面向授权目标和任务范围 |
| 离线分析 | `crypto_analyze`、`hash_analyze` | 编码/解码、摘要计算、哈希格式识别 | 不破解哈希，不恢复密钥 |
| API 与认证 | `graphql_validate`、`websocket_validate`、`jwt_analyze`、`oauth_validate` | API、协议和认证配置验证 | 以配置审查和低风险验证为主 |
| 漏洞信号检查 | `sqli_probe`、`ssti_probe`、`ssrf_probe`、`xxe_probe` | SQL 注入、模板注入、SSRF、XXE 信号检查 | 有边界、非破坏性探测 |
| 请求走私评估 | `request_smuggling_assess` | 被动/低风险请求走私信号评估 | 不发送畸形 TE/CL payload |
| 认证边界识别 | `detect_auth_scheme` | 识别登录、认证和访问控制边界 | 仅做检测和归类 |
| CAPTCHA 检测 | `detect_captcha` | 检测 CAPTCHA 和机器人挑战，提取人工输入相关选择器 | 不自动求解或绕过 CAPTCHA |
| 前端发现 | `extract_js_endpoints` | 从前端资源提取路由和 API 端点 | 用于发现和审查，不执行攻击 |
| CVE 查询 | `cve_search` | 带缓存的本地/远程 CVE 查询 | 只读查询 |
| 浏览器自动化 | `run_browser_cli` | 任务范围内的浏览器自动化 | 遵循授权目标和工具审批 |
| 容器工具 | `run_container_tool` | 容器化工具执行并捕获产物 | 隔离运行，保留执行产物 |
| 发现管理 | 结构化发现工具 | 报告、更新和复测发现 | 面向证据整理和复核 |

运行时渗透测试数据会按目标分桶保存：

```text
.mingyi-atlas/pentest/targets/<target-slug>/
  context.json
  findings.json
  http-responses/
  browser-runs/
  tool-runs/
  reports/
```

CAPTCHA 处理仅限检测和人工交接。工具可以识别提供商、图片 CAPTCHA 字段、输入选择器、表单和提交控件，但不会自动求解或绕过 CAPTCHA。

## Slash 命令

常用命令：

| 命令 | 用途 |
| --- | --- |
| `/setup` | 重新运行初始化引导 |
| `/login` / `/logout` | 管理提供商认证 |
| `/models` | 配置模型包 |
| `/mode` | 切换模式 |
| `/subagents` | 配置子 Agent 默认模型 |
| `/browser` | 启用或配置浏览器自动化 |
| `/skills` | 列出技能 |
| `/skill/<name>` | 显式激活某个技能 |
| `/goal` | 启动或管理持久目标 |
| `/threads` | 列出并切换线程 |
| `/mcp` | 查看或重新加载 MCP 服务连接 |
| `/hooks` | 查看或重新加载 hooks |
| `/permissions` | 管理工具审批 |
| `/settings` | 管理通用设置 |
| `/diff` | 查看本地 git diff |
| `/help` | 查看命令帮助 |

## 数据布局

全局数据：

```text
~/.mingyi-atlas/
  auth.json
  settings.json
  mingyi-atlas.db
  mingyi-atlas-vectors.db
  locks/
  signals/
```

项目数据：

```text
<project>/.mingyi-atlas/
  hooks.json
  mcp.json
  commands/
  skills/
  pentest/
```

可以通过代码覆盖配置目录：

```ts
import { createMingyiAtlas } from '@mingyilab/mingyi-atlas';

const app = await createMingyiAtlas({
  configDir: '.acme-agent',
});
```

## 环境变量

常用环境变量：

| 变量 | 用途 |
| --- | --- |
| `ANTHROPIC_API_KEY` | Anthropic API Key 兜底配置 |
| `OPENAI_API_KEY` | OpenAI API Key |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google 模型 API Key |
| `MINGYI_ATLAS_DISABLE_CAFFEINATE=1` | 禁用 macOS 防休眠 |
| `MINGYI_ATLAS_ANALYTICS_DEBUG=1` | 打印 analytics 调试事件 |
| `MINGYI_ATLAS_CVE_CACHE_PATH` | 覆盖 CVE 缓存路径 |
| `MASTRA_PLANS_DIR` | 覆盖已保存计划目录 |

## 开发

安装依赖：

```bash
pnpm install
```

从源码运行：

```bash
pnpm cli
```

检查、测试和构建：

```bash
pnpm check
pnpm test:run
pnpm build
```

运行发布前检查：

```bash
pnpm prepublishOnly
pnpm pack:check
```

贡献者和维护者文档：

- [CONTRIBUTING.md](CONTRIBUTING.md)：PR 期望和贡献规则。
- [DEVELOPMENT.md](DEVELOPMENT.md)：本地设置、项目布局和实现模式。
- [SECURITY.md](SECURITY.md)：漏洞报告和安全工具边界。
- [docs/architecture.md](docs/architecture.md)：高层实现架构概览。
- [docs/pentest-tools.md](docs/pentest-tools.md)：渗透测试工具设计和安全规则。
- [docs/skills-and-workflows.md](docs/skills-and-workflows.md)：内置技能和工作流指导。

## 发布

包发布为 `@mingyilab/mingyi-atlas`，并提供一个二进制命令：

```text
mingyi-atlas -> dist/cli.js
```

发布：

```bash
npm login
npm publish --access public
```

`@mingyilab` npm scope 必须存在，并且你的 npm 账号需要具备发布权限。

## 许可证

Mingyi Atlas 社区版代码基于 [Apache License 2.0](LICENSE) 开源。

Mingyi Atlas 名称、Logo 和相关品牌资产属于 MingyiLab，不随 Apache-2.0 授权。
