import { useState, useEffect, useMemo, useRef } from "react";
import { sendMessage } from "../../utils/sendMessage";
import type {
  TrafficAnalysisConfig,
  TrafficRule,
  VProxyAction,
  VProxyTrace
} from "../../types/trafficAnalysis";
import {
  BODY_TRUNCATE,
  bodyTruncated,
  createEmptyTrafficAnalysis,
  formatLatency,
  isLocalDevPattern,
  kvPairs,
  normalizeTrace,
  statusClass,
  validateTrafficRule
} from "../../types/trafficAnalysis";

declare const chrome: any;

interface TrafficAnalysisManagerProps {
  isExtension: boolean;
}

const ACTIONS: VProxyAction[] = ["DIRECT", "PROXY", "INTERCEPT", "MAP"];
const EMPTY_RULE: TrafficRule = { pattern: "", action: "PROXY", enabled: true };
const VPROXY_CA_PATH = "/tmp/vproxy-ca.crt";

export default function TrafficAnalysisManager({ isExtension }: TrafficAnalysisManagerProps) {
  const [config, setConfig] = useState<TrafficAnalysisConfig>(createEmptyTrafficAnalysis);
  const [subTab, setSubTab] = useState<"rules" | "capture">("rules");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ruleRows, setRuleRows] = useState<TrafficRule[]>([{ ...EMPTY_RULE }]);
  const [upstreamRows, setUpstreamRows] = useState<string[]>([""]);
  const [traces, setTraces] = useState<VProxyTrace[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [fullBodyId, setFullBodyId] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const applyLoaded = (cfg: TrafficAnalysisConfig) => {
    setConfig(cfg);
    setRuleRows(cfg.rules && cfg.rules.length ? cfg.rules.map((r) => ({ ...r })) : [{ ...EMPTY_RULE }]);
    setUpstreamRows(cfg.upstreams && cfg.upstreams.length ? [...cfg.upstreams] : [""]);
  };

  useEffect(() => {
    if (!isExtension || typeof chrome === "undefined") return;
    sendMessage<any>({ type: "GET_TRAFFIC_ANALYSIS" }, (res) => {
      if (res && res.config) applyLoaded(res.config);
    });
    const listener = (msg: any) => {
      if (msg.type === "TRAFFIC_ANALYSIS_UPDATED" && msg.config) applyLoaded(msg.config);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [isExtension]);

  const loadTraces = () => {
    if (!isExtension || typeof chrome === "undefined") return;
    sendMessage<any>({ type: "FETCH_VPROXY_TRACES" }, (res) => {
      if (res && res.success && Array.isArray(res.traces)) {
        setTraces(res.traces.map((t: VProxyTrace) => normalizeTrace(t)));
        setError(null);
      } else {
        setError(res?.error ?? "抓取 trace 失败（vproxy Web :8899 不可达）");
      }
    });
  };

  useEffect(() => {
    if (autoRefresh) {
      loadTraces();
      timerRef.current = window.setInterval(loadTraces, 3000);
    } else if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh]);

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 2500);
  };

  const validateRows = (): string | null => {
    for (const u of upstreamRows) {
      const t = u.trim();
      if (t && !/^(socks5?|http|https):\/\//i.test(t)) return `非法 upstream: ${t}`;
    }
    for (const r of ruleRows) {
      if (!r.pattern.trim()) continue;
      const err = validateTrafficRule(r);
      if (err) return err;
    }
    return null;
  };

  const save = () => {
    const err = validateRows();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    const next: TrafficAnalysisConfig = {
      ...config,
      upstreams: upstreamRows.map((u) => u.trim()).filter((u) => u.length > 0),
      rules: ruleRows
        .map((r) => ({ ...r, pattern: r.pattern.trim() }))
        .filter((r) => r.pattern.length > 0),
      finalAction: config.finalAction
    };
    if (!isExtension || typeof chrome === "undefined") {
      setConfig(next);
      flash("已保存（本地预览）");
      return;
    }
    sendMessage<any>({ type: "SAVE_TRAFFIC_ANALYSIS", config: next }, (res) => {
      if (res && res.success) {
        setConfig(res.config);
        flash(res.syncError ? `已保存，但规则同步失败：${res.syncError}` : "已保存" + (next.enabled ? "并同步 vproxy" : ""));
      } else {
        setError(res?.error ?? "保存失败");
      }
    });
  };

  const toggleEnabled = (next: boolean) => {
    setBusy(true);
    if (!isExtension || typeof chrome === "undefined") {
      setConfig((c) => ({ ...c, enabled: next }));
      setBusy(false);
      return;
    }
    sendMessage<any>({ type: "TOGGLE_TRAFFIC_ANALYSIS", enabled: next }, (res) => {
      setBusy(false);
      if (res && res.success) {
        setConfig((c) => ({ ...c, enabled: !!res.enabled }));
        flash(next ? "流量分析已开启（Chrome 代理已切换至 vproxy :8118）" : "流量分析已关闭（已恢复原代理）");
      } else {
        setError(res?.error ?? "切换失败");
      }
    });
  };

  const clearTraces = () => {
    if (typeof chrome === "undefined") return;
    sendMessage<any>({ type: "CLEAR_VPROXY_TRACES" }, (res) => {
      if (res && res.success) {
        setTraces([]);
        flash("已清空");
      } else {
        setError(res?.error ?? "清空失败");
      }
    });
  };

  const updateRule = (i: number, patch: Partial<TrafficRule>) => {
    setRuleRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const addRule = () => setRuleRows((rows) => [...rows, { ...EMPTY_RULE }]);
  const removeRule = (i: number) => setRuleRows((rows) => rows.filter((_, idx) => idx !== i));
  const updateUpstream = (i: number, v: string) =>
    setUpstreamRows((rows) => rows.map((r, idx) => (idx === i ? v : r)));
  const addUpstream = () => setUpstreamRows((rows) => [...rows, ""]);
  const removeUpstream = (i: number) => setUpstreamRows((rows) => rows.filter((_, idx) => idx !== i));

  const devHints = useMemo(() => {
    const hints: string[] = [];
    for (const r of ruleRows) {
      if (!r.pattern.trim() || !r.enabled) continue;
      if (isLocalDevPattern(r.pattern) && (r.action === "PROXY" || r.action === "DIRECT")) {
        hints.push(`「${r.pattern.trim()}」是本地开发域名，改用 INTERCEPT 才会被抓包分析。`);
      }
    }
    return hints;
  }, [ruleRows]);

  const hasIntercept = ruleRows.some((r) => r.enabled && r.action === "INTERCEPT" && r.pattern.trim());

  const renderRuleRow = (r: TrafficRule, i: number) => (
    <div className="ta-rule-row" key={i}>
      <input
        className="hdr-kv-key"
        placeholder="域名 / URL / PROCESS:xxx"
        value={r.pattern}
        onChange={(e) => updateRule(i, { pattern: e.target.value })}
      />
      <select
        className="ta-select"
        value={r.action}
        onChange={(e) => updateRule(i, { action: e.target.value as VProxyAction })}
      >
        {ACTIONS.map((a) => (
          <option key={a} value={a}>{a}</option>
        ))}
      </select>
      {r.action === "MAP" && (
        <input
          className="hdr-kv-value"
          placeholder="file:///path 或 https://target"
          value={r.target ?? ""}
          onChange={(e) => updateRule(i, { target: e.target.value })}
        />
      )}
      <label className="ta-enabled" title="启用此规则">
        <input
          type="checkbox"
          checked={r.enabled}
          onChange={(e) => updateRule(i, { enabled: e.target.checked })}
        />
        启用
      </label>
      <button className="popup-kv-del" onClick={() => removeRule(i)} title="删除">×</button>
    </div>
  );

  const renderTraceRow = (t: VProxyTrace) => {
    const id = t.id ?? `${t.host ?? ""}-${t.timestamp ?? ""}-${t.method ?? ""}`;
    const expanded = expandedId === id;
    const reqPairs = kvPairs(t.req_headers);
    const respPairs = kvPairs(t.resp_headers);
    return (
      <div key={id} className={`ta-trace-row ${expanded ? "expanded" : ""}`}>
        <div className="ta-trace-head" onClick={() => setExpandedId(expanded ? null : id)}>
          <span className="ta-trace-cell method">{t.method ?? "-"}</span>
          <span className="ta-trace-cell host">{t.host ?? "-"}</span>
          <span className="ta-trace-cell path" title={t.path}>{t.path ?? "-"}</span>
          <span className={statusClass(t.status_code)}>{t.status_code ?? "-"}</span>
          <span className="ta-trace-cell lat">{formatLatency(t.latency_ms)}</span>
          <span className="ta-trace-cell time">
            {t.timestamp ? new Date(t.timestamp).toLocaleTimeString() : "-"}
          </span>
        </div>
        {expanded && (
          <div className="ta-trace-detail">
            <div className="ta-detail-grid">
              <div>
                <div className="ta-detail-title">Request Headers</div>
                {reqPairs.length === 0 ? <p className="card-desc">-</p> : (
                  <table className="ta-kv-table">
                    <tbody>
                      {reqPairs.map(([k, v]) => (
                        <tr key={k}>
                          <td className="ta-kv-key">{k}</td>
                          <td className="ta-kv-val">{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div>
                <div className="ta-detail-title">Response Headers</div>
                {respPairs.length === 0 ? <p className="card-desc">-</p> : (
                  <table className="ta-kv-table">
                    <tbody>
                      {respPairs.map(([k, v]) => (
                        <tr key={k}>
                          <td className="ta-kv-key">{k}</td>
                          <td className="ta-kv-val">{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            {t.req_body ? (
              <div>
                <div className="ta-detail-title">Request Body</div>
                <pre className="ta-body">
                  {bodyTruncated(t.req_body, fullBodyId === `req-${id}`)}
                  {t.req_body.length > BODY_TRUNCATE && (
                    <button
                      className="install-cta-btn secondary"
                      style={{ marginTop: "0.4rem" }}
                      onClick={() => setFullBodyId(fullBodyId === `req-${id}` ? null : `req-${id}`)}
                    >
                      {fullBodyId === `req-${id}` ? "收起 Body" : "显示完整 Body"}
                    </button>
                  )}
                </pre>
              </div>
            ) : null}
            {t.resp_body ? (
              <div>
                <div className="ta-detail-title">Response Body</div>
                <pre className="ta-body">
                  {bodyTruncated(t.resp_body, fullBodyId === `resp-${id}`)}
                  {t.resp_body.length > BODY_TRUNCATE && (
                    <button
                      className="install-cta-btn secondary"
                      style={{ marginTop: "0.4rem" }}
                      onClick={() => setFullBodyId(fullBodyId === `resp-${id}` ? null : `resp-${id}`)}
                    >
                      {fullBodyId === `resp-${id}` ? "收起 Body" : "显示完整 Body"}
                    </button>
                  )}
                </pre>
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="ta-container">
      <section className="panel-card">
        <div className="card-header">
          <h2 className="card-title">流量分析</h2>
          <label className="ta-switch" title={config.enabled ? "关闭流量分析并恢复原代理" : "开启流量分析（Chrome 代理切换到 vproxy :8118）"}>
            <input
              type="checkbox"
              checked={config.enabled}
              disabled={busy}
              onChange={(e) => toggleEnabled(e.target.checked)}
            />
            <span className="ta-switch-track" />
            <span className="ta-switch-label">{busy ? "处理中…" : config.enabled ? "已开启 · vproxy :8118" : "已关闭"}</span>
          </label>
        </div>
        <p className="card-desc">
          开启后 Chrome 代理将切换到本地 vproxy HTTP 端口 <code className="inline-code">127.0.0.1:8118</code>，
          按下方规则分流：<b>PROXY</b> 走上游代理、<b>INTERCEPT</b> 深度抓包（HTTPS 需信任 CA 证书）、
          <b> MAP</b> 映射到本地/远程文件。关闭后自动恢复原代理配置。
        </p>
        {message && <div className="ta-flash">{message}</div>}
        {error && <div className="ta-flash error">{error}</div>}

        <nav className="ta-subtabs">
          <button
            className={`ta-subtab ${subTab === "rules" ? "active" : ""}`}
            onClick={() => setSubTab("rules")}
          >
            规则
          </button>
          <button
            className={`ta-subtab ${subTab === "capture" ? "active" : ""}`}
            onClick={() => setSubTab("capture")}
          >
            抓包
          </button>
        </nav>

        {subTab === "rules" && (
          <div className="ta-rules-page">
            <div className="ta-section">
              <div className="ta-section-title">Upstreams（上游代理）</div>
              {upstreamRows.map((u, i) => (
                <div className="hdr-kv-row" key={i}>
                  <input
                    className="hdr-kv-key"
                    placeholder="socks5://192.168.50.31:1080 或 http://127.0.0.1:8080"
                    value={u}
                    onChange={(e) => updateUpstream(i, e.target.value)}
                  />
                  <button className="popup-kv-del" onClick={() => removeUpstream(i)} title="删除">×</button>
                </div>
              ))}
              <button className="add-kv-btn" onClick={addUpstream}>+ 添加上游</button>
            </div>

            <div className="ta-section">
              <div className="ta-section-title">
                站点规则
                <span className="ta-hint-inline">含 `/` 按 URL 处理；`PROCESS:xxx` 按进程名处理；其余按域名</span>
              </div>
              {ruleRows.map(renderRuleRow)}
              <button className="add-kv-btn" onClick={addRule}>+ 添加规则</button>
              <div className="ta-section-title" style={{ marginTop: "0.9rem" }}>FINAL 兜底动作</div>
              <select
                className="ta-select"
                value={config.finalAction}
                onChange={(e) => setConfig((c) => ({ ...c, finalAction: e.target.value as "DIRECT" | "PROXY" }))}
              >
                <option value="PROXY">PROXY（默认走代理）</option>
                <option value="DIRECT">DIRECT（默认直连）</option>
              </select>
            </div>

            {devHints.length > 0 && (
              <div className="ta-hint">
                {devHints.map((h, i) => (
                  <div key={i}>💡 {h}</div>
                ))}
              </div>
            )}
            {hasIntercept && (
              <div className="ta-hint">
                ⚠️ INTERCEPT 规则会解密 HTTPS 流量，请先在浏览器信任 CA 证书
                <code className="inline-code">{VPROXY_CA_PATH}</code>
                （系统「证书」设置中导入为受信任的根证书）。
              </div>
            )}

            <div className="hdr-actions">
              <button className="save-btn" onClick={save}>保存</button>
              <button className="install-cta-btn secondary" onClick={() => setSubTab("capture")}>
                查看抓包
              </button>
            </div>
          </div>
        )}

        {subTab === "capture" && (
          <div className="ta-capture-page">
            <div className="ta-toolbar">
              <button className="install-cta-btn secondary" onClick={loadTraces}>刷新</button>
              <label className="ta-enabled">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                />
                自动刷新 (3s)
              </label>
              <button className="clear-btn" onClick={clearTraces}>清空</button>
            </div>
            <p className="card-desc">
              仅 <b>INTERCEPT</b> / <b>MAP</b> 命中域名会产生完整抓包记录；普通 PROXY/DIRECT 仅透传、无记录。
            </p>
            {traces.length === 0 ? (
              <div className="ta-empty">
                <p>暂无抓包记录</p>
                <p className="card-desc">
                  将需要分析的域名配置为 <b>INTERCEPT</b> 并开启流量分析，然后刷新页面触发请求。
                </p>
              </div>
            ) : (
              <div className="ta-trace-list">
                <div className="ta-trace-head ta-trace-head-sticky">
                  <span className="ta-trace-cell method">Method</span>
                  <span className="ta-trace-cell host">Host</span>
                  <span className="ta-trace-cell path">Path</span>
                  <span className="ta-trace-cell">Status</span>
                  <span className="ta-trace-cell lat">Latency</span>
                  <span className="ta-trace-cell time">Time</span>
                </div>
                {traces.map(renderTraceRow)}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
