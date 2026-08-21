/**
 * Durable Object — NotificationHub
 *
 * Gère les connexions WebSocket des propriétaires connectés au dashboard.
 * Les événements arrivent par HTTP fetch (POST) et sont broadcastés à tous
 * les clients WebSocket connectés.
 *
 * Flux :
 *   Client WS ←→ DO (webSocketMessage / webSocketClose)
 *   API route POST /api/events → DO.fetch() → broadcast WS
 */

import { DurableObject } from "cloudflare:workers";

export interface Env {
  NOTIFICATION_HUB: DurableObjectNamespace;
}

export class NotificationHub extends DurableObject<Env> {
  private events: AppEvent[] = [];

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Upgrade WebSocket pour les connexions dashboard
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 400 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      this.ctx.acceptWebSocket(server);

      return new Response(null, { status: 101, webSocket: client });
    }

    // POST pour recevoir un événement
    if (request.method === "POST") {
      const body = (await request.json()) as AppEvent;
      const event: AppEvent = {
        ...body,
        timestamp: body.timestamp ?? new Date().toISOString(),
      };

      this.events.unshift(event);
      if (this.events.length > 100) {
        this.events = this.events.slice(0, 100);
      }

      // Broadcast à tous les clients connectés
      const payload = JSON.stringify({ type: "event", event });
      for (const client of this.ctx.getWebSockets()) {
        if (client.readyState === 1) { // WebSocket.READY_STATE_OPEN
          client.send(payload);
        }
      }

      return Response.json({ ok: true, event });
    }

    // GET pour récupérer l'historique
    if (request.method === "GET") {
      return Response.json({ events: this.events });
    }

    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;

    let msg: { type: string };
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }

    if (msg.type === "ping") {
      ws.send(JSON.stringify({ type: "pong" }));
    }
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean
  ) {
    ws.close(code, reason);
  }
}

type AppEvent = {
  type: string;
  message: string;
  timestamp?: string;
  data?: Record<string, unknown>;
};
