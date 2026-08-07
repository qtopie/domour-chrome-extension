/**
 * TEST-TA-002 / TEST-TA-003 / TEST-TA-004 — master-switch orchestration tests.
 * `runTrafficToggle` is pure; I/O (storage/proxy/fetch) is injected via a fake
 * `TrafficRuntime`. No chrome, no real I/O. Run with:
 *   node --experimental-strip-types testings/trafficAnalysis/toggle.test.ts
 */
import { runTrafficToggle } from "../../frontend/src/types/trafficAnalysis.ts";

let failures = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

class FakeRuntime {
  config: any;
  reachable = true;
  activeProfileId = "vproxy_pac_default";
  profiles: string[] = ["direct", "system", "vproxy_pac_default"];
  applied: string[] = [];
  posted: any[] = [];
  logs: string[] = [];

  constructor(config: any) {
    this.config = config;
  }

  async getConfig() {
    return this.config;
  }
  async setConfig(c: any) {
    this.config = c;
  }
  async getActiveProfileId() {
    return this.activeProfileId;
  }
  async getProfiles() {
    return this.profiles.map((id) => ({ id }));
  }
  async isReachable() {
    return this.reachable;
  }
  async applyProfile(id: string) {
    this.applied.push(id);
  }
  async postRules(cfg: any) {
    this.posted.push(cfg);
    return { success: true };
  }
  log(level: string, msg: string) {
    this.logs.push(`${level}: ${msg}`);
  }
}

// ---------- TEST-TA-002: enable switches to vproxy ----------
console.log("TestTA_ToggleOn (SPEC-TA-002)");
{
  const rt = new FakeRuntime({
    enabled: false,
    upstreams: [],
    rules: [{ pattern: "google.com", action: "PROXY", enabled: true }],
    finalAction: "PROXY",
    directDns: true
  });
  const out = await runTrafficToggle(rt, true);
  check("toggle succeeds", out.success === true && out.enabled === true);
  check("applies vproxy_traffic profile", rt.applied.includes("vproxy_traffic"));
  check("storage enabled === true", rt.config.enabled === true);
  check(
    "records previousProxyId from active profile",
    rt.config._meta.previousProxyId === "vproxy_pac_default"
  );
  check("syncs rules to vproxy", rt.posted.length === 1);
}

// ---------- TEST-TA-003: disable restores previous proxy ----------
console.log("TestTA_ToggleOffRestore (SPEC-TA-003)");
{
  const rt = new FakeRuntime({
    enabled: true,
    upstreams: [],
    rules: [{ pattern: "dev.local", action: "INTERCEPT", enabled: true }],
    finalAction: "PROXY",
    directDns: true,
    _meta: { previousProxyId: "vproxy_pac_default", updatedAt: 1 }
  });
  const out = await runTrafficToggle(rt, false);
  check("toggle off succeeds", out.success === true && out.enabled === false);
  check("restores previous profile", rt.applied.includes("vproxy_pac_default"));
  check("storage enabled === false", rt.config.enabled === false);
  check("clears previousProxyId", rt.config._meta.previousProxyId === undefined);
  check(
    "sync payload stripped of INTERCEPT/MAP",
    rt.posted[0].rules.every((r: string) => !r.includes("INTERCEPT"))
  );

  // Previous profile no longer exists → falls back to direct.
  const rt2 = new FakeRuntime({
    enabled: true,
    upstreams: [],
    rules: [],
    finalAction: "PROXY",
    directDns: true,
    _meta: { previousProxyId: "ghost-profile", updatedAt: 1 }
  });
  await runTrafficToggle(rt2, false);
  check("missing previous profile falls back to direct", rt2.applied.includes("direct"));
}

// ---------- TEST-TA-004: unreachable vproxy rejects enable ----------
console.log("TestTA_UnreachableRejected (SPEC-TA-004)");
{
  const rt = new FakeRuntime({
    enabled: false,
    upstreams: [],
    rules: [],
    finalAction: "PROXY",
    directDns: true
  });
  rt.reachable = false;
  const out = await runTrafficToggle(rt, true);
  check("returns failure", out.success === false);
  check("returns error mentioning vproxy", (out.error ?? "").includes("vproxy"));
  check("proxy NOT switched", rt.applied.length === 0);
  check("enabled stays false", rt.config.enabled === false);
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
