// frontend/src/features/accounting/pages/Products/CategoriesPage.tsx
import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { productCategoryApi } from "../../services/productApi";
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
import { Plus, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { slugify } from "../../../../core/utils/slugify";
import CategoryTree, { getDescendantIds, getBreadcrumb, getNodeLevel } from "../../../../components/ui/Category/CategotyTree/TreeFilter/CategoryTree";
import type { TreeNode } from "../../../../components/ui/Category/CategotyTree/types";
import CategoryTreeView from "../../../../components/ui/Category/CategotyTree/TreeManager/CategoryTreeView";
import { filterTreeItems } from "../../../../components/ui/Category/CategotyTree/TreeManager/filterTreeItems";
import CategoryTreeSelect from "../../../../components/ui/Category/CategotyTree/TreeSelect/CategoryTreeSelect";
import { SegmentedControl } from "../../../../components/ui/Tabs/SegmentedControl";
import { usePageHotkeys } from "../../../../core/hooks/usePageHotkeys";

interface CategoryForm {
  name: string;
  slug: string;
  parent: number | null;
  is_active: boolean;
}

const EMPTY: CategoryForm = { name: "", slug: "", parent: null, is_active: true };

const CategoriesPage = () => {
  const { t } = useTranslation();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { setSidebarContent } = useSidebar();
  const { canView, canPost, canPut, canDelete } = usePageAccess("productcategory");
  const [highlightedId, setHighlightedId] = useState<number | null>(null);

  const [viewMode, setViewMode] = useState<"table" | "tree">("table");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<CategoryForm>(EMPTY);
  const [slugEdited, setSlugEdited] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [parentFilter, setParentFilter] = useState<number | "all">("all");

  const {
    data: categories = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["product-categories"],
    queryFn: productCategoryApi.getAll,
    enabled: canView,
    retry: false,
  });

  const treeItems = useMemo(() => {
    return filterTreeItems(categories, searchQuery);
  }, [categories, searchQuery]);

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        slug: editing.slug,
        parent: editing.parent ?? null,
        is_active: editing.is_active,
      });
      setSlugEdited(true);
    } else {
      setForm(EMPTY);
      setSlugEdited(false);
    }
  }, [editing]);

  const saveMutation = useMutation({
    mutationFn: (data: CategoryForm) => productCategoryApi.save(editing?.id ?? null, data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["product-categories"] });
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

  const moveMutation = useMutation({
    mutationFn: ({ id, parent }: { id: number; parent: number | null }) => productCategoryApi.move(id, parent),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-categories"] });
      notify("success", t("SuccessMoved"));
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", t("ErrorSaving"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => productCategoryApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-categories"] });
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
        <div>
          <h4 className="font-bold text-indigo-300 mb-2">{t("Actions")}</h4>
          <Button
            disabled={!canPost}
            text={t("AddCategory")}
            className="w-full"
            dark={true}
            icon={<Plus className="w-4 h-4" />}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          />
        </div>

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
                text={status === "all" ? t("AllCategories") : status === "active" ? t("OnlyActive") : t("OnlyInactive")}
                icon={status !== "all" ? <span className={`w-2 h-2 rounded-full ${status === "active" ? "bg-green-500" : "bg-red-500"}`} /> : undefined}
                onClick={() => setActiveFilter(status)}
              />
            ))}
          </div>
        </div>

        {viewMode === "table" && (
          <div className="pt-4 border-t border-indigo-900/30">
            <h4 className="font-bold text-indigo-300 mb-2">{t("Categories")}</h4>
            <CategoryTree items={categories as TreeNode[]} selectedId={parentFilter} onSelect={setParentFilter} allLabel={t("AllCategories")} showSearch={true} showInactive={true} />
          </div>
        )}
      </div>,
    );
  }, [setSidebarContent, canPost, activeFilter, parentFilter, categories, t, viewMode]);

  const filtered = useMemo(() => {
    let result = categories as any[];
    if (activeFilter === "active") result = result.filter((c) => c.is_active);
    if (activeFilter === "inactive") result = result.filter((c) => !c.is_active);
    if (parentFilter !== "all") {
      const ids = getDescendantIds(parentFilter, categories as TreeNode[]);
      result = result.filter((c) => ids.includes(c.id));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((c) => c.name?.toLowerCase().includes(q) || c.slug?.toLowerCase().includes(q));
    }
    return result;
  }, [categories, activeFilter, parentFilter, searchQuery]);

  // в форме исключаем саму себя и всех потомков
  const parentOptions = useMemo(() => {
    if (!editing) return categories as TreeNode[];
    const descendantIds = getDescendantIds(editing.id, categories as TreeNode[]);
    return (categories as TreeNode[]).filter((c) => !descendantIds.includes(c.id));
  }, [categories, editing]);

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
    {
      header: t("Name"),
      sortable: true,
      excelWidth: 20,
      sortValue: (item) => item.name,
      excelValue: (item) => item.name,
      render: (item) => <span className="font-medium">{item.name}</span>,
    },
    {
      header: t("Nesting"),
      sortable: true,
      excelWidth: 35,
      sortValue: (item) => getBreadcrumb(item, categories as TreeNode[]),
      excelValue: (item) => getBreadcrumb(item, categories as TreeNode[]),
      render: (item) => {
        const level = getNodeLevel(item, categories as TreeNode[]);
        if (level === 0) return <span className="text-gray-400 text-xs">— корневая —</span>;
        const parts = getBreadcrumb(item, categories as TreeNode[]).split(" > ");
        return (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {parts.slice(0, -1).map((part, i) => (
              <span key={i}>
                <span className="text-gray-400">{part}</span>
                <span className="mx-1 text-gray-300 dark:text-gray-600">›</span>
              </span>
            ))}
            <span className="text-gray-700 dark:text-gray-200 font-medium">{parts[parts.length - 1]}</span>
          </span>
        );
      },
    },
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
            title={`F2 - ${t("Edit")}`}
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
            title={`DELETE - ${t("Delete")}`}
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

  const toDelete = (categories as any[]).find((c) => c.id === deleteId);

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText={t("ForbiddenText")}>
      <SegmentedControl
        className="mb-2"
        options={[
          { value: "table", label: t("Table") },
          { value: "tree", label: t("Tree") },
        ]}
        value={viewMode}
        onChange={(val) => setViewMode(val as "table" | "tree")}
      />

      {viewMode === "tree" && (
        <div className="mb-4">
          <Input placeholder={t("Search")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} leftIcon={<Search size={18} />} />
        </div>
      )}

      {viewMode === "table" ? (
        <Table
          columns={columns}
          data={filtered}
          tableId="categories_list"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onRowDoubleClick={(item) => {
            setEditing(item);
            setFormOpen(true);
          }}
          selectedRowId={highlightedId}
          onHighlightConsumed={() => setHighlightedId(null)}
        />
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
          <CategoryTreeView
            items={treeItems}
            onEdit={(item) => {
              setEditing(item);
              setFormOpen(true);
            }}
            onDelete={(item) => {
              setDeleteId(item.id);
              setDeleteModal(true);
            }}
            onMove={(draggedId, targetId) => moveMutation.mutate({ id: draggedId, parent: targetId })}
          />
        </div>
      )}

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

          <CategoryTreeSelect
            items={parentOptions}
            value={form.parent}
            onChange={(id) =>
              setForm((p) => ({
                ...p,
                parent: id,
              }))
            }
          />

          <label className="flex items-center gap-2 font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
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
        message={t("DeleteCategoryMessage", { name: toDelete?.name })}
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

export default CategoriesPage;
