// frontend/src/features/accounting/pages/Reports/PriceChangeHistoryPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { accountApi } from "../../services/accountingApi";
import { priceTypeApi } from "../../services/productApi";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { useDebouncedValue } from "../../../../core/hooks/useDebouncedValue";
import { useDateStore } from "../../../../core/store/dateStore";
import { useSidebar } from "../../../../core/context/SidebarRightContext";
import { Table, type Column } from "../../../../components/ui/Table/Table";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import { HelpButton } from "../../../../components/ui/HelpButton";
import SearchableSelect from "../../../../components/ui/SearchableSelect";
import type { PriceChangeHistory } from "../../../../core/types";

const fmt = (v: string | number) => Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 2 });
const fmt3 = (v: string | number) => Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 3 });
const fmtQty = (v: string | number) => Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 3 });

// ✅ У Себестоимости нет своей PriceType-записи (price_type=null на бэкенде) —
// SearchableSelect требует числовой id, поэтому заводим зарезервированный id,
// невозможный для реальной PriceType (см. price_type=-1 → "cost_price" ниже).
const COST_PRICE_FILTER_ID = -1;

const PriceChangeHistoryPage = () => {
  const { t } = useTranslation();
  const { canView } = usePageAccess("pricechangehistory");
  const { periodFrom, periodTo, workBranch, workWarehouse } = useDateStore();
  const { setSidebarContent } = useSidebar();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    try {
      const saved = localStorage.getItem("table:price_change_history:pageSize");
      return saved ? Number(saved) : 25;
    } catch {
      return 25;
    }
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [priceTypeFilter, setPriceTypeFilter] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const debouncedSearch = useDebouncedValue(searchQuery, 350);

  const { data: priceTypesData } = useQuery({
    queryKey: ["price-types"],
    queryFn: priceTypeApi.getAll,
    staleTime: 5 * 60 * 1000,
  });
  const priceTypes = useMemo(() => priceTypesData ?? [], [priceTypesData]);
  const priceTypeOptions = useMemo(
    () => [{ id: COST_PRICE_FILTER_ID, label: t("CostPrice") }, ...priceTypes.map((p: any) => ({ id: p.id, label: p.name }))],
    [priceTypes, t],
  );

  const priceTypeParam =
    priceTypeFilter === COST_PRICE_FILTER_ID ? "cost_price" : priceTypeFilter != null ? String(priceTypeFilter) : undefined;

  const filters = {
    page,
    page_size: pageSize,
    ...(periodFrom && { date_from: periodFrom }),
    ...(periodTo && { date_to: periodTo }),
    ...(workWarehouse?.id ? { warehouse: String(workWarehouse.id) } : workBranch?.id ? { branch: String(workBranch.id) } : {}),
    ...(priceTypeParam && { price_type: priceTypeParam }),
    ...(sortBy && { ordering: sortDir === "desc" ? `-${sortBy}` : sortBy }),
    ...(debouncedSearch && { search: debouncedSearch }),
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["price-change-history", page, pageSize, periodFrom, periodTo, workBranch?.id, workWarehouse?.id, priceTypeParam, sortBy, sortDir, debouncedSearch],
    queryFn: () => accountApi.getPriceChangeHistory(filters),
    enabled: canView && !!periodFrom && !!periodTo,
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    setPage(1);
  }, [periodFrom, periodTo, workBranch?.id, workWarehouse?.id, priceTypeParam, sortBy, sortDir, debouncedSearch]);

  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <div>
          <h4 className="font-bold text-indigo-300 mb-2 uppercase tracking-wider">{t("PriceType")}</h4>
          <SearchableSelect
            theme="sidebar"
            options={priceTypeOptions}
            value={priceTypeFilter}
            onChange={setPriceTypeFilter}
            placeholder={t("All")}
          />
        </div>
      </div>,
    );
  }, [setSidebarContent, priceTypeOptions, priceTypeFilter, t]);

  const rows: PriceChangeHistory[] = data?.results ?? [];

  const columns: Column<PriceChangeHistory>[] = [
    {
      header: t("Date"),
      accessor: "date",
      sortable: true,
      excelWidth: 14,
      render: (item) => new Date(item.date).toLocaleDateString("ru-RU"),
    },
    {
      header: t("Product"),
      accessor: "product_name",
      sortable: true,
      excelWidth: 32,
    },
    {
      header: t("PriceType"),
      accessor: "price_type_name",
      sortable: true,
      excelWidth: 18,
    },
    {
      header: t("Unit"),
      accessor: "product_unit",
      excelWidth: 10,
    },
    {
      header: t("OldPrice"),
      accessor: "old_price",
      sortable: true,
      excelWidth: 14,
      excelAlign: "right",
      render: (item) => fmt3(item.old_price),
    },
    {
      header: t("Quantity"),
      accessor: "quantity_at_change",
      sortable: true,
      excelWidth: 12,
      excelAlign: "right",
      render: (item) => fmtQty(item.quantity_at_change),
    },
    {
      header: t("OldSum"),
      accessor: "old_sum",
      sortable: true,
      excelWidth: 16,
      excelAlign: "right",
      render: (item) => fmt(item.old_sum),
    },
    {
      header: t("NewPrice"),
      accessor: "new_price",
      sortable: true,
      excelWidth: 14,
      excelAlign: "right",
      render: (item) => fmt3(item.new_price),
    },
    {
      header: t("Quantity"),
      accessor: "quantity_at_change",
      excelWidth: 12,
      excelAlign: "right",
      render: (item) => fmtQty(item.quantity_at_change),
    },
    {
      header: t("NewSum"),
      accessor: "new_sum",
      sortable: true,
      excelWidth: 16,
      excelAlign: "right",
      render: (item) => fmt(item.new_sum),
    },
    {
      header: t("Loss"),
      excelWidth: 16,
      excelAlign: "right",
      render: (item) => {
        const diff = Number(item.diff_amount);
        return diff < 0 ? <span className="text-red-600 dark:text-red-400 font-medium">{fmt(Math.abs(diff))}</span> : "";
      },
      excelValue: (item) => (Number(item.diff_amount) < 0 ? fmt(Math.abs(Number(item.diff_amount))) : ""),
    },
    {
      header: t("Profit"),
      excelWidth: 16,
      excelAlign: "right",
      render: (item) => {
        const diff = Number(item.diff_amount);
        return diff > 0 ? <span className="text-emerald-600 dark:text-emerald-400 font-medium">{fmt(diff)}</span> : "";
      },
      excelValue: (item) => (Number(item.diff_amount) > 0 ? fmt(Number(item.diff_amount)) : ""),
    },
    {
      header: t("CreatedBy"),
      accessor: "created_by_display",
      excelWidth: 22,
      hideInPrint: true,
    },
  ];

  return (
    <RBACGuard
      isLoading={isLoading && !data}
      error={error}
      canView={canView}
      forbiddenText={t("ForbiddenText")}
      loadingText={t("LoadingReport")}
      loadingProgress="indeterminate"
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm md:text-lg font-bold text-gray-800 dark:text-gray-100">{t("PriceChangeHistory")}</h2>
          <HelpButton title={t("PriceChangeHistory")}>
            <p>
              <b>История изменения цен</b> — универсальный лог изменения ЛЮБОЙ цены товара: закупочных/розничных/оптовых
              цен и скидок (см. справочник «Типы цен»), а также себестоимости. По каждому изменению фиксируется
              исторический снимок остатка на момент события и разница между старой и новой суммой (кол-во × цена) —
              положительная разница выводится в колонку «Прибыль», отрицательная — в «Убыток».
            </p>
            <ul>
              <li>
                <b>Строки не пересчитываются задним числом</b> — это исторический факт на момент изменения цены.
              </li>
              <li>
                <b>Период</b> берётся из виджета правого сайдбара, <b>«Тип цены»</b> (правый сайдбар) — сужает список до
                одного типа или до «Себестоимость».
              </li>
              <li>
                <b>Поиск</b> (над таблицей) — по названию/артикулу товара.
              </li>
              <li>
                <b>«Экспорт в Excel»</b> — выгружает ровно то, что видно на экране, с учётом фильтров.
              </li>
            </ul>
          </HelpButton>
        </div>

        {!periodFrom || !periodTo ? (
          <div className="text-center py-12 text-gray-400">{t("SpecifyPeriod")}</div>
        ) : (
          <Table
            columns={columns}
            data={rows}
            tableId="price_change_history"
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            pagination={{
              mode: "server",
              page,
              pageSize,
              total: data?.count ?? 0,
              onPageChange: setPage,
              onPageSizeChange: (size) => {
                setPageSize(size);
                setPage(1);
                try {
                  localStorage.setItem("table:price_change_history:pageSize", String(size));
                } catch {}
              },
              sortBy,
              sortDir,
              onSortChange: (key, direction) => {
                setSortBy(key);
                setSortDir(direction);
              },
            }}
            onFetchAllData={async () => {
              const res = await accountApi.getPriceChangeHistory({
                page: 1,
                page_size: 10000,
                ...(periodFrom && { date_from: periodFrom }),
                ...(periodTo && { date_to: periodTo }),
                ...(workWarehouse?.id ? { warehouse: String(workWarehouse.id) } : workBranch?.id ? { branch: String(workBranch.id) } : {}),
                ...(priceTypeParam && { price_type: priceTypeParam }),
                ...(sortBy && { ordering: sortDir === "desc" ? `-${sortBy}` : sortBy }),
              });
              return res.results ?? [];
            }}
          />
        )}
      </div>
    </RBACGuard>
  );
};

export default PriceChangeHistoryPage;
