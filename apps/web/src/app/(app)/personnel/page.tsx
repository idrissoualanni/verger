"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Users, Search, Loader2, BarChart3, List, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { STAFF_ROLES, type StaffRole } from "@verger/shared";

/* ------------------------------------------------------------------ */
/* Constants                                                            */
/* ------------------------------------------------------------------ */

const ROLE_LABELS: Record<StaffRole, string> = {
  ENSEIGNANT: "Enseignant",
  ADMINISTRATIF: "Administratif",
  AGENT_ENTRETIEN: "Agent d'entretien",
  GARDIEN: "Gardien",
  AUTRE: "Autre",
};

const ROLE_COLORS: Record<StaffRole, string> = {
  ENSEIGNANT: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  ADMINISTRATIF: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  AGENT_ENTRETIEN: "bg-green-500/15 text-green-700 dark:text-green-400",
  GARDIEN: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  AUTRE: "bg-gray-500/15 text-gray-700 dark:text-gray-400",
};

type TabValue = "liste" | "ajouter" | "stats";

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

type StaffMember = {
  id: string;
  name: string;
  role: StaffRole;
  subject: string | null;
  phone: string | null;
  email: string | null;
  salary: string | null;
  hireDate: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string;
};

type StaffListResponse = {
  data: StaffMember[];
  total: number;
};

