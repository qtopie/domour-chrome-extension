# Spec: NMH Install Guide Banner

- **Feature:** Native Messaging Host 安装引导 UI
- **Status:** DRAFT — Awaiting `APPROVE`
- **Affected Files:**
  - `frontend/src/background/index.ts` — 上报细化连接状态
  - `frontend/src/App.tsx` — 消费新状态，渲染 Banner
  - `frontend/src/components/NmhInstallBanner.tsx` — 新增引导组件

---

## 1. 状态机定义

Background Service Worker 维护一个连接状态，细化为三个枚举值：

| 状态 | 含义 | 触发条件 |
|------|------|---------|
| `CONNECTED` | NMH 已注册且连接正常 | `connectNative()` 成功，且收到首条消息或 AUTH 确认 |
| `DISCONNECTED` | NMH 已注册但断开 | `onDisconnect` 触发，且 `lastError.message` **不含** `"not found"` 关键字 |
| `NOT_INSTALLED` | NMH Manifest 未注册 | `onDisconnect` 触发，且 `lastError.message` **含** `"not found"` 关键字 |

### 状态判断逻辑（伪代码）

```ts
nativePort.onDisconnect.addListener(() => {
  const errMsg = chrome.runtime.lastError?.message ?? "";
  const status = errMsg.includes("not found")
    ? "NOT_INSTALLED"
    : "DISCONNECTED";
  notifyPanelStatus(status);
});
```

---

## 2. Background → Panel 消息协议扩展

在现有 `CONNECTION_STATUS` 消息中扩展 `reason` 字段：

```ts
// 现有
{ type: "CONNECTION_STATUS", connected: boolean }

// 扩展后（向后兼容，connected=false 时附带 reason）
{ type: "CONNECTION_STATUS", connected: boolean, reason?: "NOT_INSTALLED" | "DISCONNECTED" }
```

Panel 在 `messageListener` 中读取 `reason`，更新 `bridgeStatus` state。

---

## 3. Panel UI 状态

`App.tsx` 新增状态变量：

```ts
type BridgeStatus = "CONNECTED" | "DISCONNECTED" | "NOT_INSTALLED";
const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>("DISCONNECTED");
```

- 初始化时通过 `CHECK_CONNECTION` 消息获取初始状态（background 需同步返回 `reason`）
- 通过 `CONNECTION_STATUS` 消息实时更新

> `isConnected` 保持兼容，等于 `bridgeStatus === "CONNECTED"`

---

## 4. NmhInstallBanner 组件规范

### 4.1 渲染条件

仅当 `bridgeStatus === "NOT_INSTALLED"` 时渲染，插入在 `<header>` 和 `<nav>` 之间。

### 4.2 视觉规范

- 背景：`amber/warning` 色调的半透明渐变，带左侧竖线强调（与现有设计系统 dark theme 协调）
- 两个 CTA 按钮并排：
  - **主按钮**：「🖥 安装 Cosmos Assistant」→ 打开 cosmos-assistant GitHub Releases 链接
  - **次按钮**：「📦 手动安装 Binary」→ 展开说明步骤（inline 展开，非新页面）
- 底部：「重试连接」文字链接，触发 `RECONNECT` 消息

### 4.3 手动安装步骤展开内容

点击「手动安装 Binary」后，在 banner 内展开三步骤：

```
步骤 1: 从 GitHub Releases 下载对应平台的 binary
        [↗ 打开下载页] (链接至 GitHub Releases)

步骤 2: 在终端运行安装脚本
        $ ./install.sh
        (代码块，可一键复制)

步骤 3: 重启浏览器后点击「重试连接」
        [重试连接]
```

### 4.4 Cosmos Assistant 路径说明文字

点击「安装 Cosmos Assistant」按钮后 banner 区域展示：

```
安装 Cosmos Assistant 桌面应用后，
在应用的「Setup 向导」中完成 Browser Bridge 配置，
即可自动注册 Native Messaging Host。
```

---

## 5. 场景断言（Acceptance Criteria）

| # | 场景 | 期望结果 |
|---|------|---------|
| AC-1 | NMH 未注册，打开 Side Panel | Banner 出现在 header 下方，显示两个安装路径按钮 |
| AC-2 | NMH 已注册但 binary crash | Banner **不出现**，仅 header 显示 `OFFLINE`，footer 显示「重试连接」 |
| AC-3 | NMH 已连接 | Banner **不出现**，UI 正常显示 |
| AC-4 | 点击「手动安装 Binary」 | Banner 内联展开三步骤，不跳转新页面 |
| AC-5 | 点击「安装 Cosmos Assistant」 | 新 Tab 打开 cosmos-assistant Releases 链接 |
| AC-6 | 点击「重试连接」 | 触发 `RECONNECT` 消息，若成功则 Banner 消失 |
| AC-7 | 从 `NOT_INSTALLED` 成功连接 | `CONNECTION_STATUS { connected: true }` 收到后 Banner 自动消失 |

---

## 6. 不在本 Spec 范围内

- cosmos-assistant 内部的 Setup 向导实现（属于另一个项目）
- GitHub CI 自动发布 binary（独立任务）
- Windows 平台的注册表注册路径
