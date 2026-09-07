import { APIRequestContext } from '@playwright/test';
import { env } from '../config/env';
import { HttpClient } from './http';
import { LiteEvent, LiteLot, LiteTicket, PledgeItem } from './types';

/**
 * The public Lite back end the donor-facing site itself calls. Reads need no
 * auth. Every response is enveloped (`{ requestId, code, message, entity }`).
 */
export class LiteApi {
  private readonly http: HttpClient;

  constructor(request: APIRequestContext, baseUrl: string = env.api.liteBaseUrl) {
    this.http = new HttpClient(request, baseUrl);
  }

  event(eventId: string) {
    return this.http.get<LiteEvent>(`v1/events/${eventId}`);
  }

  /** The campaign's single donation ("pledge") item, including its preset amounts. */
  pledgeItem(eventId: string) {
    return this.http.get<PledgeItem>(`v1/events/${eventId}/pledges/campaignItem`);
  }

  /** Tickets currently shown on the public site (hidden ones excluded). */
  tickets(eventId: string) {
    return this.http.get<LiteTicket[]>(`v1/events/${eventId}/tickets`, { showHidden: 'false' });
  }

  /** All lots currently shown on the public site (any bid mode). */
  lots(eventId: string) {
    return this.http.get<LiteLot[]>(`v1/events/${eventId}/lots`);
  }
}
