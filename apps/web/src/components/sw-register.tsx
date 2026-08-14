"use client";

import { useEffect } from "react";
import * as offlineQueue from "@/lib/offline-queue";
import { toast } from "sonner";

export function SWRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").then((reg) => {
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        window.location.reload();
      });

      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        newWorker?.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            toast.info("Une nouvelle version est disponible", {
              description: "Rechargez la page pour l'obtenir.",
            });
          }
        });
      });
    }).catch((err) => {
      console.error("SW registration failed:", err);
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = async () => {
      try {
        const count = await offlineQueue.sync();
        if (count > 0) {
          toast.success(`${count} modification${count > 1 ? "s" : ""} synchronisée${count > 1 ? "s" : ""}`);
        }
      } catch {
        toast.error("Erreur lors de la synchronisation");
      }
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  return null;
}
