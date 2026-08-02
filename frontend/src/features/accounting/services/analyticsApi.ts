// frontend/src/features/accounting/services/analyticsApi.ts
import { api } from "../../../core/api/axiosInstance";

export interface SalesDynamicsPoint {
  date: string;
  revenue: number;
  documents_count: number;
  avg_check: number;
}

export interface SalesDynamicsResponse {
  points: SalesDynamicsPoint[];
  total_revenue: number;
  total_documents: number;
  avg_check: number;
  best_point: SalesDynamicsPoint | null;
  granularity: "day" | "week" | "month";
}

export interface ABCItem {
  rank: number;
  product_id: number;
  product_name: string;
  product_sku: string | null;
  revenue: number;
  quantity: number;
  share_pct: number;
  cumulative_pct: number;
  class: "A" | "B" | "C";
}

export interface ABCSummaryRow {
  class: "A" | "B" | "C";
  count: number;
  count_pct: number;
  revenue: number;
  revenue_pct: number;
}

export interface ABCAnalysisResponse {
  items: ABCItem[];
  total_revenue: number;
  total_count: number;
  summary: ABCSummaryRow[];
  threshold_a: number;
  threshold_b: number;
}

export interface XYZItem {
  rank: number;
  product_id: number;
  product_name: string;
  product_sku: string | null;
  total_quantity: number;
  avg_quantity: number;
  cv: number;
  class: "X" | "Y" | "Z";
}

export interface XYZSummaryRow {
  class: "X" | "Y" | "Z";
  count: number;
  count_pct: number;
  quantity: number;
  quantity_pct: number;
}

export interface XYZAnalysisResponse {
  items: XYZItem[];
  total_quantity: number;
  total_count: number;
  summary: XYZSummaryRow[];
  threshold_x: number;
  threshold_y: number;
  periods_count: number;
}

export interface MarginItem {
  rank: number;
  product_id: number;
  product_name: string;
  product_sku: string | null;
  quantity: number;
  revenue: number;
  cost: number;
  profit: number;
  margin_pct: number;
  markup_pct: number;
  band: "negative" | "low" | "normal";
}

export interface MarginBandSummary {
  band: "negative" | "low" | "normal";
  count: number;
  count_pct: number;
  revenue: number;
  profit: number;
}

export interface MarginAnalysisResponse {
  items: MarginItem[];
  total_revenue: number;
  total_cost: number;
  total_profit: number;
  total_margin_pct: number;
  total_count: number;
  band_summary: MarginBandSummary[];
  low_margin_threshold: number;
}

export interface CategoryItem {
  rank: number;
  group_id: number | null;
  group_name: string | null;
  no_name_key: "NoCategory" | "NoBrand" | null;
  quantity: number;
  revenue: number;
  cost: number;
  profit: number;
  margin_pct: number;
  revenue_pct: number;
  products_count: number;
}

export interface CategoryAnalysisResponse {
  items: CategoryItem[];
  total_revenue: number;
  total_quantity: number;
  total_cost: number;
  total_profit: number;
  total_count: number;
  group_by: "category" | "brand";
}

export const analyticsApi = {
  getSalesDynamics: async (params: { date_from: string; date_to: string; granularity: "day" | "week" | "month"; warehouse?: string; branch?: string }) => {
    const res = await api.get("/accounting/analytics/sales-dynamics/", { params });
    return res.data as SalesDynamicsResponse;
  },

  getABCAnalysis: async (params: {
    date_from: string;
    date_to: string;
    warehouse?: string;
    branch?: string;
    category?: string;
    brand?: string;
    threshold_a?: number;
    threshold_b?: number;
  }) => {
    const res = await api.get("/accounting/analytics/abc-analysis/", { params });
    return res.data as ABCAnalysisResponse;
  },

  getXYZAnalysis: async (params: {
    date_from: string;
    date_to: string;
    warehouse?: string;
    branch?: string;
    category?: string;
    brand?: string;
    threshold_x?: number;
    threshold_y?: number;
  }) => {
    const res = await api.get("/accounting/analytics/xyz-analysis/", { params });
    return res.data as XYZAnalysisResponse;
  },

  getMarginAnalysis: async (params: {
    date_from: string;
    date_to: string;
    warehouse?: string;
    branch?: string;
    category?: string;
    brand?: string;
    low_margin_threshold?: number;
  }) => {
    const res = await api.get("/accounting/analytics/margin-analysis/", { params });
    return res.data as MarginAnalysisResponse;
  },

  getCategoryAnalysis: async (params: { date_from: string; date_to: string; warehouse?: string; branch?: string; group_by: "category" | "brand" }) => {
    const res = await api.get("/accounting/analytics/category-analysis/", { params });
    return res.data as CategoryAnalysisResponse;
  },
};
