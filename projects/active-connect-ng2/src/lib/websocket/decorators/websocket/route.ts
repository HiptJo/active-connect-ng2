import {
  createLoadingElements,
  isReactiveLoadingElements
} from '../../reactivity';

/**
 * Upgrades a service's plain `loadingElements` object to a signal-backed one the
 * first time it is needed, so existing services keep working unchanged while
 * their templates become reactive under OnPush / zoneless change detection.
 */
function ensureReactiveLoadingElements(service: any) {
  if (!isReactiveLoadingElements(service.loadingElements)) {
    try {
      service.loadingElements = createLoadingElements(service.loadingElements);
    } catch {
      // read-only property: keep the consumer's object (still works, just not reactive)
    }
  }
}

export function Route(
  method: string,
  loadingKey?: string,
  dontEnsureTransmission?: boolean
) {
  return function _Route(target: any, propertyKey: string): any {
    // method annotation
    const original = target[propertyKey];
    target[propertyKey] = async function execRoute(...data: any): Promise<any> {
      if (loadingKey) {
        ensureReactiveLoadingElements(this);
        if (!this.loadingElements[loadingKey]) {
          this.loadingElements[loadingKey] = 0;
        }
        this.loadingElements[loadingKey]++;
      }
      const promise = original.bind(this)(...data);
      let res = null;
      if (this.client) {
        res = await this.client
          .send(method, data[0], dontEnsureTransmission)
          ?.catch((err: any) => {
            if (loadingKey && this.loadingElements[loadingKey])
              this.loadingElements[loadingKey]--;
            throw err;
          });
      }
      await promise;
      if (loadingKey && this.loadingElements[loadingKey])
        this.loadingElements[loadingKey]--;
      return res;
    };
    return target;
  };
}
