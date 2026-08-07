# Module Spec: Request Headers（请求头注入）

## 1. Overview
为扩展增加「自定义请求 Header 注入」能力，面向**调用链追踪**与**灰度/金丝雀测试**场景。
用户可自由配置任意 HTTP 请求头的 key/value，并选择作用域：
- **全局默认**：所有匹配的请求都注入该组 header；
- **按域名覆盖**：特定域名（含最长后缀匹配）可注入额外 header 或**覆盖**全局同名 key 的值。

采用 Chrome MV3 `declarativeNetRequest`（`modifyHeaders` action）实现：声明式规则、不阻塞网络线程、
性能最优。配置经 `chrome.storage.local` 持久化，变更时通过 `updateDynamicRules` 重建规则。

## 2. Interface / API Contract

### 2.1 数据模型（`frontend/src/types/requestHeaders.ts`，纯模块，可单测）

```ts
export interface HeaderKV {
  key: string;      // header 名，大小写不敏感
  value: string;
}

export interface HostHeaderRule {
  host: string;     // "" 表示全局默认；否则为域名（不含协议/路径）
  headers: HeaderKV[];
  enabled: boolean;
}

export interface RequestHeadersConfig {
  global: HostHeaderRule;
  perHost: Record<string, HostHeaderRule>;
  _meta?: { updatedAt: number };
}
```

- **Storage key:** `request_headers`
- **解析函数：** `resolveRequestHeaders(config, rawUrl): HeaderKV[]`
  1. 取 `hostFromUrl` 的 hostname；
  2. 按最长后缀匹配 `perHost[host]`（与 Site Rules 同款逻辑）；命中且 `enabled` 则取其 headers；
  3. 合并顺序：**先 global headers，再 perHost headers**；同名 key 以 perHost 值为准（覆盖）；
  4. `global.enabled === false` 时，仅 perHost 命中的规则生效（perHost 自身仍受其 `enabled` 控制）；
  5. 整体无匹配或 global/perHost 均 disabled → 返回空数组。

### 2.2 消息协议（background 扩展）

| Message Type | Handling | Return Value | Behavior |
|---|---|---|---|
| `GET_REQUEST_HEADERS` | Async | `true` | 读取 `request_headers`，返回 `{ success: true, config }` |
| `SAVE_REQUEST_HEADERS` | Async | `true` | 校验 config → 写 `storage.local.request_headers` → 重建 DNR 规则 → 广播 `REQUEST_HEADERS_UPDATED`，返回 `{ success: true }` |
| `TOGGLE_REQUEST_HEADERS` | Async | `true` | 切换全局 `enabled` 开关 → 写存储 → 重建规则 → 广播，返回 `{ success: true, enabled }` |
| *Other / Unknown* | N/A | `false` | 关闭通道，无副作用 |

### 2.3 declarativeNetRequest 规则生成（background）

每次配置变更后重建动态规则：
- **全局规则**：`condition.urlFilter` 匹配所有 http/https，`action.modifyHeaders` 为每个全局 header 生成 `{ header, operation: "set", value }`；`priority: 1`。
- **每域名规则**：`condition.urlFilter` 用 `||{host}`（匹配主域+子域），headers 为「合并后的完整集合」（global + perHost，perHost 覆盖同名）；`priority: 2`（高于全局，确保覆盖语义）。
- **开关**：对应 host 的 `enabled === false` 或 headers 为空 → 不生成该规则；全局关闭且无 perHost → 清空全部规则（空规则数组）。
- **规则 ID 稳定性**：使用递增计数器或 host 派生 hash，确保 `updateDynamicRules` 的 remove 列表与 add 列表一致，避免残留规则。
- **边界**：header key 仅允许 `[A-Za-z0-9!#$%&'*+.^_`|~-]`；value 不允许 CR/LF（防 header 注入）。

### 2.4 manifest 权限变更
`permissions` 增加 `"declarativeNetRequest"`。（已有 `<all_urls>` host_permissions 可满足域名匹配。）

## 3. 不支持的场景（Out of Scope）
- 移除/拦截响应头（仅注入请求头）。
- 动态模板值（如 `{timestamp}`、随机 traceId）——value 为静态字符串。
- 修改受限安全头（`Cookie`、`Host`、`Content-Length` 等浏览器保留/禁止的头）——声明式 API 限制，UI 侧提示用自定义头（`X-*`）。
- 基于 body/query 条件匹配。

## 4. Acceptance Criteria (BDD)

### Feature: 请求头注入

#### Scenario 1: [SPEC-RH-001] 全局默认注入
- **Given** 用户配置全局 header `{ X-Gray: "canary-1" }` 且全局 enabled
- **When** 页面发起对 `https://example.com/api` 的请求
- **Then** DNR 动态规则生成；该请求携带 `X-Gray: canary-1`
- **Mapped Test:** `testings/requestHeaders/resolve.test.ts:TestRH_GlobalInject`

