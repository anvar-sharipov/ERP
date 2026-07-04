import React from "react";
import { LanguageSwitcher } from "../ui/LanguageSwitcher";
import { ThemeToggle } from "../ui/ThemeToggle";
import { playAside2Sound } from "../../core/utils/sound";
import { useCompany } from "../../core/context/CompanyContext";
import { UserProfileBlock } from "../ui/UserProfileBlock";
import { ExchangeRateWidget } from "../ui/ExchangeRateWidget";

import { useChat } from "../../features/chat/context/ChatContext";
import { motion, AnimatePresence } from "framer-motion";

import { useQuery } from "@tanstack/react-query";
import { branchApi } from "../../features/accounting/services/branchApi";
import { useDateStore } from "../../core/store/dateStore";

interface HeaderProps {
  onToggleSidebar?: () => void;
  onToggleSidebarRight?: () => void;
}

const ChatButton = () => {
  const { unreadCount, toggleMiniChat } = useChat();

  return (
    <button
      onClick={toggleMiniChat} // ✅ было navigate
      className="relative p-2 text-gray-400 hover:text-white transition-colors rounded hover:bg-slate-700"
      title="Сообщения"
    >
      <motion.div
        animate={
          unreadCount > 0
            ? {
                rotate: [0, -10, 10, -8, 8, 0],
                y: [0, -2, 0, -1, 0],
              }
            : { rotate: 0 }
        }
        transition={
          unreadCount > 0
            ? {
                duration: 0.6,
                repeat: Infinity,
                repeatDelay: 2.5,
                ease: "easeInOut",
              }
            : {}
        }
      >
        <svg width="22" height="18" viewBox="0 0 22 18" fill="none">
          <rect x="1" y="1" width="20" height="16" rx="2" fill="#6366f1" />
          <path d="M1 1L11 10L21 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M1 17L7.5 9.5" stroke="white" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
          <path d="M21 17L14.5 9.5" stroke="white" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
        </svg>
      </motion.div>

      <AnimatePresence>
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 25 }}
            className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center bg-pink-500 shadow-lg"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
};

const Header: React.FC<HeaderProps> = ({ onToggleSidebar, onToggleSidebarRight }) => {
  const { company: currentCompany } = useCompany();

  // const { workBranch } = useDateStore();
  const workBranch = useDateStore((s) => s.workBranch);
  const { data: branches = [] } = useQuery({
    queryKey: ["branches"],
    queryFn: branchApi.getBranches,
    staleTime: 60_000,
  });
  const activeBranch = workBranch?.id ? (branches as any[]).find((b) => b.id === workBranch.id) : null;

  const displayLogo = activeBranch?.logo ?? currentCompany?.logo ?? currentCompany?.logo2;
  const displayName = activeBranch?.name ?? currentCompany?.name;

  return (
    <header className="relative h-16 border-b border-slate-500 bg-slate-800 dark:bg-slate-900 px-3 md:px-6 flex items-center justify-between print:hidden">
      {/* Левая часть: гамбургер + лого */}
      <div className="flex items-center gap-2 md:gap-3">
        <button
          onClick={() => {
            playAside2Sound();
            onToggleSidebar?.();
          }}
          className="p-2 text-gray-400 hover:text-white transition-colors rounded hover:bg-slate-700"
          title="Ctrl+B"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {displayLogo ? (
          <img src={displayLogo} alt={displayName} className="h-8 w-8 md:h-10 md:w-10 object-contain rounded" />
        ) : (
          <div className="h-8 w-8 md:h-10 md:w-10 bg-slate-700 rounded flex items-center justify-center text-yellow-500 font-bold">{displayName?.charAt(0) || "H"}</div>
        )}

        <div className="flex-col hidden md:flex">
          <span className="font-bold text-sm md:text-lg text-white leading-tight">{displayName || "Hasap.Pro"}</span>
          {currentCompany?.name && <span className="text-[10px] text-yellow-500 uppercase tracking-wider">{activeBranch ? currentCompany.name : "Hasap.Pro"}</span>}
        </div>

        {/* {currentCompany?.logo ? (
          <img src={currentCompany.logo} alt={currentCompany.name} className="h-8 w-8 md:h-10 md:w-10 object-contain rounded" />
        ) : currentCompany?.logo2 ? (
          <img src={currentCompany.logo2} alt={currentCompany.name} className="h-8 w-8 md:h-10 md:w-10 object-contain rounded" />
        ) : (
          <div className="h-8 w-8 md:h-10 md:w-10 bg-slate-700 rounded flex items-center justify-center text-yellow-500 font-bold">{currentCompany?.name?.charAt(0) || "H"}</div>
        )}

        <div className="flex-col hidden md:flex">
          <span className="font-bold text-sm md:text-lg text-white leading-tight">{currentCompany?.name || "Hasap.Pro"}</span>
          {currentCompany?.name && <span className="text-[10px] text-yellow-500 uppercase tracking-wider">Hasap.Pro</span>}
        </div> */}
      </div>

      {/* Правая часть: только десктоп */}
      <div className="hidden lg:flex items-center gap-3">
        {/* ✅ Иконка чата с бейджем */}
        <ChatButton />
        <ExchangeRateWidget />
        <LanguageSwitcher />
        <ThemeToggle />
        <div className="w-[1px] h-6 bg-gray-700" />
        <div className="w-[1px] h-6 bg-gray-700" />
        {/* <UserProfileBlock variant="dropdown" showName={false} /> */}
        <UserProfileBlock variant="header-inline" />
        <div className="w-[1px] h-6 bg-gray-700" />
        <button
          onClick={() => {
            playAside2Sound();
            onToggleSidebarRight?.();
          }}
          className="p-2 text-gray-400 hover:text-white transition-colors rounded hover:bg-slate-700"
          title="Панель действий"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Мобильная правая часть */}
      <div className="flex lg:hidden items-center gap-1">
        <button
          onClick={() => {
            playAside2Sound();
            onToggleSidebarRight?.();
          }}
          className="p-2 text-gray-400 hover:text-white transition-colors rounded hover:bg-slate-700"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h16" />
          </svg>
        </button>
      </div>
    </header>
  );
};

// export default Header;
export default React.memo(Header);
