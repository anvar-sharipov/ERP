import React, { createContext, useContext, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

type NotificationType = "success" | "error" | "info" | "warning";

interface Notification {
  id: number;
  type: NotificationType;
  message: string;
}

const NotificationContext = createContext<any>(null);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const notify = useCallback((type: NotificationType, message: string) => {
    const id = Date.now();
    // Добавляем в массив мгновенно
    setNotifications((prev) => [...prev, { id, type, message }]);

    // Звук воспроизводим сразу
    const audio = new Audio(`/sounds/${type}.mp3`);
    audio.volume = 0.5;
    audio.play().catch(() => {});

    // Авто-удаление через 5 секунд после показа
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 5000);
  }, []);
  return (
    <NotificationContext.Provider value={{ notify }}>
      {children}
      <div className="fixed top-5 right-5 z-[100] flex flex-col gap-2 print:hidden">
        <AnimatePresence>
          {notifications.map((n) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, x: 50, scale: 0.3 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, scale: 0.3 }}
              className={`p-4 rounded-lg shadow-xl text-white flex justify-between items-center w-80 ${n.type === "success" ? "bg-green-600" : n.type === "error" ? "bg-red-600" : "bg-blue-600"}`}
            >
              <span>{n.message}</span>
              {/* 3. Кнопка закрытия */}
              <button onClick={() => setNotifications((prev) => prev.filter((item) => item.id !== n.id))} className="ml-4 hover:bg-white/20 p-1 rounded-full">
                ✕
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </NotificationContext.Provider>
  );
};

export const useNotify = () => useContext(NotificationContext).notify;
