/**
 * Traffic Analysis — whistle-like proxy-rule configuration + packet capture.
 *
 * Reuses the local vproxy daemon (HTTP proxy :8118 for CONNECT+MITM deep
 * tracing, Web :8899 for /api/traces and /api/config hot-update). The Chrome
 * proxy is switched to vproxy's HTTP port while the feature is enabled, and
 * vproxy rules decide which hosts go through an upstream proxy (PROXY) vs.
 * which get deep-traced (INTERCEPT).
 *
 * Pure module (no chrome dependency) so it can be unit-tested in the harness.
 */

export type VProxyAction = "DIRECT" | "PROXY" | "INTERCEPT" | "MAP";

export interface TrafficRule {
  /** Domain/IP (DOMAIN), URL prefix (URL) or process name (PROCESS). */
  pattern: string;
  action: VProxyAction;
  /** Required when action === "MAP": file:// or http(s):// target. */
  target?: string;
  enabled: boolean;
}

export interface TrafficAnalysisConfig {
  /** Master switch: when true the Chrome proxy is pointed at vproxy :8118. */
  enabled: boolean;
  upstreams: string[];
  rules: TrafficRule[];
  /** FINAL catch-all action when no rule matches. */
  finalAction: "DIRECT" | "PROXY";
  directDns: boolean;
  _meta?: { updatedAt: number; previousProxyId?: string };
}

export function createEmptyTrafficAnalysis(): TrafficAnalysisConfig {
  return {
    enabled: false,
    upstreams: [],
    rules: [],
    finalAction: "PROXY",
    directDns: true
  };
}

/**
 * True if a pattern is a plain domain/IP host (no "/" and no explicit type
 * prefix). URL patterns contain "/", PROCESS patterns start with "PROCESS:".
 */
export function isDomainPattern(pattern: string): boolean {
  return !pattern.includes("/") && !/^(PROCESS|URL|PID):/i.test(pattern);
}

export function isValidAction(action: string): action is VProxyAction {
  return action === "DIRECT" || action === "PROXY" || action === "INTERCEPT" || action === "MAP";
}

export function isValidUpstream(upstream: string): boolean {
  return /^(socks5?|http|https):\/\//i.test(upstream.trim());
}

/** Validates a rule and returns an error message, or null when valid. */
export function validateTrafficRule(rule: TrafficRule): string | null {
  const pattern = (rule.pattern || "").trim();
  if (!pattern) return "pattern 不能为空";
  if (!isValidAction(rule.action)) return `非法 action: ${rule.action}`;
  if (rule.action === "MAP" && !(rule.target || "").trim()) return "MAP 规则必须填写 target";
  if (rule.action === "MAP" && !/^(file:\/\/|https?:\/\/)/i.test((rule.target || "").trim())) {
    return "MAP target 必须是 file:// 或 http(s):// 开头";
  }
  return null;
}

/** Validates a whole config; returns an error message or null when valid. */
export function validateTrafficConfig(config: TrafficAnalysisConfig): string | null {
  if (!config || typeof config !== "object") return "config 非法";
  if (!Array.isArray(config.upstreams)) return "upstreams 必须是数组";
  for (const u of config.upstreams) {
    const trimmed = (u || "").trim();
    if (trimmed && !isValidUpstream(trimmed)) return `非法 upstream: ${trimmed}`;
  }
  if (!Array.isArray(config.rules)) return "rules 必须是数组";
  for (const rule of config.rules) {
    if (!rule || typeof rule !== "object") return "存在非法规则行";
    const err = validateTrafficRule(rule);
    if (err) return err;
  }
  if (config.finalAction !== "DIRECT" && config.finalAction !== "PROXY") {
    return "FINAL 兜底动作必须是 DIRECT 或 PROXY";
  }
  return null;
}

/**
 * Builds the vproxy `rules` string array from the friendly config.
 * Only enabled rules are emitted; invalid rules throw.
 */
export function buildVProxyRules(config: TrafficAnalysisConfig): string[] {
  const out: string[] = [];

  for (const rule of config.rules) {
    if (!rule.enabled) continue;
    const err = validateTrafficRule(rule);
    if (err) throw new Error(err);
    const pattern = rule.pattern.trim();
    if (isDomainPattern(pattern)) {
      out.push(`DOMAIN,${pattern},${rule.action}`);
    } else {
      // Explicit type prefix (URL:, PROCESS:, PID:) or URL-with-slash.
      const m = pattern.match(/^(URL|PROCESS|PID):(.*)$/i);
      if (m) {
        const prefix = m[1].toUpperCase();
        const rest = m[2].trim();
        if (prefix === "PID") {
          if (!/^\d+$/.test(rest)) throw new Error(`PID 规则必须是数字: ${pattern}`);
          out.push(`PID,${rest},${rule.action}`);
        } else {
          out.push(`${prefix},${rest},${rule.action}`);
        }
      } else {
        out.push(`URL,${pattern},${rule.action}`);
      }
    }
  }

  out.push(`FINAL,${config.finalAction}`);
  return out;
}

