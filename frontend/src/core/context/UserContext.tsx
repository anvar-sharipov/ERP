// frontend/src/core/context/UserContext.tsx
import React, { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/axiosInstance";
import { useRBACSocket } from "../hooks/useRBACSocket";

interface UserContextType {
  user: any;
  isLoading: boolean;
  refetch: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["user-me"],
    queryFn: async () => {
      const res = await api.get("/users/me/");
      return res.data;
    },
    enabled: !!localStorage.getItem("access_token"),
    staleTime: 1000 * 60 * 5,
  });

  useRBACSocket();

  return <UserContext.Provider value={{ user: data, isLoading, refetch }}>{children}</UserContext.Provider>;
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) throw new Error("useUser must be used within UserProvider");
  return context;
};

// import React, { createContext, useContext, type ReactNode } from "react";
// import { useQuery } from "@tanstack/react-query";
// import { api } from "../api/axiosInstance";

// interface UserContextType {
//   user: any;
//   isLoading: boolean;
//   refetch: () => void;
// }

// const UserContext = createContext<UserContextType | undefined>(undefined);

// export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
//   const { data, isLoading, refetch } = useQuery({
//     queryKey: ["user-me"],
//     queryFn: async () => {
//       const res = await api.get("/users/me/");
//       return res.data;
//     },
//     enabled: !!localStorage.getItem("access_token"),
//     staleTime: 1000 * 60 * 5, // кэшируем данные на 5 минут
//     // staleTime: 1000 * 1 * 1, // кэшируем данные на 5 минут
//   });

//   return <UserContext.Provider value={{ user: data, isLoading, refetch }}>{children}</UserContext.Provider>;
// };

// export const useUser = () => {
//   const context = useContext(UserContext);
//   if (!context) throw new Error("useUser must be used within UserProvider");
//   return context;
// };






