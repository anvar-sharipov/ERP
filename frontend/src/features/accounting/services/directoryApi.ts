import { api } from "../../../core/api/axiosInstance";




export const directoryApi = {
  getDirectory: async () => {
    const res = await api.get("/accounting/directories/");
    return res.data;
  },

  saveDirectory: async (id: number | null, data: any) => {
    if (id) {
      return api.put(`/accounting/directories/${id}/`, data);
    }
    return api.post("/accounting/directories/", data);
  },

  deleteDirectory: async (id: number) => {
    return api.delete(`/accounting/directories/${id}/`);
  },
};



export const directoryFieldApi = {
  getFields: async (directoryId: number) => {
    const res = await api.get(`/accounting/directory-fields/?directory=${directoryId}`);
    return res.data;
  },

  saveField: async (id: number | null, data: any) => {
    if (id) {
      return api.put(`/accounting/directory-fields/${id}/`, data);
    }
    return api.post("/accounting/directory-fields/", data);
  },

  deleteField: async (id: number) => {
    return api.delete(`/accounting/directory-fields/${id}/`);
  },
};




export const directoryRecordApi = {
  getRecords: async (directoryId: number) => {
    const res = await api.get(`/accounting/directory-records/?directory=${directoryId}`);
    return res.data;
  },

  saveRecord: async (id: number | null, data: any) => {
    if (id) {
      return api.put(`/accounting/directory-records/${id}/`, data);
    }
    return api.post("/accounting/directory-records/", data);
  },

  deleteRecord: async (id: number) => {
    return api.delete(`/accounting/directory-records/${id}/`);
  },
};
