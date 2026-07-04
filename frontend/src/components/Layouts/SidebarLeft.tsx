// // frontend/src/components/Layouts/SidebarLeft.tsx
// frontend/src/components/Layouts/SidebarLeft.tsx
import React, { useEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ROUTES } from "../../core/router/routes";
import {
  ADMIN_ICON,
  COMPANY_ICON,
  USERS_ICON,
  BRANCH_ICON,
  ACCOUNT_ICON,
  DIRECTORY_ICON,
  COUNTERPARTY_ICON,
  WAREHOUSE_ICON,
  PRODUCT_ICON,
  JOURNAL_ICON,
  ROLES_ICON,
  DASHBOARD_ICON,
  EMPLOYEES_ICON,
  DOCUMENTS_ICON,
  CHAT_ICON,
} from "../Icons/LeftBarIcons";
import { playClick2Sound, playAside2Sound } from "../../core/utils/sound";
import { useAccess } from "../../core/hooks/useAccess";
import { useTranslation } from "react-i18next";
import { focusManager } from "../../core/utils/focusManager";

import { LanguageSwitcher } from "../ui/LanguageSwitcher";
import { ThemeToggle } from "../ui/ThemeToggle";
import { useChat } from "../../features/chat/context/ChatContext";

import { UserProfileBlock } from "../ui/UserProfileBlock";
import { ExchangeRateWidget } from "../ui/ExchangeRateWidget";
interface SidebarLeftProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

// Добавьте это в ваш файл с константами или прямо в SidebarLeft
const NAV_ITEMS = {
  main: [
    { name: "Admin", path: ROUTES.COMPANY_ADMIN.USERS, icon: ADMIN_ICON, permission: ["user", "GET"] },
    { name: "Desktop", path: ROUTES.APP.DASHBOARD, icon: DASHBOARD_ICON },
    { name: "Accounting", path: ROUTES.APP.ACCOUNTING, icon: ACCOUNT_ICON, permission: ["account", "GET"] },
    { name: "Transaction", path: ROUTES.APP.JOURNAL, icon: JOURNAL_ICON, permission: ["journalentry", "GET"] },
    { name: "Directoryes", path: ROUTES.APP.DIRECTORY, icon: DIRECTORY_ICON, permission: ["directory", "GET"] },
    { name: "Products", path: ROUTES.APP.PRODUCTS, icon: PRODUCT_ICON, permission: ["product", "GET"] },
    { name: "Counterparties", path: ROUTES.APP.COUNTERPARTIES, icon: COUNTERPARTY_ICON, permission: ["counterparty", "GET"] },
    { name: "Warehouses", path: ROUTES.APP.WAREHOUSES, icon: WAREHOUSE_ICON, permission: ["warehouse", "GET"] },
    { name: "Employees", path: ROUTES.APP.EMPLOYEES, icon: EMPLOYEES_ICON, permission: ["employee", "GET"] },
    { name: "Invoices", path: ROUTES.APP.DOCUMENTS, icon: DOCUMENTS_ICON, permission: ["document", "GET"] },
    { name: "Chat", path: ROUTES.APP.CHAT, icon: CHAT_ICON },
  ],
  admin: [
    { name: "Users", path: ROUTES.COMPANY_ADMIN.USERS, icon: USERS_ICON },
    { name: "Roles", path: ROUTES.COMPANY_ADMIN.ROLES, icon: ROLES_ICON },
    { name: "Company", path: ROUTES.COMPANY_ADMIN.COMPANIES, icon: COMPANY_ICON },
    { name: "Branchs", path: ROUTES.COMPANY_ADMIN.BRANCHS, icon: BRANCH_ICON },
  ],
};

