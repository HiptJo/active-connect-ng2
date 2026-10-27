import { signal } from '@angular/core';
import { NgxIndexedDBService } from 'ngx-indexed-db';
import { DecorableFunction } from './decorators/function';
import { JsonParser } from './json/json-parser';

export class WebsocketClient {
  ws!: WebSocket;
  pool!: { WssConnected: boolean } | null;

  /**
   * Connection state as a signal, so `isConnected` can be used in OnPush /
   * zoneless templates (a socket's readyState alone is not observable).
   */
  private readonly _connected = signal(false);

  constructor(
    private url?: string,
    private supportsCache?: boolean,
    public dbService?: NgxIndexedDBService
  ) {
    if (supportsCache) this.initCache();
    // No websocket during server-side rendering / prerendering.
    if (typeof document === 'undefined' || typeof WebSocket === 'undefined') {
      return;
    }
    this.setUrl(this.url);
  }

  protected setUrl(url: string | undefined) {
    if (!url) {
      let protocol;
      let port;
      switch (document.location.protocol) {
        case 'https:': {
          protocol = 'wss:';
          port = ':443';
          break;
        }
        default: {
          protocol = 'ws:';
          port = ':80';
          break;
        }
      }
      url = protocol + '//' + document.location.hostname + port + '/wss';
    }
    this.url = url;
    // Initial setup: nothing to tear down yet, just open the first connection.
    this.closed = false;
    this.connect(this.url as string);
  }

  private connect(url: string) {
    if (!this.target.___connectionId) {
      this.target.___connectionId = 0;
    }
    this.target.___connectionId++;

    if (
      this.ws &&
      (this.ws.readyState === WebSocket.CONNECTING ||
        this.ws.readyState === WebSocket.OPEN)
    ) {
      return;
    }

    this.create(url);
  }

