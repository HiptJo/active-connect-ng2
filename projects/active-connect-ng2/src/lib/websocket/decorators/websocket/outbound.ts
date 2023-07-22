import { WebsocketClient } from '../../client';

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
        specificHash: number | null,
        inserted: any[] | null,
        updated: any[] | null,
        deleted: any[] | null,
        _this: WebsocketClient
      ) {
        if (!target.___received) target.___received = {};
        if (!target.___data) target.___data = {};
        if (!target.___received) target.___received = {};
        if (!target.___requested) target.___requested = {};
        if (!cached) {
          if (_this.dbService)
            _this.dbService.deleteByKey('outbound', method).subscribe(() => {});
        }

        if (data == 'cache_restore') {
          if (_this.dbService) {
            _this.dbService
              .getByKey('outbound', method)
              .subscribe((result: any) => {
                target.___received[propertyKey] = true;
                target.___data[propertyKey] = result.data;
                target.loading.set(propertyKey, false);
              });
          } else {
            console.error(
              'Active - Connect: Caching / restore not possible as the indexedDB is not accessible'
            );
          }
        } else if (data == 'cache_delete') {
          if (_this.dbService) {
            _this.dbService.deleteByKey('outbound', method).subscribe(() => {});
          } else {
            console.error(
              'Active - Connect: Caching / restore not possible as the indexedDB is not accessible'
            );
          }
          target.___received[propertyKey] = false;
          target.___data[propertyKey] = undefined;
          target.loading.set(propertyKey, false);
        } else if (data == 'data_diff') {
          var data = target.___data[propertyKey] || [];
          inserted?.forEach((e) => {
            data.push(e);
          });
          updated?.forEach((e) => {
            data = data.filter((d: any) => d.id == e.id);
            data.push(e);
          });
          deleted?.forEach((e) => {
            data = data.filter((d: any) => d.id == e.id);
          });
          target.___data[propertyKey] = data;
          target.loading.set(propertyKey, false);

          if (cached && globalHash && specificHash) {
            if (_this.dbService) {
              _this.dbService
                .update('outbound', {
                  method,
                  data,
                  globalHash,
                  specificHash,
                })
                .subscribe(() => {});
              console.log('updated outbound');
            } else {
              console.error(
                'Active-Connect: Caching not possible as the indexedDB has not been initialized'
              );
            }
          }
        } else {
          target.___received[propertyKey] = true;
          target.___data[propertyKey] = data;
          target.loading.set(propertyKey, false);
          if (cached && globalHash && specificHash) {
            if (_this.dbService) {
              _this.dbService
                .update('outbound', {
                  method,
                  data,
                  globalHash,
                  specificHash,
                })
                .subscribe(() => {});
              console.log('updated outbound');
            } else {
              console.error(
                'Active-Connect: Caching not possible as the indexedDB has not been initialized'
              );
            }
          }
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
