# Domour Copilot — AI Browser Automation & Proxy Platform

A high-performance, extension-first browser automation platform using a **React (Vite + TS)** side panel UI and a **Go** native messaging bridge daemon. It operates entirely within standard browser security boundaries (no CDP/debugging ports required) and routes automation jobs securely with built-in Model Context Protocol (MCP) server support.

---

## 🏗️ Architecture Blueprint

The platform operates seamlessly across three distinct components:
1. **Frontend UI (Chrome Side Panel)**: Built using React (Vite + TypeScript). It manages active proxy profiles, toggles privacy permissions, shows native bridge connection status, and displays live scrolling execution logs.
2. **Background Service Worker (`background.js`)**: An MV3 service worker that maintains a native port to Go, executes automation scripting, applies dynamic Chromium proxy settings (`chrome.proxy`), and intercepts heartbeats.
3. **Local Bridge Engine (`main.go`)**: A native Go binary that interacts via standard I/O (using 4-byte little-endian length prefixes). It embeds a Streamable HTTP & Stdio MCP Server (Port `26888`) and dynamically parses local `vproxy` configurations into high-performance SwitchyOmega-style PAC scripts (`/proxy.pac`).

---

## 📂 Project Structure

```text
.
├── bin/
│   ├── domour-chrome-bridge    # Compiled Go native bridge daemon (NM Host)
│   └── domour-chrome-cli       # Compiled CLI tool for dropping authorized jobs
├── cmd/
│   └── main.go                 # CLI tool entry point
├── frontend/                   # Vite + React + TS Side Panel Frontend
│   ├── dist/                   # Compiled production artifact (Unpacked Extension)
│   ├── public/
│   │   ├── background.js       # Extension Service Worker
│   │   └── manifest.json       # Manifest V3 configuration
│   ├── src/
│   │   ├── App.tsx             # Panel UI with Token Copy & Log Console
│   │   ├── index.css           # Custom Vanilla CSS premium design tokens
│   │   └── main.tsx
│   └── vite.config.ts          # Vite build configurations
├── main.go                     # Core Go Bridge Daemon & MCP Server source
├── register_host.sh            # Helper script to register NM Host on macOS/Linux
└── README.md                   # This instruction file
```

---

## ⚡ Quick Start & Deployment

### Step 1: Compile the Codebase
You can compile all backend Go binaries and frontend React assets using `task` or manually:

**Option A: Using Task (Recommended)**
```bash
task
```

**Option B: Manual Commands**
```bash
# 1. Compile Go Backend Daemon & CLI
go mod tidy
mkdir -p bin
go build -o bin/domour-chrome-bridge main.go
go build -o bin/domour-chrome-cli cmd/main.go

# 2. Build React Side Panel Frontend
cd frontend
npm install
npm run build
cd ..
```

---

### Step 2: Load Extension in Chrome / Edge
1. Open Google Chrome (`chrome://extensions/`) or Microsoft Edge (`edge://extensions/`).
2. Enable **Developer Mode** using the toggle in the top-right corner.
3. Click **Load unpacked** and select the `frontend/dist` directory.
4. Copy the generated **Extension ID** (e.g. `ndbhggifgbebojmidnoenkfpiiknkggc`).

---

### Step 3: Register Native Messaging Host
Allow Chrome to communicate with your compiled Go binary by running the registration script:

```bash
./register_host.sh
```
*(By default, this registers the production Extension ID `ndbhggifgbebojmidnoenkfpiiknkggc`. You can also pass a custom ID: `./register_host.sh <YOUR_EXTENSION_ID>`)*.

---

### Step 4: Open Side Panel & Connect AI Agents

1. Click the **Domour Copilot** extension icon in your browser toolbar to open the Side Panel.
2. Opening the Side Panel automatically launches the Go daemon and starts local services on **Port `26888`**:
   - 🤖 **Streamable HTTP MCP Endpoint**: `http://localhost:26888/mcp`
   - 📄 **Dynamic PAC Proxy Endpoint**: `http://localhost:26888/proxy.pac`

3. Add the MCP server configuration to your AI Coding Assistants (Cursor, Claude Desktop, Antigravity):

```json
{
  "mcpServers": {
    "domour-chrome-mcp": {
      "url": "http://localhost:26888/mcp"
    }
  }
}
```

---

## 🛠️ Key Capabilities & API Testing

### 1. Browser Navigation Tool (`browser_navigate`)
Scrapes text, title, and page metrics using your authentic browser context without CDP:
```bash
curl -X POST http://localhost:26888/mcp \
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

### 2. Vision Screenshot Tool (`browser_take_screenshot`)
Captures full-page screenshots as native MCP `image/png` response nodes, saving up to 99% of LLM context window tokens:
```bash
curl -X POST http://localhost:26888/mcp \
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

### 3. Dynamic SwitchyOmega PAC Service (`/proxy.pac`)
Parses `~/.vproxy/config.json` on-the-fly and generates SwitchyOmega closure-style PAC rules with automatic intranet/LAN bypass (192.168.x.x, 10.x.x.x, 172.16-31.x.x, *.local):
```bash
curl -i http://localhost:26888/proxy.pac
```

---

## 🔒 Privacy & Permissions

Domour Copilot is designed with zero-trust privacy boundaries:
- **Cookie Extraction Protection**: Cookie reading (`browser_get_cookies`) is disabled by default and requires explicit activation in the Side Panel UI toggle.
- **Local Isolation**: All automation data, logs, and token verifications remain strictly on your local machine.

---

## 📄 License

MIT License © 2026 Domour Automation Team.
