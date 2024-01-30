import { Observable, Observer } from 'rxjs';
import { WebsocketClient } from '../client';

export interface IdObject {
  id: number | null | undefined;
}

export class OutboundObject<T extends IdObject> {
  private previouslyCachedCount: number | undefined;
  constructor(
    private client: WebsocketClient,
    private method: string,
    private lazyLoaded?: boolean,
    public readonly cached?: boolean,
    private initialLoadingCount?: number,
    private sortBy?: (a: T, b: T) => number
  ) {
    this.target.loading = new Map<string, boolean>();

    if (this.client.dbService) {
      try {
        this.client.dbService
          .getByKey('outbound', method)
          .subscribe((result: any) => {
            if (result) {
              this.previouslyCachedCount = result.data?.length || null;
            }
          });
      } catch (e) {
        console.error('ActiveConnect: Unable to read cached data');
        console.error(e);
      }
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
          if (_client.dbService) {
            try {
              _client.dbService
                .deleteByKey('outbound', method)
                .subscribe(() => {});
            } catch (e) {
              console.error('ActiveConnect: Unable to delete cached data');
              console.error(e);
            }
          }
        }

        if (data == 'cache_restore') {
          if (_client.dbService) {
            try {
              _client.dbService
                .getByKey('outbound', method)
                .subscribe((result: any) => {
                  _this.setData(result.data);
                  if (result.length) _this._length = result.length;
                  _this.loading = false;
                });
            } catch (e) {
              console.error('ActiveConnect: Unable to restore cached data');
              console.error(e);
            }
          } else {
            console.error(
              'ActiveConnect: Caching / restore not possible as the indexedDB is not accessible'
            );
          }
        } else if (data == 'cache_delete') {
          if (_client.dbService) {
            try {
              _client.dbService
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
          _this.loading = false;
          _this.requested = false;
        } else if (data == 'data_delete') {
          _this.data = undefined;
          _this.dataMap = new Map();
          _this.requested = false;
          _this.loadedGroupData = null;
          _this.loadedGroupId = null;
          _this._length = undefined;
          _this.loading = false;
        } else if (data == 'data_group') {
          if (
            _this.requestedGroupId ==
            (updatedOrGroupId ? updatedOrGroupId[0] : 0)
          ) {
            _this.loadedGroupData = insertedOrGroupData;
            _this.loadedGroupId = updatedOrGroupId ? updatedOrGroupId[0] : 0;
            _this.loadedGroupChanged?.next(insertedOrGroupData as T[]);
            _this.loading = false;
          }
        } else if (data == 'data_id') {
          if (
            _this.requestedId == (updatedOrGroupId ? updatedOrGroupId[0] : 0)
          ) {
            _this.loadedIdData =
              (insertedOrGroupData?.length || 0) > 0
                ? (insertedOrGroupData as any[])[0]
                : null;
            _this.loadedId = updatedOrGroupId ? updatedOrGroupId[0] : 0;
            _this.loadedIdChanged?.next(_this.loadedIdData as T);
            _this.loading = false;
          }
        } else if (data == 'data_diff') {
          insertedOrGroupData?.forEach((e) => {
            _this.dataMap.set(e.id, e);
            if (e.id == _this.loadedId) {
              _this.loadedIdChanged?.next(e);
            }
          });
          updatedOrGroupId?.forEach((e) => {
            _this.dataMap.set(e.id, e);
            if (e.id == _this.loadedId) {
              _this.loadedIdChanged?.next(e);
            }
          });
          deleted?.forEach((e) => {
            _this.dataMap.delete(e.id);
            if (e.id == _this.loadedId) {
              _this.loadedIdChanged?.next(null as any);
            }
          });
          _this.data = Array.from(_this.dataMap.values());
          if (_this.data && _this.sortBy)
            _this.data = _this.data.sort(_this.sortBy);
          _this.loading = false;

          if (cached && specificHash) {
            if (_client.dbService) {
              try {
                if (_this.data && _this.data?.length > 0) {
                  _client.dbService
                    .update('outbound', {
                      method,
                      data: _this.data,
                      specificHash,
                      length,
                    })
                    .subscribe(() => {});
                } else {
                  _client.dbService
                    .deleteByKey('outbound', method)
                    .subscribe(() => {});
                }
              } catch (e) {
                console.error('ActiveConnect: Unable to update cached data.');
                console.error(e);
              }
            } else {
              console.error(
                'ActiveConnect: Caching not possible as the indexedDB has not been initialized'
              );
            }
          }
        } else {
          _this.setData(data);
          if (_this.loadedId) {
            const loadedValue = _this.dataMap.get(_this.loadedId);
            if (loadedValue) {
              _this.loadedIdData = loadedValue;
              _this.loadedIdChanged?.next(_this.loadedIdData);
            }
          }
          _this.loading = false;
          if (cached && specificHash) {
            if (_client.dbService) {
              try {
                if (data && data?.length > 0) {
                  _client.dbService
                    .update('outbound', {
                      method,
                      data,
                      specificHash,
                      length,
                    })
                    .subscribe(() => {});
                } else {
                  _client.dbService
                    .deleteByKey('outbound', method)
                    .subscribe(() => {});
                }
              } catch (e) {
                console.error('ActiveConnect: Unable to update cached data.');
                console.error(e);
              }
            } else {
              console.error(
                'ActiveConnect: Caching not possible as the indexedDB has not been initialized'
              );
            }
          }
        }
        if (length) _this._length = length;
      }
    );

    WebsocketClient.addResetRequestingStateCallback(() => {
      this.afterServerReconnected();
    });
  }

