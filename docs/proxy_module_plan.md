# Proxy Manager Module Implementation Plan

This plan details the addition of a **Proxy Manager Module** to the Chromium extension (`cosmos-chrome-extension`). It supports **SOCKS5**, **HTTP Connect**, and **PAC (Proxy Auto-Config)** proxy modes, built cleanly from scratch using modern React + TypeScript and Chromium's native `chrome.proxy` API without copying GPL-licensed code.

---

## Goal Description
Add full-featured proxy management capabilities to the extension's side panel UI and background service worker. Users can configure and switch between multiple proxy profiles, including SOCKS5, HTTP/HTTPS Connect, PAC Remote URLs, and PAC Inline Scripts, as well as Direct and System default modes.

---

## Key Features & Proxy Support
1. **Chromium `chrome.proxy` Integration**:
   - **SOCKS5 Proxy**: Host, Port, and Bypass List support (`scheme: "socks5"`).
   - **HTTP / HTTPS Connect Proxy**: Host, Port, and Bypass List support (`scheme: "http"` / `"https"`).
   - **PAC Proxy**: 
     - **Remote PAC URL** (`pacScript.url`)
     - **Inline PAC Script Data** (`pacScript.data`)
   - **Direct & System Modes**: Quick fallback to direct connection or Chrome system default settings.
2. **Profile Management**:
   - Save, edit, delete, and switch proxy profiles.
   - Persist profile settings and current active profile ID in `chrome.storage.local`.
   - Visual status badges and quick proxy toggles.
3. **Error Handling & Logs**:
   - Listen to `chrome.proxy.onProxyError` in `background.js` and pipe errors into the extension's live log system.

---

## User Review Required

> [!IMPORTANT]
> - Permission update required: `"proxy"` will be added to `manifest.json` under `permissions`.
> - License compliance: All code is written independently from scratch adhering to MIT/BSD standards without using code from ZeroOmega (GPL).

---

## Proposed Changes

### Extension Manifest & Background Worker

#### [MODIFY] `frontend/public/manifest.json`
- Add `"proxy"` permission to the `permissions` array.

#### [MODIFY] `frontend/public/background.js`
- Implement proxy application logic using `chrome.proxy.settings.set`.
- Listen for proxy control messages from React UI (`GET_PROXY_STATE`, `SET_ACTIVE_PROXY`, `SAVE_PROXY_PROFILE`, `DELETE_PROXY_PROFILE`).
- Add `chrome.proxy.onProxyError` listener to capture and format proxy failure messages into live logs.
- Restore active proxy configuration on browser startup and extension installation.

---

### React Frontend UI (`frontend/src`)

#### [NEW] `frontend/src/types/proxy.ts`
- Define TypeScript interfaces:
  - `ProxyScheme`: `'socks5' | 'http' | 'https'`
  - `ProxyMode`: `'direct' | 'system' | 'fixed_servers' | 'pac_script'`
  - `PacType`: `'url' | 'script'`
  - `ProxyProfile`: Profile configuration structure.

#### [NEW] `frontend/src/components/ProxyManager.tsx`
- Build the Proxy Manager React component:
  - Active proxy summary card with instant status indicator.
  - Proxy Profile List with active selection radios.
  - Modal / Card editor for creating and updating proxy profiles.
  - Form validation for host IP/domain, port ranges (1-65535), PAC URLs, and script syntax.

#### [MODIFY] `frontend/src/App.tsx` & `frontend/src/App.css`
- Add tabbed header navigation (`Bridge & Logs` vs `Proxy Manager`).
- Add responsive styling for proxy cards, profile forms, scheme badges, and toggles matching the dark cyberpunk visual theme.

---

## Verification Plan

### Automated Tests
- Run `npm run build` in `frontend/` to ensure TypeScript compilation and Vite bundling succeed without errors.
- Run `playwright_test.js` using Edge/Chromium to ensure the extension loads cleanly with `"proxy"` permissions and renders the side panel UI.

### Manual Verification
1. **SOCKS5 Testing**: Configure a SOCKS5 proxy profile (e.g. `127.0.0.1:1080`), select it, and confirm `chrome.proxy.settings` updates correctly.
2. **HTTP Connect Testing**: Configure an HTTP proxy profile (e.g. `127.0.0.1:8080`), apply it, and verify bypass rules.
3. **PAC Testing**: Test both PAC URL and Inline PAC script (`function FindProxyForURL(url, host) { return "DIRECT"; }`).
4. **Persistence & Direct Switching**: Switch to Direct/System, reload browser/extension, and verify the setting persists.
