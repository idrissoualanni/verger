"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Calendar,
  Loader2,
  Plus,
  Send,
  CheckCircle,
  XCircle,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  MapPin,
  Users,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, ApiError } from "@/lib/api";

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

type EventType = "REUNION" | "EXAMEN" | "ACTIVITE" | "VACANCES" | "FETE";
type EventAudience = "TOUS" | "PRIMAIRE" | "COLLEGE" | "LYCEE" | "PARENTS" | "PERSONNEL";

type AppEvent = {
  id: string;
  title: string;
  description: string | null;
  date: string;
  endDate: string | null;
  location: string | null;
  type: EventType;
  audience: EventAudience;
  createdAt: string;
};

type NotifyReport = {
  sent: number;
  failed: number;
  total: number;
  details: Array<{
    parentName: string;
    parentPhone: string;
    success: boolean;
  }>;
};

/* ------------------------------------------------------------------ */
/* Constants                                                            */
/* ------------------------------------------------------------------ */

const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: "REUNION", label: "Réunion" },
  { value: "EXAMEN", label: "Examen" },
  { value: "ACTIVITE", label: "Activité" },
  { value: "VACANCES", label: "Vacances" },
  { value: "FETE", label: "Fête" },
];

const EVENT_AUDIENCES: { value: EventAudience; label: string }[] = [
  { value: "TOUS", label: "Tous" },
  { value: "PRIMAIRE", label: "Primaire" },
  { value: "COLLEGE", label: "Collège" },
  { value: "LYCEE", label: "Lycée" },
  { value: "PARENTS", label: "Parents" },
  { value: "PERSONNEL", label: "Personnel" },
];

const typeColors: Record<EventType, string> = {
  REUNION: "bg-blue-500",
  EXAMEN: "bg-red-500",
  ACTIVITE: "bg-emerald-500",
  VACANCES: "bg-yellow-500",
  FETE: "bg-purple-500",
};

const typeBadgeColors: Record<EventType, string> = {
  REUNION: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  EXAMEN: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  ACTIVITE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  VACANCES: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  FETE: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
};

const audienceLabels: Record<EventAudience, string> = {
  TOUS: "Tous",
  PRIMAIRE: "Primaire",
  COLLEGE: "Collège",
  LYCEE: "Lycée",
  PARENTS: "Parents",
  PERSONNEL: "Personnel",
};

const typeLabels: Record<EventType, string> = {
  REUNION: "Réunion",
  EXAMEN: "Examen",
  ACTIVITE: "Activité",
  VACANCES: "Vacances",
  FETE: "Fête",
};

const DAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function emptyEvent(): Omit<AppEvent, "id" | "createdAt"> {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return {
    title: "",
    description: "",
    date: now.toISOString(),
    endDate: null,
    location: "",
    type: "REUNION",
    audience: "TOUS",
  };
}

/* ------------------------------------------------------------------ */
/* Page principale                                                      */
/* ------------------------------------------------------------------ */