const SidebarLeft: React.FC<SidebarLeftProps> = ({ isOpen }) => {
  const { hasPermission, isLoading } = useAccess();
  const location = useLocation();
  const isAdminSection = location.pathname.startsWith("/admin");
  const { t } = useTranslation();
  const sidebarRef = useRef<HTMLElement>(null);
  const { unreadCount } = useChat();

  const backButtonRef = useRef<HTMLAnchorElement | null>(null);

  // const [_activeRegion, setActiveRegion] = useState(focusManager.getRegion());
  useEffect(() => {
    const unsubscribe = focusManager.subscribe((newRegion) => {
      // Выполняйте логику здесь, если нужно
      console.log("Region changed to:", newRegion);
    });
    return () => unsubscribe();
  }, []);

  // Фильтруем пункты меню на основе прав
  const mainNav = NAV_ITEMS.main.filter((item) => {
    if (!item.permission) return true;
    const [resource, action] = item.permission;
    if (isLoading) return true;
    const result = hasPermission(resource, action);
    // console.log(`${resource}.${action} →`, result); // ← добавь
    return result;
  });

  // Определяем, какой список отрисовать
  const currentNav = isAdminSection ? NAV_ITEMS.admin : mainNav;

  // useEffect(() => {
  //   navItemsRef.current = [];
  // }, [currentNav]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Проверяем регион через менеджер
      if (focusManager.getRegion() !== "sidebar") return;

      // 2. Если Tab, переключаем регион
      if (e.key === "Tab") {
        e.preventDefault(); // Предотвращаем дефолтный таб, чтобы не улететь в браузер
        focusManager.setRegion("table");
        return;
      }

      // 3. Стрелки
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        // playClickSound();
        playAside2Sound();
        // playAsideSound();
        e.preventDefault();
        if (!sidebarRef.current) return;

        const focusables = Array.from(sidebarRef.current.querySelectorAll('[tabindex="0"]')) as HTMLElement[];

        if (focusables.length === 0) return;

        const currentIndex = focusables.findIndex((el) => el === document.activeElement);

        let nextIndex;
        if (currentIndex === -1) {
          nextIndex = 0;
        } else {
          const step = e.key === "ArrowDown" ? 1 : -1;
          nextIndex = (currentIndex + step + focusables.length) % focusables.length;
        }

        focusables[nextIndex]?.focus();
      }
    };

    // Добавляем { capture: true }, чтобы перехватывать событие раньше остальных
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, []);

  return (
    <aside
      ref={sidebarRef}
      className={`
        border-r border-slate-500 bg-slate-800 dark:bg-slate-900 p-2 flex flex-col transition-all duration-300 print:hidden
        fixed left-0 top-16 h-[calc(100vh-4rem)] z-40
        lg:relative lg:top-0 lg:h-full
        ${isOpen ? "w-64" : "w-14 md:w-16"}
      `}
    >
      {/* Скроллируемая навигация */}
      <nav className="flex-1 overflow-y-auto min-h-0 py-2">
        {isAdminSection && (
          <NavLink
            to={ROUTES.APP.DASHBOARD}
            ref={backButtonRef}
            tabIndex={0}
            className="mb-3 mx-2 flex items-center gap-2 px-3 py-2 rounded-lg text-indigo-400 hover:text-white hover:bg-indigo-800/40 transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <span className="transition-transform duration-200 group-hover:-translate-x-1">←</span>
            <span className={`text-sm font-medium transition-all duration-300 ${isOpen ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2"}`}>{t("Back")}</span>
          </NavLink>
        )}

        <div className="space-y-0.5 px-2">
          {currentNav.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              tabIndex={0}
              className={({ isActive }) => `
          relative flex items-center gap-3 px-3 py-2.5 rounded-lg
          font-medium transition-all duration-200 group
          focus:outline-none focus:ring-2 focus:ring-indigo-400
          overflow-hidden
          ${isActive ? "bg-indigo-600/90 text-white shadow-lg shadow-indigo-900/40" : "text-indigo-200/80 hover:text-white hover:bg-indigo-800/40"}
        `}
              onClick={() => {
                playClick2Sound();
                focusManager.setRegion("table");
              }}
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`
              absolute left-0 top-1/2 -translate-y-1/2 w-0.5 rounded-r-full bg-indigo-300
              transition-all duration-300
              ${isActive ? "h-6 opacity-100" : "h-0 opacity-0"}
            `}
                  />

                  <span
                    className={`
              min-w-[20px] flex items-center justify-center
              transition-transform duration-200
              ${isActive ? "scale-110" : "group-hover:scale-105"}
            `}
                  >
                    {item.icon}
                  </span>

                  <span
                    className={`
              text-sm whitespace-nowrap
              transition-all duration-300
              ${isOpen ? "opacity-100 translate-x-0 w-auto" : "opacity-0 -translate-x-2 w-0"}
            `}
                  >
                    {t(item.name)}
                  </span>
                  {/* Badge непрочитанных — только для чата */}
                  {item.path === ROUTES.APP.CHAT && unreadCount > 0 && (
                    <span
                      className={`
          ml-auto min-w-[18px] h-[18px] px-1 rounded-full
          bg-indigo-500 text-white text-[10px] font-bold
          flex items-center justify-center shrink-0
          transition-all duration-300
          ${isOpen ? "opacity-100" : "absolute top-1 right-1 opacity-100"}
        `}
                    >
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                  <span
                    className={`
              absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100
              transition-opacity duration-200
              bg-gradient-to-r from-indigo-600/10 to-transparent
              pointer-events-none
            `}
                  />
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Фиксированный нижний блок */}
      <div className="pt-3 border-t border-indigo-900/30 flex flex-col gap-2 shrink-0">
        {/* Мобиль: профиль + язык + тема */}
        <div
          className={`
            lg:hidden flex flex-col gap-2
            transition-all duration-200
            ${isOpen ? "opacity-100 translate-y-0 delay-300" : "opacity-0 -translate-y-2 delay-0 pointer-events-none"}
          `}
        >
          <>
            <ExchangeRateWidget />
            <UserProfileBlock variant="inline" showName={true} />
            <div className="flex items-center gap-2 px-1">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
          </>
        </div>

        {/* Лицензия */}
        <div className={`text-indigo-500/60 flex flex-col gap-1 transition-opacity duration-200 ${isOpen ? "opacity-100" : "opacity-0"}`}>
          <div className="text-xs">
            {t("License")}: <span className="text-indigo-400">{t("Active")}</span>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default SidebarLeft;
