import { useQuery } from "@tanstack/react-query";
import { conversationApi } from "../services/chatApi";
import { useUser } from "../../../core/context/UserContext";
import { useChat } from "../context/ChatContext";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { isValidMediaUrl } from "../../../core/utils/media";

interface Props {
  onSelect: (convId: number, convName: string) => void;
}

const getConvName = (conv: any, currentUserId: number) => {
  if (conv.type === "group") return conv.name;
  const other = conv.participants.find((p: any) => p.id !== currentUserId);
  return other ? `${other.first_name} ${other.last_name}`.trim() || other.username : "—";
};

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

export const ConversationList: React.FC<Props> = ({ onSelect }) => {
  const { t } = useTranslation();
  const { user } = useUser();
  const { activeConvId, setActiveConvId } = useChat();
  const [search, setSearch] = useState("");

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: conversationApi.getAll,
    refetchInterval: 30_000,
  });

  const handleSelect = (conv: any) => {
    setActiveConvId(conv.id);
    onSelect(conv.id, getConvName(conv, user?.id));
  };

  // ✅ Фильтрация по имени беседы и тексту последнего сообщения
  const filtered = conversations.filter((conv: any) => {
    if (!search.trim()) return true;
    const name = getConvName(conv, user?.id ?? 0).toLowerCase();
    const lastText = conv.last_message?.text?.toLowerCase() ?? "";
    const q = search.toLowerCase();
    return name.includes(q) || lastText.includes(q);
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 rounded-lg bg-slate-700/40 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-800/30">
      <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700/50">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Search")}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-slate-700/60 text-gray-900 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500 border border-gray-200 dark:border-slate-600/50 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-indigo-400/50 gap-2 p-4">
            <span className="text-3xl">💬</span>
            <span className="text-sm">{search ? t("NothingFound") : t("NoConversations")}</span>
          </div>
        ) : (
          filtered.map((conv: any) => {
            const name = getConvName(conv, user?.id ?? 0);
            const isActive = conv.id === activeConvId;
            const hasUnread = conv.unread_count > 0;
            const lastMsg = conv.last_message;

            return (
              <button
                key={conv.id}
                onClick={() => handleSelect(conv)}
                className={`
                  w-full flex items-center gap-3 px-3 py-3 transition-all duration-150 text-left border-b border-slate-700/30
                  ${
                    isActive
                      ? "bg-gradient-to-r from-indigo-600/25 via-violet-600/10 to-transparent border-l-2 border-l-indigo-500 shadow-[inset_0_0_16px_-6px_rgba(99,102,241,0.5)]"
                      : "hover:bg-slate-700/40 border-l-2 border-l-transparent"
                  }
                `}
              >
                <div className="relative w-10 h-10 rounded shrink-0 overflow-hidden">
                  {(() => {
                    const other = conv.participants.find((p: any) => p.id !== user?.id);
                    return isValidMediaUrl(other?.photo_thumbnail) ? (
                      <img src={other.photo_thumbnail!} alt={name} loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <div
                        className={`w-full h-full flex items-center justify-center text-sm font-bold ${
                          isActive ? "bg-gradient-to-br from-indigo-500 to-violet-600 shadow-[0_0_8px_rgba(99,102,241,0.5)]" : "bg-slate-600"
                        }`}
                      >
                        {getInitials(name)}
                      </div>
                    );
                  })()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-sm font-medium truncate ${isActive ? "text-indigo-600 dark:text-indigo-200" : "text-gray-900 dark:text-slate-200"}`}>{name}</span>

                    {lastMsg && (
                      <span className="text-xs text-slate-500 shrink-0">
                        {formatDistanceToNow(new Date(lastMsg.created_at), {
                          addSuffix: false,
                          locale: ru,
                        })}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-1 mt-0.5">
                    <span className="text-xs text-slate-400 truncate">
                      {lastMsg
                        ? lastMsg.is_deleted
                          ? t("MessageDeleted")
                          : lastMsg.sender_id === user?.id
                            ? `${t("You")}: ${lastMsg.text}`
                            : lastMsg.text
                        : t("NoMessages")}
                    </span>

                    {hasUnread && (
                      <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-gradient-to-br from-fuchsia-500 to-indigo-500 shadow-[0_0_8px_rgba(217,70,239,0.55)] text-white text-xs flex items-center justify-center font-medium">
                        {conv.unread_count > 99 ? "99+" : conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

