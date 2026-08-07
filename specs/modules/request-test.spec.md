# Module Spec: Request Test（Postman 式请求测试）+ 选项页整合

## 1. Overview

对 Options 页做一次 UI 整合，并新增 **Postman 式请求测试**能力：

1. **Tab 整合**：
   - 「桥接」tab 并入「通用」tab（桥接配置：API Token + Native Messaging Host 安装指引）；
   - 「通知」tab 并入「通用」tab（通知角标设置 + 最近事件）；
   - 「请求头」tab 改名为「请求」，内含两个子页：**请求头**（原有 header 注入配置）与 **请求测试**（新增 Postman 式 HTTP 客户端）。
   - 「站点规则」tab 改名为「权限」（内容不变：按域名的注入/绕过代理/Cookie 权限开关）。
   - 整合后 tab 顺序：`通用 / 代理 / 权限 / 请求 / 流量分析 / 高级`。
2. **请求测试**：在「请求 → 请求测试」子页内，用户可输入 URL、选择方法（GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS）、
   配置请求头与请求体，点击发送后通过 **background service worker 的 `fetch`**（`<all_urls>` host_permissions 已覆盖，
   天然绕过页面 CORS 限制）发出请求，并展示响应（状态码、延迟、响应头、响应体），对标 Postman 的 HTTP 客户端体验。

**核心设计（用户已确认）：**
- 请求由 background 发起（非页面 fetch），因此不会受被测试站点 CORS 策略限制；重定向默认 `follow`。
- 请求测试与「流量分析」联动：若当前 Chrome 代理已切到 vproxy，发出的测试请求会经代理，命中 `INTERCEPT` 规则时也会被抓包——测试结果与线上行为一致。
- 超时保护：默认 25s 超时（MV3 service worker 事件周期限制），可注入。
- 响应体读取上限 **1MB**：超过则截断并标记 `truncated`，避免大响应拖垮 worker。

## 2. Interface / API Contract

### 2.1 数据模型（`frontend/src/types/requestTest.ts`，纯模块，可单测）

```ts
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export const HTTP_METHODS: HttpMethod[];
export const METHODS_WITH_BODY: ReadonlySet<HttpMethod>;   // POST/PUT/PATCH/DELETE

export interface RequestTestComposer {
  method: HttpMethod;
  url: string;            // 必填，http(s):// 绝对地址
  headers: HeaderKV[];    // 复用 requestHeaders.HeaderKV
  body: string;           // 仅 METHODS_WITH_BODY 时生效
}

export interface RequestTestResult {
  ok: boolean;
  status: number;          // 失败时为 0
  statusText: string;
  finalUrl: string;        // 重定向后最终 URL（response.url）
  latencyMs: number;
  headers: [string, string][];
  body: string;
  truncated: boolean;
  error?: string;          // 校验失败 / 网络错误 / 超时信息
}

export const MAX_BODY_CAPTURE = 1024 * 1024;  // 1MB
export const DEFAULT_TIMEOUT_MS = 25_000;
```

- **校验** `validateRequestTestInput(composer): string | null`
  1. `method` 必须在 `HTTP_METHODS` 内；
  2. `url` 非空且能被 `new URL` 解析，`protocol` 必须为 `http:` 或 `https:`；
  3. 每个非空 header 行调用 `validateHeader`（复用 requestHeaders 纯模块），任一非法即返回错误信息。
- **构建 fetch 参数** `buildFetchInit(composer): RequestInit`
  - `method` 透传；`headers` 为「跳过空 key」后的 Record（值含换行已在校验拦截）；
  - `body` 仅在 `METHODS_WITH_BODY.has(method)` 时设置（GET/HEAD/OPTIONS 不携带 body）。
- **响应体读取** `readBodyWithCap(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<{ text: string; truncated: boolean }>`
  - 空流 / 无 body → `{ text: "", truncated: false }`；
  - 按 chunk 累加，超过 `maxBytes` 立即 `cancel()` 停止，标记 `truncated: true`；
  - 用 `TextDecoder` 解码（UTF-8，`stream: true` 以兼容跨 chunk 多字节字符）。
