import { WebsocketClient } from '../../client';
import { DecorableFunction } from '../function';

export function OnSuccess(regexp: RegExp) {
  return function _Route(target: any, propertyKey: string): any {
    WebsocketClient.onSuccess(
      new DecorableFunction({ target, propertyKey }),
      regexp
    );
  };
}
