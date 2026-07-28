let nativePort = null;
let reconnectTimer = null;

// Log buffer helper: persists logs to chrome.storage.local so the React side panel retains them
function appendLog(level, message) {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = { timestamp, level, message };
  
  // Print to console for debugging
  console.log(`[${level.toUpperCase()}] ${message}`);

  chrome.storage.local.get(["logs"], (res) => {
    let logs = res.logs || [];
    logs.push(logEntry);
    if (logs.length > 200) {
      logs.shift(); // Keep logs buffer capped
    }
    chrome.storage.local.set({ logs }, () => {
      // Broadcast to any open side panels
      chrome.runtime.sendMessage({ type: "NEW_LOG", log: logEntry }).catch(() => {
        // Ignore errors when the side panel is closed
      });
    });
  });
}

function notifyPanelStatus(connected) {
  chrome.runtime.sendMessage({ type: "CONNECTION_STATUS", connected }).catch(() => {
    // Ignore errors when panel is closed
  });
}

function connectToNative() {
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
        appendLog("error", `Native bridge disconnected: ${err ? err.message : "No detailed error"}`);
        nativePort = null;
        notifyPanelStatus(false);

        // Schedule reconnect
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          appendLog("system", "Attempting to reconnect to Native Bridge...");
          connectToNative();
        }, 5000);
      });

      // Send INITIAL_AUTH immediately upon connection
      appendLog("system", "Sending INITIAL_AUTH authentication payload to Go backend...");
      nativePort.postMessage({
        type: "INITIAL_AUTH",
        token: token
      });
      notifyPanelStatus(true);

    } catch (e) {
      appendLog("error", `Exception starting native messaging connection: ${e.message}`);
      notifyPanelStatus(false);
    }
  });
}

// Default Proxy Profiles Seeding
const DEFAULT_PROFILES = [
  {
    id: "direct",
    name: "Direct Connection",
    mode: "direct",
    color: "#10b981",
    updatedAt: Date.now()
  },
  {
    id: "vproxy_pac_default",
    name: "vproxy AutoProxy PAC",
    mode: "pac_script",
    pacType: "url",
    pacUrl: "http://127.0.0.1:6888/proxy.pac",
    color: "#8b5cf6",
    isVproxy: true,
    updatedAt: Date.now()
  },
  {
    id: "system",
    name: "System Default Proxy",
    mode: "system",
    color: "#6366f1",
    updatedAt: Date.now()
  }
];

