// frontend/src/features/accounting/pages/Products/ProductsListPage.tsx
import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { productApi, productCategoryApi } from "../../services/productApi";
import { useNotify } from "../../../../core/context/NotificationContext";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { useSidebar } from "../../../../core/context/SidebarRightContext";
import { Table, type Column } from "../../../../components/ui/Table/Table";
import { Button } from "../../../../components/ui/Button";
import { ConfirmModal } from "../../../../components/ui/Modal/ConfirmModal";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "../../../../core/router/routes";

// ── Основная страница ─────────────────────────────────────────────────────────
const ProductsListPage = () => {
  const { t } = useTranslation();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { setSidebarContent } = useSidebar();
  const { canView, canPost, canPut, canDelete } = usePageAccess("product");
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const navigate = useNavigate();

  // const [formOpen, setFormOpen] = useState(false);
  // const [editing, setEditing] = useState<any | null>(null);
  // const [form, setForm] = useState<ProductForm>(EMPTY);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");

  // ── запросы ─────────────────────────────────────────────────────────────────

  const {
    data: products = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["products"],
    queryFn: productApi.getAll,
    enabled: canView,
    retry: false,
  });

  const { data: categories = [] } = useQuery({ queryKey: ["product-categories"], queryFn: productCategoryApi.getAll });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => productApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      notify("success", t("SuccessDeleted"));
      setDeleteId(null);
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", t("ErrorDeleting"));
    },
  });

  // ── сайдбар ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <div>
          <h4 className="font-bold text-indigo-300 mb-2">{t("Actions")}</h4>
          <Button disabled={!canPost} text={t("Add")} className="w-full" dark={true} icon={<Plus className="w-4 h-4" />} onClick={() => navigate(ROUTES.APP.PRODUCTS_CREATE)} />
        </div>
        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2">{t("StatusFilter")}</h4>
          <div className="flex flex-col gap-1">
            {(["all", "active", "inactive"] as const).map((s) => (
              <Button
                key={s}
                variant="ghost"
                dark={true}
                isActive={activeFilter === s}
                className="w-full justify-start"
                text={s === "all" ? t("AllDirectories") : s === "active" ? t("OnlyActive") : t("OnlyInactive")}
                onClick={() => setActiveFilter(s)}
              />
            ))}
          </div>
        </div>
        {categories.length > 0 && (
          <div className="pt-4 border-t border-indigo-900/30">
            <h4 className="font-bold text-indigo-300 mb-2">Категория</h4>
            <div className="flex flex-col gap-1">
              <Button text="Все" variant="ghost" dark={true} isActive={categoryFilter === null} className="w-full justify-start" onClick={() => setCategoryFilter(null)} />
              {(categories as any[]).map((c) => (
                <Button key={c.id} text={c.name} variant="ghost" dark={true} isActive={categoryFilter === c.id} className="w-full justify-start" onClick={() => setCategoryFilter(c.id)} />
              ))}
            </div>
          </div>
        )}
      </div>,
    );
  }, [setSidebarContent, canPost, activeFilter, categoryFilter, categories, t]);

  // ── фильтрация ───────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let result = products as any[];
    if (activeFilter === "active") result = result.filter((p) => p.is_active);
    if (activeFilter === "inactive") result = result.filter((p) => !p.is_active);
    if (categoryFilter !== null) result = result.filter((p) => p.category === categoryFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((p) => p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.barcode?.toLowerCase().includes(q));
    }
    return result;
  }, [products, activeFilter, categoryFilter, searchQuery]);

  // ── колонки ──────────────────────────────────────────────────────────────────

  const columns: Column<any>[] = [
    { header: t("ID"), accessor: "id", sortable: true, excelWidth: 5 },
    { header: t("Name"), accessor: "name", sortable: true, excelWidth: 30 },
    { header: "Артикул", accessor: "sku", sortable: true, excelWidth: 15 },
    {
      header: "Категория",
      sortable: true,
      excelWidth: 18,
      sortValue: (item) => item.category_detail?.name ?? "",
      render: (item) => <span className="text-sm text-gray-500">{item.category_detail?.name ?? "—"}</span>,
      excelValue: (item) => item.category_detail?.name ?? "—",
    },
    {
      header: "Бренд",
      sortable: true,
      excelWidth: 15,
      sortValue: (item) => item.brand_detail?.name ?? "",
      render: (item) => <span className="text-sm text-gray-500">{item.brand_detail?.name ?? "—"}</span>,
      excelValue: (item) => item.brand_detail?.name ?? "—",
    },
    {
      header: "Ед.изм",
      sortable: true,
      excelWidth: 8,
      sortValue: (item) => item.unit_detail?.short_name ?? "",
      render: (item) => <span className="text-sm">{item.unit_detail?.short_name ?? "—"}</span>,
      excelValue: (item) => item.unit_detail?.short_name ?? "—",
    },
    {
      header: "Цена розн.",
      sortable: true,
      excelWidth: 12,
      sortValue: (item) => Number(item.price_retail),
      render: (item) => <span className="font-medium">{Number(item.price_retail).toLocaleString()}</span>,
      excelValue: (item) => item.price_retail,
    },
    {
      header: "Цена опт",
      sortable: true,
      excelWidth: 12,
      sortValue: (item) => Number(item.price_wholesale),
      render: (item) => <span>{Number(item.price_wholesale).toLocaleString()}</span>,
      excelValue: (item) => item.price_wholesale,
    },
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
      hideInPrint: true,
      isActionColumn: true,
      render: (item) => (
        <div className="flex gap-2">
          <Button
            disabled={!canPut}
            variant="1c"
            icon={<span>✏️</span>}
            className="md:h-6 md:w-8 md:!p-0"
            onClick={(e) => {
              e.stopPropagation();
              navigate(ROUTES.APP.PRODUCTS_EDIT.replace(":id", String(item.id)));
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

  const toDelete = (products as any[]).find((p) => p.id === deleteId);

  // ── рендер ───────────────────────────────────────────────────────────────────

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText={t("ForbiddenText")}>
      <Table
        columns={columns}
        data={filtered}
        tableId="products_list"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRowDoubleClick={(item) => navigate(ROUTES.APP.PRODUCTS_EDIT.replace(":id", String(item.id)))}
        selectedRowId={highlightedId}
        onHighlightConsumed={() => setHighlightedId(null)}
      />

      <ConfirmModal
        isOpen={deleteModal}
        type="delete"
        title={`DELETE - ${t("Delete")}`}
        message={t("DeleteProductMessage", { name: toDelete?.name })}
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

export default ProductsListPage;
