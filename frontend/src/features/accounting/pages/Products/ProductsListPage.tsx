// frontend/src/features/accounting/pages/Products/ProductsListPage.tsx
import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { productApi, productCategoryApi, priceTypeApi, productPriceApi, brandApi } from "../../services/productApi";
import { accountApi } from "../../services/accountingApi";
import { useDateStore } from "../../../../core/store/dateStore";
import { useNotify } from "../../../../core/context/NotificationContext";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { useSidebar } from "../../../../core/context/SidebarRightContext";
import { Table, type Column } from "../../../../components/ui/Table/Table";
import { Button } from "../../../../components/ui/Button";
import { Loader } from "../../../../components/ui/Loader";
import { ConfirmModal } from "../../../../components/ui/Modal/ConfirmModal";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { ImagePreview } from "../../../../components/ui/ImagePreview";
import SearchableSelect from "../../../../components/ui/SearchableSelect";
import { Plus, AlertTriangle, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "../../../../core/router/routes";
import { useRestoreScroll } from "../../../../core/hooks/useRestoreScroll";
import { usePageHotkeys } from "../../../../core/hooks/usePageHotkeys";
import { useTableFilter } from "../../../../core/hooks/useTableFilter";

// ✅ Стабильный дефолт для useQuery({data: x = []}) — литерал [] пересоздаётся
// заново на каждом рендере, пока data ещё не загрузилась; если такое поле стоит
// в зависимостях useEffect (см. sidebar-эффект ниже), это вызывает бесконечный
// цикл setState (React "Maximum update depth exceeded"). Модульная константа —
// одна и та же ссылка на каждом рендере, пока data действительно не придёт.
const EMPTY_ARRAY: never[] = [];

// ── Основная страница ─────────────────────────────────────────────────────────
const ProductsListPage = () => {
  const { t } = useTranslation();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { setSidebarContent } = useSidebar();
  const { canView, canPost, canPut, canDelete } = usePageAccess("product");
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const {} = useRestoreScroll("selectedProductId", setHighlightedId);
  const navigate = useNavigate();

  // const [formOpen, setFormOpen] = useState(false);
  // const [editing, setEditing] = useState<any | null>(null);
  // const [form, setForm] = useState<ProductForm>(EMPTY);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [previewGallery, setPreviewGallery] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
  const [brandFilter, setBrandFilter] = useState<number | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [reservedOnly, setReservedOnly] = useState(false);
  const { workBranch, workWarehouse, periodFrom, periodTo } = useDateStore();

  const goToTurnover = (item: any) => {
    if (!periodFrom || !periodTo) {
      notify("error", t("SpecifyPeriod"));
      return;
    }
    const params = new URLSearchParams({
      date_from: periodFrom,
      date_to: periodTo,
      from: "products",
      ...(workWarehouse?.id ? { warehouse: String(workWarehouse.id) } : workBranch?.id ? { branch: String(workBranch.id) } : {}),
    });
    navigate(`${ROUTES.APP.REPORTS_PRODUCT_TURNOVER_DETAIL.replace(":id", String(item.id))}?${params.toString()}`);
  };

  // ── запросы ─────────────────────────────────────────────────────────────────

  const { data: priceTypes = [], isLoading: isLoadingPriceTypes } = useQuery({
    queryKey: ["price-types"],
    queryFn: priceTypeApi.getAll,
  });

  // ✅ Мини-таблица оборота в колонке списка — один общий запрос на весь список
  // (тот же product_turnover, что и ProductTurnoverPage.tsx), а не по запросу на
  // товар, иначе было бы N+1. Реагирует на branch/warehouse/период из WorkDateWidget,
  // как и любой другой отчёт (см. CLAUDE.md).
  const turnoverEnabled = !!periodFrom && !!periodTo;
  const { data: turnoverRows = [], isLoading: isLoadingTurnover } = useQuery({
    queryKey: ["products-turnover-map", periodFrom, periodTo, workWarehouse?.id, workBranch?.id],
    queryFn: () =>
      accountApi.getProductTurnover({
        date_from: periodFrom!,
        date_to: periodTo!,
        light: true,
        ...(workWarehouse?.id ? { warehouse: String(workWarehouse.id) } : workBranch?.id ? { branch: String(workBranch.id) } : {}),
      }),
    enabled: turnoverEnabled,
  });

  // ✅ Фото отдельным запросом от текстового products-light (см. productApi.ts::
  // getListLightImages/ProductViewSet.list_light_images) — не входит в isLoading/
  // loadingSteps ниже НАРОЧНО: таблица должна отрисоваться с текстом сразу, пока
  // фото ещё генерируются (django-imagekit thumbnail — синхронная генерация на
  // первый показ), а не ждать их за общим Loader'ом страницы. Пока не готово —
  // колонка "Фото" показывает спиннер в ячейке (см. render колонки ниже).
  const { data: imagesMap = {}, isLoading: isLoadingImages } = useQuery({
    queryKey: ["products-images-map", workWarehouse?.id, workBranch?.id],
    queryFn: () => productApi.getListLightImages(workWarehouse?.id ? { warehouse: workWarehouse.id } : workBranch?.id ? { branch: workBranch.id } : {}),
    enabled: canView,
  });

  const turnoverMap = useMemo(() => {
    const map: Record<number, any> = {};
    for (const row of turnoverRows as any[]) map[row.id] = row;
    return map;
  }, [turnoverRows]);

  const pricesMapEnabled = !!(workWarehouse?.id || workBranch?.id);
  const { data: pricesMap = {}, isLoading: isLoadingPricesMap } = useQuery({
    queryKey: ["products-prices-map", workWarehouse?.id, workBranch?.id],
    queryFn: () => productPriceApi.getPricesMap(workWarehouse?.id ? { warehouse: workWarehouse.id } : workBranch?.id ? { branch: workBranch.id } : {}),
    enabled: pricesMapEnabled,
  });

  // ✅ Остаток на складе для колонки Name — один bulk-запрос (backend сам сводит
  // склад/филиал/весь scope компании, см. report_views.py::stock_balance +
  // _resolve_warehouse_ids), поэтому enabled всегда true, в отличие от pricesMap
  // (там при пустом выборе просто нет цены, а остаток обязан показываться всегда —
  // см. CLAUDE.md про branch/warehouse/scope fallback для отчётов).
  const { data: stockBalance = {}, isLoading: isLoadingStock } = useQuery({
    queryKey: ["products-stock-balance", workWarehouse?.id, workBranch?.id],
    queryFn: () =>
      accountApi.getStockBalance({
        ...(workWarehouse?.id ? { warehouse: String(workWarehouse.id) } : workBranch?.id ? { branch: String(workBranch.id) } : {}),
      }),
  });

  // ✅ Облегчённый список (ProductViewSet.list_light/ProductListSerializer) —
  // страница показывает только фото/категорию/бренд/ед.изм./себестоимость/
  // статус, цены/остатки/оборотность и так приходят отдельными bulk-запросами
  // выше (pricesMap/stockBalance/turnoverRows), поэтому полный productApi.getAll
  // (с prices/bundle_items/tags и т.д. на каждый товар) тут не нужен.
  const {
    data: products = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["products-light", workWarehouse?.id, workBranch?.id],
    queryFn: () => productApi.getAllLight(workWarehouse?.id ? { warehouse: workWarehouse.id } : workBranch?.id ? { branch: workBranch.id } : {}),
    enabled: canView,
    retry: false,
  });

  const { data: categories = EMPTY_ARRAY, isLoading: isLoadingCategories } = useQuery({ queryKey: ["product-categories"], queryFn: productCategoryApi.getAll });
  const { data: brands = EMPTY_ARRAY, isLoading: isLoadingBrands } = useQuery({ queryKey: ["brands"], queryFn: brandApi.getAll });

  // ✅ Прогресс загрузки страницы — доля уже завершённых запросов из тех, что реально
  // задействованы (pricesMap считается только если выбран филиал/склад) — не фейковая
  // анимация, а честная доля выполненного, см. CLAUDE.md про Loader.
  const loadingSteps = [!isLoading, !isLoadingCategories, !isLoadingBrands, !isLoadingPriceTypes, !isLoadingStock, ...(pricesMapEnabled ? [!isLoadingPricesMap] : [])];
  const loadingProgress = Math.round((loadingSteps.filter(Boolean).length / loadingSteps.length) * 100);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => productApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products-light"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      notify("success", t("SuccessDeleted"));
      setDeleteId(null);
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", t("ErrorDeleting"));
    },
  });

  // ✅ Массовое удаление через чекбоксы в Table.tsx — один запрос на бэкенд
  // (accounting/mixins.py::BulkDestroyMixin), каждая запись аудируется отдельно
  // там же, где и обычное удаление (см. CLAUDE.md).
  const handleBulkDelete = async (ids: (string | number)[]) => {
    const res = await productApi.bulkDelete(ids);
    queryClient.invalidateQueries({ queryKey: ["products-light"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    if (res.errors.length > 0) {
      notify("error", t("BulkDeletePartialError", { deleted: res.deleted_ids.length, failed: res.errors.length }));
    } else {
      notify("success", t("SuccessDeleted"));
    }
  };

  // ── сайдбар ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <div>
          <h4 className="font-bold text-indigo-300 mb-2">{t("Actions")}</h4>
          <Button disabled={!canPost} text={t("Add")} className="w-full" dark={true} icon={<Plus className="w-4 h-4" />} onClick={() => navigate(ROUTES.APP.PRODUCTS_CREATE)} />
        </div>
        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2">{t("StatusFilter")}</h4>
          <div className="flex flex-col gap-1">
            {(["all", "active", "inactive"] as const).map((s) => (
              <Button
                key={s}
                variant="ghost"
                dark={true}
                isActive={activeFilter === s}
                className="w-full justify-start"
                text={s === "all" ? t("AllDirectories") : s === "active" ? t("OnlyActive") : t("OnlyInactive")}
                onClick={() => setActiveFilter(s)}
              />
            ))}
          </div>
        </div>
        {categories.length > 0 && (
          <div className="pt-4 border-t border-indigo-900/30">
            <h4 className="font-bold text-indigo-300 mb-2">{t("Category")}</h4>
            <SearchableSelect
              theme="sidebar"
              options={(categories as any[]).map((c) => ({ id: c.id, label: c.name }))}
              value={categoryFilter}
              onChange={setCategoryFilter}
              placeholder={t("AllCategories")}
            />
          </div>
        )}
        {brands.length > 0 && (
          <div className="pt-4 border-t border-indigo-900/30">
            <h4 className="font-bold text-indigo-300 mb-2">{t("Brand")}</h4>
            <SearchableSelect
              theme="sidebar"
              options={(brands as any[]).map((b) => ({ id: b.id, label: b.name }))}
              value={brandFilter}
              onChange={setBrandFilter}
              placeholder={t("AllBrands")}
            />
          </div>
        )}
        <div className="pt-4 border-t border-indigo-900/30 space-y-2">
          <label className="flex items-center gap-2 text-sm text-indigo-200 cursor-pointer select-none">
            <input type="checkbox" className="accent-red-500 w-4 h-4" checked={lowStockOnly} onChange={(e) => setLowStockOnly(e.target.checked)} />
            {t("LowStockOnlyFilter")}
          </label>
          <label className="flex items-center gap-2 text-sm text-indigo-200 cursor-pointer select-none">
            <input type="checkbox" className="accent-orange-500 w-4 h-4" checked={reservedOnly} onChange={(e) => setReservedOnly(e.target.checked)} />
            {t("ReservedOnlyFilter")}
          </label>
        </div>
      </div>,
    );
  }, [setSidebarContent, canPost, activeFilter, categoryFilter, categories, brandFilter, brands, lowStockOnly, reservedOnly, t]);

  // ── фильтрация ───────────────────────────────────────────────────────────────

  const filtered = useTableFilter(products as any[], {
    search: searchQuery,
    searchFields: ["name", "sku", "barcode"],
    filterKey: `${activeFilter}:${categoryFilter}:${brandFilter}:${lowStockOnly}:${reservedOnly}`,
    filters: [
      (p) => {
        if (activeFilter === "active") return p.is_active;
        if (activeFilter === "inactive") return !p.is_active;
        return true;
      },
      (p) => categoryFilter === null || p.category === categoryFilter,
      (p) => brandFilter === null || p.brand === brandFilter,
      (p) => !lowStockOnly || !!stockBalance[p.id]?.is_low,
      (p) => !reservedOnly || Number(stockBalance[p.id]?.reserved ?? 0) > 0,
    ],
  });

  // ── колонки ──────────────────────────────────────────────────────────────────

  usePageHotkeys({
    canPost,
    onInsert: () => {
      navigate(ROUTES.APP.PRODUCTS_CREATE);
    },
  });

  const columns: Column<any>[] = [
    { header: t("ID"), accessor: "id", sortable: true, excelWidth: 5 },
    {
      header: t("Photo"),
      excelWidth: 14,
      excelImageUrl: (item) => imagesMap[item.id]?.main_image?.thumbnail_url || null,
      render: (item) => {
        const stock = stockBalance[item.id];
        const imgData = imagesMap[item.id];
        return (
          <div className="flex justify-center">
            <div className="relative">
              {isLoadingImages ? (
                <div className="w-20 h-20 rounded bg-gray-100 dark:bg-slate-800 flex items-center justify-center">
                  <Loader size={22} dotSize={6} />
                </div>
              ) : imgData?.main_image?.thumbnail_url ? (
                <img
                  src={imgData.main_image.thumbnail_url}
                  alt={item.name}
                  className={`w-20 h-20 rounded object-cover cursor-zoom-in ${!item.is_active ? "grayscale opacity-50" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const gallery = [...(imgData.images ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order);
                    const idx = Math.max(0, gallery.findIndex((img: any) => img.id === imgData.main_image?.id));
                    setPreviewGallery(gallery.map((img: any) => img.image_url ?? img.thumbnail_url));
                    setPreviewIndex(idx);
                  }}
                />
              ) : (
                <div className={`w-20 h-20 rounded bg-gray-200 dark:bg-slate-700 ${!item.is_active ? "opacity-50" : ""}`} />
              )}
              {/* ✅ Живой признак нехватки (report_views.py::stock_balance::is_low) —
                  крупная иконка в углу фото, вместо текстовой плашки у названия. */}
              {stock?.is_low && (
                <span
                  className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-amber-500/90 dark:bg-amber-600/90 text-white flex items-center justify-center shadow-sm ring-1 ring-white dark:ring-slate-900"
                  title={t("LowStockHint", { min: stock.min_stock_level })}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                </span>
              )}
              {/* ✅ Тот же угол, что и "мало" — они взаимоисключающие: is_low у
                  неактивных товаров всегда false (report_views.py::stock_balance
                  фильтрует is_active=True при расчёте min_stock_map), значит
                  одновременно эти две иконки никогда не показываются. */}
              {!item.is_active && (
                <span
                  className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-gray-400/90 dark:bg-gray-600/90 text-white flex items-center justify-center shadow-sm ring-1 ring-white dark:ring-slate-900"
                  title={t("InactiveHint")}
                >
                  <EyeOff className="w-3.5 h-3.5" />
                </span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      header: t("Name"),
      accessor: "name",
      sortable: true,
      excelWidth: 42,
      excelWrapText: true,
      // ✅ Категория, цены (по всем price type) и остаток на складе — вместе с
      // названием, единой карточкой, вместо отдельных Категория/Цена*/Ед.изм
      // колонок. excelValue/print получают тот же текст, чтобы экран/печать/Excel
      // не расходились (см. CLAUDE.md).
      render: (item) => {
        const stock = stockBalance[item.id];
        const unit = item.unit_detail?.short_name ?? "";
        const qty = Number(stock?.quantity ?? 0);
        const reserved = Number(stock?.reserved ?? 0);
        const available = stock ? Number(stock.available) : 0;
        const priceChips = (priceTypes as any[])
          .map((pt) => ({ name: pt.name, price: pricesMap[item.id]?.[pt.id] }))
          .filter((p) => p.price !== undefined);
        return (
          <div className="flex flex-col gap-1.5 py-1">
            {/* ✅ Имя — единственное, что реально приходит в products-light (см.
                RBACGuard isLoading={isLoading} ниже — таблица ждёт ТОЛЬКО его),
                поэтому рендерится сразу. Остаток/Доступно/цены — отдельные bulk-
                запросы (stockBalance/pricesMap), которые могут ещё грузиться —
                пока не готовы, показываем спиннер вместо чипа, а не 0/пусто
                (иначе выглядело бы как настоящий нулевой остаток). */}
            <span className="font-semibold text-base md:text-lg">{item.name}</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {item.category_detail && (
                <span className="px-2 py-1 rounded text-xs md:text-sm font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                  {item.category_detail.name}
                </span>
              )}
              <span className="px-2 py-1 rounded text-xs md:text-sm font-medium bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                {t("Incoming")}: {Number(item.cost_price).toLocaleString("ru-RU", { minimumFractionDigits: 3 })}
              </span>
              {pricesMapEnabled && isLoadingPricesMap ? (
                <Loader size={16} dotSize={4} />
              ) : (
                priceChips.map((p) => (
                  <span key={p.name} className="px-2 py-1 rounded text-xs md:text-sm font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    {p.name}: {Number(p.price).toLocaleString("ru-RU", { minimumFractionDigits: 3 })}
                  </span>
                ))
              )}
            </div>
            <div className="flex flex-row flex-wrap items-center gap-1.5">
              {isLoadingStock ? (
                <Loader size={16} dotSize={4} />
              ) : (
                <>
                  <span className="px-2 py-1 rounded text-xs md:text-sm font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    {t("Stock")}: {qty.toLocaleString("ru-RU")} {unit}
                  </span>
                  {reserved > 0 && (
                    <span className="px-2 py-1 rounded text-xs md:text-sm font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
                      {t("Reserved")}: {reserved.toLocaleString("ru-RU")} {unit}
                    </span>
                  )}
                  <span
                    className={`px-2 py-1 rounded text-xs md:text-sm font-medium ${
                      available <= 0
                        ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                        : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                    }`}
                  >
                    {t("Available")}: {available.toLocaleString("ru-RU")} {unit}
                  </span>
                </>
              )}
            </div>
          </div>
        );
      },
      excelValue: (item) => {
        const stock = stockBalance[item.id];
        const unit = item.unit_detail?.short_name ?? "";
        const qty = Number(stock?.quantity ?? 0);
        const reserved = Number(stock?.reserved ?? 0);
        const available = stock ? Number(stock.available) : 0;
        const priceParts = (priceTypes as any[])
          .map((pt) => ({ name: pt.name, price: pricesMap[item.id]?.[pt.id] }))
          .filter((p) => p.price !== undefined)
          .map((p) => `${p.name}: ${Number(p.price).toLocaleString("ru-RU", { minimumFractionDigits: 3 })}`);
        const lines = [
          item.name,
          item.category_detail?.name ? `${t("Category")}: ${item.category_detail.name}` : null,
          `${t("Incoming")}: ${Number(item.cost_price).toLocaleString("ru-RU", { minimumFractionDigits: 3 })}`,
          ...priceParts,
          `${t("Stock")}: ${qty.toLocaleString("ru-RU")} ${unit}`,
          reserved > 0 ? `${t("Reserved")}: ${reserved.toLocaleString("ru-RU")} ${unit}` : null,
          `${t("Available")}: ${available.toLocaleString("ru-RU")} ${unit}`,
          stock?.is_low ? `${t("LowStock")} (min: ${stock.min_stock_level})` : null,
        ].filter(Boolean);
        return lines.join("\n");
      },
    },
    {
      header: t("Turnovers"),
      hideInPrint: true,
      render: (item) => {
        if (!turnoverEnabled) {
          return <span className="text-xs md:text-sm text-gray-400">{t("SpecifyPeriod")}</span>;
        }
        if (isLoadingTurnover) {
          return (
            <div className="flex justify-center py-2">
              <Loader size={22} dotSize={6} />
            </div>
          );
        }
        const row = turnoverMap[item.id];
        const openQty = Number(row?.opening_qty ?? 0);
        const openSum = Number(row?.opening_value ?? 0);
        const moveQty = Number(row?.move_qty ?? 0);
        const moveSum = Number(row?.move_value ?? 0);
        const inQty = Number(row?.in_qty ?? 0) + Number(row?.return_in_qty ?? 0) + Math.max(moveQty, 0);
        const inSum = Number(row?.in_value ?? 0) + Number(row?.return_in_value ?? 0) + Math.max(moveSum, 0);
        const outQty = Number(row?.out_qty ?? 0) + Number(row?.return_out_qty ?? 0) + Math.max(-moveQty, 0);
        const outSum = Number(row?.out_after_discount ?? 0) + Number(row?.return_out_value ?? 0) + Math.max(-moveSum, 0);
        const closeQty = row ? Number(row.closing_qty) : openQty;
        const closeSum = row ? Number(row.closing_value) : openSum;
        const fmt = (v: number) => v.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
        const groups = [
          { label: t("Opening"), qty: openQty, sum: openSum },
          { label: t("Incoming"), qty: inQty, sum: inSum },
          { label: t("Outgoing"), qty: outQty, sum: outSum },
          { label: t("Closing"), qty: closeQty, sum: closeSum },
        ];
        return (
          <table className="border-collapse text-xs md:text-sm leading-tight">
            <thead>
              <tr>
                <th className="border border-gray-300 dark:border-slate-600 px-2 py-1" />
                {groups.map((g) => (
                  <th key={g.label} className="border border-gray-300 dark:border-slate-600 px-2 py-1 font-semibold whitespace-nowrap">
                    {g.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-300 dark:border-slate-600 px-2 py-1 text-gray-500 whitespace-nowrap">{t("QtyShort")}</td>
                {groups.map((g) => (
                  <td key={g.label} className="border border-gray-300 dark:border-slate-600 px-2 py-1 text-center font-medium">
                    {fmt(g.qty)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="border border-gray-300 dark:border-slate-600 px-2 py-1 text-gray-500 whitespace-nowrap">{t("SumShort")}</td>
                {groups.map((g) => (
                  <td key={g.label} className="border border-gray-300 dark:border-slate-600 px-2 py-1 text-center font-medium">
                    {fmt(g.sum)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        );
      },
    },
    { header: t("SKU"), accessor: "sku", sortable: true, excelWidth: 15 },
    {
      header: t("Brand"),
      sortable: true,
      excelWidth: 15,
      sortValue: (item) => item.brand_detail?.name ?? "",
      render: (item) => <span className="text-sm text-gray-500">{item.brand_detail?.name ?? "—"}</span>,
      excelValue: (item) => item.brand_detail?.name ?? "—",
    },
    {
      header: t("Unit"),
      sortable: true,
      excelWidth: 8,
      sortValue: (item) => item.unit_detail?.short_name ?? "",
      render: (item) => <span className="text-sm">{item.unit_detail?.short_name ?? "—"}</span>,
      excelValue: (item) => item.unit_detail?.short_name ?? "—",
    },
    {
      header: t("Status"),
      accessor: "is_active",
      sortable: true,
      excelWidth: 8,
      sortValue: (item) => (item.is_active ? 1 : 0),
      excelValue: (item) => (item.is_active ? "+" : ""),
      render: (item) => <StatusBadge isActive={item.is_active} activeLabel={t("Active")} inactiveLabel={t("Inactive")} />,
    },
    {
      header: t("Actions"),
      hideInPrint: true,
      isActionColumn: true,
      render: (item) => (
        <div className="flex gap-2">
          <Button
            disabled={!canPut}
            variant="1c"
            icon={<span className="text-base">✏️</span>}
            className="md:h-8 md:w-10 md:!p-0"
            onClick={(e) => {
              e.stopPropagation();
              navigate(ROUTES.APP.PRODUCTS_EDIT.replace(":id", String(item.id)));
            }}
          />
          <Button
            variant="1c"
            icon={<span className="text-base">📊</span>}
            className="md:h-8 md:w-10 md:!p-0"
            title={t("ProductTurnover")}
            onClick={(e) => {
              e.stopPropagation();
              goToTurnover(item);
            }}
          />
          <Button
            disabled={!canDelete}
            variant="1c"
            icon={<span className="text-base">🗑️</span>}
            className="md:h-8 md:w-10 md:!p-0"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteId(item.id);
              setDeleteModal(true);
            }}
          />
        </div>
      ),
    },
  ];

  const toDelete = (products as any[]).find((p) => p.id === deleteId);

  // ── рендер ───────────────────────────────────────────────────────────────────

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText={t("ForbiddenText")} loadingText={t("LoadingProducts")} loadingProgress={loadingProgress}>
      {!workWarehouse?.id && !workBranch?.id && (
        <div className="mb-2 px-3 py-2 text-sm bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-lg">
          {t("SelectBranchOrWarehouseForPrices")}
        </div>
      )}
      <Table
        columns={columns}
        data={filtered}
        tableId="products_list"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRowDoubleClick={(item) => goToTurnover(item)}
        selectedRowId={highlightedId}
        onHighlightConsumed={() => setHighlightedId(null)}
        selectable
        onBulkDelete={canDelete ? handleBulkDelete : undefined}
      />

      <ConfirmModal
        isOpen={deleteModal}
        type="delete"
        title={`DELETE - ${t("Delete")}`}
        message={t("DeleteProductMessage", { name: toDelete?.name })}
        onClose={() => setDeleteModal(false)}
        onConfirm={() => {
          if (deleteId) {
            deleteMutation.mutate(deleteId);
            setDeleteModal(false);
          }
        }}
      />

      <ImagePreview
        src={previewGallery[previewIndex] ?? null}
        images={previewGallery}
        startIndex={previewIndex}
        onClose={() => setPreviewGallery([])}
      />
    </RBACGuard>
  );
};

export default ProductsListPage;
