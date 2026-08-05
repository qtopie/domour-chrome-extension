import { appendLog, notifyPanelStatus } from './logger';
import type { BridgeDisconnectReason } from './logger';
import { executeAutomationJob } from './automation';
import { initProxyState, applyProxyConfig, DEFAULT_PROFILES } from './proxy';
import type { ChromeMessage, ProxyProfile } from './types';

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

    default:
      appendLog("warning", `Unknown message type received from native host: ${JSON.stringify(msg)}`);
  }
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
          "*.lan",
          ...(Array.isArray(vProfile.bypassList) ? vProfile.bypassList : [])
        ])),
        pacType: vProfile.pacScript ? "script" : (vProfile.pacType || "url"),
        pacUrl: vProfile.pacUrl || "http://127.0.0.1:26888/proxy.pac",
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
  if (message.type === "CHECK_CONNECTION") {
    sendResponse({ connected: !!nativePort, reason: nativePort ? undefined : lastDisconnectReason });
    return true;
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
  if (message.type === "TRIGGER_CONNECT") {
    connectToNative();
    sendResponse({ success: true, connected: !!nativePort });
    return true;
  }
  return true;
});

// Initialization
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.api_token && changes.api_token.newValue) {
    appendLog("system", "API token updated in storage. Connecting to native bridge...");
    connectToNative();
  }
});

initProxyState();
setTimeout(connectToNative, 1000);
