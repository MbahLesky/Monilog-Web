import { PageShell } from "@/components/layout/page-shell";
import { ImportWorkspace } from "@/features/import-export/import-workspace";
import { useAuthStore } from "@/store/auth-store";

export function ImportPage() {
  const userId = useAuthStore((state) => state.user?.id ?? null);

  return (
    <PageShell
      title="Import data"
      description="Bring in historical CSV records without silently saving malformed rows."
    >
      <ImportWorkspace userId={userId} />
    </PageShell>
  );
}

