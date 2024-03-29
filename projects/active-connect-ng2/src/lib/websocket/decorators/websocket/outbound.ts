import { WebsocketClient } from '../../client';

export function Outbound(
  method: string,
  requestingRequired?: boolean,
  cached?: boolean,
  sortBy?: (a: any, b: any) => number
) {
  return function _Outbound(target: any, propertyKey: string): any {
    target.loading = new Map<string, boolean>();
    // property annotation
    WebsocketClient.expectOutbound(
      method,
      function setOutbound(
        data: any,
        specificHash: number | null,
        inserted: any[] | null,
        updated: any[] | null,
        deleted: any[] | null,
        length: number | null,
        _this: WebsocketClient
      ) {
        if (!target.___received) target.___received = {};
        if (!target.___data) target.___data = {};
        if (!target.___received) target.___received = {};
        if (!target.___requested) target.___requested = {};
        if (!cached) {
          if (_this.dbService) {
            try {
              _this.dbService
                .deleteByKey('outbound', method)
                .subscribe(() => {});
            } catch (e) {
              console.error(
                'ActiveConnect: could not delete indexdb cache entry'
              );
            }
          }
        }

        if (data == 'cache_restore') {
          if (_this.dbService) {
            try {
              _this.dbService
                .getByKey('outbound', method)
                .subscribe((result: any) => {
                  target.___received[propertyKey] = true;
                  target.___data[propertyKey] = result.data;
                  target.loading.set(propertyKey, false);
                });
            } catch (e) {
              console.error('ActiveConnect: Unable to restore cached data.');
              console.error(e);
            }
          } else {
            console.error(
              'ActiveConnect: Caching / restore not possible as the indexedDB is not accessible'
            );
          }
        } else if (data == 'cache_delete') {
          if (_this.dbService) {
            try {
              _this.dbService
                .deleteByKey('outbound', method)
                .subscribe(() => {});
            } catch (e) {
              console.error('ActiveConnect: Unable to delete cached data');
              console.error(e);
            }
          } else {
            console.error(
              'ActiveConnect: Caching / restore not possible as the indexedDB is not accessible'
            );
          }
          target.___received[propertyKey] = false;
          target.___data[propertyKey] = undefined;
          target.loading.set(propertyKey, false);
        } else if (data == 'data_delete') {
          target.___data[propertyKey] = undefined;
          target.loading.set(propertyKey, false);
          target.___received[propertyKey] = false;
          target.___requested[propertyKey] = false;
        } else if (data == 'data_diff') {
          var data = target.___data[propertyKey] || [];
          inserted?.forEach((e) => {
            const matching = data.filter((d: any) => d.id == e.id);
            if (matching.length > 0) {
              data[data.indexOf(matching[0])] = e;
            } else {
              data.push(e);
            }
          });
          updated?.forEach((e) => {
            const matching = data.filter((d: any) => d.id == e.id);
            if (matching.length > 0) {
              data[data.indexOf(matching[0])] = e;
            } else {
              data.push(e);
            }
          });
          deleted?.forEach((e) => {
            data = data.filter((d: any) => d.id != e.id);
          });
          if (sortBy && data) data = data.sort(sortBy);
          target.___data[propertyKey] = data;
          target.loading.set(propertyKey, false);

          if (cached && specificHash) {
            if (_this.dbService) {
              if (data && data?.length > 0) {
                try {
                  _this.dbService
                    .update('outbound', {
                      method,
                      data,
                      specificHash,
                    })
                    .subscribe(() => {});
                } catch (e) {
                  console.error('ActiveConnect: Unable to update cached data');
                  console.error(e);
                }
              } else {
                try {
                  _this.dbService
                    .deleteByKey('outbound', method)
                    .subscribe(() => {});
                } catch (e) {
                  console.error('ActiveConnect: Unable to delete cached data');
                  console.error(e);
                }
              }
            } else {
              console.error(
                'ActiveConnect: Caching not possible as the indexedDB has not been initialized'
              );
            }
          }
        } else {
          if (sortBy && data) data = data.sort(sortBy);
          target.___received[propertyKey] = true;
          target.___data[propertyKey] = data;
          target.loading.set(propertyKey, false);
          if (cached && specificHash) {
            if (_this.dbService) {
              if (data && data?.length > 0) {
                try {
                  _this.dbService
                    .update('outbound', {
                      method,
                      data,
                      specificHash,
                    })
                    .subscribe(() => {});
                } catch (e) {
                  console.error('ActiveConnect: Unable to update cached data');
                  console.error(e);
                }
              } else {
                try {
                  _this.dbService
                    .deleteByKey('outbound', method)
                    .subscribe(() => {});
                } catch (e) {
                  console.error('ActiveConnect: Unable to update cached data');
                  console.error(e);
                }
              }
            } else {
              console.error(
                'ActiveConnect: Caching not possible as the indexedDB has not been initialized'
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

    const obj = {
      configurable: true,
      get() {
        if (!target.___requested) target.___requested = {};
        if (requestingRequired && !target.___requested[propertyKey]) {
          target.___requested[propertyKey] = true;
          (this as any).send('request.' + method, null).then();
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
        if (sortBy && val) val = val.sort(sortBy);
        return (target.___data[propertyKey] = val);
      },
    };
    target[propertyKey] = obj;
    return obj;
  };
}
