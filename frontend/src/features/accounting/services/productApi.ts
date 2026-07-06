// frontend/src/features/accounting/services/productApi.ts
import { api } from "../../../core/api/axiosInstance";

export const unitApi = {
  getAll: async () => (await api.get("/accounting/units/")).data,
  save: (id: number | null, data: any) =>
    id ? api.put(`/accounting/units/${id}/`, data) : api.post("/accounting/units/", data),
  delete: (id: number) => api.delete(`/accounting/units/${id}/`),
};

export const brandApi = {
  getAll: async () => (await api.get("/accounting/brands/")).data,
  save: (id: number | null, data: any) =>
    id ? api.put(`/accounting/brands/${id}/`, data) : api.post("/accounting/brands/", data),
  delete: (id: number) => api.delete(`/accounting/brands/${id}/`),
};

export const tagApi = {
  getAll: async () => (await api.get("/accounting/tags/")).data,
  save: (id: number | null, data: any) =>
    id ? api.put(`/accounting/tags/${id}/`, data) : api.post("/accounting/tags/", data),
  delete: (id: number) => api.delete(`/accounting/tags/${id}/`),
};

export const productCategoryApi = {
  getAll: async () => (await api.get("/accounting/product-categories/")).data,
  save: (id: number | null, data: any) =>
    id
      ? api.put(`/accounting/product-categories/${id}/`, data)
      : api.post("/accounting/product-categories/", data),
  delete: (id: number) => api.delete(`/accounting/product-categories/${id}/`),
  move: (id: number, parent: number | null) =>
    api.patch(`/accounting/product-categories/${id}/`, { parent }),
};

export const productApi = {
  getAll: async () => (await api.get("/accounting/products/")).data,
  getOne: async (id: number) => (await api.get(`/accounting/products/${id}/`)).data,
  save: (id: number | null, data: any) =>
    id ? api.put(`/accounting/products/${id}/`, data) : api.post("/accounting/products/", data),
  delete: (id: number) => api.delete(`/accounting/products/${id}/`),
  // ✅ Массовое удаление (см. Table.tsx — чекбоксы + "Удалить выбранные") — один
  // запрос на бэкенд (accounting/mixins.py::BulkDestroyMixin.bulk_destroy),
  // каждая запись аудируется отдельно там же, где и обычное удаление.
  bulkDelete: (ids: (number | string)[]) =>
    api
      .delete<{ deleted_ids: number[]; errors: { id: number; detail: string }[]; missing_ids: number[] }>("/accounting/products/bulk-destroy/", { data: { ids } })
      .then((r) => r.data),
};

