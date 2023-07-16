import { WebsocketClient } from '../../client';
import { DecorableFunction } from '../function';

export function Handle(method: string) {
  return function _Handle(target: any, propertyKey: string): any {
    // method annotation
    WebsocketClient.registerHandle(
      method,
      new DecorableFunction({ target, propertyKey })
    );
  };
}
