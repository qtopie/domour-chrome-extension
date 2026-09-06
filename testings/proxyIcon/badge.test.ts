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
check("null profile -> empty", deriveProfileBadgeText(null) === "");
check("direct mode -> empty", deriveProfileBadgeText({ mode: "direct" }) === "");
check("system mode -> empty", deriveProfileBadgeText({ mode: "system" }) === "");
check("pac_script mode -> empty", deriveProfileBadgeText({ mode: "pac_script" }) === "");
check("fixed_servers socks5 -> empty", deriveProfileBadgeText({ mode: "fixed_servers", scheme: "socks5" }) === "");
check("fixed_servers http -> empty", deriveProfileBadgeText({ mode: "fixed_servers", scheme: "http" }) === "");
check("custom name -> empty", deriveProfileBadgeText({ name: "HongKong" }) === "");

console.log("TestProxyIcon_DeriveActionTitle (SPEC-PI-003)");

const titleDirect = deriveActionTitle({ name: "Direct Connection", mode: "direct" });
check("title contains profile name", titleDirect.includes("Direct Connection"));
check("title contains mode or Domour", titleDirect.includes("Domour"));

const titleCustom = deriveActionTitle({ name: "My SOCKS5", mode: "fixed_servers", scheme: "socks5", host: "127.0.0.1", port: 1080 });
check("custom title contains host and port", titleCustom.includes("127.0.0.1:1080"));

console.log(failures === 0 ? "\nAll badge & title tests passed ✅" : `\n${failures} FAILURE(S) ❌`);
process.exit(failures === 0 ? 0 : 1);
