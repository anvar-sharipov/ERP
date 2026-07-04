// // frontend/src/components/Layouts/SidebarRight.tsx

import React, { useEffect, useRef } from "react";
import { useSidebar } from "../../core/context/SidebarRightContext";
import { useCompany } from "../../core/context/CompanyContext";
import WorkDateWidget from "../ui/WorkDateWidget";
import { focusManager } from "../../core/utils/focusManager";


interface SidebarRightProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const SidebarRight: React.FC<SidebarRightProps> = ({ isOpen }) => {
  const { sidebarContent } = useSidebar();
  const { company: currentCompany } = useCompany();
  const sidebarRef = useRef<HTMLElement>(null);
 

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (focusManager.getRegion() !== "sidebar-right") {
        return;
      }

      if (!sidebarRef.current) {
        return;
      }

      const focusables = Array.from(
        sidebarRef.current.querySelectorAll(
          `
          input,
          button,
          select,
          textarea,
          [tabindex="0"]
        `,
        ),
      ).filter((el) => !el.hasAttribute("disabled")) as HTMLElement[];

      if (!focusables.length) {
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        focusManager.setRegion("table");
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });

    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, []);

  return (
    <div className="relative flex print:hidden">
      <aside
        ref={sidebarRef}
        data-region="sidebar-right"
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
        <div className={`flex-1 overflow-y-auto p-4 ${isOpen ? "block" : "hidden"}`}>
          {sidebarContent || (
            <div className="text-indigo-400">
              <div>{currentCompany?.name}</div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};

// export default SidebarRight;
export default React.memo(SidebarRight);
