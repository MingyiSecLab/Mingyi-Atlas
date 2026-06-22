# Mingyi Atlas — 渗透测试能力评估报告

> 评估时间：2026-06-15 | 范围：`src/` 全量代码 + skills 体系

---

## 总体评级：⭐⭐⭐⭐ 强 / 生产就绪

项目已构建出一套系统完整、分层清晰的 AI 驱动渗透测试框架，覆盖侦察→漏洞验证→发现管理→报告的完整生命周期，并具备严格的范围管控与安全边界。

---

## 一、整体架构评估

```
┌─────────────────────────────────────────────────────────────┐
│                     Pentest Mode (TUI/CLI)                  │
├──────────────┬──────────────┬──────────────┬────────────────┤
│  Orchestrator│  Attack Surf │  Auth Agent  │  Validation    │
│  (pentest.ts)│  (subagent)  │  (subagent)  │  (subagent)    │
│              │              │              │  Finding Judge  │
├──────────────┴──────────────┴──────────────┴────────────────┤
│                   工具层 (28个专业工具)                       │
│  http_request · browser_cli · sqli/ssti/ssrf/xxe probe      │
│  jwt_analyze · oauth_validate · cve_search · detect_auth    │
│  extract_js_endpoints · websocket/graphql_validate ...       │
├─────────────────────────────────────────────────────────────┤
│              安全域数据层 (src/security/pentest/)            │
│   context.ts · findings.ts · report.ts · paths.ts           │
├─────────────────────────────────────────────────────────────┤
│                    Skills 知识体系                            │
│   recon / exploit / post-exploit / ad / cloud / atlas       │
└─────────────────────────────────────────────────────────────┘
```

**亮点**：工具层、数据层、提示层三者解耦清晰，符合 `src/security/README.md` 的依赖方向约定。

---

## 二、工具能力详细清单

### 2.1 侦察与信息收集

| 工具 | 能力 | 评价 |
|------|------|------|
| `http_request` | 带 scope 校验的 HTTP 请求，支持重定向/大小限制 | ✅ 完备 |
| `detect_auth_scheme` | 自动识别 Basic/Digest/Bearer/Form/OAuth/JSON 认证方式 | ✅ 完备 |
| `detect_captcha` | CAPTCHA/人机验证检测（含手动选择器提示） | ✅ 完备 |
| `extract_js_endpoints` | 从 HTML/JS 内容静态提取路由和 API URL | ✅ 完备 |
| `validate_discovery` | 发现结果验证，防止虚假侦察结论 | ✅ 良好 |
| `web_search` / `web_extract` | 网络威胁情报（Tavily / Anthropic / OpenAI 自适应） | ✅ 完备 |

### 2.2 认证与协议分析

| 工具 | 能力 | 评价 |
|------|------|------|
| `jwt_analyze` | JWT 头/载荷/算法离线分析（alg:none、密钥配置等） | ✅ 完备 |
| `oauth_validate` | OAuth/OIDC token 声明、scope、issuer/audience 验证 | ✅ 完备 |
| `graphql_validate` | GraphQL schema、内省、查询边界只读验证 | ✅ 完备 |
| `websocket_validate` | WebSocket 行为有界测试 | ✅ 完备 |
| `hash_analyze` | 哈希类型识别（不含爆破） | ✅ 完备 |
| `crypto_analyze` | 加密元数据分析（不含密钥恢复） | ✅ 完备 |

### 2.3 漏洞探测（有界、非破坏性）

| 工具 | 探测类型 | 安全约束 |
|------|----------|----------|
| `sqli_probe` | SQL 注入信号指示器 | 仅指示，不 dump 数据 |
| `ssti_probe` | 服务端模板注入候选 | 无 RCE payload |
| `ssrf_probe` | SSRF 候选验证 | 仅授权内的 benign URL |
| `xxe_probe` | XML 实体注入信号 | 无外部回调 |
| `request_smuggling_assess` | 请求走私被动/低风险评估 | 被动优先，高风险须用户确认 |

