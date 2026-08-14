/**
 * @verger/shared — Constantes de domaine (rôles, statuts, types)
 */

export const USER_ROLES = [
  "PROPRIETAIRE",
  "SECRETAIRE",
  "COMPTABLE",
  "ENSEIGNANT",
  "AGENT",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const PAYMENT_STATUSES = ["EN_ATTENTE", "VALIDE", "ANNULE"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ["ESPECES", "MOBILE_MONEY", "VIREMENT"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const INVOICE_STATUSES = ["EN_ATTENTE", "PARTIEL", "PAYEE", "ANNULEE"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const APPLICATION_STATUSES = [
  "EN_ATTENTE",
  "EN_COURS",
  "ACCEPTE",
  "REFUSE",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  "PAIEMENT",
  "ALERTE",
  "FACTURE",
  "WHATSAPP",
  "EVENEMENT",
  "VOYAGE",
  "INFO",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const WHATSAPP_MESSAGE_STATUSES = ["ENVOYE", "ECHOUE"] as const;
export type WhatsAppMessageStatus = (typeof WHATSAPP_MESSAGE_STATUSES)[number];

export const EVENT_TYPES = ["REUNION", "EXAMEN", "ACTIVITE", "VACANCES", "FETE"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_AUDIENCES = ["TOUS", "PRIMAIRE", "COLLEGE", "LYCEE", "PARENTS", "PERSONNEL"] as const;
export type EventAudience = (typeof EVENT_AUDIENCES)[number];

export const STAFF_ROLES = [
  "ENSEIGNANT",
  "ADMINISTRATIF",
  "AGENT_ENTRETIEN",
  "GARDIEN",
  "AUTRE",
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const EXPENSE_CATEGORIES = [
  "SALAIRE",
  "FOURNITURES",
  "MAINTENANCE",
  "LOYER",
  "ELECTRICITE",
  "EAU",
  "AUTRE",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
