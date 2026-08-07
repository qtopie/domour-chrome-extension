# Spec: Background Message Handling & Proxy Profile Management

- **Feature:** Extension Background Message Channel & Proxy Profile CRUD
- **Status:** DRAFT — Awaiting `APPROVE`
- **Affected Files:**
  - `frontend/src/background/index.ts` — Handle message types (`SAVE_PROXY_PROFILE`, `DELETE_PROXY_PROFILE`, `TRIGGER_VPROXY_SYNC`, `RECONNECT`, `getConnectionStatus`, `disconnect`), fix `onMessage` return value (only return `true` when response is async)
  - `frontend/src/background/proxy.ts` — Wrap all `pac_script` PACs with a localhost/LAN DIRECT prologue; fetch URL PACs at apply time with bridge-PAC fallback; pin vproxy profiles to `BRIDGE_PAC_URL`; import `DEFAULT_LAN_BYPASS` from the shared types module
  - `frontend/src/types/proxy.ts` — Canonical `DEFAULT_LAN_BYPASS` constant (single source of truth for loopback/LAN bypass entries)
  - `frontend/src/components/ProxyManager/index.tsx` — Default new fixed_servers profiles to the full `DEFAULT_LAN_BYPASS`; merge the LAN bypass into the stored `bypassList` on save

---

## 1. Context & Root Cause Diagnosis

1. **`runtime.lastError` Channel Closed Error:**
   In `frontend/src/background/index.ts`, `chrome.runtime.onMessage.addListener` ends with an unconditional `return true`.
   In Chrome extension APIs, returning `true` indicates that the response will be sent asynchronously via `sendResponse()`. For unhandled messages or synchronous responses where `sendResponse()` is not called asynchronously, returning `true` causes Chrome to log:
   `Unchecked runtime.lastError: A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received`.

2. **Proxy Profile Creation Failure ("cannot add new profile"):**
   `ProxyManager` sends `{ type: "SAVE_PROXY_PROFILE", profile }` when user saves a profile. However, `background/index.ts` has no listener branch for `SAVE_PROXY_PROFILE` or `DELETE_PROXY_PROFILE`. Therefore, saving new proxy profiles fails silently and times out.

3. **`pac_script` Mode Ignores bypassList → localhost Traffic Through External Proxy:**
   Chrome honors a proxy `bypassList` only in `fixed_servers` mode; in `pac_script` mode the PAC script is fully authoritative and no bypass list is sent. Any PAC that routes non-matched hosts to a proxy will therefore also proxy `localhost`/`127.0.0.1`, causing timeouts against local services (e.g. `localhost:1313`).

