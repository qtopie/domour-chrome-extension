# Playwright CDP Relay Extension Integration Plan

This plan details adding **Playwright Extension** compatibility to `cosmos-chrome-extension` (based on [Microsoft Playwright Extension](https://github.com/microsoft/playwright/tree/main/packages/extension)).

It allows AI Agents, Playwright MCP server (`@playwright/mcp`), and Playwright CLI to connect directly to existing browser tabs in your daily browser profile, enabling automated web testing and AI browser interactions using your existing cookies and sessions.

---

## Goal Description
Integrate Chrome DevTools Protocol (CDP) debugging relay, tab group management, and Playwright MCP server protocol handlers into our Chrome extension background worker and React side panel UI.

---

## Key Features
1. **Playwright CDP Relay Engine**:
   - Connects to Playwright MCP Relay WebSocket (`mcpRelayUrl`).
   - Supports **Protocol V1** & **Protocol V2** (reflective Chrome Debugger command forwarding).
   - Forwards `chrome.debugger` commands (`attach`, `detach`, `sendCommand`) and events (`onEvent`, `onDetach`).
2. **Visual Tab Group Management**:
   - Automatically groups controlled tabs into a Chrome `tabGroup` titled `"Playwright"` with a green badge.
   - Cleans up stale groups when connections close or background worker restarts.
3. **Authentication & Token Lock**:
   - Uses the existing cryptographically generated `api_token` (and exports `PLAYWRIGHT_MCP_EXTENSION_TOKEN`) for automatic token-bypass connections.
4. **Side Panel UI Integration**:
   - Add **Playwright MCP** tab in the side panel.
   - Shows active connection status, connected tab IDs, client name, and token copy helper for `@playwright/mcp`.

---

## User Review Required

> [!IMPORTANT]
> - New Permissions Required in `manifest.json`: `"debugger"` and `"tabGroups"`.
> - License Notice: Playwright is licensed under Apache 2.0. Implementation follows clean TypeScript architecture compatible with Apache 2.0.

---

## Proposed Changes

### Extension Manifest & Permissions

#### [MODIFY] `frontend/public/manifest.json`
- Add `"debugger"` and `"tabGroups"` to `permissions`.

---

### Playwright Relay Engine (`frontend/src/playwright`)

#### [NEW] `frontend/src/playwright/protocolHandlers.ts`
- Implement `ProtocolV1Handler` and `ProtocolV2Handler` for CDP command forwarding (`chrome.debugger.attach`, `sendCommand`, `detach`) and `chrome.*` event reflection.

#### [NEW] `frontend/src/playwright/relayConnection.ts`
- Implement WebSocket client connection to Playwright MCP relay server.
- Manage attached tab sets and forward Chrome event listeners (`chrome.debugger.onEvent`, `chrome.tabs.onCreated`, `onRemoved`).

#### [NEW] `frontend/src/playwright/connectedTabGroup.ts`
- Implement Chrome `tabGroups` lifecycle manager (groups connected tabs under title `"Playwright"` with green color).

#### [NEW] `frontend/src/playwright/pendingConnection.ts`
- Manage pending connection requests from Playwright MCP relay.

---

### Background Worker & React UI

#### [MODIFY] `frontend/public/background.js`
- Integrate Playwright extension message listeners (`connectionRequested`, `getTabs`, `connectToTab`, `getConnectionStatus`, `disconnect`).
- Handle cleanup of stale Playwright tab groups on background startup.

#### [NEW] `frontend/src/components/PlaywrightManager.tsx`
- Build Playwright MCP status component showing:
  - Active Relay status & client name
  - List of connected tabs
  - Config snippets for `mcpServers` JSON in Claude Desktop / Cursor / Antigravity with `PLAYWRIGHT_MCP_EXTENSION_TOKEN`.

#### [MODIFY] `frontend/src/App.tsx` & `frontend/src/App.css`
- Add 3rd top tab: **Playwright MCP**.
- Add styling for Playwright connection badges, tab lists, and MCP server config snippets.

---

## Verification Plan

### Automated Tests
- Run `npm run build` in `frontend/` to confirm TypeScript compilation and Vite bundling succeed without errors.
- Run `playwright_test.js` to verify the extension loads cleanly with `"debugger"` and `"tabGroups"` permissions.

### Manual Verification
- Test connecting `@playwright/mcp --extension` with `PLAYWRIGHT_MCP_EXTENSION_TOKEN`.
- Confirm tabs are automatically grouped into the `"Playwright"` green tab group and CDP commands execute properly.

---

## Chrome Web Store Policy Compliance Incident Note (2026-07-30)

> [!WARNING]
> **Chrome Web Store Review Rejected (`Requesting but not using: debugger`)**
> - **Incident**: The submission version `1.0.0` was rejected by Chrome Web Store Developer Support with violation reference `Purple Potassium` (`Requesting but not using the following permission(s): debugger`).
> - **Root Cause**: `"debugger"` permission was requested in `manifest.json`, but `background.js` did not actively invoke `chrome.debugger` APIs during extension runtime, violating the *Narrowest Permissions Policy*.
> - **Resolution**: 
>   1. Removed `"debugger"` from `permissions` in `manifest.json`.
>   2. Standard automation features remain fully functional using `scripting`, `tabs`, `cookies`, `proxy`, and `nativeMessaging` APIs.
>   3. Bumped extension version to `1.0.1` for re-submission.

