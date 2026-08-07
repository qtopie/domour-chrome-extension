import { appendLog, notifyPanelStatus } from './logger';
import type { BridgeDisconnectReason } from './logger';
import { executeAutomationJob } from './automation';
import { initProxyState, applyProxyConfig, DEFAULT_PROFILES, BRIDGE_PAC_URL } from './proxy';
import { DEFAULT_LAN_BYPASS } from '../types/proxy';
import {
  createEmptySiteRules,
  setSiteRule,
  removeSiteRule
} from '../types/siteRules';
import type { SiteRules } from '../types/siteRules';
import {
  createEmptyRequestHeaders,
  validateHeader,
  buildDnrRuleSpecs,
  normalizeDnrRuleSpecs,
  toggleGlobalHeaderRule,
  setHeaderRule,
  removeHeaderRule
} from '../types/requestHeaders';
import type { RequestHeadersConfig, HeaderKV } from '../types/requestHeaders';
import type { ChromeMessage, ProxyProfile } from './types';

function getSiteRules(callback: (rules: SiteRules) => void): void {
  chrome.storage.local.get(["site_rules"], (res) => {
    const rules = (res.site_rules as SiteRules) || createEmptySiteRules();
    callback(rules);
  });
}

function broadcastSiteRules(rules: SiteRules): void {
  chrome.runtime.sendMessage({ type: "SITE_RULES_UPDATED", rules }).catch(() => {});
}

// --- Request Headers (custom header injection) ---

function getRequestHeaders(callback: (config: RequestHeadersConfig) => void): void {
  chrome.storage.local.get(["request_headers"], (res) => {
    const config = (res.request_headers as RequestHeadersConfig) || createEmptyRequestHeaders();
    callback(config);
  });
}

function broadcastRequestHeaders(config: RequestHeadersConfig): void {
  chrome.runtime.sendMessage({ type: "REQUEST_HEADERS_UPDATED", config }).catch(() => {});
}

/** Apply the config to declarativeNetRequest dynamic rules. */
function syncDnrRules(config: RequestHeadersConfig): void {
  if (typeof chrome === "undefined" || !chrome.declarativeNetRequest) {
    appendLog("warn", "declarativeNetRequest unavailable — header rules not applied.");
    return;
  }
  const specs = buildDnrRuleSpecs(config);
  const rules = normalizeDnrRuleSpecs(specs);
  const ruleIds = specs.map((s) => s.id);
  chrome.declarativeNetRequest
    .getDynamicRules()
    .then((existing) => {
      const existingIds = existing.map((r) => r.id);
      return chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existingIds,
        addRules: rules
      });
    })
    .then(() => {
      appendLog("info", `Request header DNR rules synced: ${ruleIds.length} active (${rules.length} raw).`);
    })
    .catch((e: any) => {
      appendLog("error", `Failed to sync DNR rules: ${e.message}`);
    });
}

function validateHeaders(headers: unknown): HeaderKV[] | null {
  if (!Array.isArray(headers)) return null;
  const clean: HeaderKV[] = [];
  for (const h of headers) {
    if (!h || typeof h !== "object") return null;
    const key = typeof (h as any).key === "string" ? (h as any).key.trim() : "";
    const value = typeof (h as any).value === "string" ? (h as any).value : "";
    const err = validateHeader({ key, value });
    if (err) return null;
    if (key) clean.push({ key, value });
  }
  return clean;
}

let nativePort: chrome.runtime.Port | null = null;
let reconnectTimer: any = null;
let lastDisconnectReason: BridgeDisconnectReason = "DISCONNECTED";

