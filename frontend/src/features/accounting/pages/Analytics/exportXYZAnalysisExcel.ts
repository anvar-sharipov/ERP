// frontend/src/features/accounting/pages/Analytics/exportXYZAnalysisExcel.ts
import ExcelJS from "exceljs";
import { addExcelHeader } from "../../../../core/utils/excelHelpers";
import type { XYZItem, XYZSummaryRow } from "../../services/analyticsApi";

interface CompanyLike {
  name?: string;
  logo?: string | null;
  logo2?: string | null;
}
interface UserLike {
  full_name?: string;
}

export interface ExportXYZAnalysisExcelOptions {
  company: CompanyLike | null | undefined;
  user: UserLike | null | undefined;
  t: (key: string) => string;
  dateFrom: string;
  dateTo: string;
  items: XYZItem[];
  summary: XYZSummaryRow[];
  totalQuantity: number;
}

const FLOAT_NUMFMT = "#,##0.00";
const PCT_NUMFMT = "0.00\"%\"";
const HEADER_FILL = "FFE0E0E0";
const GRANDTOTAL_FILL = "FFD9D9D9";
const thin = { top: { style: "thin" as const }, left: { style: "thin" as const }, bottom: { style: "thin" as const }, right: { style: "thin" as const } };

export async function exportXYZAnalysisExcel(opts: ExportXYZAnalysisExcelOptions): Promise<void> {
  const { company, user, t, dateFrom, dateTo, items, summary, totalQuantity } = opts;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(t("XYZAnalysis"));

  await addExcelHeader(workbook, worksheet, company, user, t);

  const titleRow = worksheet.addRow([`${t("XYZAnalysis")}, ${new Date(dateFrom).toLocaleDateString("ru-RU")} — ${new Date(dateTo).toLocaleDateString("ru-RU")}`]);
  titleRow.font = { bold: true, size: 14 };
  worksheet.mergeCells(titleRow.number, 1, titleRow.number, 7);
  titleRow.getCell(1).alignment = { horizontal: "center" };
  worksheet.addRow([]);

  const summaryHeaderRow = worksheet.addRow([t("Class"), t("ProductsCount"), "% " + t("Assortment"), t("Quantity"), "% " + t("Quantity")]);
  summaryHeaderRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.border = thin;
  });
  summary.forEach((s) => {
    const row = worksheet.addRow([s.class, s.count, s.count_pct, s.quantity, s.quantity_pct]);
    row.eachCell((cell, colNumber) => {
      cell.border = thin;
      if (colNumber === 3 || colNumber === 5) cell.numFmt = PCT_NUMFMT;
      if (colNumber === 4) cell.numFmt = FLOAT_NUMFMT;
    });
  });
  worksheet.addRow([]);

  const colHeaderRow = worksheet.addRow(["№", t("Product"), t("SKU"), t("Class"), t("TotalQuantity"), t("AvgQuantityPerPeriod"), t("CoefficientOfVariation")]);
  colHeaderRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { horizontal: "center" };
    cell.border = thin;
  });

  items.forEach((it) => {
    const row = worksheet.addRow([it.rank, it.product_name, it.product_sku ?? "", it.class, it.total_quantity, it.avg_quantity, it.cv]);
    row.eachCell((cell, colNumber) => {
      cell.border = thin;
      if (colNumber === 5 || colNumber === 6) cell.numFmt = FLOAT_NUMFMT;
      if (colNumber === 7) cell.numFmt = PCT_NUMFMT;
    });
    row.getCell(1).alignment = { horizontal: "center" };
    row.getCell(4).alignment = { horizontal: "center" };
  });

  const totalRow = worksheet.addRow([t("GrandTotal"), "", "", "", totalQuantity, "", ""]);
  worksheet.mergeCells(totalRow.number, 1, totalRow.number, 3);
  totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRANDTOTAL_FILL } };
    cell.border = thin;
    if (colNumber === 5) cell.numFmt = FLOAT_NUMFMT;
  });

  worksheet.columns.forEach((col, i) => {
    col.width = i === 0 ? 6 : i === 1 ? 34 : i === 2 ? 16 : 15;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${t("XYZAnalysis")}_${new Date().toLocaleDateString("ru-RU").replace(/\./g, "-")}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}
