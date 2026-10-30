import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileUp } from "lucide-react";
import { csvImportService, type ImportPreview } from "@/services/csv-import-service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { accountsRepository } from "@/db/repositories/accounts-repository";
import { categoriesRepository } from "@/db/repositories/categories-repository";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import { trackEvent } from "@/services/telemetry-service";
import { useLiveQuery } from "dexie-react-hooks";
import type { ImportMappingChoice } from "@/types";

interface ImportWorkspaceProps {
  userId?: string | null;
  continueLabel?: string;
  continueTo?: string;
}

export function ImportWorkspace({
  userId,
  continueLabel = "Continue",
  continueTo
}: ImportWorkspaceProps) {
  const navigate = useNavigate();
  const accounts = useLiveQuery(() => accountsRepository.listActive(), []);
  const categories = useLiveQuery(() => categoriesRepository.listActive(), []);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileName, setFileName] = useState("");
  const [accountMappings, setAccountMappings] = useState<ImportMappingChoice[]>([]);
  const [categoryMappings, setCategoryMappings] = useState<ImportMappingChoice[]>([]);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const accountOptions = accounts ?? [];
  const categoryOptions = categories ?? [];

  const validRowsCount = preview?.validRows.length ?? 0;
  const invalidRowsCount = preview?.invalidRows.length ?? 0;

  const blankCategoryRows = useMemo(
    () =>
      categoryMappings.filter((mapping) => mapping.sourceName.length === 0 && !mapping.targetId).length,
    [categoryMappings]
  );

  async function handleFileChange(file?: File | null) {
    if (!file) {
      return;
    }

    try {
      const nextPreview = await csvImportService.parseFile(file);
      setPreview(nextPreview);
      setFileName(file.name);
      setAccountMappings(nextPreview.accountMappings);
      setCategoryMappings(nextPreview.categoryMappings);
      setResultMessage(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to parse this file.");
    }
  }

  async function confirmImport() {
    if (!preview) {
      return;
    }

    if (blankCategoryRows > 0) {
      toast.error("Map blank categories to an existing category before importing.");
      return;
    }

    setIsImporting(true);

    try {
      const result = await csvImportService.commitImport({
        fileName,
        preview,
        accountMappings,
        categoryMappings,
        userId
      });

      setResultMessage(
        `${result.successfulRecords} row${result.successfulRecords === 1 ? "" : "s"} imported. ${result.errorSummary}`.trim()
      );
      toast.success("Import completed.");
      trackEvent(ANALYTICS_EVENTS.dataImported, {
        format: "csv",
        rows_imported: result.successfulRecords,
        rows_failed: result.failedRecords
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="page-grid">
      <Card>
        <CardHeader>
          <CardTitle>Import existing records</CardTitle>
          <CardDescription>
            Choose a CSV file, preview the rows safely, then confirm only after the account and category mappings look right.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/80 bg-card px-6 py-10 text-center hover:border-primary/40 hover:bg-primary/5">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <FileUp className="size-5" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold">Choose CSV file</p>
              <p className="text-sm text-muted-foreground">
                Required columns: date, type, amount, account. Optional: category, note.
              </p>
            </div>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => void handleFileChange(event.target.files?.[0])}
            />
          </label>

          {preview ? (
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="bg-primary/5">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Valid rows</p>
                  <p className="mt-2 text-3xl font-bold">{validRowsCount}</p>
                </CardContent>
              </Card>
              <Card className="bg-accent/5">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Invalid rows</p>
                  <p className="mt-2 text-3xl font-bold">{invalidRowsCount}</p>
                </CardContent>
              </Card>
              <Card className="bg-secondary/5">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Detected columns</p>
                  <p className="mt-2 text-sm font-semibold">{preview.headers.join(", ")}</p>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {preview ? (
        <div className="grid gap-5 xl:grid-cols-[1fr,1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Account mapping</CardTitle>
              <CardDescription>
                Existing names match automatically. Unknown account names default to create new.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {accountMappings.map((mapping, index) => (
                <div key={`${mapping.sourceName}-${index}`} className="grid gap-3 rounded-xl border border-border/70 p-4 md:grid-cols-[1fr,1.4fr] md:items-center">
                  <div>
                    <p className="font-semibold">{mapping.sourceName}</p>
                    <p className="text-xs text-muted-foreground">Source account</p>
                  </div>
                  <Select
                    value={mapping.createNew ? "__create__" : mapping.targetId ?? "__create__"}
                    onValueChange={(value) =>
                      setAccountMappings((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                targetId: value === "__create__" ? undefined : value,
                                createNew: value === "__create__"
                              }
                            : item
                        )
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__create__">Create new account</SelectItem>
                      {accountOptions.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Category mapping</CardTitle>
              <CardDescription>
                Blank categories must map to an existing category before the import can continue.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {categoryMappings.map((mapping, index) => {
                const options = categoryOptions.filter((category) => category.type === mapping.targetType);
                return (
                  <div key={`${mapping.targetType}-${mapping.sourceName}-${index}`} className="grid gap-3 rounded-xl border border-border/70 p-4 md:grid-cols-[1fr,1.4fr] md:items-center">
                    <div>
                      <p className="font-semibold">{mapping.sourceName || "Blank category"}</p>
                      <p className="text-xs text-muted-foreground capitalize">{mapping.targetType}</p>
                    </div>
                    <Select
                      value={mapping.createNew ? "__create__" : mapping.targetId ?? "__create__"}
                      onValueChange={(value) =>
                        setCategoryMappings((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  targetId: value === "__create__" ? undefined : value,
                                  createNew: value === "__create__"
                                }
                              : item
                          )
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {mapping.sourceName.length > 0 ? (
                          <SelectItem value="__create__">Create new category</SelectItem>
                        ) : null}
                        {options.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {preview?.invalidRows.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Validation issues</CardTitle>
            <CardDescription>
              Invalid rows stay visible and skippable. Moniilog never saves malformed rows silently.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Issue</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.invalidRows.slice(0, 12).map((row) => (
                  <TableRow key={`${row.rowNumber}-${row.reason}`}>
                    <TableCell className="font-semibold">{row.rowNumber}</TableCell>
                    <TableCell>{row.reason}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {Object.values(row.raw).filter(Boolean).join(" | ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {preview ? (
        <Card>
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              {resultMessage ? (
                <p className="inline-flex items-center gap-2 rounded-full bg-secondary/10 px-3 py-1 text-sm font-medium text-secondary">
                  <CheckCircle2 className="size-4" />
                  {resultMessage}
                </p>
              ) : (
                <p className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-sm font-medium text-accent">
                  <AlertTriangle className="size-4" />
                  Review the mappings before importing.
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Valid rows will import into IndexedDB immediately, then follow the normal sync path later.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="outline" onClick={() => setPreview(null)}>
                Clear preview
              </Button>
              {resultMessage && continueTo ? (
                <Button onClick={() => navigate(continueTo)}>{continueLabel}</Button>
              ) : (
                <Button onClick={() => void confirmImport()} isLoading={isImporting}>
                  Confirm import
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