export default function EvenementsPage() {
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [activeTab, setActiveTab] = useState<"calendrier" | "liste">("calendrier");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<AppEvent | null>(null);
  const [formData, setFormData] = useState(emptyEvent());
  const [notifyOnCreate, setNotifyOnCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [notifyReport, setNotifyReport] = useState<NotifyReport | null>(null);
  const [notifyDialog, setNotifyDialog] = useState(false);
  const [sendingNotify, setSendingNotify] = useState(false);
  const [filterType, setFilterType] = useState<string>("");
  const [filterAudience, setFilterAudience] = useState<string>("");

  const loadEvents = useCallback(async (month?: number, year?: number) => {
    const m = month ?? currentMonth;
    const y = year ?? currentYear;
    const params = new URLSearchParams();
    params.set("month", `${y}-${String(m + 1).padStart(2, "0")}`);
    if (filterType) params.set("type", filterType);
    if (filterAudience) params.set("audience", filterAudience);

    try {
      const res = await api.get<{ data: AppEvent[]; total: number }>(`/events?${params}`);
      setEvents(res.data);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [currentMonth, currentYear, filterType, filterAudience]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  function prevMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  }

  function openCreateDialog() {
    setEditingEvent(null);
    setFormData(emptyEvent());
    setNotifyOnCreate(false);
    setDialogOpen(true);
  }

  function openEditDialog(event: AppEvent) {
    setEditingEvent(event);
    setFormData({
      title: event.title,
      description: event.description ?? "",
      date: event.date,
      endDate: event.endDate ?? null,
      location: event.location ?? "",
      type: event.type,
      audience: event.audience,
    });
    setNotifyOnCreate(false);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!formData.title || !formData.date) {
      toast.error("Titre et date sont requis");
      return;
    }

    setSaving(true);
    try {
      if (editingEvent) {
        await api.patch(`/events/${editingEvent.id}`, formData);
        toast.success("Événement modifié");
      } else {
        const created = await api.post<AppEvent>("/events", formData);
        toast.success("Événement créé");

        if (notifyOnCreate) {
          setSendingNotify(true);
          try {
            const report = await api.post<NotifyReport>(`/events/${created.id}/notify`, {});
            setNotifyReport(report);
            setNotifyDialog(true);
          } catch (e) {
            toast.error(e instanceof ApiError ? e.message : "Erreur d'envoi");
          } finally {
            setSendingNotify(false);
          }
        }
      }
      setDialogOpen(false);
      loadEvents();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(eventId: string) {
    if (!confirm("Supprimer cet événement ?")) return;
    setDeleting(eventId);
    try {
      await api.delete(`/events/${eventId}`);
      toast.success("Événement supprimé");
      loadEvents();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur");
    } finally {
      setDeleting(null);
    }
  }

  async function handleNotify(eventId: string) {
    setSendingNotify(true);
    try {
      const report = await api.post<NotifyReport>(`/events/${eventId}/notify`, {});
      setNotifyReport(report);
      setNotifyDialog(true);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur d'envoi");
    } finally {
      setSendingNotify(false);
    }
  }

  function eventsForDay(dayKey: string): AppEvent[] {
    return events.filter((e) => {
      const d = new Date(e.date);
      const ek = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
      return ek === dayKey;
    });
  }

  // Calendar grid
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
  const today = new Date();
  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);

  // Grouped list view
  const groupedEvents = events
    .filter((e) => new Date(e.date) >= new Date(new Date().toDateString()))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .reduce<Record<string, AppEvent[]>>((acc, e) => {
      const d = new Date(e.date);
      const key = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
      if (!acc[key]) acc[key] = [];
      acc[key].push(e);
      return acc;
    }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" /> Chargement…
      </div>
    );
  }

  return (
    <>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Événements</h1>
          <p className="text-sm text-muted-foreground">
            Calendrier scolaire, gestion et notifications aux parents.
          </p>
        </div>
        <Button onClick={openCreateDialog} className="gap-2">
          <Plus className="size-4" /> Créer un événement
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-[180px] space-y-2">
          <Label>Type</Label>
          <Select value={filterType} onValueChange={(v) => { setFilterType(v); }}>
            <SelectTrigger>
              <SelectValue placeholder="Tous les types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Tous</SelectItem>
              {EVENT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-[180px] space-y-2">
          <Label>Public</Label>
          <Select value={filterAudience} onValueChange={(v) => { setFilterAudience(v); }}>
            <SelectTrigger>
              <SelectValue placeholder="Tous les publics" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Tous</SelectItem>
              {EVENT_AUDIENCES.map((a) => (
                <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "calendrier" | "liste")}>
        <TabsList className="rounded-xl">
          <TabsTrigger value="calendrier" className="gap-2">
            <Calendar className="size-4" /> Calendrier
          </TabsTrigger>
          <TabsTrigger value="liste">Liste</TabsTrigger>
        </TabsList>

        {/* ───────────────────────────────────────────────────────── */}
        {/* Vue Calendrier                                            */}
        {/* ───────────────────────────────────────────────────────── */}
        <TabsContent value="calendrier" className="mt-4 space-y-4">
          <Card className="rounded-2xl">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={prevMonth}>
                  <ChevronLeft className="size-4" />
                </Button>
                <CardTitle className="text-lg">
                  {MONTHS_FR[currentMonth]} {currentYear}
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={nextMonth}>
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* En-tête jours */}
              <div className="mb-2 grid grid-cols-7 gap-1">
                {DAYS_FR.map((d) => (
                  <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">
                    {d}
                  </div>
                ))}
              </div>

              {/* Grille */}
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day, i) => {
                  if (day === null) {
                    return <div key={`empty-${i}`} className="min-h-[80px] rounded-lg" />;
                  }

                  const dk = dateKey(currentYear, currentMonth, day);
                  const isToday = dk === todayKey;
                  const dayEvents = eventsForDay(dk);
                  const isSelected = selectedDay === dk;

                  return (
                    <button
                      key={dk}
                      type="button"
                      onClick={() => setSelectedDay(isSelected ? null : dk)}
                      className={`min-h-[80px] rounded-lg border p-1.5 text-left transition-colors hover:bg-muted/50 ${
                        isToday ? "border-primary bg-primary/5" : ""
                      } ${isSelected ? "ring-2 ring-primary" : ""}`}
                    >
                      <span className={`inline-flex size-6 items-center justify-center rounded-full text-sm ${
                        isToday ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground"
                      }`}>
                        {day}
                      </span>
                      <div className="mt-1 flex flex-wrap gap-0.5">
                        {dayEvents.slice(0, 3).map((ev) => (
                          <span
                            key={ev.id}
                            className={`h-1.5 w-1.5 rounded-full ${typeColors[ev.type]}`}
                            title={ev.title}
                          />
                        ))}
                        {dayEvents.length > 3 && (
                          <span className="text-[10px] text-muted-foreground">+{dayEvents.length - 3}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Événements du jour sélectionné */}
              {selectedDay && (
                <div className="mt-4 rounded-xl border p-4">
                  <h3 className="mb-2 font-medium">
                    Événements du {formatDate(selectedDay + "T00:00:00")}
                  </h3>
                  {eventsForDay(selectedDay).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucun événement ce jour.</p>
                  ) : (
                    <div className="space-y-2">
                      {eventsForDay(selectedDay).map((ev) => (
                        <EventCard
                          key={ev.id}
                          event={ev}
                          onEdit={() => openEditDialog(ev)}
                          onDelete={() => handleDelete(ev.id)}
                          onNotify={() => handleNotify(ev.id)}
                          deleting={deleting === ev.id}
                          sendingNotify={sendingNotify}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Légende */}
          <div className="flex flex-wrap gap-4 text-sm">
            {EVENT_TYPES.map((t) => (
              <div key={t.value} className="flex items-center gap-2">
                <span className={`size-3 rounded-full ${typeColors[t.value]}`} />
                <span className="text-muted-foreground">{t.label}</span>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ───────────────────────────────────────────────────────── */}
        {/* Vue Liste                                                 */}
        {/* ───────────────────────────────────────────────────────── */}
        <TabsContent value="liste" className="mt-4 space-y-4">
          {Object.keys(groupedEvents).length === 0 ? (
            <Card className="rounded-2xl">
              <CardContent className="py-12 text-center text-muted-foreground">
                <Calendar className="mx-auto mb-3 size-10 opacity-20" />
                <p>Aucun événement à venir</p>
              </CardContent>
            </Card>
          ) : (
            Object.entries(groupedEvents).map(([dateKey, evts]) => (
              <div key={dateKey} className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">
                  {formatDate(dateKey + "T00:00:00")}
                </h3>
                <div className="space-y-2">
                  {evts.map((ev) => (
                    <EventCard
                      key={ev.id}
                      event={ev}
                      onEdit={() => openEditDialog(ev)}
                      onDelete={() => handleDelete(ev.id)}
                      onNotify={() => handleNotify(ev.id)}
                      deleting={deleting === ev.id}
                      sendingNotify={sendingNotify}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* ───────────────────────────────────────────────────────── */}
      {/* Dialog Créer / Modifier                                   */}
      {/* ───────────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="size-5 text-primary" />
              {editingEvent ? "Modifier l'événement" : "Créer un événement"}
            </DialogTitle>
            <DialogDescription>
              {editingEvent
                ? "Modifiez les détails de l'événement."
                : "Ajoutez un nouvel événement au calendrier scolaire."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Titre *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Ex : Réunion parents-professeurs"
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description ?? ""}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Détails de l'événement…"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input
                  type="datetime-local"
                  value={formData.date ? new Date(formData.date).toISOString().slice(0, 16) : ""}
                  onChange={(e) => setFormData({ ...formData, date: new Date(e.target.value).toISOString() })}
                />
              </div>
              <div className="space-y-2">
                <Label>Date de fin</Label>
                <Input
                  type="datetime-local"
                  value={formData.endDate ? new Date(formData.endDate).toISOString().slice(0, 16) : ""}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value ? new Date(e.target.value).toISOString() : null })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Lieu</Label>
              <Input
                value={formData.location ?? ""}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="Ex : Salle polyvalente"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type *</Label>
                <Select
                  value={formData.type}
                  onValueChange={(v) => setFormData({ ...formData, type: v as EventType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Public cible *</Label>
                <Select
                  value={formData.audience}
                  onValueChange={(v) => setFormData({ ...formData, audience: v as EventAudience })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_AUDIENCES.map((a) => (
                      <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!editingEvent && (
              <div className="flex items-center gap-2 rounded-lg border p-3">
                <Checkbox
                  id="notifyOnCreate"
                  checked={notifyOnCreate}
                  onCheckedChange={(v) => setNotifyOnCreate(v === true)}
                />
                <Label htmlFor="notifyOnCreate" className="cursor-pointer text-sm">
                  Notifier les parents par WhatsApp
                </Label>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={saving || sendingNotify}>
              {saving && !sendingNotify ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : null}
              {sendingNotify ? "Envoi en cours…" : editingEvent ? "Modifier" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───────────────────────────────────────────────────────── */}
      {/* Dialog Rapport Notification                               */}
      {/* ───────────────────────────────────────────────────────── */}
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
/* EventCard (réutilisé dans calendrier et liste)                       */
/* ------------------------------------------------------------------ */

function EventCard({
  event,
  onEdit,
  onDelete,
  onNotify,
  deleting,
  sendingNotify,
}: {
  event: AppEvent;
  onEdit: () => void;
  onDelete: () => void;
  onNotify: () => void;
  deleting: boolean;
  sendingNotify: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/30">
      <div className={`mt-1 size-3 shrink-0 rounded-full ${typeColors[event.type]}`} />
      <div className="flex-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-medium">{event.title}</h4>
          <Badge className={typeBadgeColors[event.type]}>{typeLabels[event.type]}</Badge>
        </div>
        {event.description && (
          <p className="text-sm text-muted-foreground">{event.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>{formatDate(event.date)} à {formatTime(event.date)}</span>
          {event.endDate && (
            <span>→ {formatDate(event.endDate)} à {formatTime(event.endDate)}</span>
          )}
          {event.location && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3" /> {event.location}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="size-3" /> {audienceLabels[event.audience]}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onNotify} disabled={sendingNotify}>
          {sendingNotify ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onEdit}>
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-destructive"
          onClick={onDelete}
          disabled={deleting}
        >
          {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        </Button>
      </div>
    </div>
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
            Résultat de l&apos;envoi WhatsApp aux parents ciblés.
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
          {report.details.map((d, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-2 text-sm"
            >
              {d.success ? (
                <CheckCircle className="size-4 shrink-0 text-emerald-600" />
              ) : (
                <XCircle className="size-4 shrink-0 text-red-600" />
              )}
              <span className="flex-1 truncate">{d.parentName}</span>
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
