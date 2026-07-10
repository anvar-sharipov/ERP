// frontend/src/features/accounting/pages/Dashboard/TopList.tsx
import { useTranslation } from "react-i18next";

export interface TopListRow {
  id: number;
  name: string;
  revenue: string;
  extraLabel: string;
  extraValue: string;
}

interface Props {
  rows: TopListRow[];
  /** Крупный режим для TV-режима — больше шрифт/отступы. */
  large?: boolean;
}

const fmt = (v: number | string) => Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ✅ Топ-5 — статичный ранжированный список максимум из 5 строк, без drill-down
// и без постраничности, к тому же переиспользуется и в компактном виде на
// дашборде, и крупнее в TV-режиме — полноценная keyboard-навигация таблиц
// (см. правило в CLAUDE.md) здесь неприменима так же, как к плиткам итогов:
// нечего листать стрелками и некуда "проваливаться" по Enter.
export const TopList = ({ rows, large = false }: Props) => {
  const { t } = useTranslation();

  if (rows.length === 0) {
    return <div className="text-center py-6 text-gray-400 text-xs md:text-sm">{t("NoDataForPeriod")}</div>;
  }

  return (
    <div className={large ? "space-y-3" : "space-y-2"}>
      {rows.map((r, i) => (
        <div key={r.id} className="flex items-center gap-3">
          <span
            className={`shrink-0 flex items-center justify-center rounded-full font-bold tabular-nums
              bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300
              ${large ? "w-9 h-9 text-base" : "w-6 h-6 text-xs"}`}
          >
            {i + 1}
          </span>
          <span className={`flex-1 truncate text-gray-800 dark:text-gray-100 ${large ? "text-xl font-semibold" : "text-sm"}`}>
            {r.name}
          </span>
          <span className={`text-right shrink-0 ${large ? "text-xl" : "text-sm"}`}>
            <span className="font-bold tabular-nums text-gray-900 dark:text-white">{fmt(r.revenue)}</span>
            <span className={`block text-gray-500 dark:text-gray-400 ${large ? "text-sm" : "text-xs"}`}>
              {r.extraLabel}: {r.extraValue}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
};
