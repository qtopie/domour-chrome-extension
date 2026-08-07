/**
 * TEST-I18N-005 — zh/en dictionary key sets are identical (SPEC-I18N-005).
 * Pure module test: no chrome dependency.
 * Run with:
 *   node --experimental-strip-types testings/i18n/dict-complete.test.ts
 */
import { assertDictComplete } from "../../frontend/src/i18n/index.ts";
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

console.log("TestI18N_DictComplete (SPEC-I18N-005)");

const missing = assertDictComplete(zh, en);
check(
  "no keys missing on either side",
  missing.length === 0,
  `missing: ${JSON.stringify(missing)}`
);
check(
  "same key count",
  Object.keys(zh).length === Object.keys(en).length,
  `zh=${Object.keys(zh).length} en=${Object.keys(en).length}`
);
check("dict non-empty", Object.keys(zh).length > 100, `zh keys=${Object.keys(zh).length}`);

// Guard against placeholder mismatch: every {param} used in zh must also appear in en for the same key.
const paramMismatches: string[] = [];
for (const key of Object.keys(zh)) {
  const zhParams = [...zh[key].matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  const enParams = [...(en[key] || "").matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  if (JSON.stringify(zhParams) !== JSON.stringify(enParams)) {
    paramMismatches.push(`${key}: zh=[${zhParams}] en=[${enParams}]`);
  }
}
check(
  "placeholder params match between zh/en",
  paramMismatches.length === 0,
  `mismatches: ${JSON.stringify(paramMismatches)}`
);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll dict-complete assertions passed.");
