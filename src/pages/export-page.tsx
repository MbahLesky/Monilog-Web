import { useLiveQuery } from "dexie-react-hooks";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { auditRepository } from "@/db/repositories/audit-repository";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageShell } from "@/components/layout/page-shell";
import { csvExportService } from "@/services/csv-export-service";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import { trackEvent } from "@/services/telemetry-service";
import { formatShortDate } from "@/utils/date-utils";

export function ExportPage() {
  const exportHistory = useLiveQuery(() => auditRepository.listExports(), []);

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
      title="Export data"
      description="Generate spreadsheet-friendly CSV backups of the transactions and transfers stored in this local workspace."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void handleExport()}>
            <Download className="size-4" />
            Export transactions
          </Button>
          <Button variant="outline" onClick={() => void handleExportTransfers()}>
            <Download className="size-4" />
            Export transfers
          </Button>
        </div>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>CSV export</CardTitle>
          <CardDescription>
            The exported column order is date, type, amount, category, account, note.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-muted-foreground">
          Exports read from IndexedDB, download through the browser, and write only to the local export history.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent exports</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {(exportHistory ?? []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/80 p-6 text-sm text-muted-foreground">
              No exports yet. Generate your first CSV backup when you are ready.
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
                      {item.recordCount} records • {formatShortDate(item.createdAt)}
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