- **展示格式化** `formatBodyForDisplay(body: string, contentType?: string): string`
  - `contentType` 含 `json` 且 body 可 `JSON.parse` → `JSON.stringify(obj, null, 2)` 美化；否则原样返回。
- **执行** `runRequestTest(composer, opts?): Promise<RequestTestResult>`
  - `opts: { fetchImpl?: typeof fetch; timeoutMs?: number }`（默认 `globalThis.fetch` / `DEFAULT_TIMEOUT_MS`，便于单测注入）；
  - 校验失败 → 直接返回 `{ ok:false, error }`（不发请求）；
  - 用 `AbortController` + `setTimeout` 实现超时；超时后 `abort()` 并返回 `{ ok:false, error: "请求超时（>25s）" }`；
  - `fetch(url, init)` 抛错（DNS 失败、连接拒绝、forbidden header 等）→ `{ ok:false, error: err.message }`；
  - 成功 → 记录 `latencyMs`（fetch 开始到响应头返回）、`status/statusText/finalUrl`、响应头数组、
    `readBodyWithCap(response.body, MAX_BODY_CAPTURE)` 的文本与截断标记；`ok` 沿用 `response.ok`。

### 2.2 消息协议（background 扩展）

| Message Type | Handling | Return Value | Behavior |
|---|---|---|---|
| `TEST_REQUEST` | Async | `true` | 校验 composer → `runRequestTest` → 返回 `RequestTestResult` |
| *Other / Unknown* | N/A | `false` | 关闭通道，无副作用 |

### 2.3 manifest 变更
无新增权限。`<all_urls>` host_permissions + `tabs` 已满足 background fetch 与 UI。

## 3. 不支持的场景（Out of Scope）
- 上传文件/FormData/多部分表单（body 仅支持文本字符串）。
- 响应体二进制预览（仅 UTF-8 文本解码）。
- 保存请求历史/集合（本期不做，仅当前 composer 状态）。
- WebSocket 测试。
- 修改浏览器禁止设置的请求头（`Cookie`/`Host`/`Content-Length` 等）——由 fetch 本身拒绝，错误信息直接展示。

## 4. Acceptance Criteria (BDD)

### Feature: Postman 式请求测试

#### Scenario 1: [SPEC-RT-001] 输入校验拒绝非法请求
- **Given** composer 的 URL 为空 / 为 `ftp://` / header 含非法 key 或含 `\r\n` 的 value / method 不在枚举内
- **When** 调用 `validateRequestTestInput`
- **Then** 返回非空错误信息，`runRequestTest` 不发起请求
- **Mapped Test:** `testings/requestTest/build.test.ts:TestRT_Validate`

#### Scenario 2: [SPEC-RT-002] 构建 fetch 参数
- **Given** composer：`POST https://example.com/api` + headers `[{X-Trace:"abc"}, {空key:""}]` + body `{"a":1}`
- **When** 调用 `buildFetchInit`
- **Then** `method="POST"`、`body` 原样保留、headers 仅含 `X-Trace: abc`（空 key 跳过）；GET/HEAD/OPTIONS 不携带 body
- **Mapped Test:** `testings/requestTest/build.test.ts:TestRT_BuildFetchInit`

#### Scenario 3: [SPEC-RT-003] 发送成功返回规范化响应
- **Given** 注入 fake fetch 返回 `200 OK` + `Content-Type: text/plain` + body `"hello"`
- **When** 调用 `runRequestTest`
- **Then** `ok=true`、`status=200`、`statusText="OK"`、`latencyMs>=0`、响应头含 Content-Type、`body="hello"`、`truncated=false`
- **Mapped Test:** `testings/requestTest/run.test.ts:TestRT_Success`

#### Scenario 4: [SPEC-RT-004] 大响应体截断
- **Given** fake fetch 返回大于 `MAX_BODY_CAPTURE` 的流
- **When** 调用 `runRequestTest`
- **Then** `truncated=true`，`body.length` 不超过上限
- **Mapped Test:** `testings/requestTest/run.test.ts:TestRT_Truncate`

