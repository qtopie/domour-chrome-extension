import { useState } from "react";
import RequestHeadersManager from "../RequestHeadersManager";
import RequestTestPanel from "../RequestTestPanel";
import { useI18n } from "../../i18n/I18nProvider";

interface RequestsManagerProps {
  isExtension: boolean;
}

type RequestsSubTab = "headers" | "test";

/**
 * 「请求」tab（原「请求头」改名后）：内含「请求头」配置子页与 Postman 式
 * 「请求测试」子页。子页导航复用流量分析的 ta-subtabs 样式。
 */
export default function RequestsManager({ isExtension }: RequestsManagerProps) {
  const { t } = useI18n();
  const [subTab, setSubTab] = useState<RequestsSubTab>("headers");

  return (
    <div>
      <nav className="ta-subtabs">
        <button
          className={`ta-subtab ${subTab === "headers" ? "active" : ""}`}
          onClick={() => setSubTab("headers")}
        >
          {t("requests.subtabHeaders")}
        </button>
        <button
          className={`ta-subtab ${subTab === "test" ? "active" : ""}`}
          onClick={() => setSubTab("test")}
        >
          {t("requests.subtabTest")}
        </button>
      </nav>

      {subTab === "headers" ? (
        <RequestHeadersManager isExtension={isExtension} />
      ) : (
        <RequestTestPanel isExtension={isExtension} />
      )}
    </div>
  );
}
