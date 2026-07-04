// frontend/src/features/accounting/pages/Documents/Invoice/exportDocumentExcel.ts
import ExcelJS from "exceljs";
import { addExcelHeader } from "../../../../../core/utils/excelHelpers";
import { calcRowIncome } from "./Vars";
import { type ColumnDef, type ItemRow } from "./Interface";

// ── Ключи колонок товарной таблицы, которые имеет смысл выгружать в Excel ──────
// (thumbnail пропускаем — картинки в Excel избыточны для этого отчёта)
const EXPORTABLE_KEYS = new Set<ColumnDef["key"]>([
  "index",
  "sku",
  "barcode",
  "product",
  "unit",
  "quantity",
  "cost_price",
  "price",
  "discount_percent",
  "discount_amount",
  "total",
  "income",
  "income_percent",
  "weight",
  "volume_m3",
  "length",
  "width",
  "height",
]);

// ── Колонки, которые пользователь просил выделить (наименование/кол-во/все цены/
// все скидки) — базовый шрифт таблицы чуть увеличен, эти колонки — ещё чуть крупнее.
const EMPHASIZED_KEYS = new Set<ColumnDef["key"]>(["product", "quantity", "cost_price", "price", "discount_percent", "discount_amount", "total"]);
const BASE_FONT_SIZE = 12;
const EMPHASIZED_FONT_SIZE = 13;
const COUNTERPARTY_FONT_SIZE = 16;

// ── Денежные/процентные колонки — отображаются как float с фиксированными 2 знаками
// после запятой (как в настоящих документах), а не "как получится" в General-формате Excel.
const FLOAT_KEYS = new Set<ColumnDef["key"]>(["cost_price", "price", "discount_percent", "discount_amount", "total", "income", "income_percent"]);
const FLOAT_NUMFMT = "#,##0.00";

// ── Узкие колонки — сузил по просьбе пользователя (#, ед. изм., цена, скидка, итого).
// Ширина в "символах" Excel; всё, чего нет в карте, использует DEFAULT_COLUMN_WIDTH.
const NARROW_COLUMN_WIDTHS: Partial<Record<ColumnDef["key"], number>> = {
  index: 5,
  unit: 8,
  cost_price: 10,
  price: 10,
  discount_percent: 8,
  discount_amount: 10,
  total: 12,
};
const PRODUCT_COLUMN_WIDTH = 32;
const DEFAULT_COLUMN_WIDTH = 16;

const fmt = (n: number) => Number(n.toFixed(2));

interface HeaderInfoLine {
  label: string;
  value: string;
}

// ✅ Несколько label/value-пар в ОДНОЙ строке (например "Дата: ... Склад: ...") —
// как в компактной печатной шапке (HeadDocument.tsx print-блок), а не отдельной строкой на каждую пару.
interface HeaderInfoRow {
  parts: HeaderInfoLine[];
}

// ── company/user приходят из CompanyContext/UserContext, где типизированы как `any` —
// здесь описываем только то, что реально читает addExcelHeader, без нового `any`.
interface CompanyLike {
  name?: string;
  logo?: string | null;
  logo2?: string | null;
}

interface UserLike {
  full_name?: string;
  position?: string;
}

export interface ExportDocumentExcelOptions {
  company: CompanyLike | null | undefined;
  user: UserLike | null | undefined;
  t: (key: string, params?: Record<string, unknown>) => string;
  fileNamePrefix: string; // например "Invoice" — используется в имени файла
  docTitle: string; // "Приходная накладная №123"
  headerLines: (HeaderInfoLine | HeaderInfoRow)[]; // Дата/Склад/Скидка(если не 0)/Участники — уже готовые label/value пары
  counterpartyLine?: { name: string; phone?: string }; // выводится отдельно, крупным шрифтом
  driverLine?: { label: string; name: string }; // "Авто" — выводится под таблицей товаров
  columns: ColumnDef[]; // видимые на экране колонки (visibleScreen) — те же, что участвуют в печати
  mainItems: ItemRow[];
  bundleItems: ItemRow[];
  promoItems: ItemRow[];
  lineTotal: (row: ItemRow) => number;
  totals: {
    subtotal: number;
    discAmount: number;
    total: number;
  };
}

