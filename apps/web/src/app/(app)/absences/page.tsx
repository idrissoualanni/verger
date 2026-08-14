"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarOff,
  Loader2,
  Search,
  Send,
  CheckCircle,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api";

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

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

type Parent = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
};

type Student = {
  id: string;
  matricule: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: "M" | "F";
  classId: string;
  parentId: string;
  qrCodeUrl: string;
  schoolYear: string;
  isActive: boolean;
  createdAt: string;
  class?: Classe & { level?: Level };
  parent?: Parent;
};

type Absence = {
  id: string;
  studentId: string;
  date: string;
  reason: string | null;
  justified: boolean;
  notified: boolean;
  createdAt: string;
  student?: Student;
};

type AbsenceStats = {
  total: number;
  justified: number;
  unjustified: number;
  notified: number;
};

type NotifyReport = {
  sent: number;
  failed: number;
  total: number;
  details: Array<{
    absenceId: string;
    studentName: string;
    parentPhone: string;
    success: boolean;
  }>;
};

type TabValue = "saisie" | "historique" | "statistiques";

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function currentMonthISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function monthLabel(monthISO: string): string {
  const [y, m] = monthISO.split("-");
  const d = new Date(parseInt(y), parseInt(m) - 1, 1);
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

/* ------------------------------------------------------------------ */
/* Page principale                                                      */
/* ------------------------------------------------------------------ */

export default function AbsencesPage() {
  const [activeTab, setActiveTab] = useState<TabValue>("saisie");
  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const allClasses = levels.flatMap((l) =>
    l.classes.map((c) => ({ ...c, levelName: l.name }))
  );

  useEffect(() => {
    api
      .get<Level[]>("/levels")
      .then(setLevels)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" /> Chargement…
      </div>
    );
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Absences</h1>
        <p className="text-sm text-muted-foreground">
          Saisie, suivi et notification des absences des élèves.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        <TabsList className="rounded-xl">
          <TabsTrigger value="saisie" className="gap-2">
            <CalendarOff className="size-4" /> Saisie
          </TabsTrigger>
          <TabsTrigger value="historique">Historique</TabsTrigger>
          <TabsTrigger value="statistiques">Statistiques</TabsTrigger>
        </TabsList>

        <TabsContent value="saisie" className="mt-4 space-y-4">
          <SaisieTab allClasses={allClasses} />
        </TabsContent>

        <TabsContent value="historique" className="mt-4 space-y-4">
          <HistoriqueTab allClasses={allClasses} />
        </TabsContent>

        <TabsContent value="statistiques" className="mt-4 space-y-4">
          <StatistiquesTab allClasses={allClasses} />
        </TabsContent>
      </Tabs>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet Saisie                                                        */
/* ------------------------------------------------------------------ */

function SaisieTab({
  allClasses,
}: {
  allClasses: (Classe & { levelName: string })[];
}) {
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [students, setStudents] = useState<Student[]>([]);
  const [absentIds, setAbsentIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadStudents = useCallback(async () => {
    if (!selectedClass) {
      setStudents([]);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<{ data: Student[]; total: number }>(
        `/students?classId=${selectedClass}&limit=200`
      );
      setStudents(res.data);
      setAbsentIds(new Set());
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [selectedClass]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  async function handleSave() {
    if (absentIds.size === 0) {
      toast.error("Aucun élève absent sélectionné");
      return;
    }

    setSaving(true);
    try {
      const records = Array.from(absentIds).map((studentId) => ({
        studentId,
        date: selectedDate,
      }));
      await api.post("/absences", records);
      toast.success(`${records.length} absence${records.length > 1 ? "s" : ""} enregistrée${records.length > 1 ? "s" : ""}`);
      setAbsentIds(new Set());
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  function toggleAbsent(studentId: string) {
    setAbsentIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Marquer les absences</CardTitle>
        <CardDescription>
          Sélectionnez une classe et une date, puis cochez les élèves absents.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filtres */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px] space-y-2">
            <Label>Classe</Label>
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir une classe" />
              </SelectTrigger>
              <SelectContent>
                {allClasses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.levelName})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[200px] space-y-2">
            <Label>Date</Label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
        </div>

        {/* Liste élèves */}
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Chargement…
          </div>
        ) : students.length === 0 ? (
          <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            {selectedClass ? "Aucun élève dans cette classe." : "Sélectionnez une classe."}
          </div>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">Absent</TableHead>
                  <TableHead>Matricule</TableHead>
                  <TableHead>Nom complet</TableHead>
                  <TableHead>Genre</TableHead>
                  <TableHead>Parent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((s) => (
                  <TableRow
                    key={s.id}
                    className={absentIds.has(s.id) ? "bg-destructive/5" : ""}
                  >
                    <TableCell>
                      <Checkbox
                        checked={absentIds.has(s.id)}
                        onCheckedChange={() => toggleAbsent(s.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                        {s.matricule}
                      </code>
                    </TableCell>
                    <TableCell className="font-medium">
                      {s.firstName} {s.lastName}
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.gender === "M" ? "default" : "secondary"} className="text-xs">
                        {s.gender === "M" ? "M" : "F"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.parent?.name ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Résumé + bouton */}
        {students.length > 0 && (
          <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
            <span className="text-sm">
              <span className="font-semibold text-destructive">{absentIds.size}</span> / {students.length} absent{absentIds.size !== 1 ? "s" : ""}
            </span>
            <Button
              onClick={handleSave}
              disabled={absentIds.size === 0 || saving}
            >
              {saving ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : null}
              Enregistrer les absences
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet Historique                                                    */
/* ------------------------------------------------------------------ */

function HistoriqueTab({
  allClasses,
}: {
  allClasses: (Classe & { levelName: string })[];
}) {
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [justifiedFilter, setJustifiedFilter] = useState("");
  const [notifyDialog, setNotifyDialog] = useState(false);
  const [notifyReport, setNotifyReport] = useState<NotifyReport | null>(null);
  const [sending, setSending] = useState(false);

  const loadAbsences = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedClass) params.set("classId", selectedClass);
      if (selectedDate) params.set("date", selectedDate);
      if (justifiedFilter) params.set("justified", justifiedFilter);

      const res = await api.get<{ data: Absence[]; total: number }>(
        `/absences?${params}`
      );
      setAbsences(res.data);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [selectedClass, selectedDate, justifiedFilter]);

  useEffect(() => {
    loadAbsences();
  }, [loadAbsences]);

  async function handleNotify() {
    const unnotified = absences.filter((a) => !a.notified);
    if (unnotified.length === 0) {
      toast.info("Toutes les absences ont déjà été notifiées.");
      return;
    }

    setSending(true);
    try {
      const report = await api.post<NotifyReport>("/absences/notify", {
        absenceIds: unnotified.map((a) => a.id),
      });
      setNotifyReport(report);
      setNotifyDialog(true);
      loadAbsences();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur");
    } finally {
      setSending(false);
    }
  }

  async function handleJustify(absence: Absence) {
    try {
      await api.patch(`/absences/${absence.id}`, { justified: true });
      toast.success("Absence justifiée");
      loadAbsences();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur");
    }
  }

  async function handleDelete(absenceId: string) {
    try {
      await api.delete(`/absences/${absenceId}`);
      toast.success("Absence supprimée");
      loadAbsences();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur");
    }
  }

  const unnotifiedCount = absences.filter((a) => !a.notified).length;

  return (
    <>
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Historique des absences</CardTitle>
            <CardDescription>
              Consultez et gérez les absences enregistrées.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleNotify}
              disabled={unnotifiedCount === 0 || sending}
            >
              {sending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Send className="mr-2 size-4" />
              )}
              Notifier parents{unnotifiedCount > 0 ? ` (${unnotifiedCount})` : ""}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtres */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[180px] space-y-2">
              <Label>Classe</Label>
              <Select value={selectedClass} onValueChange={setSelectedClass}>
                <SelectTrigger>
                  <SelectValue placeholder="Toutes les classes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Toutes</SelectItem>
                  {allClasses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[180px] space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
            <div className="w-[180px] space-y-2">
              <Label>Statut</Label>
              <Select value={justifiedFilter} onValueChange={setJustifiedFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Toutes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Toutes</SelectItem>
                  <SelectItem value="true">Justifiées</SelectItem>
                  <SelectItem value="false">Non justifiées</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="ghost" size="sm" onClick={loadAbsences}>
              <Search className="mr-2 size-4" /> Filtrer
            </Button>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" /> Chargement…
            </div>
          ) : absences.length === 0 ? (
            <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
              Aucune absence trouvée.
            </div>
          ) : (
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Élève</TableHead>
                    <TableHead>Classe</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Notifié</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {absences.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">
                        {a.student
                          ? `${a.student.firstName} ${a.student.lastName}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {a.student?.class?.name ?? "—"}
                      </TableCell>
                      <TableCell>{formatDate(a.date)}</TableCell>
                      <TableCell>
                        {a.justified ? (
                          <Badge variant="default" className="gap-1 text-xs">
                            <CheckCircle className="size-3" /> Justifiée
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="gap-1 text-xs">
                            <XCircle className="size-3" /> Non justifiée
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {a.notified ? (
                          <Badge variant="secondary" className="gap-1 text-xs">
                            <Send className="size-3" /> Oui
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Non</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {!a.justified && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => handleJustify(a)}
                            >
                              Justifier
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive"
                            onClick={() => handleDelete(a.id)}
                          >
                            Supprimer
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog rapport notification */}
      {notifyDialog && notifyReport && (
        <NotifyReportDialog
          report={notifyReport}
          onClose={() => {
            setNotifyDialog(false);
            setNotifyReport(null);
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet Statistiques                                                  */
/* ------------------------------------------------------------------ */

function StatistiquesTab({
  allClasses,
}: {
  allClasses: (Classe & { levelName: string })[];
}) {
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(currentMonthISO());
  const [stats, setStats] = useState<AbsenceStats | null>(null);
  const [loading, setLoading] = useState(false);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedClass) params.set("classId", selectedClass);
      if (selectedMonth) params.set("month", selectedMonth);

      const res = await api.get<AbsenceStats>(`/absences/stats?${params}`);
      setStats(res);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [selectedClass, selectedMonth]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const bars = stats
    ? [
        {
          label: "Total",
          value: stats.total,
          color: "bg-primary",
        },
        {
          label: "Justifiées",
          value: stats.justified,
          color: "bg-emerald-500",
        },
        {
          label: "Non justifiées",
          value: stats.unjustified,
          color: "bg-destructive",
        },
        {
          label: "Notifiées",
          value: stats.notified,
          color: "bg-blue-500",
        },
      ]
    : [];

  const maxBar = Math.max(...bars.map((b) => b.value), 1);

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Statistiques des absences</CardTitle>
        <CardDescription>
          Vue d&apos;ensemble par classe et par mois.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filtres */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px] space-y-2">
            <Label>Classe</Label>
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger>
                <SelectValue placeholder="Toutes les classes" />
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
          <div className="w-[200px] space-y-2">
            <Label>Mois</Label>
            <Input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />
          </div>
        </div>

        {/* Stats */}
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Chargement…
          </div>
        ) : !stats ? (
          <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            Aucune donnée.
          </div>
        ) : (
          <div className="space-y-6">
            {/* KPI cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Total", value: stats.total, color: "text-primary" },
                { label: "Justifiées", value: stats.justified, color: "text-emerald-600" },
                { label: "Non justifiées", value: stats.unjustified, color: "text-destructive" },
                { label: "Notifiées", value: stats.notified, color: "text-blue-600" },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="rounded-xl border bg-card p-4 text-center"
                >
                  <div className={`text-3xl font-bold ${kpi.color}`}>{kpi.value}</div>
                  <div className="text-xs text-muted-foreground">{kpi.label}</div>
                </div>
              ))}
            </div>

            {/* Barres CSS */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium">
                Répartition — {monthLabel(selectedMonth)}
              </h3>
              {bars.map((bar) => (
                <div key={bar.label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{bar.label}</span>
                    <span className="text-muted-foreground">
                      {bar.value} {stats.total > 0 ? `(${Math.round((bar.value / Math.max(stats.total, 1)) * 100)}%)` : ""}
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${bar.color} transition-all duration-500`}
                      style={{
                        width: `${stats.total > 0 ? (bar.value / Math.max(stats.total, 1)) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Dialog Rapport Notification                                          */
/* ------------------------------------------------------------------ */

function NotifyReportDialog({
  report,
  onClose,
}: {
  report: NotifyReport;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="size-5 text-primary" />
            Rapport de notification
          </DialogTitle>
          <DialogDescription>
            Simulation WhatsApp — résultat de l&apos;envoi aux parents.
          </DialogDescription>
        </DialogHeader>

        {/* Résumé */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center dark:border-emerald-900 dark:bg-emerald-950">
            <div className="text-2xl font-bold text-emerald-600">{report.sent}</div>
            <div className="text-xs text-emerald-700 dark:text-emerald-400">Envoyés</div>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center dark:border-red-900 dark:bg-red-950">
            <div className="text-2xl font-bold text-red-600">{report.failed}</div>
            <div className="text-xs text-red-700 dark:text-red-400">Échoués</div>
          </div>
        </div>

        {/* Détails */}
        <div className="max-h-60 overflow-y-auto space-y-1 rounded-lg border">
          {report.details.map((d) => (
            <div
              key={d.absenceId}
              className="flex items-center gap-2 px-3 py-2 text-sm"
            >
              {d.success ? (
                <CheckCircle className="size-4 shrink-0 text-emerald-600" />
              ) : (
                <XCircle className="size-4 shrink-0 text-red-600" />
              )}
              <span className="flex-1 truncate">{d.studentName}</span>
              <span className="text-xs text-muted-foreground">{d.parentPhone}</span>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