// Apply proxy profile configuration to Chromium chrome.proxy API
function applyProxyConfig(profile) {
  if (!chrome.proxy || !chrome.proxy.settings) {
    appendLog("warning", "chrome.proxy API not available in current environment.");
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let config = { mode: "direct" };

    if (!profile || profile.mode === "direct") {
      config = { mode: "direct" };
    } else if (profile.mode === "system") {
      config = { mode: "system" };
    } else if (profile.mode === "fixed_servers") {
      const scheme = profile.scheme || "http";
      const host = profile.host || "127.0.0.1";
      const port = Number(profile.port) || 8080;
      
      const defaultLanBypass = [
        "localhost",
        "127.0.0.1",
        "[::1]",
        "<-loopback>",
        "192.168.0.0/16",
        "10.0.0.0/8",
        "172.16.0.0/12",
        "*.local"
      ];
      
      const customBypass = Array.isArray(profile.bypassList) ? profile.bypassList : [];
      const combinedBypass = Array.from(new Set([...defaultLanBypass, ...customBypass]));

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
    }

    chrome.proxy.settings.set({ value: config, scope: "regular" }, () => {
      if (chrome.runtime.lastError) {
        const err = chrome.runtime.lastError.message;
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

// Load and apply active proxy state on initial startup/install
function initProxyState() {
  chrome.storage.local.get(["proxy_profiles", "active_proxy_id"], (res) => {
    let profiles = res.proxy_profiles;
    let activeId = res.active_proxy_id || "direct";

    if (!profiles || !Array.isArray(profiles) || profiles.length === 0) {
      profiles = DEFAULT_PROFILES;
      chrome.storage.local.set({ proxy_profiles: profiles, active_proxy_id: activeId });
    }

    const activeProfile = profiles.find((p) => p.id === activeId) || profiles[0];
    applyProxyConfig(activeProfile).catch(() => {});
  });
}

// Proxy error listener
if (chrome.proxy && chrome.proxy.onProxyError) {
  chrome.proxy.onProxyError.addListener((details) => {
    appendLog("error", `[Proxy Network Error] ${details.error}: ${details.details} (Fatal: ${details.fatal})`);
  });
}

// Playwright Extension Connection & Tab State
let activePlaywrightGroup = null;
let activePlaywrightClientName = null;
const pendingPlaywrightConnections = new Map();

async function getDebuggableTabs() {
  if (!chrome.tabs) return [];
  const tabs = await chrome.tabs.query({});
  return tabs.filter((t) => t.url && !t.url.startsWith("chrome:") && !t.url.startsWith("edge:") && !t.url.startsWith("devtools:"));
}

// Clean up stale Playwright tab groups on SW load
async function cleanupStalePlaywrightGroups() {
  try {
    if (typeof chrome === "undefined" || !chrome.tabGroups) return;
    const groups = await chrome.tabGroups.query({ title: "Playwright" });
    const tabsPerGroup = await Promise.all(groups.map((g) => chrome.tabs.query({ groupId: g.id })));
    const tabIds = tabsPerGroup.flat().map((t) => t.id).filter((id) => id !== undefined);
    if (tabIds.length) {
      await chrome.tabs.ungroup(tabIds);
    }
  } catch (err) {
    console.error("Error cleaning up Playwright tab groups:", err);
  }
}

// Auto-check & update native bridge binary if disconnected or requested
async function checkAndUpdateBridgeBinary() {
  try {
    const manifest = chrome.runtime.getManifest();
    const currentVersion = manifest.version;
    appendLog("system", `Checking GitHub Releases for Native Bridge binary updates (Version ${currentVersion})...`);
    
    const releaseRes = await fetch("https://api.github.com/repos/qtopie/domour-chrome-extension/releases/latest");
    if (!releaseRes.ok) return;
    
    const releaseData = await releaseRes.json();
    appendLog("system", `Latest GitHub Release: ${releaseData.tag_name || "N/A"}`);
  } catch (err) {
    console.log("Binary update check skipped:", err);
  }
}

// Keep connection alive or initiate on load
chrome.runtime.onInstalled.addListener(() => {
  appendLog("system", "AI Browser Automation Platform installed.");
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
      console.error("Error setting panel behavior:", err);
    });
  }
  connectToNative();
  initProxyState();
  cleanupStalePlaywrightGroups();
  checkAndUpdateBridgeBinary();
});

chrome.runtime.onStartup.addListener(() => {
  appendLog("system", "Browser started. Initializing native connection and proxy...");
  connectToNative();
  initProxyState();
  cleanupStalePlaywrightGroups();
  checkAndUpdateBridgeBinary();
});

// React UI & External Message Receiver
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CHECK_CONNECTION") {
    sendResponse({ connected: !!nativePort });
  } else if (message.type === "RECONNECT") {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    connectToNative();
    sendResponse({ status: "Connecting..." });
  } else if (message.type === "FORCE_DISCONNECT") {
    if (nativePort) {
      nativePort.disconnect();
      nativePort = null;
    }
    sendResponse({ status: "Disconnected." });
  } 
  else if (message.type === "TRIGGER_VPROXY_SYNC") {
    if (nativePort) {
      nativePort.postMessage({ type: "TRIGGER_VPROXY_SYNC" });
      sendResponse({ status: "VPROXY sync request sent to Go bridge." });
    } else {
      sendResponse({ status: "Native bridge disconnected." });
    }
    return true;
  }
  else if (message.type === "VPROXY_SYNC") {
    appendLog("system", `Received VPROXY_SYNC message from runtime with ${message.profiles ? message.profiles.length : 0} profiles.`);
    handleVproxySync(message);
    sendResponse({ success: true });
    return true;
  }
  // PLAYWRIGHT MCP EXTENSION MESSAGES
  else if (message.type === "connectionRequested") {
    const tabId = sender.tab ? sender.tab.id : 0;
    const { mcpRelayUrl } = message;
    pendingPlaywrightConnections.set(tabId, { mcpRelayUrl: message.mcpRelayUrl, protocolVersion: message.protocolVersion });
    appendLog("system", `Playwright MCP connection requested: ${mcpRelayUrl}`);

    // Automatically bridge WebSocket relay to active debugger tab
    if (mcpRelayUrl) {
      getDebuggableTabs().then((tabs) => {
        const targetTab = tabs.find((t) => t.active) || tabs[0];
        if (targetTab && targetTab.id) {
          activePlaywrightClientName = "Playwright MCP Client";
          activePlaywrightGroup = {
            connectedTabIds: () => [targetTab.id],
            close: () => {}
          };
          appendLog("system", `Playwright client auto-attached to Tab ${targetTab.id} (${targetTab.title || targetTab.url})`);
        }
      });
    }

    sendResponse({ success: true });
    return true;
  } else if (message.type === "getTabs") {
    getDebuggableTabs().then((tabs) => {
      sendResponse({ success: true, tabs, currentTabId: sender.tab ? sender.tab.id : undefined });
    }).catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  } else if (message.type === "connectToTab") {
    const selectorTabId = sender.tab ? sender.tab.id : 0;
    activePlaywrightClientName = message.clientName || "Playwright MCP Client";
    getDebuggableTabs().then((tabs) => {
      const targetTab = tabs.find((t) => t.id === message.tabId) || tabs[0];
      if (targetTab) {
        activePlaywrightGroup = {
          connectedTabIds: () => [targetTab.id],
          close: () => {}
        };
      }
    });
    appendLog("system", `Playwright client connected to tab: ${activePlaywrightClientName}`);
    sendResponse({ success: true });
    return true;
  } else if (message.type === "getConnectionStatus") {
    sendResponse({
      connectedTabIds: activePlaywrightGroup ? activePlaywrightGroup.connectedTabIds() : [],
      clientName: activePlaywrightClientName
    });
    return false;
  } else if (message.type === "disconnect") {
    if (activePlaywrightGroup) {
      activePlaywrightGroup.close("User disconnected");
      activePlaywrightGroup = null;
    }
    activePlaywrightClientName = null;
    appendLog("system", "Disconnected active Playwright client.");
    sendResponse({ success: true });
    return true;
  } else if (message.type === "keepalive") {
    return false;
  }
  // PROXY MESSAGES
  else if (message.type === "GET_PROXY_STATE") {
    chrome.storage.local.get(["proxy_profiles", "active_proxy_id"], (res) => {
      const profiles = res.proxy_profiles || DEFAULT_PROFILES;
      const activeId = res.active_proxy_id || "direct";
      const activeProfile = profiles.find((p) => p.id === activeId) || null;
      sendResponse({ profiles, activeProfileId: activeId, activeProfile });
    });
    return true; // async
  } else if (message.type === "SET_ACTIVE_PROXY") {
    const targetId = message.profileId;
    chrome.storage.local.get(["proxy_profiles"], (res) => {
      const profiles = res.proxy_profiles || DEFAULT_PROFILES;
      const targetProfile = profiles.find((p) => p.id === targetId) || DEFAULT_PROFILES[0];

      chrome.storage.local.set({ active_proxy_id: targetProfile.id }, () => {
        applyProxyConfig(targetProfile)
          .then(() => {
            sendResponse({ success: true, activeProfile: targetProfile });
          })
          .catch((err) => {
            sendResponse({ success: false, error: String(err) });
          });
      });
    });
    return true; // async
  } else if (message.type === "SAVE_PROXY_PROFILE") {
    const updatedProfile = message.profile;
    if (!updatedProfile || !updatedProfile.id) {
      sendResponse({ success: false, error: "Invalid profile payload" });
      return true;
    }

    chrome.storage.local.get(["proxy_profiles", "active_proxy_id"], (res) => {
      let profiles = res.proxy_profiles || DEFAULT_PROFILES;
      const activeId = res.active_proxy_id || "direct";
      const idx = profiles.findIndex((p) => p.id === updatedProfile.id);

      updatedProfile.updatedAt = Date.now();

      if (idx >= 0) {
        profiles[idx] = updatedProfile;
      } else {
        profiles.push(updatedProfile);
      }

      chrome.storage.local.set({ proxy_profiles: profiles }, () => {
        if (activeId === updatedProfile.id) {
          applyProxyConfig(updatedProfile).catch(() => {});
        }
        sendResponse({ success: true, profiles });
      });
    });
    return true; // async
  } else if (message.type === "DELETE_PROXY_PROFILE") {
    const deleteId = message.profileId;
    chrome.storage.local.get(["proxy_profiles", "active_proxy_id"], (res) => {
      let profiles = res.proxy_profiles || DEFAULT_PROFILES;
      let activeId = res.active_proxy_id || "direct";

      profiles = profiles.filter((p) => p.id !== deleteId);

      if (activeId === deleteId) {
        activeId = "direct";
        const fallbackProfile = profiles.find((p) => p.id === activeId) || DEFAULT_PROFILES[0];
        applyProxyConfig(fallbackProfile).catch(() => {});
      }

      chrome.storage.local.set({ proxy_profiles: profiles, active_proxy_id: activeId }, () => {
        sendResponse({ success: true, profiles, activeProfileId: activeId });
      });
    });
    return true; // async
  }

  return true;
});

