"use client";

/**
 * Hook WebSocket pour les notifications temps réel.
 * Se connecte au Durable Object via /api/ws/notifications,
 * écoute les événements entrants et gère la reconnexion auto.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { notificationStore, type NotificationRecord } from "@/lib/notifications";
import type { WsMessage } from "@verger/shared";

const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_DELAY = 30000;
const HEARTBEAT_INTERVAL = 25000;

export function useNotifications() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRecord[]>(
    () => notificationStore.getAll()
  );

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (heartbeatRef.current !== null) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    setConnected(false);
  }, []);

  const connect = useCallback(() => {
    cleanup();

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/api/ws/notifications`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);

      // Heartbeat pour garder la connexion alive
      heartbeatRef.current = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, HEARTBEAT_INTERVAL);
    };

    ws.onmessage = (evt) => {
      let msg: WsMessage;
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return;
      }

      if (msg.type === "event") {
        const record = notificationStore.add(msg.event);
        setNotifications(notificationStore.getAll());

        // Toast sonore selon le type
        const icons: Record<string, string> = {
          ABSENCE: "🔴",
          PAIEMENT: "💰",
          INSCRIPTION: "📝",
          MESSAGE: "💬",
        };
        const icon = icons[msg.event.type] ?? "🔔";
        toast(`${icon} ${msg.event.type}`, {
          description: msg.event.message,
          duration: 8000,
        });
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (heartbeatRef.current !== null) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }

      // Reconnexion exponentielle
      const delay = Math.min(RECONNECT_DELAY * 2, MAX_RECONNECT_DELAY);
      reconnectTimerRef.current = window.setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [cleanup]);

  useEffect(() => {
    connect();
    return cleanup;
  }, [connect, cleanup]);

  // Subscribe aux changements du store
  useEffect(() => {
    const unsub = notificationStore.subscribe(() => {
      setNotifications(notificationStore.getAll());
    });
    return unsub;
  }, []);

  const markRead = useCallback((id: string) => {
    notificationStore.markRead(id);
  }, []);

  const markAllRead = useCallback(() => {
    notificationStore.markAllRead();
  }, []);

  return {
    connected,
    notifications,
    unreadCount: notificationStore.getUnreadCount(),
    markRead,
    markAllRead,
  };
}
