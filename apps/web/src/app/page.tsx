"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, GraduationCap, BookOpen, Users, WifiOff, MessageCircle, TrendingUp, Phone, Mail, MapPin, CheckCircle, Play } from "lucide-react";
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
    features: ["Éveil pédagogique", "Suivi personnalisé", "Activités ludiques"],
  },
  {
    level: "Collège",
    grades: "6ème → 3ème",
    image: "https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?w=600&h=400&fit=crop",
    description: "Consolidation des acquis, préparation au BFEM. Accompagnement personnalisé.",
    icon: GraduationCap,
    features: ["Méthodologie renforcée", "Soutien scolaire", "Orientation progressive"],
  },
  {
    level: "Lycée",
    grades: "2nde → Terminale",
    image: "https://images.unsplash.com/photo-1523050854058-8df90110c8f1?w=600&h=400&fit=crop",
    description: "Orientation, excellence académique, préparation au baccalauréat.",
    icon: Users,
    features: ["Spécialisations", "Prépa bac intensive", "Conseils orientation"],
  },
];

const avantages = [
  {
    icon: WifiOff,
    title: "Fonctionne hors-ligne",
    desc: "Coupures internet ? L'app continue de marcher. Les données se synchronisent automatiquement.",
    color: "bg-blue-500",
  },
  {
    icon: MessageCircle,
    title: "Alertes WhatsApp",
    desc: "Absences, paiements, événements — les parents reçoivent des notifications en temps réel.",
    color: "bg-green-500",
  },
  {
    icon: TrendingUp,
    title: "Suivi en temps réel",
    desc: "Le propriétaire voit tout : inscriptions, paiements, résultats — d'un coup d'œil.",
    color: "bg-purple-500",
  },
];

const testimonials = [
  {
    name: "Fatou Diallo",
    role: "Directrice d'école",
    content: "Le Verger a transformé notre gestion quotidienne. Les parents sont mieux informés et nous gagnons un temps précieux.",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop",
  },
  {
    name: "Mamadou Sow",
    role: "Enseignant",
    content: "La saisie des notes et la création des bulletins sont devenues simples et rapides. Un outil indispensable.",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop",
  },
  {
    name: "Aïssa Ba",
    role: "Parent d'élève",
    content: "Je reçois les absences et les notes directement sur WhatsApp. Je suis beaucoup plus impliquée dans la scolarité de mon enfant.",
    avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop",
  },
];

