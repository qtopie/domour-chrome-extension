/**
 * TEST-RT-001 / TEST-RT-002 — input validation & fetch-init building.
 * Pure-module tests (no chrome, no I/O). Run with:
 *   node --experimental-strip-types testings/requestTest/build.test.ts
 */
import type { RequestTestComposer } from "../../frontend/src/types/requestTest.ts";
import {
  buildFetchInit,
  supportsBody,
  validateRequestTestInput
} from "../../frontend/src/types/requestTest.ts";

let failures = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ---------- TEST-RT-001: validateRequestTestInput ----------
console.log("TestRT_Validate (SPEC-RT-001)");

const VALID: RequestTestComposer = {
  method: "POST",
  url: "https://example.com/api",
  headers: [{ key: "X-Trace", value: "abc" }],
  body: "{\"a\":1}"
};
check("valid composer returns null", validateRequestTestInput(VALID) === null);

check("empty URL rejected", validateRequestTestInput({ ...VALID, url: "  " }) !== null);
check("ftp:// URL rejected", validateRequestTestInput({ ...VALID, url: "ftp://example.com" }) !== null);
check("garbage URL rejected", validateRequestTestInput({ ...VALID, url: "not a url" }) !== null);
check("http:// URL accepted", validateRequestTestInput({ ...VALID, url: "http://example.com/x" }) === null);

check(
  "bad method rejected",
  validateRequestTestInput({ ...VALID, method: "TRACE" as any }) !== null
);

const badKey: RequestTestComposer = {
  ...VALID,
  headers: [{ key: "Bad Key!", value: "v" }]
};
check("illegal header key rejected", validateRequestTestInput(badKey) !== null);

const crlfValue: RequestTestComposer = {
  ...VALID,
  headers: [{ key: "X-Test", value: "a\r\nInjected: 1" }]
};
check("CRLF header value rejected", validateRequestTestInput(crlfValue) !== null);

const emptyRow: RequestTestComposer = {
  ...VALID,
  headers: [{ key: "  ", value: "ignored" }, { key: "X-Real", value: "ok" }]
};
check("empty header rows are skipped", validateRequestTestInput(emptyRow) === null);

// ---------- TEST-RT-002: buildFetchInit ----------
console.log("TestRT_BuildFetchInit (SPEC-RT-002)");

const post: RequestTestComposer = {
  method: "POST",
  url: "https://example.com/api",
  headers: [
    { key: "X-Trace", value: "abc" },
    { key: "  ", value: "" }
  ],
  body: "{\"a\":1}"
};
const init = buildFetchInit(post);
check("method passthrough", init.method === "POST");
check("body preserved for body-capable method", init.body === "{\"a\":1}");
check("empty-key header dropped", (init.headers as any)["X-Trace"] === "abc");
check(
  "blank header row not present",
  !Object.keys(init.headers as any).some((k) => k.trim() === "")
);

for (const m of ["GET", "HEAD", "OPTIONS"] as const) {
  const noBody = buildFetchInit({ ...VALID, method: m, body: "should-not-send" });
  check(`${m} carries no body`, noBody.body === undefined);
}
check("supportsBody(POST) true", supportsBody("POST"));
check("supportsBody(GET) false", !supportsBody("GET"));

// ---------- Summary ----------
console.log(failures === 0 ? "\nAll build tests passed ✅" : `\n${failures} FAILURE(S) ❌`);
process.exit(failures === 0 ? 0 : 1);
