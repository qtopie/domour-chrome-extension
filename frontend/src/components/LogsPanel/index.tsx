import { useEffect, useRef } from "react";

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

interface LogsPanelProps {
  logs: LogEntry[];
  onClearLogs: () => void;
}

const getLogLevelLabel = (level: string) => {
  switch (level) {
    case "error": return "ERR";
    case "warning": return "WRN";
    case "system": return "SYS";
    case "heartbeat": return "HBT";
    case "job": return "JOB";
    default: return "INF";
  }
};

export default function LogsPanel({ logs, onClearLogs }: LogsPanelProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <section className="panel-card console-card">
      <div className="card-header">
        <h2 className="card-title">Live Logs</h2>
        <button onClick={onClearLogs} className="clear-btn">
          Clear Logs
        </button>
      </div>
      <div className="console-logs">
        {logs.length === 0 ? (
          <div className="no-logs">
            <svg className="no-logs-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>Waiting for system logs...</span>
          </div>
        ) : (
          logs.map((logEntry, index) => (
            <div key={index} className="log-row">
              <span className="log-time">{logEntry.timestamp}</span>
              <span className={`log-badge log-badge-${logEntry.level}`}>
                {getLogLevelLabel(logEntry.level)}
              </span>
              <span className="log-message">{logEntry.message}</span>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </section>
  );
}
