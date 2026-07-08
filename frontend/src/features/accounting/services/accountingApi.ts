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

  getProductTurnover: async (params: { date_from: string; date_to: string; warehouse?: string; branch?: string }) => {
    const res = await api.get('/accounting/reports/product-turnover/', { params });
    return res.data;
  },

  getProductTurnoverDetail: async (params: { product: number | string; date_from: string; date_to: string; warehouse?: string; branch?: string }) => {
    const res = await api.get('/accounting/reports/product-turnover-detail/', { params });
    return res.data;
  },

  getStockBalance: async (params: { warehouse?: string; branch?: string }) => {
    const res = await api.get('/accounting/reports/stock-balance/', { params });
    return res.data as Record<string, { quantity: string; reserved: string; available: string; min_stock_level: number | null; is_low: boolean }>;
  },

  // est backend paginasiya
  getAuditLogs: async (params?: { page?: number; page_size?: number; action?: string; user?: number; ordering?: string }) => {
    const res = await api.get('/accounting/audit-logs/', { params })
    return res.data
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








