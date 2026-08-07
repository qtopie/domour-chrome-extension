# Mapped Test Stub: Request Headers (specs/modules/request-headers.spec.md)

**Status:** STUB — Implementation pending (Phase 4)

Each scenario below maps 1:1 to the BDD assertions in the approved spec.
Test files are pure (no chrome dependency, no real I/O).

| Mapped Test ID | Spec Scenario | Assertion File (planned) | Status |
|---|---|---|---|
| TEST-RH-001 | [SPEC-RH-001] 全局默认注入 | `testings/requestHeaders/resolve.test.ts` | STUB |
| TEST-RH-002 | [SPEC-RH-002] 按域名覆盖同名 key | `testings/requestHeaders/resolve.test.ts` | STUB |
| TEST-RH-003 | [SPEC-RH-003] 最长后缀匹配 | `testings/requestHeaders/resolve.test.ts` | STUB |
| TEST-RH-004 | [SPEC-RH-004] 全局关闭仅 perHost 生效 | `testings/requestHeaders/resolve.test.ts` | STUB |
| TEST-RH-005 | [SPEC-RH-005] 非法输入拒绝 | `testings/requestHeaders/validate.test.ts` | STUB |
| TEST-RH-006 | [SPEC-RH-006] UI 配置持久化与重启恢复 | `testings/requestHeaders/persist.test.ts` | STUB |

## Execution Contract

1. All tests MUST mock `chrome.storage.local` and `chrome.declarativeNetRequest` — no real I/O.
2. The pure module (`frontend/src/types/requestHeaders.ts`) is exercised directly without chrome.
3. Rule-building is exercised against `buildDnrRuleSpecs` / `normalizeDnrRuleSpecs` to verify
   priority semantics (global=1, per-host=2) and rule ID stability.