function connectToNative(): void {
  if (nativePort) {
    console.log("Already connected to native bridge.");
    return;
  }

  chrome.storage.local.get(["api_token"], (result) => {
    const token = result.api_token;
    if (!token) {
      appendLog("system", "API token not set. Waiting for Side Panel to generate token.");
      return;
    }

    appendLog("system", "Connecting to Go native messaging bridge (com.go_react.search_bridge)...");

    try {
      nativePort = chrome.runtime.connectNative("com.go_react.search_bridge");
      nativePort.onMessage.addListener(handleNativeMessage);

      nativePort.onDisconnect.addListener(() => {
        const err = chrome.runtime.lastError;
        const errMsg = err?.message ?? "";
        const reason: BridgeDisconnectReason = errMsg.toLowerCase().includes("not found")
          ? "NOT_INSTALLED"
          : "DISCONNECTED";
        lastDisconnectReason = reason;
        appendLog("error", `Native bridge disconnected: ${err ? err.message : "No detailed error"} [${reason}]`);
        nativePort = null;
        notifyPanelStatus(false, reason);

        if (reconnectTimer) clearTimeout(reconnectTimer);
        // Only auto-reconnect if it was a crash/disconnect, not a missing host
        if (reason === "DISCONNECTED") {
          reconnectTimer = setTimeout(() => {
            appendLog("system", "Attempting to reconnect to Native Bridge...");
            connectToNative();
          }, 5000);
        }
      });

      appendLog("system", "Sending INITIAL_AUTH authentication payload to Go backend...");
      nativePort.postMessage({
        type: "INITIAL_AUTH",
        token: token
      });
      notifyPanelStatus(true);

    } catch (e: any) {
      appendLog("error", `Exception starting native messaging connection: ${e.message}`);
      lastDisconnectReason = "DISCONNECTED";
      notifyPanelStatus(false, "DISCONNECTED");
    }
  });
}

function sendJobResponse(url: string, status: string, data: any): void {
  if (!nativePort) {
    appendLog("error", "Cannot send job response: native port is disconnected.");
    return;
  }
  
  nativePort.postMessage({
    type: "JOB_RESPONSE",
    url: url,
    status: status,
    data: data
  });
  appendLog("system", `Dispatched JOB_RESPONSE back to Go bridge (Status=${status})`);
}

function handleNativeMessage(msg: ChromeMessage): void {
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case "HEARTBEAT_KEEP_ALIVE":
      appendLog("heartbeat", "HEARTBEAT_KEEP_ALIVE received from Go bridge.");
      break;

    case "LOG":
      appendLog(msg.level || "info", `[Go Backend] ${msg.message}`);
      break;

    case "VPROXY_SYNC":
      appendLog("system", `Received VPROXY_SYNC packet with ${msg.profiles ? msg.profiles.length : 0} profiles.`);
      handleVproxySync(msg);
      break;

    case "JOB_REQUEST":
      appendLog("job", `Processing authorized automation job: ${msg.action} on ${msg.url}`);
      executeAutomationJob(msg, sendJobResponse);
      break;

    case "CHAT_SEND":
      appendLog("job", `Chat message from bridge: ${String(msg.message).slice(0, 80)}`);
      handleChatStream(msg);
      break;

    case "AGENT_STREAM":
      appendLog("job", `Agent stream chunk (${(msg.message || "").length} chars)`);
      broadcastToPanels({ type: "AGENT_STREAM", jobId: msg.jobId, delta: msg.message || "" });
      break;

    case "AGENT_DONE":
      appendLog("job", `Agent finished job ${msg.jobId}`);
      persistChatTurn(msg.jobId || `chat_${Date.now()}`, "assistant", msg.result || "");
      broadcastToPanels({ type: "AGENT_DONE", jobId: msg.jobId || `chat_${Date.now()}`, result: msg.result || "" });
      break;

    case "PUSH_EVENT":
      appendLog("info", `Notification push received: ${msg.eventType || "event"}`);
      handlePushEvent(msg);
      break;

    default:
      appendLog("warning", `Unknown message type received from native host: ${JSON.stringify(msg)}`);
  }
}

function broadcastToPanels(payload: any): void {
  chrome.runtime.sendMessage(payload).catch(() => {});
}

