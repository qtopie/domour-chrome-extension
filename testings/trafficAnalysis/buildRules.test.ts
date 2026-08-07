/**
 * TEST-TA-001 / TEST-TA-007 / TEST-TA-008 — rule-building & host-resolution
 * pure-module tests (no chrome, no I/O). Run with:
 *   node --experimental-strip-types testings/trafficAnalysis/buildRules.test.ts
 */
import {
  buildDisableSyncConfig,
  buildVProxyConfigPayload,
  buildVProxyRules,
  isLocalDevPattern,
  resolveRulesForHost,
  validateTrafficConfig,
  validateTrafficRule
} from "../../frontend/src/types/trafficAnalysis.ts";

let failures = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ---------- TEST-TA-001: buildVProxyRules ----------
console.log("TestTA_BuildRules (SPEC-TA-001)");
{
  const rules = buildVProxyRules({
    enabled: true,
    upstreams: [],
    rules: [
      { pattern: "google.com", action: "PROXY", enabled: true },
      { pattern: "dev.local", action: "INTERCEPT", enabled: true },
      { pattern: "disabled.example.com", action: "PROXY", enabled: false }
    ],
    finalAction: "PROXY",
    directDns: true
  });
  check("emits DOMAIN rows for host patterns", rules.includes("DOMAIN,google.com,PROXY"));
  check("emits INTERCEPT row", rules.includes("DOMAIN,dev.local,INTERCEPT"));
  check("skips disabled rules", !rules.some((r) => r.includes("disabled.example.com")));
  check("appends FINAL fallback last", rules[rules.length - 1] === "FINAL,PROXY");

  // Explicit type prefixes.
  const prefixed = buildVProxyRules({
    enabled: true,
    upstreams: [],
    rules: [
      { pattern: "URL:https://api.example.com/", action: "DIRECT", enabled: true },
      { pattern: "PROCESS:chrome", action: "PROXY", enabled: true },
      { pattern: "PID:4242", action: "PROXY", enabled: true }
    ],
    finalAction: "DIRECT",
    directDns: true
  });
  check("URL: prefix rewritten", prefixed.includes("URL,https://api.example.com/,DIRECT"));
  check("PROCESS: prefix rewritten", prefixed.includes("PROCESS,chrome,PROXY"));
  check("PID: prefix rewritten", prefixed.includes("PID,4242,PROXY"));

  // Bare URL-with-slash becomes URL row.
  const urlish = buildVProxyRules({
    enabled: true,
    upstreams: [],
    rules: [{ pattern: "https://cdn.example.com/assets/", action: "DIRECT", enabled: true }],
    finalAction: "PROXY",
    directDns: true
  });
  check("bare URL with slash becomes URL row", urlish.includes("URL,https://cdn.example.com/assets/,DIRECT"));

  // Invalid inputs must throw.
  let threw = false;
  try {
    buildVProxyRules({
      enabled: true,
      upstreams: [],
      rules: [{ pattern: "", action: "PROXY", enabled: true }],
      finalAction: "PROXY",
      directDns: true
    });
  } catch {
    threw = true;
  }
  check("empty pattern throws", threw);

  threw = false;
  try {
    buildVProxyRules({
      enabled: true,
      upstreams: [],
      rules: [{ pattern: "example.com", action: "MAP", enabled: true }],
      finalAction: "PROXY",
      directDns: true
    });
  } catch {
    threw = true;
  }
  check("MAP without target throws", threw);

  threw = false;
  try {
    buildVProxyRules({
      enabled: true,
      upstreams: [],
      rules: [{ pattern: "PID:not-a-number", action: "PROXY", enabled: true }],
      finalAction: "PROXY",
      directDns: true
    });
  } catch {
    threw = true;
  }
  check("non-numeric PID throws", threw);

  check(
    "validateTrafficRule rejects MAP without target",
    validateTrafficRule({ pattern: "x", action: "MAP", enabled: true }) !== null
  );
  check(
    "validateTrafficConfig rejects bad FINAL",
    validateTrafficConfig({
      enabled: true,
      upstreams: [],
      rules: [],
      finalAction: "INTERCEPT" as any,
      directDns: true
    }) !== null
  );
  check(
    "validateTrafficConfig rejects bad upstream",
    validateTrafficConfig({
      enabled: true,
      upstreams: ["ftp://nope"],
      rules: [],
      finalAction: "PROXY",
      directDns: true
    }) !== null
  );

  // buildVProxyConfigPayload preserves runtime fields & trims upstreams.
  const payload = buildVProxyConfigPayload(
    {
      enabled: true,
      upstreams: ["  socks5://127.0.0.1:1080  ", ""],
      rules: [{ pattern: "example.com", action: "PROXY", enabled: true }],
      finalAction: "PROXY",
      directDns: false
    },
    { enable_ebpf: true, direct_dns: true, web_port: 8899, test_interval: 30 }
  );
  check("upstreams trimmed & empties filtered", payload.upstreams.length === 1 && payload.upstreams[0] === "socks5://127.0.0.1:1080");
  check("config directDns wins over current", payload.direct_dns === false);
  check("runtime fields preserved", payload.enable_ebpf === true && payload.web_port === 8899);
}