#### Scenario 2: [SPEC-RH-002] 按域名覆盖同名 key
- **Given** 全局 `{ X-Gray: "canary-1" }`，perHost `example.com` = `{ X-Gray: "canary-2", X-Trace: "abc" }`
- **When** 请求 `https://example.com/x`
- **Then** 合并结果为 `X-Gray: canary-2`（覆盖）+ `X-Trace: abc`（新增）；其他域名请求仍为 `X-Gray: canary-1`
- **Mapped Test:** `testings/requestHeaders/resolve.test.ts:TestRH_PerHostOverride`

#### Scenario 3: [SPEC-RH-003] 最长后缀匹配
- **Given** perHost 仅配置 `example.com`
- **When** 请求 `https://api.example.com/x`
- **Then** 命中 `example.com` 规则（最长后缀），注入对应 header
- **Mapped Test:** `testings/requestHeaders/resolve.test.ts:TestRH_LongestSuffix`

#### Scenario 4: [SPEC-RH-004] 全局关闭时仅 perHost 生效
- **Given** `global.enabled = false`，perHost `example.com` enabled 且有 headers
- **When** 请求 `https://example.com/x`
- **Then** 注入 perHost 的 headers；`https://other.com` 无任何注入
- **Mapped Test:** `testings/requestHeaders/resolve.test.ts:TestRH_GlobalDisabled`

#### Scenario 5: [SPEC-RH-005] 非法输入拒绝
- **Given** 配置包含空 key、含 `\r\n` 的 value、或非 `X-*` 受限头
- **When** 调用 `SAVE_REQUEST_HEADERS`
- **Then** 返回 `{ success: false, error: "..." }`，存储与 DNR 规则不变
- **Mapped Test:** `testings/requestHeaders/resolve.test.ts:TestRH_InvalidInput`

#### Scenario 6: [SPEC-RH-006] UI 配置持久化与重启恢复
- **Given** 用户在 Options → 请求头 页配置规则并保存
- **When** 扩展 Service Worker 重启
- **Then** 从 `storage.local` 读取配置并重建 DNR 规则，注入行为保持不变
- **Mapped Test:** `testings/requestHeaders/resolve.test.ts:TestRH_PersistRestore`

## 5. UI 设计（Options Page）
新增第 7 个 tab「请求头」（位于「站点规则」之后）：
- **全局默认区**：开关 + key/value 行列表（可增删），提示「所有请求注入」。
- **按域名覆盖区**：域名输入 + 该域下 key/value 行列表（可增删）；多条覆盖规则各自成卡片。
- **保存按钮**：写入 `SAVE_REQUEST_HEADERS`；保存后 Toast 提示「已应用」。
- **提示文案**：注入仅对扩展有 host 权限的站点生效；敏感标准头（Cookie 等）可能被浏览器拒绝，建议使用 `X-*` 自定义头。
- 与 Site Rules 共用「全局 + 按域名最长后缀匹配」的交互心智。

## 6. 场景断言汇总
- [x] SPEC-RH-001 全局注入
- [x] SPEC-RH-002 perHost 覆盖
- [x] SPEC-RH-003 最长后缀
- [x] SPEC-RH-004 全局关闭仅 perHost
- [x] SPEC-RH-005 非法输入拒绝
- [x] SPEC-RH-006 持久化与重启恢复
