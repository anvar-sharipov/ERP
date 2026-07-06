// frontend/src/features/accounting/pages/Accounting/exportProductTurnoverExcel.ts
import ExcelJS from "exceljs";
import { addExcelHeader } from "../../../../core/utils/excelHelpers";
import type { GroupedRow } from "../../../../components/ui/Table/ProductTurnoverTable";

interface CompanyLike { name?: string; logo?: string | null; logo2?: string | null; }
interface UserLike { full_name?: string; }

export interface ExportProductTurnoverExcelOptions {
  company: CompanyLike | null | undefined;
  user: UserLike | null | undefined;
  t: (key: string) => string;
  periodFrom: string;
  periodTo: string;
  // ✅ Уже сгруппированные строки (см. ProductTurnoverPage.tsx::grouped) — те же самые,
  // что показаны на экране в данный момент (с учётом поиска/фильтров/категория-или-бренд
  // группировки), а не сырые данные с бэкенда. Экспорт скачивает РОВНО то, что видно на
  // экране, byte-в-byte, а не пересчитывает группировку заново (см. правило в CLAUDE.md
  // про то, что экран/печать/Excel не должны расходиться).
  grouped: GroupedRow[];
  separateReturnOut: boolean;
  groupLabel: string;
  totalLabel: string;
}

const FLOAT_NUMFMT = "#,##0.00";
const QTY_NUMFMT = "#,##0.###";
const HEADER_FILL = "FF15803D";
const SUBHEADER_FILL = "FF16A34A";
const CATEGORY_FILL = "FFE7E6E6";
const TOTAL_FILL = "FFD9D9D9";
const GRAND_FILL = "FFC6EFCE";
const WHITE = "FFFFFFFF";
const thin = { top: { style: "thin" as const }, left: { style: "thin" as const }, bottom: { style: "thin" as const }, right: { style: "thin" as const } };
const num = (v: number | string) => Number(v) || 0;

export function buildProductTurnoverHeader(worksheet: ExcelJS.Worksheet, t: (k: string) => string, separateReturnOut: boolean, colCount: number) {
  const g1 = worksheet.addRow(["№", t("Name"), t("Unit"), t("OpeningBalance"), "", t("Incoming"), "", t("ReturnIn"), "", t("Outgoing"), "", "", "", ...(separateReturnOut ? [t("ReturnToSupplier"), ""] : []), t("Move"), "", t("ClosingBalance"), ""]);
  let col = 4;
  worksheet.mergeCells(g1.number, col, g1.number, col + 1); col += 2;
  worksheet.mergeCells(g1.number, col, g1.number, col + 1); col += 2;
  worksheet.mergeCells(g1.number, col, g1.number, col + 1); col += 2;
  worksheet.mergeCells(g1.number, col, g1.number, col + 3); col += 4;
  if (separateReturnOut) {
    worksheet.mergeCells(g1.number, col, g1.number, col + 1); col += 2;
  }
  worksheet.mergeCells(g1.number, col, g1.number, col + 1); col += 2;
  worksheet.mergeCells(g1.number, col, g1.number, col + 1);

  const subHeaders = [
    "", "", "",
    t("Quantity"), t("Total"),
    t("Quantity"), t("Total"),
    t("Quantity"), t("Total"),
    t("Quantity"), `${t("Total")} до %`, t("Discount"), `${t("Total")} после %`,
    ...(separateReturnOut ? [t("Quantity"), t("Total")] : []),
    t("Quantity"), t("Total"),
    t("Quantity"), t("Total"),
  ];
  const g2 = worksheet.addRow(subHeaders);

  [g1, g2].forEach((row) => {
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = { bold: true, color: { argb: WHITE } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colNumber <= 3 && row === g1 ? HEADER_FILL : SUBHEADER_FILL } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = thin;
    });
  });

  worksheet.columns = Array.from({ length: colCount }, (_, i) => ({ width: i === 1 ? 40 : i === 0 ? 6 : 13 }));
}

