// frontend/src/components/Layouts/SidebarLeft.tsx
import React, { useEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ROUTES } from "../../core/router/routes";
import { ADMIN_ICON, COMPANY_ICON, USERS_ICON, BRANCH_ICON, ACCOUNT_ICON, DIRECTORY_ICON } from "../Icons/LeftBarIcons";
import { playClick2Sound, playAside2Sound } from "../../core/utils/sound";
import { useAccess } from "../../core/hooks/useAccess";
import { useTranslation } from "react-i18next";
import { focusManager } from "../../core/utils/focusManager";

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
  const { t } = useTranslation();
  const sidebarRef = useRef<HTMLElement>(null);

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

    return hasPermission(resource, action);
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

  // Внутри SidebarLeft
  // useEffect(() => {
  //   const handleFocusSidebar = () => {
  //     // Принудительно фокусируем первый элемент
  //     navItemsRef.current[0]?.focus();
  //     focusManager.setRegion("sidebar");
  //   };

  //   window.addEventListener("focus-sidebar", handleFocusSidebar);
  //   return () => window.removeEventListener("focus-sidebar", handleFocusSidebar);
  // }, []);

  const getLinkClass = ({ isActive }: { isActive: boolean }) => {
    const baseClass = "flex items-center px-1 py-1 md:px-3 md:py-2 font-medium transition-all duration-200 overflow-hidden whitespace-nowrap focus:ring-2 focus:ring-indigo-400 focus:outline-none";
    return isActive ? `${baseClass} bg-indigo-700 text-indigo-300 border border-indigo-500/30` : `${baseClass} text-indigo-200 hover:bg-indigo-900/20 hover:text-indigo-200`;
  };

  return (
    <aside
      ref={sidebarRef}
      className={`
  border-r border-slate-500 bg-slate-800 dark:bg-slate-900 p-2 flex flex-col justify-between transition-all duration-300 print:hidden
  fixed left-0 top-16 h-[calc(100vh-4rem)] z-40
  lg:relative lg:top-0 lg:h-full
  ${isOpen ? "w-64" : "w-10 md:w-16"}
`}
    >
      {/* Кнопка-переключатель */}
      <button
        tabIndex={0}
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
          <NavLink
            to={ROUTES.APP.DASHBOARD}
            ref={backButtonRef} // ДОБАВИТЬ ЭТО
            tabIndex={0} // ДОБАВИТЬ ЭТО (чтобы фокусировалось)
            className="mb-4 flex items-center text-indigo-400 hover:text-white focus:ring-2 focus:ring-indigo-400"
          >
            <span className="mr-1 md:mr-2">←</span>
            <span className={isOpen ? "opacity-100" : "opacity-0"}>{t("Back")}</span>
          </NavLink>
        )}

        {/* Отрисовка текущего списка */}
        {currentNav.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={getLinkClass}
            onClick={() => {
              playClick2Sound();
              focusManager.setRegion("table"); // При клике на ссылку сразу переводим регион в таблицу
            }}
            // ref={(el) => (navItemsRef.current[index] = el)}
            tabIndex={0}
          >
            <span className="min-w-[20px] mr-1 md:mr-3">{item.icon}</span>
            <span className={`transition-opacity duration-200 font-bold ${isOpen ? "opacity-100" : "opacity-0"}`}>{t(item.name)}</span>
          </NavLink>
        ))}
      </nav>

      {/* Нижняя часть сайдбара */}
      <div className={`pt-4 border-t border-indigo-900/30 text-indigo-500/60 flex flex-col gap-1 transition-opacity duration-200 ${isOpen ? "opacity-100" : "opacity-0"}`}>
        <div className="text-xs">
          Лицензия: <span className="text-indigo-400">Активна</span>
        </div>
        <span className="text-xs text-gray-400 hidden md:block">
          {t("Press")} <kbd className="px-1 bg-slate-700 rounded text-indigo-300 border border-slate-600">F6</kbd> {t("ToSidebar")}
        </span>
      </div>
    </aside>
  );
};

export default SidebarLeft;
