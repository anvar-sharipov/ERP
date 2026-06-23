// frontend/src/features/accounting/services/employeeApi.ts

import { api } from "../../../core/api/axiosInstance";

export const employeeApi = {
  getAll: async () =>
    (await api.get("/accounting/employees/")).data,

  getOne: async (id: number) =>
    (await api.get(`/accounting/employees/${id}/`)).data,

  save: (id: number | null, data: any) =>
    id
      ? api.put(`/accounting/employees/${id}/`, data)
      : api.post("/accounting/employees/", data),

  delete: (id: number) =>
    api.delete(`/accounting/employees/${id}/`),
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