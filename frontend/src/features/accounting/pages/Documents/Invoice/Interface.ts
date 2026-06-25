// frontend/src/features/accounting/pages/Documents/Invoice/Interface.ts

export interface BundleItem {
  id: number;
  bundle_product_id: number;
  bundle_product_name: string;
  bundle_product_unit: number | null;
  bundle_product_unit_name: string;
  qty_ratio: number;
  default_price: number;
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

  // Комплектующая строка
  is_bundle?: boolean;          // true = это авто-комплектующая
  parent_key?: string;          // _key родительской строки
  bundle_ratio?: number;        // qty_ratio из ProductBundle (для пересчёта)
}

export interface DocHeader {
  document_type: string;
  date: string;
  warehouse: number | null;
  warehouse_to: number | null;
  branch: number | null;  // ← добавить
  counterparty: number | null;
  default_price_type: number | null;
  discount_percent: string;
  note: string;
}

export interface ParticipantRow {
  id: number | null;
  _key: string;
  employee: number | null;
  role: string;
}

export interface Product {
  id: number;
  name: string;
  unit?: number;
  unit_detail?: { name: string };
  cost_price?: number;
  prices?: { price_type: number; price: number }[];
  bundle_items?: BundleItem[];
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
  discPercent: number;
  discAmount: number;
  total: number;
  disabled?: boolean;
  defaultPriceType?: number | null;
}

// export interface DocumentHeader {
//   document_type: string;
//   date: string;
//   warehouse: number | null;
//   warehouse_to?: number | null;
//   counterparty?: number | null;
//   default_price_type?: number | null;
//   discount_percent: string | number;
//   note: string;
// }

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