// Handles native messaging packets from Go
function handleNativeMessage(msg) {
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
      executeAutomationJob(msg);
      break;

    default:
      appendLog("warning", `Unknown message type received from native host: ${JSON.stringify(msg)}`);
  }
}

function handleVproxySync(data) {
  if (!data || !Array.isArray(data.profiles)) return;

  chrome.storage.local.get(["proxy_profiles", "active_proxy_id"], (res) => {
    let currentProfiles = res.proxy_profiles || DEFAULT_PROFILES;
    let activeId = res.active_proxy_id || "vproxy_pac_default";

    data.profiles.forEach((vProfile, index) => {
      const isPacMode = vProfile.mode === "pac_script" || vProfile.pacUrl || vProfile.pacScript || vProfile.pacType || vProfile.scheme === "pac" || vProfile.scheme === "autoproxy";
      const profileId = vProfile.id || `vproxy_${isPacMode ? 'pac' : (vProfile.scheme || 'fixed')}_${vProfile.port || index}`;
      
      const formattedProfile = {
        id: profileId,
        name: vProfile.name || (isPacMode ? "vproxy PAC Profile" : `vproxy ${vProfile.scheme || 'HTTP'}`),
        mode: isPacMode ? "pac_script" : (vProfile.mode || "fixed_servers"),
        scheme: vProfile.scheme || "http",
        host: vProfile.host || "127.0.0.1",
        port: vProfile.port || 18666,
        bypassList: vProfile.bypassList || ["localhost", "127.0.0.1"],
        pacType: vProfile.pacScript ? "script" : (vProfile.pacType || "url"),
        pacUrl: vProfile.pacUrl || "http://127.0.0.1:6888/proxy.pac",
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

// Performs the browser automation actions natively using the user's authentic daily profile context
function executeAutomationJob(job) {
  const { action, url } = job;
  
  if (action === "GET_COOKIES") {
    chrome.storage.local.get(["allow_cookie_extraction"], (res) => {
      const allowed = res.allow_cookie_extraction !== false; // Default true unless explicitly disabled
      if (!allowed) {
        appendLog("warning", `Blocked GET_COOKIES request for ${url}: User has disabled cookie extraction in UI toggle.`);
        sendJobResponse(url, "error", "Cookie extraction disabled by user privacy toggle.");
        return;
      }

      appendLog("job", `Fetching cookies for URL/Domain: ${url}`);
      let domain = url;
      try {
        if (url.startsWith("http")) {
          domain = new URL(url).hostname;
        }
      } catch (e) {}

      chrome.cookies.getAll({ domain: domain }, (cookies) => {
        if (chrome.runtime.lastError) {
          const errMsg = chrome.runtime.lastError.message;
          appendLog("error", `Failed to fetch cookies: ${errMsg}`);
          sendJobResponse(url, "error", errMsg);
        } else {
          appendLog("job", `Successfully extracted ${cookies.length} cookies for domain: ${domain}`);
          const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");
          sendJobResponse(url, "success", JSON.stringify({ cookies, cookieHeader }));
        }
      });
    });
    return;
  }

  if (action === "TAKE_SCREENSHOT") {
    appendLog("job", `Taking screenshot for URL: ${url}`);
    chrome.tabs.create({ url: url, active: true }, (tab) => {
      if (!tab || !tab.id) {
        sendJobResponse(url, "error", "Failed to create tab for screenshot");
        return;
      }

      function screenshotListener(updatedTabId, changeInfo) {
        if (updatedTabId === tab.id && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(screenshotListener);
          setTimeout(() => {
            chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" }, (dataUrl) => {
              if (chrome.runtime.lastError) {
                const errMsg = chrome.runtime.lastError.message;
                appendLog("error", `Screenshot capture failed: ${errMsg}`);
                sendJobResponse(url, "error", errMsg);
              } else {
                appendLog("job", `Successfully captured screenshot for ${url}`);
                sendJobResponse(url, "success", JSON.stringify({ dataUrl, url }));
              }
              chrome.tabs.remove(tab.id).catch(() => {});
            });
          }, 1000);
        }
      }
      chrome.tabs.onUpdated.addListener(screenshotListener);
    });
    return;
  }

  if (action !== "OPEN_AND_AUTOMATE") {
    appendLog("error", `Unsupported action: ${action}`);
    sendJobResponse(url, "error", `Unsupported action: ${action}`);
    return;
  }

  appendLog("job", `Opening target URL: ${url}`);

  chrome.tabs.create({ url: url, active: false }, (tab) => {
    if (!tab || !tab.id) {
      appendLog("error", "Failed to create tab for automation.");
      sendJobResponse(url, "error", "Failed to create tab");
      return;
    }

    const tabId = tab.id;
    appendLog("job", `Tab created with ID ${tabId}. Waiting for page load 'complete'...`);

    function tabUpdateListener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(tabUpdateListener);
        appendLog("job", `Tab ${tabId} loaded. Injecting scripting to scrape content...`);

        chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: () => {
            return {
              title: document.title,
              url: window.location.href,
              innerText: document.body ? document.body.innerText.substring(0, 10000) : "",
              htmlLength: document.documentElement ? document.documentElement.innerHTML.length : 0
            };
          }
        }, (results) => {
          if (chrome.runtime.lastError) {
            const errMsg = chrome.runtime.lastError.message;
            appendLog("error", `Script injection failed: ${errMsg}`);
            sendJobResponse(url, "error", `Script injection failed: ${errMsg}`);
            chrome.tabs.remove(tabId).catch(() => {});
            return;
          }

          if (results && results[0] && results[0].result) {
            const pageData = results[0].result;
            appendLog("job", `Scrape complete. Extracted title: "${pageData.title}"`);
            sendJobResponse(url, "success", JSON.stringify(pageData));
          } else {
            appendLog("error", "Scrape failed: returned empty results.");
            sendJobResponse(url, "error", "Scraped empty results");
          }

          chrome.tabs.remove(tabId).catch(() => {});
        });
      }
    }

    chrome.tabs.onUpdated.addListener(tabUpdateListener);

    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(tabUpdateListener);
      chrome.tabs.get(tabId, (checkTab) => {
        if (chrome.runtime.lastError) return;
        if (checkTab && checkTab.status !== "complete") {
          appendLog("error", `Page load timeout (30s) exceeded for tab ${tabId}.`);
          sendJobResponse(url, "error", "Page load timeout");
          chrome.tabs.remove(tabId).catch(() => {});
        }
      });
    }, 30000);
  });
}

function sendJobResponse(url, status, data) {
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

setTimeout(connectToNative, 1000);
