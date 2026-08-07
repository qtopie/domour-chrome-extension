# Module Spec: Traffic Analysis（流量分析 / whistle 类抓包）

## 1. Overview

为扩展增加**流量代理规则配置 + 抓包分析**能力（对标 whistle：`https://github.com/avwo/whistle`），
复用本地已运行的 **vproxy**（`../vproxy`）的流量代理与 MITM 深抓包能力。用户可直接在扩展 Options 页
配置「哪些站点走上游代理 / 哪些站点走本地流量分析」，并查看抓包明细（请求/响应头、Body、状态码、延迟）。

**核心设计（用户已确认）：**
1. **UI 位置**：Options 页新增第 8 个 tab「流量分析」，内含两个子页：
   - **规则**（Traffic Rules）：配置 upstreams + 站点规则分流（多目标自动代理）；
   - **抓包**（Capture）：查看 vproxy 抓取的 trace 列表与明细。
2. **流量路径**：新增「流量分析」总开关。**开启时把 Chrome 代理切换到 vproxy HTTP 端口
   `http://127.0.0.1:8118`（fixed_servers）**，使浏览器流量经 vproxy 统一分流/抓包；
   **关闭时恢复原激活的 proxy profile**（通常是 vproxy Auto PAC）。
3. **站点规则分流**：支持多个目标自动代理，例如 `google.com → PROXY`（走上游 SOCKS5），
   本地前后端开发测试域名 → `INTERCEPT`（走 MITM 深抓包）。
4. **配置写入**：经 vproxy `POST /api/config`（:8899）写入并**热更新**（vproxy 原生支持）；
   扩展 background 通过 `fetch` 直接访问（`host_permissions <all_urls>` 已覆盖，无需 CORS）。

## 2. Interface / API Contract

### 2.1 vproxy 侧（外部依赖，只读约束）

| 项 | 值 | 说明 |
|---|---|---|
| HTTP 代理端口 | `127.0.0.1:8118` | 仅支持 CONNECT + 明文 HTTP（经 MITM），不支持 HTTP/1.1 absolute-form? —— **已确认：仅 CONNECT；非 CONNECT 返回 405** |
| SOCKS5 端口 | `127.0.0.1:1080` | 扩展不直接使用（上游链仍可用） |
| Web 端口 | `127.0.0.1:8899` | `GET /api/traces`、`GET/POST /api/config`，无 CORS 头（background fetch 不受限） |
| 配置路径 | 运行中 vproxy 用 `/etc/vproxy/config.json`；bridge PAC 读 `~/.vproxy/config.json` | 存在不一致，但流量分析模式走 fixed_servers 直连 :8118，不依赖 PAC |
| MITM CA 证书 | `/tmp/vproxy-ca.crt`（每次重启可能重新生成） | HTTPS 深抓包需用户信任该 CA（浏览器提示或系统证书库） |
| 抓包范围 | **仅 `INTERCEPT`/`MAP` 规则命中域名**产生完整 trace；普通 `PROXY`/`DIRECT` 仅盲转发无 trace | 因此「本地开发域名走流量分析」= 自动为其生成 `INTERCEPT` 规则 |
| trace 容量 | MemoryTraceFormatter 100 条 / `/tmp/vproxy-traces.jsonl`（JSONL 全量） | 抓包页读取 `/api/traces`（内存 100 条）+ JSONL 可作补充 |

### 2.2 数据模型（`frontend/src/types/trafficAnalysis.ts`，纯模块，可单测）

