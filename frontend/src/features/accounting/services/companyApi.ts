import { api } from "../../../core/api/axiosInstance";



export const companyApi = {
  getCompany: async () => {
    const res = await api.get("/accounting/company-profile/");
    return res.data;
  },

  // ✅ Настройки самой компании (public-схема, companies.Company), не связанные
  // с RBAC-правами конкретного пользователя — управляются из global-admin
  // панели (см. AdminPanel.tsx). Пока только allow_branch_creation.
  getTenantSettings: async (): Promise<{ allow_branch_creation: boolean }> => {
    const res = await api.get("/accounting/tenant-settings/");
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