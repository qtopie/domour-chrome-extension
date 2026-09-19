# Mapped Tests: Chrome DevTools Protocol (CDP) Console & Network Trace Collector

Mapping between `specs/modules/cdp-devtools-traces.spec.md` scenarios and implementation verification.

## Scenarios
- `SPEC-CDP-001`: Console Log Collection via MCP
  - Test / Verification: `main_test.go::TestCDPConsoleLogToolRegistrationAndDispatch` verifies that `browser_get_console_logs` is declared in tools list, handles argument parsing, dispatches to browser, and formats output.
- `SPEC-CDP-002`: Network Request Tracing & Error Capture
  - Test / Verification: `main_test.go::TestCDPNetworkLogToolRegistrationAndDispatch` verifies that `browser_get_network_logs` is declared, supports HAR export and status code recording.
- `SPEC-CDP-003`: Clean Debugger Detach On Tab Close or Timeout
  - Test / Verification: `frontend/src/background/automation.ts` guarantees `chrome.debugger.detach` on job completion, tab removal, or timeout without lingering debugger sessions.
- `SPEC-CDP-004`: Instant Complete for Localhost Navigation
  - Test / Verification: `main_test.go::TestInstantCompleteFallbackLogic` and `frontend/src/background/automation.ts` verify that tabs already in `complete` status are immediately resolved without false 30s timeouts.
- `SPEC-CDP-005`: User Privacy Toggle Gating for Debugger & CDP Tracing
  - Test / Verification: `frontend/src/background/automation.ts` validates `allow_cdp_debugger` from `chrome.storage.local` before attaching debugger, returning graceful rejection if disabled.
- `SPEC-CDP-006`: Runtime Dynamic Toolbar Indicator When Debugger Is Active
  - Test / Verification: `frontend/src/background/proxyIcon.ts` and `frontend/src/background/automation.ts` set dynamic toolbar badge (e.g. `CDP` / `AUTH`) during active sessions and restore profile badge upon completion.


