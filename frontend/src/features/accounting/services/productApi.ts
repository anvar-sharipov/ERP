// frontend/src/features/accounting/services/productApi.ts
import { api } from "../../../core/api/axiosInstance";

export const unitApi = {
  getAll: async () => {
    const res = await api.get("/accounting/units/");
    return res.data;
  },
  save: async (id: number | null, data: any) => {
    if (id) return api.put(`/accounting/units/${id}/`, data);
    return api.post("/accounting/units/", data);
  },
  delete: async (id: number) => api.delete(`/accounting/units/${id}/`),
};

export const brandApi = {
  getAll: async () => {
    const res = await api.get("/accounting/brands/");
    return res.data;
  },
  save: async (id: number | null, data: any) => {
    if (id) return api.put(`/accounting/brands/${id}/`, data);
    return api.post("/accounting/brands/", data);
  },
  delete: async (id: number) => api.delete(`/accounting/brands/${id}/`),
};

export const tagApi = {
  getAll: async () => {
    const res = await api.get("/accounting/tags/");
    return res.data;
  },
  save: async (id: number | null, data: any) => {
    if (id) return api.put(`/accounting/tags/${id}/`, data);
    return api.post("/accounting/tags/", data);
  },
  delete: async (id: number) => api.delete(`/accounting/tags/${id}/`),
};

export const productCategoryApi = {
  getAll: async () => {
    const res = await api.get("/accounting/product-categories/");
    return res.data;
  },
  save: async (id: number | null, data: any) => {
    if (id) return api.put(`/accounting/product-categories/${id}/`, data);
    return api.post("/accounting/product-categories/", data);
  },
  delete: async (id: number) => api.delete(`/accounting/product-categories/${id}/`),
};

export const productApi = {
  getAll: async () => {
    const res = await api.get("/accounting/products/");
    return res.data;
  },
  save: async (id: number | null, data: any) => {
    if (id) return api.put(`/accounting/products/${id}/`, data);
    return api.post("/accounting/products/", data);
  },
  delete: async (id: number) => api.delete(`/accounting/products/${id}/`),
};

export const counterpartyApi = {
  getAll: async (type?: "client" | "supplier") => {
    const params = type ? `?type=${type}` : "";
    const res = await api.get(`/accounting/counterparties/${params}`);
    return res.data;
  },
  save: async (id: number | null, data: any) => {
    if (id) return api.put(`/accounting/counterparties/${id}/`, data);
    return api.post("/accounting/counterparties/", data);
  },
  delete: async (id: number) => api.delete(`/accounting/counterparties/${id}/`),
};

export const warehouseApi = {
  getAll: async () => {
    const res = await api.get("/accounting/warehouses/");
    return res.data;
  },
  save: async (id: number | null, data: any) => {
    if (id) return api.put(`/accounting/warehouses/${id}/`, data);
    return api.post("/accounting/warehouses/", data);
  },
  delete: async (id: number) => api.delete(`/accounting/warehouses/${id}/`),
};

export const warehouseStockApi = {
  getAll: async (warehouseId?: number, productId?: number) => {
    const params = new URLSearchParams();
    if (warehouseId) params.append("warehouse", String(warehouseId));
    if (productId) params.append("product", String(productId));
    const res = await api.get(`/accounting/warehouse-stocks/?${params}`);
    return res.data;
  },
  save: async (id: number | null, data: any) => {
    if (id) return api.put(`/accounting/warehouse-stocks/${id}/`, data);
    return api.post("/accounting/warehouse-stocks/", data);
  },
  delete: async (id: number) => api.delete(`/accounting/warehouse-stocks/${id}/`),
};