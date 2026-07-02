// frontend/src/features/accounting/services/branchApi.ts
import { api } from "../../../core/api/axiosInstance";



export const branchApi = {
  getBranches: async () => {
    const res = await api.get("/accounting/branches/");
    return res.data;
  },

  saveBranch: async (id: number | null, data: FormData) => {
    const config = {
      headers: { "Content-Type": "multipart/form-data" }
    };
    
    if (id) {
      return api.put(`/accounting/branches/${id}/`, data, config);
    }
    return api.post("/accounting/branches/", data, config);
  },

  deleteBranch: async (id: number) => {
    return api.delete(`/accounting/branches/${id}/`);
  }
};