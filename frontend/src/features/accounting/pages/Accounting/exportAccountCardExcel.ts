// frontend/src/features/accounting/pages/Accounting/exportAccountCardExcel.ts
import ExcelJS from "exceljs";
import { addExcelHeader } from "../../../../core/utils/excelHelpers";

interface CardItem {
  date: string;
  corr_account: string;
  comment: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface AccountCardExport {
  account_code: string;
  account_name: string;
  items: CardItem[];
  opening_balance: number;
  closing_balance: number;
  total_debit: number;
  total_credit: number;
}

interface CompanyLike {
  name?: string;
  logo?: string | null;
  logo2?: string | null;
}

interface UserLike {
  full_name?: string;
}

export interface ExportAccountCardExcelOptions {
  company: CompanyLike | null | undefined;
  user: UserLike | null | undefined;
  t: (key: string) => string;
  dateFrom: string;
  dateTo: string;
  cards: AccountCardExport[];
}

// ✅ Строгая чёрно-серая палитра — как в exportDocumentExcel.ts/exportSubcontoBreakdownExcel.ts.
const FLOAT_NUMFMT = "#,##0.00";
const HEADER_FILL = "FFE0E0E0";
const SUBTOTAL_FILL = "FFF2F2F2";
const GRANDTOTAL_FILL = "FFD9D9D9";
const thin = { top: { style: "thin" as const }, left: { style: "thin" as const }, bottom: { style: "thin" as const }, right: { style: "thin" as const } };

// ✅ №, Дата, Корр.счёт, Комментарий, Дебет, Кредит, Остаток — 7 колонок, как на
// экране (AccountCardPage.tsx). Может содержать несколько счетов подряд (когда
// счёт не выбран — отчёт по умолчанию показывает карточки сразу по всем счетам
// с активностью, см. CLAUDE.md: экран/печать/Excel не должны расходиться —
// экспорт воспроизводит ровно тот же набор карточек, что виден на экране).
export async function exportAccountCardExcel(opts: ExportAccountCardExcelOptions): Promise<void> {
  const { company, user, t, dateFrom, dateTo, cards } = opts;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(t("AccountCard"));

  await addExcelHeader(workbook, worksheet, company, user, t);

  const titleRow = worksheet.addRow([`${t("AccountCard")}, ${new Date(dateFrom).toLocaleDateString("ru-RU")} — ${new Date(dateTo).toLocaleDateString("ru-RU")}`]);
  titleRow.font = { bold: true, size: 14 };
  worksheet.mergeCells(titleRow.number, 1, titleRow.number, 7);
  titleRow.getCell(1).alignment = { horizontal: "center" };
  worksheet.addRow([]);

  const grandTotals = { debit: 0, credit: 0 };

  for (const card of cards) {
    const labelRow = worksheet.addRow([`${card.account_code} ${card.account_name}`]);
    worksheet.mergeCells(labelRow.number, 1, labelRow.number, 7);
    labelRow.getCell(1).font = { bold: true };
    labelRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBTOTAL_FILL } };
      cell.border = thin;
    });

    const colHeaderRow = worksheet.addRow(["№", t("Date"), t("CorrAccount"), t("Comment"), t("Debit"), t("Credit"), t("Balance")]);
    colHeaderRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
      cell.alignment = { horizontal: "center" };
      cell.border = thin;
    });

    const openingRow = worksheet.addRow([t("OpeningBalance"), "", "", "", "", "", card.opening_balance]);
    worksheet.mergeCells(openingRow.number, 1, openingRow.number, 4);
    openingRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true };
      cell.border = thin;
    });
    openingRow.getCell(7).numFmt = FLOAT_NUMFMT;

    card.items.forEach((row, i) => {
      const excelRow = worksheet.addRow([i + 1, new Date(row.date).toLocaleDateString("ru-RU"), row.corr_account, row.comment, row.debit, row.credit, row.balance]);
      excelRow.eachCell((cell, colNumber) => {
        cell.border = thin;
        if (colNumber >= 5) cell.numFmt = FLOAT_NUMFMT;
      });
      excelRow.getCell(1).alignment = { horizontal: "center" };
    });

    const totalRow = worksheet.addRow([t("TotalTurnover"), "", "", "", card.total_debit, card.total_credit, ""]);
    worksheet.mergeCells(totalRow.number, 1, totalRow.number, 4);
    totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBTOTAL_FILL } };
      cell.border = thin;
      if (colNumber >= 5) cell.numFmt = FLOAT_NUMFMT;
    });

    const closingRow = worksheet.addRow([t("ClosingBalance"), "", "", "", "", "", card.closing_balance]);
    worksheet.mergeCells(closingRow.number, 1, closingRow.number, 4);
    closingRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true };
      cell.border = thin;
    });
    closingRow.getCell(7).numFmt = FLOAT_NUMFMT;

    worksheet.addRow([]);
    grandTotals.debit += card.total_debit;
    grandTotals.credit += card.total_credit;
  }

  if (cards.length > 1) {
    const grandRow = worksheet.addRow([t("GrandTotal"), "", "", "", grandTotals.debit, grandTotals.credit, ""]);
    worksheet.mergeCells(grandRow.number, 1, grandRow.number, 4);
    grandRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRANDTOTAL_FILL } };
      cell.border = thin;
      if (colNumber >= 5) cell.numFmt = FLOAT_NUMFMT;
    });
  }

  worksheet.columns.forEach((col, i) => {
    col.width = i === 0 ? 6 : i === 3 ? 40 : i === 1 ? 14 : 16;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${t("AccountCard")}_${new Date().toLocaleDateString("ru-RU").replace(/\./g, "-")}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}
