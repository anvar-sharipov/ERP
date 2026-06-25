import { api } from "../../../core/api/axiosInstance";

export const counterpartyApi = {
  // getAll: async () => {
  //   const res = await api.get("/accounting/counterparties/");
  //   return res.data;
  // },

  getAll: async (params?: Record<string, string>) => {
    const res = await api.get("/accounting/counterparties/", { params });
    return Array.isArray(res.data) ? res.data : (res.data.results ?? []);
  },
  
  // Добавьте другие методы (getById, create, update, delete), если нужно
  getById: async (id: number) => {
    const res = await api.get(`/accounting/counterparties/${id}/`);
    return res.data;
  }
};