  public initTabSuspendedListener() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          console.log(
            'ActiveConnect: Closing WebSocket due to tab suspension...'
          );
          this.disconnect(true);
        } else if (document.visibilityState === 'visible') {
          console.log('ActiveConnect: Reconnecting WebSocket...');
          this.closed = false;
          this.connect(this.url as string);
        }
      });
    }
  }

  private requestStack: any[] = [];
  private requestHistoryLogs: { timestamp: Date; method: string }[] = [];
  private logEntry(method: string) {
    this.requestHistoryLogs.push({ timestamp: new Date(Date.now()), method });
  }
  public get logs(): { timestamp: Date; method: string }[] {
    return this.requestHistoryLogs;
  }

  private _token = '';
  public get Token(): string {
    if (!this._token) {
      try {
        if (typeof window !== 'undefined' && window.localStorage)
          this._token = window.localStorage.getItem('token') || '';
      } catch {
        // storage unavailable (SSR, privacy mode)
      }
    }
    return this._token;
  }
  public set Token(val: string) {
    this._token = val;
    try {
      if (typeof window !== 'undefined' && window.localStorage)
        window.localStorage.setItem('token', val);
    } catch {
      // storage unavailable (SSR, privacy mode)
    }
  }

  private set Connected(value: boolean) {
    if (value) {
      this.sendBrowserInfoToServer();

      this.auth(this.Token)
        .catch((err) => {
          console.log('ActiveConnect: auth failed on reconnect: ' + err);
        })
        .then(() => {
          Promise.all(
            WebsocketClient.onReconnectCallback.map((c) =>
              c.Func ? c.Func() : null
            )
          ).then(() => {
            setTimeout(() => {
              this.resetRequestedState();
              this.requestStack.forEach((e) => {
                this.sendToSocket(e.method, e.data, false, e.messageId);
                this.requestStack = this.requestStack.filter((e1) => e1 != e);
              });
            }, 2000);
          });
        });
    }
    if (this.pool && this.pool.WssConnected) this.pool.WssConnected = value;
  }
  private static resetRequestedStateCallbacks: Function[] = [];
  private connectionEstablishedOnce: boolean = false;
  private resetRequestedState() {
    if (this.connectionEstablishedOnce) {
      // reset requested state for outbounds
      WebsocketClient.resetRequestedStateCallbacks.forEach((reset) => {
        reset(this);
      });
    } else {
      this.connectionEstablishedOnce = true;
    }
  }
  public static addResetRequestingStateCallback(callback: Function) {
    WebsocketClient.resetRequestedStateCallbacks.push(callback);
  }

  private static readonly HANDSHAKE_TIMEOUT_MS = 10000;
  private handshakeTimer: ReturnType<typeof setTimeout> | undefined;
  private clearHandshakeTimer() {
    if (this.handshakeTimer !== undefined) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = undefined;
    }
  }

  private create(url: string) {
    if (this.ws) {
      // Detach handlers first so the old socket's close event can't trigger
      // another reconnect cycle once it's no longer the "current" socket.
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      if (
        this.ws.readyState === WebSocket.CONNECTING ||
        this.ws.readyState === WebSocket.OPEN
      ) {
        this.ws.close();
      }
    }

    this.clearReconnectTimer();
    this.clearHandshakeTimer();

    this.closed = false;

    // create new connection
    this.logEntry('TCP/HTTP:CONNECT-SERVER');
    this.ws = new WebSocket(url + (this.supportsCache ? '?cache=true' : ''));

    this.handshakeTimer = setTimeout(() => {
      if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
        this.logEntry('TCP/HTTP:HANDSHAKE-TIMEOUT');
        console.log(
          'ActiveConnect: Handshake timed out, retrying connection...'
        );
        // Detach so the forced close below doesn't double-trigger reconnect logic.
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        try {
          this.ws.close();
        } catch (err) {
          // ignore - socket may already be in a bad state
        }
        if (!this.closed) {
          this.clearReconnectTimer();
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = undefined;
            this.connect(url);
          }, 1000);
        }
      }
    }, WebsocketClient.HANDSHAKE_TIMEOUT_MS);

    this.ws.onerror = (err) => {
      this.ws.close();
      this.logEntry('TCP/HTTP:ERROR:' + err);
      console.log('ActiveConnect: ' + err);
    };
    this.ws.onopen = () => {
      this.clearHandshakeTimer();
      this._connected.set(true);
      this.logEntry('TCP/HTTP:CONNECTED');
      this.Connected = true;
    };
    this.ws.onmessage = (e) => {
      let parsed;
      try {
        parsed = JsonParser.parse(e.data.toString());
      } catch (err) {
        // A malformed frame must not throw inside the onmessage handler -
        // that would silently kill message processing for the rest of the
        // connection's lifetime without ever surfacing an error.
        console.log('ActiveConnect: failed to parse incoming message: ' + err);
        return;
      }
      this.messageReceived(parsed);
    };
    this.ws.onclose = () => {
      this.clearHandshakeTimer();
      this._connected.set(false);
      this.logEntry('TCP/HTTP:CLOSED');
      if (!this.closed) {
        if (this.pool && this.pool.WssConnected) this.pool.WssConnected = false;
        this.logEntry('TCP/HTTP:RESET-REQUESTED-OUTBOUND-STATE');
        this.resetRequestedState();
        this.clearReconnectTimer();
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = undefined;
          this.connect(url);
        }, 1000);
      }
    };
  }

  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private clearReconnectTimer() {
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private messageId: number = 0;
  protected sendToSocket(
    method: string,
    data: any,
    dontEnsureTransmission?: boolean,
    forcedMessageId?: number
  ) {
    const messageId = forcedMessageId ?? ++this.messageId;
    if (this.ws.readyState != this.ws.OPEN) {
      if (!dontEnsureTransmission)
        this.requestStack.push({ method, data, messageId });
      else return false;
    } else {
      this.ws.send(JsonParser.stringify({ method, value: data, messageId }));
    }
    return messageId;
  }

  async auth(token: string): Promise<any> {
    return this.sendToSocket('auth.token', token);
  }

  public send(
    method: string,
    data: any,
    dontEnsureTransmission?: boolean
  ): Promise<any> {
    this.logEntry('SEND:' + method);
    const messageId = this.sendToSocket(
      method,
      data,
      dontEnsureTransmission || false
    );
    if (messageId) {
      return this.expectMethod(`m.${method}`, messageId);
    } else {
      return new Promise((resolve) => {
        resolve(false);
      });
    }
  }

  private rejectCallbacks: Map<number, Function> = new Map();
  private expectedMethods: Map<string | number, Array<Function>> = new Map();
  private expectMethod(method: string, messageId?: number | null) {
    return new Promise((resolve, reject) => {
      if (messageId) {
        this.expectedMethods.set(messageId, [resolve]);
        this.rejectCallbacks.set(messageId, reject);
      } else {
        if (this.expectedMethods.has(method)) {
          let arr = this.expectedMethods.get(method);
          (arr as Array<Function>).push(resolve);
        } else {
          this.expectedMethods.set(method, [resolve]);
        }
      }
    });
  }

  private messageReceived({
    method,
    value,
    messageId,
    specificHash,
    inserted,
    updated,
    deleted,
    length
  }: {
    method: string;
    value: any;
    messageId: number | null;
    specificHash: number | null;
    inserted: any[] | null;
    updated: any[] | null;
    deleted: any[] | null;
    length: number | null;
  }) {
    this.logEntry('RECEIVED:' + method);
    if (method == '___cache') {
      this.handleOutboundCacheRequest(value);
    }
    if (messageId) {
      if (method == 'm.error') {
        const reject = this.rejectCallbacks.get(messageId);
        if (reject) {
          reject(value);
        }
        messageId = -1;
      }
    }

    if (messageId != null) {
      const callback = this.expectedMethods.get(messageId);
      if (callback) {
        const func = callback.shift();
        if (func) func(value);
        this.invokeSuccessHandlers(method);
      } else {
        const callback = this.expectedMethods.get(method);
        if (callback && callback.length > 0) {
          const func = callback.shift();
          if (func) func(value);
        } else {
          const out = WebsocketClient.outbounds.get(method);
          if (out) {
            out(value, specificHash, inserted, updated, deleted, length, this);
          }
          const handle = WebsocketClient.handles.get(method);
          if (handle) {
            (handle.Func as Function)(value);
          }
        }
      }
    } else {
      throw Error(
        'No MessageId was provided, the connection is not supported.'
      );
    }
  }

  private handleOutboundCacheRequest(method: string) {
    if (this.dbService) {
      try {
        this.dbService.getByKey('outbound', method).subscribe((item: any) => {
          if (item) {
            this.send('___cache', {
              method,
              specificHash: item.specificHash || null
            });
          } else {
            this.send('___cache', {
              method,
              specificHash: null
            });
          }
        });
      } catch (e) {
        this.send('___cache', {
          method,
          specificHash: null
        });
        console.error('ActiveConnect: ' + e);
      }
    } else {
      this.send('___cache', {
        method,
        specificHash: null
      });
      console.error(
        'Active-Connect: Caching not possible as the indexedDB has not been initialized'
      );
    }
  }

  private static outbounds: Map<
    string,
    (
      data: any,
      specificHash: number | null,
      inserted: any[] | null,
      updated: any[] | null,
      deleted: any[] | null,
      length: number | null,
      _this: WebsocketClient
    ) => void
  > = new Map();
  static expectOutbound(
    method: string,
    callback: (
      data: any,
      specificHash: number | null,
      inserted: any[] | null,
      updated: any[] | null,
      deleted: any[] | null,
      length: number | null,
      _this: WebsocketClient
    ) => void
  ) {
    WebsocketClient.outbounds.set(method, callback);
  }

  private static handles: Map<string, DecorableFunction> = new Map();
  static registerHandle(method: string, callback: DecorableFunction) {
    WebsocketClient.handles.set(method, callback);
  }

  public get isConnected(): boolean {
    this._connected(); // register a signal dependency for templates / computed
    if (this.ws) return this.ws.readyState == WebSocket.OPEN;
    return true;
  }

  private sendBrowserInfoToServer() {
    // send browser / os information
    const browser = this.getBrowser();
    const os = this.getOS();
    this.send('___browser', {
      browser: `${browser.name} ${browser.version} ${os}`
    });
  }

  public getBrowser(): { name: string; version: string } {
    // https://www.gregoryvarghese.com/how-to-get-browser-name-and-version-via-javascript/
    var ua = navigator.userAgent,
      tem,
      M =
        ua.match(
          /(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i
        ) || [];
    if (/trident/i.test(M[1])) {
      tem = /\brv[ :]+(\d+)/g.exec(ua) || [];
      return { name: 'IE ', version: tem[1] || '' };
    }
    if (M[1] === 'Chrome') {
      tem = ua.match(/\bOPR\/(\d+)/);
      if (tem != null) {
        return { name: 'Opera', version: tem[1] };
      }
    }
    M = M[2] ? [M[1], M[2]] : [navigator.appName, navigator.appVersion, '-?'];
    if ((tem = ua.match(/version\/(\d+)/i)) != null) {
      M.splice(1, 1, tem[1]);
    }
    return {
      name: M[0],
      version: M[1]
    };
  }

  public getOS(): string {
    var userAgent = window.navigator.userAgent,
      platform = window.navigator.platform,
      macosPlatforms = ['Macintosh', 'MacIntel', 'MacPPC', 'Mac68K'],
      windowsPlatforms = ['Win32', 'Win64', 'Windows', 'WinCE'],
      iosPlatforms = ['iPhone', 'iPad', 'iPod'],
      os = null;

    if (macosPlatforms.indexOf(platform) !== -1) {
      os = 'Mac OS';
    } else if (iosPlatforms.indexOf(platform) !== -1) {
      os = 'iOS';
    } else if (windowsPlatforms.indexOf(platform) !== -1) {
      os = 'Windows';
    } else if (/Android/.test(userAgent)) {
      os = 'Android';
    } else if (!os && /Linux/.test(platform)) {
      os = 'Linux';
    }

    return os || '';
  }

  private static onSuccessHandlers: {
    callback: DecorableFunction;
    regexp: RegExp;
  }[] = [];
  public static onSuccess(callback: DecorableFunction, regexp: RegExp) {
    this.onSuccessHandlers.push({ callback, regexp });
  }

  private static onReconnectCallback: DecorableFunction[] = [];
  static onReconnect(callback: DecorableFunction) {
    WebsocketClient.onReconnectCallback.push(callback);
  }

  private invokeSuccessHandlers(method: string) {
    WebsocketClient.onSuccessHandlers
      .filter((e) => e.regexp.test(method))
      .forEach((e) => {
        var res = (e.callback.Func as Function)();
        if (res && res.then) {
          res.then();
        }
      });
  }

  public closed = false;
  public disconnect(restart?: boolean) {
    this.closed = true;
    this._connected.set(false);

    this.clearReconnectTimer();
    this.clearHandshakeTimer();

    if (this.ws) this.ws.close();

    if (!restart && this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
    }
  }

  private initCache() {}

  get target(): any {
    return (this as any).__proto__;
  }
}
