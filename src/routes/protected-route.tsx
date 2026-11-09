import { Navigate, Outlet } from "react-router-dom";
import { ROUTES } from "@/routes/route-constants";
import { useAuthStore } from "@/store/auth-store";
import { useOnboardingStatus } from "@/routes/use-onboarding-status";
import { SessionRestorePage } from "@/pages/session-restore-page";

export function ProtectedRoute() {
  const status = useAuthStore((state) => state.status);
  const isGuest = useAuthStore((state) => state.isGuest);
  const { loading, complete } = useOnboardingStatus();

  if (status === "checking" || loading) {
    return <SessionRestorePage />;
  }

  if (status !== "signed_in" && !isGuest) {
    return <Navigate to={ROUTES.login} replace />;
  }

  if (!complete) {
    return <Navigate to={ROUTES.onboardingCurrency} replace />;
  }

  return <Outlet />;
}
