import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { accountApi } from "../../services/accountingApi";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { Table, type Column } from "../../../../components/ui/Table/Table";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import type { AuditLog } from "../../../../core/types";
import { useTableFilter } from "../../../../core/hooks/useTableFilter";
import { useSidebar } from "../../../../core/context/SidebarRightContext";
import { Button } from "../../../../components/ui/Button";
import { useDateStore } from "../../../../core/store/dateStore";
import { usersApi } from "../../../users/services/userApi";

export default function AuditLogPage() {
  const { t } = useTranslation();
  const { canView } = usePageAccess("auditlog");
  const { setSidebarContent } = useSidebar();
  const { periodFrom, periodTo } = useDateStore();
  const [userFilter, setUserFilter] = useState<number | null>(null);

  // console.log("canView", canView);
  

  const { data: users = [] } = useQuery({
    queryKey: ["users-lookup"],
    queryFn: usersApi.getUsersLookup,
    staleTime: 5 * 60 * 1000,
  });

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
  const [actionFilter, setActionFilter] = useState<"all" | "create" | "update" | "delete" | "post" | "unpost">("all");

  const filters = {
    page,
    page_size: pageSize,
    ...(actionFilter !== "all" && {
      action: actionFilter,
    }),
    ...(userFilter && { user: userFilter }),
    ...(periodFrom && { date_from: periodFrom }),
    ...(periodTo && { date_to: periodTo }),
  };

  const { data, isLoading, error } = useQuery({
    // queryKey: ["audit-logs", filters],
    queryKey: ["audit-logs", page, pageSize, actionFilter, userFilter, periodFrom, periodTo],
    queryFn: () => accountApi.getAuditLogs(filters),
    enabled: canView,
    placeholderData: (prev) => prev,
    staleTime: 0,
  });

  //   console.log("data", data);

  useEffect(() => {
    setPage(1);
  }, [periodFrom, periodTo, userFilter, actionFilter]);


  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <div className="pt-2">
          <h4 className="font-bold text-indigo-300 mb-2">{t("ActionFilter")}</h4>

          <div className="flex flex-col gap-1">
            <Button text={t("All")} variant="ghost" dark isActive={actionFilter === "all"} className="w-full justify-start" onClick={() => setActionFilter("all")} />

            <Button text={t("ActionCreate")} variant="ghost" dark isActive={actionFilter === "create"} className="w-full justify-start" onClick={() => setActionFilter("create")} />

            <Button text={t("ActionUpdate")} variant="ghost" dark isActive={actionFilter === "update"} className="w-full justify-start" onClick={() => setActionFilter("update")} />

            <Button text={t("ActionDelete")} variant="ghost" dark isActive={actionFilter === "delete"} className="w-full justify-start" onClick={() => setActionFilter("delete")} />

            <Button text={t("ActionPost")} variant="ghost" dark isActive={actionFilter === "post"} className="w-full justify-start" onClick={() => setActionFilter("post")} />

            <Button text={t("ActionUnpost")} variant="ghost" dark isActive={actionFilter === "unpost"} className="w-full justify-start" onClick={() => setActionFilter("unpost")} />
          </div>
        </div>

        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2">{t("User")}</h4>

          <select
            value={userFilter ?? ""}
            onChange={(e) => {
              setUserFilter(e.target.value ? Number(e.target.value) : null);
              setPage(1);
            }}
            className="w-full px-2 py-2 rounded bg-slate-800 text-white"
          >
            <option value="">{t("AllUsers")}</option>

            {users.map((u: any) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>,
    );
  }, [setSidebarContent, actionFilter, periodFrom, periodTo, userFilter, users, t]);

  const logs: AuditLog[] = data?.results ?? [];

  const columns: Column<AuditLog>[] = [
    {
      header: t("Time"),
      accessor: "timestamp",
      sortable: true,
      excelWidth: 22,
      render: (item) => new Date(item.timestamp).toLocaleString("ru-RU"),
    },
    {
      header: t("User"),
      accessor: "user_display",
      sortable: true,
      excelWidth: 25,
      render: (item) => item.user_display || t("System"),
    },
    {
      header: t("Action"),
      accessor: "action_display",
      sortable: true,
      excelWidth: 20,
    },
    {
      header: t("Object"),
      accessor: "model_name",
      sortable: true,
      excelWidth: 20,
    },
    {
      header: t("Record"),
      accessor: "object_repr",
      sortable: true,
      excelWidth: 35,
    },
    {
      header: t("IP"),
      accessor: "ip_address",
      sortable: true,
      excelWidth: 18,
      render: (item) => item.ip_address || "—",
    },
    {
      header: t("Changes"),
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

  const filteredLogs = useTableFilter(logs, {
    search: searchQuery,
    searchFields: ["object_repr", "model_name", "action_display", "user_display", "ip_address"],
  });

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText={t("ForbiddenAuditLog")}>
      <Table
        columns={columns}
        data={filteredLogs}
        tableId="audit_logs"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        // etot props dlya paginasii (dlya bach=kenda tolko)
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
          const res = await accountApi.getAuditLogs({
            page: 1,
            page_size: 10000,
            ...(userFilter && { user: userFilter }),
            ...(periodFrom && { date_from: periodFrom }),
            ...(periodTo && { date_to: periodTo }),
          });

          return res.results ?? [];
        }}
      />
    </RBACGuard>
  );
}
