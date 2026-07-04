// frontend/src/features/accounting/pages/Products/BrandsPage.tsx
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { brandApi } from "../../services/productApi";
import { useNotify } from "../../../../core/context/NotificationContext";
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
import { useTranslation } from "react-i18next";
import { slugify } from "../../../../core/utils/slugify";
import { useTableFilter } from "../../../../core/hooks/useTableFilter";
import type { Brand } from "../../../../core/types";
import { usePageHotkeys } from "../../../../core/hooks/usePageHotkeys";

interface BrandForm {
  name: string;
  slug: string;
  is_active: boolean;
}

const EMPTY: BrandForm = { name: "", slug: "", is_active: true };

const BrandsPage = () => {
  const { t } = useTranslation();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { setSidebarContent } = useSidebar();
  const { canView, canPost, canPut, canDelete } = usePageAccess("brand");
  const [highlightedId, setHighlightedId] = useState<number | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<BrandForm>(EMPTY);
  const [slugEdited, setSlugEdited] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  

  const {
    data: brands = [],
    isLoading,
    error,
  } = useQuery<Brand[]>({
    queryKey: ["brands"],
    queryFn: brandApi.getAll,
    enabled: canView,
    retry: false,
  });

  useEffect(() => {
    if (editing) {
      setForm({ name: editing.name, slug: editing.slug, is_active: editing.is_active });
      setSlugEdited(true);
    } else {
      setForm(EMPTY);
      setSlugEdited(false);
    }
  }, [editing]);

  const saveMutation = useMutation({
    mutationFn: (data: BrandForm) => brandApi.save(editing?.id ?? null, data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["brands"] });
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
    mutationFn: (id: number) => brandApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brands"] });
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
          text={t("AddBrand")}
          className="w-full"
          dark={true}
          icon={<Plus className="w-4 h-4" />}
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        />

        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2">{t("StatusFilter")}</h4>

          <div className="flex flex-col gap-1">
            {(["all", "active", "inactive"] as const).map((status) => (
              <Button
                key={status}
                variant="ghost"
                dark={true}
                isActive={activeFilter === status}
                className="w-full justify-start"
                text={status === "all" ? t("AllBrands") : status === "active" ? t("OnlyActive") : t("OnlyInactive")}
                icon={status !== "all" ? <span className={`w-2 h-2 rounded-full ${status === "active" ? "bg-green-500" : "bg-red-500"}`} /> : undefined}
                onClick={() => setActiveFilter(status)}
              />
            ))}
          </div>
        </div>
      </div>,
    );
  }, [setSidebarContent, canPost, t, activeFilter]);

  const filtered = useTableFilter(brands, {
    search: searchQuery,
    searchFields: ["id", "name", "slug"],
    filterKey: activeFilter,
    filters: [
      (item) => {
        if (activeFilter === "active") return item.is_active;
        if (activeFilter === "inactive") return !item.is_active;
        return true;
      },
    ],
  });

  usePageHotkeys({
    canPost,
    onInsert: () => {
      setEditing(null);
      setForm(EMPTY);
      setFormOpen(true);
    },
  });

  const columns: Column<any>[] = [
    { header: t("ID"), accessor: "id", sortable: true, excelWidth: 5 },
    { header: t("Name"), accessor: "name", sortable: true, excelWidth: 25 },
    { header: t("Slug"), accessor: "slug", sortable: true, excelWidth: 20 },
    {
      header: t("Status"),
      accessor: "is_active",
      sortable: true,
      excelWidth: 8,
      sortValue: (item) => (item.is_active ? 1 : 0),
      excelValue: (item) => (item.is_active ? "+" : ""),
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

  const toDelete = brands.find((b: any) => b.id === deleteId);

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText={t("ForbiddenText")}>
      <Table
        columns={columns}
        data={filtered}
        tableId="brands_list"
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
          <Input
            label={t("Name")}
            value={form.name}
            onChange={(e) => {
              const value = e.target.value;
              setForm((p) => ({ ...p, name: value, slug: slugEdited ? p.slug : slugify(value) }));
            }}
          />
          <Input
            label={t("Slug")}
            value={form.slug}
            onChange={(e) => {
              setForm((p) => ({ ...p, slug: e.target.value }));
              setSlugEdited(true);
            }}
          />
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            {t("IsActive")}
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button text={t("Cancel")} variant="secondary" onClick={() => setFormOpen(false)} />
            <Button text={saveMutation.isPending ? t("Saving") : editing ? t("Save") : t("Create")} onClick={() => saveMutation.mutate(form)} />
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={deleteModal}
        type="delete"
        title={`DELETE - ${t("Delete")}`}
        message={t("Delete", { name: toDelete?.name })}
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

export default BrandsPage;
