import { useState } from "react";
import { useI18n } from "../i18n/I18nProvider";

interface NmhInstallBannerProps {
  onRetryConnect: () => void;
}

type InstallPath = null | "cosmos" | "manual";

export default function NmhInstallBanner({ onRetryConnect }: NmhInstallBannerProps) {
  const { t } = useI18n();
  const [activePath, setActivePath] = useState<InstallPath>(null);

  const COSMOS_RELEASES_URL = "https://github.com/qtopie/cosmos-assistant/releases/latest";
  const BINARY_RELEASES_URL = "https://github.com/qtopie/domour-chrome-extension/releases/latest";

  const openLink = (url: string) => {
    if (typeof chrome !== "undefined" && chrome.tabs) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, "_blank");
    }
  };

  const handleRetry = () => {
    if (typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.sendMessage({ type: "TRIGGER_CONNECT" }).catch(() => {});
    }
    onRetryConnect();
  };

  return (
    <div className="nmh-banner">
      <div className="nmh-banner-header">
        <span className="nmh-banner-icon">⚠</span>
        <div className="nmh-banner-title-group">
          <span className="nmh-banner-title">{t("nmh.title")}</span>
          <span className="nmh-banner-subtitle">{t("nmh.subtitle")}</span>
        </div>
      </div>

      <div className="nmh-banner-actions">
        <button
          id="nmh-btn-cosmos"
          className={`nmh-path-btn nmh-path-btn--primary ${activePath === "cosmos" ? "active" : ""}`}
          onClick={() => setActivePath(activePath === "cosmos" ? null : "cosmos")}
        >
          <span className="nmh-path-btn-icon">🖥</span>
          <span>Cosmos Assistant</span>
          <span className="nmh-path-btn-arrow">{activePath === "cosmos" ? "▲" : "▼"}</span>
        </button>

        <button
          id="nmh-btn-manual"
          className={`nmh-path-btn nmh-path-btn--secondary ${activePath === "manual" ? "active" : ""}`}
          onClick={() => setActivePath(activePath === "manual" ? null : "manual")}
        >
          <span className="nmh-path-btn-icon">📦</span>
          <span>{t("nmh.manualBinary")}</span>
          <span className="nmh-path-btn-arrow">{activePath === "manual" ? "▲" : "▼"}</span>
        </button>
      </div>

      {/* Cosmos Assistant Path */}
      {activePath === "cosmos" && (
        <div className="nmh-expand-panel">
          <p className="nmh-expand-desc">
            {t("nmh.cosmosDesc", { app: "Cosmos Assistant" })}
          </p>
          <button
            id="nmh-open-cosmos-releases"
            className="nmh-link-btn"
            onClick={() => openLink(COSMOS_RELEASES_URL)}
          >
            {t("nmh.cosmosCta")}
          </button>
        </div>
      )}

      {/* Manual Binary Path */}
      {activePath === "manual" && (
        <div className="nmh-expand-panel">
          <ol className="nmh-steps">
            <li className="nmh-step">
              <span className="nmh-step-num">1</span>
              <div className="nmh-step-body">
                <span className="nmh-step-label">{t("nmh.step1")}</span>
                <button
                  id="nmh-open-binary-releases"
                  className="nmh-link-btn"
                  onClick={() => openLink(BINARY_RELEASES_URL)}
                >
                  {t("nmh.step1Cta")}
                </button>
              </div>
            </li>
            <li className="nmh-step">
              <span className="nmh-step-num">2</span>
              <div className="nmh-step-body">
                <span className="nmh-step-label">{t("nmh.step2")}</span>
                <CopyableCode code="./install.sh" />
              </div>
            </li>
            <li className="nmh-step">
              <span className="nmh-step-num">3</span>
              <div className="nmh-step-body">
                <span className="nmh-step-label">{t("nmh.step3")}</span>
              </div>
            </li>
          </ol>
        </div>
      )}

      <div className="nmh-banner-footer">
        <button id="nmh-retry-btn" className="nmh-retry-btn" onClick={handleRetry}>
          {t("nmh.retry")}
        </button>
      </div>
    </div>
  );
}

function CopyableCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="nmh-code-block">
      <code className="nmh-code">{code}</code>
      <button className={`nmh-code-copy ${copied ? "copied" : ""}`} onClick={handleCopy}>
        {copied ? "✓" : "⎘"}
      </button>
    </div>
  );
}