export async function exportProductTurnoverExcel(opts: ExportProductTurnoverExcelOptions): Promise<void> {
  const { company, user, t, periodFrom, periodTo, grouped, separateReturnOut, groupLabel, totalLabel } = opts;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(t("ProductTurnover"));
  await addExcelHeader(workbook, worksheet, company, user, t);

  const colCount = separateReturnOut ? 17 : 15;

  const titleRow = worksheet.addRow([`${t("ProductTurnover")} ${new Date(periodFrom).toLocaleDateString("ru-RU")} — ${new Date(periodTo).toLocaleDateString("ru-RU")}`]);
  titleRow.font = { bold: true, size: 14 };
  worksheet.mergeCells(titleRow.number, 1, titleRow.number, colCount);
  titleRow.getCell(1).alignment = { horizontal: "center" };
  worksheet.addRow([]);

  buildProductTurnoverHeader(worksheet, t, separateReturnOut, colCount);

  for (const row of grouped) {
    if (row.type === "category") {
      const r = worksheet.addRow([`${groupLabel}: ${row.name}`]);
      worksheet.mergeCells(r.number, 1, r.number, colCount);
      r.font = { bold: true };
      r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: CATEGORY_FILL } };
      continue;
    }
    if (row.type === "subtotal" || row.type === "grand_total") {
      const isGrand = row.type === "grand_total";
      const outQty = row.totals.out_qty + (!separateReturnOut ? row.totals.return_out_qty : 0);
      const outBefore = row.totals.out_before_discount + (!separateReturnOut ? row.totals.return_out_value : 0);
      const outAfter = row.totals.out_after_discount + (!separateReturnOut ? row.totals.return_out_value : 0);
      const values = [
        isGrand ? t("GrandTotal") : totalLabel, "", "",
        row.totals.opening_qty, row.totals.opening_value,
        row.totals.in_qty, row.totals.in_value,
        row.totals.return_in_qty, row.totals.return_in_value,
        outQty, outBefore, row.totals.out_discount, outAfter,
        ...(separateReturnOut ? [row.totals.return_out_qty, row.totals.return_out_value] : []),
        row.totals.move_qty, row.totals.move_value,
        row.totals.closing_qty, row.totals.closing_value,
      ];
      const r = worksheet.addRow(values);
      worksheet.mergeCells(r.number, 1, r.number, 3);
      r.font = { bold: true };
      r.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isGrand ? GRAND_FILL : TOTAL_FILL } };
        cell.border = thin;
        if (colNumber >= 4) cell.numFmt = (colNumber - 4) % 2 === 0 ? QTY_NUMFMT : FLOAT_NUMFMT;
      });
      continue;
    }

    const p = row;
    const outQty = num(p.out_qty) + (!separateReturnOut ? num(p.return_out_qty) : 0);
    const outBefore = num(p.out_before_discount) + (!separateReturnOut ? num(p.return_out_value) : 0);
    const outAfter = num(p.out_after_discount) + (!separateReturnOut ? num(p.return_out_value) : 0);

    const values = [
      p.displayNumber, p.name, p.unit,
      num(p.opening_qty), num(p.opening_value),
      num(p.in_qty), num(p.in_value),
      num(p.return_in_qty), num(p.return_in_value),
      outQty, outBefore, num(p.out_discount), outAfter,
      ...(separateReturnOut ? [num(p.return_out_qty), num(p.return_out_value)] : []),
      num(p.move_qty), num(p.move_value),
      num(p.closing_qty), num(p.closing_value),
    ];
    const r = worksheet.addRow(values);
    r.eachCell((cell, colNumber) => {
      cell.border = thin;
      if (colNumber >= 4) cell.numFmt = (colNumber - 4) % 2 === 0 ? QTY_NUMFMT : FLOAT_NUMFMT;
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `product_turnover_${periodFrom}_${periodTo}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}
