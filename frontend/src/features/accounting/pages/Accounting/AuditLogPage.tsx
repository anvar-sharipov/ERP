import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { accountApi } from "../../services/accountingApi";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { Table, type Column } from "../../../../components/ui/Table/Table";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import type { AuditLog } from "../../../../core/types";

export default function AuditLogPage() {
  const { canView } = usePageAccess("auditlog");

  const [page, setPage] = useState(1);
  //   const [pageSize, setPageSize] = useState(25);
  const [pageSize, setPageSize] = useState(() => {
    try {
      const saved = localStorage.getItem("table:audit_logs:pageSize");
      return saved ? Number(saved) : 25;
    } catch {
      return 25;
    }
  });
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["audit-logs", page, pageSize],
    queryFn: () => accountApi.getAuditLogs({ page, page_size: pageSize }),
    enabled: canView,
    placeholderData: (prev) => prev,
    staleTime: 0,
  });

  console.log("data", data?.results?.length, "isFetching", isFetching, "pageSize", pageSize);

  const logs: AuditLog[] = data?.results ?? [];

  const fetchAllForExcel = async () => {
    const res = await accountApi.getAuditLogs({ page: 1, page_size: 10000 });
    return res.results ?? [];
  };

  const columns: Column<AuditLog>[] = [
    {
      header: "Время",
      accessor: "timestamp",
      sortable: true,
      excelWidth: 22,
      render: (item) => new Date(item.timestamp).toLocaleString("ru-RU"),
    },
    {
      header: "Пользователь",
      accessor: "user_display",
      sortable: true,
      excelWidth: 25,
      render: (item) => item.user_display || "Система",
    },
    {
      header: "Действие",
      accessor: "action_display",
      sortable: true,
      excelWidth: 20,
    },
    {
      header: "Объект",
      accessor: "model_name",
      sortable: true,
      excelWidth: 20,
    },
    {
      header: "Запись",
      accessor: "object_repr",
      sortable: true,
      excelWidth: 35,
    },
    {
      header: "IP",
      accessor: "ip_address",
      sortable: true,
      excelWidth: 18,
      render: (item) => item.ip_address || "—",
    },
    {
      header: "Изменения",
      accessor: "changed_data",
      excelWidth: 60,
      render: (item) => {
        const d = item.changed_data;
        if (!d || Object.keys(d).length === 0) return "—";
        return (
          <div className="space-y-1 text-xs">
            {Object.entries(d).map(([field, value]) => {
              if (typeof value === "object" && value !== null && "before" in value && "after" in value) {
                return (
                  <div key={field}>
                    <span className="font-medium">{field}</span>: <span className="text-red-500">{String(value.before)}</span>
                    {" → "}
                    <span className="text-green-500">{String(value.after)}</span>
                  </div>
                );
              }
              return (
                <div key={field}>
                  <span className="font-medium">{field}</span>: {String(value)}
                </div>
              );
            })}
          </div>
        );
      },
    },
  ];

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText="Нет доступа к журналу аудита">
      <Table
        columns={columns}
        data={logs}
        tableId="audit_logs"
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
              localStorage.setItem("table:audit_logs:pageSize", String(size));
            } catch {}
          },
        }}
        onFetchAllData={async () => {
          const res = await accountApi.getAuditLogs({ page: 1, page_size: 10000 });
          return res.results ?? [];
        }}
      />
    </RBACGuard>
  );
}
