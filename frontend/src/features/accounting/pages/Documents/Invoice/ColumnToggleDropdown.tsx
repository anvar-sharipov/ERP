// frontend/src/features/accounting/pages/Documents/Invoice/ColumnToggleDropdown.tsx
import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Columns, Monitor, Printer, RotateCcw } from "lucide-react";
import { type ColumnDef } from "./Interface";

interface Props {
  columns: ColumnDef[];
  onToggleScreen: (key: string) => void;
  onTogglePrint: (key: string) => void;
  onReset: () => void;
}

const ColumnToggleDropdown = ({ columns, onToggleScreen, onTogglePrint, onReset }: Props) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Закрыть при клике вне
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Закрыть по Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const editableCols = columns.filter((c) => !c.locked);

  return (
    <div ref={ref} className="relative print:hidden">
      {/* Кнопка */}
      <button
        onClick={() => setOpen((p) => !p)}
        className={`
          flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
          border transition-colors
          ${
            open
              ? "bg-indigo-600 border-indigo-500 text-white"
              : "bg-white dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-600 dark:text-gray-300 hover:border-indigo-400 dark:hover:border-indigo-500"
          }
        `}
        title={t("ColumnVisibility")}
      >
        <Columns className="w-3.5 h-3.5" />
        <span>{t("Columns")}</span>
      </button>

      {/* Дропдаун */}
      {open && (
        <div
          className="
          absolute right-0 top-full mt-1 z-50
          w-72 rounded-xl shadow-xl
          bg-white dark:bg-slate-800
          border border-gray-200 dark:border-slate-600
          overflow-hidden
        "
        >
          {/* Шапка */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-700/50">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t("ColumnVisibility")}</span>
            <button
              onClick={() => {
                onReset();
              }}
              className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
              title={t("ResetColumns")}
            >
              <RotateCcw className="w-3 h-3" />
              {t("Reset")}
            </button>
          </div>

          {/* Легенда */}
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-3 py-1.5 border-b border-gray-100 dark:border-slate-700">
            <span />
            <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
              <Monitor className="w-3 h-3" />
              {t("Screen")}
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
              <Printer className="w-3 h-3" />
              {t("Print")}
            </span>
          </div>

          {/* Список колонок */}
          <div className="overflow-y-auto max-h-80 py-1">
            {editableCols.map((col) => (
              <div key={col.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-slate-700/40 transition-colors">
                <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{t(col.label)}</span>

                {/* Экран */}
                <button
                  onClick={() => onToggleScreen(col.key)}
                  className={`
                    w-5 h-5 rounded flex items-center justify-center transition-colors border
                    ${col.visibleScreen ? "bg-indigo-500 border-indigo-500 text-white" : "border-gray-300 dark:border-slate-500 text-transparent hover:border-indigo-400"}
                  `}
                >
                  <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                    <polyline points="1,6 4,9 11,2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {/* Печать */}
                <button
                  onClick={() => onTogglePrint(col.key)}
                  className={`
                    w-5 h-5 rounded flex items-center justify-center transition-colors border
                    ${col.visiblePrint ? "bg-emerald-500 border-emerald-500 text-white" : "border-gray-300 dark:border-slate-500 text-transparent hover:border-emerald-400"}
                  `}
                >
                  <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                    <polyline points="1,6 4,9 11,2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {/* Футер — подсказка */}
          <div className="px-3 py-2 border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-700/30">
            <p className="text-xs text-gray-400 dark:text-gray-500">{t("ColumnsHint")}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ColumnToggleDropdown;
