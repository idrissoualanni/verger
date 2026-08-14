import Image from "next/image";
import Link from "next/link";
import { RegisterForm } from "@/components/register-form";

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen">
      {/* Panneau gauche — image + marque (masqué sur mobile) */}
      <div className="relative hidden w-1/2 lg:block">
        <Image
          src="https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?w=900&h=1200&fit=crop"
          alt=""
          fill
          className="object-cover"
          priority
          unoptimized
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
        <div className="absolute bottom-10 left-10 max-w-md text-white">
          <div className="mb-4 flex items-center gap-3">
            <Image src="/logo.png" alt="" width={44} height={44} className="rounded-lg" />
            <span className="text-xl font-bold">Le Verger</span>
          </div>
          <p className="text-lg text-white/80">
            Rejoignez une plateforme pensée pour les écoles sénégalaises.
            Simple, rapide, sans engagement.
          </p>
        </div>
      </div>

      {/* Panneau droit — formulaire */}
      <div className="flex flex-1 items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            ← Retour à l&apos;accueil
          </Link>
          <RegisterForm />
        </div>
      </div>
    </div>
  );
}
