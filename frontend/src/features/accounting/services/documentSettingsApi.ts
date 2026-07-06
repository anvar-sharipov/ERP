// frontend/src/features/accounting/services/documentSettingsApi.ts
import { api } from "../../../core/api/axiosInstance";

export interface DocumentSettings {
  id: number;
  purchase_price_type: number | null;
  purchase_price_type_detail?: { id: number; name: string } | null;
}

export const documentSettingsApi = {
  getSettings: async (): Promise<DocumentSettings[]> => {
    const res = await api.get("/accounting/document-settings/");
    return res.data;
  },

  // Singleton по конвенции (как company-profile/branches): id есть — PUT, нет — POST.
  saveSettings: (id: number | null, data: Partial<DocumentSettings>) =>
    id ? api.put(`/accounting/document-settings/${id}/`, data) : api.post("/accounting/document-settings/", data),
};
