// frontend/src/core/hooks/useRBACSocket.ts
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getTenantWsBaseUrl } from "../utils/tenant"; // если такой утилиты нет - см. примечание ниже

export const useRBACSocket = () => {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

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
  }, [queryClient]);
};

// // frontend/src/core/hooks/useRBACSocket.ts
// import { useEffect, useRef } from "react";
// import { useQueryClient } from "@tanstack/react-query";
// import { getTenantWsBaseUrl } from "../utils/tenant";

// export const useRBACSocket = () => {
//   const queryClient = useQueryClient();
//   const wsRef = useRef<WebSocket | null>(null);

//   useEffect(() => {
//     const token = localStorage.getItem("access_token");
//     if (!token) return;

//     const wsBase = getTenantWsBaseUrl();
//     const ws = new WebSocket(`${wsBase}/ws/rbac/?token=${token}`);
//     wsRef.current = ws;

//     ws.onmessage = (event) => {
//       const data = JSON.parse(event.data);

//       if (data.type === "permissions_changed") {
//         queryClient.invalidateQueries({ queryKey: ["user-me"] });
//       }
//     };

//     ws.onerror = (e) => {
//       console.error("RBAC WS error", e);
//     };

//     return () => {
//       ws.close();
//     };
//   }, [queryClient]);
// };