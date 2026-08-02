// frontend/src/features/accounting/pages/Analytics/exportSalesDynamicsExcel.ts
import ExcelJS from "exceljs";
import { addExcelHeader } from "../../../../core/utils/excelHelpers";
import type { SalesDynamicsPoint } from "../../services/analyticsApi";

interface CompanyLike {
  name?: string;
  logo?: string | null;
  logo2?: string | null;
}
interface UserLike {
  full_name?: string;
}

export interface ExportSalesDynamicsExcelOptions {
  company: CompanyLike | null | undefined;
  user: UserLike | null | undefined;
  t: (key: string) => string;
  dateFrom: string;
  dateTo: string;
  points: SalesDynamicsPoint[];
  formatLabel: (date: string) => string;
  totalRevenue: number;
  totalDocuments: number;
  avgCheck: number;
}

const FLOAT_NUMFMT = "#,##0.00";
const HEADER_FILL = "FFE0E0E0";
const GRANDTOTAL_FILL = "FFD9D9D9";
const thin = { top: { style: "thin" as const }, left: { style: "thin" as const }, bottom: { style: "thin" as const }, right: { style: "thin" as const } };

export async function exportSalesDynamicsExcel(opts: ExportSalesDynamicsExcelOptions): Promise<void> {
  const { company, user, t, dateFrom, dateTo, points, formatLabel, totalRevenue, totalDocuments, avgCheck } = opts;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(t("SalesDynamics"));

  await addExcelHeader(workbook, worksheet, company, user, t);

  const titleRow = worksheet.addRow([`${t("SalesDynamics")}, ${new Date(dateFrom).toLocaleDateString("ru-RU")} — ${new Date(dateTo).toLocaleDateString("ru-RU")}`]);
  titleRow.font = { bold: true, size: 14 };
  worksheet.mergeCells(titleRow.number, 1, titleRow.number, 4);
  titleRow.getCell(1).alignment = { horizontal: "center" };
  worksheet.addRow([]);

  const colHeaderRow = worksheet.addRow(["№", t("Date"), t("Revenue"), t("DocumentsCount"), t("AvgCheck")]);
  colHeaderRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { horizontal: "center" };
    cell.border = thin;
  });

  points.forEach((p, i) => {
    const row = worksheet.addRow([i + 1, formatLabel(p.date), p.revenue, p.documents_count, p.avg_check]);
    row.eachCell((cell, colNumber) => {
      cell.border = thin;
      if (colNumber === 3 || colNumber === 5) cell.numFmt = FLOAT_NUMFMT;
    });
    row.getCell(1).alignment = { horizontal: "center" };
  });

  const totalRow = worksheet.addRow([t("GrandTotal"), "", totalRevenue, totalDocuments, avgCheck]);
  worksheet.mergeCells(totalRow.number, 1, totalRow.number, 2);
  totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRANDTOTAL_FILL } };
    cell.border = thin;
    if (colNumber === 3 || colNumber === 5) cell.numFmt = FLOAT_NUMFMT;
  });

  worksheet.columns.forEach((col, i) => {
    col.width = i === 0 ? 6 : i === 1 ? 16 : 20;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${t("SalesDynamics")}_${new Date().toLocaleDateString("ru-RU").replace(/\./g, "-")}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}
