"use client";

import { useCallback, useEffect, useState } from "react";
import { Printer, Loader2, Award } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api";

type Student = {
  id: string;
  matricule: string;
  firstName: string;
  lastName: string;
  classId: string;
  class?: { name: string; level?: { name: string } };
};

type BulletinSubject = {
  subjectId: string;
  subjectName: string;
  coefficient: number;
  average: number;
  classAverage: number;
  appreciation: string;
};

type BulletinResponse = {
  student: {
    id: string;
    matricule: string;
    firstName: string;
    lastName: string;
    className: string;
    levelName: string;
    parentName: string;
  };
  trimester: number;
  schoolYear: string;
  subjects: BulletinSubject[];
  generalAverage: number;
  classAverage: number;
  rank: number;
  totalStudents: number;
};

export default function BulletinsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [selectedTrimester, setSelectedTrimester] = useState("1");
  const [bulletin, setBulletin] = useState<BulletinResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const loadStudents = useCallback(async () => {
    try {
      const res = await api.get<{ data: Student[]; total: number }>(
        "/students?limit=500"
      );
      setStudents(res.data);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const loadBulletin = useCallback(async () => {
    if (!selectedStudent || !selectedTrimester) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        studentId: selectedStudent,
        trimester: selectedTrimester,
      });
      const data = await api.get<BulletinResponse>(`/grades/bulletin?${params}`);
      setBulletin(data);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur de chargement");
      setBulletin(null);
    } finally {
      setLoading(false);
    }
  }, [selectedStudent, selectedTrimester]);

  useEffect(() => {
    loadBulletin();
  }, [loadBulletin]);

  function handlePrint() {
    window.print();
  }

  function getAppreciationColor(average: number): string {
    if (average >= 16) return "bg-emerald-100 text-emerald-800";
    if (average >= 14) return "bg-blue-100 text-blue-800";
    if (average >= 12) return "bg-sky-100 text-sky-800";
    if (average >= 10) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  }

  return (
    <>
      <div className="flex items-start justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bulletins</h1>
          <p className="text-sm text-muted-foreground">
            Consultation et impression des bulletins trimestriels
          </p>
        </div>
        <Button onClick={handlePrint} disabled={!bulletin}>
          <Printer className="mr-2 size-4" />
          Imprimer
        </Button>
      </div>

      {/* Filtres */}
      <Card className="rounded-2xl print:hidden">
        <CardContent className="flex flex-wrap items-end gap-4 pt-4">
          <div className="flex-1 min-w-[220px] space-y-2">
            <Label>Élève</Label>
            <Select value={selectedStudent} onValueChange={setSelectedStudent}>
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
          </div>

          <div className="w-[160px] space-y-2">
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

      {/* Bulletin */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 size-5 animate-spin" /> Chargement…
        </div>
      ) : !bulletin ? (
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Award className="size-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Sélectionnez un élève et un trimestre pour voir le bulletin.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl" id="bulletin-print">
          <CardContent className="p-6">
            {/* En-tête */}
            <div className="mb-6 flex items-start justify-between border-b pb-4">
              <div>
                <h2 className="text-xl font-bold">
                  Bulletin Trimestriel — T{bulletin.trimester}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Année scolaire {bulletin.schoolYear}
                </p>
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold">
                  {bulletin.student.firstName} {bulletin.student.lastName}
                </p>
                <p className="text-muted-foreground">
                  {bulletin.student.className} — {bulletin.student.levelName}
                </p>
                <p className="text-muted-foreground text-xs">
                  Matricule : {bulletin.student.matricule}
                </p>
              </div>
            </div>

            {/* Tableau des matières */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Matière</TableHead>
                  <TableHead className="text-center">Coef.</TableHead>
                  <TableHead className="text-center">Moyenne</TableHead>
                  <TableHead className="text-center">Moy. Classe</TableHead>
                  <TableHead>Appréciation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bulletin.subjects.map((s) => (
                  <TableRow key={s.subjectId}>
                    <TableCell className="font-medium">{s.subjectName}</TableCell>
                    <TableCell className="text-center">{s.coefficient}</TableCell>
                    <TableCell className="text-center">
                      <Badge className={getAppreciationColor(s.average)}>
                        {s.average.toFixed(2)}/20
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {s.classAverage.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getAppreciationColor(s.average)}>
                        {s.appreciation}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Résumé */}
            <div className="mt-6 grid grid-cols-3 gap-4 rounded-xl border bg-muted/30 p-4">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Moyenne générale</p>
                <p className="text-2xl font-bold text-primary">
                  {bulletin.generalAverage.toFixed(2)}/20
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Moyenne de la classe</p>
                <p className="text-2xl font-semibold">
                  {bulletin.classAverage.toFixed(2)}/20
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Rang</p>
                <p className="text-2xl font-bold text-primary">
                  {bulletin.rank}<sup>ème</sup> / {bulletin.totalStudents}
                </p>
              </div>
            </div>

            {/* Appréciation générale */}
            <div className="mt-4 text-sm">
              <p className="text-muted-foreground">
                <span className="font-medium">Appréciation générale :</span>{" "}
                {bulletin.generalAverage >= 16
                  ? "Très bon travail, continuez ainsi !"
                  : bulletin.generalAverage >= 14
                    ? "Bon travail, des progrès sont encore possibles."
                    : bulletin.generalAverage >= 12
                      ? "Résultats satisfaisants, peut mieux faire."
                      : bulletin.generalAverage >= 10
                        ? "Résultats passables, un effort supplémentaire est nécessaire."
                        : "Résultats insuffisants, un travail sérieux est attendu."}
              </p>
            </div>

            {/* Signature */}
            <div className="mt-8 flex justify-between text-xs text-muted-foreground">
              <p>Le Directeur</p>
              <p>Le Parent / Tuteur</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* CSS print */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #bulletin-print,
          #bulletin-print * {
            visibility: visible;
          }
          #bulletin-print {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
}
