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

  const copyToken = () => {
    navigator.clipboard.writeText(token).then(() => {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    });
  };

  const mcpConfigSnippet = JSON.stringify({
    mcpServers: {
      "playwright-extension": {
        command: "npx",
        args: ["@playwright/mcp@latest", "--extension"],
        env: {
          PLAYWRIGHT_MCP_EXTENSION_TOKEN: token
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
          onLogMessage?.("system", "Disconnected Playwright MCP client.");
        }
      });
    } else {
      setIsRelayActive(false);
      setConnectedTabs([]);
      onLogMessage?.("system", "Mock Mode: Playwright client disconnected.");
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
          <h2 className="card-title">Native Automation Engine</h2>
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
                Disconnect Automation Relay
              </button>
            </>
          ) : (
            <p className="card-desc">
              Native Go Bridge Client is ready. Send jobs via `domour-chrome-cli` or API to automate browser actions & cookies seamlessly.
            </p>
          )}
        </div>
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

      {/* Playwright MCP Token Authentication Lock */}
      <div className="panel-card">
        <div className="card-header">
          <h2 className="card-title">PLAYWRIGHT_MCP_EXTENSION_TOKEN</h2>
          <button onClick={copyToken} className="copy-btn-text">
            {copiedToken ? "Copied!" : "Copy Token"}
          </button>
        </div>

        <div className="token-box">
          <code className="token-code">{token}</code>
        </div>
        <p className="card-desc">
          Set this token in your MCP configuration to bypass connection confirmation prompts and automatically attach.
        </p>
      </div>

      {/* MCP Server Config Snippet */}
      <div className="panel-card">
        <div className="card-header">
          <h2 className="card-title">MCP Server Config Snippet</h2>
          <button onClick={copyConfigSnippet} className="copy-btn-text">
            {copiedSnippet ? "Copied!" : "Copy JSON"}
          </button>
        </div>
        <pre className="snippet-code-box">
          <code>{mcpConfigSnippet}</code>
        </pre>
      </div>
    </div>
  );
}
