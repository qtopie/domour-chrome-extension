import { useState } from "react";
import { sendMessage } from "../../utils/sendMessage";
import type { RequestTestComposer, RequestTestResult } from "../../types/requestTest";
import {
  HTTP_METHODS,
  createEmptyRequestTest,
  formatBodyForDisplay,
  runRequestTest,
  supportsBody
} from "../../types/requestTest";
import type { HeaderKV } from "../../types/requestHeaders";

declare const chrome: any;

interface RequestTestPanelProps {
  isExtension: boolean;
}

const EMPTY_KV: HeaderKV = { key: "", value: "" };

function statusClass(status: number): string {
  if (status === 0) return "rt-status-err";
  if (status < 300) return "rt-status-ok";
  if (status < 400) return "rt-status-redirect";
  if (status < 500) return "rt-status-warn";
  return "rt-status-err";
}

export default function RequestTestPanel({ isExtension }: RequestTestPanelProps) {
  const [composer, setComposer] = useState<RequestTestComposer>(createEmptyRequestTest);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<RequestTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateHeader = (i: number, patch: Partial<HeaderKV>) => {
    setComposer((c) => ({
      ...c,
      headers: c.headers.map((h, idx) => (idx === i ? { ...h, ...patch } : h))
    }));
  };

  const addHeader = () =>
    setComposer((c) => ({ ...c, headers: [...c.headers, { ...EMPTY_KV }] }));

  const removeHeader = (i: number) =>
    setComposer((c) => ({
      ...c,
      headers: c.headers.length <= 1 ? [{ ...EMPTY_KV }] : c.headers.filter((_, idx) => idx !== i)
    }));

  const send = () => {
    if (sending) return;
    setSending(true);
    setError(null);
    const finish = (res: RequestTestResult | null | undefined, err?: string) => {
      setSending(false);
      if (res && typeof res === "object" && "ok" in res) {
        setResult(res as RequestTestResult);
      } else {
        setError(err ?? "请求失败（background 无响应）");
      }
    };
    if (!isExtension || typeof chrome === "undefined") {
      runRequestTest(composer)
        .then((r) => finish(r))
        .catch((e: any) => finish(null, e?.message ?? String(e)));
      return;
    }
    sendMessage<any>({ type: "TEST_REQUEST", composer }, (res) =>
      finish(res, res?.error ?? "请求失败（background 无响应）")
    );
  };

  const contentType = result?.headers.find(([k]) => k.toLowerCase() === "content-type")?.[1];

  return (
    <div className="rt-panel">
      <div className="card-header">
        <h2 className="card-title">请求测试</h2>
        <button className="chat-send-btn" onClick={send} disabled={sending}>
          {sending ? "发送中…" : "发送"}
        </button>
      </div>
      <p className="card-desc">
        Postman 式请求测试：请求由后台 service worker 发起（<code className="inline-code">&lt;all_urls&gt;</code>
        ，不受页面 CORS 限制）。若已开启流量分析，请求会经本地 vproxy，命中 INTERCEPT 规则即可同步抓包。
      </p>

      <div className="rt-composer-row">
        <select
          className="ta-select rt-method"
          value={composer.method}
          onChange={(e) => setComposer((c) => ({ ...c, method: e.target.value as RequestTestComposer["method"] }))}
        >
          {HTTP_METHODS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <input
          className="chat-input rt-url"
          placeholder="https://example.com/api/items"
          value={composer.url}
          onChange={(e) => setComposer((c) => ({ ...c, url: e.target.value }))}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
      </div>

      <div className="rt-section-title">请求头</div>
      <div className="hdr-kv-rows">
        {composer.headers.map((h, i) => (
          <div key={i} className="hdr-kv-row">
            <input
              className="hdr-kv-key"
              placeholder="Header 名，如 X-Trace"
              value={h.key}
              onChange={(e) => updateHeader(i, { key: e.target.value })}
            />
            <span className="hdr-kv-sep">:</span>
            <input
              className="hdr-kv-value"
              placeholder="值"
              value={h.value}
              onChange={(e) => updateHeader(i, { value: e.target.value })}
            />
            <button className="clear-btn" onClick={() => removeHeader(i)} title="删除此行">✕</button>
          </div>
        ))}
        <button className="add-kv-btn" onClick={addHeader}>+ 添加 Header</button>
      </div>

      {supportsBody(composer.method) && (
        <>
          <div className="rt-section-title">请求体</div>
          <textarea
            className="rt-body-input"
            placeholder='JSON 或纯文本，如 {"key":"value"}'
            value={composer.body}
            onChange={(e) => setComposer((c) => ({ ...c, body: e.target.value }))}
          />
        </>
      )}

      {error && <div className="rule-message rule-message-error">{error}</div>}

      <div className="rt-response">
        {!result && !error && !sending && (
          <div className="no-logs"><span>配置请求后点击「发送」，响应将在此展示</span></div>
        )}
        {sending && <div className="no-logs"><span>正在发送请求…</span></div>}
        {result && (
          <div className="rt-response-body">
            <div className="rt-status-line">
              <span className={`rt-status ${statusClass(result.status)}`}>
                {result.status === 0 ? "错误" : `${result.status} ${result.statusText}`}
              </span>
              <span className="rt-latency">{result.latencyMs}ms</span>
              <span className="rt-final-url" title={result.finalUrl}>{result.finalUrl}</span>
            </div>
            {result.error && (
              <div className="rule-message rule-message-error">{result.error}</div>
            )}

            <div className="ta-detail-title">响应头</div>
            {result.headers.length === 0 ? (
              <div className="no-logs"><span>（空）</span></div>
            ) : (
              <table className="ta-kv-table">
                <tbody>
                  {result.headers.map(([k, v]) => (
                    <tr key={k}>
                      <td className="ta-kv-key">{k}</td>
                      <td className="ta-kv-val">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="ta-detail-title" style={{ marginTop: "0.6rem" }}>响应体</div>
            {result.truncated && (
              <p className="card-desc">⚠️ 响应体过大，仅显示前 1MB（已截断）。</p>
            )}
            <pre className="ta-body">{formatBodyForDisplay(result.body, contentType)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
