import { api } from "../../../core/api/axiosInstance";

export const platformContactApi = {
  get: async () => {
    const res = await api.get("/companies/platform-contact/");
    return res.data;
  },
  save: async (formData: FormData) => {
    const res = await api.put("/companies/platform-contact/", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },
};