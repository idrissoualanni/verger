"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  GraduationCap,
  FolderOpen,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { api, ApiError } from "@/lib/api";

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

/** Année scolaire en cours (ex : août 2026 → "2026-2027") */
function currentSchoolYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

function formatFCFA(value: string): string {
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return `${new Intl.NumberFormat("fr-FR").format(n)} FCFA`;
}

type DialogState =
  | { type: "addLevel" }
  | { type: "editLevel"; level: Level }
  | { type: "addClass"; levelId?: string }
  | { type: "editClass"; classe: Classe }
  | { type: "deleteLevel"; level: Level }
  | { type: "deleteClass"; classe: Classe }
  | null;

export default function NiveauxPage() {
  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);

  const reload = useCallback(async () => {
    try {
      setLevels(await api.get<Level[]>("/levels"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const levelCount = levels.length;
  const classCount = levels.reduce((n, l) => n + l.classes.length, 0);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Niveaux &amp; Classes</h1>
          <p className="text-sm text-muted-foreground">
            {levelCount} niveau{levelCount > 1 ? "x" : ""} · {classCount} classe{classCount > 1 ? "s" : ""} —
            la structure de votre école.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDialog({ type: "addLevel" })}>
            <Plus className="size-4" /> Niveau
          </Button>
          <Button
            onClick={() => setDialog({ type: "addClass" })}
            disabled={levels.length === 0}
            title={levels.length === 0 ? "Créez d'abord un niveau" : undefined}
          >
            <Plus className="size-4" /> Classe
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 size-5 animate-spin" /> Chargement…
        </div>
      ) : levels.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <FolderOpen className="size-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Aucun niveau pour l&apos;instant. Commencez par créer vos niveaux
              (Primaire, Collège, Lycée…), puis vos classes (CP1, 6ème…).
            </p>
            <Button onClick={() => setDialog({ type: "addLevel" })}>
              <Plus className="size-4" /> Créer un niveau
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {levels.map((level) => (
            <Card key={level.id} className="rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <div className="flex items-center gap-2">
                  <GraduationCap className="size-5 text-primary" />
                  <CardTitle className="text-base">{level.name}</CardTitle>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-8">
                      <Pencil className="size-4" />
                      <span className="sr-only">Actions niveau</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setDialog({ type: "editLevel", level })}>
                      <Pencil className="size-4" /> Modifier
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDialog({ type: "deleteLevel", level })}
                    >
                      <Trash2 className="size-4" /> Supprimer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent className="space-y-2">
                {level.description && (
                  <p className="text-xs text-muted-foreground">{level.description}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {level.classes.length === 0 && (
                    <span className="text-xs text-muted-foreground">Aucune classe</span>
                  )}
                  {level.classes.map((classe) => (
                    <div
                      key={classe.id}
                      className="group flex items-center gap-1.5 rounded-full border bg-muted/50 py-1 pl-3 pr-1 text-sm"
                    >
                      {classe.name}
                      <span className="text-xs text-muted-foreground">
                        · {formatFCFA(classe.tuitionFee)}
                      </span>
                      <button
                        onClick={() => setDialog({ type: "editClass", classe })}
                        className="rounded-full p-1 opacity-40 transition-opacity hover:bg-accent hover:opacity-100"
                        title={`Modifier ${classe.name}`}
                      >
                        <Pencil className="size-3" />
                      </button>
                      <button
                        onClick={() => setDialog({ type: "deleteClass", classe })}
                        className="rounded-full p-1 opacity-40 transition-opacity hover:bg-destructive/15 hover:text-destructive hover:opacity-100"
                        title={`Supprimer ${classe.name}`}
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-7 text-xs"
                  onClick={() => setDialog({ type: "addClass", levelId: level.id })}
                >
                  <Plus className="size-3" /> Ajouter une classe
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {dialog && (
        <DialogShell
          dialog={dialog}
          levels={levels}
          onClose={() => setDialog(null)}
          onSaved={async () => {
            setDialog(null);
            await reload();
          }}
        />
      )}
    </>
  );
}

// ------------------------------------------------------------------
// Dialogs : création / édition / suppression
// ------------------------------------------------------------------

function DialogShell({
  dialog,
  levels,
  onClose,
  onSaved,
}: {
  dialog: Exclude<DialogState, null>;
  levels: Level[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      toast.success(dialog.type.startsWith("delete") ? "Supprimé" : "Enregistré");
      await onSaved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Une erreur est survenue");
    } finally {
      setBusy(false);
    }
  }

  if (dialog.type === "addLevel") {
    return (
      <LevelFormDialog
        title="Nouveau niveau"
        description="Ex : Primaire, Collège, Lycée"
        busy={busy}
        submitLabel="Créer"
        onSubmit={(values) =>
          run(() => api.post("/levels", { ...values, order: Number(values.order) }))
        }
        onClose={onClose}
      />
    );
  }

  if (dialog.type === "editLevel") {
    return (
      <LevelFormDialog
        title={`Modifier : ${dialog.level.name}`}
        description="Renommez ou réordonnez ce niveau."
        busy={busy}
        submitLabel="Enregistrer"
        defaults={{ name: dialog.level.name, order: String(dialog.level.order), description: dialog.level.description ?? "" }}
        onSubmit={(values) =>
          run(() => api.patch(`/levels/${dialog.level.id}`, { ...values, order: Number(values.order) }))
        }
        onClose={onClose}
      />
    );
  }

  if (dialog.type === "addClass") {
    return (
      <ClassFormDialog
        title="Nouvelle classe"
        description="Ex : CP1, 6ème, Terminale"
        levels={levels}
        defaultLevelId={dialog.levelId}
        busy={busy}
        submitLabel="Créer"
        onSubmit={(values) => run(() => api.post("/classes", values))}
        onClose={onClose}
      />
    );
  }

  if (dialog.type === "editClass") {
    return (
      <ClassFormDialog
        title={`Modifier : ${dialog.classe.name}`}
        description="Mettez à jour la classe."
        levels={levels}
        busy={busy}
        submitLabel="Enregistrer"
        defaults={{
          name: dialog.classe.name,
          levelId: dialog.classe.levelId,
          tuitionFee: dialog.classe.tuitionFee,
          schoolYear: dialog.classe.schoolYear,
        }}
        onSubmit={(values) => run(() => api.patch(`/classes/${dialog.classe.id}`, values))}
        onClose={onClose}
      />
    );
  }

  if (dialog.type === "deleteLevel") {
    return (
      <ConfirmDialog
        title={`Supprimer « ${dialog.level.name} » ?`}
        description="Cette action est définitive. Les classes rattachées empêchent la suppression."
        busy={busy}
        onConfirm={() => run(() => api.delete(`/levels/${dialog.level.id}`))}
        onClose={onClose}
      />
    );
  }

  // deleteClass
  return (
    <ConfirmDialog
      title={`Supprimer « ${dialog.classe.name} » ?`}
      description="Cette action est définitive."
      busy={busy}
      onConfirm={() => run(() => api.delete(`/classes/${dialog.classe.id}`))}
      onClose={onClose}
    />
  );
}

// ------------------------------------------------------------------

function LevelFormDialog({
  title,
  description,
  defaults,
  busy,
  submitLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  description: string;
  defaults?: { name: string; order: string; description: string };
  busy: boolean;
  submitLabel: string;
  onSubmit: (v: { name: string; order: string; description: string }) => Promise<unknown>;
  onClose: () => void;
}) {
  const [name, setName] = useState(defaults?.name ?? "");
  const [order, setOrder] = useState(defaults?.order ?? "1");
  const [desc, setDesc] = useState(defaults?.description ?? "");

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ name, order, description: desc });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="lv-name">Nom</Label>
            <Input
              id="lv-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Primaire"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lv-order">Ordre d&apos;affichage</Label>
            <Input
              id="lv-order"
              type="number"
              min={0}
              value={order}
              onChange={(e) => setOrder(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lv-desc">Description (optionnel)</Label>
            <Input
              id="lv-desc"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="École élémentaire"
            />
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

function ClassFormDialog({
  title,
  description,
  levels,
  defaultLevelId,
  defaults,
  busy,
  submitLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  description: string;
  levels: Level[];
  defaultLevelId?: string;
  defaults?: { name: string; levelId: string; tuitionFee: string; schoolYear: string };
  busy: boolean;
  submitLabel: string;
  onSubmit: (v: { name: string; levelId: string; tuitionFee: string; schoolYear: string }) => Promise<unknown>;
  onClose: () => void;
}) {
  const [name, setName] = useState(defaults?.name ?? "");
  const [levelId, setLevelId] = useState(defaults?.levelId ?? defaultLevelId ?? "");
  const [tuitionFee, setTuitionFee] = useState(defaults?.tuitionFee ?? "");
  const [schoolYear, setSchoolYear] = useState(defaults?.schoolYear ?? currentSchoolYear());

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ name, levelId, tuitionFee, schoolYear });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="cl-name">Nom de la classe</Label>
            <Input
              id="cl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="CP1"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Niveau</Label>
            <Select value={levelId} onValueChange={setLevelId} required>
              <SelectTrigger className="w-full">
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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cl-fee">Frais de scolarité (FCFA/mois)</Label>
              <Input
                id="cl-fee"
                type="number"
                min={0}
                step="500"
                value={tuitionFee}
                onChange={(e) => setTuitionFee(e.target.value)}
                placeholder="25000"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cl-year">Année scolaire</Label>
              <Input
                id="cl-year"
                value={schoolYear}
                onChange={(e) => setSchoolYear(e.target.value)}
                placeholder="2026-2027"
                required
              />
            </div>
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
            onClick={() => {
              onConfirm();
            }}
          >
            {busy ? "Suppression…" : "Supprimer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
