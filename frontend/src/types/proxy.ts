export type ProxyScheme = 'socks5' | 'http' | 'https';
export type ProxyMode = 'direct' | 'system' | 'fixed_servers' | 'pac_script';
export type PacType = 'url' | 'script';

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
