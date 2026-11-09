import { Navigate, Outlet } from "react-router-dom";
import { ROUTES } from "@/routes/route-constants";
import { useAuthStore } from "@/store/auth-store";
import { useOnboardingStatus } from "@/routes/use-onboarding-status";
import { SessionRestorePage } from "@/pages/session-restore-page";

export function AuthRoute() {
  const status = useAuthStore((state) => state.status);
  const isGuest = useAuthStore((state) => state.isGuest);
  const { loading, complete } = useOnboardingStatus();

  if (status === "checking" || loading) {
    return <SessionRestorePage />;
  }

  if (status === "signed_in" || isGuest) {
    return <Navigate to={complete ? ROUTES.dashboard : ROUTES.onboardingCurrency} replace />;
  }

  return <Outlet />;
}
