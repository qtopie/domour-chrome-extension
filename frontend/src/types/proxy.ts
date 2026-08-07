export type ProxyScheme = 'socks5' | 'http' | 'https';
export type ProxyMode = 'direct' | 'system' | 'fixed_servers' | 'pac_script';
export type PacType = 'url' | 'script';

/**
 * Canonical list of loopback / LAN hosts that must never go through a proxy.
 * Used by the background (fixed_servers bypassList + PAC wrapper) and by the
 * UI so profiles store a bypass list that matches what is actually applied.
 * Kept in the shared types module (no chrome dependency) so both the
 * background worker and the React side panel can import it.
 */
export const DEFAULT_LAN_BYPASS = [
  "localhost",
  "localhost:*",
  "127.0.0.1",
  "127.0.0.1:*",
  "[::1]",
  "[::1]:*",
  "192.168.0.0/16",
  "192.168.*",
  "10.0.0.0/8",
  "10.*",
  "172.16.0.0/12",
  "169.254.0.0/16",
  "*.local",
  "*.lan"
];

export interface ProxyProfile {
  id: string;
  name: string;
  color?: string;
  mode: ProxyMode;
  scheme?: ProxyScheme;
  host?: string;
  port?: number;
  bypassList?: string[];
  pacType?: PacType;
  pacUrl?: string;
  pacScript?: string;
  isVproxy?: boolean;
  updatedAt?: number;
}

export interface ProxyStateResponse {
  profiles: ProxyProfile[];
  activeProfileId: string;
  activeProfile: ProxyProfile | null;
  effectiveConfig?: any;
}