### 2.4 漏洞情报

| 工具 | 数据源 | 特性 |
|------|--------|------|
| `cve_search` | NVD + OSV + FIRST EPSS + CISA KEV | 24h 缓存；自动评分排序（CVSS+EPSS+KEV加权） |

> CVE 搜索支持三种模式：`ids`（精确 CVE 查找）、`keyword`（关键词搜索）、`package`（OSV 包版本匹配）。

### 2.5 动态执行环境

| 工具 | 能力 |
|------|------|
| `run_browser_cli` | Playwright 浏览器自动化：DOM 检查、截图、存储分析、CSP/Cookie 取证 |
| `run_container_tool` | 容器化执行环境（沙箱隔离） |
| `execute_command` | 本地安全命令执行（白名单约束） |

### 2.6 发现管理与报告

| 功能 | 实现 | 质量 |
|------|------|------|
| 结构化发现记录 | `report_finding` / `list_findings` / `update_finding` | ✅ 支持 critical~info 5级，候选/已验证/误报状态 |
| 去重机制 | SHA-256 哈希 dedupeKey（endpoint+attackVector 或 file+line+category） | ✅ 完善 |
| 重测队列 | `add_retest_item` / `update_retest_item` | ✅ 支持 pending/in_progress/passed/failed/blocked |
| 报告生成 | Markdown + JSON 双格式，执行摘要+发现排序 | ✅ 完善 |
| 并发写保护 | `withSecurityFileQueue` 文件级队列锁 | ✅ 完善 |

---

## 三、Skills 知识体系评估

### 3.1 覆盖的技术领域

```
标准技能库 (src/skills/standard/)
│
├── recon/          侦察工作流（被动/OSINT/云/主动/Web 5阶段）
├── exploit/        
│   └── web/        30个 Web 漏洞利用子技能：
│       ├── sqli, blind-sqli, nosqli, ssti-exploitation, ssrf-exploitation
│       ├── xss, dom-clobbering, xs-leaks, xxe-exploitation
│       ├── idor-exploitation, business-logic, mass-assignment
│       ├── file-upload, lfi, command-injection-exploitation
│       ├── deserialization-exploitation, race-condition
│       ├── smuggling (HTTP 请求走私)
│       ├── jwt, oauth, saml, ldapi, graphql
│       ├── cache-deception, proxy-misconfig, open-redirect
│       ├── ato-methodology, web-crypto-exploitation
│       ├── xpath-xslt, cve (已知 CVE 利用)
│       └── api (API 安全)
│
├── post-exploit/   后渗透（C2-Sliver, 横移, 凭证获取, 提权）
├── ad/             Active Directory（10种技术：Kerberoasting, AS-REP, ADCS, DCSync...）
├── cloud/          云安全（AWS IAM, Azure MI, GCP, K8s, 容器, S3, Terraform）
├── mobile/         移动安全（Android - 静态/动态）
├── reverser/       逆向工程（Ghidra, YARA, ROP, 固件, 恶意软件分析）
├── analyst/        漏洞分析（15种分析技能 + 漏洞赏金方法论）
├── soundwave/      参与文档生成（RoE, ConOps, 去冲突化）
└── atlas/          战略编排（OPPLAN, kill-chain, 并行子代理调度）
```

### 3.2 子代理编排

| 子代理 | 职责 |
|--------|------|
| `attack-surface` | 资产/路由/API/信任边界侦察 |
| `auth` | 认证方案、会话、JWT/OAuth/CSRF、MFA/CAPTCHA |
| `validation` | 候选漏洞的基线/测试/差分验证 |
| `finding-judge` | 独立证据审查、误报排除（只读，不创建/修改发现） |
| `benchmark` | CTF/挑战赛/基准测试专项 |

**并行调度**：Atlas 工作流明确支持 kill-chain 内独立目标的并行 `task()` 分发。

---

## 四、安全边界与授权控制

