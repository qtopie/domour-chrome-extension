/**
 * TEST-I18N-002 — Manual override takes precedence and persists (SPEC-I18N-002).
 * Pure-function tests for precedence + source-level contract assertions on
 * I18nProvider (chrome.storage.local read on mount / write on setLang).
 * No React render needed (node --experimental-strip-types cannot load .tsx).
 * Run with:
 *   node --experimental-strip-types testings/i18n/persist.test.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { detectLang, I18N_STORAGE_KEY, makeTranslator } from "../../frontend/src/i18n/index.ts";
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

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const providerSrc = readFileSync(join(root, "frontend/src/i18n/I18nProvider.tsx"), "utf-8");

console.log("TestI18N_Persist (SPEC-I18N-002)");

// --- Storage key contract ---
check("storage key constant is 'ui_lang'", I18N_STORAGE_KEY === "ui_lang", I18N_STORAGE_KEY);

// --- Manual override takes precedence over system language ---
check(
  "override 'en' wins over zh system lang",
  detectLang("zh-CN", "en") === "en"
);
check(
  "override 'zh-CN' wins over en system lang",
  detectLang("en-US", "zh-CN") === "zh-CN"
);
check(
  "override 'auto' follows zh system lang",
  detectLang("zh-CN", "auto") === "zh-CN"
);
check(
  "override 'auto' follows en system lang",
  detectLang("en-US", "auto") === "en"
);
check(
  "unsupported stored value falls back to system lang",
  detectLang("zh-CN", "fr") === "zh-CN"
);

// --- t() resolves against the override-backed lang ---
const tEn = makeTranslator("en", zh, en);
check("t() resolves english after override", tEn("proxy.activeProfile") === "Proxy Profile", tEn("proxy.activeProfile"));
const tZh = makeTranslator("zh-CN", zh, en);
check("t() resolves zh-CN after override", tZh("proxy.activeProfile") === "代理 Profile", tZh("proxy.activeProfile"));

// --- Provider source contract: reads stored override on mount ---
check(
  "I18nProvider reads stored override on mount via chrome.storage.local.get",
  /chrome\.storage\.local\.get\(\[\s*I18N_STORAGE_KEY\s*\],/.test(providerSrc),
  "mount read missing"
);
check(
  "I18nProvider validates stored value (zh-CN|en|auto)",
  /v\s*===\s*"zh-CN"\s*\|\|\s*v\s*===\s*"en"\s*\|\|\s*v\s*===\s*"auto"/.test(providerSrc),
  "validation missing"
);

// --- Provider source contract: setLang persists via chrome.storage.local.set ---
check(
  "I18nProvider setLang writes ui_lang to storage",
  /chrome\.storage\.local\.set\(\{\s*\[I18N_STORAGE_KEY\]: v \}/.test(providerSrc) ||
    /chrome\.storage\.local\.set\(\{ \[I18N_STORAGE_KEY\]: v \}/.test(providerSrc) ||
    /storageSet\(/.test(providerSrc),
  "storage write missing"
);
check(
  "setLang('auto') also persisted (explicit 'auto' branch)",
  /setLang:\s*\(l\)\s*=>\s*\{[\s\S]*?if \(l === "auto"\)/.test(providerSrc),
  "'auto' branch missing"
);

// --- Provider source contract: detectLang feeds lang (override aware) ---
check(
  "lang computed via detectLang(navLang, override)",
  /detectLang\(\s*navLang\s*,\s*override\s*\)/.test(providerSrc),
  "detectLang usage missing"
);
check(
  "translator built per computed lang",
  /makeTranslator\(\s*lang\s*,\s*zh\s*,\s*en\s*\)/.test(providerSrc),
  "makeTranslator usage missing"
);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll persist assertions passed.");
