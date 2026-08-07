import { useEffect, useState } from "react";

declare const chrome: any;

/** One-shot fetch message to background with response. */
export function sendMessage<T = any>(message: any): Promise<T> {
  return new Promise<T>((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response: T) => {
        resolve(response);
      });
    } catch {
      resolve(undefined as T);
    }
  });
}

export interface WorkspaceEvent {
  type: string;
  [key: string]: any;
}

/**
 * Unified event bus for the Side Panel workspace. Every tab subscribes to the
 * same background broadcasts (JOB_STATUS, NOTIFY_PUSH, SITE_RULES_UPDATED,
 * CONNECTION_STATUS, AGENT_STREAM, AGENT_DONE) without polling.
 */
export function useWorkspaceEvents(): WorkspaceEvent[] {
  const [events, setEvents] = useState<WorkspaceEvent[]>([]);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
      return;
    }
    const listener = (message: any) => {
      if (message && message.type) {
        setEvents((prev) => [...prev.slice(-99), message]);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  return events;
}

/** Subscribe to a specific event type, returning the latest payload. */
export function useLatestEvent(type: string): any | null {
  const [latest, setLatest] = useState<any>(null);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
      return;
    }
    const listener = (message: any) => {
      if (message && message.type === type) {
        setLatest(message);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [type]);

  return latest;
}

export function clearBadge(): void {
  try {
    chrome.action?.setBadgeText({ text: "" });
  } catch {
    /* popup/web context */
  }
}