4. **Stale vproxy PAC URL Breaks the Profile:**
   `handleVproxySync` blindly trusted the `pacUrl` synced by the backend (e.g. vproxy's web port). When that URL has no listener (observed: `http://127.0.0.1:6888/proxy.pac`), activating the profile leaves Chrome with a broken PAC and no fallback.

---

## 2. Message Protocol Contract & Lifetime Rules

### 2.1 Listener Return Value Rules
- **Asynchronous response:** If the handler calls `chrome.storage` or async operations before calling `sendResponse`, the listener MUST return `true`.
- **Synchronous response:** If the handler calls `sendResponse` before returning, the listener MUST return `false` (or `undefined`).
- **Unhandled message:** If message.type is not recognized by this listener, the listener MUST return `false` (or `undefined`) so Chrome can immediately close the channel without waiting for an async callback.

### 2.2 Message Types & Handlers

| Message Type | Handling Strategy | Return Value | Behavior |
|--------------|-------------------|--------------|----------|
| `CHECK_CONNECTION` | Sync | `false` | Returns `{ connected: boolean, reason?: string }` |
| `RECONNECT` | Sync | `false` | Triggers `connectToNative()`, returns `{ success: true, connected: boolean, reason?: string }` |
| `GET_PROXY_STATE` | Async | `true` | Reads `proxy_profiles` and `active_proxy_id` from `chrome.storage.local`, returns `{ profiles, activeProfileId, activeProfile }` |
| `SET_ACTIVE_PROXY` | Async | `true` | Sets `active_proxy_id`, calls `applyProxyConfig(targetProfile)`, returns `{ success: true, activeProfile }` |
| `SAVE_PROXY_PROFILE` | Async | `true` | Saves/updates profile in `chrome.storage.local.get/set`, updates active proxy if modified, broadcasts `PROXY_PROFILES_UPDATED`, returns `{ success: true, profiles }` |
| `DELETE_PROXY_PROFILE` | Async | `true` | Deletes non-default profile, resets to `direct` if active profile deleted, broadcasts `PROXY_PROFILES_UPDATED`, returns `{ success: true, profiles, activeProfileId }` |
| `TRIGGER_VPROXY_SYNC` | Sync | `false` | Posts `SYNC_VPROXY` to `nativePort` if connected, returns `{ success: true, status: string }` |
| `TRIGGER_CONNECT` | Sync | `false` | Calls `connectToNative()`, returns `{ success: true, connected: boolean }` |
| `getConnectionStatus` | Sync | `false` | Returns `{ connectedTabIds: [], clientName: undefined }` |
| `disconnect` | Sync | `false` | Returns `{ success: true }` |
| *Other / Unknown* | N/A | `false` | Does nothing, allows channel to close safely without `runtime.lastError` |

---

## 3. BDD Acceptance Criteria

### Feature: Background Message Routing & Proxy Profile CRUD

#### Scenario 1: [SPEC-PROXY-MSG-001] Save New Proxy Profile
- **Given** User opens Proxy Manager modal and fills in profile parameters (e.g. SOCKS5 proxy)
- **When** User clicks "Save" triggering `SAVE_PROXY_PROFILE`
- **Then** `background/index.ts` saves profile to `chrome.storage.local`, broadcasts `PROXY_PROFILES_UPDATED`, and returns `{ success: true, profiles }` to close modal without error

#### Scenario 2: [SPEC-PROXY-MSG-002] Delete Proxy Profile
- **Given** A user-created custom proxy profile exists
- **When** User triggers `DELETE_PROXY_PROFILE` for custom profile ID
- **Then** `background/index.ts` removes profile, resets active profile to `direct` if deleted profile was active, and returns updated profiles

#### Scenario 3: [SPEC-PROXY-MSG-003] Prevent Asynchronous Channel Leak
- **Given** Any unhandled message (e.g., `NEW_LOG`, `CONNECTION_STATUS`, or third-party message) is dispatched to `chrome.runtime.onMessage`
- **When** Handler evaluates message type
- **Then** Listener returns `false`, preventing `Unchecked runtime.lastError: message channel closed before a response was received`

---

### Feature: PAC Script Localhost / LAN Bypass Guarantee

#### Scenario 4: [SPEC-PROXY-MSG-004] pac_script Profile Forces Localhost DIRECT
- **Given** A `pac_script` profile is active, with either an inline `pacScript` (`pacType: "script"`) or a `pacUrl` (`pacType: "url"`)
- **When** `applyProxyConfig` builds the config
- **Then** The PAC handed to Chrome is wrapped so that for hosts matching `localhost`, `*.localhost`, `*.local`, loopback (`127.*`, `[::1]`, `[::]`, IPv4-mapped loopback), or private ranges (`10.*`, `192.168.*`, `172.16.0.0/12`, `fe80:*`), `FindProxyForURL` returns `DIRECT` before delegating to the original PAC logic; external hosts still go through the PAC-defined proxy

#### Scenario 5: [SPEC-PROXY-MSG-005] URL-Based PAC Is Fetched at Apply Time with Bridge Fallback
- **Given** A `pac_script` profile with `pacType: "url"` and `pacUrl` set to a URL that is unreachable (no listener / HTTP error / timeout)
- **When** `applyProxyConfig` is called
- **Then** The extension fetches the PAC; on failure it logs a warning and falls back to `http://127.0.0.1:26888/proxy.pac` (the local bridge, which always returns DIRECT for localhost), rather than installing a dead `pacUrl` into Chrome

#### Scenario 6: [SPEC-PROXY-MSG-006] vproxy Synced Profiles Are Pinned to the Bridge PAC
- **Given** `TRIGGER_VPROXY_SYNC` pushes a vproxy profile whose `pacUrl` is a backend/web-port address
- **When** `handleVproxySync` formats the profile
- **Then** The stored `pacUrl` is always `http://127.0.0.1:26888/proxy.pac` (BRIDGE_PAC_URL), ignoring the synced value, so the profile never points at a dead PAC endpoint

---

### Feature: fixed_servers (HTTP/SOCKS5) LAN Bypass Guarantee

#### Scenario 7: [SPEC-PROXY-MSG-007] fixed_servers Profiles Always Bypass LAN
- **Given** A `fixed_servers` profile (e.g. SOCKS5) is active, created from the UI with only `localhost`/`127.0.0.1` in its stored `bypassList`
- **When** `applyProxyConfig` applies the profile to `chrome.proxy.settings`
- **Then** The effective `bypassList` always contains the full `DEFAULT_LAN_BYPASS` set (loopback, `10.*`, `192.168.*`, `172.16.0.0/12`, link-local, `*.local`), merged regardless of what the profile stores; and when a profile is saved via the UI, the stored `bypassList` itself is merged with `DEFAULT_LAN_BYPASS` so the persisted list matches the applied config

#### Scenario 8: [SPEC-PROXY-MSG-008] Shared LAN Bypass Source of Truth
- **Given** The canonical LAN bypass list is defined once in `frontend/src/types/proxy.ts` as `DEFAULT_LAN_BYPASS`
- **When** The background (`proxy.ts`) and the UI (`ProxyManager/index.tsx`) need a bypass list
- **Then** Both import the constant from the shared module — no duplicated literal lists — so loopback/LAN entries cannot drift between the applied config and what the UI displays

