/**
 * TEST-PROXY-ICON-002 / TEST-PROXY-ICON-003 — Derive badge text and action title.
 * Pure-module tests (no chrome, no I/O). Run with:
 *   node --experimental-strip-types testings/proxyIcon/badge.test.ts
 */
import { deriveProfileBadgeText, deriveActionTitle } from "../../frontend/src/types/proxyIcon.ts";

let failures = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("TestProxyIcon_DeriveBadgeText (SPEC-PI-002)");

check("null profile -> DIR", deriveProfileBadgeText(null) === "DIR");
check("direct mode -> DIR", deriveProfileBadgeText({ mode: "direct" }) === "DIR");
check("system mode -> SYS", deriveProfileBadgeText({ mode: "system" }) === "SYS");
check("pac_script mode -> PAC", deriveProfileBadgeText({ mode: "pac_script" }) === "PAC");
check("fixed_servers socks5 -> S5", deriveProfileBadgeText({ mode: "fixed_servers", scheme: "socks5" }) === "S5");
check("fixed_servers http -> HTTP", deriveProfileBadgeText({ mode: "fixed_servers", scheme: "http" }) === "HTTP");
check("custom name takes first 3 chars", deriveProfileBadgeText({ name: "HongKong" }) === "HON");

console.log("TestProxyIcon_DeriveActionTitle (SPEC-PI-003)");

const titleDirect = deriveActionTitle({ name: "Direct Connection", mode: "direct" });
check("title contains profile name", titleDirect.includes("Direct Connection"));
check("title contains mode or Domour", titleDirect.includes("Domour"));

const titleCustom = deriveActionTitle({ name: "My SOCKS5", mode: "fixed_servers", scheme: "socks5", host: "127.0.0.1", port: 1080 });
check("custom title contains host and port", titleCustom.includes("127.0.0.1:1080"));

console.log(failures === 0 ? "\nAll badge & title tests passed ✅" : `\n${failures} FAILURE(S) ❌`);
process.exit(failures === 0 ? 0 : 1);
