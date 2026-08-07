/**
 * TEST-RT-008 — Options page tab consolidation (static assertions).
 * No React runtime: verifies the OPTIONS_TABS constant and reads the
 * component sources to assert the consolidated structure (SPEC-RT-008).
 * Run with:
 *   node --experimental-strip-types testings/requestTest/ui.test.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { OPTIONS_TABS } from "../../frontend/src/components/OptionsPage/tabs.ts";

let failures = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf-8");

console.log("TestRT_OptionsTabs (SPEC-RT-008)");

// --- Tab list constant ---
const keys = OPTIONS_TABS.map((t) => t.key);
const labelKeys = OPTIONS_TABS.map((t) => t.labelKey);

check("exactly 6 tabs", keys.length === 6, JSON.stringify(keys));
check(
  "tab order: general/proxy/siterules/requestheaders/traffic/advanced",
  JSON.stringify(keys) === JSON.stringify(["general", "proxy", "siterules", "requestheaders", "traffic", "advanced"])
);
check(
  "labelKeys are i18n keys: tabs.general/.../tabs.advanced",
  JSON.stringify(labelKeys) === JSON.stringify(["tabs.general", "tabs.proxy", "tabs.siterules", "tabs.requestheaders", "tabs.traffic", "tabs.advanced"])
);
check("no bridge tab", !keys.includes("bridge"));
check("no notifications tab", !keys.includes("notifications"));
check("no raw Chinese labels in tabs.ts", !read("frontend/src/components/OptionsPage/tabs.ts").match(/[\u4e00-\u9fff]/));

// --- OptionsPage renders 通用 with bridge + notifications ---
const optionsSrc = read("frontend/src/components/OptionsPage/index.tsx");
check(
  "OptionsPage imports BridgeConfig",
  /import BridgeConfig from "\.\.\/BridgeConfig"/.test(optionsSrc)
);
check(
  "OptionsPage imports NotificationsManager",
  /import NotificationsManager from "\.\.\/NotificationsManager"/.test(optionsSrc)
);
check(
  "OptionsPage renders BridgeConfig inside general",
  /activeTab === "general"[\s\S]*<BridgeConfig/.test(optionsSrc)
);
check(
  "OptionsPage renders NotificationsManager inside general",
  /activeTab === "general"[\s\S]*<NotificationsManager/.test(optionsSrc)
);
check(
  "no legacy bridge tab branch",
  !/activeTab === "bridge"/.test(optionsSrc)
);
check(
  "no legacy notifications tab branch",
  !/activeTab === "notifications"/.test(optionsSrc)
);
check(
  "requestheaders renders RequestsManager",
  /activeTab === "requestheaders" && <RequestsManager/.test(optionsSrc)
);
check(
  "siterules renders SiteRulesManager",
  /activeTab === "siterules" && <SiteRulesManager/.test(optionsSrc)
);

// --- RequestsManager has 请求头 + 请求测试 sub-tabs (i18n keys) ---
const requestsSrc = read("frontend/src/components/RequestsManager/index.tsx");
check(
  "RequestsManager uses i18n key for 请求头 sub-tab",
  requestsSrc.includes('t("requests.subtabHeaders")')
);
check(
  "RequestsManager uses i18n key for 请求测试 sub-tab",
  requestsSrc.includes('t("requests.subtabTest")')
);
check(
  "RequestsManager embeds RequestHeadersManager",
  /import RequestHeadersManager/.test(requestsSrc)
);
check(
  "RequestsManager embeds RequestTestPanel",
  /import RequestTestPanel/.test(requestsSrc)
);

// --- RequestTestPanel exists and wires TEST_REQUEST ---
const panelSrc = read("frontend/src/components/RequestTestPanel/index.tsx");
check(
  "RequestTestPanel sends TEST_REQUEST via chrome runtime",
  /type: "TEST_REQUEST"/.test(panelSrc)
);

console.log(failures === 0 ? "\nAll UI structure tests passed ✅" : `\n${failures} FAILURE(S) ❌`);
process.exit(failures === 0 ? 0 : 1);
