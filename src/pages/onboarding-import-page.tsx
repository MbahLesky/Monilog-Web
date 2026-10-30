import { PageShell } from "@/components/layout/page-shell";
import { ImportWorkspace } from "@/features/import-export/import-workspace";
import { ROUTES } from "@/routes/route-constants";
import { useAuthStore } from "@/store/auth-store";

export function OnboardingImportPage() {
  const userId = useAuthStore((state) => state.user?.id ?? null);

  return (
    <div className="container py-10">
      <PageShell
        title="Import Existing Records"
        description="Preview, validate, and map CSV rows before they become part of your local ledger."
      >
        <ImportWorkspace userId={userId} continueLabel="Continue setup" continueTo={ROUTES.onboardingBalances} />
      </PageShell>
    </div>
  );
}

