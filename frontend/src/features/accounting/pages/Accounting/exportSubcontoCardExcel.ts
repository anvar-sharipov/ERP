// frontend/src/features/accounting/pages/Accounting/exportSubcontoCardExcel.ts
import ExcelJS from "exceljs";
import { addExcelHeader } from "../../../../core/utils/excelHelpers";

interface CardRow {
  date: string;
  corr_account: string;
  comment: string;
  debit: number;
  credit: number;
  balance: number;
}

interface CompanyLike {
  name?: string;
  logo?: string | null;
  logo2?: string | null;
}

interface UserLike {
  full_name?: string;
}

export interface ExportSubcontoCardExcelOptions {
  company: CompanyLike | null | undefined;
  user: UserLike | null | undefined;
  t: (key: string) => string;
  dateFrom: string;
  dateTo: string;
  accountCode: string;
  accountName: string;
  subcontoLabel: string;
  rows: CardRow[];
  openingBalance: number;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
}

// ✅ Строгая чёрно-серая палитра — как в exportDocumentExcel.ts, без цветных заливок.
const FLOAT_NUMFMT = "#,##0.00";
const HEADER_FILL = "FFE0E0E0";
const SUBTOTAL_FILL = "FFF2F2F2";
const thin = { top: { style: "thin" as const }, left: { style: "thin" as const }, bottom: { style: "thin" as const }, right: { style: "thin" as const } };

export async function exportSubcontoCardExcel(opts: ExportSubcontoCardExcelOptions): Promise<void> {
  const { company, user, t, dateFrom, dateTo, accountCode, accountName, subcontoLabel, rows, openingBalance, closingBalance, totalDebit, totalCredit } = opts;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(t("AccountCard"));

  await addExcelHeader(workbook, worksheet, company, user, t);

  const titleRow = worksheet.addRow([
    `${t("AccountCard")}: ${accountCode} ${accountName} — ${subcontoLabel}, ${new Date(dateFrom).toLocaleDateString("ru-RU")} — ${new Date(dateTo).toLocaleDateString("ru-RU")}`,
  ]);
  titleRow.font = { bold: true, size: 14 };
  worksheet.mergeCells(titleRow.number, 1, titleRow.number, 7);
  titleRow.getCell(1).alignment = { horizontal: "center" };
  worksheet.addRow([]);

  // ✅ №, Дата, Корр.счёт, Комментарий, Дебет, Кредит, Остаток — 7 колонок,
  // как и на экране (SubcontoCardPage.tsx имеет колонку "№").
  const colHeaderRow = worksheet.addRow(["№", t("Date"), t("CorrAccount"), t("Comment"), t("Debit"), t("Credit"), t("Balance")]);
  colHeaderRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { horizontal: "center" };
    cell.border = thin;
  });

  // ✅ Метка объединяется с №/Дата/Корр.счёт/Комментарий (значение — в якорную,
  // самую левую ячейку диапазона, см. CLAUDE.md про merge в Excel-экспортах).
  const openingRow = worksheet.addRow([t("OpeningBalance"), "", "", "", "", "", openingBalance]);
  worksheet.mergeCells(openingRow.number, 1, openingRow.number, 4);
  openingRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true };
    cell.border = thin;
  });
  openingRow.getCell(7).numFmt = FLOAT_NUMFMT;

  rows.forEach((row, i) => {
    const excelRow = worksheet.addRow([i + 1, new Date(row.date).toLocaleDateString("ru-RU"), row.corr_account, row.comment, row.debit, row.credit, row.balance]);
    excelRow.eachCell((cell, colNumber) => {
      cell.border = thin;
      if (colNumber >= 5) cell.numFmt = FLOAT_NUMFMT;
    });
    excelRow.getCell(1).alignment = { horizontal: "center" };
  });

  const totalRow = worksheet.addRow([t("TotalTurnover"), "", "", "", totalDebit, totalCredit, ""]);
  worksheet.mergeCells(totalRow.number, 1, totalRow.number, 4);
  totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBTOTAL_FILL } };
    cell.border = thin;
    if (colNumber >= 5) cell.numFmt = FLOAT_NUMFMT;
  });

  const closingRow = worksheet.addRow([t("ClosingBalance"), "", "", "", "", "", closingBalance]);
  worksheet.mergeCells(closingRow.number, 1, closingRow.number, 4);
  closingRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true };
    cell.border = thin;
  });
  closingRow.getCell(7).numFmt = FLOAT_NUMFMT;

  worksheet.columns.forEach((col, i) => {
    col.width = i === 0 ? 6 : i === 3 ? 40 : i === 1 ? 14 : 16;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${t("AccountCard")}_${accountCode}_${subcontoLabel}_${new Date().toLocaleDateString("ru-RU").replace(/\./g, "-")}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}