#### Scenario 5: [SPEC-RT-005] JSON 响应格式化展示
- **Given** 响应 body `{"b":2,"a":1}` + `Content-Type: application/json`
- **When** 调用 `formatBodyForDisplay`
- **Then** 返回缩进美化后的 JSON 字符串；非 JSON content-type 原样返回
- **Mapped Test:** `testings/requestTest/format.test.ts:TestRT_Format`

#### Scenario 6: [SPEC-RT-006] 网络错误处理
- **Given** fake fetch 抛 `TypeError: fetch failed`（连接拒绝）
- **When** 调用 `runRequestTest`
- **Then** 返回 `{ ok:false, error: "fetch failed" }`，`status=0`
- **Mapped Test:** `testings/requestTest/run.test.ts:TestRT_NetworkError`

#### Scenario 7: [SPEC-RT-007] 超时中止
- **Given** fake fetch 返回永不 resolve 的 promise，`timeoutMs=50`
- **When** 调用 `runRequestTest`
- **Then** 返回 `{ ok:false, error 含"超时" }`，且 signal 已被 abort
- **Mapped Test:** `testings/requestTest/run.test.ts:TestRT_Timeout`

### Feature: 选项页整合

#### Scenario 8: [SPEC-RT-008] 选项页整合
- **Given** Options 页已打开
- **When** 渲染 tab 导航
- **Then** 仅展示 `通用 / 代理 / 权限 / 请求 / 流量分析 / 高级`；「通用」内含桥接配置（Token + 安装指引）与通知设置；
  「请求」tab 内含「请求头」「请求测试」两个子页；「权限」为原「站点规则」内容；
  无「桥接」「通知」「请求头」「站点规则」独立 tab
- **Mapped Test:** `testings/requestTest/ui.test.ts:TestRT_OptionsTabs`（静态断言：tab 清单与子页结构）

## 5. UI 设计（Options Page）

### 5.1 Tab 结构（整合后）

| TabKey | 标题 | 内容 |
|---|---|---|
| `general` | 通用 | 桥接配置（API Token + Native Messaging Host 安装指引）+ 通知设置/最近事件 |
| `proxy` | 代理 | ProxyManager（不变） |
| `siterules` | 权限 | SiteRulesManager（原「站点规则」，仅改名） |
| `requestheaders` | 请求 | 子页「请求头」（原 RequestHeadersManager）+ 子页「请求测试」（新 RequestTestPanel） |
| `traffic` | 流量分析 | TrafficAnalysisManager（不变） |
| `advanced` | 高级 | 调试日志（不变） |

- 「请求」tab 用与 TrafficAnalysisManager 一致的内嵌子页切换（次级 tab）。
- `bridge`/`notifications` 两个 TabKey 从导航中移除，其 JSX 移入 `general` 渲染分支。

### 5.2 请求测试子页
- **Composer 区**：方法下拉（GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS）+ URL 输入框；
  header KV 行编辑器（复用 `.hdr-kv-row` 样式，可增删）；body textarea（仅 `METHODS_WITH_BODY` 显示）。
- **发送**：「发送」按钮，发送中禁用并显示「发送中…」；使用 `TEST_REQUEST` 消息。
- **响应区**：状态行（`{status} {statusText}` + 延迟 `latencyMs`ms + 最终 URL）；响应头键值表；
  body 展示 `<pre>`（`formatBodyForDisplay` 美化，`truncated` 时显示「响应体过大，仅显示前 1MB」提示）；错误信息红色展示。
- **空态**：未发送过时提示「配置请求后点击发送」。

## 6. 场景断言汇总
- [ ] SPEC-RT-001 输入校验拒绝非法请求
- [ ] SPEC-RT-002 构建 fetch 参数
- [ ] SPEC-RT-003 发送成功返回规范化响应
- [ ] SPEC-RT-004 大响应体截断
- [ ] SPEC-RT-005 JSON 响应格式化展示
- [ ] SPEC-RT-006 网络错误处理
- [ ] SPEC-RT-007 超时中止
- [ ] SPEC-RT-008 选项页整合