```ts
export type VProxyAction = "DIRECT" | "PROXY" | "INTERCEPT" | "MAP";

export interface TrafficRule {
  pattern: string;          // 域名/IP（DOMAIN）或 URL 前缀（URL）或进程名（PROCESS）
  action: VProxyAction;
  target?: string;          // MAP 时：file:// 或 http(s):// 目标
  enabled: boolean;
}

export interface TrafficAnalysisConfig {
  enabled: boolean;                        // 总开关
  upstreams: string[];                     // 如 ["socks5://192.168.50.31:1080", "http://127.0.0.1:8080"]
  rules: TrafficRule[];                    // 站点规则（DOMAIN 为主，支持 URL/PROCESS 高级类型）
  finalAction: "DIRECT" | "PROXY";         // FINAL 兜底动作，默认 "PROXY"
  directDns: boolean;                      // direct_dns 透传
  _meta?: { updatedAt: number };
}
```

- **Storage key:** `traffic_analysis`
- **规则 → vproxy rules 字符串转换** `buildVProxyRules(config): string[]`
  - `DOMAIN,<pattern>,<ACTION>[,<target>]`（pattern 含 `.` 视为域名，否则可加 `PROCESS,`/`URL,` 前缀类型）；
  - `FINAL,<finalAction>` 兜底；
  - 仅 `enabled === true` 的规则进入列表；
  - 校验：pattern 非空、action 合法、MAP 必须有 target、INTERCEPT 需要显式提示 CA 证书要求。
- **合并规则**：`resolveRulesForHost(config, host)` 返回该 host 命中的动作（最长后缀匹配 + 顺序优先），供 UI 预览。

### 2.3 消息协议（background 扩展）

| Message Type | Handling | Return Value | Behavior |
|---|---|---|---|
| `GET_TRAFFIC_ANALYSIS` | Async | `true` | 读 `traffic_analysis` 配置，返回 `{ success: true, config }` |
| `SAVE_TRAFFIC_ANALYSIS` | Async | `true` | 校验 → 写 `storage.local.traffic_analysis` → 若已启用则同步 vproxy `POST /api/config` → 返回 `{ success: true }` |
| `TOGGLE_TRAFFIC_ANALYSIS` | Async | `true` | 切换总开关 → 写入存储 → **切换 Chrome 代理到 `http://127.0.0.1:8118`（fixed_servers）或恢复原 profile** → 同步 vproxy 规则 → 返回 `{ success: true, enabled }` |
| `FETCH_VPROXY_TRACES` | Async | `true` | `fetch http://127.0.0.1:8899/api/traces`，返回 `{ success: true, traces: TraceEntry[] }` |
| `FETCH_VPROXY_CONFIG` | Async | `true` | `fetch http://127.0.0.1:8899/api/config`，返回 `{ success: true, vproxyConfig }`（用于校验/同步状态） |
| `CLEAR_VPROXY_TRACES` | Async | `true` | 调 vproxy（若支持）清空 trace；否则返回 `{ success: false, error: "vproxy 不支持清空" }` |
| *Other / Unknown* | N/A | `false` | 关闭通道，无副作用 |

### 2.4 代理切换（background/proxy.ts 增强）

- 新增内置 profile 模板 `vproxy_traffic`：`mode: "fixed_servers"`, `scheme: "http"`, `host: "127.0.0.1"`, `port: 8118`, `bypassList: DEFAULT_LAN_BYPASS`（保证 localhost/局域网永不进代理）。
- `TOGGLE_TRAFFIC_ANALYSIS { enabled: true }` 流程：
  1. 记录当前 `active_proxy_id` 到 `traffic_analysis._meta.previousProxyId`（首次切换时）；
  2. 应用 `vproxy_traffic` profile（`applyProxyConfig`）；
  3. 同步 vproxy 规则（`buildVProxyRules` → `POST /api/config`）。
- `enabled: false` 流程：
  1. 恢复 `_meta.previousProxyId` 对应的 profile（或默认 direct）；
  2. 可选：将 vproxy 规则还原为「仅 DIRECT/PROXY 无 INTERCEPT」或保留（不强制）。
- **边界**：若 vproxy 未运行（:8118 不可达），开启前先检查 `fetch http://127.0.0.1:8118` 连通性，失败则拒绝开启并提示安装/启动 vproxy。

### 2.5 manifest 权限

