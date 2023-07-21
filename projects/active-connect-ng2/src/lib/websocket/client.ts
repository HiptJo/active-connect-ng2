import { DecorableFunction } from './decorators/function';
import { JsonParser } from './json/json-parser';

export class WebsocketClient {
  ws!: WebSocket;
  pool!: { WssConnected: boolean } | null;

  constructor(private url?: string, private supportsCache?: boolean) {
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
      this.url = protocol + '//' + document.location.hostname + port + '/wss';
    }
    this.connect(this.url as string);
  }

  subject: any;

  private connect(url: string) {
    if (!this.subject) {
      this.create(url);
    }
    return this.subject;
  }

  private requestStack: any[] = [];

  private _token = '';
  public get Token(): string {
    if (!this._token) {
      if (window.localStorage)
        this._token = window.localStorage.getItem('token') || '';
    }
    return this._token;
  }
  public set Token(val: string) {
    this._token = val;
    if (window.localStorage) window.localStorage.setItem('token', val);
  }

  private set Connected(value: boolean) {
    if (value) {
      this.sendBrowserInfoToServer();

      this.resetRequestedState();
      this.auth(this.Token).then(() => {
        this.requestStack.forEach((e) => {
          this.sendToSocket(e.method, e.data);
          this.requestStack = this.requestStack.filter((e1) => e1 != e);
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
        reset();
      });
    } else {
      this.connectionEstablishedOnce = true;
    }
  }
  public static addResetRequestingStateCallback(callback: Function) {
    WebsocketClient.resetRequestedStateCallbacks.push(callback);
  }

  private create(url: string) {
    // create new connection
    this.ws = new WebSocket(url + (this.supportsCache ? '?cache=true' : ''));
    this.ws.onerror = (err) => {
      this.ws.close();
      console.log(err);
    };
    this.ws.onopen = () => {
      this.Connected = true;
    };
    this.ws.onmessage = (e) => {
      this.messageReceived(JsonParser.parse(e.data.toString()));
    };
    this.ws.onclose = () => {
      if (!this.closed) {
        if (this.pool && this.pool.WssConnected) this.pool.WssConnected = false;
        setTimeout(() => {
          this.connect(url);
        }, 1000);
      }
    };
  }

  private messageId: number = 0;
  protected sendToSocket(
    method: string,
    data: any,
    dontEnsureTransmission?: boolean
  ) {
    const messageId = ++this.messageId;
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

  private expectedMethods: Map<string | number, Array<Function>> = new Map();
  private expectMethod(method: string, messageId?: number | null) {
    return new Promise((resolve) => {
      if (messageId) {
        this.expectedMethods.set(messageId, [resolve]);
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
    globalHash,
    specificHash,
  }: {
    method: string;
    value: any;
    messageId: number | null;
    globalHash: number | null;
    specificHash: number | null;
  }) {
    if (method == '___cache') {
      this.handleOutboundCacheRequest(value);
    }
    if (messageId) {
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
            out(value, globalHash, specificHash);
          } else {
            const handle = WebsocketClient.handles.get(method);
            if (handle) {
              (handle.Func as Function)(value);
            }
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
    const item = localStorage.getItem('ac_oc_' + method);
    if (item) {
      const data: any = JSON.parse(item);
      this.send('___cache', {
        method,
        globalHash: data.globalHash || null,
        specificHash: data.specificHash || null,
      });
    } else {
      this.send('___cache', {
        method,
        globalHash: null,
        specificHash: null,
      });
    }
  }

  private static outbounds: Map<
    string,
    (data: any, globalHash: number | null, specificHash: number | null) => void
  > = new Map();
  static expectOutbound(
    method: string,
    callback: (
      data: any,
      globalHash: number | null,
      specificHash: number | null
    ) => void
  ) {
    WebsocketClient.outbounds.set(method, callback);
  }

  private static handles: Map<string, DecorableFunction> = new Map();
  static registerHandle(method: string, callback: DecorableFunction) {
    WebsocketClient.handles.set(method, callback);
  }

  public get isConnected(): boolean {
    if (this.ws) return this.ws.readyState == WebSocket.OPEN;
    return true;
  }

  private sendBrowserInfoToServer() {
    // send browser / os information
    const browser = this.getBrowser();
    const os = this.getOS();
    this.send('___browser', {
      browser: `${browser.name} ${browser.version} ${os}`,
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
      version: M[1],
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
    if (!restart) this.closed = true;
    this.ws.close();
  }
}
