import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/* ------------------------------------------------------------------ */
/* E6 — Page Tarifs & Offres (statique, non modifiable depuis l'app)   */
/* Les montants sont des exemples — à remplacer par les vrais tarifs.  */
/* ------------------------------------------------------------------ */

const tarifs = [
  {
    cycle: "Primaire",
    grades: "CP1 → CM2",
    inscription: "50 000 FCFA",
    mensuel: "25 000 FCFA",
    annuel: "250 000 FCFA",
    image: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=600&h=400&fit=crop",
    avantages: [
      "Fournitures scolaires incluses",
      "Cantine midi",
      "Étude dirigée",
      "Suivi personnalisé",
    ],
    populaire: false,
  },
  {
    cycle: "Collège",
    grades: "6ème → 3ème",
    inscription: "75 000 FCFA",
    mensuel: "35 000 FCFA",
    annuel: "350 000 FCFA",
    image: "https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?w=600&h=400&fit=crop",
    avantages: [
      "Laboratoire informatique",
      "Cantine midi",
      "Étude dirigée + aide aux devoirs",
      "Préparation au BFEM",
      "Activités parascolaires",
    ],
    populaire: true,
  },
  {
    cycle: "Lycée",
    grades: "2nde → Terminale",
    inscription: "100 000 FCFA",
    mensuel: "45 000 FCFA",
    annuel: "450 000 FCFA",
    image: "https://images.unsplash.com/photo-1523050854058-8df90110c8f1?w=600&h=400&fit=crop",
    avantages: [
      "Laboratoire sciences",
      "Cantine midi",
      "Préparation au baccalauréat",
      "Orientation universitaire",
      "Club de lecture",
    ],
    populaire: false,
  },
];

export default function TarifsPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/logo.png" alt="Logo Le Verger" width={36} height={36} className="rounded-lg" />
            <span className="text-lg font-semibold tracking-tight">Le Verger</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Se connecter</Link>
            </Button>
            <Button asChild size="sm" className="rounded-xl">
              <Link href="/register">
                Créer un compte <ArrowRight className="ml-1 size-3.5" />
              </Link>
            </Button>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 py-16 text-center md:py-24">
        <div className="mx-auto mb-6 inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10">
          <GraduationCap className="size-8 text-primary" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
          Tarifs &amp; Offres
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          Des tarifs transparents, sans frais cachés. Choisissez le cycle qui
          convient à votre enfant.
        </p>
      </section>

      {/* Cartes tarifs */}
      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="grid gap-8 md:grid-cols-3">
          {tarifs.map((t) => (
            <Card
              key={t.cycle}
              className={`relative flex flex-col overflow-hidden rounded-2xl transition-shadow hover:shadow-lg ${
                t.populaire ? "border-primary shadow-lg ring-2 ring-primary/20" : ""
              }`}
            >
              {t.populaire && (
                <div className="bg-primary py-1.5 text-center text-sm font-medium text-primary-foreground">
                  Le plus choisi
                </div>
              )}
              <div className="relative h-44 overflow-hidden">
                <Image
                  src={t.image}
                  alt={t.cycle}
                  fill
                  className="object-cover"
                  unoptimized
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                <div className="absolute bottom-3 left-4 text-white">
                  <span className="text-lg font-bold">{t.cycle}</span>
                  <span className="ml-2 text-sm opacity-80">{t.grades}</span>
                </div>
              </div>
              <CardHeader>
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <div className="text-xs text-muted-foreground">Inscription</div>
                    <div className="text-lg font-bold">{t.inscription}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Mensuel</div>
                    <div className="text-lg font-bold">{t.mensuel}</div>
                  </div>
                </div>
                <div className="mt-2 text-center text-sm text-muted-foreground">
                  Soit <span className="font-semibold text-foreground">{t.annuel}</span> / an
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <ul className="mb-6 space-y-2 text-sm">
                  {t.avantages.map((a) => (
                    <li key={a} className="flex items-center gap-2">
                      <Check className="size-4 text-primary" />
                      {a}
                    </li>
                  ))}
                </ul>
                <Button asChild className="mt-auto w-full rounded-xl">
                  <Link href="/register">
                    Inscrire mon enfant <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Note */}
        <div className="mx-auto mt-12 max-w-2xl rounded-2xl border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Paiement flexible</p>
          <p className="mt-1">
            Possibilité de payer en espèces, par virement ou via Mobile Money (Wave, Orange Money).
            Des facilités de paiement peuvent être discutées avec la direction.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-8 text-center text-sm text-muted-foreground">
          <div className="mb-2 flex items-center justify-center gap-2">
            <Image src="/logo.png" alt="" width={20} height={20} className="rounded" />
            <span className="font-medium text-foreground">Le Verger</span>
          </div>
          <p>&copy; {new Date().getFullYear()} École Le Verger — Gestion scolaire privée, Dakar.</p>
        </div>
      </footer>
    </div>
  );
}
