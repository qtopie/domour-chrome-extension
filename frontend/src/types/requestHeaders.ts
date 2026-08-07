/**
 * Request Headers — user-configurable HTTP request header injection for
 * call-chain tracing and gray/canary testing. Mirrors the SiteRules model
 * (global default + per-host longest-suffix overrides) so it shares the same
 * mental model across the Options Page and the background worker.
 *
 * Pure module (no chrome dependency) so it can be unit-tested in the harness.
 *
 * Resolution order for a given request URL:
 *   1. global headers (if global.enabled) form the base set;
 *   2. longest-suffix perHost match (if that rule is enabled) is merged on top,
 *      overriding same-key values;
 *   3. if global is disabled, only a matched (enabled) perHost rule applies.
 */

export interface HeaderKV {
  /** Header name, case-insensitive. */
  key: string;
  /** Header value. Static string; CR/LF forbidden. */
  value: string;
}

export interface HostHeaderRule {
  /** Domain scope. "" means the global default rule. */
  host: string;
  headers: HeaderKV[];
  enabled: boolean;
}

export interface RequestHeadersConfig {
  global: HostHeaderRule;
  perHost: Record<string, HostHeaderRule>;
  _meta?: { updatedAt: number };
}

export const DEFAULT_GLOBAL_HEADER_RULE: HostHeaderRule = {
  host: "",
  headers: [],
  enabled: true
};

export function createEmptyRequestHeaders(): RequestHeadersConfig {
  return {
    global: { ...DEFAULT_GLOBAL_HEADER_RULE },
    perHost: {}
  };
}

export const HEADER_KEY_RE = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;
export const HEADER_VALUE_RE = /^[^\r\n]*$/;

/** True if the header name is allowed for modification. */
export function isHeaderKeyAllowed(key: string): boolean {
  return HEADER_KEY_RE.test(key);
}

/** True if the value contains no CR/LF (prevents header injection). */
export function isHeaderValueAllowed(value: string): boolean {
  return HEADER_VALUE_RE.test(value);
}

/**
 * Validate a single header KV. Returns an error message or null when valid.
 */
export function validateHeader(kv: HeaderKV): string | null {
  const key = kv.key?.trim() ?? "";
  if (!key) return "Header key 不能为空";
  if (!isHeaderKeyAllowed(key)) return `Header key 非法: ${key}`;
  if (!isHeaderValueAllowed(kv.value ?? "")) return "Header value 不能包含回车换行";
  return null;
}

export function normalizeHost(host: string): string {
  return host
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^[a-z]+:\/\//, "")
    .replace(/\/.*$/, "");
}

/** Hostname of a URL for rule lookup. */
export function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    const cleaned = url.replace(/^[a-z]+:\/\//, "");
    return cleaned.split("/")[0].split(":")[0].split("?")[0];
  }
}

/**
 * Longest-suffix match. `api.example.com` matches a `example.com` record;
 * `example.com` does NOT match `api.example.com` records.
 * Returns the matched host key or "" when nothing matches.
 */
export function matchPerHost(config: RequestHeadersConfig, rawHost: string): string {
  const host = normalizeHost(rawHost);
  const perHost = config?.perHost ?? {};
  const labels = host.split(".").filter(Boolean);
  for (let i = 0; i < labels.length; i++) {
    const candidate = labels.slice(i).join(".");
    if (perHost[candidate]) {
      return candidate;
    }
  }
  return "";
}

/**
 * Resolve the effective header list for a URL.
 * Order: global headers first, then perHost headers (same-key overrides).
 */
export function resolveRequestHeaders(config: RequestHeadersConfig, rawUrl: string): HeaderKV[] {
  const cfg = config ?? createEmptyRequestHeaders();
  const host = hostFromUrl(rawUrl);
  const matchedKey = matchPerHost(cfg, host);
  const perHostRule = matchedKey ? cfg.perHost[matchedKey] : undefined;

  const base: HeaderKV[] = cfg.global?.enabled ? [...(cfg.global.headers ?? [])] : [];
  if (perHostRule?.enabled && perHostRule.headers?.length) {
    const overridden = new Set(perHostRule.headers.map((h) => h.key.toLowerCase()));
    const merged = base.filter((h) => !overridden.has(h.key.toLowerCase()));
    return [...merged, ...perHostRule.headers];
  }
  return base;
}

