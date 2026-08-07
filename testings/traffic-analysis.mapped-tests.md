# Mapped Test Stub: Traffic Analysis (specs/modules/traffic-analysis.spec.md)

**Status:** IMPLEMENTED — real tests live in `testings/trafficAnalysis/` (run via `node --experimental-strip-types`).

Each scenario below maps 1:1 to the BDD assertions in the approved spec.
Test files are pure (no chrome dependency, no real I/O).

| Mapped Test ID | Spec Scenario | Assertion File (planned) | Status |
|---|---|---|---|
| TEST-TA-001 | [SPEC-TA-001] 保存规则生成 vproxy 配置 | `testings/trafficAnalysis/buildRules.test.ts` | ✅ DONE |
| TEST-TA-002 | [SPEC-TA-002] 开启流量分析切到 vproxy 端口 | `testings/trafficAnalysis/toggle.test.ts` | ✅ DONE |
| TEST-TA-003 | [SPEC-TA-003] 关闭恢复原代理 | `testings/trafficAnalysis/toggle.test.ts` | ✅ DONE |
| TEST-TA-004 | [SPEC-TA-004] vproxy 不可达拒绝开启 | `testings/trafficAnalysis/toggle.test.ts` | ✅ DONE |
| TEST-TA-005 | [SPEC-TA-005] 拉取抓包列表 | `testings/trafficAnalysis/traces.test.ts` | ✅ DONE |
| TEST-TA-006 | [SPEC-TA-006] 渲染与详情展开 | `testings/trafficAnalysis/traces.test.ts` | ✅ DONE |
| TEST-TA-007 | [SPEC-TA-007] 站点规则分流预览 | `testings/trafficAnalysis/buildRules.test.ts` | ✅ DONE |
| TEST-TA-008 | [SPEC-TA-008] 本地开发域名 INTERCEPT 提示 | `testings/trafficAnalysis/buildRules.test.ts` | ✅ DONE |

## Execution Contract

1. All tests MUST mock `chrome.storage.local` and `chrome.proxy` — no real I/O.
2. The pure module (`frontend/src/types/trafficAnalysis.ts`) is exercised directly without chrome.
3. `buildVProxyRules` / `resolveRulesForHost` / `buildVProxyConfigPayload` verify the
   vproxy rule-string semantics and FINAL fallback ordering.
4. `TOGGLE_TRAFFIC_ANALYSIS` proxy switching is asserted against a mocked
   `applyProxyConfig` + vproxy reachability probe.
