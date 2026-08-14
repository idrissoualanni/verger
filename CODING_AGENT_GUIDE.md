# LE VERGER - SCHOOL MANAGEMENT PLATFORM
## Technical Specification & Implementation Guide for AI Coding Agent

---

### 1. Project Overview & Architecture
**Le Verger** is an integrated school management platform tailored for K-12 private schools in West Africa (Dakar, Senegal). It streamlines administration, payment tracking, WhatsApp communication, offline management, and academic tracking.

#### Core Tech Stack
* **Frontend / Framework:** Next.js (App Router) + React + PWA (Workbox / Dexie.js IndexedDB offline cache).
* **Styling / UI:** Tailwind CSS + shadcn/ui.
* **Database:** Neon (Serverless PostgreSQL) managed via Drizzle ORM.
* **Auth:** Better Auth (RBAC session handling with roles: `PROPRIETAIRE`, `SECRETAIRE`, `COMPTABLE`, `ENSEIGNANT`, `AGENT`).
* **Backend Edge API:** Cloudflare Workers running Hono.js.
* **Realtime Server:** Socket.io / WebSockets (deployed on Node.js/Render edge node or Durable Objects) for instant owner alerts.
* **WhatsApp API:** Meta WhatsApp Cloud API / Baileys bridge.
* **Payment Aggregator:** PayTech / Hub2 / Chapa supporting Mobile Money (Airtel Money, Wave, Orange Money, Free).

---

### 2. Database Schema Definition (Drizzle ORM / Neon PostgreSQL)

```typescript
// schema.ts - Core Database Entities

import { pgTable, text, timestamp, boolean, integer, numeric, pgEnum } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', [
  'PROPRIETAIRE',
  'SECRETAIRE',
  'COMPTABLE',
  'ENSEIGNANT',
  'AGENT'
]);

export const paymentStatusEnum = pgEnum('payment_status', [
  'EN_ATTENTE',
  'VALIDE',
  'ANNULE'
]);

export const paymentMethodEnum = pgEnum('payment_method', [
  'ESPECES',
  'MOBILE_MONEY',
  'VIREMENT'
]);

// Users Table
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').unique().notNull(),
  phone: text('phone'),
  role: userRoleEnum('role').default('SECRETAIRE').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Students Table
export const students = pgTable('students', {
  id: text('id').primaryKey(),
  matricule: text('matricule').unique().notNull(), // e.g., ELE-2026-001
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  dateOfBirth: text('date_of_birth').notNull(),
  gender: text('gender').notNull(),
  classId: text('class_id').notNull(),
  parentName: text('parent_name').notNull(),
  parentPhone: text('parent_phone').notNull(),
  parentEmail: text('parent_email'),
  qrCodeUrl: text('qr_code_url').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Payments Table
export const payments = pgTable('payments', {
  id: text('id').primaryKey(),
  studentId: text('student_id').references(() => students.id).notNull(),
  month: text('month').notNull(), // e.g., "Octobre 2026"
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(), // FCFA
  method: paymentMethodEnum('method').notNull(),
  status: paymentStatusEnum('status').default('EN_ATTENTE').notNull(),
  reference: text('reference'),
  secretaryId: text('secretary_id').references(() => users.id).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Invoices Table
export const invoices = pgTable('invoices', {
  id: text('id').primaryKey(),
  number: text('number').unique().notNull(), // e.g., FAC-2026-0001
  studentId: text('student_id').references(() => students.id).notNull(),
  totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
  paidAmount: numeric('paid_amount', { precision: 12, scale: 2 }).default('0').notNull(),
  status: text('status').default('EN_ATTENTE').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

---

### 3. Role-Based Access Control (RBAC) & Better Auth Middleware

| Role | Accessible Modules | Key Restrictions |
| :--- | :--- | :--- |
| **PROPRIETAIRE** | Full System Access | None (Dashboard, Financials, Staff, Settings, Approvals) |
| **SECRETAIRE** | Students, Attendance, Enrolling Payments, Scanning QR | Cannot view total school budget/financial stats |
| **COMPTABLE** | Invoices, Expenses, Budget Tracking, Payments View | Cannot modify student grades/academic stats |
| **ENSEIGNANT** | Gradebook, Class Attendance | Access restricted to assigned classes only |
| **AGENT** | Study Abroad Applications (Grade 12) | Only views assigned student visa files |

```typescript
// middleware/rbac.ts
import { Hono } from 'hono';
import { getAuth } from './auth';

export const requireRole = (allowedRoles: string[]) => {
  return async (c: any, next: any) => {
    const session = await getAuth(c);
    if (!session || !allowedRoles.includes(session.user.role)) {
      return c.json({ error: 'Unauthorized access for this role' }, 403);
    }
    await next();
  };
};
```

---

### 4. Step-by-Step Implementation Instructions for Coding Agent

1. **Project Setup:**
   * Initialize Next.js App Router project with TypeScript and Tailwind CSS.
   * Configure Drizzle ORM connecting to Neon PostgreSQL serverless database.
   * Configure Better Auth session provider supporting custom user roles.
2. **Landing Page Implementation:**
   * Build responsive public landing page highlighting school programs (Primaire, Collège, Lycée).
   * Include transparent tuition fee schedules and enrollment registration CTA.
3. **Core Dashboard & Student Directory:**
   * Build UI with side navigation tabs.
   * Add student registration, auto-generation of unique matricule (`ELE-YYYY-NNN`) and QR code generator.
4. **PWA Offline Mode:**
   * Configure Workbox Service Worker to intercept requests.
   * Store pending payment records in IndexedDB when network disconnects; auto-sync when connection restores.
5. **Realtime Socket Integration & Notifications:**
   * Emit `payment:created` WebSocket event upon new payment.
   * Trigger real-time toast alert on Owner dashboard.