`permissions` 已含 `"proxy"`；`host_permissions` 已含 `<all_urls>`（覆盖 127.0.0.1:8899/8118）。无需新增权限。

## 3. 不支持的场景（Out of Scope）

- **非 MITM 域名的普通流量抓包**：vproxy 现状仅 INTERCEPT/MAP 域名产生 trace；普通 PROXY 隧道无 trace。需要「全流量抓包」须修改 vproxy（另立 spec）。
- **修改 vproxy 本体行为**：本 spec 只调用 vproxy 现有 `/api/config` 与 `/api/traces`，不改 vproxy 代码。
- **HTTPS 抓包证书自动安装**：MITM 深抓包需要用户手动信任 `/tmp/vproxy-ca.crt`（UI 提供下载/说明，不做系统级自动安装）。
- **PAC 与 vproxy 配置自动双向同步**：流量分析模式不依赖 PAC；两套配置保持一致属后续增强。
- **在线回放 / 编辑请求重发**（whistle 高级功能）：仅抓取与展示。
- **WebSocket / 二进制 body 深解析**：以文本形式展示，不解析协议。

## 4. Acceptance Criteria (BDD)

### Feature: 流量分析规则配置与代理切换

#### Scenario 1: [SPEC-TA-001] 保存规则生成 vproxy 配置
- **Given** 用户配置规则：`google.com → PROXY`、`dev.local → INTERCEPT`，`FINAL = PROXY`
- **When** 调用 `buildVProxyRules(config)`
- **Then** 生成 `["DOMAIN,google.com,PROXY", "DOMAIN,dev.local,INTERCEPT", "FINAL,PROXY"]`；禁用项被剔除；非法输入（空 pattern / MAP 无 target）抛错
- **Mapped Test:** `testings/trafficAnalysis/buildRules.test.ts:TestTA_BuildRules`

#### Scenario 2: [SPEC-TA-002] 开启流量分析切换到 vproxy 端口
- **Given** 当前 active profile 为 `vproxy_pac_default`，vproxy :8118 可达
- **When** 调用 `TOGGLE_TRAFFIC_ANALYSIS { enabled: true }`
- **Then** Chrome 代理被设为 fixed_servers `http://127.0.0.1:8118`；`previousProxyId` 记录为 `vproxy_pac_default`；存储中 `enabled === true`
- **Mapped Test:** `testings/trafficAnalysis/toggle.test.ts:TestTA_ToggleOn`

#### Scenario 3: [SPEC-TA-003] 关闭流量分析恢复原代理
- **Given** 流量分析已开启，`previousProxyId = vproxy_pac_default`
- **When** 调用 `TOGGLE_TRAFFIC_ANALYSIS { enabled: false }`
- **Then** 恢复 `vproxy_pac_default` profile；存储中 `enabled === false`；vproxy 规则不再强制含 INTERCEPT
- **Mapped Test:** `testings/trafficAnalysis/toggle.test.ts:TestTA_ToggleOffRestore`

#### Scenario 4: [SPEC-TA-004] vproxy 不可达时拒绝开启
- **Given** vproxy :8118 未运行（connect 失败）
- **When** 调用 `TOGGLE_TRAFFIC_ANALYSIS { enabled: true }`
- **Then** 返回 `{ success: false, error: "vproxy 未运行…" }`；代理不被切换；`enabled` 保持 false
- **Mapped Test:** `testings/trafficAnalysis/toggle.test.ts:TestTA_UnreachableRejected`

### Feature: 抓包查看

#### Scenario 5: [SPEC-TA-005] 拉取抓包列表
- **Given** vproxy :8899 运行且有 trace 数据
- **When** 调用 `FETCH_VPROXY_TRACES`
- **Then** 返回 `TraceEntry[]`（含 method/host/path/status/latency/reqHeaders/reqBody/respHeaders/respBody）
- **Mapped Test:** `testings/trafficAnalysis/traces.test.ts:TestTA_FetchTraces`