export const productImageApi = {
  getByProduct: async (productId: number) =>
    (await api.get(`/accounting/product-images/?product=${productId}`)).data,

  upload: (productId: number, file: File, isMain = false) => {
    const fd = new FormData();
    fd.append("product", String(productId));
    fd.append("image", file);
    fd.append("is_main", String(isMain));
    return api.post("/accounting/product-images/", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  setMain: (imageId: number) =>
    api.post(`/accounting/product-images/${imageId}/set_main/`),

  delete: (imageId: number) =>
    api.delete(`/accounting/product-images/${imageId}/`),

  updateOrder: (imageId: number, sortOrder: number) =>
    api.patch(`/accounting/product-images/${imageId}/`, { sort_order: sortOrder }),
};

export const priceTypeApi = {
  getAll: async () => (await api.get("/accounting/price-types/")).data,
  save: (id: number | null, data: any) =>
    id ? api.put(`/accounting/price-types/${id}/`, data) : api.post("/accounting/price-types/", data),
  delete: (id: number) => api.delete(`/accounting/price-types/${id}/`),
};

// export const productPriceApi = {
//   getByProduct: async (productId: number) =>
//     (await api.get(`/accounting/product-prices/?product=${productId}`)).data,
//   save: (id: number | null, data: any) =>
//     id
//       ? api.put(`/accounting/product-prices/${id}/`, data)
//       : api.post("/accounting/product-prices/", data),
//   delete: (id: number) => api.delete(`/accounting/product-prices/${id}/`),
// };

export const counterpartyApi = {
  getAll: async (type?: "client" | "supplier") => {
    const params = type ? `?type=${type}` : "";
    return (await api.get(`/accounting/counterparties/${params}`)).data;
  },
  save: (id: number | null, data: FormData) =>
    id
      ? api.put(`/accounting/counterparties/${id}/`, data, { headers: { "Content-Type": "multipart/form-data" } })
      : api.post("/accounting/counterparties/", data, { headers: { "Content-Type": "multipart/form-data" } }),
  delete: (id: number) => api.delete(`/accounting/counterparties/${id}/`),
};

export const warehouseApi = {
  getAll: async () => (await api.get("/accounting/warehouses/")).data,
  save: (id: number | null, data: any) =>
    id ? api.put(`/accounting/warehouses/${id}/`, data) : api.post("/accounting/warehouses/", data),
  delete: (id: number) => api.delete(`/accounting/warehouses/${id}/`),
};

export const warehouseStockApi = {
  getAll: async (warehouseId?: number, productId?: number) => {
    const params = new URLSearchParams();
    if (warehouseId) params.append("warehouse", String(warehouseId));
    if (productId) params.append("product", String(productId));
    return (await api.get(`/accounting/warehouse-stocks/?${params}`)).data;
  },
  save: (id: number | null, data: any) =>
    id
      ? api.put(`/accounting/warehouse-stocks/${id}/`, data)
      : api.post("/accounting/warehouse-stocks/", data),
  delete: (id: number) => api.delete(`/accounting/warehouse-stocks/${id}/`),
};



export const productBundleApi = {
  getAll: async (productId: number) =>
    (await api.get(`/accounting/products/${productId}/bundles/`)).data,

  save: (productId: number, id: number | null, data: any) =>
    id
      ? api.patch(`/accounting/products/${productId}/bundles/${id}/`, data)
      : api.post(`/accounting/products/${productId}/bundles/`, data),

  delete: (productId: number, id: number) =>
    api.delete(`/accounting/products/${productId}/bundles/${id}/`),
};



export const volumeDiscountApi = {
  getAll: async (productId: number) =>
    (await api.get(`/accounting/products/${productId}/volume-discounts/`)).data,

  create: (productId: number, data: any) =>
    api.post(`/accounting/products/${productId}/volume-discounts/`, data),

  update: (productId: number, id: number, data: any) =>
    api.patch(`/accounting/products/${productId}/volume-discounts/${id}/`, data),

  delete: (productId: number, id: number) =>
    api.delete(`/accounting/products/${productId}/volume-discounts/${id}/`),
};

export const quantityPromotionApi = {
  getAll: async (productId: number) =>
    (await api.get(`/accounting/products/${productId}/quantity-promotions/`)).data,

  create: (productId: number, data: any) =>
    api.post(`/accounting/products/${productId}/quantity-promotions/`, data),

  update: (productId: number, id: number, data: any) =>
    api.patch(`/accounting/products/${productId}/quantity-promotions/${id}/`, data),

  delete: (productId: number, id: number) =>
    api.delete(`/accounting/products/${productId}/quantity-promotions/${id}/`),
};


export const productPriceApi = {
  getByProduct: async (productId: number) =>
    (await api.get(`/accounting/product-prices/?product=${productId}`)).data,
  getPricesMap: async (params: { warehouse?: number; branch?: number }) => {
    const qs = new URLSearchParams();
    if (params.warehouse) qs.append("warehouse", String(params.warehouse));
    else if (params.branch) qs.append("branch", String(params.branch));
    return (await api.get(`/accounting/product-prices/prices-map/?${qs}`)).data;
  },
  save: (id: number | null, data: any) =>
    id
      ? api.put(`/accounting/product-prices/${id}/`, data)
      : api.post("/accounting/product-prices/", data),
  delete: (id: number) => api.delete(`/accounting/product-prices/${id}/`),
};