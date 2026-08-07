import { useState, useEffect } from "react";
import PlaywrightManager from "./components/PlaywrightManager";
import NmhInstallBanner from "./components/NmhInstallBanner";
import OverviewPanel from "./components/OverviewPanel";
import ChatPanel from "./components/ChatPanel";
import TasksPanel from "./components/TasksPanel";
import LogsPanel from "./components/LogsPanel";
import type { LogEntry } from "./components/LogsPanel";

declare const chrome: any;

type BridgeStatus = "CONNECTED" | "DISCONNECTED" | "NOT_INSTALLED";
type TabKey = "overview" | "chat" | "tasks" | "logs";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [token, setToken] = useState<string>("");
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>("DISCONNECTED");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isExtension, setIsExtension] = useState<boolean>(false);

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
      chrome.runtime.sendMessage(
        { type: "CHECK_CONNECTION" },
        (response: { connected?: boolean; reason?: string }) => {
          if (response && response.connected !== undefined) {
            const connected = response.connected;
            setIsConnected(connected);
            if (connected) {
              setBridgeStatus("CONNECTED");
            } else {
              setBridgeStatus((response.reason as BridgeStatus) ?? "DISCONNECTED");
            }
          }
        }
      );

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
    const entry: LogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      level,
      message
    };
    setLogs((prev) => [...prev, entry]);
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
            COSMOS <span className="logo-highlight">WORKSPACE</span>
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
          className={`tab-btn ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          <svg className="tab-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          概览
        </button>
        <button
          className={`tab-btn ${activeTab === "chat" ? "active" : ""}`}
          onClick={() => setActiveTab("chat")}
        >
          <svg className="tab-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          Chat
        </button>
        <button
          className={`tab-btn ${activeTab === "tasks" ? "active" : ""}`}
          onClick={() => setActiveTab("tasks")}
        >
          <svg className="tab-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          Tasks
        </button>
        <button
          className={`tab-btn ${activeTab === "logs" ? "active" : ""}`}
          onClick={() => setActiveTab("logs")}
        >
          <svg className="tab-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Logs
        </button>
      </nav>

      {/* Main Container */}
      <main className="main-content">
        {activeTab === "overview" && (
          <OverviewPanel
            token={token}
            isConnected={isConnected}
            bridgeStatus={bridgeStatus}
            onRegenerateToken={regenerateToken}
            onReconnect={triggerReconnect}
          />
        )}
        {activeTab === "chat" && (
          <>
            <ChatPanel isExtension={isExtension} onLogMessage={appendSystemLog} />
            <PlaywrightManager token={token} isExtension={isExtension} onLogMessage={appendSystemLog} />
          </>
        )}
        {activeTab === "tasks" && <TasksPanel isExtension={isExtension} />}
        {activeTab === "logs" && (
          <LogsPanel logs={logs} onClearLogs={clearLogs} />
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
