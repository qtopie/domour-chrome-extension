# Chrome Web Store Listing — Domour Copilot

> Last Updated: 2026-07-28

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
- Dynamic PAC Proxy Management: Auto-syncs with local vproxy configurations, supporting SOCKS5 failovers, domain routing, and automatic LAN bypass.
- Privacy-First Protection: One-click UI toggle to control sensitive cookie extraction permissions.

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
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `frontend/public/favicon.svg` |
| Screenshot 1 [REQUIRED] | 1280×800 | 🟡 Needs capture | |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | |

---

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `nativeMessaging` | permissions | Required to communicate with the local Go backend daemon via standard I/O for MCP job dispatching. |
| `cookies` | permissions | Required to extract session cookies for authenticated web automation when explicitly enabled by user. |
| `sidePanel` | permissions | Required to render the React UI side panel for token management and execution logging. |
| `scripting` | permissions | Required to inject web scraping scripts to extract title and text content on automated tabs. |
| `storage` | permissions | Required to persist user proxy profiles, API tokens, and privacy toggle settings locally. |
| `proxy` | permissions | Required to apply dynamic PAC proxy routing and LAN bypass rules to Chromium settings. |

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

- [x] Extension compiled into ZIP: `domour-chrome-extension.zip`
- [x] Manifest Version 3 verified
- [x] All permissions justified in plain English
- [x] Single purpose declared clearly
