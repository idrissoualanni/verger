"use client";

import { useCallback, useEffect, useState } from "react";
import { Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

type Student = {
  id: string;
  matricule: string;
  firstName: string;
  lastName: string;
  classId: string;
  isActive: boolean;
  class?: { name: string; level?: { name: string } };
};

type Subject = {
  id: string;
  name: string;
  coefficient: number;
};

type Grade = {
  id: string;
  studentId: string;
  subjectId: string;
  value: string;
  appreciation: string | null;
  trimester: number;
  createdAt: string;
};

export default function NotesPage() {
  const [levels, setLevels] = useState<Level[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [existingGrades, setExistingGrades] = useState<Grade[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedTrimester, setSelectedTrimester] = useState("1");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const allClasses = levels.flatMap((l) =>
    l.classes.map((c) => ({ ...c, levelName: l.name }))
  );

  const loadRefs = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([
        api.get<Level[]>("/levels"),
        api.get<Subject[]>("/subjects"),
      ]);
      setLevels(l);
      setSubjects(s);
    } catch {
      // silently fail
    }
  }, []);

  const loadGrades = useCallback(async () => {
    if (!selectedClass || !selectedSubject || !selectedTrimester) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        classId: selectedClass,
        subjectId: selectedSubject,
        trimester: selectedTrimester,
      });
      const grades = await api.get<Grade[]>(`/grades?${params}`);
      setExistingGrades(grades);

      const studentsRes = await api.get<{ data: Student[]; total: number }>(
        `/students?classId=${selectedClass}&limit=200`
      );
      setStudents(studentsRes.data);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [selectedClass, selectedSubject, selectedTrimester]);

  useEffect(() => {
    loadRefs();
  }, [loadRefs]);

  useEffect(() => {
    loadGrades();
  }, [loadGrades]);

  function getStudentGrade(studentId: string): string {
    const g = existingGrades.find((g) => g.studentId === studentId);
    return g ? g.value : "";
  }

  const [gradeValues, setGradeValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const s of students) {
      initial[s.id] = getStudentGrade(s.id);
    }
    setGradeValues(initial);
  }, [students, existingGrades]);

  async function handleSave() {
    setSaving(true);
    try {
      const gradesToSave = students
        .filter((s) => gradeValues[s.id] !== undefined && gradeValues[s.id] !== "")
        .map((s) => ({
          studentId: s.id,
          subjectId: selectedSubject,
          value: parseFloat(gradeValues[s.id]),
          trimester: parseInt(selectedTrimester),
        }));

      if (gradesToSave.length === 0) {
        toast.info("Aucune note à enregistrer");
        return;
      }

      await api.post("/grades", { grades: gradesToSave });
      toast.success(`${gradesToSave.length} note(s) enregistrée(s)`);
      await loadGrades();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  function handleGradeChange(studentId: string, value: string) {
    const num = value === "" ? "" : Math.min(20, Math.max(0, parseFloat(value) || 0)).toString();
    setGradeValues((prev) => ({ ...prev, [studentId]: num }));
  }

  const classAverage = (() => {
    const vals = Object.values(gradeValues).filter((v) => v !== "");
    if (vals.length === 0) return null;
    const sum = vals.reduce((s, v) => s + parseFloat(v), 0);
    return (sum / vals.length).toFixed(2);
  })();

  const subject = subjects.find((s) => s.id === selectedSubject);

  return (
    <>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notes</h1>
          <p className="text-sm text-muted-foreground">
            Saisie des notes par classe, matière et trimestre
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving || students.length === 0}>
          {saving ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Save className="mr-2 size-4" />
          )}
          Enregistrer
        </Button>
      </div>

      {/* Filtres */}
      <Card className="rounded-2xl">
        <CardContent className="flex flex-wrap items-end gap-4 pt-4">
          <div className="flex-1 min-w-[180px] space-y-2">
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

          <div className="flex-1 min-w-[180px] space-y-2">
            <Label>Matière</Label>
            <Select value={selectedSubject} onValueChange={setSelectedSubject}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir une matière" />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} (coef. {s.coefficient})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-[140px] space-y-2">
            <Label>Trimestre</Label>
            <Select value={selectedTrimester} onValueChange={setSelectedTrimester}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Trimestre 1</SelectItem>
                <SelectItem value="2">Trimestre 2</SelectItem>
                <SelectItem value="3">Trimestre 3</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tableau des notes */}
      {!selectedClass || !selectedSubject ? (
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Sélectionnez une classe et une matière pour saisir les notes.
            </p>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 size-5 animate-spin" /> Chargement…
        </div>
      ) : students.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Aucun élève dans cette classe.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">#</TableHead>
                <TableHead>Élève</TableHead>
                <TableHead>Matricule</TableHead>
                <TableHead className="w-[140px]">Note /20</TableHead>
                <TableHead className="text-right">Moy.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((s, i) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {i + 1}
                  </TableCell>
                  <TableCell className="font-medium">
                    {s.firstName} {s.lastName}
                  </TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                      {s.matricule}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      max="20"
                      step="0.25"
                      value={gradeValues[s.id] ?? ""}
                      onChange={(e) => handleGradeChange(s.id, e.target.value)}
                      className="w-24"
                      placeholder="—"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {gradeValues[s.id] && gradeValues[s.id] !== "" ? (
                      <span className="font-medium">
                        {parseFloat(gradeValues[s.id]).toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Footer avec moyenne */}
          {classAverage !== null && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <span className="text-sm text-muted-foreground">
                {subject?.name} — Coef. {subject?.coefficient}
              </span>
              <span className="text-sm font-semibold">
                Moyenne classe : {classAverage}/20
              </span>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
