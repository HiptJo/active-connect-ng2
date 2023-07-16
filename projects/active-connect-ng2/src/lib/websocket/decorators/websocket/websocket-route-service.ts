import { WebsocketClient } from '../../client';

export interface WebsocketRouteService {
  loadingElements: string[];
  client: WebsocketClient;
}
