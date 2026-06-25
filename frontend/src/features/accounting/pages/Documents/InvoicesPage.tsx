// frontend/src/features/accounting/pages/Documents/InvoicesPage.tsx
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";

import { documentApi } from "../../services/documentApi";
import { useNotify } from "../../../../core/context/NotificationContext";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { useSidebar } from "../../../../core/context/SidebarRightContext";
import { usePageHotkeys } from "../../../../core/hooks/usePageHotkeys";
import { useTableFilter } from "../../../../core/hooks/useTableFilter";

import { Table, type Column } from "../../../../components/ui/Table/Table";
import { Button } from "../../../../components/ui/Button";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { ConfirmModal } from "../../../../components/ui/Modal/ConfirmModal";

import type { DocumentList } from "../../../../core/types";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "../../../../core/router/routes";
import { useDateStore } from "../../../../core/store/dateStore";

// Приходная = "in", Расходная = "out"
// Эта страница показывает оба типа (накладные)
const INVOICE_TYPES = ["in", "out", "move", "return_in", "return_out"];

const InvoicesPage = () => {
  const { t } = useTranslation();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { setSidebarContent } = useSidebar();
  const { canView, canPost, canDelete } = usePageAccess("document");

  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "in" | "out" | "move" | "return_in" | "return_out">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "posted">("all");
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const navigate = useNavigate();
  const { workWarehouse, workBranch } = useDateStore();

  const {
    data: invoices = [],
    isLoading,
    error,
  } = useQuery<DocumentList[]>({
    queryKey: ["documents", "invoices", workWarehouse?.id, workBranch?.id],
    queryFn: async () => {
      const data = await documentApi.getAll({
        document_type__in: INVOICE_TYPES.join(","),
        // Фильтр по складу если выбран
        ...(workWarehouse?.id ? { warehouse: String(workWarehouse.id) } : {}),
        // Фильтр по филиалу если выбран (и склад не выбран)
        ...(workBranch?.id && !workWarehouse?.id ? { branch: String(workBranch.id) } : {}),
      });
      return Array.isArray(data) ? data : (data.results ?? []);
    },
    enabled: canView,
    retry: false,
  });

  const postMutation = useMutation({
    mutationFn: (id: number) => documentApi.post(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      notify("success", t("DocumentPosted"));
      setHighlightedId(id);
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", err.response?.data?.detail || t("ErrorPosting"));
    },
  });

  const unpostMutation = useMutation({
    mutationFn: (id: number) => documentApi.unpost(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      notify("success", t("DocumentUnposted"));
      setHighlightedId(id);
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", err.response?.data?.detail || t("ErrorUnposting"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => documentApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      notify("success", t("SuccessDeleted"));
      setDeleteId(null);
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", err.response?.data?.detail || t("ErrorDeleting"));
    },
  });

  usePageHotkeys({
    canPost,
    onInsert: () => navigate(ROUTES.APP.DOCUMENTS_CREATE),
  });

  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <h4 className="font-bold text-indigo-300">{t("Actions")}</h4>
        <Button
          //   disabled={!canPost}
          text={t("AddInvoice")}
          className="w-full"
          dark={true}
          icon={<Plus className="w-4 h-4" />}
          //   onClick={() => {
          //     <Button text={t("Add")} className="w-full" dark={true} icon={<Plus className="w-4 h-4" />} onClick={() => navigate(ROUTES.APP.DOCUMENTS_CREATE)} />
          //   }}
          onClick={() => navigate(ROUTES.APP.DOCUMENTS_CREATE)}
        />

        {/* Фильтр по типу */}
        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2">{t("Type")}</h4>
          <div className="flex flex-col gap-1">
            {(["all", "in", "out", "move", "return_in", "return_out"] as const).map((type) => (
              <Button
                key={type}
                variant="ghost"
                dark={true}
                isActive={typeFilter === type}
                className="w-full justify-start"
                text={type === "all" ? t("All") : type === "in" ? t("Incoming") : type === "out" ? t("Outgoing") : type === "move" ? t("Move") : type === "return_in" ? t("ReturnIn") : t("ReturnOut")}
                onClick={() => setTypeFilter(type)}
              />
            ))}
          </div>
        </div>

        {/* Фильтр по статусу */}
        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2">{t("Status")}</h4>
          <div className="flex flex-col gap-1">
            {(["all", "draft", "posted"] as const).map((s) => (
              <Button
                key={s}
                variant="ghost"
                dark={true}
                isActive={statusFilter === s}
                className="w-full justify-start"
                text={s === "all" ? t("AllStatuses") : s === "draft" ? t("Draft") : t("Posted")}
                onClick={() => setStatusFilter(s)}
              />
            ))}
          </div>
        </div>
      </div>,
    );
  }, [setSidebarContent, canPost, t, typeFilter, statusFilter]);

  const filtered = useTableFilter(invoices, {
    search: searchQuery,
    searchFields: ["number", "counterparty_detail.name"],
    filterKey: `${typeFilter}_${statusFilter}`,
    filters: [
      (item) => {
        if (typeFilter !== "all" && item.document_type !== typeFilter) return false;
        if (statusFilter !== "all" && item.status !== statusFilter) return false;
        return true;
      },
    ],
  });

  const toDelete = invoices.find((d) => d.id === deleteId);

  const columns: Column<DocumentList>[] = [
    { header: "№", accessor: "number", sortable: true, excelWidth: 14 },
    {
      header: t("Type"),
      accessor: "document_type_display",
      sortable: true,
      excelWidth: 20,
    },
    { header: t("Date"), accessor: "date", sortable: true, excelWidth: 12 },
    {
      header: t("Counterparty"),
      accessor: "counterparty_detail",
      sortable: true,
      excelWidth: 25,
      sortValue: (item) => item.counterparty_detail?.name ?? "",
      render: (item) => item.counterparty_detail?.name ?? "—",
    },
    {
      header: t("Warehouse"),
      accessor: "warehouse_detail",
      sortable: true,
      excelWidth: 20,
      sortValue: (item) => item.warehouse_detail?.name ?? "",
      render: (item) => item.warehouse_detail?.name ?? "—",
    },
    {
      header: t("Total"),
      accessor: "total",
      sortable: true,
      excelWidth: 14,
      render: (item) => (
        <span className="font-mono">
          {Number(item.total).toLocaleString("ru-RU", {
            minimumFractionDigits: 2,
          })}
        </span>
      ),
    },
    {
      header: t("Status"),
      accessor: "status",
      sortable: true,
      excelWidth: 10,
      sortValue: (item) => item.status,
      excelValue: (item) => item.status_display,
      render: (item) => <StatusBadge isActive={item.status === "posted"} activeLabel={t("Posted")} inactiveLabel={t("Draft")} />,
    },
    {
      header: t("Actions"),
      isActionColumn: true,
      hideInPrint: true,
      render: (item) => (
        <div className="flex gap-1">
          {/* Провести / Распровести */}
          {item.status === "draft" ? (
            <Button
              disabled={!canPost}
              variant="1c"
              icon={<span>✅</span>}
              className="md:h-6 md:px-2 md:!py-0 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                postMutation.mutate(item.id);
              }}
            />
          ) : (
            <Button
              disabled={!canPost}
              variant="1c"
              icon={<span>↩️</span>}
              className="md:h-6 md:px-2 md:!py-0 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                unpostMutation.mutate(item.id);
              }}
            />
          )}
          {/* Удалить */}
          <Button
            disabled={!canDelete || item.status === "posted"}
            variant="1c"
            icon={<span>🗑️</span>}
            className="md:h-6 md:w-8 md:!p-0"
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

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText={t("ForbiddenText")}>
      <Table
        columns={columns}
        data={filtered}
        tableId="invoices_list"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRowDoubleClick={(item) => {
          navigate(ROUTES.APP.DOCUMENTS_EDIT.replace(":id", String(item.id)));
        }}
        selectedRowId={highlightedId}
        onHighlightConsumed={() => setHighlightedId(null)}
      />

      <ConfirmModal
        isOpen={deleteModal}
        type="delete"
        title={`DELETE — ${t("Delete")}`}
        message={t("DeleteDocument", { number: toDelete?.number })}
        onClose={() => setDeleteModal(false)}
        onConfirm={() => {
          if (deleteId) {
            deleteMutation.mutate(deleteId);
            setDeleteModal(false);
          }
        }}
      />
    </RBACGuard>
  );
};

export default InvoicesPage;
