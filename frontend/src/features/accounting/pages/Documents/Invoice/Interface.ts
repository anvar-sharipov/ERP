// frontend/src/features/accounting/pages/Documents/Invoice/Interface.ts

import type { JSX } from "react";
import { DOC_IN_ICON, DOC_MOVE_ICON, DOC_OUT_ICON, DOC_RETURN_IN_ICON, DOC_RETURN_OUT_ICON } from "../../../../../components/Icons/LeftBarIcons";

// ── Column system ─────────────────────────────────────────────────────────────

export type ColumnKey =
  | "index"
  | "thumbnail"
  | "sku"
  | "barcode"
  | "product"
  | "unit"
  | "quantity"
  | "cost_price"
  | "price"
  | "discount_percent"
  | "discount_amount"
  | "total"
  | "income"
  | "income_percent"
  | "weight"
  | "volume_m3"
  | "length"
  | "width"
  | "height";

export interface ColVisibility {
  screen: boolean;
  print: boolean;
}

export interface ColumnDef {
  key: ColumnKey;
  label: string;           // i18n ключ
  visibleScreen: boolean;
  visiblePrint: boolean;
  locked?: boolean;        // нельзя скрыть (например "product", "total")
  align?: "left" | "right" | "center";
  width?: string;          // например "w-20"
}

// Дефолтные настройки колонок
export const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: "index",           label: "#",               visibleScreen: true,  visiblePrint: true,  locked: true,  align: "left",   width: "w-6"  },
  { key: "thumbnail",       label: "Photo",            visibleScreen: true,  visiblePrint: false, locked: false, align: "center", width: "w-12" },
  { key: "sku",             label: "SKU",              visibleScreen: false, visiblePrint: true,  locked: false, align: "left",   width: "w-24" },
  { key: "barcode",         label: "Barcode",          visibleScreen: false, visiblePrint: false, locked: false, align: "left",   width: "w-28" },
  { key: "product",         label: "Product",          visibleScreen: true,  visiblePrint: true,  locked: true,  align: "left"                 },
  { key: "unit",            label: "Unit",             visibleScreen: true,  visiblePrint: true,  locked: false, align: "left",   width: "w-16" },
  { key: "quantity",        label: "Quantity",         visibleScreen: true,  visiblePrint: true,  locked: false, align: "right",  width: "w-24" },
  { key: "price",           label: "Price",            visibleScreen: true,  visiblePrint: true,  locked: false, align: "right",  width: "w-28" },
  { key: "cost_price",      label: "CostPrice",        visibleScreen: false, visiblePrint: false, locked: false, align: "right",  width: "w-28" },
  { key: "discount_percent",label: "DiscountPercent",  visibleScreen: true,  visiblePrint: false, locked: false, align: "right",  width: "w-20" },
  { key: "discount_amount", label: "DiscountAmount",   visibleScreen: false, visiblePrint: false, locked: false, align: "right",  width: "w-28" },
  { key: "total",           label: "Total",            visibleScreen: true,  visiblePrint: true,  locked: true,  align: "right",  width: "w-28" },
  { key: "income",          label: "Income",           visibleScreen: false, visiblePrint: false, locked: false, align: "right",  width: "w-28" },
  { key: "income_percent",  label: "IncomePercent",    visibleScreen: false, visiblePrint: false, locked: false, align: "right",  width: "w-20" },
  { key: "weight",          label: "Weight",           visibleScreen: false, visiblePrint: false, locked: false, align: "right",  width: "w-20" },
  { key: "volume_m3",       label: "Volume",           visibleScreen: false, visiblePrint: false, locked: false, align: "right",  width: "w-20" },
  { key: "length",          label: "Length",           visibleScreen: false, visiblePrint: false, locked: false, align: "right",  width: "w-20" },
  { key: "width",           label: "Width",            visibleScreen: false, visiblePrint: false, locked: false, align: "right",  width: "w-20" },
  { key: "height",          label: "Height",           visibleScreen: false, visiblePrint: false, locked: false, align: "right",  width: "w-20" },
];

