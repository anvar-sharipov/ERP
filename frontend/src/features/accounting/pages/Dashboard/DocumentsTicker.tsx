// frontend/src/features/accounting/pages/Dashboard/DocumentsTicker.tsx
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Receipt } from "lucide-react";
import { ROUTES } from "../../../../core/router/routes";

export interface TickerDocument {
  id: number;
  number: string;
  document_type: string;
  counterparty_name: string;
  warehouse_name: string;
  total: string;
  posted_at: string;
}

interface Props {
  documents: TickerDocument[];
  /** Крупный режим для TV. */
  large?: boolean;
}

const fmt = (v: number | string) => Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

// ✅ Бегущая строка — CSS keyframes (translateX), без сторонних библиотек,
// список продублирован дважды подряд для бесшовной прокрутки по кругу.
// Переиспользуется на самой странице дашборда и в TV-режиме (см. большой
// вариант через large — крупнее шрифт/иконки).
export const DocumentsTicker = ({ documents, large = false }: Props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (documents.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-gray-400 text-sm">
        {t("NoInvoicesToday")}
      </div>
    );
  }

  const items = [...documents, ...documents]; // дублируем для бесшовного цикла

  return (
    <div
      className={`overflow-hidden rounded-lg border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/60 dark:bg-indigo-950/30 ${large ? "py-3" : "py-2"}`}
    >
      <div className="flex w-max" style={{ animation: `ticker-scroll ${Math.max(20, documents.length * 6)}s linear infinite` }}>
        {items.map((d, i) => (
          <button
            key={`${d.id}-${i}`}
            type="button"
            onClick={() => navigate(ROUTES.APP.DOCUMENTS_VIEW.replace(":id", String(d.id)))}
            className={`flex items-center gap-2 shrink-0 px-5 border-r border-indigo-200/60 dark:border-indigo-900/40 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors ${large ? "text-base" : "text-sm"}`}
          >
            <Receipt className={large ? "w-5 h-5 text-indigo-500" : "w-3.5 h-3.5 text-indigo-500"} />
            <span className="text-gray-500 dark:text-gray-400 tabular-nums">{fmtTime(d.posted_at)}</span>
            <span className="font-semibold text-gray-800 dark:text-gray-100">№{d.number}</span>
            <span className="text-gray-600 dark:text-gray-300">{d.counterparty_name}</span>
            <span className="font-bold text-gray-900 dark:text-white tabular-nums">{fmt(d.total)}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
