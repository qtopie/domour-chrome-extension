import type { ProxyProfile } from './types';
import { appendLog } from './logger';
import { DEFAULT_LAN_BYPASS } from '../types/proxy';

export { DEFAULT_LAN_BYPASS };

export const BRIDGE_PAC_URL = "http://127.0.0.1:26888/proxy.pac";

// Chrome honors a proxy bypass list only for fixed_servers mode; in pac_script
// mode the PAC script itself is fully authoritative and no bypassList is sent.
// To guarantee localhost/LAN traffic never goes through an external proxy, wrap
// every PAC script with a prologue that forces DIRECT for loopback/private
// hosts before delegating to the original FindProxyForURL logic.
const PAC_LAN_BYPASS_WRAPPER = `
var __domourIsLocalHost = function(host) {
  if (!host) return true;
  host = String(host).toLowerCase().replace(/^\\[|\\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host.indexOf(':') >= 0) {
    if (host === '::1' || host === '::') return true;
    if (host.indexOf('fe80:') === 0) return true;
    if (host.indexOf('::ffff:') === 0) host = host.slice(7);
    else return false;
  }
  if (/^(127|10)\\./.test(host)) return true;
  if (/^192\\.168\\./.test(host)) return true;
  if (/^172\\.(1[6-9]|2[0-9]|3[01])\\./.test(host)) return true;
  return false;
};
var __domourOriginalFindProxyForURL = FindProxyForURL;
FindProxyForURL = function(url, host) {
  if (__domourIsLocalHost(host)) return 'DIRECT';
  return __domourOriginalFindProxyForURL(url, host);
};
`;

function wrapPacWithLocalBypass(pacScript: string): string {
  return `${pacScript}\n${PAC_LAN_BYPASS_WRAPPER}`;
}

async function fetchPacText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function buildPacScriptConfig(profile: ProxyProfile): Promise<chrome.proxy.PacScript> {
  // Inline script: wrap it so localhost/LAN stays DIRECT.
  if (profile.pacType === "script" && profile.pacScript) {
    return { data: wrapPacWithLocalBypass(profile.pacScript), mandatory: false };
  }

  // URL-based PAC: fetch the script, wrap it and hand Chrome the resulting
  // inline script. Fetching here also validates the URL (a stale/unreachable
  // PAC URL would otherwise silently break all proxying).
  const pacUrl = profile.pacUrl || BRIDGE_PAC_URL;
  try {
    const pacText = await fetchPacText(pacUrl);
    return { data: wrapPacWithLocalBypass(pacText), mandatory: false };
  } catch (err) {
    appendLog("warning", `Failed to fetch PAC from ${pacUrl} (${err instanceof Error ? err.message : err}); falling back to bridge PAC ${BRIDGE_PAC_URL}`);
    try {
      const fallback = await fetchPacText(BRIDGE_PAC_URL);
      return { data: wrapPacWithLocalBypass(fallback), mandatory: false };
    } catch {
      return { url: BRIDGE_PAC_URL, mandatory: false };
    }
  }
}

export const DEFAULT_PROFILES: ProxyProfile[] = [
  {
    id: "direct",
    name: "Direct Connection",
    mode: "direct",
    color: "#10b981",
    updatedAt: Date.now()
  },
  {
    id: "system",
    name: "System Default Proxy",
    mode: "system",
    color: "#6366f1",
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
  const apply = (config: chrome.proxy.ProxyConfig): Promise<void> =>
    new Promise((resolve, reject) => {
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

  if (!chrome.proxy || !chrome.proxy.settings) {
    appendLog("warning", "chrome.proxy API not available in current environment.");
    return Promise.resolve();
  }

  if (profile && profile.mode === "pac_script") {
    // PAC scripts are fetched/wrapped asynchronously so a stale or unreachable
    // PAC URL can never leave the browser with a broken proxy configuration.
    return buildPacScriptConfig(profile)
      .then((pacScript) => apply({ mode: "pac_script", pacScript }))
      .catch((err) => {
        appendLog("error", `Failed to build PAC script, falling back to direct: ${err}`);
        return apply({ mode: "direct" });
      });
  }

  let config: chrome.proxy.ProxyConfig;

  if (!profile || profile.mode === "direct" || profile.id === "direct") {
    config = { mode: "direct" };
  } else if (profile.mode === "system" || profile.id === "system") {
    config = { mode: "system" };
  } else if (profile.mode === "fixed_servers") {
    const scheme = (profile.scheme || "http") as chrome.proxy.Scheme;
    const host = profile.host || "127.0.0.1";
    const port = Number(profile.port) || 8080;

    // "<-loopback>"/"<local>" are dangerous in Chrome: they invert the whole
    // bypass list (loopback AND LAN end up proxied). Filter them out even if a
    // stored profile still carries them so they can never break proxying.
    const customBypass = Array.isArray(profile.bypassList)
      ? profile.bypassList
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && s !== "<-loopback>" && s !== "<local>")
      : [];
    const combinedBypass = Array.from(new Set([...DEFAULT_LAN_BYPASS, ...customBypass]));

    config = {
      mode: "fixed_servers",
      rules: {
        singleProxy: { scheme, host, port },
        bypassList: combinedBypass
      }
    };
  } else {
    config = { mode: "direct" };
  }

  return apply(config);
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
