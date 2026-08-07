# Mapped Test Stub: UI Workspace Design (specs/modules/ui-workspace-design.spec.md)

**Status:** STUB — Implementation pending (Phase 4)

Each scenario below maps 1:1 to the BDD assertions in the approved spec.
Test files are collected in `harness/mocks/` (pure, mocked, no real I/O).

| Mapped Test ID | Spec Scenario | Assertion File (planned) | Status |
|---|---|---|---|
| TEST-UI-WS-001 | [SPEC-UI-WS-001] 最长后缀匹配 + 全局回退 | `testings/siteRules/resolve.test.ts` | STUB |
| TEST-UI-WS-002 | [SPEC-UI-WS-002] 三项权限相互独立 | `testings/siteRules/resolve.test.ts` | STUB |
| TEST-UI-WS-003 | [SPEC-UI-WS-003] Popup 开关 → storage → Side Panel 同步 | `testings/siteRules/sync.test.ts` | STUB |
| TEST-UI-WS-004 | [SPEC-UI-WS-004] Background 注入前查询规则 | `testings/automation/injectGuard.test.ts` | STUB |
| TEST-UI-WS-005 | [SPEC-UI-WS-005] CHAT_SEND 转发链路 | `testings/chat/relay.test.ts` | STUB |
| TEST-UI-WS-006 | [SPEC-UI-WS-006] 桥接离线时的 Chat 降级 | `testings/chat/relay.test.ts` | STUB |
| TEST-UI-WS-007 | [SPEC-UI-WS-007] PUSH_EVENT 校验与广播 | `testings/notify/pushEvent.test.ts` | STUB |
| TEST-UI-WS-008 | [SPEC-UI-WS-008] Site Rules 不破坏代理 LAN bypass | `testings/regression/lanBypass.test.ts` | STUB |

## Execution Contract

1. All tests MUST mock `chrome.storage.local`, `chrome.runtime.onMessage/sendMessage`, and the
   native pipe — no real network I/O (see `harness/harness.env`: `HARNESS_MOCK_EXTERNAL=true`).
2. Test harness runner (`harness/runners/spec_runner.sh`) verifies that every `SPEC-UI-WS-###`
   ID above is both referenced in the spec AND has a non-empty assertion file when implementation
   lands. Stubs that are empty are allowed to fail-to-skip until Phase 4.
