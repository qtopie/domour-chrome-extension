declare const chrome: any;

import type { ProtocolCommand, ProtocolHandler, RelayContext } from './protocolHandlers';
import { ProtocolV1Handler, ProtocolV2Handler, resolveChromeMember } from './protocolHandlers';

export function debugLog(...args: unknown[]): void {
  console.log('[Playwright Extension Relay]', ...args);
}

type ProtocolResponse = {
  id?: number;
  method?: string;
  params?: any;
  result?: any;
  error?: string;
};

const CHROME_EVENT_METHODS = [
  'chrome.debugger.onEvent',
  'chrome.debugger.onDetach',
  'chrome.tabs.onCreated',
  'chrome.tabs.onRemoved',
];

export class RelayConnection {
  private _ws: WebSocket;
  private _handler: ProtocolHandler;
  private _attachedTabs = new Set<number>();
  private _hasEverAttached = false;
  private _eventListeners: Array<{ remove: () => void }> = [];
  private _closed = false;

  onclose?: () => void;
  ontabattached?: (tabId: number) => void;
  ontabdetached?: (tabId: number) => void;

  get attachedTabs(): ReadonlySet<number> {
    return this._attachedTabs;
  }

  constructor(ws: WebSocket, protocolVersion: number) {
    this._ws = ws;
    const context: RelayContext = {
      attachedTabs: this._attachedTabs,
      sendMessage: msg => this._sendMessage(msg),
      notifyTabAttached: tabId => this._notifyTabAttached(tabId),
      notifyTabDetached: tabId => this._notifyTabDetached(tabId),
    };
    this._handler = protocolVersion === 1
      ? new ProtocolV1Handler(context)
      : new ProtocolV2Handler(context);
    this._installEventForwarders();
    this._ws.onmessage = this._onMessage.bind(this);
    this._ws.onclose = () => this._onClose();
  }

  didInitialize(): void {
    this._handler.didInitialize();
  }

  close(message: string): void {
    this._ws.close(1000, message);
    this._onClose();
  }

  attachTab(tab: any): void {
    if (this._closed || this._attachedTabs.has(tab.id!))
      return;
    this._handler.onUserAttachRequest(tab);
  }

  detachTab(tabId: number): void {
    if (this._closed || !this._attachedTabs.has(tabId))
      return;
    chrome.debugger.detach({ tabId }).catch((error: any) => {
      debugLog('Error detaching tab:', error);
    });
    this._notifyTabDetached(tabId);
    this._handler.onUserDetachRequest(tabId);
    this._checkLastTabDetached();
  }

  private _notifyTabAttached(tabId: number): void {
    this._attachedTabs.add(tabId);
    this._hasEverAttached = true;
    this.ontabattached?.(tabId);
  }

  private _notifyTabDetached(tabId: number): void {
    this._attachedTabs.delete(tabId);
    this.ontabdetached?.(tabId);
  }

  private _installEventForwarders(): void {
    for (const fullMethod of CHROME_EVENT_METHODS) {
      try {
        const target = resolveChromeMember(fullMethod);
        const listener = (...args: any[]) => this._onChromeEvent(fullMethod, args);
        target.obj[target.name].addListener(listener);
        this._eventListeners.push({
          remove: () => target.obj[target.name].removeListener(listener),
        });
      } catch (e) {
        debugLog(`Could not attach event forwarder for ${fullMethod}`, e);
      }
    }
  }

  private _onClose() {
    if (this._closed)
      return;
    this._closed = true;
    for (const l of this._eventListeners)
      l.remove();
    this._eventListeners = [];
    for (const tabId of [...this._attachedTabs]) {
      chrome.debugger.detach({ tabId }).catch(() => {});
      this._notifyTabDetached(tabId);
    }
    this.onclose?.();
  }

  private _checkLastTabDetached(): void {
    if (this._hasEverAttached && this._attachedTabs.size === 0)
      this.close('All controlled tabs detached');
  }

  private _onChromeEvent(fullMethod: string, args: any[]): void {
    const tabId = this._tabIdForEventArgs(fullMethod, args);
    if (tabId === undefined || !this._attachedTabs.has(tabId))
      return;
    this._handler.forwardChromeEvent(fullMethod, args);
    if (fullMethod === 'chrome.debugger.onDetach') {
      this._notifyTabDetached(tabId);
      this._checkLastTabDetached();
    }
  }

  private _tabIdForEventArgs(fullMethod: string, args: any[]): number | undefined {
    switch (fullMethod) {
      case 'chrome.debugger.onEvent':
      case 'chrome.debugger.onDetach':
        return args[0]?.tabId;
      case 'chrome.tabs.onCreated': {
        const tab = args[0];
        return tab?.openerTabId;
      }
      case 'chrome.tabs.onRemoved':
        return args[0] as number;
    }
    return undefined;
  }

  private _onMessage(event: MessageEvent): void {
    this._onMessageAsync(event).catch(e => debugLog('Error handling message:', e));
  }

  private async _onMessageAsync(event: MessageEvent): Promise<void> {
    let message: ProtocolCommand;
    try {
      message = JSON.parse(event.data);
    } catch (error: any) {
      debugLog(`Error parsing message ${event.data}:`, error);
      this._sendError(-32700, `Error parsing message: ${error.message}`);
      return;
    }

    const response: ProtocolResponse = {
      id: message.id,
    };
    try {
      response.result = await this._handler.handleCommand(message);
    } catch (error: any) {
      debugLog(`Error handling command ${JSON.stringify(message)}:`, error);
      response.error = error.message;
    }
    this._sendMessage(response);
  }

  private _sendError(code: number, message: string): void {
    this._sendMessage({
      error: {
        code,
        message,
      },
    });
  }

  private _sendMessage(message: any): void {
    if (this._ws.readyState === WebSocket.OPEN)
      this._ws.send(JSON.stringify(message));
  }
}
