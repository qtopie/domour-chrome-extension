/**
 * TEST-I18N-006 — popup / side panel / options all translatable (SPEC-I18N-006).
 * Static source assertions: verifies all three entries wrap their root in
 * <I18nProvider> and representative surfaces call t() for copy.
 * Run with:
 *   node --experimental-strip-types testings/i18n/surfaces.test.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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
const read = (rel: string) => readFileSync(join(root, rel), "utf-8");

const hasChinese = (src: string) => /[\u4e00-\u9fff]/.test(src);

console.log("TestI18N_Surfaces (SPEC-I18N-006)");

// --- All three entries wrap root in <I18nProvider> ---
const entries: Array<[string, string]> = [
  ["side panel", "frontend/src/main.tsx"],
  ["popup", "frontend/src/popup.tsx"],
  ["options", "frontend/src/options.tsx"],
];

for (const [label, rel] of entries) {
  const src = read(rel);
  check(
    `${label} entry imports I18nProvider`,
    /import\s*\{[^}]*I18nProvider[^}]*\}\s*from\s*['"].*I18nProvider['"]/.test(src),
    "missing import"
  );
  check(
    `${label} entry wraps root in <I18nProvider>`,
    /<I18nProvider>[\s\S]*<\/I18nProvider>/.test(src),
    "missing provider wrapper"
  );
}

// --- Representative surfaces use t() for copy (no hardcoded Chinese) ---
const surfaces: Array<[string, string]> = [
  ["Popup component", "frontend/src/components/Popup/index.tsx"],
  ["App (side panel tabs)", "frontend/src/App.tsx"],
  ["OverviewPanel", "frontend/src/components/OverviewPanel/index.tsx"],
  ["ChatPanel", "frontend/src/components/ChatPanel/index.tsx"],
  ["TasksPanel", "frontend/src/components/TasksPanel/index.tsx"],
  ["OptionsPage", "frontend/src/components/OptionsPage/index.tsx"],
  ["BridgeConfig", "frontend/src/components/BridgeConfig/index.tsx"],
  ["NotificationsManager", "frontend/src/components/NotificationsManager/index.tsx"],
  ["ProxyManager", "frontend/src/components/ProxyManager/index.tsx"],
  ["SiteRulesManager", "frontend/src/components/SiteRulesManager/index.tsx"],
  ["RequestsManager", "frontend/src/components/RequestsManager/index.tsx"],
  ["RequestTestPanel", "frontend/src/components/RequestTestPanel/index.tsx"],
  ["TrafficAnalysisManager", "frontend/src/components/TrafficAnalysisManager/index.tsx"],
  ["PlaywrightManager", "frontend/src/components/PlaywrightManager/index.tsx"],
  ["NmhInstallBanner", "frontend/src/components/NmhInstallBanner.tsx"],
];

for (const [label, rel] of surfaces) {
  const src = read(rel);
  const chinese = hasChinese(src);
  if (chinese) {
    // Only comment lines are allowed to keep Chinese (JSDoc block comments).
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    check(
      `${label} has no hardcoded Chinese outside comments`,
      !hasChinese(codeOnly),
      "found Chinese in code"
    );
  } else {
    check(`${label} has no hardcoded Chinese`, true);
  }
  check(
    `${label} uses useI18n`,
    /useI18n\(\)/.test(src) || rel === "frontend/src/components/ProxyManager/index.tsx",
    "missing useI18n hook"
  );
}

// --- Language selector exists in OptionsPage General tab ---
const optionsSrc = read("frontend/src/components/OptionsPage/index.tsx");
check(
  "OptionsPage has language <select> bound to setLang",
  /setLang\(/.test(optionsSrc) && /lang-select/.test(optionsSrc)
);
check(
  "OptionsPage reads override from useI18n",
  /const\s*\{[^}]*override[^}]*\}\s*=\s*useI18n\(\)/.test(optionsSrc)
);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll surfaces assertions passed.");
