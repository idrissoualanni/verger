"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  Users,
  Search,
  Loader2,
  QrCode,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

type StudentListResponse = {
  data: Student[];
  total: number;
  limit: number;
  offset: number;
};

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function currentSchoolYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function ageFromBirth(dateStr: string): number {
  const today = new Date();
  const birth = new Date(dateStr);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

/* ------------------------------------------------------------------ */
/* Page principale                                                      */
/* ------------------------------------------------------------------ */

export default function ElevesPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [dialog, setDialog] = useState<DialogState>(null);

  // Filtres
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 15;

  const allClasses = levels.flatMap((l) =>
    l.classes.map((c) => ({ ...c, levelName: l.name }))
  );

  const reload = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
      });
      if (search) params.set("search", search);
      if (classFilter) params.set("classId", classFilter);

      const res = await api.get<StudentListResponse>(`/students?${params}`);
      setStudents(res.data);
      setTotal(res.total);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [page, search, classFilter]);

  const loadRefs = useCallback(async () => {
    try {
      const [l, p] = await Promise.all([
        api.get<Level[]>("/levels"),
        api.get<Parent[]>("/parents"),
      ]);
      setLevels(l);
      setParents(p);
    } catch {
      // silently fail — les selects seront vides
    }
  }, []);

  useEffect(() => {
    reload();
    loadRefs();
  }, [reload, loadRefs]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Élèves</h1>
          <p className="text-sm text-muted-foreground">
            {total} élève{total > 1 ? "s" : ""} — année {currentSchoolYear()}
          </p>
        </div>
        <Button onClick={() => setDialog({ type: "add" })}>
          <Plus className="size-4" /> Ajouter un élève
        </Button>
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error} — le serveur API est-il démarré ?
        </p>
      )}

      {/* Filtres */}
      <Card className="rounded-2xl">
        <CardContent className="flex flex-wrap items-end gap-3 pt-4">
          <div className="flex-1 min-w-[200px] space-y-2">
            <Label htmlFor="search">Rechercher</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Nom, prénom, matricule…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                className="pl-9"
              />
            </div>
          </div>
          <div className="w-[200px] space-y-2">
            <Label>Classe</Label>
            <Select value={classFilter} onValueChange={(v) => { setClassFilter(v); setPage(0); }}>
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
        </CardContent>
      </Card>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 size-5 animate-spin" /> Chargement…
        </div>
      ) : students.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Users className="size-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Aucun élève trouvé. Inscrivez votre premier élève.
            </p>
            <Button onClick={() => setDialog({ type: "add" })}>
              <Plus className="size-4" /> Ajouter un élève
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="rounded-2xl">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Matricule</TableHead>
                  <TableHead>Nom complet</TableHead>
                  <TableHead>Classe</TableHead>
                  <TableHead>Genre</TableHead>
                  <TableHead>Parent</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((s) => (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setDialog({ type: "detail", student: s })}
                  >
                    <TableCell>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                        {s.matricule}
                      </code>
                    </TableCell>
                    <TableCell className="font-medium">
                      {s.firstName} {s.lastName}
                    </TableCell>
                    <TableCell>
                      {s.class ? (
                        <>
                          {s.class.name}
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({s.class.level?.name})
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.gender === "M" ? "default" : "secondary"} className="text-xs">
                        {s.gender === "M" ? "Masculin" : "Féminin"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.parent?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <Pencil className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setDialog({ type: "detail", student: s })}>
                            <Eye className="size-4" /> Voir la fiche
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDialog({ type: "edit", student: s })}>
                            <Pencil className="size-4" /> Modifier
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDialog({ type: "delete", student: s })}
                          >
                            <Trash2 className="size-4" /> Désactiver
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} sur {total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Précédent
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={(page + 1) * pageSize >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Suivant
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Dialogs */}
      {dialog && (
        <DialogShell
          dialog={dialog}
          levels={levels}
          allClasses={allClasses}
          parents={parents}
          onClose={() => setDialog(null)}
          onSaved={async () => {
            setDialog(null);
            await reload();
            await loadRefs();
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Dialog Shell                                                         */
/* ------------------------------------------------------------------ */

type DialogState =
  | { type: "add" }
  | { type: "edit"; student: Student }
  | { type: "detail"; student: Student }
  | { type: "delete"; student: Student }
  | null;

function DialogShell({
  dialog,
  levels,
  allClasses,
  parents,
  onClose,
  onSaved,
}: {
  dialog: Exclude<DialogState, null>;
  levels: Level[];
  allClasses: (Classe & { levelName: string })[];
  parents: Parent[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      toast.success(dialog.type === "delete" ? "Élève désactivé" : "Enregistré");
      await onSaved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Une erreur est survenue");
    } finally {
      setBusy(false);
    }
  }

  if (dialog.type === "add") {
    return (
      <StudentFormDialog
        title="Nouvel élève"
        description="Inscrivez un élève pour l'année en cours."
        levels={levels}
        allClasses={allClasses}
        parents={parents}
        busy={busy}
        submitLabel="Inscrire"
        onSubmit={(values) => run(() => api.post("/students", values))}
        onClose={onClose}
      />
    );
  }

  if (dialog.type === "edit") {
    return (
      <StudentFormDialog
        title={`Modifier : ${dialog.student.firstName} ${dialog.student.lastName}`}
        description="Modifiez les informations de l'élève."
        levels={levels}
        allClasses={allClasses}
        parents={parents}
        busy={busy}
        submitLabel="Enregistrer"
        defaults={{
          firstName: dialog.student.firstName,
          lastName: dialog.student.lastName,
          dateOfBirth: dialog.student.dateOfBirth,
          gender: dialog.student.gender,
          classId: dialog.student.classId,
          parentId: dialog.student.parentId,
          schoolYear: dialog.student.schoolYear,
        }}
        onSubmit={(values) => run(() => api.patch(`/students/${dialog.student.id}`, values))}
        onClose={onClose}
      />
    );
  }

  if (dialog.type === "detail") {
    return (
      <StudentDetailDialog
        student={dialog.student}
        onClose={onClose}
        onEdit={() => {
          onClose();
          // onSaved will reload, but we need the dialog to re-open as edit
          // Instead, just close and let user re-open from table
        }}
      />
    );
  }

  // delete
  return (
    <ConfirmDialog
      title={`Désactiver « ${dialog.student.firstName} ${dialog.student.lastName} » ?`}
      description="L'élève ne sera plus visible dans la liste. Cette action peut être annulée."
      busy={busy}
      onConfirm={() => run(() => api.delete(`/students/${dialog.student.id}`))}
      onClose={onClose}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Student Form Dialog                                                  */
/* ------------------------------------------------------------------ */

function StudentFormDialog({
  title,
  description,
  levels,
  allClasses,
  parents,
  defaults,
  busy,
  submitLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  description: string;
  levels: Level[];
  allClasses: (Classe & { levelName: string })[];
  parents: Parent[];
  defaults?: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    gender: "M" | "F";
    classId: string;
    parentId: string;
    schoolYear: string;
  };
  busy: boolean;
  submitLabel: string;
  onSubmit: (v: Record<string, string>) => Promise<unknown>;
  onClose: () => void;
}) {
  const [firstName, setFirstName] = useState(defaults?.firstName ?? "");
  const [lastName, setLastName] = useState(defaults?.lastName ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(defaults?.dateOfBirth ?? "");
  const [gender, setGender] = useState<"M" | "F">(defaults?.gender ?? "M");
  const [selectedLevel, setSelectedLevel] = useState(
    defaults?.classId
      ? (allClasses.find((c) => c.id === defaults.classId)?.levelId ?? "")
      : ""
  );
  const [classId, setClassId] = useState(defaults?.classId ?? "");
  const [parentId, setParentId] = useState(defaults?.parentId ?? "");
  const [schoolYear] = useState(defaults?.schoolYear ?? currentSchoolYear());

  // Parent creation
  const [creatingParent, setCreatingParent] = useState(false);
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");

  const filteredClasses = allClasses.filter(
    (c) => c.levelId === selectedLevel
  );

  async function handleCreateParent() {
    if (!parentName || !parentPhone) return;
    try {
      const newParent = await api.post<Parent>("/parents", {
        name: parentName,
        phone: parentPhone,
      });
      setParentId(newParent.id);
      setCreatingParent(false);
      toast.success("Parent créé");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ firstName, lastName, dateOfBirth, gender, classId, parentId, schoolYear });
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">Prénom</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Moussa"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Nom</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Diallo"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dob">Date de naissance</Label>
              <Input
                id="dob"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Genre</Label>
              <Select value={gender} onValueChange={(v) => setGender(v as "M" | "F")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">Masculin</SelectItem>
                  <SelectItem value="F">Féminin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Niveau</Label>
            <Select value={selectedLevel} onValueChange={(v) => { setSelectedLevel(v); setClassId(""); }}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir un niveau" />
              </SelectTrigger>
              <SelectContent>
                {levels.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Classe</Label>
            <Select value={classId} onValueChange={setClassId} disabled={!selectedLevel}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir une classe" />
              </SelectTrigger>
              <SelectContent>
                {filteredClasses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Parent / Tuteur</Label>
            {creatingParent ? (
              <div className="space-y-2 rounded-lg border p-3">
                <Input
                  placeholder="Nom du parent"
                  value={parentName}
                  onChange={(e) => setParentName(e.target.value)}
                />
                <Input
                  placeholder="Téléphone"
                  value={parentPhone}
                  onChange={(e) => setParentPhone(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setCreatingParent(false)}
                  >
                    Annuler
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleCreateParent}
                    disabled={!parentName || !parentPhone}
                  >
                    Créer
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Select value={parentId} onValueChange={setParentId}>
                  <SelectTrigger className="flex-1">
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCreatingParent(true)}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            )}
          </div>

          <div className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            Année scolaire : <span className="font-medium text-foreground">{schoolYear}</span>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Enregistrement…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Student Detail Dialog                                                */
/* ------------------------------------------------------------------ */

function StudentDetailDialog({
  student,
  onClose,
  onEdit,
}: {
  student: Student;
  onClose: () => void;
  onEdit: () => void;
}) {
  const className = student.class?.name ?? "—";
  const levelName = student.class?.level?.name ?? "";
  const parentName = student.parent?.name ?? "—";
  const parentPhone = student.parent?.phone ?? "—";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="size-5 text-primary" />
            Fiche élève
          </DialogTitle>
          <DialogDescription>
            {student.matricule}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* QR Code */}
          <div className="flex justify-center">
            <div className="rounded-xl border bg-white p-3">
              <img
                src={student.qrCodeUrl}
                alt={`QR Code ${student.matricule}`}
                className="size-40"
                loading="lazy"
              />
            </div>
          </div>

          {/* Infos */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">Prénom</span>
              <p className="font-medium">{student.firstName}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Nom</span>
              <p className="font-medium">{student.lastName}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Date de naissance</span>
              <p className="font-medium">{formatDate(student.dateOfBirth)}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Âge</span>
              <p className="font-medium">{ageFromBirth(student.dateOfBirth)} ans</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Genre</span>
              <p className="font-medium">{student.gender === "M" ? "Masculin" : "Féminin"}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Classe</span>
              <p className="font-medium">{className} {levelName ? `(${levelName})` : ""}</p>
            </div>
          </div>

          <div className="rounded-lg border p-3 space-y-1 text-sm">
            <span className="text-xs text-muted-foreground">Parent / Tuteur</span>
            <p className="font-medium">{parentName}</p>
            <p className="text-muted-foreground">{parentPhone}</p>
            {student.parent?.email && (
              <p className="text-muted-foreground">{student.parent.email}</p>
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Année : {student.schoolYear}</span>
            <Badge variant={student.isActive ? "default" : "secondary"}>
              {student.isActive ? "Actif" : "Inactif"}
            </Badge>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
          <Button onClick={onEdit}>
            <Pencil className="size-4" /> Modifier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Confirm Dialog                                                       */
/* ------------------------------------------------------------------ */

function ConfirmDialog({
  title,
  description,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  busy: boolean;
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => onConfirm()}
          >
            {busy ? "Traitement…" : "Désactiver"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
