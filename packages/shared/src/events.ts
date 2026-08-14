/**
 * @verger/shared — Types d'événements temps réel
 */

export const APP_EVENT_TYPES = [
  "ABSENCE",
  "PAIEMENT",
  "INSCRIPTION",
  "MESSAGE",
] as const;

export type AppEventType = (typeof APP_EVENT_TYPES)[number];

export type AppEvent = {
  type: AppEventType;
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
};

export type WsMessage =
  | { type: "event"; event: AppEvent }
  | { type: "pong" }
  | { type: "error"; message: string };
