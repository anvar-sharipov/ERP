// frontend/src/core/hooks/useRBACSocket.ts
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getTenantWsBaseUrl } from "../utils/tenant"; // если такой утилиты нет - см. примечание ниже
import { useAuthStore } from "../store/authStore";

export const useRBACSocket = () => {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const wsRef = useRef<WebSocket | null>(null);

  // ✅ Раньше зависимость эффекта была только [queryClient] (стабильный синглтон)
  // — если токена не было именно в момент маунта, сокет никогда не подключался
  // за всю жизнь вкладки, даже после логина без перезагрузки страницы. Теперь
  // эффект перезапускается при смене isAuthenticated (см. authStore.ts).
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!isAuthenticated || !token) return;

    const wsBase = getTenantWsBaseUrl(); // например: ws://demo.127.0.0.1.nip.io:8000
    const ws = new WebSocket(`${wsBase}/ws/rbac/?token=${token}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "permissions_changed") {
        // Перезапрашиваем текущего юзера -> обновятся permissions в кэше и Zustand persist
        queryClient.invalidateQueries({ queryKey: ["user-me"] });
      }
    };

    ws.onerror = (e) => {
      console.error("RBAC WS error", e);
    };

    return () => {
      ws.close();
    };
  }, [queryClient, isAuthenticated]);
};
