"use client";

import { useCallback, useEffect, useState } from "react";
import { Wallet, History, AlertCircle, Loader2, Check, X, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

type Student = {
  id: string;
  matricule: string;
  firstName: string;
  lastName: string;
  classId: string;
  parentId: string;
  isActive: boolean;
  class?: {
    id: string;
    name: string;
    levelId: string;
    tuitionFee: string;
    schoolYear: string;
    level?: {
      id: string;
      name: string;
      order: number;
      description: string | null;
    };
  };
  parent?: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    address: string | null;
  };
};

type Payment = {
  id: string;
  studentId: string;
  amount: string;
  method: "ESPECES" | "MOBILE_MONEY" | "VIREMENT";
  status: "EN_ATTENTE" | "VALIDE" | "ANNULE";
  month: string;
  reference: string | null;
  secretaryId: string | null;
  notes: string | null;
  whatsappSent: boolean;
  createdAt: string;
  student?: Student;
};

type PaymentStats = {
  totalValide: number;
  totalEnAttente: number;
  totalAnnule: number;
  countValide: number;
  countEnAttente: number;
  countAnnule: number;
  byMethod: Record<string, { count: number; total: number }>;
  totalPayments: number;
};

type Classe = {
  id: string;
  name: string;
  levelId: string;
  tuitionFee: string;
  schoolYear: string;
};

type Level = {
  id: string;
  name: string;
  order: number;
  description: string | null;
  classes: Classe[];
};

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function formatFCFA(amount: number | string): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
}

const methodLabels: Record<string, string> = {
  ESPECES: "Espèces",
  MOBILE_MONEY: "Mobile Money",
  VIREMENT: "Virement",
};

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  EN_ATTENTE: { label: "En attente", variant: "secondary" },
  VALIDE: { label: "Validé", variant: "default" },
  ANNULE: { label: "Annulé", variant: "destructive" },
};

function schoolYearMonths(schoolYear: string): string[] {
  const [startStr] = schoolYear.split("-");
  const start = parseInt(startStr);
  const months = [
    "Septembre", "Octobre", "Novembre", "Décembre",
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août",
  ];
  const result: string[] = [];
  for (let i = 0; i < 12; i++) {
    const year = i <= 3 ? start : start + 1;
    result.push(`${months[i]} ${year}`);
  }
  return result;
}

function defaultSchoolYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

function defaultMonth(): string {
  const now = new Date();
  const months = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
  ];
  const sy = defaultSchoolYear();
  return `${months[now.getMonth()]} ${sy.split("-")[now.getMonth() >= 7 ? 0 : 1]}`;
}

/* ------------------------------------------------------------------ */
/* Page principale                                                      */
/* ------------------------------------------------------------------ */

