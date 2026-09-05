# Module Spec: Proxy Profile Toolbar Dynamic Icon & Color Indicator

- **Feature:** Proxy Profile Toolbar Dynamic Visual Indicators (Icon & Badge Color)
- **Status:** DRAFT — Awaiting `APPROVE`
- **Prefix:** `SPEC-PROXY-ICON`
- **Affected Files:**
  - `specs/modules/proxy-icon.spec.md` (This document)
  - `testings/proxy-icon.mapped-tests.md` (Harness BDD scenario mapping)
  - `frontend/src/types/proxyIcon.ts` (Pure helper module: profile color resolver, badge text generator, icon rendering helpers)
  - `frontend/src/background/proxyIcon.ts` (Background worker integration: updates `chrome.action` icon and badge color upon proxy state changes)
  - `frontend/src/background/proxy.ts` (Hooks into `applyProxyConfig` and `initProxyState`)
  - `frontend/src/background/index.ts` (Hooks into `SET_ACTIVE_PROXY`, `SAVE_PROXY_PROFILE`, `DELETE_PROXY_PROFILE`, `handleVproxySync`)

---

## 1. Overview & Problem Statement

Users need an immediate, glanceable visual indicator on the Chrome extension toolbar icon to know which proxy profile is currently active and its associated color.

Currently:
1. The toolbar icon is static (`icon-16.png`, `icon-48.png`, `icon-128.png`) with no visual reflection of the active proxy profile.
2. Proxy profiles already have a `color` attribute (`#10b981` for Direct, `#6366f1` for System, `#3b82f6` for vproxy PAC, or custom user hex colors in `#RRGGBB`).
3. If notifications badge text is not active, the toolbar provides zero feedback about the current proxy mode/profile.

### Objectives:
- Provide dual-layer visual feedback:
  1. **Badge Color & Label Indicator:** Set `chrome.action.setBadgeBackgroundColor({ color })` matching the active profile's color. When no notifications are pending, show a compact profile badge text indicator (e.g. `DIR` for direct, `SYS` for system, `PAC` for PAC/vproxy, or the first 2-3 uppercase letters of the profile name/scheme).
  2. **Dynamic Colored Icon via OffscreenCanvas / ImageData:** Dynamically generate toolbar icon pixels with a colored ring or status indicator matching the profile color, updating via `chrome.action.setIcon({ imageData })`.
  3. **Preserve Notification Priority:** If an unread notification or alert exists, the notification badge count and red alert color take precedence while unread, but the extension icon or restored badge safely reverts to the proxy profile indicator once notifications are cleared.

---

## 2. Interface / API Contract

### 2.1 Pure Types & Helper Module (`frontend/src/types/proxyIcon.ts`)

```ts
import type { ProxyProfile } from "./proxy";

export interface ProfileVisualState {
  color: string;             // Valid 6-digit hex color e.g. "#10b981"
  badgeText: string;         // Compact 2-3 char badge label e.g. "DIR", "SYS", "PAC", "S5"
  title: string;             // Extension action title e.g. "Domour: Direct Connection (#10b981)"
}

/**
 * Resolves a valid 6-char hex color from a profile, falling back to a default if missing/invalid.
 */
export function resolveProfileColor(profile?: Partial<ProxyProfile> | null): string;

/**
 * Derives a short, clear 2-3 character indicator badge text from a profile.
 * - direct -> "DIR"
 * - system -> "SYS"
 * - pac_script (or vproxy pac) -> "PAC"
 * - fixed_servers with socks5 -> "S5"
 * - fixed_servers with http/https -> "HTTP"
 * - other / custom -> 3 uppercase chars derived from name or "PRX"
 */
export function deriveProfileBadgeText(profile?: Partial<ProxyProfile> | null): string;

/**
 * Derives the action tooltip title for the extension icon.
 */
export function deriveActionTitle(profile?: Partial<ProxyProfile> | null): string;

/**
 * Generates raw RGBA ImageData pixel buffers for dynamic icons in MV3 Service Worker.
 * Can use OffscreenCanvas when available, or fallback to pure RGBA Uint8ClampedArray pixel buffer.
 */
export function createProfileIconImageData(
  size: number,
  colorHex: string
): ImageData | { width: number; height: number; data: Uint8ClampedArray };
```

### 2.2 Background Controller Contract (`frontend/src/background/proxyIcon.ts`)

```ts
/**
 * Applies the profile's visual state (badge color, badge text if no notification, action title, and icon)
 * to chrome.action.
 */
export async function updateToolbarIconForProfile(
  profile: ProxyProfile | null,
  hasPendingNotification?: boolean
): Promise<void>;
```

---

## 3. Acceptance Criteria (BDD)

### Feature: Proxy Profile Toolbar Icon & Color Feedback

#### Scenario 1: [SPEC-PI-001] Resolves canonical color for built-in and custom profiles
- **Given** A proxy profile with `color` specified or missing
- **When** `resolveProfileColor(profile)` is called
- **Then** It returns `#10b981` for direct, `#6366f1` for system, `#3b82f6` for default vproxy PAC, and user-defined `#RRGGBB` for custom profiles, falling back to `#3b82f6` for invalid formats.
- **Mapped Test:** `testings/proxyIcon/color.test.ts:TestProxyIcon_ResolveColor`

#### Scenario 2: [SPEC-PI-002] Derives concise badge text for proxy modes
- **Given** Profiles with modes `direct`, `system`, `pac_script`, and `fixed_servers`
- **When** `deriveProfileBadgeText(profile)` is evaluated
- **Then** It yields `"DIR"` for direct, `"SYS"` for system, `"PAC"` for pac_script, `"S5"` for socks5, `"HTTP"` for http, and non-empty max-3-character text for custom names.
- **Mapped Test:** `testings/proxyIcon/badge.test.ts:TestProxyIcon_DeriveBadgeText`

#### Scenario 3: [SPEC-PI-003] Derives descriptive action title
- **Given** An active profile with name "My SOCKS5" and mode "fixed_servers"
- **When** `deriveActionTitle(profile)` is called
- **Then** It produces a hover tooltip string containing the profile name and mode.
- **Mapped Test:** `testings/proxyIcon/badge.test.ts:TestProxyIcon_DeriveActionTitle`

#### Scenario 4: [SPEC-PI-004] Generates valid ImageData pixel buffer for icon rendering
- **Given** An icon size (e.g. 16, 32) and target color `#10b981`
- **When** `createProfileIconImageData(size, color)` is called
- **Then** It returns an image buffer with dimensions `size x size` and valid RGBA values in `Uint8ClampedArray`, with non-zero color channels reflecting the profile color.
- **Mapped Test:** `testings/proxyIcon/icon.test.ts:TestProxyIcon_GenerateImageData`

#### Scenario 5: [SPEC-PI-005] Updates toolbar icon and badge when proxy switches
- **Given** Active proxy switches from "direct" to a SOCKS5 profile or PAC profile
- **When** `applyProxyConfig` succeeds or `SET_ACTIVE_PROXY` executes
- **Then** `updateToolbarIconForProfile` updates the toolbar badge background color and icon to match the new profile's color.
- **Mapped Test:** `testings/proxyIcon/integration.test.ts:TestProxyIcon_UpdateToolbar`

#### Scenario 6: [SPEC-PI-006] Preserves notification badge precedence
- **Given** An active notification exists with pending alert count
- **When** Proxy profile is updated while notifications are enabled and unread
- **Then** The notification badge count and alert color are preserved, and when notifications are cleared, the profile badge indicator is restored.
- **Mapped Test:** `testings/proxyIcon/integration.test.ts:TestProxyIcon_NotificationPrecedence`
