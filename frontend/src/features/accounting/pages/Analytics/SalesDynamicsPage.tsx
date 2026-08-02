// frontend/src/features/accounting/pages/Analytics/SalesDynamicsPage.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FileSpreadsheet } from "lucide-react";
import { analyticsApi } from "../../services/analyticsApi";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { useSidebar } from "../../../../core/context/SidebarRightContext";
import { useDateStore } from "../../../../core/store/dateStore";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import { HelpButton } from "../../../../components/ui/HelpButton";
import { Loader } from "../../../../components/ui/Loader";
import { Button } from "../../../../components/ui/Button";
import { LineChart } from "../../../../components/ui/Charts/LineChart";
import { useCompany } from "../../../../core/context/CompanyContext";
import { useUser } from "../../../../core/context/UserContext";
import { exportSalesDynamicsExcel } from "./exportSalesDynamicsExcel";

type Granularity = "day" | "week" | "month";

const fmt = (v: number | string) => Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 2 });
const fmtCompact = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString("ru-RU");
};
const td = "border border-black dark:border-gray-700 px-1.5 py-1 text-xs md:text-sm whitespace-nowrap";
const th = "border border-black dark:border-gray-600 px-1.5 py-1 text-xs md:text-sm font-semibold text-center whitespace-nowrap";

const StatTile = ({ label, value, className = "" }: { label: string; value: string; className?: string }) => (
  <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2">
    <div className="text-[10px] uppercase tracking-wider text-gray-400">{label}</div>
    <div className={`text-sm md:text-base font-semibold tabular-nums ${className}`}>{value}</div>
  </div>
);