function handleChatStream(msg: ChromeMessage): void {
  const jobId = msg.jobId || `chat_${Date.now()}`;
  const text = msg.message || "";
  persistChatTurn(jobId, "user", text);
  broadcastToPanels({ type: "AGENT_STREAM", jobId, delta: text, role: "user" });
  // Agent replies arrive as separate AGENT_STREAM/AGENT_DONE frames from bridge.
}

function persistChatTurn(jobId: string, role: string, text: string): void {
  if (!text) return;
  chrome.storage.local.get(["chat_history"], (res) => {
    const history: any[] = (res.chat_history as any[]) || [];
    history.push({ jobId, role, text, ts: Date.now() });
    const trimmed = history.slice(-500);
    chrome.storage.local.set({ chat_history: trimmed });
  });
}

function handlePushEvent(msg: ChromeMessage): void {
  // Token-validated PUSH_EVENT from bridge. Store + broadcast; badge when no panel is open.
  const eventPayload = {
    id: msg.eventId || `evt_${Date.now()}`,
    severity: msg.severity || "info",
    message: msg.message || "",
    symbol: msg.symbol,
    price: msg.price,
    changePct: msg.changePct,
    alertLevel: msg.alertLevel,
    ts: Date.now()
  };
  chrome.storage.local.get(["events", "notify_enabled"], (res) => {
    const notifyEnabled = res.notify_enabled !== false;
    const events: any[] = (res.events as any[]) || [];
    events.push(eventPayload);
    chrome.storage.local.set({ events: events.slice(-200) }, () => {
      broadcastToPanels({ type: "NOTIFY_PUSH", payload: eventPayload });
      if (notifyEnabled) {
        // Panel may be closed: badge count increments here; panel side clears on read.
        chrome.action.setBadgeText({ text: String(Math.min((events.length % 99) + 1, 99)) });
        chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
      }
    });
  });
}

function handleVproxySync(data: ChromeMessage): void {
  if (!data || !Array.isArray(data.profiles)) return;

  chrome.storage.local.get(["proxy_profiles", "active_proxy_id"], (res) => {
    let currentProfiles: ProxyProfile[] = (res.proxy_profiles as ProxyProfile[]) || DEFAULT_PROFILES;
    let activeId = (res.active_proxy_id as string) || "vproxy_pac_default";

    data.profiles!.forEach((vProfile: any, index: number) => {
      const isPacMode = vProfile.mode === "pac_script" || vProfile.pacUrl || vProfile.pacScript || vProfile.pacType || vProfile.scheme === "pac" || vProfile.scheme === "autoproxy";
      const profileId = vProfile.id || `vproxy_${isPacMode ? 'pac' : (vProfile.scheme || 'fixed')}_${vProfile.port || index}`;
      
      const formattedProfile: ProxyProfile = {
        id: profileId,
        name: vProfile.name || (isPacMode ? "vproxy PAC Profile" : `vproxy ${vProfile.scheme || 'HTTP'}`),
        mode: isPacMode ? "pac_script" : (vProfile.mode || "fixed_servers"),
        scheme: vProfile.scheme || "http",
        host: vProfile.host || "127.0.0.1",
        port: vProfile.port || 18666,
        bypassList: Array.from(new Set([
          ...DEFAULT_LAN_BYPASS,
          ...(Array.isArray(vProfile.bypassList) ? vProfile.bypassList : [])
        ])),
        pacType: vProfile.pacScript ? "script" : (vProfile.pacType || "url"),
        // Always pin the vproxy profile to the local bridge PAC. The PAC URL
        // synced by the backend (e.g. vproxy web port) is often unreachable from
        // the browser, which would leave the profile broken. The bridge PAC is
        // guaranteed live and (per proxy.ts) wraps localhost/LAN as DIRECT.
        pacUrl: BRIDGE_PAC_URL,
        pacScript: vProfile.pacScript,
        color: vProfile.color || "#8b5cf6",
        isVproxy: true,
        updatedAt: Date.now()
      };

      const existingIdx = currentProfiles.findIndex((p) => p.id === profileId);
      if (existingIdx >= 0) {
        currentProfiles[existingIdx] = formattedProfile;
      } else {
        currentProfiles.push(formattedProfile);
      }

      if (data.autoSelectId === profileId || data.autoSelectId === vProfile.id) {
        activeId = profileId;
      }
    });

    const activeProfile = currentProfiles.find((p) => p.id === activeId) || currentProfiles[0];

    chrome.storage.local.set({ proxy_profiles: currentProfiles, active_proxy_id: activeId }, () => {
      applyProxyConfig(activeProfile).catch(() => {});
      chrome.runtime.sendMessage({ type: "PROXY_PROFILES_UPDATED", profiles: currentProfiles, activeProfileId: activeId }).catch(() => {});
    });
  });
}

