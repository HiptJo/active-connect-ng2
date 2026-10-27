import { signal, WritableSignal } from '@angular/core';

/**
 * Reactivity helpers.
 *
 * Why this exists: previously the library stored its state in plain objects and
 * relied on Zone.js to notice that "something async happened" (a websocket
 * message) and re-run change detection. Angular is now zoneless by default and
 * components are OnPush by default, so plain mutations are never rendered.
 * Everything a template can read is therefore backed by a signal. Reading it in
 * a template registers a dependency; writing it (from websocket handlers)
 * schedules change detection - with or without Zone.js.
 *
 * IMPORTANT: signals must never be *written* while a template is rendering
 * (Angular throws NG0600). Getters that are read from templates therefore only
 * read signals; any side effect they need to trigger is deferred with
 * `defer()`.
 */

/** Runs a side effect after the current (possibly rendering) call stack. */
export function defer(fn: () => void): void {
  queueMicrotask(fn);
}

/**
 * A Map<string, boolean> that notifies signal consumers whenever it changes.
 * Drop-in replacement for the plain `Map` previously stored in `target.loading`.
 */
export class ReactiveLoadingMap extends Map<string, boolean> {
  private readonly _version = signal(0);
  private prunePending = false;

  private bump(): void {
    this._version.update((v) => v + 1);
  }

  override get(key: string): boolean | undefined {
    this._version();
    return super.get(key);
  }

  override has(key: string): boolean {
    this._version();
    return super.has(key);
  }

  override set(key: string, value: boolean): this {
    const changed = !super.has(key) || super.get(key) !== value;
    super.set(key, value);
    if (changed) this.bump();
    return this;
  }

  override delete(key: string): boolean {
    const existed = super.delete(key);
    if (existed) this.bump();
    return existed;
  }

  override clear(): void {
    let hadEntries = false;
    super.forEach(() => (hadEntries = true));
    super.clear();
    if (hadEntries) this.bump();
  }

  override forEach(
    callbackfn: (
      value: boolean,
      key: string,
      map: Map<string, boolean>
    ) => void,
    thisArg?: any
  ): void {
    this._version();
    super.forEach(callbackfn, thisArg);
  }

  constructor() {
    super();
    // `size` is declared as a property on Map's typings, so it is redefined here
    // instead of being overridden as an accessor.
    const nativeSize = Object.getOwnPropertyDescriptor(Map.prototype, 'size')!
      .get as () => number;
    Object.defineProperty(this, 'size', {
      configurable: true,
      get: () => {
        this._version();
        return nativeSize.call(this);
      }
    });
  }

  override keys(): MapIterator<string> {
    this._version();
    return super.keys();
  }

  override values(): MapIterator<boolean> {
    this._version();
    return super.values();
  }

  override entries(): MapIterator<[string, boolean]> {
    this._version();
    return super.entries();
  }

  override [Symbol.iterator](): MapIterator<[string, boolean]> {
    this._version();
    return super[Symbol.iterator]();
  }

  /** Reads a value without registering a signal dependency. */
  peek(key: string): boolean | undefined {
    return super.get(key);
  }

  /**
   * Removes all entries once nothing is loading anymore. Deferred, because it
   * is requested from getters that are evaluated while templates render.
   */
  pruneWhenIdle(): void {
    if (this.prunePending) return;
    this.prunePending = true;
    defer(() => {
      this.prunePending = false;
      let anyTrue = false;
      super.forEach((v) => (anyTrue ||= v));
      if (!anyTrue) this.clear();
    });
  }
}

/** Makes sure `target.loading` is a ReactiveLoadingMap (inherited maps are kept). */
export function ensureLoadingMap(target: any): ReactiveLoadingMap {
  if (!(target.loading instanceof ReactiveLoadingMap)) {
    target.loading = new ReactiveLoadingMap();
  }
  return target.loading;
}

/**
 * One "version" signal per decorated property. Bumped whenever the backing value
 * in `target.___data[key]` is replaced, read by the property getter.
 */
function ticksOf(target: any): Record<string, WritableSignal<number>> {
  if (!target.___ticks) target.___ticks = {};
  return target.___ticks;
}

export function readTick(target: any, key: string): number {
  const ticks = ticksOf(target);
  return (ticks[key] ??= signal(0))();
}

export function bumpTick(target: any, key: string): void {
  const ticks = ticksOf(target);
  (ticks[key] ??= signal(0)).update((v) => v + 1);
}

const reactiveLoadingElements = new WeakSet<object>();

export function isReactiveLoadingElements(obj: unknown): boolean {
  return !!obj && typeof obj === 'object' && reactiveLoadingElements.has(obj);
}

/**
 * Creates a `loadingElements` object (as used by `@Route(method, loadingKey)`)
 * whose properties are signal-backed. `service.loadingElements.save` can be
 * read in an OnPush / zoneless template and updates when `@Route` changes it.
 * Unknown keys read as 0.
 */
export function createLoadingElements(
  initial?: Record<string, number> | null
): Record<string, number> {
  const signals = new Map<string, WritableSignal<number>>();
  const sigFor = (key: string): WritableSignal<number> => {
    let s = signals.get(key);
    if (!s) {
      s = signal(0);
      signals.set(key, s);
    }
    return s;
  };
  Object.entries(initial || {}).forEach(([k, v]) => sigFor(k).set(v));

  const proxy = new Proxy({} as Record<string, number>, {
    get: (_t, key) => (typeof key === 'string' ? sigFor(key)() : undefined),
    set: (_t, key, value) => {
      if (typeof key === 'string') sigFor(key).set(value);
      return true;
    },
    has: (_t, key) => typeof key === 'string' && signals.has(key),
    deleteProperty: (_t, key) => {
      if (typeof key === 'string') sigFor(key).set(0);
      return true;
    },
    ownKeys: () => Array.from(signals.keys()),
    getOwnPropertyDescriptor: (_t, key) =>
      typeof key === 'string' && signals.has(key)
        ? {
            value: sigFor(key)(),
            enumerable: true,
            configurable: true,
            writable: true
          }
        : undefined
  });
  reactiveLoadingElements.add(proxy);
  return proxy;
}
