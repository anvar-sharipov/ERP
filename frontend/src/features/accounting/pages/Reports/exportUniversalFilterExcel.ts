// frontend/src/features/accounting/pages/Reports/exportUniversalFilterExcel.ts
import ExcelJS from "exceljs";
import type { TFunction } from "i18next";
import { addExcelHeader } from "../../../../core/utils/excelHelpers";
import { getColumnsFor, getCellValue, type UniversalFilterGroupBy, type UniversalFilterRow, type UniversalFilterColumn } from "./universalFilterColumns";

interface CompanyLike {
  name?: string;
  logo?: string | null;
  logo2?: string | null;
}

interface UserLike {
  full_name?: string;
}

export interface ExportUniversalFilterExcelOptions {
  company: CompanyLike | null | undefined;
  user: UserLike | null | undefined;
  t: TFunction;
  periodFrom: string;
  periodTo: string;
  groupBy: UniversalFilterGroupBy;
  hasProfit: boolean;
  rows: UniversalFilterRow[];
  totals: UniversalFilterRow;
}

// ✅ Серо-чёрная палитра (exportSubcontoBreakdownExcel.ts::HEADER_FILL/GRANDTOTAL_FILL) —
// НЕ зелёная (exportOSVExcel.ts) — та палитра старше правила о restrained-палитре
// в CLAUDE.md и не образец для новых экспортов.
const HEADER_FILL = "FFE0E0E0";
const GRANDTOTAL_FILL = "FFD9D9D9";
const thin = { top: { style: "thin" as const }, left: { style: "thin" as const }, bottom: { style: "thin" as const }, right: { style: "thin" as const } };

const numFmtFor = (col: UniversalFilterColumn): string | undefined => {
  if (!col.numeric) return undefined;
  if (col.key === "quantity") return "#,##0.###";
  if (col.key === "documents_count") return "#,##0";
  return "#,##0.00";
};

/**
 * Экспорт универсального фильтра — колонки берутся ровно из того же
 * getColumnsFor(groupBy, hasProfit), что рисует UniversalFilterTable.tsx на
 * экране, поэтому набор колонок структурно не может разойтись между экраном
 * и Excel (см. CLAUDE.md про screen/print/excel drift).
 */
export async function exportUniversalFilterExcel(opts: ExportUniversalFilterExcelOptions): Promise<void> {
  const { company, user, t, periodFrom, periodTo, groupBy, hasProfit, rows, totals } = opts;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(t("UniversalFilterTitle"));

  await addExcelHeader(workbook, worksheet, company, user, t);

  const columns = getColumnsFor(groupBy, hasProfit, t);
  const colCount = columns.length + 1; // + "№"

  const titleRow = worksheet.addRow([`${t("UniversalFilterTitle")}, ${new Date(periodFrom).toLocaleDateString("ru-RU")} — ${new Date(periodTo).toLocaleDateString("ru-RU")}`]);
  titleRow.font = { bold: true, size: 14 };
  worksheet.mergeCells(titleRow.number, 1, titleRow.number, colCount);
  titleRow.getCell(1).alignment = { horizontal: "center" };
  worksheet.addRow([]);

  const headerRow = worksheet.addRow(["№", ...columns.map((c) => c.label)]);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { horizontal: "center" };
    cell.border = thin;
  });

  rows.forEach((row, idx) => {
    const excelRow = worksheet.addRow([
      idx + 1,
      ...columns.map((col) => (col.numeric ? Number(row[col.key] ?? 0) : getCellValue(row, col, t))),
    ]);
    excelRow.eachCell((cell, colNumber) => {
      cell.border = thin;
      if (colNumber > 1) {
        const numFmt = numFmtFor(columns[colNumber - 2]);
        if (numFmt) cell.numFmt = numFmt;
      }
    });
    excelRow.getCell(1).alignment = { horizontal: "center" };
  });

  // ✅ Метка "Итого" объединяется с "№" + первой колонкой (тот же приём, что
  // addTotalsRow в exportSubcontoBreakdownExcel.ts) — значение пишем в
  // якорную (левую) ячейку диапазона, Excel иначе теряет значение из второй.
  const totalRow = worksheet.addRow([
    t("GrandTotal"),
    "",
    ...columns.slice(1).map((col) => (col.numeric ? Number(totals[col.key] ?? 0) : "")),
  ]);
  worksheet.mergeCells(totalRow.number, 1, totalRow.number, 2);
  totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRANDTOTAL_FILL } };
    cell.border = thin;
    if (colNumber > 2) {
      const numFmt = numFmtFor(columns[colNumber - 2]);
      if (numFmt) cell.numFmt = numFmt;
    }
  });

  worksheet.columns.forEach((col, i) => {
    if (i === 0) {
      col.width = 6;
      return;
    }
    col.width = columns[i - 1]?.numeric ? 14 : 22;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${t("UniversalFilterTitle")}_${new Date().toLocaleDateString("ru-RU").replace(/\./g, "-")}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}
