// frontend/src/features/chat/components/ConversationWindow.tsx
import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { messageApi } from "../services/chatApi";
import { useChatSocket } from "../hooks/useChatSocket";
import { useUser } from "../../../core/context/UserContext";
import { useChat } from "../context/ChatContext";
import { MessageItem } from "./MessageItem";
import { MessageInput } from "./MessageInput";
import { useTranslation } from "react-i18next";
import { useNotify } from "../../../core/context/NotificationContext";

interface Props {
  convId: number;
  convName: string;
}

interface TypingUser {
  user_id: number;
  username: string;
  first_name: string;
  last_name: string;
}

export const ConversationWindow: React.FC<Props> = ({ convId, convName }) => {
  const { t } = useTranslation();
  const { user } = useUser();
  const { decrementUnread } = useChat();
  const notify = useNotify();
  const qc = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounterRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [onlineUsers, setOnlineUsers] = useState<Set<number>>(new Set());
  const [messages, setMessages] = useState<any[]>([]);
  const [typingUsers, setTypingUsers] = useState<Map<number, TypingUser>>(new Map());
  const markReadTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoadingOlderRef = useRef(false);

  // ✅ Пагинация
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // ✅ Начальная загрузка
  useEffect(() => {
    setMessages([]);
    setNextCursor(null);
    setIsInitialLoad(true);

    messageApi.getAll(convId).then((data) => {
      const list = Array.isArray(data) ? data : (data.results ?? []);
      setMessages([...list].reverse());
      setNextCursor(data.next ?? null);
      setIsInitialLoad(false);

      const unreadCount = list.filter((m: any) => !m.is_read_by_me && m.sender?.id !== user?.id).length;

      messageApi.markRead(convId).then(() => {
        if (unreadCount > 0) decrementUnread(unreadCount);
        qc.invalidateQueries({ queryKey: ["conversations"] });
      });
    });
  }, [convId]);

  useEffect(() => {
    if (isInitialLoad) return;
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
    }, 50);
  }, [isInitialLoad]);

  const scrollToBottom = useCallback(() => {
    if (isLoadingOlderRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // ✅ Загрузка старых сообщений при скролле вверх
  const handleScroll = useCallback(async () => {
    const el = scrollRef.current;
    if (!el || isLoadingMore || !nextCursor) return;

    if (el.scrollTop < 80) {
      setIsLoadingMore(true);
      isLoadingOlderRef.current = true;
      const prevScrollHeight = el.scrollHeight;

      try {
        const cursorParam = new URL(nextCursor).searchParams.get("cursor") ?? undefined;
        const data = await messageApi.getAll(convId, cursorParam);
        const older = Array.isArray(data) ? data : (data.results ?? []);

        setMessages((prev) => [...[...older].reverse(), ...prev]);
        setNextCursor(data.next ?? null);

        requestAnimationFrame(() => {
          if (el) el.scrollTop = el.scrollHeight - prevScrollHeight;
        });
      } finally {
        setIsLoadingMore(false);
        isLoadingOlderRef.current = false;
      }
    }
  }, [convId, isLoadingMore, nextCursor]);

  const handleTyping = (typingUser: TypingUser, isTyping: boolean) => {
    setTypingUsers((prev) => {
      const next = new Map(prev);
      if (isTyping) next.set(typingUser.user_id, typingUser);
      else next.delete(typingUser.user_id);
      return next;
    });
  };

  const handleSendFile = async (file: File, caption: string) => {
    setIsUploading(true);
    try {
      await messageApi.uploadAttachment(convId, file, caption);
    } catch (err: any) {
      if (!err._handled) notify("error", err.response?.data?.detail || t("ErrorSendingFile"));
    } finally {
      setIsUploading(false);
    }
  };

  // ✅ Удаление своего сообщения — оставляет запись с пометкой is_deleted вместо
  // полного удаления строки, чтобы у собеседника осталась надпись "Сообщение удалено".
  const applyDeleted = (messageId: number) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, is_deleted: true, text: "", attachment_url: null, attachment_name: null, attachment_size: null, attachment_content_type: null }
          : m,
      ),
    );
  };

  const handleDeleteMessage = async (messageId: number) => {
    try {
      await messageApi.delete(convId, messageId);
      applyDeleted(messageId);
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (err: any) {
      if (!err._handled) notify("error", err.response?.data?.detail || t("ErrorDeletingMessage"));
    }
  };

  // ✅ Drag-and-drop файла в область чата — переиспользует ту же отправку, что и скрепка.
  // Счётчик вложенности нужен, т.к. dragenter/dragleave срабатывают при пересечении
  // границ дочерних элементов, а не только внешнего контейнера.
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer.types.includes("Files")) return;
    dragCounterRef.current += 1;
    setIsDraggingFile(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setIsDraggingFile(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDraggingFile(false);
    if (isUploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleSendFile(file, "");
  };

  const { sendMessage, sendRead, sendTyping } = useChatSocket({
    convId,
    onMessage: (msg) => {
      setTypingUsers((prev) => {
        const next = new Map(prev);
        next.delete(msg.sender_id!);
        return next;
      });
      setMessages((prev) => {
        if (prev.find((m) => m.id === msg.message_id)) return prev;
        return [
          ...prev,
          {
            id: msg.message_id,
            sender: {
              id: msg.sender_id,
              username: msg.sender_username,
              first_name: msg.sender_first_name ?? "",
              last_name: msg.sender_last_name ?? "",
              photo_thumbnail: msg.sender_photo_thumbnail ?? null,
            },
            text: msg.text,
            created_at: msg.created_at,
            reads: [],
            is_read_by_me: msg.sender_id === user?.id,
            attachment_url: msg.attachment_url ?? null,
            attachment_name: msg.attachment_name ?? null,
            attachment_size: msg.attachment_size ?? null,
            attachment_content_type: msg.attachment_content_type ?? null,
          },
        ];
      });
      setTimeout(scrollToBottom, 50);
      if (msg.sender_id !== user?.id) {
        sendRead(msg.message_id!);
        decrementUnread(1);
      }
    },
    onRead: (msg) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.message_id
            ? {
                ...m,
                reads: [...m.reads.filter((r: any) => r.user.id !== msg.user_id), { user: { id: msg.user_id }, read_at: new Date().toISOString() }],
              }
            : m,
        ),
      );
    },
    onOnline: (userId) => setOnlineUsers((prev) => new Set(prev).add(userId)),
    onOffline: (userId) =>
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      }),
    onOnlineList: (userIds) => setOnlineUsers(new Set(userIds)),
    onTyping: handleTyping,
    onDeleted: applyDeleted,
  });

  const handleMessageVisible = () => {
    if (markReadTimeout.current) clearTimeout(markReadTimeout.current);
    markReadTimeout.current = setTimeout(() => {
      messageApi.markRead(convId);
      qc.invalidateQueries({ queryKey: ["conversations"] });
    }, 2000);
  };

  const typingLabel = () => {
    const users = [...typingUsers.values()];
    if (users.length === 0) return null;
    const names = users.map((u) => `${u.first_name} ${u.last_name}`.trim() || u.username);
    return names.join(", ") + " " + (users.length === 1 ? t("TypingSingle") : t("TypingMultiple"));
  };

  if (isInitialLoad) {
    return (
      <div className="flex-1 flex items-center justify-center text-indigo-400/50">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">{t("Loading")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full" onDragEnter={handleDragEnter} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      {/* ✅ Оверлей drag-and-drop файла */}
      {isDraggingFile && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-indigo-950/85 backdrop-blur-sm border-2 border-dashed border-indigo-400 rounded-lg pointer-events-none">
          <Upload className="w-10 h-10 text-indigo-300 drop-shadow-[0_0_10px_rgba(99,102,241,0.8)]" />
          <span className="text-sm font-medium text-indigo-100">{t("DropFileHere")}</span>
        </div>
      )}

      {/* Шапка */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/50 shrink-0">
        <div className="relative">
          <div className="w-9 h-9 rounded bg-gradient-to-br from-indigo-500 to-violet-600 shadow-[0_0_10px_rgba(99,102,241,0.45)] flex items-center justify-center text-sm font-bold text-white">
            {convName.slice(0, 2).toUpperCase()}
          </div>
          {[...onlineUsers].some((id) => id !== user?.id) && (
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.9)] ring-2 ring-white dark:ring-slate-800" />
          )}
        </div>
        <div>
          <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">{convName}</div>
          <div className="text-xs h-4">
            {typingLabel() ? (
              <span className="text-indigo-400 animate-pulse">{typingLabel()}</span>
            ) : [...onlineUsers].some((id) => id !== user?.id) ? (
              <span className="text-green-400">{t("Online")}</span>
            ) : (
              <span className="text-slate-400">{t("Offline")}</span>
            )}
          </div>
        </div>
      </div>

      {/* Сообщения */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto py-2 space-y-1 bg-gray-50 dark:bg-transparent">
        {/* ✅ Индикатор загрузки старых сообщений */}
        {isLoadingMore && (
          <div className="flex justify-center py-2">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-indigo-400/40 gap-2">
            <span className="text-4xl">✉️</span>
            <span className="text-sm">{t("NoMessagesYet")}</span>
          </div>
        ) : (
          messages.map((msg) => <MessageItem key={msg.id} message={msg} onVisible={handleMessageVisible} onDelete={handleDeleteMessage} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Ввод */}
      <div className="shrink-0">
        <MessageInput onSend={sendMessage} onSendFile={handleSendFile} onTyping={sendTyping} isUploading={isUploading} />
      </div>
    </div>
  );
};

