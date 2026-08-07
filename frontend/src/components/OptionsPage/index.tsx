import { useState, useEffect } from "react";
import ProxyManager from "../ProxyManager";
import SiteRulesManager from "../SiteRulesManager";
import NotificationsManager from "../NotificationsManager";
import RequestHeadersManager from "../RequestHeadersManager";

declare const chrome: any;

type TabKey = "general" | "proxy" | "bridge" | "notifications" | "siterules" | "requestheaders" | "advanced";

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
            ["requestheaders", "请求头"],
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

            <div className="bridge-install">
              <div className="bridge-install-title">安装 Native Messaging Host</div>
              <p className="card-desc">
                桥接守护进程运行于 localhost:26888，为扩展提供 MCP 服务与原生消息通道。请先安装
                Native Messaging Host，扩展才能启动桥接进程。
              </p>

              <div className="bridge-install-path">
                <div className="bridge-install-path-head">
                  <span className="install-path-badge auto">自动安装</span>
                  <span className="install-path-name">扩展 + Cosmos Assistant 桌面应用</span>
                </div>
                <p className="card-desc">
                  本扩展已发布至 Chrome Web Store（扩展 ID{" "}
                  <code className="inline-code">ndbhggifgbebojmidnoenkfpiiknkggc</code>）。下载桌面应用并在
                  「Setup 向导」中完成 Browser Bridge 配置，即可自动注册 Native Messaging Host。
                </p>
                <a
                  href="https://qtopie.space/"
                  target="_blank"
                  rel="noreferrer"
                  className="install-cta-btn primary"
                >
                  🖥 前往 qtopie.space 下载
                </a>
              </div>

              <div className="bridge-install-path">
                <div className="bridge-install-path-head">
                  <span className="install-path-badge manual">手动安装</span>
                  <span className="install-path-name">GitHub Releases 下载 binary + 注册脚本</span>
                </div>
                <p className="card-desc">
                  从 GitHub Releases 下载对应平台的 bridge binary，然后在终端运行注册脚本完成 Native
                  Messaging Host 注册。
                </p>
                <button
                  onClick={() => setManualOpen(!manualOpen)}
                  className="install-cta-btn secondary"
                  aria-expanded={manualOpen}
                >
                  📦 {manualOpen ? "收起手动安装步骤" : "展开手动安装步骤"}
                </button>
                {manualOpen && (
                  <ol className="manual-steps">
                    <li>
                      从{" "}
                      <a
                        href="https://github.com/qtopie/domour-chrome-extension/releases"
                        target="_blank"
                        rel="noreferrer"
                      >
                        GitHub Releases
                      </a>{" "}
                      下载对应平台的安装包（包含 <code className="inline-code">domour-chrome-bridge</code>{" "}
                      binary 与 <code className="inline-code">register_host.sh</code> 脚本）并解压到本地目录。
                    </li>
                    <li>
                      在解压目录的终端中运行注册脚本。扩展已发布至 Chrome Web Store，注册命令默认使用
                      生产扩展 ID（无需传参）：
                      <pre className="install-code">
                        <code>./register_host.sh</code>
                        <button
                          onClick={() => navigator.clipboard.writeText("./register_host.sh")}
                          className="copy-btn-text"
                        >
                          Copy
                        </button>
                      </pre>
                      <button
                        onClick={() => setScriptDetailOpen(!scriptDetailOpen)}
                        className="install-script-detail-toggle"
                        aria-expanded={scriptDetailOpen}
                      >
                        {scriptDetailOpen ? "▲ 收起：这个脚本会做什么" : "▼ 这个脚本会做什么？"}
                      </button>
                      {scriptDetailOpen && (
                        <div className="install-script-detail">
                          脚本会在你的浏览器配置目录下写入一个{" "}
                          <code className="inline-code">NativeMessagingHosts</code> 清单文件（JSON），
                          告诉 Chrome 扩展与 bridge 之间通过本地消息通道通信：
                          <ul className="script-effect-list">
                            <li>
                              浏览器：Google Chrome、Microsoft Edge（macOS / Linux 自动探测）
                            </li>
                            <li>
                              写入文件：{" "}
                              <code className="inline-code">com.go_react.search_bridge.json</code>
                            </li>
                            <li>
                              内容：指向 <code className="inline-code">domour-chrome-bridge</code> 的
                              路径 + 允许的本扩展 ID（
                              <code className="inline-code">ndbhggifgbebojmidnoenkfpiiknkggc</code>）
                            </li>
                            <li>结果：Chrome 能启动守护进程，Options 状态变为 ACTIVE</li>
                          </ul>
                        </div>
                      )}
                    </li>
                    <li>
                      重启浏览器后点击「重试连接」，若桥接守护进程已启动，状态将变为 ACTIVE。
                    </li>
                  </ol>
                )}
              </div>
            </div>
          </section>
        )}
        {activeTab === "notifications" && <NotificationsManager isExtension={isExtension} />}
        {activeTab === "siterules" && <SiteRulesManager isExtension={isExtension} />}
        {activeTab === "requestheaders" && <RequestHeadersManager isExtension={isExtension} />}
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
