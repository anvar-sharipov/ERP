// frontend/src/features/chat/context/ChatContext.tsx
import React, { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import { useChatNotificationSocket } from "../hooks/useChatNotificationSocket";
import { ChatToast, type ChatToastItem } from "../components/ChatToast";
import { playInfoSound } from "../../../core/utils/sound";
import { useTranslation } from "react-i18next";

interface ChatContextType {
  unreadCount: number;
  activeConvId: number | null;
  setActiveConvId: (id: number | null) => void;
  decrementUnread: (by: number) => void;
  isMiniChatOpen: boolean; // ✅
  toggleMiniChat: () => void; // ✅
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [toasts, setToasts] = useState<ChatToastItem[]>([]); // ✅
  const {t} = useTranslation();

  const [isMiniChatOpen, setIsMiniChatOpen] = useState(false);
  const toggleMiniChat = useCallback(() => setIsMiniChatOpen((v) => !v), []);

  const activeConvIdRef = useRef<number | null>(null);
  activeConvIdRef.current = activeConvId;

  const handleUnreadCount = useCallback((count: number) => {
    setUnreadCount(count);
  }, []);

  const handleNewMessage = useCallback((msg: any) => {
    // if (activeConvIdRef.current === msg.conversation_id) return;

    const senderName = `${msg.sender_first_name ?? ""} ${msg.sender_last_name ?? ""}`.trim() || msg.sender_username || t("NewMessage");

    // console.log("msg", msg);

    // ✅ Добавляем тост
    const id = Date.now();
    setToasts((prev) => [
      ...prev,
      {
        id,
        senderName,
        convName: msg.conversation_name,
        text: msg.text,
        username: msg.sender_username,
        photo: msg.sender_photo_thumbnail ?? null,
      },
    ]);

    // ✅ Автоудаление через 5с
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);

    playInfoSound();
  }, []);

  const decrementUnread = useCallback((by: number) => {
    setUnreadCount((prev) => Math.max(0, prev - by));
  }, []);


  useChatNotificationSocket({
    onUnreadCount: handleUnreadCount,
    onNewMessage: handleNewMessage,
  });

  return (
    <ChatContext.Provider value={{ unreadCount, activeConvId, setActiveConvId, decrementUnread, isMiniChatOpen, toggleMiniChat }}>
      {children}
      {/* ✅ Рендерим тосты здесь */}
      <ChatToast toasts={toasts} onClose={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
};
