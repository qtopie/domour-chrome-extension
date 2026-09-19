import type { ProxyProfile } from './types';
import {
  resolveProfileColor,
  deriveProfileBadgeText,
  deriveActionTitle,
  createProfileIconPixelData
} from '../types/proxyIcon';

declare const chrome: any;

let cachedActiveProfile: ProxyProfile | null = null;

/**
 * Converts pure PixelBuffer to ImageData or returns null if not supported.
 */
function toImageData(size: number, colorHex: string): ImageData | null {
  try {
    const pixelBuf = createProfileIconPixelData(size, colorHex);
    // In ServiceWorker environments where OffscreenCanvas is supported:
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(size, size);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const imgData = ctx.createImageData(size, size);
        imgData.data.set(pixelBuf.data);
        return imgData;
      }
    }
    if (typeof ImageData !== "undefined") {
      // Direct ImageData constructor
      const copy = new Uint8ClampedArray(pixelBuf.data);
      return new ImageData(copy as any, pixelBuf.width, pixelBuf.height);
    }
  } catch (err) {
    console.warn("[proxyIcon] Failed to generate ImageData:", err);
  }
  return null;
}

/**
 * Updates the Chrome action toolbar icon and badge based on the active proxy profile.
 */
export async function updateToolbarIconForProfile(
  profile: ProxyProfile | null,
  forceRestoreBadge: boolean = false
): Promise<void> {
  cachedActiveProfile = profile;

  if (typeof chrome === "undefined" || !chrome.action) {
    return;
  }

  const color = resolveProfileColor(profile);
  const title = deriveActionTitle(profile);
  const badgeText = deriveProfileBadgeText(profile);

  try {
    // 1. Set hover tooltip
    if (chrome.action.setTitle) {
      chrome.action.setTitle({ title });
    }

    // 2. Check if there are active unread notifications
    chrome.storage.local.get(["events", "notify_enabled"], (res: any) => {
      const notifyEnabled = res.notify_enabled !== false;
      const events: any[] = res.events || [];
      const hasUnread = notifyEnabled && events.length > 0 && !forceRestoreBadge;

      if (!hasUnread) {
        // Safe to apply proxy profile badge text & color
        try {
          chrome.action.setBadgeBackgroundColor({ color });
          chrome.action.setBadgeText({ text: badgeText });
        } catch {
          // ignore
        }
      }
    });

    // 3. Dynamic toolbar icon with profile accent
    const img16 = toImageData(16, color);
    const img32 = toImageData(32, color);

    if (img16 && img32) {
      chrome.action.setIcon({
        imageData: {
          16: img16,
          32: img32
        }
      }, () => {
        if (chrome.runtime?.lastError) {
          // Ignore non-fatal action icon error
        }
      });
    }
  } catch (err) {
    console.warn("[proxyIcon] updateToolbarIconForProfile failed:", err);
  }
}

/**
 * Restores the profile badge text and color when notifications are dismissed.
 */
export function restoreProfileBadge(): void {
  if (cachedActiveProfile) {
    updateToolbarIconForProfile(cachedActiveProfile, true);
  } else {
    chrome.storage.local.get(["proxy_profiles", "active_proxy_id"], (res: any) => {
      const profiles: ProxyProfile[] = res.proxy_profiles || [];
      const activeId: string = res.active_proxy_id || "direct";
      const profile = profiles.find((p) => p.id === activeId) || null;
      updateToolbarIconForProfile(profile, true);
    });
  }
}

/**
 * Sets a vibrant runtime badge indicator when sensitive operations
 * (CDP DevTools debugging or Cookie extraction) are in progress.
 */
export function setSensitiveActionBadge(
  active: boolean,
  type: "CDP" | "AUTH" = "CDP"
): void {
  if (typeof chrome === "undefined" || !chrome.action) return;

  if (active) {
    const color = type === "CDP" ? "#f59e0b" : "#8b5cf6";
    const text = type === "CDP" ? "CDP" : "AUTH";
    const title = type === "CDP"
      ? "Domour Copilot | ⚡ CDP DevTools Debugger Active"
      : "Domour Copilot | 🔒 Extracting Authenticated Cookies";

    try {
      chrome.action.setBadgeBackgroundColor({ color });
      chrome.action.setBadgeText({ text });
      if (chrome.action.setTitle) {
        chrome.action.setTitle({ title });
      }
    } catch {
      // ignore
    }
  } else {
    restoreProfileBadge();
  }
}

