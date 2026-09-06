import type { ProxyProfile } from "./proxy";

export const DEFAULT_PROFILE_COLOR = "#00add8"; // Official Go Gopher Blue (#00ADD8, rgb(0, 173, 216))
export const DIRECT_COLOR = "#34d399";          // soft mint emerald green
export const SYSTEM_COLOR = "#818cf8";          // soft pastel indigo purple

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
 * Returns Go Gopher blue if invalid.
 */
export function hexToRgb(hex?: string): RGB {
  if (!hex || typeof hex !== "string") {
    return { r: 0, g: 173, b: 216 }; // #00ADD8 (Go Gopher Blue)
  }
  let clean = hex.trim();
  if (clean.startsWith("#")) clean = clean.slice(1);
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    return { r: 0, g: 173, b: 216 };
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
 * Derives a short, concise indicator badge text for the proxy profile.
 * Intentionally returns empty string ("") to keep the icon uncluttered without unnecessary text.
 */
export function deriveProfileBadgeText(_profile?: AnyProxyProfile | Partial<ProxyProfile> | null): string {
  return "";
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
 * Draws a clean, vibrant badge with:
 * - Outer bold ring: profile color (e.g. Go Gopher blue #00ADD8, emerald #34d399)
 * - Middle solid ring: pure bright white (#ffffff) with no dark gap rings
 * - Inner core dot: profile color
 * - Outside boundary: clean transparent
 */
export function createProfileIconPixelData(size: number, colorHex: string): PixelBuffer {
  const data = new Uint8ClampedArray(size * size * 4);
  const rgb = hexToRgb(colorHex);
  const center = size / 2;
  const radius = size / 2 - 0.8;
  const ringInner = size >= 32 ? 9.5 : 4.6;
  const dotRadius = size >= 32 ? 4.5 : 2.0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = x - center + 0.5;
      const dy = y - center + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        let r = rgb.r;
        let g = rgb.g;
        let b = rgb.b;
        let a = 255;

        if (dist >= ringInner) {
          // 1. Outer accent ring (profile color: Go Gopher blue, etc.)
          r = rgb.r;
          g = rgb.g;
          b = rgb.b;
          a = 255;
        } else if (dist > dotRadius) {
          // 2. Middle ring: pure bright solid white (no dark gaps)
          r = 255;
          g = 255;
          b = 255;
          a = 255;
        } else {
          // 3. Center status core dot (profile color)
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
        // Transparent outside circular boundary
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
      }
    }
  }

  return { width: size, height: size, data };
}
