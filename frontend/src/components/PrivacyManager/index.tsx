import { useChromeStorage } from "../../hooks/useChromeStorage";
import { useI18n } from "../../i18n/I18nProvider";

interface PrivacyManagerProps {
  isExtension?: boolean;
  onLogMessage?: (level: string, message: string) => void;
  layout?: "card" | "settings";
}

export default function PrivacyManager({
  onLogMessage,
  layout = "settings"
}: PrivacyManagerProps) {
  const { t } = useI18n();
  const [allowCookies, setAllowCookies] = useChromeStorage<boolean>(
    "allow_cookie_extraction",
    true
  );
  const [allowDebugger, setAllowDebugger] = useChromeStorage<boolean>(
    "allow_cdp_debugger",
    true
  );

  const handleToggleCookies = (enabled: boolean) => {
    setAllowCookies(enabled);
    onLogMessage?.(
      "system",
      `Cookie extraction permission ${enabled ? "ENABLED" : "DISABLED"} by user.`
    );
  };

  const handleToggleDebugger = (enabled: boolean) => {
    setAllowDebugger(enabled);
    onLogMessage?.(
      "system",
      `DevTools CDP debugging permission ${enabled ? "ENABLED" : "DISABLED"} by user.`
    );
  };

  if (layout === "card") {
    return (
      <div className="panel-card privacy-card">
        <div className="card-header">
          <h2 className="card-title">{t("pw.privacyTitle")}</h2>
        </div>

        {/* Cookie Extraction Toggle */}
        <div
          className="privacy-toggle-row"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "8px"
          }}
        >
          <div>
            <div
              style={{
                fontWeight: 600,
                fontSize: "13px",
                color: "var(--text-main, #f3f4f6)"
              }}
            >
              {t("pw.allowCookiesTitle")}
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "var(--text-muted, #9ca3af)",
                marginTop: "2px"
              }}
            >
              {t("pw.allowCookiesDesc")}
            </div>
          </div>
          <label
            style={{
              position: "relative",
              display: "inline-block",
              width: "40px",
              height: "22px",
              cursor: "pointer"
            }}
          >
            <input
              type="checkbox"
              checked={allowCookies}
              onChange={(e) => handleToggleCookies(e.target.checked)}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span
              style={{
                position: "absolute",
                cursor: "pointer",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: allowCookies ? "#10b981" : "#374151",
                borderRadius: "22px",
                transition: ".3s"
              }}
            >
              <span
                style={{
                  position: "absolute",
                  content: '""',
                  height: "16px",
                  width: "16px",
                  left: allowCookies ? "20px" : "3px",
                  bottom: "3px",
                  backgroundColor: "#ffffff",
                  borderRadius: "50%",
                  transition: ".3s"
                }}
              />
            </span>
          </label>
        </div>

        {/* DevTools CDP Traces Toggle */}
        <div
          className="privacy-toggle-row"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "12px",
            paddingTop: "10px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)"
          }}
        >
          <div>
            <div
              style={{
                fontWeight: 600,
                fontSize: "13px",
                color: "var(--text-main, #f3f4f6)"
              }}
            >
              {t("pw.allowDebuggerTitle")}
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "var(--text-muted, #9ca3af)",
                marginTop: "2px"
              }}
            >
              {t("pw.allowDebuggerDesc")}
            </div>
          </div>
          <label
            style={{
              position: "relative",
              display: "inline-block",
              width: "40px",
              height: "22px",
              cursor: "pointer"
            }}
          >
            <input
              type="checkbox"
              checked={allowDebugger}
              onChange={(e) => handleToggleDebugger(e.target.checked)}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span
              style={{
                position: "absolute",
                cursor: "pointer",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: allowDebugger ? "#10b981" : "#374151",
                borderRadius: "22px",
                transition: ".3s"
              }}
            >
              <span
                style={{
                  position: "absolute",
                  content: '""',
                  height: "16px",
                  width: "16px",
                  left: allowDebugger ? "20px" : "3px",
                  bottom: "3px",
                  backgroundColor: "#ffffff",
                  borderRadius: "50%",
                  transition: ".3s"
                }}
              />
            </span>
          </label>
        </div>
      </div>
    );
  }

  return (
    <section className="panel-card">
      <h2 className="card-title">{t("pw.privacyTitle")}</h2>
      <p className="card-desc" style={{ marginBottom: "0.5rem" }}>
        {t("pw.privacyDesc") ||
          "Control sensitive browser permissions granted to AI automation agents."}
      </p>

      {/* Cookie Extraction */}
      <div className="fluent-setting-item">
        <div className="fluent-setting-info">
          <div
            className="fluent-setting-icon"
            style={{
              background: allowCookies
                ? "rgba(16, 185, 129, 0.15)"
                : "rgba(156, 163, 175, 0.15)",
              color: allowCookies ? "#10b981" : "#9ca3af"
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" />
              <path d="M8.5 8.5v.01" />
              <path d="M16 15.5v.01" />
              <path d="M12 12v.01" />
              <path d="M11 17v.01" />
              <path d="M7 14v.01" />
            </svg>
          </div>
          <div className="fluent-setting-text">
            <span className="fluent-setting-title">
              {t("pw.allowCookiesTitle")}
            </span>
            <span className="fluent-setting-desc">
              {t("pw.allowCookiesDesc")}
            </span>
          </div>
        </div>
        <label
          style={{
            position: "relative",
            display: "inline-block",
            width: "44px",
            height: "24px",
            cursor: "pointer",
            flexShrink: 0
          }}
        >
          <input
            type="checkbox"
            checked={allowCookies}
            onChange={(e) => handleToggleCookies(e.target.checked)}
            style={{ opacity: 0, width: 0, height: 0 }}
          />
          <span
            style={{
              position: "absolute",
              cursor: "pointer",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: allowCookies ? "#10b981" : "#374151",
              borderRadius: "24px",
              transition: ".3s"
            }}
          >
            <span
              style={{
                position: "absolute",
                content: '""',
                height: "18px",
                width: "18px",
                left: allowCookies ? "23px" : "3px",
                bottom: "3px",
                backgroundColor: "#ffffff",
                borderRadius: "50%",
                transition: ".3s"
              }}
            />
          </span>
        </label>
      </div>

      {/* DevTools CDP Traces */}
      <div className="fluent-setting-item">
        <div className="fluent-setting-info">
          <div
            className="fluent-setting-icon"
            style={{
              background: allowDebugger
                ? "rgba(59, 130, 246, 0.15)"
                : "rgba(156, 163, 175, 0.15)",
              color: allowDebugger ? "#3b82f6" : "#9ca3af"
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
              <path d="m7 8 3 3-3 3" />
              <line x1="13" y1="14" x2="17" y2="14" />
            </svg>
          </div>
          <div className="fluent-setting-text">
            <span className="fluent-setting-title">
              {t("pw.allowDebuggerTitle")}
            </span>
            <span className="fluent-setting-desc">
              {t("pw.allowDebuggerDesc")}
            </span>
          </div>
        </div>
        <label
          style={{
            position: "relative",
            display: "inline-block",
            width: "44px",
            height: "24px",
            cursor: "pointer",
            flexShrink: 0
          }}
        >
          <input
            type="checkbox"
            checked={allowDebugger}
            onChange={(e) => handleToggleDebugger(e.target.checked)}
            style={{ opacity: 0, width: 0, height: 0 }}
          />
          <span
            style={{
              position: "absolute",
              cursor: "pointer",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: allowDebugger ? "#10b981" : "#374151",
              borderRadius: "24px",
              transition: ".3s"
            }}
          >
            <span
              style={{
                position: "absolute",
                content: '""',
                height: "18px",
                width: "18px",
                left: allowDebugger ? "23px" : "3px",
                bottom: "3px",
                backgroundColor: "#ffffff",
                borderRadius: "50%",
                transition: ".3s"
              }}
            />
          </span>
        </label>
      </div>
    </section>
  );
}
