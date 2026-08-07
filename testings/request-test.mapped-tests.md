# Mapped Test Stub: Request Test + Options 整合 (specs/modules/request-test.spec.md)

**Status:** IMPLEMENTED — real tests live in `testings/requestTest/` (run via `node --experimental-strip-types`).

Each scenario below maps 1:1 to the BDD assertions in the approved spec.
Test files are pure (no chrome dependency, no real I/O).

| Mapped Test ID | Spec Scenario | Assertion File (planned) | Status |
|---|---|---|---|
| TEST-RT-001 | [SPEC-RT-001] 输入校验拒绝非法请求 | `testings/requestTest/build.test.ts:TestRT_Validate` | ✅ DONE |
| TEST-RT-002 | [SPEC-RT-002] 构建 fetch 参数 | `testings/requestTest/build.test.ts:TestRT_BuildFetchInit` | ✅ DONE |
| TEST-RT-003 | [SPEC-RT-003] 发送成功返回规范化响应 | `testings/requestTest/run.test.ts:TestRT_Success` | ✅ DONE |
| TEST-RT-004 | [SPEC-RT-004] 大响应体截断 | `testings/requestTest/run.test.ts:TestRT_Truncate` | ✅ DONE |
| TEST-RT-005 | [SPEC-RT-005] JSON 响应格式化展示 | `testings/requestTest/format.test.ts:TestRT_Format` | ✅ DONE |
| TEST-RT-006 | [SPEC-RT-006] 网络错误处理 | `testings/requestTest/run.test.ts:TestRT_NetworkError` | ✅ DONE |
| TEST-RT-007 | [SPEC-RT-007] 超时中止 | `testings/requestTest/run.test.ts:TestRT_Timeout` | ✅ DONE |
| TEST-RT-008 | [SPEC-RT-008] 选项页整合 | `testings/requestTest/ui.test.ts:TestRT_OptionsTabs` | ✅ DONE |

## Execution Contract

1. All tests MUST mock network I/O — `runRequestTest` receives an injected
   `fetchImpl`; no real network traffic.
2. The pure module (`frontend/src/types/requestTest.ts`) is exercised directly
   without chrome. UI structural assertions (SPEC-RT-008) read `OPTIONS_TABS`
   and the component sources statically (no React runtime).
3. `validateRequestTestInput` / `buildFetchInit` verify URL scheme, header
   injection guards (CRLF), empty-row skipping, and body-capable methods.
4. `readBodyWithCap` truncation is verified with a `MAX_BODY_CAPTURE+4096` byte
   stream; timeout uses `AbortController` with `timeoutMs=50`.