export default function PaiementsPage() {
  const [levels, setLevels] = useState<Level[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stats, setStats] = useState<PaymentStats | null>(null);
  const [unpaid, setUnpaid] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>("");

  // Filters
  const [classFilter, setClassFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState(defaultMonth());

  // Form state
  const [selectedStudent, setSelectedStudent] = useState("");
  const [formMonth, setFormMonth] = useState(defaultMonth());
  const [formAmount, setFormAmount] = useState("");
  const [formMethod, setFormMethod] = useState("ESPECES");
  const [formReference, setFormReference] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formBusy, setFormBusy] = useState(false);

  // Unpaid month
  const [unpaidMonth, setUnpaidMonth] = useState(defaultMonth());
  const [unpaidClassFilter, setUnpaidClassFilter] = useState("");

  const schoolYear = defaultSchoolYear();
  const months = schoolYearMonths(schoolYear);
  const allClasses = levels.flatMap((l) =>
    l.classes.map((c) => ({ ...c, levelName: l.name }))
  );

  // Load user role
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/session");
        const data = await res.json();
        if (data?.session?.user?.role) {
          setUserRole(data.session.user.role);
        }
      } catch {
        // silently fail
      }
    })();
  }, []);

  const reloadPayments = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (classFilter) params.set("classId", classFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (monthFilter) params.set("month", monthFilter);
      const res = await api.get<{ data: Payment[]; total: number }>(
        `/payments?${params}`
      );
      setPayments(res.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [classFilter, statusFilter, monthFilter]);

  const reloadStats = useCallback(async () => {
    if (userRole === "SECRETAIRE") return;
    try {
      const params = new URLSearchParams();
      if (classFilter) params.set("classId", classFilter);
      if (monthFilter) params.set("month", monthFilter);
      const res = await api.get<PaymentStats>(`/payments/stats?${params}`);
      setStats(res);
    } catch {
      // silently fail for stats
    }
  }, [classFilter, monthFilter, userRole]);

  const reloadUnpaid = useCallback(async () => {
    try {
      const params = new URLSearchParams({ month: unpaidMonth });
      if (unpaidClassFilter) params.set("classId", unpaidClassFilter);
      const res = await api.get<{ data: Student[]; total: number }>(
        `/payments/unpaid?${params}`
      );
      setUnpaid(res.data);
    } catch {
      // silently fail
    }
  }, [unpaidMonth, unpaidClassFilter]);

  const loadRefs = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([
        api.get<Level[]>("/levels"),
        api.get<{ data: Student[]; total: number }>("/students?limit=500"),
      ]);
      setLevels(l);
      setStudents(s.data);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    reloadPayments();
    reloadStats();
    reloadUnpaid();
    loadRefs();
  }, [reloadPayments, reloadStats, reloadUnpaid, loadRefs]);

  // Auto-fill amount from student's class tuition fee
  useEffect(() => {
    if (selectedStudent) {
      const student = students.find((s) => s.id === selectedStudent);
      if (student?.class?.tuitionFee) {
        setFormAmount(student.class.tuitionFee);
      }
    }
  }, [selectedStudent, students]);

  async function handleCreatePayment() {
    if (!selectedStudent || !formAmount || !formMethod || !formMonth) {
      toast.error("Tous les champs sont requis");
      return;
    }
    setFormBusy(true);
    try {
      await api.post("/payments", {
        studentId: selectedStudent,
        amount: parseFloat(formAmount),
        method: formMethod,
        month: formMonth,
        reference: formReference || null,
        notes: formNotes || null,
      });
      toast.success("Paiement enregistré");
      setSelectedStudent("");
      setFormAmount("");
      setFormMethod("ESPECES");
      setFormReference("");
      setFormNotes("");
      await reloadPayments();
      await reloadStats();
      await reloadUnpaid();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Une erreur est survenue");
    } finally {
      setFormBusy(false);
    }
  }

  async function handleUpdateStatus(paymentId: string, status: "VALIDE" | "ANNULE") {
    try {
      await api.patch(`/payments/${paymentId}`, { status });
      toast.success(status === "VALIDE" ? "Paiement validé" : "Paiement annulé");
      await reloadPayments();
      await reloadStats();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Une erreur est survenue");
    }
  }

  async function handleRappel(student: Student) {
    const parentPhone = student.parent?.phone;
    if (!parentPhone) {
      toast.error("Aucun numéro de parent pour cet élève");
      return;
    }
    const message = `Bonjour ${student.parent?.name}, nous vous rappelons que la scolarité de ${student.firstName} ${student.lastName} pour le mois de ${unpaidMonth} n'a pas encore été réglée. Merci de passer au secrétariat. — Le Verger`;
    const url = `https://wa.me/${parentPhone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
    toast.success("WhatsApp ouvert");
  }

  const selectedStudentObj = students.find((s) => s.id === selectedStudent);
  const canSeeStats = userRole !== "SECRETAIRE";
  const canCreate = userRole !== "COMPTABLE";
  const canModify = userRole !== "COMPTABLE";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Paiements</h1>
        <p className="text-sm text-muted-foreground">
          Gestion des scolarités — année {schoolYear}
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Tabs defaultValue="enregistrer">
        <TabsList>
          <TabsTrigger value="enregistrer">Enregistrer</TabsTrigger>
          <TabsTrigger value="historique">Historique</TabsTrigger>
          <TabsTrigger value="impayes">Impayés</TabsTrigger>
        </TabsList>

        {/* ---- ENREGISTRER ---- */}
        <TabsContent value="enregistrer" className="space-y-4">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Nouveau paiement</CardTitle>
            </CardHeader>
            <CardContent>
              {canCreate ? (
                <div className="space-y-4">
                  {/* Élève */}
                  <div className="space-y-2">
                    <Label>Élève</Label>
                    <Select value={selectedStudent} onValueChange={setSelectedStudent}>
                      <SelectTrigger>
                        <SelectValue placeholder="Rechercher un élève…" />
                      </SelectTrigger>
                      <SelectContent>
                        {students
                          .filter((s) => s.isActive)
                          .sort((a, b) =>
                            `${a.lastName} ${a.firstName}`.localeCompare(
                              `${b.lastName} ${b.firstName}`
                            )
                          )
                          .map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.matricule} — {s.firstName} {s.lastName}{" "}
                              {s.class && `(${s.class.name})`}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Mois */}
                  <div className="space-y-2">
                    <Label>Mois</Label>
                    <Select value={formMonth} onValueChange={setFormMonth}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {months.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Montant */}
                  <div className="space-y-2">
                    <Label>Montant (FCFA)</Label>
                    <Input
                      type="number"
                      value={formAmount}
                      onChange={(e) => setFormAmount(e.target.value)}
                      placeholder="150000"
                    />
                    {selectedStudentObj?.class?.tuitionFee && (
                      <p className="text-xs text-muted-foreground">
                        Scolarité mensuelle : {formatFCFA(selectedStudentObj.class.tuitionFee)}
                      </p>
                    )}
                  </div>

                  {/* Méthode */}
                  <div className="space-y-2">
                    <Label>Méthode de paiement</Label>
                    <Select value={formMethod} onValueChange={setFormMethod}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ESPECES">Espèces</SelectItem>
                        <SelectItem value="MOBILE_MONEY">Mobile Money</SelectItem>
                        <SelectItem value="VIREMENT">Virement</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Référence (si Mobile Money) */}
                  {formMethod === "MOBILE_MONEY" && (
                    <div className="space-y-2">
                      <Label>Référence transaction</Label>
                      <Input
                        value={formReference}
                        onChange={(e) => setFormReference(e.target.value)}
                        placeholder="ex: TXN-123456"
                      />
                    </div>
                  )}

                  {/* Notes */}
                  <div className="space-y-2">
                    <Label>Notes (optionnel)</Label>
                    <Textarea
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      placeholder="Remarque éventuelle…"
                      rows={2}
                    />
                  </div>

                  <Button
                    onClick={handleCreatePayment}
                    disabled={
                      formBusy ||
                      !selectedStudent ||
                      !formAmount ||
                      !formMonth
                    }
                  >
                    {formBusy ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Enregistrement…
                      </>
                    ) : (
                      <>
                        <Wallet className="mr-2 size-4" />
                        Enregistrer le paiement
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Votre rôle ne vous permet pas de créer des paiements.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- HISTORIQUE ---- */}
        <TabsContent value="historique" className="space-y-4">
          {/* Stats */}
          {canSeeStats && stats && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard
                label="Validés"
                amount={stats.totalValide}
                count={stats.countValide}
                color="bg-emerald-500"
                textColor="text-emerald-600"
              />
              <StatCard
                label="En attente"
                amount={stats.totalEnAttente}
                count={stats.countEnAttente}
                color="bg-amber-500"
                textColor="text-amber-600"
              />
              <StatCard
                label="Annulés"
                amount={stats.totalAnnule}
                count={stats.countAnnule}
                color="bg-red-500"
                textColor="text-red-600"
              />
            </div>
          )}

          {/* Barres par méthode */}
          {canSeeStats && stats && Object.keys(stats.byMethod).length > 0 && (
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base">Répartition par méthode</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(stats.byMethod).map(([method, data]) => {
                  const maxTotal = Math.max(
                    ...Object.values(stats.byMethod).map((d) => d.total)
                  );
                  const pct = maxTotal > 0 ? (data.total / maxTotal) * 100 : 0;
                  return (
                    <div key={method} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">
                          {methodLabels[method] ?? method}
                        </span>
                        <span className="text-muted-foreground">
                          {data.count} paiement{data.count > 1 ? "s" : ""} —{" "}
                          {formatFCFA(data.total)}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-2 rounded-full ${
                            method === "ESPECES"
                              ? "bg-emerald-500"
                              : method === "MOBILE_MONEY"
                                ? "bg-blue-500"
                                : "bg-violet-500"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Filtres */}
          <Card className="rounded-2xl">
            <CardContent className="flex flex-wrap items-end gap-3 pt-4">
              <div className="w-[200px] space-y-2">
                <Label>Classe</Label>
                <Select value={classFilter} onValueChange={setClassFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Toutes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Toutes</SelectItem>
                    {allClasses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({c.levelName})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-[180px] space-y-2">
                <Label>Statut</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tous" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Tous</SelectItem>
                    {Object.entries(statusConfig).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>
                        {cfg.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-[200px] space-y-2">
                <Label>Mois</Label>
                <Select value={monthFilter} onValueChange={setMonthFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Tableau */}
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="mr-2 size-5 animate-spin" /> Chargement…
            </div>
          ) : payments.length === 0 ? (
            <Card className="rounded-2xl">
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <History className="size-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Aucun paiement trouvé pour ces filtres.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-2xl">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Élève</TableHead>
                    <TableHead>Classe</TableHead>
                    <TableHead>Mois</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead>Méthode</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => {
                    const student = p.student;
                    const cfg = statusConfig[p.status] ?? statusConfig.EN_ATTENTE;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">
                          {student
                            ? `${student.firstName} ${student.lastName}`
                            : "—"}
                          {student && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              ({student.matricule})
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {student?.class ? (
                            <>
                              {student.class.name}
                              {student.class.level && (
                                <span className="ml-1 text-xs text-muted-foreground">
                                  ({student.class.level.name})
                                </span>
                              )}
                            </>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{p.month}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatFCFA(p.amount)}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {methodLabels[p.method] ?? p.method}
                          </span>
                          {p.reference && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              ({p.reference})
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={cfg.variant}>{cfg.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {canModify && p.status === "EN_ATTENTE" && (
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-emerald-600 hover:text-emerald-700"
                                onClick={() => handleUpdateStatus(p.id, "VALIDE")}
                              >
                                <Check className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-red-600 hover:text-red-700"
                                onClick={() => handleUpdateStatus(p.id, "ANNULE")}
                              >
                                <X className="size-4" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* ---- IMPAYÉS ---- */}
        <TabsContent value="impayes" className="space-y-4">
          <Card className="rounded-2xl">
            <CardContent className="flex flex-wrap items-end gap-3 pt-4">
              <div className="w-[200px] space-y-2">
                <Label>Mois</Label>
                <Select value={unpaidMonth} onValueChange={setUnpaidMonth}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-[200px] space-y-2">
                <Label>Classe</Label>
                <Select
                  value={unpaidClassFilter}
                  onValueChange={setUnpaidClassFilter}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Toutes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Toutes</SelectItem>
                    {allClasses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({c.levelName})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {unpaid.length === 0 ? (
            <Card className="rounded-2xl">
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <Check className="size-10 text-emerald-500" />
                <p className="text-sm text-muted-foreground">
                  Tous les élèves sont à jour pour {unpaidMonth} !
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {unpaid.length} élève{unpaid.length > 1 ? "s" : ""} sans
                  paiement pour {unpaidMonth}
                </p>
              </div>
              <Card className="rounded-2xl">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Matricule</TableHead>
                      <TableHead>Nom complet</TableHead>
                      <TableHead>Classe</TableHead>
                      <TableHead>Parent</TableHead>
                      <TableHead>Téléphone</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unpaid.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                            {s.matricule}
                          </code>
                        </TableCell>
                        <TableCell className="font-medium">
                          {s.firstName} {s.lastName}
                        </TableCell>
                        <TableCell>
                          {s.class?.name}
                          {s.class?.level && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              ({s.class.level.name})
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {s.parent?.name ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {s.parent?.phone ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!s.parent?.phone}
                            onClick={() => handleRappel(s)}
                          >
                            <Send className="mr-1.5 size-3.5" />
                            Rappeler
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stat Card                                                            */
/* ------------------------------------------------------------------ */

function StatCard({
  label,
  amount,
  count,
  color,
  textColor,
}: {
  label: string;
  amount: number;
  count: number;
  color: string;
  textColor: string;
}) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className={`size-3 rounded-full ${color}`} />
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={`text-xl font-semibold ${textColor}`}>
              {formatFCFA(amount)}
            </p>
            <p className="text-xs text-muted-foreground">
              {count} paiement{count > 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
