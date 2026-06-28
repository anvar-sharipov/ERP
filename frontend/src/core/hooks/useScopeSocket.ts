import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getTenantWsBaseUrl } from "../utils/tenant";

export const useScopeSocket = () => {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

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
  }, [queryClient]);
};