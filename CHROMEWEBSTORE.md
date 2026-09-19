# Chrome Web Store Listing — Domour Copilot

> Last Updated: 2026-09-19 | Version: 1.3.2

## Version History

### 1.3.2 (2026-09-19)
- CDP DevTools Trace & Console Logs: Introduced `browser_get_console_logs` and `browser_get_network_logs` with HAR 1.2 trace export.
- User Privacy Toggle for Debugger: Added Side Panel UI toggle allowing users to enable or disable DevTools CDP debugging anytime.
- Strict CSP Bypass: Added CDP Runtime.evaluate fallback to execute automation commands safely on strict CSP pages.
- Active Upstream Probing & Latency Sorting: Automatic latency sorting and failover routing for proxy upstreams.
- Localhost & Tab Lifecycle Hardening: Normalized loopback tab resolution and preserved automation tab sessions.
- Fixed Native Host API token initial handshake on service worker startup.

### 1.3.1 (2026-09-06)
- Fix cross-world extension resource mismatch by disabling Vite modulePreload in HTML builds.
- Dynamic Toolbar Icon: Real-time visual feedback reflecting active proxy status in Go Gopher blue (#00ADD8).
- Clean Toolbar UX: Removed cluttered badge abbreviation text from toolbar icon.
- Contrast Optimization: Seamless white inner ring for optimal clarity in both dark and light browser themes.
- Updated tabs and activeTab permission justifications.

## Store Listing

**Extension Name** [REQUIRED]
Domour Copilot - AI Browser Automation Platform

**Short Description** [REQUIRED]
Empower AI agents to automate web scraping, capture screenshots, and manage proxies natively without logging in again.

**Detailed Description** [REQUIRED]
Domour Copilot is an extension-first AI browser automation platform designed to bridge local AI coding assistants and Chrome seamlessly.

Key Features:
- Native Automation Engine: Execute silent web navigation, text extraction, and page scraping using your authentic browser context without CDP/debugging ports.
- Native MCP Server Integration: Built-in Stdio and Streamable HTTP (Port 26888) MCP servers for AI agents (Cursor, Claude, Antigravity).
- Low-Token Vision Screenshots: Native image/png MCP response node for LLM vision models, saving up to 99% of context window tokens.
- Dynamic PAC Proxy & Header Injection: Auto-syncs with local vproxy configurations, supports SOCKS5 failovers, domain routing, and declarative custom request header overrides.
- Multi-Language & Fluent UI: Seamless English and Simplified Chinese support with accessible Fluent UI design.
- Privacy-First Protection: One-click UI toggles to control sensitive cookie extraction and DevTools CDP debugging permissions.

How to Use:
1. Load unpacked extension and launch the Side Panel.
2. Connect your favorite AI Agent via Stdio or Streamable HTTP endpoint (http://localhost:26888/mcp).
3. Automate web tasks safely and securely.

**Category** [REQUIRED]
Developer Tools

**Single Purpose** [REQUIRED]
Bridges local AI agents to Chrome using Native Messaging for web automation and proxy management.

**Primary Language** [REQUIRED]
English

---

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `frontend/public/icon-128.png` |
| Screenshot 1 [REQUIRED] | 1280×800 | ✅ Ready | `screenshot_1280x800.png` |

---

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `nativeMessaging` | permissions | Required to communicate with the local Go backend daemon via standard I/O for MCP job dispatching. |
| `cookies` | permissions | Required to extract session cookies for authenticated web automation when explicitly enabled by user. |
| `sidePanel` | permissions | Required to render the React UI side panel for token management and execution logging. |
| `scripting` | permissions | Required to inject web scraping scripts to extract title and text content on automated tabs. |
| `tabs` | permissions | Required to query current active tab URL to resolve host-specific proxy rules and request header injection configs. |
| `activeTab` | permissions | Required to access the current tab context upon user action click for immediate automation and status updates. |
| `storage` | permissions | Required to persist user proxy profiles, API tokens, language preferences, and privacy toggle settings locally. |
| `proxy` | permissions | Required to apply dynamic PAC proxy routing and LAN bypass rules to Chromium settings. |
| `declarativeNetRequest` | permissions | Required to inject custom request headers for specified target domains without intercepting response payloads. |
| `debugger` | permissions | Required to collect DevTools console logs, capture network timing traces (HAR 1.2), and evaluate scripts safely under strict CSP pages during AI automation. Strictly gated behind an explicit user privacy toggle in the Side Panel UI. |

| Host Permission | Type | Justification |
|-----------------|------|---------------|
| `<all_urls>` | host_permissions | Required to enable user-defined proxy routing, declarative header rules, and automation across user-requested domains. |

---

## Privacy & Data Use

### Data Collection
**Does the extension collect user data?** No (All data is processed strictly locally between your browser and local Go bridge).

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

---

## Pre-Publish Artifact Checklist

- [x] Extension compiled into ZIP: `release/domour-copilot-extension-v1.3.2.zip`
- [x] Manifest Version 3 verified (`1.3.2`)
- [x] All permissions justified in plain English
- [x] Single purpose declared clearly
- [x] Pass all automated harness & lint checks (`./scripts/check.sh`)
