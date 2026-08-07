/**
 * Options page tab list — extracted so the harness can statically assert the
 * consolidated tab structure (SPEC-RT-008) without importing the React tree.
 */
export interface OptionsTab {
  key: string;
  label: string;
}

export const OPTIONS_TABS: OptionsTab[] = [
  { key: "general", label: "通用" },
  { key: "proxy", label: "代理" },
  { key: "siterules", label: "权限" },
  { key: "requestheaders", label: "请求" },
  { key: "traffic", label: "流量分析" },
  { key: "advanced", label: "高级" }
];
