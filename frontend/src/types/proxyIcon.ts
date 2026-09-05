import type { ProxyProfile } from "./proxy";

export const DEFAULT_PROFILE_COLOR = "#3b82f6";
export const DIRECT_COLOR = "#10b981";
export const SYSTEM_COLOR = "#6366f1";

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * Flexible interface matching both types/proxy.ts and background/types.ts
 */
export interface AnyProxyProfile {
  id?: string;
  name?: string;
  mode?: string;
  scheme?: string;
  host?: string;
  port?: number;
  color?: string;
  isVproxy?: boolean;
  [key: string]: any;
}

/**
 * Parses a hex color string (#RGB or #RRGGBB) into RGB components.
 * Returns default blue if invalid.
 */
export function hexToRgb(hex?: string): RGB {
  if (!hex || typeof hex !== "string") {
    return { r: 59, g: 130, b: 246 }; // #3b82f6
  }
  let clean = hex.trim();
  if (clean.startsWith("#")) clean = clean.slice(1);
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    return { r: 59, g: 130, b: 246 };
  }
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16)
  };
}

/**
 * Resolves a valid 6-char hex color from a profile, falling back to canonical defaults.
 */
export function resolveProfileColor(profile?: AnyProxyProfile | Partial<ProxyProfile> | null): string {
  if (!profile) return DIRECT_COLOR;
  if (profile.color && typeof profile.color === "string") {
    let clean = profile.color.trim();
    if (clean.startsWith("#")) clean = clean.slice(1);
    if (clean.length === 3 && /^[0-9a-fA-F]{3}$/.test(clean)) {
      return "#" + clean.split("").map((c) => c + c).join("").toLowerCase();
    }
    if (clean.length === 6 && /^[0-9a-fA-F]{6}$/.test(clean)) {
      return "#" + clean.toLowerCase();
    }
  }

  // Built-in mode fallbacks
  if (profile.mode === "direct" || profile.id === "direct") return DIRECT_COLOR;
  if (profile.mode === "system" || profile.id === "system") return SYSTEM_COLOR;
  if (profile.isVproxy || profile.mode === "pac_script") return DEFAULT_PROFILE_COLOR;

  return DEFAULT_PROFILE_COLOR;
}

/**
 * Derives a short, concise 2-4 char indicator badge text for the proxy profile.
 */
export function deriveProfileBadgeText(profile?: AnyProxyProfile | Partial<ProxyProfile> | null): string {
  if (!profile || profile.mode === "direct" || profile.id === "direct") return "DIR";
  if (profile.mode === "system" || profile.id === "system") return "SYS";
  if (profile.mode === "pac_script" || profile.isVproxy) return "PAC";
  if (profile.mode === "fixed_servers") {
    if (profile.scheme === "socks5") return "S5";
    if (profile.scheme === "http" || profile.scheme === "https") return "HTTP";
    return "PRX";
  }
  if (profile.name) {
    const clean = profile.name.trim().replace(/[^a-zA-Z0-9]/g, "");
    if (clean.length >= 2) return clean.slice(0, 3).toUpperCase();
  }
  return "PRX";
}

/**
 * Derives the extension tooltip action title for hover feedback.
 */
export function deriveActionTitle(profile?: AnyProxyProfile | Partial<ProxyProfile> | null): string {
  if (!profile || profile.mode === "direct" || profile.id === "direct") {
    return "Domour: Direct Connection (No Proxy)";
  }
  if (profile.mode === "system" || profile.id === "system") {
    return "Domour: System Default Proxy";
  }
  if (profile.mode === "pac_script") {
    return `Domour: ${profile.name || "PAC Profile"} (PAC)`;
  }
  if (profile.mode === "fixed_servers") {
    const target = profile.host && profile.port ? ` - ${profile.host}:${profile.port}` : "";
    return `Domour: ${profile.name || "Proxy"} (${(profile.scheme || "http").toUpperCase()}${target})`;
  }
  return `Domour: ${profile.name || "Active Proxy"}`;
}

export interface PixelBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/**
 * Generates dynamic RGBA icon pixel data for a given size and target profile color.
 * Draws a modern, elegant gear/shield icon with an accent border and colored center dot.
 */
export function createProfileIconPixelData(size: number, colorHex: string): PixelBuffer {
  const data = new Uint8ClampedArray(size * size * 4);
  const rgb = hexToRgb(colorHex);
  const center = size / 2;
  const radius = size / 2 - 1;
  const innerRadius = size >= 32 ? 6 : 3;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = x - center + 0.5;
      const dy = y - center + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        // Base dark circular background (navy blue/slate theme matching Domour #1e1e2e)
        let r = 30;
        let g = 30;
        let b = 46;
        let a = 255;

        // Outer ring accent (profile color)
        if (dist >= radius - (size >= 32 ? 3 : 1.5)) {
          r = rgb.r;
          g = rgb.g;
          b = rgb.b;
          a = 230;
        } else if (dist <= innerRadius) {
          // Center status dot (solid profile color)
          r = rgb.r;
          g = rgb.g;
          b = rgb.b;
          a = 255;
        }

        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = a;
      } else {
        // Transparent outside circular badge
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
      }
    }
  }

  return { width: size, height: size, data };
}
