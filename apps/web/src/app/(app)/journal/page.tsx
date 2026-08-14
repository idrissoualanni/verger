"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authClient, type SessionUser } from "@/lib/auth-client";
import { api } from "@/lib/api";

type AuditLog = {
  id: string;
  userId: string;
  userName: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  details: string | null;
  ip: string | null;
  createdAt: string;
};

export default function JournalPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      const userRole = (data?.user as SessionUser | undefined | null)?.role ?? null;
      setRole(userRole);
      if (userRole !== "PROPRIETAIRE") {
        router.replace("/dashboard");
      }
    });
  }, [router]);

  useEffect(() => {
    if (role !== "PROPRIETAIRE") return;
    api.get<AuditLog[]>("/audit-logs")
      .then((data) => setLogs(data))
      .catch((e) => {
        if (e.status === 404) {
          setError("Le module de journalisation n'est pas encore activé côté API.");
        } else {
          setError(e.message);
        }
      })
      .finally(() => setLoading(false));
  }, [role]);

  if (role !== "PROPRIETAIRE") {
    return null;
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Journal d'audit</h1>
        <p className="text-sm text-muted-foreground">
          Historique des actions sensibles — réservé au propriétaire.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="size-5" />
            Logs récents
          </CardTitle>
          <CardDescription>
            Dernière{logs.length !== 1 ? "s" : ""} action{logs.length !== 1 ? "s" : ""} enregistrée{logs.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun log pour le moment.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Date</th>
                    <th className="px-4 py-2 text-left font-medium">Utilisateur</th>
                    <th className="px-4 py-2 text-left font-medium">Action</th>
                    <th className="px-4 py-2 text-left font-medium">Ressource</th>
                    <th className="px-4 py-2 text-left font-medium">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-t">
                      <td className="px-4 py-2 text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString("fr-FR")}
                      </td>
                      <td className="px-4 py-2">{log.userName}</td>
                      <td className="px-4 py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                          {log.action}
                        </code>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {log.resourceType}
                        {log.resourceId && (
                          <span className="ml-1 font-mono text-xs">#{log.resourceId}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                        {log.ip ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
