/**
 * TEST-I18N-003 / TEST-I18N-004 — key lookup, placeholders, and missing-key fallback
 * (SPEC-I18N-003, SPEC-I18N-004).
 * Pure module test: no chrome dependency.
 * Run with:
 *   node --experimental-strip-types testings/i18n/translate.test.ts
 */
import { makeTranslator } from "../../frontend/src/i18n/index.ts";
import { zh } from "../../frontend/src/i18n/locales/zh.ts";
import { en } from "../../frontend/src/i18n/locales/en.ts";

let failures = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("TestI18N_Translate (SPEC-I18N-003)");

const tZh = makeTranslator("zh-CN", zh, en);
const tEn = makeTranslator("en", zh, en);

// Real key with placeholder: proxy.activeProfile zh: "代理 Profile", en: "Proxy Profile"
check("zh resolves key", tZh("proxy.activeProfile") === "代理 Profile", tZh("proxy.activeProfile"));
check("en resolves key", tEn("proxy.activeProfile") === "Proxy Profile", tEn("proxy.activeProfile"));

// Placeholder interpolation on a custom dict pair, mirroring the spec example.
const zhCustom = { "proxy.active": "代理 {name} 已激活" };
const enCustom = { "proxy.active": "Proxy {name} activated" };
const tcZh = makeTranslator("zh-CN", zhCustom, enCustom);
const tcEn = makeTranslator("en", zhCustom, enCustom);
check(
  "zh placeholder interpolation",
  tcZh("proxy.active", { name: "SOCKS5" }) === "代理 SOCKS5 已激活",
  tcZh("proxy.active", { name: "SOCKS5" })
);
check(
  "en placeholder interpolation",
  tcEn("proxy.active", { name: "SOCKS5" }) === "Proxy SOCKS5 activated",
  tcEn("proxy.active", { name: "SOCKS5" })
);
check(
  "number param interpolation",
  tcZh("proxy.active", { name: 5 }) === "代理 5 已激活",
  tcZh("proxy.active", { name: 5 })
);
check(
  "missing param leaves placeholder intact",
  tcZh("proxy.active", {}) === "代理 {name} 已激活",
  tcZh("proxy.active", {})
);

// Missing-key fallback: key present only in zh → en falls back to zh.
const zhOnly = { "only.zh.key": "仅在中文存在" };
const enOnly = {};
const tfZh = makeTranslator("zh-CN", zhOnly, enOnly);
const tfEn = makeTranslator("en", zhOnly, enOnly);
check(
  "en falls back to zh for zh-only key",
  tfEn("only.zh.key") === "仅在中文存在",
  tfEn("only.zh.key")
);
check("zh primary for zh-only key", tfZh("only.zh.key") === "仅在中文存在");

console.log("TestI18N_Fallback (SPEC-I18N-004)");

// Both missing → returns the key itself, never throws.
const tBoth = makeTranslator("zh-CN", {}, {});
check("missing in both returns key itself", tBoth("only.zh.key") === "only.zh.key");
check("missing in both returns key itself (en)", makeTranslator("en", {}, {})("nope") === "nope");
check("does not throw on unknown key", (() => { try { tZh("completely.unknown.key"); return true; } catch { return false; } })());

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll translate assertions passed.");
