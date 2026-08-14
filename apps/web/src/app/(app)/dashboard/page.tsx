"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, School, Users, Wallet, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";

type Level = {
  id: string;
  name: string;
  order: number;
  description: string | null;
  classes: { id: string; name: string; tuitionFee: string; schoolYear: string }[];
};

type LevelStat = {
  levelName: string | null;
  levelOrder: number | null;
  count: number;
};

type GenderStat = {
  gender: "M" | "F";
  count: number;
};

type RecentStudent = {
  id: string;
  matricule: string;
  firstName: string;
  lastName: string;
  gender: "M" | "F";
  createdAt: string;
  class?: { name: string } | null;
};

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ levels: 0, classes: 0, students: 0 });
  const [byLevel, setByLevel] = useState<LevelStat[]>([]);
  const [byGender, setByGender] = useState<GenderStat[]>([]);
  const [recent, setRecent] = useState<RecentStudent[]>([]);

  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      if (!data?.user) router.replace("/login");
    });
  }, [router]);

  useEffect(() => {
    Promise.all([
      api.get<Level[]>("/levels"),
      api.get<{ total: number }>("/students/count"),
      api.get<LevelStat[]>("/students/by-level"),
      api.get<GenderStat[]>("/students/by-gender"),
      api.get<RecentStudent[]>("/students/recent"),
    ])
      .then(([levels, countRes, levelStats, genderStats, recentStudents]) => {
        setStats({
          levels: levels.length,
          classes: levels.reduce((n, l) => n + l.classes.length, 0),
          students: countRes.total,
        });
        setByLevel(levelStats.filter((l) => l.levelName));
        setByGender(genderStats);
        setRecent(recentStudents);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const maxLevelCount = Math.max(...byLevel.map((l) => l.count), 1);
  const totalGender = byGender.reduce((s, g) => s + g.count, 0);
  const maleCount = byGender.find((g) => g.gender === "M")?.count ?? 0;
  const femaleCount = byGender.find((g) => g.gender === "F")?.count ?? 0;

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tableau de bord</h1>
        <p className="text-sm text-muted-foreground">
          Vue d&apos;ensemble de l&apos;école — données en temps réel.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error} — le serveur API est-il démarré ?</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Niveaux</CardTitle>
            <School className="size-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{loading ? "…" : stats.levels}</div>
            <CardDescription>structures</CardDescription>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Classes</CardTitle>
            <GraduationCap className="size-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{loading ? "…" : stats.classes}</div>
            <CardDescription>dans l&apos;école</CardDescription>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Élèves</CardTitle>
            <Users className="size-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{loading ? "…" : stats.students}</div>
            <CardDescription>inscrits</CardDescription>
          </CardContent>
        </Card>

        <Card className="rounded-2xl opacity-60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Finances</CardTitle>
            <Wallet className="size-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">—</div>
            <CardDescription>bientôt disponible</CardDescription>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Répartition par niveau — barres CSS */}
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Élèves par niveau</CardTitle>
            <CardDescription>Répartition des inscrits</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">Chargement…</p>
            ) : byLevel.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune donnée pour le moment.</p>
            ) : (
              byLevel.map((level) => (
                <div key={level.levelName} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{level.levelName}</span>
                    <span className="text-muted-foreground">{level.count} élève{level.count > 1 ? "s" : ""}</span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${(level.count / maxLevelCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Répartition par genre — barres horizontales */}
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Répartition par genre</CardTitle>
            <CardDescription>Garçons vs Filles</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Chargement…</p>
            ) : totalGender === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune donnée pour le moment.</p>
            ) : (
              <>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Garçons</span>
                    <span className="text-muted-foreground">
                      {maleCount} ({totalGender ? Math.round((maleCount / totalGender) * 100) : 0} %)
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-chart-1 transition-all duration-500"
                      style={{ width: `${totalGender ? (maleCount / totalGender) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Filles</span>
                    <span className="text-muted-foreground">
                      {femaleCount} ({totalGender ? Math.round((femaleCount / totalGender) * 100) : 0} %)
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-chart-2 transition-all duration-500"
                      style={{ width: `${totalGender ? (femaleCount / totalGender) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dernières inscriptions */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Dernières inscriptions</CardTitle>
          <CardDescription>Les 5 élèves les plus récemment inscrits</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune inscription pour le moment.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Matricule</th>
                    <th className="px-4 py-2 text-left font-medium">Nom</th>
                    <th className="px-4 py-2 text-left font-medium">Classe</th>
                    <th className="px-4 py-2 text-left font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="px-4 py-2 font-mono text-xs">{s.matricule}</td>
                      <td className="px-4 py-2">
                        {s.firstName} {s.lastName}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {s.gender === "M" ? "♂" : "♀"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{s.class?.name ?? "—"}</td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {new Date(s.createdAt).toLocaleDateString("fr-FR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Finances — placeholder */}
      <Card className="rounded-2xl border-dashed opacity-60">
        <CardHeader>
          <CardTitle className="text-base">Vue financière</CardTitle>
          <CardDescription>
            Revenus, impayés et dépenses — module à venir
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
            <span>Revenus du mois</span>
            <span className="font-semibold">— FCFA</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
            <span>Impayés</span>
            <span className="font-semibold">— FCFA</span>
          </div>
          <p className="text-center text-xs italic">Bientôt disponible dans le module Finances.</p>
        </CardContent>
      </Card>
    </>
  );
}
