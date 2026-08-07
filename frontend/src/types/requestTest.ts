/**
 * Request Test — Postman-style HTTP client powered by the background service
 * worker's `fetch` (host_permissions `<all_urls>` bypasses page-level CORS).
 *
 * Pure module (no chrome dependency) so it can be unit-tested in the harness.
 * `runRequestTest` takes an injectable `fetchImpl` so tests never touch the
 * network; the extension wires it to `globalThis.fetch` in the service worker.
 */

import type { HeaderKV } from "./requestHeaders.ts";
import { validateHeader } from "./requestHeaders.ts";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export const HTTP_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

/** Methods that may carry a request body. */
export const METHODS_WITH_BODY: ReadonlySet<HttpMethod> = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface RequestTestComposer {
  method: HttpMethod;
  /** Required, absolute http(s):// URL. */
  url: string;
  /** Reuses the request-headers HeaderKV model. */
  headers: HeaderKV[];
  /** Only honored when METHODS_WITH_BODY.has(method). */
  body: string;
}

export interface RequestTestResult {
  ok: boolean;
  /** HTTP status code, 0 when the request never completed. */
  status: number;
  statusText: string;
  /** Final URL after redirects (response.url). */
  finalUrl: string;
  /** Time from fetch() call to response headers. */
  latencyMs: number;
  headers: [string, string][];
  body: string;
  truncated: boolean;
  /** Validation failure / network error / timeout message. */
  error?: string;
}

/** Response body capture cap (bytes). Beyond this the stream is cancelled. */
export const MAX_BODY_CAPTURE = 1024 * 1024;

/** Default timeout. Kept under the MV3 service-worker event budget. */
export const DEFAULT_TIMEOUT_MS = 25_000;

/** True when the method may carry a request body. */
export function supportsBody(method: HttpMethod): boolean {
  return METHODS_WITH_BODY.has(method);
}

/**
 * Validate a composer before sending. Returns an error message or null.
 */
export function validateRequestTestInput(composer: RequestTestComposer): string | null {
  if (!composer || typeof composer !== "object") return "请求配置无效";
  if (!HTTP_METHODS.includes(composer.method)) {
    return `不支持的方法: ${String(composer.method)}`;
  }
  const url = String(composer.url ?? "").trim();
  if (!url) return "URL 不能为空";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `URL 格式非法: ${url}`;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return `仅支持 http/https 协议，收到 ${parsed.protocol}`;
  }
  for (const h of composer.headers ?? []) {
    if (!h || !String(h.key ?? "").trim()) continue; // empty rows are skipped
    const err = validateHeader({ key: h.key, value: h.value });
    if (err) return err;
  }
  return null;
}

/**
 * Build the fetch RequestInit from a composer. Empty-key header rows are
 * dropped; body is only attached for body-capable methods.
 */
export function buildFetchInit(composer: RequestTestComposer): RequestInit {
  const headers: Record<string, string> = {};
  for (const h of composer.headers ?? []) {
    const key = String(h.key ?? "").trim();
    if (!key) continue;
    headers[key] = String(h.value ?? "");
  }
  const init: RequestInit = { method: composer.method, headers };
  if (supportsBody(composer.method)) {
    init.body = composer.body ?? "";
  }
  return init;
}

/**
 * Read a response body stream up to `maxBytes`, cancelling the stream when the
 * cap is exceeded. Returns the decoded UTF-8 text plus a truncated flag.
 */
export async function readBodyWithCap(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number
): Promise<{ text: string; truncated: boolean }> {
  if (!body) return { text: "", truncated: false };
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let accumulated = "";
  let size = 0;
  let truncated = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > maxBytes) {
        const remaining = maxBytes - (size - value.byteLength);
        accumulated += decoder.decode(value.subarray(0, Math.max(0, remaining)), { stream: true });
        truncated = true;
        await reader.cancel().catch(() => {});
        break;
      }
      accumulated += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
  return { text: accumulated, truncated };
}

/**
 * Pretty-print JSON bodies for display; pass through everything else.
 */
export function formatBodyForDisplay(body: string, contentType?: string): string {
  if (!body) return body ?? "";
  const isJson = (contentType ?? "").toLowerCase().includes("json");
  if (isJson) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      // Not valid JSON after all — fall through to raw text.
    }
  }
  return body;
}

export interface RunRequestTestOptions {
  /** Injectable for tests. Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Execute a request test through an (injectable) fetch.
 * Validation failures, network errors and timeouts are normalized into a
 * RequestTestResult with ok:false rather than throwing.
 */
export async function runRequestTest(
  composer: RequestTestComposer,
  opts: RunRequestTestOptions = {}
): Promise<RequestTestResult> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const failed = (error: string, extra?: Partial<RequestTestResult>): RequestTestResult => ({
    ok: false,
    status: 0,
    statusText: "",
    finalUrl: "",
    latencyMs: 0,
    headers: [],
    body: "",
    truncated: false,
    error,
    ...extra
  });

  const validationError = validateRequestTestInput(composer);
  if (validationError) return failed(validationError);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  let response: Response;
  try {
    response = await fetchImpl(composer.url, {
      ...buildFetchInit(composer),
      signal: controller.signal
    });
  } catch (err: any) {
    clearTimeout(timer);
    const aborted = controller.signal.aborted;
    return failed(
      aborted
        ? `请求超时（>${Math.round(timeoutMs / 1000)}s）`
        : String((err as Error)?.message ?? err),
      { latencyMs: Date.now() - startedAt, finalUrl: composer.url }
    );
  }
  clearTimeout(timer);
  const latencyMs = Date.now() - startedAt;

  const respHeaders: [string, string][] = [];
  response.headers.forEach((value, key) => respHeaders.push([key, value]));

  const { text, truncated } = await readBodyWithCap(response.body ?? null, MAX_BODY_CAPTURE);

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    finalUrl: response.url,
    latencyMs,
    headers: respHeaders,
    body: text,
    truncated
  };
}

/** Create a blank composer for the UI. */
export function createEmptyRequestTest(): RequestTestComposer {
  return { method: "GET", url: "", headers: [{ key: "", value: "" }], body: "" };
}
