import { appendLog } from './logger';
import { resolveSiteRule, hostFromUrl } from '../types/siteRules';
import type { SiteRules } from '../types/siteRules';

const TAB_DRAG_RETRY_DELAYS = [150, 300, 600];

// Chrome-protected pages cannot be injected with chrome.scripting.executeScript:
// <all_urls> does not match the chrome-extension:// / chrome:// / edge:// schemes,
// so Chrome rejects injection with "Cannot access contents of url ... Extension
// manifest must request permission to access this host." Detect these targets so
// automation degrades gracefully instead of surfacing an unchecked runtime error.
const RESTRICTED_URL_PREFIXES = [
  "chrome-extension://",
  "chrome://",
  "chrome-untrusted://",
  "edge://",
  "about:",
  "devtools://",
  "view-source:",
  "https://chrome.google.com/webstore",
  "https://microsoftedge.microsoft.com/addons"
];

function isRestrictedUrl(targetUrl: string): boolean {
  return RESTRICTED_URL_PREFIXES.some((prefix) => targetUrl.startsWith(prefix));
}

function createTabWithRetry(
  createProperties: chrome.tabs.CreateProperties,
  callback: (tab: chrome.tabs.Tab | undefined) => void
): void {
  let attempt = 0;
  const tryCreate = (): void => {
    chrome.tabs.create(createProperties, (tab) => {
      if (chrome.runtime.lastError) {
        const errMsg = chrome.runtime.lastError.message ?? 'Unknown error';
        // Chrome locks tab-strip edits while the user is dragging a tab;
        // the failure is transient, so retry with short backoff.
        if (errMsg.includes('may be dragging a tab') && attempt < TAB_DRAG_RETRY_DELAYS.length) {
          const delay = TAB_DRAG_RETRY_DELAYS[attempt++];
          setTimeout(tryCreate, delay);
          return;
        }
        appendLog("error", `Failed to create tab: ${errMsg}`);
        callback(undefined);
        return;
      }
      callback(tab);
    });
  };
  tryCreate();
}

function normalizeCompareUrl(u: string): string {
  return u
    .replace(/#.*$/, "")
    .replace(/\/+$/, "")
    .replace("://localhost:", "://127.0.0.1:")
    .replace("://localhost/", "://127.0.0.1/");
}

function findOrCreateTab(
  targetUrl: string,
  callback: (tabId: number, isTemp: boolean) => void
): void {
  const normTarget = normalizeCompareUrl(targetUrl);
  chrome.tabs.query({}, (tabs) => {
    const existing = tabs.find((t) => {
      if (!t.id || !t.url) return false;
      const normT = normalizeCompareUrl(t.url);
      return normT === normTarget || normT.startsWith(normTarget) || normTarget.startsWith(normT);
    });
    if (existing && existing.id) {
      chrome.tabs.update(existing.id, { active: true }, () => {});
      callback(existing.id, false);
      return;
    }
    createTabWithRetry({ url: targetUrl, active: true }, (tab) => {
      if (!tab || !tab.id) {
        callback(0, false);
        return;
      }
      const tabId = tab.id;
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          chrome.tabs.onUpdated.removeListener(listener);
          callback(tabId, false);
        }
      };
      const listener = (updatedTabId: number, changeInfo: any) => {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          done();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      chrome.tabs.get(tabId, (currentTab) => {
        if (currentTab && currentTab.status === "complete") {
          done();
        }
      });
      setTimeout(done, 10000);
    });
  });
}

