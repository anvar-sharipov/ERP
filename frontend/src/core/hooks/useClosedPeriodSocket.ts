import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getTenantWsBaseUrl } from "../utils/tenant";

export const useClosedPeriodSocket = () => {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    const wsBase = getTenantWsBaseUrl();
    const ws = new WebSocket(`${wsBase}/ws/closed-period/?token=${token}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "closed_period_changed") {
        queryClient.invalidateQueries({ queryKey: ["closed-period-check"] });
        queryClient.invalidateQueries({ queryKey: ["closed-period-branch-check"] });
      }
    };

    ws.onerror = (e) => {
      console.error("ClosedPeriod WS error", e);
    };

    return () => {
      ws.close();
    };
  }, [queryClient]);
};