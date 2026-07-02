// frontend/src/features/chat/components/MiniChat.tsx
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Minus, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useChat } from "../context/ChatContext";
import { ConversationList } from "./ConversationList";
import { ConversationWindow } from "./ConversationWindow";

export const MiniChat: React.FC = () => {
  const { t } = useTranslation();
  const { isMiniChatOpen, toggleMiniChat, setActiveConvId } = useChat();
  const [selectedConvId, setSelectedConvId] = useState<number | null>(null);
  const [selectedConvName, setSelectedConvName] = useState("");
  const [minimized, setMinimized] = useState(false);

  // Drag
  const [pos, setPos] = useState({ x: window.innerWidth - 380, y: window.innerHeight - 560 });
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 360, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 60, e.clientY - dragOffset.current.y)),
      });
    };
    const onUp = () => {
      dragging.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // ✅ Сбрасываем activeConvId при закрытии мини-чата
  useEffect(() => {
    if (!isMiniChatOpen) {
      setActiveConvId(null);
      setSelectedConvId(null);
    }
  }, [isMiniChatOpen]);

  return (
    <AnimatePresence>
      {isMiniChatOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          style={{ left: pos.x, top: pos.y, width: 360 }}
          className="fixed z-[200] rounded-2xl overflow-hidden shadow-2xl border border-slate-700/50 flex flex-col bg-slate-900"
        >
          {/* Шапка — drag handle */}
          <div
            onMouseDown={handleMouseDown}
            className="flex items-center justify-between px-3 py-2 bg-orange-700 dark:bg-orange-900 border-b border-slate-700/50 cursor-grab active:cursor-grabbing select-none shrink-0"
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-indigo-400" />
              <span className="text-sm font-semibold text-slate-100">{selectedConvId ? selectedConvName : t("Messages")}</span>
            </div>

            <div className="flex items-center gap-1">
              {/* Назад к списку */}
              {selectedConvId && (
                <button
                  onClick={() => {
                    setSelectedConvId(null);
                    setActiveConvId(null);
                  }}
                  className="px-2 py-0.5 text-xs text-slate-400 hover:text-white hover:bg-orange-800 rounded transition-colors"
                >
                  ← {t("Back")}
                </button>
              )}

              {/* Свернуть */}
              <button onClick={() => setMinimized((v) => !v)} className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white hover:bg-orange-800 rounded transition-colors">
                <Minus className="w-3.5 h-3.5" />
              </button>

              {/* Закрыть */}
              <button onClick={toggleMiniChat} className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-orange-800 rounded transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Контент */}
          <AnimatePresence>
            {!minimized && (
              <motion.div initial={{ height: 0 }} animate={{ height: 460 }} exit={{ height: 0 }} transition={{ type: "spring", stiffness: 400, damping: 35 }} className="overflow-hidden">
                <div className="h-[460px] flex flex-col">
                  {selectedConvId ? (
                    <ConversationWindow convId={selectedConvId} convName={selectedConvName} />
                  ) : (
                    <ConversationList
                      onSelect={(id, name) => {
                        setSelectedConvId(id);
                        setSelectedConvName(name);
                        setActiveConvId(id);
                      }}
                    />
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// // frontend/src/features/chat/components/MiniChat.tsx
// import { useState, useRef, useEffect } from "react";
// import { motion, AnimatePresence } from "framer-motion";
// import { X, Minus, MessageSquare } from "lucide-react";
// import { useChat } from "../context/ChatContext";
// import { ConversationList } from "./ConversationList";
// import { ConversationWindow } from "./ConversationWindow";

// export const MiniChat: React.FC = () => {
//   const { isMiniChatOpen, toggleMiniChat, setActiveConvId } = useChat();
//   const [selectedConvId, setSelectedConvId] = useState<number | null>(null);
//   const [selectedConvName, setSelectedConvName] = useState("");
//   const [minimized, setMinimized] = useState(false);

//   // Drag
//   const [pos, setPos] = useState({ x: window.innerWidth - 380, y: window.innerHeight - 560 });
//   const dragging = useRef(false);
//   const dragOffset = useRef({ x: 0, y: 0 });

//   const handleMouseDown = (e: React.MouseEvent) => {
//     dragging.current = true;
//     dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
//   };

//   useEffect(() => {
//     const onMove = (e: MouseEvent) => {
//       if (!dragging.current) return;
//       setPos({
//         x: Math.max(0, Math.min(window.innerWidth - 360, e.clientX - dragOffset.current.x)),
//         y: Math.max(0, Math.min(window.innerHeight - 60, e.clientY - dragOffset.current.y)),
//       });
//     };
//     const onUp = () => {
//       dragging.current = false;
//     };
//     window.addEventListener("mousemove", onMove);
//     window.addEventListener("mouseup", onUp);
//     return () => {
//       window.removeEventListener("mousemove", onMove);
//       window.removeEventListener("mouseup", onUp);
//     };
//   }, []);

//   // ✅ Сбрасываем activeConvId при закрытии мини-чата
//   useEffect(() => {
//     if (!isMiniChatOpen) {
//       setActiveConvId(null);
//       setSelectedConvId(null);
//     }
//   }, [isMiniChatOpen]);

//   return (
//     <AnimatePresence>
//       {isMiniChatOpen && (
//         <motion.div
//           initial={{ opacity: 0, scale: 0.9 }}
//           animate={{ opacity: 1, scale: 1 }}
//           exit={{ opacity: 0, scale: 0.9 }}
//           transition={{ type: "spring", stiffness: 400, damping: 30 }}
//           style={{ left: pos.x, top: pos.y, width: 360 }}
//           className="fixed z-[200] rounded-2xl overflow-hidden shadow-2xl border border-slate-700/50 flex flex-col bg-slate-900"
//         >
//           {/* Шапка — drag handle */}
//           <div
//             onMouseDown={handleMouseDown}
//             className="flex items-center justify-between px-3 py-2 bg-orange-700 dark:bg-orange-900 border-b border-slate-700/50 cursor-grab active:cursor-grabbing select-none shrink-0"
//           >
//             <div className="flex items-center gap-2">
//               <MessageSquare className="w-4 h-4 text-indigo-400" />
//               <span className="text-sm font-semibold text-slate-100">{selectedConvId ? selectedConvName : "Сообщения"}</span>
//             </div>
//             <div className="flex items-center gap-1">
//               {/* Назад к списку */}
//               {selectedConvId && (
//                 <button
//                   onClick={() => {
//                     setSelectedConvId(null);
//                     setActiveConvId(null); // ✅
//                   }}
//                   className="px-2 py-0.5 text-xs text-slate-400 hover:text-white hover:bg-orange-800 rounded transition-colors"
//                 >
//                   ← Назад
//                 </button>
//               )}
//               {/* Свернуть */}
//               <button onClick={() => setMinimized((v) => !v)} className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white hover:bg-orange-800 rounded transition-colors">
//                 <Minus className="w-3.5 h-3.5" />
//               </button>
//               {/* Закрыть */}
//               <button onClick={toggleMiniChat} className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-orange-800 rounded transition-colors">
//                 <X className="w-3.5 h-3.5" />
//               </button>
//             </div>
//           </div>

//           {/* Контент */}
//           <AnimatePresence>
//             {!minimized && (
//               <motion.div initial={{ height: 0 }} animate={{ height: 460 }} exit={{ height: 0 }} transition={{ type: "spring", stiffness: 400, damping: 35 }} className="overflow-hidden">
//                 <div className="h-[460px] flex flex-col">
//                   {selectedConvId ? (
//                     <ConversationWindow convId={selectedConvId} convName={selectedConvName} />
//                   ) : (
//                     <ConversationList
//                       onSelect={(id, name) => {
//                         setSelectedConvId(id);
//                         setSelectedConvName(name);
//                         setActiveConvId(id); // ✅
//                       }}
//                     />
//                   )}
//                 </div>
//               </motion.div>
//             )}
//           </AnimatePresence>
//         </motion.div>
//       )}
//     </AnimatePresence>
//   );
// };
