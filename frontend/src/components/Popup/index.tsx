import { useState, useEffect } from "react";
import { resolveSiteRule, hostFromUrl } from "../../types/siteRules";

declare const chrome: any;

interface ProxyProfile {
  id: string;
  name: string;
  type: string;
  [key: string]: any;
}

export default function PopupApp() {
  const [profiles, setProfiles] = useState<ProxyProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>("direct");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [currentHost, setCurrentHost] = useState<string>("");
  const [rule, setRule] = useState<any>(null);

  useEffect(() => {
    const hasChrome = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
    if (!hasChrome) return;

    // 1. Proxy state
    chrome.runtime.sendMessage({ type: "GET_PROXY_STATE" }, (res: any) => {
      if (res) {
        setProfiles(res.profiles || []);
        setActiveProfileId(res.activeProfileId || "direct");
      }
    });

    // 2. Bridge status
    chrome.runtime.sendMessage(
      { type: "CHECK_CONNECTION" },
      (response: { connected?: boolean }) => {
        if (response) setIsConnected(!!response.connected);
      }
    );

    // 3. Site rules + current tab host
    chrome.runtime.sendMessage({ type: "GET_SITE_RULES" }, (res: any) => {
      if (res && res.rules) setRule(resolveSiteRule(res.rules, currentHost || ""));
    });
    chrome.tabs?.query({ active: true, currentWindow: true }, (tabs: any[]) => {
      const tab = tabs && tabs[0];
      if (tab && tab.url) {
        const host = hostFromUrl(tab.url);
        setCurrentHost(host);
        chrome.runtime.sendMessage({ type: "GET_SITE_RULES" }, (res: any) => {
          if (res && res.rules) {
            setRule(resolveSiteRule(res.rules, host));
          }
        });
      }
    });

    // Live updates
    chrome.runtime.onMessage.addListener((msg: any) => {
      if (msg.type === "PROXY_PROFILES_UPDATED") {
        setProfiles(msg.profiles || []);
        if (msg.activeProfileId) setActiveProfileId(msg.activeProfileId);
      } else if (msg.type === "SITE_RULES_UPDATED" && msg.rules) {
        if (currentHost) setRule(resolveSiteRule(msg.rules, currentHost));
      }
    });
  }, [currentHost]);

  const switchProfile = (id: string) => {
    setActiveProfileId(id);
    chrome.runtime.sendMessage({ type: "SET_ACTIVE_PROXY", profileId: id });
  };

  const toggleSiteFlag = (flag: "inject" | "bypassProxy" | "cookies") => {
    if (!currentHost) return;
    const current = rule;
    const patch = { [flag]: !(current ? current[flag] : false) };
    chrome.runtime.sendMessage({ type: "SET_SITE_RULE", host: currentHost, patch }, (res: any) => {
      if (res && res.rules && currentHost) {
        setRule(resolveSiteRule(res.rules, currentHost));
      }
    });
  };

  return (
    <div className="popup-container">
      <header className="popup-header">
        <span className="popup-title">Domour</span>
        <span className={`status-dot ${isConnected ? "active" : "offline"}`} />
        <span className="popup-status">{isConnected ? "ACTIVE" : "OFFLINE"}</span>
      </header>

      <section className="popup-section">
        <h3 className="popup-section-title">代理 Profile</h3>
        {profiles.map((p) => (
          <label key={p.id} className={`popup-profile ${activeProfileId === p.id ? "selected" : ""}`}>
            <input
              type="radio"
              name="proxy-profile"
              checked={activeProfileId === p.id}
              onChange={() => switchProfile(p.id)}
            />
            <span>{p.name}</span>
          </label>
        ))}
      </section>

      <section className="popup-section">
        <h3 className="popup-section-title">
          当前站点 <span className="popup-host">{currentHost || "未知"}</span>
        </h3>
        {currentHost ? (
          <div className="popup-toggles">
            <label>
              <input type="checkbox" checked={!!rule?.inject} onChange={() => toggleSiteFlag("inject")} />
              允许注入
            </label>
            <label>
              <input type="checkbox" checked={!!rule?.bypassProxy} onChange={() => toggleSiteFlag("bypassProxy")} />
              绕过代理
            </label>
            <label>
              <input type="checkbox" checked={!!rule?.cookies} onChange={() => toggleSiteFlag("cookies")} />
              允许 Cookie
            </label>
          </div>
        ) : (
          <p className="popup-muted">无活动标签页</p>
        )}
      </section>

      <footer className="popup-footer">
        <button
          onClick={() => chrome.runtime?.openOptionsPage?.()}
          className="popup-options-btn"
        >
          打开设置
        </button>
      </footer>
    </div>
  );
}