// ✅ Экран и печать/Excel управляются НЕЗАВИСИМО (см. галочки "ЭКРАН"/"ПЕЧАТЬ" в
// кнопке "Колонки") — колонка может быть скрыта на экране, но включена в печать/Excel
// (например SKU), и наоборот. Список колонок для рендера — объединение обоих флагов,
// а видимость в каждом режиме регулируется этим классом.
export function colVisibilityClass(col: ColumnDef): string {
  const parts: string[] = [];
  if (!col.visibleScreen) parts.push("hidden");
  if (!col.visiblePrint) {
    parts.push("print:hidden");
  } else if (!col.visibleScreen) {
    // скрыта на экране, но должна появиться в печати — явно возвращаем display
    parts.push("print:table-cell");
  }
  return parts.join(" ");
}

// ── Models ────────────────────────────────────────────────────────────────────

export interface BundleItem {
  id: number;
  bundle_product_id: number;
  bundle_product_name: string;
  bundle_product_unit: number | null;
  bundle_product_unit_name: string;
  bundle_product_thumbnail?: string | null;
  qty_ratio: number;
  default_price: number;
}

export interface VolumeDiscount {
  id: number;
  price_type: number | null;
  min_qty: string;
  max_qty: string | null;
  discount_percent: string;
}

export interface QuantityPromotion {
  id: number;
  price_type: number | null;
  min_qty: string;
  max_qty: string | null;
  free_qty: string;
}

export interface Product {
  id: number;
  name: string;
  sku?: string;
  barcode?: string;
  unit?: number;
  unit_detail?: { name: string };
  cost_price?: number;
  prices?: { price_type: number; price: number }[];
  bundle_items?: BundleItem[];
  volume_discounts?: VolumeDiscount[];
  quantity_promotions?: QuantityPromotion[];
  // физические характеристики
  weight?: number;
  volume_m3?: number;
  length?: number;
  width?: number;
  height?: number;
  // изображение — thumbnail_url для мелких иконок в таблице/списке, image_url —
  // полноразмерное фото, уже приходит в том же ответе API (без доп. запроса по клику)
  main_image?: { thumbnail_url: string | null; image_url?: string | null } | null;
}

export interface ItemRow {
  id: number | null;
  _key: string;
  product: number | null;
  product_name: string;
  unit: number | null;
  unit_name: string;
  quantity: string;
  price: string;
  discount_percent: string;
  cost_price: string;
  // дополнительные поля из продукта
  sku?: string;
  barcode?: string;
  weight?: string;
  volume_m3?: string;
  length?: string;
  width?: string;
  height?: string;
  thumbnail?: string | null;
  // комплектующая строка
  is_bundle?: boolean;
  parent_key?: string;
  bundle_ratio?: number;
  // строка бесплатного бонуса по акции "количество за количество"
  is_promo?: boolean;
  discount_manual?: boolean;
}

export interface DocHeader {
  document_type: string;
  date: string;
  warehouse: number | null;
  warehouse_to: number | null;
  branch: number | null;
  counterparty: number | null;
  default_price_type: number | null;
  discount_percent: string;
  note: string;
}

export interface DocumentHeader {
  document_type: string;
  date: string;
  warehouse: number | null;
  warehouse_to?: number | null;
  branch?: number | null;
  counterparty?: number | null;
  default_price_type?: number | null;
  discount_percent: string | number;
  note: string;
}

export interface ParticipantRow {
  id: number | null;
  _key: string;
  employee: number | null;
  role: string;
}

export interface ProductRowProps {
  isPosted: boolean;
  setItems: React.Dispatch<React.SetStateAction<ItemRow[]>>;
  items: ItemRow[];
  updateItem: (key: string, field: keyof ItemRow, value: any) => void;
  products: Product[];
  lineTotal: (row: ItemRow) => number;
  removeItem: (row: ItemRow) => void;
  subtotal: number;
  discAmount: number;
  total: number;
  disabled?: boolean;
  defaultPriceType?: number | null;
  // колонки
  columns: ColumnDef[];
  onColumnsChange: (cols: ColumnDef[]) => void;
  warehouseId?: number | null;
  onBack?: () => void;
}

export const DOC_TYPE_ICONS: Record<string, JSX.Element> = {
  in: DOC_IN_ICON,
  out: DOC_OUT_ICON,
  move: DOC_MOVE_ICON,
  return_in: DOC_RETURN_IN_ICON,
  return_out: DOC_RETURN_OUT_ICON,
};
