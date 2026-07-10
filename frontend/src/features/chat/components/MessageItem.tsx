// frontend/src/features/chat/components/MessageItem.tsx
import { useUser } from "../../../core/context/UserContext";
import { useEffect, useRef, useState } from "react";
import { FileText, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isValidMediaUrl } from "../../../core/utils/media";
import { ImagePreview } from "../../../components/ui/ImagePreview";
import { ConfirmModal } from "../../../components/ui/Modal/ConfirmModal";

interface Read {
  user: { id: number; username: string };
  read_at: string;
}

interface Sender {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  photo?: string | null;
  photo_thumbnail?: string | null;
}

interface Message {
  id: number;
  //   sender: { id: number; username: string; first_name: string; last_name: string };
  sender: Sender;
  text: string;
  created_at: string;
  reads: Read[];
  is_read_by_me: boolean;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
  attachment_content_type?: string | null;
  is_deleted?: boolean;
}

interface Props {
  message: Message;
  onVisible?: (messageId: number) => void;
  onDelete?: (messageId: number) => void;
}



const getInitials = (u: { first_name: string; last_name: string; username: string }) => {
  const full = `${u.first_name} ${u.last_name}`.trim();
  if (full)
    return full
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  return u.username.slice(0, 2).toUpperCase();
};

const formatTime = (iso: string) => {
  const date = new Date(iso);
  const dateStr = date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timeStr = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${dateStr} ${timeStr}`;
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
};

export const MessageItem: React.FC<Props> = ({ message, onVisible, onDelete }) => {
  const { t } = useTranslation();
  const { user } = useUser();
  const isMe = message.sender?.id === user?.id;
  const isRead = message.reads.length > 0;
  const isImageAttachment = !!message.attachment_content_type?.startsWith("image/");
  const elRef = useRef<HTMLDivElement>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  // Временно для отладки
  // console.log("photo_thumbnail value:", JSON.stringify(message.sender.photo_thumbnail));

  //   console.log("message sender:", message.sender);

  // ✅ Один observer через useEffect + ref
  useEffect(() => {
    if (isMe || message.is_read_by_me || !elRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onVisible?.(message.id);
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(elRef.current);
    return () => observer.disconnect();
  }, [message.id, isMe, message.is_read_by_me]);

  return (
    <>
    <div ref={elRef} className={`group flex items-end gap-2 px-3 py-1 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
      {/* {!isMe && <div className="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-xs font-bold text-slate-200 shrink-0 mb-1">{getInitials(message.sender)}</div>} */}
      {!isMe && (
        <div className="w-7 h-7 rounded shrink-0 mb-1 overflow-hidden">
          {isValidMediaUrl(message.sender.photo_thumbnail) ? (
            <img
              src={message.sender.photo_thumbnail!}
              alt={message.sender.username}
              loading="lazy"
              className="w-full h-full object-cover cursor-pointer hover:scale-105 transition"
              onClick={() => setPreviewSrc(message.sender.photo || message.sender.photo_thumbnail!)}
            />
          ) : (
            <div className="w-full h-full bg-slate-600 flex items-center justify-center text-xs font-bold text-slate-200">{getInitials(message.sender)}</div>
          )}
        </div>
      )}

      <div className={`flex flex-col max-w-[70%] ${isMe ? "items-end" : "items-start"}`}>
        {!isMe && <span className="text-xs text-indigo-400 mb-0.5 ml-1">{`${message.sender.first_name} ${message.sender.last_name}`.trim() || message.sender.username}</span>}

        <div
          className={`
    relative px-3 py-2 rounded-2xl text-base leading-relaxed break-words
    ${
      message.is_deleted
        ? "bg-gray-200/70 dark:bg-slate-800/60 text-gray-500 dark:text-slate-400 italic border border-gray-200 dark:border-slate-700/50"
        : isMe
          ? "bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600 text-white rounded-br-sm shadow-[0_2px_14px_-3px_rgba(99,102,241,0.55)]"
          : "bg-gray-300 dark:bg-slate-700 text-gray-900 dark:text-slate-100 rounded-bl-sm border border-gray-100 dark:border-transparent"
    }
    ${!message.is_deleted && isMe ? "rounded-br-sm" : ""}
    ${!message.is_deleted && !isMe ? "rounded-bl-sm" : ""}
  `}
        >
          {message.is_deleted ? (
            <div className="flex items-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              {t("MessageDeleted")}
            </div>
          ) : (
            <>
              {message.attachment_url &&
                (isImageAttachment ? (
                  <img
                    src={message.attachment_url}
                    alt={message.attachment_name ?? ""}
                    loading="lazy"
                    className="max-w-full max-h-60 rounded-lg mb-1 cursor-pointer hover:opacity-90 transition"
                    onClick={() => setPreviewSrc(message.attachment_url!)}
                  />
                ) : (
                  <a
                    href={message.attachment_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={message.attachment_name ?? undefined}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 mb-1 transition ${
                      isMe ? "bg-indigo-700/50 hover:bg-indigo-700/70" : "bg-white/60 dark:bg-slate-800/60 hover:bg-white dark:hover:bg-slate-800"
                    }`}
                  >
                    <FileText className="w-5 h-5 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate max-w-[180px]">{message.attachment_name}</div>
                      {message.attachment_size != null && <div className="text-[10px] opacity-70">{formatFileSize(message.attachment_size)}</div>}
                    </div>
                  </a>
                ))}

              {message.text}
            </>
          )}

          <div className={`flex items-center gap-1 mt-1 ${isMe ? "justify-end" : "justify-start"}`}>
            <span className={`text-[10px] ${message.is_deleted ? "text-gray-400 dark:text-slate-500" : isMe ? "text-indigo-200/70" : "text-slate-400"}`}>
              {formatTime(message.created_at)}
            </span>
            {isMe && !message.is_deleted && (
              <span className="text-[10px]">
                {isRead ? (
                  <span className="w-3 h-3 rounded-full bg-gradient-to-br from-fuchsia-300 to-indigo-300 shadow-[0_0_4px_rgba(217,70,239,0.7)] inline-flex items-center justify-center">
                    <svg viewBox="0 0 10 10" className="w-2 h-2 fill-indigo-700">
                      <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                ) : (
                  <svg viewBox="0 0 12 12" className="w-3 h-3 stroke-indigo-200/70" fill="none">
                    <path d="M1.5 6l3 3 6-6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ✅ Удаление своего сообщения — появляется при наведении на строку */}
      {isMe && !message.is_deleted && onDelete && (
        <button
          onClick={() => setConfirmDeleteOpen(true)}
          title={t("DeleteMessage")}
          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mb-1 w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-500/10"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>

    <ConfirmModal
      isOpen={confirmDeleteOpen}
      onClose={() => setConfirmDeleteOpen(false)}
      onConfirm={() => {
        onDelete?.(message.id);
        setConfirmDeleteOpen(false);
      }}
      type="delete"
      title="DeleteMessage"
      message="ConfirmDeleteMessage"
    />
    <ImagePreview src={previewSrc} onClose={() => setPreviewSrc(null)} />
    </>
  );
};
