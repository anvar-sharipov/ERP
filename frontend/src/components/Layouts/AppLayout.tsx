import React, { useState, useEffect, useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { getTenantInfo } from "../../core/utils/tenant";
import Header from "./Header";
import SidebarLeft from "./SidebarLeft";
import SidebarRight from "./SidebarRight";
import { AdminHeader } from "./AdminHeader";
import { AdminSidebarLeft } from "./AdminSidebarLeft";
import { useCompany } from "../../core/context/CompanyContext";
import { useUser } from "../../core/context/UserContext";
import { CompanyHeaderInfo } from "../ui/CompanyHeaderInfo";
import { useTranslation } from "react-i18next";
import { focusManager } from "../../core/utils/focusManager";
import { playAsideSound } from "../../core/utils/sound";

const fullWidthPages: string[] = [];

export const AppLayout: React.FC = () => {
  const tenantInfo = useMemo(() => getTenantInfo(), []);
  const { isSubdomain } = tenantInfo;
  const { company: currentCompany } = useCompany();
  const { user: currentUser } = useUser();
  const location = useLocation();
  const { t } = useTranslation();

  // console.log("currentUser", currentUser);
  // const navItemsRef = useRef<(HTMLAnchorElement | null)[]>([]);

  useEffect(() => {
    const handleGlobalJump = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        playAsideSound();
        e.preventDefault();
        // setIsLeftOpen((v) => !v);
        setIsLeftOpen(true);
        focusManager.setRegion("sidebar");

        // Даем время на рендер, если секция поменялась
        setTimeout(() => {
          const sidebar = document.querySelector("aside");
          // ищем активный NavLink
          const activeLink = sidebar?.querySelector<HTMLElement>(".bg-indigo-700");
          // если нет активного — первый focusable
          const firstFocusable = sidebar?.querySelector<HTMLElement>('[tabindex="0"]');
          (activeLink ?? firstFocusable)?.focus();
        }, 50);
      }

      // if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
      //   e.preventDefault();
      //   setIsLeftOpen((v) => !v);
      // }

      if (e.key === "Escape") {
        // Возвращаем фокус в таблицу, например, на последнюю активную ячейку
        // или просто снимаем фокус с сайдбара
        (document.activeElement as HTMLElement)?.blur();
      }
    };
    window.addEventListener("keydown", handleGlobalJump);
    return () => window.removeEventListener("keydown", handleGlobalJump);
  }, []);

  const [isLeftOpen, setIsLeftOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem("sidebar_left_open");
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [isRightOpen, setIsRightOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem("sidebar_right_open");
    return saved !== null ? JSON.parse(saved) : true;
  });

  const isFullWidth = fullWidthPages.some((path) => location.pathname.startsWith(path));

  // Автоматическое скрытие на мобильных при первой загрузке
  useEffect(() => {
    if (window.innerWidth < 1024) {
      setIsLeftOpen(false);
      setIsRightOpen(false);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("sidebar_left_open", JSON.stringify(isLeftOpen));
  }, [isLeftOpen]);

  useEffect(() => {
    localStorage.setItem("sidebar_right_open", JSON.stringify(isRightOpen));
  }, [isRightOpen]);

  return (
    <div className="flex flex-col h-screen text-[11px] md:text-base bg-gray-100 dark:bg-slate-900 text-gray-900 dark:text-slate-100 overflow-hidden print:p-0 print:m-0 print:bg-white print:block print:h-auto">
      {/* 1. ХЕДЕР */}
      {isSubdomain ? <Header onToggleSidebar={() => setIsLeftOpen((v) => !v)} onToggleSidebarRight={() => setIsRightOpen((v) => !v)} /> : <AdminHeader />}

      {/* 2. РАБОЧАЯ ОБЛАСТЬ */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {/* ЛЕВЫЙ САЙДБАР */}
        {isSubdomain ? <SidebarLeft isOpen={isLeftOpen} setIsOpen={setIsLeftOpen} /> : <AdminSidebarLeft />}

        {/* OVERLAY: затемнение контента при открытом сайдбаре на мобильных */}
        {(isLeftOpen || isRightOpen) && (
          <div
            className="fixed inset-0 bg-black/40 z-30 lg:hidden"
            onClick={() => {
              setIsLeftOpen(false);
              setIsRightOpen(false);
            }}
          />
        )}

        {/* ГЛАВНАЯ ОБЛАСТЬ (Серый фон) */}
        <main className="flex-1 flex flex-col min-w-0 bg-gray-100 dark:bg-slate-950 p-1 ml-12 lg:ml-0 md:p-2 overflow-hidden print:m-0 print:p-0">
          {/* БЕЛАЯ КАРТОЧКА (Центрирована, ограничена по ширине) */}
          <div
            className={`
              flex-1 overflow-auto bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 rounded-lg print:border-none print:shadow-none
              ${isFullWidth ? "w-full" : "w-full max-w-screen-2xl mx-auto"}
              p-2 md:p-4
            `}
          >
            {/* Шапка для печати */}
            <div className="hidden print:flex print:items-center print:justify-between print:mb-4 print:pb-2 print:border-b print:border-gray-300">
              <CompanyHeaderInfo logoUrl={currentCompany?.logo ?? currentCompany?.logo2} name={currentCompany?.name} />
              <div className="text-right text-xs text-gray-500">
                <div>
                  {t("Printed")}: {currentUser?.full_name}
                </div>
                <div>
                  {t("Date")}: {new Date().toLocaleString("ru-RU")}
                </div>
              </div>
            </div>
            <Outlet />
          </div>
        </main>

        {/* ПРАВЫЙ САЙДБАР */}
        {isSubdomain && <SidebarRight isOpen={isRightOpen} setIsOpen={setIsRightOpen} />}
      </div>
    </div>
  );
};

export default AppLayout;
