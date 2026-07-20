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

  return (
    <div className="playwright-manager-container">
      {/* Active Playwright Relay Card */}
      <div className={`panel-card playwright-card ${isRelayActive ? "active-relay" : ""}`}>
        <div className="card-header">
          <h2 className="card-title">Playwright CDP Relay</h2>
          <span className={`status-badge ${isRelayActive ? "active" : ""}`}>
            <span className={`status-dot ${isRelayActive ? "active" : "offline"}`} />
            <span className="status-text">{isRelayActive ? "ATTACHED" : "WAITING FOR CLIENT"}</span>
          </span>
        </div>

        <div className="relay-info-box">
          {isRelayActive ? (
            <>
              <div className="relay-client-row">
                <span className="info-label">Connected Client:</span>
                <span className="info-val">{clientName || "Playwright MCP / CLI"}</span>
              </div>
              <div className="relay-client-row">
                <span className="info-label">Controlled Tabs:</span>
                <span className="info-val font-mono">{connectedTabs.length} Active Tab(s)</span>
              </div>
              <button onClick={handleDisconnect} className="disconnect-btn">
                Disconnect Playwright Relay
              </button>
            </>
          ) : (
            <p className="card-desc">
              Connect AI Agents, `@playwright/mcp`, or Playwright CLI to your authentic browser session without logging in again.
            </p>
          )}
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
