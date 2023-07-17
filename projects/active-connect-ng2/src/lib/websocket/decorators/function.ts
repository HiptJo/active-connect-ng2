/**
 * Represents the reference to an object method used for websocket routes and outbounds.
 */
export class DecorableFunction {
  /**
   * Creates an instance of DecorableFunction.
   * @param objConfig - The configuration object for the object method.
   * @param objConfig.target - The target object.
   * @param objConfig.propertyKey - The property key of the target object.
   */
  constructor(protected objConfig: { target: any; propertyKey: string }) {
    // singelton service - fetch from angular
    const prototype = this.objConfig.target.prototype || this.objConfig.target;
    if (!prototype.___constructorOverridden) {
      prototype.___constructorOverridden = true;
    }
  }

  /**
   * Returns the decorated function.
   * @returns - The decorated function.
   */
  public get Func(): ((...data: any[]) => Promise<any> | any) | null {
    if (
      this.objConfig?.target &&
      this.objConfig.target[this.objConfig.propertyKey]
    ) {
      return this.objConfig.target[this.objConfig.propertyKey].bind(
        this.getBindObject()
      );
    }
    return null;
  }

  /**
   * Returns the bind object.
   * @private
   * @returns - The bind object.
   */
  private getBindObject(): any {
    const prototype = this.objConfig.target.prototype || this.objConfig.target;
    console.log('bind obj:');
    console.log(this.objConfig.target.prototype);
    console.log(this.objConfig.target);
    return prototype.___data._obj;
  }
}