// ---------- TEST-TA-007: resolveRulesForHost ----------
console.log("TestTA_ResolveHost (SPEC-TA-007)");
{
  const config = {
    enabled: true,
    upstreams: [],
    rules: [
      { pattern: "dev.local", action: "INTERCEPT", enabled: true },
      { pattern: "google.com", action: "PROXY", enabled: true },
      { pattern: "example.com", action: "DIRECT", enabled: true }
    ],
    finalAction: "PROXY" as const,
    directDns: true
  };
  check("dev.local resolves INTERCEPT", resolveRulesForHost(config, "dev.local").action === "INTERCEPT");
  check("google.com resolves PROXY", resolveRulesForHost(config, "google.com").action === "PROXY");
  check("subdomain longest-suffix wins", resolveRulesForHost(config, "api.google.com").action === "PROXY");
  check("unmatched host falls back to FINAL", resolveRulesForHost(config, "example.org").action === "PROXY");
  check(
    "disabled rule is not matched",
    resolveRulesForHost(
      { ...config, rules: [{ pattern: "dev.local", action: "INTERCEPT", enabled: false }] },
      "dev.local"
    ).action === "PROXY"
  );
}

// ---------- TEST-TA-008: local dev pattern detection ----------
console.log("TestTA_DevDomainHint (SPEC-TA-008)");
{
  check("localhost detected", isLocalDevPattern("localhost"));
  check("*.local detected", isLocalDevPattern("myapp.local"));
  check("*.lan detected", isLocalDevPattern("router.lan"));
  check("127.x detected", isLocalDevPattern("127.0.0.1"));
  check("192.168.x detected", isLocalDevPattern("192.168.1.10"));
  check("10.x detected", isLocalDevPattern("10.0.0.5"));
  check("172.16-31 detected", isLocalDevPattern("172.20.0.3"));
  check("public domain NOT dev", !isLocalDevPattern("example.com"));
  check("outside 172.16-31 NOT dev", !isLocalDevPattern("172.35.0.1"));

  // A dev host with PROXY/DIRECT action would not be captured — hint logic
  // (the UI surfaces this); the pure signal is isLocalDevPattern.
  const devRule = { pattern: "api.dev.local", action: "PROXY" as const, enabled: true };
  check("dev pattern + PROXY action => capture would be missed", isLocalDevPattern(devRule.pattern) && devRule.action !== "INTERCEPT");
}

// ---------- disable-sync strips INTERCEPT/MAP ----------
console.log("TestTA_DisableSync (SPEC-TA-003 helper)");
{
  const stripped = buildDisableSyncConfig({
    enabled: true,
    upstreams: [],
    rules: [
      { pattern: "a.dev", action: "INTERCEPT", enabled: true },
      { pattern: "b.dev", action: "MAP", enabled: true, target: "file:///tmp/x" },
      { pattern: "c.com", action: "PROXY", enabled: true }
    ],
    finalAction: "PROXY",
    directDns: true
  });
  check("INTERCEPT removed", stripped.rules.every((r) => r.action !== "INTERCEPT"));
  check("MAP removed", stripped.rules.every((r) => r.action !== "MAP"));
  check("PROXY kept", stripped.rules.length === 1 && stripped.rules[0].action === "PROXY");
  check("enabled flag flipped false", stripped.enabled === false);
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
