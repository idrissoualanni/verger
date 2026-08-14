"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  QrCode,
  Camera,
  Keyboard,
  Loader2,
  UserCircle2,
  Phone,
  Calendar,
  GraduationCap,
  Hash,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

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

const hasBarcodeDetector = typeof window !== "undefined" && "BarcodeDetector" in window;

/* ------------------------------------------------------------------ */
/* Page Scan QR                                                         */
/* ------------------------------------------------------------------ */

export default function ScanPage() {
  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (student) {
    return <StudentCard student={student} onReset={() => setStudent(null)} />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Scan QR Élève</h1>
        <p className="text-sm text-muted-foreground">
          Scannez le QR code d'un élève ou tapez son matricule pour afficher sa fiche.
        </p>
      </div>

      {/* Mode switch */}
      <Card className="rounded-2xl">
        <CardContent className="flex gap-2 p-2">
          <Button
            variant={mode === "camera" ? "default" : "outline"}
            className="flex-1"
            onClick={() => setMode("camera")}
          >
            <Camera className="mr-2 size-4" />
            Caméra
          </Button>
          <Button
            variant={mode === "manual" ? "default" : "outline"}
            className="flex-1"
            onClick={() => setMode("manual")}
          >
            <Keyboard className="mr-2 size-4" />
            Saisie manuelle
          </Button>
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {mode === "camera" ? (
        <CameraScanner onFound={(s) => setStudent(s)} onError={(e) => setError(e)} />
      ) : (
        <ManualSearch onFound={(s) => setStudent(s)} onError={(e) => setError(e)} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Camera Scanner (BarcodeDetector API)                                 */
/* ------------------------------------------------------------------ */

function CameraScanner({
  onFound,
  onError,
}: {
  onFound: (s: Student) => void;
  onError: (e: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setScanning(true);
      }
    } catch {
      setCameraError(
        "Impossible d'accéder à la caméra. Vérifiez les permissions ou utilisez la saisie manuelle."
      );
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }, []);

  useEffect(() => {
    if (!hasBarcodeDetector) {
      setCameraError(
        "Votre navigateur ne supporte pas la détection de QR code. Utilisez Chrome/Edge ou la saisie manuelle."
      );
      return;
    }

    startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  useEffect(() => {
    if (!scanning || !videoRef.current || !hasBarcodeDetector) return;

    const detector = new (window as any).BarcodeDetector({
      formats: ["qr_code"],
    });

    const scan = async () => {
      if (!videoRef.current || videoRef.current.readyState < 2 || processing) return;

      try {
        const barcodes = await detector.detect(videoRef.current);
        if (barcodes.length > 0) {
          const value = barcodes[0].rawValue.trim();
          setProcessing(true);
          stopCamera();
          await lookupMatricule(value, onFound, onError);
        }
      } catch {
        // ignore detection errors — keep scanning
      }
    };

    intervalRef.current = setInterval(scan, 250);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [scanning, processing, onFound, onError, stopCamera]);

  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-4 p-4">
        {cameraError ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <AlertCircle className="size-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">{cameraError}</p>
            <Button variant="outline" onClick={startCamera}>
              <Camera className="mr-2 size-4" /> Réessayer
            </Button>
          </div>
        ) : (
          <>
            <div className="relative overflow-hidden rounded-xl bg-black">
              <video
                ref={videoRef}
                className="aspect-video w-full object-cover"
                playsInline
                muted
              />
              {/* Viewfinder overlay */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="size-48 rounded-2xl border-2 border-white/60 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>
              {scanning && !processing && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                  <Camera className="mr-1 inline size-3" /> Scan en cours…
                </div>
              )}
              {processing && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <div className="flex flex-col items-center gap-2 text-white">
                    <Loader2 className="size-6 animate-spin" />
                    <span className="text-sm">Recherche de l'élève…</span>
                  </div>
                </div>
              )}
            </div>

            {!scanning && !cameraError && !processing && (
              <Button className="w-full" onClick={startCamera}>
                <Camera className="mr-2 size-4" /> Démarrer la caméra
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Manual Search                                                        */
/* ------------------------------------------------------------------ */

function ManualSearch({
  onFound,
  onError,
}: {
  onFound: (s: Student) => void;
  onError: (e: string) => void;
}) {
  const [matricule, setMatricule] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!matricule.trim()) return;
    setBusy(true);
    await lookupMatricule(matricule.trim(), onFound, onError);
    setBusy(false);
  }

  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-4 p-4">
        <form onSubmit={handleSearch} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="matricule">Matricule de l'élève</Label>
            <div className="flex gap-2">
              <Input
                id="matricule"
                placeholder="ELE-2026-001"
                value={matricule}
                onChange={(e) => setMatricule(e.target.value.toUpperCase())}
                className="font-mono"
                autoFocus
              />
              <Button type="submit" disabled={busy || !matricule.trim()}>
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    <QrCode className="mr-2 size-4" /> Chercher
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>

        <div className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          <Hash className="mr-1 inline size-3" />
          Format attendu : <code className="rounded bg-background px-1 py-0.5 font-mono">ELE-2026-001</code>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Shared lookup                                                        */
/* ------------------------------------------------------------------ */

async function lookupMatricule(
  matricule: string,
  onFound: (s: Student) => void,
  onError: (e: string) => void
) {
  try {
    const res = await api.get<{ data: Student[]; total: number }>(
      `/students?search=${encodeURIComponent(matricule)}&limit=1`
    );
    if (res.total === 0 || res.data.length === 0) {
      onError(`Aucun élève trouvé pour le matricule « ${matricule} »`);
      return;
    }
    onFound(res.data[0]);
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : "Erreur de connexion au serveur";
    onError(msg);
  }
}

/* ------------------------------------------------------------------ */
/* Student Card                                                         */
/* ------------------------------------------------------------------ */

function StudentCard({
  student,
  onReset,
}: {
  student: Student;
  onReset: () => void;
}) {
  const className = student.class?.name ?? "—";
  const levelName = student.class?.level?.name ?? "";
  const parentName = student.parent?.name ?? "—";
  const parentPhone = student.parent?.phone ?? "—";
  const parentEmail = student.parent?.email;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle2 className="size-5" />
          <span className="font-medium">Élève trouvé</span>
        </div>
        <Button variant="outline" size="sm" onClick={onReset}>
          <RotateCcw className="mr-2 size-4" /> Nouveau scan
        </Button>
      </div>

      <Card className="rounded-2xl">
        <CardContent className="space-y-5 p-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
              {student.firstName[0]}
              {student.lastName[0]}
            </div>
            <div>
              <h2 className="text-lg font-semibold">
                {student.firstName} {student.lastName}
              </h2>
              <code className="text-xs font-mono text-muted-foreground">
                {student.matricule}
              </code>
              <div className="mt-1">
                <Badge variant={student.isActive ? "default" : "secondary"} className="text-xs">
                  {student.isActive ? "Actif" : "Inactif"}
                </Badge>
              </div>
            </div>
          </div>

          {/* QR Code */}
          <div className="flex justify-center">
            <div className="rounded-xl border bg-white p-3">
              <img
                src={student.qrCodeUrl}
                alt={`QR Code ${student.matricule}`}
                className="size-36"
                loading="eager"
              />
            </div>
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <UserCircle2 className="size-3.5" /> Genre
              </div>
              <p className="font-medium">
                {student.gender === "M" ? "Masculin" : "Féminin"}
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="size-3.5" /> Date de naissance
              </div>
              <p className="font-medium">{formatDate(student.dateOfBirth)}</p>
              <p className="text-xs text-muted-foreground">
                {ageFromBirth(student.dateOfBirth)} ans
              </p>
            </div>
            <div className="space-y-1 col-span-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <GraduationCap className="size-3.5" /> Classe
              </div>
              <p className="font-medium">
                {className} {levelName ? `(${levelName})` : ""}
              </p>
            </div>
          </div>

          {/* Parent */}
          <div className="rounded-lg border p-4 space-y-2 text-sm">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Phone className="size-3.5" /> Parent / Tuteur
            </div>
            <p className="font-medium">{parentName}</p>
            <p className="text-muted-foreground">{parentPhone}</p>
            {parentEmail && (
              <p className="text-muted-foreground">{parentEmail}</p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Année scolaire : {student.schoolYear}</span>
            <span>Inscrit le {formatDate(student.createdAt)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
