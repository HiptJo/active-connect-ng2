import { WebsocketClient } from '../../client';
import { JsonParser } from '../../json/json-parser';

export function Outbound(
  method: string,
  requestingRequired?: boolean,
  cached?: boolean
) {
  return function _Outbound(target: any, propertyKey: string): any {
    target.loading = new Map<string, boolean>();
    // property annotation
    WebsocketClient.expectOutbound(
      method,
      function setOutbound(
        data: any,
        globalHash: number | null,
        specificHash: number | null
      ) {
        if (!target.___received) target.___received = {};
        if (!target.___data) target.___data = {};
        if (!target.___received) target.___received = {};
        if (!target.___requested) target.___requested = {};
        if (!cached) {
          localStorage.removeItem('ac_oc_' + method);
        }

        if (data == 'cache_restore') {
          const result = localStorage.getItem('ac_oc_' + method);
          const data = result ? JsonParser.parse(result) : result;
          target.___received[propertyKey] = true;
          target.___data[propertyKey] = data.data;
          target.loading.set(propertyKey, false);
        } else if (data == 'cache_delete') {
          localStorage.removeItem('ac_oc_' + method);
          target.___received[propertyKey] = false;
          target.___data[propertyKey] = undefined;
          target.loading.set(propertyKey, false);
        } else {
          if (cached && globalHash && specificHash) {
            localStorage.setItem(
              'ac_oc_' + method,
              JSON.stringify({
                data,
                globalHash,
                specificHash,
              })
            );
          }
          target.___received[propertyKey] = true;
          target.___data[propertyKey] = data;
          target.loading.set(propertyKey, false);
        }
      }
    );
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
        if (requestingRequired && !target.___requested[propertyKey]) {
          target.___requested[propertyKey] = true;
          this.send('request.' + method, null).then();
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
