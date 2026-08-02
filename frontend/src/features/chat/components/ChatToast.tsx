// frontend/src/features/chat/components/ChatToast.tsx
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, X } from "lucide-react";
import { isValidMediaUrl } from "../../../core/utils/media";

interface ChatToastItem {
  id: number;
  senderName: string;
  convName?: string;
  text: string;
  username: string;
  photo?: string | null;
}

interface Props {
  toasts: ChatToastItem[];
  onClose: (id: number) => void;
}

const getInitials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

export const ChatToast: React.FC<Props> = ({ toasts, onClose }) => {
  return (
    <div className="fixed top-5 right-5 md:top-auto md:right-auto md:bottom-5 md:left-5 z-[110] flex flex-col gap-2 print:hidden">
      <AnimatePresence>
        {toasts.map((t) => {
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className="relative w-80 rounded-2xl overflow-hidden shadow-2xl bg-[#17212b]"
            >
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Аватар */}
                <div className="relative shrink-0">
                  <div className="w-11 h-11 rounded-full overflow-hidden ring-2 ring-[#3390ec]/50">
                    {(() => {
                      return isValidMediaUrl(t?.photo) ? (
                        <img src={t.photo!} loading="lazy" className="w-full h-full object-cover" />
                      ) : (
                        <div className={`w-full h-full flex items-center justify-center text-sm font-bold bg-slate-600`}>{getInitials(t.senderName)}</div>
                      );
                    })()}
                  </div>
                  {/* Иконка сообщения */}
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#3390ec] flex items-center justify-center ring-2 ring-[#17212b]">
                    <MessageSquare className="w-2.5 h-2.5 text-white" />
                  </div>
                </div>

                {/* Текст */}
                <div className="flex-1 min-w-0">
                  {t.convName && <div className="text-[#6ab2f2] text-[10px] font-medium truncate mb-0.5 uppercase tracking-wider">{t.username}</div>}
                  <div className="text-white text-sm font-semibold truncate leading-tight">{t.senderName}</div>
                  <div className="text-slate-400 text-xs truncate mt-0.5">{t.text}</div>
                </div>

                {/* Закрыть */}
                <button onClick={() => onClose(t.id)} className="shrink-0 w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                  <X className="w-3 h-3 text-white/70" />
                </button>
              </div>

              {/* Прогресс бар автозакрытия */}
              <motion.div
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: 5, ease: "linear" }}
                style={{ transformOrigin: "left" }}
                className="h-0.5 bg-[#3390ec]"
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export type { ChatToastItem };
