// frontend/src/features/accounting/pages/Accounting/exportOSVExcel.ts
import ExcelJS from "exceljs";
import { addExcelHeader } from "../../../../core/utils/excelHelpers";

interface OSVExcelRow {
  code: string;
  name: string;
  is_group: boolean;
  depth: number;
  opening_debit: string;
  opening_credit: string;
  debit_turnover: string;
  credit_turnover: string;
  closing_debit: string;
  closing_credit: string;
}

interface CompanyLike {
  name?: string;
  logo?: string | null;
  logo2?: string | null;
}

interface UserLike {
  full_name?: string;
}

export interface ExportOSVExcelOptions {
  company: CompanyLike | null | undefined;
  user: UserLike | null | undefined;
  t: (key: string) => string;
  periodFrom: string;
  periodTo: string;
  rows: OSVExcelRow[];
}

const FLOAT_NUMFMT = "#,##0.00";
const GREEN_HEADER = "FF15803D";
const GREEN_SUBHEADER = "FF16A34A";
const GROUP_ROW_FILL = "FFF3F4F6";
const WHITE = "FFFFFFFF";

const num = (v: string) => Number(v) || 0;
const thin = { top: { style: "thin" as const }, left: { style: "thin" as const }, bottom: { style: "thin" as const }, right: { style: "thin" as const } };

export async function exportOSVExcel(opts: ExportOSVExcelOptions): Promise<void> {
  const { company, user, t, periodFrom, periodTo, rows } = opts;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(t("OSVTitle"));

  // ── Шапка компании + pageSetup (обязательный общий хелпер — см. CLAUDE.md) ──
  await addExcelHeader(workbook, worksheet, company, user, t);

  const headerSpan = 8;

  const titleRow = worksheet.addRow([`${t("OSVTitle")} ${new Date(periodFrom).toLocaleDateString("ru-RU")} — ${new Date(periodTo).toLocaleDateString("ru-RU")}`]);
  titleRow.font = { bold: true, size: 14 };
  worksheet.mergeCells(titleRow.number, 1, titleRow.number, headerSpan);
  titleRow.getCell(1).alignment = { horizontal: "center" };
  worksheet.addRow([]);

  // ── Групповая шапка таблицы — та же структура, что на экране (OSVTable.tsx):
  // Открыт.остаток / Обороты за период / Закрыт.остаток, каждая — Дт/Кт.
  const groupHeaderRow = worksheet.addRow(["", "", t("OpeningBalance"), "", t("PeriodTurnover"), "", t("ClosingBalance"), ""]);
  worksheet.mergeCells(groupHeaderRow.number, 3, groupHeaderRow.number, 4);
  worksheet.mergeCells(groupHeaderRow.number, 5, groupHeaderRow.number, 6);
  worksheet.mergeCells(groupHeaderRow.number, 7, groupHeaderRow.number, 8);
  groupHeaderRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_HEADER } };
    cell.alignment = { horizontal: "center" };
    cell.border = thin;
  });

  const colHeaderRow = worksheet.addRow([t("Account"), t("Name"), t("Debit"), t("Credit"), t("Debit"), t("Credit"), t("Debit"), t("Credit")]);
  colHeaderRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_SUBHEADER } };
    cell.alignment = { horizontal: "center" };
    cell.border = thin;
  });

  rows.forEach((row) => {
    const excelRow = worksheet.addRow([
      row.code,
      row.name,
      num(row.opening_debit),
      num(row.opening_credit),
      num(row.debit_turnover),
      num(row.credit_turnover),
      num(row.closing_debit),
      num(row.closing_credit),
    ]);
    excelRow.eachCell((cell, colNumber) => {
      cell.border = thin;
      if (colNumber >= 3) cell.numFmt = FLOAT_NUMFMT;
    });
    // ✅ Отступ по иерархии — то же, что padding-left от depth на экране (OSVTable.tsx)
    excelRow.getCell(1).alignment = { indent: row.depth };
    excelRow.getCell(2).alignment = { indent: row.depth };
    if (row.is_group) {
      excelRow.font = { bold: true };
      excelRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GROUP_ROW_FILL } };
      });
    }
  });

  // ── Итого — только строки верхнего уровня (depth===0), иначе суммы групп
  // посчитались бы дважды (см. тот же принцип в OSVTable.tsx::totals).
  const topLevel = rows.filter((r) => r.depth === 0);
  const totals = topLevel.reduce(
    (acc, r) => ({
      opening_debit: acc.opening_debit + num(r.opening_debit),
      opening_credit: acc.opening_credit + num(r.opening_credit),
      debit_turnover: acc.debit_turnover + num(r.debit_turnover),
      credit_turnover: acc.credit_turnover + num(r.credit_turnover),
      closing_debit: acc.closing_debit + num(r.closing_debit),
      closing_credit: acc.closing_credit + num(r.closing_credit),
    }),
    { opening_debit: 0, opening_credit: 0, debit_turnover: 0, credit_turnover: 0, closing_debit: 0, closing_credit: 0 },
  );

  const totalRow = worksheet.addRow([
    t("Total"),
    "",
    totals.opening_debit,
    totals.opening_credit,
    totals.debit_turnover,
    totals.credit_turnover,
    totals.closing_debit,
    totals.closing_credit,
  ]);
  worksheet.mergeCells(totalRow.number, 1, totalRow.number, 2);
  totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_HEADER } };
    cell.border = thin;
    if (colNumber >= 3) cell.numFmt = FLOAT_NUMFMT;
  });

  worksheet.columns.forEach((col, i) => {
    col.width = i === 0 ? 12 : i === 1 ? 34 : 16;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `OSV_${new Date().toLocaleDateString("ru-RU").replace(/\./g, "-")}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}
