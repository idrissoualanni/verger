"use client";

import { useCallback, useEffect, useState } from "react";
import {
  MessageCircle,
  Loader2,
  Send,
  CheckCircle,
  XCircle,
  AlertCircle,
  BarChart3,
  History,
  FileText,
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
  class?: { name: string };
  parent?: { name: string; phone: string };
};

type Parent = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
};

type WhatsAppMessage = {
  id: string;
  type: "INDIVIDUEL" | "MASSE";
  studentId: string | null;
  parentId: string | null;
  recipientName: string | null;
  recipientPhone: string;
  message: string;
  status: "ENVOYE" | "ECHOUE";
  errorMessage: string | null;
  sentAt: string;
  student?: Student;
  parent?: Parent;
};

type WhatsAppStats = {
  total: number;
  sent: number;
  failed: number;
  successRate: number;
  period: string;
};

type SendResult = {
  id: string;
  status: "ENVOYE" | "ECHOUE";
  errorMessage: string | null;
  recipientPhone: string;
  message: string;
};

type TabValue = "envoyer" | "historique" | "statistiques";

/* ------------------------------------------------------------------ */
/* Templates de messages                                                */
/* ------------------------------------------------------------------ */

const MESSAGE_TEMPLATES = [
  {
    label: "Absence élève",
    text: "Bonjour {{PARENT}}, votre enfant {{ELEVE}} a été absent(e) aujourd'hui.",
  },
  {
    label: "Rappel réunion",
    text: "Rappel : la réunion parents-profs aura lieu le {{DATE}}.",
  },
  {
    label: "Scolarité en attente",
    text: "Bonjour, le paiement de la scolarité de {{ELEVE}} est en attente.",
  },
];

