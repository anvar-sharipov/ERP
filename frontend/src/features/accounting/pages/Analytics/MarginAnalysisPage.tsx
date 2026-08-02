// frontend/src/features/accounting/pages/Analytics/MarginAnalysisPage.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FileSpreadsheet, Search } from "lucide-react";
import { analyticsApi, type MarginItem } from "../../services/analyticsApi";
import { productCategoryApi, brandApi } from "../../services/productApi";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { useSidebar } from "../../../../core/context/SidebarRightContext";
import { useDateStore } from "../../../../core/store/dateStore";
import { useDebouncedValue } from "../../../../core/hooks/useDebouncedValue";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import { HelpButton } from "../../../../components/ui/HelpButton";
import { Loader } from "../../../../components/ui/Loader";
import SearchableSelect, { type SelectOption } from "../../../../components/ui/SearchableSelect";
import { useCompany } from "../../../../core/context/CompanyContext";
import { useUser } from "../../../../core/context/UserContext";
import { exportMarginAnalysisExcel } from "./exportMarginAnalysisExcel";

const fmt = (v: number | string) => Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 2 });
const fmtPct = (v: number | string) => `${Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

const BAND_LABELS: Record<string, string> = { negative: "UnprofitableBand", low: "LowMarginBand", normal: "NormalMarginBand" };
const BAND_STYLES: Record<string, string> = {
  negative: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 border-red-300 dark:border-red-800",
  low: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border-amber-300 dark:border-amber-800",
  normal: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 border-green-300 dark:border-green-800",
};

const td = "border border-black dark:border-gray-700 px-1.5 py-1 text-xs md:text-sm whitespace-nowrap";
const th = "border border-black dark:border-gray-600 px-1.5 py-1 text-xs md:text-sm font-semibold text-center whitespace-nowrap";

const MarginAnalysisPage = () => {
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

  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [brandId, setBrandId] = useState<number | null>(null);
  const [lowMarginThreshold, setLowMarginThreshold] = useState(15);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);

  const { data: categoriesData } = useQuery({ queryKey: ["product-categories"], queryFn: () => productCategoryApi.getAll(), staleTime: 60_000, enabled: canView });
  const categoryOptions: SelectOption[] = useMemo(() => (categoriesData ?? []).map((c: any) => ({ id: c.id, label: c.name })), [categoriesData]);

  const { data: brandsData } = useQuery({ queryKey: ["brands"], queryFn: () => brandApi.getAll(), staleTime: 60_000, enabled: canView });
  const brandOptions: SelectOption[] = useMemo(() => (brandsData ?? []).map((b: any) => ({ id: b.id, label: b.name })), [brandsData]);

  const filters = useMemo(
    () => ({
      date_from: dateFrom,
      date_to: dateTo,
      ...(warehouse ? { warehouse } : branch ? { branch } : {}),
      ...(categoryId ? { category: String(categoryId) } : {}),
      ...(brandId ? { brand: String(brandId) } : {}),
      low_margin_threshold: lowMarginThreshold,
    }),
    [dateFrom, dateTo, warehouse, branch, categoryId, brandId, lowMarginThreshold],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["margin-analysis", filters],
    queryFn: () => analyticsApi.getMarginAnalysis(filters as any),
    enabled: !!dateFrom && !!dateTo && canView,
    placeholderData: (prev) => prev,
  });

  const items: MarginItem[] = data?.items ?? [];
  const filteredItems = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.product_name.toLowerCase().includes(q) || (it.product_sku ?? "").toLowerCase().includes(q));
  }, [items, debouncedSearch]);

  const handleExportExcel = useCallback(() => {
    if (!data || !items.length) return;
    exportMarginAnalysisExcel({
      company,
      user,
      t,
      dateFrom,
      dateTo,
      items,
      bandSummary: data.band_summary,
      totalRevenue: data.total_revenue,
      totalCost: data.total_cost,
      totalProfit: data.total_profit,
      totalMarginPct: data.total_margin_pct,
    });
  }, [data, items, company, user, t, dateFrom, dateTo]);

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
          <h4 className="font-bold text-indigo-300 mb-2 text-xs uppercase tracking-wider">{t("Category")}</h4>
          <SearchableSelect options={categoryOptions} value={categoryId} onChange={setCategoryId} placeholder={t("All")} theme="sidebar" clearable />
        </div>

        <div>
          <h4 className="font-bold text-indigo-300 mb-2 text-xs uppercase tracking-wider">{t("Brand")}</h4>
          <SearchableSelect options={brandOptions} value={brandId} onChange={setBrandId} placeholder={t("All")} theme="sidebar" clearable />
        </div>

        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2 text-xs uppercase tracking-wider">{t("LowMarginThreshold")}, %</h4>
          <input
            type="number"
            min={0}
            max={99}
            value={lowMarginThreshold}
            onChange={(e) => setLowMarginThreshold(Math.min(99, Math.max(0, Number(e.target.value) || 0)))}
            className="w-full px-2 py-1.5 rounded-lg border text-sm bg-slate-900 text-indigo-100 border-indigo-900/50 focus:border-indigo-500/50 focus:outline-none"
          />
        </div>

        <div className="pt-4 border-t border-indigo-900/30 text-indigo-400/60 space-y-1">
          <p>{t("PeriodSetAbove")}</p>
          <p>{t("OnlyPostedTransactions")}</p>
        </div>
      </div>,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSidebarContent, categoryOptions, categoryId, brandOptions, brandId, lowMarginThreshold, items.length, t]);

  return (
    <RBACGuard isLoading={false} error={error} canView={canView} forbiddenText={t("ForbiddenText")}>
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm md:text-lg font-bold text-gray-800 dark:text-gray-100">{t("MarginAnalysis")}</h2>
            <HelpButton title={t("MarginAnalysis")}>
              <p>
                <b>Анализ маржинальности</b> — по каждому товару: выручка, себестоимость (проданное количество × текущая
                себестоимость товара), прибыль, маржа% (прибыль/выручка) и наценка% (прибыль/себестоимость).
              </p>
              <ul>
                <li>
                  <b>Полосы</b> — «убыточные» (прибыль меньше нуля), «низкая маржа» (маржа ниже настраиваемого порога,
                  по умолчанию 15%) и «нормальная маржа» (остальное).
                </li>
                <li>
                  <b>Себестоимость</b> берётся по ТЕКУЩЕЙ цене товара (Product.cost_price) — тот же принцип, что и в
                  «Карточке товара»/«Обороте товаров», не по исторической цене прихода.
                </li>
                <li>
                  <b>Категория / Бренд</b> — необязательные фильтры.
                </li>
                <li>
                  <b>Период, склад, филиал</b> берутся из виджета «Рабочая дата» в правом сайдбаре.
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              {data.band_summary.map((s) => (
                <div key={s.band} className={`rounded-lg border px-3 py-2 ${BAND_STYLES[s.band]}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">{t(BAND_LABELS[s.band])}</span>
                    <span className="text-xs opacity-80">{s.count} {t("ProductsCount").toLowerCase()}</span>
                  </div>
                  <div className="text-base font-semibold tabular-nums mt-1">{fmt(s.profit)}</div>
                  <div className="text-xs tabular-nums opacity-80">{fmt(s.revenue)} {t("Revenue").toLowerCase()}</div>
                </div>
              ))}
              <div className="rounded-lg border border-indigo-300 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-3 py-2">
                <div className="text-sm font-bold">{t("TotalMargin")}</div>
                <div className="text-base font-semibold tabular-nums mt-1">{fmtPct(data.total_margin_pct)}</div>
                <div className="text-xs tabular-nums opacity-80">{fmt(data.total_profit)} {t("Profit").toLowerCase()}</div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("SearchProduct")}
                  className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-56"
                />
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t("Revenue")}: {fmt(data.total_revenue)} · {t("Cost")}: {fmt(data.total_cost)}
              </span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-black dark:border-gray-700">
              <table className="border-collapse w-full text-xs md:text-sm tabular-nums bg-white dark:bg-gray-900">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-800">
                    <th className={th}>№</th>
                    <th className={th}>{t("Product")}</th>
                    <th className={th}>{t("SKU")}</th>
                    <th className={th}>{t("Quantity")}</th>
                    <th className={th}>{t("Revenue")}</th>
                    <th className={th}>{t("Cost")}</th>
                    <th className={th}>{t("Profit")}</th>
                    <th className={th}>{t("Margin")}</th>
                    <th className={th}>{t("MarkupPercent")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((it) => (
                    <tr key={it.product_id} className={`hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors ${it.band === "negative" ? "bg-red-50/50 dark:bg-red-900/10" : ""}`}>
                      <td className={`${td} text-center`}>{it.rank}</td>
                      <td className={td}>{it.product_name}</td>
                      <td className={td}>{it.product_sku ?? "—"}</td>
                      <td className={`${td} text-right`}>{fmt(it.quantity)}</td>
                      <td className={`${td} text-right`}>{fmt(it.revenue)}</td>
                      <td className={`${td} text-right`}>{fmt(it.cost)}</td>
                      <td className={`${td} text-right font-medium ${it.profit >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>{fmt(it.profit)}</td>
                      <td className={`${td} text-right`}>
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium border ${BAND_STYLES[it.band]}`}>{fmtPct(it.margin_pct)}</span>
                      </td>
                      <td className={`${td} text-right`}>{fmtPct(it.markup_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </RBACGuard>
  );
};

export default MarginAnalysisPage;
