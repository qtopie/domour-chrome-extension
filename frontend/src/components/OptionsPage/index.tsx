import { useState, useEffect } from "react";
import { sendMessage } from "../../utils/sendMessage";
import ProxyManager from "../ProxyManager";
import SiteRulesManager from "../SiteRulesManager";
import NotificationsManager from "../NotificationsManager";
import RequestsManager from "../RequestsManager";
import BridgeConfig from "../BridgeConfig";
import TrafficAnalysisManager from "../TrafficAnalysisManager";
import { OPTIONS_TABS } from "./tabs";

declare const chrome: any;

type TabKey = "general" | "proxy" | "siterules" | "requestheaders" | "traffic" | "advanced";

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

export default function OptionsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [isExtension, setIsExtension] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [token, setToken] = useState<string>("");
  const [manualOpen, setManualOpen] = useState<boolean>(false);
  const [scriptDetailOpen, setScriptDetailOpen] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [copiedToken, setCopiedToken] = useState<boolean>(false);

  useEffect(() => {
    const hasChrome = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
    setIsExtension(!!hasChrome);

    if (hasChrome) {
      sendMessage<{ connected?: boolean }>(
        { type: "CHECK_CONNECTION" },
        (response) => {
          if (response && response.connected !== undefined) setIsConnected(response.connected);
        }
      );
      chrome.storage.local.get(["logs", "api_token"], (res: any) => {
        if (res.logs) setLogs(res.logs);
        if (res.api_token) setToken(res.api_token);
      });
      chrome.runtime.onMessage.addListener((msg: any) => {
        if (msg.type === "CONNECTION_STATUS") {
          setIsConnected(!!msg.connected);
        } else if (msg.type === "NEW_LOG") {
          setLogs((prev) => [...prev.slice(-199), msg.log]);
        }
      });
    } else {
      setToken("tk_mock_1234567890abcdef12345678");
    }
  }, []);

  const appendSystemLog = (level: string, message: string) => {
    const entry: LogEntry = { timestamp: new Date().toLocaleTimeString(), level, message };
    setLogs((prev) => [...prev.slice(-199), entry]);
  };

  // Generates cryptographically secure random API token prefixed with tk_
  const generateToken = (): string => {
    const array = new Uint8Array(15);
    crypto.getRandomValues(array);
    const hex = Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `tk_${hex}`;
  };

  const copyToken = () => {
    navigator.clipboard.writeText(token).then(() => {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    });
  };

  const regenerateToken = () => {
    if (window.confirm("确定要重新生成 API Token 吗？使用旧 Token 的外部脚本将立即失效。")) {
      const newToken = generateToken();
      setToken(newToken);
      if (isExtension && typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.local.set({ api_token: newToken }, () => {
          appendSystemLog("system", `New token generated: ${newToken.substring(0, 8)}...`);
          chrome.runtime.sendMessage({ type: "RECONNECT" }).catch(() => {});
        });
      }
    }
  };

  return (
    <div className="options-container">
      <header className="header">
        <div className="logo-container">
          <svg className="app-logo-icon" viewBox="0 0 128 128" fill="none" width="24" height="24">
            <circle cx="64" cy="64" r="58" fill="#0f0c1b" stroke="url(#logo-grad)" strokeWidth="4"/>
            <circle cx="64" cy="64" r="30" fill="none" stroke="url(#logo-grad)" strokeWidth="5"/>
            <circle cx="64" cy="64" r="14" fill="url(#core-grad)"/>
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
        </div>
        <div className="status-badge">
          <span className={`status-dot ${isConnected ? "active" : "offline"}`} />
          <span className="status-text">{isConnected ? "ACTIVE" : "OFFLINE"}</span>
        </div>
      </header>

      <nav className="tab-nav">
        {OPTIONS_TABS.map(({ key, label }) => (
          <button
            key={key}
            className={`tab-btn ${activeTab === key ? "active" : ""}`}
            onClick={() => setActiveTab(key as TabKey)}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className="main-content">
        {activeTab === "general" && (
          <>
            <section className="panel-card">
              <h2 className="card-title">通用</h2>
              <p className="card-desc">
                代理配置已迁移至「代理」标签页；任务对话与日志请使用侧边面板工作区。
              </p>
            </section>
            <BridgeConfig
              token={token}
              copiedToken={copiedToken}
              manualOpen={manualOpen}
              scriptDetailOpen={scriptDetailOpen}
              onRegenerate={regenerateToken}
              onCopy={copyToken}
              onToggleManual={() => setManualOpen(!manualOpen)}
              onToggleScript={() => setScriptDetailOpen(!scriptDetailOpen)}
            />
            <NotificationsManager isExtension={isExtension} />
          </>
        )}
        {activeTab === "proxy" && (
          <ProxyManager isExtension={isExtension} onLogMessage={appendSystemLog} />
        )}
        {activeTab === "siterules" && <SiteRulesManager isExtension={isExtension} />}
        {activeTab === "requestheaders" && <RequestsManager isExtension={isExtension} />}
        {activeTab === "traffic" && <TrafficAnalysisManager isExtension={isExtension} />}
        {activeTab === "advanced" && (
          <section className="panel-card">
            <h2 className="card-title">高级</h2>
            <p className="card-desc">
              调试日志（最近 {logs.length} 条）：在此页签中实时展示，或前往侧边面板 Logs 查看完整输出。
            </p>
            <div className="console-logs" style={{ maxHeight: 300, overflowY: "auto" }}>
              {logs.length === 0 ? (
                <div className="no-logs"><span>Waiting for system logs...</span></div>
              ) : (
                logs.map((l, i) => (
                  <div key={i} className="log-row">
                    <span className="log-time">{l.timestamp}</span>
                    <span className={`log-badge log-badge-${l.level}`}>{l.level.toUpperCase().slice(0, 3)}</span>
                    <span className="log-message">{l.message}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
