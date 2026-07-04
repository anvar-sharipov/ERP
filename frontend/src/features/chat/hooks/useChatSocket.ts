// frontend/src/features/chat/hooks/useChatSocket.ts
import { useEffect, useRef } from "react";
import { getTenantWsBaseUrl } from "../../../core/utils/tenant";

interface IncomingMessage {
  type: "message" | "read" | "online" | "offline" | "online_list" | "typing";

  user_ids?: number[];
  message_id?: number;
  conversation_id?: number;

  sender_id?: number;
  sender_username?: string;
  sender_first_name?: string;
  sender_last_name?: string;
  sender_photo_thumbnail?: string | null; // ← ДОБАВИТЬ

  text?: string;
  created_at?: string;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
  attachment_content_type?: string | null;

  user_id?: number;

  // typing
  username?: string;
  first_name?: string;
  last_name?: string;
  is_typing?: boolean;
}

interface TypingUser {
  user_id: number;
  username: string;
  first_name: string;
  last_name: string;
}

interface UseChatSocketOptions {
  convId: number;
  onMessage?: (msg: IncomingMessage) => void;
  onRead?: (msg: IncomingMessage) => void;
  onOnline?: (userId: number) => void;
  onOffline?: (userId: number) => void;
  onOnlineList?: (userIds: number[]) => void;
  onTyping?: (user: TypingUser, isTyping: boolean) => void;
}

export const useChatSocket = ({
  convId,
  onMessage,
  onRead,
  onOnline,
  onOffline,
  onOnlineList,
  onTyping,
}: UseChatSocketOptions) => {
  const wsRef = useRef<WebSocket | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendMessage = (text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "message", text }));
    }
  };

  const sendRead = (messageId: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "read", message_id: messageId }));
    }
  };

  // ✅ Отправляем typing=true, автостоп через 3с
  const sendTyping = () => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "typing", is_typing: true }));

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "typing", is_typing: false }));
      }
    }, 3000);
  };

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token || !convId) return;

    const wsBase = getTenantWsBaseUrl();
    const ws = new WebSocket(`${wsBase}/ws/chat/${convId}/?token=${token}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data: IncomingMessage = JSON.parse(event.data);
      switch (data.type) {
        case "message":
          onMessage?.(data);
          break;
        case "read":
          onRead?.(data);
          break;
        case "online":
          if (data.user_id) onOnline?.(data.user_id);
          break;
        case "offline":
          if (data.user_id) onOffline?.(data.user_id);
          break;
        case "online_list":
          if (data.user_ids) onOnlineList?.(data.user_ids);
          break;
        // ✅ Typing
        case "typing":
          if (data.user_id !== undefined) {
            onTyping?.(
              {
                user_id: data.user_id,
                username: data.username ?? "",
                first_name: data.first_name ?? "",
                last_name: data.last_name ?? "",
              },
              data.is_typing ?? false,
            );
          }
          break;
      }
    };

    ws.onerror = (e) => console.error("Chat WS error", e);

    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      ws.close();
    };
  }, [convId]);

  return { sendMessage, sendRead, sendTyping };
};