function replaceTemplateVariables(
  template: string,
  vars: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Compteur SMS                                                         */
/* ------------------------------------------------------------------ */

function countSmsMessages(text: string): { count: number; remaining: number } {
  if (!text || text.length === 0) return { count: 0, remaining: 160 };
  if (text.length <= 160) return { count: 1, remaining: 160 - text.length };
  const charsPerMessage = 70;
  const count = Math.ceil(text.length / charsPerMessage);
  const remaining = charsPerMessage - (text.length % charsPerMessage || charsPerMessage);
  return { count, remaining };
}

/* ------------------------------------------------------------------ */
/* Page principale                                                      */
/* ------------------------------------------------------------------ */

export default function WhatsAppPage() {
  const [activeTab, setActiveTab] = useState<TabValue>("envoyer");

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Envoi de messages aux parents via WhatsApp (simulation).
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        <TabsList className="rounded-xl">
          <TabsTrigger value="envoyer" className="gap-2">
            <Send className="size-4" /> Envoyer
          </TabsTrigger>
          <TabsTrigger value="historique" className="gap-2">
            <History className="size-4" /> Historique
          </TabsTrigger>
          <TabsTrigger value="statistiques" className="gap-2">
            <BarChart3 className="size-4" /> Statistiques
          </TabsTrigger>
        </TabsList>

        <TabsContent value="envoyer" className="mt-4 space-y-4">
          <EnvoyerTab />
        </TabsContent>

        <TabsContent value="historique" className="mt-4 space-y-4">
          <HistoriqueTab />
        </TabsContent>

        <TabsContent value="statistiques" className="mt-4 space-y-4">
          <StatistiquesTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet Envoyer                                                       */
/* ------------------------------------------------------------------ */

function EnvoyerTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [loading, setLoading] = useState(true);

  const [recipientType, setRecipientType] = useState<"student" | "parent">("student");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedParentId, setSelectedParentId] = useState("");
  const [message, setMessage] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<Student[]>("/students?limit=500").catch(() => [] as Student[]),
      api.get<Parent[]>("/parents?limit=500").catch(() => [] as Parent[]),
    ]).then(([s, p]) => {
      const studentsList = Array.isArray(s) ? s : (s as any)?.data ?? [];
      const parentsList = Array.isArray(p) ? p : (p as any)?.data ?? [];
      setStudents(studentsList);
      setParents(parentsList);
      setLoading(false);
    });
  }, []);

  const selectedStudent = students.find((s) => s.id === selectedStudentId);
  const selectedParent = parents.find((p) => p.id === selectedParentId);

  const phoneNumber =
    recipientType === "student"
      ? selectedStudent?.parent?.phone ?? ""
      : selectedParent?.phone ?? "";

  const recipientName =
    recipientType === "student"
      ? selectedStudent?.parent?.name ?? ""
      : selectedParent?.name ?? "";

  const smsInfo = countSmsMessages(message);

  function handleTemplateSelect(templateText: string) {
    const vars: Record<string, string> = {
      PARENT: recipientName || "{{PARENT}}",
      ELEVE: selectedStudent
        ? `${selectedStudent.firstName} ${selectedStudent.lastName}`
        : "{{ELEVE}}",
      DATE: new Date().toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
    };
    setMessage(replaceTemplateVariables(templateText, vars));
  }

  async function handleSend() {
    if (!phoneNumber) {
      toast.error("Numéro de téléphone non disponible");
      return;
    }
    if (!message.trim()) {
      toast.error("Message vide");
      return;
    }

    setSending(true);
    setResult(null);
    try {
      const res = await api.post<SendResult>("/whatsapp/send", {
        phoneNumber,
        message: message.trim(),
        studentId: recipientType === "student" ? selectedStudentId : null,
        parentId: recipientType === "parent" ? selectedParentId : null,
        recipientName: recipientName || null,
      });
      setResult(res);
      if (res.status === "ENVOYE") {
        toast.success("Message envoyé avec succès");
      } else {
        toast.error(`Échec de l'envoi : ${res.errorMessage ?? "erreur inconnue"}`);
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" /> Chargement…
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Formulaire */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Composer un message</CardTitle>
          <CardDescription>
            Sélectionnez un destinataire et rédigez votre message.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Type de destinataire */}
          <div className="space-y-2">
            <Label>Destinataire</Label>
            <Select
              value={recipientType}
              onValueChange={(v) => {
                setRecipientType(v as "student" | "parent");
                setSelectedStudentId("");
                setSelectedParentId("");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="student">Par élève (parent auto)</SelectItem>
                <SelectItem value="parent">Par parent direct</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Select élève ou parent */}
          {recipientType === "student" ? (
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
                  Parent : {selectedStudent.parent?.name ?? "—"} | Tél : {phoneNumber || "N/A"}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Parent</Label>
              <Select value={selectedParentId} onValueChange={setSelectedParentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un parent" />
                </SelectTrigger>
                <SelectContent>
                  {parents.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {p.phone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Templates */}
          <div className="space-y-2">
            <Label>Templates prédéfinis</Label>
            <div className="flex flex-wrap gap-2">
              {MESSAGE_TEMPLATES.map((t) => (
                <Button
                  key={t.label}
                  variant="outline"
                  size="sm"
                  onClick={() => handleTemplateSelect(t.text)}
                >
                  <FileText className="mr-1 size-3" /> {t.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              placeholder="Rédigez votre message ici…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{message.length} caractères</span>
              <span>
                {smsInfo.count > 0
                  ? `${smsInfo.count} message${smsInfo.count > 1 ? "s" : ""} SMS`
                  : "0 message SMS"}
              </span>
            </div>
          </div>

          {/* Bouton envoyer */}
          <Button onClick={handleSend} disabled={sending || !phoneNumber || !message.trim()} className="w-full">
            {sending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Send className="mr-2 size-4" />
            )}
            Envoyer le message
          </Button>
        </CardContent>
      </Card>

      {/* Aperçu WhatsApp */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Aperçu du message</CardTitle>
          <CardDescription>
            Prévisualisation du message tel qu'il apparaîtra sur WhatsApp.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl bg-[#e5ddd5] p-4 dark:bg-[#0b141a] min-h-[300px]">
            {/* En-tête WhatsApp */}
            <div className="mb-3 flex items-center gap-2 border-b border-[#c9c9c9] pb-2 dark:border-[#2a3942]">
              <div className="size-8 rounded-full bg-[#25d366] flex items-center justify-center">
                <MessageCircle className="size-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#111b21] dark:text-[#e9edef]">
                  {recipientName || "Destinataire"}
                </p>
                <p className="text-xs text-[#667781]">
                  {phoneNumber || "+221 XX XXX XX XX"}
                </p>
              </div>
            </div>

            {/* Bulle de message */}
            {message ? (
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 shadow-sm dark:bg-[#005c4b]">
                  <p className="whitespace-pre-wrap text-sm text-[#111b21] dark:text-[#e9edef]">
                    {message}
                  </p>
                  <div className="mt-1 flex items-center justify-end gap-1">
                    <span className="text-[10px] text-[#667781]">
                      {new Date().toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {result && (
                      result.status === "ENVOYE" ? (
                        <CheckCircle className="size-3 text-blue-500" />
                      ) : (
                        <XCircle className="size-3 text-red-500" />
                      )
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-[200px] items-center justify-center text-sm text-[#667781]">
                Votre message apparaîtra ici…
              </div>
            )}

            {/* Résultat de l'envoi */}
            {result && (
              <div
                className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  result.status === "ENVOYE"
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                    : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400"
                }`}
              >
                {result.status === "ENVOYE" ? (
                  <CheckCircle className="size-4 shrink-0" />
                ) : (
                  <XCircle className="size-4 shrink-0" />
                )}
                <span className="flex-1">
                  {result.status === "ENVOYE"
                    ? "Message envoyé avec succès"
                    : `Échec : ${result.errorMessage ?? "erreur inconnue"}`}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet Historique                                                    */
/* ------------------------------------------------------------------ */

function HistoriqueTab() {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const [filterStatus, setFilterStatus] = useState("");
  const [filterStudentId, setFilterStudentId] = useState("");
  const [students, setStudents] = useState<Student[]>([]);

  useEffect(() => {
    api.get<Student[]>("/students?limit=500").then((res) => {
      setStudents(Array.isArray(res) ? res : (res as any)?.data ?? []);
    });
  }, []);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      if (filterStudentId) params.set("studentId", filterStudentId);
      params.set("limit", String(limit));
      params.set("offset", String(offset));

      const res = await api.get<{ data: WhatsAppMessage[]; total: number }>(
        `/whatsapp/history?${params}`
      );
      setMessages(res.data);
      setTotal(res.total);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterStudentId, offset]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Historique des messages</CardTitle>
        <CardDescription>
          Tous les messages WhatsApp envoyés.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filtres */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-[180px] space-y-2">
            <Label>Statut</Label>
            <Select value={filterStatus} onValueChange={(v: string) => { setFilterStatus(v); setOffset(0); }}>
              <SelectTrigger>
                <SelectValue placeholder="Tous" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Tous</SelectItem>
                <SelectItem value="ENVOYE">Succès</SelectItem>
                <SelectItem value="ECHOUE">Échec</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-[200px] space-y-2">
            <Label>Élève</Label>
            <Select value={filterStudentId} onValueChange={(v: string) => { setFilterStudentId(v); setOffset(0); }}>
              <SelectTrigger>
                <SelectValue placeholder="Tous les élèves" />
              </SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.firstName} {s.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="ghost" size="sm" onClick={loadHistory}>
            Filtrer
          </Button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Chargement…
          </div>
        ) : messages.length === 0 ? (
          <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            Aucun message trouvé.
          </div>
        ) : (
          <>
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Destinataire</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {messages.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{m.recipientName ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">{m.recipientPhone}</p>
                          {m.student && (
                            <p className="text-xs text-muted-foreground">
                              Élève : {m.student.firstName} {m.student.lastName}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[300px]">
                        <p className="truncate text-sm">{m.message}</p>
                        {m.errorMessage && (
                          <p className="text-xs text-destructive">{m.errorMessage}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        {m.status === "ENVOYE" ? (
                          <Badge variant="default" className="gap-1 text-xs bg-emerald-600">
                            <CheckCircle className="size-3" /> Envoyé
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="gap-1 text-xs">
                            <XCircle className="size-3" /> Échec
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(m.sentAt)}
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
                  Page {currentPage} sur {totalPages} ({total} messages)
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
/* Onglet Statistiques                                                  */
/* ------------------------------------------------------------------ */

function StatistiquesTab() {
  const [period, setPeriod] = useState<"day" | "week" | "month">("week");
  const [stats, setStats] = useState<WhatsAppStats | null>(null);
  const [loading, setLoading] = useState(false);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<WhatsAppStats>(`/whatsapp/stats?period=${period}`);
      setStats(res);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const periodLabel = {
    day: "Aujourd'hui",
    week: "7 derniers jours",
    month: "30 derniers jours",
  }[period];

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Statistiques d'envoi</CardTitle>
        <CardDescription>
          Performance des envois WhatsApp.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Période */}
        <div className="flex gap-2">
          {(["day", "week", "month"] as const).map((p) => (
            <Button
              key={p}
              variant={period === p ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriod(p)}
            >
              {p === "day" ? "Jour" : p === "week" ? "Semaine" : "Mois"}
            </Button>
          ))}
        </div>

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
              <div className="rounded-xl border bg-card p-4 text-center">
                <div className="text-3xl font-bold text-primary">{stats.total}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
              <div className="rounded-xl border bg-card p-4 text-center">
                <div className="text-3xl font-bold text-emerald-600">{stats.sent}</div>
                <div className="text-xs text-muted-foreground">Envoyés</div>
              </div>
              <div className="rounded-xl border bg-card p-4 text-center">
                <div className="text-3xl font-bold text-destructive">{stats.failed}</div>
                <div className="text-xs text-muted-foreground">Échecs</div>
              </div>
              <div className="rounded-xl border bg-card p-4 text-center">
                <div className="text-3xl font-bold text-blue-600">{stats.successRate}%</div>
                <div className="text-xs text-muted-foreground">Taux de succès</div>
              </div>
            </div>

            {/* Barre de progression CSS */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium">
                Taux de succès — {periodLabel}
              </h3>
              <div className="h-6 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${stats.successRate}%` }}
                />
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>0%</span>
                <span className="font-medium text-emerald-600">{stats.successRate}% de succès</span>
                <span>100%</span>
              </div>
            </div>

            {/* Répartition en barres */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Répartition détaillée</h3>
              {[
                { label: "Envoyés", value: stats.sent, color: "bg-emerald-500" },
                { label: "Échecs", value: stats.failed, color: "bg-destructive" },
              ].map((bar) => (
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
