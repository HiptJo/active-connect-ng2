export function Route(
  method: string,
  loadingKey?: string,
  dontEnsureTransmission?: boolean
) {
  return function _Route(target: any, propertyKey: string): any {
    // method annotation
    const original = target[propertyKey];
    target[propertyKey] = async function execRoute(...data: any): Promise<any> {
      if (loadingKey) this.loadingElements[loadingKey]++;
      const promise = original.bind(this)(...data);
      let res = null;
      if (this.client) {
        res = await this.client.send(method, data[0], dontEnsureTransmission);
      }
      await promise;
      if (loadingKey) this.loadingElements[loadingKey]--;
      return res;
    };
    return target;
  };
}
