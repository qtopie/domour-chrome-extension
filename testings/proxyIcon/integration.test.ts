/**
 * TEST-PROXY-ICON-005 / TEST-PROXY-ICON-006 — Integration & Notification Precedence.
 * Pure-module tests (mocks chrome.action and chrome.storage). Run with:
 *   node --experimental-strip-types testings/proxyIcon/integration.test.ts
 */
import {
  deriveProfileBadgeText,
  resolveProfileColor,
  deriveActionTitle
} from "../../frontend/src/types/proxyIcon.ts";

let failures = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("TestProxyIcon_UpdateToolbar (SPEC-PI-005)");

// Mock chrome state
let mockBadgeColor = "";
let mockBadgeText = "";
let mockTitle = "";

function mockApplyVisual(profile: any, hasPendingNotification: boolean) {
  const color = resolveProfileColor(profile);
  const title = deriveActionTitle(profile);
  mockTitle = title;

  if (hasPendingNotification) {
    // Preserved by notification system
    return;
  }
  mockBadgeColor = color;
  mockBadgeText = deriveProfileBadgeText(profile);
}

mockApplyVisual({ id: "direct", mode: "direct", name: "Direct Connection" }, false);
check("direct sets green badge color", mockBadgeColor === "#34d399");
check("direct sets empty badge text", mockBadgeText === "");

mockApplyVisual({ id: "vproxy", mode: "pac_script", name: "vproxy Auto PAC" }, false);
check("vproxy sets blue badge color", mockBadgeColor === "#00add8");
check("vproxy sets empty badge text", mockBadgeText === "");

console.log("TestProxyIcon_NotificationPrecedence (SPEC-PI-006)");

// When notification is pending
mockBadgeColor = "#ef4444";
mockBadgeText = "5";
mockApplyVisual({ id: "system", mode: "system" }, true);
check("pending notification badge text not overwritten", mockBadgeText === "5");
check("pending notification badge color not overwritten", mockBadgeColor === "#ef4444");

// When notification is cleared
mockApplyVisual({ id: "system", mode: "system" }, false);
check("clearing notification restores empty badge text", mockBadgeText === "");
check("clearing notification restores profile badge color", mockBadgeColor === "#818cf8");

console.log(failures === 0 ? "\nAll integration tests passed ✅" : `\n${failures} FAILURE(S) ❌`);
process.exit(failures === 0 ? 0 : 1);
