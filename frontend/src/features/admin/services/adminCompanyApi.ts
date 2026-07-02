// frontend/src/features/admin/services/adminCompanyApi.ts
import { api } from "../../../core/api/axiosInstance";

export const adminCompanyApi = {
  getList: async () => {
    const res = await api.get("/companies/list/");
    return res.data;
  },
  toggleActive: async (id: number, isActive: boolean) => {
    const res = await api.patch(`/companies/${id}/`, { is_active: isActive });
    return res.data;
  },
};