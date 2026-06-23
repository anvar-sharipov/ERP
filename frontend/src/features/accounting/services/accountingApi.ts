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

  // getOSV: async (params: { date_from: string; date_to: string; show_zero?: boolean }) => {
  //   const res = await api.get('/accounting/journal-entries/osv/', { params });
  //   return res.data;
  // },
  getOSV: async (params: { date_from: string; date_to: string; show_zero?: boolean }) => {
    const res = await api.get('/accounting/journal-entries/osv/', { params });
    return res.data;
  },

  // est backend paginasiya
  getAuditLogs: async (params?: { page?: number; page_size?: number; action?: string; user?: number }) => {
    const res = await api.get('/accounting/audit-logs/', { params })
    return res.data
  },
};




