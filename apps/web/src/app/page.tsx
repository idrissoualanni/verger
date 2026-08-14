import Image from "next/image";
import Link from "next/link";
import { ArrowRight, GraduationCap, BookOpen, Users, WifiOff, MessageCircle, TrendingUp, Phone, Mail, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ContactForm } from "@/components/contact-form";

/* ------------------------------------------------------------------ */
/* Données publiques (pas de données fictives — cycles génériques)     */
/* ------------------------------------------------------------------ */

const cycles = [
  {
    level: "Primaire",
    grades: "CP1 → CM2",
    image: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=600&h=400&fit=crop",
    description: "Les fondamentaux : lecture, écriture, calcul. Un suivi rigoureux dès le plus jeune âge.",
    icon: BookOpen,
  },
  {
    level: "Collège",
    grades: "6ème → 3ème",
    image: "https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?w=600&h=400&fit=crop",
    description: "Consolidation des acquis, préparation au BFEM. Accompagnement personnalisé.",
    icon: GraduationCap,
  },
  {
    level: "Lycée",
    grades: "2nde → Terminale",
    image: "https://images.unsplash.com/photo-1523050854058-8df90110c8f1?w=600&h=400&fit=crop",
    description: "Orientation, excellence académique, préparation au baccalauréat.",
    icon: Users,
  },
];

const avantages = [
  {
    icon: WifiOff,
    title: "Fonctionne hors-ligne",
    desc: "Coupures internet ? L'app continue de marcher. Les données se synchronisent automatiquement.",
  },
  {
    icon: MessageCircle,
    title: "Alertes WhatsApp",
    desc: "Absences, paiements, événements — les parents reçoivent des notifications en temps réel.",
  },
  {
    icon: TrendingUp,
    title: "Suivi en temps réel",
    desc: "Le propriétaire voit tout : inscriptions, paiements, résultats — d'un coup d'œil.",
  },
];

export default function LandingPage() {
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
              <Link href="/tarifs">Tarifs</Link>
            </Button>
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

      {/* ============================================================ */}
      {/* HERO                                                          */}
      {/* ============================================================ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=1400&h=700&fit=crop"
            alt=""
            fill
            className="object-cover brightness-[0.35]"
            priority
            unoptimized
          />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 py-28 text-center text-white md:py-40">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm backdrop-blur">
            <span className="size-2 rounded-full bg-green-400 animate-pulse" />
            Plateforme de gestion scolaire
          </div>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
            L&apos;école, pilotée en <span className="text-green-400">temps réel</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-white/80 md:text-xl">
            Inscriptions, paiements, absences, communication parents — une seule
            plateforme pensée pour les réalités du Sénégal.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Button asChild size="lg" className="rounded-xl bg-green-500 px-8 text-white hover:bg-green-600">
              <Link href="/register">
                Commencer <ArrowRight className="ml-2 size-5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-xl border-white/30 px-8 text-white hover:bg-white/10 hover:text-white">
              <Link href="#cycles">Découvrir les cycles</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* CYCLES SCOLAIRES (E5 : présentation Primaire / Collège / Lycée) */}
      {/* ============================================================ */}
      <section id="cycles" className="mx-auto max-w-6xl px-4 py-20">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Nos cycles d&apos;enseignement</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Du CP1 à la Terminale, un suivi complet et structuré pour chaque élève.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {cycles.map((c) => (
            <Card key={c.level} className="group overflow-hidden rounded-2xl transition-shadow hover:shadow-lg">
              <div className="relative h-48 overflow-hidden">
                <Image
                  src={c.image}
                  alt={c.level}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  unoptimized
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                <div className="absolute bottom-3 left-4 flex items-center gap-2 text-white">
                  <c.icon className="size-5" />
                  <span className="font-semibold">{c.level}</span>
                </div>
              </div>
              <CardContent className="p-5">
                <div className="mb-2 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  {c.grades}
                </div>
                <p className="text-sm text-muted-foreground">{c.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ============================================================ */}
      {/* AVANTAGES DIFFÉRENCIANTS (E5)                                 */}
      {/* ============================================================ */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Pourquoi Le Verger ?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Pensé pour les contraintes réelles des écoles sénégalaises.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {avantages.map((a) => (
              <div
                key={a.title}
                className="rounded-2xl border bg-card p-6 text-center transition-shadow hover:shadow-md"
              >
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <a.icon className="size-6" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">{a.title}</h3>
                <p className="text-sm text-muted-foreground">{a.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* CHIFFRES CLÉS DYNAMIQUES (E5 : masqués si base vide)          */}
      {/* ============================================================ */}
      <DynamicStats />

      {/* ============================================================ */}
      {/* CONTACT (E5)                                                  */}
      {/* ============================================================ */}
      <section className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="grid gap-12 md:grid-cols-2">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Contactez-nous</h2>
              <p className="mt-3 text-muted-foreground">
                Une question sur nos cycles, nos tarifs ou notre plateforme ?
                N&apos;hésitez pas à nous écrire.
              </p>
              <div className="mt-6 space-y-4">
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="size-5 text-primary" />
                  <span>Dakar, Sénégal</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="size-5 text-primary" />
                  <span>+221 XX XXX XX XX</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="size-5 text-primary" />
                  <span>contact@leverger.sn</span>
                </div>
              </div>
            </div>
            <ContactForm />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-background">
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

/* ------------------------------------------------------------------ */
/* Chiffres clés dynamiques — masqués si la base est vide (E5)         */
/* ------------------------------------------------------------------ */
async function DynamicStats() {
  let stats: { levels: number; classes: number } | null = null;
  try {
    const res = await fetch(`${process.env.API_URL || ""}/api/levels`, {
      cache: "no-store",
    });
    if (res.ok) {
      const levels = (await res.json()) as Array<{ classes: unknown[] }>;
      stats = {
        levels: levels.length,
        classes: levels.reduce((n, l) => n + l.classes.length, 0),
      };
    }
  } catch {
    // Silencieux : section masquée
  }

  if (!stats || (stats.levels === 0 && stats.classes === 0)) return null;

  return (
    <section className="border-t bg-primary/5">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="mb-10 text-center text-2xl font-bold tracking-tight">
          Le Verger en chiffres
        </h2>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <StatCard label="Niveaux" value={stats.levels} />
          <StatCard label="Classes" value={stats.classes} />
          <StatCard label="Élèves" value="—" hint="bientôt" />
          <StatCard label="Taux de réussite" value="—" hint="bientôt" />
        </div>
      </div>
    </section>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="text-center">
      <div className="text-3xl font-bold text-primary">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">
        {label}
        {hint && <span className="ml-1 text-xs opacity-60">({hint})</span>}
      </div>
    </div>
  );
}
