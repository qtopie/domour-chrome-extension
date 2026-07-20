declare const chrome: any;

import { RelayConnection, debugLog } from './relayConnection';

const PLAYWRIGHT_GROUP_TITLE = 'Playwright';
const PLAYWRIGHT_GROUP_COLOR = 'green';
const NON_DEBUGGABLE_SCHEMES = ['chrome:', 'edge:', 'devtools:'];
const CONNECTED_BADGE = { text: '✓', color: '#4CAF50', title: 'Connected to Playwright client' };

export function isNonDebuggableUrl(url: string | undefined): boolean {
  return !!url && NON_DEBUGGABLE_SCHEMES.some(s => url.startsWith(s));
}

export async function cleanupStalePlaywrightGroups(): Promise<void> {
  try {
    if (typeof chrome === 'undefined' || !chrome.tabGroups) return;
    const groups = await chrome.tabGroups.query({ title: PLAYWRIGHT_GROUP_TITLE });
    const tabsPerGroup = await Promise.all(groups.map((g: any) => chrome.tabs.query({ groupId: g.id })));
    const tabIds = tabsPerGroup.flat().map((t: any) => t.id).filter((id): id is number => id !== undefined);
    if (tabIds.length)
      await chrome.tabs.ungroup(tabIds);
  } catch (error: any) {
    debugLog('Error cleaning up stale groups:', error);
  }
}

export class ConnectedTabGroup {
  private _connection: RelayConnection;
  private _groupId: number | null = null;
  private _groupTabIds: Set<number> = new Set();
  private _onTabUpdatedListener: (tabId: number, changeInfo: any, tab: any) => void;
  private _onTabRemovedListener: (tabId: number) => void;

  onclose?: () => void;

  constructor(connection: RelayConnection, selectedTab: any) {
    this._connection = connection;
    this._connection.onclose = () => this._onConnectionClose();
    this._connection.ontabattached = (tabId: number) => this._onTabAttached(tabId);
    this._connection.ontabdetached = (tabId: number) => this._onTabDetached(tabId);
    this._onTabUpdatedListener = this._onTabUpdated.bind(this);
    this._onTabRemovedListener = this._onTabRemoved.bind(this);
    chrome.tabs.onUpdated.addListener(this._onTabUpdatedListener);
    chrome.tabs.onRemoved.addListener(this._onTabRemovedListener);
    this._connection.attachTab(selectedTab);
    this._connection.didInitialize();
  }

  connectedTabIds(): number[] {
    return [...this._groupTabIds];
  }

  close(reason: string): void {
    this._connection.close(reason);
  }

  private _onTabUpdated(tabId: number, changeInfo: any, tab: any): void {
    if (changeInfo.groupId !== undefined)
      this._onTabGroupChanged(tabId, tab);
    if (changeInfo.url === undefined)
      return;
    if (this._connection.attachedTabs.has(tabId))
      void this._updateBadge(tabId, CONNECTED_BADGE);
    else if (this._groupTabIds.has(tabId) && !isNonDebuggableUrl(changeInfo.url))
      this._connection.attachTab(tab);
  }

  private _onTabGroupChanged(tabId: number, tab: any): void {
    const inOurGroup = this._groupId !== null && tab.groupId === this._groupId;
    const wasInGroup = this._groupTabIds.has(tabId);
    if (inOurGroup === wasInGroup)
      return;
    if (inOurGroup) {
      this._groupTabIds.add(tabId);
      if (!isNonDebuggableUrl(tab.url))
        this._connection.attachTab(tab);
    } else {
      this._groupTabIds.delete(tabId);
      if (this._connection.attachedTabs.has(tabId))
        this._connection.detachTab(tabId);
    }
  }

  private _onTabRemoved(tabId: number): void {
    this._groupTabIds.delete(tabId);
  }

  private _onTabAttached(tabId: number): void {
    void this._updateBadge(tabId, CONNECTED_BADGE);
    void this._addTabToGroup(tabId);
  }

  private _onTabDetached(tabId: number): void {
    void this._updateBadge(tabId, { text: '' });
  }

  private _onConnectionClose(): void {
    chrome.tabs.onUpdated.removeListener(this._onTabUpdatedListener);
    chrome.tabs.onRemoved.removeListener(this._onTabRemovedListener);
    const groupTabs = [...this._groupTabIds];
    this._groupTabIds.clear();
    if (groupTabs.length && chrome.tabs.ungroup) {
      this._retryOnDrag(() => chrome.tabs.ungroup(groupTabs)).catch(error => {
        debugLog('Error ungrouping tabs on close:', error);
      });
    }
    this.onclose?.();
  }

  private async _updateBadge(tabId: number, { text, color, title }: { text: string; color?: string, title?: string }): Promise<void> {
    try {
      if (!chrome.action) return;
      await Promise.all([
        chrome.action.setBadgeText({ tabId, text }),
        chrome.action.setTitle({ tabId, title: title || '' }),
        color ? chrome.action.setBadgeBackgroundColor({ tabId, color }) : Promise.resolve(),
      ]);
    } catch (error: any) {
      // Ignore errors if tab closed
    }
  }

  private async _addTabToGroup(tabId: number): Promise<void> {
    if (this._groupTabIds.has(tabId) || !chrome.tabs.group)
      return;
    try {
      await this._retryOnDrag(async () => {
        if (this._groupId === null) {
          this._groupId = await chrome.tabs.group({ tabIds: [tabId] });
          if (chrome.tabGroups) {
            await chrome.tabGroups.update(this._groupId, { color: PLAYWRIGHT_GROUP_COLOR, title: PLAYWRIGHT_GROUP_TITLE });
          }
        } else {
          await chrome.tabs.group({ groupId: this._groupId, tabIds: [tabId] });
        }
      });
      this._groupTabIds.add(tabId);
    } catch (error: any) {
      debugLog('Error adding tab to group:', error);
    }
  }

  private async _retryOnDrag(fn: () => Promise<void>): Promise<void> {
    const delays = [0, 100, 200, 400, 800];
    let lastError: unknown;
    for (const delay of delays) {
      if (delay)
        await new Promise(resolve => setTimeout(resolve, delay));
      try {
        await fn();
        return;
      } catch (error: any) {
        if (!error?.message?.includes('user may be dragging a tab'))
          throw error;
        lastError = error;
      }
    }
    throw lastError;
  }
}
