import { WebsocketClient } from '../client';
import { ensureLoadingMap, ReactiveLoadingMap } from '../reactivity';

/**
 * Aggregated loading state of all outbounds. The getters are signal-aware, so
 * they can be used directly in OnPush / zoneless templates.
 *
 * Note: the getters never write state themselves (they are evaluated while
 * templates render). Stale `false` entries are pruned shortly afterwards.
 */
export class LoadingStatus extends WebsocketClient {
  static loading: Map<string, boolean>;

  // Avoids `__proto__` (and a `__proto__` class field, which breaks under
  // useDefineForClassFields): the map lives on the concrete client prototype.
  private get loadingMap(): ReactiveLoadingMap {
    return ensureLoadingMap(Object.getPrototypeOf(this));
  }

  private countLoading(): number {
    const map = this.loadingMap;
    let count = 0;
    map.forEach((e: boolean) => {
      if (e) count++;
    });
    if (count == 0) map.pruneWhenIdle();
    return count;
  }

  get isLoading(): boolean {
    return this.countLoading() > 0;
  }

  getLoadingMap(): Map<string, boolean> {
    return this.loadingMap;
  }

  get getCurrent(): number {
    return this.countLoading();
  }

  get getTotal(): number {
    return this.countLoading() > 0 ? this.loadingMap.size : 0;
  }
}
