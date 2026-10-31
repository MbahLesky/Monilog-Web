import { RouterProvider, createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { AddTransactionPage } from "@/pages/add-transaction-page";
import { AnalyticsPage } from "@/pages/analytics-page";
import { ChatAssistantPage } from "@/pages/chat-page";
import { DashboardPage } from "@/pages/dashboard-page";
import { ExportPage } from "@/pages/export-page";
import { ImportPage } from "@/pages/import-page";
import { LoginPage } from "@/pages/login-page";
import { NotFoundPage } from "@/pages/not-found-page";
import { OnboardingBalancesPage } from "@/pages/onboarding-balances-page";
import { OnboardingCurrencyPage } from "@/pages/onboarding-currency-page";
import { OnboardingImportPage } from "@/pages/onboarding-import-page";
import { OnboardingReminderPage } from "@/pages/onboarding-reminder-page";
import { RegisterPage } from "@/pages/register-page";
import { SettingsPage } from "@/pages/settings-page";
import { TransferPage } from "@/pages/transfer-page";
import { TransactionsPage } from "@/pages/transactions-page";
import { AuthRoute } from "@/routes/auth-route";
import { OnboardingRoute } from "@/routes/onboarding-route";
import { ProtectedRoute } from "@/routes/protected-route";
import { RootRedirect } from "@/routes/root-redirect";
import { RouteAnalytics } from "@/routes/route-analytics";
import { ROUTES } from "@/routes/route-constants";

// Every route sits under the pathless RouteAnalytics layout so client-side
// navigations are reported as page views.
const router = createBrowserRouter([
  {
    element: <RouteAnalytics />,
    children: [
      {
        path: ROUTES.root,
        element: <RootRedirect />
      },
      {
        element: <AuthRoute />,
        children: [
          {
            path: ROUTES.login,
            element: <LoginPage />
          },
          {
            path: ROUTES.register,
            element: <RegisterPage />
          }
        ]
      },
      {
        element: <OnboardingRoute />,
        children: [
          {
            path: ROUTES.onboardingCurrency,
            element: <OnboardingCurrencyPage />
          },
          {
            path: ROUTES.onboardingImport,
            element: <OnboardingImportPage />
          },
          {
            path: ROUTES.onboardingBalances,
            element: <OnboardingBalancesPage />
          },
          {
            path: ROUTES.onboardingReminder,
            element: <OnboardingReminderPage />
          }
        ]
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppShell />,
            children: [
              {
                path: ROUTES.dashboard,
                element: <DashboardPage />
              },
              {
                path: ROUTES.transactions,
                element: <TransactionsPage />
              },
              {
                path: ROUTES.addTransaction,
                element: <AddTransactionPage />
              },
              {
                path: ROUTES.transfer,
                element: <TransferPage />
              },
              {
                path: ROUTES.analytics,
                element: <AnalyticsPage />
              },
              {
                path: ROUTES.chat,
                element: <ChatAssistantPage />
              },
              {
                path: ROUTES.settings,
                element: <SettingsPage />
              },
              {
                path: ROUTES.importData,
                element: <ImportPage />
              },
              {
                path: ROUTES.exportData,
                element: <ExportPage />
              }
            ]
          }
        ]
      },
      {
        path: "*",
        element: <NotFoundPage />
      }
    ]
  }
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
