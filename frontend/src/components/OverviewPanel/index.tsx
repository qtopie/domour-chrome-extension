import { useState } from "react";
import TasksPanel from "../TasksPanel";

declare const chrome: any;

interface OverviewPanelProps {
  token: string;
  isConnected: boolean;
  bridgeStatus: string;
  isExtension: boolean;
  onRegenerateToken: () => void;
  onReconnect: () => void;
}

export default function OverviewPanel({
  token,
  isConnected,
  bridgeStatus,
  isExtension,
  onRegenerateToken,
  onReconnect,
}: OverviewPanelProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(token).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

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
          <h2 className="card-title">Access Token</h2>
          <button onClick={onRegenerateToken} className="regenerate-btn">
            Regenerate
          </button>
        </div>
        <div className="token-box">
          <code className="token-code">{token}</code>
          <button
            onClick={copyToClipboard}
            className={`copy-btn ${copied ? "copied" : ""}`}
            title="Copy token"
          >
            {copied ? (
              <svg className="svg-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="svg-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
            )}
          </button>
        </div>
        <p className="card-desc">
          外部任务请求需携带此 token 认证；未授权的任务将被即时删除。
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
