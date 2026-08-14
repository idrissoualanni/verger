"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Plane,
  Loader2,
  Plus,
  Edit,
  Search,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

type TravelAgency = {
  id: string;
  name: string;
  contactName: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  services: string | null;
  isActive: boolean;
  createdAt: string;
};

type Student = {
  id: string;
  matricule: string;
  firstName: string;
  lastName: string;
};

type Application = {
  id: string;
  studentId: string;
  agencyId: string;
  status: "EN_ATTENTE" | "EN_COURS" | "ACCEPTE" | "REFUSE";
  notes: string | null;
  createdAt: string;
  student?: Student;
  agency?: TravelAgency;
};

type TravelStats = {
  total: number;
  enAttente: number;
  enCours: number;
  accepte: number;
  refuse: number;
  tauxAcceptation: number;
};

type TabValue = "agences" | "candidatures" | "stats";

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function statusColor(status: string): string {
  switch (status) {
    case "EN_ATTENTE":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
    case "EN_COURS":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
    case "ACCEPTE":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300";
    case "REFUSE":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "EN_ATTENTE":
      return "En attente";
    case "EN_COURS":
      return "En cours";
    case "ACCEPTE":
      return "Accepté";
    case "REFUSE":
      return "Refusé";
    default:
      return status;
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/* ------------------------------------------------------------------ */
/* Page principale                                                      */
/* ------------------------------------------------------------------ */

export default function VoyagePage() {
  const [activeTab, setActiveTab] = useState<TabValue>("agences");
  const [students, setStudents] = useState<Student[]>([]);

  useEffect(() => {
    api
      .get<{ data: Student[] }>("/students?limit=500")
      .then((res) => setStudents(res.data))
      .catch(() => {});
  }, []);

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Partenariats voyage
        </h1>
        <p className="text-sm text-muted-foreground">
          Gestion des agences partenaires et des candidatures voyage pour les bacheliers.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        <TabsList className="rounded-xl">
          <TabsTrigger value="agences" className="gap-2">
            <Plane className="size-4" /> Agences
          </TabsTrigger>
          <TabsTrigger value="candidatures">Candidatures</TabsTrigger>
          <TabsTrigger value="stats">Statistiques</TabsTrigger>
        </TabsList>

        <TabsContent value="agences" className="mt-4 space-y-4">
          <AgencesTab />
        </TabsContent>

        <TabsContent value="candidatures" className="mt-4 space-y-4">
          <CandidaturesTab students={students} />
        </TabsContent>

        <TabsContent value="stats" className="mt-4 space-y-4">
          <StatsTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet Agences                                                       */
/* ------------------------------------------------------------------ */

function AgencesTab() {
  const [agencies, setAgencies] = useState<TravelAgency[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAgency, setEditingAgency] = useState<TravelAgency | null>(null);
  const [saving, setSaving] = useState(false);

  const loadAgencies = useCallback(async () => {
    try {
      const res = await api.get<TravelAgency[]>("/travel/agencies");
      setAgencies(res);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAgencies();
  }, [loadAgencies]);

  function handleCreate() {
    setEditingAgency(null);
    setDialogOpen(true);
  }

  function handleEdit(agency: TravelAgency) {
    setEditingAgency(agency);
    setDialogOpen(true);
  }

  return (
    <>
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Agences partenaires</CardTitle>
            <CardDescription>
              Gérer les agences de voyage pour les bacheliers.
            </CardDescription>
          </div>
          <Button onClick={handleCreate} size="sm">
            <Plus className="mr-2 size-4" /> Ajouter
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" /> Chargement…
            </div>
          ) : agencies.length === 0 ? (
            <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
              Aucune agence partenaire.
            </div>
          ) : (
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Téléphone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Services</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agencies.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {a.contactName ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">{a.phone}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {a.email ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[200px] text-sm text-muted-foreground truncate">
                        {a.services ?? "—"}
                      </TableCell>
                      <TableCell>
                        {a.isActive ? (
                          <Badge variant="default" className="text-xs">Actif</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Inactif</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleEdit(a)}
                        >
                          <Edit className="mr-1 size-3" /> Modifier
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AgencyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        agency={editingAgency}
        onSuccess={() => {
          setDialogOpen(false);
          setEditingAgency(null);
          loadAgencies();
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Dialog Agence (créer / modifier)                                     */
/* ------------------------------------------------------------------ */

function AgencyDialog({
  open,
  onOpenChange,
  agency,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  agency: TravelAgency | null;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(agency?.name ?? "");
  const [contactName, setContactName] = useState(agency?.contactName ?? "");
  const [phone, setPhone] = useState(agency?.phone ?? "");
  const [email, setEmail] = useState(agency?.email ?? "");
  const [address, setAddress] = useState(agency?.address ?? "");
  const [services, setServices] = useState(agency?.services ?? "");
  const [isActive, setIsActive] = useState(agency?.isActive ?? true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(agency?.name ?? "");
      setContactName(agency?.contactName ?? "");
      setPhone(agency?.phone ?? "");
      setEmail(agency?.email ?? "");
      setAddress(agency?.address ?? "");
      setServices(agency?.services ?? "");
      setIsActive(agency?.isActive ?? true);
    }
  }, [open, agency]);

  async function handleSubmit() {
    if (!name || !phone) {
      toast.error("Nom et téléphone sont requis");
      return;
    }

    setSaving(true);
    try {
      if (agency) {
        await api.patch(`/travel/agencies/${agency.id}`, {
          name,
          contactName: contactName || null,
          phone,
          email: email || null,
          address: address || null,
          services: services || null,
          isActive,
        });
        toast.success("Agence modifiée");
      } else {
        await api.post("/travel/agencies", {
          name,
          contactName: contactName || null,
          phone,
          email: email || null,
          address: address || null,
          services: services || null,
          isActive,
        });
        toast.success("Agence créée");
      }
      onSuccess();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {agency ? "Modifier l'agence" : "Nouvelle agence"}
          </DialogTitle>
          <DialogDescription>
            {agency
              ? "Modifier les informations de l'agence partenaire."
              : "Ajouter une nouvelle agence de voyage partenaire."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nom de l'agence *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex : Africa Travel"
            />
          </div>
          <div className="space-y-2">
            <Label>Nom du contact</Label>
            <Input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="ex : Jean Dupont"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Téléphone *</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+229 ..."
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@agence.com"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Adresse</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Adresse physique"
            />
          </div>
          <div className="space-y-2">
            <Label>Services</Label>
            <Textarea
              value={services}
              onChange={(e) => setServices(e.target.value)}
              placeholder="Visa, billet d'avion, hébergement..."
              rows={2}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="agency-active"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="agency-active">Agence active</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {agency ? "Enregistrer" : "Créer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet Candidatures                                                  */
/* ------------------------------------------------------------------ */

function CandidaturesTab({ students }: { students: Student[] }) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [agencies, setAgencies] = useState<TravelAgency[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [agencyFilter, setAgencyFilter] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [appsRes, agenciesRes] = await Promise.all([
        api.get<{ data: Application[]; total: number }>("/travel/applications"),
        api.get<TravelAgency[]>("/travel/agencies"),
      ]);
      setApplications(appsRes.data);
      setAgencies(agenciesRes);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const filtered = applications.filter((a) => {
    if (statusFilter && a.status !== statusFilter) return false;
    if (agencyFilter && a.agencyId !== agencyFilter) return false;
    return true;
  });

  async function handleStatusChange(newStatus: string) {
    if (!selectedApp) return;
    try {
      await api.patch(`/travel/applications/${selectedApp.id}`, {
        status: newStatus,
      });
      toast.success("Statut mis à jour");
      setStatusDialogOpen(false);
      setSelectedApp(null);
      loadAll();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur");
    }
  }

  return (
    <>
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Candidatures voyage</CardTitle>
            <CardDescription>
              Suivi des candidatures des élèves auprès des agences partenaires.
            </CardDescription>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)} size="sm">
            <Plus className="mr-2 size-4" /> Nouvelle candidature
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtres */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-[180px] space-y-2">
              <Label>Statut</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Tous" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Tous</SelectItem>
                  <SelectItem value="EN_ATTENTE">En attente</SelectItem>
                  <SelectItem value="EN_COURS">En cours</SelectItem>
                  <SelectItem value="ACCEPTE">Accepté</SelectItem>
                  <SelectItem value="REFUSE">Refusé</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-[200px] space-y-2">
              <Label>Agence</Label>
              <Select value={agencyFilter} onValueChange={setAgencyFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Toutes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Toutes</SelectItem>
                  {agencies.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="ghost" size="sm" onClick={loadAll}>
              <Search className="mr-2 size-4" /> Actualiser
            </Button>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" /> Chargement…
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
              Aucune candidature trouvée.
            </div>
          ) : (
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Élève</TableHead>
                    <TableHead>Agence</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">
                        {a.student
                          ? `${a.student.firstName} ${a.student.lastName}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {a.agency?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${statusColor(a.status)}`}>
                          {statusLabel(a.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(a.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => {
                              setSelectedApp(a);
                              setStatusDialogOpen(true);
                            }}
                          >
                            Changer statut
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

      <CreateApplicationDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        students={students}
        agencies={agencies}
        onSuccess={loadAll}
      />

      <StatusDialog
        open={statusDialogOpen}
        onOpenChange={(o) => {
          if (!o) {
            setStatusDialogOpen(false);
            setSelectedApp(null);
          }
        }}
        application={selectedApp}
        onStatusChange={handleStatusChange}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Dialog Créer candidature                                             */
/* ------------------------------------------------------------------ */

function CreateApplicationDialog({
  open,
  onOpenChange,
  students,
  agencies,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  students: Student[];
  agencies: TravelAgency[];
  onSuccess: () => void;
}) {
  const [studentId, setStudentId] = useState("");
  const [agencyId, setAgencyId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!studentId || !agencyId) {
      toast.error("Élève et agence sont requis");
      return;
    }

    setSaving(true);
    try {
      await api.post("/travel/applications", {
        studentId,
        agencyId,
        notes: notes || null,
      });
      toast.success("Candidature créée");
      onSuccess();
      onOpenChange(false);
      setStudentId("");
      setAgencyId("");
      setNotes("");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  const activeAgencies = agencies.filter((a) => a.isActive);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nouvelle candidature</DialogTitle>
          <DialogDescription>
            Associer un élève à une agence partenaire.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Élève *</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir un élève" />
              </SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.firstName} {s.lastName} ({s.matricule})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Agence *</Label>
            <Select value={agencyId} onValueChange={setAgencyId}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir une agence" />
              </SelectTrigger>
              <SelectContent>
                {activeAgencies.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Remarques éventuelles..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Dialog Changer statut                                                */
/* ------------------------------------------------------------------ */

function StatusDialog({
  open,
  onOpenChange,
  application,
  onStatusChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  application: Application | null;
  onStatusChange: (status: string) => void;
}) {
  if (!application) return null;

  const transitions: Record<string, string[]> = {
    EN_ATTENTE: ["EN_COURS"],
    EN_COURS: ["ACCEPTE", "REFUSE"],
    ACCEPTE: [],
    REFUSE: [],
  };

  const available = transitions[application.status] ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Changer le statut</DialogTitle>
          <DialogDescription>
            {application.student
              ? `${application.student.firstName} ${application.student.lastName}`
              : "Élève"}{" "}
            — Statut actuel :{" "}
            <Badge className={`text-xs ${statusColor(application.status)}`}>
              {statusLabel(application.status)}
            </Badge>
          </DialogDescription>
        </DialogHeader>

        {available.length === 0 ? (
          <div className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
            Aucun changement de statut disponible.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {available.map((s) => (
              <Button
                key={s}
                variant={s === "ACCEPTE" ? "default" : s === "REFUSE" ? "destructive" : "outline"}
                onClick={() => onStatusChange(s)}
              >
                {statusLabel(s)}
              </Button>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet Statistiques                                                  */
/* ------------------------------------------------------------------ */

function StatsTab() {
  const [stats, setStats] = useState<TravelStats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    try {
      const res = await api.get<TravelStats>("/travel/stats");
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

  const bars = stats
    ? [
        { label: "En attente", value: stats.enAttente, color: "bg-yellow-500" },
        { label: "En cours", value: stats.enCours, color: "bg-blue-500" },
        { label: "Accepté", value: stats.accepte, color: "bg-emerald-500" },
        { label: "Refusé", value: stats.refuse, color: "bg-red-500" },
      ]
    : [];

  const maxBar = Math.max(...bars.map((b) => b.value), 1);

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Statistiques des candidatures</CardTitle>
        <CardDescription>
          Vue d&apos;ensemble des candidatures voyage.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[
                { label: "Total", value: stats.total, color: "text-primary" },
                { label: "En attente", value: stats.enAttente, color: "text-yellow-600" },
                { label: "En cours", value: stats.enCours, color: "text-blue-600" },
                { label: "Accepté", value: stats.accepte, color: "text-emerald-600" },
                { label: "Refusé", value: stats.refuse, color: "text-red-600" },
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

            {/* Taux d'acceptation */}
            <div className="rounded-xl border bg-card p-6 text-center">
              <div className="text-sm text-muted-foreground">Taux d&apos;acceptation</div>
              <div
                className={`text-5xl font-bold ${
                  stats.tauxAcceptation >= 50
                    ? "text-emerald-600"
                    : stats.tauxAcceptation > 0
                      ? "text-yellow-600"
                      : "text-muted-foreground"
                }`}
              >
                {stats.tauxAcceptation}%
              </div>
            </div>

            {/* Barres CSS */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Répartition par statut</h3>
              {bars.map((bar) => (
                <div key={bar.label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{bar.label}</span>
                    <span className="text-muted-foreground">
                      {bar.value}{" "}
                      {stats.total > 0
                        ? `(${Math.round((bar.value / stats.total) * 100)}%)`
                        : ""}
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${bar.color} transition-all duration-500`}
                      style={{
                        width: `${stats.total > 0 ? (bar.value / stats.total) * 100 : 0}%`,
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
