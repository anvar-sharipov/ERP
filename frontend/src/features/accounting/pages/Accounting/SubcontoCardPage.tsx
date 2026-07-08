// frontend/src/features/accounting/pages/Accounting/SubcontoCardPage.tsx
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FileSpreadsheet } from "lucide-react";
import { accountApi } from "../../services/accountingApi";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { useRestoreScroll } from "../../../../core/hooks/useRestoreScroll";
import { useDateStore } from "../../../../core/store/dateStore";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import { HelpButton } from "../../../../components/ui/HelpButton";
import { BackButton } from "../../../../components/ui/BackButton";
import { Loader } from "../../../../components/ui/Loader";
import { useCompany } from "../../../../core/context/CompanyContext";
import { useUser } from "../../../../core/context/UserContext";
import { exportSubcontoCardExcel } from "./exportSubcontoCardExcel";

interface CardRow {
  date: string;
  journal_entry_id: number;
  comment: string;
  corr_account: string;
  debit: number;
  credit: number;
  balance: number;
}

interface CardResponse {
  items: CardRow[];
  opening_balance: number;
  closing_balance: number;
  total_debit: number;
  total_credit: number;
  account_code: string;
  account_name: string;
  subconto_label: string;
}

const fmt = (v: number | string) => Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 2 });
const td = "border border-black dark:border-gray-700 px-1.5 py-1 text-xs md:text-sm whitespace-nowrap";
const th = "border border-black dark:border-gray-600 px-1.5 py-1 text-xs md:text-sm font-semibold text-center whitespace-nowrap";

