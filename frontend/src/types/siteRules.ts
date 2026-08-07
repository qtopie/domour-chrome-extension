/**
 * Site Rules — per-domain permissions shared across the Popup, the Options Page
 * and the background worker. Pure module (no chrome dependency) so it can be
 * unit-tested in the harness and imported by any surface.
 *
 * Three independent permission flags per host:
 *   - inject:       allow content script injection / automation
 *   - bypassProxy:  route this host DIRECT (skip the proxy)
 *   - cookies:      allow cookie extraction
 *
 * Resolution order: `perHost[host]` with longest-suffix match wins; otherwise
 * falls back to `global`.
 */

export type SiteRuleSource = "global" | "allowlist" | "blocklist";

export interface SiteRule {
  /** Domain scope. "" means the global default rule. */
  host: string;
  inject: boolean;
  bypassProxy: boolean;
  cookies: boolean;
  source: SiteRuleSource;
}

export interface SiteRules {
  global: SiteRule;
  perHost: Record<string, SiteRule>;
  _meta?: { updatedAt: number };
}

export const DEFAULT_GLOBAL_SITE_RULE: SiteRule = {
  host: "",
  inject: true,
  bypassProxy: false,
  cookies: false,
  source: "global"
};

export function createEmptySiteRules(): SiteRules {
  return {
    global: { ...DEFAULT_GLOBAL_SITE_RULE },
    perHost: {}
  };
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

/**
 * Longest-suffix match. `api.example.com` matches a `example.com` record;
 * `example.com` does NOT match `api.example.com` records.
 */
export function resolveSiteRule(rules: SiteRules, rawHost: string): SiteRule {
  const host = normalizeHost(rawHost);
  const perHost = rules?.perHost ?? {};
  const labels = host.split(".").filter(Boolean);

  // Try longest suffix first (e.g. a.b.example.com -> b.example.com -> example.com)
  for (let i = 0; i < labels.length; i++) {
    const candidate = labels.slice(i).join(".");
    const rule = perHost[candidate];
    if (rule) {
      return { ...rule };
    }
  }

  // No per-host match — fall back to global default
  return { ...(rules?.global ?? DEFAULT_GLOBAL_SITE_RULE) };
}

/** Update (or create) a per-host rule, preserving the other two flags. */
export function setSiteRule(
  rules: SiteRules,
  rawHost: string,
  patch: Partial<Omit<SiteRule, "host">> & { source?: SiteRuleSource }
): SiteRules {
  const host = normalizeHost(rawHost);
  if (!host) {
    return rules;
  }
  const existing = rules.perHost[host] ?? {
    ...DEFAULT_GLOBAL_SITE_RULE,
    host,
    source: "allowlist"
  };
  return {
    ...rules,
    perHost: {
      ...rules.perHost,
      [host]: { ...existing, ...patch, host }
    },
    _meta: { updatedAt: Date.now() }
  };
}

/** Remove a per-host rule entirely. */
export function removeSiteRule(rules: SiteRules, rawHost: string): SiteRules {
  const host = normalizeHost(rawHost);
  const perHost = { ...rules.perHost };
  delete perHost[host];
  return { ...rules, perHost, _meta: { updatedAt: Date.now() } };
}

/** Hostname of a URL for rule lookup. */
export function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    const cleaned = url.replace(/^[a-z]+:\/\//, "");
    return cleaned.split("/")[0].split(":")[0].split("?")[0];
  }
}
