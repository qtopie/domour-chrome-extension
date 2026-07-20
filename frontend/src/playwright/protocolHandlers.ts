declare const chrome: any;

export type ProtocolCommand = {
  id: number;
  method: string;
  params?: any;
};

export interface RelayContext {
  readonly attachedTabs: ReadonlySet<number>;
  sendMessage(message: any): void;
  notifyTabAttached(tabId: number): void;
  notifyTabDetached(tabId: number): void;
}

export interface ProtocolHandler {
  handleCommand(message: ProtocolCommand): Promise<any>;
  forwardChromeEvent(fullMethod: string, args: any[]): void;
  onUserAttachRequest(tab: any): void;
  onUserDetachRequest(tabId: number): void;
  didInitialize(): void;
}

// ─── Protocol v1 (legacy single-tab) ───────────────────────────────────────
export class ProtocolV1Handler implements ProtocolHandler {
  private _context: RelayContext;
  private _selectedTabPromise: Promise<number>;
  private _selectedTabResolve!: (tabId: number) => void;

  constructor(context: RelayContext) {
    this._context = context;
    this._selectedTabPromise = new Promise(resolve => this._selectedTabResolve = resolve);
  }

  async handleCommand(message: ProtocolCommand): Promise<any> {
    if (message.method === 'attachToTab') {
      const tabId = await this._selectedTabPromise;
      const debuggee = { tabId };
      await chrome.debugger.attach(debuggee, '1.3');
      this._context.notifyTabAttached(tabId);
      const result: any = await chrome.debugger.sendCommand(debuggee, 'Target.getTargetInfo');
      return { targetInfo: result?.targetInfo };
    }
    if (message.method === 'forwardCDPCommand') {
      const { sessionId, method, params } = message.params;
      const tabId = [...this._context.attachedTabs][0];
      if (tabId === undefined)
        throw new Error('No tab is connected');
      const debuggerSession = { tabId, sessionId };
      return await chrome.debugger.sendCommand(debuggerSession, method, params);
    }
    throw new Error(`Unknown method: ${message.method}`);
  }

  forwardChromeEvent(fullMethod: string, args: any[]): void {
    if (fullMethod !== 'chrome.debugger.onEvent')
      return;
    const [source, method, params] = args;
    this._context.sendMessage({
      method: 'forwardCDPEvent',
      params: { sessionId: source.sessionId, method, params },
    });
  }

  onUserAttachRequest(tab: any): void {
    if (tab.id !== undefined)
      this._selectedTabResolve(tab.id);
  }

  onUserDetachRequest(_tabId: number): void {}

  didInitialize(): void {}
}

// ─── Protocol v2 (reflective chrome.*) ─────────────────────────────────────
const ALLOWED_CHROME_COMMANDS = new Set([
  'chrome.debugger.attach',
  'chrome.debugger.detach',
  'chrome.debugger.sendCommand',
  'chrome.tabs.create',
  'chrome.tabs.remove',
]);

export class ProtocolV2Handler implements ProtocolHandler {
  private _context: RelayContext;

  constructor(context: RelayContext) {
    this._context = context;
  }

  async handleCommand(message: ProtocolCommand): Promise<any> {
    if (ALLOWED_CHROME_COMMANDS.has(message.method)) {
      const args = (message.params ?? []) as any[];
      const result = await invokeChromeMethod(message.method, args);
      if (message.method === 'chrome.debugger.attach') {
        const target = args[0];
        if (target?.tabId !== undefined)
          this._context.notifyTabAttached(target.tabId);
      }
      return result ?? {};
    }
    throw new Error(`Unknown method: ${message.method}`);
  }

  forwardChromeEvent(fullMethod: string, args: any[]): void {
    this._context.sendMessage({ method: fullMethod, params: args });
  }

  onUserAttachRequest(tab: any): void {
    this._context.sendMessage({ method: 'chrome.tabs.onCreated', params: [tab] });
  }

  didInitialize(): void {
    this._context.sendMessage({ method: 'extension.initialized', params: [] });
  }

  onUserDetachRequest(tabId: number): void {
    this._context.sendMessage({
      method: 'chrome.debugger.onDetach',
      params: [{ tabId }, 'target_closed'],
    });
  }
}

export function resolveChromeMember(fullMethod: string): { obj: any; name: string } {
  const parts = fullMethod.split('.');
  if (parts[0] !== 'chrome' || parts.length < 3)
    throw new Error(`Invalid chrome method: ${fullMethod}`);
  let obj: any = typeof chrome !== 'undefined' ? chrome : globalThis;
  for (let i = 1; i < parts.length - 1; i++) {
    obj = obj?.[parts[i]];
    if (obj === undefined)
      throw new Error(`Unknown chrome path: ${parts.slice(0, i + 1).join('.')}, calling ${fullMethod}`);
  }
  return { obj, name: parts[parts.length - 1] };
}

async function invokeChromeMethod(fullMethod: string, args: any[]): Promise<any> {
  const { obj, name } = resolveChromeMember(fullMethod);
  const fn = obj[name] as (...a: any[]) => any;
  if (typeof fn !== 'function')
    throw new Error(`Not a function: ${fullMethod}`);
  return await fn.apply(obj, args);
}
