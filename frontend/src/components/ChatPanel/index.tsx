import { useState, useEffect, useRef } from "react";

declare const chrome: any;

interface ChatMessage {
  jobId: string;
  role: "user" | "assistant";
  text: string;
  done?: boolean;
}

function isChatRole(value: string): value is ChatMessage["role"] {
  return value === "user" || value === "assistant";
}

interface ChatPanelProps {
  isExtension: boolean;
  onLogMessage?: (level: string, message: string) => void;
}

export default function ChatPanel({ isExtension, onLogMessage }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Load persisted history on mount.
  useEffect(() => {
    if (!isExtension || typeof chrome === "undefined") return;
    chrome.runtime.sendMessage({ type: "CHAT_HISTORY_GET" }, (res: any) => {
      const history: any[] = res?.history || [];
      const mapped = history.map((h): ChatMessage => ({
        jobId: h.jobId,
        role: isChatRole(h.role) ? h.role : "user",
        text: h.content || h.message || "",
        done: true,
      }));
      setMessages((prev) => [...mapped, ...prev].slice(-100));
    });
  }, [isExtension]);

  // Stream agent replies broadcast from background.
  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) return;
    const listener = (msg: any) => {
      if (msg.type === "AGENT_STREAM" && msg.jobId) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.jobId === msg.jobId && last.role === "assistant") {
            const updated = [...prev];
            updated[updated.length - 1] = { ...last, text: last.text + (msg.delta || "") };
            return updated;
          }
          return [...prev, { jobId: msg.jobId, role: "assistant", text: msg.delta || "" }];
        });
      } else if (msg.type === "AGENT_DONE" && msg.jobId) {
        setMessages((prev) => {
          const updated = [...prev];
          const idx = updated.map((m) => m.jobId).lastIndexOf(msg.jobId);
          if (idx >= 0) {
            updated[idx] = { ...updated[idx], done: true, text: updated[idx].text + (msg.result || "") };
          }
          return updated;
        });
        setSending(false);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // Auto-scroll to the newest message.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setError(null);
    const jobId = `chat_${Date.now()}`;
    if (isExtension && typeof chrome !== "undefined") {
      setSending(true);
      setMessages((prev) => [...prev, { jobId, role: "user", text, done: true }]);
      chrome.runtime.sendMessage({ type: "CHAT_SEND", jobId, message: text }, (res: any) => {
        if (res && res.success === false) {
          setSending(false);
          setError(res.error || "发送失败");
          onLogMessage?.("error", `Chat send failed: ${res.error}`);
        }
      });
    } else {
      // Mock reply for local web development.
      setMessages((prev) => [
        ...prev,
        { jobId, role: "user", text, done: true },
        { jobId, role: "assistant", text: `[mock] 已收到：${text}`, done: true },
      ]);
    }
  };

  return (
    <div className="chat-panel">
      <section className="panel-card chat-card">
        <div className="card-header">
          <h2 className="card-title">AI Agent 对话</h2>
          <button
            onClick={() => setMessages([])}
            className="clear-btn"
            title="清空本地视图"
          >
            Clear
          </button>
        </div>
        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="no-logs">
              <svg className="no-logs-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <span>向 Agent 描述你的任务…</span>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={`${m.jobId}-${i}`} className={`chat-msg chat-msg-${m.role}`}>
                <div className="chat-bubble">
                  <span className="chat-role">{m.role === "user" ? "你" : "Agent"}</span>
                  <span className="chat-text">{m.text}</span>
                  {!m.done && <span className="chat-cursor">▍</span>}
                </div>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>
        {error && <div className="chat-error">{error}</div>}
        <div className="chat-input-row">
          <input
            className="chat-input"
            placeholder="输入任务或问题，Enter 发送"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            disabled={sending}
          />
          <button onClick={send} className="chat-send-btn" disabled={sending}>
            发送
          </button>
        </div>
      </section>
    </div>
  );
}
