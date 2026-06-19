// // frontend/src/components/Layouts/SidebarRight.tsx

import React from "react";
import { useSidebar } from "../../core/context/SidebarRightContext";
import { playAside2Sound } from "../../core/utils/sound";
import { useCompany } from "../../core/context/CompanyContext";
import WorkDateWidget from "../ui/WorkDateWidget";

interface SidebarRightProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const SidebarRight: React.FC<SidebarRightProps> = ({ isOpen, setIsOpen }) => {
  const { sidebarContent } = useSidebar();
  const { company: currentCompany } = useCompany();

  return (
    <>
      {/* 1. Мобильная кнопка (видна только если есть контент и экран узкий) */}
      {sidebarContent && (
        <button
          onClick={() => {
            playAside2Sound();
            setIsOpen(!isOpen);
          }}
          className="fixed right-0 top-15 w-5 h-5 bg-indigo-900 border border-indigo-700 rounded-l-full flex items-center justify-center shadow-lg hover:bg-indigo-800 z-50 lg:hidden print:!hidden"
        >
          <svg className={`w-4 h-4 text-indigo-300 transition-transform duration-300 ${!isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* 2. Контейнер для десктопной кнопки и самой панели */}
      <div className="relative flex print:hidden">
        {/* Десктопная кнопка (скрыта на мобильных, видна на lg) */}
        <button
          onClick={() => {
            playAside2Sound();
            setIsOpen(!isOpen);
          }}
          className="lg:flex absolute -left-3 top-0 w-6 h-6 bg-indigo-900 border border-indigo-700 rounded-full items-center justify-center shadow-lg hover:bg-indigo-800 z-10 transition-colors"
        >
          <svg className={`w-4 h-4 text-indigo-300 transition-transform duration-300 ${!isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Сама панель */}
        <aside
          //   className={`
          //   border-l border-slate-500 bg-slate-800 dark:bg-slate-900 transition-all duration-300 overflow-hidden
          //   fixed right-0 top-16 h-[calc(100vh-4rem)] z-40
          //   lg:relative lg:top-0 lg:h-full
          //   ${isOpen ? "w-80 p-4 opacity-100" : "w-0 p-0 opacity-0 border-l-0"}
          // `}
          className={`
          border-l border-slate-500 bg-slate-800 dark:bg-slate-900 transition-all duration-300
          fixed right-0 top-16 h-[calc(100vh-4rem)] z-40
          lg:relative lg:top-0 lg:h-full
          ${isOpen ? "w-80 opacity-100" : "w-0 opacity-0 border-l-0"}
          overflow-hidden flex flex-col
        `}
        >
          <div className="p-3 border-b border-indigo-900/30">
            <WorkDateWidget />
          </div>
          {/* Контейнер с контентом и скроллом */}
          <div className={`flex-1 overflow-y-auto p-4 ${isOpen ? "block" : "hidden"}`}>
            {sidebarContent || (
              <div className="text-indigo-400">
                <div>{currentCompany?.name}</div>
              </div>
            )}
          </div>
          {/* {sidebarContent || (
            <div className="text-indigo-400">
              <div>{currentCompany?.name}</div>
            </div>
          )} */}
        </aside>
      </div>
    </>
  );
};

export default SidebarRight;
