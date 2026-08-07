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
import { useI18n } from "../../i18n/I18nProvider";

declare const chrome: any;

interface TrafficAnalysisManagerProps {
  isExtension: boolean;
}

const ACTIONS: VProxyAction[] = ["DIRECT", "PROXY", "INTERCEPT", "MAP"];
const EMPTY_RULE: TrafficRule = { pattern: "", action: "PROXY", enabled: true };
const VPROXY_CA_PATH = "/tmp/vproxy-ca.crt";

export default function TrafficAnalysisManager({ isExtension }: TrafficAnalysisManagerProps) {
  const { t } = useI18n();
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
        setError(res?.error ?? t("ta.fetchFailed"));
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
      const val = u.trim();
      if (val && !/^(socks5?|http|https):\/\//i.test(val)) return t("ta.invalidUpstream", { u: val });
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
      flash(t("ta.savedPreview"));
      return;
    }
    sendMessage<any>({ type: "SAVE_TRAFFIC_ANALYSIS", config: next }, (res) => {
      if (res && res.success) {
        setConfig(res.config);
        flash(
          res.syncError
            ? t("ta.savedSyncFailed", { err: res.syncError })
            : next.enabled
              ? t("ta.savedSyncedVproxy")
              : t("ta.savedSynced")
        );
      } else {
        setError(res?.error ?? t("ta.saveFailed"));
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
        flash(next ? t("ta.toggleOn") : t("ta.toggleOff"));
      } else {
        setError(res?.error ?? t("ta.toggleFailed"));
      }
    });
  };

  const clearTraces = () => {
    if (typeof chrome === "undefined") return;
    sendMessage<any>({ type: "CLEAR_VPROXY_TRACES" }, (res) => {
      if (res && res.success) {
        setTraces([]);
        flash(t("ta.cleared"));
      } else {
        setError(res?.error ?? t("ta.clearFailed"));
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
        hints.push(t("ta.localDevHint", { pattern: r.pattern.trim() }));
      }
    }
    return hints;
  }, [ruleRows, t]);

  const hasIntercept = ruleRows.some((r) => r.enabled && r.action === "INTERCEPT" && r.pattern.trim());

  const renderRuleRow = (r: TrafficRule, i: number) => (
    <div className="ta-rule-row" key={i}>
      <input
        className="hdr-kv-key"
        placeholder={t("ta.rulePatternPlaceholder")}
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
          placeholder={t("ta.mapTargetPlaceholder")}
          value={r.target ?? ""}
          onChange={(e) => updateRule(i, { target: e.target.value })}
        />
      )}
      <label className="ta-enabled" title={t("ta.ruleEnabledTitle")}>
        <input
          type="checkbox"
          checked={r.enabled}
          onChange={(e) => updateRule(i, { enabled: e.target.checked })}
        />
        {t("common.enable")}
      </label>
      <button className="popup-kv-del" onClick={() => removeRule(i)} title={t("ta.delete")}>×</button>
    </div>
  );

  const renderTraceRow = (trace: VProxyTrace) => {
    const id = trace.id ?? `${trace.host ?? ""}-${trace.timestamp ?? ""}-${trace.method ?? ""}`;
    const expanded = expandedId === id;
    const reqPairs = kvPairs(trace.req_headers);
    const respPairs = kvPairs(trace.resp_headers);
    return (
      <div key={id} className={`ta-trace-row ${expanded ? "expanded" : ""}`}>
        <div className="ta-trace-head" onClick={() => setExpandedId(expanded ? null : id)}>
          <span className="ta-trace-cell method">{trace.method ?? "-"}</span>
          <span className="ta-trace-cell host">{trace.host ?? "-"}</span>
          <span className="ta-trace-cell path" title={trace.path}>{trace.path ?? "-"}</span>
          <span className={statusClass(trace.status_code)}>{trace.status_code ?? "-"}</span>
          <span className="ta-trace-cell lat">{formatLatency(trace.latency_ms)}</span>
          <span className="ta-trace-cell time">
            {trace.timestamp ? new Date(trace.timestamp).toLocaleTimeString() : "-"}
          </span>
        </div>
        {expanded && (
          <div className="ta-trace-detail">
            <div className="ta-detail-grid">
              <div>
                <div className="ta-detail-title">{t("ta.reqHeaders")}</div>
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
                <div className="ta-detail-title">{t("ta.respHeaders")}</div>
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
            {trace.req_body ? (
              <div>
                <div className="ta-detail-title">{t("ta.reqBody")}</div>
                <pre className="ta-body">
                  {bodyTruncated(trace.req_body, fullBodyId === `req-${id}`)}
                  {trace.req_body.length > BODY_TRUNCATE && (
                    <button
                      className="install-cta-btn secondary"
                      style={{ marginTop: "0.4rem" }}
                      onClick={() => setFullBodyId(fullBodyId === `req-${id}` ? null : `req-${id}`)}
                    >
                      {fullBodyId === `req-${id}` ? t("common.collapseBody") : t("common.showFullBody")}
                    </button>
                  )}
                </pre>
              </div>
            ) : null}
            {trace.resp_body ? (
              <div>
                <div className="ta-detail-title">{t("ta.respBody")}</div>
                <pre className="ta-body">
                  {bodyTruncated(trace.resp_body, fullBodyId === `resp-${id}`)}
                  {trace.resp_body.length > BODY_TRUNCATE && (
                    <button
                      className="install-cta-btn secondary"
                      style={{ marginTop: "0.4rem" }}
                      onClick={() => setFullBodyId(fullBodyId === `resp-${id}` ? null : `resp-${id}`)}
                    >
                      {fullBodyId === `resp-${id}` ? t("common.collapseBody") : t("common.showFullBody")}
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
          <h2 className="card-title">{t("ta.title")}</h2>
          <label className="ta-switch" title={config.enabled ? t("ta.switchOff") : t("ta.switchOn")}>
            <input
              type="checkbox"
              checked={config.enabled}
              disabled={busy}
              onChange={(e) => toggleEnabled(e.target.checked)}
            />
            <span className="ta-switch-track" />
            <span className="ta-switch-label">{busy ? t("ta.busy") : config.enabled ? t("ta.enabled") : t("ta.disabled")}</span>
          </label>
        </div>
        <p className="card-desc">
          {t("ta.desc", {
            port: "127.0.0.1:8118",
            proxy: "PROXY",
            intercept: "INTERCEPT",
            map: "MAP"
          })}
        </p>
        {message && <div className="ta-flash">{message}</div>}
        {error && <div className="ta-flash error">{error}</div>}

        <nav className="ta-subtabs">
          <button
            className={`ta-subtab ${subTab === "rules" ? "active" : ""}`}
            onClick={() => setSubTab("rules")}
          >
            {t("ta.tabRules")}
          </button>
          <button
            className={`ta-subtab ${subTab === "capture" ? "active" : ""}`}
            onClick={() => setSubTab("capture")}
          >
            {t("ta.tabTraces")}
          </button>
        </nav>

        {subTab === "rules" && (
          <div className="ta-rules-page">
            <div className="ta-section">
              <div className="ta-section-title">{t("ta.upstreams")}</div>
              {upstreamRows.map((u, i) => (
                <div className="hdr-kv-row" key={i}>
                  <input
                    className="hdr-kv-key"
                    placeholder={t("ta.upstreamPlaceholder")}
                    value={u}
                    onChange={(e) => updateUpstream(i, e.target.value)}
                  />
                  <button className="popup-kv-del" onClick={() => removeUpstream(i)} title={t("ta.delete")}>×</button>
                </div>
              ))}
              <button className="add-kv-btn" onClick={addUpstream}>{t("ta.addUpstream")}</button>
            </div>

            <div className="ta-section">
              <div className="ta-section-title">
                {t("ta.siteRules")}
                <span className="ta-hint-inline">{t("ta.ruleHint")}</span>
              </div>
              {ruleRows.map(renderRuleRow)}
              <button className="add-kv-btn" onClick={addRule}>{t("ta.addRule")}</button>
              <div className="ta-section-title" style={{ marginTop: "0.9rem" }}>{t("ta.finalAction")}</div>
              <select
                className="ta-select"
                value={config.finalAction}
                onChange={(e) => setConfig((c) => ({ ...c, finalAction: e.target.value as "DIRECT" | "PROXY" }))}
              >
                <option value="PROXY">{t("ta.finalProxy")}</option>
                <option value="DIRECT">{t("ta.finalDirect")}</option>
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
                {t("ta.caWarning")}
                <code className="inline-code">{VPROXY_CA_PATH}</code>
                {t("ta.caWarning2")}
              </div>
            )}

            <div className="hdr-actions">
              <button className="save-btn" onClick={save}>{t("ta.save")}</button>
              <button className="install-cta-btn secondary" onClick={() => setSubTab("capture")}>
                {t("ta.viewTraces")}
              </button>
            </div>
          </div>
        )}

        {subTab === "capture" && (
          <div className="ta-capture-page">
            <div className="ta-toolbar">
              <button className="install-cta-btn secondary" onClick={loadTraces}>{t("common.refresh")}</button>
              <label className="ta-enabled">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                />
                {t("ta.autoRefresh")}
              </label>
              <button className="clear-btn" onClick={clearTraces}>{t("ta.clear")}</button>
            </div>
            <p className="card-desc">
              {t("ta.traceHint", { intercept: "INTERCEPT", map: "MAP" })}
            </p>
            {traces.length === 0 ? (
              <div className="ta-empty">
                <p>{t("ta.noTraces")}</p>
                <p className="card-desc">
                  {t("ta.noTracesHint", { intercept: "INTERCEPT" })}
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
