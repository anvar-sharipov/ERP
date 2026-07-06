// frontend/src/features/accounting/pages/Accounting/exportProductTurnoverDetailExcel.ts
import ExcelJS from "exceljs";
import { addExcelHeader } from "../../../../core/utils/excelHelpers";

interface CompanyLike { name?: string; logo?: string | null; logo2?: string | null; }
interface UserLike { full_name?: string; }

export interface ExportProductTurnoverDetailExcelOptions {
  company: CompanyLike | null | undefined;
  user: UserLike | null | undefined;
  t: (key: string) => string;
  dateFrom: string;
  dateTo: string;
  data: {
    product_name: string;
    start_quantity: string;
    start_value: string;
    turnover: { in_qty: string; in_value: string; return_qty: string; return_value: string; out_qty: string; out_value: string };
    end: { quantity: string; value: string };
    rows: Array<{
      date: string; document_number: string; partner: string; note: string; price: string;
      in_qty: string; in_sum: string; return_qty: string; return_sum: string; out_qty: string; out_sum: string;
      balance_qty: string; balance_sum: string;
    }>;
  };
}

const FLOAT_NUMFMT = "#,##0.00";
const QTY_NUMFMT = "#,##0.###";
const thin = { top: { style: "thin" as const }, left: { style: "thin" as const }, bottom: { style: "thin" as const }, right: { style: "thin" as const } };
const num = (v: number | string) => Number(v) || 0;

export async function exportProductTurnoverDetailExcel(opts: ExportProductTurnoverDetailExcelOptions): Promise<void> {
  const { company, user, t, dateFrom, dateTo, data } = opts;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(`${t("ProductTurnover")} ${data.product_name}`.slice(0, 31));
  await addExcelHeader(workbook, worksheet, company, user, t);

  const colCount = 13;
  const titleRow = worksheet.addRow([`${data.product_name} (${new Date(dateFrom).toLocaleDateString("ru-RU")} — ${new Date(dateTo).toLocaleDateString("ru-RU")})`]);
  titleRow.font = { bold: true, size: 14 };
  worksheet.mergeCells(titleRow.number, 1, titleRow.number, colCount);
  titleRow.getCell(1).alignment = { horizontal: "center" };
  worksheet.addRow([]);

  const h1 = worksheet.addRow(["№", t("Date"), t("Counterparty"), t("Note"), t("Price"), t("Incoming"), "", t("ReturnIn"), "", t("Outgoing"), "", t("ClosingBalance"), ""]);
  worksheet.mergeCells(h1.number, 6, h1.number, 7);
  worksheet.mergeCells(h1.number, 8, h1.number, 9);
  worksheet.mergeCells(h1.number, 10, h1.number, 11);
  worksheet.mergeCells(h1.number, 12, h1.number, 13);
  const h2 = worksheet.addRow(["", "", "", "", "", t("Quantity"), t("Total"), t("Quantity"), t("Total"), t("Quantity"), t("Total"), t("Quantity"), t("Total")]);

  [h1, h2].forEach((row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
      cell.font = { bold: true };
      cell.border = thin;
      cell.alignment = { horizontal: "center" };
    });
  });

  const startRow = worksheet.addRow([
    "", t("OpeningBalance"), "", "", "", "", "", "", "", "", "",
    num(data.start_quantity), num(data.start_value),
  ]);
  startRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.border = thin;
    cell.font = { bold: true };
    if (colNumber === 12) cell.numFmt = QTY_NUMFMT;
    if (colNumber === 13) cell.numFmt = FLOAT_NUMFMT;
  });

  data.rows.forEach((r, i) => {
    const row = worksheet.addRow([
      i + 1,
      `${new Date(r.date).toLocaleDateString("ru-RU")} ${r.document_number}`,
      r.partner || "-",
      r.note || "-",
      num(r.price),
      num(r.in_qty) || "",
      num(r.in_qty) ? num(r.in_sum) : "",
      num(r.return_qty) || "",
      num(r.return_qty) ? num(r.return_sum) : "",
      num(r.out_qty) || "",
      num(r.out_qty) ? num(r.out_sum) : "",
      num(r.balance_qty),
      num(r.balance_sum),
    ]);
    row.eachCell((cell, colNumber) => {
      cell.border = thin;
      if ([5, 7, 9, 11, 13].includes(colNumber) && typeof cell.value === "number") cell.numFmt = FLOAT_NUMFMT;
      if ([6, 8, 10, 12].includes(colNumber) && typeof cell.value === "number") cell.numFmt = QTY_NUMFMT;
    });
  });

  const turnoverRow = worksheet.addRow([
    "", t("TotalTurnover"), "", "", "",
    num(data.turnover.in_qty), num(data.turnover.in_value),
    num(data.turnover.return_qty), num(data.turnover.return_value),
    num(data.turnover.out_qty), num(data.turnover.out_value),
    "", "",
  ]);
  turnoverRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.border = thin;
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    if ([7, 9, 11].includes(colNumber) && typeof cell.value === "number") cell.numFmt = FLOAT_NUMFMT;
    if ([6, 8, 10].includes(colNumber) && typeof cell.value === "number") cell.numFmt = QTY_NUMFMT;
  });

  const endRow = worksheet.addRow([
    "", t("ClosingBalance"), "", "", "", "", "", "", "", "", "",
    num(data.end.quantity), num(data.end.value),
  ]);
  endRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.border = thin;
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    if (colNumber === 12) cell.numFmt = QTY_NUMFMT;
    if (colNumber === 13) cell.numFmt = FLOAT_NUMFMT;
  });

  worksheet.columns = [{ width: 5 }, { width: 22 }, { width: 30 }, { width: 30 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 12 }, { width: 14 }, { width: 12 }, { width: 14 }, { width: 12 }, { width: 14 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `product_turnover_${data.product_name.replace(/[^\w\d]+/g, "_")}_${dateFrom}_${dateTo}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}
