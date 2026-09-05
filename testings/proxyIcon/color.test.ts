/**
 * TEST-PROXY-ICON-001 — Resolve canonical color for proxy profiles.
 * Pure-module tests (no chrome, no I/O). Run with:
 *   node --experimental-strip-types testings/proxyIcon/color.test.ts
 */
import { resolveProfileColor, DEFAULT_PROFILE_COLOR } from "../../frontend/src/types/proxyIcon.ts";

let failures = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("TestProxyIcon_ResolveColor (SPEC-PI-001)");

// Null / undefined profile
check("null profile falls back to direct green", resolveProfileColor(null) === "#10b981");
check("undefined profile falls back to direct green", resolveProfileColor(undefined) === "#10b981");

// Built-in profiles without explicit color
check("direct profile defaults to #10b981", resolveProfileColor({ id: "direct", mode: "direct" }) === "#10b981");
check("system profile defaults to #6366f1", resolveProfileColor({ id: "system", mode: "system" }) === "#6366f1");
check("vproxy pac profile defaults to #3b82f6", resolveProfileColor({ id: "vproxy_pac_default", mode: "pac_script" }) === "#3b82f6");

// Custom valid hex colors
check("custom 6-digit hex color preserved", resolveProfileColor({ color: "#ec4899" }) === "#ec4899");
check("custom 3-digit hex color normalized to 6-digit", resolveProfileColor({ color: "#f00" }) === "#ff0000");

// Invalid colors fallback
check("garbage color string falls back to default", resolveProfileColor({ color: "not-a-color" }) === DEFAULT_PROFILE_COLOR);
check("rgba color falls back to default", resolveProfileColor({ color: "rgb(255,0,0)" }) === DEFAULT_PROFILE_COLOR);

console.log(failures === 0 ? "\nAll color tests passed ✅" : `\n${failures} FAILURE(S) ❌`);
process.exit(failures === 0 ? 0 : 1);
