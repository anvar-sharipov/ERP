// frontend/src/features/chat/hooks/useChatNotificationSocket.ts
import { useEffect, useRef } from "react";
import { getTenantWsBaseUrl } from "../../../core/utils/tenant";


import { getTenantInfo } from "../../../core/utils/tenant";

interface NotificationMessage {
  type: "unread_count" | "new_message";
  count?: number;
  conversation_id?: number;
  sender_username?: string;
  text?: string;
  unread_count?: number;
}

interface Options {
  onUnreadCount?: (count: number) => void;
  onNewMessage?: (msg: NotificationMessage) => void;
}

export const useChatNotificationSocket = ({ onUnreadCount, onNewMessage }: Options) => {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // ✅ Ref для колбэков — не пересоздаём WS при смене пропсов
  const onUnreadCountRef = useRef(onUnreadCount);
  const onNewMessageRef = useRef(onNewMessage);
  onUnreadCountRef.current = onUnreadCount;
  onNewMessageRef.current = onNewMessage;

  useEffect(() => {
    mountedRef.current = true;

    const connect = () => {
      if (!mountedRef.current) return;

      const token = localStorage.getItem("access_token");
      if (!token) return;

      // ✅ В public-зоне (без поддомена тенанта) чата нет — не подключаемся
      const { isSubdomain } = getTenantInfo();
      if (!isSubdomain) return;

      const wsBase = getTenantWsBaseUrl();
      const ws = new WebSocket(`${wsBase}/ws/chat/notifications/?token=${token}`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        // console.log("notification WS message:", event.data);
        const data: NotificationMessage = JSON.parse(event.data);
        switch (data.type) {
          case "unread_count":
            if (data.count !== undefined) onUnreadCountRef.current?.(data.count);
            break;
          case "new_message":
            if (data.unread_count !== undefined) onUnreadCountRef.current?.(data.unread_count);
            onNewMessageRef.current?.(data);
            break;
        }
      };

      ws.onerror = (e) => console.error("Chat Notification WS error", e);

      // ✅ Реконнект при неожиданном закрытии
      ws.onclose = (e) => {
        if (!mountedRef.current) return;
        if (e.code === 1000) return; // намеренное закрытие — не реконнектимся
        reconnectTimerRef.current = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close(1000);
    };
  }, []);
};

