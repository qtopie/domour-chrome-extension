/**
 * TEST-RT-003 / 004 / 006 / 007 — runRequestTest execution paths.
 * Uses an injectable fake fetch (no real I/O). Run with:
 *   node --experimental-strip-types testings/requestTest/run.test.ts
 */
import type { RequestTestComposer, RunRequestTestOptions } from "../../frontend/src/types/requestTest.ts";
import { MAX_BODY_CAPTURE, runRequestTest } from "../../frontend/src/types/requestTest.ts";

let failures = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const GET: RequestTestComposer = {
  method: "GET",
  url: "https://example.com/api",
  headers: [{ key: "X-Trace", value: "abc" }],
  body: ""
};

function run(composer: RequestTestComposer, opts?: RunRequestTestOptions) {
  return runRequestTest(composer, opts);
}

// ---------- TEST-RT-003: success path ----------
console.log("TestRT_Success (SPEC-RT-003)");
{
  const fetchImpl: typeof fetch = async () =>
    new Response("hello", {
      status: 200,
      statusText: "OK",
      headers: { "Content-Type": "text/plain" }
    });

  const res = await run(GET, { fetchImpl });
  check("ok=true", res.ok === true);
  check("status=200", res.status === 200);
  check("statusText=OK", res.statusText === "OK");
  check("latencyMs>=0", typeof res.latencyMs === "number" && res.latencyMs >= 0);
  check("Content-Type header captured", res.headers.some(([k]) => k.toLowerCase() === "content-type"));
  check("body=hello", res.body === "hello");
  check("truncated=false", res.truncated === false);
  check("no error", res.error === undefined);
}

// ---------- TEST-RT-004: large body truncation ----------
console.log("TestRT_Truncate (SPEC-RT-004)");
{
  const big = new Uint8Array(MAX_BODY_CAPTURE + 4096).fill(65); // 65 == 'A'
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(big);
      controller.close();
    }
  });
  const fetchImpl: typeof fetch = async () => new Response(stream, { status: 200 });

  const res = await run(GET, { fetchImpl });
  check("truncated=true", res.truncated === true);
  check("body length capped", res.body.length <= MAX_BODY_CAPTURE, `len=${res.body.length}`);
  check("body starts with A", res.body.startsWith("A"));
}

// ---------- TEST-RT-006: network error ----------
console.log("TestRT_NetworkError (SPEC-RT-006)");
{
  const fetchImpl: typeof fetch = async () => {
    throw new TypeError("fetch failed");
  };
  const res = await run(GET, { fetchImpl });
  check("ok=false", res.ok === false);
  check("status=0", res.status === 0);
  check('error="fetch failed"', res.error === "fetch failed", `got=${res.error}`);
}

// ---------- TEST-RT-007: timeout aborts ----------
console.log("TestRT_Timeout (SPEC-RT-007)");
{
  let capturedSignal: AbortSignal | undefined;
  const fetchImpl: typeof fetch = (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      capturedSignal = init?.signal as AbortSignal;
      capturedSignal.addEventListener("abort", () => {
        reject(new DOMException("The operation was aborted", "AbortError"));
      });
    });

  const res = await run(GET, { fetchImpl, timeoutMs: 50 });
  check("ok=false", res.ok === false);
  check("status=0", res.status === 0);
  check('error contains 超时', (res.error ?? "").includes("超时"), `got=${res.error}`);
  check("signal was aborted", capturedSignal?.aborted === true);
}

// ---------- Summary ----------
console.log(failures === 0 ? "\nAll run tests passed ✅" : `\n${failures} FAILURE(S) ❌`);
process.exit(failures === 0 ? 0 : 1);
