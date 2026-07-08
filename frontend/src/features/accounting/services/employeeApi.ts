// frontend/src/features/accounting/services/employeeApi.ts

import { api } from "../../../core/api/axiosInstance";

export const employeeApi = {
  // getAll: async () =>
  //   (await api.get("/accounting/employees/")).data,
  getAll: async (params?: Record<string, string>) =>
    (await api.get("/accounting/employees/", { params })).data,

  getOne: async (id: number) =>
    (await api.get(`/accounting/employees/${id}/`)).data,

  save: (id: number | null, data: FormData) =>
    id
      ? api.put(`/accounting/employees/${id}/`, data, { headers: { "Content-Type": "multipart/form-data" } })
      : api.post("/accounting/employees/", data, { headers: { "Content-Type": "multipart/form-data" } }),

  delete: (id: number) =>
    api.delete(`/accounting/employees/${id}/`),
};

export const agentApi = {
  getAll: async (params?: Record<string, string>) =>
    (await api.get("/accounting/agents/", { params })).data,

  getOne: async (id: number) =>
    (await api.get(`/accounting/agents/${id}/`)).data,

  save: (id: number | null, data: any) =>
    id
      ? api.put(`/accounting/agents/${id}/`, data)
      : api.post("/accounting/agents/", data),

  delete: (id: number) =>
    api.delete(`/accounting/agents/${id}/`),

  bulkDelete: (ids: number[]) =>
    api.delete("/accounting/agents/bulk-destroy/", { data: { ids } }),
};

export const positionApi = {
  getAll: async () =>
    (await api.get("/accounting/positions/")).data,

  getOne: async (id: number) =>
    (await api.get(`/accounting/positions/${id}/`)).data,

  save: (id: number | null, data: any) =>
    id
      ? api.put(`/accounting/positions/${id}/`, data)
      : api.post("/accounting/positions/", data),

  delete: (id: number) =>
    api.delete(`/accounting/positions/${id}/`),
};