# Spec: Background Message Handling & Proxy Profile Management

- **Feature:** Extension Background Message Channel & Proxy Profile CRUD
- **Status:** DRAFT — Awaiting `APPROVE`
- **Affected Files:**
  - `frontend/src/background/index.ts` — Handle message types (`SAVE_PROXY_PROFILE`, `DELETE_PROXY_PROFILE`, `TRIGGER_VPROXY_SYNC`, `RECONNECT`, `getConnectionStatus`, `disconnect`), fix `onMessage` return value (only return `true` when response is async)

---

## 1. Context & Root Cause Diagnosis

1. **`runtime.lastError` Channel Closed Error:**
   In `frontend/src/background/index.ts`, `chrome.runtime.onMessage.addListener` ends with an unconditional `return true`.
   In Chrome extension APIs, returning `true` indicates that the response will be sent asynchronously via `sendResponse()`. For unhandled messages or synchronous responses where `sendResponse()` is not called asynchronously, returning `true` causes Chrome to log:
   `Unchecked runtime.lastError: A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received`.

2. **Proxy Profile Creation Failure ("cannot add new profile"):**
   `ProxyManager` sends `{ type: "SAVE_PROXY_PROFILE", profile }` when user saves a profile. However, `background/index.ts` has no listener branch for `SAVE_PROXY_PROFILE` or `DELETE_PROXY_PROFILE`. Therefore, saving new proxy profiles fails silently and times out.

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
