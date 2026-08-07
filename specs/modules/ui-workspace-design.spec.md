# Spec: UI Workspace Design — 三面架构 (Popup / Side Panel / Options)

- **Feature:** Domour Copilot UI 三面架构：Popup 快捷开关、Side Panel 工作区、Options 配置中心
- **Status:** APPROVED — 2026-08-07
- **Affected Files:**
  - `frontend/public/manifest.json` — 新增 `options_page`、`default_popup`
  - `frontend/src/App.tsx` — Side Panel 重构为 3-tab 工作区 + 事件总线订阅
  - `frontend/src/components/` — 新增 `Popup/`、`OptionsPage/`、`ChatPanel/`、`TasksPanel/`、`OverviewPanel/`、`SiteRules/`
  - `frontend/src/background/index.ts` — 新增消息协议（通知推送、站点规则、Chat 中转）
  - `frontend/src/types/siteRules.ts` — 新增站点权限数据模型
  - `main.go` — bridge 推送通知/行情（native messaging PUSH），暴露 Agent 工具接口

---

## 1. 三面架构原则

| Surface | Trigger | 生命周期 | 用户心智 | 内容规则 |
|---|---|---|---|---|
| **Popup** | 点工具栏图标 | 秒级（失焦即关） | "快速看/切" | ≤2 次点击，无表单 |
| **Side Panel** | 点图标 / API | 常驻 | "我在这里工作" | 日常所有操作 |
| **Options Page** | 右键图标 → 选项 | 长会话 | "我来配置" | 一次性设置、低频管理 |

**硬规则：** 超过 2 次点击或需要表单的操作一律移到 Side Panel；日常高频操作不放 Options；日志/代理管理不放 Popup（Popup 仅保留代理 Profile 一键切换，不承载管理）。

---

## 2. Popup（快捷开关 + 快捷菜单）

`manifest.action.default_popup = popup.html`。

```
┌──────────────────────────────┐
│ ● ACTIVE  ⚡ :26888/mcp      │ 连接状态 + 端点
├──────────────────────────────┤
│ 代理 Profile                  │
│  ○ Direct Connection          │
│  ● vproxy Auto PAC (Default)  │
│  ○ Local SOCKS5 (1080)        │  ← radio 一键切换
├──────────────────────────────┤
│ 当前站点权限 (example.com)     │
│  [x] 允许注入        [switch] │
│  [x] 绕过代理        [switch] │
│  [ ] 采集 Cookie     [switch] │  ← 三开关，写 site_rules
├──────────────────────────────┤
│ [打开侧边栏] [复制 Token] [🔔]  │ 通知提醒总开关
└──────────────────────────────┘
```

**行为契约：**
- 站点权限开关读写 `site_rules.<host>`，作用于**当前活动 tab** 的 hostname。
- 切开关后立即广播 `SITE_RULES_UPDATED`，Side Panel 同步刷新。
- 通知 🔔 是全局提醒总开关（背景 badge 是否显示），对应 storage key `notify_enabled`。

**Do NOT:** 日志、Profile 表单、Bridge 安装引导、高级设置。

---

## 3. Side Panel（工作区，3-Tab）

`App.tsx` 现有 3 tab 重构为 3 tab（Overview / Chat / Logs），**Tasks & 通知 合并入 Overview**。**代理管理不在 Side Panel** —— Proxy Profile 的 CRUD 与切换已由 Options Page 承载（见 §4），Side Panel 聚焦工作流。Header 含 **Options 快捷入口**（齿轮按钮 → `chrome.runtime.openOptionsPage()`）。

| Tab | 组件 | 内容 |
|---|---|---|
| Overview（概览） | `OverviewPanel` | 状态卡片（Bridge/Native）、**通知中心**（任务进度、股票行情、事件提醒，即 `TasksPanel`） |
| Chat | `ChatPanel` + `PlaywrightManager` | 用户 ↔ AI Agent 自然语言对话，流式回复，任务指令下发；`Domour Chrome MCP` 卡片含默认折叠的 **MCP Endpoint** 与 **MCP Server Config Snippet** 两节 |
| Logs | `Bridge & Logs`（现有） | 实时日志 |

> **注：** 现有 `ProxyManager` 组件从 Side Panel 迁入 Options Page（§4.1），代码复用不删除。

### 3.1 统一事件总线（WorkspaceEventBus）

所有跨 tab 数据走单一消息通道，避免各 tab 独立轮询：

```ts
// background → 任意已打开 panel
type WorkspaceEvent =
  | { type: "JOB_STATUS"; job: AutomationJob }
  | { type: "NOTIFY_PUSH"; payload: NotificationPayload }   // bridge 推送
  | { type: "SITE_RULES_UPDATED"; rules: SiteRules }
  | { type: "CONNECTION_STATUS"; connected: boolean; reason?: string }
  | { type: "AGENT_STREAM"; delta: string; jobId?: string } // Chat 流式片段
  | { type: "AGENT_DONE"; jobId: string; result: string };
```

