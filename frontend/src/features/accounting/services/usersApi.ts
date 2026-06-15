// frontend/src/features/services/usersApi.ts
import { api } from "../../../core/api/axiosInstance";


export const usersApi = {
  getUsers: async () => {
    const res = await api.get("/users/list/");  
    return res.data;
  },

  // Добавляем метод сохранения (создание или обновление)
  saveUser: async (id: number | null, data: any) => {
    if (id) {
      return api.put(`/users/manage/${id}/`, data);
    }
    return api.post("/users/manage/", data);
  },

  // Добавляем метод удаления
  deleteUser: async (id: number) => {
    return api.delete(`/users/list/${id}/`);
  },


  assignRole: async (userId: number, roleIds: number[]) => {
    const res = await api.post(`/users/${userId}/assign-role/`, { roles: roleIds });
    return res.data;
  }
};



export interface RoleData {
  name: string;
  permissions: number[];
}
export const rolesApi = {
  getRoles: async () => {
    const res = await api.get("users/roles/list/");
    return res.data;
  },

  getPermissionsMatrix: async () => {
    const res = await api.get("users/permissions/matrix/");
    return res.data;
  },

  deleteRoles: async (id: number) => {
    return api.delete(`users/roles/${id}/`);
  },


  saveRole: async (id: number | null, data: RoleData) => {
    if (id) {
      return api.put(`/users/roles/${id}/`, data);
    }
    return api.post("/users/roles/list/", data);
  }

};



export const updateProfile = (data: FormData) => {
  // Важно: если отправляете фото, используйте FormData
  return api.patch("/users/profile/update/", data, {
    headers: { "Content-Type": "multipart/form-data" }
  });
};


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


export const accountApi = {
  getAccounts: async () => {
    const res = await api.get("/accounting/accounts/");
    return res.data;
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


