# Mapped Test Stub: Extension Optimization (specs/modules/extension-optimization.spec.md)

**Status:** STUB — Implementation verification

Each scenario below maps 1:1 to the BDD assertions in the approved spec.

| Mapped Test ID | Spec Scenario | Assertion File | Status |
|---|---|---|---|
| TEST-OPT-001 | [SPEC-OPT-001] Debounced DNR Rule Sync | `frontend/src/background/index.ts` | ACTIVE |
| TEST-OPT-002 | [SPEC-OPT-002] Exponential Backoff on Native Port Disconnection | `frontend/src/background/index.ts` | ACTIVE |
| TEST-OPT-003 | [SPEC-OPT-003] Cross-Surface Storage Reactivity | `frontend/src/hooks/useChromeStorage.ts` | ACTIVE |

## Execution Contract

1. All debounce timers are verified to bundle rapid consecutive mutations.
2. Exponential backoff increases retry intervals on connection drops (1s, 2s, 4s...) and resets on success.
3. `useChromeStorage` hook subscribes to `chrome.storage.onChanged` to maintain cross-surface reactivity.
