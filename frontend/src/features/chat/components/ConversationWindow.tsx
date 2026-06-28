// frontend/src/features/chat/components/ConversationWindow.tsx
import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { messageApi } from "../services/chatApi";
import { useChatSocket } from "../hooks/useChatSocket";
import { useUser } from "../../../core/context/UserContext";
import { useChat } from "../context/ChatContext";
import { MessageItem } from "./MessageItem";
import { MessageInput } from "./MessageInput";

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
  const { user } = useUser();
  const { decrementUnread } = useChat();
  const qc = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [onlineUsers, setOnlineUsers] = useState<Set<number>>(new Set());
  const [messages, setMessages] = useState<any[]>([]);
  const [typingUsers, setTypingUsers] = useState<Map<number, TypingUser>>(new Map());
  const markReadTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoadingOlderRef = useRef(false);

  // ✅ Пагинация
  const [nextCursor, setNextCursor] = useState<string | null>(null);
//   const [prevCursor, setPrevCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // ✅ Начальная загрузка
  useEffect(() => {
    setMessages([]);
    setNextCursor(null);
    // setPrevCursor(null);
    setIsInitialLoad(true);

    messageApi.getAll(convId).then((data) => {
    //   console.log("initial data:", data);
      const list = Array.isArray(data) ? data : (data.results ?? []);
      setMessages([...list].reverse()); // ✅ переворачиваем
      setNextCursor(data.next ?? null); // ✅ next = более старые
      setIsInitialLoad(false);

      const unreadCount = list.filter((m: any) => !m.is_read_by_me && m.sender?.id !== user?.id).length;

      messageApi.markRead(convId).then(() => {
        if (unreadCount > 0) decrementUnread(unreadCount);
        qc.invalidateQueries({ queryKey: ["conversations"] });
      });
    });
  }, [convId]);

  // ✅ Скролл вниз только при начальной загрузке
  //   useEffect(() => {
  //     if (isInitialLoad) return;
  //     bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  //   }, [isInitialLoad]);

  useEffect(() => {
    if (isInitialLoad) return;
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
    }, 50);
  }, [isInitialLoad]);

  // Скролл вниз только при новом сообщении
  //   const scrollToBottom = useCallback(() => {
  //     bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  //   }, []);

  // ✅ Скролл вниз при новых сообщениях
  //   useEffect(() => {
  //     if (messages.length === 0) return;
  //     bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  //   }, [messages.length, typingUsers.size]);
  //   useEffect(() => {
  //     if (messages.length === 0) return;
  //     if (isLoadingOlderRef.current) return; // ✅ не скроллим при подгрузке старых
  //     bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  //   }, [messages.length, typingUsers.size]);
  const scrollToBottom = useCallback(() => {
    if (isLoadingOlderRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // ✅ Загрузка старых сообщений при скролле вверх
  const handleScroll = useCallback(async () => {
    const el = scrollRef.current;
    if (!el || isLoadingMore || !nextCursor) return; // ✅ nextCursor

    if (el.scrollTop < 80) {
      setIsLoadingMore(true);
      isLoadingOlderRef.current = true;
      const prevScrollHeight = el.scrollHeight;

      try {
        const cursorParam = new URL(nextCursor).searchParams.get("cursor") ?? undefined;
        const data = await messageApi.getAll(convId, cursorParam);
        const older = Array.isArray(data) ? data : (data.results ?? []);

        setMessages((prev) => [...[...older].reverse(), ...prev]); // ✅ переворачиваем
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
    return names.join(", ") + (users.length === 1 ? " печатает..." : " печатают...");
  };

  if (isInitialLoad) {
    return (
      <div className="flex-1 flex items-center justify-center text-indigo-400/50">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Загрузка...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Шапка */}
      {/* <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700/50 bg-slate-800/50 shrink-0"> */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/50 shrink-0">
        <div className="relative">
          <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold text-white">{convName.slice(0, 2).toUpperCase()}</div>
          {[...onlineUsers].some((id) => id !== user?.id) && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 ring-2 ring-slate-800" />}
        </div>
        <div>
          {/* <div className="text-sm font-semibold text-slate-100">{convName}</div> */}
          <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">{convName}</div>
          <div className="text-xs h-4">
            {typingLabel() ? (
              <span className="text-indigo-400 animate-pulse">{typingLabel()}</span>
            ) : [...onlineUsers].some((id) => id !== user?.id) ? (
              <span className="text-green-400">онлайн</span>
            ) : (
              <span className="text-slate-400">оффлайн</span>
            )}
          </div>
        </div>
      </div>

      {/* Сообщения */}
      {/* <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto py-2 space-y-1"> */}
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
            <span className="text-sm">Нет сообщений. Напишите первым!</span>
          </div>
        ) : (
          messages.map((msg) => <MessageItem key={msg.id} message={msg} onVisible={handleMessageVisible} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Ввод */}
      <div className="shrink-0">
        <MessageInput onSend={sendMessage} onTyping={sendTyping} />
      </div>
    </div>
  );
};
