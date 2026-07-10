// frontend/src/features/accounting/pages/Dashboard/index.tsx
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowUp, ArrowDown, Sparkles, Tv } from "lucide-react";
import { accountApi } from "../../services/accountingApi";
import { useDateStore } from "../../../../core/store/dateStore";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { useDashboardSocket } from "../../../../core/hooks/useDashboardSocket";
import { useCountUp } from "../../../../core/hooks/useCountUp";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import { Loader } from "../../../../components/ui/Loader";
import { Button } from "../../../../components/ui/Button";
import { HelpButton } from "../../../../components/ui/HelpButton";
import { useSidebar } from "../../../../core/context/SidebarRightContext";
import { RevenueByWarehouseChart } from "./RevenueByWarehouseChart";
import { RevenueTrendChart } from "./RevenueTrendChart";
import { RevenueByWarehouseTable } from "./RevenueByWarehouseTable";
import { TopList } from "./TopList";
import { DocumentsTicker } from "./DocumentsTicker";
import { TVMode } from "./TVMode";
import { buildWarehouseColorMap } from "./chartPalette";
import { filterByWarehouse, aggregateDailyByDate, getPreviousPeriod, computeDelta, type Delta } from "./dashboardHelpers";

const WAREHOUSE_FILTER_KEY = "dashboard_selected_warehouses";
const COMPARE_KEY = "dashboard_compare_previous_period";

