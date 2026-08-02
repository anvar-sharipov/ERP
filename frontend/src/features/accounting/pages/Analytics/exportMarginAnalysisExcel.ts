// frontend/src/features/accounting/pages/Analytics/exportMarginAnalysisExcel.ts
import ExcelJS from "exceljs";
import { addExcelHeader } from "../../../../core/utils/excelHelpers";
import type { MarginItem, MarginBandSummary } from "../../services/analyticsApi";

interface CompanyLike {
  name?: string;
  logo?: string | null;
  logo2?: string | null;
}
interface UserLike {
  full_name?: string;
}

export interface ExportMarginAnalysisExcelOptions {
  company: CompanyLike | null | undefined;
  user: UserLike | null | undefined;
  t: (key: string) => string;
  dateFrom: string;
  dateTo: string;
  items: MarginItem[];
  bandSummary: MarginBandSummary[];
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  totalMarginPct: number;
}

const BAND_LABELS: Record<string, string> = { negative: "Убыточные", low: "Низкая маржа", normal: "Нормальная маржа" };

const FLOAT_NUMFMT = "#,##0.00";
const PCT_NUMFMT = "0.00\"%\"";
const HEADER_FILL = "FFE0E0E0";
const GRANDTOTAL_FILL = "FFD9D9D9";
const thin = { top: { style: "thin" as const }, left: { style: "thin" as const }, bottom: { style: "thin" as const }, right: { style: "thin" as const } };

export async function exportMarginAnalysisExcel(opts: ExportMarginAnalysisExcelOptions): Promise<void> {
  const { company, user, t, dateFrom, dateTo, items, bandSummary, totalRevenue, totalCost, totalProfit, totalMarginPct } = opts;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(t("MarginAnalysis"));

  await addExcelHeader(workbook, worksheet, company, user, t);

  const titleRow = worksheet.addRow([`${t("MarginAnalysis")}, ${new Date(dateFrom).toLocaleDateString("ru-RU")} — ${new Date(dateTo).toLocaleDateString("ru-RU")}`]);
  titleRow.font = { bold: true, size: 14 };
  worksheet.mergeCells(titleRow.number, 1, titleRow.number, 8);
  titleRow.getCell(1).alignment = { horizontal: "center" };
  worksheet.addRow([]);

  const summaryHeaderRow = worksheet.addRow([t("MarginBand"), t("ProductsCount"), t("Revenue"), t("Profit")]);
  summaryHeaderRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.border = thin;
  });
  bandSummary.forEach((s) => {
    const row = worksheet.addRow([BAND_LABELS[s.band] ?? s.band, s.count, s.revenue, s.profit]);
    row.eachCell((cell, colNumber) => {
      cell.border = thin;
      if (colNumber >= 3) cell.numFmt = FLOAT_NUMFMT;
    });
  });
  worksheet.addRow([]);

  const colHeaderRow = worksheet.addRow(["№", t("Product"), t("SKU"), t("Quantity"), t("Revenue"), t("Cost"), t("Profit"), t("Margin"), t("MarkupPercent")]);
  colHeaderRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { horizontal: "center" };
    cell.border = thin;
  });

  items.forEach((it) => {
    const row = worksheet.addRow([it.rank, it.product_name, it.product_sku ?? "", it.quantity, it.revenue, it.cost, it.profit, it.margin_pct, it.markup_pct]);
    row.eachCell((cell, colNumber) => {
      cell.border = thin;
      if (colNumber >= 4 && colNumber <= 7) cell.numFmt = FLOAT_NUMFMT;
      if (colNumber === 8 || colNumber === 9) cell.numFmt = PCT_NUMFMT;
    });
    row.getCell(1).alignment = { horizontal: "center" };
  });

  const totalRow = worksheet.addRow([t("GrandTotal"), "", "", "", totalRevenue, totalCost, totalProfit, totalMarginPct, ""]);
  worksheet.mergeCells(totalRow.number, 1, totalRow.number, 3);
  totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRANDTOTAL_FILL } };
    cell.border = thin;
    if (colNumber >= 5 && colNumber <= 7) cell.numFmt = FLOAT_NUMFMT;
    if (colNumber === 8) cell.numFmt = PCT_NUMFMT;
  });

  worksheet.columns.forEach((col, i) => {
    col.width = i === 0 ? 6 : i === 1 ? 34 : i === 2 ? 16 : 15;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${t("MarginAnalysis")}_${new Date().toLocaleDateString("ru-RU").replace(/\./g, "-")}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}
