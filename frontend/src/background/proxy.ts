import type { ProxyProfile } from './types';
import { appendLog } from './logger';

export const DEFAULT_LAN_BYPASS = [
  "localhost",
  "localhost:*",
  "127.0.0.1",
  "127.0.0.1:*",
  "[::1]",
  "[::1]:*",
  "<-loopback>",
  "192.168.0.0/16",
  "192.168.*",
  "10.0.0.0/8",
  "10.*",
  "172.16.0.0/12",
  "*.local",
  "*.lan"
];

export const DEFAULT_PROFILES: ProxyProfile[] = [
  {
    id: "direct",
    name: "Direct Connection",
    mode: "direct",
    color: "#10b981",
    updatedAt: Date.now()
  },
  {
    id: "vproxy_pac_default",
    name: "vproxy Auto PAC (Default)",
    mode: "pac_script",
    pacType: "url",
    pacUrl: "http://127.0.0.1:26888/proxy.pac",
    color: "#3b82f6",
    isVproxy: true,
    updatedAt: Date.now()
  }
];

export function applyProxyConfig(profile: ProxyProfile | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!chrome.proxy || !chrome.proxy.settings) {
      appendLog("warning", "chrome.proxy API not available in current environment.");
      return resolve();
    }

    let config: chrome.proxy.ProxyConfig;

    if (!profile || profile.mode === "direct" || profile.id === "direct") {
      config = { mode: "direct" };
    } else if (profile.mode === "fixed_servers") {
      const scheme = (profile.scheme || "http") as chrome.proxy.Scheme;
      const host = profile.host || "127.0.0.1";
      const port = Number(profile.port) || 8080;
      
      const customBypass = Array.isArray(profile.bypassList) 
        ? profile.bypassList.map((s) => s.trim()).filter((s) => s.length > 0) 
        : [];
      const combinedBypass = Array.from(new Set([...DEFAULT_LAN_BYPASS, ...customBypass]));

      config = {
        mode: "fixed_servers",
        rules: {
          singleProxy: { scheme, host, port },
          bypassList: combinedBypass
        }
      };
    } else if (profile.mode === "pac_script") {
      if (profile.pacType === "script" && profile.pacScript) {
        config = {
          mode: "pac_script",
          pacScript: {
            data: profile.pacScript,
            mandatory: false
          }
        };
      } else {
        config = {
          mode: "pac_script",
          pacScript: {
            url: profile.pacUrl || "",
            mandatory: false
          }
        };
      }
    } else {
      config = { mode: "direct" };
    }

    chrome.proxy.settings.set({ value: config, scope: "regular" }, () => {
      if (chrome.runtime.lastError) {
        const err = chrome.runtime.lastError.message || "Proxy setting error";
        appendLog("error", `Failed to set proxy settings: ${err}`);
        reject(err);
      } else {
        const desc = profile ? `${profile.name} [${profile.mode}${profile.scheme ? ' (' + profile.scheme + ')' : ''}]` : "Direct";
        appendLog("system", `Proxy rule successfully applied: ${desc}`);
        resolve();
      }
    });
  });
}

export function initProxyState(): void {
  chrome.storage.local.get(["proxy_profiles", "active_proxy_id"], (res) => {
    let profiles: ProxyProfile[] = (res.proxy_profiles as ProxyProfile[]) || DEFAULT_PROFILES;
    let activeId = (res.active_proxy_id as string) || "direct";

    if (!profiles || !Array.isArray(profiles) || profiles.length === 0) {
      profiles = DEFAULT_PROFILES;
      chrome.storage.local.set({ proxy_profiles: profiles, active_proxy_id: activeId });
    }

    const activeProfile = profiles.find((p: ProxyProfile) => p.id === activeId) || profiles[0];
    applyProxyConfig(activeProfile).catch(() => {});
  });
}

if (chrome.proxy && chrome.proxy.onProxyError) {
  chrome.proxy.onProxyError.addListener((details) => {
    appendLog("error", `[Proxy Network Error] ${details.error}: ${details.details} (Fatal: ${details.fatal})`);
  });
}
