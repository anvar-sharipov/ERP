import React, { useState, useEffect, useMemo } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { getTenantInfo } from "../../core/utils/tenant";
import { ROUTES } from "../../core/router/routes";
import Header from "./Header";
import SidebarLeft from "./SidebarLeft";
import SidebarRight from "./SidebarRight";
import { AdminHeader } from "./AdminHeader";
import { AdminSidebarLeft } from "./AdminSidebarLeft";
import { useCompany } from "../../core/context/CompanyContext";
import { useUser } from "../../core/context/UserContext";
import { CompanyHeaderInfo } from "../ui/CompanyHeaderInfo";
import { FloatingClock } from "../ui/FloatingClock";
import { useTranslation } from "react-i18next";
import { focusManager } from "../../core/utils/focusManager";
import { playAsideSound, playClick2Sound } from "../../core/utils/sound";

import { useQuery } from "@tanstack/react-query";
import { branchApi } from "../../features/accounting/services/branchApi";
import { useDateStore } from "../../core/store/dateStore";

// ✅ Глобальные F1-F5 — переход по разделам (см. CLAUDE.md-подобное требование
// пользователя: работают везде, независимо от того, что сфокусировано, в т.ч.
// внутри таблиц — поэтому F2 больше НЕ используется таблицами как "открыть
// строку" (см. Table.tsx/OSVTable.tsx/ProductTurnoverTable.tsx — там остался
// только Enter).
const F_KEY_ROUTES: Record<string, string> = {
  F1: ROUTES.APP.DOCUMENTS,
  F2: ROUTES.APP.JOURNAL,
  F3: ROUTES.APP.REPORTS,
  F4: ROUTES.APP.COUNTERPARTIES,
  F5: ROUTES.APP.EMPLOYEES,
};

export const AppLayout: React.FC = () => {
  const tenantInfo = useMemo(() => getTenantInfo(), []);
  const { isSubdomain } = tenantInfo;
  const navigate = useNavigate();
  const { company: currentCompany } = useCompany();
  const { user: currentUser } = useUser();
  const { t } = useTranslation();
  // const { workBranch } = useDateStore();
  const workBranch = useDateStore((s) => s.workBranch);

  const { data: branches = [] } = useQuery({
    queryKey: ["branches"],
    queryFn: branchApi.getBranches,
    staleTime: 60_000,
    enabled: isSubdomain,
  });

  const activeBranch = workBranch?.id ? (branches as any[]).find((b) => b.id === workBranch.id) : null;

  // console.log("currentUser", currentUser);
  // const navItemsRef = useRef<(HTMLAnchorElement | null)[]>([]);

  useEffect(() => {
    const handleGlobalJump = (e: KeyboardEvent) => {
      const fRoute = F_KEY_ROUTES[e.key];
      if (fRoute && isSubdomain) {
        e.preventDefault();
        playClick2Sound();
        navigate(fRoute);
        return;
      }

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
          // const activeLink = sidebar?.querySelector<HTMLElement>(".bg-indigo-700");
          const activeLink = sidebar?.querySelector<HTMLElement>('[aria-current="page"]');
          // если нет активного — первый focusable
          const firstFocusable = sidebar?.querySelector<HTMLElement>('[tabindex="0"]');
          (activeLink ?? firstFocusable)?.focus();
        }, 50);
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "b") {
        e.preventDefault();

        setIsRightOpen(true);
        focusManager.setRegion("sidebar-right");

        setTimeout(() => {
          const sidebar = document.querySelector('[data-region="sidebar-right"]');

          const firstFocusable = sidebar?.querySelector<HTMLElement>('input,button,select,[tabindex="0"]');

          firstFocusable?.focus();
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
  }, [navigate, isSubdomain]);

  const [isLeftOpen, setIsLeftOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem("sidebar_left_open");
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [isRightOpen, setIsRightOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem("sidebar_right_open");
    return saved !== null ? JSON.parse(saved) : true;
  });

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
      {/* 1. ХЕДЕР — та же ширина/центрирование, что и у группы сайдбары+контент ниже
          (max-w-[1900px]), чтобы шапка не была шире и не "выпирала" за их пределы. */}
      <div className="flex justify-center shrink-0">
        <div className="w-full max-w-[1900px]">
          {isSubdomain ? <Header onToggleSidebar={() => setIsLeftOpen((v) => !v)} onToggleSidebarRight={() => setIsRightOpen((v) => !v)} /> : <AdminHeader />}
        </div>
      </div>

      {/* 2. РАБОЧАЯ ОБЛАСТЬ */}
      {/* ✅ justify-center — на широких экранах вся группа (левый сайдбар + контент +
          правый сайдбар) ограничена по ширине (см. max-w на обёртке ниже) и центрируется
          целиком; свободное место остаётся СНАРУЖИ (слева от левого сайдбара и справа от
          правого), а не между сайдбарами и контентом — сайдбары всегда прижаты к контенту. */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative justify-center">
        <div className="flex w-full max-w-[1900px] min-h-0">
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
          <main className="flex-1 flex flex-col min-w-0 bg-gray-300 dark:bg-slate-950 p-1 ml-12 lg:ml-0 md:p-2 overflow-hidden print:m-0 print:p-0">
            {/* БЕЛАЯ КАРТОЧКА — заполняет всё место внутри main (общий max-width уже
                задан на обёртке сайдбары+контент выше, второй раз здесь не нужен) */}
            <div className="flex-1 overflow-auto bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 rounded-lg print:border-none print:shadow-none w-full p-2 md:p-4">
              {/* Шапка для печати */}
              <div className="hidden print:flex print:items-center print:justify-between print:mb-4 print:pb-2 print:border-b print:border-gray-300">
                {/* <CompanyHeaderInfo logoUrl={currentCompany?.logo ?? currentCompany?.logo2} name={currentCompany?.name} /> */}
                <CompanyHeaderInfo
                  logoUrl={currentCompany?.logo ?? currentCompany?.logo2}
                  name={currentCompany?.name}
                  branch={
                    activeBranch
                      ? {
                          name: activeBranch.name,
                          logo: activeBranch.logo,
                          address: activeBranch.address,
                          phone: activeBranch.phone,
                          email: activeBranch.email,
                          manager_name: activeBranch.manager_name,
                        }
                      : null
                  }
                />
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

      {/* ✅ Плавающие часы (Header.tsx — кнопка-переключатель) — поверх всего
          приложения, видны на любой странице, не только здесь в AppLayout. */}
      {isSubdomain && <FloatingClock />}
    </div>
  );
};

export default AppLayout;
