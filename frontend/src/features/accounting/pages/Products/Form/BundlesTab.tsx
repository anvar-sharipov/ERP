// frontend/src/features/accounting/pages/Products/Form/BundlesTab.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, Pencil, Check, X } from "lucide-react";
import { productBundleApi, productApi } from "../../../services/productApi";
import { useNotify } from "../../../../../core/context/NotificationContext";
import SearchableSelect, { type SelectOption } from "../../../../../components/ui/SearchableSelect";
import { Input } from "../../../../../components/ui/Input";
import { Button } from "../../../../../components/ui/Button";
import { ConfirmModal } from "../../../../../components/ui/Modal/ConfirmModal";

interface BundleRow {
  id: number;
  bundle_product: number;
  bundle_product_name: string;
  bundle_product_unit_name: string;
  qty_ratio: string;
  default_price: string;
}

interface BundlesTabProps {
  productId: number;
}

const BundlesTab = ({ productId }: BundlesTabProps) => {
  const notify = useNotify();
  const queryClient = useQueryClient();

  // ── Форма добавления ──────────────────────────────────────────────────────
  const [newProduct, setNewProduct] = useState<number | null>(null);
  const [newQty, setNewQty] = useState("1");
  const [newPrice, setNewPrice] = useState("0");

  // ── Инлайн-редактирование ─────────────────────────────────────────────────
  const [editId, setEditId] = useState<number | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editPrice, setEditPrice] = useState("");

  // ── Удаление ──────────────────────────────────────────────────────────────
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // ── Данные ───────────────────────────────────────────────────────────────
  const { data: bundles = [], isLoading } = useQuery<BundleRow[]>({
    queryKey: ["product-bundles", productId],
    queryFn: async () => {
      const data = await productBundleApi.getAll(productId);
      return data.results ?? data;
    },
  });

  const { data: allProducts = [] } = useQuery({
    queryKey: ["products-short"],
    queryFn: () => productApi.getAll(),
  });

  // Исключить сам товар и уже добавленные из списка
  const usedIds = new Set(bundles.map((b) => b.bundle_product));
  const productOptions: SelectOption[] = (allProducts as any[])
    .filter((p) => p.id !== productId && !usedIds.has(p.id))
    .map((p) => ({
      id: p.id,
      label: p.name,
      sublabel: p.unit_detail?.name,
    }));

  // ── Инвалидация ───────────────────────────────────────────────────────────
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["product-bundles", productId] });

  // ── Мутации ───────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: ({ id, data }: { id: number | null; data: any }) => productBundleApi.save(productId, id, data),
    onSuccess: (_, { id }) => {
      invalidate();
      notify("success", id ? "Обновлено" : "Комплектующая добавлена");
      if (id) {
        setEditId(null);
      } else {
        setNewProduct(null);
        setNewQty("1");
        setNewPrice("0");
      }
    },
    onError: (err: any) => {
      notify("error", err.response?.data?.bundle_product?.[0] || "Ошибка сохранения");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => productBundleApi.delete(productId, id),
    onSuccess: () => {
      invalidate();
      notify("success", "Удалено");
      setDeleteId(null);
    },
    onError: () => notify("error", "Ошибка удаления"),
  });

  const handleAdd = () => {
    if (!newProduct) {
      notify("error", "Выберите товар");
      return;
    }
    saveMutation.mutate({
      id: null,
      data: {
        bundle_product: newProduct,
        qty_ratio: parseFloat(newQty) || 1,
        default_price: parseFloat(newPrice) || 0,
      },
    });
  };

  const handleUpdate = () => {
    if (!editId) return;
    saveMutation.mutate({
      id: editId,
      data: {
        qty_ratio: parseFloat(editQty) || 1,
        default_price: parseFloat(editPrice) || 0,
      },
    });
  };

  const startEdit = (b: BundleRow) => {
    setEditId(b.id);
    setEditQty(String(b.qty_ratio));
    setEditPrice(String(b.default_price));
  };

  // ── Рендер ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 mt-4">
      {/* ── Форма добавления ── */}
      <div className="p-4 border border-gray-200 dark:border-slate-600 rounded-lg space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Добавить комплектующую</h3>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Товар *</label>
            <SearchableSelect options={productOptions} value={newProduct} onChange={setNewProduct} placeholder="— выберите товар —" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Кол-во на единицу *</label>
            <Input type="number" value={newQty} onChange={(e) => setNewQty(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Цена по умолчанию</label>
            <Input type="number" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
          </div>
        </div>

        <Button text={saveMutation.isPending && !editId ? "Добавление..." : "Добавить"} onClick={handleAdd} disabled={!newProduct || saveMutation.isPending} />
      </div>

      {/* ── Таблица ── */}
      {isLoading ? (
        <p className="text-sm text-gray-400">Загрузка...</p>
      ) : bundles.length === 0 ? (
        <p className="text-sm text-gray-400">Комплектующих нет</p>
      ) : (
        <div className="overflow-x-auto border border-gray-200 dark:border-slate-600 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/30">
                <th className="text-left px-3 py-2 font-medium text-gray-500 dark:text-gray-400">Товар</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500 dark:text-gray-400 w-20">Ед.</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-gray-400 w-32">Кол-во на ед.</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-gray-400 w-32">Цена</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {bundles.map((b) => {
                const isEditing = editId === b.id;
                return (
                  <tr
                    key={b.id}
                    className={"border-b border-gray-100 dark:border-slate-700 transition-colors " + (isEditing ? "bg-indigo-50 dark:bg-indigo-900/20" : "hover:bg-gray-50 dark:hover:bg-slate-700/30")}
                  >
                    <td className="px-3 py-2 font-medium">{b.bundle_product_name}</td>
                    <td className="px-3 py-2 text-xs text-gray-400">{b.bundle_product_unit_name || "—"}</td>

                    {/* Кол-во */}
                    <td className="px-3 py-2 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editQty}
                          min="0.001"
                          step="0.001"
                          autoFocus
                          onChange={(e) => setEditQty(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleUpdate()}
                          className="w-full text-right px-2 py-1 text-sm border border-indigo-400 rounded bg-white dark:bg-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      ) : (
                        <span className="font-mono">{b.qty_ratio}</span>
                      )}
                    </td>

                    {/* Цена */}
                    <td className="px-3 py-2 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editPrice}
                          min="0"
                          step="0.001"
                          onChange={(e) => setEditPrice(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleUpdate()}
                          className="w-full text-right px-2 py-1 text-sm border border-indigo-400 rounded bg-white dark:bg-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      ) : (
                        <span className={`font-mono ${Number(b.default_price) === 0 ? "text-green-500" : ""}`}>
                          {Number(b.default_price) === 0 ? "бесплатно" : Number(b.default_price).toLocaleString("ru-RU", { minimumFractionDigits: 3 })}
                        </span>
                      )}
                    </td>

                    {/* Кнопки */}
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {isEditing ? (
                          <>
                            <button onClick={handleUpdate} disabled={saveMutation.isPending} className="p-1 text-green-500 hover:text-green-700 transition-colors" title="Сохранить">
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={() => setEditId(null)} className="p-1 text-gray-400 hover:text-gray-600 transition-colors" title="Отмена">
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(b)} className="p-1 text-gray-400 hover:text-indigo-500 transition-colors" title="Редактировать">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => setDeleteId(b.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors" title="Удалить">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        isOpen={deleteId !== null}
        type="delete"
        title="Удалить комплектующую?"
        message="Комплектующая будет удалена из этого товара."
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
      />
    </div>
  );
};

export default BundlesTab;
