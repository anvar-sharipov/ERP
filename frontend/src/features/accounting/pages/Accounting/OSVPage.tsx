// // frontend/src/features/accounting/pages/Accounting/OSVPage.tsx
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { FileSpreadsheet } from "lucide-react";
import { accountApi } from "../../services/accountingApi";
import { useDateStore } from "../../../../core/store/dateStore";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import { Loader } from "../../../../components/ui/Loader";
import { useSidebar } from "../../../../core/context/SidebarRightContext";
import { useCompany } from "../../../../core/context/CompanyContext";
import { useUser } from "../../../../core/context/UserContext";
import { OSVTable } from "../../../../components/ui/Table/OSVTable";
import { ROUTES } from "../../../../core/router/routes";
import { exportOSVExcel } from "./exportOSVExcel";
import { HelpButton } from "../../../../components/ui/HelpButton";

interface OSVRow {
  id: number;
  code: string;
  name: string;
  account_type: string;
  is_group: boolean;
  depth: number;
  opening_debit: string;
  opening_credit: string;
  debit_turnover: string;
  credit_turnover: string;
  closing_debit: string;
  closing_credit: string;
}

const OSVPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { periodFrom, periodTo, workBranch, workWarehouse } = useDateStore();
  const [showZero, setShowZero] = useState(false);
  // ✅ Ресурс должен совпадать с тем, что реально проверяет бэкенд для этого
  // эндпоинта — GET /journal-entries/osv/ гейтится через _rbac(action, 'journalentry')
  // (см. JournalEntryViewSet.get_permissions), а не 'account'.
  const { canView } = usePageAccess("journalentry");
  const { setSidebarContent } = useSidebar();
  const { company } = useCompany();
  const { user } = useUser();

  // ✅ Реагируем на текущий выбранный склад/филиал (WorkDateWidget, правый сайдбар) —
  // выбран конкретный склад — показываем обороты только по нему; выбран только филиал
  // (без склада) — по всем складам этого филиала; не выбрано ничего — весь scope
  // пользователя (бэкенд сам пересекает это с RBAC-scope, см. JournalEntryViewSet.osv).
  const { data: rows = [], isLoading } = useQuery<OSVRow[]>({
    queryKey: ["osv", periodFrom, periodTo, showZero, workBranch?.id, workWarehouse?.id],
    queryFn: () =>
      accountApi.getOSV({
        date_from: periodFrom,
        date_to: periodTo,
        show_zero: showZero,
        ...(workWarehouse?.id ? { warehouse: String(workWarehouse.id) } : workBranch?.id ? { branch: String(workBranch.id) } : {}),
      }),
    enabled: !!periodFrom && !!periodTo && canView,
  });

  const handleExportExcel = () => {
    if (!periodFrom || !periodTo || rows.length === 0) return;
    exportOSVExcel({ company, user, t, periodFrom, periodTo, rows });
  };

  // Сайдбар — Excel-экспорт + чекбокс показать нулевые
  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <button
          type="button"
          onClick={handleExportExcel}
          disabled={rows.length === 0}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-medium text-sm hover:bg-emerald-500/20 hover:border-emerald-400/60 active:scale-95 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <FileSpreadsheet className="w-4 h-4" />
          {t("ExportToExcel")}
        </button>
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSidebarContent, showZero, t, rows]);

  return (
    <RBACGuard isLoading={false} error={null} canView={canView} forbiddenText={t("ForbiddenText")}>
      <div className="space-y-3">
        {/* Заголовок периода */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm md:text-lg font-bold text-gray-800 dark:text-gray-100">{t("OSVTitle")}</h2>
            <HelpButton title={t("OSVTitle")}>
              <p>
                <b>ОСВ (оборотно-сальдовая ведомость)</b> — по каждому счёту показывает входящий остаток на начало периода,
                обороты (Дт/Кт) за период и исходящий остаток на конец — стандартный бухгалтерский отчёт для проверки того,
                что дебет равен кредиту, и для контроля остатков по счетам.
              </p>
              <ul>
                <li>
                  <b>Период</b> берётся из виджета «Период отчётов» в правом сайдбаре — тот же период, что и у других отчётов
                  (ОСВ здесь его не задаёт, только читает).
                </li>
                <li>
                  <b>Учитываются только проведённые операции</b> — черновики проводок на остатки/обороты не влияют.
                </li>
                <li>
                  <b>Счета-группы</b> (выделены жирным и серым фоном, с отступом по вложенности) показывают сумму всех своих
                  дочерних счетов и подгрупп — не свои отдельные проводки (у групп проводок не бывает).
                </li>
                <li>
                  <b>Двойной клик по счёту</b> (или Enter/F2, если строка выделена стрелками) открывает Журнал проводок,
                  отфильтрованный по этому счёту, за тот же период — так можно посмотреть, из каких именно операций
                  сложилась сумма. Для счетов-групп это недоступно — у них нет своих проводок.
                </li>
                <li>
                  <b>«Показать нулевые счета»</b> (правый сайдбар) — по умолчанию скрыты счета/группы, у которых все суммы за
                  период равны нулю.
                </li>
                <li>
                  <b>«Экспорт в Excel»</b> (правый сайдбар) — выгружает ровно то, что видно на экране (с той же иерархией и
                  итогами), включая шапку компании.
                </li>
              </ul>
            </HelpButton>
          </div>
          {periodFrom && periodTo && (
            <span className="text-gray-500 dark:text-gray-400">
              {new Date(periodFrom).toLocaleDateString("ru-RU")} — {new Date(periodTo).toLocaleDateString("ru-RU")}
            </span>
          )}
        </div>

        {!periodFrom || !periodTo ? (
          <div className="text-center py-12 text-gray-400">{t("SpecifyPeriod")}</div>
        ) : isLoading ? (
          <Loader containerClass="py-12" text={t("LoadingReport")} progress="indeterminate" />
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-gray-400">{t("NoDataForPeriod")}</div>
        ) : (
          <OSVTable
            rows={rows}
            onRowDoubleClick={(row) => {
              // ✅ Drill-down — переходим в Журнал проводок, отфильтрованный по этому
              // счёту. Период передавать не нужно — Журнал берёт его из того же
              // глобального periodFrom/periodTo, что и сама ОСВ.
              const params = new URLSearchParams({
                account: String(row.id),
                account_code: row.code,
                account_name: row.name,
              });
              navigate(`${ROUTES.APP.JOURNAL_ENTRIES}?${params.toString()}`);
            }}
          />
        )}
      </div>
    </RBACGuard>
  );
};

export default OSVPage;
