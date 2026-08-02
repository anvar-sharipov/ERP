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
  // ✅ Привязка к ПК (см. companies/middleware.py) — управляется полностью
  // из этой же панели, отдельного экрана/эндпоинта не требуется.
  updatePcLock: async (id: number, data: { pc_lock_enabled?: boolean; allowed_computer_name?: string; allowed_hardware_id?: string; allow_branch_creation?: boolean }) => {
    const res = await api.patch(`/companies/${id}/`, data);
    return res.data;
  },
};