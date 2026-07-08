// frontend/src/features/accounting/services/alertApi.ts
import { api } from "../../../core/api/axiosInstance";

export interface SystemAlert {
  id: number;
  type: "snapshot_mismatch" | "low_stock";
  type_display: string;
  level: "warning" | "critical";
  level_display: string;
  title: string;
  message: string;
  model_name: string | null;
  object_id: number | null;
  extra_data: Record<string, any>;
  is_resolved: boolean;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export const alertApi = {
  // ✅ unresolved_only=true — колокольчик показывает только активные, а не всю
  // историю (в т.ч. уже решённые) алертов за всё время.
  getAll: async (unresolvedOnly = true) => {
    const res = await api.get<SystemAlert[]>("/accounting/system-alerts/", {
      params: unresolvedOnly ? { unresolved_only: "true" } : {},
    });
    return res.data;
  },
  getUnresolvedCount: async () => {
    const res = await api.get<{ count: number }>("/accounting/system-alerts/unresolved-count/");
    return res.data.count;
  },
  resolve: (id: number) => api.post<SystemAlert>(`/accounting/system-alerts/${id}/resolve/`),
  // ✅ Только для тестирования — синхронный запуск проверки по клику, минуя
  // ежедневное расписание Celery Beat (см. accounting/views/alert_views.py::check_now).
  checkNow: async () => {
    const res = await api.post<{ count: number }>("/accounting/system-alerts/check-now/");
    return res.data.count;
  },
};
