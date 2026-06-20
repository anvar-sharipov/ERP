import React from "react";
import { LanguageSwitcher } from "../ui/LanguageSwitcher";
import { ThemeToggle } from "../ui/ThemeToggle";
import { playAside2Sound } from "../../core/utils/sound";
import { useCompany } from "../../core/context/CompanyContext";
import { UserProfileBlock } from "../ui/UserProfileBlock";

interface HeaderProps {
  onToggleSidebar?: () => void;
  onToggleSidebarRight?: () => void;
}

const Header: React.FC<HeaderProps> = ({ onToggleSidebar, onToggleSidebarRight }) => {
  const { company: currentCompany } = useCompany();

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

        {currentCompany?.logo ? (
          <img src={currentCompany.logo} alt={currentCompany.name} className="h-8 w-8 md:h-10 md:w-10 object-contain rounded" />
        ) : currentCompany?.logo2 ? (
          <img src={currentCompany.logo2} alt={currentCompany.name} className="h-8 w-8 md:h-10 md:w-10 object-contain rounded" />
        ) : (
          <div className="h-8 w-8 md:h-10 md:w-10 bg-slate-700 rounded flex items-center justify-center text-yellow-500 font-bold">{currentCompany?.name?.charAt(0) || "H"}</div>
        )}

        <div className="flex-col hidden md:flex">
          <span className="font-bold text-sm md:text-lg text-white leading-tight">{currentCompany?.name || "Hasap.Pro"}</span>
          {currentCompany?.name && <span className="text-[10px] text-yellow-500 uppercase tracking-wider">Hasap.Pro</span>}
        </div>
      </div>

      {/* Правая часть: только десктоп */}
      <div className="hidden lg:flex items-center gap-3">
        <LanguageSwitcher />
        <ThemeToggle />
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

export default Header;