`chrome.runtime.onMessage` 统一分发给当前活跃 tab；`App.tsx` 持有一个 `useWorkspaceEvents()` hook。

### 3.2 Chat（用户 ↔ 外部 AI Agent）

**架构：** Agent 逻辑由**外部服务**实现，Go bridge 仅提供浏览器操作接口（MCP tools）。消息流：

```
Side Panel Chat ──sendMessage──▶ background ──native pipe──▶ Go bridge ──HTTP/MCP──▶ 外部 Agent 服务
   ◀──AGENT_STREAM/AGENT_DONE── background ◀────── streaming ──── bridge
```

- 每条用户消息创建一个 `jobId`，background 记录 `jobs.<jobId>`（状态、内容）。
- Agent 需要操作浏览器时经 bridge 调用 `browser_navigate` 等既有 MCP 工具。
- 流式回复以 `AGENT_STREAM` 增量推送，`AGENT_DONE` 结束并持久化到 `chat_history`。
- **Bridge 为外部 Agent 提供接口**：bridge 暴露可被外部服务调用的工具端点（现有 `/mcp` 即满足），Agent 服务自持 LLM 推理与编排。

### 3.3 通知中心（合并入 Overview）

`TasksPanel` 组件渲染在 Overview tab 底部（不再独立成 tab）。内容：任务队列（pending/running/done）、股票行情（bridge 推送）、事件提醒。

数据源 = **Go bridge 推送**（native messaging），非扩展侧轮询外部 API。

| 推送类型 | 载荷 | 展示 |
|---|---|---|
| 任务状态 | `{ jobId, action, status: pending/running/done/error, url, result }` | 队列列表，实时进度 |
| 行情通知 | `{ symbol, price, changePct, alertLevel }` | 自选列表，涨跌着色，触发条件变色/提醒 |
| 系统事件 | `{ severity, message, ts }` | 事件流，badge 计数 |

**协议：** bridge 通过现有 native pipe 发送 `PUSH_EVENT` 帧；background 校验 token → 存入 `storage.local.events` → 广播 `NOTIFY_PUSH`。面板关闭时 badge 计数 `+1`。

**通知规则配置**（自选股、触发条件、提醒方式）放 Options → Notifications 规则。

---

## 4. Options Page（配置中心 + 管理后台）

`manifest.options_page = options.html`，访问 `chrome.runtime.openOptionsPage()`。

```
[General] [Proxy] [Bridge Setup] [Notifications] [Site Rules] [Advanced]
```

| Tab | 功能 | 对应 storage key |
|---|---|---|
| **General** | Cookie 提取开关、主题 | `allow_cookie_extraction`, `theme` |
| **Proxy** | 代理 Profile 管理（原 Side Panel `ProxyManager` 组件迁入）：Profile CRUD、切换 active profile、bypass 规则编辑 | `proxy_profiles`, `active_proxy` |
| **Bridge Setup** (P1) | 安装引导三步（下载→运行→验证），连接状态 + Troubleshooting，**API Token 管理**（查看/复制/重新生成，从 Side Panel 迁出） | `api_token`（读/写 + 触发 RECONNECT） |
| **Notifications** | 股票自选源、任务触发条件、提醒方式（badge/声音/系统通知） | `notify_rules` |
| **Site Rules** | 全局默认 + 按域名白名单/黑名单管理（注入/代理/Cookie 三项独立） | `site_rules` |
| **Advanced** | MCP 端口、日志级别、数据管理（清日志/清 chat 历史）、重置 | `mcp_port`, `log_level` |

### 4.1 Site Rules 数据模型（三面枢纽）

```ts
interface SiteRule {
  host: string;              // 如 "example.com"，"" 表示全局默认
  inject: boolean;           // 是否允许脚本注入
  bypassProxy: boolean;      // 是否绕过代理
  cookies: boolean;          // 是否允许 Cookie 提取
  source: "global" | "allowlist" | "blocklist";
}

interface SiteRules {
  global: SiteRule;                    // 默认策略
  perHost: Record<string, SiteRule>;   // 按域名覆盖
  _meta?: { updatedAt: number };
}
```

**解析优先级：** `perHost[host]` 命中 → 用其值；未命中 → 取 `global` 默认值。hostname 匹配最长后缀优先（`api.example.com` 匹配 `example.com` 记录）。

**消费方：**
- Popup：快速切当前站点三开关（写 `perHost[host]`）
- Options：完整管理（列表、增删、黑白名单分组）
- Background：`executeAutomationJob` / `runDomScript` 注入前查询 `site_rules`，`bypassProxy` 影响 `applyProxyConfig`，`cookies` 影响 `GET_COOKIES`

---

## 5. 消息协议扩展（background）

新增 `chrome.runtime.sendMessage` 消息类型：

