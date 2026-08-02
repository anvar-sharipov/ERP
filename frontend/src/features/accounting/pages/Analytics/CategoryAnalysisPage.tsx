// frontend/src/features/accounting/pages/Analytics/CategoryAnalysisPage.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FileSpreadsheet } from "lucide-react";
import { analyticsApi, type CategoryItem } from "../../services/analyticsApi";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { useSidebar } from "../../../../core/context/SidebarRightContext";
import { useDateStore } from "../../../../core/store/dateStore";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import { HelpButton } from "../../../../components/ui/HelpButton";
import { Loader } from "../../../../components/ui/Loader";
import { Button } from "../../../../components/ui/Button";
import { BarChart } from "../../../../components/ui/Charts/BarChart";
import { useCompany } from "../../../../core/context/CompanyContext";
import { useUser } from "../../../../core/context/UserContext";
import { exportCategoryAnalysisExcel } from "./exportCategoryAnalysisExcel";

type GroupBy = "category" | "brand";

const fmt = (v: number | string) => Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 2 });
const fmtPct = (v: number | string) => `${Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const fmtCompact = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString("ru-RU");
};

const td = "border border-black dark:border-gray-700 px-1.5 py-1 text-xs md:text-sm whitespace-nowrap";
const th = "border border-black dark:border-gray-600 px-1.5 py-1 text-xs md:text-sm font-semibold text-center whitespace-nowrap";

const CategoryAnalysisPage = () => {
  const { t } = useTranslation();
  const { canView } = usePageAccess("document");
  const { setSidebarContent } = useSidebar();
  const { company } = useCompany();
  const { user } = useUser();

  const { periodFrom, periodTo, workBranch, workWarehouse } = useDateStore();
  const dateFrom = periodFrom ?? "";
  const dateTo = periodTo ?? "";
  const warehouse = workWarehouse?.id ? String(workWarehouse.id) : undefined;
  const branch = !workWarehouse?.id && workBranch?.id ? String(workBranch.id) : undefined;

  const [groupBy, setGroupBy] = useState<GroupBy>(() => {
    try {
      const v = sessionStorage.getItem("analytics_category_group_by");
      return v === "brand" ? "brand" : "category";
    } catch {
      return "category";
    }
  });
  const changeGroupBy = (g: GroupBy) => {
    setGroupBy(g);
    try {
      sessionStorage.setItem("analytics_category_group_by", g);
    } catch {}
  };

  const groupLabel = groupBy === "brand" ? t("Brand") : t("Category");
  const resolveGroupName = useCallback((it: CategoryItem) => it.group_name ?? (it.no_name_key ? t(it.no_name_key) : "—"), [t]);

  const filters = useMemo(
    () => ({
      date_from: dateFrom,
      date_to: dateTo,
      ...(warehouse ? { warehouse } : branch ? { branch } : {}),
      group_by: groupBy,
    }),
    [dateFrom, dateTo, warehouse, branch, groupBy],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["category-analysis", filters],
    queryFn: () => analyticsApi.getCategoryAnalysis(filters),
    enabled: !!dateFrom && !!dateTo && canView,
    placeholderData: (prev) => prev,
  });

  const items: CategoryItem[] = data?.items ?? [];
  const chartData = useMemo(() => items.slice(0, 15).map((it) => ({ label: resolveGroupName(it), value: Number(it.revenue) })), [items, resolveGroupName]);

  const handleExportExcel = useCallback(() => {
    if (!data || !items.length) return;
    exportCategoryAnalysisExcel({
      company,
      user,
      t,
      dateFrom,
      dateTo,
      groupLabel,
      resolveGroupName,
      items,
      totalRevenue: data.total_revenue,
      totalQuantity: data.total_quantity,
      totalCost: data.total_cost,
      totalProfit: data.total_profit,
    });
  }, [data, items, company, user, t, dateFrom, dateTo, groupLabel, resolveGroupName]);

  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <button
          type="button"
          onClick={handleExportExcel}
          disabled={items.length === 0}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-medium text-sm hover:bg-emerald-500/20 hover:border-emerald-400/60 active:scale-95 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <FileSpreadsheet className="w-4 h-4" />
          {t("ExportToExcel")}
        </button>

        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2 text-xs uppercase tracking-wider">{t("GroupBy")}</h4>
          <div className="flex flex-col gap-1">
            <Button variant="ghost" dark isActive={groupBy === "category"} className="w-full justify-start" text={t("Category")} onClick={() => changeGroupBy("category")} />
            <Button variant="ghost" dark isActive={groupBy === "brand"} className="w-full justify-start" text={t("Brand")} onClick={() => changeGroupBy("brand")} />
          </div>
        </div>

        <div className="pt-4 border-t border-indigo-900/30 text-indigo-400/60 space-y-1">
          <p>{t("PeriodSetAbove")}</p>
          <p>{t("OnlyPostedTransactions")}</p>
        </div>
      </div>,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSidebarContent, groupBy, items.length, t]);

  return (
    <RBACGuard isLoading={false} error={error} canView={canView} forbiddenText={t("ForbiddenText")}>
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm md:text-lg font-bold text-gray-800 dark:text-gray-100">{t("CategoryAnalysis")}</h2>
            <HelpButton title={t("CategoryAnalysis")}>
              <p>
                <b>Анализ по категориям/номенклатуре</b> — выручка, количество, себестоимость, прибыль и маржа,
                свёрнутые по категории или бренду товара (переключатель в правом сайдбаре) вместо отдельного товара.
              </p>
              <ul>
                <li>
                  <b>Группировка</b> — по категории или по бренду товара; каждый товар относится ровно к одной группе
                  (своей прямой категории/бренду, без учёта вложенных подкатегорий).
                </li>
                <li>
                  <b>Себестоимость</b> считается по текущей цене каждого товара — тот же принцип, что и в «Анализе
                  маржинальности».
                </li>
                <li>
                  <b>Период, склад, филиал</b> берутся из виджета «Рабочая дата» в правом сайдбаре.
                </li>
                <li>
                  На графике — топ-15 групп по выручке.
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
        ) : !data || items.length === 0 ? (
          <div className="text-center py-12 text-gray-400">{t("NoDataForPeriod")}</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-gray-400">{t("TotalRevenue")}</div>
                <div className="text-sm md:text-base font-semibold tabular-nums text-indigo-600 dark:text-indigo-400">{fmt(data.total_revenue)}</div>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-gray-400">{t("Profit")}</div>
                <div className="text-sm md:text-base font-semibold tabular-nums text-green-600 dark:text-green-400">{fmt(data.total_profit)}</div>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-gray-400">{t("Quantity")}</div>
                <div className="text-sm md:text-base font-semibold tabular-nums">{fmt(data.total_quantity)}</div>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-gray-400">{groupLabel}</div>
                <div className="text-sm md:text-base font-semibold tabular-nums">{data.total_count}</div>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                {t("Revenue")} — {t("Top15")} ({groupLabel.toLowerCase()})
              </div>
              <BarChart data={chartData} formatValue={fmtCompact} />
            </div>

            <div className="overflow-x-auto rounded-lg border border-black dark:border-gray-700">
              <table className="border-collapse w-full text-xs md:text-sm tabular-nums bg-white dark:bg-gray-900">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-800">
                    <th className={th}>№</th>
                    <th className={th}>{groupLabel}</th>
                    <th className={th}>{t("ProductsCount")}</th>
                    <th className={th}>{t("Quantity")}</th>
                    <th className={th}>{t("Revenue")}</th>
                    <th className={th}>{t("Cost")}</th>
                    <th className={th}>{t("Profit")}</th>
                    <th className={th}>{t("Margin")}</th>
                    <th className={th}>% {t("Revenue")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={`${it.group_id ?? "none"}`} className="hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors">
                      <td className={`${td} text-center`}>{it.rank}</td>
                      <td className={td}>{resolveGroupName(it)}</td>
                      <td className={`${td} text-right`}>{it.products_count}</td>
                      <td className={`${td} text-right`}>{fmt(it.quantity)}</td>
                      <td className={`${td} text-right`}>{fmt(it.revenue)}</td>
                      <td className={`${td} text-right`}>{fmt(it.cost)}</td>
                      <td className={`${td} text-right font-medium ${it.profit >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>{fmt(it.profit)}</td>
                      <td className={`${td} text-right`}>{fmtPct(it.margin_pct)}</td>
                      <td className={`${td} text-right`}>{fmtPct(it.revenue_pct)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-100 dark:bg-gray-800 font-semibold">
                    <td className={td} colSpan={3}>{t("GrandTotal")}</td>
                    <td className={`${td} text-right`}>{fmt(data.total_quantity)}</td>
                    <td className={`${td} text-right`}>{fmt(data.total_revenue)}</td>
                    <td className={`${td} text-right`}>{fmt(data.total_cost)}</td>
                    <td className={`${td} text-right`}>{fmt(data.total_profit)}</td>
                    <td className={td} colSpan={2} />
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

export default CategoryAnalysisPage;
