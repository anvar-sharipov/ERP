import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getTenantWsBaseUrl } from "../utils/tenant";
import { useAuthStore } from "../store/authStore";

export const useDashboardSocket = () => {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!isAuthenticated || !token) return;

    const wsBase = getTenantWsBaseUrl();
    const ws = new WebSocket(`${wsBase}/ws/dashboard/?token=${token}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "dashboard_changed") {
        // ✅ Раньше инвалидировался только dashboard-revenue — топ-5
        // товаров/контрагентов и бегущая строка сегодняшних накладных
        // молча не обновлялись при проведении/отмене документа, пока
        // страницу не перезагрузить вручную.
        queryClient.invalidateQueries({ queryKey: ["dashboard-revenue"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-top-products"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-top-counterparties"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-today-documents"] });
      }
    };

    ws.onerror = (e) => {
      console.error("Dashboard WS error", e);
    };

    return () => {
      ws.close();
    };
  }, [queryClient, isAuthenticated]);
};
