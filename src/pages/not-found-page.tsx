import { useNavigate } from "react-router-dom";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/data-display/empty-state";

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="container py-12">
      <EmptyState
        icon={Compass}
        title="That page is not part of this flow"
        description="The route you opened does not match the current Moniilog web flow. Return to the dashboard or continue with onboarding if your setup is still in progress."
        actionLabel="Go to dashboard"
        onAction={() => navigate("/dashboard")}
      />
    </div>
  );
}
