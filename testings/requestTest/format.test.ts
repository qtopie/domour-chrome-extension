/**
 * TEST-RT-005 — JSON response formatting for display.
 * Pure function test. Run with:
 *   node --experimental-strip-types testings/requestTest/format.test.ts
 */
import { formatBodyForDisplay } from "../../frontend/src/types/requestTest.ts";

let failures = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("TestRT_Format (SPEC-RT-005)");

const pretty = formatBodyForDisplay("{\"b\":2,\"a\":1}", "application/json; charset=utf-8");
check("JSON body is pretty-printed", pretty.includes("\n  \"b\": 2"), pretty);
check("output still parses", (() => {
  try {
    JSON.parse(pretty);
    return true;
  } catch {
    return false;
  }
})());

check(
  "non-JSON content-type passes through",
  formatBodyForDisplay("{\"b\":2}", "text/plain") === "{\"b\":2}"
);
check(
  "malformed JSON with json content-type falls back to raw",
  formatBodyForDisplay("{oops", "application/json") === "{oops"
);
check("empty body returns empty string", formatBodyForDisplay("") === "");
check("undefined content-type passes through", formatBodyForDisplay("plain", undefined) === "plain");

console.log(failures === 0 ? "\nAll format tests passed ✅" : `\n${failures} FAILURE(S) ❌`);
process.exit(failures === 0 ? 0 : 1);
