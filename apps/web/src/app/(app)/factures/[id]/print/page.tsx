"use client";

import { useEffect, useState } from "react";
import { Printer, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";

type Student = {
  id: string;
  matricule: string;
  firstName: string;
  lastName: string;
  class?: { name: string };
  parent?: { name: string; phone: string; email: string | null };
};

type InvoiceItem = {
  id: string;
  invoiceId: string;
  designation: string;
  unitAmount: string;
  quantity: number;
};

type Invoice = {
  id: string;
  number: string;
  studentId: string;
  totalAmount: string;
  paidAmount: string;
  status: string;
  dueDate: string | null;
  createdAt: string;
  student?: Student;
  items?: InvoiceItem[];
};

function formatFCFA(amount: string | number): string {
  return parseFloat(String(amount)).toLocaleString("fr-FR") + " FCFA";
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const p = await params;
        const res = await api.get<Invoice>(`/invoices/${p.id}`);
        setInvoice(res);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="mr-2 size-5 animate-spin" /> Chargement…
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex items-center justify-center min-h-screen text-muted-foreground">
        Facture introuvable.
      </div>
    );
  }

  const items = invoice.items ?? [];
  const student = invoice.student;
  const parent = student?.parent;

  return (
    <div className="min-h-screen bg-white text-black p-8">
      {/* Bouton imprimer (caché à l'impression) */}
      <div className="no-print flex justify-end mb-4">
        <Button onClick={() => window.print()} className="gap-2">
          <Printer className="size-4" /> Imprimer / PDF
        </Button>
      </div>

      {/* Facture */}
      <div className="max-w-[210mm] mx-auto" id="invoice-print">
        {/* En-tête */}
        <div className="flex justify-between items-start mb-8 pb-4 border-b-2 border-gray-800">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">ÉCOLE LE VERGER</h1>
            <p className="text-sm text-gray-600 mt-1">Excellence et Rigueur</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-800">FACTURE</p>
            <p className="text-lg font-mono mt-1">{invoice.number}</p>
          </div>
        </div>

        {/* Infos élève/parent */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <p className="text-xs font-semibold uppercase text-gray-500 mb-1">Élève</p>
            <p className="font-semibold">
              {student?.firstName} {student?.lastName}
            </p>
            <p className="text-sm text-gray-600">{student?.matricule}</p>
            <p className="text-sm text-gray-600">Classe : {student?.class?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-gray-500 mb-1">Parent / Tuteur</p>
            <p className="font-semibold">{parent?.name ?? "—"}</p>
            {parent?.phone && <p className="text-sm text-gray-600">Tél : {parent.phone}</p>}
            {parent?.email && <p className="text-sm text-gray-600">Email : {parent.email}</p>}
          </div>
        </div>

        {/* Date et échéance */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <p className="text-xs font-semibold uppercase text-gray-500 mb-1">Date d'émission</p>
            <p className="font-medium">{formatDate(invoice.createdAt)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-gray-500 mb-1">Date d'échéance</p>
            <p className="font-medium">{formatDate(invoice.dueDate)}</p>
          </div>
        </div>

        {/* Lignes */}
        <table className="w-full mb-8">
          <thead>
            <tr className="border-b-2 border-gray-800">
              <th className="text-left py-2 text-sm font-semibold uppercase text-gray-600">
                Désignation
              </th>
              <th className="text-right py-2 text-sm font-semibold uppercase text-gray-600">
                Montant unit.
              </th>
              <th className="text-right py-2 text-sm font-semibold uppercase text-gray-600">
                Quantité
              </th>
              <th className="text-right py-2 text-sm font-semibold uppercase text-gray-600">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-gray-200">
                <td className="py-3">{item.designation}</td>
                <td className="py-3 text-right">{formatFCFA(item.unitAmount)}</td>
                <td className="py-3 text-right">{item.quantity}</td>
                <td className="py-3 text-right font-medium">
                  {formatFCFA(parseFloat(item.unitAmount) * item.quantity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totaux */}
        <div className="flex justify-end">
          <div className="w-64">
            <div className="flex justify-between py-2 border-t-2 border-gray-800">
              <span className="font-bold text-lg">TOTAL</span>
              <span className="font-bold text-lg">{formatFCFA(invoice.totalAmount)}</span>
            </div>
          </div>
        </div>

        {/* Statut */}
        <div className="mt-8 pt-4 border-t border-gray-200">
          <p className="text-sm">
            Statut : <span className="font-semibold">{invoice.status.replace("_", " ")}</span>
          </p>
          {invoice.paidAmount && parseFloat(invoice.paidAmount) > 0 && (
            <p className="text-sm mt-1">
              Déjà payé : <span className="font-semibold">{formatFCFA(invoice.paidAmount)}</span>
            </p>
          )}
        </div>

        {/* Pied de page */}
        <div className="mt-16 pt-4 border-t border-gray-300 text-center text-xs text-gray-500">
          <p>École Le Verger — Document généré le {new Date().toLocaleDateString("fr-FR")}</p>
        </div>
      </div>

      {/* CSS print */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; color: black; }
          #invoice-print { max-width: none; padding: 0; }
          @page {
            size: A4;
            margin: 15mm 20mm;
          }
        }
      `}</style>
    </div>
  );
}
