// frontend/src/features/accounting/pages/Products/ProductsListPage.tsx
import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { productApi, unitApi, brandApi, tagApi, productCategoryApi } from "../../services/productApi";
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

interface ProductForm {
  name: string;
  sku: string;
  barcode: string;
  qr_code: string;
  category: number | null;
  brand: number | null;
  unit: number | null;
  tag_ids: number[];
  price_retail: string;
  price_wholesale: string;
  cost_price: string;
  min_stock_level: string;
  is_active: boolean;
}

const EMPTY: ProductForm = {
  name: "",
  sku: "",
  barcode: "",
  qr_code: "",
  category: null,
  brand: null,
  unit: null,
  tag_ids: [],
  price_retail: "0",
  price_wholesale: "0",
  cost_price: "0",
  min_stock_level: "0",
  is_active: true,
};

// ── Мультиселект тегов ────────────────────────────────────────────────────────
interface TagSelectProps {
  tags: any[];
  selected: number[];
  onChange: (ids: number[]) => void;
}

const TagSelect = ({ tags, selected, onChange }: TagSelectProps) => {
  const toggle = (id: number) => {
    onChange(selected.includes(id) ? selected.filter((t) => t !== id) : [...selected, id]);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => {
        const active = selected.includes(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => toggle(tag.id)}
            className={`px-2 py-1 text-xs rounded-full border transition-colors ${
              active ? "bg-indigo-600 border-indigo-600 text-white" : "border-gray-300 dark:border-slate-600 text-gray-600 dark:text-gray-400 hover:border-indigo-400"
            }`}
          >
            {tag.name}
          </button>
        );
      })}
      {tags.length === 0 && <span className="text-xs text-gray-400">Теги не найдены</span>}
    </div>
  );
};

// ── Основная страница ─────────────────────────────────────────────────────────
const ProductsListPage = () => {
  const { t } = useTranslation();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { setSidebarContent } = useSidebar();
  const { canView, canPost, canPut, canDelete } = usePageAccess("product");
  const [highlightedId, setHighlightedId] = useState<number | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY);
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

  const { data: units = [] } = useQuery({ queryKey: ["units"], queryFn: unitApi.getAll });
  const { data: brands = [] } = useQuery({ queryKey: ["brands"], queryFn: brandApi.getAll });
  const { data: tags = [] } = useQuery({ queryKey: ["tags"], queryFn: tagApi.getAll });
  const { data: categories = [] } = useQuery({ queryKey: ["product-categories"], queryFn: productCategoryApi.getAll });

  // ── форма ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        sku: editing.sku ?? "",
        barcode: editing.barcode ?? "",
        qr_code: editing.qr_code ?? "",
        category: editing.category ?? null,
        brand: editing.brand ?? null,
        unit: editing.unit ?? null,
        tag_ids: editing.tags_detail?.map((tg: any) => tg.id) ?? [],
        price_retail: String(editing.price_retail ?? 0),
        price_wholesale: String(editing.price_wholesale ?? 0),
        cost_price: String(editing.cost_price ?? 0),
        min_stock_level: String(editing.min_stock_level ?? 0),
        is_active: editing.is_active,
      });
    } else {
      setForm(EMPTY);
    }
  }, [editing]);

  const f = (key: keyof ProductForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [key]: e.target.value }));

  // ── мутации ──────────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: (data: ProductForm) =>
      productApi.save(editing?.id ?? null, {
        ...data,
        price_retail: Number(data.price_retail),
        price_wholesale: Number(data.price_wholesale),
        cost_price: Number(data.cost_price),
        min_stock_level: Number(data.min_stock_level),
        sku: data.sku || null,
        barcode: data.barcode || null,
        qr_code: data.qr_code || null,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      notify("success", editing ? t("SuccessUpdated") : t("SuccessCreated"));
      setHighlightedId(res.data.id);
      setFormOpen(false);
      setEditing(null);
    },
    onError: (err: any) => {
      if (err._handled) return;
      const data = err.response?.data;
      const msg = data?.sku?.[0] || data?.barcode?.[0] || data?.detail || t("ErrorSaving");
      notify("error", msg);
    },
  });

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
          <Button
            disabled={!canPost}
            text={t("Add")}
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

  const toDelete = (products as any[]).find((p) => p.id === deleteId);

  const selectClass =
    "w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500";

  // ── рендер ───────────────────────────────────────────────────────────────────

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText={t("ForbiddenText")}>
      <Table
        columns={columns}
        data={filtered}
        tableId="products_list"
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
          {/* Основные */}
          <Input label={`${t("Name")} *`} value={form.name} onChange={f("name")} />

          <div className="grid grid-cols-2 gap-3">
            <Input label="Артикул" value={form.sku} onChange={f("sku")} placeholder="авто" />
            <Input label="Штрихкод" value={form.barcode} onChange={f("barcode")} />
          </div>

          {/* FK-поля */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ед. изм. *</label>
              <select value={form.unit ?? ""} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value ? Number(e.target.value) : null }))} className={selectClass}>
                <option value="">— выберите —</option>
                {(units as any[]).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.short_name})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Категория</label>
              <select value={form.category ?? ""} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value ? Number(e.target.value) : null }))} className={selectClass}>
                <option value="">— без категории —</option>
                {(categories as any[]).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Бренд</label>
            <select value={form.brand ?? ""} onChange={(e) => setForm((p) => ({ ...p, brand: e.target.value ? Number(e.target.value) : null }))} className={selectClass}>
              <option value="">— без бренда —</option>
              {(brands as any[]).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Цены */}
          <div className="grid grid-cols-3 gap-3">
            <Input label="Цена розн." type="number" value={form.price_retail} onChange={f("price_retail")} />
            <Input label="Цена опт" type="number" value={form.price_wholesale} onChange={f("price_wholesale")} />
            <Input label="Себестоимость" type="number" value={form.cost_price} onChange={f("cost_price")} />
          </div>

          <Input label="Мин. остаток" type="number" value={form.min_stock_level} onChange={f("min_stock_level")} />

          {/* Теги */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Теги</label>
            <TagSelect tags={tags as any[]} selected={form.tag_ids} onChange={(ids) => setForm((p) => ({ ...p, tag_ids: ids }))} />
          </div>

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
            <Button text={t("Cancel")} onClick={() => setFormOpen(false)} />
            <Button text={saveMutation.isPending ? t("Saving") : editing ? t("Save") : t("Create")} onClick={() => saveMutation.mutate(form)} />
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={deleteModal}
        type="delete"
        title={t("Delete")}
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
