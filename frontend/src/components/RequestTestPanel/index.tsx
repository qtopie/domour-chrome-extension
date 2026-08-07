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
import { useI18n } from "../../i18n/I18nProvider";

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
  const { t } = useI18n();
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
        setError(err ?? t("rt.sendFailed"));
      }
    };
    if (!isExtension || typeof chrome === "undefined") {
      runRequestTest(composer)
        .then((r) => finish(r))
        .catch((e: any) => finish(null, e?.message ?? String(e)));
      return;
    }
    sendMessage<any>({ type: "TEST_REQUEST", composer }, (res) =>
      finish(res, res?.error ?? t("rt.sendFailed"))
    );
  };

  const contentType = result?.headers.find(([k]) => k.toLowerCase() === "content-type")?.[1];

  return (
    <div className="rt-panel">
      <div className="card-header">
        <h2 className="card-title">{t("rt.title")}</h2>
        <button className="chat-send-btn" onClick={send} disabled={sending}>
          {sending ? t("common.sending") : t("common.send")}
        </button>
      </div>
      <p className="card-desc">
        {t("rt.descPrefix")}
        <code className="inline-code">&lt;all_urls&gt;</code>
        {t("rt.descSuffix")}
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

      <div className="rt-section-title">{t("rt.headers")}</div>
      <div className="hdr-kv-rows">
        {composer.headers.map((h, i) => (
          <div key={i} className="hdr-kv-row">
            <input
              className="hdr-kv-key"
              placeholder={t("rt.keyPlaceholder")}
              value={h.key}
              onChange={(e) => updateHeader(i, { key: e.target.value })}
            />
            <span className="hdr-kv-sep">:</span>
            <input
              className="hdr-kv-value"
              placeholder={t("rt.valuePlaceholder")}
              value={h.value}
              onChange={(e) => updateHeader(i, { value: e.target.value })}
            />
            <button className="clear-btn" onClick={() => removeHeader(i)} title={t("headers.deleteRowTitle")}>✕</button>
          </div>
        ))}
        <button className="add-kv-btn" onClick={addHeader}>{t("headers.addHeader")}</button>
      </div>

      {supportsBody(composer.method) && (
        <>
          <div className="rt-section-title">{t("rt.body")}</div>
          <textarea
            className="rt-body-input"
            placeholder={t("rt.bodyPlaceholder")}
            value={composer.body}
            onChange={(e) => setComposer((c) => ({ ...c, body: e.target.value }))}
          />
        </>
      )}

      {error && <div className="rule-message rule-message-error">{error}</div>}

      <div className="rt-response">
        {!result && !error && !sending && (
          <div className="no-logs"><span>{t("rt.noResult")}</span></div>
        )}
        {sending && <div className="no-logs"><span>{t("rt.sending")}</span></div>}
        {result && (
          <div className="rt-response-body">
            <div className="rt-status-line">
              <span className={`rt-status ${statusClass(result.status)}`}>
                {result.status === 0 ? t("rt.error") : `${result.status} ${result.statusText}`}
              </span>
              <span className="rt-latency">{result.latencyMs}ms</span>
              <span className="rt-final-url" title={result.finalUrl}>{result.finalUrl}</span>
            </div>
            {result.error && (
              <div className="rule-message rule-message-error">{result.error}</div>
            )}

            <div className="ta-detail-title">{t("rt.responseHeaders")}</div>
            {result.headers.length === 0 ? (
              <div className="no-logs"><span>{t("common.empty")}</span></div>
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

            <div className="ta-detail-title" style={{ marginTop: "0.6rem" }}>{t("rt.responseBody")}</div>
            {result.truncated && (
              <p className="card-desc">{t("rt.bodyTruncated")}</p>
            )}
            <pre className="ta-body">{formatBodyForDisplay(result.body, contentType)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
