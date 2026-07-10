// frontend/src/features/chat/services/chatApi.ts
import { api } from "../../../core/api/axiosInstance";

export const conversationApi = {
  getAll: async () => (await api.get("/chat/conversations/")).data,
  create: (data: {
    type: "direct" | "group";
    name?: string;
    participant_ids: number[];
  }) => api.post("/chat/conversations/", data),
};

export const messageApi = {
  // ✅ принимаем cursor для подгрузки старых сообщений
  getAll: async (convId: number, cursor?: string) => {
    const params = cursor ? { cursor } : {};
    return (await api.get(`/chat/conversations/${convId}/messages/`, { params })).data;
  },
  markRead: (convId: number) =>
    api.post(`/chat/conversations/${convId}/messages/read/`),
  uploadAttachment: (convId: number, file: File, text?: string) => {
    const data = new FormData();
    data.append("file", file);
    if (text) data.append("text", text);
    return api.post(`/chat/conversations/${convId}/messages/upload/`, data, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  delete: (convId: number, messageId: number) => api.delete(`/chat/conversations/${convId}/messages/${messageId}/`),
};
