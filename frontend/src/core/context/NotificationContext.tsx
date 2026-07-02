// frontend/src/core/context/NotificationContext.tsx
import React, { createContext, useContext, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, XCircle, Info, AlertTriangle, X } from "lucide-react";
import { useTranslation } from "react-i18next";

type NotificationType = "success" | "error" | "info" | "warning";

interface Notification {
  id: number;
  type: NotificationType;
  message: string;
}

const CONFIG = {
  success: {
    icon: CheckCircle,
    bg: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #052e16 100%)",
    accent: "#4ade80",
    text: "#bbf7d0",
    bar: "from-green-400 to-emerald-400",
    ring: "ring-green-400/40",
  },
  error: {
    icon: XCircle,
    bg: "linear-gradient(135deg, #2d0a0a 0%, #7f1d1d 50%, #2d0a0a 100%)",
    accent: "#f87171",
    text: "#fecaca",
    bar: "from-red-400 to-rose-400",
    ring: "ring-red-400/40",
  },
  info: {
    icon: Info,
    bg: "linear-gradient(135deg, #0c1445 0%, #1e3a8a 50%, #0c1445 100%)",
    accent: "#60a5fa",
    text: "#bfdbfe",
    bar: "from-blue-400 to-indigo-400",
    ring: "ring-blue-400/40",
  },
  warning: {
    icon: AlertTriangle,
    bg: "linear-gradient(135deg, #1c1008 0%, #78350f 50%, #1c1008 100%)",
    accent: "#fbbf24",
    text: "#fde68a",
    bar: "from-yellow-400 to-amber-400",
    ring: "ring-yellow-400/40",
  },
};

