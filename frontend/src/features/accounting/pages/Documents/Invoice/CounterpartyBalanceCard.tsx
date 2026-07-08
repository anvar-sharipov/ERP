// frontend/src/features/accounting/pages/Documents/Invoice/CounterpartyBalanceCard.tsx
import { useTranslation } from "react-i18next";
import { type CounterpartyCard } from "../../../services/documentApi";
import { Loader } from "../../../../../components/ui/Loader";
import { SaldoTable } from "../../../../../components/ui/SaldoTable";

interface CounterpartyBalanceCardProps {
  data: CounterpartyCard | undefined;
  isLoading: boolean;
  enabled: boolean;
}

// ✅ Карточка сальдо контрагента под таблицей товаров формы накладной — реальный
// расчёт по проводкам (DocumentViewSet.counterparty_card → _compute_subconto_card),
// а не наивная сумма всех Document.total. Работает и для ещё не сохранённого
// черновика. Вёрстка (SaldoTable) переиспользуется и в CounterpartySaldoModal.tsx
// (модалка сальдо по двойному клику из CounterpartiesPage.tsx) — один источник
// расчёта и разметки вместо двух копий. Данные (data/isLoading) приходят как
// props из DocumentFormPage.tsx — та же query используется для этого виджета,
// для Ctrl+P печати (эта же вёрстка, просто без print:hidden) и для
// Excel-экспорта (exportDocumentExcel.ts), без трёх независимых копий (см.
// CLAUDE.md про паритет экран/печать/Excel).
export function CounterpartyBalanceCard({ data, isLoading, enabled }: CounterpartyBalanceCardProps) {
  const { t } = useTranslation();

  if (!enabled) return null;

  if (isLoading) {
    return (
      <div className="pt-2 print:hidden">
        <Loader size={24} dotSize={6} containerClass="py-1" text={t("Loading")} progress="indeterminate" />
      </div>
    );
  }

  if (!data) return null;
  if (!data.available) return null;

  return (
    <div className="pt-2 max-w-md ml-auto">
      <p className="text-xs print:text-[10px] text-gray-400 dark:text-gray-500 print:text-black mb-2 truncate">
        {data.account_code} {data.account_name} — {data.subconto_label}
      </p>
      <SaldoTable data={data} />
    </div>
  );
}