const SalesDynamicsPage = () => {
  const { t } = useTranslation();
  const { canView } = usePageAccess("document");
  const { setSidebarContent } = useSidebar();
  const { company } = useCompany();
  const { user } = useUser();

  // ✅ Период/склад/филиал — из WorkDateWidget (правый сайдбар), как и у всех
  // остальных отчётов (см. CLAUDE.md). Гранулярность (день/неделя/месяц) —
  // единственный локальный фильтр страницы, в sessionStorage, чтобы не
  // терялся при случайной перезагрузке вкладки в рамках сессии.
  const { periodFrom, periodTo, workBranch, workWarehouse } = useDateStore();
  const dateFrom = periodFrom ?? "";
  const dateTo = periodTo ?? "";
  const warehouse = workWarehouse?.id ? String(workWarehouse.id) : undefined;
  const branch = !workWarehouse?.id && workBranch?.id ? String(workBranch.id) : undefined;

  const [granularity, setGranularity] = useState<Granularity>(() => {
    try {
      const v = sessionStorage.getItem("analytics_sales_dynamics_granularity");
      return v === "week" || v === "month" ? v : "day";
    } catch {
      return "day";
    }
  });
  const changeGranularity = (g: Granularity) => {
    setGranularity(g);
    try {
      sessionStorage.setItem("analytics_sales_dynamics_granularity", g);
    } catch {}
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["sales-dynamics", dateFrom, dateTo, granularity, warehouse, branch],
    queryFn: () => analyticsApi.getSalesDynamics({ date_from: dateFrom, date_to: dateTo, granularity, warehouse, branch }),
    enabled: !!dateFrom && !!dateTo && canView,
  });

  const points = useMemo(() => data?.points ?? [], [data]);

  const formatLabel = useCallback(
    (dateStr: string) => {
      const d = new Date(dateStr);
      if (granularity === "month") return d.toLocaleDateString("ru-RU", { month: "short", year: "numeric" });
      return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
    },
    [granularity],
  );

  const chartData = useMemo(() => points.map((p) => ({ label: formatLabel(p.date), value: Number(p.revenue) })), [points, formatLabel]);

  const handleExportExcel = useCallback(() => {
    if (!data || !points.length) return;
    exportSalesDynamicsExcel({
      company,
      user,
      t,
      dateFrom,
      dateTo,
      points,
      formatLabel,
      totalRevenue: data.total_revenue,
      totalDocuments: data.total_documents,
      avgCheck: data.avg_check,
    });
  }, [data, points, company, user, t, dateFrom, dateTo, formatLabel]);

  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <button
          type="button"
          onClick={handleExportExcel}
          disabled={!points.length}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-medium text-sm hover:bg-emerald-500/20 hover:border-emerald-400/60 active:scale-95 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <FileSpreadsheet className="w-4 h-4" />
          {t("ExportToExcel")}
        </button>

        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2 text-xs uppercase tracking-wider">{t("Granularity")}</h4>
          <div className="flex flex-col gap-1">
            {(
              [
                { value: "day", label: t("ByDay") },
                { value: "week", label: t("ByWeek") },
                { value: "month", label: t("ByMonth") },
              ] as const
            ).map((item) => (
              <Button key={item.value} onClick={() => changeGranularity(item.value)} text={item.label} variant="ghost" dark isActive={granularity === item.value} className="w-full justify-start" />
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-indigo-900/30 text-indigo-400/60 space-y-1">
          <p>{t("PeriodSetAbove")}</p>
          <p>{t("OnlyPostedTransactions")}</p>
        </div>
      </div>,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSidebarContent, granularity, points.length, t]);

  return (
    <RBACGuard isLoading={false} error={error} canView={canView} forbiddenText={t("ForbiddenText")}>
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm md:text-lg font-bold text-gray-800 dark:text-gray-100">{t("SalesDynamics")}</h2>
            <HelpButton title={t("SalesDynamics")}>
              <p>
                <b>Динамика продаж</b> — тренд выручки за период с группировкой по дням, неделям или месяцам.
              </p>
              <ul>
                <li>
                  <b>Выручка</b> считается так же, как и в остальных отчётах — сумма проведённых расходных накладных минус
                  возврат поставщику, по факту документа (не пересчитывается через проводки).
                </li>
                <li>
                  <b>Группировка</b> (день/неделя/месяц) — в правом сайдбаре.
                </li>
                <li>
                  <b>Период, склад, филиал</b> берутся из виджета «Рабочая дата» в правом сайдбаре — те же, что и у других
                  отчётов.
                </li>
                <li>
                  Наведите курсор на график, чтобы увидеть точное значение по дате — таблица под графиком содержит те же
                  данные построчно.
                </li>
              </ul>
            </HelpButton>
          </div>
          {dateFrom && dateTo && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {new Date(dateFrom).toLocaleDateString("ru-RU")} — {new Date(dateTo).toLocaleDateString("ru-RU")}
            </span>
          )}
        </div>

        {!dateFrom || !dateTo ? (
          <div className="text-center py-12 text-gray-400">{t("SpecifyPeriod")}</div>
        ) : isLoading ? (
          <Loader containerClass="py-12" text={t("LoadingReport")} progress="indeterminate" />
        ) : !data || points.length === 0 ? (
          <div className="text-center py-12 text-gray-400">{t("NoDataForPeriod")}</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <StatTile label={t("TotalRevenue")} value={fmt(data.total_revenue)} className="text-indigo-600 dark:text-indigo-400" />
              <StatTile label={t("DocumentsCount")} value={String(data.total_documents)} />
              <StatTile label={t("AvgCheck")} value={fmt(data.avg_check)} />
              <StatTile
                label={t("BestPeriod")}
                value={data.best_point ? `${formatLabel(data.best_point.date)} — ${fmtCompact(Number(data.best_point.revenue))}` : "—"}
                className="text-emerald-600 dark:text-emerald-400"
              />
            </div>

            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
              <LineChart data={chartData} formatValue={fmtCompact} height={240} />
            </div>

            <div className="overflow-x-auto rounded-lg border border-black dark:border-gray-700">
              <table className="border-collapse w-full text-xs md:text-sm tabular-nums bg-white dark:bg-gray-900">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-800">
                    <th className={th}>№</th>
                    <th className={th}>{t("Date")}</th>
                    <th className={th}>{t("Revenue")}</th>
                    <th className={th}>{t("DocumentsCount")}</th>
                    <th className={th}>{t("AvgCheck")}</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p, i) => (
                    <tr key={p.date} className="hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors">
                      <td className={`${td} text-center`}>{i + 1}</td>
                      <td className={td}>{formatLabel(p.date)}</td>
                      <td className={`${td} text-right`}>{fmt(p.revenue)}</td>
                      <td className={`${td} text-right`}>{p.documents_count}</td>
                      <td className={`${td} text-right`}>{fmt(p.avg_check)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-100 dark:bg-gray-800 font-semibold">
                    <td className={td} colSpan={2}>
                      {t("GrandTotal")}
                    </td>
                    <td className={`${td} text-right`}>{fmt(data.total_revenue)}</td>
                    <td className={`${td} text-right`}>{data.total_documents}</td>
                    <td className={`${td} text-right`}>{fmt(data.avg_check)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </RBACGuard>
  );
};

export default SalesDynamicsPage;
