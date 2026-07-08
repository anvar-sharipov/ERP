// frontend/src/features/accounting/pages/Counterparties/CounterpartySaldoModal.tsx
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { Modal } from "../../../../components/ui/Modal/Modal";
import { Input } from "../../../../components/ui/Input";
import { Loader } from "../../../../components/ui/Loader";
import { SaldoTable } from "../../../../components/ui/SaldoTable";
import { useDateStore } from "../../../../core/store/dateStore";
import { counterpartyApi } from "../../services/productApi";

interface CounterpartySaldoModalProps {
  counterparty: { id: number; name: string } | null;
  onClose: () => void;
}

// ✅ Модалка сальдо контрагента — открывается по двойному клику/Enter на строке
// в CounterpartiesPage.tsx (вместо формы редактирования, см. CLAUDE.md про
// drill-down из отчётов — просмотр, а не случайное редактирование). Период по
// умолчанию — periodFrom/periodTo из WorkDateWidget.tsx (правого сайдбара), но
// настраивается прямо в модалке (свои поля "с"/"по") и реагирует на них живьём —
// как и на смену филиала/склада в сайдбаре, см. правило CLAUDE.md про
// WorkDateWidget. По каждому счёту, где у контрагента есть проводки (обычно
// один — 62 "Клиенты" или 60 "Поставщики"), отдельная SaldoTable — та же
// таблица/расчёт, что и на форме накладной (см. CounterpartyBalanceCard.tsx).
export function CounterpartySaldoModal({ counterparty, onClose }: CounterpartySaldoModalProps) {
  const { t } = useTranslation();
  const { periodFrom, periodTo, workBranch, workWarehouse } = useDateStore(
    useShallow((s) => ({
      periodFrom: s.periodFrom,
      periodTo: s.periodTo,
      workBranch: s.workBranch,
      workWarehouse: s.workWarehouse,
    })),
  );

  const [dateFrom, setDateFrom] = useState(periodFrom);
  const [dateTo, setDateTo] = useState(periodTo);

  // ✅ Каждый раз, когда открывается модалка для (возможно, другого) контрагента —
  // подхватываем актуальный период из сайдбара заново, но дальше он свой, локальный.
  useEffect(() => {
    if (counterparty) {
      setDateFrom(periodFrom);
      setDateTo(periodTo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counterparty?.id]);

  const enabled = !!counterparty && !!dateFrom && !!dateTo;

  const { data, isLoading } = useQuery({
    queryKey: ["counterparty-saldo", counterparty?.id, dateFrom, dateTo, workBranch?.id, workWarehouse?.id],
    queryFn: () =>
      counterpartyApi.getSaldo(counterparty!.id, {
        date_from: dateFrom,
        date_to: dateTo,
        ...(workWarehouse?.id ? { warehouse: String(workWarehouse.id) } : workBranch?.id ? { branch: String(workBranch.id) } : {}),
      }),
    enabled,
  });

  return (
    <Modal isOpen={!!counterparty} onClose={onClose} title={counterparty ? `${t("CounterpartyBalance")}: ${counterparty.name}` : ""} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input type="date" label={t("From")} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="date" label={t("To")} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>

        {isLoading ? (
          <Loader containerClass="py-6" text={t("Loading")} progress="indeterminate" />
        ) : !data?.accounts?.length ? (
          <p className="text-sm text-gray-400 text-center py-4">{t("NoRows")}</p>
        ) : (
          <div className="space-y-5">
            {data.accounts.map((acc, i) => (
              <div key={i}>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-2 truncate">
                  {acc.account_code} {acc.account_name} — {acc.subconto_label}
                </p>
                <SaldoTable data={acc} />
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
