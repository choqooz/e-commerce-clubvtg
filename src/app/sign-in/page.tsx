// ── Sign In Placeholder ──
// TODO: Replace with Clerk <SignIn /> when keys are configured

import Link from "next/link";

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="font-heading text-3xl font-light mb-2">clubvtg</h1>
          <p className="text-sm text-muted-foreground font-sans">
            Iniciá sesión para comprar y usar el probador virtual
          </p>
        </div>

        <div className="border border-border p-8 text-center">
          <p className="text-sm text-muted-foreground font-sans mb-4">
            🔒 Autenticación con Clerk
          </p>
          <p className="text-xs text-muted-foreground font-sans mb-6">
            Configurá las variables de entorno de Clerk para habilitar el
            login. Ver <code>.env.local.example</code>
          </p>
          <Link
            href="/"
            className="text-sm underline text-muted-foreground hover:text-foreground"
          >
            Volver al catálogo
          </Link>
        </div>
      </div>
    </div>
  );
}
