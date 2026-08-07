import TasksPanel from "../TasksPanel";

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
  return (
    <div className="overview-panel">
      <section className="panel-card">
        <div className="card-header">
          <h2 className="card-title">工作区概览</h2>
          <span className={`status-dot ${isConnected ? "active" : "offline"}`} />
        </div>
        <p className="card-desc">
          在 Chat 中与 AI Agent 对话、下发任务；Logs 调试桥接日志。通知与任务进度展示如下；代理与规则配置请前往扩展设置页。
        </p>
      </section>

      <section className="panel-card">
        <div className="card-header">
          <h2 className="card-title">桥接状态</h2>
          <button onClick={onReconnect} className="sync-btn">
            重新连接
          </button>
        </div>
        <p className="card-desc">
          <span className={`status-dot ${isConnected ? "active" : "offline"}`} />
          {" "}{isConnected ? "ACTIVE" : bridgeStatus === "NOT_INSTALLED" ? "桥接未安装" : "OFFLINE"}
        </p>
      </section>

      {/* 通知中心 — merged from Tasks tab */}
      <TasksPanel isExtension={isExtension} />
    </div>
  );
}
