"use client";

import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient({
  plugins: [],
});

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role?: string;
  phone?: string;
  image?: string | null;
  emailVerified?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};
