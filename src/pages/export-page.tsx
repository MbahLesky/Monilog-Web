import { useState } from "react";
import { useLiveQuery } from "@/lib/live-query";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";
import { accountsRepository } from "@/db/repositories/accounts-repository";
import { auditRepository } from "@/db/repositories/audit-repository";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageShell } from "@/components/layout/page-shell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { csvExportService } from "@/services/csv-export-service";
import { pdfStatementService } from "@/services/pdf-statement-service";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import { trackEvent } from "@/services/telemetry-service";
import { useAuthStore } from "@/store/auth-store";
import { formatShortDate } from "@/utils/date-utils";

type StatementRangePreset = "all" | "30d" | "90d" | "ytd" | "custom";

export function ExportPage() {
  const exportHistory = useLiveQuery(() => auditRepository.listExports(), []);
  const accounts = useLiveQuery(() => accountsRepository.listActive(), []);
  const profile = useAuthStore((state) => state.profile);

  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [rangePreset, setRangePreset] = useState<StatementRangePreset>("all");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [exportingPdf, setExportingPdf] = useState(false);

  function resolveDateRange(): { startDate: string | null; endDate: string | null } {
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    if (rangePreset === "all") {
      return { startDate: null, endDate: null };
    }
    if (rangePreset === "30d") {
      const start = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      return { startDate: start, endDate: todayIso };
    }
    if (rangePreset === "90d") {
      const start = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      return { startDate: start, endDate: todayIso };
    }
    if (rangePreset === "ytd") {
      const start = `${today.getFullYear()}-01-01`;
      return { startDate: start, endDate: todayIso };
    }
    return {
      startDate: customStartDate || null,
      endDate: customEndDate || null
    };
  }

  async function handleExportPdfStatement() {
    setExportingPdf(true);
    try {
      const { startDate, endDate } = resolveDateRange();
      await pdfStatementService.exportBankStatement({
        holderName: profile?.name || profile?.email || "Moniilog Account Holder",
        accountIdFilter: selectedAccountId,
        startDate,
        endDate
      });
      toast.success("Financial statement PDF downloaded.");
      trackEvent(ANALYTICS_EVENTS.dataExported, { format: "pdf", dataset: "financial_statement" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to export PDF financial statement.");
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleExport() {
    try {
      await csvExportService.exportTransactions();
      toast.success("Transactions CSV downloaded.");
      trackEvent(ANALYTICS_EVENTS.dataExported, { format: "csv", dataset: "transactions" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to export data.");
    }
  }

  async function handleExportTransfers() {
    try {
      await csvExportService.exportTransfers();
      toast.success("Transfers CSV downloaded.");
      trackEvent(ANALYTICS_EVENTS.dataExported, { format: "csv", dataset: "transfers" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to export transfers.");
    }
  }

  return (
    <PageShell
      title="Export & Financial Statement"
      description="Generate an official financial statement PDF sheet or spreadsheet-friendly CSV backups of your transactions and transfers."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void handleExportPdfStatement()} disabled={exportingPdf}>
            <FileText className="size-4" />
            {exportingPdf ? "Generating PDF..." : "Export PDF Statement"}
          </Button>
          <Button variant="outline" onClick={() => void handleExport()}>
            <Download className="size-4" />
            Export transactions CSV
          </Button>
          <Button variant="outline" onClick={() => void handleExportTransfers()}>
            <Download className="size-4" />
            Export transfers CSV
          </Button>
        </div>
      }
    >
      <div className="grid gap-5 xl:grid-cols-[1.2fr,0.8fr]">
        <Card className="border-primary/25">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <FileText className="size-5" />
              </div>
              <div>
                <CardTitle>Financial Statement (PDF)</CardTitle>
                <CardDescription>
                  Generate a formatted A4 financial statement with opening/closing balances, total credits & debits, and a chronological running-balance ledger.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-sm font-semibold">Account Scope</label>
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Accounts</SelectItem>
                    {(accounts ?? []).map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-semibold">Statement Period</label>
                <Select
                  value={rangePreset}
                  onValueChange={(val) => setRangePreset(val as StatementRangePreset)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="30d">Last 30 Days</SelectItem>
                    <SelectItem value="90d">Last 90 Days</SelectItem>
                    <SelectItem value="ytd">This Year (YTD)</SelectItem>
                    <SelectItem value="custom">Custom Date Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {rangePreset === "custom" ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <label className="text-sm font-semibold">Start Date</label>
                  <Input
                    type="date"
                    value={customStartDate}
                    onChange={(event) => setCustomStartDate(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-semibold">End Date</label>
                  <Input
                    type="date"
                    value={customEndDate}
                    onChange={(event) => setCustomEndDate(event.target.value)}
                  />
                </div>
              </div>
            ) : null}

            <div className="pt-1">
              <Button onClick={() => void handleExportPdfStatement()} disabled={exportingPdf}>
                <FileText className="size-4" />
                {exportingPdf ? "Generating Financial Statement..." : "Download Financial Statement (PDF)"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
                <FileSpreadsheet className="size-5" />
              </div>
              <div>
                <CardTitle>CSV Spreadsheet Export</CardTitle>
                <CardDescription>
                  Interchangeable with the Moniilog mobile app and Excel / Google Sheets.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm leading-6 text-muted-foreground">
            <p>
              Transactions CSV columns: <code className="font-mono text-xs text-foreground">date, type, amount, category, account, note</code>.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void handleExport()}>
                <Download className="size-4" />
                Transactions CSV
              </Button>
              <Button variant="outline" onClick={() => void handleExportTransfers()}>
                <Download className="size-4" />
                Transfers CSV
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent exports</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {(exportHistory ?? []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/80 p-6 text-sm text-muted-foreground">
              No exports yet. Generate your first PDF financial statement or CSV backup when you are ready.
            </div>
          ) : (
            exportHistory?.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-xl border border-border/70 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <FileText className="size-4" />
                  </div>
                  <div>
                    <p className="font-semibold">{item.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.format.toUpperCase()} • {item.recordCount} records • {item.filtersApplied} • {formatShortDate(item.createdAt)}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
