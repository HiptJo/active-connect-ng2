export class LoadingStatus {
  private __proto__: any;
  static loading: Map<string, boolean>;
  get isLoading(): boolean {
    // return general loading
    let anyTrue = false;
    this.__proto__.loading.forEach((e: boolean) => {
      anyTrue ||= e;
    });
    if (!anyTrue) this.__proto__.loading.clear();
    return this.__proto__.loading.size > 0;
  }
  getLoadingMap(): Map<string, boolean> {
    return this.__proto__.loading;
  }

  get getCurrent(): number {
    let count = 0;
    this.__proto__.loading.forEach((e: boolean) => {
      if (e) count++;
    });
    if (count == 0) {
      this.__proto__.loading.clear();
    }
    return count;
  }
  get getTotal(): number {
    return this.__proto__.loading.size;
  }
}
