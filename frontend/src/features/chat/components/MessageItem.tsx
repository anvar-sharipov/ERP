// frontend/src/features/chat/components/MessageItem.tsx
import { useUser } from "../../../core/context/UserContext";
import { useEffect, useRef } from "react";
import { isValidMediaUrl } from "../../../core/utils/media";

interface Read {
  user: { id: number; username: string };
  read_at: string;
}

interface Sender {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
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
}

interface Props {
  message: Message;
  onVisible?: (messageId: number) => void;
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

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

export const MessageItem: React.FC<Props> = ({ message, onVisible }) => {
  const { user } = useUser();
  const isMe = message.sender?.id === user?.id;
  const isRead = message.reads.length > 0;
  const elRef = useRef<HTMLDivElement>(null);
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
    <div ref={elRef} className={`flex items-end gap-2 px-3 py-1 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
      {/* {!isMe && <div className="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-xs font-bold text-slate-200 shrink-0 mb-1">{getInitials(message.sender)}</div>} */}
      {!isMe && (
        <div className="w-7 h-7 rounded-full shrink-0 mb-1 overflow-hidden">
          {isValidMediaUrl(message.sender.photo_thumbnail) ? (
            <img src={message.sender.photo_thumbnail!} alt={message.sender.username} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-slate-600 flex items-center justify-center text-xs font-bold text-slate-200">{getInitials(message.sender)}</div>
          )}
        </div>
      )}

      <div className={`flex flex-col max-w-[70%] ${isMe ? "items-end" : "items-start"}`}>
        {!isMe && <span className="text-xs text-indigo-400 mb-0.5 ml-1">{`${message.sender.first_name} ${message.sender.last_name}`.trim() || message.sender.username}</span>}

        <div
          className={`
    relative px-3 py-2 rounded-2xl text-sm leading-relaxed break-words
    ${isMe ? "bg-indigo-600 text-white rounded-br-sm" : "bg-gray-300 dark:bg-slate-700 text-gray-900 dark:text-slate-100 rounded-bl-sm border border-gray-100 dark:border-transparent"}
  `}
        >
          {message.text}

          <div className={`flex items-center gap-1 mt-1 ${isMe ? "justify-end" : "justify-start"}`}>
            <span className={`text-[10px] ${isMe ? "text-indigo-200/70" : "text-slate-400"}`}>{formatTime(message.created_at)}</span>
            {isMe && (
              <span className="text-[10px]">
                {isRead ? (
                  <span className="w-3 h-3 rounded-full bg-indigo-300 inline-flex items-center justify-center">
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
    </div>
  );
};
