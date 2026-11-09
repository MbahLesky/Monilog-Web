import { accountsRepository } from "@/db/repositories/accounts-repository";
import { auditRepository } from "@/db/repositories/audit-repository";
import { settingsRepository } from "@/db/repositories/settings-repository";
import { transactionsRepository } from "@/db/repositories/transactions-repository";
import { transfersRepository } from "@/db/repositories/transfers-repository";
import type { ExportRecord } from "@/types";
import { formatShortDate, nowIso } from "@/utils/date-utils";
import { formatCurrency } from "@/utils/formatting";
import { createId } from "@/utils/id";

export interface PdfStatementOptions {
  holderName?: string;
  accountIdFilter?: string | null;
  startDate?: string | null; // YYYY-MM-DD
  endDate?: string | null; // YYYY-MM-DD
}

interface StatementLineItem {
  date: string;
  description: string;
  categoryOrChannel: string;
  accountName: string;
  typeLabel: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

function truncateText(value: string, maxLen: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 2)}..`;
}

function sanitizePdfText(input: string): string {
  const ascii = input
    .replace(/•/g, "-")
    .replace(/—/g, "-")
    .replace(/–/g, "-")
    .replace(/→/g, "->")
    .replace(/€/g, "EUR ")
    .replace(/£/g, "GBP ")
    .replace(/₦/g, "NGN ")
    .replace(/[^\x20-\x7E]/g, "");
  return ascii
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function drawText(
  lines: string[],
  text: string,
  x: number,
  y: number,
  font: "F1" | "F2" = "F1",
  size = 10
) {
  const safe = sanitizePdfText(text);
  lines.push(`BT /${font} ${size} Tf ${x} ${y} Td (${safe}) Tj ET`);
}

function assemblePdfString(pageStreams: string[]): string {
  const objects: string[] = [];

  // 1: Catalog
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  // 2: Pages placeholder
  objects.push("");
  // 3: Font Helvetica (F1)
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  // 4: Font Helvetica-Bold (F2)
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  const pageObjectIds: number[] = [];
  for (const stream of pageStreams) {
    const contentObjId = objects.length + 1;
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);

    const pageObjId = objects.length + 1;
    pageObjectIds.push(pageObjId);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjId} 0 R >>`
    );
  }

  const kidsRefs = pageObjectIds.map((id) => `${id} 0 R`).join(" ");
  objects[1] = `<< /Type /Pages /Kids [${kidsRefs}] /Count ${pageObjectIds.length} >>`;

  let pdfContent = "%PDF-1.4\n";
  const offsets: number[] = [0];

  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdfContent.length);
    pdfContent += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = pdfContent.length;
  pdfContent += `xref\n0 ${objects.length + 1}\n`;
  pdfContent += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    pdfContent += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdfContent += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return pdfContent;
}

