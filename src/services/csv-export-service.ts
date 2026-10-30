import Papa from "papaparse";
import { auditRepository } from "@/db/repositories/audit-repository";
import { transactionsRepository } from "@/db/repositories/transactions-repository";
import { transfersRepository } from "@/db/repositories/transfers-repository";
import type { ExportRecord } from "@/types";
import { createId } from "@/utils/id";
import { nowIso } from "@/utils/date-utils";

function downloadFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fileName);
  link.click();
  URL.revokeObjectURL(url);
}

export const csvExportService = {
  async exportTransactions() {
    const rows = await transactionsRepository.listWithRelations();
    // Column order mirrors the Flutter app's CSV so files are interchangeable.
    const records = rows.map((row) => ({
      date: row.transactionDate.slice(0, 10),
      type: row.type,
      amount: row.amount,
      category: row.categoryName,
      account: row.accountName,
      note: row.description
    }));

    const csv = Papa.unparse(records, {
      columns: ["date", "type", "amount", "category", "account", "note"]
    });

    const fileName = `moniilog_transactions_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadFile(fileName, csv);

    const record: ExportRecord = {
      id: createId("export"),
      format: "csv",
      recordCount: rows.length,
      filtersApplied: "all",
      fileName,
      createdAt: nowIso()
    };

    await auditRepository.addExportRecord(record);
    return record;
  },

  async exportTransfers() {
    const rows = await transfersRepository.listWithRelations();
    // Matches the app's transfer CSV schema.
    const records = rows.map((row) => ({
      date: row.transferDate.slice(0, 10),
      type: "transfer",
      from_account: row.fromAccountName,
      to_account: row.toAccountName,
      amount: row.amount,
      fee: row.fee,
      note: row.description
    }));

    const csv = Papa.unparse(records, {
      columns: ["date", "type", "from_account", "to_account", "amount", "fee", "note"]
    });

    const fileName = `moniilog_transfers_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadFile(fileName, csv);

    const record: ExportRecord = {
      id: createId("export"),
      format: "csv",
      recordCount: rows.length,
      filtersApplied: "all",
      fileName,
      createdAt: nowIso()
    };

    await auditRepository.addExportRecord(record);
    return record;
  }
};
