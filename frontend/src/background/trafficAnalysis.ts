/**
 * Traffic Analysis — background wiring for the whistle-like proxy-rule config
 * + packet capture feature (spec: specs/modules/traffic-analysis.spec.md).
 *
 * Talks to the local vproxy daemon:
 *  - HTTP proxy 127.0.0.1:8118 (CONNECT + MITM deep tracing)
 *  - Web API   127.0.0.1:8899 (/api/traces, GET/POST /api/config)
 *
 * The pure orchestration lives in ../types/trafficAnalysis (runTrafficToggle);
 * this module supplies the chrome/fetch runtime and message-handler helpers.
 */
import { appendLog } from "./logger";
import { applyProxyConfig, DEFAULT_PROFILES } from "./proxy";
import { DEFAULT_LAN_BYPASS } from "../types/proxy";
import type { ProxyProfile } from "./types";
import type {
  TrafficAnalysisConfig,
  TrafficRuntime,
  VProxyConfig,
  VProxyTrace
} from "../types/trafficAnalysis";
import {
  createEmptyTrafficAnalysis,
  buildVProxyConfigPayload,
  runTrafficToggle
} from "../types/trafficAnalysis";

export const VPROXY_HTTP_URL = "http://127.0.0.1:8118";
export const VPROXY_WEB_URL = "http://127.0.0.1:8899";

/** Internal proxy profile used while traffic analysis is enabled. */
export function buildTrafficProfile(): ProxyProfile {
  return {
    id: "vproxy_traffic",
    name: "vproxy 流量分析 (:8118)",
    mode: "fixed_servers",
    scheme: "http",
    host: "127.0.0.1",
    port: 8118,
    bypassList: [...DEFAULT_LAN_BYPASS],
    color: "#f59e0b",
    isVproxy: true,
    updatedAt: Date.now()
  };
}

/** True when the vproxy HTTP port answers (it returns 405 for non-CONNECT). */
export async function isVProxyReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${VPROXY_HTTP_URL}/`, { signal: AbortSignal.timeout(2000) });
    return typeof res.status === "number";
  } catch {
    return false;
  }
}

export function getTrafficConfig(callback: (config: TrafficAnalysisConfig) => void): void {
  chrome.storage.local.get(["traffic_analysis"], (res) => {
    const raw = res.traffic_analysis;
    const config =
      raw && typeof raw === "object" ? (raw as TrafficAnalysisConfig) : createEmptyTrafficAnalysis();
    callback(config);
  });
}

export function broadcastTrafficAnalysis(config: TrafficAnalysisConfig): void {
  chrome.runtime.sendMessage({ type: "TRAFFIC_ANALYSIS_UPDATED", config }).catch(() => {});
}

export async function postVProxyConfig(
  payload: VProxyConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${VPROXY_WEB_URL}/api/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { success: false, error: `HTTP ${res.status}: ${body}` };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function fetchVProxyTraces(): Promise<{
  success: boolean;
  traces?: VProxyTrace[];
  error?: string;
}> {
  try {
    const res = await fetch(`${VPROXY_WEB_URL}/api/traces`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { success: true, traces: Array.isArray(data) ? (data as VProxyTrace[]) : [] };
  } catch (e) {
    return { success: false, error: `vproxy 不可达: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function fetchVProxyConfig(): Promise<{
  success: boolean;
  vproxyConfig?: unknown;
  error?: string;
}> {
  try {
    const res = await fetch(`${VPROXY_WEB_URL}/api/config`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
    const vproxyConfig = await res.json();
    return { success: true, vproxyConfig };
  } catch (e) {
    return { success: false, error: `vproxy 不可达: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** vproxy has no clear-traces endpoint; degrade with a clear message. */
export function clearVProxyTraces(): { success: false; error: string } {
  return { success: false, error: "vproxy 不支持清空 trace（仅 INTERCEPT/MAP 域名产生）" };
}

/** Chrome wiring for the pure runTrafficToggle orchestration. */
export function createTrafficRuntime(): TrafficRuntime {
  return {
    getConfig: () => new Promise((resolve) => getTrafficConfig(resolve)),
    setConfig: (config) =>
      new Promise<void>((resolve) => {
        chrome.storage.local.set({ traffic_analysis: config }, () => {
          broadcastTrafficAnalysis(config);
          resolve();
        });
      }),
    getActiveProfileId: () =>
      new Promise((resolve) => {
        chrome.storage.local.get(["active_proxy_id"], (res) => {
          resolve((res.active_proxy_id as string) || "direct");
        });
      }),
    getProfiles: () =>
      new Promise((resolve) => {
        chrome.storage.local.get(["proxy_profiles"], (res) => {
          const profiles = (res.proxy_profiles as ProxyProfile[]) || DEFAULT_PROFILES;
          resolve(profiles.map((p) => ({ id: p.id })));
        });
      }),
    isReachable: isVProxyReachable,
    applyProfile: (profileId) =>
      new Promise<void>((resolve, reject) => {
        chrome.storage.local.get(["proxy_profiles"], (res) => {
          const profiles = (res.proxy_profiles as ProxyProfile[]) || DEFAULT_PROFILES;
          const profile =
            profileId === "vproxy_traffic"
              ? buildTrafficProfile()
              : profiles.find((p) => p.id === profileId) || null;
          chrome.storage.local.set({ active_proxy_id: profileId }, () => {
            applyProxyConfig(profile)
              .then(() => resolve())
              .catch((err) => reject(err));
          });
        });
      }),
    postRules: async (config) => {
      const current = await fetchVProxyConfig();
      const payload = buildVProxyConfigPayload(
        config,
        (current.success ? current.vproxyConfig : null) as Partial<VProxyConfig> | null
      );
      const res = await postVProxyConfig(payload);
      if (res.success) {
        appendLog("info", "Traffic analysis rules synced to vproxy (:8899).");
      } else {
        appendLog("error", `Traffic analysis rules sync failed: ${res.error}`);
      }
      return res;
    },
    log: (level, msg) => appendLog(level as never, msg)
  };
}

/** Entry point used by the message handler. */
export async function toggleTrafficAnalysis(
  enable: boolean
): Promise<{ success: boolean; enabled?: boolean; error?: string }> {
  return runTrafficToggle(createTrafficRuntime(), enable);
}

/** Push a config's rules to vproxy (used by SAVE_TRAFFIC_ANALYSIS). */
export async function syncVProxyRules(
  config: TrafficAnalysisConfig
): Promise<{ success: boolean; error?: string }> {
  return createTrafficRuntime().postRules(config);
}
