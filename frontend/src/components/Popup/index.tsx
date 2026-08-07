import { useState, useEffect, useRef } from "react";
import { sendMessage } from "../../utils/sendMessage";
import { resolveSiteRule, hostFromUrl } from "../../types/siteRules";
import { matchPerHost } from "../../types/requestHeaders";
import type { HeaderKV } from "../../types/requestHeaders";

declare const chrome: any;

interface ProxyProfile {
  id: string;
  name: string;
  type: string;
  [key: string]: any;
}

interface HdrEdit {
  key: string;
  value: string;
}

export default function PopupApp() {
  const [profiles, setProfiles] = useState<ProxyProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>("direct");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [currentHost, setCurrentHost] = useState<string>("");
  const [rule, setRule] = useState<any>(null);
  const [hdrKvs, setHdrKvs] = useState<HdrEdit[]>([]);
  const [hdrDirty, setHdrDirty] = useState<boolean>(false);
  const hdrDirtyRef = useRef(false);

  useEffect(() => {
    const hasChrome = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
    if (!hasChrome) return;

    // 1. Proxy state
    sendMessage<any>({ type: "GET_PROXY_STATE" }, (res) => {
      if (res) {
        setProfiles(res.profiles || []);
        setActiveProfileId(res.activeProfileId || "direct");
      }
    });

    // 2. Bridge status
    sendMessage<{ connected?: boolean }>(
      { type: "CHECK_CONNECTION" },
      (response) => {
        if (response) setIsConnected(!!response.connected);
      }
    );

    // 3. Site rules + current tab host
    sendMessage<any>({ type: "GET_SITE_RULES" }, (res) => {
      if (res && res.rules) setRule(resolveSiteRule(res.rules, currentHost || ""));
    });
    chrome.tabs?.query({ active: true, currentWindow: true }, (tabs: any[]) => {
      const tab = tabs && tabs[0];
      if (tab && tab.url) {
        const host = hostFromUrl(tab.url);
        setCurrentHost(host);
        sendMessage<any>({ type: "GET_SITE_RULES" }, (res) => {
          if (res && res.rules) {
            setRule(resolveSiteRule(res.rules, host));
          }
        });
        loadHostHeaders(host);
      }
    });

    // Live updates
    chrome.runtime.onMessage.addListener((msg: any) => {
      if (msg.type === "PROXY_PROFILES_UPDATED") {
        setProfiles(msg.profiles || []);
        if (msg.activeProfileId) setActiveProfileId(msg.activeProfileId);
      } else if (msg.type === "SITE_RULES_UPDATED" && msg.rules) {
        if (currentHost) setRule(resolveSiteRule(msg.rules, currentHost));
      } else if (msg.type === "REQUEST_HEADERS_UPDATED" && msg.config) {
        const host = currentHost || "";
        if (host && !hdrDirtyRef.current) syncHeadersFromConfig(msg.config, host);
      }
    });
  }, [currentHost]);

  const syncHeadersFromConfig = (config: any, host: string) => {
    const matched = matchPerHost(config, host);
    const headers: HeaderKV[] = matched ? config.perHost?.[matched]?.headers ?? [] : [];
    setHdrKvs(headers.map((h) => ({ key: h.key, value: h.value })));
    hdrDirtyRef.current = false;
    setHdrDirty(false);
  };

  const loadHostHeaders = (host: string) => {
    if (!host) return;
    sendMessage<any>({ type: "GET_REQUEST_HEADERS" }, (res) => {
      if (res && res.success && res.config) syncHeadersFromConfig(res.config, host);
    });
  };

  const updateKv = (i: number, field: "key" | "value", val: string) => {
    hdrDirtyRef.current = true;
    setHdrDirty(true);
    setHdrKvs((prev) => prev.map((kv, idx) => (idx === i ? { ...kv, [field]: val } : kv)));
  };

  const addKvRow = () => {
    hdrDirtyRef.current = true;
    setHdrDirty(true);
    setHdrKvs((prev) => [...prev, { key: "", value: "" }]);
  };

  const removeKvRow = (i: number) => {
    hdrDirtyRef.current = true;
    setHdrDirty(true);
    setHdrKvs((prev) => prev.filter((_, idx) => idx !== i));
  };

  const saveHostHeaders = () => {
    if (!currentHost) return;
    const headers = hdrKvs
      .filter((kv) => kv.key.trim() !== "")
      .map((kv) => ({ key: kv.key.trim(), value: kv.value }));
    if (headers.length === 0) {
      sendMessage<any>(
        { type: "REMOVE_HOST_HEADERS", host: currentHost },
        (res) => {
          if (res && res.success && res.config) syncHeadersFromConfig(res.config, currentHost);
        }
      );
      return;
    }
    sendMessage<any>(
      { type: "SET_HOST_HEADERS", host: currentHost, headers },
      (res) => {
        if (res && res.success && res.config) syncHeadersFromConfig(res.config, currentHost);
      }
    );
  };

  const switchProfile = (id: string) => {
    setActiveProfileId(id);
    sendMessage({ type: "SET_ACTIVE_PROXY", profileId: id });
  };

  const toggleSiteFlag = (flag: "inject" | "bypassProxy" | "cookies") => {
    if (!currentHost) return;
    const current = rule;
    const patch = { [flag]: !(current ? current[flag] : false) };
    sendMessage<any>({ type: "SET_SITE_RULE", host: currentHost, patch }, (res) => {
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

      <section className="popup-section">
        <h3 className="popup-section-title">当前站点请求头</h3>
        {currentHost ? (
          <div className="hdr-kv-rows popup-hdr-rows">
            {hdrKvs.length === 0 && <p className="popup-muted">未设置，添加 Key/Value 后保存</p>}
            {hdrKvs.map((kv, i) => (
              <div key={i} className="hdr-kv-row">
                <input
                  className="hdr-kv-key"
                  placeholder="Key"
                  value={kv.key}
                  onChange={(e) => updateKv(i, "key", e.target.value)}
                />
                <span className="hdr-kv-sep">:</span>
                <input
                  className="hdr-kv-value"
                  placeholder="Value"
                  value={kv.value}
                  onChange={(e) => updateKv(i, "value", e.target.value)}
                />
                <button className="popup-kv-del" onClick={() => removeKvRow(i)} title="删除此行">
                  ×
                </button>
              </div>
            ))}
            <div className="hdr-actions">
              <button className="add-kv-btn" onClick={addKvRow}>
                + 添加
              </button>
              <button
                className={`popup-options-btn ${hdrDirty ? "popup-btn-primary" : ""}`}
                onClick={saveHostHeaders}
              >
                {hdrDirty ? "保存" : "已同步"}
              </button>
            </div>
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
