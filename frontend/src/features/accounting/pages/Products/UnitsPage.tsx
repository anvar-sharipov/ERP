// frontend/src/features/accounting/pages/Products/UnitsPage.tsx
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { unitApi } from "../../services/productApi";
import { useNotify } from "../../../../core/context/NotificationContext";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { useSidebar } from "../../../../core/context/SidebarRightContext";
import { Table, type Column } from "../../../../components/ui/Table/Table";
import { Button } from "../../../../components/ui/Button";
import { Input } from "../../../../components/ui/Input";
import { Modal } from "../../../../components/ui/Modal/Modal";
import { ConfirmModal } from "../../../../components/ui/Modal/ConfirmModal";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type Unit } from "../../../../core/types";
import { useTableFilter } from "../../../../core/hooks/useTableFilter";

interface UnitForm {
  name: string;
  short_name: string;
}

const EMPTY: UnitForm = { name: "", short_name: "" };

const UnitsPage = () => {
  const { t } = useTranslation();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { setSidebarContent } = useSidebar();
  const { canView, canPost, canPut, canDelete } = usePageAccess("unit");

  // select edited/created row after edit/create
  const [highlightedId, setHighlightedId] = useState<number | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<UnitForm>(EMPTY);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const {
    data: units = [],
    isLoading,
    error,
  } = useQuery<Unit[]>({
    queryKey: ["units"],
    queryFn: unitApi.getAll,
    enabled: canView,
    retry: false,
  });

  useEffect(() => {
    if (editing) {
      setForm({ name: editing.name, short_name: editing.short_name });
    } else {
      setForm(EMPTY);
    }
  }, [editing]);

  const saveMutation = useMutation({
    mutationFn: (data: UnitForm) => unitApi.save(editing?.id ?? null, data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["units"] });
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
    mutationFn: (id: number) => unitApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["units"] });
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
          text={t("AddUnit")}
          className="w-full"
          dark={true}
          icon={<Plus className="w-4 h-4" />}
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        />
      </div>,
    );
  }, [setSidebarContent, canPost, t]);

  const columns: Column<any>[] = [
    { header: t("ID"), accessor: "id", sortable: true, excelWidth: 5 },
    { header: t("Name"), accessor: "name", sortable: true, excelWidth: 25 },
    { header: t("ShortName"), accessor: "short_name", sortable: true, excelWidth: 15 },
    {
      header: t("Actions"),
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

  const toDelete = units.find((u: any) => u.id === deleteId);

  const filtered = useTableFilter(units, {
    search: searchQuery,
    searchFields: ["id", "name", "short_name"],
  });

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText={t("ForbiddenText")}>
      <Table
        columns={columns}
        data={filtered}
        tableId="units_list"
        searchQuery={searchQuery}
        selectedRowId={highlightedId}
        onSearchChange={setSearchQuery}
        onRowDoubleClick={(item) => {
          setEditing(item);
          setFormOpen(true);
        }}
        onHighlightConsumed={() => setHighlightedId(null)}
      />

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={editing ? t("Edit") : t("AddUnit")} closeOnOutsideClick={false}>
        <div className="space-y-4">
          <Input label={t("Name")} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          <Input label={t("ShortName")} value={form.short_name} placeholder="шт, кг, л" onChange={(e) => setForm((p) => ({ ...p, short_name: e.target.value }))} />
          <div className="flex justify-end gap-2 pt-2">
            <Button text={t("Cancel")} onClick={() => setFormOpen(false)} />
            <Button text={saveMutation.isPending ? t("Saving") : editing ? t("Save") : t("Create")} onClick={() => saveMutation.mutate(form)} />
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={deleteModal}
        type="delete"
        title={t("Delete")}
        message={t("DeleteUnitMessage", { name: toDelete?.name })}
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

export default UnitsPage;