### 4.1 已实现的安全约束

| 约束类型 | 实现方式 | 覆盖情况 |
|----------|----------|----------|
| **Scope 校验** | `isHostInScope()` — 每次 http_request/detect_auth 都检查 | ✅ 强制 |
| **授权确认** | Pentest 提示词要求每次主动扫描前确认授权 | ✅ 提示层 |
| **范围记录** | `record_scope/list_scope` 持久化授权目标 | ✅ 工具层 |
| **SSRF 防护** | 明确禁止 metadata 服务、localhost、私有 IP（除非授权） | ✅ 提示层 |
| **响应大小限制** | `MAX_BODY_CHARS = 100,000` | ✅ 工具层 |
| **超时控制** | 所有工具均有 `timeoutMs` 参数，最大 30s | ✅ 工具层 |
| **Hook 拦截** | `wrapToolWithHooks` — PreToolUse/PostToolUse 钩子支持 deny | ✅ 工具层 |
| **工具权限策略** | `permissionRules.tools` — deny 策略从工具列表移除 | ✅ 工具层 |
| **破坏性操作** | 提示词明确禁止持久化/凭证窃取/横向移动/拒绝服务/暴力破解 | ✅ 提示层 |

### 4.2 安全边界的局限

> [!WARNING]
> - **SSRF 约束仅在提示层**：`ssrf_probe` 工具本身不验证目标 URL 是否在授权范围，依赖 Agent 遵从提示词。
> - **Scope 检查仅针对 HTTP 工具**：`run_browser_cli` 和 `run_container_tool` 没有看到显式的 scope 验证逻辑。
> - **CAPTCHA 绕过风险**：`detect_captcha` 返回 manual-entry selectors，可能被误用于 CAPTCHA 自动绕过。

---

## 五、测试覆盖情况

### 5.1 已有测试

| 测试文件 | 覆盖内容 |
|----------|----------|
| `cveSearch.test.ts` | CVE 搜索的三种模式、缓存、错误处理 |
| `detectAuthScheme.test.ts` | 多种认证方案的识别逻辑 |
| `detectCaptcha.test.ts` | CAPTCHA 检测模式 |
| `httpRequest.test.ts` | HTTP 工具 scope 校验、超时 |
| `context.test.ts` | Pentest 上下文 CRUD |
| `report.test.ts` | 报告生成与渲染 |
| `validateDiscovery.test.ts` | 发现验证 |
| `extractJsEndpoints.test.ts` | JS 端点提取 |
| `browserRunner.test.ts` / `containerRunner.test.ts` | 运行时环境 |
| `requestSandboxAccess.test.ts` | 沙箱访问权限 |

**覆盖率估计**：核心工具约 65~70%，发现管理约 80%。

### 5.2 测试缺口

> [!NOTE]
> - `sqliProbe`, `sstiProbe`, `ssrfProbe`, `xxeProbe`, `requestSmugglingAssess` — **无单元测试**
> - `jwtAnalyze`, `oauthValidate`, `graphqlValidate`, `websocketValidate` — **无单元测试**
> - `cryptoAnalyze`, `hashAnalyze` — 仅在 `hashCrypto.test.ts` 中有基础覆盖
> - 子代理编排逻辑 — **无集成测试**

---

## 六、与行业最佳实践对比