const fmt = (v: number | string) => Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const DeltaBadge = ({ delta }: { delta: Delta }) => {
  const { t } = useTranslation();
  if (delta.isNew) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
        <Sparkles className="w-3 h-3" /> {t("New")}
      </span>
    );
  }
  if (delta.pct == null) return null;
  const isUp = delta.pct > 0;
  const isFlat = delta.pct === 0;
  const colorClass = isFlat
    ? "text-gray-500 dark:text-gray-400"
    : isUp
      ? "text-green-700 dark:text-green-400"
      : "text-red-700 dark:text-red-400";
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${colorClass}`}>
      {!isFlat && (isUp ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      {isUp ? "+" : ""}{delta.pct.toFixed(1)}%
    </span>
  );
};

const StatTile = ({
  label,
  value,
  format = (v: number) => fmt(v),
  delta,
}: {
  label: string;
  value: number;
  format?: (v: number) => string;
  delta?: Delta;
}) => {
  // ✅ Плавная "прокрутка" числа при обновлении (WS push) — см. useCountUp.
  const animated = useCountUp(value);
  return (
    <div className="flex-1 min-w-[160px] rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
      <div className="text-xs md:text-sm text-gray-500 dark:text-gray-400">{label}</div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <div className="text-lg md:text-2xl font-bold text-gray-800 dark:text-gray-100 tabular-nums">{format(animated)}</div>
        {delta && <DeltaBadge delta={delta} />}
      </div>
    </div>
  );
};

const Dashboard = () => {
  const { t } = useTranslation();
  const { periodFrom, periodTo, workBranch, workWarehouse } = useDateStore();
  const { canView } = usePageAccess("document");
  const { setSidebarContent } = useSidebar();

  useDashboardSocket();

  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(WAREHOUSE_FILTER_KEY);
      return raw ? new Set(JSON.parse(raw) as number[]) : new Set();
    } catch {
      return new Set();
    }
  });
  const persistSelected = (ids: Set<number>) => {
    setSelectedWarehouseIds(ids);
    try {
      localStorage.setItem(WAREHOUSE_FILTER_KEY, JSON.stringify([...ids]));
    } catch {}
  };

  const [compareEnabled, setCompareEnabled] = useState(() => {
    try {
      return localStorage.getItem(COMPARE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const toggleCompare = (value: boolean) => {
    setCompareEnabled(value);
    try {
      localStorage.setItem(COMPARE_KEY, String(value));
    } catch {}
  };

  const queryParams = {
    date_from: periodFrom!,
    date_to: periodTo!,
    ...(workWarehouse?.id ? { warehouse: String(workWarehouse.id) } : workBranch?.id ? { branch: String(workBranch.id) } : {}),
  };

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-revenue", periodFrom, periodTo, workBranch?.id, workWarehouse?.id],
    queryFn: () => accountApi.getRevenueByWarehouse(queryParams),
    enabled: !!periodFrom && !!periodTo && canView,
  });

  const { prevFrom, prevTo } = useMemo(
    () => getPreviousPeriod(periodFrom || "", periodTo || ""),
    [periodFrom, periodTo],
  );
  const { data: prevData } = useQuery({
    queryKey: ["dashboard-revenue-prev", prevFrom, prevTo, workBranch?.id, workWarehouse?.id],
    queryFn: () => accountApi.getRevenueByWarehouse({ ...queryParams, date_from: prevFrom, date_to: prevTo }),
    enabled: compareEnabled && !!periodFrom && !!periodTo && canView,
  });

  const byWarehouse = data?.by_warehouse ?? [];
  const daily = data?.daily ?? [];

  // ✅ Фильтр складов (сайдбар) применяется одинаково к плиткам, обоим графикам
  // и таблице — единая точка фильтрации, экран не расходится сам с собой.
  const filteredByWarehouse = filterByWarehouse(byWarehouse, selectedWarehouseIds);
  const filteredDaily = aggregateDailyByDate(filterByWarehouse(daily, selectedWarehouseIds));
  const filteredTotalRevenue = filteredByWarehouse.reduce((s, r) => s + Number(r.revenue), 0);
  const filteredTotalDocuments = filteredByWarehouse.reduce((s, r) => s + r.documents_count, 0);

  const prevFilteredByWarehouse = filterByWarehouse(prevData?.by_warehouse ?? [], selectedWarehouseIds);
  const prevTotalRevenue = prevFilteredByWarehouse.reduce((s, r) => s + Number(r.revenue), 0);
  const prevTotalDocuments = prevFilteredByWarehouse.reduce((s, r) => s + r.documents_count, 0);

  const revenueDelta = compareEnabled ? computeDelta(filteredTotalRevenue, prevTotalRevenue) : undefined;
  const documentsDelta = compareEnabled ? computeDelta(filteredTotalDocuments, prevTotalDocuments) : undefined;

  const avgCheck = filteredTotalDocuments > 0 ? filteredTotalRevenue / filteredTotalDocuments : 0;
  const prevAvgCheck = prevTotalDocuments > 0 ? prevTotalRevenue / prevTotalDocuments : 0;
  const avgCheckDelta = compareEnabled ? computeDelta(avgCheck, prevAvgCheck) : undefined;

  const colorMap = useMemo(() => buildWarehouseColorMap(byWarehouse.map((w) => w.warehouse_id)), [byWarehouse]);

  // ✅ Топ-5 товаров/контрагентов должны так же реагировать на фильтр складов
  // сайдбара, как и остальные виджеты — но у этих двух эндпоинтов нет отдельного
  // "полного" списка для чек-листа (в отличие от revenue-by-warehouse), поэтому
  // им можно сразу передать выбранное подмножество складов через ?warehouse=
  // (см. _resolve_warehouse_ids: строка теперь поддерживает список через запятую).
  const topQueryParams = selectedWarehouseIds.size > 0
    ? { date_from: periodFrom!, date_to: periodTo!, warehouse: [...selectedWarehouseIds].sort((a, b) => a - b).join(',') }
    : queryParams;
  const topQueryKeyPart = selectedWarehouseIds.size > 0 ? [...selectedWarehouseIds].sort((a, b) => a - b).join(',') : "all";

  const { data: topProducts = [] } = useQuery({
    queryKey: ["dashboard-top-products", periodFrom, periodTo, workBranch?.id, workWarehouse?.id, topQueryKeyPart],
    queryFn: () => accountApi.getTopProducts(topQueryParams),
    enabled: !!periodFrom && !!periodTo && canView,
  });
  const { data: topCounterparties = [] } = useQuery({
    queryKey: ["dashboard-top-counterparties", periodFrom, periodTo, workBranch?.id, workWarehouse?.id, topQueryKeyPart],
    queryFn: () => accountApi.getTopCounterparties(topQueryParams),
    enabled: !!periodFrom && !!periodTo && canView,
  });

  // ✅ Бегущая строка — всегда про СЕГОДНЯ (не про выбранный period отчётов),
  // поэтому свой независимый запрос без date_from/date_to, но с тем же
  // фильтром складов (шапка + сайдбар), что и остальные виджеты.
  const scopeQueryParams = selectedWarehouseIds.size > 0
    ? { warehouse: [...selectedWarehouseIds].sort((a, b) => a - b).join(',') }
    : (workWarehouse?.id ? { warehouse: String(workWarehouse.id) } : workBranch?.id ? { branch: String(workBranch.id) } : {});

  const { data: todayDocuments = [] } = useQuery({
    queryKey: ["dashboard-today-documents", workBranch?.id, workWarehouse?.id, topQueryKeyPart],
    queryFn: () => accountApi.getTodayDocuments(scopeQueryParams),
    enabled: canView,
  });

  const [tvMode, setTvMode] = useState(false);

  const toggleWarehouse = (id: number) => {
    // ✅ Пустой набор означает "фильтр не активен, показаны все" — чтобы снять
    // галочку с ОДНОГО склада из этого состояния, сначала материализуем полный
    // список (иначе toggle на пустом Set добавил бы этот id, а не убрал его,
    // и в итоге показывался бы только он один — обратный эффект от ожидаемого).
    const allIds = byWarehouse.map((w) => w.warehouse_id);
    const base = selectedWarehouseIds.size === 0 ? new Set(allIds) : new Set(selectedWarehouseIds);
    if (base.has(id)) base.delete(id);
    else base.add(id);
    // ✅ Если после переключения набор снова покрывает все склады — сворачиваем
    // обратно к каноничному "пусто = фильтр выключен", а не держим полный список.
    const isFull = allIds.length > 0 && allIds.every((wid) => base.has(wid));
    persistSelected(isFull ? new Set() : base);
  };

  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-bold text-indigo-300 uppercase tracking-wider">{t("FilterWarehouses")}</h4>
          </div>
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => persistSelected(new Set())}
              disabled={selectedWarehouseIds.size === 0}
              className="text-xs text-indigo-300 hover:text-white underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
            >
              {t("Reset")}
            </button>
          </div>
          {/* ✅ Тот же стиль тоггл-кнопок, что и фильтры "Подарок"/"Комплектующие" в
              InvoicesPage.tsx (Button variant="ghost" dark isActive=...) — вместо
              нативных чекбоксов, для единого вида фильтров сайдбара по всему проекту. */}
          <div className="flex flex-col gap-1 max-h-52 overflow-y-auto">
            {byWarehouse.map((w) => {
              const isChecked = selectedWarehouseIds.size === 0 || selectedWarehouseIds.has(w.warehouse_id);
              const color = colorMap.get(w.warehouse_id);
              return (
                <Button
                  key={w.warehouse_id}
                  variant="ghost"
                  dark
                  isActive={isChecked}
                  className="w-full justify-start"
                  icon={<span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color?.dark ?? "#898781" }} />}
                  text={w.warehouse_name}
                  onClick={() => toggleWarehouse(w.warehouse_id)}
                />
              );
            })}
            {byWarehouse.length === 0 && <span className="text-indigo-400/60 text-sm">{t("NoDataForPeriod")}</span>}
          </div>
        </div>

        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2 uppercase tracking-wider">{t("PeriodComparison")}</h4>
          <label className="flex items-center gap-2 text-indigo-200 cursor-pointer">
            <input
              type="checkbox"
              checked={compareEnabled}
              onChange={(e) => toggleCompare(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600"
            />
            {t("CompareWithPreviousPeriod")}
          </label>
          {compareEnabled && prevFrom && prevTo && (
            <p className="text-indigo-400/60 text-xs mt-2">
              {t("PreviousPeriod")}: {new Date(prevFrom).toLocaleDateString("ru-RU")} — {new Date(prevTo).toLocaleDateString("ru-RU")}
            </p>
          )}
        </div>
      </div>,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSidebarContent, byWarehouse, selectedWarehouseIds, compareEnabled, prevFrom, prevTo, colorMap, t]);

  useEffect(() => {
    return () => setSidebarContent(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <RBACGuard isLoading={false} error={null} canView={canView} forbiddenText={t("ForbiddenText")}>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm md:text-lg font-bold text-gray-800 dark:text-gray-100">{t("Desktop")}</h2>
            <HelpButton title={t("Desktop")}>
              <p>
                <b>{t("Desktop")}</b> — рабочий стол с живой выручкой/продажами за выбранный период, с разбивкой по
                складам.
              </p>
              <ul>
                <li>
                  <b>Период</b> и <b>склад/филиал</b> берутся из виджетов в правом сайдбаре — без выбора склада
                  показываются все склады, доступные вам по правам доступа (scope).
                </li>
                <li>
                  <b>Выручка</b> = сумма проведённых "Расходных" накладных минус "Возврат поставщику" — то же значение,
                  что стоит на самих документах.
                </li>
                <li>
                  <b>График по складам</b> — один бар на склад; <b>тренд</b> — сумма выручки по дням за период.
                </li>
                <li>
                  <b>Фильтр складов</b> (правый сайдбар) — сужает плитки, оба графика и таблицу до выбранных складов;
                  ничего не выбрано — показаны все.
                </li>
                <li>
                  <b>«Сравнить с предыдущим периодом»</b> (правый сайдбар) — на плитках появляется % изменения
                  относительно периода той же длительности, идущего непосредственно перед текущим.
                </li>
                <li>
                  <b>Средний чек</b> = выручка / кол-во документов. <b>Топ-5 товаров/контрагентов</b> — самые
                  прибыльные позиции и покупатели за период.
                </li>
                <li>
                  <b>Бегущая строка</b> под шапкой — сегодняшние проведённые "Расходные" накладные, обновляется сама;
                  клик по записи открывает документ.
                </li>
                <li>
                  <b>Обновляется само</b> — как только кто-то проводит/отменяет проведение "Расходной" накладной,
                  дашборд сам подтягивает новые цифры без перезагрузки страницы: плитки плавно "прокручиваются" к
                  новому значению, графики плавно перетекают в новую форму, топ-5 и бегущая строка тоже обновляются сами.
                </li>
                <li>
                  <b>TV-режим</b> (кнопка с иконкой монитора) — полноэкранный показ для проекции на экран, все виджеты
                  сразу крупным планом, тема (светлая/тёмная) — та же, что выбрана в приложении.
                </li>
              </ul>
            </HelpButton>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setTvMode(true)}
              title={t("TVMode")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-gray-300 text-sm hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              <Tv className="w-4 h-4" /> {t("TVMode")}
            </button>
            {periodFrom && periodTo && (
              <span className="text-gray-500 dark:text-gray-400 text-sm whitespace-nowrap">
                {new Date(periodFrom).toLocaleDateString("ru-RU")} — {new Date(periodTo).toLocaleDateString("ru-RU")}
              </span>
            )}
          </div>
        </div>

        <DocumentsTicker documents={todayDocuments} />

        {!periodFrom || !periodTo ? (
          <div className="text-center py-12 text-gray-400">{t("SpecifyPeriod")}</div>
        ) : isLoading ? (
          <Loader containerClass="py-12" text={t("LoadingReport")} progress="indeterminate" />
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              <StatTile label={t("TotalRevenue")} value={filteredTotalRevenue} delta={revenueDelta} />
              <StatTile
                label={t("TotalDocuments")}
                value={filteredTotalDocuments}
                format={(v) => String(Math.round(v))}
                delta={documentsDelta}
              />
              <StatTile label={t("AverageCheck")} value={avgCheck} delta={avgCheckDelta} />
            </div>

            <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
              <h3 className="text-xs md:text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                {t("RevenueByWarehouse")}
              </h3>
              <RevenueByWarehouseChart data={filteredByWarehouse} />
            </div>

            <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
              <h3 className="text-xs md:text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                {t("RevenueTrend")}
              </h3>
              <RevenueTrendChart data={filteredDaily} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
                <h3 className="text-xs md:text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
                  {t("TopProducts")}
                </h3>
                <TopList
                  rows={topProducts.map((p) => ({
                    id: p.product_id,
                    name: p.product_name,
                    revenue: p.revenue,
                    extraLabel: t("Quantity"),
                    extraValue: Number(p.quantity).toLocaleString("ru-RU", { maximumFractionDigits: 2 }),
                  }))}
                />
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
                <h3 className="text-xs md:text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
                  {t("TopCounterparties")}
                </h3>
                <TopList
                  rows={topCounterparties.map((c) => ({
                    id: c.counterparty_id,
                    name: c.counterparty_name,
                    revenue: c.revenue,
                    extraLabel: t("DocumentsCount"),
                    extraValue: String(c.documents_count),
                  }))}
                />
              </div>
            </div>

            <RevenueByWarehouseTable rows={filteredByWarehouse} />
          </>
        )}
      </div>

      {tvMode && (
        <TVMode
          onClose={() => setTvMode(false)}
          totalRevenue={filteredTotalRevenue}
          totalDocuments={filteredTotalDocuments}
          avgCheck={avgCheck}
          revenueDelta={revenueDelta}
          documentsDelta={documentsDelta}
          avgCheckDelta={avgCheckDelta}
          byWarehouse={filteredByWarehouse}
          daily={filteredDaily}
          topProducts={topProducts}
          topCounterparties={topCounterparties}
          todayDocuments={todayDocuments}
          periodFrom={periodFrom!}
          periodTo={periodTo!}
        />
      )}
    </RBACGuard>
  );
};

export default Dashboard;
