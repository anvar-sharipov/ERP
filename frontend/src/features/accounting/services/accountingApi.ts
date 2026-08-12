// frontend/src/features/accounting/services/accountingApi.ts
import { api } from "../../../core/api/axiosInstance";





export const accountApi = {
  getAccounts: async (params?: Record<string, string>) => {
    const res = await api.get('/accounting/accounts/', { params })
    return res.data
  },

  saveAccounts: async (id: number | null, data: any) => {
    if (id) return api.put(`/accounting/accounts/${id}/`, data);
    return api.post("/accounting/accounts/", data);
  },

  deleteAccount: async (id: number) => {
    return api.delete(`/accounting/accounts/${id}/`);
  },

  // Субконто
  getSubcontoTypes: async () => {
    const res = await api.get('/accounting/subconto-types/');
    return res.data;
  },

  addSubconto: async (accountId: number, data: { subconto_type: number; order: number }) => {
    return api.post(`/accounting/accounts/${accountId}/subcontos/`, data);
  },

  removeSubconto: async (accountId: number, subcontoId: number) => {
    return api.delete(`/accounting/accounts/${accountId}/subcontos/${subcontoId}/`);
  },

  getContentTypes: async () => {
    const res = await api.get('/accounting/content-types/');
    return res.data;
  },

  getDirectories: async () => {
    const res = await api.get('/accounting/directories/');
    return res.data;
  },

  saveSubcontoType: async (id: number | null, data: any) => {
    if (id) return api.put(`/accounting/subconto-types/${id}/`, data);
    return api.post('/accounting/subconto-types/', data);
  },

  deleteSubcontoType: async (id: number) => {
    return api.delete(`/accounting/subconto-types/${id}/`);
  },

  getSubcontoRecords: async (subcontoTypeId: number) => {
    const res = await api.get(`/accounting/subconto-types/${subcontoTypeId}/records/`);
    return res.data;
  },

  getOSV: async (params: { date_from: string; date_to: string; show_zero?: boolean; warehouse?: string; branch?: string }) => {
    const res = await api.get('/accounting/journal-entries/osv/', { params });
    return res.data;
  },

  getAccountDetail: async (id: number) => {
    const res = await api.get(`/accounting/accounts/${id}/`);
    return res.data;
  },

  getSubcontoBreakdown: async (params: { account: string; subconto_slug: string; date_from: string; date_to: string; show_zero?: boolean; warehouse?: string; branch?: string }) => {
    const res = await api.get('/accounting/journal-entries/subconto-breakdown/', { params });
    return res.data;
  },

  getSubcontoCard: async (params: { account: string; subconto_slug: string; subconto_id: string; date_from: string; date_to: string; warehouse?: string; branch?: string }) => {
    const res = await api.get('/accounting/journal-entries/subconto-card/', { params });
    return res.data;
  },

  // ✅ account опционален — без него бэкенд отдаёт карточки СРАЗУ по всем счетам
  // с активностью (см. transaction_views.py::_account_card_all), как ProductTurnoverPage —
  // один экран, без обязательного выбора одной сущности, без пагинации.
  getAccountCard: async (params: {
    account?: string;
    date_from: string;
    date_to: string;
    subconto_slug?: string;
    subconto_id?: string;
    entry_type?: string;
    search?: string;
    show_zero?: boolean;
    warehouse?: string;
    branch?: string;
  }) => {
    const res = await api.get('/accounting/journal-entries/account-card/', { params });
    return res.data as {
      cards: {
        account_id: number;
        account_code: string;
        account_name: string;
        items: {
          id: number;
          date: string;
          journal_entry_id: number;
          document_id: number | null;
          comment: string;
          corr_account: string;
          debit: number;
          credit: number;
          balance: number;
        }[];
        opening_balance: number;
        closing_balance: number;
        total_debit: number;
        total_credit: number;
      }[];
    };
  },

  // ✅ light — ProductsListPage.tsx (колонка "Оборот") не показывает
  // name/sku/категорию/бренд/фото товара из этого отчёта (они и так уже есть
  // из products-light/list_light_images) — light=1 просит бэкенд не отдавать
  // и не считать их (см. report_views.py::_new_bucket докстринг), сильно
  // сокращая и время ответа, и размер payload. ProductTurnoverPage.tsx эти
  // поля реально показывает — light не передаёт, получает полный ответ.
  getProductTurnover: async (params: { date_from: string; date_to: string; warehouse?: string; branch?: string; light?: boolean }) => {
    const res = await api.get('/accounting/reports/product-turnover/', { params });
    return res.data;
  },

  getProductTurnoverDetail: async (params: { product: number | string; date_from: string; date_to: string; warehouse?: string; branch?: string }) => {
    const res = await api.get('/accounting/reports/product-turnover-detail/', { params });
    return res.data;
  },

  // ✅ product опционален — без него бэкенд отдаёт карточки СРАЗУ по всем товарам
  // с движением за период (см. report_views.py::_product_card_all), как
  // ProductTurnoverPage — один экран, без обязательного выбора одного товара,
  // без пагинации.
  getProductCard: async (params: {
    product?: string;
    date_from: string;
    date_to: string;
    partner?: string;
    agent?: string;
    document_type?: string;
    search?: string;
    show_zero?: boolean;
    warehouse?: string;
    branch?: string;
  }) => {
    const res = await api.get('/accounting/reports/product-card/', { params });
    return res.data as {
      cards: {
        product_id: number;
        product_name: string;
        product_sku: string | null;
        product_unit: string;
        product_cost_price: number;
        product_thumbnail_url: string | null;
        product_image_url: string | null;
        start_quantity: number;
        start_value: number;
        turnover: { in_qty: number; in_value: number; return_qty: number; return_value: number; out_qty: number; out_value: number };
        end: { quantity: number; value: number };
        rows: {
          id: number;
          date: string;
          document_id: number;
          document_number: string;
          document_type: string;
          partner: string;
          counterparty_id: number | null;
          agent_id: number | null;
          note: string;
          price: number;
          discount_percent: number;
          discount_amount: number;
          in_qty: number; in_sum: number;
          return_qty: number; return_sum: number;
          out_qty: number; out_sum: number;
          balance_qty: number; balance_sum: number;
        }[];
      }[];
    };
  },

  getStockBalance: async (params: { warehouse?: string; branch?: string }) => {
    const res = await api.get('/accounting/reports/stock-balance/', { params });
    return res.data as Record<string, { quantity: string; reserved: string; available: string; min_stock_level: number | null; is_low: boolean }>;
  },

  // ✅ Попап по клику на бейдж "В резерве" в ProductsListPage.tsx — список
  // черновиков "Расхода", резервирующих конкретный товар (см. ReportViewSet.
  // reservations). Тот же warehouse/branch, что и getStockBalance выше, иначе
  // сумма количеств в попапе разъедется с цифрой на бейдже.
  getReservations: async (params: { product: string; warehouse?: string; branch?: string }) => {
    const res = await api.get('/accounting/reports/reservations/', { params });
    return res.data as {
      document_id: number;
      number: string;
      date: string;
      counterparty_name: string | null;
      warehouse_name: string;
      quantity: string;
    }[];
  },

  getRevenueByWarehouse: async (params: { date_from: string; date_to: string; warehouse?: string; branch?: string }) => {
    const res = await api.get('/accounting/reports/revenue-by-warehouse/', { params });
    return res.data as {
      total_revenue: string;
      total_documents: number;
      by_warehouse: { warehouse_id: number; warehouse_name: string; revenue: string; documents_count: number }[];
      daily: { date: string; warehouse_id: number; warehouse_name: string; revenue: string }[];
    };
  },

  getTopProducts: async (params: { date_from: string; date_to: string; warehouse?: string; branch?: string }) => {
    const res = await api.get('/accounting/reports/top-products/', { params });
    return res.data as { product_id: number; product_name: string; revenue: string; quantity: string }[];
  },

  getTopCounterparties: async (params: { date_from: string; date_to: string; warehouse?: string; branch?: string }) => {
    const res = await api.get('/accounting/reports/top-counterparties/', { params });
    return res.data as { counterparty_id: number; counterparty_name: string; revenue: string; documents_count: number }[];
  },

  getTodayDocuments: async (params: { warehouse?: string; branch?: string }) => {
    const res = await api.get('/accounting/reports/today-documents/', { params });
    return res.data as {
      id: number; number: string; document_type: string;
      counterparty_name: string; warehouse_name: string; total: string; posted_at: string;
    }[];
  },

  // ✅ Универсальный фильтр по документам (UniversalFilterPage.tsx) — см.
  // ReportViewSet.universal_filter (report_views.py). document_type/warehouse/
  // warehouse_to/counterparty/employee/product/category — CSV из id (или кодов
  // типа документа), не массивы — так же, как ?warehouse=1,2,3 у остальных
  // отчётов (_resolve_warehouse_ids).
  getUniversalFilter: async (params: {
    date_from: string; date_to: string;
    document_type?: string; status?: string; group_by?: string;
    warehouse?: string; branch?: string; warehouse_to?: string;
    counterparty?: string; employee?: string; product?: string; category?: string;
    search?: string;
  }) => {
    const res = await api.get('/accounting/reports/universal-filter/', { params });
    return res.data as {
      domain: string;
      group_by: string;
      has_profit: boolean;
      rows: Record<string, string | number | null>[];
      totals: Record<string, string | number | null>;
    };
  },

  // est backend paginasiya
  getAuditLogs: async (params?: { page?: number; page_size?: number; action?: string; user?: number; ordering?: string; date_from?: string; date_to?: string; search?: string }) => {
    const res = await api.get('/accounting/audit-logs/', { params })
    return res.data
  },

  getProductRevaluations: async (params?: { page?: number; page_size?: number; warehouse?: string; branch?: string; ordering?: string; date_from?: string; date_to?: string; search?: string }) => {
    const res = await api.get('/accounting/product-revaluations/', { params });
    return res.data;
  },

  getPriceChangeHistory: async (params?: { page?: number; page_size?: number; warehouse?: string; branch?: string; price_type?: string; ordering?: string; date_from?: string; date_to?: string; search?: string }) => {
    const res = await api.get('/accounting/price-change-history/', { params });
    return res.data;
  },


  getCurrencies: async () => {
    const res = await api.get('/accounting/currencies/');
    return res.data;
  },

  getExchangeRates: async (params?: Record<string, any>) => {
    const res = await api.get('/accounting/exchange-rates/', { params });
    return res.data;
  },

  addExchangeRate: async (data: { currency: number; rate: string; date: string }) => {
    const res = await api.post('/accounting/exchange-rates/', data);
    return res.data;
  },

  getLatestRates: async () => {
    const res = await api.get('/accounting/exchange-rates/', {
      params: { latest: 'true' }
    });
    // если pagination включена — res.data.results, иначе res.data
    return Array.isArray(res.data) ? res.data : (res.data.results ?? []);
  },

  saveCurrency: async (id: number | null, data: any) => {
    if (id) return api.put(`/accounting/currencies/${id}/`, data);
    return api.post("/accounting/currencies/", data);
  },
  deleteCurrency: async (id: number) => {
    return api.delete(`/accounting/currencies/${id}/`);
  },

};








