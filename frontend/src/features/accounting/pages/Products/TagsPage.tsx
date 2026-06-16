// frontend/src/features/accounting/pages/Products/TagsPage.tsx
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { tagApi } from "../../services/productApi";
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
import { slugify } from "../../../../core/utils/slugify";

interface TagForm {
  name: string;
  slug: string;
}

const EMPTY: TagForm = { name: "", slug: "" };

const TagsPage = () => {
  const { t } = useTranslation();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { setSidebarContent } = useSidebar();
  const { canView, canPost, canPut, canDelete } = usePageAccess("tag");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<TagForm>(EMPTY);
  const [slugEdited, setSlugEdited] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: tags = [], isLoading, error } = useQuery({
    queryKey: ["tags"],
    queryFn: tagApi.getAll,
    enabled: canView,
    retry: false,
  });

  useEffect(() => {
    if (editing) {
      setForm({ name: editing.name, slug: editing.slug });
      setSlugEdited(true);
    } else {
      setForm(EMPTY);
      setSlugEdited(false);
    }
  }, [editing]);

  const saveMutation = useMutation({
    mutationFn: (data: TagForm) => tagApi.save(editing?.id ?? null, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
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
    mutationFn: (id: number) => tagApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
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
        <Button disabled={!canPost} text={t("Add")} className="w-full" dark={true}
          icon={<Plus className="w-4 h-4" />}
          onClick={() => { setEditing(null); setFormOpen(true); }} />
      </div>,
    );
  }, [setSidebarContent, canPost, t]);

  const columns: Column<any>[] = [
    { header: t("ID"), accessor: "id", sortable: true, excelWidth: 5 },
    { header: t("Name"), accessor: "name", sortable: true, excelWidth: 25 },
    { header: t("Slug"), accessor: "slug", sortable: true, excelWidth: 20 },
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

  const toDelete = tags.find((tg: any) => tg.id === deleteId);

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText={t("ForbiddenText")}>
      <Table columns={columns} data={tags} tableId="tags_list"
        searchQuery={searchQuery} onSearchChange={setSearchQuery}
        onRowDoubleClick={(item) => { setEditing(item); setFormOpen(true); }} />

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)}
        title={editing ? t("Edit") : t("Add")} closeOnOutsideClick={false}>
        <div className="space-y-4">
          <Input label={t("Name")} value={form.name}
            onChange={(e) => {
              const value = e.target.value;
              setForm((p) => ({ ...p, name: value, slug: slugEdited ? p.slug : slugify(value) }));
            }} />
          <Input label={t("Slug")} value={form.slug}
            onChange={(e) => { setForm((p) => ({ ...p, slug: e.target.value })); setSlugEdited(true); }} />
          <div className="flex justify-end gap-2 pt-2">
            <Button text={t("Cancel")} onClick={() => setFormOpen(false)} />
            <Button text={saveMutation.isPending ? t("Saving") : editing ? t("Save") : t("Create")}
              onClick={() => saveMutation.mutate(form)} />
          </div>
        </div>
      </Modal>

      <ConfirmModal isOpen={deleteModal} type="delete" title={t("DeleteTitle")}
        message={t("DeleteMessage", { name: toDelete?.name })}
        onClose={() => setDeleteModal(false)}
        onConfirm={() => { if (deleteId) { deleteMutation.mutate(deleteId); setDeleteModal(false); } }} />
    </RBACGuard>
  );
};

export default TagsPage;