# Mapped Test Stub: Proxy Profile Toolbar Icon & Color Indicator (specs/modules/proxy-icon.spec.md)

**Status:** PLANNED — tests will live in `testings/proxyIcon/` (run via `node --experimental-strip-types`).

Each scenario below maps 1:1 to the BDD assertions in the approved spec.
Test files are pure (no real browser/Chrome dependency).

| Mapped Test ID | Spec Scenario | Assertion File (planned) | Status |
|---|---|---|---|
| TEST-PROXY-ICON-001 | [SPEC-PI-001] Resolves canonical color for built-in and custom profiles | `testings/proxyIcon/color.test.ts:TestProxyIcon_ResolveColor` | ✅ DONE |
| TEST-PROXY-ICON-002 | [SPEC-PI-002] Derives concise badge text for proxy modes | `testings/proxyIcon/badge.test.ts:TestProxyIcon_DeriveBadgeText` | ✅ DONE |
| TEST-PROXY-ICON-003 | [SPEC-PI-003] Derives descriptive action title | `testings/proxyIcon/badge.test.ts:TestProxyIcon_DeriveActionTitle` | ✅ DONE |
| TEST-PROXY-ICON-004 | [SPEC-PI-004] Generates valid ImageData pixel buffer for icon rendering | `testings/proxyIcon/icon.test.ts:TestProxyIcon_GenerateImageData` | ✅ DONE |
| TEST-PROXY-ICON-005 | [SPEC-PI-005] Updates toolbar icon and badge when proxy switches | `testings/proxyIcon/integration.test.ts:TestProxyIcon_UpdateToolbar` | ✅ DONE |
| TEST-PROXY-ICON-006 | [SPEC-PI-006] Preserves notification badge precedence | `testings/proxyIcon/integration.test.ts:TestProxyIcon_NotificationPrecedence` | ✅ DONE |

