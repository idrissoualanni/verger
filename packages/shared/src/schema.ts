/**
 * @verger/shared — Schéma Drizzle (Neon PostgreSQL)
 *
 * 16 entités du PRD §6.2 + tables de support :
 * users, levels, classes, parents, students, payments, invoices, invoice_items,
 * whatsapp_messages, events, notifications, staff, absences, subjects, grades,
 * expenses, travel_agencies, applications
 *
 * Convention AGENT.md : commentaires et noms de domaine en français,
 * identifiants techniques en anglais (snake_case pour les colonnes).
 */

import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  boolean,
  integer,
  numeric,
  date,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import {
  PAYMENT_STATUSES,
  PAYMENT_METHODS,
  INVOICE_STATUSES,
  APPLICATION_STATUSES,
  NOTIFICATION_TYPES,
} from "./constants";

/* ------------------------------------------------------------------ */
/* Enums                                                                */
/* ------------------------------------------------------------------ */

export const paymentStatusEnum = pgEnum("payment_status", [...PAYMENT_STATUSES]);

export const paymentMethodEnum = pgEnum("payment_method", [...PAYMENT_METHODS]);

export const invoiceStatusEnum = pgEnum("invoice_status", [...INVOICE_STATUSES]);

export const whatsappMessageTypeEnum = pgEnum("whatsapp_message_type", [
  "INDIVIDUEL",
  "MASSE",
]);

export const whatsappMessageStatusEnum = pgEnum("whatsapp_message_status", [
  "ENVOYE",
  "ECHOUE",
]);

export const eventTypeEnum = pgEnum("event_type", [
  "REUNION",
  "EXAMEN",
  "ACTIVITE",
  "VACANCES",
  "FETE",
]);

export const eventAudienceEnum = pgEnum("event_audience", [
  "TOUS",
  "PRIMAIRE",
  "COLLEGE",
  "LYCEE",
  "PARENTS",
  "PERSONNEL",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  ...NOTIFICATION_TYPES,
]);

export const staffRoleEnum = pgEnum("staff_role", [
  "ENSEIGNANT",
  "ADMINISTRATIF",
  "AGENT_ENTRETIEN",
  "GARDIEN",
  "AUTRE",
]);

export const applicationStatusEnum = pgEnum("application_status", [
  ...APPLICATION_STATUSES,
]);

export const expenseCategoryEnum = pgEnum("expense_category", [
  "SALAIRE",
  "FOURNITURES",
  "MAINTENANCE",
  "LOYER",
  "ELECTRICITE",
  "EAU",
  "AUTRE",
]);

export const genderEnum = pgEnum("gender", ["M", "F"]);

/* ------------------------------------------------------------------ */
/* Utilisateurs & authentification                                      */
/* ------------------------------------------------------------------ */

// Table `user` + session, account, verification (Better Auth, générées par
// `better-auth generate`). NE PAS ÉDITER auth-schema.ts à la main —
// régénérer via le CLI.
import { user } from "./auth-schema";
export * from "./auth-schema";

/* ------------------------------------------------------------------ */
/* Structure scolaire : niveaux, classes, parents, élèves               */
/* ------------------------------------------------------------------ */

export const levels = pgTable("levels", {
  id: text("id").primaryKey(),
  name: text("name").notNull(), // Primaire, Collège, Lycée
  order: integer("order").notNull(), // ordre d'affichage
  description: text("description"),
});

export const classes = pgTable("classes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(), // ex : CP1, CE1, 6ème, Terminale
  levelId: text("level_id")
    .references(() => levels.id)
    .notNull(),
  tuitionFee: numeric("tuition_fee", { precision: 12, scale: 2 }).notNull(), // FCFA / mois
  schoolYear: text("school_year").notNull(), // ex : "2026-2027"
});

