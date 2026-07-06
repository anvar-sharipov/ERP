// frontend/src/features/accounting/pages/Accounting/ProductTurnoverPage.tsx
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { FileSpreadsheet, Search } from "lucide-react";
import { accountApi } from "../../services/accountingApi";
import { useDateStore } from "../../../../core/store/dateStore";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import { Loader } from "../../../../components/ui/Loader";
import { useSidebar } from "../../../../core/context/SidebarRightContext";
import { useCompany } from "../../../../core/context/CompanyContext";
import { useUser } from "../../../../core/context/UserContext";
import { HelpButton } from "../../../../components/ui/HelpButton";
import { Button } from "../../../../components/ui/Button";
import {
  ProductTurnoverTable,
  type ProductTurnoverRow,
} from "../../../../components/ui/Table/ProductTurnoverTable";
import { ROUTES } from "../../../../core/router/routes";
import { exportProductTurnoverExcel } from "./exportProductTurnoverExcel";
import { ImagePreview } from "../../../../components/ui/ImagePreview";
import SearchableSelect from "../../../../components/ui/SearchableSelect";
import { groupByCategory, groupByBrand } from "./productTurnoverGrouping";

const STORAGE_KEY = "product_turnover_separate_return_out";
const GROUP_BY_STORAGE_KEY = "product_turnover_group_by";
type GroupBy = "category" | "brand";

const ProductTurnoverPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { periodFrom, periodTo, workBranch, workWarehouse } = useDateStore();
  const { canView } = usePageAccess("document");
  const { setSidebarContent } = useSidebar();
  const { company } = useCompany();
  const { user } = useUser();
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
  const [brandFilter, setBrandFilter] = useState<number | null>(null);

  const [separateReturnOut, setSeparateReturnOut] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const toggleSeparateReturnOut = (value: boolean) => {
    setSeparateReturnOut(value);
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {}
  };

  const [groupBy, setGroupByState] = useState<GroupBy>(() => {
    try {
      return (localStorage.getItem(GROUP_BY_STORAGE_KEY) as GroupBy) || "category";
    } catch {
      return "category";
    }
  });

  const setGroupBy = (value: GroupBy) => {
    setGroupByState(value);
    try {
      localStorage.setItem(GROUP_BY_STORAGE_KEY, value);
    } catch {}
  };

  // ✅ Реагируем на текущий выбранный склад/филиал (WorkDateWidget, правый сайдбар) —
  // выбран конкретный склад — только он; выбран только филиал (без склада) — все
  // склады этого филиала; не выбрано ничего — весь scope пользователя (см. CLAUDE.md:
  // "все отчёты должны смотреть на branch, warehouse, date_range").
  const queryParams = {
    date_from: periodFrom!,
    date_to: periodTo!,
    ...(workWarehouse?.id ? { warehouse: String(workWarehouse.id) } : workBranch?.id ? { branch: String(workBranch.id) } : {}),
  };

  const { data: rows = [], isLoading } = useQuery<ProductTurnoverRow[]>({
    queryKey: ["product-turnover", periodFrom, periodTo, workBranch?.id, workWarehouse?.id],
    queryFn: () => accountApi.getProductTurnover(queryParams),
    enabled: !!periodFrom && !!periodTo && canView,
  });

  // ✅ Списки категорий/брендов — из уже загруженных данных за период/склад (не отдельный
  // запрос), чтобы фильтр всегда показывал только реально присутствующие варианты.
  const categoryOptions = useMemo(() => {
    const map = new Map<number, string>();
    rows.forEach((r) => {
      if (r.category_id != null) map.set(r.category_id, r.category_name);
    });
    return [...map.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, label]) => ({ id, label }));
  }, [rows]);

  const brandOptions = useMemo(() => {
    const map = new Map<number, string>();
    rows.forEach((r) => {
      if (r.brand_id != null) map.set(r.brand_id, r.brand_name);
    });
    return [...map.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, label]) => ({ id, label }));
  }, [rows]);

  // ✅ Поиск (имя/артикул) + фильтры по категории/бренду — единая точка, от которой
  // считается и то, что видно на экране, и то, что уходит в Excel-экспорт (см. ниже).
  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((r) => {
      if (categoryFilter != null && r.category_id !== categoryFilter) return false;
      if (brandFilter != null && r.brand_id !== brandFilter) return false;
      if (q && !r.name.toLowerCase().includes(q) && !(r.sku ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, searchQuery, categoryFilter, brandFilter]);

  const grouped = useMemo(
    () => (groupBy === "brand" ? groupByBrand(filteredRows) : groupByCategory(filteredRows)),
    [filteredRows, groupBy],
  );

  const groupLabel = groupBy === "brand" ? t("Brand") : t("Category");
  const totalLabel = groupBy === "brand" ? t("BrandTotal") : t("CategoryTotal");

  const handleExportExcel = () => {
    if (!grouped.length) return;
    exportProductTurnoverExcel({
      company, user, t,
      periodFrom: periodFrom!, periodTo: periodTo!,
      grouped, separateReturnOut, groupLabel, totalLabel,
    });
  };

  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <button
          type="button"
          onClick={handleExportExcel}
          disabled={grouped.length === 0}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-medium text-sm hover:bg-emerald-500/20 hover:border-emerald-400/60 active:scale-95 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <FileSpreadsheet className="w-4 h-4" />
          {t("ExportToExcel")}
        </button>

        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2 uppercase tracking-wider">{t("GroupBy")}</h4>
          <div className="flex flex-col gap-1">
            <Button
              variant="ghost"
              dark
              isActive={groupBy === "category"}
              className="w-full justify-start"
              text={t("Category")}
              onClick={() => setGroupBy("category")}
            />
            <Button
              variant="ghost"
              dark
              isActive={groupBy === "brand"}
              className="w-full justify-start"
              text={t("Brand")}
              onClick={() => setGroupBy("brand")}
            />
          </div>
        </div>

        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2 uppercase tracking-wider">{t("Category")}</h4>
          <SearchableSelect
            theme="sidebar"
            options={categoryOptions}
            value={categoryFilter}
            onChange={setCategoryFilter}
            placeholder={t("All")}
          />
        </div>

        <div>
          <h4 className="font-bold text-indigo-300 mb-2 uppercase tracking-wider">{t("Brand")}</h4>
          <SearchableSelect
            theme="sidebar"
            options={brandOptions}
            value={brandFilter}
            onChange={setBrandFilter}
            placeholder={t("All")}
          />
        </div>

        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2 uppercase tracking-wider">{t("Settings")}</h4>
          <label className="flex items-center gap-2 text-indigo-200 cursor-pointer">
            <input
              type="checkbox"
              checked={separateReturnOut}
              onChange={(e) => toggleSeparateReturnOut(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600"
            />
            {t("SeparateReturnToSupplier")}
          </label>
        </div>

        <div className="pt-2 border-t border-indigo-900/30 text-indigo-400/60 space-y-1">
          <p>{t("PeriodSetAbove")}</p>
          <p>{t("OnlyPostedTransactions")}</p>
        </div>
      </div>,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSidebarContent, separateReturnOut, groupBy, categoryFilter, brandFilter, categoryOptions, brandOptions, grouped, t]);

  return (
    <RBACGuard isLoading={false} error={null} canView={canView} forbiddenText={t("ForbiddenText")}>
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm md:text-lg font-bold text-gray-800 dark:text-gray-100">{t("ProductTurnover")}</h2>
            <HelpButton title={t("ProductTurnover")}>
              <p>
                <b>Оборот товаров</b> — по каждому товару показывает начальный остаток, приход, возврат от покупателя,
                расход (с разбивкой на сумму до скидки/скидку/после скидки), перемещение и конечный остаток за выбранный
                период. Товары группируются по категориям (или по бренду) с промежуточными итогами и общим итогом внизу.
              </p>
              <ul>
                <li>
                  <b>Период</b> и <b>склад</b> берутся из виджетов в правом сайдбаре (тот же «Период отчётов»/склад, что и в
                  остальных отчётах) — без выбора склада показываются все склады, доступные вам по правам доступа.
                </li>
                <li>
                  <b>Учитываются только проведённые документы.</b>
                </li>
                <li>
                  <b>Поиск</b> (над таблицей) — по названию и артикулу товара; <b>«Категория»/«Бренд»</b> (правый
                  сайдбар) — сужают список до одной категории/бренда.
                </li>
                <li>
                  <b>«Группировка»</b> (правый сайдбар) — переключает список между группировкой по категориям и по
                  бренду товара.
                </li>
                <li>
                  <b>«Показывать возврат поставщику отдельно»</b> (правый сайдбар) — по умолчанию возврат поставщику
                  включён в колонку «Расход»; включив переключатель, он выводится отдельной колонкой. Настройка
                  сохраняется в браузере и применяется одинаково к экрану, печати (Ctrl+P) и Excel-экспорту.
                </li>
                <li>
                  <b>Двойной клик по товару</b> (или Enter/F2 на выделенной ячейке) открывает детализацию — список
                  конкретных документов, из которых сложился оборот, с бегущим остатком.
                </li>
                <li>
                  <b>«Экспорт в Excel»</b> — выгружает ровно то, что видно на экране: с учётом поиска, фильтров по
                  категории/бренду и выбранной группировки.
                </li>
              </ul>
            </HelpButton>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("SearchProduct")}
                className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-56"
              />
            </div>
            {periodFrom && periodTo && (
              <span className="text-gray-500 dark:text-gray-400 text-sm whitespace-nowrap">
                {new Date(periodFrom).toLocaleDateString("ru-RU")} — {new Date(periodTo).toLocaleDateString("ru-RU")}
              </span>
            )}
          </div>
        </div>

        {!periodFrom || !periodTo ? (
          <div className="text-center py-12 text-gray-400">{t("SpecifyPeriod")}</div>
        ) : isLoading ? (
          <Loader containerClass="py-12" text={t("LoadingReport")} progress="indeterminate" />
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-gray-400">{t("NoDataForPeriod")}</div>
        ) : grouped.length === 0 ? (
          <div className="text-center py-12 text-gray-400">{t("NoResultsFound")}</div>
        ) : (
          <ProductTurnoverTable
            rows={grouped}
            separateReturnOut={separateReturnOut}
            groupMode={groupBy}
            onRowDoubleClick={(row) => {
              const params = new URLSearchParams({
                date_from: periodFrom!,
                date_to: periodTo!,
                ...(workWarehouse?.id ? { warehouse: String(workWarehouse.id) } : workBranch?.id ? { branch: String(workBranch.id) } : {}),
              });
              navigate(`${ROUTES.APP.ACCOUNTING_PRODUCT_TURNOVER_DETAIL.replace(":id", String(row.id))}?${params.toString()}`);
            }}
            onPreviewImage={setPreviewImage}
          />
        )}
      </div>

      <ImagePreview src={previewImage} onClose={() => setPreviewImage(null)} />
    </RBACGuard>
  );
};

export default ProductTurnoverPage;
