import { useState, useEffect } from "react";

declare const chrome: any;

interface EventItem {
  id: string;
  severity: string;
  message: string;
  symbol?: string;
  price?: number;
  changePct?: number;
  alertLevel?: string;
  ts: number;
}

interface TasksPanelProps {
  isExtension: boolean;
}

export default function TasksPanel({ isExtension }: TasksPanelProps) {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [notifyEnabled, setNotifyEnabled] = useState(true);

  // Load persisted events + notification preference.
  useEffect(() => {
    if (!isExtension || typeof chrome === "undefined") return;
    chrome.runtime.sendMessage({ type: "GET_EVENTS" }, (res: any) => {
      if (res?.events) setEvents(res.events.slice(-100));
    });
    chrome.storage.local.get(["notify_enabled"], (res: any) => {
      setNotifyEnabled(res.notify_enabled !== false);
    });
    // Panel is open: clear the badge as unread notifications were surfaced.
    try {
      chrome.action?.setBadgeText({ text: "" });
    } catch { /* not in action context */ }
  }, [isExtension]);

  // Live event stream from background broadcast.
  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) return;
    const listener = (msg: any) => {
      if (msg.type === "NOTIFY_PUSH" && msg.payload) {
        setEvents((prev) => [msg.payload, ...prev].slice(0, 100));
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const toggleNotify = () => {
    const next = !notifyEnabled;
    setNotifyEnabled(next);
    if (isExtension && typeof chrome !== "undefined") {
      chrome.runtime.sendMessage({ type: "NOTIFY_TOGGLE", enabled: next });
    }
  };

  const severityLabel = (s: string) => {
    switch (s) {
      case "error": return "ERR";
      case "warning": return "WRN";
      case "success": return "OK";
      default: return "INF";
    }
  };

  return (
    <div className="tasks-panel">
      <section className="panel-card">
        <div className="card-header">
          <h2 className="card-title">通知中心</h2>
          <label className="notify-toggle">
            <input type="checkbox" checked={notifyEnabled} onChange={toggleNotify} />
            角标提醒
          </label>
        </div>
        <div className="console-logs">
          {events.length === 0 ? (
            <div className="no-logs">
              <svg className="no-logs-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span>暂无通知</span>
            </div>
          ) : (
            events.map((ev) => (
              <div key={ev.id} className="log-row">
                <span className="log-time">{new Date(ev.ts).toLocaleTimeString()}</span>
                <span className={`log-badge log-badge-${ev.severity}`}>{severityLabel(ev.severity)}</span>
                <span className="log-message">
                  {ev.symbol ? `[${ev.symbol}${ev.changePct !== undefined ? ` ${ev.changePct > 0 ? "+" : ""}${ev.changePct}%` : ""}] ` : ""}
                  {ev.message}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
