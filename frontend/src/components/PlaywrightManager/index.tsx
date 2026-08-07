import { useState, useEffect } from "react";

declare const chrome: any;

interface PlaywrightManagerProps {
  token: string;
  isExtension: boolean;
  onLogMessage?: (level: string, message: string) => void;
}

export default function PlaywrightManager({ token, isExtension, onLogMessage }: PlaywrightManagerProps) {
  const [copiedToken, setCopiedToken] = useState<boolean>(false);
  const [copiedSnippet, setCopiedSnippet] = useState<boolean>(false);
  const [connectedTabs, setConnectedTabs] = useState<number[]>([]);
  const [clientName, setClientName] = useState<string | undefined>();
  const [isRelayActive, setIsRelayActive] = useState<boolean>(false);
  const [endpointOpen, setEndpointOpen] = useState<boolean>(false);
  const [snippetOpen, setSnippetOpen] = useState<boolean>(false);

  useEffect(() => {
    if (isExtension && typeof chrome !== "undefined" && chrome.runtime) {
      const checkStatus = () => {
        chrome.runtime.sendMessage({ type: "getConnectionStatus" }, (res: any) => {
          if (res) {
            setConnectedTabs(res.connectedTabIds || []);
            setClientName(res.clientName);
            setIsRelayActive((res.connectedTabIds || []).length > 0);
          }
        });
      };

      checkStatus();
      const interval = setInterval(checkStatus, 3000);
      return () => clearInterval(interval);
    }
  }, [isExtension]);


  const MCP_ENDPOINT = "http://localhost:26888/mcp";

  const mcpConfigSnippet = JSON.stringify({
    mcpServers: {
      "domour-chrome-mcp": {
        url: MCP_ENDPOINT,
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    }
  }, null, 2);

  const copyConfigSnippet = () => {
    navigator.clipboard.writeText(mcpConfigSnippet).then(() => {
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 2000);
    });
  };

  const handleDisconnect = () => {
    if (isExtension && typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.sendMessage({ type: "disconnect" }, (res: any) => {
        if (res && res.success) {
          setIsRelayActive(false);
          setConnectedTabs([]);
          onLogMessage?.("system", "Disconnected domour-chrome-mcp client.");
        }
      });
    } else {
      setIsRelayActive(false);
      setConnectedTabs([]);
      onLogMessage?.("system", "Mock Mode: MCP client disconnected.");
    }
  };

  const [allowCookies, setAllowCookies] = useState<boolean>(true);

  useEffect(() => {
    if (isExtension && typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.get(["allow_cookie_extraction"], (res: any) => {
        if (res.allow_cookie_extraction !== undefined) {
          setAllowCookies(res.allow_cookie_extraction);
        }
      });
    }
  }, [isExtension]);

  const toggleCookieExtraction = (enabled: boolean) => {
    setAllowCookies(enabled);
    if (isExtension && typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({ allow_cookie_extraction: enabled }, () => {
        onLogMessage?.("system", `Cookie extraction permission ${enabled ? "ENABLED" : "DISABLED"} by user.`);
      });
    }
  };

  return (
    <div className="playwright-manager-container">
      {/* Active Native Automation Relay Card */}
      <div className={`panel-card playwright-card ${isRelayActive ? "active-relay" : ""}`}>
        <div className="card-header">
          <h2 className="card-title">Domour Chrome MCP</h2>
          <span className={`status-badge ${isRelayActive ? "active" : ""}`}>
            <span className={`status-dot ${isRelayActive ? "active" : "offline"}`} />
            <span className="status-text">{isRelayActive ? "ATTACHED" : "READY"}</span>
          </span>
        </div>

        <div className="relay-info-box">
          {isRelayActive ? (
            <>
              <div className="relay-client-row">
                <span className="info-label">Connected Client:</span>
                <span className="info-val">{clientName || "Native Go Bridge CLI"}</span>
              </div>
              <div className="relay-client-row">
                <span className="info-label">Controlled Tabs:</span>
                <span className="info-val font-mono">{connectedTabs.length} Active Tab(s)</span>
              </div>
              <button onClick={handleDisconnect} className="disconnect-btn">
                Disconnect MCP Client
              </button>
            </>
          ) : (
            <p className="card-desc">
              MCP server is ready on <code style={{ color: "var(--info)", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>localhost:26888</code>. Connect your AI agent using the config snippet below.
            </p>
          )}
        </div>

        {/* MCP Endpoint — collapsed by default, merged into Domour Chrome MCP card */}
        <button
          onClick={() => setEndpointOpen(!endpointOpen)}
          className="endpoint-toggle"
          aria-expanded={endpointOpen}
        >
          <svg
            className={`svg-icon endpoint-toggle-arrow ${endpointOpen ? "open" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          MCP Endpoint
        </button>
        {endpointOpen && (
          <div className="endpoint-panel">
            <div className="token-box">
              <code className="token-code">{MCP_ENDPOINT}</code>
              <button
                onClick={() => navigator.clipboard.writeText(MCP_ENDPOINT).then(() => { setCopiedToken(true); setTimeout(() => setCopiedToken(false), 2000); })}
                className={`copy-btn ${copiedToken ? "copied" : ""}`}
                title="Copy endpoint URL"
              >
                {copiedToken ? (
                  <svg className="svg-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                ) : (
                  <svg className="svg-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                )}
              </button>
            </div>
            <p className="card-desc">
              Streamable HTTP MCP endpoint. Add this to your AI Coding Assistant (Cursor, Claude Desktop, Antigravity) to enable browser automation.
            </p>
          </div>
        )}

        {/* MCP Server Config Snippet — collapsed by default, merged into Domour Chrome MCP card */}
        <button
          onClick={() => setSnippetOpen(!snippetOpen)}
          className="endpoint-toggle"
          aria-expanded={snippetOpen}
        >
          <svg
            className={`svg-icon endpoint-toggle-arrow ${snippetOpen ? "open" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          MCP Server Config Snippet
        </button>
        {snippetOpen && (
          <div className="endpoint-panel">
            <div className="snippet-header-row">
              <p className="card-desc">
                将以下 JSON 配置到你的 AI 编程助手 MCP 客户端即可连接。
              </p>
              <button onClick={copyConfigSnippet} className="copy-btn-text">
                {copiedSnippet ? "Copied!" : "Copy JSON"}
              </button>
            </div>
            <pre className="snippet-code-box">
              <code>{mcpConfigSnippet}</code>
            </pre>
          </div>
        )}
      </div>

      {/* Privacy & Security Controls Card */}
      <div className="panel-card privacy-card">
        <div className="card-header">
          <h2 className="card-title">Privacy & Sensitive Permissions</h2>
        </div>
        <div className="privacy-toggle-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-main, #f3f4f6)' }}>Allow Cookie Extraction</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted, #9ca3af)', marginTop: '2px' }}>
              Permit AI agents to retrieve authentic session cookies for login bypass.
            </div>
          </div>
          <label style={{ position: 'relative', display: 'inline-block', width: '40px', height: '22px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={allowCookies} 
              onChange={(e) => toggleCookieExtraction(e.target.checked)}
              style={{ opacity: 0, width: 0, height: 0 }} 
            />
            <span style={{
              position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: allowCookies ? '#10b981' : '#374151',
              borderRadius: '22px', transition: '.3s'
            }}>
              <span style={{
                position: 'absolute', content: '""', height: '16px', width: '16px', left: allowCookies ? '20px' : '3px', bottom: '3px',
                backgroundColor: '#ffffff', borderRadius: '50%', transition: '.3s'
              }} />
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