export function executeAutomationJob(
  job: any,
  sendJobResponse: (url: string, status: string, data: any) => void
): void {
  const { action, url } = job;

  // Site-level permission guard: if the resolved rule for this host forbids
  // injection, refuse DOM automation (OPEN_AND_AUTOMATE, DOM actions,
  // EVALUATE_JS, SNAPSHOT). Cookie extraction is separately gated by
  // allow_cookie_extraction below (and by site_rules.cookies).
  const injectionActions = new Set([
    "OPEN_AND_AUTOMATE",
    "CLICK", "TYPE", "FILL", "SELECT", "PRESS", "HOVER", "SNAPSHOT", "EVALUATE_JS"
  ]);
  if (injectionActions.has(action)) {
    chrome.storage.local.get(["site_rules"], (res) => {
      const host = hostFromUrl(url || "");
      const rule = resolveSiteRule(res.site_rules as SiteRules, host);
      if (!rule.inject) {
        appendLog("warning", `Blocked ${action} on ${host}: site rule forbids injection.`);
        sendJobResponse(url, "error", `Injection blocked by site rule for ${host}.`);
        return;
      }
      dispatchAutomation();
    });
    return;
  }

  dispatchAutomation();

  function dispatchAutomation(): void {
  if (action === "RELOAD_EXTENSION") {
    sendJobResponse(url, "success", "Reloading extension");
    setTimeout(() => {
      chrome.runtime.reload();
    }, 100);
    return;
  }

  if (action === "GET_COOKIES") {
    chrome.storage.local.get(["allow_cookie_extraction"], (res) => {
      const allowed = res.allow_cookie_extraction !== false;
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
    findOrCreateTab(url, (tabId) => {
      if (!tabId) {
        sendJobResponse(url, "error", "Failed to find tab for screenshot");
        return;
      }
      chrome.tabs.get(tabId, (tab) => {
        const windowId = tab?.windowId;
        setTimeout(() => {
          chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
            if (chrome.runtime.lastError) {
              const errMsg = chrome.runtime.lastError.message;
              appendLog("error", `Screenshot capture failed: ${errMsg}`);
              sendJobResponse(url, "error", errMsg);
            } else {
              appendLog("job", `Successfully captured screenshot for ${url}`);
              sendJobResponse(url, "success", JSON.stringify({ dataUrl, url }));
            }
          });
        }, 300);
      });
    });
    return;
  }

  if (action === "GET_CONSOLE_LOGS") {
    appendLog("job", `Collecting console logs for: ${url}`);
    const minLevel = ((job.min_level as string) || "info").toLowerCase();
    const levelOrder: Record<string, number> = { debug: 0, log: 1, info: 1, warn: 2, error: 3 };
    const threshold = levelOrder[minLevel] ?? 1;

    createTabWithRetry({ url: url, active: true }, (tab) => {
      if (!tab || !tab.id) {
        sendJobResponse(url, "error", "Failed to create tab for console logs");
        return;
      }
      const tabId = tab.id;
      const target = { tabId };
      const logs: any[] = [];

      let detached = false;
      const safeDetach = () => {
        if (!detached) {
          detached = true;
          chrome.debugger.detach(target).catch(() => {});
        }
      };

      const cdpEventListener = (source: chrome.debugger.Debuggee, method: string, params?: any) => {
        if (source.tabId !== tabId) return;
        if (method === "Runtime.consoleAPICalled") {
          const type = params?.type || "log";
          const lvl = type === "warning" ? "warn" : type;
          const entryLevel = levelOrder[lvl] ?? 1;
          if (entryLevel >= threshold) {
            const text = (params?.args || []).map((a: any) => a.value !== undefined ? String(a.value) : (a.description || "")).join(" ");
            const stack = params?.stackTrace?.callFrames?.[0];
            logs.push({
              timestamp: params?.timestamp ? Math.round(params.timestamp) : Date.now(),
              level: lvl,
              text,
              url: stack?.url || "",
              line: stack?.lineNumber || 0,
            });
          }
        } else if (method === "Log.entryAdded") {
          const entry = params?.entry;
          const lvl = entry?.level || "info";
          const entryLevel = levelOrder[lvl] ?? 1;
          if (entryLevel >= threshold) {
            logs.push({
              timestamp: entry?.timestamp ? Math.round(entry.timestamp) : Date.now(),
              level: lvl,
              text: entry?.text || "",
              url: entry?.url || "",
              line: entry?.lineNumber || 0,
            });
          }
        } else if (method === "Runtime.exceptionThrown") {
          logs.push({
            timestamp: params?.timestamp ? Math.round(params.timestamp) : Date.now(),
            level: "error",
            text: params?.exceptionDetails?.text || params?.exceptionDetails?.exception?.description || "Uncaught exception",
            url: params?.exceptionDetails?.url || "",
            line: params?.exceptionDetails?.lineNumber || 0,
          });
        }
      };

      chrome.debugger.onEvent.addListener(cdpEventListener);

      const finishAndRespond = () => {
        chrome.debugger.onEvent.removeListener(cdpEventListener);
        safeDetach();
        sendJobResponse(url, "success", JSON.stringify(logs));
        chrome.tabs.remove(tabId).catch(() => {});
      };

      chrome.debugger.attach(target, "1.3", () => {
        if (chrome.runtime.lastError) {
          appendLog("error", `Debugger attach failed: ${chrome.runtime.lastError.message}`);
          sendJobResponse(url, "error", `Debugger attach failed: ${chrome.runtime.lastError.message}`);
          chrome.tabs.remove(tabId).catch(() => {});
          return;
        }

        chrome.debugger.sendCommand(target, "Console.enable", {}).catch(() => {});
        chrome.debugger.sendCommand(target, "Log.enable", {}).catch(() => {});
        chrome.debugger.sendCommand(target, "Runtime.enable", {}).catch(() => {});

        const checkTabReady = () => {
          setTimeout(finishAndRespond, 2000);
        };

        function onUpdate(updatedTabId: number, changeInfo: any) {
          if (updatedTabId === tabId && changeInfo.status === "complete") {
            chrome.tabs.onUpdated.removeListener(onUpdate);
            checkTabReady();
          }
        }
        chrome.tabs.onUpdated.addListener(onUpdate);
        chrome.tabs.get(tabId, (currentTab) => {
          if (currentTab && currentTab.status === "complete") {
            chrome.tabs.onUpdated.removeListener(onUpdate);
            checkTabReady();
          }
        });

        setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(onUpdate);
          finishAndRespond();
        }, 12000);
      });
    });
    return;
  }

  if (action === "GET_NETWORK_LOGS") {
    appendLog("job", `Collecting network request traces for: ${url}`);
    const filterType = (((job.filter_type as string) || "all")).toLowerCase();
    const includeHar = job.include_har === "true" || job.include_har === true;

    createTabWithRetry({ url: url, active: true }, (tab) => {
      if (!tab || !tab.id) {
        sendJobResponse(url, "error", "Failed to create tab for network logs");
        return;
      }
      const tabId = tab.id;
      const target = { tabId };
      const requestsMap = new Map<string, any>();

      let detached = false;
      const safeDetach = () => {
        if (!detached) {
          detached = true;
          chrome.debugger.detach(target).catch(() => {});
        }
      };

      const cdpNetListener = (source: chrome.debugger.Debuggee, method: string, params?: any) => {
        if (source.tabId !== tabId || !params) return;
        const reqId = params.requestId;
        if (!reqId) return;

        if (method === "Network.requestWillBeSent") {
          requestsMap.set(reqId, {
            requestId: reqId,
            url: params.request?.url || "",
            method: params.request?.method || "GET",
            headers: params.request?.headers || {},
            timestamp: params.timestamp,
            wallTime: params.wallTime || Date.now() / 1000,
            type: (params.type || "other").toLowerCase(),
            status: 0,
            statusText: "Pending",
            mimeType: "",
            durationMs: 0,
            failed: false,
          });
        } else if (method === "Network.responseReceived") {
          const req = requestsMap.get(reqId);
          if (req) {
            req.status = params.response?.status || 0;
            req.statusText = params.response?.statusText || "OK";
            req.mimeType = params.response?.mimeType || "";
            req.responseHeaders = params.response?.headers || {};
            if (params.timestamp && req.timestamp) {
              req.durationMs = Math.round((params.timestamp - req.timestamp) * 1000 * 100) / 100;
            }
          }
        } else if (method === "Network.loadingFailed") {
          const req = requestsMap.get(reqId);
          if (req) {
            req.failed = true;
            req.error = params.errorText || "Failed";
            if (params.timestamp && req.timestamp) {
              req.durationMs = Math.round((params.timestamp - req.timestamp) * 1000 * 100) / 100;
            }
          }
        } else if (method === "Network.loadingFinished") {
          const req = requestsMap.get(reqId);
          if (req && params.timestamp && req.timestamp && req.durationMs === 0) {
            req.durationMs = Math.round((params.timestamp - req.timestamp) * 1000 * 100) / 100;
          }
        }
      };

      chrome.debugger.onEvent.addListener(cdpNetListener);

      const finishAndRespond = () => {
        chrome.debugger.onEvent.removeListener(cdpNetListener);
        safeDetach();

        const entries = Array.from(requestsMap.values()).filter((item) => {
          if (filterType === "all") return true;
          return item.type === filterType;
        });

        let outputData: any;
        if (includeHar) {
          outputData = {
            log: {
              version: "1.2",
              creator: { name: "Domour Copilot Chrome MCP", version: "1.3.1" },
              pages: [{ startedDateTime: new Date().toISOString(), id: `page_${tabId}`, title: url }],
              entries: entries.map((r) => ({
                startedDateTime: new Date(r.wallTime * 1000).toISOString(),
                time: r.durationMs,
                request: { method: r.method, url: r.url, headers: Object.entries(r.headers || {}).map(([name, value]) => ({ name, value: String(value) })) },
                response: { status: r.status, statusText: r.statusText, mimeType: r.mimeType, headers: Object.entries(r.responseHeaders || {}).map(([name, value]) => ({ name, value: String(value) })) },
                error: r.error,
              })),
            },
          };
        } else {
          outputData = entries;
        }

        sendJobResponse(url, "success", JSON.stringify(outputData));
        chrome.tabs.remove(tabId).catch(() => {});
      };

      chrome.debugger.attach(target, "1.3", () => {
        if (chrome.runtime.lastError) {
          appendLog("error", `Debugger attach failed for network: ${chrome.runtime.lastError.message}`);
          sendJobResponse(url, "error", `Debugger attach failed: ${chrome.runtime.lastError.message}`);
          chrome.tabs.remove(tabId).catch(() => {});
          return;
        }

        chrome.debugger.sendCommand(target, "Network.enable", {}).catch(() => {});

        const checkTabReady = () => {
          setTimeout(finishAndRespond, 2000);
        };

        function onUpdate(updatedTabId: number, changeInfo: any) {
          if (updatedTabId === tabId && changeInfo.status === "complete") {
            chrome.tabs.onUpdated.removeListener(onUpdate);
            checkTabReady();
          }
        }
        chrome.tabs.onUpdated.addListener(onUpdate);
        chrome.tabs.get(tabId, (currentTab) => {
          if (currentTab && currentTab.status === "complete") {
            chrome.tabs.onUpdated.removeListener(onUpdate);
            checkTabReady();
          }
        });

        setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(onUpdate);
          finishAndRespond();
        }, 12000);
      });
    });
    return;
  }

  if (action === "NAVIGATE_BACK") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].id) {
        chrome.tabs.goBack(tabs[0].id, () => {
          if (chrome.runtime.lastError) {
            const errMsg = chrome.runtime.lastError.message;
            appendLog("warning", `goBack failed: ${errMsg}`);
            sendJobResponse(url, "error", `Cannot navigate back: ${errMsg}`);
          } else {
            sendJobResponse(url, "success", "Navigated back successfully");
          }
        });
      } else {
        sendJobResponse(url, "error", "No active tab to navigate back");
      }
    });
    return;
  }

  // Common tab runner for DOM automation tasks with SPA wait support
  const runDomScript = (scriptFunc: Function, args: any[] = [], jobOptions: any = {}) => {
    appendLog("job", `Executing DOM action [${action}] on URL: ${url}`);
    if (isRestrictedUrl(url)) {
      sendJobResponse(url, "error", `Cannot execute DOM action on protected URL (chrome://, chrome-extension://, etc): ${url}`);
      return;
    }
    findOrCreateTab(url, (tabId, _isTemp) => {
      if (!tabId) {
        sendJobResponse(url, "error", "Failed to find or create tab for DOM action");
        return;
      }
      const targetSelector = jobOptions.wait_selector || job.wait_selector || job.selector || "";
      const timeoutMs = parseInt(jobOptions.wait_timeout || job.wait_timeout || "8000", 10);

      const executeScriptNow = () => {
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: scriptFunc as any,
          args: args
        }, (results) => {
          if (chrome.runtime.lastError) {
            const errMsg = chrome.runtime.lastError.message;
            appendLog("error", `Script execution failed: ${errMsg}`);
            sendJobResponse(url, "error", `Script execution failed: ${errMsg}`);
          } else if (results && results[0]) {
            const resData = results[0].result;
            sendJobResponse(url, "success", typeof resData === "string" ? resData : JSON.stringify(resData));
          } else {
            sendJobResponse(url, "success", "OK");
          }
          // Keep tab open for subsequent automation actions
        });
      };

      // Inject SPA poller to wait for spinner removal
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: (waitSel: string, maxWait: number) => {
          return new Promise((resolve) => {
            const start = Date.now();
            const check = () => {
              const spinner = document.querySelector('.fui-Spinner, [role="progressbar"], .loading-spinner, .spinner');
              const targetEl = waitSel ? document.querySelector(waitSel) : null;
              const hasMeaningfulText = document.body && document.body.innerText && document.body.innerText.trim().length > 20 && !document.body.innerText.includes("正在初始化");
              
              if (waitSel && targetEl && !spinner) {
                return resolve({ ready: true, reason: "target_selector_found" });
              }
              if (!waitSel && !spinner && hasMeaningfulText) {
                return resolve({ ready: true, reason: "spinner_gone_text_ready" });
              }

              if (Date.now() - start >= maxWait) {
                return resolve({ ready: false, reason: "timeout" });
              }
              setTimeout(check, 150);
            };
            check();
          });
        },
        args: [targetSelector, timeoutMs]
      }, (pollRes) => {
        const result = (pollRes && pollRes[0]) ? pollRes[0].result : null;
        if (result && (result as any).ready) {
          appendLog("job", `SPA ready condition met (${(result as any).reason}). Executing script...`);
        } else {
          appendLog("warning", `SPA wait timeout or fallback. Executing script anyway...`);
        }
        executeScriptNow();
      });
    });
  };

  if (action === "CLICK_ELEMENT") {
    const selector = job.selector || "";
    runDomScript((sel: string) => {
      let el: HTMLElement | null = document.querySelector(sel);
      if (!el) {
        const all = Array.from(document.querySelectorAll('a, button, input, [role="button"]')) as HTMLElement[];
        el = all.find(e => (e.innerText && e.innerText.includes(sel)) || ((e as HTMLInputElement).value && (e as HTMLInputElement).value.includes(sel))) || null;
      }
      if (!el) return `Element not found for selector/text: ${sel}`;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.click();
      return `Clicked element: ${sel}`;
    }, [selector]);
    return;
  }

  if (action === "TYPE_TEXT" || action === "FILL_FORM") {
    const selector = job.selector || "";
    const textVal = action === "TYPE_TEXT" ? (job.text || "") : (job.value || "");
    runDomScript((sel: string, val: string) => {
      const el = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | null;
      if (!el) return `Element not found: ${sel}`;
      el.focus();
      const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) {
        setter.call(el, val);
      } else {
        el.value = val;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return `Filled value in ${sel}`;
    }, [selector, textVal]);
    return;
  }

  if (action === "SELECT_OPTION") {
    const selector = job.selector || "";
    const val = job.value || "";
    runDomScript((sel: string, targetVal: string) => {
      const el = document.querySelector(sel) as HTMLSelectElement | null;
      if (!el) return `Select element not found: ${sel}`;
      if (el.tagName.toLowerCase() === 'select') {
        for (let i = 0; i < el.options.length; i++) {
          if (el.options[i].value === targetVal || el.options[i].text.includes(targetVal)) {
            el.selectedIndex = i;
            break;
          }
        }
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return `Selected option ${targetVal} in ${sel}`;
      }
      return `Element ${sel} is not a <select>`;
    }, [selector, val]);
    return;
  }

  if (action === "PRESS_KEY") {
    const selector = job.selector || "";
    const keyName = job.key || "Enter";
    runDomScript((sel: string, key: string) => {
      const el = (sel ? document.querySelector(sel) : document.activeElement) || document.body;
      const eventInit = { key: key, code: key, bubbles: true, cancelable: true };
      el.dispatchEvent(new KeyboardEvent('keydown', eventInit));
      el.dispatchEvent(new KeyboardEvent('keypress', eventInit));
      el.dispatchEvent(new KeyboardEvent('keyup', eventInit));
      return `Pressed key ${key} on ${sel || "activeElement"}`;
    }, [selector, keyName]);
    return;
  }

  if (action === "HOVER_ELEMENT") {
    const selector = job.selector || "";
    runDomScript((sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return `Element not found: ${sel}`;
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      return `Hovered over ${sel}`;
    }, [selector]);
    return;
  }

  if (action === "GET_SNAPSHOT") {
    const selector = job.selector || "";
    runDomScript((sel: string) => {
      const root = sel ? document.querySelector(sel) : document.documentElement;
      if (!root) return `Element not found: ${sel}`;
      return {
        title: document.title,
        url: window.location.href,
        html: root.outerHTML.substring(0, 50000),
        text: (root as HTMLElement).innerText ? (root as HTMLElement).innerText.substring(0, 10000) : ""
      };
    }, [selector]);
    return;
  }

  if (action === "EVALUATE_JS") {
    const expr = job.expression || "";
    findOrCreateTab(url, (tabId, _isTemp) => {
      if (!tabId) {
        sendJobResponse(url, "error", "Failed to find or create tab");
        return;
      }
      const target = { tabId: tabId };
      const cleanup = () => {
        chrome.debugger.detach(target, () => {
          if (chrome.runtime.lastError) { /* ignore */ }
        });
      };
      const doAttach = () => {
        chrome.debugger.attach(target, "1.3", () => {
          if (chrome.runtime.lastError) {
            sendJobResponse(url, "error", `Debugger attach failed: ${chrome.runtime.lastError.message}`);
            return;
          }
          chrome.debugger.sendCommand(target, "Page.enable", {}).catch(() => {});
          chrome.debugger.sendCommand(target, "Page.setBypassCSP", { enabled: true }).catch(() => {});
          chrome.debugger.sendCommand(target, "Runtime.evaluate", {
            expression: expr,
            returnByValue: true,
            awaitPromise: true,
            allowUnsafeEvalBlockedByCSP: true,
            userGesture: true
          }, (res: any) => {
            cleanup();
            if (chrome.runtime.lastError) {
              sendJobResponse(url, "error", chrome.runtime.lastError.message);
            } else if (res?.exceptionDetails) {
              const excMsg = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
              sendJobResponse(url, "error", excMsg);
            } else {
              const val = res?.result?.value;
              sendJobResponse(url, "success", typeof val === "string" ? val : JSON.stringify(val));
            }
          });
        });
      };
      chrome.debugger.detach(target, () => {
        if (chrome.runtime.lastError) { /* ignore if not attached */ }
        doAttach();
      });
    });
    return;
  }

  if (action !== "OPEN_AND_AUTOMATE") {
    appendLog("error", `Unsupported action: ${action}`);
    sendJobResponse(url, "error", `Unsupported action: ${action}`);
    return;
  }

  appendLog("job", `Opening target URL: ${url}`);

  findOrCreateTab(url, (tabId, _isTemp) => {
    if (!tabId) {
      appendLog("error", "Failed to find or create tab for automation.");
      sendJobResponse(url, "error", "Failed to find or create tab");
      return;
    }

    if (isRestrictedUrl(url)) {
      chrome.tabs.get(tabId, (tab) => {
        sendJobResponse(url, "success", JSON.stringify({
          title: tab?.title || "",
          url: tab?.url || url,
          innerText: "",
          htmlLength: 0,
          protectedPage: true
        }));
      });
      return;
    }

    chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: (maxWait: number) => {
        return new Promise((resolve) => {
          const start = Date.now();
          const check = () => {
            const spinner = document.querySelector('.fui-Spinner, [role="progressbar"], .loading-spinner, .spinner');
            const hasMeaningfulText = document.body && document.body.innerText && document.body.innerText.trim().length > 20 && !document.body.innerText.includes("正在初始化");
            if (!spinner && hasMeaningfulText) {
              return resolve({ ready: true, reason: "content_rendered" });
            }
            if (Date.now() - start >= maxWait) {
              return resolve({ ready: false, reason: "timeout" });
            }
            setTimeout(check, 150);
          };
          check();
        });
      },
      args: [8000]
    }, () => {
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
      });
    });
  });
}
}