const NotificationContext = createContext<any>(null);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const { t } = useTranslation();

  const notify = useCallback((type: NotificationType, message: string) => {
    const id = Date.now();
    setNotifications((prev) => [...prev, { id, type, message }]);
    const audio = new Audio(`/sounds/${type}.mp3`);
    audio.volume = 0.5;
    audio.play().catch(() => {});
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 5000);
  }, []);

  const remove = (id: number) => setNotifications((prev) => prev.filter((n) => n.id !== id));

  return (
    <NotificationContext.Provider value={{ notify }}>
      {children}
      <div className="fixed top-5 right-5 md:top-auto md:right-auto md:bottom-5 md:left-5 z-[100] flex flex-col gap-2 print:hidden">
        <AnimatePresence>
          {notifications.map((n) => {
            const cfg = CONFIG[n.type];
            const Icon = cfg.icon;
            return (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                className={`relative w-80 rounded-2xl overflow-hidden shadow-2xl ring-1 ${cfg.ring}`}
                style={{ background: cfg.bg }}
              >
                {/* Верхняя полоска */}
                <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: `linear-gradient(to right, transparent, ${cfg.accent}, transparent)` }} />

                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Иконка */}
                  <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center" style={{ background: `${cfg.accent}20`, border: `1px solid ${cfg.accent}40` }}>
                    <Icon className="w-5 h-5" style={{ color: cfg.accent }} />
                  </div>

                  {/* Текст */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-medium uppercase tracking-wider mb-0.5" style={{ color: cfg.accent }}>
                      {n.type === "success" ? t("Success") : n.type === "error" ? "Ошибка" : n.type === "warning" ? "Внимание" : "Инфо"}
                    </div>
                    <div className="text-sm truncate" style={{ color: cfg.text }}>
                      {n.message}
                    </div>
                  </div>

                  {/* Закрыть */}
                  <button onClick={() => remove(n.id)} className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors" style={{ background: `${cfg.accent}15` }}>
                    <X className="w-3 h-3" style={{ color: cfg.accent }} />
                  </button>
                </div>

                {/* Прогресс бар */}
                <motion.div
                  initial={{ scaleX: 1 }}
                  animate={{ scaleX: 0 }}
                  transition={{ duration: 5, ease: "linear" }}
                  style={{ transformOrigin: "left" }}
                  className={`h-0.5 bg-gradient-to-r ${cfg.bar}`}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </NotificationContext.Provider>
  );
};

export const useNotify = () => useContext(NotificationContext).notify;

// // frontend/src/core/context/NotificationContext.tsx
// import React, { createContext, useContext, useState, useCallback } from "react";
// import { motion, AnimatePresence } from "framer-motion";
// import { CheckCircle, XCircle, Info, AlertTriangle, X } from "lucide-react";
// import { useTranslation } from "react-i18next";

// type NotificationType = "success" | "error" | "info" | "warning";

// interface Notification {
//   id: number;
//   type: NotificationType;
//   message: string;
// }

// const CONFIG = {
//   success: {
//     icon: CheckCircle,
//     bg: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #052e16 100%)",
//     accent: "#4ade80",
//     text: "#bbf7d0",
//     bar: "from-green-400 to-emerald-400",
//     ring: "ring-green-400/40",
//   },
//   error: {
//     icon: XCircle,
//     bg: "linear-gradient(135deg, #2d0a0a 0%, #7f1d1d 50%, #2d0a0a 100%)",
//     accent: "#f87171",
//     text: "#fecaca",
//     bar: "from-red-400 to-rose-400",
//     ring: "ring-red-400/40",
//   },
//   info: {
//     icon: Info,
//     bg: "linear-gradient(135deg, #0c1445 0%, #1e3a8a 50%, #0c1445 100%)",
//     accent: "#60a5fa",
//     text: "#bfdbfe",
//     bar: "from-blue-400 to-indigo-400",
//     ring: "ring-blue-400/40",
//   },
//   warning: {
//     icon: AlertTriangle,
//     bg: "linear-gradient(135deg, #1c1008 0%, #78350f 50%, #1c1008 100%)",
//     accent: "#fbbf24",
//     text: "#fde68a",
//     bar: "from-yellow-400 to-amber-400",
//     ring: "ring-yellow-400/40",
//   },
// };

// const NotificationContext = createContext<any>(null);

// export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
//   const [notifications, setNotifications] = useState<Notification[]>([]);
//   const {t} = useTranslation();

//   const notify = useCallback((type: NotificationType, message: string) => {
//     const id = Date.now();
//     setNotifications((prev) => [...prev, { id, type, message }]);
//     const audio = new Audio(`/sounds/${type}.mp3`);
//     audio.volume = 0.5;
//     audio.play().catch(() => {});
//     setTimeout(() => {
//       setNotifications((prev) => prev.filter((n) => n.id !== id));
//     }, 5000);
//   }, []);

//   const remove = (id: number) => setNotifications((prev) => prev.filter((n) => n.id !== id));

//   return (
//     <NotificationContext.Provider value={{ notify }}>
//       {children}
//       <div className="fixed top-5 right-5 z-[100] flex flex-col gap-2 print:hidden">
//         <AnimatePresence>
//           {notifications.map((n) => {
//             const cfg = CONFIG[n.type];
//             const Icon = cfg.icon;
//             return (
//               <motion.div
//                 key={n.id}
//                 initial={{ opacity: 0, y: -20, scale: 0.9 }}
//                 animate={{ opacity: 1, y: 0, scale: 1 }}
//                 exit={{ opacity: 0, y: -20, scale: 0.9 }}
//                 transition={{ type: "spring", stiffness: 500, damping: 30 }}
//                 className={`relative w-80 rounded-2xl overflow-hidden shadow-2xl ring-1 ${cfg.ring}`}
//                 style={{ background: cfg.bg }}
//               >
//                 {/* Верхняя полоска */}
//                 <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: `linear-gradient(to right, transparent, ${cfg.accent}, transparent)` }} />

//                 <div className="flex items-center gap-3 px-4 py-3">
//                   {/* Иконка */}
//                   <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center" style={{ background: `${cfg.accent}20`, border: `1px solid ${cfg.accent}40` }}>
//                     <Icon className="w-5 h-5" style={{ color: cfg.accent }} />
//                   </div>

//                   {/* Текст */}
//                   <div className="flex-1 min-w-0">
//                     <div className="text-[10px] font-medium uppercase tracking-wider mb-0.5" style={{ color: cfg.accent }}>
//                       {n.type === "success" ? t("Success") : n.type === "error" ? "Ошибка" : n.type === "warning" ? "Внимание" : "Инфо"}
//                     </div>
//                     <div className="text-sm truncate" style={{ color: cfg.text }}>
//                       {n.message}
//                     </div>
//                   </div>

//                   {/* Закрыть */}
//                   <button onClick={() => remove(n.id)} className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors" style={{ background: `${cfg.accent}15` }}>
//                     <X className="w-3 h-3" style={{ color: cfg.accent }} />
//                   </button>
//                 </div>

//                 {/* Прогресс бар */}
//                 <motion.div
//                   initial={{ scaleX: 1 }}
//                   animate={{ scaleX: 0 }}
//                   transition={{ duration: 5, ease: "linear" }}
//                   style={{ transformOrigin: "left" }}
//                   className={`h-0.5 bg-gradient-to-r ${cfg.bar}`}
//                 />
//               </motion.div>
//             );
//           })}
//         </AnimatePresence>
//       </div>
//     </NotificationContext.Provider>
//   );
// };

// export const useNotify = () => useContext(NotificationContext).notify;
