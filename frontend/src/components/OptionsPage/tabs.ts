/**
 * Options page tab list — extracted so the harness can statically assert the
 * consolidated tab structure (SPEC-RT-008) without importing the React tree.
 */
export interface OptionsTab {
  key: string;
  labelKey: string;
}

export const OPTIONS_TABS: OptionsTab[] = [
  { key: "general", labelKey: "tabs.general" },
  { key: "proxy", labelKey: "tabs.proxy" },
  { key: "siterules", labelKey: "tabs.siterules" },
  { key: "requestheaders", labelKey: "tabs.requestheaders" },
  { key: "traffic", labelKey: "tabs.traffic" },
  { key: "advanced", labelKey: "tabs.advanced" }
];
