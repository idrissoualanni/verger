"use client";

/**
 * Gestionnaire d'état des notifications côté client.
 * Centralise l'historique et les écouteurs pour le hook useNotifications.
 */

import type { AppEvent } from "@verger/shared";

export type NotificationRecord = AppEvent & {
  id: string;
  read: boolean;
};

class NotificationStore {
  private listeners: Set<() => void> = new Set();
  private notifications: NotificationRecord[] = [];

  add(event: AppEvent): NotificationRecord {
    const record: NotificationRecord = {
      ...event,
      id: `${event.type}-${Date.now()}`,
      read: false,
    };
    this.notifications.unshift(record);
    this.notify();
    return record;
  }

  markRead(id: string) {
    const n = this.notifications.find((n) => n.id === id);
    if (n) n.read = true;
    this.notify();
  }

  markAllRead() {
    for (const n of this.notifications) n.read = true;
    this.notify();
  }

  getUnreadCount(): number {
    return this.notifications.filter((n) => !n.read).length;
  }

  getAll(): NotificationRecord[] {
    return this.notifications;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    for (const fn of this.listeners) fn();
  }
}

export const notificationStore = new NotificationStore();
