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



export const updateProfile = (data: FormData) => {
  // Важно: если отправляете фото, используйте FormData
  return api.patch("/users/profile/update/", data, {
    headers: { "Content-Type": "multipart/form-data" }
  });
};