import type { LogEntry } from './types';

export function appendLog(level: string, message: string): void {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry: LogEntry = { timestamp, level, message };
  
  console.log(`[${level.toUpperCase()}] ${message}`);

  chrome.storage.local.get(["logs"], (res) => {
    const logs: LogEntry[] = (res.logs as LogEntry[]) || [];
    logs.push(logEntry);
    if (logs.length > 200) {
      logs.shift();
    }
    chrome.storage.local.set({ logs }, () => {
      chrome.runtime.sendMessage({ type: "NEW_LOG", log: logEntry }).catch(() => {
        // Ignore errors when panel is closed
      });
    });
  });
}

export function notifyPanelStatus(connected: boolean): void {
  chrome.runtime.sendMessage({ type: "CONNECTION_STATUS", connected }).catch(() => {
    // Ignore errors when panel is closed
  });
}
