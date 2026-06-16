import { api } from "../../../core/api/axiosInstance";



export const companyApi = {
  getCompany: async () => {
    const res = await api.get("/accounting/company-profile/");
    return res.data;
  },

  // Добавляем универсальный метод для создания/обновления
  saveCompany: async (id: number | null, data: FormData) => {
    if (id) {
      return api.put(`/accounting/company-profile/${id}/`, data, {
        headers: { "Content-Type": "multipart/form-data" }
      });
    }
    return api.post("/accounting/company-profile/", data, {
      headers: { "Content-Type": "multipart/form-data" }
    });
  }
}