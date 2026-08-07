export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

export interface ProxyProfile {
  id: string;
  name: string;
  mode: string; // "direct" | "fixed_servers" | "pac_script"
  scheme?: string;
  host?: string;
  port?: number;
  bypassList?: string[];
  pacType?: string;
  pacUrl?: string;
  pacScript?: string;
  color?: string;
  isVproxy?: boolean;
  updatedAt?: number;
}

export interface ChromeMessage {
  type: string;
  level?: string;
  message?: string;
  profiles?: ProxyProfile[];
  autoSelectId?: string;
  token?: string;
  action?: string;
  url?: string;
  selector?: string;
  text?: string;
  value?: string;
  key?: string;
  expression?: string;
  wait_selector?: string;
  wait_timeout?: string;
  // Chat / notification channel (bridge ↔ background ↔ panels)
  jobId?: string;
  result?: string;
  eventType?: string;
  eventId?: string;
  severity?: string;
  symbol?: string;
  price?: string | number;
  changePct?: string | number;
  alertLevel?: string | number;
  host?: string;
  patch?: Record<string, any>;
  profileId?: string;
  profile?: ProxyProfile;
  enabled?: boolean;
}
