// frontend/src/features/accounting/pages/Analytics/XYZAnalysisPage.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FileSpreadsheet, Search } from "lucide-react";
import { analyticsApi, type XYZItem } from "../../services/analyticsApi";
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
import { exportXYZAnalysisExcel } from "./exportXYZAnalysisExcel";

const fmt = (v: number | string) => Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 2 });
const fmtPct = (v: number | string) => `${Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

const CLASS_STYLES: Record<string, string> = {
  X: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 border-green-300 dark:border-green-800",
  Y: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border-amber-300 dark:border-amber-800",
  Z: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 border-red-300 dark:border-red-800",
};

const td = "border border-black dark:border-gray-700 px-1.5 py-1 text-xs md:text-sm whitespace-nowrap";
const th = "border border-black dark:border-gray-600 px-1.5 py-1 text-xs md:text-sm font-semibold text-center whitespace-nowrap";

const XYZAnalysisPage = () => {
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
  const [thresholdX, setThresholdX] = useState(10);
  const [thresholdY, setThresholdY] = useState(25);
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
      threshold_x: thresholdX,
      threshold_y: thresholdY,
    }),
    [dateFrom, dateTo, warehouse, branch, categoryId, brandId, thresholdX, thresholdY],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["xyz-analysis", filters],
    queryFn: () => analyticsApi.getXYZAnalysis(filters as any),
    enabled: !!dateFrom && !!dateTo && canView,
    placeholderData: (prev) => prev,
  });

  const items: XYZItem[] = data?.items ?? [];
  const filteredItems = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.product_name.toLowerCase().includes(q) || (it.product_sku ?? "").toLowerCase().includes(q));
  }, [items, debouncedSearch]);

  const handleExportExcel = useCallback(() => {
    if (!data || !items.length) return;
    exportXYZAnalysisExcel({ company, user, t, dateFrom, dateTo, items, summary: data.summary, totalQuantity: data.total_quantity });
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
          <h4 className="font-bold text-indigo-300 mb-2 text-xs uppercase tracking-wider">{t("XYZThresholds")}</h4>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-indigo-400/70 ml-1 text-xs">{t("ClassX")}, %</label>
              <input
                type="number"
                min={1}
                max={99}
                value={thresholdX}
                onChange={(e) => setThresholdX(Math.min(99, Math.max(1, Number(e.target.value) || 1)))}
                className="w-full px-2 py-1.5 rounded-lg border text-sm bg-slate-900 text-indigo-100 border-indigo-900/50 focus:border-indigo-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-indigo-400/70 ml-1 text-xs">{t("ClassY")}, %</label>
              <input
                type="number"
                min={thresholdX + 1}
                max={999}
                value={thresholdY}
                onChange={(e) => setThresholdY(Math.max(thresholdX + 1, Number(e.target.value) || thresholdX + 1))}
                className="w-full px-2 py-1.5 rounded-lg border text-sm bg-slate-900 text-indigo-100 border-indigo-900/50 focus:border-indigo-500/50 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-indigo-900/30 text-indigo-400/60 space-y-1">
          <p>{t("PeriodSetAbove")}</p>
          <p>{t("OnlyPostedTransactions")}</p>
        </div>
      </div>,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSidebarContent, categoryOptions, categoryId, brandOptions, brandId, thresholdX, thresholdY, items.length, t]);

  return (
    <RBACGuard isLoading={false} error={error} canView={canView} forbiddenText={t("ForbiddenText")}>
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm md:text-lg font-bold text-gray-800 dark:text-gray-100">{t("XYZAnalysis")}</h2>
            <HelpButton title={t("XYZAnalysis")}>
              <p>
                <b>XYZ-анализ</b> — классификация товаров по стабильности (предсказуемости) спроса. Период
                разбивается на месяцы, и для каждого товара считается коэффициент вариации количества продаж по
                месяцам (месяцы без продаж считаются нулём). Класс <b>X</b> — стабильный, легко прогнозируемый
                спрос; <b>Y</b> — спрос с заметными колебаниями (например, сезонность); <b>Z</b> — нерегулярный,
                трудно прогнозируемый спрос.
              </p>
              <ul>
                <li>
                  <b>Пороги X/Y</b> — в правом сайдбаре, по умолчанию 10% / 25% (классические значения).
                </li>
                <li>
                  <b>Категория / Бренд</b> — необязательные фильтры, сужают анализ до части ассортимента.
                </li>
                <li>
                  <b>Период, склад, филиал</b> берутся из виджета «Рабочая дата» в правом сайдбаре.
                </li>
                <li>
                  Чем короче выбранный период (меньше месяцев внутри него), тем менее показателен коэффициент
                  вариации — для осмысленной классификации выбирайте период от нескольких месяцев.
                </li>
                <li>
                  Товары без продаж за период в анализ не попадают.
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {data.summary.map((s) => (
                <div key={s.class} className={`rounded-lg border px-3 py-2 ${CLASS_STYLES[s.class]}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">{t("Class")} {s.class}</span>
                    <span className="text-xs opacity-80">{s.count} {t("ProductsCount").toLowerCase()}</span>
                  </div>
                  <div className="text-base font-semibold tabular-nums mt-1">{fmt(s.quantity)}</div>
                  <div className="text-xs tabular-nums opacity-80">
                    {fmtPct(s.quantity_pct)} {t("Quantity").toLowerCase()} · {fmtPct(s.count_pct)} {t("Assortment").toLowerCase()}
                  </div>
                </div>
              ))}
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
              <span className="text-xs text-gray-500 dark:text-gray-400">{t("TotalQuantity")}: {fmt(data.total_quantity)}</span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-black dark:border-gray-700">
              <table className="border-collapse w-full text-xs md:text-sm tabular-nums bg-white dark:bg-gray-900">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-800">
                    <th className={th}>№</th>
                    <th className={th}>{t("Product")}</th>
                    <th className={th}>{t("SKU")}</th>
                    <th className={th}>{t("Class")}</th>
                    <th className={th}>{t("TotalQuantity")}</th>
                    <th className={th}>{t("AvgQuantityPerPeriod")}</th>
                    <th className={th}>{t("CoefficientOfVariation")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((it) => (
                    <tr key={it.product_id} className="hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors">
                      <td className={`${td} text-center`}>{it.rank}</td>
                      <td className={td}>{it.product_name}</td>
                      <td className={td}>{it.product_sku ?? "—"}</td>
                      <td className={`${td} text-center`}>
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold border ${CLASS_STYLES[it.class]}`}>{it.class}</span>
                      </td>
                      <td className={`${td} text-right`}>{fmt(it.total_quantity)}</td>
                      <td className={`${td} text-right`}>{fmt(it.avg_quantity)}</td>
                      <td className={`${td} text-right`}>{fmtPct(it.cv)}</td>
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

export default XYZAnalysisPage;
