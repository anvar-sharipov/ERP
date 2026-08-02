// frontend/src/features/accounting/pages/Reports/universalFilterColumns.ts
import type { TFunction } from "i18next";
import { formatDateDisplay } from "../../../../core/utils/formatDate";

export type UniversalFilterGroupBy = "none" | "product" | "counterparty" | "employee" | "warehouse" | "document_type";

export interface UniversalFilterRow {
  [key: string]: string | number | null | undefined;
}

export interface UniversalFilterColumn {
  key: string;
  label: string;
  numeric?: boolean;
  width?: number;
}

// ✅ Раздел "Проводки"/AuditLogPage уже переводит сырые коды типа документа
// через t("in")/t("out")/t("move")/t("return_in")/t("return_out") (см.
// locales/ru/translation.json) — переиспользуем те же ключи, не заводим
// новые DocType*.
export const documentTypeLabel = (t: TFunction, type: string | null | undefined) => (type ? t(type) : "");

const GROUP_LABEL_KEYS: Record<Exclude<UniversalFilterGroupBy, "none">, string> = {
  product: "Product",
  counterparty: "Counterparty",
  employee: "Employee",
  warehouse: "Warehouse",
  document_type: "DocumentType",
};

/**
 * Единственное место, где живёт "фиксированный набор вариантов таблицы"
 * универсального фильтра — импортируется и экраном (UniversalFilterTable.tsx),
 * и Excel-экспортом (exportUniversalFilterExcel.ts), поэтому они структурно
 * не могут разойтись (см. CLAUDE.md про screen/print/excel drift).
 */
export function getColumnsFor(groupBy: UniversalFilterGroupBy, hasProfit: boolean, t: TFunction): UniversalFilterColumn[] {
  if (groupBy === "none") {
    const cols: UniversalFilterColumn[] = [
      { key: "date", label: t("Date"), width: 90 },
      { key: "document_number", label: t("InvoiceNumber"), width: 120 },
      { key: "document_type", label: t("DocumentType"), width: 130 },
      { key: "product_name", label: t("Product"), width: 220 },
      { key: "counterparty_name", label: t("Counterparty"), width: 180 },
      { key: "warehouse_name", label: t("Warehouse"), width: 140 },
      { key: "quantity", label: t("Quantity"), numeric: true, width: 90 },
      { key: "price", label: t("Price"), numeric: true, width: 100 },
      { key: "amount", label: t("Amount"), numeric: true, width: 120 },
    ];
    if (hasProfit) cols.push({ key: "profit", label: t("Profit"), numeric: true, width: 110 });
    return cols;
  }

  const cols: UniversalFilterColumn[] = [
    { key: "group_label", label: t(GROUP_LABEL_KEYS[groupBy]), width: 240 },
    { key: "quantity", label: t("Quantity"), numeric: true, width: 100 },
    { key: "amount", label: t("Amount"), numeric: true, width: 130 },
  ];
  if (hasProfit) cols.push({ key: "profit", label: t("Profit"), numeric: true, width: 120 });
  cols.push({ key: "documents_count", label: t("DocumentsCount"), numeric: true, width: 110 });
  return cols;
}

const fmtQty = (v: number) => v.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
const fmtMoney = (v: number) => v.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Отображаемое значение ячейки — общее для экрана и Excel. */
export function getCellValue(row: UniversalFilterRow, col: UniversalFilterColumn, t: TFunction): string {
  const raw = row[col.key];
  if (raw === null || raw === undefined) return "";
  if (col.key === "date") return formatDateDisplay(String(raw));
  if (col.key === "document_type") return documentTypeLabel(t, String(raw));
  if (col.key === "quantity" || col.key === "documents_count") return col.key === "quantity" ? fmtQty(Number(raw)) : String(raw);
  if (col.numeric) return fmtMoney(Number(raw));
  return String(raw);
}
