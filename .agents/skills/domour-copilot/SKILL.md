---
name: domour-copilot
description: "Build, debug, deploy, and manage the Domour Copilot AI Browser Automation Platform (Chrome Extension & Go Native Messaging Bridge). Trigger this skill when modifying extension background scripts, proxy PAC rules, native host registration, MCP server tools, or preparing Chrome Web Store submission."
---

# Domour Copilot Development & Maintenance Guide

This skill provides step-by-step guidance for building, running, debugging, and publishing the **Domour Copilot Platform**.

---

## 💡 Core Architecture

Domour Copilot consists of 3 integrated layers:
1. **React TS Side Panel UI** (`frontend/src/`): Manages active proxy profiles, log stream, and privacy toggles.
2. **Chrome MV3 Service Worker** (`frontend/public/background.js`): Executes DOM scripting, manages native port connection, and applies `chrome.proxy` settings.
3. **Go Native Bridge Daemon & Embedded MCP Server** (`main.go`): Runs on port `6888`, providing `/mcp` (Streamable HTTP MCP) and `/proxy.pac` (SwitchyOmega PAC generator with LAN bypass).

---

## 🛠️ Step-by-Step Execution Workflows

### Workflow 1: Local Compilation & Environment Build
Run task to compile Go binaries and Vite React frontend:

```bash
# Clean dependencies & build all binaries + extension dist
task
```

Outputs:
- Extension folder: `frontend/dist/`
- Go Bridge Daemon: `bin/domour-chrome-bridge`
- Go CLI Client: `bin/domour-chrome-cli`

---

### Workflow 2: Register Native Messaging Host
To authorize Chrome to launch the Go backend daemon, register the native host:

```bash
./register_host.sh [EXTENSION_ID]
```
*Note: Omit `EXTENSION_ID` to default to the production ID `ndbhggifgbebojmidnoenkfpiiknkggc`.*

---

### Workflow 3: Testing Local Services (Port 6888)

#### 1. Test Dynamic SwitchyOmega PAC Generator
```bash
curl -i http://localhost:6888/proxy.pac
```
*Verifies SOCKS5 upstream chains, custom rules from `~/.vproxy/config.json`, and automatic LAN IP bypass.*

#### 2. Test Streamable HTTP MCP Navigation Tool
```bash
curl -X POST http://localhost:6888/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "browser_navigate",
      "arguments": { "url": "https://example.com" }
    }
  }'
```

#### 3. Test Vision Token Screenshot Tool
```bash
curl -X POST http://localhost:6888/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "browser_take_screenshot",
      "arguments": { "url": "https://example.com" }
    }
  }'
```

---

## 📚 References & Resources

### Detailed Specifications
- Consult [references/mcp_tools.md](references/mcp_tools.md) for full MCP protocol JSON schemas and parameters.
- Consult [references/webstore_checklist.md](references/webstore_checklist.md) for Chrome Web Store submission justifications and assets.

---

## 🔒 Mandatory Safety Rules

1. **Never Bypass LAN Restrictions**: `192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`, `localhost`, and `*.local` must always return `DIRECT` in `/proxy.pac`.
2. **Preserve Cookie Privacy Toggle**: `browser_get_cookies` must respect `allow_cookie_extraction` in `chrome.storage.local`.
3. **Keep Port Unified**: Both `/mcp` and `/proxy.pac` must run strictly on port `6888`.
