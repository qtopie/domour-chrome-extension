import { useState, useEffect } from "react";
import type { SiteRules, SiteRule } from "../../types/siteRules";
import { createEmptySiteRules, setSiteRule, removeSiteRule } from "../../types/siteRules";
import { sendMessage } from "../../utils/sendMessage";

declare const chrome: any;

interface SiteRulesManagerProps {
  isExtension: boolean;
}

export default function SiteRulesManager({ isExtension }: SiteRulesManagerProps) {
  const [rules, setRules] = useState<SiteRules>(createEmptySiteRules);
  const [hostInput, setHostInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isExtension || typeof chrome === "undefined") return;
    sendMessage<any>({ type: "GET_SITE_RULES" }, (res) => {
      if (res && res.rules) setRules(res.rules);
    });
    chrome.runtime.onMessage.addListener((msg: any) => {
      if (msg.type === "SITE_RULES_UPDATED" && msg.rules) setRules(msg.rules);
    });
  }, [isExtension]);

  const updateLocal = (next: SiteRules) => {
    setRules(next);
    setMessage("已保存");
    setTimeout(() => setMessage(null), 2000);
  };

  const sendRuleUpdate = (host: string, patch: Partial<Omit<SiteRule, "host" | "source">>) => {
    if (!isExtension || typeof chrome === "undefined") return;
    sendMessage<any>({ type: "SET_SITE_RULE", host, patch }, (res) => {
      if (res && res.rules) setRules(res.rules);
    });
  };

  const toggleFlag = (host: string, flag: keyof Omit<SiteRule, "host" | "source">) => {
    const current = rules.perHost[host];
    if (!current) return;
    const next = setSiteRule(rules, host, { [flag]: !current[flag] });
    updateLocal(next);
    sendRuleUpdate(host, { [flag]: !current[flag] });
  };

  const addHost = () => {
    const host = hostInput.trim().toLowerCase().replace(/^https?:\/\//, "");
    if (!host) return;
    const next = setSiteRule(rules, host, { inject: true, bypassProxy: false, cookies: false });
    setHostInput("");
    updateLocal(next);
    sendRuleUpdate(host, { inject: true, bypassProxy: false, cookies: false });
  };

  const removeHost = (host: string) => {
    if (!isExtension || typeof chrome === "undefined") {
      updateLocal(removeSiteRule(rules, host));
      return;
    }
    sendMessage<any>({ type: "REMOVE_SITE_RULE", host }, (res) => {
      if (res && res.rules) setRules(res.rules);
      setMessage(`已移除 ${host}`);
      setTimeout(() => setMessage(null), 2000);
    });
  };

  const hosts = Object.keys(rules.perHost).sort();

  return (
    <section className="panel-card">
      <h2 className="card-title">站点规则</h2>
      <p className="card-desc">
        控制每个站点在自动化注入、代理绕过与 Cookie 提取上的权限。规则通过后台 worker 生效，
        最长后缀匹配优先，未匹配站点使用全局默认。
      </p>

      {message && <div className="rule-message">{message}</div>}

      <div className="chat-input-row">
        <input
          className="chat-input"
          placeholder="例如 example.com 或 api.example.com"
          value={hostInput}
          onChange={(e) => setHostInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addHost()}
        />
        <button onClick={addHost} className="chat-send-btn">添加站点</button>
      </div>

      <div className="site-rule-row site-rule-global">
        <div className="site-rule-host">全局默认</div>
        <div className="site-rule-toggles">
          <span>inject: {rules.global.inject ? "✅" : "⛔"}</span>
          <span>bypassProxy: {rules.global.bypassProxy ? "✅" : "⛔"}</span>
          <span>cookies: {rules.global.cookies ? "✅" : "⛔"}</span>
        </div>
      </div>

      {hosts.length === 0 ? (
        <div className="no-logs"><span>尚未配置站点规则</span></div>
      ) : (
        hosts.map((host) => {
          const r = rules.perHost[host];
          return (
            <div key={host} className="site-rule-row">
              <div className="site-rule-host">{host}</div>
              <div className="site-rule-toggles">
                <label title="允许自动化注入">
                  <input type="checkbox" checked={r.inject} onChange={() => toggleFlag(host, "inject")} /> inject
                </label>
                <label title="绕过代理直连">
                  <input type="checkbox" checked={r.bypassProxy} onChange={() => toggleFlag(host, "bypassProxy")} /> bypassProxy
                </label>
                <label title="允许提取 Cookie">
                  <input type="checkbox" checked={r.cookies} onChange={() => toggleFlag(host, "cookies")} /> cookies
                </label>
                <button onClick={() => removeHost(host)} className="clear-btn">删除</button>
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}
