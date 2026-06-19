// frontend/src/features/accounting/services/accountingApi.ts
import { api } from "../../../core/api/axiosInstance";


export const accountApi = {
  // getAccounts: async () => {
  //   const res = await api.get("/accounting/accounts/");
  //   return res.data;
  // },

  getAccounts: async (params?: Record<string, string>) => {
  const res = await api.get('/accounting/accounts/', { params })
  return res.data
},


  // Убираем FormData, так как больше не нужны файлы
  saveAccounts: async (id: number | null, data: any) => {
    // Axios автоматически отправит данные как application/json, 
    // если передать обычный объект.
    if (id) {
      return api.put(`/accounting/accounts/${id}/`, data);
    }
    return api.post("/accounting/accounts/", data);
  },

  deleteAccount: async (id: number) => {
    return api.delete(`/accounting/accounts/${id}/`);
  },


};