  get target(): any {
    return (this.client as any).__proto__;
  }

  private dataMap: Map<number | null | undefined, T> = new Map();
  private data: T[] | undefined = undefined;

  public get(id: number): Observable<T> {
    if (this.requestedId == id && this.loadedObservable && this.loadedIdData) {
      if (this.loadedIdData)
        setTimeout(() => {
          if (this.loadedIdData) this.loadedIdChanged?.next(this.loadedIdData);
        }, 50);
      return this.loadedObservable;
    }

    let observablePromise: Promise<any> | undefined;
    if (this.requestedId != id || !this.loadedObservable) {
      observablePromise = new Promise<void>((resolve) => {
        this.loadedObservable = new Observable<T>((observer: Observer<T>) => {
          this.loadedIdChanged = observer;
          resolve();
        });
      });
    }

    Promise.all([observablePromise]).then(() => {
      new Promise<void>(async (resolve) => {
        if (!this.requested && this.lazyLoaded) {
          this.load().then();
        }
        if (this.data) {
          const res = this.dataMap.get(id);
          if (res) {
            this.loadedIdChanged?.next(res);
            resolve();
            return;
          }
        }
        if (this.loadedId == id) {
          this.loadedIdChanged?.next(this.loadedIdData as T);
        } else {
          await this.requestById(id);
        }
        resolve();
      }).then();
    });
    return this.loadedObservable as Observable<T>;
  }

  public getForGroup(groupId: number): Observable<T[]> {
    if (
      this.requestedGroupId == groupId &&
      this.loadedGroupObservable &&
      this.loadedGroupData
    ) {
      setTimeout(() => {
        if (this.loadedGroupData)
          this.loadedGroupChanged?.next(this.loadedGroupData);
      }, 50);
      return this.loadedGroupObservable;
    }

    let observablePromise: Promise<any> | undefined;
    if (this.requestedGroupId != groupId || !this.loadedGroupObservable) {
      observablePromise = new Promise<void>((resolve) => {
        this.loadedGroupObservable = new Observable<T[]>(
          (observer: Observer<T[]>) => {
            this.loadedGroupChanged = observer;
            resolve();
          }
        );
      });
    }

    Promise.all([observablePromise]).then(() => {
      new Promise<void>(async (resolve) => {
        if (!this.requested && this.lazyLoaded) {
          this.load().then();
        }
        if (this.loadedGroupId == groupId && this.loadedGroupData) {
          this.loadedGroupChanged?.next(this.loadedGroupData as T[]);
        } else {
          await this.requestForGroup(groupId);
        }
        resolve();
      }).then();
    });
    return this.loadedGroupObservable as Observable<T[]>;
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
      const hasBeenRequestedBefore = this.requested;
      this._loading = true;
      if (!this.requested) {
        this.loading = true;
      }
      this.requested = true;
      await this.client.send('request.' + this.method, {
        count: hasBeenRequestedBefore
          ? this.data
            ? count || this.initialLoadingCount
              ? (count || (this.initialLoadingCount as number)) +
                this.loadedLength
              : undefined
            : undefined
          : this.previouslyCachedCount || (this.initialLoadingCount as number),
        loaded: this.loadedLength,
      });
    } else {
      throw Error(
        'Active-Connect: Cannot run loading request as this outbound is not lazy-loaded.'
      );
    }
  }

  private _loading = false;
  private set loading(value: boolean) {
    this._loading = value;
    this.target.loading.set(this.method, value);
  }
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

  private requestedId: number | null = null;
  private loadedObservable: Observable<T> | null = null;
  private loadedId: number | null = null;
  private loadedIdData: T | null = null;
  private loadedIdChanged: Observer<T> | null = null;
  private requestById(id: number): Promise<any> {
    this.loading = true;
    this.requestedId = id;
    return this.client.send('request.' + this.method, { id }) as Promise<any>;
  }

  private requestedGroupId: number | null = null;
  private loadedGroupObservable: Observable<T[]> | null = null;
  private loadedGroupId: number | null = null;
  private loadedGroupData: T[] | null = null;
  private loadedGroupChanged: Observer<T[]> | null = null;
  private requestForGroup(groupId: number): Promise<T[]> {
    this.loading = true;
    this.requestedGroupId = groupId;
    return this.client.send('request.' + this.method, { groupId });
  }

  private setData(data: T[] | { added: T[] | undefined; length: number }) {
    this.data = data as T[];
    if (this.data && this.sortBy) this.data = this.data.sort(this.sortBy);
    this._length = data.length;
    this.dataMap = new Map();
    this.data.forEach((d) => {
      this.dataMap.set(d.id, d);
    });
  }

  get isEmpty() {
    return this.data == undefined;
  }

  /**
   * The contained data can be modified within the callback method
   */
  public update(callback: (data: T[]) => void) {
    if (this.data) {
      const updateLengthVariable = this.data.length == this._length;
      const length = this.length;
      callback(this.data);
      this.setData(this.data);
      if (!updateLengthVariable) {
        this._length = length;
      }
    }
  }

  private afterServerReconnected() {
    if (this.requested && this.lazyLoaded) {
      this.requested = false;
      this.load(1).then();
    }
    if (this.loadedId) {
      this.loadedIdData = null;
      this.get(this.loadedId);
    }
    if (this.loadedGroupId) {
      this.loadedGroupData = null;
      this.getForGroup(this.loadedGroupId);
    }
  }
}