#### Scenario 6: [SPEC-TA-006] 抓包列表渲染与详情展开
- **Given** Options「流量分析 → 抓包」子页已打开
- **When** 渲染 trace 表格并点击某行
- **Then** 表格显示 Method/Host/Path/Status/Latency；展开显示请求头/响应头/Body（超长截断 + 全文查看）
- **Mapped Test:** `testings/trafficAnalysis/traces.test.ts:TestTA_RenderDetail`

#### Scenario 7: [SPEC-TA-007] 站点规则分流预览
- **Given** 规则含 `dev.local → INTERCEPT`、`google.com → PROXY`
- **When** 调用 `resolveRulesForHost(config, "dev.local")`
- **Then** 返回 `INTERCEPT`；`google.com` 返回 `PROXY`；未匹配 host 返回 `FINAL` 动作
- **Mapped Test:** `testings/trafficAnalysis/buildRules.test.ts:TestTA_ResolveHost`

#### Scenario 8: [SPEC-TA-008] 本地开发域名自动加 INTERCEPT 提示
- **Given** 用户新增规则目标为本地开发域名（如 `*.dev`, `localhost.*`, 局域网 IP）
- **When** 保存规则且 action 为 PROXY/DIRECT
- **Then** UI 提示「本地开发域名建议用 INTERCEPT 才能被抓包分析」；若用户选择 INTERCEPT，则提示需信任 `/tmp/vproxy-ca.crt`
- **Mapped Test:** `testings/trafficAnalysis/buildRules.test.ts:TestTA_DevDomainHint`

## 5. UI 设计（Options Page）

新增第 8 个 tab「流量分析」（位于「请求头」之后）：
- **顶部总开关**：「流量分析」开关（切换 `TOGGLE_TRAFFIC_ANALYSIS`）；开启状态显示当前代理为 `vproxy :8118`。
- **子页切换**：Tab 内次级「规则 / 抓包」两个子页。

### 5.1 规则子页
- **Upstreams 列表**：每行一个上游地址（`socks5://` / `http://`），可增删。
- **站点规则列表**：每行 `pattern + action 下拉(DIRECT/PROXY/INTERCEPT/MAP) + target(仅 MAP) + enabled 开关 + 删除`；可新增。
  - 规则类型自动推断：含 `/` → URL；大写前缀 `PROCESS:` → PROCESS；其余 → DOMAIN。
- **FINAL 兜底**：下拉 DIRECT/PROXY。
- **保存**：`SAVE_TRAFFIC_ANALYSIS`；保存后若已启用则同步 vproxy；Toast 提示。
- **高级说明**：INTERCEPT 需信任 CA `/tmp/vproxy-ca.crt`（附「打开证书目录」按钮——仅提示路径，不执行系统命令）。

### 5.2 抓包子页
- **工具栏**：刷新按钮 + 自动刷新开关（3s）+ 清空（若 vproxy 支持）。
- **表格**：Method | Host | Path | Status | Latency | Time；点击行展开详情（Req/Resp Headers 键值表 + Body 预览，>8KB 截断并显示「下载完整 Body」）。
- **空态**：未抓包时提示「将需要分析的域名配置为 INTERCEPT 并开启流量分析」。
- **只读说明**：普通 PROXY/DIRECT 域名不产生 trace，仅 INTERCEPT/MAP 命中域名可被抓取。

## 6. 场景断言汇总
- [x] SPEC-TA-001 保存规则生成 vproxy 配置
- [x] SPEC-TA-002 开启流量分析切到 vproxy 端口
- [x] SPEC-TA-003 关闭恢复原代理
- [x] SPEC-TA-004 vproxy 不可达拒绝开启
- [x] SPEC-TA-005 拉取抓包列表
- [x] SPEC-TA-006 渲染与详情展开
- [x] SPEC-TA-007 站点规则分流预览
- [x] SPEC-TA-008 本地开发域名 INTERCEPT 提示
