import type { TransactionType } from "@/types/common";

export interface ImportRecord {
  id: string;
  fileName: string;
  format: "csv";
  totalRecords: number;
  successfulRecords: number;
  failedRecords: number;
  status: "success" | "partial" | "failed";
  errorSummary: string;
  createdAt: string;
}

export interface ExportRecord {
  id: string;
  format: "csv" | "pdf";
  recordCount: number;
  filtersApplied: string;
  fileName: string;
  createdAt: string;
}

export interface ParsedImportRow {
  date: string;
  type: TransactionType;
  amount: number;
  account: string;
  category: string;
  note: string;
  rowNumber: number;
}

export interface InvalidImportRow {
  rowNumber: number;
  reason: string;
  raw: Record<string, string>;
}

export interface ImportMappingChoice {
  sourceName: string;
  targetId?: string;
  createNew: boolean;
  targetType?: TransactionType;
}

