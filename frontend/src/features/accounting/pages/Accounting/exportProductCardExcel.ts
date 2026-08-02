// frontend/src/features/accounting/pages/Accounting/exportProductCardExcel.ts
import ExcelJS from "exceljs";
import { addExcelHeader } from "../../../../core/utils/excelHelpers";

interface CardRow {
  date: string;
  document_type: string;
  document_number: string;
  partner: string;
  note: string;
  price: number;
  in_qty: number; in_sum: number;
  return_qty: number; return_sum: number;
  out_qty: number; out_sum: number;
  balance_qty: number; balance_sum: number;
}

export interface ProductCardExport {
  product_name: string;
  product_sku: string | null;
  product_unit: string;
  start_quantity: number;
  start_value: number;
  turnover: { in_qty: number; in_value: number; return_qty: number; return_value: number; out_qty: number; out_value: number };
  end: { quantity: number; value: number };
  rows: CardRow[];
}

interface CompanyLike {
  name?: string;
  logo?: string | null;
  logo2?: string | null;
}

interface UserLike {
  full_name?: string;
}

export interface ExportProductCardExcelOptions {
  company: CompanyLike | null | undefined;
  user: UserLike | null | undefined;
  t: (key: string) => string;
  dateFrom: string;
  dateTo: string;
  cards: ProductCardExport[];
}

const DOC_TYPE_LABELS: Record<string, string> = {
  in: "Приход",
  out: "Расход",
  return_in: "Возврат клиента",
  return_out: "Возврат поставщику",
  move: "Перемещение",
};

const movementQty = (r: CardRow) => (Number(r.in_qty) ? Number(r.in_qty) : Number(r.return_qty) ? Number(r.return_qty) : -Number(r.out_qty || 0));
const movementSum = (r: CardRow) => (Number(r.in_qty) ? Number(r.in_sum) : Number(r.return_qty) ? Number(r.return_sum) : -Number(r.out_sum || 0));

const FLOAT_NUMFMT = "#,##0.00";
const HEADER_FILL = "FFE0E0E0";
const SUBTOTAL_FILL = "FFF2F2F2";
const thin = { top: { style: "thin" as const }, left: { style: "thin" as const }, bottom: { style: "thin" as const }, right: { style: "thin" as const } };

// ✅ №, Дата, Тип, Документ, Контрагент, Примечание, Цена, Кол-во, Сумма, Остаток
// (кол-во/сумма) — 10 колонок, как на экране (ProductCardPage.tsx). Может
// содержать несколько товаров подряд (когда товар не выбран — по умолчанию
// показываются карточки сразу по всем товарам с движением за период).
export async function exportProductCardExcel(opts: ExportProductCardExcelOptions): Promise<void> {
  const { company, user, t, dateFrom, dateTo, cards } = opts;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(t("ProductCard"));

  await addExcelHeader(workbook, worksheet, company, user, t);

  const titleRow = worksheet.addRow([`${t("ProductCard")}, ${new Date(dateFrom).toLocaleDateString("ru-RU")} — ${new Date(dateTo).toLocaleDateString("ru-RU")}`]);
  titleRow.font = { bold: true, size: 14 };
  worksheet.mergeCells(titleRow.number, 1, titleRow.number, 10);
  titleRow.getCell(1).alignment = { horizontal: "center" };
  worksheet.addRow([]);

  for (const card of cards) {
    const labelRow = worksheet.addRow([card.product_sku ? `${card.product_name} (${card.product_sku})` : card.product_name]);
    worksheet.mergeCells(labelRow.number, 1, labelRow.number, 10);
    labelRow.getCell(1).font = { bold: true };
    labelRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBTOTAL_FILL } };
      cell.border = thin;
    });

    const summaryRow = worksheet.addRow([
      `${t("Unit")}: ${card.product_unit}  ${t("OpeningBalance")}: ${card.start_quantity}/${card.start_value.toFixed(2)}  ${t("ClosingBalance")}: ${card.end.quantity}/${card.end.value.toFixed(2)}`,
    ]);
    worksheet.mergeCells(summaryRow.number, 1, summaryRow.number, 10);

    const colHeaderRow = worksheet.addRow(["№", t("Date"), t("DocumentType"), t("InvoiceNumber"), t("Counterparty"), t("Comment"), t("Price"), t("Quantity"), t("Sum"), t("Balance")]);
    colHeaderRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
      cell.alignment = { horizontal: "center" };
      cell.border = thin;
    });

    card.rows.forEach((row, i) => {
      const excelRow = worksheet.addRow([
        i + 1,
        new Date(row.date).toLocaleDateString("ru-RU"),
        DOC_TYPE_LABELS[row.document_type] ?? row.document_type,
        row.document_number,
        row.partner,
        row.note,
        row.price,
        movementQty(row),
        movementSum(row),
        row.balance_qty,
      ]);
      excelRow.eachCell((cell, colNumber) => {
        cell.border = thin;
        if (colNumber >= 7) cell.numFmt = FLOAT_NUMFMT;
      });
      excelRow.getCell(1).alignment = { horizontal: "center" };
    });

    worksheet.addRow([]);
  }

  worksheet.columns.forEach((col, i) => {
    col.width = i === 0 ? 6 : i === 5 ? 30 : i === 4 ? 22 : 16;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${t("ProductCard")}_${new Date().toLocaleDateString("ru-RU").replace(/\./g, "-")}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}
