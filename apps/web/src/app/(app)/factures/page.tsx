"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FileText,
  Loader2,
  Plus,
  Printer,
  Send,
  CheckCircle,
  Eye,
  Trash2,
  BarChart3,
  List,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, ApiError } from "@/lib/api";

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

type Student = {
  id: string;
  matricule: string;
  firstName: string;
  lastName: string;
  parentId: string;
  class?: { id: string; name: string };
  parent?: { name: string; phone: string };
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
  status: "EN_ATTENTE" | "PARTIEL" | "PAYEE" | "ANNULEE";
  dueDate: string | null;
  createdAt: string;
  student?: Student;
  items?: InvoiceItem[];
};

type InvoiceStats = {
  totalFacture: number;
  totalPaye: number;
  totalEnAttente: number;
  totalPartiel: number;
  totalAnnule: number;
  nbFactures: number;
  nbPartiel: number;
  nbAnnule: number;
  monthly: { month: string; total: number; paid: number; count: number }[];
};

type TabValue = "factures" | "creer" | "stats";

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function formatFCFA(amount: string | number): string {
  return parseFloat(String(amount)).toLocaleString("fr-FR") + " FCFA";
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function statusBadge(status: string) {
  const config: Record<string, { label: string; className: string }> = {
    EN_ATTENTE: { label: "En attente", className: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" },
    PARTIEL: { label: "Partiel", className: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
    PAYEE: { label: "Payée", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
    ANNULEE: { label: "Annulée", className: "bg-red-500/15 text-red-700 dark:text-red-400" },
  };
  const c = config[status] ?? config.EN_ATTENTE;
  return (
    <Badge className={`gap-1 text-xs ${c.className}`}>
      {status === "PAYEE" && <CheckCircle className="size-3" />}
      {c.label}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/* Page principale                                                      */
/* ------------------------------------------------------------------ */

export default function FacturesPage() {
  const [activeTab, setActiveTab] = useState<TabValue>("factures");

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Factures</h1>
        <p className="text-sm text-muted-foreground">
          Gestion des factures de scolarité et services additionnels.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        <TabsList className="rounded-xl">
          <TabsTrigger value="factures" className="gap-2">
            <List className="size-4" /> Factures
          </TabsTrigger>
          <TabsTrigger value="creer" className="gap-2">
            <Plus className="size-4" /> Créer
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-2">
            <BarChart3 className="size-4" /> Statistiques
          </TabsTrigger>
        </TabsList>

        <TabsContent value="factures" className="mt-4 space-y-4">
          <FacturesTab />
        </TabsContent>

        <TabsContent value="creer" className="mt-4 space-y-4">
          <CreerTab />
        </TabsContent>

        <TabsContent value="stats" className="mt-4 space-y-4">
          <StatsTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet Factures — liste                                              */
/* ------------------------------------------------------------------ */

function FacturesTab() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const [filterStatus, setFilterStatus] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);

  useEffect(() => {
    api.get<any[]>("/students?limit=500").then((res) => {
      const studentsList = Array.isArray(res) ? res : (res as any)?.data ?? [];
      const classMap = new Map<string, { id: string; name: string }>();
      for (const s of studentsList) {
        if (s.class && !classMap.has(s.class.id)) {
          classMap.set(s.class.id, { id: s.class.id as string, name: s.class.name as string });
        }
      }
      setClasses(Array.from(classMap.values()));
    });
  }, []);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      if (filterMonth) params.set("month", filterMonth);
      params.set("limit", String(limit));
      params.set("offset", String(offset));

      const res = await api.get<{ data: Invoice[]; total: number }>(
        `/invoices?${params}`
      );
      setInvoices(res.data);
      setTotal(res.total);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterMonth, offset]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  function handleFilterChange(field: string, value: string) {
    if (field === "status") setFilterStatus(value);
    if (field === "class") setFilterClass(value);
    if (field === "month") setFilterMonth(value);
    setOffset(0);
  }

  const filteredInvoices = filterClass
    ? invoices.filter((inv) => inv.student?.class?.id === filterClass)
    : invoices;

  async function handleMarkPaid(invoice: Invoice) {
    try {
      await api.patch(`/invoices/${invoice.id}`, {
        status: "PAYEE",
        paidAmount: invoice.totalAmount,
      });
      toast.success("Facture marquée comme payée");
      loadInvoices();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur");
    }
  }

  async function handleDelete(invoice: Invoice) {
    if (invoice.status === "PAYEE") {
      toast.error("Impossible de supprimer une facture payée");
      return;
    }
    try {
      await api.delete(`/invoices/${invoice.id}`);
      toast.success("Facture supprimée");
      loadInvoices();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur");
    }
  }

  async function handleSend(invoice: Invoice) {
    try {
      const res = await api.post<{ ok: boolean; sent: boolean; phone: string; message: string }>(
        `/invoices/${invoice.id}/send`,
        {}
      );
      if (res.sent) {
        toast.success(`Message envoyé au parent (${res.phone})`);
      } else {
        toast.error("Échec de l'envoi");
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur");
    }
  }

  function handlePrint(invoice: Invoice) {
    window.open(`/factures/${invoice.id}/print`, "_blank");
  }

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  if (viewInvoice) {
    return (
      <Card className="rounded-2xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Facture {viewInvoice.number}</CardTitle>
              <CardDescription>Détail de la facture</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setViewInvoice(null)}>
              <X className="size-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium">Élève</p>
              <p className="text-sm text-muted-foreground">
                {viewInvoice.student?.firstName} {viewInvoice.student?.lastName}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium">Classe</p>
              <p className="text-sm text-muted-foreground">
                {viewInvoice.student?.class?.name ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium">Parent</p>
              <p className="text-sm text-muted-foreground">
                {viewInvoice.student?.parent?.name ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium">Échéance</p>
              <p className="text-sm text-muted-foreground">
                {formatDate(viewInvoice.dueDate)}
              </p>
            </div>
          </div>

          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Désignation</TableHead>
                  <TableHead className="text-right">Montant unit.</TableHead>
                  <TableHead className="text-right">Qté</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {viewInvoice.items?.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.designation}</TableCell>
                    <TableCell className="text-right">
                      {formatFCFA(item.unitAmount)}
                    </TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatFCFA(parseFloat(item.unitAmount) * item.quantity)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end space-x-4 text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-semibold text-lg">{formatFCFA(viewInvoice.totalAmount)}</span>
          </div>

          <div className="flex gap-2">
            {statusBadge(viewInvoice.status)}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handlePrint(viewInvoice)}>
              <Printer className="mr-1 size-3" /> Imprimer
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleSend(viewInvoice)}>
              <Send className="mr-1 size-3" /> Envoyer
            </Button>
            {viewInvoice.status !== "PAYEE" && (
              <Button variant="outline" size="sm" onClick={() => handleMarkPaid(viewInvoice)}>
                <CheckCircle className="mr-1 size-3" /> Marquer payée
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Liste des factures</CardTitle>
        <CardDescription>
          Toutes les factures émises.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filtres */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-[160px] space-y-2">
            <Label>Statut</Label>
            <Select value={filterStatus} onValueChange={(v) => handleFilterChange("status", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Tous" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Tous</SelectItem>
                <SelectItem value="EN_ATTENTE">En attente</SelectItem>
                <SelectItem value="PARTIEL">Partiel</SelectItem>
                <SelectItem value="PAYEE">Payée</SelectItem>
                <SelectItem value="ANNULEE">Annulée</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-[160px] space-y-2">
            <Label>Classe</Label>
            <Select value={filterClass} onValueChange={(v) => handleFilterChange("class", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Toutes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Toutes</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[160px] space-y-2">
            <Label>Mois</Label>
            <Input
              type="month"
              value={filterMonth}
              onChange={(e) => handleFilterChange("month", e.target.value)}
            />
          </div>
          <Button variant="ghost" size="sm" onClick={loadInvoices}>
            Filtrer
          </Button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Chargement…
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            Aucune facture trouvée.
          </div>
        ) : (
          <>
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Numéro</TableHead>
                    <TableHead>Élève</TableHead>
                    <TableHead>Classe</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Échéance</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-sm">{inv.number}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">
                            {inv.student?.firstName} {inv.student?.lastName}
                          </p>
                          <p className="text-xs text-muted-foreground">{inv.student?.matricule}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {inv.student?.class?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatFCFA(inv.totalAmount)}
                      </TableCell>
                      <TableCell>{statusBadge(inv.status)}</TableCell>
                      <TableCell className="text-sm">{formatDate(inv.dueDate)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setViewInvoice(inv)}
                          >
                            <Eye className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handlePrint(inv)}
                          >
                            <Printer className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleSend(inv)}
                          >
                            <Send className="size-4" />
                          </Button>
                          {inv.status !== "PAYEE" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleMarkPaid(inv)}
                            >
                              <CheckCircle className="size-4" />
                            </Button>
                          )}
                          {inv.status !== "PAYEE" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(inv)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Page {currentPage} sur {totalPages} ({total} factures)
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offset === 0}
                    onClick={() => setOffset((o) => Math.max(0, o - limit))}
                  >
                    Précédent
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offset + limit >= total}
                    onClick={() => setOffset((o) => o + limit)}
                  >
                    Suivant
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet Créer                                                         */
/* ------------------------------------------------------------------ */

type InvoiceLine = {
  designation: string;
  unitAmount: string;
  quantity: number;
};

function CreerTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [lines, setLines] = useState<InvoiceLine[]>([
    { designation: "", unitAmount: "", quantity: 1 },
  ]);
  const [dueDate, setDueDate] = useState("");
  const [sendToParent, setSendToParent] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.get<any[]>("/students?limit=500")
      .then((res) => {
        const list = Array.isArray(res) ? res : (res as any)?.data ?? [];
        setStudents(list);
      })
      .catch(() => setStudents([]))
      .finally(() => setLoading(false));
  }, []);

  const selectedStudent = students.find((s) => s.id === selectedStudentId);

  const total = lines.reduce(
    (sum, line) => sum + parseFloat(line.unitAmount || "0") * line.quantity,
    0
  );

  function addLine() {
    setLines([...lines, { designation: "", unitAmount: "", quantity: 1 }]);
  }

  function removeLine(index: number) {
    setLines(lines.filter((_, i) => i !== index));
  }

  function updateLine(index: number, field: keyof InvoiceLine, value: string | number) {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: value };
    setLines(updated);
  }

  async function handleSubmit() {
    if (!selectedStudentId) {
      toast.error("Sélectionnez un élève");
      return;
    }
    if (lines.some((l) => !l.designation || !l.unitAmount)) {
      toast.error("Complétez toutes les lignes");
      return;
    }

    setCreating(true);
    try {
      const invoice = await api.post<Invoice>("/invoices", {
        studentId: selectedStudentId,
        items: lines,
        dueDate: dueDate || null,
      });

      toast.success(`Facture ${invoice.number} créée`);

      if (sendToParent && selectedStudent?.parent?.phone) {
        try {
          await api.post(`/invoices/${invoice.id}/send`, {});
          toast.success("Message envoyé au parent");
        } catch {
          toast.error("Facture créée mais envoi au parent échoué");
        }
      }

      setSelectedStudentId("");
      setLines([{ designation: "", unitAmount: "", quantity: 1 }]);
      setDueDate("");
      setSendToParent(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Chargement…
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Formulaire */}
      <Card className="rounded-2xl lg:col-span-2">
        <CardHeader>
          <CardTitle>Nouvelle facture</CardTitle>
          <CardDescription>
            Créez une facture pour un élève avec des lignes détaillées.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Élève */}
          <div className="space-y-2">
            <Label>Élève</Label>
            <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir un élève" />
              </SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.firstName} {s.lastName} — {s.class?.name ?? ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedStudent && (
              <p className="text-xs text-muted-foreground">
                Parent : {selectedStudent.parent?.name ?? "—"} | Tél : {selectedStudent.parent?.phone ?? "N/A"}
              </p>
            )}
          </div>

          {/* Date d'échéance */}
          <div className="space-y-2">
            <Label>Date d'échéance (optionnel)</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          {/* Lignes */}
          <div className="space-y-2">
            <Label>Lignes de facture</Label>
            {lines.map((line, index) => (
              <div key={index} className="flex gap-2 items-start">
                <div className="flex-1">
                  <Input
                    placeholder="Désignation"
                    value={line.designation}
                    onChange={(e) => updateLine(index, "designation", e.target.value)}
                  />
                </div>
                <div className="w-[120px]">
                  <Input
                    type="number"
                    placeholder="Montant"
                    value={line.unitAmount}
                    onChange={(e) => updateLine(index, "unitAmount", e.target.value)}
                  />
                </div>
                <div className="w-[80px]">
                  <Input
                    type="number"
                    min={1}
                    placeholder="Qté"
                    value={line.quantity}
                    onChange={(e) => updateLine(index, "quantity", parseInt(e.target.value) || 1)}
                  />
                </div>
                {lines.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLine(index)}
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addLine}>
              <Plus className="mr-1 size-3" /> Ajouter une ligne
            </Button>
          </div>

          {/* Checkbox envoi parent */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="sendToParent"
              checked={sendToParent}
              onChange={(e) => setSendToParent(e.target.checked)}
              className="rounded border-gray-300"
            />
            <Label htmlFor="sendToParent" className="text-sm">
              Envoyer au parent via WhatsApp
            </Label>
          </div>

          {/* Submit */}
          <Button onClick={handleSubmit} disabled={creating} className="w-full">
            {creating ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Plus className="mr-2 size-4" />
            )}
            Créer la facture
          </Button>
        </CardContent>
      </Card>

      {/* Aperçu */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Aperçu</CardTitle>
          <CardDescription>Résumé de la facture</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium">Élève</p>
            <p className="text-sm text-muted-foreground">
              {selectedStudent
                ? `${selectedStudent.firstName} ${selectedStudent.lastName}`
                : "—"}
            </p>
          </div>

          <div>
            <p className="text-sm font-medium">Lignes</p>
            <div className="space-y-1 mt-1">
              {lines
                .filter((l) => l.designation)
                .map((l, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {l.designation} × {l.quantity}
                    </span>
                    <span>
                      {formatFCFA(parseFloat(l.unitAmount || "0") * l.quantity)}
                    </span>
                  </div>
                ))}
            </div>
          </div>

          <div className="border-t pt-3 flex justify-between">
            <span className="font-semibold">Total</span>
            <span className="font-bold text-lg">{formatFCFA(total)}</span>
          </div>

          {dueDate && (
            <div>
              <p className="text-sm font-medium">Échéance</p>
              <p className="text-sm text-muted-foreground">{formatDate(dueDate)}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet Stats                                                         */
/* ------------------------------------------------------------------ */

function StatsTab() {
  const [stats, setStats] = useState<InvoiceStats | null>(null);
  const [loading, setLoading] = useState(false);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<InvoiceStats>("/invoices/stats");
      setStats(res);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Chargement…
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
        Aucune donnée.
      </div>
    );
  }

  const maxMonthly = Math.max(...stats.monthly.map((m) => m.total), 1);

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Statistiques des factures</CardTitle>
        <CardDescription>
          Vue d'ensemble de la facturation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border bg-card p-4 text-center">
            <div className="text-2xl font-bold text-primary">
              {formatFCFA(stats.totalFacture)}
            </div>
            <div className="text-xs text-muted-foreground">Total facturé</div>
          </div>
          <div className="rounded-xl border bg-card p-4 text-center">
            <div className="text-2xl font-bold text-emerald-600">
              {formatFCFA(stats.totalPaye)}
            </div>
            <div className="text-xs text-muted-foreground">Total payé</div>
          </div>
          <div className="rounded-xl border bg-card p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">
              {formatFCFA(stats.totalEnAttente)}
            </div>
            <div className="text-xs text-muted-foreground">En attente</div>
          </div>
          <div className="rounded-xl border bg-card p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {stats.nbFactures}
            </div>
            <div className="text-xs text-muted-foreground">Nb factures</div>
          </div>
        </div>

        {/* Graphique barres CSS par mois */}
        {stats.monthly.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Facturation par mois</h3>
            <div className="space-y-2">
              {stats.monthly.map((m) => {
                const pct = (m.total / maxMonthly) * 100;
                const paidPct = m.total > 0 ? (m.paid / m.total) * 100 : 0;
                return (
                  <div key={m.month} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{m.month}</span>
                      <span className="text-muted-foreground">
                        {formatFCFA(m.total)} ({m.count} facture{m.count > 1 ? "s" : ""})
                      </span>
                    </div>
                    <div className="h-4 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Payé : {formatFCFA(m.paid)}</span>
                      <span>{Math.round(paidPct)}% payé</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Répartition par statut */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Répartition par statut</h3>
          {[
            { label: "Payées", value: stats.totalPaye, color: "bg-emerald-500" },
            { label: "En attente", value: stats.totalEnAttente, color: "bg-yellow-500" },
            { label: "Partiel", value: stats.totalPartiel, color: "bg-blue-500" },
            { label: "Annulées", value: stats.totalAnnule, color: "bg-red-500" },
          ].map((bar) => (
            <div key={bar.label} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{bar.label}</span>
                <span className="text-muted-foreground">
                  {formatFCFA(bar.value)}
                  {stats.nbFactures > 0
                    ? ` (${Math.round((bar.value / Math.max(stats.totalFacture, 1)) * 100)}%)`
                    : ""}
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${bar.color} transition-all duration-500`}
                  style={{
                    width: `${stats.totalFacture > 0 ? (bar.value / Math.max(stats.totalFacture, 1)) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
