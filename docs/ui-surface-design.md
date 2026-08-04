# UI Surface Design: Chrome Extension Entry Points

This document defines the purpose, scope, and feature allocation for each
Chrome Extension UI surface in Domour Copilot. Use it as the authoritative
reference when deciding where a new feature should live.

---

## 🗺️ Surface Overview

Chrome extensions have three distinct UI entry points. Each has a different
trigger, lifetime, and user mental model. Putting a feature in the wrong
surface creates friction — users either can't find it, or are interrupted
when they don't want to be.

| Surface | Trigger | Lifetime | User intent |
|---|---|---|---|
| **Popup** | Click toolbar icon, loses focus = closed | Seconds | "I want to do one quick thing" |
| **Side Panel** | Opened via API / action click, stays open | Persistent | "I am actively working here" |
| **Options Page** | `chrome://extensions` → Details → Extension options | Long session | "I am configuring this extension" |

---

## 🔧 Native Messaging Host — Installation Pattern

> **Chrome extensions cannot auto-download or auto-install native binaries.**
> This is a hard browser security boundary. Any native host must be installed
> by the user via a separate installer or script.

### Standard industry pattern (1Password, Bitwarden, Dashlane)

```
Step 1  User installs extension from Chrome Web Store
         ↓
Step 2  Extension detects Native Host missing → shows Setup UI
         ↓
Step 3  User downloads and runs a "Companion App" installer
        (pkg / dmg / exe / deb / install.sh)
        The installer:
          - copies the binary to a stable path
          - writes the NativeMessaging manifest JSON to the OS-specific dir
         ↓
Step 4  User clicks "Verify Installation" in extension UI
        Extension retries connectNative() and confirms success
```

### Behavior when host is not running

| State | Current behavior | Recommended behavior |
|---|---|---|
| `connectNative()` fails | Retries every 5 s, logs error, shows OFFLINE badge | Same retry logic + surface install banner |
| Side Panel opened while OFFLINE | Shows OFFLINE badge only | Show inline "Bridge Not Installed" setup banner |
| First-time user | No guidance | Options Page → Bridge Setup tab explains full install steps |

### macOS install paths (for installer / `register_host.sh`)

```
NM Manifest directory (Chrome):
  ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/

NM Manifest directory (Edge):
  ~/Library/Application Support/Microsoft Edge/NativeMessagingHosts/

Manifest filename:
  com.go_react.search_bridge.json
```

---

## 🪟 Popup (Toolbar Action Menu)

**When to use:** Status at a glance + one high-value shortcut action.  
**Hard rule:** If the interaction requires more than 2 clicks or a form, move
it to the Side Panel.

### Current state
The manifest defines `"action"` but has no `default_popup`. Clicking the
toolbar icon opens the Side Panel directly via `setPanelBehavior`. This is
acceptable for a power-user tool, but a Popup would allow status to be visible
without opening the full panel.

### Recommended feature set

```
┌─────────────────────────────────────┐
│  ● Bridge: ACTIVE  / ✕ OFFLINE      │  Connection status dot
│  ⚡ MCP: http://localhost:26888/mcp │  Service endpoint
├─────────────────────────────────────┤
│  [Open Side Panel]                  │  Primary CTA
│  [Copy API Token]                   │  One-click shortcut
├─────────────────────────────────────┤
│  Active Proxy: vproxy Auto PAC  ▾   │  Quick proxy switch
│    ○ Direct Connection              │
│    ● vproxy Auto PAC (Default)      │
│    ○ Local SOCKS5 (1080)            │
└─────────────────────────────────────┘
```

### Do NOT put in Popup
- Log console
- Proxy profile create / edit forms
- Bridge installation guide
- Advanced settings

---

## 🖼️ Side Panel (Main Working Surface)

**When to use:** Features the user interacts with repeatedly during a
browsing session. This is the primary workspace.

### Current tab structure (v1.1.0)

| Tab | Content |
|---|---|
| Bridge & Logs | API token display, live log console, reconnect button |
| Proxy Manager | Profile list, create/edit/delete, active proxy switching |
| Playwright MCP | Playwright task launcher |

### Recommended additions / improvements

```
Bridge & Logs tab
  ├── [NEW] "Bridge Not Installed" setup banner (when OFFLINE on first run)
  │         Shows: status message + link to Options Page → Bridge Setup
  ├── [NEW] Job Queue panel — list of pending/running/completed automation jobs
  └── [EXISTING] Live log console

Proxy Manager tab
  └── [EXISTING] Profile CRUD + active proxy selector

Playwright MCP tab
  └── [EXISTING] Task launcher
```

