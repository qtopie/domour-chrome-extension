import { useState, useEffect } from "react";
import type { RequestHeadersConfig, HeaderKV } from "../../types/requestHeaders";
import { createEmptyRequestHeaders, validateHeader } from "../../types/requestHeaders";

declare const chrome: any;

interface RequestHeadersManagerProps {
  isExtension: boolean;
}

const EMPTY_KV: HeaderKV = { key: "", value: "" };

export default function RequestHeadersManager({ isExtension }: RequestHeadersManagerProps) {
  const [config, setConfig] = useState<RequestHeadersConfig>(createEmptyRequestHeaders);
  const [globalRows, setGlobalRows] = useState<HeaderKV[]>([{ ...EMPTY_KV }]);
  const [hostInput, setHostInput] = useState("");
  const [hostRows, setHostRows] = useState<Record<string, HeaderKV[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isExtension || typeof chrome === "undefined") return;
    chrome.runtime.sendMessage({ type: "GET_REQUEST_HEADERS" }, (res: any) => {
      if (res && res.config) {
        const cfg = res.config as RequestHeadersConfig;
        setConfig(cfg);
        setGlobalRows(cfg.global?.headers?.length ? cfg.global.headers.map((h) => ({ ...h })) : [{ ...EMPTY_KV }]);
        const rows: Record<string, HeaderKV[]> = {};
        for (const [host, rule] of Object.entries(cfg.perHost ?? {})) {
          rows[host] = rule.headers?.length ? rule.headers.map((h) => ({ ...h })) : [{ ...EMPTY_KV }];
        }
        setHostRows(rows);
      }
    });
    chrome.runtime.onMessage.addListener((msg: any) => {
      if (msg.type === "REQUEST_HEADERS_UPDATED" && msg.config) {
        const cfg = msg.config as RequestHeadersConfig;
        setConfig(cfg);
      }
    });
  }, [isExtension]);

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 2000);
  };

  const updateGlobalRow = (i: number, patch: Partial<HeaderKV>) => {
    setGlobalRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const updateHostRow = (host: string, i: number, patch: Partial<HeaderKV>) => {
    setHostRows((rows) => ({
      ...rows,
      [host]: (rows[host] ?? []).map((r, idx) => (idx === i ? { ...r, ...patch } : r))
    }));
  };

  const addGlobalRow = () => setGlobalRows((rows) => [...rows, { ...EMPTY_KV }]);
  const addHostRow = (host: string) =>
    setHostRows((rows) => ({ ...rows, [host]: [...(rows[host] ?? []), { ...EMPTY_KV }] }));

  const removeGlobalRow = (i: number) => {
    setGlobalRows((rows) => rows.filter((_, idx) => idx !== i));
  };

  const removeHostRow = (host: string, i: number) => {
    setHostRows((rows) => ({
      ...rows,
      [host]: (rows[host] ?? []).filter((_, idx) => idx !== i)
    }));
  };

  const addHost = () => {
    const host = hostInput.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!host) return;
    setHostInput("");
    setHostRows((rows) => (rows[host] ? rows : { ...rows, [host]: [{ ...EMPTY_KV }] }));
  };

  const removeHost = (host: string) => {
    setHostRows((rows) => {
      const next = { ...rows };
      delete next[host];
      return next;
    });
  };

  const save = () => {
    const clean = (rows: HeaderKV[]): HeaderKV[] =>
      rows
        .map((r) => ({ key: r.key.trim(), value: r.value }))
        .filter((r) => r.key.length > 0);

    const globalHeaders = clean(globalRows);
    for (const h of globalHeaders) {
      const err = validateHeader(h);
      if (err) {
        setError(err);
        return;
      }
    }

    const perHost: Record<string, { host: string; headers: HeaderKV[]; enabled: boolean }> = {};
    for (const [host, rows] of Object.entries(hostRows)) {
      const headers = clean(rows);
      for (const h of headers) {
        const err = validateHeader(h);
        if (err) {
          setError(`${host}: ${err}`);
          return;
        }
      }
      perHost[host] = { host, headers, enabled: true };
    }
    setError(null);

    if (!isExtension || typeof chrome === "undefined") {
      setConfig((c) => ({ ...c, global: { ...c.global, headers: globalHeaders }, perHost }));
      flash("已保存（本地预览）");
      return;
    }
    chrome.runtime.sendMessage(
      { type: "SAVE_REQUEST_HEADERS", globalHeaders, globalEnabled: config.global?.enabled !== false, perHost },
      (res: any) => {
        if (res && res.success) {
          setConfig(res.config);
          flash("已保存并应用");
        } else {
          setError(res?.error ?? "保存失败");
        }
      }
    );
  };

  const toggleGlobal = () => {
    const enabled = !(config.global?.enabled !== false);
    if (!isExtension || typeof chrome === "undefined") {
      setConfig((c) => ({ ...c, global: { ...c.global, enabled } }));
      return;
    }
    chrome.runtime.sendMessage({ type: "TOGGLE_REQUEST_HEADERS", enabled }, (res: any) => {
      if (res && res.success) setConfig(res.config);
    });
  };

  const renderRows = (
    rows: HeaderKV[],
    onUpdate: (i: number, patch: Partial<HeaderKV>) => void,
    onRemove: (i: number) => void,
    onAdd: () => void
  ) => (
    <div className="hdr-kv-rows">
      {rows.map((r, i) => (
        <div key={i} className="hdr-kv-row">
          <input
            className="hdr-kv-key"
            placeholder="Header 名，如 X-Gray-Canal"
            value={r.key}
            onChange={(e) => onUpdate(i, { key: e.target.value })}
          />
          <span className="hdr-kv-sep">:</span>
          <input
            className="hdr-kv-value"
            placeholder="值，如 canary-1"
            value={r.value}
            onChange={(e) => onUpdate(i, { value: e.target.value })}
          />
          <button className="clear-btn" onClick={() => onRemove(i)} title="删除此行">
            ✕
          </button>
        </div>
      ))}
      <button className="add-kv-btn" onClick={onAdd}>+ 添加 Header</button>
    </div>
  );

  const hosts = Object.keys(hostRows).sort();

  return (
    <section className="panel-card">
      <h2 className="card-title">请求头</h2>
      <p className="card-desc">
        为请求注入自定义 HTTP Header，用于调用链追踪与灰度测试。全局默认对所有匹配请求生效；
        按域名覆盖优先（最长后缀匹配）。通过 MV3 declarativeNetRequest 声明式实现，不阻塞网络。
      </p>

      {message && <div className="rule-message">{message}</div>}
      {error && <div className="rule-message rule-message-error">{error}</div>}

      <div className="site-rule-row site-rule-global">
        <div className="site-rule-host">
          全局默认
          <label className="hdr-toggle-label" title="启用全局默认头">
            <input type="checkbox" checked={config.global?.enabled !== false} onChange={toggleGlobal} /> 启用
          </label>
        </div>
        {renderRows(globalRows, updateGlobalRow, removeGlobalRow, addGlobalRow)}
      </div>

      <div className="chat-input-row" style={{ marginTop: "0.75rem" }}>
        <input
          className="chat-input"
          placeholder="按域名覆盖，例如 example.com"
          value={hostInput}
          onChange={(e) => setHostInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addHost()}
        />
        <button onClick={addHost} className="chat-send-btn">添加域名</button>
      </div>

      {hosts.length === 0 ? (
        <div className="no-logs"><span>尚未配置按域名覆盖的 Header</span></div>
      ) : (
        hosts.map((host) => (
          <div key={host} className="site-rule-row">
            <div className="site-rule-host">
              {host}
              <button onClick={() => removeHost(host)} className="clear-btn" style={{ marginLeft: "0.5rem" }}>
                删除
              </button>
            </div>
            {renderRows(hostRows[host], (i, p) => updateHostRow(host, i, p), (i) => removeHostRow(host, i), () => addHostRow(host))}
          </div>
        ))
      )}

      <div className="hdr-actions">
        <button onClick={save} className="chat-send-btn">保存并应用</button>
      </div>
      <p className="card-desc" style={{ marginTop: "0.5rem", fontSize: "0.72rem" }}>
        提示：浏览器保留的标准头（Cookie、Host、Content-Length 等）无法修改，建议使用 X- 前缀自定义头。
      </p>
    </section>
  );
}