/**
 * Update (or create) a per-host header rule.
 */
export function setHeaderRule(
  config: RequestHeadersConfig,
  rawHost: string,
  headers: HeaderKV[],
  enabled = true
): RequestHeadersConfig {
  const host = normalizeHost(rawHost);
  if (!host) return config;
  const existing = config.perHost[host] ?? { host, headers: [], enabled: true };
  return {
    ...config,
    perHost: {
      ...config.perHost,
      [host]: { ...existing, host, headers, enabled }
    },
    _meta: { updatedAt: Date.now() }
  };
}

/** Remove a per-host header rule entirely. */
export function removeHeaderRule(config: RequestHeadersConfig, rawHost: string): RequestHeadersConfig {
  const host = normalizeHost(rawHost);
  const perHost = { ...config.perHost };
  delete perHost[host];
  return { ...config, perHost, _meta: { updatedAt: Date.now() } };
}

/** Toggle the global default rule. */
export function toggleGlobalHeaderRule(
  config: RequestHeadersConfig,
  enabled: boolean
): RequestHeadersConfig {
  return {
    ...config,
    global: { ...config.global, enabled },
    _meta: { updatedAt: Date.now() }
  };
}

/**
 * Plain-object DNR rule descriptor produced from the config. The background
 * worker maps these to chrome.declarativeNetRequest.Rule objects.
 */
export interface DnrRuleSpec {
  id: number;
  priority: number;
  urlFilter: string;
  headers: HeaderKV[];
}

/**
 * Build the set of DNR rules needed to realize the config.
 * - Global rule: urlFilter "*", priority 1 (applies to everything).
 * - Per-host rule: urlFilter "||{host}", priority 2 (overrides global on same key).
 * Disabled rules and empty header sets are skipped.
 */
export function buildDnrRuleSpecs(config: RequestHeadersConfig): DnrRuleSpec[] {
  const cfg = config ?? createEmptyRequestHeaders();
  const specs: DnrRuleSpec[] = [];
  let id = 1;

  const globalHeaders = cfg.global?.enabled ? (cfg.global.headers ?? []) : [];
  if (globalHeaders.length > 0) {
    specs.push({ id: id++, priority: 1, urlFilter: "*", headers: globalHeaders });
  }

  for (const [host, rule] of Object.entries(cfg.perHost ?? {})) {
    if (!rule.enabled || !rule.headers?.length) continue;
    // Per-host rule carries the merged effective set (global + per-host overrides),
    // so a same-key global header is always overwritten by priority-2 rule.
    const overridden = new Set(rule.headers.map((h) => h.key.toLowerCase()));
    const merged = globalHeaders.filter((h) => !overridden.has(h.key.toLowerCase()));
    specs.push({
      id: id++,
      priority: 2,
      urlFilter: `||${host}`,
      headers: [...merged, ...rule.headers]
    });
  }

  return specs;
}

export const RESOURCE_TYPES = [
  "main_frame",
  "sub_frame",
  "xmlhttprequest",
  "script",
  "image",
  "stylesheet",
  "font",
  "media",
  "websocket",
  "other"
] as const;

type ChromeRule = chrome.declarativeNetRequest.Rule;

export function normalizeDnrRuleSpecs(specs: DnrRuleSpec[]): ChromeRule[] {
  return specs.map((s) => ({
    id: s.id,
    priority: s.priority,
    action: {
      type: "modifyHeaders",
      requestHeaders: s.headers.map((h) => ({
        header: h.key,
        operation: "set",
        value: h.value
      }))
    },
    condition: {
      urlFilter: s.urlFilter,
      resourceTypes: [...RESOURCE_TYPES]
    }
  }));
}
