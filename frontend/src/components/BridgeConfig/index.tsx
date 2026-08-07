import { useI18n } from "../../i18n/I18nProvider";

interface BridgeConfigProps {
  token: string;
  copiedToken: boolean;
  manualOpen: boolean;
  scriptDetailOpen: boolean;
  onRegenerate: () => void;
  onCopy: () => void;
  onToggleManual: () => void;
  onToggleScript: () => void;
}

/**
 * 桥接配置卡片：展示 API Token、自动安装（Chrome Web Store + qtopie.space 桌面应用）
 * 与手动安装（GitHub Releases binary + register_host.sh）指引。
 * 原为「桥接」独立 tab，现并入「通用」tab。
 */
export default function BridgeConfig({
  token,
  copiedToken,
  manualOpen,
  scriptDetailOpen,
  onRegenerate,
  onCopy,
  onToggleManual,
  onToggleScript,
}: BridgeConfigProps) {
  const { t } = useI18n();
  return (
    <section className="panel-card">
      <div className="card-header">
        <h2 className="card-title">{t("bridge.title")}</h2>
        <button onClick={onRegenerate} className="regenerate-btn">
          Regenerate
        </button>
      </div>
      <p className="card-desc">{t("bridge.desc")}</p>
      <div className="token-box">
        <code className="token-code">{token}</code>
        <button
          onClick={onCopy}
          className={`copy-btn ${copiedToken ? "copied" : ""}`}
          title="Copy token"
        >
          {copiedToken ? (
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

      <div className="bridge-install">
        <div className="bridge-install-title">{t("bridge.installTitle")}</div>
        <p className="card-desc">
          {t("bridge.installDesc")}
        </p>

        <div className="bridge-install-path">
          <div className="bridge-install-path-head">
            <span className="install-path-badge auto">{t("bridge.autoBadge")}</span>
            <span className="install-path-name">{t("bridge.autoName")}</span>
          </div>
          <p className="card-desc">
            {t("bridge.autoDesc", { extId: "ndbhggifgbebojmidnoenkfpiiknkggc" })}
          </p>
          <a
            href="https://qtopie.space/"
            target="_blank"
            rel="noreferrer"
            className="install-cta-btn primary"
          >
            {t("bridge.autoCta")}
          </a>
        </div>

        <div className="bridge-install-path">
          <div className="bridge-install-path-head">
            <span className="install-path-badge manual">{t("bridge.manualBadge")}</span>
            <span className="install-path-name">{t("bridge.manualName")}</span>
          </div>
          <p className="card-desc">
            {t("bridge.manualDesc")}
          </p>
          <button
            onClick={onToggleManual}
            className="install-cta-btn secondary"
            aria-expanded={manualOpen}
          >
            {t("bridge.manualToggle", { state: t(manualOpen ? "bridge.manualToggle.close" : "bridge.manualToggle.open") })}
          </button>
          {manualOpen && (
            <ol className="manual-steps">
              <li>
                {t("bridge.manualStep1", {
                  link: "GitHub Releases",
                  bridge: "domour-chrome-bridge",
                  script: "register_host.sh",
                })}
              </li>
              <li>
                {t("bridge.manualStep2")}
                <pre className="install-code">
                  <code>./register_host.sh</code>
                  <button
                    onClick={() => navigator.clipboard.writeText("./register_host.sh")}
                    className="copy-btn-text"
                  >
                    Copy
                  </button>
                </pre>
                <button
                  onClick={onToggleScript}
                  className="install-script-detail-toggle"
                  aria-expanded={scriptDetailOpen}
                >
                  {t("bridge.scriptToggle", { state: t(scriptDetailOpen ? "bridge.scriptToggle.close" : "bridge.scriptToggle.open") })}
                </button>
                {scriptDetailOpen && (
                  <div className="install-script-detail">
                    {t("bridge.scriptDesc", { nativeHosts: "NativeMessagingHosts" })}
                    <ul className="script-effect-list">
                      <li>{t("bridge.scriptEffect1")}</li>
                      <li>
                        {t("bridge.scriptEffect2", { file: "com.go_react.search_bridge.json" })}
                      </li>
                      <li>
                        {t("bridge.scriptEffect3", {
                          bridge: "domour-chrome-bridge",
                          extId: "ndbhggifgbebojmidnoenkfpiiknkggc",
                        })}
                      </li>
                      <li>{t("bridge.scriptEffect4")}</li>
                    </ul>
                  </div>
                )}
              </li>
              <li>
                {t("bridge.manualStep3")}
              </li>
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