| 维度 | 项目现状 | 行业标准 | 差距 |
|------|----------|----------|------|
| Web 漏洞覆盖 | 30+ 种 | OWASP Top 10 + 扩展 | ✅ 全覆盖 |
| 认证测试深度 | JWT/OAuth/SAML/Form | WSTG-AUTHN | ✅ 全覆盖 |
| AD/域渗透 | 10种技术（Kerberoasting/ADCS/DCSync） | 主流 AD 攻击路径 | ✅ 良好 |
| 云安全 | AWS/Azure/GCP/K8s/Container | 主流云平台 | ✅ 良好 |
| 逆向/固件 | Ghidra/YARA/ROP/固件分析 | RE 工具链 | ✅ 良好 |
| 移动安全 | 仅 Android | iOS + Android | ⚠️ 缺少 iOS 静态逆向 |
| 网络层渗透 | 仅 HTTP 层 | Nmap/端口扫描/协议测试 | ⚠️ 缺少 L3/L4 工具 |
| 无线安全 | 无 | WiFi/蓝牙测试 | ❌ 不覆盖 |
| 物理/社工 | 无 | 超出 AI 工具边界 | N/A |
| 报告规范 | 结构化 MD+JSON | CVSS+CWE 标准 | ✅ 良好 |
| redteam 模块 | `src/security/redteam/` 为空 | ATT&CK 战役追踪 | ❌ 尚未实现 |

---

## 七、发现的问题与改进建议

### 高优先级

1. **`ssrf_probe` 缺乏工具层 scope 校验**
   - 当前：仅依赖 Agent 提示词约束
   - 建议：在工具内部复用 `isHostInScope()` 强制检查目标 URL

2. **探针工具无单元测试**（`sqli_probe`, `ssti_probe`, `ssrf_probe`, `xxe_probe`）
   - 建议：添加 mock HTTP 层的单元测试，验证 payload 构造逻辑和结果解析

3. **`redteam/` 模块为空**
   - `src/security/redteam/` 目录存在但为空，README 中提及的 "red-team campaign state" 尚未实现
   - 建议：与 Atlas skill 对齐，实现 objectives/attack-paths/shells 的持久化

### 中优先级

4. **iOS 移动安全缺失**
   - `src/skills/standard/mobile/` 仅有 Android 子目录
   - 建议：添加 iOS 静态分析技能（Frida、class-dump、IPA 解包）

5. **CVE 缓存无失效机制**
   - `CACHE_TTL_MS = 24h` 固定，不支持手动清除
   - 建议：添加 `force_refresh` 参数或缓存管理命令

6. **子代理编排缺少集成测试**
   - 建议：在 `src/agents/subagents/__tests__/` 添加 pentest 编排的集成测试

### 低优先级

7. **发现报告缺少 CVSS 自定义评分字段**
   - 当前报告使用 5 级枚举（critical/high/medium/low/info），不含 CVSS 3.1 向量字符串
   - 建议：在 `pentestFindingInputSchema` 中增加 `cvssVector` 可选字段

8. **网络层工具不足**
   - 无 nmap / 端口扫描 / banner grabbing 等原生工具
   - 建议：在 `execute_command` 白名单中明确支持 nmap、masscan 等工具的调用规范

---

## 八、总结

### 核心优势

- **完整的 Web 安全测试链**：从自动化侦察到 30+ 种漏洞利用技术，覆盖主流 Web 攻击面
- **系统化的编排架构**：Atlas → 专业子代理的分层调度体系，支持并行执行
- **严格的安全约束**：scope 强制校验 + hook 拦截 + 工具权限策略三层防护
- **结构化的发现管理**：带去重、状态追踪和重测队列的完整发现生命周期
- **情报集成**：NVD + EPSS + KEV 多源 CVE 情报，带自动优先级排序
- **丰富的知识库**：recon/exploit/post-exploit/AD/Cloud/Mobile/Reverser 多域技能覆盖

### 主要短板

| 短板 | 影响范围 |
|------|----------|
| redteam 模块未实现 | 红队战役管理能力缺失 |
| 探针工具缺少测试 | 核心安全工具质量风险 |
| iOS 移动安全缺失 | 移动测试覆盖不完整 |
| 网络层工具薄弱 | 基础设施渗透能力受限 |

> [!TIP]
> 当前项目已可胜任：Web 应用渗透测试、API 安全评估、JWT/OAuth 深度分析、AD 域渗透、云环境安全评估、已知 CVE 利用场景。
> 
> 需要补强的场景：大规模红队战役管理、iOS 应用逆向、原生网络层扫描、无线安全评估。