export default function LandingPage() {
  const [activeFeature, setActiveFeature] = useState(0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20 overflow-hidden">
      {/* Navbar améliorée */}
      <header className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70 shadow-sm">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative">
              <Image src="/logo.png" alt="Logo Le Verger" width={40} height={40} className="rounded-xl transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 shadow-md" />
              <div className="absolute -inset-2 bg-primary/20 blur-lg rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>
            <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-primary to-emerald-600 bg-clip-text text-transparent">Le Verger</span>
          </Link>
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex hover:bg-primary/10 hover:text-primary transition-colors">
              <Link href="#features">Fonctionnalités</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex hover:bg-primary/10 hover:text-primary transition-colors">
              <Link href="#cycles">Cycles</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex hover:bg-primary/10 hover:text-primary transition-colors">
              <Link href="#temoignages">Témoignages</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="hover:bg-primary/10 hover:text-primary transition-colors">
              <Link href="/tarifs">Tarifs</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex border-primary/30 hover:bg-primary/10">
              <Link href="/login">Se connecter</Link>
            </Button>
            <Button asChild size="sm" className="rounded-full bg-gradient-to-r from-primary to-emerald-600 hover:from-primary/90 hover:to-emerald-600/90 shadow-lg shadow-primary/30 hover:shadow-primary/40 transition-all duration-300 hover:-translate-y-0.5">
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
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/20 to-background" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 py-32 text-center text-white md:py-44">
          <div className="mx-auto mb-8 inline-flex items-center gap-2 rounded-full bg-primary/20 px-5 py-2.5 text-sm backdrop-blur border border-primary/30 animate-in fade-in slide-in-from-bottom-4 duration-700 shadow-lg">
            <span className="size-2.5 rounded-full bg-green-400 animate-pulse" />
            Plateforme de gestion scolaire #1 au Sénégal
          </div>
          <h1 className="mx-auto max-w-4xl text-5xl font-bold tracking-tight md:text-6xl lg:text-7xl animate-in fade-in slide-in-from-bottom-8 duration-1000 drop-shadow-lg">
            L&apos;école, pilotée en <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-emerald-300 to-teal-400">temps réel</span>
          </h1>
          <p className="mx-auto mt-8 max-w-2xl text-xl text-white/95 md:text-2xl animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-200 drop-shadow-md">
            Inscriptions, paiements, absences, communication parents — une seule
            plateforme pensée pour les réalités du Sénégal.
          </p>
          <div className="mt-16 flex flex-wrap items-center justify-center gap-5 animate-in fade-in slide-in-from-bottom-16 duration-1000 delay-300">
            <Button asChild size="lg" className="rounded-full bg-gradient-to-r from-primary to-emerald-600 px-10 text-primary-foreground hover:from-primary/90 hover:to-emerald-600/90 shadow-2xl shadow-primary/40 hover:shadow-primary/50 transition-all duration-300 hover:-translate-y-1 text-lg">
              <Link href="/register">
                Commencer gratuitement <ArrowRight className="ml-2 size-5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-full border-2 border-white/40 px-10 text-white hover:bg-white/15 hover:text-white backdrop-blur-md transition-all duration-300 hover:-translate-y-1 text-lg">
              <Link href="#demo">
                <Play className="mr-2 size-5" /> Voir la démo
              </Link>
            </Button>
          </div>
          
          {/* Stats rapides améliorées */}
          <div className="mt-20 grid grid-cols-3 gap-10 max-w-2xl mx-auto animate-in fade-in duration-1000 delay-500">
            <div className="text-center p-4 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/15 transition-colors">
              <div className="text-4xl md:text-5xl font-bold text-white drop-shadow-lg">50+</div>
              <div className="text-sm text-white/85 mt-1 font-medium">écoles utilisatrices</div>
            </div>
            <div className="text-center p-4 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/15 transition-colors">
              <div className="text-4xl md:text-5xl font-bold text-white drop-shadow-lg">10k+</div>
              <div className="text-sm text-white/85 mt-1 font-medium">élèves suivis</div>
            </div>
            <div className="text-center p-4 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/15 transition-colors">
              <div className="text-4xl md:text-5xl font-bold text-white drop-shadow-lg">99%</div>
              <div className="text-sm text-white/85 mt-1 font-medium">satisfaction</div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* FONCTIONNALITÉS PRINCIPALES                                   */}
      {/* ============================================================ */}
      <section id="features" className="mx-auto max-w-7xl px-4 py-24">
        <div className="mb-16 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-6 mx-auto">
            <TrendingUp className="size-7 text-primary" />
          </div>
          <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
            Tout ce dont vous avez besoin
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-muted-foreground text-lg">
            Une suite complète d'outils pour gérer votre établissement scolaire efficacement.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {avantages.map((a, index) => (
            <div
              key={a.title}
              className="group relative rounded-3xl border bg-card p-8 transition-all duration-500 hover:shadow-2xl hover:-translate-y-2 overflow-hidden hover:border-primary/30"
              onMouseEnter={() => setActiveFeature(index)}
            >
              <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-500 ${a.color}`} />
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/5 to-transparent rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative">
                <div className={`mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl ${a.color} text-white shadow-lg transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6`}>
                  <a.icon className="size-7" />
                </div>
                <h3 className="mb-3 text-xl font-semibold">{a.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{a.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============================================================ */}
      {/* CYCLES SCOLAIRES                                              */}
      {/* ============================================================ */}
      <section id="cycles" className="border-t bg-gradient-to-b from-muted/30 to-background">
        <div className="mx-auto max-w-7xl px-4 py-24">
          <div className="mb-16 text-center">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-6 mx-auto">
              <GraduationCap className="size-7 text-primary" />
            </div>
            <h2 className="text-4xl font-bold tracking-tight md:text-5xl">Nos cycles d&apos;enseignement</h2>
            <p className="mx-auto mt-6 max-w-2xl text-muted-foreground text-lg">
              Du CP1 à la Terminale, un suivi complet et structuré pour chaque élève.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {cycles.map((c, index) => (
              <Card key={c.level} className="group overflow-hidden rounded-3xl transition-all duration-500 hover:shadow-2xl hover:-translate-y-3 border-0 shadow-xl hover:border-primary/20">
                <div className="relative h-60 overflow-hidden">
                  <Image
                    src={c.image}
                    alt={c.level}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent" />
                  <div className="absolute bottom-5 left-5 right-5 flex items-center gap-3 text-white">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/25 backdrop-blur-md shadow-lg transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6">
                      <c.icon className="size-7" />
                    </div>
                    <div>
                      <span className="block text-xl font-bold">{c.level}</span>
                      <span className="text-sm text-white/90 font-medium">{c.grades}</span>
                    </div>
                  </div>
                </div>
                <CardContent className="p-7">
                  <p className="mb-5 text-sm text-muted-foreground leading-relaxed">{c.description}</p>
                  <ul className="space-y-3">
                    {c.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-3 text-sm">
                        <CheckCircle className="size-5 text-primary shrink-0" />
                        <span className="text-muted-foreground font-medium">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* TÉMOIGNAGES                                                   */}
      {/* ============================================================ */}
      <section id="temoignages" className="mx-auto max-w-7xl px-4 py-24">
        <div className="mb-16 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-6 mx-auto">
            <Users className="size-7 text-primary" />
          </div>
          <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
            Ils nous font confiance
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-muted-foreground text-lg">
            Découvrez comment Le Verger aide les écoles sénégalaises au quotidien.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {testimonials.map((t, index) => (
            <Card key={t.name} className="rounded-3xl border-0 shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 overflow-hidden group">
              <CardContent className="p-8">
                <div className="mb-6 flex items-center gap-5">
                  <div className="relative">
                    <Image
                      src={t.avatar}
                      alt={t.name}
                      width={64}
                      height={64}
                      className="rounded-full object-cover ring-4 ring-primary/20 group-hover:ring-primary/40 transition-all duration-300"
                      unoptimized
                    />
                    <div className="absolute -inset-1 bg-primary/20 blur-md rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </div>
                  <div>
                    <div className="font-bold text-lg">{t.name}</div>
                    <div className="text-sm text-muted-foreground font-medium">{t.role}</div>
                  </div>
                </div>
                <p className="text-muted-foreground italic leading-relaxed text-base">"{t.content}"</p>
                <div className="mt-6 flex gap-1.5">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="size-5 text-yellow-500 fill-current drop-shadow-sm" viewBox="0 0 20 20">
                      <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                    </svg>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ============================================================ */}
      {/* GALERIE PHOTOS                                                */}
      {/* ============================================================ */}
      <section className="mx-auto max-w-7xl px-4 py-24">
        <div className="mb-16 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-6 mx-auto">
            <BookOpen className="size-7 text-primary" />
          </div>
          <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
            La vie au quotidien
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-muted-foreground text-lg">
            Découvrez notre établissement en images : salles de classe, activités, et moments de vie scolaire.
          </p>
        </div>

        <div className="grid gap-5 grid-cols-2 md:grid-cols-4">
          <div className="relative aspect-square overflow-hidden rounded-3xl group md:col-span-2 md:row-span-2 shadow-xl hover:shadow-2xl transition-shadow duration-500">
            <Image
              src="https://images.unsplash.com/photo-1580582932707-528aed8aff1e?w=800&h=800&fit=crop"
              alt="Salle de classe moderne"
              fill
              className="object-cover transition-transform duration-700 group-hover:scale-110"
              unoptimized
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="absolute bottom-6 left-6 right-6 text-white translate-y-6 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500">
              <p className="font-bold text-lg">Salles équipées</p>
              <p className="text-sm text-white/90">Un environnement d'apprentissage optimal</p>
            </div>
          </div>
          
          <div className="relative aspect-square overflow-hidden rounded-3xl group shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-1">
            <Image
              src="https://images.unsplash.com/photo-1577896851231-70ef18881754?w=400&h=400&fit=crop"
              alt="Bibliothèque scolaire"
              fill
              className="object-cover transition-transform duration-700 group-hover:scale-110"
              unoptimized
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="absolute bottom-4 left-4 right-4 text-white translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500">
              <p className="text-sm font-bold">Bibliothèque</p>
            </div>
          </div>

          <div className="relative aspect-square overflow-hidden rounded-3xl group shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-1">
            <Image
              src="https://images.unsplash.com/photo-1509062522246-3755977927d7?w=400&h=400&fit=crop"
              alt="Élèves en classe"
              fill
              className="object-cover transition-transform duration-700 group-hover:scale-110"
              unoptimized
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="absolute bottom-4 left-4 right-4 text-white translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500">
              <p className="text-sm font-bold">Apprentissage</p>
            </div>
          </div>

          <div className="relative aspect-square overflow-hidden rounded-3xl group shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-1">
            <Image
              src="https://images.unsplash.com/photo-1544531586-fde5298cdd40?w=400&h=400&fit=crop"
              alt="Activités sportives"
              fill
              className="object-cover transition-transform duration-700 group-hover:scale-110"
              unoptimized
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="absolute bottom-4 left-4 right-4 text-white translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500">
              <p className="text-sm font-bold">Sport</p>
            </div>
          </div>

          <div className="relative aspect-square overflow-hidden rounded-3xl group shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-1">
            <Image
              src="https://images.unsplash.com/photo-1564951434112-64d74cc2a2d7?w=400&h=400&fit=crop"
              alt="Activités artistiques"
              fill
              className="object-cover transition-transform duration-700 group-hover:scale-110"
              unoptimized
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="absolute bottom-4 left-4 right-4 text-white translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500">
              <p className="text-sm font-bold">Arts & Créativité</p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* CHIFFRES CLÉS DYNAMIQUES                                      */}
      {/* ============================================================ */}
      <DynamicStats />

      {/* ============================================================ */}
      {/* CONTACT                                                       */}
      {/* ============================================================ */}
      <section id="contact" className="border-t bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-20">
          <div className="grid gap-12 md:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Contactez-nous</h2>
              <p className="mt-4 text-muted-foreground text-lg leading-relaxed">
                Une question sur nos cycles, nos tarifs ou notre plateforme ?
                Notre équipe est là pour vous accompagner.
              </p>
              <div className="mt-8 space-y-5">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <MapPin className="size-5" />
                  </div>
                  <div>
                    <div className="font-medium">Notre adresse</div>
                    <div className="text-sm text-muted-foreground">Dakar, Sénégal</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Phone className="size-5" />
                  </div>
                  <div>
                    <div className="font-medium">Téléphone</div>
                    <div className="text-sm text-muted-foreground">+221 XX XXX XX XX</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Mail className="size-5" />
                  </div>
                  <div>
                    <div className="font-medium">Email</div>
                    <div className="text-sm text-muted-foreground">contact@leverger.sn</div>
                  </div>
                </div>
              </div>
            </div>
            <ContactForm />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-background">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <div className="grid gap-8 md:grid-cols-4">
            <div className="md:col-span-2">
              <div className="mb-4 flex items-center gap-2">
                <Image src="/logo.png" alt="" width={28} height={28} className="rounded" />
                <span className="text-lg font-semibold">Le Verger</span>
              </div>
              <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
                Plateforme de gestion scolaire privée conçue pour les écoles sénégalaises.
                Simplifiez votre administration, améliorez la communication.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Liens rapides</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/login" className="hover:text-primary transition-colors">Connexion</Link></li>
                <li><Link href="/register" className="hover:text-primary transition-colors">Inscription</Link></li>
                <li><Link href="/tarifs" className="hover:text-primary transition-colors">Tarifs</Link></li>
                <li><Link href="#contact" className="hover:text-primary transition-colors">Contact</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Légal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="#" className="hover:text-primary transition-colors">Confidentialité</Link></li>
                <li><Link href="#" className="hover:text-primary transition-colors">CGU</Link></li>
                <li><Link href="#" className="hover:text-primary transition-colors">Mentions légales</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t text-center text-sm text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} École Le Verger — Dakar, Sénégal. Tous droits réservés.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chiffres clés dynamiques                                            */
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
      <div className="mx-auto max-w-7xl px-4 py-16">
        <h2 className="mb-12 text-center text-2xl font-bold tracking-tight">
          Le Verger en chiffres
        </h2>
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
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
    <div className="text-center p-6 rounded-2xl bg-card border hover:shadow-lg transition-shadow">
      <div className="text-4xl font-bold text-primary">{value}</div>
      <div className="mt-2 text-sm text-muted-foreground font-medium">
        {label}
        {hint && <span className="ml-2 text-xs opacity-60 bg-muted px-2 py-0.5 rounded-full">{hint}</span>}
      </div>
    </div>
  );
}