export const pdfStatementService = {
  async exportBankStatement(options: PdfStatementOptions = {}) {
    const [settings, accountsWithBalances, transactions, transfers] = await Promise.all([
      settingsRepository.getSettings(),
      accountsRepository.listWithBalances(),
      transactionsRepository.listWithRelations(),
      transfersRepository.listWithRelations()
    ]);

    const currencyCode = settings?.currencyCode ?? "XAF";
    const accountIdFilter =
      options.accountIdFilter && options.accountIdFilter !== "all"
        ? options.accountIdFilter
        : null;
    const startDate = options.startDate || null;
    const endDate = options.endDate || null;

    const filteredAccounts = accountIdFilter
      ? accountsWithBalances.filter((a) => a.id === accountIdFilter)
      : accountsWithBalances;

    const filteredTx = transactions.filter((tx) => {
      const txDay = tx.transactionDate.slice(0, 10);
      if (accountIdFilter && tx.accountId !== accountIdFilter) return false;
      if (startDate && txDay < startDate) return false;
      if (endDate && txDay > endDate) return false;
      return true;
    });

    const filteredTransfers = transfers.filter((tf) => {
      const tfDay = tf.transferDate.slice(0, 10);
      if (
        accountIdFilter &&
        tf.fromAccountId !== accountIdFilter &&
        tf.toAccountId !== accountIdFilter
      ) {
        return false;
      }
      if (startDate && tfDay < startDate) return false;
      if (endDate && tfDay > endDate) return false;
      return true;
    });

    const openingBalance = filteredAccounts.reduce(
      (sum, a) => sum + a.openingBalance,
      0
    );
    const closingBalance = filteredAccounts.reduce(
      (sum, a) => sum + a.currentBalance,
      0
    );

    let totalCredits = 0;
    let totalDebits = 0;

    const rawEvents: Array<{
      date: string;
      description: string;
      category: string;
      account: string;
      type: string;
      debit: number;
      credit: number;
    }> = [];

    for (const tx of filteredTx) {
      const isIncome = tx.type === "income";
      if (isIncome) {
        totalCredits += tx.amount;
      } else {
        totalDebits += tx.amount;
      }
      rawEvents.push({
        date: tx.transactionDate,
        description: tx.description || tx.categoryName,
        category: tx.categoryName,
        account: tx.accountName,
        type: isIncome ? "CREDIT" : "DEBIT",
        debit: isIncome ? 0 : tx.amount,
        credit: isIncome ? tx.amount : 0
      });
    }

    for (const tf of filteredTransfers) {
      if (!accountIdFilter) {
        if (tf.fee > 0) {
          totalDebits += tf.fee;
        }
        rawEvents.push({
          date: tf.transferDate,
          description:
            tf.description || `Transfer ${tf.fromAccountName} -> ${tf.toAccountName}`,
          category: "Transfer",
          account: `${tf.fromAccountName} -> ${tf.toAccountName}`,
          type: "TRANSFER",
          debit: tf.fee,
          credit: 0
        });
      } else if (tf.fromAccountId === accountIdFilter) {
        const outAmount = tf.amount + tf.fee;
        totalDebits += outAmount;
        rawEvents.push({
          date: tf.transferDate,
          description: tf.description || `Transfer to ${tf.toAccountName}`,
          category: "Transfer Out",
          account: tf.fromAccountName,
          type: "TRF OUT",
          debit: outAmount,
          credit: 0
        });
      } else if (tf.toAccountId === accountIdFilter) {
        totalCredits += tf.amount;
        rawEvents.push({
          date: tf.transferDate,
          description: tf.description || `Transfer from ${tf.fromAccountName}`,
          category: "Transfer In",
          account: tf.toAccountName,
          type: "TRF IN",
          debit: 0,
          credit: tf.amount
        });
      }
    }

    rawEvents.sort((a, b) => a.date.localeCompare(b.date));

    let running = openingBalance;
    const chronological: StatementLineItem[] = rawEvents.map((ev) => {
      running = running + ev.credit - ev.debit;
      return {
        date: ev.date,
        description: ev.description,
        categoryOrChannel: ev.category,
        accountName: ev.account,
        typeLabel: ev.type,
        debit: ev.debit,
        credit: ev.credit,
        runningBalance: running
      };
    });

    const items = chronological.reverse();

    const periodLabel =
      startDate && endDate
        ? `${startDate} to ${endDate}`
        : startDate
          ? `From ${startDate}`
          : endDate
            ? `Up to ${endDate}`
            : "All Recorded History";

    const accountScopeLabel = !accountIdFilter
      ? `All Accounts (${filteredAccounts.length})`
      : filteredAccounts[0]?.name ?? "Selected Account";

    const holderName = options.holderName?.trim() || "Moniilog Account Holder";
    const generatedDateLabel = formatShortDate(nowIso());

    const firstPageRows = 18;
    const subsequentPageRows = 28;
    const pageChunks: StatementLineItem[][] = [];

    if (items.length === 0) {
      pageChunks.push([]);
    } else {
      pageChunks.push(items.slice(0, firstPageRows));
      let offset = firstPageRows;
      while (offset < items.length) {
        pageChunks.push(items.slice(offset, offset + subsequentPageRows));
        offset += subsequentPageRows;
      }
    }

    const totalPages = pageChunks.length;
    const pageStreams: string[] = [];

    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      const lines: string[] = [];
      const isFirstPage = pageIdx === 0;
      const rows = pageChunks[pageIdx] ?? [];

      // Header Banner (Navy #173B7A)
      lines.push("0.09 0.23 0.48 rg");
      lines.push("36 756 523 56 re f");

      // Teal Accent Bar (#0F8C83)
      lines.push("0.06 0.55 0.51 rg");
      lines.push("36 752 523 4 re f");

      lines.push("1 1 1 rg");
      drawText(lines, "MONIILOG", 50, 788, "F2", 18);
      drawText(lines, "OFFICIAL FINANCIAL ACCOUNT STATEMENT", 50, 768, "F1", 9);
      drawText(lines, `Page ${pageIdx + 1} of ${totalPages}`, 485, 785, "F2", 10);
      drawText(lines, generatedDateLabel, 485, 770, "F1", 8);

      let cursorY = 732;

      if (isFirstPage) {
        lines.push("0.96 0.97 0.99 rg");
        lines.push("36 668 523 56 re f");
        lines.push("0.84 0.87 0.92 RG 0.7 w");
        lines.push("36 668 523 56 re S");

        lines.push("0.35 0.41 0.50 rg");
        drawText(lines, "ACCOUNT HOLDER", 48, 708, "F2", 8);
        drawText(lines, "STATEMENT PERIOD", 220, 708, "F2", 8);
        drawText(lines, "ACCOUNT SCOPE", 400, 708, "F2", 8);

        lines.push("0.08 0.12 0.20 rg");
        drawText(lines, truncateText(holderName, 26), 48, 693, "F2", 10);
        drawText(lines, truncateText(periodLabel, 28), 220, 693, "F1", 10);
        drawText(lines, truncateText(accountScopeLabel, 24), 400, 693, "F1", 10);

        lines.push("0.35 0.41 0.50 rg");
        drawText(
          lines,
          `Currency: ${currencyCode}   |   Total Statement Entries: ${items.length}`,
          48,
          676,
          "F1",
          8
        );

        const boxY = 602;
        const boxW = 124;
        const boxH = 54;
        const kpis = [
          {
            label: "OPENING BALANCE",
            val: formatCurrency(openingBalance, currencyCode),
            r: 0.09,
            g: 0.23,
            b: 0.48
          },
          {
            label: "TOTAL CREDITS (+)",
            val: formatCurrency(totalCredits, currencyCode),
            r: 0.06,
            g: 0.55,
            b: 0.51
          },
          {
            label: "TOTAL DEBITS (-)",
            val: formatCurrency(totalDebits, currencyCode),
            r: 0.85,
            g: 0.3,
            b: 0.24
          },
          {
            label: "CLOSING BALANCE",
            val: formatCurrency(closingBalance, currencyCode),
            r: 0.09,
            g: 0.23,
            b: 0.48
          }
        ];

        kpis.forEach((kpi, idx) => {
          const bx = 36 + idx * (boxW + 9);
          lines.push("0.98 0.99 1.0 rg");
          lines.push(`${bx} ${boxY} ${boxW} ${boxH} re f`);
          lines.push(`${kpi.r} ${kpi.g} ${kpi.b} RG 1.2 w`);
          lines.push(`${bx} ${boxY} ${boxW} ${boxH} re S`);

          lines.push("0.40 0.45 0.54 rg");
          drawText(lines, kpi.label, bx + 8, boxY + 38, "F2", 7.5);

          lines.push(`${kpi.r} ${kpi.g} ${kpi.b} rg`);
          drawText(lines, truncateText(kpi.val, 18), bx + 8, boxY + 16, "F2", 10.5);
        });

        cursorY = 582;
      }

      lines.push("0.09 0.23 0.48 rg");
      lines.push(`36 ${cursorY - 20} 523 20 re f`);
      lines.push("1 1 1 rg");
      drawText(lines, "DATE", 42, cursorY - 13, "F2", 8);
      drawText(lines, "DESCRIPTION / NOTE", 105, cursorY - 13, "F2", 8);
      drawText(lines, "CATEGORY / ACCOUNT", 255, cursorY - 13, "F2", 8);
      drawText(lines, "DEBIT (-)", 380, cursorY - 13, "F2", 8);
      drawText(lines, "CREDIT (+)", 440, cursorY - 13, "F2", 8);
      drawText(lines, "BALANCE", 500, cursorY - 13, "F2", 8);

      cursorY -= 20;

      if (rows.length === 0) {
        lines.push("0.40 0.45 0.54 rg");
        drawText(
          lines,
          "No transactions recorded for the selected statement period.",
          48,
          cursorY - 24,
          "F1",
          9.5
        );
      } else {
        rows.forEach((item, rIdx) => {
          const rowY = cursorY - 18;
          if (rIdx % 2 === 1) {
            lines.push("0.96 0.97 0.99 rg");
            lines.push(`36 ${rowY} 523 18 re f`);
          }
          lines.push("0.90 0.92 0.95 RG 0.4 w");
          lines.push(`36 ${rowY} 523 18 re S`);

          lines.push("0.12 0.16 0.23 rg");
          drawText(lines, formatShortDate(item.date), 42, rowY + 6, "F1", 8);
          drawText(lines, truncateText(item.description, 27), 105, rowY + 6, "F1", 8);
          drawText(
            lines,
            truncateText(`${item.categoryOrChannel} (${item.accountName})`, 24),
            255,
            rowY + 6,
            "F1",
            7.5
          );

          if (item.debit > 0) {
            lines.push("0.80 0.22 0.18 rg");
            drawText(
              lines,
              truncateText(formatCurrency(item.debit, currencyCode), 11),
              380,
              rowY + 6,
              "F2",
              7.5
            );
          } else {
            lines.push("0.55 0.60 0.68 rg");
            drawText(lines, "-", 380, rowY + 6, "F1", 8);
          }

          if (item.credit > 0) {
            lines.push("0.05 0.50 0.45 rg");
            drawText(
              lines,
              truncateText(formatCurrency(item.credit, currencyCode), 11),
              440,
              rowY + 6,
              "F2",
              7.5
            );
          } else {
            lines.push("0.55 0.60 0.68 rg");
            drawText(lines, "-", 440, rowY + 6, "F1", 8);
          }

          lines.push("0.09 0.23 0.48 rg");
          drawText(
            lines,
            truncateText(formatCurrency(item.runningBalance, currencyCode), 11),
            500,
            rowY + 6,
            "F2",
            7.5
          );

          cursorY = rowY;
        });
      }

      lines.push("0.85 0.88 0.92 RG 0.6 w");
      lines.push("36 44 523 0 re S");
      lines.push("0.45 0.50 0.58 rg");
      drawText(
        lines,
        "Moniilog Personal Finance Ledger  -  web.moniilog.com  -  Confidential Statement",
        36,
        30,
        "F1",
        8
      );

      pageStreams.push(lines.join("\n"));
    }

    const pdfContent = assemblePdfString(pageStreams);
    const fileName = `moniilog_statement_${new Date().toISOString().slice(0, 10)}.pdf`;
    const blob = new Blob([pdfContent], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", fileName);
    link.click();
    URL.revokeObjectURL(url);

    const record: ExportRecord = {
      id: createId("export"),
      format: "pdf",
      recordCount: items.length,
      filtersApplied: `${accountScopeLabel} | ${periodLabel}`,
      fileName,
      createdAt: nowIso()
    };

    await auditRepository.addExportRecord(record);
    return record;
  }
};
