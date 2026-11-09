import { ArrowRightLeft, Bot, Download, LayoutDashboard, LineChart, Plus, ReceiptText, Settings2 } from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BrandLogo } from "@/components/navigation/brand-logo";
import { Button } from "@/components/ui/button";
import { AppTour } from "@/features/tutorials/app-tour";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/routes/route-constants";

// Mirrors the Flutter app's bottom navigation: Dashboard · History · Add (center)
// · Analytics · Settings. Transfers are reached from the Add screen and the sidebar.
const navigationItems = [
  {
    tKey: "nav.dashboard",
    icon: LayoutDashboard,
    to: ROUTES.dashboard
  },
  {
    tKey: "nav.transactions",
    icon: ReceiptText,
    to: ROUTES.transactions
  },
  {
    tKey: "nav.add",
    icon: Plus,
    to: ROUTES.addTransaction
  },
  {
    tKey: "nav.analytics",
    icon: LineChart,
    to: ROUTES.analytics
  },
  {
    tKey: "nav.chat",
    label: "Assistant",
    icon: Bot,
    to: ROUTES.chat
  },
  {
    tKey: "nav.settings",
    icon: Settings2,
    to: ROUTES.settings
  }
];

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <AppTour />
      <div className="mx-auto flex min-h-screen max-w-[1480px]">
        <aside className="hidden w-60 shrink-0 border-r border-border/70 bg-card/75 px-4 py-4 backdrop-blur lg:flex lg:flex-col">
          <BrandLogo />
          <div className="mt-5 rounded-xl bg-brand-gradient p-3.5 text-primary-foreground shadow-card">
            <p className="text-[11px] font-medium text-primary-foreground/80">Fast capture</p>
            <h2 className="mt-1 text-base font-bold leading-snug">Track what changed, even offline.</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-primary-foreground/85">
              Local-first entries keep your ledger useful in weak connectivity and ready to sync later.
            </p>
          </div>
          <nav className="mt-5 grid gap-1.5">
            {navigationItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-card"
                      : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
                  )
                }
              >
                <item.icon className="size-4" />
                {t(item.tKey)}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto grid gap-2 pt-4">
            <Button
              className="w-full"
              onClick={() => navigate(ROUTES.addTransaction, { state: { backgroundLocation: location } })}
            >
              <Plus className="size-4" />
              {t("nav.addTransaction")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => navigate(ROUTES.transfer)}
            >
              <ArrowRightLeft className="size-3.5" />
              {t("nav.transferMoney")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => navigate(ROUTES.exportData)}
            >
              <Download className="size-3.5" />
              {t("nav.exportData")}
            </Button>
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
            <div className="container flex h-14 items-center justify-between gap-4">
              <BrandLogo compact />
              <div className="hidden items-center gap-2.5 sm:flex">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(ROUTES.importData)}
                >
                  {t("nav.import")}
                </Button>
                <Button
                  size="sm"
                  onClick={() => navigate(ROUTES.addTransaction, { state: { backgroundLocation: location } })}
                >
                  <Plus className="size-4" />
                  {t("nav.addTransaction")}
                </Button>
              </div>
            </div>
          </header>

          <div className="container py-5 lg:py-6">
            <Outlet />
          </div>
        </main>
      </div>

      <nav className="fixed inset-x-4 bottom-4 z-40 rounded-2xl border border-border/80 bg-card/95 p-2 shadow-card backdrop-blur lg:hidden">
        <div className="grid grid-cols-5 gap-2">
          {navigationItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[11px] font-semibold transition-colors",
                  isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                )
              }
            >
              <item.icon className="size-4" />
              {t(item.tKey)}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
