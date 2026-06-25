export interface ProductFormData {
  name: string;
  sku: string;
  barcode: string;
  qr_code: string;
  category: number | null;
  brand: number | null;
  unit: number | null;
  tag_ids: number[];
  cost_price: string;
  min_stock_level: string;
  image_mode: "contain" | "cover";
  is_active: boolean;
  length: string;
  width: string;
  height: string;
  weight: string;
  volume_m3: string;
  description: string;
  extra_data: Record<string, string>;
}



export const EMPTY: ProductFormData = {
  name: "",
  sku: "",
  barcode: "",
  qr_code: "",
  category: null,
  brand: null,
  unit: null,
  tag_ids: [],
  cost_price: "0",
  min_stock_level: "0",
  image_mode: "contain",
  is_active: true,
  length: "0",
  width: "0",
  height: "0",
  weight: "0",
  volume_m3: "0",
  description: "",
  extra_data: {},
};

export const selectClass =
  "w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500";



export interface MainTabProps {
  form: ProductFormData;
  setForm: React.Dispatch<React.SetStateAction<ProductFormData>>;
  units: any[];
  brands: any[];
  tags: any[];
  categories: any[];
  isEdit: boolean;
  description?: string;
}



