import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getTenantWsBaseUrl } from "../utils/tenant";
import { useAuthStore } from "../store/authStore";

export const useScopeSocket = () => {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const wsRef = useRef<WebSocket | null>(null);

  // ✅ Раньше зависимость эффекта была только [queryClient] (стабильный синглтон,
  // эффект реально выполнялся один раз при монтировании) — если токена не было
  // именно в момент маунта (например приложение открылось на странице логина),
  // сокет НИКОГДА не подключался за всю жизнь вкладки, даже после логина без
  // перезагрузки страницы. Теперь эффект перезапускается при смене isAuthenticated.
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!isAuthenticated || !token) return;

    const wsBase = getTenantWsBaseUrl();
    const ws = new WebSocket(`${wsBase}/ws/scope/?token=${token}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "scope_changed") {
            queryClient.invalidateQueries({ queryKey: ["user-me"] });
            queryClient.invalidateQueries({ queryKey: ["my-scope"] }); // ← добавить
        }
    };

    ws.onerror = (e) => {
      console.error("Scope WS error", e);
    };

    return () => {
      ws.close();
    };
  }, [queryClient, isAuthenticated]);
};