function cellValueForColumn(col: ColumnDef, row: ItemRow, index: number, lineTotal: (row: ItemRow) => number): string | number {
  switch (col.key) {
    case "index":
      return index + 1;
    case "sku":
      return row.sku || "—";
    case "barcode":
      return row.barcode || "—";
    case "product":
      return row.product_name;
    case "unit":
      return row.unit_name || "—";
    case "quantity":
      return fmt(parseFloat(row.quantity) || 0);
    case "cost_price":
      return fmt(parseFloat(row.cost_price) || 0);
    case "price":
      return fmt(parseFloat(row.price) || 0);
    case "discount_percent":
      return fmt(parseFloat(row.discount_percent) || 0);
    case "discount_amount": {
      const qty = parseFloat(row.quantity) || 0;
      const price = parseFloat(row.price) || 0;
      const disc = parseFloat(row.discount_percent) || 0;
      return fmt(qty * price * (disc / 100));
    }
    case "total":
      return fmt(lineTotal(row));
    case "income":
      return fmt(calcRowIncome(row));
    case "income_percent": {
      const price = parseFloat(row.price) || 0;
      const cost = parseFloat(row.cost_price) || 0;
      const disc = parseFloat(row.discount_percent) || 0;
      const salePrice = price * (1 - disc / 100);
      return salePrice === 0 ? 0 : fmt(((salePrice - cost) / salePrice) * 100);
    }
    case "weight":
      return row.weight ? fmt(parseFloat(row.weight)) : "—";
    case "volume_m3":
      return row.volume_m3 ? fmt(parseFloat(row.volume_m3)) : "—";
    case "length":
      return row.length ? fmt(parseFloat(row.length)) : "—";
    case "width":
      return row.width ? fmt(parseFloat(row.width)) : "—";
    case "height":
      return row.height ? fmt(parseFloat(row.height)) : "—";
    default:
      return "";
  }
}

