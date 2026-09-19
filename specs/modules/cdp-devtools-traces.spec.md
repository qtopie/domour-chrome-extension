# Module Spec: Chrome DevTools Protocol (CDP) Console & Network Trace Collector

- **Module Name:** `cdp-devtools-traces`
- **Scope:** `domour-chrome-extension` Background Service Worker (`automation.ts`), Native Bridge (`main.go`), and MCP Tool Declarations
- **Status:** APPROVED

---

## 1. Background & Problem Statement

When AI agents perform automated browser navigation, UI testing, or end-to-end site verification via `domour-chrome-mcp`, the current toolset only supports visual snapshots (`browser_take_screenshot`), DOM extraction (`browser_snapshot`), and basic user interactions (`browser_click`, `browser_type`).

However, automated agents cannot diagnose web page issues effectively without access to:
1. **Console Logs & Exceptions:** Uncaught JavaScript exceptions (e.g. CSP violations, React render crashes, syntax errors, Wails IPC binding failures).
2. **Network Request Traces & Status Codes:** Failed API calls (HTTP 4xx/5xx, CORS blocks, connection refused, pending stream responses) and timing bottlenecks.

This module adds real-time Chrome DevTools Protocol (CDP) console log collection and network request/HAR trace collection to `domour-chrome-extension` and exposes them as first-class MCP tools.

---

## 2. Architecture & Invariants

1. **CDP Debugger Lifecycle Management:**
   - Chrome's `chrome.debugger` API attaches to target tabs dynamically during automation jobs.
   - Domains enabled: `Console.enable`, `Log.enable`, `Network.enable`.
   - Guaranteed Detach: Every attached tab is automatically detached (`chrome.debugger.detach`) upon job completion, timeout, or tab close to prevent persistent debug banners or resource leaks.
2. **Console Log Buffering & Filtering:**
   - Captures `Runtime.consoleAPICalled` and `Log.entryAdded`.
   - Structured format: `timestamp`, `level` (`debug` | `log` | `info` | `warn` | `error`), `text`, `source`, `url`, `line`.
   - MCP tool `browser_get_console_logs` supports filtering by `min_level` (`info`, `warn`, `error`) and clearing the buffer via `clear: true`.
3. **Network Trace & HAR 1.2 Collector:**
   - Captures `Network.requestWillBeSent`, `Network.responseReceived`, `Network.loadingFailed`, and `Network.loadingFinished`.
   - Records method, URL, HTTP status, mimeType, request/response headers, timing durations, and error descriptions (e.g., `net::ERR_CONNECTION_REFUSED`).
   - MCP tool `browser_get_network_logs` supports returning raw request traces or full HAR 1.2 compliant JSON export (`include_har: true`).
4. **Localhost Instant-Complete Resolution:**
   - Fixes the race condition in `createTabWithRetry`: if a local or fast page (e.g. `http://127.0.0.1:8080/`) transitions to `status: "complete"` before `chrome.tabs.onUpdated` listener is registered, evaluate `tab.status === "complete"` immediately to prevent false 30-second timeouts.
5. **Security & Zero Unused Permissions Policy:**
   - Uses `debugger` permission actively for log and network trace collection.
   - All captured logs and traces are scoped strictly to the automated tab requested by the caller.

---

## 3. Interface & MCP API Contract

### Tool 1: `browser_get_console_logs`
- **Description:** Retrieve browser console logs, warnings, and uncaught exceptions for a target web page.
- **Parameters:**
  - `url` (string, required): Target URL of the page.
  - `min_level` (string, optional, default: `"info"`): Minimum log level to return (`"debug"`, `"info"`, `"warn"`, `"error"`).
  - `clear` (boolean, optional, default: `false`): Whether to clear the buffered logs after retrieval.
- **Output:**
  ```json
  [
    {
      "timestamp": 1788945600123,
      "level": "error",
      "text": "Failed to load resource: net::ERR_CONNECTION_REFUSED",
      "url": "http://127.0.0.1:8080/api/v1/health",
      "line": 42
    }
  ]
  ```

### Tool 2: `browser_get_network_logs`
- **Description:** Retrieve HTTP/HTTPS network request traces, status codes, failed requests, and timing information for a target web page.
- **Parameters:**
  - `url` (string, required): Target URL of the page.
  - `filter_type` (string, optional, default: `"all"`): Filter by resource type (`"all"`, `"xhr"`, `"fetch"`, `"document"`, `"script"`, `"stylesheet"`, `"image"`).
  - `include_har` (boolean, optional, default: `false`): When true, returns standard HAR 1.2 format JSON.
  - `clear` (boolean, optional, default: `false`): Whether to clear the buffered traces after retrieval.
- **Output:**
  ```json
  [
    {
      "requestId": "1002.1",
      "url": "http://127.0.0.1:8080/assets/index.js",
      "method": "GET",
      "status": 200,
      "statusText": "OK",
      "mimeType": "application/javascript",
      "durationMs": 1.25,
      "failed": false
    }
  ]
  ```

---

## 4. Acceptance Criteria (BDD)

### SPEC-CDP-001: Console Log Collection via MCP
- **Given** The browser opens a web page that executes `console.warn("warning test")` and `console.error("error test")`
- **When** The agent calls MCP tool `browser_get_console_logs` with `url` and `min_level: "warn"`
- **Then** The response returns both the warning and error log entries with accurate levels and message texts, excluding lower severity debug/info logs.

### SPEC-CDP-002: Network Request Tracing & Error Capture
- **Given** The browser navigates to a web page that performs asynchronous fetch requests, where one endpoint fails with HTTP 404 or connection refused
- **When** The agent calls MCP tool `browser_get_network_logs` with `url`
- **Then** The response includes the request entry with `method`, `url`, `status: 404` (or `failed: true` with error description), and timing information.

### SPEC-CDP-003: Clean Debugger Detach On Tab Close or Timeout
- **Given** CDP debugger is attached to a tab to collect console or network traces
- **When** The job finishes, the tab is closed, or an execution timeout occurs
- **Then** `chrome.debugger.detach` is executed cleanly without orphaned debugger sessions or lingering debug banners.

### SPEC-CDP-004: Instant Complete for Localhost Navigation
- **Given** A target URL on `http://127.0.0.1:8080/` loads instantaneously (< 5ms)
- **When** `browser_navigate`, `browser_get_console_logs`, or `browser_get_network_logs` is invoked
- **Then** The tab status is detected as `complete` immediately without waiting for the 30-second fallback timer.

### SPEC-CDP-005: User Privacy Toggle Gating for Debugger & CDP Tracing
- **Given** The user has toggled off "Allow DevTools & CDP Traces" in the Side Panel UI (`allow_cdp_debugger === false` in `chrome.storage.local`)
- **When** An agent calls `browser_get_console_logs`, `browser_get_network_logs`, or an `EVALUATE` command requiring CSP bypass
- **Then** The background worker immediately blocks the action with a user-facing error message `"CDP DevTools debugging disabled by user privacy toggle."` without invoking `chrome.debugger.attach`.

### SPEC-CDP-006: Runtime Dynamic Toolbar Indicator When Debugger Is Active
- **Given** The agent initiates CDP debugging or sensitive cookie extraction
- **When** The debugger is actively attached or cookies are being fetched
- **Then** The extension toolbar displays a vibrant runtime active indicator badge (e.g., `CDP` or `AUTH`), and automatically restores normal badge state upon detach/completion.

