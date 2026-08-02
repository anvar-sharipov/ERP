// frontend/src/features/accounting/services/productApi.ts
import { api } from "../../../core/api/axiosInstance";
import { type SaldoAccountData } from "../../../components/ui/SaldoTable";

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
  // ✅ warehouse/branch — ассортиментная матрица "товар × склад" (backend:
  // ProductViewSet.get_queryset, Product.allowed_warehouses). Товар без
  // привязок виден всегда; ?warehouse= имеет приоритет над ?branch=.
  getAll: async (params?: { warehouse?: number; branch?: number }) => (await api.get("/accounting/products/", { params })).data,
  // ✅ Облегчённый список специально для ProductsListPage.tsx — только то, что
  // список реально показывает (фото/категория/бренд/ед.изм./себестоимость/
  // статус), без prices/bundle_items/volume_discounts/quantity_promotions/tags
  // и т.д. (см. ProductViewSet.list_light). НЕ использовать там, где нужен
  // prod.prices (например DocumentFormPage.tsx) — там нужен getAllForDocument.
  getAllLight: async (params?: { warehouse?: number; branch?: number }) => (await api.get("/accounting/products/list-light/", { params })).data,
  // ✅ Фото отдельно от getAllLight (см. ProductViewSet.list_light_images) —
  // {product_id: {main_image, images}}. Позволяет ProductsListPage.tsx
  // отрисовать текст сразу, не дожидаясь синхронной генерации превью на
  // большом каталоге, фото дорисовывается по готовности со спиннером.
  getListLightImages: async (params?: { warehouse?: number; branch?: number }) =>
    (await api.get("/accounting/products/list-light-images/", { params })).data,
  // ✅ Облегчённый список специально для DocumentFormPage.tsx/ProductRow.tsx —
  // ровно поля из Invoice/Interface.ts::Product (prices/bundle_items/
  // volume_discounts/quantity_promotions есть, tags/category/description/
  // полной галереи images нет). См. ProductViewSet.list_for_document —
  // раньше эта форма гоняла обычный getAll() (полный ProductSerializer на
  // каждый товар), что на большом каталоге и было причиной долгой загрузки
  // SearchableSelect выбора товара.
  getAllForDocument: async (params?: { warehouse?: number; branch?: number }) => (await api.get("/accounting/products/list-for-document/", { params })).data,
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

  // ✅ Сальдо контрагента за период — для модалки по двойному клику/Enter на строке
  // в CounterpartiesPage.tsx (см. CounterpartyViewSet.saldo). В отличие от
  // getCounterpartyCard (карточка на форме накладной, день+счёт по документу) —
  // здесь диапазон дат и по ВСЕМ счетам, где у контрагента есть проводки.
  getSaldo: async (
    id: number,
    params: { date_from: string; date_to: string; warehouse?: string; branch?: string },
  ): Promise<{ counterparty_name: string; accounts: SaldoAccountData[] }> => {
    const res = await api.get(`/accounting/counterparties/${id}/saldo/`, { params });
    return res.data;
  },

  // ✅ Массовое сальдо ВСЕХ контрагентов за период одним запросом — для мини-колонки
  // "Сальдо" в CounterpartiesPage.tsx (см. CounterpartyViewSet.bulk_saldo, тот же
  // паттерн, что и ProductsListPage.tsx::stockBalance/turnoverMap). Контрагенты без
  // проводок отсутствуют в результате — фронт трактует это как нулевое сальдо.
  getBulkSaldo: async (params: {
    date_from: string;
    date_to: string;
    warehouse?: string;
    branch?: string;
  }): Promise<Record<string, { opening_balance: number; total_debit: number; total_credit: number; closing_balance: number }>> => {
    const res = await api.get(`/accounting/counterparties/bulk-saldo/`, { params });
    return res.data;
  },
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