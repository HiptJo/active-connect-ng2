import { WebsocketClient } from 'active-connect-ng2';
import { Observable, Observer } from 'rxjs';

export interface IdObject {
  id: number;
}

export class OutboundObject<T extends IdObject> {
  private previouslyCachedCount: number | undefined;
  constructor(
    private client: WebsocketClient,
    private method: string,
    private lazyLoaded?: boolean,
    public readonly cached?: boolean,
    private initialLoadingCount?: number
  ) {
    this.target.loading = new Map<string, boolean>();

    if (this.client.dbService) {
      this.client.dbService
        .getByKey('outbound', method)
        .subscribe((result: any) => {
          if (result) {
            this.previouslyCachedCount = result.length || null;
          }
        });
    }

    const _this = this;
    WebsocketClient.expectOutbound(
      method,
      function setOutbound(
        data: any,
        specificHash: number | null,
        insertedOrGroupData: any[] | null,
        updatedOrGroupId: any[] | null,
        deleted: any[] | null,
        length: number | null,
        _client: WebsocketClient
      ) {
        if (!cached) {
          if (_client.dbService)
            _client.dbService
              .deleteByKey('outbound', method)
              .subscribe(() => {});
        }

        if (data == 'cache_restore') {
          if (_client.dbService) {
            _client.dbService
              .getByKey('outbound', method)
              .subscribe((result: any) => {
                _this._loading = false;
                if (result.length) _this._length = result.length;
                _this.setData(result.data);
              });
          } else {
            console.error(
              'Active - Connect: Caching / restore not possible as the indexedDB is not accessible'
            );
          }
        } else if (data == 'cache_delete') {
          if (_client.dbService) {
            _client.dbService
              .deleteByKey('outbound', method)
              .subscribe(() => {});
          } else {
            console.error(
              'Active - Connect: Caching / restore not possible as the indexedDB is not accessible'
            );
          }
          _this._loading = false;
          _this.requested = false;
        } else if (data == 'data_delete') {
          _this.data = undefined;
          _this.dataMap = new Map();
          _this.requested = false;
          _this.loadedGroupData = null;
          _this.loadedGroupId = null;
          _this._length = undefined;
        } else if (data == 'data_group') {
          _this.loadedGroupData = insertedOrGroupData;
          _this.loadedGroupId = updatedOrGroupId ? updatedOrGroupId[0] : 0;
          _this.loadedGroupChanged?.next(insertedOrGroupData as T[]);
        } else if (data == 'data_id') {
          _this.loadedIdData =
            (insertedOrGroupData?.length || 0) > 0
              ? (insertedOrGroupData as any[])[0]
              : null;
          _this.loadedId = updatedOrGroupId ? updatedOrGroupId[0] : 0;
          _this.loadedIdChanged?.next(_this.loadedIdData as T);
        } else if (data == 'data_diff') {
          var value = _this.data || [];
          insertedOrGroupData?.forEach((e) => {
            _this.dataMap.set(e.id, e);
          });
          updatedOrGroupId?.forEach((e) => {
            _this.dataMap.set(e.id, e);
          });
          deleted?.forEach((e) => {
            _this.dataMap.delete(e.id);
          });
          _this.data = Array.from(_this.dataMap.values());
          _this._loading = false;

          if (cached && specificHash) {
            if (_client.dbService) {
              _client.dbService
                .update('outbound', {
                  method,
                  data,
                  specificHash,
                  length,
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
          _this.setData(data);
          _this._loading = false;
          if (cached && specificHash) {
            if (_client.dbService) {
              _client.dbService
                .update('outbound', {
                  method,
                  data,
                  specificHash,
                  length,
                })
                .subscribe(() => {});
            } else {
              console.error(
                'Active-Connect: Caching not possible as the indexedDB has not been initialized'
              );
            }
          }
        }
        if (length) _this._length = length;
      }
    );
  }

  get target(): any {
    return (this.client as any).__proto__;
  }

  private dataMap: Map<number, T> = new Map();
  private data: T[] | undefined = undefined;

  public get(id: number): Observable<T> {
    const observable = new Observable<T>((observer) => {
      this.loadedIdChanged = observer;
    });

    new Promise<void>(async (resolve) => {
      if (!this.requested && this.lazyLoaded) {
        await this.load();
      }
      if (this.data) {
        const res = this.dataMap.get(id);
        if (res) {
          this.loadedIdChanged?.next(res);
          resolve();
          return;
        }
        if (this.loadedId == id) {
          this.loadedIdChanged?.next(this.loadedIdData as T);
        }
      } else {
        await this.requestById(id);
      }
      resolve();
    }).then();
    return observable;
  }

  public getForGroup(groupId: number): Observable<T[]> {
    const observable = new Observable<T[]>((observer) => {
      this.loadedGroupChanged = observer;
    });
    new Promise<void>(async (resolve) => {
      if (!this.requested && this.lazyLoaded) {
        await this.load();
      }
      if (this.loadedGroupId == groupId) {
        this.loadedGroupChanged?.next(this.loadedGroupData as T[]);
      } else {
        await this.requestForGroup(groupId);
      }
      resolve();
    }).then();
    return observable;
  }

  public get all(): T[] | undefined {
    if (!this.requested && this.lazyLoaded) {
      this.load().then();
    }
    return this.data;
  }

  private requested: boolean = false;
  public async load(count?: number): Promise<void> {
    if (this.lazyLoaded) {
      this.requested = true;
      this._loading = true;
      await this.client.send('request.' + this.method, {
        count: count || this.initialLoadingCount,
        loaded: this.loadedLength,
      });
      this._loading = false;
    } else {
      throw Error(
        'Active-Connect: Cannot run loading request as this outbound is not lazy-loaded.'
      );
    }
  }

  private _loading = false;
  public get loading(): boolean {
    return this._loading;
  }
  public get loadedLength(): number {
    return this.data?.length || 0;
  }
  private _length: number | undefined = undefined;
  public get length(): number | undefined {
    return this._length;
  }

  private loadedId: number | null = null;
  private loadedIdData: T | null = null;
  private loadedIdChanged: Observer<T> | null = null;
  private requestById(id: number): Promise<any> {
    return this.client.send('request.' + this.method, { id }) as Promise<any>;
  }

  private loadedGroupId: number | null = null;
  private loadedGroupData: T[] | null = null;
  private loadedGroupChanged: Observer<T[]> | null = null;
  private requestForGroup(groupId: number): Promise<T[]> {
    return this.client.send('request.' + this.method, { groupId });
  }

  private setData(data: T[] | { added: T[] | undefined; length: number }) {
    this.data = data as T[];
    this._length = data.length;
    this.dataMap = new Map();
    this.data.forEach((d) => {
      this.dataMap.set(d.id, d);
    });
  }

  get isEmpty() {
    return this.data == undefined;
  }
}
