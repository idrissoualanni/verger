/**
 * @verger/api — Journal d'audit (audit logging)
 *
 * Middleware/wrapper pour logger les actions sensibles :
 * - Qui (userId) a fait quoi (action) sur quelle ressource (resourceId)
 * - Stocké en mémoire (Map) pour le prototype, prêt pour table DB
 */

export type AuditAction =
  | "CREATE_STUDENT"
  | "UPDATE_STUDENT"
  | "DELETE_STUDENT"
  | "CREATE_PARENT"
  | "UPDATE_PARENT"
  | "DELETE_PARENT"
  | "CREATE_PAYMENT"
  | "UPDATE_PAYMENT"
  | "DELETE_PAYMENT"
  | "CREATE_INVOICE"
  | "UPDATE_INVOICE"
  | "DELETE_INVOICE"
  | "CREATE_EXPENSE"
  | "UPDATE_EXPENSE"
  | "DELETE_EXPENSE"
  | "CREATE_STAFF"
  | "UPDATE_STAFF"
  | "DELETE_STAFF"
  | "CREATE_LEVEL"
  | "UPDATE_LEVEL"
  | "DELETE_LEVEL"
  | "CREATE_CLASS"
  | "UPDATE_CLASS"
  | "DELETE_CLASS"
  | "CREATE_ABSENCE"
  | "UPDATE_ABSENCE"
  | "DELETE_ABSENCE"
  | "CREATE_GRADE"
  | "UPDATE_GRADE"
  | "DELETE_GRADE"
  | "CREATE_EVENT"
  | "UPDATE_EVENT"
  | "DELETE_EVENT"
  | "CREATE_WHATSAPP"
  | "DELETE_WHATSAPP"
  | "CREATE_TRAVEL_AGENCY"
  | "UPDATE_TRAVEL_AGENCY"
  | "DELETE_TRAVEL_AGENCY"
  | "CREATE_APPLICATION"
  | "UPDATE_APPLICATION"
  | "DELETE_APPLICATION"
  | "LOGIN"
  | "LOGOUT";

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  timestamp: string;
  ip: string | null;
}

// Stockage en mémoire pour le prototype (remplacé par table DB plus tard)
const auditLogs: AuditLog[] = [];

export function logAudit(entry: Omit<AuditLog, "id" | "timestamp">): AuditLog {
  const log: AuditLog = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };

  auditLogs.unshift(log);

  // Garder uniquement les 1000 derniers logs en mémoire
  if (auditLogs.length > 1000) {
    auditLogs.length = 1000;
  }

  console.log(
    `[AUDIT] ${log.timestamp} | user=${log.userName}(${log.userId}) | action=${log.action} | resource=${log.resourceType}:${log.resourceId ?? "n/a"} | ip=${log.ip ?? "n/a"}`
  );

  return log;
}

export function getAuditLogs(filters?: {
  userId?: string;
  action?: AuditAction;
  from?: string;
  to?: string;
  limit?: number;
}): AuditLog[] {
  let filtered = [...auditLogs];

  if (filters?.userId) {
    filtered = filtered.filter((l) => l.userId === filters.userId);
  }
  if (filters?.action) {
    filtered = filtered.filter((l) => l.action === filters.action);
  }
  if (filters?.from) {
    filtered = filtered.filter((l) => l.timestamp >= filters.from!);
  }
  if (filters?.to) {
    filtered = filtered.filter((l) => l.timestamp <= filters.to!);
  }

  const limit = filters?.limit ?? 50;
  return filtered.slice(0, limit);
}

/**
 * Helper pour extraire l'IP d'une requête (Cloudflare Workers)
 */
export function getClientIp(request: Request): string | null {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return null;
}
