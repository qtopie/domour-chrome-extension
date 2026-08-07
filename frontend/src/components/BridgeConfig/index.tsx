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
  return (
    <section className="panel-card">
      <div className="card-header">
        <h2 className="card-title">桥接配置</h2>
        <button onClick={onRegenerate} className="regenerate-btn">
          Regenerate
        </button>
      </div>
      <p className="card-desc">API Token：外部任务请求需携带此 token 认证。</p>
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
        <div className="bridge-install-title">安装 Native Messaging Host</div>
        <p className="card-desc">
          桥接守护进程运行于 localhost:26888，为扩展提供 MCP 服务与原生消息通道。请先安装
          Native Messaging Host，扩展才能启动桥接进程。
        </p>

        <div className="bridge-install-path">
          <div className="bridge-install-path-head">
            <span className="install-path-badge auto">自动安装</span>
            <span className="install-path-name">扩展 + Cosmos Assistant 桌面应用</span>
          </div>
          <p className="card-desc">
            本扩展已发布至 Chrome Web Store（扩展 ID{" "}
            <code className="inline-code">ndbhggifgbebojmidnoenkfpiiknkggc</code>）。下载桌面应用并在
            「Setup 向导」中完成 Browser Bridge 配置，即可自动注册 Native Messaging Host。
          </p>
          <a
            href="https://qtopie.space/"
            target="_blank"
            rel="noreferrer"
            className="install-cta-btn primary"
          >
            🖥 前往 qtopie.space 下载
          </a>
        </div>

        <div className="bridge-install-path">
          <div className="bridge-install-path-head">
            <span className="install-path-badge manual">手动安装</span>
            <span className="install-path-name">GitHub Releases 下载 binary + 注册脚本</span>
          </div>
          <p className="card-desc">
            从 GitHub Releases 下载对应平台的 bridge binary，然后在终端运行注册脚本完成 Native
            Messaging Host 注册。
          </p>
          <button
            onClick={onToggleManual}
            className="install-cta-btn secondary"
            aria-expanded={manualOpen}
          >
            📦 {manualOpen ? "收起手动安装步骤" : "展开手动安装步骤"}
          </button>
          {manualOpen && (
            <ol className="manual-steps">
              <li>
                从{" "}
                <a
                  href="https://github.com/qtopie/domour-chrome-extension/releases"
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub Releases
                </a>{" "}
                下载对应平台的安装包（包含 <code className="inline-code">domour-chrome-bridge</code>{" "}
                binary 与 <code className="inline-code">register_host.sh</code> 脚本）并解压到本地目录。
              </li>
              <li>
                在解压目录的终端中运行注册脚本。扩展已发布至 Chrome Web Store，注册命令默认使用
                生产扩展 ID（无需传参）：
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
                  {scriptDetailOpen ? "▲ 收起：这个脚本会做什么" : "▼ 这个脚本会做什么？"}
                </button>
                {scriptDetailOpen && (
                  <div className="install-script-detail">
                    脚本会在你的浏览器配置目录下写入一个{" "}
                    <code className="inline-code">NativeMessagingHosts</code> 清单文件（JSON），
                    告诉 Chrome 扩展与 bridge 之间通过本地消息通道通信：
                    <ul className="script-effect-list">
                      <li>浏览器：Google Chrome、Microsoft Edge（macOS / Linux 自动探测）</li>
                      <li>
                        写入文件： <code className="inline-code">com.go_react.search_bridge.json</code>
                      </li>
                      <li>
                        内容：指向 <code className="inline-code">domour-chrome-bridge</code> 的路径 +
                        允许的本扩展 ID（
                        <code className="inline-code">ndbhggifgbebojmidnoenkfpiiknkggc</code>）
                      </li>
                      <li>结果：Chrome 能启动守护进程，Options 状态变为 ACTIVE</li>
                    </ul>
                  </div>
                )}
              </li>
              <li>
                重启浏览器后点击「重试连接」，若桥接守护进程已启动，状态将变为 ACTIVE。
              </li>
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