export interface VProxyConfig {
  upstreams: string[];
  rules: string[];
  test_interval?: number;
  web_port?: number;
  enable_ebpf?: boolean;
  direct_dns?: boolean;
  dial_timeout_ms?: number;
  dial_retry_count?: number;
}

/**
 * Composes the full vproxy config JSON that gets POSTed to /api/config.
 * Preserves runtime fields from the current vproxy config (e.g. enable_ebpf).
 */
export function buildVProxyConfigPayload(
  config: TrafficAnalysisConfig,
  current: Partial<VProxyConfig> | null
): VProxyConfig {
  const payload: VProxyConfig = {
    upstreams: config.upstreams.map((u) => u.trim()).filter((u) => u.length > 0),
    rules: buildVProxyRules(config)
  };
  if (current) {
    if (current.test_interval != null) payload.test_interval = current.test_interval;
    if (current.web_port != null) payload.web_port = current.web_port;
    if (current.enable_ebpf != null) payload.enable_ebpf = current.enable_ebpf;
    if (current.direct_dns != null) payload.direct_dns = current.direct_dns;
    if (current.dial_timeout_ms != null) payload.dial_timeout_ms = current.dial_timeout_ms;
    if (current.dial_retry_count != null) payload.dial_retry_count = current.dial_retry_count;
  }
  payload.direct_dns = config.directDns;
  return payload;
}

/**
 * Resolves the action that would apply to a given host.
 * - longest-suffix rule match wins;
 * - ties broken by array order (first match);
 * - no match → FINAL action.
 */
export function resolveRulesForHost(
  config: TrafficAnalysisConfig,
  host: string
): { action: VProxyAction; rule?: TrafficRule } {
  const h = (host || "").toLowerCase();
  let bestRule: TrafficRule | undefined;
  let bestLen = -1;

  for (const rule of config.rules) {
    if (!rule.enabled) continue;
    if (rule.action === "MAP") continue; // MAP is URL-scoped, not host-scoped
    const p = rule.pattern.trim().toLowerCase();
    if (!isDomainPattern(rule.pattern)) continue; // only domain rules resolve by host
    // Longest-suffix match: exact host or h ends with "." + pattern.
    const matches = h === p || h.endsWith("." + p);
    if (matches && p.length > bestLen) {
      bestLen = p.length;
      bestRule = rule;
    }
  }

  if (bestRule) return { action: bestRule.action, rule: bestRule };
  return { action: config.finalAction };
}

/** True if the pattern looks like a local dev target (localhost / *.local / LAN IP). */
export function isLocalDevPattern(pattern: string): boolean {
  const p = pattern.trim().toLowerCase();
  if (p.startsWith("localhost") || p.endsWith(".localhost")) return true;
  if (p.endsWith(".local") || p.endsWith(".lan")) return true;
  if (/^(127\.|10\.|192\.168\.)/.test(p)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(p)) return true;
  return false;
}

/**
 * vproxy `/api/traces` entry — mirrors `internal/trace_model.go` JSON shape.
 * `req_headers` / `resp_headers` are `map[string][]string`.
 */
export interface VProxyTrace {
  id?: string;
  timestamp?: string;
  method?: string;
  url?: string;
  path?: string;
  host?: string;
  request_proto?: string;
  req_headers?: Record<string, string[]>;
  req_body?: string;
  status_code?: number;
  resp_headers?: Record<string, string[]>;
  resp_body?: string;
  latency_ms?: number;
}

export const BODY_TRUNCATE = 8000;

/** Coerce a raw `/api/traces` entry into a stable shape for the UI table. */
export function normalizeTrace(raw: VProxyTrace): VProxyTrace {
  return {
    id: String(raw?.id ?? ""),
    timestamp: raw?.timestamp,
    method: raw?.method ?? "",
    url: raw?.url ?? "",
    path: raw?.path ?? "",
    host: raw?.host ?? "",
    request_proto: raw?.request_proto,
    req_headers: raw?.req_headers ?? {},
    req_body: raw?.req_body ?? "",
    status_code: raw?.status_code,
    resp_headers: raw?.resp_headers ?? {},
    resp_body: raw?.resp_body ?? "",
    latency_ms: raw?.latency_ms
  };
}

/** Flatten a `Record<string, string[]>` header map into `[key, value]` pairs. */
export function kvPairs(headers?: Record<string, string[]>): [string, string][] {
  const h = headers ?? {};
  return Object.entries(h).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : String(v)]);
}

