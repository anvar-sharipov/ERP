// frontend/src/features/accounting/services/tripApi.ts
import { api } from "../../../core/api/axiosInstance";

export const tripApi = {
  getAll: async (params?: Record<string, string>) =>
    (await api.get("/accounting/trips/", { params })).data,

  getOne: async (id: number) =>
    (await api.get(`/accounting/trips/${id}/`)).data,

  save: (id: number | null, data: any) =>
    id
      ? api.put(`/accounting/trips/${id}/`, data)
      : api.post("/accounting/trips/", data),

  delete: (id: number) =>
    api.delete(`/accounting/trips/${id}/`),

  bulkDelete: (ids: number[]) =>
    api.delete("/accounting/trips/bulk-destroy/", { data: { ids } }),

  addDocument: async (tripId: number, documentId: number) =>
    (await api.post(`/accounting/trips/${tripId}/add-document/`, { document_id: documentId })).data,

  removeDocument: async (tripId: number, documentId: number) =>
    (await api.post(`/accounting/trips/${tripId}/remove-document/`, { document_id: documentId })).data,

  deliver: async (tripId: number) =>
    (await api.post(`/accounting/trips/${tripId}/deliver/`)).data,

  cancelDelivery: async (tripId: number) =>
    (await api.post(`/accounting/trips/${tripId}/cancel-delivery/`)).data,
};
