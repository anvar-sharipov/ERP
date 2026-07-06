import { api } from "../../../core/api/axiosInstance";

export const documentApi = {
  getAll: async (params?: Record<string, string>) => {
    const res = await api.get("/accounting/documents/", { params });
    return res.data;
  },

  getById: async (id: number) => {
    const res = await api.get(`/accounting/documents/${id}/`);
    return res.data;
  },

  // ✅ Пользователи для фильтров "Создал"/"Провёл" в InvoicesPage.tsx — только те,
  // кто реально фигурирует в документах текущего scope (см. DocumentViewSet.filter_users).
  getFilterUsers: async (): Promise<{ id: number; name: string }[]> => {
    const res = await api.get(`/accounting/documents/filter-users/`);
    return res.data;
  },

  save: async (id: number | null, data: any) => {
    if (id) {
      return api.patch(`/accounting/documents/${id}/`, data);
    }
    return api.post("/accounting/documents/", data);
  },

  delete: async (id: number) => {
    return api.delete(`/accounting/documents/${id}/`);
  },

  post: async (id: number) => {
    return api.post(`/accounting/documents/${id}/post/`);
  },

  unpost: async (id: number) => {
    return api.post(`/accounting/documents/${id}/unpost/`);
  },

  // Items
  getItems: async (documentId: number) => {
    const res = await api.get(`/accounting/documents/${documentId}/items/`);
    return res.data;
  },

  saveItem: async (documentId: number, id: number | null, data: any) => {
    if (id) {
      return api.patch(`/accounting/documents/${documentId}/items/${id}/`, data);
    }
    return api.post(`/accounting/documents/${documentId}/items/`, data);
  },

  deleteItem: async (documentId: number, itemId: number) => {
    return api.delete(`/accounting/documents/${documentId}/items/${itemId}/`);
  },

  // Participants
  getParticipants: async (documentId: number) => {
    const res = await api.get(`/accounting/documents/${documentId}/participants/`);
    return res.data;
  },

  saveParticipant: async (documentId: number, id: number | null, data: any) => {
    if (id) {
      return api.patch(`/accounting/documents/${documentId}/participants/${id}/`, data);
    }
    return api.post(`/accounting/documents/${documentId}/participants/`, data);
  },

  deleteParticipant: async (documentId: number, participantId: number) => {
    return api.delete(`/accounting/documents/${documentId}/participants/${participantId}/`);
  },
};