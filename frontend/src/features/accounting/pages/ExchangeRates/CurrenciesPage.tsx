import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { accountApi } from "../../services/accountingApi";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { useSidebar } from "../../../../core/context/SidebarRightContext";
import { Table, type Column } from "../../../../components/ui/Table/Table";
import { Button } from "../../../../components/ui/Button";
import { Input } from "../../../../components/ui/Input";
import { Modal } from "../../../../components/ui/Modal/Modal";
import { ConfirmModal } from "../../../../components/ui/Modal/ConfirmModal";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { Plus } from "lucide-react";
import { useTableFilter } from "../../../../core/hooks/useTableFilter";
import { usePageHotkeys } from "../../../../core/hooks/usePageHotkeys";
import { useNotify } from "../../../../core/context/NotificationContext";

interface CurrencyForm {
  code: string;
  name: string;
  symbol: string;
  is_active: boolean;
}

const EMPTY: CurrencyForm = { code: "", name: "", symbol: "", is_active: true };

export default function CurrenciesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { setSidebarContent } = useSidebar();
  const { canView, canPost, canPut, canDelete } = usePageAccess("currency");
  const notify = useNotify();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<CurrencyForm>(EMPTY);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [highlightedId, setHighlightedId] = useState<number | null>(null);

  const {
    data: currencies = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["currencies"],
    queryFn: accountApi.getCurrencies,
    enabled: canView,
    retry: false,
  });

  useEffect(() => {
    if (editing) {
      setForm({
        code: editing.code,
        name: editing.name,
        symbol: editing.symbol,
        is_active: editing.is_active,
      });
    } else {
      setForm(EMPTY);
    }
  }, [editing]);

  const saveMutation = useMutation({
    mutationFn: (data: CurrencyForm) => (editing ? accountApi.saveCurrency(editing.id, data) : accountApi.saveCurrency(null, data)),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["currencies"] });
      notify("success", editing ? t("SuccessUpdated") : t("SuccessCreated"));
      setHighlightedId(res.data.id);
      setFormOpen(false);
      setEditing(null);
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", err.response?.data?.detail || t("ErrorSaving"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => accountApi.deleteCurrency(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["currencies"] });
      notify("success", t("SuccessDeleted"));
      setDeleteId(null);
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", t("ErrorDeleting"));
    },
  });

  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <h4 className="font-bold text-indigo-300">{t("Actions")}</h4>
        <Button
          disabled={!canPost}
          text={t("AddCurrency", "Добавить валюту")}
          className="w-full"
          dark
          icon={<Plus className="w-4 h-4" />}
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        />
        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2">{t("StatusFilter")}</h4>
          <div className="flex flex-col gap-1">
            {(["all", "active", "inactive"] as const).map((s) => (
              <Button
                key={s}
                variant="ghost"
                dark
                isActive={activeFilter === s}
                className="w-full justify-start"
                text={s === "all" ? t("All") : s === "active" ? t("OnlyActive") : t("OnlyInactive")}
                onClick={() => setActiveFilter(s)}
              />
            ))}
          </div>
        </div>
      </div>,
    );
  }, [setSidebarContent, canPost, t, activeFilter]);

  usePageHotkeys({
    canPost,
    onInsert: () => {
      setEditing(null);
      setForm(EMPTY);
      setFormOpen(true);
    },
  });

  const filtered = useTableFilter(currencies as any[], {
    search: searchQuery,
    searchFields: ["code", "name", "symbol"],
    filterKey: activeFilter,
    filters: [
      (item) => {
        if (activeFilter === "active") return item.is_active;
        if (activeFilter === "inactive") return !item.is_active;
        return true;
      },
    ],
  });

  const columns: Column<any>[] = [
    { header: t("Code", "Код"), accessor: "code", sortable: true, excelWidth: 8 },
    { header: t("Name"), accessor: "name", sortable: true, excelWidth: 25 },
    { header: t("Symbol", "Символ"), accessor: "symbol", sortable: true, excelWidth: 10 },
    {
      header: t("Status"),
      accessor: "is_active",
      sortable: true,
      excelWidth: 8,
      render: (item) => <StatusBadge isActive={item.is_active} activeLabel={t("Active")} inactiveLabel={t("Inactive")} />,
    },
    {
      header: t("Actions"),
      isActionColumn: true,
      hideInPrint: true,
      render: (item) => (
        <div className="flex gap-2">
          <Button
            disabled={!canPut}
            variant="1c"
            icon={<span>✏️</span>}
            className="md:h-6 md:w-8 md:!p-0"
            onClick={(e) => {
              e.stopPropagation();
              setEditing(item);
              setFormOpen(true);
            }}
          />
          <Button
            disabled={!canDelete}
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
        tableId="currencies_list"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRowDoubleClick={(item) => {
          setEditing(item);
          setFormOpen(true);
        }}
        selectedRowId={highlightedId}
        onHighlightConsumed={() => setHighlightedId(null)}
      />

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={editing ? t("Edit") : t("Add")} closeOnOutsideClick={false}>
        <div className="space-y-4">
          <Input label={t("Code", "Код (USD, EUR...)")} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
          <Input label={t("Name")} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Input label={t("Symbol", "Символ ($, €...)")} value={form.symbol} onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))} />
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4" />
            {t("IsActive")}
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button text={t("Cancel")} onClick={() => setFormOpen(false)} />
            <Button text={saveMutation.isPending ? t("Saving") : editing ? t("Save") : t("Create")} onClick={() => saveMutation.mutate(form)} variant="danger" />
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={deleteModal}
        type="delete"
        title={`DELETE - ${t("Delete")}`}
        message={t("Delete")}
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
}
