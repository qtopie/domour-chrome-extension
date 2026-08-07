/**
 * TEST-TA-005 / TEST-TA-006 — trace normalization & display-detail pure tests.
 * vproxy `/api/traces` raw shapes are coerced by `normalizeTrace`; the UI
 * helpers (kvPairs / formatLatency / statusClass / bodyTruncated) back the
 * table render + expandable detail rows. No chrome, no real I/O. Run with:
 *   node --experimental-strip-types testings/trafficAnalysis/traces.test.ts
 */
import {
  BODY_TRUNCATE,
  bodyTruncated,
  formatLatency,
  kvPairs,
  normalizeTrace,
  statusClass
} from "../../frontend/src/types/trafficAnalysis.ts";

let failures = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ---------- TEST-TA-005: raw trace → stable shape ----------
console.log("TestTA_FetchTraces (SPEC-TA-005)");
{
  const raw = {
    id: "t1",
    timestamp: "2025-06-10T10:00:00Z",
    method: "GET",
    url: "https://dev.local/api",
    path: "/api",
    host: "dev.local",
    request_proto: "HTTP/1.1",
    req_headers: { "user-agent": ["curl/8"] },
    req_body: "hello",
    status_code: 200,
    resp_headers: { "content-type": ["application/json"] },
    resp_body: "{\"ok\":true}",
    latency_ms: 42
  };
  const t = normalizeTrace(raw);
  check("method preserved", t.method === "GET");
  check("host preserved", t.host === "dev.local");
  check("path preserved", t.path === "/api");
  check("status preserved", t.status_code === 200);
  check("latency preserved", t.latency_ms === 42);
  check("reqHeaders preserved", t.req_headers["user-agent"][0] === "curl/8");
  check("respBody preserved", t.resp_body === '{"ok":true}');
  check("reqBody preserved", t.req_body === "hello");

  // Sparse/partial entries must not throw and keep stable keys.
  const sparse = normalizeTrace({});
  check("sparse entry stable keys", "method" in sparse && "host" in sparse && "status_code" in sparse);
  check("sparse method empty string", sparse.method === "");

  // Missing id stays empty — the UI falls back to host-timestamp-method.
  const t2 = normalizeTrace({ host: "example.com", timestamp: "T", method: "POST" });
  check("missing id stays empty in normalizeTrace", t2.id === "");
}

// ---------- TEST-TA-006: render & detail helpers ----------
console.log("TestTA_RenderDetail (SPEC-TA-006)");
{
  // Table cells: method/host/path/status/latency are all presentable.
  const t = normalizeTrace({
    method: "GET",
    host: "dev.local",
    path: "/api",
    status_code: 200,
    latency_ms: 1500
  });
  check("method cell text", t.method === "GET");
  check("host cell text", t.host === "dev.local");
  check("status bucket ok for 2xx", statusClass(200).includes("ok"));
  check("status bucket warn for 3xx", statusClass(301).includes("warn"));
  check("status bucket err for 5xx", statusClass(500).includes("err"));
  check("status bucket neutral when missing", statusClass(undefined) === "ta-status-code");
  check("latency formats seconds", formatLatency(1500) === "1.50s");
  check("latency formats ms", formatLatency(42) === "42ms");
  check("latency dash when missing", formatLatency(undefined) === "-");

  // Detail: req/resp header tables + body truncation.
  const pairs = kvPairs({ "content-type": ["application/json"], "x-a": ["1", "2"] });
  check("header map flattened to pairs", pairs.length === 2);
  check("multi-value joined", pairs.some(([k, v]) => k === "x-a" && v === "1, 2"));

  const longBody = "x".repeat(BODY_TRUNCATE + 100);
  const truncated = bodyTruncated(longBody, false);
  check("long body truncated below threshold", truncated.length < longBody.length && truncated.length >= BODY_TRUNCATE);
  check("truncated body contains hint", truncated.includes("已截断"));
  check("full view returns entire body", bodyTruncated(longBody, true) === longBody);
  check("short body untouched", bodyTruncated("hi", false) === "hi");
  check("null body coerced to empty", bodyTruncated(undefined as any, false) === "");
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
