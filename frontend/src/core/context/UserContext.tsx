// frontend/src/core/context/UserContext.tsx
import React, { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/axiosInstance";
import { useAuthStore } from "../store/authStore";
import { useRBACSocket } from "../hooks/useRBACSocket";
import { useScopeSocket } from "../hooks/useScopeSocket";
import { useClosedPeriodSocket } from "../hooks/useClosedPeriodSocket";

interface UserContextType {
  user: any;
  isLoading: boolean;
  refetch: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

// ✅ Экспортируется отдельно, чтобы Login.tsx мог дождаться (await) свежих
// данных пользователя/прав ДО навигации на страницу приложения — см. правку
// в Login.tsx: "проверить все permissions/scope и только потом открыть
// страницу" — вместо того чтобы полагаться на то, что useQuery когда-нибудь
// доедет в фоне уже после того, как страница отрендерилась.
export const fetchCurrentUser = async () => {
  const res = await api.get("/users/me/");
  return res.data;
};

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["user-me"],
    queryFn: fetchCurrentUser,
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
  });

  useRBACSocket();
  useScopeSocket();
  useClosedPeriodSocket();

  return <UserContext.Provider value={{ user: data, isLoading, refetch }}>{children}</UserContext.Provider>;
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) throw new Error("useUser must be used within UserProvider");
  return context;
};
