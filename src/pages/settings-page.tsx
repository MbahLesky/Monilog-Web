import { useEffect, useState, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageShell } from "@/components/layout/page-shell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { accountsRepository } from "@/db/repositories/accounts-repository";
import { categoriesRepository } from "@/db/repositories/categories-repository";
import { settingsRepository } from "@/db/repositories/settings-repository";
import { workspaceRepository } from "@/db/repositories/workspace-repository";
import { jsonBackupService } from "@/services/json-backup-service";
import { SUPPORTED_CURRENCIES } from "@/lib/constants";
import { supabase } from "@/lib/supabase-client";
import { ROUTES } from "@/routes/route-constants";
import { useAuthStore } from "@/store/auth-store";
import { useUiStore } from "@/store/ui-store";
import type { AccountType, AppLanguage, TransactionType } from "@/types";

export function SettingsPage() {
  const navigate = useNavigate();
  const profile = useAuthStore((state) => state.profile);
  const signOut = useAuthStore((state) => state.signOut);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const settings = useLiveQuery(() => settingsRepository.getSettings(), []);
  const reminderPreferences = useLiveQuery(() => settingsRepository.getNotificationPreferences(), []);
  const accounts = useLiveQuery(() => accountsRepository.listActive(), []);
  const categories = useLiveQuery(() => categoriesRepository.listActive(), []);
  const setThemeMode = useUiStore((state) => state.setThemeMode);
  const startTour = useUiStore((state) => state.startTour);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  const [accountBalances, setAccountBalances] = useState<Record<string, string>>({});
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountType, setNewAccountType] = useState<AccountType>("other");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryType, setNewCategoryType] = useState<TransactionType>("expense");
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [linkCodeLoading, setLinkCodeLoading] = useState(false);

  useEffect(() => {
    if (!accounts) {
      return;
    }

    setAccountBalances(
      Object.fromEntries(accounts.map((account) => [account.id, account.openingBalance.toString()]))
    );
  }, [accounts]);

  async function handleCurrencyChange(currencyCode: string) {
    await settingsRepository.setCurrency(currencyCode);
    toast.success("Currency updated.");
  }

  async function handleThemeChange(themeMode: "light" | "dark" | "system") {
    await settingsRepository.setThemeMode(themeMode);
    setThemeMode(themeMode);
    toast.success("Theme preference saved.");
  }

  async function handleLanguageChange(language: AppLanguage) {
    await settingsRepository.setLanguage(language);
    toast.success("Language updated.");
  }

  async function handleCreateBackup() {
    try {
      await jsonBackupService.createBackup(profile?.name ?? "");
      toast.success("Backup downloaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create the backup.");
    }
  }

  async function handleRestoreBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    try {
      const content = await file.text();
      await jsonBackupService.restoreBackup(content, userId);
      toast.success("Backup restored.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to restore the backup.");
    }
  }

  async function handleSaveBalances() {
    await accountsRepository.saveOpeningBalances(
      Object.entries(accountBalances).map(([id, balance]) => ({
        id,
        balance: Number(balance || 0)
      }))
    );

    toast.success("Opening balances saved.");
  }

  async function handleAddAccount() {
    if (!newAccountName.trim()) {
      toast.error("Enter a name for the new account.");
      return;
    }

    await accountsRepository.createAccount({
      name: newAccountName,
      type: newAccountType,
      openingBalance: 0,
      userId
    });

    setNewAccountName("");
    setNewAccountType("other");
    toast.success("Custom account added.");
  }

  async function handleAddCategory() {
    if (!newCategoryName.trim()) {
      toast.error("Enter a name for the new category.");
      return;
    }

    await categoriesRepository.createCategory({
      name: newCategoryName,
      type: newCategoryType,
      userId
    });

    setNewCategoryName("");
    setNewCategoryType("expense");
    toast.success("Custom category added.");
  }

  async function handleGenerateLinkCode() {
    if (!supabase || !userId) {
      toast.error("Database connection unavailable.");
      return;
    }
    setLinkCodeLoading(true);
    try {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const { error } = await supabase.from("phone_link_codes").insert({
        user_id: userId,
        code,
        expires_at: expiresAt
      });
      if (error) throw error;
      setLinkCode(code);
      toast.success("Link code generated. Valid for 15 minutes.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate link code.");
    } finally {
      setLinkCodeLoading(false);
    }
  }

  async function handleReset() {
    await workspaceRepository.resetAppData();
    toast.success("App data reset. Onboarding is starting over.");
    navigate(ROUTES.onboardingCurrency);
  }

  async function handleSignOut() {
    await signOut();
    navigate(ROUTES.login);
  }

  return (
    <PageShell
      title="Settings"
      description="Manage your profile, currency, theme, accounts, reminders, categories, data portability, and reset flow in one place."
    >
      <div className="grid gap-5 xl:grid-cols-[1fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Profile and session</CardTitle>
            <CardDescription>
              Your profile is synced across all Moniilog surfaces.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="rounded-xl border border-border/70 p-4">
              <p className="text-sm text-muted-foreground">Name</p>
              <p className="mt-1 font-semibold">{profile?.name || "Not set"}</p>
            </div>
            <div className="rounded-xl border border-border/70 p-4">
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="mt-1 font-semibold">{profile?.email || "Unavailable"}</p>
            </div>
            <div className="rounded-xl border border-border/70 p-4">
              <p className="text-sm text-muted-foreground">Phone Number</p>
              <p className="mt-1 font-semibold">{profile?.phoneNumber || "Not connected"}</p>
            </div>
            <Button variant="outline" onClick={() => void handleSignOut()}>
              Log out
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
            <CardDescription>Currency stays consistent across dashboard, transactions, analytics, and balances.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-2">
              <label className="text-sm font-semibold">Currency</label>
              <Select value={settings?.currencyCode ?? "XAF"} onValueChange={(value) => void handleCurrencyChange(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                      {currency.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-semibold">Language</label>
              <Select
                value={settings?.language ?? "en"}
                onValueChange={(value) => void handleLanguageChange(value as AppLanguage)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="fr">Français</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-semibold">Theme</label>
              <Select
                value={settings?.themeMode ?? "system"}
                onValueChange={(value) => void handleThemeChange(value as "light" | "dark" | "system")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/20 bg-gradient-to-br from-card to-primary/5">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <MessageSquare className="size-5" />
            </div>
            <div>
              <CardTitle>WhatsApp Assistant</CardTitle>
              <CardDescription>
                Track expenses, income, and check balances on WhatsApp without opening an app.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {profile?.phoneNumber ? (
            <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <div>
                <p className="font-semibold text-emerald-700 dark:text-emerald-300">WhatsApp Linked</p>
                <p className="text-sm text-muted-foreground">Connected to {profile.phoneNumber}</p>
              </div>
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                Active
              </span>
            </div>
          ) : (
            <div className="grid gap-3">
              <p className="text-sm text-muted-foreground">
                To link your WhatsApp number, generate a 6-digit code and reply to the Moniilog WhatsApp bot with: <strong className="text-foreground">LINK &lt;code&gt;</strong>.
              </p>
              {linkCode ? (
                <div className="rounded-xl border border-primary/30 bg-primary/10 p-5 text-center">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Your 6-Digit Linking Code</p>
                  <p className="my-2 font-mono text-3xl font-extrabold tracking-widest text-primary">{linkCode}</p>
                  <p className="text-xs text-muted-foreground">
                    Send <span className="font-mono font-semibold text-foreground">LINK {linkCode}</span> to the bot. Code expires in 15 minutes.
                  </p>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-fit"
                  onClick={() => void handleGenerateLinkCode()}
                  disabled={linkCodeLoading || !userId}
                >
                  {linkCodeLoading ? "Generating..." : "Generate WhatsApp Link Code"}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Reminders</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center justify-between rounded-xl border border-border/70 p-4">
              <div>
                <p className="font-semibold">Daily reminder</p>
                <p className="text-sm text-muted-foreground">Persist the preference even where browser delivery varies.</p>
              </div>
              <Switch
                checked={reminderPreferences?.enabled ?? false}
                onCheckedChange={(enabled) =>
                  void settingsRepository.updateNotificationPreferences({
                    enabled
                  })
                }
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-semibold">Reminder time</label>
              <Input
                type="time"
                value={reminderPreferences?.reminderTime ?? "20:00"}
                disabled={!reminderPreferences?.enabled}
                onChange={(event) =>
                  void settingsRepository.updateNotificationPreferences({
                    reminderTime: event.target.value
                  })
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Portability</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button variant="outline" onClick={() => navigate(ROUTES.importData)}>
              Import data
            </Button>
            <Button variant="outline" onClick={() => navigate(ROUTES.exportData)}>
              Export data
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Backup and restore</CardTitle>
            <CardDescription>
              Export a JSON backup of your whole ledger, or restore one. Backups are interchangeable with the Moniilog mobile app.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button variant="outline" onClick={() => void handleCreateBackup()}>
              Create backup
            </Button>
            <Button variant="outline" onClick={() => restoreInputRef.current?.click()}>
              Restore backup
            </Button>
            <input
              ref={restoreInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => void handleRestoreBackup(event)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Guided tour</CardTitle>
            <CardDescription>Replay the walkthrough of Moniilog's main features any time.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => startTour()}>
              Replay app tour
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Accounts and balances</CardTitle>
          <CardDescription>
            Cash and Bank stay available. Custom accounts can be added or archived later.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {(accounts ?? []).map((account) => (
            <div key={account.id} className="grid gap-3 rounded-xl border border-border/70 p-4 md:grid-cols-[1fr,180px,auto] md:items-end">
              <div>
                <p className="font-semibold">{account.name}</p>
                <p className="text-xs capitalize text-muted-foreground">{account.type.replace("_", " ")}</p>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-semibold">Opening balance</label>
                <Input
                  type="number"
                  step="0.01"
                  value={accountBalances[account.id] ?? "0"}
                  onChange={(event) =>
                    setAccountBalances((current) => ({
                      ...current,
                      [account.id]: event.target.value
                    }))
                  }
                />
              </div>
              {!account.isDefault ? (
                <Button variant="ghost" onClick={() => void accountsRepository.softDelete(account.id)}>
                  Archive
                </Button>
              ) : (
                <div />
              )}
            </div>
          ))}

          <div className="grid gap-4 rounded-xl border border-dashed border-border/80 p-4 md:grid-cols-[1fr,180px,auto] md:items-end">
            <div className="grid gap-2">
              <label className="text-sm font-semibold">New account name</label>
              <Input value={newAccountName} onChange={(event) => setNewAccountName(event.target.value)} placeholder="e.g. Savings" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-semibold">Type</label>
              <Select value={newAccountType} onValueChange={(value) => setNewAccountType(value as AccountType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="other">Other</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank">Bank</SelectItem>
                  <SelectItem value="mobile_money">Mobile Money</SelectItem>
                  <SelectItem value="wallet">Wallet</SelectItem>
                  <SelectItem value="savings">Savings</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => void handleAddAccount()}>Add account</Button>
          </div>

          <Button variant="secondary" onClick={() => void handleSaveBalances()}>
            Save balances
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Category management</CardTitle>
          <CardDescription>
            System categories stay available, while custom categories can be added or removed.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            {(categories ?? []).map((category) => (
              <div key={category.id} className="flex items-center justify-between rounded-xl border border-border/70 p-4">
                <div>
                  <p className="font-semibold">{category.name}</p>
                  <p className="text-xs capitalize text-muted-foreground">{category.type}</p>
                </div>
                {!category.isDefault ? (
                  <Button variant="ghost" onClick={() => void categoriesRepository.softDelete(category.id)}>
                    Remove
                  </Button>
                ) : null}
              </div>
            ))}
          </div>

          <div className="grid gap-4 rounded-xl border border-dashed border-border/80 p-4 md:grid-cols-[1fr,180px,auto] md:items-end">
            <div className="grid gap-2">
              <label className="text-sm font-semibold">New category</label>
              <Input
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                placeholder="e.g. Transport"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-semibold">Type</label>
              <Select value={newCategoryType} onValueChange={(value) => setNewCategoryType(value as TransactionType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => void handleAddCategory()}>Add category</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-accent/20">
        <CardHeader>
          <CardTitle>Reset app data</CardTitle>
          <CardDescription>
            This clears the local workspace, reseeds system defaults, and restarts onboarding.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="accent">Reset app data</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset local app data?</AlertDialogTitle>
                <AlertDialogDescription>
                  This clears transactions, categories, accounts, reminders, import/export history, and sync metadata in this browser. System defaults will be re-created and onboarding will restart.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void handleReset()}>Reset</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </PageShell>
  );
}
