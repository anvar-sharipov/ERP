// // frontend/src/features/accounting/pages/Accounting/OSVPage.tsx
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { accountApi } from "../../services/accountingApi";
import { useDateStore } from "../../../../core/store/dateStore";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import { useSidebar } from "../../../../core/context/SidebarRightContext";
import { OSVTable } from "../../../../components/ui/Table/OSVTable";

interface OSVRow {
  id: number;
  code: string;
  name: string;
  account_type: string;
  opening_debit: string;
  opening_credit: string;
  debit_turnover: string;
  credit_turnover: string;
  closing_debit: string;
  closing_credit: string;
}

const OSVPage = () => {
  const { t } = useTranslation();
  const { periodFrom, periodTo } = useDateStore();
  const [showZero, setShowZero] = useState(false);
  const { canView } = usePageAccess("account");
  const { setSidebarContent } = useSidebar();

  // Сайдбар — чекбокс показать нулевые
  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <div>
          <h4 className="font-bold text-indigo-300 mb-2 uppercase tracking-wider">{t("OSVSettings")}</h4>
          <label className="flex items-center gap-2 text-indigo-200 cursor-pointer">
            <input type="checkbox" checked={showZero} onChange={(e) => setShowZero(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-indigo-600" />
            {t("ShowZeroAccounts")}
          </label>
        </div>
        <div className="pt-2 border-t border-indigo-900/30 text-indigo-400/60 space-y-1">
          <p>{t("PeriodSetAbove")}</p>
          <p>{t("OnlyPostedTransactions")}</p>
        </div>
      </div>,
    );
  }, [setSidebarContent, showZero, t]);

  const { data: rows = [], isLoading } = useQuery<OSVRow[]>({
    queryKey: ["osv", periodFrom, periodTo, showZero],
    queryFn: () =>
      accountApi.getOSV({
        date_from: periodFrom,
        date_to: periodTo,
        show_zero: showZero,
      }),
    enabled: !!periodFrom && !!periodTo && canView,
  });

  return (
    <RBACGuard isLoading={false} error={null} canView={canView} forbiddenText={t("ForbiddenText")}>
      <div className="space-y-3">
        {/* Заголовок периода */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm md:text-lg font-bold text-gray-800 dark:text-gray-100">{t("OSVTitle")}</h2>
          {periodFrom && periodTo && (
            <span className="text-gray-500 dark:text-gray-400">
              {new Date(periodFrom).toLocaleDateString("ru-RU")} — {new Date(periodTo).toLocaleDateString("ru-RU")}
            </span>
          )}
        </div>

        {!periodFrom || !periodTo ? (
          <div className="text-center py-12 text-gray-400">{t("SpecifyPeriod")}</div>
        ) : isLoading ? (
          <div className="text-center py-12 text-gray-400">{t("Loading")}</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-gray-400">{t("NoDataForPeriod")}</div>
        ) : (
          <div className="flex">
            <div className="overflow-x-auto rounded-lg border border-green-700 dark:border-green-800 w-fit">
              <OSVTable
                rows={rows}
                onRowDoubleClick={(row) => {
                  // потом добавим drill-down
                  console.log("drill into", row.code);
                }}
              />
            </div>
          </div>
        )}
      </div>
    </RBACGuard>
  );
};

export default OSVPage;
