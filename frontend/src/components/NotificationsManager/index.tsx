import { useState, useEffect } from "react";
import { sendMessage } from "../../utils/sendMessage";
import { useI18n } from "../../i18n/I18nProvider";

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

interface NotificationsManagerProps {
  isExtension: boolean;
}

export default function NotificationsManager({ isExtension }: NotificationsManagerProps) {
  const { t } = useI18n();
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const [events, setEvents] = useState<EventItem[]>([]);

  useEffect(() => {
    if (!isExtension || typeof chrome === "undefined") return;
    chrome.storage.local.get(["notify_enabled"], (res: any) => {
      setNotifyEnabled(res.notify_enabled !== false);
    });
    sendMessage<any>({ type: "GET_EVENTS" }, (res) => {
      if (res?.events) setEvents(res.events.slice(-50));
    });
  }, [isExtension]);

  const toggleNotify = () => {
    const next = !notifyEnabled;
    setNotifyEnabled(next);
    if (isExtension && typeof chrome !== "undefined") {
      sendMessage({ type: "NOTIFY_TOGGLE", enabled: next });
    }
  };

  const clearEvents = () => {
    setEvents([]);
    if (isExtension && typeof chrome !== "undefined") {
      chrome.storage.local.set({ events: [] });
      try {
        chrome.action?.setBadgeText({ text: "" });
      } catch { /* not in action context */ }
    }
  };

  return (
    <section className="panel-card">
      <div className="card-header">
        <h2 className="card-title">{t("notifications.title")}</h2>
        <label className="notify-toggle">
          <input type="checkbox" checked={notifyEnabled} onChange={toggleNotify} />
          {t("notifications.badge")}
        </label>
      </div>
      <p className="card-desc">
        {t("notifications.desc")}
      </p>

      <div className="card-header">
        <h2 className="card-title">{t("notifications.recent")}</h2>
        <button onClick={clearEvents} className="clear-btn">{t("common.clear")}</button>
      </div>
      <div className="console-logs">
        {events.length === 0 ? (
          <div className="no-logs"><span>{t("notifications.noEvents")}</span></div>
        ) : (
          events.map((ev) => (
            <div key={ev.id} className="log-row">
              <span className="log-time">{new Date(ev.ts).toLocaleTimeString()}</span>
              <span className={`log-badge log-badge-${ev.severity}`}>{ev.severity.toUpperCase().slice(0, 3)}</span>
              <span className="log-message">{ev.symbol ? `[${ev.symbol}] ` : ""}{ev.message}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
