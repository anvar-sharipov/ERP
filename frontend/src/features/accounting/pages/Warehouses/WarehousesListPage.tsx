// frontend/src/features/accounting/pages/Warehouses/WarehousesListPage.tsx
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { warehouseApi } from "../../services/productApi";
import { useNotify } from "../../../../core/context/NotificationContext";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { useSidebar } from "../../../../core/context/SidebarRightContext";
import { Table, type Column } from "../../../../components/ui/Table/Table";
import { Button } from "../../../../components/ui/Button";
import { Input } from "../../../../components/ui/Input";
import { TextArea } from "../../../../components/ui/TextArea";
import { Modal } from "../../../../components/ui/Modal/Modal";
import { ConfirmModal } from "../../../../components/ui/Modal/ConfirmModal";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { branchApi } from "../../services/branchApi";

interface WarehouseForm {
  name: string;
  branch: number | null;
  address: string;
  is_active: boolean;
  is_main: boolean;
}

const EMPTY: WarehouseForm = {
  name: "", branch: null, address: "", is_active: true, is_main: false,
};

const WarehousesListPage = () => {
  const { t } = useTranslation();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { setSidebarContent } = useSidebar();
  const { canView, canPost, canPut, canDelete } = usePageAccess("warehouse");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<WarehouseForm>(EMPTY);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: warehouses = [], isLoading, error } = useQuery({
    queryKey: ["warehouses"],
    queryFn: warehouseApi.getAll,
    enabled: canView,
    retry: false,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ["branches"],
    queryFn: branchApi.getBranches,
  });

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        branch: editing.branch ?? null,
        address: editing.address ?? "",
        is_active: editing.is_active,
        is_main: editing.is_main,
      });
    } else {
      setForm(EMPTY);
    }
  }, [editing]);

  const saveMutation = useMutation({
    mutationFn: (data: WarehouseForm) => warehouseApi.save(editing?.id ?? null, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      notify("success", editing ? t("SuccessUpdated") : t("SuccessCreated"));
      setFormOpen(false);
      setEditing(null);
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", err.response?.data?.detail || t("ErrorSaving"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => warehouseApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
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
        <h4 className="font-bold text-indigo-300 mb-2">{t("Actions")}</h4>
        <Button disabled={!canPost} text={t("Add")} className="w-full" dark={true}
          icon={<Plus className="w-4 h-4" />}
          onClick={() => { setEditing(null); setFormOpen(true); }} />
      </div>,
    );
  }, [setSidebarContent, canPost, t]);

  const columns: Column<any>[] = [
    { header: t("ID"), accessor: "id", sortable: true, excelWidth: 5 },
    {
      header: t("Name"), sortable: true, excelWidth: 25,
      render: (item) => (
        <span className="flex items-center gap-2">
          {item.is_main && <span className="text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 px-1.5 py-0.5 rounded font-medium">Главный</span>}
          {item.name}
        </span>
      ),
      sortValue: (item) => item.name,
      excelValue: (item) => item.name,
    },
    {
      header: "Филиал", sortable: true, excelWidth: 20,
      render: (item) => <span className="text-gray-500 text-sm">{item.branch_name ?? "—"}</span>,
      sortValue: (item) => item.branch_name ?? "",
      excelValue: (item) => item.branch_name ?? "—",
    },
    { header: "Адрес", accessor: "address", sortable: true, excelWidth: 25 },
    {
      header: t("Status"), accessor: "is_active", sortable: true, excelWidth: 8,
      sortValue: (item) => (item.is_active ? 1 : 0),
      excelValue: (item) => (item.is_active ? "+" : ""),
      render: (item) => <StatusBadge isActive={item.is_active} activeLabel={t("Active")} inactiveLabel={t("Inactive")} />,
    },
    {
      header: t("Actions"), hideInPrint: true,
      render: (item) => (
        <div className="flex gap-2">
          <Button disabled={!canPut} variant="1c" icon={<span>✏️</span>} className="md:h-6 md:w-8 md:!p-0"
            onClick={(e) => { e.stopPropagation(); setEditing(item); setFormOpen(true); }} />
          <Button disabled={!canDelete} variant="1c" icon={<span>🗑️</span>} className="md:h-6 md:w-8 md:!p-0"
            onClick={(e) => { e.stopPropagation(); setDeleteId(item.id); setDeleteModal(true); }} />
        </div>
      ),
    },
  ];

  const toDelete = (warehouses as any[]).find((w) => w.id === deleteId);

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText={t("ForbiddenText")}>
      <Table columns={columns} data={warehouses} tableId="warehouses_list"
        searchQuery={searchQuery} onSearchChange={setSearchQuery}
        onRowDoubleClick={(item) => { setEditing(item); setFormOpen(true); }} />

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)}
        title={editing ? t("Edit") : t("Add")} closeOnOutsideClick={false}>
        <div className="space-y-4">
          <Input label={t("Name")} value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Филиал</label>
            <select value={form.branch ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, branch: e.target.value ? Number(e.target.value) : null }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">— без филиала —</option>
              {(branches as any[]).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <TextArea label="Адрес" rows={2} value={form.address}
            onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />

          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
            <input type="checkbox" checked={form.is_main}
              onChange={(e) => setForm((p) => ({ ...p, is_main: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300 text-yellow-500 focus:ring-yellow-400" />
            Главный склад
          </label>

          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
            <input type="checkbox" checked={form.is_active}
              onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
            {t("IsActive")}
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button text={t("Cancel")} onClick={() => setFormOpen(false)} />
            <Button text={saveMutation.isPending ? t("Saving") : editing ? t("Save") : t("Create")}
              onClick={() => saveMutation.mutate(form)} />
          </div>
        </div>
      </Modal>

      <ConfirmModal isOpen={deleteModal} type="delete" title={t("Delete")}
        message={t("DeleteWarehouseMessage", { name: toDelete?.name })}
        onClose={() => setDeleteModal(false)}
        onConfirm={() => { if (deleteId) { deleteMutation.mutate(deleteId); setDeleteModal(false); } }} />
    </RBACGuard>
  );
};

export default WarehousesListPage;