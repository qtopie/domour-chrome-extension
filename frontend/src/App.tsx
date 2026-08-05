import { useState, useEffect, useRef } from "react";
import ProxyManager from "./components/ProxyManager";
import PlaywrightManager from "./components/PlaywrightManager";
import NmhInstallBanner from "./components/NmhInstallBanner";

declare const chrome: any;

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

type BridgeStatus = "CONNECTED" | "DISCONNECTED" | "NOT_INSTALLED";

export default function App() {
  const [activeTab, setActiveTab] = useState<"bridge" | "proxy" | "playwright">("bridge");
  const [token, setToken] = useState<string>("");
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>("DISCONNECTED");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [copied, setCopied] = useState<boolean>(false);
  const [isExtension, setIsExtension] = useState<boolean>(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Check if we are running inside a real Edge/Chrome Extension environment
  useEffect(() => {
    const hasChrome = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
    setIsExtension(!!hasChrome);

    if (hasChrome) {
      // Fixed token matching .agents/mcp_config.json
      const FIXED_TOKEN = "tk_22266e38311c82c36af401b9a9da4d";

      // 1. Load or Set Fixed Token
      chrome.storage.local.get(["api_token"], (result: { api_token?: string }) => {
        if (result.api_token === FIXED_TOKEN) {
          setToken(FIXED_TOKEN);
        } else {
          chrome.storage.local.set({ api_token: FIXED_TOKEN }, () => {
            setToken(FIXED_TOKEN);
            // Notify background worker that token has been initialized
            chrome.runtime.sendMessage({ type: "RECONNECT" }).catch(() => {});
          });
        }
      });

      // 2. Load Initial Logs
      chrome.storage.local.get(["logs"], (result: { logs?: LogEntry[] }) => {
        if (result.logs) {
          setLogs(result.logs);
        }
      });

      // 3. Check Native Bridge Connection State
      chrome.runtime.sendMessage({ type: "CHECK_CONNECTION" }, (response: { connected?: boolean; reason?: string }) => {
        if (response && response.connected !== undefined) {
          const connected = response.connected;
          setIsConnected(connected);
          if (connected) {
            setBridgeStatus("CONNECTED");
          } else {
            setBridgeStatus((response.reason as BridgeStatus) ?? "DISCONNECTED");
          }
        }
      });

      // 4. Set up message listener for incoming logs or status updates from background
      const messageListener = (message: any) => {
        if (message.type === "NEW_LOG") {
          setLogs((prev) => {
            const nextLogs = [...prev, message.log];
            return nextLogs.length > 200 ? nextLogs.slice(1) : nextLogs;
          });
        } else if (message.type === "CONNECTION_STATUS") {
          const connected: boolean = message.connected;
          setIsConnected(connected);
          if (connected) {
            setBridgeStatus("CONNECTED");
          } else {
            setBridgeStatus((message.reason as BridgeStatus) ?? "DISCONNECTED");
          }
        }
      };

      chrome.runtime.onMessage.addListener(messageListener);
      return () => {
        chrome.runtime.onMessage.removeListener(messageListener);
      };
    } else {
      // Mock data for local web development/dev testing
      setToken("tk_mock_1234567890abcdef12345678");
      setIsConnected(false);
      setLogs([
        { timestamp: "20:00:00", level: "system", message: "Mock Mode: Not running in extension environment." },
        { timestamp: "20:00:01", level: "info", message: "Use browser developer tools to load this unpacked extension." },
        { timestamp: "20:00:02", level: "heartbeat", message: "HEARTBEAT_KEEP_ALIVE mock packet." }
      ]);
    }
  }, []);

  // Scroll to bottom on new log entry if in bridge tab
  useEffect(() => {
    if (activeTab === "bridge") {
      logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, activeTab]);

  // Generates cryptographically secure random API token prefixed with tk_
  const generateToken = (): string => {
    const array = new Uint8Array(15);
    crypto.getRandomValues(array);
    const hex = Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `tk_${hex}`;
  };

  const regenerateToken = () => {
    if (window.confirm("Are you sure you want to regenerate the API Token? Existing external scripts using the old token will fail authentication.")) {
      const newToken = generateToken();
      if (isExtension) {
        chrome.storage.local.set({ api_token: newToken }, () => {
          setToken(newToken);
          appendSystemLog("system", `New token generated: ${newToken.substring(0, 8)}...`);
          chrome.runtime.sendMessage({ type: "RECONNECT" }).catch(() => {});
        });
      } else {
        setToken(newToken);
      }
    }
  };

  const appendSystemLog = (level: string, message: string) => {
    const entry = {
      timestamp: new Date().toLocaleTimeString(),
      level,
      message
    };
    setLogs((prev) => [...prev, entry]);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(token).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const triggerReconnect = () => {
    if (isExtension) {
      appendSystemLog("system", "Manual reconnection triggered...");
      chrome.runtime.sendMessage({ type: "RECONNECT" }, (response: any) => {
        appendSystemLog("system", response?.status || "Triggered connection call.");
      });
    } else {
      appendSystemLog("error", "Reconnection failed: extension APIs unavailable.");
    }
  };

  const clearLogs = () => {
    setLogs([]);
    if (isExtension) {
      chrome.storage.local.set({ logs: [] });
    }
  };

  const getLogLevelLabel = (level: string) => {
    switch (level) {
      case "error": return "ERR";
      case "warning": return "WRN";
      case "system": return "SYS";
      case "heartbeat": return "HBT";
      case "job": return "JOB";
      default: return "INF";
    }
  };

  return (
    <div className="app-container">
      {/* Header Panel */}
      <header className="header">
        <div className="logo-container">
          <svg className="app-logo-icon" viewBox="0 0 128 128" fill="none" width="28" height="28">
            <circle cx="64" cy="64" r="58" fill="#0f0c1b" stroke="url(#logo-grad)" strokeWidth="4"/>
            <ellipse cx="64" cy="64" rx="46" ry="18" fill="none" stroke="#00f2fe" strokeWidth="3" strokeDasharray="6 4" opacity="0.7" transform="rotate(-30 64 64)"/>
            <ellipse cx="64" cy="64" rx="46" ry="18" fill="none" stroke="#a855f7" strokeWidth="3" opacity="0.8" transform="rotate(30 64 64)"/>
            <circle cx="64" cy="64" r="30" fill="none" stroke="url(#logo-grad)" strokeWidth="5"/>
            <circle cx="64" cy="64" r="14" fill="url(#core-grad)"/>
            <circle cx="26" cy="44" r="4" fill="#00f2fe"/>
            <circle cx="102" cy="84" r="4" fill="#a855f7"/>
            <defs>
              <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00f2fe"/>
                <stop offset="100%" stopColor="#a855f7"/>
              </linearGradient>
              <linearGradient id="core-grad" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#3b82f6"/>
                <stop offset="100%" stopColor="#8b5cf6"/>
              </linearGradient>
            </defs>
          </svg>
          <h1 className="logo-text">
            COSMOS <span className="logo-highlight">BRIDGE</span>
          </h1>
        </div>
        <div className="status-badge">
          <span className={`status-dot ${isConnected ? "active" : "offline"}`} />
          <span className="status-text">
            {isConnected ? "ACTIVE" : "OFFLINE"}
          </span>
        </div>
      </header>

      {/* NMH Install Guide Banner — only shown when host is not registered */}
      {isExtension && bridgeStatus === "NOT_INSTALLED" && (
        <NmhInstallBanner onRetryConnect={triggerReconnect} />
      )}

      {/* Navigation Tab Bar */}
      <nav className="tab-nav">
        <button
          className={`tab-btn ${activeTab === "bridge" ? "active" : ""}`}
          onClick={() => setActiveTab("bridge")}
        >
          <svg className="tab-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Bridge & Logs
        </button>
        <button
          className={`tab-btn ${activeTab === "proxy" ? "active" : ""}`}
          onClick={() => setActiveTab("proxy")}
        >
          <svg className="tab-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457-.315-2.84-.878-4.085" />
          </svg>
          Proxy Manager
        </button>
        <button
          className={`tab-btn ${activeTab === "playwright" ? "active" : ""}`}
          onClick={() => setActiveTab("playwright")}
        >
          <svg className="tab-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
          </svg>
          MCP Server
        </button>
      </nav>

      {/* Main Container */}
      <main className="main-content">
        {activeTab === "bridge" ? (
          <>
            {/* Token Section */}
            <section className="panel-card">
              <div className="card-header">
                <h2 className="card-title">Access Token Lock</h2>
                <button onClick={regenerateToken} className="regenerate-btn">
                  Regenerate
                </button>
              </div>

              <div className="token-box">
                <code className="token-code">{token}</code>
                <button
                  onClick={copyToClipboard}
                  className={`copy-btn ${copied ? "copied" : ""}`}
                  title="Copy token"
                >
                  {copied ? (
                    <svg className="svg-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="svg-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                  )}
                </button>
              </div>

              <p className="card-desc">
                Ensure external job requests written to your temp directory contain this token. Unauthorized jobs will be instantly deleted.
              </p>
            </section>

            {/* Console / Live Logs Section */}
            <section className="panel-card console-card">
              <div className="card-header">
                <h2 className="card-title">Live Logs</h2>
                <button onClick={clearLogs} className="clear-btn">
                  Clear Logs
                </button>
              </div>

              {/* Logs View */}
              <div className="console-logs">
                {logs.length === 0 ? (
                  <div className="no-logs">
                    <svg className="no-logs-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>Waiting for system logs...</span>
                  </div>
                ) : (
                  logs.map((logEntry, index) => (
                    <div key={index} className="log-row">
                      <span className="log-time">{logEntry.timestamp}</span>
                      <span className={`log-badge log-badge-${logEntry.level}`}>
                        {getLogLevelLabel(logEntry.level)}
                      </span>
                      <span className="log-message">{logEntry.message}</span>
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            </section>
          </>
        ) : activeTab === "proxy" ? (
          <ProxyManager isExtension={isExtension} onLogMessage={appendSystemLog} />
        ) : (
          <PlaywrightManager token={token} isExtension={isExtension} onLogMessage={appendSystemLog} />
        )}
      </main>

      {/* Footer Controls */}
      <footer className="footer">
        <button onClick={triggerReconnect} className="sync-btn">
          <svg className="svg-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          Sync Native Bridge Connection
        </button>
      </footer>
    </div>
  );
}
