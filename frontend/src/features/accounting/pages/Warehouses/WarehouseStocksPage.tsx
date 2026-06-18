// frontend/src/features/accounting/pages/Warehouses/WarehouseStocksPage.tsx
import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { warehouseStockApi, warehouseApi, productApi } from "../../services/productApi";
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

interface StockForm {
  warehouse: number | null;
  product: number | null;
  quantity: string;
}

const EMPTY: StockForm = { warehouse: null, product: null, quantity: "0" };

const WarehouseStocksPage = () => {
  const { t } = useTranslation();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { setSidebarContent } = useSidebar();
  const { canView, canPost, canPut, canDelete } = usePageAccess("warehousestock");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<StockForm>(EMPTY);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState<number | null>(null);

  const {
    data: stocks = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["warehouse-stocks"],
    queryFn: () => warehouseStockApi.getAll(),
    enabled: canView,
    retry: false,
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses"],
    queryFn: warehouseApi.getAll,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: productApi.getAll,
  });

  useEffect(() => {
    if (editing) {
      setForm({
        warehouse: editing.warehouse,
        product: editing.product,
        quantity: String(editing.quantity),
      });
    } else {
      setForm(EMPTY);
    }
  }, [editing]);

  const saveMutation = useMutation({
    mutationFn: (data: StockForm) =>
      warehouseStockApi.save(editing?.id ?? null, {
        ...data,
        quantity: Number(data.quantity),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse-stocks"] });
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
    mutationFn: (id: number) => warehouseStockApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse-stocks"] });
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
          <h4 className="font-bold text-indigo-300 mb-2">Склад</h4>
          <div className="flex flex-col gap-1">
            <Button text="Все склады" variant="ghost" dark={true} isActive={warehouseFilter === null} className="w-full justify-start" onClick={() => setWarehouseFilter(null)} />
            {(warehouses as any[]).map((w) => (
              <Button key={w.id} text={w.name} variant="ghost" dark={true} isActive={warehouseFilter === w.id} className="w-full justify-start" onClick={() => setWarehouseFilter(w.id)} />
            ))}
          </div>
        </div>
      </div>,
    );
  }, [setSidebarContent, canPost, warehouses, warehouseFilter, t]);

  const filtered = useMemo(() => {
    let result = stocks as any[];
    if (warehouseFilter !== null) result = result.filter((s) => s.warehouse === warehouseFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((s) => s.product_name?.toLowerCase().includes(q) || s.product_sku?.toLowerCase().includes(q) || s.warehouse_name?.toLowerCase().includes(q));
    }
    return result;
  }, [stocks, warehouseFilter, searchQuery]);

  const columns: Column<any>[] = [
    { header: t("ID"), accessor: "id", sortable: true, excelWidth: 5 },
    { header: "Склад", accessor: "warehouse_name", sortable: true, excelWidth: 20 },
    { header: "Товар", accessor: "product_name", sortable: true, excelWidth: 30 },
    { header: "Артикул", accessor: "product_sku", sortable: true, excelWidth: 15 },
    {
      header: "Остаток",
      sortable: true,
      excelWidth: 12,
      sortValue: (item) => Number(item.quantity),
      excelValue: (item) => item.quantity,
      render: (item) => (
        <span className={`font-medium ${Number(item.quantity) <= 0 ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
          {item.quantity} {item.unit_short}
        </span>
      ),
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

  const toDelete = (stocks as any[]).find((s) => s.id === deleteId);

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText={t("ForbiddenText")}>
      <Table
        columns={columns}
        data={filtered}
        tableId="warehouse_stocks_list"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRowDoubleClick={(item) => {
          setEditing(item);
          setFormOpen(true);
        }}
      />

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={editing ? "Редактировать остаток" : "Добавить остаток"} closeOnOutsideClick={false}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Склад *</label>
            <select
              value={form.warehouse ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, warehouse: e.target.value ? Number(e.target.value) : null }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— выберите склад —</option>
              {(warehouses as any[]).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Товар *</label>
            <select
              value={form.product ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, product: e.target.value ? Number(e.target.value) : null }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— выберите товар —</option>
              {(products as any[]).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.sku ? `(${p.sku})` : ""}
                </option>
              ))}
            </select>
          </div>

          <Input label="Количество" type="number" value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} />

          <div className="flex justify-end gap-2 pt-2">
            <Button text={t("Cancel")} onClick={() => setFormOpen(false)} />
            <Button text={saveMutation.isPending ? t("Saving") : editing ? t("Save") : t("Create")} onClick={() => saveMutation.mutate(form)} />
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={deleteModal}
        type="delete"
        title={`DELETE - ${t("Delete")}`}
        message={`Удалить остаток "${toDelete?.product_name}" на складе "${toDelete?.warehouse_name}"?`}
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

export default WarehouseStocksPage;