| 类型 | 方向 | 说明 |
|---|---|---|
| `GET_SITE_RULES` | panel → bg | 拉取全量规则 |
| `SET_SITE_RULE` | panel → bg | 更新单条规则（含 Popup 开关） |
| `GET_JOBS` / `GET_EVENTS` | panel → bg | 拉取任务/事件列表 |
| `CHAT_SEND` | panel → bg | `{ jobId, message }` 转发给 bridge→外部 Agent |
| `CHAT_HISTORY_GET` | panel → bg | 拉取聊天记录 |
| `NOTIFY_TOGGLE` | popup → bg | 切换通知总开关 |

---

## 6. 实现优先级

| P | Item | Surface | 理由 |
|---|---|---|---|
| P1 | Site Rules 模型 + background 消费 | 三面 | 所有权限的根，Popup/Options 都依赖 |
| P1 | Options Page 骨架 + Proxy 管理迁入 + Bridge Setup | Options | #1 痛点 + 代理管理迁出 Side Panel 的载体 |
| P1 | Chat 消息通道（CHAT_SEND→bridge→外部 Agent） | Side Panel | 核心新能力 |
| P2 | Popup（状态 + 代理切换 + 站点三开关） | Popup | 目前无 popup |
| P2 | Tasks & 通知（bridge 推送协议） | Side Panel | 依赖 bridge 推送实现 |
| P3 | Overview 工作台聚合 | Side Panel | 最后打磨 |

---

## 7. 场景断言（BDD — Mapped Tests）

### Feature: Site Rules 解析与消费

#### Scenario 1: [SPEC-UI-WS-001] 最长后缀匹配 + 全局回退
- **Given** `site_rules.perHost` 仅含 `example.com`，`site_rules.global` 为默认策略（inject: true, bypassProxy: false, cookies: false）
- **When** 对 `api.example.com` 查询 `resolveSiteRule(host)`
- **Then** 命中 `example.com` 记录（最长后缀优先）；对无记录的 `other.com` 查询则回退到 `global` 默认值

#### Scenario 2: [SPEC-UI-WS-002] 三项权限相互独立
- **Given** `perHost["example.com"] = { inject: false, bypassProxy: true, cookies: true }`
- **When** 分别查询三项
- **Then** inject 为 false、bypassProxy 为 true、cookies 为 true，互不影响；修改单项不重置其他项

#### Scenario 3: [SPEC-UI-WS-003] Popup 开关 → storage → Side Panel 同步
- **Given** Popup 对当前活动 tab 的 host 切换 `bypassProxy` 开关
- **When** 调用 `SET_SITE_RULE`，写入 `site_rules.perHost[host]`
- **Then** background 广播 `SITE_RULES_UPDATED`，已打开的 Side Panel 各 tab 收到事件并刷新展示

#### Scenario 4: [SPEC-UI-WS-004] Background 注入前查询规则
- **Given** `site_rules.perHost["example.com"].inject === false`
- **When** 对该 host 执行 `OPEN_AND_AUTOMATE` / `runDomScript`
- **Then** 注入被阻止并返回明确错误，不产生脚本注入，且不触发 `runtime.lastError`

### Feature: Chat 消息通道（bridge 中转）

#### Scenario 5: [SPEC-UI-WS-005] CHAT_SEND 转发链路
- **Given** Side Panel Chat 发送 `CHAT_SEND { jobId, message }`
- **When** background 生成 `jobs.<jobId>` 并经 native pipe 转发给 bridge → 外部 Agent 服务
- **Then** Agent 的流式回复以 `AGENT_STREAM` 增量推送回 panel；完成后 `AGENT_DONE` 结束并持久化到 `chat_history`

#### Scenario 6: [SPEC-UI-WS-006] 桥接离线时的 Chat 降级
- **Given** bridge 未连接（OFFLINE）
- **When** 用户在 Chat 发送消息
- **Then** background 不转发，返回 `{ error: "bridge offline" }`，Chat UI 显示离线提示，不丢消息（可本地暂存 `chat_pending`）

### Feature: 通知推送（bridge → badge）

#### Scenario 7: [SPEC-UI-WS-007] PUSH_EVENT 校验与广播
- **Given** bridge 通过 native pipe 发送 `PUSH_EVENT` 帧（含 token）
- **When** background 校验 token 通过
- **Then** 事件存入 `storage.local.events`，广播 `NOTIFY_PUSH` 给已打开 panel；若 panel 关闭则 badge 计数 +1

### Feature: 回归保护

#### Scenario 8: [SPEC-UI-WS-008] Site Rules 不破坏代理 LAN bypass
- **Given** 既有 `DEFAULT_LAN_BYPASS`（14 条 loopback/LAN 条目）已在 `frontend/src/types/proxy.ts` 生效
- **When** 任一 profile 激活且站点规则命中
- **Then** `bypassProxy` 规则仅影响站点级代理决策，不删除/覆盖 profile 的 `bypassList` 合并逻辑（回归既有场景 [SPEC-PROXY-MSG-007/008]）

---

## 8. 不在本 Spec 范围内

- 外部 Agent 服务本身的实现（LLM 编排、工具选择）—— 由外部服务持有，bridge 仅暴露接口
- 股票行情的具体数据源/交易接口 —— bridge 推送侧的实现细节
- Windows 平台的 native host 注册路径

