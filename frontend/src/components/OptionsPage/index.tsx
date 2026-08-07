import { useState, useEffect } from "react";
import ProxyManager from "../ProxyManager";
import SiteRulesManager from "../SiteRulesManager";
import NotificationsManager from "../NotificationsManager";

declare const chrome: any;

type TabKey = "general" | "proxy" | "bridge" | "notifications" | "siterules" | "advanced";

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
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [copiedToken, setCopiedToken] = useState<boolean>(false);

  useEffect(() => {
    const hasChrome = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
    setIsExtension(!!hasChrome);

    if (hasChrome) {
      chrome.runtime.sendMessage(
        { type: "CHECK_CONNECTION" },
        (response: { connected?: boolean }) => {
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
          <h1 className="logo-text">
            COSMOS <span className="logo-highlight">SETTINGS</span>
          </h1>
        </div>
        <div className="status-badge">
          <span className={`status-dot ${isConnected ? "active" : "offline"}`} />
          <span className="status-text">{isConnected ? "ACTIVE" : "OFFLINE"}</span>
        </div>
      </header>

      <nav className="tab-nav">
        {(
          [
            ["general", "通用"],
            ["proxy", "代理"],
            ["bridge", "桥接"],
            ["notifications", "通知"],
            ["siterules", "站点规则"],
            ["advanced", "高级"],
          ] as [TabKey, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            className={`tab-btn ${activeTab === key ? "active" : ""}`}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className="main-content">
        {activeTab === "general" && (
          <section className="panel-card">
            <h2 className="card-title">通用</h2>
            <p className="card-desc">
              代理配置已迁移至「代理」标签页；任务对话与日志请使用侧边面板工作区。
            </p>
          </section>
        )}
        {activeTab === "proxy" && (
          <ProxyManager isExtension={isExtension} onLogMessage={appendSystemLog} />
        )}
        {activeTab === "bridge" && (
          <section className="panel-card">
            <div className="card-header">
              <h2 className="card-title">桥接配置</h2>
              <button onClick={regenerateToken} className="regenerate-btn">
                Regenerate
              </button>
            </div>
            <p className="card-desc">API Token：外部任务请求需携带此 token 认证。</p>
            <div className="token-box">
              <code className="token-code">{token}</code>
              <button
                onClick={copyToken}
                className={`copy-btn ${copiedToken ? "copied" : ""}`}
                title="Copy token"
              >
                {copiedToken ? (
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
              桥接守护进程运行于 localhost:26888，为扩展提供 MCP 服务与原生消息通道。
            </p>
          </section>
        )}
        {activeTab === "notifications" && <NotificationsManager isExtension={isExtension} />}
        {activeTab === "siterules" && <SiteRulesManager isExtension={isExtension} />}
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
