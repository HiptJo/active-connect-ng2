import { WebsocketClient } from '../../client';
import { DecorableFunction } from '../function';

export function OnReconnect(target: any, propertyKey: string) {
  WebsocketClient.onReconnect(new DecorableFunction({ target, propertyKey }));
}