export const parents = pgTable("parents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  address: text("address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const students = pgTable("students", {
  id: text("id").primaryKey(),
  matricule: text("matricule").unique().notNull(), // ELE-AAAA-NNN
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  dateOfBirth: date("date_of_birth", { mode: "string" }).notNull(),
  gender: genderEnum("gender").notNull(),
  classId: text("class_id")
    .references(() => classes.id)
    .notNull(),
  parentId: text("parent_id")
    .references(() => parents.id)
    .notNull(),
  qrCodeUrl: text("qr_code_url").notNull(),
  schoolYear: text("school_year").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/* Finances : paiements, factures, dépenses                             */
/* ------------------------------------------------------------------ */

export const payments = pgTable("payments", {
  id: text("id").primaryKey(),
  studentId: text("student_id")
    .references(() => students.id)
    .notNull(),
  month: text("month").notNull(), // ex : "Octobre 2026"
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(), // FCFA
  method: paymentMethodEnum("method").notNull(),
  status: paymentStatusEnum("status").default("EN_ATTENTE").notNull(),
  reference: text("reference"),
  secretaryId: text("secretary_id")
    .references(() => user.id)
    .notNull(),
  whatsappSent: boolean("whatsapp_sent").default(false).notNull(), // lien WhatsApp
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const invoices = pgTable("invoices", {
  id: text("id").primaryKey(),
  number: text("number").unique().notNull(), // FAC-AAAA-NNNN
  studentId: text("student_id")
    .references(() => students.id)
    .notNull(),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 })
    .default("0")
    .notNull(),
  status: invoiceStatusEnum("status").default("EN_ATTENTE").notNull(),
  dueDate: date("due_date", { mode: "string" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const invoiceItems = pgTable("invoice_items", {
  id: text("id").primaryKey(),
  invoiceId: text("invoice_id")
    .references(() => invoices.id, { onDelete: "cascade" })
    .notNull(),
  designation: text("designation").notNull(),
  unitAmount: numeric("unit_amount", { precision: 12, scale: 2 }).notNull(),
  quantity: integer("quantity").default(1).notNull(),
});

export const expenses = pgTable("expenses", {
  id: text("id").primaryKey(),
  category: expenseCategoryEnum("category").notNull(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(), // FCFA
  date: timestamp("date").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/* Communication : WhatsApp, événements, notifications                  */
/* ------------------------------------------------------------------ */

export const whatsappMessages = pgTable("whatsapp_messages", {
  id: text("id").primaryKey(),
  type: whatsappMessageTypeEnum("type").notNull(), // INDIVIDUEL | MASSE
  studentId: text("student_id").references(() => students.id), // pour un envoi individuel
  parentId: text("parent_id").references(() => parents.id),
  recipientName: text("recipient_name"),
  recipientPhone: text("recipient_phone").notNull(),
  message: text("message").notNull(),
  status: whatsappMessageStatusEnum("status").default("ENVOYE").notNull(),
  errorMessage: text("error_message"),
  eventId: text("event_id").references(() => events.id), // si lié à un événement
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const events = pgTable("events", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  date: timestamp("date").notNull(),
  endDate: timestamp("end_date"),
  location: text("location"),
  type: eventTypeEnum("type").default("REUNION").notNull(),
  audience: eventAudienceEnum("audience").default("TOUS").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .references(() => user.id)
    .notNull(), // destinataire (propriétaire par défaut)
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: notificationTypeEnum("type").default("INFO").notNull(),
  read: boolean("read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/* Personnel                                                           */
/* ------------------------------------------------------------------ */

export const staff = pgTable("staff", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: staffRoleEnum("role").notNull(),
  subject: text("subject"), // matière enseignée, si ENSEIGNANT
  salary: numeric("salary", { precision: 12, scale: 2 }), // FCFA / mois
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  hireDate: date("hire_date", { mode: "string" }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const staffRelations = relations(staff, ({ many }) => ({
  grades: many(grades),
}));

/* ------------------------------------------------------------------ */
/* Pédagogie : absences, matières, notes                                */
/* ------------------------------------------------------------------ */

export const absences = pgTable("absences", {
  id: text("id").primaryKey(),
  studentId: text("student_id")
    .references(() => students.id)
    .notNull(),
  date: date("date", { mode: "string" }).notNull(),
  reason: text("reason"),
  justified: boolean("justified").default(false).notNull(),
  notified: boolean("notified").default(false).notNull(), // WhatsApp parent envoyé ?
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const absencesRelations = relations(absences, ({ one }) => ({
  student: one(students, { fields: [absences.studentId], references: [students.id] }),
}));

export const subjects = pgTable("subjects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(), // Mathématiques, Français, ...
  coefficient: integer("coefficient").default(1).notNull(),
});

export const grades = pgTable("grades", {
  id: text("id").primaryKey(),
  studentId: text("student_id")
    .references(() => students.id)
    .notNull(),
  subjectId: text("subject_id")
    .references(() => subjects.id)
    .notNull(),
  trimester: integer("trimester").notNull(), // 1, 2 ou 3
  value: numeric("value", { precision: 5, scale: 2 }).notNull(), // note /20
  appreciation: text("appreciation"),
  teacherId: text("teacher_id")
    .references(() => staff.id),
  schoolYear: text("school_year").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/* Partenariats voyage (bacheliers)                                     */
/* ------------------------------------------------------------------ */

export const travelAgencies = pgTable("travel_agencies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  phone: text("phone").notNull(),
  email: text("email"),
  address: text("address"),
  services: text("services"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const applications = pgTable("applications", {
  id: text("id").primaryKey(),
  studentId: text("student_id")
    .references(() => students.id)
    .notNull(),
  agencyId: text("agency_id")
    .references(() => travelAgencies.id)
    .notNull(),
  status: applicationStatusEnum("status").default("EN_ATTENTE").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const travelAgenciesRelations = relations(travelAgencies, ({ many }) => ({
  applications: many(applications),
}));

export const applicationsRelations = relations(applications, ({ one }) => ({
  student: one(students, { fields: [applications.studentId], references: [students.id] }),
  agency: one(travelAgencies, { fields: [applications.agencyId], references: [travelAgencies.id] }),
}));

/* ------------------------------------------------------------------ */
/* Journal d'audit (audit logs)                                         */
/* ------------------------------------------------------------------ */

export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .references(() => user.id)
    .notNull(),
  userName: text("user_name").notNull(),
  action: text("action").notNull(), // CREATE_STUDENT, DELETE_PAYMENT, etc.
  resourceType: text("resource_type").notNull(), // students, payments, etc.
  resourceId: text("resource_id"), // ID de la ressource concernée (nullable)
  details: text("details"), // JSON stringifié pour détails additionnels
  ip: text("ip"), // adresse IP du requérant
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

/* ------------------------------------------------------------------ */
/* Relations (requêtes imbriquées `db.query...with`)                    */
/* ------------------------------------------------------------------ */

export const levelsRelations = relations(levels, ({ many }) => ({
  classes: many(classes),
}));

export const classesRelations = relations(classes, ({ one, many }) => ({
  level: one(levels, { fields: [classes.levelId], references: [levels.id] }),
  students: many(students),
}));

export const parentsRelations = relations(parents, ({ many }) => ({
  students: many(students),
}));

export const studentsRelations = relations(students, ({ one }) => ({
  class: one(classes, { fields: [students.classId], references: [classes.id] }),
  parent: one(parents, { fields: [students.parentId], references: [parents.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  student: one(students, { fields: [payments.studentId], references: [students.id] }),
  secretary: one(user, { fields: [payments.secretaryId], references: [user.id] }),
}));

export const eventsRelations = relations(events, ({ many }) => ({
  whatsappMessages: many(whatsappMessages),
}));

export const whatsappMessagesRelations = relations(whatsappMessages, ({ one }) => ({
  student: one(students, { fields: [whatsappMessages.studentId], references: [students.id] }),
  parent: one(parents, { fields: [whatsappMessages.parentId], references: [parents.id] }),
  event: one(events, { fields: [whatsappMessages.eventId], references: [events.id] }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  student: one(students, { fields: [invoices.studentId], references: [students.id] }),
  items: many(invoiceItems),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceItems.invoiceId], references: [invoices.id] }),
}));

export const expensesRelations = relations(expenses, ({}) => ({}));

/* ------------------------------------------------------------------ */
/* Types exportés (inférence)                                           */
/* ------------------------------------------------------------------ */

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Student = typeof students.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type Staff = typeof staff.$inferSelect;
export type NewStaff = typeof staff.$inferInsert;
export type TravelAgency = typeof travelAgencies.$inferSelect;
export type NewTravelAgency = typeof travelAgencies.$inferInsert;
export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;