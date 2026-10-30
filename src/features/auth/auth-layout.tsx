import type { ReactNode } from "react";
import { WalletCards } from "lucide-react";
import { BrandLogo } from "@/components/navigation/brand-logo";
import { Card, CardContent } from "@/components/ui/card";
import { GoogleOneTap } from "@/features/auth/google-one-tap";

interface AuthLayoutProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}

export function AuthLayout({ eyebrow, title, description, children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-soft-grid">
      <GoogleOneTap />
      <div className="container flex min-h-screen items-center py-10">
        <div className="grid w-full gap-8 lg:grid-cols-[1.1fr,0.9fr] lg:items-center">
          <div className="hidden space-y-8 lg:block">
            <BrandLogo />
            <div className="max-w-xl space-y-4">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-secondary">{eyebrow}</p>
              <h1 className="text-5xl font-bold leading-tight">
                Make sense of every balance shift without losing your calm.
              </h1>
              <p className="text-base leading-7 text-muted-foreground">
                Moniilog is designed for clear capture, reliable local storage, and a
                polished money workflow that keeps working when your connection drops.
              </p>
            </div>
            <div className="grid max-w-xl gap-4 sm:grid-cols-2">
              <Card className="bg-card/80">
                <CardContent className="space-y-3 p-5">
                  <WalletCards className="size-5 text-primary" />
                  <h2 className="text-lg font-semibold">Local-first by design</h2>
                  <p className="text-sm text-muted-foreground">
                    Core ledger actions save into IndexedDB first, then sync safely when the browser is ready.
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-card/80">
                <CardContent className="space-y-3 p-5">
                  <WalletCards className="size-5 text-secondary" />
                  <h2 className="text-lg font-semibold">Clean personal finance UX</h2>
                  <p className="text-sm text-muted-foreground">
                    Thoughtful spacing, clear copy, and branded surfaces keep the product calm instead of noisy.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          <Card className="mx-auto w-full max-w-xl border-border/60 bg-card/92">
            <CardContent className="space-y-6 p-6 sm:p-8">
              <div className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-secondary">{eyebrow}</p>
                <h2 className="text-3xl font-bold">{title}</h2>
                <p className="text-sm leading-6 text-muted-foreground">{description}</p>
              </div>
              {children}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