const SubcontoCardPage = () => {
  const { t } = useTranslation();
  const { accountId, subcontoId } = useParams<{ accountId: string; subcontoId: string }>();
  const [searchParams] = useSearchParams();
  const { canView } = usePageAccess("journalentry");
  const { company } = useCompany();
  const { user } = useUser();

  const { getBackProps } = useRestoreScroll("selectedSubcontoBreakdownRow", () => {});

  // ✅ Живое чтение из useDateStore(), а не замороженные значения из URL —
  // см. CLAUDE.md: drill-down отчёты обязаны реагировать на WorkDateWidget так же,
  // как и страница, с которой на них перешли (эта карточка — уже второй уровень).
  const { periodFrom, periodTo, workBranch, workWarehouse } = useDateStore();
  const dateFrom = periodFrom ?? "";
  const dateTo = periodTo ?? "";
  const subcontoSlug = searchParams.get("subconto_slug") ?? "";
  const warehouse = workWarehouse?.id ? String(workWarehouse.id) : undefined;
  const branch = !workWarehouse?.id && workBranch?.id ? String(workBranch.id) : undefined;

  const { data, isLoading } = useQuery<CardResponse>({
    queryKey: ["subconto-card", accountId, subcontoId, subcontoSlug, dateFrom, dateTo, warehouse, branch],
    queryFn: () =>
      accountApi.getSubcontoCard({
        account: accountId!,
        subconto_slug: subcontoSlug,
        subconto_id: subcontoId!,
        date_from: dateFrom,
        date_to: dateTo,
        warehouse,
        branch,
      }),
    enabled: !!accountId && !!subcontoId && !!subcontoSlug && !!dateFrom && !!dateTo && canView,
  });

  // ✅ Сохраняем выбранную строку (subconto_id), чтобы SubcontoBreakdownPage
  // подсветил её при возврате назад — тот же приём, что в ProductTurnoverDetailPage.
  useEffect(() => {
    if (subcontoId) sessionStorage.setItem("selectedSubcontoBreakdownRow", subcontoId);
  }, [subcontoId]);

  const handleExportExcel = () => {
    if (!data) return;
    exportSubcontoCardExcel({
      company,
      user,
      t,
      dateFrom,
      dateTo,
      accountCode: data.account_code,
      accountName: data.account_name,
      subcontoLabel: data.subconto_label,
      rows: data.items,
      openingBalance: data.opening_balance,
      closingBalance: data.closing_balance,
      totalDebit: data.total_debit,
      totalCredit: data.total_credit,
    });
  };

  return (
    <RBACGuard isLoading={false} error={null} canView={canView} forbiddenText={t("ForbiddenText")}>
      {isLoading ? (
        <Loader containerClass="py-12" text={t("LoadingReport")} progress="indeterminate" />
      ) : !data ? (
        <div className="text-center py-12 text-gray-400">{t("NoDataForPeriod")}</div>
      ) : (
        <div className="space-y-3 p-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <BackButton id={Number(subcontoId) || 0} getBackProps={getBackProps} />
              <h2 className="text-sm md:text-lg font-bold text-gray-800 dark:text-gray-100">
                {data.account_code} {data.account_name} — {data.subconto_label}
              </h2>
              <HelpButton title={t("AccountCard")}>
                <p>
                  Карточка счёта <b>{data.account_code} {data.account_name}</b> по одному значению субконто —{" "}
                  <b>{data.subconto_label}</b>: все проводки за период в хронологическом порядке, с бегущим остатком
                  после каждой строки.
                </p>
                <ul>
                  <li>
                    <b>Корр.счёт</b> — счёт по другой стороне той же проводки (если проводка более сложная — берётся
                    первый найденный).
                  </li>
                  <li>
                    <b>Начальное сальдо</b> — на начало периода, с учётом всех проводок ДО него.
                  </li>
                </ul>
              </HelpButton>
            </div>
            <button
              type="button"
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              {t("ExportToExcel")}
            </button>
          </div>

          <span className="text-xs text-gray-500 dark:text-gray-400">
            {t("Period")}: {new Date(dateFrom).toLocaleDateString("ru-RU")} — {new Date(dateTo).toLocaleDateString("ru-RU")}
          </span>

          <div className="overflow-x-auto rounded-lg border border-black dark:border-gray-700">
            <table className="border-collapse w-full text-xs md:text-sm tabular-nums bg-white dark:bg-gray-900">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-800">
                  <th className={th}>№</th>
                  <th className={th}>{t("Date")}</th>
                  <th className={th}>{t("CorrAccount")}</th>
                  <th className={th}>{t("Comment")}</th>
                  <th className={th}>{t("Debit")}</th>
                  <th className={th}>{t("Credit")}</th>
                  <th className={th}>{t("Balance")}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-gray-50 dark:bg-gray-800 font-semibold">
                  <td className={td} />
                  <td className={td} colSpan={3}>{t("OpeningBalance")}</td>
                  <td className={td} colSpan={2} />
                  <td className={`${td} text-right`}>{fmt(data.opening_balance)}</td>
                </tr>
                {data.items.map((r, i) => (
                  <tr key={r.journal_entry_id} className="hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors">
                    <td className={`${td} text-center`}>{i + 1}</td>
                    <td className={td}>{new Date(r.date).toLocaleDateString("ru-RU")}</td>
                    <td className={`${td} text-center font-mono font-bold text-blue-600 dark:text-blue-400`}>{r.corr_account}</td>
                    <td className={td}>{r.comment || "—"}</td>
                    <td className={`${td} text-right text-green-700 dark:text-green-400`}>{r.debit ? fmt(r.debit) : "—"}</td>
                    <td className={`${td} text-right text-red-700 dark:text-red-400`}>{r.credit ? fmt(r.credit) : "—"}</td>
                    <td className={`${td} text-right font-medium`}>{fmt(r.balance)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-100 dark:bg-gray-800 font-semibold">
                  <td className={td} colSpan={4}>{t("TotalTurnover")}</td>
                  <td className={`${td} text-right`}>{fmt(data.total_debit)}</td>
                  <td className={`${td} text-right`}>{fmt(data.total_credit)}</td>
                  <td className={td} />
                </tr>
                <tr className="bg-emerald-100 dark:bg-emerald-900/40 font-semibold">
                  <td className={td} />
                  <td className={td} colSpan={3}>{t("ClosingBalance")}</td>
                  <td className={td} colSpan={2} />
                  <td className={`${td} text-right`}>{fmt(data.closing_balance)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </RBACGuard>
  );
};

export default SubcontoCardPage;
