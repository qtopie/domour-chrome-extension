declare const chrome: any;

import { RelayConnection, debugLog } from './relayConnection';

interface PendingEntry {
  connect(): Promise<RelayConnection>;
  close(reason: string): void;
}

class EagerPending implements PendingEntry {
  private _connection: RelayConnection;
  onclose?: () => void;

  static async create(mcpRelayUrl: string, protocolVersion: number): Promise<EagerPending> {
    const connection = await openRelayConnection(mcpRelayUrl, protocolVersion);
    return new EagerPending(connection);
  }

  private constructor(connection: RelayConnection) {
    this._connection = connection;
    this._connection.onclose = () => this.onclose?.();
  }

  async connect(): Promise<RelayConnection> {
    return this._connection;
  }

  close(reason: string): void {
    this._connection.close(reason);
  }
}

class DeferredPending implements PendingEntry {
  private _mcpRelayUrl: string;
  private _protocolVersion: number;

  constructor(mcpRelayUrl: string, protocolVersion: number) {
    this._mcpRelayUrl = mcpRelayUrl;
    this._protocolVersion = protocolVersion;
  }

  async connect(): Promise<RelayConnection> {
    return openRelayConnection(this._mcpRelayUrl, this._protocolVersion);
  }

  close(_reason: string): void {}
}

export class PendingConnections {
  private _map = new Map<number, PendingEntry>();

  constructor() {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onRemoved) {
      chrome.tabs.onRemoved.addListener(this._onTabRemoved.bind(this));
    }
  }

  async create(selectorTabId: number, mcpRelayUrl: string, protocolVersion: number): Promise<void> {
    if (protocolVersion !== 1) {
      this._map.set(selectorTabId, new DeferredPending(mcpRelayUrl, protocolVersion));
      return;
    }
    const entry = await EagerPending.create(mcpRelayUrl, protocolVersion);
    entry.onclose = () => {
      if (this._map.get(selectorTabId) !== entry)
        return;
      this._map.delete(selectorTabId);
      chrome.tabs.sendMessage(selectorTabId, { type: 'pendingConnectionClosed' }).catch(() => {});
    };
    this._map.set(selectorTabId, entry);
  }

  async take(selectorTabId: number): Promise<RelayConnection | undefined> {
    const entry = this._map.get(selectorTabId);
    if (!entry)
      return undefined;
    this._map.delete(selectorTabId);
    return entry.connect();
  }

  private _onTabRemoved(tabId: number): void {
    const entry = this._map.get(tabId);
    if (!entry)
      return;
    this._map.delete(tabId);
    entry.close('Browser tab closed');
  }
}

async function openRelayConnection(mcpRelayUrl: string, protocolVersion: number): Promise<RelayConnection> {
  try {
    const socket = new WebSocket(mcpRelayUrl);
    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error('WebSocket error'));
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
    return new RelayConnection(socket, protocolVersion);
  } catch (error: any) {
    const message = `Failed to connect to MCP relay: ${error.message}`;
    debugLog(message);
    throw new Error(message);
  }
}
