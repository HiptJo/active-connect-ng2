import { WebsocketClient } from '../../client';

export function Outbound(method: string, requestingRequired?: boolean) {
  return function _Outbound(target: any, propertyKey: string): any {
    target.loading = new Map<string, boolean>();
    // property annotation
    WebsocketClient.expectOutbound(method, function setOutbound(data: any) {
      if (!target.___received) target.___received = {};
      if (!target.___data) target.___data = {};
      target.___received[propertyKey] = true;
      target.___data[propertyKey] = data;
      target.loading.set(propertyKey, false);
    });
    if (requestingRequired) {
      WebsocketClient.addResetRequestingStateCallback(function callback() {
        if (target.___requested) {
          target.___requested[propertyKey] = false;
        }
      });
    }
    return {
      configurable: true,
      writeable: true,
      get() {
        if (!target.___received) target.___received = {};
        if (!target.___requested) target.___requested = {};
        if (requestingRequired && !target.___requested[propertyKey]) {
          target.___requested[propertyKey] = true;
          this.client.send('request.' + method, null).then();
        }
        if (!target.___data) target.___data = {};
        if (!target.___data[propertyKey]) {
          target.loading.set(propertyKey, true);
        } else if (target.loading[propertyKey]) {
          target.loading.set(propertyKey, false);
        }
        return target.___data[propertyKey];
      },
      set(val: any) {
        if (!target.___data) target.___data = {};
        target.loading.set(propertyKey, false);
        return (target.___data[propertyKey] = val);
      },
    };
  };
}