type StaffStats = {
  byRole: { role: StaffRole; count: number; totalSalary: number }[];
  totalSalary: number;
  totalActive: number;
};

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function formatFCFA(amount: string | number): string {
  return Intl.NumberFormat("fr-FR").format(Number(amount)) + " FCFA";
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/* ------------------------------------------------------------------ */
/* Page principale                                                      */
/* ------------------------------------------------------------------ */

export default function PersonnelPage() {
  const [activeTab, setActiveTab] = useState<TabValue>("liste");

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Personnel</h1>
        <p className="text-sm text-muted-foreground">
          Gestion des membres du personnel de l'école.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        <TabsList className="rounded-xl">
          <TabsTrigger value="liste" className="gap-2">
            <List className="size-4" /> Liste
          </TabsTrigger>
          <TabsTrigger value="ajouter" className="gap-2">
            <UserPlus className="size-4" /> Ajouter
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-2">
            <BarChart3 className="size-4" /> Statistiques
          </TabsTrigger>
        </TabsList>

        <TabsContent value="liste" className="mt-4 space-y-4">
          <ListeTab />
        </TabsContent>

        <TabsContent value="ajouter" className="mt-4 space-y-4">
          <AjouterTab onAdded={() => setActiveTab("liste")} />
        </TabsContent>

        <TabsContent value="stats" className="mt-4 space-y-4">
          <StatsTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet Liste                                                         */
/* ------------------------------------------------------------------ */

function ListeTab() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("true");

  const [editMember, setEditMember] = useState<StaffMember | null>(null);
  const [deleteMember, setDeleteMember] = useState<StaffMember | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (roleFilter) params.set("role", roleFilter);
      if (activeFilter === "true") params.set("activeOnly", "true");

      const res = await api.get<StaffListResponse>(`/staff?${params}`);
      setStaff(res.data);
      setTotal(res.total);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, activeFilter]);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <>
      {/* Filtres */}
      <Card className="rounded-2xl">
        <CardContent className="flex flex-wrap items-end gap-3 pt-4">
          <div className="flex-1 min-w-[200px] space-y-2">
            <Label htmlFor="search-staff">Rechercher</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="search-staff"
                placeholder="Nom, email…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); }}
                className="pl-9"
              />
            </div>
          </div>
          <div className="w-[180px] space-y-2">
            <Label>Rôle</Label>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Tous les rôles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Tous</SelectItem>
                {STAFF_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[160px] space-y-2">
            <Label>Statut</Label>
            <Select value={activeFilter} onValueChange={setActiveFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Actifs</SelectItem>
                <SelectItem value="false">Tous</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={reload}>
            Filtrer
          </Button>
        </CardContent>
      </Card>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 size-5 animate-spin" /> Chargement…
        </div>
      ) : staff.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Users className="size-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Aucun membre du personnel trouvé.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="rounded-2xl">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Matière</TableHead>
                  <TableHead>Téléphone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Salaire</TableHead>
                  <TableHead>Embauche</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((s) => (
                  <TableRow key={s.id} className={!s.isActive ? "opacity-60" : ""}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${ROLE_COLORS[s.role]}`}>
                        {ROLE_LABELS[s.role]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.subject ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">{s.phone ?? "—"}</TableCell>
                    <TableCell className="text-sm">{s.email ?? "—"}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {s.salary ? formatFCFA(s.salary) : "—"}
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(s.hireDate)}</TableCell>
                    <TableCell>
                      <Badge variant={s.isActive ? "default" : "secondary"} className="text-xs">
                        {s.isActive ? "Actif" : "Inactif"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <Pencil className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditMember(s)}>
                            <Pencil className="size-4" /> Modifier
                          </DropdownMenuItem>
                          {s.isActive && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteMember(s)}
                            >
                              <Trash2 className="size-4" /> Désactiver
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <div className="text-sm text-muted-foreground">
            {total} membre{total > 1 ? "s" : ""}
          </div>
        </>
      )}

      {/* Edit Dialog */}
      {editMember && (
        <EditDialog
          member={editMember}
          onClose={() => setEditMember(null)}
          onSaved={() => {
            setEditMember(null);
            reload();
          }}
        />
      )}

      {/* Delete Confirmation */}
      {deleteMember && (
        <ConfirmDialog
          name={deleteMember.name}
          onConfirm={async () => {
            await api.delete(`/staff/${deleteMember.id}`);
            toast.success("Membre désactivé");
            setDeleteMember(null);
            reload();
          }}
          onClose={() => setDeleteMember(null)}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet Ajouter                                                       */
/* ------------------------------------------------------------------ */

function AjouterTab({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<StaffRole>("ENSEIGNANT");
  const [subject, setSubject] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [salary, setSalary] = useState("");
  const [hireDate, setHireDate] = useState(new Date().toISOString().split("T")[0]);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !hireDate) {
      toast.error("Nom et date d'embauche sont requis");
      return;
    }

    setBusy(true);
    try {
      await api.post("/staff", {
        name: name.trim(),
        role,
        subject: role === "ENSEIGNANT" && subject.trim() ? subject.trim() : null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        salary: salary.trim() || null,
        hireDate,
      });
      toast.success("Membre du personnel ajouté");
      setName("");
      setRole("ENSEIGNANT");
      setSubject("");
      setPhone("");
      setEmail("");
      setSalary("");
      setHireDate(new Date().toISOString().split("T")[0]);
      onAdded();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur lors de l'ajout");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="rounded-2xl">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="max-w-xl space-y-4">
          <div className="space-y-2">
            <Label htmlFor="staff-name">Nom complet *</Label>
            <Input
              id="staff-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex : Moussa Diallo"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="staff-role">Rôle *</Label>
            <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAFF_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {role === "ENSEIGNANT" && (
            <div className="space-y-2">
              <Label htmlFor="staff-subject">Matière</Label>
              <Input
                id="staff-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="ex : Mathématiques"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="staff-phone">Téléphone</Label>
              <Input
                id="staff-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+225 07 00 00 00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-email">Email</Label>
              <Input
                id="staff-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemple.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="staff-salary">Salaire mensuel (FCFA)</Label>
              <Input
                id="staff-salary"
                type="number"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                placeholder="250000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-hire">Date d'embauche *</Label>
              <Input
                id="staff-hire"
                type="date"
                value={hireDate}
                onChange={(e) => setHireDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Ajout…" : "Ajouter le membre"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet Stats                                                         */
/* ------------------------------------------------------------------ */

function StatsTab() {
  const [stats, setStats] = useState<StaffStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<StaffStats>("/staff/stats")
      .then(setStats)
      .catch(() => toast.error("Erreur de chargement des statistiques"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" /> Chargement…
      </div>
    );
  }

  if (!stats) return null;

  const maxCount = Math.max(...stats.byRole.map((r) => r.count), 1);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="rounded-2xl">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold">{stats.totalActive}</div>
            <p className="text-sm text-muted-foreground">Membres actifs</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-emerald-600">
              {formatFCFA(stats.totalSalary)}
            </div>
            <p className="text-sm text-muted-foreground">Masse salariale mensuelle</p>
          </CardContent>
        </Card>
      </div>

      {/* Barres par rôle */}
      <Card className="rounded-2xl">
        <CardContent className="pt-6">
          <h3 className="mb-4 text-sm font-medium">Effectifs par rôle</h3>
          <div className="space-y-3">
            {STAFF_ROLES.map((r) => {
              const entry = stats.byRole.find((b) => b.role === r);
              const count = entry?.count ?? 0;
              const pct = stats.totalActive > 0 ? ((count / stats.totalActive) * 100).toFixed(0) : "0";
              const width = (count / maxCount) * 100;
              return (
                <div key={r} className="flex items-center gap-3">
                  <span className="w-36 text-sm">{ROLE_LABELS[r]}</span>
                  <div className="flex-1 h-6 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary/70 transition-all"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <span className="w-16 text-right text-sm font-medium tabular-nums">
                    {count}
                  </span>
                  <span className="w-12 text-right text-xs text-muted-foreground">
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Répartition salariale */}
      <Card className="rounded-2xl">
        <CardContent className="pt-6">
          <h3 className="mb-4 text-sm font-medium">Masse salariale par rôle</h3>
          <div className="space-y-3">
            {stats.byRole
              .filter((r) => r.totalSalary > 0)
              .sort((a, b) => b.totalSalary - a.totalSalary)
              .map((r) => {
                const pct = stats.totalSalary > 0 ? ((r.totalSalary / stats.totalSalary) * 100).toFixed(0) : "0";
                return (
                  <div key={r.role} className="flex items-center justify-between text-sm">
                    <span className="font-medium">{ROLE_LABELS[r.role]}</span>
                    <div className="flex items-center gap-4">
                      <span className="tabular-nums">{formatFCFA(r.totalSalary)}</span>
                      <span className="text-xs text-muted-foreground w-10 text-right">{pct}%</span>
                    </div>
                  </div>
                );
              })}
            {stats.byRole.filter((r) => r.totalSalary > 0).length === 0 && (
              <p className="text-sm text-muted-foreground">Aucun salaire enregistré.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Edit Dialog                                                          */
/* ------------------------------------------------------------------ */

function EditDialog({
  member,
  onClose,
  onSaved,
}: {
  member: StaffMember;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(member.name);
  const [role, setRole] = useState<StaffRole>(member.role);
  const [subject, setSubject] = useState(member.subject ?? "");
  const [phone, setPhone] = useState(member.phone ?? "");
  const [email, setEmail] = useState(member.email ?? "");
  const [salary, setSalary] = useState(member.salary ?? "");
  const [hireDate, setHireDate] = useState(member.hireDate ?? "");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch(`/staff/${member.id}`, {
        name,
        role,
        subject: subject || null,
        phone: phone || null,
        email: email || null,
        salary: salary || null,
        hireDate,
      });
      toast.success("Membre modifié");
      onSaved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifier : {member.name}</DialogTitle>
          <DialogDescription>Modifiez les informations du membre.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Nom complet</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label>Rôle</Label>
            <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAFF_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {role === "ENSEIGNANT" && (
            <div className="space-y-2">
              <Label>Matière</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Mathématiques" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Téléphone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Salaire (FCFA)</Label>
              <Input type="number" value={salary} onChange={(e) => setSalary(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Date d'embauche</Label>
              <Input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Confirm Dialog                                                       */
/* ------------------------------------------------------------------ */

function ConfirmDialog({
  name,
  onConfirm,
  onClose,
}: {
  name: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Désactiver « {name} » ?</DialogTitle>
          <DialogDescription>
            Ce membre ne sera plus visible dans la liste active.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm();
            }}
          >
            {busy ? "Traitement…" : "Désactiver"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
