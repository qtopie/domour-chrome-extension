# Spec: Extension Performance, Debounce & Reactive State Sync Optimization

- **Feature:** Extension Performance, DNR Debounce & Storage State Synchronization
- **Status:** APPROVED
- **Affected Files:**
  - `frontend/src/background/index.ts` — Add debounce for `syncDnrRules` and exponential backoff retry mechanism for Native Messaging Host connection.
  - `frontend/src/hooks/useChromeStorage.ts` — Reactive custom hook for synchronized multi-view storage states (`chrome.storage.onChanged`).
  - `testings/unit/extension_optimization_test.go` or TS testings — BDD verification for debounce and storage synchronization logic.

---

## 1. Objectives & Rationale

1. **DNR Rules Synchronization Debounce:**
   - Rapid updates to header rules currently make direct calls to `chrome.declarativeNetRequest.updateDynamicRules`, which can cause race conditions and unnecessary browser rule compilation.
   - Introducing a 200ms debounce buffer bundles rapid edits into a single atomic update.

2. **Native Messaging Resilience (Exponential Backoff):**
   - If the Go Native Host is terminated or restarts, rapid immediate reconnection attempts can thrash CPU and spam connection error logs.
   - A standardized exponential backoff (e.g. 1s, 2s, 4s, 8s, up to max 30s) prevents port reconnection storms while ensuring automatic recovery.

3. **Multi-Window / Multi-Surface Reactive State Hook (`useChromeStorage`):**
   - Currently, SidePanel, Popup, and Options sync through custom ad-hoc `chrome.runtime.sendMessage` event dispatchers.
   - A reactive `useChromeStorage<T>` hook listening to `chrome.storage.onChanged` provides automatic, real-time single-source-of-truth reactivity across all active extension windows without manual event plumbing.

---

## 2. Technical Contracts

### 2.1 DNR Rules Update Debouncing Contract
- `scheduleDnrSync(config: RequestHeadersConfig, delayMs?: number): void`
  - Cancels any pending timeout timer.
  - Sets a timer (default `200ms`) to invoke `syncDnrRules(config)`.
  - Guarantees that within a 200ms window of consecutive edits, `chrome.declarativeNetRequest.updateDynamicRules` is executed only once with the latest configuration.

### 2.2 Native Messaging Exponential Backoff Contract
- `scheduleNativeReconnect(): void`
  - Initial retry delay: `1000ms`.
  - Multiplier: `2x` on each consecutive failure, capped at `30000ms` (30s).
  - Reset to `0` upon successful connection establishment.
  - Max consecutive attempts: `10` before pausing and notifying user via panel status.

### 2.3 `useChromeStorage<T>` Hook Contract
- Signature: `useChromeStorage<T>(key: string, initialValue: T): [T, (val: T | ((prev: T) => T)) => Promise<void>, boolean]`
- Listens to `chrome.storage.onChanged` for changes in `areaName === 'local' && changes[key]`.
- Updates local React state automatically when background or another tab modifies the storage key.

---

## 3. BDD Acceptance Criteria

### Feature: Extension Performance & Stability

#### Scenario 1: [SPEC-OPT-001] Debounced DNR Rule Sync
- **Given** custom header rules are modified 5 times in rapid succession within 100ms
- **When** the debounce timer expires after 200ms of inactivity
- **Then** `updateDynamicRules` MUST only be called once with the final cumulative state.

#### Scenario 2: [SPEC-OPT-002] Exponential Backoff on Native Port Disconnection
- **Given** the Go Native Host process exits unexpectedly
- **When** `onDisconnect` triggers repeatedly
- **Then** reconnection attempts MUST follow backoff intervals (1s, 2s, 4s...) and reset after a successful connection.

#### Scenario 3: [SPEC-OPT-003] Cross-Surface Storage Reactivity
- **Given** a component uses `useChromeStorage('proxy_profiles', ...)`
- **When** another window or background modifies `proxy_profiles` in `chrome.storage.local`
- **Then** the hook MUST receive the `chrome.storage.onChanged` event and update the component state seamlessly without page reload.
