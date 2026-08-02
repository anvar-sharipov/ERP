// frontend/src/features/accounting/pages/Reports/ProductRevaluationPage.tsx
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { accountApi } from "../../services/accountingApi";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { useDebouncedValue } from "../../../../core/hooks/useDebouncedValue";
import { useDateStore } from "../../../../core/store/dateStore";
import { Table, type Column } from "../../../../components/ui/Table/Table";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import { HelpButton } from "../../../../components/ui/HelpButton";
import { ROUTES } from "../../../../core/router/routes";
import type { ProductRevaluation } from "../../../../core/types";

const fmt = (v: string | number) => Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 2 });
const fmt3 = (v: string | number) => Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 3 });
const fmtQty = (v: string | number) => Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 3 });

const ProductRevaluationPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { canView } = usePageAccess("productrevaluation");
  const { periodFrom, periodTo, workBranch, workWarehouse } = useDateStore();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    try {
      const saved = localStorage.getItem("table:product_revaluations:pageSize");
      return saved ? Number(saved) : 25;
    } catch {
      return 25;
    }
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const debouncedSearch = useDebouncedValue(searchQuery, 350);

  const filters = {
    page,
    page_size: pageSize,
    ...(periodFrom && { date_from: periodFrom }),
    ...(periodTo && { date_to: periodTo }),
    ...(workWarehouse?.id ? { warehouse: String(workWarehouse.id) } : workBranch?.id ? { branch: String(workBranch.id) } : {}),
    ...(sortBy && { ordering: sortDir === "desc" ? `-${sortBy}` : sortBy }),
    ...(debouncedSearch && { search: debouncedSearch }),
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["product-revaluations", page, pageSize, periodFrom, periodTo, workBranch?.id, workWarehouse?.id, sortBy, sortDir, debouncedSearch],
    queryFn: () => accountApi.getProductRevaluations(filters),
    enabled: canView && !!periodFrom && !!periodTo,
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    setPage(1);
  }, [periodFrom, periodTo, workBranch?.id, workWarehouse?.id, sortBy, sortDir, debouncedSearch]);

  const rows: ProductRevaluation[] = data?.results ?? [];

  const columns: Column<ProductRevaluation>[] = [
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
      header: t("SKU"),
      accessor: "product_sku",
      excelWidth: 16,
      render: (item) => item.product_sku ?? "—",
    },
    {
      header: t("Branch"),
      accessor: "branch_name",
      sortable: true,
      excelWidth: 20,
    },
    {
      header: t("Warehouse"),
      accessor: "warehouse_name",
      sortable: true,
      excelWidth: 20,
    },
    {
      header: t("Quantity"),
      accessor: "quantity",
      sortable: true,
      excelWidth: 14,
      excelAlign: "right",
      render: (item) => fmtQty(item.quantity),
    },
    {
      header: t("CostPriceBefore"),
      accessor: "old_cost_price",
      sortable: true,
      excelWidth: 16,
      excelAlign: "right",
      render: (item) => fmt3(item.old_cost_price),
    },
    {
      header: t("CostPriceAfter"),
      accessor: "new_cost_price",
      sortable: true,
      excelWidth: 16,
      excelAlign: "right",
      render: (item) => fmt3(item.new_cost_price),
    },
    {
      header: t("RevaluationDiff"),
      accessor: "diff_amount",
      sortable: true,
      excelWidth: 18,
      excelAlign: "right",
      render: (item) => {
        const diff = Number(item.diff_amount);
        const isGain = diff > 0;
        const isLoss = diff < 0;
        return (
          <span className={isGain ? "text-emerald-600 dark:text-emerald-400 font-medium" : isLoss ? "text-red-600 dark:text-red-400 font-medium" : ""}>
            {isGain ? "+" : ""}
            {fmt(item.diff_amount)}
            {" "}
            {isGain ? `(${t("Markup")})` : isLoss ? `(${t("Markdown")})` : ""}
          </span>
        );
      },
    },
    {
      header: t("Document"),
      accessor: "document_number",
      sortable: true,
      excelWidth: 18,
      render: (item) => item.document_number ?? "—",
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
          <h2 className="text-sm md:text-lg font-bold text-gray-800 dark:text-gray-100">{t("ProductRevaluation")}</h2>
          <HelpButton title={t("ProductRevaluation")}>
            <p>
              <b>Переоценка товаров</b> — фиксирует событие изменения себестоимости товара (при проведении «Прихода» по
              новой цене): по каждому складу, где на тот момент был остаток, строкой сохраняется исторический снимок
              количества, старой/новой себестоимости и разницы — дооценка (прибыль, если цена выросла) или уценка
              (убыток, если цена упала).
            </p>
            <ul>
              <li>
                <b>Строки не пересчитываются задним числом</b> — последующие продажи/перемещения товара не меняют уже
                зафиксированные записи, это исторический факт на момент события.
              </li>
              <li>
                <b>Период</b>, <b>склад</b> и <b>филиал</b> берутся из виджетов правого сайдбара — как и в остальных
                отчётах.
              </li>
              <li>
                <b>Поиск</b> (над таблицей) — по названию/артикулу товара и номеру документа-основания.
              </li>
              <li>
                <b>Двойной клик по строке</b> открывает документ-основание (приходную накладную), из-за проведения
                которой произошла переоценка.
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
            tableId="product_revaluations"
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onRowDoubleClick={(item) => {
              if (item.document) {
                navigate(ROUTES.APP.DOCUMENTS_VIEW.replace(":id", String(item.document)));
              }
            }}
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
                  localStorage.setItem("table:product_revaluations:pageSize", String(size));
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
              const res = await accountApi.getProductRevaluations({
                page: 1,
                page_size: 10000,
                ...(periodFrom && { date_from: periodFrom }),
                ...(periodTo && { date_to: periodTo }),
                ...(workWarehouse?.id ? { warehouse: String(workWarehouse.id) } : workBranch?.id ? { branch: String(workBranch.id) } : {}),
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

export default ProductRevaluationPage;