/** Render a latency in ms with human-friendly formatting. */
export function formatLatency(ms?: number): string {
  if (ms == null) return "-";
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

/** CSS status color bucket: 2xx ok / 3xx warn / 4xx-5xx err. */
export function statusClass(code?: number): string {
  if (code == null) return "ta-status-code";
  if (code < 300) return "ta-status-code ok";
  if (code < 400) return "ta-status-code warn";
  return "ta-status-code err";
}

/** Truncate a body preview at BODY_TRUNCATE unless `full` is requested. */
export function bodyTruncated(body: string, full: boolean): string {
  const b = body ?? "";
  if (full || b.length <= BODY_TRUNCATE) return b;
  return b.slice(0, BODY_TRUNCATE) + "\n…（已截断，点击「显示完整 Body」查看全文）";
}

/**
 * I/O seam for the traffic-toggle orchestration (spec §2.4). The background
 * wires these to chrome.storage / chrome.proxy / fetch; tests inject fakes so
 * the whole toggle flow is unit-testable without chrome.
 */
export interface TrafficRuntime {
  getConfig(): Promise<TrafficAnalysisConfig>;
  setConfig(config: TrafficAnalysisConfig): Promise<void>;
  getActiveProfileId(): Promise<string>;
  getProfiles(): Promise<Array<{ id: string }>>;
  isReachable(): Promise<boolean>;
  applyProfile(profileId: string): Promise<void>;
  postRules(config: TrafficAnalysisConfig): Promise<{ success: boolean; error?: string }>;
  log(level: string, msg: string): void;
}

export interface TrafficToggleOutcome {
  success: boolean;
  enabled?: boolean;
  error?: string;
}

/**
 * Master-switch orchestration (pure; I/O injected via `runtime`).
 *
 * - enable: reject when vproxy :8118 is unreachable (SPEC-TA-004); record the
 *   active profile as `_meta.previousProxyId` (first toggle, SPEC-TA-002);
 *   apply the `vproxy_traffic` profile; sync the rule set.
 * - disable: restore `previousProxyId` (or `direct`); strip INTERCEPT/MAP from
 *   the synced rules so captures stop accumulating (SPEC-TA-003).
 */
export async function runTrafficToggle(runtime: TrafficRuntime, enable: boolean): Promise<TrafficToggleOutcome> {
  const current = await runtime.getConfig();

  if (enable) {
    if (!(await runtime.isReachable())) {
      runtime.log("error", "Traffic analysis enable rejected: vproxy :8118 unreachable.");
      return {
        success: false,
        enabled: false,
        error: "vproxy 未运行（127.0.0.1:8118 不可达）。请先安装并启动 vproxy 流量代理。"
      };
    }
    const activeProfileId = await runtime.getActiveProfileId();
    const next: TrafficAnalysisConfig = {
      ...current,
      enabled: true,
      _meta: {
        ...(current._meta ?? {}),
        previousProxyId: current._meta?.previousProxyId ?? activeProfileId,
        updatedAt: Date.now()
      }
    };
    await runtime.setConfig(next);
    await runtime.applyProfile("vproxy_traffic");
    const sync = await runtime.postRules(next);
    if (!sync.success) runtime.log("warning", `vproxy rules sync failed: ${sync.error ?? "unknown"}`);
    return { success: true, enabled: true };
  }

  const prevId = current._meta?.previousProxyId;
  const profiles = await runtime.getProfiles();
  const restoreId = prevId && profiles.some((p) => p.id === prevId) ? prevId : "direct";
  const next: TrafficAnalysisConfig = {
    ...current,
    enabled: false,
    _meta: { ...(current._meta ?? {}), previousProxyId: undefined, updatedAt: Date.now() }
  };
  await runtime.setConfig(next);
  await runtime.applyProfile(restoreId);
  const sync = await runtime.postRules(buildDisableSyncConfig(current));
  if (!sync.success) runtime.log("warning", `vproxy rules restore failed: ${sync.error ?? "unknown"}`);
  return { success: true, enabled: false };
}

/**
 * A config copy stripped of INTERCEPT/MAP rules, used when the master switch is
 * turned off so the vproxy daemon stops forcing MITM deep tracing. FINAL stays
 * as configured — ordinary DIRECT/PROXY traffic is unaffected.
 */
export function buildDisableSyncConfig(config: TrafficAnalysisConfig): TrafficAnalysisConfig {
  return {
    ...config,
    enabled: false,
    rules: config.rules
      .filter((r) => r.action !== "INTERCEPT" && r.action !== "MAP")
      .map((r) => ({ ...r }))
  };
}
