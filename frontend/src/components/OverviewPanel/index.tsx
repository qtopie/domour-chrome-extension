import TasksPanel from "../TasksPanel";
import { useI18n } from "../../i18n/I18nProvider";

interface OverviewPanelProps {
  isConnected: boolean;
  bridgeStatus: string;
  isExtension: boolean;
  onReconnect: () => void;
}

export default function OverviewPanel({
  isConnected,
  bridgeStatus,
  isExtension,
  onReconnect,
}: OverviewPanelProps) {
  const { t } = useI18n();
  return (
    <div className="overview-panel">
      <section className="panel-card">
        <div className="card-header">
          <h2 className="card-title">{t("overview.title")}</h2>
          <span className={`status-dot ${isConnected ? "active" : "offline"}`} />
        </div>
        <p className="card-desc">
          {t("overview.desc")}
        </p>
      </section>

      <section className="panel-card">
        <div className="card-header">
          <h2 className="card-title">{t("overview.bridgeStatus")}</h2>
          <button onClick={onReconnect} className="sync-btn">
            {t("overview.retry")}
          </button>
        </div>
        <p className="card-desc">
          <span className={`status-dot ${isConnected ? "active" : "offline"}`} />
          {" "}{isConnected ? t("common.active") : bridgeStatus === "NOT_INSTALLED" ? t("overview.bridgeNotInstalled") : t("common.offline")}
        </p>
      </section>

      {/* 通知中心 — merged from Tasks tab */}
      <TasksPanel isExtension={isExtension} />
    </div>
  );
}