export async function exportDocumentExcel(opts: ExportDocumentExcelOptions): Promise<void> {
  const { company, user, t, fileNamePrefix, docTitle, headerLines, counterpartyLine, driverLine, columns, mainItems, bundleItems, promoItems, lineTotal, totals } = opts;

  const exportCols = columns.filter((c) => EXPORTABLE_KEYS.has(c.key));
  // ✅ Ширина шапки (в колонках) — на неё же merge'им заголовок/инфо-строки/контрагента,
  // чтобы длинный текст не "прилипал" к одной колонке A (где потом стоит колонка "#").
  const headerSpan = Math.max(exportCols.length, 6);

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(t("Document"));

  // ── Шапка компании + pageSetup (обязательный общий хелпер — см. CLAUDE.md) ──
  await addExcelHeader(workbook, worksheet, company, user, t);

  // ── Заголовок документа ──────────────────────────────────────────────────────
  const titleRow = worksheet.addRow([docTitle]);
  titleRow.font = { bold: true, size: 14 };
  worksheet.mergeCells(titleRow.number, 1, titleRow.number, headerSpan);
  titleRow.getCell(1).alignment = { horizontal: "center" };
  worksheet.addRow([]);

  // ── Инфо-блок шапки документа ────────────────────────────────────────────────
  // ✅ Метка ("Дата:", "Склад:" и т.п.) тоже merge'ится на свои колонки — иначе
  // соседняя ячейка значения (уже занятая, с anchor-значением) не даёт тексту
  // "перетечь" через overflow, и длинная метка обрезается визуально.
  const labelSpanEnd = 2;
  const valueCol = labelSpanEnd + 1;
  for (const line of headerLines) {
    if ("parts" in line) {
      // ✅ Несколько пар в одной строке через richText — один прогон с полужирными
      // метками и обычными значениями, вся строка объединена в одну ячейку.
      const richText: { font?: { bold: boolean }; text: string }[] = [];
      line.parts.forEach((part, i) => {
        if (i > 0) richText.push({ text: "     " });
        richText.push({ font: { bold: true }, text: `${part.label} ` });
        richText.push({ text: part.value });
      });
      const row = worksheet.addRow([{ richText } as unknown as string]);
      worksheet.mergeCells(row.number, 1, row.number, headerSpan);
      continue;
    }

    const values = new Array(headerSpan).fill("");
    values[0] = line.label;
    if (valueCol <= headerSpan) values[valueCol - 1] = line.value;
    const row = worksheet.addRow(values);
    row.getCell(1).font = { bold: true };
    worksheet.mergeCells(row.number, 1, row.number, labelSpanEnd);
    if (valueCol <= headerSpan) worksheet.mergeCells(row.number, valueCol, row.number, headerSpan);
  }

  // ── Контрагент — отдельно, крупным шрифтом ──────────────────────────────────
  if (counterpartyLine) {
    const nameSpanEnd = Math.max(headerSpan - 2, 1);
    const phoneCol = nameSpanEnd + 1;
    // ✅ Значение должно лежать в АНКОРНОЙ (первой/левой) ячейке своего будущего
    // merge-диапазона — Excel сохраняет только значение top-left ячейки при merge,
    // всё остальное в диапазоне отбрасывается (см. правило в CLAUDE.md).
    const values = new Array(headerSpan).fill("");
    values[0] = `${t("Counterparty")}: ${counterpartyLine.name}`;
    if (phoneCol <= headerSpan) values[phoneCol - 1] = counterpartyLine.phone ?? "";
    const row = worksheet.addRow(values);
    row.getCell(1).font = { bold: true, size: COUNTERPARTY_FONT_SIZE };
    if (phoneCol <= headerSpan) row.getCell(phoneCol).font = { size: Math.round(COUNTERPARTY_FONT_SIZE * 0.6) };
    worksheet.mergeCells(row.number, 1, row.number, nameSpanEnd);
    if (nameSpanEnd < headerSpan) worksheet.mergeCells(row.number, phoneCol, row.number, headerSpan);
  }
  worksheet.addRow([]);

  // ── Таблица товаров ──────────────────────────────────────────────────────────
  const headerRowValues = exportCols.map((c) => (c.key === "index" ? "#" : t(c.label)));
  const tableHeaderRow = worksheet.addRow(headerRowValues);
  tableHeaderRow.font = { bold: true, size: BASE_FONT_SIZE };
  tableHeaderRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
    cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  const allRows = [...mainItems, ...bundleItems, ...promoItems];
  allRows.forEach((row, idx) => {
    const values = exportCols.map((c) => cellValueForColumn(c, row, idx, lineTotal));
    const excelRow = worksheet.addRow(values);
    excelRow.eachCell((cell, colNumber) => {
      const key = exportCols[colNumber - 1]?.key;
      cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      // ✅ Наименование/кол-во/все цены/все скидки — чуть крупнее остальных колонок
      cell.font = { size: EMPHASIZED_KEYS.has(key) ? EMPHASIZED_FONT_SIZE : BASE_FONT_SIZE };
      // ✅ Цены/скидки/итого — float с фиксированными 2 знаками, как в настоящих документах
      if (FLOAT_KEYS.has(key)) cell.numFmt = FLOAT_NUMFMT;
    });
  });

  // ── Итоги — часть той же таблицы (без пустой строки-разделителя), с теми же
  // границами и заливкой, что и остальные строки/шапка таблицы.
  const totalColIdx = exportCols.findIndex((c) => c.key === "total");
  const addTotalRow = (label: string, value: number) => {
    const labelIdx = totalColIdx !== -1 ? Math.max(totalColIdx - 1, 0) : 0;
    const valueIdx = totalColIdx !== -1 ? totalColIdx : 1;
    const labelCol = labelIdx + 1;
    const labelMergeStart = Math.max(1, labelCol - 3);

    // ✅ Метка пишется в АНКОРНУЮ (левую) ячейку своего будущего merge-диапазона —
    // Excel сохраняет только значение top-left ячейки при merge, значение в любой
    // другой ячейке диапазона отбрасывается (см. правило в CLAUDE.md про Excel-тексты).
    const values = new Array(exportCols.length).fill("");
    values[labelMergeStart - 1] = label;
    values[valueIdx] = fmt(value);

    const row = worksheet.addRow(values);
    row.font = { bold: true, size: BASE_FONT_SIZE };
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
      cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    });
    row.getCell(valueIdx + 1).numFmt = FLOAT_NUMFMT;
    row.getCell(labelMergeStart).alignment = { horizontal: "right" };
    if (labelMergeStart < labelCol) worksheet.mergeCells(row.number, labelMergeStart, row.number, labelCol);
  };

  addTotalRow(t("Subtotal") + ":", totals.subtotal);
  if (totals.discAmount > 0.004) addTotalRow(t("Discount") + ":", -totals.discAmount);
  addTotalRow(t("TotalAfterDiscount") + ":", totals.total);

  // ── "Авто" (сотрудник/водитель) — под таблицей товаров ──────────────────────
  if (driverLine) {
    worksheet.addRow([]);
    const row = worksheet.addRow([`${driverLine.label}:`, "", driverLine.name]);
    row.getCell(1).font = { bold: true };
    // ✅ merge, чтобы длинное ФИО не "пряталось" за соседними (возможно узкими)
    // колонками товарной таблицы — см. правило в CLAUDE.md про Excel-тексты.
    worksheet.mergeCells(row.number, 1, row.number, 2);
    worksheet.mergeCells(row.number, 3, row.number, headerSpan);
  }

  // ── Ширина колонок ───────────────────────────────────────────────────────────
  worksheet.columns.forEach((col, i) => {
    const key = exportCols[i]?.key;
    col.width = key === "product" ? PRODUCT_COLUMN_WIDTH : (NARROW_COLUMN_WIDTHS[key] ?? DEFAULT_COLUMN_WIDTH);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileNamePrefix}_${new Date().toLocaleDateString("ru-RU").replace(/\./g, "-")}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}
