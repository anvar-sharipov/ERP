// frontend/src/components/Layouts/SidebarLeft.tsx
import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ROUTES } from "../../core/router/routes";
import { ADMIN_ICON, COMPANY_ICON, USERS_ICON, BRANCH_ICON, ACCOUNT_ICON, DIRECTORY_ICON } from "../Icons/LeftBarIcons";
import { playClick2Sound, playAside2Sound } from "../../core/utils/sound";
import { useAccess } from "../../core/hooks/useAccess";
import { useTranslation } from "react-i18next";

interface SidebarLeftProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

// Добавьте это в ваш файл с константами или прямо в SidebarLeft
const NAV_ITEMS = {
  main: [
    { name: "Admin", path: ROUTES.COMPANY_ADMIN.USERS, icon: ADMIN_ICON, permission: ["user", "GET"] },
    { name: "Desktop", path: ROUTES.APP.DASHBOARD, icon: "📊" },
    { name: "Accounting", path: ROUTES.APP.ACCOUNTING, icon: ACCOUNT_ICON, permission: ["transaction", "GET"] },
    { name: "Directoryes", path: ROUTES.APP.DIRECTORY, icon: DIRECTORY_ICON, permission: ["directory", "GET"] },
  ],
  admin: [
    { name: "Users", path: ROUTES.COMPANY_ADMIN.USERS, icon: USERS_ICON },
    { name: "Roles", path: ROUTES.COMPANY_ADMIN.ROLES, icon: "🛡️" },
    { name: "Company", path: ROUTES.COMPANY_ADMIN.COMPANIES, icon: COMPANY_ICON },
    { name: "Branchs", path: ROUTES.COMPANY_ADMIN.BRANCHS, icon: BRANCH_ICON },
  ],
};

const SidebarLeft: React.FC<SidebarLeftProps> = ({ isOpen, setIsOpen }) => {
  const { hasPermission } = useAccess();
  const location = useLocation();
  const isAdminSection = location.pathname.startsWith("/admin");
  const {t} = useTranslation()

  // Фильтруем пункты меню на основе прав
  const mainNav = NAV_ITEMS.main.filter((item) => {
    if (!item.permission) return true;

    const [resource, action] = item.permission;

    return hasPermission(resource, action);
  });

  // Определяем, какой список отрисовать
  const currentNav = isAdminSection ? NAV_ITEMS.admin : mainNav;

  const getLinkClass = ({ isActive }: { isActive: boolean }) => {
    const baseClass = "flex items-center px-1 py-1 md:px-3 md:py-2 font-medium transition-all duration-200 overflow-hidden whitespace-nowrap";
    return isActive ? `${baseClass} bg-indigo-700 text-indigo-300 border border-indigo-500/30` : `${baseClass} text-indigo-200 hover:bg-indigo-900/20 hover:text-indigo-200`;
  };

  return (
    <aside
      className={`
  border-r border-slate-500 bg-slate-800 dark:bg-slate-900 p-2 flex flex-col justify-between transition-all duration-300 print:hidden
  fixed left-0 top-16 h-[calc(100vh-4rem)] z-40
  lg:relative lg:top-0 lg:h-full
  ${isOpen ? "w-64" : "w-10 md:w-16"}
`}
    >
      {/* Кнопка-переключатель */}
      <button
        onClick={() => {
          playAside2Sound();
          setIsOpen(!isOpen);
        }}
        className="absolute -right-5 md:-right-3 top-0 w-5 h-5 md:w-6 md:h-6 bg-indigo-900 border border-indigo-700 rounded-full flex items-center justify-center shadow-lg hover:bg-indigo-800 z-10 transition-colors"
      >
        <svg className={`w-4 h-4 text-indigo-300 transition-transform duration-300 ${!isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <nav className="space-y-1">
        {/* Ссылка "Назад", если мы в админке */}
        {isAdminSection && (
          <NavLink to={ROUTES.APP.DASHBOARD} className="mb-4 flex items-center text-indigo-400 hover:text-white">
            <span className="mr-1 md:mr-2">←</span>
            <span className={isOpen ? "opacity-100" : "opacity-0"}>{t("Back")}</span>
          </NavLink>
        )}

        {/* Отрисовка текущего списка */}
        {currentNav.map((item) => (
          <NavLink key={item.path} to={item.path} className={getLinkClass} onClick={() => playClick2Sound()}>
            <span className="min-w-[20px] mr-1 md:mr-3">{item.icon}</span>
            <span className={`transition-opacity duration-200 font-bold ${isOpen ? "opacity-100" : "opacity-0"}`}>{t(item.name)}</span>
          </NavLink>
        ))}
      </nav>

      <div className={`pt-4 border-t border-indigo-900/30 text-indigo-500/60 whitespace-nowrap overflow-hidden transition-opacity duration-200 ${isOpen ? "opacity-100" : "opacity-0"}`}>
        Лицензия: <span className="text-indigo-400">Активна</span>
      </div>
    </aside>
  );
};

export default SidebarLeft;