### "Bridge Not Installed" banner design

Show this banner at the top of the Bridge & Logs tab when:
- `isConnected === false` AND
- The extension has never successfully connected (i.e., no prior ACTIVE log in storage)

```
┌─────────────────────────────────────────────────────┐
│  ⚠️  Desktop Bridge Not Detected                    │
│                                                     │
│  To enable AI automation, install the Domour        │
│  Bridge companion app on your computer.             │
│                                                     │
│  [Go to Setup Guide]     [Retry Connection]         │
└─────────────────────────────────────────────────────┘
```

"Go to Setup Guide" → opens Options Page at the Bridge Setup tab.  
"Retry Connection" → calls `chrome.runtime.sendMessage({ type: "TRIGGER_CONNECT" })`.

### Do NOT put in Side Panel
- One-time API token reset / account setup
- Advanced debug config (log level, port overrides)
- Version info / changelog

---

## ⚙️ Options Page (Settings / Configuration)

**When to use:** One-time setup, deep configuration, and advanced settings
that the user rarely touches after initial setup.  
**Access:** `chrome.runtime.openOptionsPage()` or right-click extension icon →
"Options".

### Current state
No Options Page exists. It is not declared in `manifest.json`.

### Recommended tab structure

```
┌─────────────────────────────────────────────────────────┐
│  [General]  [Bridge Setup]  [Advanced]  [About]          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  General                                                 │
│  ─────────────────────────────────────────────────────  │
│  API Token          tk_22266e38311c82c...  [Reset]       │
│  Cookie Extraction  ○ Enabled  ● Disabled (default)     │
│  Theme              ● Dark  ○ Light                     │
│                                                          │
│  Bridge Setup                              ← PRIORITY 1  │
│  ─────────────────────────────────────────────────────  │
│  Status:   ✕ Not detected  /  ✓ Connected               │
│                                                          │
│  Step 1: Download the bridge binary                      │
│    macOS (Apple Silicon)  [Download .pkg]                │
│    macOS (Intel)          [Download .pkg]                │
│    Linux (amd64)          [Download .tar.gz]             │
│                                                          │
│  Step 2: Run the installer                               │
│    Or use the one-liner:                                 │
│    $ curl -fsSL https://get.domour.dev | bash            │
│                                                          │
│  Step 3: Verify                                          │
│    [Check Connection]  ← retries connectNative()        │
│                                                          │
│  Troubleshooting                                         │
│    Corporate / managed device?  [Read guide]             │
│    Still not working?           [View logs]              │
│                                                          │
│  Advanced                                                │
│  ─────────────────────────────────────────────────────  │
│  MCP Port        [26888      ]                          │
│  Log Level       [Info ▾    ]                           │
│  Reset All Settings          [Reset to defaults]        │
│                                                          │
│  About                                                   │
│  ─────────────────────────────────────────────────────  │
│  Extension version   1.1.0                              │
│  Bridge version      1.0.0 (detected) / Not installed   │
│  [Check for updates]                                    │
│  [View changelog]                                       │
│  [View privacy policy]                                  │
└─────────────────────────────────────────────────────────┘
```

### Do NOT put in Options Page
- Daily-use features (these belong in Side Panel or Popup)
- Log console (belongs in Side Panel)
- Proxy profile management (belongs in Side Panel)

---

## 📋 Implementation Priority

| Priority | Item | Surface | Rationale |
|---|---|---|---|
| 🔴 P1 | Bridge Setup tab | Options Page | Solves the #1 user pain point: host not installed |
| 🔴 P1 | "Bridge Not Installed" banner | Side Panel | Surfaces the problem immediately on first open |
| 🟡 P2 | Popup with status + shortcuts | Popup | Status visible without opening full panel |
| 🟢 P3 | Job Queue panel | Side Panel | Operational visibility for power users |
| 🟢 P3 | Advanced settings tab | Options Page | Port / log level overrides |

---

## 🔗 Related Documents

- [`docs/design.md`](design.md) — System architecture, Native Messaging protocol, Zero-Trust token lock
- [`docs/proxy_module_plan.md`](proxy_module_plan.md) — Proxy Manager feature spec
- [`docs/playwright_module_plan.md`](playwright_module_plan.md) — Playwright MCP feature spec
- [`register_host.sh`](../register_host.sh) — Native Messaging Host registration script (developer use)
- [`README.md`](../README.md) — Quick start guide
