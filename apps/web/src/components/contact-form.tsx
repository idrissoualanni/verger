"use client";

import { Button } from "@/components/ui/button";

export function ContactForm() {
  return (
    <form
      className="space-y-4 rounded-2xl border bg-card p-6"
      onSubmit={(e) => {
        e.preventDefault();
        alert("Message envoyé — fonctionnalité en cours de branchement.");
      }}
    >
      <div>
        <label className="mb-1 block text-sm font-medium">Nom</label>
        <input
          type="text"
          required
          className="flex w-full rounded-xl border bg-background px-3 py-2.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Votre nom"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Email</label>
        <input
          type="email"
          required
          className="flex w-full rounded-xl border bg-background px-3 py-2.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="votre@email.sn"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Message</label>
        <textarea
          required
          rows={4}
          className="flex w-full rounded-xl border bg-background px-3 py-2.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Votre message…"
        />
      </div>
      <Button type="submit" className="w-full rounded-xl">
        Envoyer
      </Button>
    </form>
  );
}
