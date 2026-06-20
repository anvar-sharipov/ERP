// src/features/accounting/pages/Journal/StockMovementsPage.tsx
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
// import { useTranslation } from "react-i18next";
import { movementApi, type StockMovement } from "../../services/transactionApi";
import { Table, type Column } from "../../../../components/ui/Table/Table";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { useSidebar } from "../../../../core/context/SidebarRightContext";
import { useDateStore } from "../../../../core/store/dateStore";
import { useTableFilter } from "../../../../core/hooks/useTableFilter";

const DIRECTION_LABELS: Record<string, { label: string; cls: string }> = {
  in: { label: "Приход", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  out: { label: "Расход", cls: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
  move: { label: "Перемещение", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
};

export default function StockMovementsPage() {
  //   const { t } = useTranslation();
  const { canView } = usePageAccess("stockmovement");
  const { setSidebarContent } = useSidebar();

  const { periodFrom, periodTo } = useDateStore();

  const [search, setSearch] = useState("");
  const [directionFilter, setDirectionFilter] = useState("");

  const filters: Record<string, string> = {
    ...(directionFilter && { direction: directionFilter }),
    ...(periodFrom && { date_from: periodFrom }),
    ...(periodTo && { date_to: periodTo }),
  };

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["stock-movements", filters],
    queryFn: () => movementApi.list(filters).then((r) => r.data),
    enabled: canView,
  });

  const filteredMovements = useTableFilter(movements, {
    search,
    searchFields: ["product_name", "warehouse_name", "warehouse_to_name", "note", "created_by_name"],
  });

  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2 text-xs uppercase tracking-wider">Тип движения</h4>
          <div className="flex flex-col gap-1">
            {(
              [
                { value: "", label: "Все" },
                { value: "in", label: "Приход" },
                { value: "out", label: "Расход" },
                { value: "move", label: "Перемещение" },
              ] as const
            ).map((item) => (
              <button
                key={item.value}
                onClick={() => setDirectionFilter(item.value)}
                className={`
                  text-left text-sm px-3 py-1.5 rounded transition
                  ${directionFilter === item.value ? "bg-indigo-700 text-white" : "text-indigo-300 hover:bg-indigo-900/30"}
                `}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>,
    );
  }, [setSidebarContent, directionFilter]);

  const columns: Column<StockMovement>[] = [
    { header: "№", accessor: "id", width: "60px", sortable: true },
    {
      header: "Дата",
      accessor: "created_at",
      width: "130px",
      sortable: true,
      render: (item) =>
        new Date(item.created_at).toLocaleString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
    },
    {
      header: "Тип",
      accessor: "direction",
      width: "120px",
      sortable: true,
      render: (item) => {
        const d = DIRECTION_LABELS[item.direction];
        return <span className={`px-2 py-0.5 rounded text-xs font-medium ${d?.cls}`}>{d?.label ?? item.direction}</span>;
      },
    },
    { header: "Товар", accessor: "product_name", sortable: true, render: (item) => <span className="text-sm">{item.product_name}</span> },
    { header: "Склад (откуда)", accessor: "warehouse_name", width: "150px", sortable: true, render: (item) => <span className="text-sm">{item.warehouse_name}</span> },
    { header: "Склад (куда)", accessor: "warehouse_to_name", width: "150px", sortable: true, render: (item) => <span className="text-sm text-gray-500">{item.warehouse_to_name ?? "—"}</span> },
    {
      header: "Количество",
      accessor: "quantity",
      width: "110px",
      sortable: true,
      excelWidth: 12,
      render: (item) => <span className="font-mono text-sm">{Number(item.quantity).toLocaleString("ru-RU", { minimumFractionDigits: 3 })}</span>,
    },
    {
      header: "Себест.",
      accessor: "cost_price",
      width: "110px",
      sortable: true,
      excelWidth: 14,
      render: (item) => <span className="font-mono text-sm">{Number(item.cost_price).toLocaleString("ru-RU", { minimumFractionDigits: 2 })}</span>,
    },
    { header: "Примечание", accessor: "note", sortable: true, render: (item) => <span className="text-sm text-gray-500">{item.note || "—"}</span> },
    { header: "Автор", accessor: "created_by_name", width: "140px", sortable: true, render: (item) => <span className="text-sm text-gray-500">{item.created_by_name || "—"}</span> },
  ];

  return (
    <div className="space-y-3">
      <Table columns={columns} data={filteredMovements} tableId="stock_movements" searchQuery={search} onSearchChange={setSearch} isLoading={isLoading} />
    </div>
  );
}
