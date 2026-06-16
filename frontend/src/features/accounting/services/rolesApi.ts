import { api } from "../../../core/api/axiosInstance";



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