// Global Message Handlers
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) {
    return false;
  }

  if (message.type === "CHECK_CONNECTION") {
    sendResponse({ connected: !!nativePort, reason: nativePort ? undefined : lastDisconnectReason });
    return false;
  }

  if (message.type === "RECONNECT") {
    connectToNative();
    sendResponse({ success: true, connected: !!nativePort, reason: nativePort ? undefined : lastDisconnectReason });
    return false;
  }

  if (message.type === "GET_PROXY_STATE") {
    chrome.storage.local.get(["proxy_profiles", "active_proxy_id"], (res) => {
      const profiles = (res.proxy_profiles as ProxyProfile[]) || DEFAULT_PROFILES;
      const activeId = (res.active_proxy_id as string) || "direct";
      const activeProfile = profiles.find((p: ProxyProfile) => p.id === activeId) || null;
      sendResponse({ profiles, activeProfileId: activeId, activeProfile });
    });
    return true;
  }

  if (message.type === "SET_ACTIVE_PROXY") {
    const targetId = message.profileId;
    chrome.storage.local.get(["proxy_profiles"], (res) => {
      const profiles: ProxyProfile[] = (res.proxy_profiles as ProxyProfile[]) || DEFAULT_PROFILES;
      const targetProfile = profiles.find((p) => p.id === targetId) || DEFAULT_PROFILES[0];

      chrome.storage.local.set({ active_proxy_id: targetProfile.id }, () => {
        applyProxyConfig(targetProfile)
          .then(() => sendResponse({ success: true, activeProfile: targetProfile }))
          .catch((err) => sendResponse({ success: false, error: String(err) }));
      });
    });
    return true;
  }

  if (message.type === "SAVE_PROXY_PROFILE") {
    const newProfile: ProxyProfile = message.profile;
    if (!newProfile || !newProfile.id) {
      sendResponse({ success: false, error: "Invalid profile payload" });
      return false;
    }

    chrome.storage.local.get(["proxy_profiles", "active_proxy_id"], (res) => {
      let profiles: ProxyProfile[] = (res.proxy_profiles as ProxyProfile[]) || DEFAULT_PROFILES;
      const activeId = (res.active_proxy_id as string) || "direct";

      const idx = profiles.findIndex((p) => p.id === newProfile.id);
      const updatedProfile = { ...newProfile, updatedAt: Date.now() };

      if (idx >= 0) {
        profiles[idx] = updatedProfile;
      } else {
        profiles.push(updatedProfile);
      }

      chrome.storage.local.set({ proxy_profiles: profiles }, () => {
        if (newProfile.id === activeId) {
          applyProxyConfig(updatedProfile).catch(() => {});
        }
        chrome.runtime.sendMessage({ type: "PROXY_PROFILES_UPDATED", profiles, activeProfileId: activeId }).catch(() => {});
        sendResponse({ success: true, profiles });
      });
    });
    return true;
  }

  if (message.type === "DELETE_PROXY_PROFILE") {
    const targetId = message.profileId;
    if (targetId === "direct" || targetId === "system") {
      sendResponse({ success: false, error: "Built-in system default profiles cannot be deleted." });
      return false;
    }

    chrome.storage.local.get(["proxy_profiles", "active_proxy_id"], (res) => {
      let profiles: ProxyProfile[] = (res.proxy_profiles as ProxyProfile[]) || DEFAULT_PROFILES;
      let activeId = (res.active_proxy_id as string) || "direct";

      profiles = profiles.filter((p) => p.id !== targetId);

      if (activeId === targetId) {
        activeId = "direct";
        const directProfile = profiles.find((p) => p.id === "direct") || DEFAULT_PROFILES[0];
        applyProxyConfig(directProfile).catch(() => {});
      }

      chrome.storage.local.set({ proxy_profiles: profiles, active_proxy_id: activeId }, () => {
        chrome.runtime.sendMessage({ type: "PROXY_PROFILES_UPDATED", profiles, activeProfileId: activeId }).catch(() => {});
        sendResponse({ success: true, profiles, activeProfileId: activeId });
      });
    });
    return true;
  }

  if (message.type === "TRIGGER_VPROXY_SYNC") {
    if (nativePort) {
      try {
        nativePort.postMessage({ type: "SYNC_VPROXY" });
      } catch (e: any) {
        appendLog("error", `Failed to dispatch SYNC_VPROXY to native host: ${e.message}`);
      }
    }
    sendResponse({
      success: true,
      status: nativePort ? "vproxy sync requested via native bridge." : "Native bridge not connected."
    });
    return false;
  }

  if (message.type === "TRIGGER_CONNECT") {
    connectToNative();
    sendResponse({ success: true, connected: !!nativePort });
    return false;
  }

  if (message.type === "getConnectionStatus") {
    sendResponse({ connectedTabIds: [], clientName: undefined });
    return false;
  }

  if (message.type === "GET_SITE_RULES") {
    getSiteRules((rules) => sendResponse({ success: true, rules }));
    return true;
  }

  if (message.type === "SET_SITE_RULE") {
    const host = message.host;
    const patch = message.patch;
    if (typeof host !== "string" || !host || !patch || typeof patch !== "object") {
      sendResponse({ success: false, error: "Invalid site rule payload" });
      return false;
    }
    getSiteRules((rules) => {
      const updated = setSiteRule(rules, host, patch);
      chrome.storage.local.set({ site_rules: updated }, () => {
        broadcastSiteRules(updated);
        appendLog("info", `Site rule updated for ${host}: ${JSON.stringify(patch)}`);
        sendResponse({ success: true, rules: updated });
      });
    });
    return true;
  }

  if (message.type === "REMOVE_SITE_RULE") {
    const host = message.host;
    if (typeof host !== "string" || !host) {
      sendResponse({ success: false, error: "Invalid host" });
      return false;
    }
    getSiteRules((rules) => {
      const updated = removeSiteRule(rules, host);
      chrome.storage.local.set({ site_rules: updated }, () => {
        broadcastSiteRules(updated);
        appendLog("info", `Site rule removed for ${host}`);
        sendResponse({ success: true, rules: updated });
      });
    });
    return true;
  }

  if (message.type === "GET_REQUEST_HEADERS") {
    getRequestHeaders((config) => sendResponse({ success: true, config }));
    return true;
  }

  if (message.type === "SAVE_REQUEST_HEADERS") {
    const globalHeaders = validateHeaders(message.globalHeaders);
    const perHost = message.perHost;
    if (!globalHeaders || !perHost || typeof perHost !== "object") {
      sendResponse({ success: false, error: "Invalid request header payload" });
      return false;
    }
    const globalEnabled = message.globalEnabled !== false;
    getRequestHeaders((config) => {
      const next: RequestHeadersConfig = {
        ...config,
        global: { ...config.global, headers: globalHeaders, enabled: globalEnabled },
        perHost,
        _meta: { updatedAt: Date.now() }
      };
      chrome.storage.local.set({ request_headers: next }, () => {
        syncDnrRules(next);
        broadcastRequestHeaders(next);
        appendLog("info", `Request header config saved (${globalHeaders.length} global, ${Object.keys(perHost).length} hosts).`);
        sendResponse({ success: true, config: next });
      });
    });
    return true;
  }

  if (message.type === "TOGGLE_REQUEST_HEADERS") {
    const enabled = message.enabled !== false;
    getRequestHeaders((config) => {
      const next = toggleGlobalHeaderRule(config, enabled);
      chrome.storage.local.set({ request_headers: next }, () => {
        syncDnrRules(next);
        broadcastRequestHeaders(next);
        appendLog("info", `Request header global toggle: ${enabled ? "ON" : "OFF"}.`);
        sendResponse({ success: true, enabled, config: next });
      });
    });
    return true;
  }

  if (message.type === "SET_HOST_HEADERS") {
    const host = typeof message.host === "string" ? message.host.trim().toLowerCase() : "";
    const headers = validateHeaders(message.headers);
    if (!host || !headers) {
      sendResponse({ success: false, error: "Invalid host header payload" });
      return false;
    }
    getRequestHeaders((config) => {
      const next = setHeaderRule(config, host, headers, true);
      chrome.storage.local.set({ request_headers: next }, () => {
        syncDnrRules(next);
        broadcastRequestHeaders(next);
        appendLog("info", `Request header rule set for ${host} (${headers.length} headers).`);
        sendResponse({ success: true, config: next });
      });
    });
    return true;
  }

  if (message.type === "REMOVE_HOST_HEADERS") {
    const host = typeof message.host === "string" ? message.host.trim().toLowerCase() : "";
    if (!host) {
      sendResponse({ success: false, error: "Invalid host" });
      return false;
    }
    getRequestHeaders((config) => {
      const next = removeHeaderRule(config, host);
      chrome.storage.local.set({ request_headers: next }, () => {
        syncDnrRules(next);
        broadcastRequestHeaders(next);
        appendLog("info", `Request header rule removed for ${host}.`);
        sendResponse({ success: true, config: next });
      });
    });
    return true;
  }

  if (message.type === "CHAT_SEND") {
    const jobId = message.jobId || `chat_${Date.now()}`;
    const text = message.message || "";
    if (!text) {
      sendResponse({ success: false, error: "Empty chat message" });
      return false;
    }
    if (!nativePort) {
      // Bridge offline: keep the message locally so it is not lost.
      persistChatTurn(jobId, "user", text);
      sendResponse({ success: false, error: "bridge offline" });
      return false;
    }
    persistChatTurn(jobId, "user", text);
    try {
      nativePort.postMessage({ type: "CHAT_SEND", jobId, message: text });
      sendResponse({ success: true, jobId });
    } catch (e: any) {
      sendResponse({ success: false, error: `Failed to dispatch to bridge: ${e.message}` });
    }
    return false;
  }

  if (message.type === "CHAT_HISTORY_GET") {
    chrome.storage.local.get(["chat_history"], (res) => {
      sendResponse({ success: true, history: (res.chat_history as any[]) || [] });
    });
    return true;
  }

  if (message.type === "GET_EVENTS") {
    chrome.storage.local.get(["events"], (res) => {
      sendResponse({ success: true, events: (res.events as any[]) || [] });
    });
    return true;
  }

  if (message.type === "NOTIFY_TOGGLE") {
    const enabled = message.enabled !== false;
    chrome.storage.local.set({ notify_enabled: enabled }, () => {
      if (!enabled) {
        chrome.action.setBadgeText({ text: "" });
      }
      sendResponse({ success: true, enabled });
    });
    return true;
  }

  if (message.type === "disconnect") {
    sendResponse({ success: true });
    return false;
  }

  return false;
});

// Initialization
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.api_token && changes.api_token.newValue) {
    appendLog("system", "API token updated in storage. Connecting to native bridge...");
    connectToNative();
  }
});

// Restore DNR rules after service worker (re)start so persisted header rules survive.
getRequestHeaders((config) => {
  syncDnrRules(config);
});

initProxyState();
setTimeout(connectToNative, 1000);
