import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getTenantWsBaseUrl } from "../utils/tenant";
import { useAuthStore } from "../store/authStore";

export const useClosedPeriodSocket = () => {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const wsRef = useRef<WebSocket | null>(null);

  // ✅ Как и useRBACSocket/useScopeSocket — раньше зависело только от [queryClient],
  // не переподключалось после логина в той же вкладке без токена на момент маунта.
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!isAuthenticated || !token) return;

    const wsBase = getTenantWsBaseUrl();
    const ws = new WebSocket(`${wsBase}/ws/closed-period/?token=${token}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "closed_period_changed") {
        queryClient.invalidateQueries({ queryKey: ["closed-period-check"] });
        queryClient.invalidateQueries({ queryKey: ["closed-period-branch-check"] });
        // ✅ Закрытие дня переносит черновики фактур/проводок этого склада на
        // следующий день на бэкенде (см. ClosedPeriodViewSet.perform_create), но
        // без этого списки (JournalPage/InvoicesPage), если уже открыты, продолжали
        // показывать старую (закэшированную) дату черновика — данные в БД были
        // верные, просто фронт не перезапрашивал их.
        queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
        queryClient.invalidateQueries({ queryKey: ["documents"] });
      }
    };

    ws.onerror = (e) => {
      console.error("ClosedPeriod WS error", e);
    };

    return () => {
      ws.close();
    };
  }, [queryClient, isAuthenticated]);
};