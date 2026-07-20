---
name: chrome-extension-dev
description: Provides automated testing instructions and workflows for the cosmos-chrome Edge/Chrome extension using playwright-cli.
---

# Microsoft Edge / Chrome Extension Developer & Test Skill

This skill guides Google Antigravity agents and developers on how to automatically test the `cosmos-chrome` Edge/Chrome extension using the system's command-line tool `playwright-cli`.

---

## 🏗️ 1. Build and Setup

Before testing, always ensure the extension is fully built:
```bash
task clean
task
```
This builds both the Go backend bridge binaries and the React side panel compiled assets (`frontend/dist/`).

---

## ⚙️ 2. Playwright CLI Configuration

A configuration file is placed at `.playwright/cli.config.json` in the project root. It configures the global `playwright-cli` to:
1. Target **Microsoft Edge** (`/usr/bin/microsoft-edge`).
2. Load the unpacked extension from `frontend/dist/`.
3. Disable sandboxing for compatibility in containerized/headless environments.

---

## 🚀 3. Run Automated Tests via playwright-cli

Since `playwright-cli` is installed on the system, follow these commands to test the extension:

### Step A: Close any stale sessions
Ensure no zombie browser processes are running:
```bash
playwright-cli close-all
```

### Step B: Launch Edge with the Extension loaded
Launch Edge and navigate directly to the extension index page.
> [!IMPORTANT]
> You **must** pass the `--persistent` flag. Playwright does not load extensions in temporary, non-persistent contexts.

```bash
playwright-cli open "chrome-extension://madmalocaomchfoncgombejhddmmepjg/index.html" --persistent
```

### Step C: Verify React UI Rendering (Snapshot)
Capture a text snapshot of the page's accessibility tree to verify the React app mounted successfully and check its layout:
```bash
playwright-cli snapshot
```

In a successful run, the snapshot output should contain elements like:
* `heading "COSMOS BRIDGE"`
* `code: tk_xxxxxxxxxxxxxxxxxxxxxx` (indicating the token was generated)
* `generic: OFFLINE` (or `ACTIVE`)
* `button "Regenerate"`
* `heading "Live Logs"`

### Step D: Extract Generated Token programmatically
You can evaluate Javascript directly inside the page context to inspect storage or state:
```bash
playwright-cli eval "new Promise(r => chrome.storage.local.get('api_token', res => r(res.api_token)))"
```
This returns the active generated token (e.g. `tk_xxxxxxxx`).

### Step E: Shutdown
Close all active browser sessions:
```bash
playwright-cli close-all
```

---

## 📊 4. Interactive Monitoring Dashboard

For visual verification of the test browser state, launch the Playwright dashboard:
```bash
playwright-cli show
```
This opens a local web UI showing active browser sessions with live video/screencast streams, tabs, console logs, and remote control access.
