"use client";

import { useNotifications } from "@/hooks/use-notifications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, CheckCheck, Circle, Wifi, WifiOff } from "lucide-react";

const typeLabels: Record<string, string> = {
  ABSENCE: "Absence",
  PAIEMENT: "Paiement",
  INSCRIPTION: "Inscription",
  MESSAGE: "Message",
};

const typeColors: Record<string, string> = {
  ABSENCE: "bg-red-500",
  PAIEMENT: "bg-emerald-500",
  INSCRIPTION: "bg-blue-500",
  MESSAGE: "bg-amber-500",
};

export default function NotificationsPage() {
  const { connected, notifications, unreadCount, markRead, markAllRead } =
    useNotifications();

  const timeAgo = (timestamp: string): string => {
    const now = Date.now();
    const then = new Date(timestamp).getTime();
    if (isNaN(then)) return "à l'instant";
    const diff = Math.floor((now - then) / 1000);
    if (diff < 60) return "à l'instant";
    if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
    return `il y a ${Math.floor(diff / 86400)} j`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="size-6" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {connected ? (
                <>
                  <Wifi className="size-3.5 text-emerald-500" />
                  <span>Connecté en temps réel</span>
                </>
              ) : (
                <>
                  <WifiOff className="size-3.5 text-red-500" />
                  <span>Reconnexion…</span>
                </>
              )}
            </div>
          </div>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead}>
            <CheckCheck className="mr-2 size-4" />
            Tout marquer comme lu
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            Historique
            {unreadCount > 0 && (
              <Badge variant="destructive">{unreadCount} non lu{unreadCount > 1 ? "s" : ""}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Bell className="mx-auto mb-3 size-10 opacity-20" />
              <p>Aucune notification pour le moment</p>
              <p className="text-sm">
                Les événements apparaîtront ici en temps réel.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => !n.read && markRead(n.id)}
                  className={`flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors ${
                    n.read
                      ? "bg-muted/30 opacity-70"
                      : "bg-card hover:bg-muted/50"
                  }`}
                >
                  <div className="mt-0.5 flex shrink-0 items-center gap-2">
                    <div
                      className={`size-2 rounded-full ${typeColors[n.type] ?? "bg-muted"}`}
                    />
                    {!n.read && <Circle className="size-3 fill-blue-500 text-blue-500" />}
                  </div>
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {typeLabels[n.type] ?? n.type}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {timeAgo(n.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{n.message}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
