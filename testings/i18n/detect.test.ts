/**
 * TEST-I18N-001 — Follow system language (SPEC-I18N-001).
 * Pure module test: no chrome dependency.
 * Run with:
 *   node --experimental-strip-types testings/i18n/detect.test.ts
 */
import { detectLang } from "../../frontend/src/i18n/index.ts";

let failures = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("TestI18N_Detect (SPEC-I18N-001)");

// zh* prefixes → zh-CN
check("zh-CN → zh-CN", detectLang("zh-CN", undefined) === "zh-CN");
check("zh-TW → zh-CN", detectLang("zh-TW", undefined) === "zh-CN");
check("zh → zh-CN", detectLang("zh", undefined) === "zh-CN");
check("zh-cn lowercase → zh-CN", detectLang("zh-cn", undefined) === "zh-CN");

// non-zh → en
check("en-US → en", detectLang("en-US", undefined) === "en");
check("de → en", detectLang("de", undefined) === "en");
check("empty string → en", detectLang("", undefined) === "en");

// explicit override 'auto' behaves like no override
check("override auto + zh → zh-CN", detectLang("zh-CN", "auto") === "zh-CN");
check("override auto + en → en", detectLang("en-US", "auto") === "en");

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll detect assertions passed.");
